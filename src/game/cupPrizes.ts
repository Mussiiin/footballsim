// ============================================================
// FootballSim — Premiação financeira por fase (Copa do Brasil)
// ============================================================
// O clube recebe o prêmio da fase quando se CLASSIFICA para a
// fase seguinte (o vencedor de cada partida do mata-mata recebe
// o valor daquela fase). Valores centralizados por competição e
// temporada em CompetitionPrizeRules — ajustáveis a cada ano sem
// tocar na lógica. Nenhum prêmio é pago duas vezes (id único).
// ============================================================
import { World, Career, Club, Competition, CompetitionPrizeRules, MatchRef } from '../lib/types';
import { addNews } from './news';
import { pushInbox } from './messages';

// Tabela oficial da Copa do Brasil 2026 (valores em R$)
const COPABR_2026 = {
  firstRound: 400_000,
  secondRound: { tierA: 1_380_000, tierB: 830_000 },
  thirdRound: { tierA: 1_530_000, tierB: 950_000 },
  fourthRound: { tierA: 1_680_000, tierB: 1_070_000 },
  fifthRound: 2_000_000,
  roundOf16: 3_000_000,
  quarterFinal: 4_000_000,
  semiFinal: 9_000_000,
  runnerUp: 34_000_000,
  champion: 78_000_000,
};

/** Nomes de fase que usam cota por categoria do clube (A/B). */
const TIER_STAGES = new Set(['2ª Fase', '3ª Fase', '4ª Fase']);

/** Categoria do clube para premiação: A = 1ª/2ª divisão, B = demais. */
export function clubPrizeTier(club: Club): 'A' | 'B' {
  const div = club.leagueId.split('_').pop();
  return div === 'L1' || div === 'L2' ? 'A' : 'B';
}

/** Premiação por fase da Série D 2026 (valores em R$). */
const SERIED_2026 = {
  participation: 250_000,                       // todos que disputam a fase de grupos
  groupStage: 150_000,                          // classificação aos 64 (além da participação)
  secondRound: { tierA: 300_000, tierB: 300_000 },
  thirdRound: { tierA: 350_000, tierB: 350_000 },
  roundOf16: 450_000,                           // oitavas
  quarterFinal: 550_000,                        // quartas
  semiFinal: 700_000,
  accessPlayoff: 250_000,                       // playoff de acesso
  runnerUp: 1_200_000,
  champion: 2_500_000,
};

/** Constrói as regras de premiação de uma competição para a temporada. */
export function buildPrizeRules(comp: Competition, season: string): CompetitionPrizeRules {
  const base = {
    competition: comp.id,
    competitionName: comp.name,
    season,
  };
  if (comp.type === 'cup' && comp.countryId === 'brazil') {
    return { ...base, prizes: { ...COPABR_2026 } };
  }
  if (comp.rules.promotionByKnockout && comp.countryId === 'brazil') {
    return { ...base, prizes: { ...SERIED_2026 } };
  }
  if (comp.isAccessPlayoff) {
    return { ...base, prizes: { accessPlayoff: SERIED_2026.accessPlayoff } };
  }
  if (comp.type === 'continental') {
    return {
      ...base,
      prizes: {
        roundOf16: 1_500_000,
        quarterFinal: 2_500_000,
        semiFinal: 5_000_000,
        runnerUp: comp.prizeMoney.runnerUp ?? 12_000_000,
        champion: comp.prizeMoney.champion ?? 25_000_000,
      },
    };
  }
  // copa genérica de outros países — escala menor
  return {
    ...base,
    prizes: {
      firstRound: 120_000,
      secondRound: { tierA: 250_000, tierB: 140_000 },
      thirdRound: { tierA: 400_000, tierB: 220_000 },
      fourthRound: { tierA: 550_000, tierB: 300_000 },
      roundOf16: 700_000,
      quarterFinal: 1_000_000,
      semiFinal: 1_800_000,
      runnerUp: comp.prizeMoney.runnerUp ?? 1_200_000,
      champion: comp.prizeMoney.champion ?? 3_000_000,
    },
  };
}

/** Regras da competição para a temporada atual (cria/cacheia se preciso). */
export function getPrizeRules(world: World, compId: string): CompetitionPrizeRules | null {
  const comp = world.competitions[compId];
  if (!comp) return null;
  // liga normal não tem premiação por fase; a Série D (liga com mata-mata) e os
  // playoffs de acesso têm regras próprias
  if (comp.type === 'league' && !comp.rules.promotionByKnockout) return null;
  const existing = world.competitionPrizeRules[compId];
  if (existing && existing.season === comp.season) return existing;
  const rules = buildPrizeRules(comp, comp.season);
  world.competitionPrizeRules[compId] = rules;
  return rules;
}

