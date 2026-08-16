import {
  World, Career, Match, DIFFICULTY_CONFIG, TeamStyle, IndividualInstruction,
} from '../lib/types';
import { addDays, dayOfWeek, monthOf } from '../lib/date';
import { matchesOnDate, matchForClubOnDate, nextMatchForClub, syncBrackets } from './competitions';
import { simulateMatch, LineupChoice, fillUserLineup, pickAILineup, defaultStyle } from './matchEngine';
import { weeklyDevelopmentTick, weeklyReportNews } from './development';
import { refreshClubCaches } from './overall';
import { monthlyFinancesTick } from './finances';
import { aiBoardEvaluation, aiContractRenewals } from './ai';
import { aiTransferActivity, executeTransfer, squadOf } from './transfers';
import { tickNegotiations, aiMarketDeals, generateIncomingOffers, tickIncomingOffers, checkPromises } from './negotiation';
import { tickArrivals } from './transfers';
import { tickStadium } from './stadium';
import { generateDailyTalk } from './playerTalks';
import { advanceSeason, isSeasonOver, SeasonSummary } from './season';
import { newsFromMatch } from './news';
import { evaluateBoard, onSeasonEnd, checkAchievements } from './career';
import { RNG, hashString } from '../lib/rng';

export interface DayResult {
  date: string;
  userMatch: Match | null;
  simulated: number;
  seasonAdvanced: boolean;
  newsCount: number;
  transferActivity: number;
  summary?: SeasonSummary;
}

export function isInTransferWindow(world: World, date: string): boolean {
  const mmdd = date.slice(5);
  const s = world.windows.summer;
  const w = world.windows.winter;
  return (mmdd >= s.start && mmdd <= s.end) || (mmdd >= w.start && mmdd <= w.end);
}

function deciderFor(compType: string | undefined, matchRound: number): 'none' | 'extra+penalties' {
  if (compType === 'league') return 'none';
  if (compType === 'continental' && matchRound <= 4) return 'none';
  return 'extra+penalties';
}

function simOptsForMatch(world: World, career: Career | null, match: Match) {
  const comp = world.competitions[match.competitionId];
  const isUserMatch = career !== null && (match.homeId === career.clubId || match.awayId === career.clubId);
  const difficulty = career?.difficulty ?? 'Normal';
  const cfg = DIFFICULTY_CONFIG[difficulty];
  const decider = deciderFor(comp?.type, match.round);

  if (isUserMatch && career) {
    const userIsHome = match.homeId === career.clubId;
    const userLineup: LineupChoice = fillUserLineup(
      Object.values(world.players).filter((p) => p.clubId === career.clubId),
      career.lineup.formation,
      career.lineup.slots,
      match.date,
    );
    const oppClubId = userIsHome ? match.awayId : match.homeId;
    const oppClub = world.clubs[oppClubId];
    const oppPlayers = Object.values(world.players).filter((p) => p.clubId === oppClubId);
    const aiLineup = pickAILineup(oppPlayers, new RNG(hashString(match.id + 'ai')), match.date, oppClub.coach.tactical);

    return {
      homeLineup: userIsHome ? userLineup : aiLineup,
      awayLineup: userIsHome ? aiLineup : userLineup,
      homeStyle: userIsHome ? career.lineup.style : defaultStyle(),
      awayStyle: userIsHome ? defaultStyle() : career.lineup.style,
      homeInstructions: userIsHome ? career.lineup.instructions : undefined,
      awayInstructions: userIsHome ? undefined : career.lineup.instructions,
      homeCoachTactical: userIsHome ? career.manager.attrs.tactical : oppClub.coach.tactical,
      awayCoachTactical: userIsHome ? oppClub.coach.tactical : career.manager.attrs.tactical,
      homeUserBoost: userIsHome ? cfg.userBoost : 0,
      aiQuality: cfg.aiQuality,
      decider,
      trackEvents: true,
    };
  }

  return {
    aiQuality: cfg.aiQuality,
    decider,
    trackEvents: match.importance >= 80 || match.competitionId === 'CONTINENTAL',
  };
}

