import {
  World, Club, Player, Competition, Country, Position, PositionGroup,
  Personality, Stadium, Coach, StaffMember, StaffRole, ClubObjective, ClubTier,
  Contract, SeasonStats, PlayerHistoryEntry, Match, CupRound, RecordItem, MatchRef,
  POSITION_GROUPS, StadiumSectorId, StadiumSector,
} from '../lib/types';
import { SECTOR_IDS, allocateSectorSeats } from './stadium';
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
// Papel do jogador no elenco — define força e faixa etária
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SquadRole = 'starter' | 'rotation' | 'bench' | 'youth';

const ROLE_DELTA: Record<SquadRole, number> = {
  starter: 1,   // ⭐ titulares — plena força do clube
  rotation: -4, // 🔄 rotação
  bench: -8,    // 🪑 reservas
  youth: -13,   // 🌱 jovens promessas
};

const ROLE_AGE: Record<SquadRole, [number, number]> = {
  starter: [23, 32],
  rotation: [21, 29],
  bench: [19, 26],
  youth: [16, 19],
};

// Elenco padrão: 28 jogadores — 3 GK / 8 DEF / 8 MID / 9 ATT
// Ordenado por hierarquia: 11 titulares → 6 rotação → 6 reservas → 5 jovens
const SQUAD_TEMPLATE: Array<{ pos: Position; role: SquadRole }> = [
  // ⭐ Titulares (11)
  { pos: 'GK', role: 'starter' }, { pos: 'RB', role: 'starter' }, { pos: 'CB', role: 'starter' },
  { pos: 'CB', role: 'starter' }, { pos: 'LB', role: 'starter' }, { pos: 'DM', role: 'starter' },
  { pos: 'CM', role: 'starter' }, { pos: 'CM', role: 'starter' }, { pos: 'AM', role: 'starter' },
  { pos: 'RW', role: 'starter' }, { pos: 'ST', role: 'starter' },
  // 🔄 Rotação (6)
  { pos: 'GK', role: 'rotation' }, { pos: 'CB', role: 'rotation' }, { pos: 'RB', role: 'rotation' },
  { pos: 'CM', role: 'rotation' }, { pos: 'LW', role: 'rotation' }, { pos: 'CF', role: 'rotation' },
  // 🪑 Reservas (6)
  { pos: 'GK', role: 'bench' }, { pos: 'CB', role: 'bench' }, { pos: 'LB', role: 'bench' },
  { pos: 'DM', role: 'bench' }, { pos: 'AM', role: 'bench' }, { pos: 'RW', role: 'bench' },
  // 🌱 Jovens (5)
  { pos: 'ST', role: 'youth' }, { pos: 'LW', role: 'youth' }, { pos: 'CF', role: 'youth' },
  { pos: 'CM', role: 'youth' }, { pos: 'CF', role: 'youth' },
];

export const POSITION_TEMPLATE: Position[] = SQUAD_TEMPLATE.map((s) => s.pos);

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

