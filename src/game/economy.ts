// ------------------------------------------------------------
// Economia do clube — finanças e objetivos por DIVISÃO + TAMANHO
// ------------------------------------------------------------
// O eixo principal é a divisão real do clube (Série A/B/C/D via leagueId),
// e o tamanho é derivado da reputação RELATIVA dentro da divisão.
// Assim um gigante recém-rebaixado continua rico, e um clube pequeno da
// Série A não precisa ser mais pobre que um médio da Série B — mas a
// escala geral respeita a realidade de cada divisão.
// ------------------------------------------------------------
import { World, Club, ClubObjective } from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { clamp } from '../lib/format';
import { overallOf } from './overall';

/** 1 = Série A, 2 = Série B, 3 = Série C, 4 = Série D. */
export function divisionOf(club: Club): number {
  const div = (club.leagueId ?? '').split('_').pop();
  if (div === 'L1') return 1;
  if (div === 'L2') return 2;
  if (div === 'L3') return 3;
  return 4;
}

/** Faixa de reputação de uma divisão (min/max entre os clubes dela). */
export function divisionRepRange(world: World, div: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const c of Object.values(world.clubs)) {
    if (divisionOf(c) !== div) continue;
    if (c.reputation < min) min = c.reputation;
    if (c.reputation > max) max = c.reputation;
  }
  if (!isFinite(min)) return [40, 60];
  return [min, max];
}

/**
 * Tamanho do clube dentro da divisão (1-5), baseado na reputação RELATIVA
 * à própria divisão (percentil da faixa de reputação dela). Assim um clube
 * tradicional da Série D é "grande" na Série D, mas não recebe finanças de
 * Série A — e a Série D fica com uma escala de clubes pequenos e médios.
 */
export function clubSize(club: Club, range?: [number, number]): 1 | 2 | 3 | 4 | 5 {
  const [rmin, rmax] = range ?? [40, 60];
  const t = clamp((club.reputation - rmin) / Math.max(1, rmax - rmin), 0, 1);
  if (t >= 0.9) return 5;
  if (t >= 0.7) return 4;
  if (t >= 0.45) return 3;
  if (t >= 0.2) return 2;
  return 1;
}

export const CLUB_SIZE_LABEL: Record<number, string> = {
  1: '⭐ Pequeno',
  2: '⭐⭐ Médio',
  3: '⭐⭐⭐ Grande',
  4: '⭐⭐⭐⭐ Muito grande',
  5: '⭐⭐⭐⭐⭐ Gigante',
};

/** Multiplicador de tamanho (1=base). */
function sizeMul(size: number): number {
  return [0.45, 0.75, 1, 1.45, 2.1][size - 1];
}

/**
 * Faixas base de caixa por divisão (R$, clube médio da divisão).
 * Escala: Série D = centenas de mil a milhões; Série A = dezenas de milhões.
 */
function cashRange(div: number): [number, number] {
  switch (div) {
    case 1: return [5_000_000, 80_000_000];
    case 2: return [2_000_000, 18_000_000];
    case 3: return [500_000, 5_000_000];
    default: return [150_000, 1_600_000];
  }
}

/** Renda mensal típica por divisão (R$) — usada para orçamento e dívida. */
function incomeRange(div: number): [number, number] {
  switch (div) {
    case 1: return [1_200_000, 15_000_000];
    case 2: return [450_000, 2_800_000];
    case 3: return [150_000, 800_000];
    default: return [45_000, 250_000];
  }
}

/** Capacidade de estádio típica por divisão (assentos). */
function stadiumRange(div: number): [number, number] {
  switch (div) {
    case 1: return [15_000, 80_000];
    case 2: return [8_000, 45_000];
    case 3: return [4_000, 20_000];
    default: return [2_000, 12_000];
  }
}

/**
 * Gera (ou recalcula) a situação financeira de um clube de forma determinística
 * (baseada no seed + id do clube), coerente com divisão + tamanho + estádio.
 * NÃO toca em elenco/contratos/histórico — apenas números financeiros.
 */
