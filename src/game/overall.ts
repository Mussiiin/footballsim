import { Player, PlayerAttributes, Position } from '../lib/types';
import { clamp } from '../lib/format';

// Pesos dos atributos por posição para cálculo do overall
export const POSITION_WEIGHTS: Record<Position, { attr: keyof PlayerAttributes | 'crossing'; w: number }[]> = {
  GK: [
    { attr: 'reflexes', w: 4 }, { attr: 'handling', w: 3.2 }, { attr: 'gkPositioning', w: 3 },
    { attr: 'rushing', w: 1.8 }, { attr: 'kicking', w: 1.5 }, { attr: 'agility', w: 1.6 },
    { attr: 'strength', w: 1 }, { attr: 'balance', w: 1 }, { attr: 'pace', w: 0.6 },
  ],
  CB: [
    { attr: 'marking', w: 4 }, { attr: 'tackling', w: 3.4 }, { attr: 'interception', w: 3.2 },
    { attr: 'defPositioning', w: 3 }, { attr: 'heading', w: 2.8 }, { attr: 'strength', w: 2.6 },
    { attr: 'physical', w: 2 }, { attr: 'pace', w: 1.8 }, { attr: 'passing', w: 1.4 },
    { attr: 'control', w: 1 }, { attr: 'stamina', w: 1.4 },
  ],
  LB: [
    { attr: 'pace', w: 3 }, { attr: 'acceleration', w: 2 }, { attr: 'tackling', w: 2.8 },
    { attr: 'marking', w: 2.6 }, { attr: 'stamina', w: 2.4 }, { attr: 'crossing', w: 0 },
    { attr: 'passing', w: 2.2 }, { attr: 'dribbling', w: 1.8 }, { attr: 'control', w: 1.6 },
    { attr: 'defPositioning', w: 2 }, { attr: 'physical', w: 1.4 }, { attr: 'strength', w: 1.4 },
  ],
  RB: [
    { attr: 'pace', w: 3 }, { attr: 'acceleration', w: 2 }, { attr: 'tackling', w: 2.8 },
    { attr: 'marking', w: 2.6 }, { attr: 'stamina', w: 2.4 }, { attr: 'crossing', w: 0 },
    { attr: 'passing', w: 2.2 }, { attr: 'dribbling', w: 1.8 }, { attr: 'control', w: 1.6 },
    { attr: 'defPositioning', w: 2 }, { attr: 'physical', w: 1.4 }, { attr: 'strength', w: 1.4 },
  ],
  DM: [
    { attr: 'passing', w: 3 }, { attr: 'tackling', w: 3 }, { attr: 'interception', w: 2.8 },
    { attr: 'defPositioning', w: 2.6 }, { attr: 'stamina', w: 3 }, { attr: 'physical', w: 2.4 },
    { attr: 'strength', w: 2.2 }, { attr: 'vision', w: 2 }, { attr: 'control', w: 1.8 },
    { attr: 'marking', w: 2 }, { attr: 'technique', w: 1.4 },
  ],
  CM: [
    { attr: 'passing', w: 3.4 }, { attr: 'vision', w: 3 }, { attr: 'technique', w: 2.4 },
    { attr: 'control', w: 2.6 }, { attr: 'stamina', w: 2.8 }, { attr: 'tackling', w: 1.6 },
    { attr: 'dribbling', w: 2 }, { attr: 'pace', w: 1.6 }, { attr: 'physical', w: 1.6 },
    { attr: 'shotPower', w: 1.4 }, { attr: 'defPositioning', w: 1 },
  ],
  AM: [
    { attr: 'vision', w: 3.6 }, { attr: 'passing', w: 3 }, { attr: 'technique', w: 2.8 },
    { attr: 'control', w: 2.6 }, { attr: 'dribbling', w: 2.6 }, { attr: 'attackPositioning', w: 2.4 },
    { attr: 'finishing', w: 2 }, { attr: 'shotPower', w: 1.8 }, { attr: 'pace', w: 1.6 },
    { attr: 'agility', w: 1.6 }, { attr: 'balance', w: 1.4 },
  ],
  LW: [
    { attr: 'pace', w: 3.4 }, { attr: 'acceleration', w: 2.6 }, { attr: 'dribbling', w: 3 },
    { attr: 'control', w: 2.4 }, { attr: 'finishing', w: 2.2 }, { attr: 'crossing', w: 0 },
    { attr: 'passing', w: 2.4 }, { attr: 'vision', w: 2 }, { attr: 'agility', w: 2.2 },
    { attr: 'technique', w: 2 }, { attr: 'balance', w: 1.6 },
  ],
  RW: [
    { attr: 'pace', w: 3.4 }, { attr: 'acceleration', w: 2.6 }, { attr: 'dribbling', w: 3 },
    { attr: 'control', w: 2.4 }, { attr: 'finishing', w: 2.2 }, { attr: 'crossing', w: 0 },
    { attr: 'passing', w: 2.4 }, { attr: 'vision', w: 2 }, { attr: 'agility', w: 2.2 },
    { attr: 'technique', w: 2 }, { attr: 'balance', w: 1.6 },
  ],
  ST: [
    { attr: 'finishing', w: 4 }, { attr: 'attackPositioning', w: 3 }, { attr: 'shotPower', w: 2.6 },
    { attr: 'pace', w: 2.4 }, { attr: 'dribbling', w: 2 }, { attr: 'heading', w: 2 },
    { attr: 'physical', w: 1.6 }, { attr: 'control', w: 2 }, { attr: 'strength', w: 1.8 },
    { attr: 'acceleration', w: 2 }, { attr: 'balance', w: 1.4 }, { attr: 'passing', w: 1 },
  ],
  CF: [
    { attr: 'finishing', w: 3 }, { attr: 'attackPositioning', w: 2.8 }, { attr: 'dribbling', w: 2.6 },
    { attr: 'technique', w: 2.4 }, { attr: 'passing', w: 2.2 }, { attr: 'vision', w: 2.2 },
    { attr: 'control', w: 2.2 }, { attr: 'pace', w: 2 }, { attr: 'shotPower', w: 1.8 },
    { attr: 'agility', w: 1.8 }, { attr: 'balance', w: 1.4 },
  ],
};