export function generatePlayer(
  rng: RNG,
  country: CountryData,
  club: Club,
  clubStr: number,
  pos: Position,
  idx: number,
  seasonYear: number,
  role: SquadRole = 'starter',
  idOverride?: string,
): Player {
  const [minAge, maxAge] = ROLE_AGE[role];
  const age = rng.int(minAge, maxAge);

  let target = clubStr + POSITION_OFFSET[pos] + ROLE_DELTA[role] + rng.gaussian(0, 5);
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
  // Contrato individual com distribuição realista de fim de vínculo.
  // Sempre termina em 30/06 de uma temporada futura — nunca expira na criação.
  // 10% terminam na temporada atual · 20% em +1 · 25% em +2 · 25% em +3 · 15% em +4 · 5% em +5 ou mais.
  const roll = rng.float(0, 1);
  const seasonsLeft = roll < 0.10 ? 1 : roll < 0.30 ? 2 : roll < 0.55 ? 3 : roll < 0.80 ? 4 : roll < 0.95 ? 5 : 6;
  const today = `${seasonYear}-07-01`;
  const until = `${seasonYear + seasonsLeft}-06-30`;
  // início do contrato: plausível (60–600 dias atrás), sempre antes do fim
  const maxSignedAgo = Math.max(90, Math.min(600, Math.round(seasonsLeft * 365 * 0.7)));
  const contract: Contract = {
    signedAt: addDays(today, -rng.int(60, maxSignedAgo)),
    until,
    wage: estimateWage(ov, age, reputation),
    bonus: rng.chance(0.4) ? estimateWage(ov, age, reputation) * rng.int(4, 15) : 0,
    releaseClause: rng.chance(0.2)
      ? Math.round(estimateValue(ov, age, potential, reputation, 2) * rng.float(1.3, 2))
      : null,
  };

  const birthDate = addDays(today, -Math.round(age * 365.25 + rng.int(0, 360)));
  const height = pos === 'GK' ? rng.int(186, 202) : rng.int(168, 195);

  return {
    id: idOverride ?? pid(),
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
    value: estimateValue(ov, age, potential, reputation, seasonsLeft),
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

/** Estádio com nome e capacidade reais (ex.: Maracanã). */
function stadiumNamed(name: string, capacity: number, rep: number, tier: ClubTier): Stadium {
  const occupancy = clamp(rep / 100 + 0.2, 0.6, 0.98);
  const sectors = {} as Record<StadiumSectorId, StadiumSector>;
  const seats = allocateSectorSeats(capacity);
  for (const id of SECTOR_IDS) {
    sectors[id] = { seats: seats[id], price: 0, share: seats[id] / capacity };
  }
  const basePrices: Record<StadiumSectorId, number> = {
    arquibancada: Math.max(4, Math.round(5 + rep * 0.25)),
    cadeira: Math.max(6, Math.round(8 + rep * 0.45)),
    premium: Math.max(12, Math.round(14 + rep * 0.85)),
    vip: Math.max(20, Math.round(22 + rep * 1.2)),
    camarote: Math.max(30, Math.round(32 + rep * 1.6)),
  };
  for (const id of SECTOR_IDS) sectors[id].price = basePrices[id];
  const comfortBase = clamp(Math.round(rep * 0.7), 45, 88);
  return {
    name,
    capacity,
    avgAttendance: Math.round(capacity * occupancy),
    condition: clamp(rep + 5, 60, 95),
    maintenanceCost: Math.round(capacity * 0.85),
    reputation: rep,
    satisfaction: clamp(rep - 5, 55, 88),
    atmosphere: clamp(rep - 10, 50, 85),
    protest: 0,
    sectors,
    comfort: {
      assentos: comfortBase, banheiros: clamp(comfortBase - 10, 35, 85), alimentacao: clamp(comfortBase + 5, 40, 90),
      climatizacao: clamp(comfortBase - 15, 30, 80), acessibilidade: clamp(comfortBase - 8, 30, 80), limpeza: clamp(comfortBase + 2, 50, 90),
      iluminacao: clamp(comfortBase + 3, 45, 90), acustica: clamp(comfortBase - 5, 40, 85),
    },
    foodLevel: tier === 'Gigante' ? 2 : tier === 'Grande' ? 1 : 0,
    storeLevel: tier === 'Gigante' ? 2 : tier === 'Grande' ? 1 : 0,
    vipLevel: tier === 'Gigante' ? 2 : tier === 'Grande' ? 1 : 0,
    parking: {
      spaces: Math.round(capacity * 0.07),
      price: tier === 'Gigante' ? 15 : tier === 'Grande' ? 10 : 6,
      level: tier === 'Gigante' ? 2 : 1,
    },
    security: clamp(rep - 5, 50, 90),
    tech: {
      telao: tier === 'Gigante' ? 2 : 1, som: tier === 'Gigante' ? 2 : 1,
      wifi: true, app: tier !== 'Pequeno', catapulta: false, smartTickets: tier === 'Gigante',
    },
    boxes: {
      total: tier === 'Gigante' ? 40 : tier === 'Grande' ? 20 : 8,
      sold: 0,
      price: tier === 'Gigante' ? 550_000 : tier === 'Grande' ? 280_000 : 130_000,
    },
    works: [],
    naming: null,
    namingProposal: null,
    bookings: [],
    dynamicPricing: false,
    lastPriceChange: null,
    history: [],
    value: 0,
    eventsHosted: 0,
    protestsFired: 0,
    seasonAccum: { attendance: 0, matches: 0, ticket: 0, commercial: 0, costs: 0 },
  };
}

function stadiumFor(tier: ClubTier, rng: RNG, city: string, suffix: string): Stadium {
  const capRange: Record<ClubTier, [number, number]> = {
    Gigante: [60000, 95000], Grande: [35000, 60000], Médio: [20000, 35000],
    Pequeno: [10000, 20000], Amador: [3000, 10000],
  };
  const [min, max] = capRange[tier];
  const capacity = rng.int(min, max);
  const occupancy = rng.float(0.6, 0.95);
  const sectors = {} as Record<StadiumSectorId, StadiumSector>;
  const seats = allocateSectorSeats(capacity);
  for (const id of SECTOR_IDS) {
    sectors[id] = { seats: seats[id], price: 0, share: seats[id] / capacity };
  }
  const rep = tier === 'Gigante' ? rng.int(70, 95) : tier === 'Grande' ? rng.int(55, 75) : tier === 'Médio' ? rng.int(40, 60) : tier === 'Pequeno' ? rng.int(25, 45) : rng.int(10, 28);
  const basePrices: Record<StadiumSectorId, number> = {
    arquibancada: Math.max(4, Math.round(5 + rep * 0.25)),
    cadeira: Math.max(6, Math.round(8 + rep * 0.45)),
    premium: Math.max(12, Math.round(14 + rep * 0.85)),
    vip: Math.max(20, Math.round(22 + rep * 1.2)),
    camarote: Math.max(30, Math.round(32 + rep * 1.6)),
  };
  for (const id of SECTOR_IDS) sectors[id].price = basePrices[id];
  const comfortBase = rng.int(45, 88);
  return {
    name: `${city} ${suffix}`,
    capacity,
    avgAttendance: Math.round(capacity * occupancy),
    condition: rng.int(55, 95),
    maintenanceCost: Math.round(capacity * rng.float(0.6, 1.1)),
    reputation: rep,
    satisfaction: rng.int(55, 85),
    atmosphere: rng.int(45, 75),
    protest: rng.int(0, 15),
    sectors,
    comfort: {
      assentos: comfortBase, banheiros: rng.int(35, 85), alimentacao: rng.int(40, 90),
      climatizacao: rng.int(30, 80), acessibilidade: rng.int(30, 80), limpeza: rng.int(50, 90),
      iluminacao: rng.int(45, 90), acustica: rng.int(40, 85),
    },
    foodLevel: tier === 'Gigante' ? rng.int(1, 3) : rng.int(0, 2),
    storeLevel: tier === 'Gigante' ? rng.int(1, 3) : rng.int(0, 2),
    vipLevel: tier === 'Gigante' ? rng.int(1, 3) : rng.int(0, 2),
    parking: {
      spaces: Math.round(capacity * rng.float(0.04, 0.09)),
      price: tier === 'Gigante' ? 15 : tier === 'Grande' ? 10 : 6,
      level: tier === 'Gigante' ? 2 : rng.int(0, 1),
    },
    security: rng.int(45, 90),
    tech: {
      telao: tier === 'Gigante' ? rng.int(2, 3) : rng.int(0, 2),
      som: tier === 'Gigante' ? rng.int(2, 3) : rng.int(0, 2),
      wifi: rng.chance(0.4), app: rng.chance(0.3), catapulta: rng.chance(0.2), smartTickets: rng.chance(0.25),
    },
    boxes: {
      total: tier === 'Gigante' ? rng.int(30, 70) : tier === 'Grande' ? rng.int(12, 30) : rng.int(4, 12),
      sold: 0,
      price: tier === 'Gigante' ? rng.int(400_000, 800_000) : tier === 'Grande' ? rng.int(200_000, 400_000) : rng.int(80_000, 200_000),
    },
    works: [],
    naming: null,
    namingProposal: null,
    bookings: [],
    dynamicPricing: false,
    lastPriceChange: null,
    history: [],
    value: 0,
    eventsHosted: 0,
    protestsFired: 0,
    seasonAccum: { attendance: 0, matches: 0, ticket: 0, commercial: 0, costs: 0 },
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
): { club: Club; clubStr: number; realRivals?: string[] } {
  const repBonus = (country.rep - 50) / 10;
  const tierBase = tier === 1 ? 80 : tier === 2 ? 66 : tier === 3 ? 56 : 46;
  const spread = tier === 1 ? 1.1 : 0.85;
  // clube real (ex.: Série A do Brasil) — substitui o padrão gerado
  const real = country.realClubs?.[tier]?.[idx];
  const clubStr = real
    ? Math.round(real.strength + rng.gaussian(0, 1.5))
    : Math.round(tierBase - idx * spread + repBonus * (tier === 1 ? 1 : 0.5) + rng.gaussian(0, 2.5));
  const rep = clamp(clubStr + 3, 15, 95);
  const tierLbl = tierLabel(rep);
  const city = real ? real.city : country.cities[idx % country.cities.length];
  const name = real ? real.name : (() => {
    const pattern = country.clubPatterns[rng.int(0, country.clubPatterns.length - 1)];
    return pattern.replace('{city}', city).replace('{n}', String(1900 + rng.int(0, 125)));
  })();
  const shortName = real ? real.shortName : (name
    .split(' ')
    .filter((w) => !['FC', 'AC', 'SC', 'SV', 'AS', 'NK', 'OFK', 'FK', 'US', 'CD', 'AD', 'TSV', 'RC', 'ES', 'SG', 'VfB'].includes(w))
    .join(' ') || name);

  const balance: Record<ClubTier, [number, number]> = {
    Gigante: [80_000_000, 160_000_000],
    Grande: [35_000_000, 80_000_000],
    Médio: [12_000_000, 35_000_000],
    Pequeno: [3_000_000, 12_000_000],
    Amador: [300_000, 3_000_000],
  };
  const [bmin, bmax] = balance[tierLbl];
  const balanceAmt = rng.int(bmin, bmax);
  const stadium = real
    ? stadiumNamed(real.stadium, real.capacity, clamp(rep, 40, 95), tierLbl)
    : stadiumFor(tierLbl, rng, city, rng.pick(country.stadiumSuffixes).replace('{city}', city));
  const facilitiesBase = clamp(clubStr, 30, 95);

  const club: Club = {
    id: `${country.id}_${tier}_${idx}`,
    name,
    shortName: (real ? shortName : shortName).slice(0, 18),
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
    financeTransactions: [],
    competitionPrizes: [],
    lastSeasonPosition: null,
    rivals: [],
    averageAge: 25,
    squadStrength: clubStr,
    morale: 70,
    transferHistory: [],
    founded: rng.int(1895, 2015),
    financeAccum: { revenue: 0, expenses: 0 },
  };
  return { club, clubStr, realRivals: real?.rivals };
}

// ------------------------------------------------------------
// Competições
// ------------------------------------------------------------
function createLeagueCompetition(country: CountryData, tier: number, season: string): Competition {
  const names: Record<number, string> = {
    1: country.leagueName, 2: country.secondDivisionName, 3: country.thirdDivisionName,
    4: country.fourthDivisionName ?? `${country.name} Série D`,
  };
  const id = `${country.id}_L${tier}`;
  const isBrazil = country.id === 'brazil';
  return {
    id,
    name: names[tier],
    shortName: `${country.flag} ${isBrazil ? ['Série A', 'Série B', 'Série C', 'Série D'][tier - 1] ?? `D${tier}` : `D${tier}`}`,
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
      ? { champion: isBrazil ? 12_000_000 : 8_000_000, runnerUp: isBrazil ? 5_000_000 : 4_000_000 }
      : tier === 2
        ? { champion: isBrazil ? 3_000_000 : 2_000_000, runnerUp: isBrazil ? 1_400_000 : 1_000_000 }
        : tier === 3
          ? { champion: isBrazil ? 1_200_000 : 600_000, runnerUp: isBrazil ? 500_000 : 300_000 }
          : { champion: 400_000, runnerUp: 180_000 },
    champions: [],
    topScorers: [],
    rules: {
      promotionSpots: tier === 1 ? 0 : isBrazil ? 4 : 3,
      relegationSpots: isBrazil ? (tier === 4 ? 0 : 4) : tier === 3 ? 0 : 3,
      continentalSpots: tier === 1 ? 4 : 0,
      sudamericanaSpots: tier === 1 && isBrazil ? 2 : 0,
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
  // datas espalhadas — sempre antes do fim da liga (~dia 259), final ~dia 215
  const nTeams = comp.clubIds.length;
  let target = 1;
  while (target * 2 <= nTeams) target *= 2; // maior potência de 2 ≤ nTeams
  const firstRoundGames = nTeams - target;      // jogos na 1ª fase
  const byesCount = nTeams - firstRoundGames * 2; // passam direto (melhores)
  // Copa do Brasil real: 80 clubes → 8 fases (1ª→4ª, Oitavas, Quartas, Semifinal, Final),
  // com os cabeças de chave entrando ao longo das fases iniciais — assim a premiação
  // das Oitavas (R$ 3 mi) também é paga.
  const bigCup = nTeams === 80;
  const totalRounds = bigCup ? 8 : 1 + Math.log2(target);
  const roundDates = Array.from({ length: totalRounds }, (_, i) =>
    addDays(baseDate, Math.round(15 + ((215 - 15) * i) / Math.max(1, totalRounds - 1))),
  );

  const names = ['1ª Fase', '2ª Fase', '3ª Fase', '4ª Fase', 'Oitavas de final', 'Quartas de final', 'Semifinal', 'Final'];
  const roundNames = Array.from({ length: totalRounds }, (_, i) => {
    if (i === totalRounds - 1) return 'Final';
    if (i === totalRounds - 2) return 'Semifinal';
    if (i === totalRounds - 3) return 'Quartas de final';
    return names[i];
  });

  const mkMatch = (round: number, date: string, ri: number): Match => ({
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
    importance: ri === totalRounds - 1 ? 85 : ri === totalRounds - 2 ? 80 : ri === totalRounds - 3 ? 75 : 60,
    weather: rng.pick(['Ensolarado', 'Nublado', 'Chuva leve', 'Chuva forte', 'Vento', 'Neve']),
    penaltyShootout: null,
    homeName: '',
    awayName: '',
    extraTimePlayed: false,
    substitutions: [],
  });

  const matches: Match[] = [];
  const refs: Record<string, { home: MatchRef; away: MatchRef }> = {};
  const rounds: CupRound[] = roundNames.map((name) => ({
    name,
    legs: 'single' as const,
    extraTime: true,
    penalties: true,
    matchIds: [],
    complete: false,
  }));

  const allTeams = [...comp.clubIds];
  const sorted = [...allTeams].sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation);
  const byes = sorted.slice(0, byesCount);
  const rest = rng.shuffle(sorted.slice(byesCount));

  // 1ª fase: os clubes não-cabeças de chave se enfrentam
  for (let i = 0; i < firstRoundGames; i++) {
    const m = mkMatch(1, roundDates[0], 0);
    m.homeId = rest[i * 2];
    m.awayId = rest[i * 2 + 1];
    m.homeName = world.clubs[rest[i * 2]].name;
    m.awayName = world.clubs[rest[i * 2 + 1]].name;
    refs[m.id] = { home: { kind: 'club', id: rest[i * 2] }, away: { kind: 'club', id: rest[i * 2 + 1] } };
    matches.push(m);
    rounds[0].matchIds.push(m.id);
  }

  if (bigCup) {
    // 2ª, 3ª e 4ª fase: 16 jogos cada (8 entre vencedores + 8 entre novos cabeças de chave)
    let byeIdx = 0;
    for (let ri = 1; ri < 4; ri++) {
      const prev = rounds[ri - 1].matchIds; // 16 jogos da fase anterior
      for (let i = 0; i < 16; i++) {
        const m = mkMatch(ri + 1, roundDates[ri], ri);
        if (i < 8) {
          refs[m.id] = {
            home: { kind: 'winner', matchId: prev[i] },
            away: { kind: 'winner', matchId: prev[i + 8] },
          };
        } else {
          refs[m.id] = {
            home: { kind: 'club', id: byes[byeIdx] },
            away: { kind: 'club', id: byes[byeIdx + 1] },
          };
          byeIdx += 2;
        }
        matches.push(m);
        rounds[ri].matchIds.push(m.id);
      }
    }
    // Oitavas em diante: vencedores da fase anterior (8 → 4 → 2 → 1 jogos)
    for (let ri = 4; ri < totalRounds; ri++) {
      const prev = rounds[ri - 1].matchIds;
      const nMatches = prev.length / 2;
      for (let i = 0; i < nMatches; i++) {
        const m = mkMatch(ri + 1, roundDates[ri], ri);
        refs[m.id] = {
          home: { kind: 'winner', matchId: prev[i * 2] },
          away: { kind: 'winner', matchId: prev[i * 2 + 1] },
        };
        matches.push(m);
        rounds[ri].matchIds.push(m.id);
      }
    }
  } else {
    // 2ª fase: vencedores da 1ª + cabeças de chave (até chegar em potência de 2)
    const secondGames = target / 2;
    const winnerPairs = firstRoundGames / 2;
    for (let i = 0; i < secondGames; i++) {
      const m = mkMatch(2, roundDates[1], 1);
      if (i < winnerPairs) {
        refs[m.id] = {
          home: { kind: 'winner', matchId: rounds[0].matchIds[i * 2] },
          away: { kind: 'winner', matchId: rounds[0].matchIds[i * 2 + 1] },
        };
      } else {
        const bi = (i - winnerPairs) * 2;
        refs[m.id] = {
          home: { kind: 'club', id: byes[bi] },
          away: { kind: 'club', id: byes[bi + 1] },
        };
      }
      matches.push(m);
      rounds[1].matchIds.push(m.id);
    }

    // fases seguintes: vencedores da fase anterior
    const prevMatchIds = (ri: number) => rounds[ri].matchIds;
    for (let ri = 2; ri < totalRounds; ri++) {
      const prev = prevMatchIds(ri - 1);
      const nMatches = prev.length / 2;
      for (let i = 0; i < nMatches; i++) {
        const m = mkMatch(ri + 1, roundDates[ri], ri);
        refs[m.id] = {
          home: { kind: 'winner', matchId: prev[i * 2] },
          away: { kind: 'winner', matchId: prev[i * 2 + 1] },
        };
        matches.push(m);
        rounds[ri].matchIds.push(m.id);
      }
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
    inquiries: [],
    pendingArrivals: [],
    playerTalks: {},
    inbox: [],
    talkHistory: [],
    competitionPrizeRules: {},
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
    seasonEnded: false,
    seasonEndSummary: null,
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

    const tiers = cd.id === 'brazil' ? 4 : 3;
    for (let tier = 1; tier <= tiers; tier++) {
      const comp = createLeagueCompetition(cd, tier, season);
      world.competitions[comp.id] = comp;
      country.divisions.push(comp.id);
      const nClubs = cd.realClubs?.[tier]?.length ?? 20;
      for (let i = 0; i < nClubs; i++) {
        const { club, clubStr, realRivals } = generateClub(rng, cd, tier, i, comp.id, seasonYear);
        club.squadStrength = clubStr;
        if (realRivals) club.rivals = realRivals;
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

  // rivalidades reais (ex.: clássicos do Brasil) — resolve shortNames para IDs
  for (const cd of COUNTRIES) {
    if (!cd.realClubs) continue;
    const real = cd.realClubs;
    const byShort: Record<string, string> = {};
    for (const tier of Object.keys(real)) {
      const t = Number(tier);
      real[t].forEach((seed, i) => {
        byShort[seed.shortName] = `${cd.id}_${t}_${i}`;
      });
    }
    for (const tier of Object.keys(real)) {
      const t = Number(tier);
      real[t].forEach((seed, i) => {
        const clubId = `${cd.id}_${t}_${i}`;
        const club = world.clubs[clubId];
        if (!club || !seed.rivals) return;
        club.rivals = seed.rivals
          .map((r) => byShort[r])
          .filter((id): id is string => !!id && world.clubs[id] !== undefined);
      });
    }
  }

  // rivalidades: 2-3 adversários do mesmo país com reputação próxima (dérbis)
  for (const c of world.countries) {
    const pool = [];
    for (const lid of c.divisions) pool.push(...world.competitions[lid].clubIds);
    for (const cid of pool) {
      const club = world.clubs[cid];
      if (club.rivals.length > 0) continue; // rivalidade real já definida
      const candidates = pool
        .filter((x) => x !== cid)
        .map((x) => ({ id: x, diff: Math.abs(world.clubs[x].reputation - club.reputation) }))
        .sort((a, b) => a.diff - b.diff);
      const n = club.tier === 'Gigante' ? 3 : 2;
      club.rivals = candidates.slice(0, n).map((x) => x.id);
    }
  }

  // jogadores
  for (const cd of COUNTRIES) {
    const c = world.countries.find((x) => x.id === cd.id)!;
    for (const lid of c.divisions) {
      const comp = world.competitions[lid];
      for (const clubId of comp.clubIds) {
        const club = world.clubs[clubId];
        // elenco padrão: 28 jogadores (3 GK / 8 DEF / 8 MID / 9 ATT) com hierarquia
        let wageSum = 0;
        SQUAD_TEMPLATE.forEach((slot, idx) => {
          const p = generatePlayer(rng, cd, club, club.squadStrength, slot.pos, idx, seasonYear, slot.role);
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

  // premiação por fase (regras centralizadas) — geradas sob demanda pelo getPrizeRules
  world.competitionPrizeRules = {};

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