export function recalcClubFinances(world: World, club: Club, seed: string): void {
  const div = divisionOf(club);
  const range = divisionRepRange(world, div);
  const size = clubSize(club, range);
  const rng = new RNG(hashString(seed) ^ hashString(club.id + ':fin'));

  // caixa base pela divisão × tamanho, com variação por clube
  const [cmin, cmax] = cashRange(div);
  const cashBase = Math.round((cmin + (cmax - cmin) * rng.float(0.15, 0.85)) * sizeMul(size));
  // estádio grande/torcida grande podem puxar o caixa para cima
  const capacityFactor = club.stadium.capacity / stadiumRange(div)[1];
  const cash = Math.round(cashBase * (0.7 + capacityFactor * 0.6) * (0.85 + club.fans / 20000));

  // dívida: clubes pequenos muitas vezes devem mais do que têm; grandes têm menos dívida relativa
  const debtRatio = size <= 2 ? rng.float(0.15, 1.4) : size === 3 ? rng.float(0.05, 0.6) : rng.float(0, 0.35);
  const debt = Math.round(cash * debtRatio * rng.float(0.5, 1.5));

  // receita mensal esperada (aproxima TV + patrocínio + bilheteria)
  const [imin, imax] = incomeRange(div);
  const income = Math.round((imin + (imax - imin) * rng.float(0.2, 0.9)) * sizeMul(size) * (0.8 + capacityFactor * 0.4));

  // despesas mensais esperadas (folha + staff + estádio + bônus)
  const expense = Math.round(income * rng.float(0.82, 0.98));

  // orçamento de transferências: parcela do caixa livre (caixa - dívida - reserva)
  const free = Math.max(0, cash - debt);
  const reserve = Math.round(free * rng.float(0.25, 0.5)); // reserva para despesas
  const budget = Math.round((free - reserve) * rng.float(0.15, 0.4));
  // nunca menor que um piso simbólico da divisão
  const floor = div === 4 ? 30_000 : div === 3 ? 80_000 : div === 2 ? 300_000 : 800_000;
  const finalBudget = Math.max(floor, budget);

  // valor do clube: marca (reputação/títulos) + elenco + estádio + caixa - dívida
  const squadVal = Object.values(world.players)
    .filter((p) => p.clubId === club.id && p.status === 'active' && !p.arrivingUntil)
    .reduce((s, p) => s + (p.value ?? 0), 0);
  const brand = Math.round(cash * rng.float(2.5, 4.5) * (0.6 + club.reputation / 90));
  const stadiumVal = Math.round(club.stadium.capacity * (div === 1 ? 2600 : div === 2 ? 1800 : div === 3 ? 1300 : 900));
  const clubValue = Math.max(500_000, squadVal * 1.4 + brand + stadiumVal + Math.max(0, cash - debt));

  club.balance = cash;
  club.budget = finalBudget;
  club.clubValue = clubValue;
  club.debt = debt;
  club.expectedMonthlyIncome = income;
  club.expectedMonthlyExpenses = expense;
}

// ------------------------------------------------------------
// Objetivos da diretoria
// ------------------------------------------------------------

/**
 * Gera objetivos compatíveis com a divisão e a força do clube.
 * NUNCA gera continental/título para divisões que não disputam isso.
 */