/** Valor do prêmio de uma fase para um clube (aplica cota A/B quando houver). */
export function stagePrizeFor(rules: CompetitionPrizeRules, stage: string, club: Club): number {
  const p = rules.prizes;
  const tier = clubPrizeTier(club);
  switch (stage) {
    case '1ª Fase': return p.firstRound ?? 0;
    case '2ª Fase': return tier === 'A' ? (p.secondRound?.tierA ?? 0) : (p.secondRound?.tierB ?? 0);
    case '3ª Fase': return tier === 'A' ? (p.thirdRound?.tierA ?? 0) : (p.thirdRound?.tierB ?? 0);
    case '4ª Fase': return tier === 'A' ? (p.fourthRound?.tierA ?? 0) : (p.fourthRound?.tierB ?? 0);
    case '5ª Fase': return p.fifthRound ?? 0;
    case 'Oitavas de final': return p.roundOf16 ?? 0;
    case 'Quartas de final': return p.quarterFinal ?? 0;
    case 'Semifinal': return p.semiFinal ?? 0;
    case 'Campeão': return p.champion ?? 0;
    case 'Vice-campeão': return p.runnerUp ?? 0;
    case 'Participação': return p.participation ?? 0;
    case 'Classificação': return p.groupStage ?? 0;
    case 'Playoffs de acesso': return p.accessPlayoff ?? 0;
    default: return 0;
  }
}

/** id único de premiação (comp|season|club|stage) — impede pagamento duplicado. */
export function prizeStageId(comp: Competition, clubId: string, stage: string): string {
  return `${comp.id}|${comp.season}|${clubId}|${stage}`;
}

export interface PrizeGrant {
  clubId: string;
  stage: string;
  amount: number;
  alreadyReceived: boolean;
}

/**
 * Concede a premiação de uma fase a um clube: caixa + receitas acumuladas +
 * histórico de transações + notícia e mensagem para o clube do usuário.
 * NUNCA paga duas vezes (id único em club.competitionPrizes).
 */
export function grantPrize(
  world: World,
  career: Career | null,
  compId: string,
  clubId: string,
  stage: string,
  amount: number,
): PrizeGrant {
  const comp = world.competitions[compId];
  const club = world.clubs[clubId];
  if (!comp || !club || amount <= 0) return { clubId, stage, amount: 0, alreadyReceived: false };
  const id = prizeStageId(comp, clubId, stage);
  if ((club.competitionPrizes ?? []).includes(id)) {
    return { clubId, stage, amount: 0, alreadyReceived: true };
  }
  club.competitionPrizes.push(id);
  club.balance += amount;
  club.financeAccum.revenue += amount;
  club.financeTransactions = club.financeTransactions ?? [];
  club.financeTransactions.unshift({
    id,
    date: world.date,
    type: 'competition_prize',
    competition: comp.name,
    competitionId: comp.id,
    season: comp.season,
    stage,
    description: `${comp.name} — ${stage}`,
    amount,
  });
  if (club.financeTransactions.length > 80) club.financeTransactions.pop();

  const isUser = career ? club.isUserControlled : false;
  if (isUser || amount >= 4_000_000) {
    addNews(world, {
      date: world.date,
      title: isUser
        ? `💰 ${club.name} recebe premiação na ${comp.name}`
        : `💰 Premiação na ${comp.name}`,
      subtitle: `+ R$ ${amount.toLocaleString('pt-BR')} pela classificação na ${stage}.`,
      category: 'Clubes',
      importance: isUser ? 55 : Math.min(60, 25 + Math.round(amount / 1_000_000)),
      clubId,
    });
  }

  if (isUser) {
    pushInbox(world, career!, {
      senderName: comp.name,
      title: `✅ Classificado na ${stage}`,
      preview: `Premiação recebida: + R$ ${amount.toLocaleString('pt-BR')}`,
      category: 'finance',
      priority: 'normal',
      link: 'competitions',
    });
  }

  return { clubId, stage, amount, alreadyReceived: false };
}

// ------------------------------------------------------------
// Consultas para a tela da competição
// ------------------------------------------------------------
export interface ClubPrizeInfo {
  /** total já recebido nesta temporada (todas as fases). */
  received: number;
  prizesByStage: { stage: string; amount: number; date: string }[];
  /** fase atual em disputa (nome). */
  currentStage: string;
  /** prêmio da fase atual — recebido se o clube vencer esta fase. */
  nextPrize: number;
  /** quanto ainda pode ganhar daqui até o fim (caminho campeão, sem final). */
  remaining: number;
  championIf: number;
  runnerUpIf: number;
  eliminated: boolean;
  finished: boolean;
}

