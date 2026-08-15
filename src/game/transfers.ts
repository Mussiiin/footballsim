import { World, Career, Player, TransferRecord, PendingArrival, POSITION_GROUPS } from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { overallOf, refreshClubCaches } from './overall';
import { clamp } from '../lib/format';
import { addDays, daysBetween } from '../lib/date';
import { addNews, newsFromTransfer } from './news';
import { notify } from './news';

let transferCounter = 0;

// ------------------------------------------------------------
// Avaliação de preço de um jogador
// ------------------------------------------------------------
export function sellingPrice(world: World, player: Player, club: { balance: number; wageBill: number } | null | undefined): number {
  let mult = 1.0;
  if (player.contract) {
    const monthsLeft = daysBetween(player.contract.until, world.date) / 30;
    if (monthsLeft < 6) mult *= 0.35;
    else if (monthsLeft < 12) mult *= 0.6;
    else if (monthsLeft < 24) mult *= 0.85;
  }
  if (player.transferListed) mult *= 0.85;
  if (player.isLoan) mult *= 0.5;
  if (player.age >= 30) mult *= 0.72;
  if (player.age <= 21) mult *= 1.25;
  if (player.potential > overallOf(player) + 8) mult *= 1.15;
  if (club && club.balance < club.wageBill * 2.5) mult *= 0.8; // clube em apuros vende barato
  const vital = isVitalPlayer(world, player);
  if (vital) mult *= 1.35;
  return Math.round(player.value * mult);
}

export function isVitalPlayer(world: World, player: Player): boolean {
  if (!player.clubId) return false;
  const squad = Object.values(world.players).filter((p) => p.clubId === player.clubId && p.status === 'active');
  const starters = [...squad].sort((a, b) => overallOf(b) - overallOf(a)).slice(0, 11);
  return starters.some((p) => p.id === player.id);
}

// ------------------------------------------------------------
// Negociação: proposta do usuário
// ------------------------------------------------------------
export type NegotiationResult =
  | { status: 'accepted'; fee: number; wage: number }
  | { status: 'counter'; message: string; counterFee: number }
  | { status: 'rejected'; message: string };

export function negotiateTransfer(
  world: World,
  career: Career,
  playerId: string,
  offeredFee: number,
  offeredWage: number,
): NegotiationResult {
  const player = world.players[playerId];
  if (!player) return { status: 'rejected', message: 'Jogador não encontrado.' };
  const seller = player.clubId ? world.clubs[player.clubId] : null;
  const target = sellingPrice(world, player, seller ?? undefined);
  const difficulty = career.difficulty;
  const diffMult = difficulty === 'Fácil' ? 0.9 : difficulty === 'Normal' ? 1 : difficulty === 'Difícil' ? 1.15 : 1.3;

  const threshold = Math.round(target * diffMult);

  if (offeredFee >= threshold) {
    // clube aceita; jogador decide
    const currentWage = player.contract?.wage ?? 500;
    const wageDemand = Math.round(currentWage * (player.personality === 'Mercenário' ? 1.25 : player.personality === 'Ambicioso' ? 1.15 : 1.05));
    if (offeredWage >= wageDemand || player.happiness < 45) {
      return { status: 'accepted', fee: offeredFee, wage: offeredWage };
    }
    return {
      status: 'counter',
      message: `${player.firstName} aceita a transferência, mas pede €${offeredWage.toLocaleString('pt-BR')}/sem`,
      counterFee: offeredFee,
    };
  }

  if (offeredFee >= threshold * 0.62) {
    const counterFee = Math.round(threshold * (0.95 + Math.random() * 0.1));
    return {
      status: 'counter',
      message: `${seller?.name ?? 'O clube'} contrapropõe €${counterFee.toLocaleString('pt-BR')}`,
      counterFee,
    };
  }

  return {
    status: 'rejected',
    message: `${seller?.name ?? 'O clube'} recusou a proposta. Valor considerado muito baixo.`,
  };
}

// ------------------------------------------------------------
// Execução de transferência
// ------------------------------------------------------------
export interface TransferExec {
  playerId: string;
  fee: number;
  wage: number;
  toClubId: string | null;
  fromClubId: string | null;
  type: 'transfer' | 'loan' | 'free';
  loanUntil?: string;
  silent?: boolean;
  addons?: { sellOnPct?: number; installments?: number };
}