function simulateAIMatchesOn(world: World, career: Career | null, date: string, skipUserClubId: string | null): { simulated: number; newsCount: number } {
  const dayMatches = matchesOnDate(world, date);
  let simulated = 0;
  let newsCount = 0;
  for (const m of dayMatches) {
    if (skipUserClubId && (m.homeId === skipUserClubId || m.awayId === skipUserClubId)) continue;
    if (!world.clubs[m.homeId] || !world.clubs[m.awayId]) {
      continue; // placeholders de mata-mata ainda não resolvidos
    }
    const opts = simOptsForMatch(world, career, m);
    const result = simulateMatch(world, m, opts);
    simulated++;
    if (m.importance >= 65 || (career && (m.homeId === career.clubId || m.awayId === career.clubId))) {
      newsFromMatch(world, m, result);
      newsCount++;
    }
  }
  return { simulated, newsCount };
}

/** Simula um dia: avança data, processa eventos, simula partidas (exceto do usuário). */
export function simulateOneDay(world: World, career: Career | null, difficulty: Career['difficulty']): DayResult {
  world.date = addDays(world.date, 1);
  const date = world.date;
  const result: DayResult = { date, userMatch: null, simulated: 0, seasonAdvanced: false, newsCount: 0, transferActivity: 0 };

  // partida do usuário hoje? se sim, para antes de simulá-la
  const userMatch = career ? matchForClubOnDate(world, career.clubId, date) : null;

  // transferências
  const dayRng = new RNG(hashString(world.seed) ^ hashString(world.date + 'day'));
  if (isInTransferWindow(world, date)) {
    const n = Math.floor(Math.random() * 3) + 2;
    aiTransferActivity(world, career, 0, n);
    aiMarketDeals(world, career, dayRng, Math.max(1, Math.floor(n / 2)));
    generateIncomingOffers(world, career, dayRng, Math.max(1, Math.floor(Math.random() * 2)));
    result.transferActivity = n;
  }
  tickIncomingOffers(world, career, dayRng);

  // contratações em trânsito: documentação, viagem, exames e registro
  tickArrivals(world, career);

  // promessas feitas em renovações/contratações: cumpridas ganham moral, quebradas derrubam
  if (career) checkPromises(world, career, dayRng);

  // jogadores procuram o treinador para conversas (pedidos, queixas, elogios)
  if (career) generateDailyTalk(world, career, dayRng);

  // negociações em andamento (prazos, guerras de propostas)
  tickNegotiations(world, career, dayRng);

  // empréstimos: retorno ao clube de origem e gatilhos de compra obrigatória
  for (const p of Object.values(world.players)) {
    if (p.isLoan && p.loanUntil && world.date > p.loanUntil) {
      const parent = p.parentClubId;
      p.clubId = parent;
      p.isLoan = false;
      p.parentClubId = null;
      p.loanUntil = null;
      if (parent) {
        const parentClub = world.clubs[parent];
        if (parentClub) refreshClubCaches(parentClub, squadOf(world, parent));
      }
    }
    if (p.isLoan && p.loanObligationGames > 0 && p.seasonStats.apps >= p.loanObligationGames) {
      const trigger = world.loanOptionTriggers.find((t) => t.playerId === p.id && t.clubId === p.clubId);
      if (trigger) {
        executeTransfer(world, career, {
          playerId: p.id,
          fee: p.loanOptionFee || 0,
          wage: p.contract?.wage ?? 500,
          toClubId: p.clubId,
          fromClubId: trigger.parentClubId,
          type: 'transfer',
        });
        world.loanOptionTriggers = world.loanOptionTriggers.filter((t) => t.loanId !== trigger.loanId);
      }
    }
  }

  // estádio: obras, conservação, torcida, naming, eventos
  tickStadium(world, career, dayRng);

  // simula partidas da IA (não a do usuário)
  const sim = simulateAIMatchesOn(world, career, date, career?.clubId ?? null);
  result.simulated = sim.simulated;
  result.newsCount = sim.newsCount;

  // mata-mata
  syncBrackets(world);

  // processos semanais (segunda-feira)
  if (dayOfWeek(date) === 1) {
    const focus = career?.trainingFocus ?? 'Tática';
    const cfg = DIFFICULTY_CONFIG[difficulty];
    const reports = weeklyDevelopmentTick(world, focus, career?.clubId ?? null, cfg.devSpeed);
    if (career && reports.length > 0) weeklyReportNews(world, reports, career.clubId);
    // suspensões por acúmulo de cartões (5 amarelos na liga)
    applyYellowCardSuspensions(world);
  }

  // processos mensais (dia 1)
  if (Number(date.slice(8, 10)) === 1) {
    const monthKey = date.slice(0, 7);
    monthlyFinancesTick(world, monthKey);
    aiBoardEvaluation(world, difficulty);
    aiContractRenewals(world);
    if (career) {
      evaluateBoard(career);
    }
  }

  // fim de temporada
  if (isSeasonOver(world)) {
    const summary = advanceSeason(world, career, difficulty);
    result.seasonAdvanced = true;
    result.date = world.date;
    result.summary = summary;
    if (career) {
      onSeasonEnd(career, summary);
      evaluateBoard(career);
    }
  }

  result.userMatch = userMatch;
  return result;
}

