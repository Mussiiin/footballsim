import {
  World, Career, Manager, Club, Difficulty, ManagerLicense, ManagerStyle,
  DIFFICULTY_CONFIG, LICENSE_REQUIREMENTS, ACHIEVEMENTS, TeamSetup, DEFAULT_SETTINGS,
  FORMATIONS,
} from '../lib/types';
import { RNG } from '../lib/rng';
import { generateWorld } from './worldgen';
import { pickBestLineup } from './matchEngine';
import { defaultStyle } from './matchEngine';
import { positionOf } from './competitions';
import { clamp } from '../lib/format';
import { estimateWage } from './overall';
import { notify } from './news';
import { SeasonSummary } from './season';
import { COUNTRIES } from './names';
import { RecruitmentOfficer, DIFFICULTY_CONFIG as DFC } from '../lib/types';

function generateRecruitmentOfficer(difficulty: Difficulty, club: Club): RecruitmentOfficer {
  const rng = new RNG(`${club.id}-officer`);
  const cd = COUNTRIES.find((c) => c.id === club.countryId) ?? COUNTRIES[0];
  const base = DFC[difficulty].scoutingQuality;
  const mk = (seedBias: number) => clamp(Math.round(base + rng.gaussian(0, 7) + seedBias), 25, 95);
  return {
    name: `${rng.pick(cd.first)} ${rng.pick(cd.last)}`,
    personality: rng.weighted(['Conservador', 'Agressivo', 'Analítico', 'Visionário'], [25, 25, 30, 20]),
    negotiation: mk(6),
    scouting: mk(8),
    marketKnowledge: mk(4),
    reputation: clamp(Math.round(base * 0.9 + rng.int(-8, 10)), 20, 95),
  };
}

// ------------------------------------------------------------
// Criação de treinador
// ------------------------------------------------------------
export interface NewManagerInput {
  name: string;
  nationality: string;
  age: number;
  license: ManagerLicense;
  style: ManagerStyle;
}

export function createManager(input: NewManagerInput): Manager {
  const licenseData = LICENSE_REQUIREMENTS[input.license];
  const expGuess = Math.max(0, Math.round((input.age - 30) / 3));
  const licenseBonus = input.license === 'Nenhuma' ? 0 : input.license === 'C' ? 5 : input.license === 'B' ? 10 : input.license === 'A' ? 16 : 24;

  const mk = (base: number) => clamp(base + licenseBonus * 0.9 + expGuess * 1.5 + Math.round(Math.random() * 8 - 4), 20, 95);

  const reputation = clamp(Math.round(8 + licenseData.rep + expGuess * 4 + Math.random() * 6), 5, 95);

  return {
    name: input.name,
    nationality: input.nationality,
    age: input.age,
    experience: expGuess,
    license: input.license,
    style: input.style,
    reputation,
    attrs: {
      tactical: mk(45),
      development: mk(42),
      motivation: mk(40),
      management: mk(44),
      scouting: mk(38),
      negotiation: mk(36),
    },
    salary: Math.round(licenseData.salary * (1 + expGuess * 0.12)),
    clubId: null,
    employed: false,
    jobHistory: [],
    status: 'unemployed',
    sackedCount: 0,
    trophies: 0,
  };
}

// ------------------------------------------------------------
// Clubes elegíveis
// ------------------------------------------------------------
export interface ClubChoice {
  club: Club;
  locked: boolean;
  reason?: string;
}

export function eligibleClubs(world: World, manager: Manager): ClubChoice[] {
  return Object.values(world.clubs)
    .map((club) => {
      const locked = club.reputation > manager.reputation + 22;
      return {
        club,
        locked,
        reason: locked ? `Reputação necessária: ${club.reputation}` : undefined,
      };
    })
    .sort((a, b) => (a.locked === b.locked ? b.club.reputation - a.club.reputation : a.locked ? 1 : -1));
}