// 'crossing' não existe no modelo; substitui por passing ponderado
function attrOf(p: Player, name: keyof PlayerAttributes | 'crossing'): number {
  if (name === 'crossing') return p.attrs.passing;
  return p.attrs[name];
}

/** Overall do jogador na posição indicada. */
export function overallAt(p: Player, pos: Position): number {
  const weights = POSITION_WEIGHTS[pos];
  let sum = 0;
  let wsum = 0;
  for (const { attr, w } of weights) {
    sum += attrOf(p, attr) * w;
    wsum += w;
  }
  return Math.round(sum / wsum);
}

export function overallOf(p: Player): number {
  return overallAt(p, p.position);
}

/** Overall médio de uma lista de jogadores (posição específica). */
export function squadOverall(players: Player[]): number {
  if (players.length === 0) return 0;
  let sum = 0;
  for (const p of players) sum += overallOf(p);
  return sum / players.length;
}

/** Valor de mercado estimado (€). Curva realista: 97 ~ 80-160M, 80 ~ 30-60M, 60 ~ 4M. */
export function estimateValue(ov: number, age: number, potential: number, reputation: number, contractYears: number): number {
  const ageFactor =
    age <= 21 ? 1.35 :
    age <= 24 ? 1.3 :
    age <= 27 ? 1.1 :
    age <= 30 ? 0.85 :
    age <= 33 ? 0.5 : 0.28;
  const potFactor = potential > ov ? 1 + Math.min(potential - ov, 12) * 0.025 : 1;
  const base = 4000 * Math.pow(Math.max(ov - 45, 0), 2.5);
  return Math.max(8_000, Math.round(base * ageFactor * potFactor * (0.55 + reputation / 110) * (0.85 + Math.min(contractYears, 4) * 0.08)));
}

/** Salário semanal sugerido (€). */
export function estimateWage(ov: number, age: number, reputation: number): number {
  const base = Math.pow(ov / 45, 5) * 9_000;
  const ageMul = age > 32 ? 0.7 : age >= 28 ? 1 : 0.8 + (ov / 100);
  return Math.max(400, Math.round(base * ageMul * (0.6 + reputation / 120)));
}

export function contractYearsLeft(until: string, today: string): number {
  const y = Number(until.slice(0, 4)) - Number(today.slice(0, 4));
  const m = Number(until.slice(5, 7)) - Number(today.slice(5, 7));
  return y + (m < 0 ? 0 : m / 12);
}

/** Overall médio da melhor escalação (11 titulares) */
export function bestElevenOverall(players: Player[]): number {
  if (players.length === 0) return 0;
  const sorted = [...players].sort((a, b) => overallOf(b) - overallOf(a));
  const top = sorted.slice(0, 11);
  return Math.round((top.reduce((s, p) => s + overallOf(p), 0)) / top.length);
}

export function updatePlayerAverages(p: Player, today: string): void {
  p.avgRating = p.seasonStats.ratingCount > 0
    ? p.seasonStats.ratingSum / p.seasonStats.ratingCount
    : 6.5;
  p.value = estimateValue(
    overallOf(p),
    p.age,
    p.potential,
    p.reputation,
    p.contract ? contractYearsLeft(p.contract.until, today) : 0,
  );
}

/** Recalcula caches do clube (força, idade média, moral). */
export function refreshClubCaches(club: { averageAge: number; squadStrength: number; morale: number; wageBill: number }, players: Player[]): void {
  if (players.length === 0) return;
  let ageSum = 0;
  let strSum = 0;
  let moraleSum = 0;
  let wage = 0;
  for (const p of players) {
    ageSum += p.age;
    strSum += overallOf(p);
    moraleSum += p.morale;
    if (p.contract) wage += p.contract.wage * 4.33; // mensal
  }
  club.averageAge = ageSum / players.length;
  club.squadStrength = strSum / players.length;
  club.morale = moraleSum / players.length;
  club.wageBill = Math.round(wage);
}

export function overallRange(p: Player): string {
  return `${overallOf(p)}`;
}

export function adjustAttr(attrs: PlayerAttributes, key: keyof PlayerAttributes, delta: number): void {
  const cur = attrs[key] as number;
  (attrs as unknown as Record<string, number>)[key] = clamp(Math.round(cur + delta), 1, 99);
}