function applyYellowCardSuspensions(world: World): void {
  for (const p of Object.values(world.players)) {
    if (p.seasonStats.yellows >= 5 && p.suspension === 0 && p.seasonStats.yellows % 5 === 0) {
      p.suspension = 1;
    }
  }
}

/** Avança dias até o dia da próxima partida do usuário (ou fim de temporada). */
export function advanceToNextMatch(
  world: World,
  career: Career,
  difficulty: Career['difficulty'],
  maxDays = 400,
): { days: number; userMatch: Match | null; seasonAdvanced: boolean; lastDay: DayResult | null } {
  let days = 0;
  let seasonAdvanced = false;
  let lastDay: DayResult | null = null;
  for (let i = 0; i < maxDays; i++) {
    const day = simulateOneDay(world, career, difficulty);
    lastDay = day;
    days++;
    if (day.userMatch) {
      return { days, userMatch: day.userMatch, seasonAdvanced, lastDay: day };
    }
    if (day.seasonAdvanced) {
      seasonAdvanced = true;
      const next = nextMatchForClub(world, career.clubId, world.date);
      if (!next) return { days, userMatch: null, seasonAdvanced, lastDay: day };
      // continua avançando para a próxima partida da nova temporada
      continue;
    }
  }
  return { days, userMatch: nextMatchForClub(world, career.clubId, world.date), seasonAdvanced, lastDay };
}

/** Após o usuário jogar sua partida, simula o restante do dia. */
export function finishMatchDay(world: World, career: Career, difficulty: Career['difficulty']): DayResult {
  const date = world.date;
  const sim = simulateAIMatchesOn(world, career, date, career.clubId);
  syncBrackets(world);
  let seasonAdvanced = false;
  let summary: SeasonSummary | undefined;
  if (isSeasonOver(world)) {
    summary = advanceSeason(world, career, difficulty);
    seasonAdvanced = true;
    if (career) {
      onSeasonEnd(career, summary);
      evaluateBoard(career);
    }
  }
  return { date, userMatch: null, simulated: sim.simulated, seasonAdvanced, newsCount: sim.newsCount, transferActivity: 0, summary };
}

/** Simula a partida do usuário no dia atual com o setup salvo. */
export function playUserMatch(world: World, career: Career, difficulty: Career['difficulty']): Match {
  const match = matchForClubOnDate(world, career.clubId, world.date);
  if (!match) throw new Error('Nenhuma partida para jogar hoje.');
  const opts = simOptsForMatch(world, career, match);
  const result = simulateMatch(world, match, opts);

  // flags de carreira
  const isHome = match.homeId === career.clubId;
  const gf = isHome ? result.homeScore : result.awayScore;
  const ga = isHome ? result.awayScore : result.homeScore;
  const won = result.winner !== 'draw' && ((isHome && result.winner === 'home') || (!isHome && result.winner === 'away'));
  career.flags.matchesManaged++;
  if (result.winner === 'draw') career.flags.draws++;
  else if (won) {
    career.flags.wins++;
    career.flags.unbeatenRun++;
    career.flags.bestUnbeatenRun = Math.max(career.flags.bestUnbeatenRun, career.flags.unbeatenRun);
  } else {
    career.flags.losses++;
    career.flags.unbeatenRun = 0;
  }
  career.flags.goalsFor += gf;
  career.flags.goalsAgainst += ga;
  career.flags.biggestWin = Math.max(career.flags.biggestWin, gf - ga);
  career.flags.biggestLoss = Math.max(career.flags.biggestLoss, ga - gf);

  // notícia da partida do usuário
  newsFromMatch(world, match, result);
  checkAchievements(career, 'match_played');

  return match;
}
