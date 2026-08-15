import {
  World, Club, Player, Competition, Country, Position, PositionGroup,
  Personality, Stadium, Coach, StaffMember, StaffRole, ClubObjective, ClubTier,
  Contract, SeasonStats, PlayerHistoryEntry, Match, CupRound, RecordItem, MatchRef,
  POSITION_GROUPS,
} from '../lib/types';
import { RNG } from '../lib/rng';
import { COUNTRIES, CountryData, CONTINENTAL_COMPETITION } from './names';
import { overallAt, estimateValue, estimateWage } from './overall';
import { generateYouthIntake } from './development';
import { addDays, toDateStr } from '../lib/date';
import { clamp } from '../lib/format';

// ------------------------------------------------------------
// IDs
// ------------------------------------------------------------
let playerCounter = 0;
let matchCounter = 0;
let staffCounter = 0;

export function resetCounters(): void {
  playerCounter = 0;
  matchCounter = 0;
  staffCounter = 0;
}

export function resetMatchCounter(): void {
  matchCounter = 0;
}

function pid(): string {
  return `p${playerCounter++}`;
}
function mid(): string {
  return `m${matchCounter++}`;
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function tierLabel(rep: number): ClubTier {
  if (rep >= 78) return 'Gigante';
  if (rep >= 64) return 'Grande';
  if (rep >= 50) return 'Médio';
  if (rep >= 36) return 'Pequeno';
  return 'Amador';
}

const COLOR_PAIRS: [string, string][] = [
  ['#e63946', '#1d3557'], ['#457b9d', '#1d3557'], ['#2a9d8f', '#264653'],
  ['#e9c46a', '#264653'], ['#f4a261', '#2a1e12'], ['#8ecae6', '#023047'],
  ['#ffb703', '#12263a'], ['#ef476f', '#073b4c'], ['#06d6a0', '#083d77'],
  ['#7b2cbf', '#10002b'], ['#f77f00', '#1a0f00'], ['#118ab2', '#0d1b2a'],
  ['#9ef01a', '#14213d'], ['#ff5d8f', '#2b2d42'], ['#4cc9f0', '#3a0ca3'],
];

function playerReputation(ov: number, clubRep: number): number {
  return clamp(Math.round((ov - 30) / 1.8 + clubRep / 12), 5, 95);
}

const emptySeasonStats = (): SeasonStats => ({
  apps: 0, starts: 0, goals: 0, assists: 0, yellows: 0, reds: 0, minutes: 0,
  ratingSum: 0, ratingCount: 0, cleanSheets: 0, manOfMatch: 0,
  shots: 0, shotsOnTarget: 0, passes: 0, tackles: 0, interceptions: 0,
  keyPasses: 0, xg: 0, xa: 0,
});

// ------------------------------------------------------------
// Geração de jogador
// ------------------------------------------------------------
const POSITION_TEMPLATE: Position[] = [
  'GK', 'GK', 'GK',
  'LB', 'LB', 'CB', 'CB', 'CB', 'CB', 'RB', 'RB',
  'DM', 'DM', 'CM', 'CM', 'CM', 'CM', 'AM', 'AM',
  'LW', 'LW', 'RW', 'RW', 'ST', 'ST', 'CF',
];

const POSITION_OFFSET: Record<Position, number> = {
  GK: 2, CB: 0.5, LB: -1, RB: -1, DM: 0.5, CM: 0.5, AM: 1, LW: 0, RW: 0, ST: 1, CF: 1,
};

function personalityForAge(rng: RNG, age: number): Personality {
  if (age <= 21) {
    return rng.weighted(
      ['Jovem promessa', 'Profissional', 'Trabalhador', 'Ambicioso', 'Leal', 'Inconsistente', 'Temperamental'],
      [38, 15, 15, 12, 8, 7, 5],
    );
  }
  if (age <= 28) {
    return rng.weighted(
      ['Profissional', 'Trabalhador', 'Ambicioso', 'Leal', 'Inconsistente', 'Líder', 'Temperamental', 'Mercenário', 'Jovem promessa', 'Veterano'],
      [20, 15, 15, 10, 10, 8, 8, 7, 5, 2],
    );
  }
  return rng.weighted(
    ['Veterano', 'Profissional', 'Líder', 'Leal', 'Temperamental', 'Mercenário', 'Trabalhador'],
    [30, 20, 15, 10, 10, 10, 5],
  );
}

function secondaryPositions(rng: RNG, pos: Position): Position[] {
  const map: Record<Position, Position[]> = {
    GK: [], CB: ['DM'], LB: ['CB', 'LW'], RB: ['CB', 'RW'],
    DM: ['CM', 'CB'], CM: ['DM', 'AM'], AM: ['CM', 'CF'],
    LW: ['RW', 'CF'], RW: ['LW', 'CF'], ST: ['CF'], CF: ['ST', 'AM'],
  };
  const opts = map[pos];
  const out: Position[] = [];
  if (opts.length && rng.chance(0.55)) out.push(rng.pick(opts));
  if (opts.length > 1 && rng.chance(0.25)) {
    const second = opts.find((o) => o !== out[0]);
    if (second) out.push(second);
  }
  return out;
}

function generatePlayer(
  rng: RNG,
  country: CountryData,
  club: Club,
  clubStr: number,
  pos: Position,
  idx: number,
  seasonYear: number,
): Player {
  const ageRoll = rng.next();
  let age: number;
  if (ageRoll < 0.3) age = rng.int(17, 21);
  else if (ageRoll < 0.7) age = rng.int(22, 27);
  else if (ageRoll < 0.93) age = rng.int(28, 33);
  else age = rng.int(34, 38);

  let target = clubStr + POSITION_OFFSET[pos] + rng.gaussian(0, 6);
  if (age <= 21) target -= (21 - age) * 1.6 + rng.float(0, 4);

  let potentialGap = 0;
  if (age <= 18) potentialGap = rng.int(10, 22);
  else if (age <= 21) potentialGap = rng.int(5, 15);
  else if (age <= 24) potentialGap = rng.int(1, 8);
  else if (age <= 28) potentialGap = rng.int(0, 4);
  if (rng.chance(0.08)) potentialGap = 0; // "estourou" cedo

  const group = POSITION_GROUPS[pos];
  const groupAttrs: Record<PositionGroup, string[]> = {
    GK: ['reflexes', 'handling', 'gkPositioning', 'rushing', 'kicking'],
    DEF: ['marking', 'tackling', 'interception', 'defPositioning', 'heading'],
    MID: ['passing', 'vision', 'technique', 'control', 'stamina'],
    ATT: ['finishing', 'attackPositioning', 'dribbling', 'pace', 'shotPower'],
  };

  const attrs: Player['attrs'] = {
    pace: 0, acceleration: 0, finishing: 0, shotPower: 0, passing: 0, vision: 0,
    dribbling: 0, control: 0, defending: 0, physical: 0, stamina: 0, strength: 0,
    agility: 0, balance: 0, reflexes: 0, handling: 0, gkPositioning: 0, rushing: 0,
    kicking: 0, marking: 0, tackling: 0, interception: 0, defPositioning: 0,
    heading: 0, technique: 0, attackPositioning: 0,
  };
  const keys = Object.keys(attrs) as (keyof Player['attrs'])[];
  const boostSet = new Set(groupAttrs[group]);
  for (const k of keys) {
    let boost = boostSet.has(k) ? 7 : 0;
    let reduce = 0;
    if (group === 'GK' && !boostSet.has(k) && k !== 'agility' && k !== 'balance' && k !== 'strength') reduce = -8;
    if (group === 'ATT' && k === 'stamina') reduce = -4;
    if (group === 'DEF' && (k === 'finishing' || k === 'dribbling')) reduce = -3;
    attrs[k] = clamp(Math.round(rng.gaussian(target, 9) + boost + reduce), 1, 99);
  }

  // ajusta para que o overall calculado bata no alvo
  const computeOv = () => overallAt({ attrs } as Player, pos);
  const delta = Math.round(target - computeOv());
  if (delta !== 0) {
    for (const k of keys) attrs[k] = clamp(attrs[k] + delta, 1, 99);
  }

  const firstName = rng.pick(country.first);
  const lastName = rng.pick(country.last);
  const ov = computeOv();
  const potential = clamp(Math.round(ov + potentialGap), 1, 99);
  const reputation = playerReputation(ov, club.reputation);
  const contractYears = rng.int(0, 4);
  const today = `${seasonYear}-07-01`;
  const contract: Contract = {
    signedAt: addDays(today, -rng.int(30, 800)),
    until: addDays(today, contractYears * 365 + rng.int(-60, 120)),
    wage: estimateWage(ov, age, reputation),
    bonus: rng.chance(0.4) ? estimateWage(ov, age, reputation) * rng.int(4, 15) : 0,
    releaseClause: rng.chance(0.2)
      ? Math.round(estimateValue(ov, age, potential, reputation, 2) * rng.float(1.3, 2))
      : null,
  };
  if (contractYears === 0 && rng.chance(0.7)) {
    contract.until = addDays(today, rng.int(150, 330)); // expira no fim da temporada
  }

  const birthDate = addDays(today, -Math.round(age * 365.25 + rng.int(0, 360)));
  const height = pos === 'GK' ? rng.int(186, 202) : rng.int(168, 195);

  return {
    id: pid(),
    firstName,
    lastName,
    nationality: country.name,
    birthDate,
    age,
    position: pos,
    secondaryPositions: secondaryPositions(rng, pos),
    foot: rng.weighted(['D', 'E', 'Ambidestro'], [60, 32, 8]) as Player['foot'],
    height,
    weight: Math.round(height - 100 + rng.gaussian(2, 3)),
    attrs,
    potential,
    value: estimateValue(ov, age, potential, reputation, contractYears || 0.5),
    contract,
    clubId: club.id,
    squadNumber: idx + 1,
    morale: rng.int(55, 90),
    form: rng.int(50, 76),
    condition: rng.int(85, 100),
    fatigue: rng.int(0, 30),
    personality: personalityForAge(rng, age),
    reputation,
    status: 'active',
    injury: null,
    injuryHistory: [],
    suspension: 0,
    isLoan: false,
    parentClubId: null,
    loanUntil: null,
    loanOptionFee: 0,
    loanObligationGames: 0,
    agentId: null,
    transferRequested: false,
    arrivingUntil: null,
    awards: [],
    seasonStats: emptySeasonStats(),
    careerStats: emptySeasonStats(),
    history: [],
    lastRatings: [],
    happiness: rng.int(55, 85),
    relation: rng.int(55, 85),
    loanListed: false,
    transferListed: false,
    devTrend: 0,
    avgRating: 6.5,
    futureSellPct: 0,
    futureSellClubId: null,
  };
}

// ------------------------------------------------------------
// Staff e comissão técnica
// ------------------------------------------------------------
function generateCoach(rng: RNG, country: CountryData, clubRep: number): Coach {
  const rep = clamp(Math.round(clubRep * rng.float(0.7, 0.95)), 10, 95);
  const mk = () => clamp(Math.round(rng.gaussian(rep, 8)), 10, 99);
  return {
    name: `${rng.pick(country.first)} ${rng.pick(country.last)}`,
    nationality: country.name,
    reputation: rep,
    tactical: mk(),
    development: mk(),
    motivation: mk(),
    management: mk(),
    scouting: mk(),
    negotiation: mk(),
    salary: Math.round(estimateWage(rep, 50, rep) * 1.5),
  };
}

const STAFF_ROLES: StaffRole[] = ['Assistente', 'Preparador físico', 'Treinador de goleiros', 'Analista', 'Scout', 'Médico'];

function generateStaff(rng: RNG, country: CountryData, clubRep: number, seasonYear: number): StaffMember[] {
  return STAFF_ROLES.map((role) => ({
    id: `s${staffCounter++}`,
    role,
    name: `${rng.pick(country.first)} ${rng.pick(country.last)}`,
    nationality: country.name,
    quality: clamp(Math.round(rng.gaussian(clubRep * 0.9, 8)), 20, 95),
    salary: Math.round(estimateWage(clubRep / 2, 45, clubRep / 2) * rng.float(0.8, 1.4)),
    contractUntil: `${seasonYear + rng.int(1, 3)}-06-30`,
  }));
}

function objectivesFor(tier: ClubTier): ClubObjective[] {
  const base: ClubObjective[] = [];
  const add = (text: string, weight: number, kind: ClubObjective['kind']) => base.push({ text, weight, kind, status: 'pending' });
  switch (tier) {
    case 'Gigante':
      add('Vencer a liga nacional', 10, 'trophy');
      add('Avançar na competição continental', 8, 'continental');
      add('Chegar à final da copa nacional', 7, 'cup-run');
      break;
    case 'Grande':
      add('Classificar-se para a competição continental', 9, 'continental');
      add('Terminar entre os 6 primeiros', 7, 'league');
      add('Vencer a copa nacional', 6, 'cup-run');
      break;
    case 'Médio':
      add('Terminar na metade superior da tabela', 7, 'mid-table');
      add('Disputar classificação continental', 7, 'continental');
      add('Equilibrar as finanças', 5, 'finances');
      break;
    case 'Pequeno':
      add('Evitar o rebaixamento', 9, 'avoid-relegation');
      add('Equilibrar as finanças', 7, 'finances');
      add('Vender jogadores com lucro', 6, 'finances');
      break;
    default:
      add('Sobreviver na divisão', 9, 'avoid-relegation');
      add('Equilibrar as finanças', 8, 'finances');
      add('Desenvolver jovens da base', 6, 'develop-youth');
  }
  return base;
}

function stadiumFor(tier: ClubTier, rng: RNG, city: string, suffix: string): Stadium {
  const capRange: Record<ClubTier, [number, number]> = {
    Gigante: [60000, 95000], Grande: [35000, 60000], Médio: [20000, 35000],
    Pequeno: [10000, 20000], Amador: [3000, 10000],
  };
  const [min, max] = capRange[tier];
  const capacity = rng.int(min, max);
  const occupancy = rng.float(0.6, 0.95);
  return {
    name: `${city} ${suffix}`,
    capacity,
    avgAttendance: Math.round(capacity * occupancy),
    condition: rng.int(55, 95),
    maintenanceCost: Math.round(capacity * rng.float(0.6, 1.1)),
  };
}

// ------------------------------------------------------------
// Clube
// ------------------------------------------------------------
function generateClub(
  rng: RNG,
  country: CountryData,
  tier: number,
  idx: number,
  leagueId: string,
  seasonYear: number,
): { club: Club; clubStr: number } {
  const repBonus = (country.rep - 50) / 10;
  const tierBase = tier === 1 ? 80 : tier === 2 ? 63 : 49;
  const spread = tier === 1 ? 1.1 : 0.85;
  const clubStr = Math.round(tierBase - idx * spread + repBonus * (tier === 1 ? 1 : 0.5) + rng.gaussian(0, 2.5));
  const rep = clamp(clubStr + 3, 15, 95);
  const tierLbl = tierLabel(rep);
  const city = country.cities[idx % country.cities.length];
  const pattern = country.clubPatterns[rng.int(0, country.clubPatterns.length - 1)];
  const name = pattern.replace('{city}', city).replace('{n}', String(1900 + rng.int(0, 125)));
  const shortName = name
    .split(' ')
    .filter((w) => !['FC', 'AC', 'SC', 'SV', 'AS', 'NK', 'OFK', 'FK', 'US', 'CD', 'AD', 'TSV', 'RC', 'ES', 'SG', 'VfB'].includes(w))
    .join(' ') || name;

  const balance: Record<ClubTier, [number, number]> = {
    Gigante: [80_000_000, 160_000_000],
    Grande: [35_000_000, 80_000_000],
    Médio: [12_000_000, 35_000_000],
    Pequeno: [3_000_000, 12_000_000],
    Amador: [300_000, 3_000_000],
  };
  const [bmin, bmax] = balance[tierLbl];
  const balanceAmt = rng.int(bmin, bmax);
  const stadium = stadiumFor(tierLbl, rng, city, rng.pick(country.stadiumSuffixes).replace('{city}', city));
  const facilitiesBase = clamp(clubStr, 30, 95);

  const club: Club = {
    id: `${country.id}_${tier}_${idx}`,
    name,
    shortName: shortName.length > 18 ? shortName.slice(0, 18) : shortName,
    countryId: country.id,
    city,
    stadium,
    fans: Math.round((stadium.capacity * rng.float(3, 8)) / 1000) * 10,
    reputation: rep,
    tier: tierLbl,
    colors: rng.pick(COLOR_PAIRS),
    budget: Math.round(balanceAmt * rng.float(0.35, 0.6)),
    balance: balanceAmt,
    clubValue: balanceAmt * rng.int(6, 12) + Math.round(stadium.capacity * 1200),
    wageBill: 0,
    facilities: {
      training: clamp(Math.round(facilitiesBase * rng.float(0.8, 1.1)), 10, 99),
      youth: clamp(Math.round(facilitiesBase * rng.float(0.7, 1.15)), 10, 99),
      medical: clamp(Math.round(facilitiesBase * rng.float(0.75, 1.1)), 10, 99),
      commercial: clamp(Math.round(facilitiesBase * rng.float(0.7, 1.2)), 10, 99),
    },
    leagueId,
    coach: generateCoach(rng, country, rep),
    staff: generateStaff(rng, country, rep, seasonYear),
    objectives: objectivesFor(tierLbl),
    boardPatience: rng.int(55, 85),
    fanTrust: rng.int(55, 85),
    boardMessage: null,
    boardMessageUntil: null,
    managerId: null,
    isUserControlled: false,
    titles: [],
    lastResults: [],
    financeHistory: [],
    lastSeasonPosition: null,
    averageAge: 25,
    squadStrength: clubStr,
    morale: 70,
    transferHistory: [],
    founded: rng.int(1895, 2015),
    financeAccum: { revenue: 0, expenses: 0 },
  };
  return { club, clubStr };
}

// ------------------------------------------------------------
// Competições
// ------------------------------------------------------------
function createLeagueCompetition(country: CountryData, tier: number, season: string): Competition {
  const names: Record<number, string> = {
    1: country.leagueName, 2: country.secondDivisionName, 3: country.thirdDivisionName,
  };
  const id = `${country.id}_L${tier}`;
  return {
    id,
    name: names[tier],
    shortName: `${country.flag} D${tier}`,
    countryId: country.id,
    type: 'league',
    tier,
    season,
    clubIds: [],
    standings: [],
    rounds: [],
    currentRoundIndex: 0,
    status: 'scheduled',
    prizeMoney: tier === 1
      ? { champion: 8_000_000, runnerUp: 4_000_000 }
      : tier === 2
        ? { champion: 2_000_000, runnerUp: 1_000_000 }
        : { champion: 600_000, runnerUp: 300_000 },
    champions: [],
    topScorers: [],
    rules: {
      promotionSpots: tier === 1 ? 0 : 3,
      relegationSpots: tier === 3 ? 0 : 3,
      continentalSpots: tier === 1 ? 4 : 0,
      points: 3,
    },
  };
}

function createCupCompetition(country: CountryData, season: string): Competition {
  return {
    id: `${country.id}_CUP`,
    name: country.cupName,
    shortName: `🏆 ${country.flag}`,
    countryId: country.id,
    type: 'cup',
    tier: 0,
    season,
    clubIds: [],
    standings: [],
    rounds: [],
    currentRoundIndex: 0,
    status: 'scheduled',
    prizeMoney: { champion: 3_000_000, runnerUp: 1_200_000 },
    champions: [],
    topScorers: [],
    rules: { promotionSpots: 0, relegationSpots: 0, continentalSpots: 0, points: 3 },
  };
}

function createContinentalCompetition(season: string): Competition {
  return {
    id: 'CONTINENTAL',
    name: CONTINENTAL_COMPETITION,
    shortName: '🌍 LCC',
    countryId: null,
    type: 'continental',
    tier: 0,
    season,
    clubIds: [],
    standings: [],
    rounds: [],
    currentRoundIndex: 0,
    status: 'scheduled',
    prizeMoney: { champion: 25_000_000, runnerUp: 12_000_000, 8: 8_000_000, 4: 5_000_000, 2: 2_000_000 },
    champions: [],
    topScorers: [],
    rules: { promotionSpots: 0, relegationSpots: 0, continentalSpots: 0, points: 3 },
  };
}

// ------------------------------------------------------------
// Calendário — ligas (round robin duplo)
// ------------------------------------------------------------
export function leagueFixtures(teamIds: string[], world: World, rng: RNG, comp: Competition): Match[] {
  const n = teamIds.length;
  const firstHalf = Math.floor((n - 1) / 2);
  const ids = [...teamIds];
  const fixed = ids[0];
  const rotating = ids.slice(1);
  const rounds: { home: string; away: string }[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const roundPairs: [string, string][] = [];
    roundPairs.push(r % 2 === 0 ? [fixed, rotating[0]] : [rotating[0], fixed]);
    for (let i = 1; i < firstHalf + 1; i++) {
      const a = rotating[i];
      const b = rotating[rotating.length - i];
      roundPairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(roundPairs.map(([h, a]) => ({ home: h, away: a })));
    rotating.push(rotating.shift()!);
  }
  const full = [...rounds, ...rounds.map((rd) => rd.map((m) => ({ home: m.away, away: m.home })))];

  const seasonYear = Number(world.season.slice(0, 4));
  const baseDate = `${seasonYear}-08-15`;
  const importance = comp.tier === 1 ? 50 : comp.tier === 2 ? 35 : 25;

  const matches: Match[] = [];
  full.forEach((rd, i) => {
    const date = addDays(baseDate, i * 7);
    for (const m of rd) {
      matches.push({
        id: mid(),
        competitionId: comp.id,
        season: world.season,
        date,
        homeId: m.home,
        awayId: m.away,
        round: i + 1,
        played: false,
        homeScore: null,
        awayScore: null,
        events: [],
        stats: null,
        playerStats: null,
        homeLineup: [],
        awayLineup: [],
        homeFormation: '4-4-2',
        awayFormation: '4-4-2',
        attendance: null,
        importance: rng.chance(0.12) ? importance + 15 : importance,
        weather: rng.pick(['Ensolarado', 'Nublado', 'Chuva leve', 'Chuva forte', 'Vento', 'Neve']),
        penaltyShootout: null,
        homeName: world.clubs[m.home].name,
        awayName: world.clubs[m.away].name,
        extraTimePlayed: false,
        substitutions: [],
      });
    }
  });
  return matches;
}

// ------------------------------------------------------------
// Calendário — copa (mata-mata com sorteio)
// ------------------------------------------------------------
export function cupFixtures(comp: Competition, world: World, rng: RNG): { matches: Match[]; rounds: CupRound[]; refs: Record<string, { home: MatchRef; away: MatchRef }> } {
  const seasonYear = Number(world.season.slice(0, 4));
  const baseDate = `${seasonYear}-08-15`; // sábado
  // copa aos domingos (base+1 é domingo): nunca conflita com a liga (sábados)
  const roundDates = [22, 50, 85, 127, 176, 225].map((d) => addDays(baseDate, d));
  const roundNames = ['1ª Fase', '2ª Fase', '3ª Fase', 'Quartas de final', 'Semifinal', 'Final'];

  const mkMatch = (round: number, date: string): Match => ({
    id: mid(),
    competitionId: comp.id,
    season: world.season,
    date,
    homeId: '__TBD__',
    awayId: '__TBD__',
    round,
    played: false,
    homeScore: null,
    awayScore: null,
    events: [],
    stats: null,
    playerStats: null,
    homeLineup: [],
    awayLineup: [],
    homeFormation: '4-4-2',
    awayFormation: '4-4-2',
    attendance: null,
    importance: round === 5 ? 85 : round === 4 ? 75 : 60,
    weather: rng.pick(['Ensolarado', 'Nublado', 'Chuva leve', 'Chuva forte', 'Vento', 'Neve']),
    penaltyShootout: null,
    homeName: '',
    awayName: '',
    extraTimePlayed: false,
    substitutions: [],
  });

  const matches: Match[] = [];
  const refs: Record<string, { home: MatchRef; away: MatchRef }> = {};
  const rounds: CupRound[] = roundNames.map((name, i) => ({
    name,
    legs: 'single' as const,
    extraTime: true,
    penalties: true,
    matchIds: [],
    complete: false,
  }));

  const allTeams = [...comp.clubIds];
  const sorted = [...allTeams].sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation);
  const byes = sorted.slice(0, 4);
  const rest = rng.shuffle(sorted.slice(4));

  // 1ª fase: 56 times → 28 jogos (equipes reais)
  for (let i = 0; i < 28; i++) {
    const m = mkMatch(1, roundDates[0]);
    m.homeId = rest[i * 2];
    m.awayId = rest[i * 2 + 1];
    m.homeName = world.clubs[rest[i * 2]].name;
    m.awayName = world.clubs[rest[i * 2 + 1]].name;
    refs[m.id] = { home: { kind: 'club', id: rest[i * 2] }, away: { kind: 'club', id: rest[i * 2 + 1] } };
    matches.push(m);
    rounds[0].matchIds.push(m.id);
  }

  // 2ª fase: 28 vencedores da 1ª + 4 cabeças de chave
  for (let i = 0; i < 16; i++) {
    const m = mkMatch(2, roundDates[1]);
    const homeRef: MatchRef = i < 14
      ? { kind: 'winner', matchId: rounds[0].matchIds[i * 2] }
      : { kind: 'club', id: byes[(i - 14) * 2] };
    const awayRef: MatchRef = i < 14
      ? { kind: 'winner', matchId: rounds[0].matchIds[i * 2 + 1] }
      : { kind: 'club', id: byes[(i - 14) * 2 + 1] };
    refs[m.id] = { home: homeRef, away: awayRef };
    matches.push(m);
    rounds[1].matchIds.push(m.id);
  }

  // fases seguintes: vencedores da fase anterior
  const prevMatchIds = (ri: number) => rounds[ri].matchIds;
  for (let ri = 2; ri < 6; ri++) {
    const prev = prevMatchIds(ri - 1);
    const nMatches = prev.length / 2;
    for (let i = 0; i < nMatches; i++) {
      const m = mkMatch(ri + 1, roundDates[ri - 1]);
      refs[m.id] = {
        home: { kind: 'winner', matchId: prev[i * 2] },
        away: { kind: 'winner', matchId: prev[i * 2 + 1] },
      };
      matches.push(m);
      rounds[ri].matchIds.push(m.id);
    }
  }

  return { matches, rounds, refs };
}

// ------------------------------------------------------------
// Calendário — continental (grupos + mata-mata)
// ------------------------------------------------------------
export function continentalFixtures(comp: Competition, world: World, rng: RNG): { matches: Match[]; rounds: CupRound[]; refs: Record<string, { home: MatchRef; away: MatchRef }>; groups: Record<string, number> } {
  const seasonYear = Number(world.season.slice(0, 4));
  const baseDate = `${seasonYear}-08-15`; // sábado
  // grupos e mata-mata às quartas-feiras (base+4 é quarta)
  const groupDates = [4, 25, 46, 67, 88].map((d) => addDays(baseDate, d));
  const koDates = [116, 165, 216].map((d) => addDays(baseDate, d));

  const mkMatch = (round: number, date: string): Match => ({
    id: mid(),
    competitionId: comp.id,
    season: world.season,
    date,
    homeId: '__TBD__',
    awayId: '__TBD__',
    round,
    played: false,
    homeScore: null,
    awayScore: null,
    events: [],
    stats: null,
    playerStats: null,
    homeLineup: [],
    awayLineup: [],
    homeFormation: '4-4-2',
    awayFormation: '4-4-2',
    attendance: null,
    importance: 75,
    weather: rng.pick(['Ensolarado', 'Nublado', 'Chuva leve', 'Vento']),
    penaltyShootout: null,
    homeName: '',
    awayName: '',
    extraTimePlayed: false,
    substitutions: [],
  });

  const rounds: CupRound[] = [
    { name: 'Fase de Grupos', legs: 'single', extraTime: false, penalties: false, matchIds: [], complete: false },
    { name: 'Quartas de final', legs: 'single', extraTime: true, penalties: true, matchIds: [], complete: false },
    { name: 'Semifinal', legs: 'single', extraTime: true, penalties: true, matchIds: [], complete: false },
    { name: 'Final', legs: 'single', extraTime: true, penalties: true, matchIds: [], complete: false },
  ];

  const matches: Match[] = [];
  const refs: Record<string, { home: MatchRef; away: MatchRef }> = {};
  const groups: Record<string, number> = {};
  const teams = [...comp.clubIds];
  const draw = new RNG(world.seed + comp.season + 'continental-draw');
  const shuffled = draw.shuffle(teams);
  const groupsArr: string[][] = [[], [], [], []];
  shuffled.forEach((t, i) => {
    groupsArr[i % 4].push(t);
    groups[t] = i % 4;
  });

  // round-robin (cada time enfrenta todos do grupo uma vez; suporta qualquer nº de times)
  const roundRobin = (pool: string[]): string[][][] => {
    const list = draw.shuffle([...pool]);
    if (list.length % 2 === 1) list.push('__BYE__');
    const n = list.length;
    const out: string[][][] = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs: string[][] = [];
      for (let i = 0; i < n / 2; i++) {
        pairs.push([list[i], list[n - 1 - i]]);
      }
      out.push(pairs);
      const last = list.pop()!;
      list.splice(1, 0, last);
    }
    return out;
  };

  // grupos: 16/20 times → 4 grupos
  for (let g = 0; g < 4; g++) {
    const grp = groupsArr[g];
    if (grp.length < 2) continue;
    const fixtures = roundRobin(grp);
    fixtures.forEach((pairs, r) => {
      pairs.forEach((pair) => {
        if (pair[0] === '__BYE__' || pair[1] === '__BYE__') return;
        const m = mkMatch(r + 1, groupDates[r]);
        m.homeId = pair[0];
        m.awayId = pair[1];
        m.homeName = world.clubs[pair[0]]?.name ?? '';
        m.awayName = world.clubs[pair[1]]?.name ?? '';
        refs[m.id] = { home: { kind: 'club', id: pair[0] }, away: { kind: 'club', id: pair[1] } };
        matches.push(m);
        rounds[0].matchIds.push(m.id);
      });
    });
    for (const t of grp) {
      if (!comp.standings.some((s) => s.clubId === t)) {
        comp.standings.push({ clubId: t, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] });
      }
    }
  }

  // mata-mata: QF definidos pelos grupos; SF/Final pelos vencedores
  for (let ri = 0; ri < 3; ri++) {
    const nMatches = ri === 0 ? 4 : ri === 1 ? 2 : 1;
    for (let i = 0; i < nMatches; i++) {
      const m = mkMatch(ri + 5, koDates[ri]);
      const homeRef: MatchRef = ri === 0
        ? { kind: 'group', group: i, pos: 0 }
        : { kind: 'winner', matchId: rounds[ri].matchIds[i * 2] };
      const awayRef: MatchRef = ri === 0
        ? { kind: 'group', group: (i % 2 === 0 ? i + 1 : i - 1), pos: 1 }
        : { kind: 'winner', matchId: rounds[ri].matchIds[i * 2 + 1] };
      refs[m.id] = { home: homeRef, away: awayRef };
      matches.push(m);
      rounds[ri + 1].matchIds.push(m.id);
    }
  }

  return { matches, rounds, refs, groups };
}

