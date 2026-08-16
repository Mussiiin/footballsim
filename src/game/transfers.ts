import { World, Career, Player, TransferRecord, PendingArrival, POSITION_GROUPS } from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { overallOf, refreshClubCaches } from './overall';
import { clamp } from '../lib/format';
import { addDays, daysBetween } from '../lib/date';
import { addNews, newsFromTransfer } from './news';
import { notify } from './news';
import { isInTransferWindow } from './sim';

let transferCounter = 0;

// ------------------------------------------------------------
// Avaliação de preço de um jogador
// ------------------------------------------------------------
export function sellingPrice(world: World, player: Player, club: { balance: number; wageBill: number } | null | undefined): number {
  let mult = 1.0;
  if (player.contract) {
    // dias restantes de contrato: daysBetween(a, b) = b - a, então (hoje, fim) é positivo
    const monthsLeft = daysBetween(world.date, player.contract.until) / 30;
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
  // Ele passa por viagem → exames → documentação → contrato → registro,
  // sempre respeitando a janela de transferências.
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
      // anos restantes reais do contrato atual (mínimo 2) para a renovação
      const years = Math.max(1, Math.round(daysBetween(world.date, p.contract.until) / 365));
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
          // janela fechada: negociação pode existir, mas o registro espera a abertura
          const windowOpen = isInTransferWindow(world, world.date);
          const nw = nextTransferWindow(world);
          world.pendingArrivals.unshift({
            id: `arr${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
            playerId: p.id,
            clubId: exec.toClubId ?? '',
            fromName: fromClub?.name ?? 'Sem clube',
            toName: toClub?.name ?? '',
            fee: exec.fee,
            type: 'transfer',
            signedAt: world.date,
            arrivesOn: windowOpen ? arrivesOn : nw?.opensOn ?? arrivesOn,
            stage: windowOpen ? 'travel' : 'waiting',
            stageEndsOn: windowOpen ? arrivesOn : nw?.opensOn ?? arrivesOn,
            travelDays: arrivalDays,
            registeredOn: null,
            medical: null,
            registration: windowOpen ? 'pending' : 'awaiting_window',
            transferStatus: windowOpen ? 'in_transit' : 'awaiting_window',
            status: windowOpen
              ? `✈️ Em trânsito — viagem de ${arrivalDays} dia${arrivalDays > 1 ? 's' : ''}`
              : nw
                ? `🚫 Janela fechada — aguardando ${nw.label} (${nw.opensOn})`
                : '🚫 Janela fechada — aguardando próxima abertura',
          });
          if (windowOpen) {
            notify(career, `${p.firstName} ${p.lastName} assinou! Em trânsito — previsão de chegada em ${arrivalDays} dia${arrivalDays > 1 ? 's' : ''}.`, 'success', '📝', `player:${p.id}`);
          } else {
            notify(career, `🚫 A janela de transferências está fechada. ${p.firstName} ${p.lastName} será registrado na próxima abertura${nw ? ` (${nw.opensOn})` : ''}.`, 'warning', '🚫', `player:${p.id}`);
          }
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
// Janela de transferências — informações para a UI e próxima abertura
// ------------------------------------------------------------
export function nextTransferWindow(world: World): { label: string; opensOn: string; daysLeft: number } | null {
  const { summer, winter } = world.windows;
  const year = Number(world.season.slice(0, 4));
  const date = world.date;
  const candidates: { label: string; date: string }[] = [
    { label: 'Janela de verão', date: `${year}-${summer.start}` },
    { label: 'Janela de inverno', date: `${year}-${winter.start}` },
    { label: 'Janela de verão', date: `${year + 1}-${summer.start}` },
    { label: 'Janela de inverno', date: `${year + 1}-${winter.start}` },
  ];
  const future = candidates
    .filter((c) => c.date > date)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const next = future[0];
  if (!next) return null;
  return { label: next.label, opensOn: next.date, daysLeft: Math.max(1, daysBetween(date, next.date)) };
}

// ------------------------------------------------------------
// Chegada de contratações (viagem → exames → documentação → contrato → registro)
// A janela de transferências é verificada em TODAS as etapas: se a janela fechar
// antes do registro, o jogador fica pendente até a próxima abertura.
// ------------------------------------------------------------
export function tickArrivals(world: World, career: Career | null): void {
  if (!world.pendingArrivals || world.pendingArrivals.length === 0) return;
  const remaining: PendingArrival[] = [];
  for (const a of world.pendingArrivals) {
    const p = world.players[a.playerId];
    if (!p) {
      remaining.push(a);
      continue;
    }
    const club = world.clubs[a.clubId];
    const windowOpen = isInTransferWindow(world, world.date);
    const isUser = career !== null && career.clubId === a.clubId;

    // jogador cancelado: mantém no histórico como pendência finalizada
    if (a.transferStatus === 'cancelled') {
      p.arrivingUntil = null;
      continue;
    }

    // aguardando janela: só avança quando a janela abrir
    if (a.transferStatus === 'awaiting_window') {
      if (!windowOpen) {
        remaining.push(a);
        continue;
      }
      // janela abriu — retoma o processo (usa os dias de viagem originais da negociação)
      a.transferStatus = 'in_transit';
      a.registration = 'pending';
      a.stage = 'travel';
      a.arrivesOn = addDays(world.date, Math.max(1, a.travelDays));
      a.stageEndsOn = a.arrivesOn;
      if (isUser) notify(career, `📅 A janela de transferências abriu. ${p.firstName} ${p.lastName} pode ser registrado — iniciando a viagem.`, 'info', '📅');
      remaining.push(a);
      continue;
    }

    // etapa em andamento: ainda não chegou a hora
    if (world.date < a.stageEndsOn) {
      a.arrivesOn = a.stageEndsOn;
      remaining.push(a);
      continue;
    }

    // ------------------------------------------------------------
    // Etapa concluída — avança para a próxima
    // ------------------------------------------------------------
    // se a janela fechou no meio do processo, bloqueia o registro até a próxima
    // O jogador NÃO volta ao elenco: arrivingUntil permanece setado (fora do squad)
    // até o registro ser concluído na próxima janela.
    if (!windowOpen && a.registration !== 'registered') {
      a.transferStatus = 'awaiting_window';
      a.registration = 'awaiting_window';
      a.stage = 'waiting';
      const nw = nextTransferWindow(world);
      p.arrivingUntil = nw?.opensOn ?? addDays(world.date, 60);
      a.arrivesOn = p.arrivingUntil;
      a.status = nw
        ? `🚫 Registro bloqueado — janela fechada. Próxima janela: ${nw.opensOn} (${nw.daysLeft} dias)`
        : '🚫 Registro bloqueado — janela de transferências fechada';
      if (isUser && !a.windowClosedNotified) {
        a.windowClosedNotified = true;
        notify(career, `🚫 A transferência de ${p.firstName} ${p.lastName} não pode ser registrada porque a janela de transferências fechou. Ele permanece pendente até a próxima abertura.`, 'danger', '🚫');
      }
      remaining.push(a);
      continue;
    }

    switch (a.stage) {
      case 'travel': {
        a.stage = 'medical';
        a.stageEndsOn = addDays(world.date, 1);
        a.status = 'Chegou ao clube — exames médicos em andamento';
        if (isUser) notify(career, `🏥 ${p.firstName} ${p.lastName} chegou ao clube e iniciou os exames médicos.`, 'info', '🏥', `player:${p.id}`);
        remaining.push(a);
        continue;
      }
      case 'medical': {
        // resultado dos exames: sorteado UMA vez e guardado em a.medical —
        // nunca re-sortear na mesma etapa (evita loop infinito de exames adicionais)
        if (a.medical === null || a.medical === 'pending') {
          const rng = new RNG(hashString(world.seed) ^ hashString(`${a.id}|medical`));
          const injuryScore = (p.injuryHistory.length * 0.06) + (p.injury ? 0.5 : 0);
          const roll = rng.float(0, 1) + injuryScore;
          if (roll > 0.94) {
            a.medical = 'failed';
            a.transferStatus = 'cancelled';
            a.cancelReason = 'Jogador reprovado nos exames médicos.';
            a.status = '❌ Transferência cancelada — reprovado nos exames médicos';
            p.arrivingUntil = null;
            if (isUser) notify(career, `❌ ${p.firstName} ${p.lastName} foi reprovado nos exames médicos. A contratação foi cancelada.`, 'danger', '❌', `player:${p.id}`);
            continue; // não fica na lista ativa (cancelado)
          }
          if (roll > 0.8) {
            a.medical = 'conditional';
            a.stageEndsOn = addDays(world.date, 2);
            a.status = '⚠️ Exames com ressalva — exames adicionais em andamento (2 dias)';
            if (isUser) notify(career, `⚠️ Os médicos encontraram uma pequena preocupação com ${p.firstName} ${p.lastName}. Novos exames serão realizados.`, 'warning', '⚠️', `player:${p.id}`);
            remaining.push(a);
            continue;
          }
          a.medical = 'approved';
        } else if (a.medical === 'conditional') {
          // exames adicionais concluídos — aprovado
          a.medical = 'approved';
          a.status = '✅ Exames adicionais concluídos — aprovado';
        }
        a.stage = 'docs';
        a.stageEndsOn = addDays(world.date, 1);
        a.status = '✅ Exames aprovados — documentação sendo processada';
        if (isUser && a.medical === 'approved' && !a.status.includes('adicionais')) {
          notify(career, `✅ ${p.firstName} ${p.lastName} foi aprovado nos exames médicos. Documentação em processamento.`, 'success', '✅', `player:${p.id}`);
        }
        remaining.push(a);
        continue;
      }
      case 'docs': {
        a.stage = 'contract';
        a.stageEndsOn = addDays(world.date, 1);
        a.status = '📄 Documentação concluída — contrato em preparação';
        if (isUser) notify(career, `📄 A documentação de ${p.firstName} ${p.lastName} está pronta. Contrato em preparação.`, 'info', '📄', `player:${p.id}`);
        remaining.push(a);
        continue;
      }
      case 'contract': {
        a.stage = 'registration';
        a.stageEndsOn = addDays(world.date, 1);
        a.status = '✍️ Contrato assinado — registro na competição';
        if (isUser) notify(career, `✍️ ${p.firstName} ${p.lastName} assinou o contrato. Registro na competição em andamento.`, 'success', '✍️', `player:${p.id}`);
        remaining.push(a);
        continue;
      }
      case 'registration': {
        // registro concluído: jogador entra no elenco (janela já verificada acima)
        a.stage = 'done';
        a.registration = 'registered';
        a.transferStatus = 'completed';
        a.status = '🟢 Registrado — disponível para o elenco';
        a.registeredOn = world.date;
        p.arrivingUntil = null;
        if (club) refreshClubCaches(club, squadOf(world, club.id));
        if (isUser) {
          notify(career, `🟢 ${p.firstName} ${p.lastName} foi registrado e já está disponível para o elenco.`, 'success', '🟢', `player:${p.id}`);
          addNews(world, {
            date: world.date,
            title: `✍️ ${p.firstName} ${p.lastName} é apresentado no ${club?.name ?? 'clube'}`,
            subtitle: `O reforço concluiu o processo de registro e já está disponível — contratação de €${a.fee.toLocaleString('pt-BR')} oficializada.`,
            category: 'Clubes',
            playerId: p.id,
            clubId: a.clubId,
            importance: 62,
          });
        }
        continue; // concluído: não fica na lista ativa
      }
      default: {
        remaining.push(a);
      }
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
      if (p.contract && daysBetween(world.date, p.contract.until) < 120 && !isVitalPlayer(world, p)) return true;
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