export function clubPrizeInfo(world: World, clubId: string, compId: string): ClubPrizeInfo | null {
  const comp = world.competitions[compId];
  const club = world.clubs[clubId];
  const rules = getPrizeRules(world, compId);
  if (!comp || !club || !rules) return null;

  const store = comp.type === 'continental' ? world.continentalMatches[compId] : world.cupMatches[compId];
  const prefix = `${comp.id}|${comp.season}|${clubId}|`;
  const prizesByStage: { stage: string; amount: number; date: string }[] = [];
  let received = 0;
  for (const id of club.competitionPrizes ?? []) {
    if (!id.startsWith(prefix)) continue;
    const stage = id.slice(prefix.length);
    const amount = stagePrizeFor(rules, stage, club);
    const tx = (club.financeTransactions ?? []).find((t) => t.id === id);
    received += amount;
    prizesByStage.push({ stage, amount, date: tx?.date ?? world.date });
  }

  const finished = comp.status === 'finished';
  const idx = Math.min(comp.currentRoundIndex, comp.rounds.length - 1);

  // encontra a próxima fase em que o clube ainda aparece (respeita byes: um clube
  // cabeça de chave não joga a 1ª fase mas continua vivo na 2ª). Como as partidas
  // futuras ainda podem estar __TBD__, também consulta os refs do chaveamento.
  const clubInRound = (r: number): boolean => {
    const round = comp.rounds[r];
    if (!round || !store) return false;
    return round.matchIds.some((mid) => {
      const m = store.matches.find((x) => x.id === mid);
      if (m && (m.homeId === clubId || m.awayId === clubId)) return true;
      const ref = store.refs[mid];
      if (!ref) return false;
      const aliveVia = (rr: MatchRef | undefined): boolean => {
        if (!rr) return false;
        if (rr.kind === 'club') return rr.id === clubId;
        if (rr.kind === 'winner') {
          const wm = store.matches.find((x) => x.id === rr.matchId);
          if (wm && wm.played) return store.roundWinners[rr.matchId] === clubId;
          // fase anterior ainda não jogada: quem disputa essa partida segue vivo
          return wm !== undefined && (wm.homeId === clubId || wm.awayId === clubId);
        }
        return false;
      };
      return aliveVia(ref.home) || aliveVia(ref.away);
    });
  };
  let aliveRoundIdx = -1;
  for (let r = idx; r < comp.rounds.length; r++) {
    if (clubInRound(r)) {
      aliveRoundIdx = r;
      break;
    }
  }

  // eliminado: competição terminada sem o clube na final, ou nenhuma partida futura
  let eliminated = false;
  if (finished) {
    const finalRound = comp.rounds[comp.rounds.length - 1];
    const finalMatch = finalRound?.matchIds.map((mid) => store?.matches.find((x) => x.id === mid)).find(Boolean);
    eliminated = !(finalMatch && (finalMatch.homeId === clubId || finalMatch.awayId === clubId));
  } else {
    eliminated = aliveRoundIdx === -1;
  }

  const currentStage = finished ? 'Finalizada' : (aliveRoundIdx >= 0 ? comp.rounds[aliveRoundIdx]?.name ?? '—' : comp.rounds[idx]?.name ?? '—');

  // quanto ainda pode ganhar (da fase em que o clube está até a semifinal; final = campeão/vice)
  const fromRound = aliveRoundIdx >= 0 ? aliveRoundIdx : idx;
  let remaining = 0;
  for (let r = fromRound; r < comp.rounds.length - 1; r++) {
    const stage = comp.rounds[r]?.name ?? '';
    if (!stage) continue;
    const amount = stagePrizeFor(rules, stage, club);
    remaining += amount;
  }
  const championAmt = rules.prizes.champion ?? 0;
  const runnerUpAmt = rules.prizes.runnerUp ?? 0;
  const championIf = received + remaining + championAmt;
  const runnerUpIf = received + remaining + runnerUpAmt;
  const nextPrize = finished || eliminated ? 0 : stagePrizeFor(rules, currentStage, club);

  return {
    received,
    prizesByStage,
    currentStage,
    nextPrize,
    remaining,
    championIf,
    runnerUpIf,
    eliminated,
    finished,
  };
}