export function generateBoardObjectives(world: World, club: Club, seed: string): ClubObjective[] {
  const div = divisionOf(club);
  const range = divisionRepRange(world, div);
  const size = clubSize(club, range);
  const rng = new RNG(hashString(seed) ^ hashString(club.id + ':obj'));
  const out: ClubObjective[] = [];
  const add = (text: string, weight: number, kind: ClubObjective['kind']) => {
    out.push({ text, weight, kind, status: 'pending' });
  };

  // força relativa dentro da divisão (para calibrar os objetivos)
  const squad = Object.values(world.players).filter((p) => p.clubId === club.id && p.status === 'active' && !p.arrivingUntil);
  const avgOv = squad.length > 0 ? squad.reduce((s, p) => s + overallOf(p), 0) / squad.length : 50;
  const isStrong = size >= 4 || avgOv >= 72;
  const isWeak = size <= 1 || avgOv <= 55;
  const mid = !isStrong && !isWeak;

  // Copa do Brasil: objetivo compatível com divisão
  const cupGoal = (() => {
    if (div === 1) {
      if (isStrong) add('Chegar às fases finais da Copa do Brasil', 7, 'cup-run');
      else add('Avançar na Copa do Brasil', 5, 'cup-run');
    } else if (div === 2) {
      if (isStrong) add('Chegar longe na Copa do Brasil', 6, 'cup-run');
      else add('Fazer boa campanha na Copa do Brasil', 4, 'cup-run');
    } else if (div === 3) {
      if (isStrong) add('Chegar à 3ª fase da Copa do Brasil', 5, 'cup-run');
      else add('Conseguir uma boa campanha na Copa do Brasil', 3, 'cup-run');
    } else {
      if (isStrong) add('Chegar à 3ª ou 4ª fase da Copa do Brasil', 5, 'cup-run');
      else add('Fazer boa campanha na Copa do Brasil', 3, 'cup-run');
    }
  })();

  // Liga — objetivo principal por divisão/tamanho
  const leagueGoal = (() => {
    if (div === 1) {
      if (isStrong) { add('Disputar o título do Brasileirão', 10, 'trophy'); add('Classificar para a Libertadores', 8, 'continental'); }
      else if (mid) { add('Classificar para competição continental', 8, 'continental'); add('Terminar na primeira metade da tabela', 6, 'league'); }
      else { add('Permanecer na Série A', 9, 'avoid-relegation'); add('Terminar na metade da tabela', 5, 'mid-table'); }
    } else if (div === 2) {
      if (isStrong) { add('Conquistar o acesso à Série A', 9, 'promotion'); add('Terminar entre os primeiros', 7, 'league'); }
      else if (mid) { add('Brigar pelo acesso à Série A', 8, 'promotion'); add('Terminar na metade superior da tabela', 6, 'mid-table'); }
      else { add('Evitar o rebaixamento', 9, 'avoid-relegation'); add('Permanecer na Série B', 6, 'mid-table'); }
    } else if (div === 3) {
      if (isStrong) { add('Conquistar o acesso à Série B', 9, 'promotion'); add('Chegar às fases decisivas', 6, 'league'); }
      else if (mid) { add('Brigar pelo acesso à Série B', 8, 'promotion'); add('Classificar para a próxima fase', 5, 'league'); }
      else { add('Evitar o rebaixamento', 9, 'avoid-relegation'); add('Permanecer na Série C', 5, 'mid-table'); }
    } else {
      if (isStrong) { add('Conquistar o acesso à Série C', 9, 'promotion'); add('Chegar às fases decisivas do mata-mata', 6, 'league'); }
      else if (mid) { add('Brigar pelo acesso à Série C', 8, 'promotion'); add('Disputar o acesso', 6, 'promotion'); }
      else { add('Evitar eliminação precoce no grupo', 9, 'avoid-relegation'); add('Terminar em posição competitiva no grupo', 5, 'mid-table'); }
    }
  })();

  // Secundário: finanças / jovens — mais comum em divisões baixas e clubes fracos
  if (div >= 3 || isWeak) {
    add('Equilibrar as finanças do clube', rng.int(3, 5), 'finances');
    if (rng.chance(0.6)) add('Desenvolver jovens da base', rng.int(2, 4), 'develop-youth');
  } else if (rng.chance(0.35)) {
    add('Desenvolver jovens da base', rng.int(2, 3), 'develop-youth');
  }

  // variação: às vezes um objetivo extra de desempenho
  if (rng.chance(0.4)) {
    add('Manter uma boa forma ao longo da temporada', 3, 'mid-table');
  }

  // garante entre 3 e 4 objetivos, ordenados por peso decrescente
  const trimmed = out.slice(0, 4);
  return trimmed.sort((a, b) => b.weight - a.weight);
}

/** Rótulo de importância do objetivo. */
export function objectiveImportance(weight: number): { label: string; cls: string } {
  if (weight >= 8) return { label: '🔴 PRINCIPAL', cls: 'bg-red-500/10 text-red-400 border-red-500/30' };
  if (weight >= 5) return { label: '🟡 IMPORTANTE', cls: 'bg-gold/10 text-gold border-gold/30' };
  return { label: '⚪ SECUNDÁRIO', cls: 'bg-surface-700/50 text-slate-300 border-surface-600' };
}