// ------------------------------------------------------------
// Geração completa do mundo
// ------------------------------------------------------------
export function generateWorld(seed: string, season = '2026/27'): World {
  resetCounters();
  const rng = new RNG(seed);
  const seasonYear = Number(season.slice(0, 4));

  const world: World = {
    version: 2,
    seed,
    negotiations: {},
    renewals: {},
    incomingOffers: [],
    pendingArrivals: [],
    playerTalks: {},
    marketHighlights: [],
    windowRecordFee: 0,
    agents: {},
    scoutReports: {},
    negotiationHistory: [],
    loanOptionTriggers: [],
    season,
    seasonNumber: 1,
    date: `${seasonYear}-07-01`,
    countries: [],
    clubs: {},
    players: {},
    youth: {},
    competitions: {},
    news: [],
    transfers: [],
    records: [],
    hallOfFame: [],
    history: [],
    windows: {
      summer: { start: '07-01', end: '08-31' },
      winter: { start: '01-01', end: '01-31' },
    },
    generationCount: 0,
    seasonEvents: [],
    leagueMatches: {},
    cupMatches: {},
    continentalMatches: {},
  };

  for (const cd of COUNTRIES) {
    const country: Country = {
      id: cd.id,
      name: cd.name,
      flag: cd.flag,
      reputation: cd.rep,
      divisions: [],
      cupId: `${cd.id}_CUP`,
      continentalId: 'CONTINENTAL',
    };

    for (let tier = 1; tier <= 3; tier++) {
      const comp = createLeagueCompetition(cd, tier, season);
      world.competitions[comp.id] = comp;
      country.divisions.push(comp.id);
      for (let i = 0; i < 20; i++) {
        const { club, clubStr } = generateClub(rng, cd, tier, i, comp.id, seasonYear);
        club.squadStrength = clubStr;
        world.clubs[club.id] = club;
        comp.clubIds.push(club.id);
      }
    }

    const cup = createCupCompetition(cd, season);
    world.competitions[cup.id] = cup;
    for (const lid of country.divisions) {
      for (const cid of world.competitions[lid].clubIds) cup.clubIds.push(cid);
    }
    world.countries.push(country);
  }

  // continental: top 4 de cada 1ª divisão
  const cont = createContinentalCompetition(season);
  world.competitions[cont.id] = cont;
  for (const c of world.countries) {
    const l1 = world.competitions[c.divisions[0]];
    const sorted = [...l1.clubIds].sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation);
    for (const cid of sorted.slice(0, 4)) cont.clubIds.push(cid);
  }

  // jogadores
  for (const cd of COUNTRIES) {
    const c = world.countries.find((x) => x.id === cd.id)!;
    for (const lid of c.divisions) {
      const comp = world.competitions[lid];
      for (const clubId of comp.clubIds) {
        const club = world.clubs[clubId];
        const squadSize = 24 + rng.int(0, 3);
        const positions = rng.shuffle(POSITION_TEMPLATE).slice(0, squadSize);
        positions[0] = 'GK'; positions[1] = 'GK'; positions[2] = 'GK';
        if (!positions.some((p) => p === 'CB')) positions[3] = 'CB';
        if (!positions.some((p) => p === 'CM' || p === 'DM')) positions[6] = 'CM';
        if (!positions.some((p) => p === 'ST' || p === 'CF')) positions[positions.length - 1] = 'ST';

        let wageSum = 0;
        positions.forEach((pos, idx) => {
          const p = generatePlayer(rng, cd, club, club.squadStrength, pos, idx, seasonYear);
          world.players[p.id] = p;
          if (p.contract) wageSum += Math.round(p.contract.wage * 4.33);
        });
        club.wageBill = wageSum;

        const squad = Object.values(world.players).filter((p) => p.clubId === clubId);
        let ageSum = 0, strSum = 0, moraleSum = 0;
        for (const p of squad) {
          ageSum += p.age;
          strSum += overallAt(p, p.position);
          moraleSum += p.morale;
        }
        club.averageAge = ageSum / squad.length;
        club.squadStrength = strSum / squad.length;
        club.morale = moraleSum / squad.length;
      }
    }
  }

  // categorias de base: cada clube começa com jovens promessas na base
  for (const club of Object.values(world.clubs)) {
    world.youth[club.id] = generateYouthIntake(world, club.id);
  }

  // calendário
  for (const c of world.countries) {
    for (const lid of c.divisions) {
      const comp = world.competitions[lid];
      comp.standings = comp.clubIds.map((clubId) => ({
        clubId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [],
      }));
      world.leagueMatches[comp.id] = leagueFixtures(comp.clubIds, world, rng, comp);
    }
    const cup = world.competitions[c.cupId];
    const cf = cupFixtures(cup, world, rng);
    world.cupMatches[c.cupId] = { matches: cf.matches, roundWinners: {}, refs: cf.refs };
    cup.rounds = cf.rounds;
  }
  const ctf = continentalFixtures(cont, world, rng);
  world.continentalMatches[cont.id] = { matches: ctf.matches, roundWinners: {}, refs: ctf.refs, groups: ctf.groups };
  cont.rounds = ctf.rounds;

  // finanças iniciais
  const startMonth = `${seasonYear}-07`;
  for (const club of Object.values(world.clubs)) {
    club.financeHistory.push({ month: startMonth, revenue: 0, expenses: 0, balance: club.balance });
  }

  initRecords(world);
  world.news.push({
    id: `n${Date.now()}0`,
    date: world.date,
    title: `Temporada ${world.season} começa!`,
    subtitle: 'As ligas do continente estão prontas para mais uma temporada cheia de emoção.',
    category: 'Clubes',
    importance: 40,
    read: false,
  });

  return world;
}

function initRecords(world: World): void {
  world.records = [
    { key: 'biggest_transfer', label: 'Maior transferência', value: 0, holder: '—', season: world.season },
    { key: 'top_scorer', label: 'Maior artilheiro da temporada', value: 0, holder: '—', season: world.season },
    { key: 'biggest_win', label: 'Maior goleada', value: '—', holder: '—', season: world.season },
    { key: 'oldest_goalscorer', label: 'Jogador mais velho a marcar', value: 0, holder: '—', season: world.season },
    { key: 'youngest_goalscorer', label: 'Jogador mais jovem a marcar', value: 99, holder: '—', season: world.season },
  ];
}

// Exporta utilitários reutilizados em outras partes
export { toDateStr };