export function initialLineup(world: World, clubId: string, managerStyle: ManagerStyle): TeamSetup {
  const players = Object.values(world.players).filter((p) => p.clubId === clubId);
  const rng = new RNG(world.seed + clubId + 'lineup');
  const lineup = pickBestLineup(players, '4-4-2', rng, world.date);
  const slots: Record<string, string> = {};
  const formationSlots = FORMATIONS['4-4-2'];
  formationSlots.forEach((slot, i) => {
    slots[slot.id] = lineup.playerIds[i];
  });
  return {
    formation: '4-4-2',
    slots,
    style: defaultStyle(managerStyle),
    instructions: {},
    captainId: lineup.playerIds[0] ?? null,
    setPieceTaker: null,
  };
}

// ------------------------------------------------------------
// Criação de carreira
// ------------------------------------------------------------
export function createCareer(
  userId: string,
  managerInput: NewManagerInput,
  clubId: string,
  difficulty: Difficulty,
  seed?: string,
): Career {
  const worldSeed = seed ?? `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const world = generateWorld(worldSeed);
  const manager = createManager(managerInput);
  const club = world.clubs[clubId];

  // assume o clube
  club.isUserControlled = true;
  club.managerId = 'user';
  club.boardPatience = DIFFICULTY_CONFIG[difficulty].boardTolerance + 30;
  manager.clubId = clubId;
  manager.employed = true;
  manager.status = 'active';
  manager.salary = Math.round(estimateWage(club.reputation, 48, manager.reputation) * (1 + difficulty === 'Fácil' ? 0.3 : 0));

  const lineup = initialLineup(world, clubId, manager.style);

  const career: Career = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    manager,
    clubId,
    difficulty,
    world,
    createdAt: new Date().toISOString(),
    lastPlayedAt: new Date().toISOString(),
    startedSeason: world.season,
    achievements: [],
    notifications: [],
    flags: {
      matchesManaged: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0,
      titles: 0, transfersIn: 0, transfersOut: 0, moneySpent: 0, moneyEarned: 0,
      seasons: 0, unbeatenRun: 0, bestUnbeatenRun: 0, youthPromoted: 0,
      recordSale: 0, recordBuy: 0, biggestWin: 0, biggestLoss: 0, goalsByTopScorer: {},
      promisesBroken: 0, promisesBrokenSeason: 0, promisesFulfilledRun: 0, boardCrisis: false,
      talksHad: 0, lastTalkDate: '',
    },
    lineup,
    trainingFocus: 'Tática',
    shortlist: [],
    scouted: [],
    recruitment: generateRecruitmentOfficer(difficulty, club),
    promises: [],
    settings: { ...DEFAULT_SETTINGS },
  };

  notify(career, `Você foi contratado pelo ${club.name}!`, 'success', '🎉');
  notify(career, 'Defina sua escalação e tática antes da primeira partida.', 'info', '📋');
  return career;
}

// ------------------------------------------------------------
// Avaliação da diretoria (clube do usuário)
// ------------------------------------------------------------
export function evaluateBoard(career: Career): void {
  const world = career.world;
  const club = world.clubs[career.clubId];
  if (!club) return;
  const comp = world.competitions[club.leagueId];
  if (!comp || comp.type !== 'league') return;

  const pos = positionOf(comp, club.id);
  const expected = club.tier === 'Gigante' ? 2 : club.tier === 'Grande' ? 6 : club.tier === 'Médio' ? 10 : club.tier === 'Pequeno' ? 14 : 17;
  const recent = club.lastResults.slice(-5);
  const pts = recent.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);

  let delta = 0;
  delta += (expected - pos) * 1.1;
  if (pts <= 2) delta -= 5;
  else if (pts >= 11) delta += 4;
  if (club.balance < club.wageBill * 2) delta -= 4;
  delta += club.morale > 70 ? 1 : club.morale < 45 ? -2 : 0;

  club.boardPatience = clamp(club.boardPatience + delta, 0, 100);

  if (club.boardPatience <= 20 && club.boardPatience > 0) {
    club.boardMessage = 'A diretoria está preocupada com os resultados. É preciso reagir!';
  } else if (club.boardPatience <= 0) {
    sackManager(career, 'A diretoria decidiu pela sua demissão após uma sequência de maus resultados.');
  } else if (club.boardPatience > 60) {
    club.boardMessage = null;
  }
}

export function sackManager(career: Career, reason: string): void {
  const world = career.world;
  const club = world.clubs[career.clubId];
  if (!club) return;
  club.isUserControlled = false;
  club.managerId = null;
  club.boardPatience = 60;
  club.boardMessage = null;
  career.manager.clubId = null;
  career.manager.employed = false;
  career.manager.status = 'sacked';
  career.manager.sackedCount++;
  career.manager.jobHistory.push({
    clubId: club.id,
    clubName: club.name,
    seasonStart: career.startedSeason,
    seasonEnd: world.season,
    achievements: [],
  });
  career.clubId = '';
  notify(career, reason, 'danger', '🚫');
  notify(career, 'Você está desempregado. Procure ofertas de emprego no mercado.', 'warning', '💼');
}

export function acceptJobOffer(career: Career, clubId: string): void {
  const world = career.world;
  const club = world.clubs[clubId];
  if (!club) return;
  club.isUserControlled = true;
  club.managerId = 'user';
  club.boardPatience = DIFFICULTY_CONFIG[career.difficulty].boardTolerance + 35;
  career.manager.clubId = clubId;
  career.manager.employed = true;
  career.manager.status = 'active';
  career.manager.salary = Math.round(estimateWage(club.reputation, 48, career.manager.reputation));
  career.clubId = clubId;
  career.lineup = initialLineup(world, clubId, career.manager.style);
  career.startedSeason = world.season;
  notify(career, `Você foi contratado pelo ${club.name}!`, 'success', '🎉');
}

// ------------------------------------------------------------
// Fim de temporada (efeitos na carreira)
// ------------------------------------------------------------
export function onSeasonEnd(career: Career, summary: SeasonSummary): void {
  const world = career.world;
  const clubId = career.clubId;
  career.flags.seasons++;

  if (!clubId) {
    checkAchievements(career, 'season_end');
    return;
  }
  const club = world.clubs[clubId];
  if (!club) return;

  const wonLeague = summary.leagues.some((l) => l.championId === clubId);
  const wonCup = summary.cups.some((c) => c.champion === club.name);
  const wonContinental = summary.continental?.champion === club.name;
  const promoted = summary.promoted.some((p) => p.clubId === clubId);
  const relegated = summary.relegated.some((p) => p.clubId === clubId);
  const pos = summary.positions[clubId] ?? 0;
  const comp = world.competitions[club.leagueId];

  const titles = (wonLeague ? 1 : 0) + (wonCup ? 1 : 0) + (wonContinental ? 1 : 0);
  if (titles > 0) {
    career.flags.titles += titles;
    career.manager.trophies += titles;
    career.manager.reputation = clamp(career.manager.reputation + 5, 5, 99);
  }
  if (wonLeague) career.manager.reputation = clamp(career.manager.reputation + 4, 5, 99);
  if (promoted) career.manager.reputation = clamp(career.manager.reputation + 3, 5, 99);
  if (relegated) career.manager.reputation = clamp(career.manager.reputation - 5, 5, 99);

  // objetivos
  for (const obj of club.objectives) {
    let achieved = false;
    switch (obj.kind) {
      case 'trophy': achieved = wonLeague || wonCup || wonContinental; break;
      case 'continental': achieved = pos <= (comp?.rules.continentalSpots ?? 4) || wonCup; break;
      case 'avoid-relegation': achieved = pos > (comp?.rules.relegationSpots ?? 3); break;
      case 'promotion': achieved = promoted; break;
      case 'finances': achieved = club.balance > 0 && !relegated; break;
      case 'develop-youth': achieved = career.flags.youthPromoted > 0; break;
      case 'mid-table': achieved = pos <= 10; break;
      case 'cup-run': achieved = wonCup; break;
      case 'league': achieved = pos <= 6; break;
    }
    obj.status = achieved ? 'achieved' : 'failed';
  }

  // diretoria
  // promessas quebradas na temporada são zeradas para o novo ciclo
  career.flags.promisesBrokenSeason = 0;

  const objectiveScore = club.objectives.reduce((s, o) => s + (o.status === 'achieved' ? o.weight : o.status === 'failed' ? -o.weight * 0.8 : 0), 0);
  club.boardPatience = clamp(club.boardPatience + objectiveScore * 1.5, 0, 100);
  if (club.boardPatience <= 0) {
    sackManager(career, 'A diretoria avaliou a temporada e decidiu pela sua demissão.');
  }

  unlockTitleAchievements(career, wonLeague, wonCup, wonContinental, wonLeague && wonCup && wonContinental);
  checkAchievements(career, 'season_end');
}

// ------------------------------------------------------------
// Conquistas
// ------------------------------------------------------------
export function checkAchievements(career: Career, trigger: string): void {
  const f = career.flags;
  const wants = (id: string) => !career.achievements.includes(id);
  const unlock = (id: string) => {
    if (!wants(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    career.achievements.push(id);
    if (def) notify(career, `Conquista desbloqueada: ${def.name}!`, 'success', def.icon);
  };

  if (trigger === 'match_played') {
    if (f.wins >= 1) unlock('first_win');
    if (f.bestUnbeatenRun >= 10) unlock('unbeaten_10');
    if (f.biggestWin >= 5) unlock('big_win');
    if (f.recordSale >= 20_000_000) unlock('record_sale');
    if (f.youthPromoted >= 1) unlock('youth');
  }
  if (trigger === 'season_end') {
    if (f.titles >= 1) unlock('first_title');
    if (f.seasons >= 5) unlock('seasons_5');
    if (f.seasons >= 10) unlock('seasons_10');
  }
}

/** Conquistas de título de liga/copa (chamado após campeonatos). */
export function unlockTitleAchievements(career: Career, wonLeague: boolean, wonCup: boolean, wonContinental: boolean, treble: boolean): void {
  if (wonLeague) {
    if (!career.achievements.includes('league_title')) {
      career.achievements.push('league_title');
      notify(career, 'Conquista desbloqueada: Campeão Nacional!', 'success', '👑');
    }
  }
  if (wonCup) {
    if (!career.achievements.includes('cup_run')) {
      career.achievements.push('cup_run');
      notify(career, 'Conquista desbloqueada: Herói de Copa!', 'success', '🍾');
    }
  }
  if (wonContinental) {
    if (!career.achievements.includes('continental')) {
      career.achievements.push('continental');
      notify(career, 'Conquista desbloqueada: Campeão Continental!', 'success', '🌍');
    }
  }
  if (treble) {
    if (!career.achievements.includes('treble')) {
      career.achievements.push('treble');
      notify(career, 'Conquista desbloqueada: TRÍPLICE COROA!', 'success', '🎖️');
    }
  }
}

/** Ofertas de emprego para o treinador. */
export function offersForManager(career: Career): { clubId: string; clubName: string; salary: number; rep: number }[] {
  const world = career.world;
  const rng = new RNG(world.seed + world.season + 'offers');
  const candidates = Object.values(world.clubs)
    .filter((c) => !c.isUserControlled)
    .filter((c) => Math.abs(c.reputation - career.manager.reputation) <= 30)
    .filter((c) => rng.chance(0.3))
    .slice(0, 3);
  return candidates.map((c) => ({
    clubId: c.id,
    clubName: c.name,
    salary: Math.round(estimateWage(c.reputation, 48, career.manager.reputation)),
    rep: c.reputation,
  }));
}

export { COUNTRIES };