export function executeTransfer(world: World, career: Career | null, exec: TransferExec): void {
  const p = world.players[exec.playerId];
  if (!p) return;
  const fromClub = exec.fromClubId ? world.clubs[exec.fromClubId] : null;
  const toClub = exec.toClubId ? world.clubs[exec.toClubId] : null;

  // contratação do usuário: o jogador NÃO entra no elenco imediatamente.
  // Ele fica em trânsito (documentação → viagem → exames) e chega em 1-5 dias.
  const delayedArrival = career !== null && exec.type === 'transfer' && exec.toClubId === career.clubId;
  let arrivalDays = 0;
  let arrivesOn = '';
  if (delayedArrival) {
    const sameCountry = fromClub && toClub ? fromClub.countryId === toClub.countryId : false;
    arrivalDays = sameCountry ? 1 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3); // 1-2 local, 2-4 internacional
    if (p.futureSellPct > 0 || (p.transferRequested && Math.random() < 0.3)) arrivalDays = Math.max(arrivalDays, 4); // situações especiais até 5
    arrivalDays = Math.min(arrivalDays, 5);
    arrivesOn = addDays(world.date, arrivalDays);
    p.arrivingUntil = arrivesOn;
  }

  if (exec.type === 'transfer') {
    if (fromClub) {
      fromClub.balance += exec.fee;
      fromClub.financeAccum.revenue += exec.fee;
      fromClub.transferHistory.push(`${p.firstName} ${p.lastName} → ${toClub?.name ?? '—'}`);
    }
    if (toClub) {
      toClub.balance -= exec.fee;
      toClub.financeAccum.expenses += exec.fee;
    }
    // % de futura venda: o clube que vendeu com cláusula recebe a fatia quando o jogador é revendido
    if (p.futureSellPct > 0 && p.futureSellClubId && exec.fromClubId === p.futureSellClubId && exec.toClubId !== p.futureSellClubId) {
      const sellClub = world.clubs[p.futureSellClubId];
      if (sellClub && fromClub) {
        const cut = Math.round(exec.fee * (p.futureSellPct / 100));
        sellClub.balance += cut;
        sellClub.financeAccum.revenue += cut;
        fromClub.balance -= cut;
        fromClub.financeAccum.expenses += cut;
      }
      p.futureSellPct = 0;
      p.futureSellClubId = null;
    }
    if (p.isLoan && p.parentClubId) {
      p.clubId = p.parentClubId;
      p.isLoan = false;
      p.parentClubId = null;
    }
    p.clubId = exec.toClubId;
    p.isLoan = false;
    p.loanUntil = null;
    p.loanOptionFee = 0;
    p.loanObligationGames = 0;
    if (p.contract) {
      const years = Math.max(1, Math.round(daysBetween(p.contract.until, world.date) / 365));
      p.contract.until = addDays(world.date, Math.max(years, 2) * 365);
      p.contract.wage = exec.wage;
      p.contract.signedAt = world.date;
    }
    p.happiness = clamp(p.happiness + 10, 1, 100);
    p.morale = clamp(p.morale + 6, 1, 100);
    p.value = p.value; // reavaliado depois
  } else if (exec.type === 'loan') {
    if (fromClub) fromClub.transferHistory.push(`${p.firstName} ${p.lastName} → ${toClub?.name ?? '—'} (empréstimo)`);
    p.parentClubId = p.clubId;
    p.clubId = exec.toClubId;
    p.isLoan = true;
    p.loanUntil = exec.loanUntil ?? null;
  } else {
    // livre
    p.clubId = exec.toClubId;
    p.isLoan = false;
  }

  const rec: TransferRecord = {
    id: `t${transferCounter++}`,
    date: world.date,
    playerId: p.id,
    playerName: `${p.firstName} ${p.lastName}`,
    fromClubId: exec.fromClubId,
    fromClubName: fromClub?.name ?? 'Sem clube',
    toClubId: exec.toClubId,
    toClubName: toClub?.name ?? 'Sem clube',
    fee: exec.type === 'loan' ? 0 : exec.fee,
    type: exec.type,
  };
  world.transfers.unshift(rec);
  if (world.transfers.length > 120) world.transfers.pop();

  if (exec.type !== 'loan' && !exec.silent) {
    newsFromTransfer(world, `${p.firstName} ${p.lastName}`, fromClub?.name ?? 'Sem clube', toClub?.name ?? 'Sem clube', exec.fee, world.date, exec.type);
    if (exec.fee > (world.records.find((r) => r.key === 'biggest_transfer')?.value as number || 0) && exec.type === 'transfer') {
      world.records.find((r) => r.key === 'biggest_transfer')!.value = exec.fee;
      world.records.find((r) => r.key === 'biggest_transfer')!.holder = `${p.firstName} ${p.lastName}`;
      world.records.find((r) => r.key === 'biggest_transfer')!.season = world.season;
    }
  }

  // mantém folha salarial e força do elenco atualizadas após qualquer movimentação
  if (toClub) refreshClubCaches(toClub, squadOf(world, toClub.id));
  if (fromClub) refreshClubCaches(fromClub, squadOf(world, fromClub.id));

  if (career) {
    if (exec.type === 'transfer' || exec.type === 'loan') {
      const isIn = exec.toClubId === career.clubId;
      const isOut = exec.fromClubId === career.clubId;
      if (isIn) {
        career.flags.transfersIn++;
        career.flags.moneySpent += exec.fee;
        career.flags.recordBuy = Math.max(career.flags.recordBuy, exec.fee);
        if (delayedArrival) {
          world.pendingArrivals.unshift({
            id: `arr${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
            playerId: p.id,
            clubId: exec.toClubId ?? '',
            fromName: fromClub?.name ?? 'Sem clube',
            toName: toClub?.name ?? '',
            fee: exec.fee,
            type: 'transfer',
            signedAt: world.date,
            arrivesOn,
            status: 'Documentação em andamento',
          });
          notify(career, `${p.firstName} ${p.lastName} assinou! Documentação em andamento — previsão de chegada em ${arrivalDays} dia${arrivalDays > 1 ? 's' : ''}.`, 'success', '📝', `player:${p.id}`);
        } else {
          notify(career, `${p.firstName} ${p.lastName} chega ao clube!`, 'success', '📝');
        }
      }
      if (isOut) {
        career.flags.transfersOut++;
        career.flags.moneyEarned += exec.fee;
        career.flags.recordSale = Math.max(career.flags.recordSale, exec.fee);
        notify(career, `${p.firstName} ${p.lastName} foi vendido por €${exec.fee.toLocaleString('pt-BR')}.`, 'info', '💰');
      }
    }
  }
}

// ------------------------------------------------------------
// Chegada de contratações (documentação, viagem, exames, registro)
// ------------------------------------------------------------
export function tickArrivals(world: World, career: Career | null): void {
  if (!world.pendingArrivals || world.pendingArrivals.length === 0) return;
  const remaining: PendingArrival[] = [];
  for (const a of world.pendingArrivals) {
    const p = world.players[a.playerId];
    if (!p) {
      continue;
    }
    if (world.date < a.arrivesOn) {
      const daysLeft = Math.max(1, daysBetween(world.date, a.arrivesOn));
      if (daysLeft >= 3) a.status = 'Documentação em andamento';
      else if (daysLeft === 2) a.status = 'Viajando para se apresentar ao clube';
      else a.status = 'Chegou ao clube — realizando exames médicos';
      remaining.push(a);
      continue;
    }
    // dia da chegada: exames aprovados, contrato registrado e entrada no elenco
    a.status = 'Exames aprovados — contrato sendo registrado';
    p.arrivingUntil = null;
    const club = world.clubs[a.clubId];
    if (club) refreshClubCaches(club, squadOf(world, club.id));
    if (career && career.clubId === a.clubId) {
      notify(career, `${p.firstName} ${p.lastName} chegou ao clube e foi registrado!`, 'success', '✍️', `player:${p.id}`);
      addNews(world, {
        date: world.date,
        title: `✍️ ${p.firstName} ${p.lastName} é apresentado no ${club?.name ?? 'clube'}`,
        subtitle: `O reforço concluiu os exames médicos e teve o contrato registrado — contratação de €${a.fee.toLocaleString('pt-BR')} oficializada.`,
        category: 'Clubes',
        playerId: p.id,
        clubId: a.clubId,
        importance: 62,
      });
    }
  }
  world.pendingArrivals = remaining;
}

// ------------------------------------------------------------
// Jogadores livres
// ------------------------------------------------------------
export function freeAgents(world: World): Player[] {
  const transit = new Set((world.pendingArrivals ?? []).map((a) => a.playerId));
  return Object.values(world.players).filter((p) => p.status === 'active' && !p.clubId && p.contract && !transit.has(p.id));
}

// ------------------------------------------------------------
// IA de transferências
// ------------------------------------------------------------
export function aiTransferActivity(world: World, career: Career | null, budget: number, count: number): void {
  const rng = new RNG(hashString(world.seed) ^ hashString(world.date + 'ai'));
  const userClubId = career?.clubId ?? null;
  const clubs = Object.values(world.clubs).filter((c) => !c.isUserControlled);
  const shuffled = rng.shuffle(clubs);
  let done = 0;

  for (const club of shuffled) {
    if (done >= count) break;
    if (rng.chance(0.4)) continue;
    const squad = Object.values(world.players).filter((p) => p.clubId === club.id && p.status === 'active');
    if (squad.length < 18) {
      // precisa de reforços: tenta livre
      const frees = freeAgents(world).filter((p) => rng.chance(0.4));
      if (frees.length > 0) {
        const target = frees.sort((a, b) => overallOf(b) - overallOf(a))[0];
        const wage = target.contract?.wage ?? 500;
        if (club.balance > wage * 40) {
          executeTransfer(world, career, {
            playerId: target.id,
            fee: 0,
            wage,
            toClubId: club.id,
            fromClubId: null,
            type: 'free',
          });
          done++;
          continue;
        }
      }
    }
    // vende excesso: jogadores fora dos planos ou contratos curtos
    const excess = squad.filter((p) => {
      if (p.age >= 30 && rng.chance(0.3)) return true;
      if (p.contract && daysBetween(p.contract.until, world.date) < 120 && !isVitalPlayer(world, p)) return true;
      return false;
    });
    if (excess.length > 0 && rng.chance(0.5)) {
      const target = excess[0];
      const price = sellingPrice(world, target, club);
      const buyers = shuffled.filter((b) => b.id !== club.id && b.balance > price * 1.2);
      if (buyers.length > 0) {
        const buyer = buyers[0];
        executeTransfer(world, career, {
          playerId: target.id,
          fee: Math.round(price * rng.float(0.85, 1.1)),
          wage: target.contract?.wage ?? 600,
          toClubId: buyer.id,
          fromClubId: club.id,
          type: 'transfer',
        });
        done++;
        continue;
      }
    }
    // contrata jovem livre
    if (rng.chance(0.15)) {
      const frees = freeAgents(world).filter((p) => p.age <= 24);
      if (frees.length > 0) {
        const target = rng.pick(frees);
        executeTransfer(world, career, {
          playerId: target.id,
          fee: 0,
          wage: target.contract?.wage ?? 500,
          toClubId: club.id,
          fromClubId: null,
          type: 'free',
        });
        done++;
      }
    }
  }
  void budget;
}

// ------------------------------------------------------------
// Candidatos a contratação (mercado)
// ------------------------------------------------------------
export function marketCandidates(world: World, excludeClubId: string | null, filters?: {
  position?: string;
  minAge?: number;
  maxAge?: number;
  minOverall?: number;
  maxOverall?: number;
  maxValue?: number;
  maxWage?: number;
  nationality?: string;
}): Player[] {
  let list = Object.values(world.players).filter(
    (p) => p.status === 'active' && p.clubId !== excludeClubId && (p.transferListed || !p.clubId || p.clubId !== excludeClubId),
  );
  if (filters?.position) {
    list = list.filter((p) => p.position === filters.position || p.secondaryPositions.includes(filters.position as never));
  }
  if (filters?.minAge !== undefined) list = list.filter((p) => p.age >= filters.minAge!);
  if (filters?.maxAge !== undefined) list = list.filter((p) => p.age <= filters.maxAge!);
  if (filters?.minOverall !== undefined) list = list.filter((p) => overallOf(p) >= filters.minOverall!);
  if (filters?.maxOverall !== undefined) list = list.filter((p) => overallOf(p) <= filters.maxOverall!);
  if (filters?.maxValue !== undefined) list = list.filter((p) => p.value <= filters.maxValue!);
  if (filters?.maxWage !== undefined) list = list.filter((p) => (p.contract?.wage ?? 0) <= filters.maxWage!);
  if (filters?.nationality) list = list.filter((p) => p.nationality === filters.nationality);
  return list.sort((a, b) => overallOf(b) - overallOf(a));
}

// ------------------------------------------------------------
// Utilidades de elenco
// ------------------------------------------------------------
export function squadOf(world: World, clubId: string): Player[] {
  // jogadores em trânsito (arrivingUntil) pertencem ao clube mas ainda não estão no elenco
  return Object.values(world.players).filter((p) => p.clubId === clubId && p.status === 'active' && !p.arrivingUntil);
}

export function releasePlayer(world: World, career: Career, playerId: string): void {
  const p = world.players[playerId];
  if (!p) return;
  const oldClub = p.clubId ? world.clubs[p.clubId] : null;
  p.clubId = null;
  p.contract = null;
  p.transferListed = false;
  p.loanListed = false;
  if (oldClub) refreshClubCaches(oldClub, squadOf(world, oldClub.id));
  notify(career, `${p.firstName} ${p.lastName} foi liberado.`, 'info', '🚪');
}

export { POSITION_GROUPS };
