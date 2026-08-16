import { World, Player, Career, TrainingFocus, PlayerAttributes, InjuryType } from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { overallOf, overallAt, adjustAttr, estimateValue, estimateWage, refreshClubCaches, updatePlayerAverages } from './overall';
import { clamp } from '../lib/format';
import { addDays, ageAt } from '../lib/date';
import { addNews, notify } from './news';
import { COUNTRIES } from './names';

// ------------------------------------------------------------
// Atributos alvo por foco de treino
// ------------------------------------------------------------
const FOCUS_ATTRS: Record<TrainingFocus, (keyof PlayerAttributes)[]> = {
  'Físico': ['pace', 'acceleration', 'physical', 'stamina', 'strength'],
  'Ataque': ['finishing', 'attackPositioning', 'dribbling', 'shotPower'],
  'Defesa': ['defending', 'marking', 'tackling', 'interception', 'defPositioning'],
  'Passe': ['passing', 'vision', 'technique'],
  'Finalização': ['finishing', 'shotPower', 'attackPositioning'],
  'Posse': ['control', 'technique', 'passing'],
  'Tática': ['vision', 'technique', 'balance'],
  'Recuperação': [],
};

const ATTR_LABELS: Record<keyof PlayerAttributes, string> = {
  pace: 'Velocidade', acceleration: 'Aceleração', finishing: 'Finalização',
  shotPower: 'Chute', passing: 'Passe', vision: 'Visão', dribbling: 'Drible',
  control: 'Controle', defending: 'Defesa', physical: 'Físico', stamina: 'Resistência',
  strength: 'Força', agility: 'Agilidade', balance: 'Equilíbrio', reflexes: 'Reflexos',
  handling: 'Defesa (gol)', gkPositioning: 'Posicionamento', rushing: 'Saída do gol',
  kicking: 'Jogo com os pés', marking: 'Marcação', tackling: 'Desarme',
  interception: 'Interceptação', defPositioning: 'Posicionamento', heading: 'Cabeceio',
  technique: 'Técnica', attackPositioning: 'Posicionamento (ataque)',
};

export function trainingLabel(a: keyof PlayerAttributes): string {
  return ATTR_LABELS[a] ?? a;
}

// ------------------------------------------------------------
// Evolução semanal
// ------------------------------------------------------------
export interface DevReport {
  playerId: string;
  name: string;
  attr: keyof PlayerAttributes;
  delta: number;
  age: number;
  clubId: string;
}

export function weeklyDevelopmentTick(
  world: World,
  trainingFocus: TrainingFocus,
  userClubId: string | null,
  difficulty: number, // devSpeed
): DevReport[] {
  const rng = new RNG(hashString(world.seed) ^ hashString(world.date + 'dev'));
  const reports: DevReport[] = [];
  const focusAttrs = FOCUS_ATTRS[trainingFocus];

  for (const p of Object.values(world.players)) {
    if (p.status !== 'active') continue;
    const club = p.clubId ? world.clubs[p.clubId] : null;
    const facilities = club?.facilities.training ?? 40;
    const coachDev = club?.coach.development ?? 45;
    const isUserClub = p.clubId === userClubId;

    // recuperação de condição
    const recFocus = trainingFocus === 'Recuperação' ? 1.6 : 1;
    p.condition = clamp(p.condition + (5 + facilities / 18) * recFocus, 1, 100);
    p.fatigue = clamp(p.fatigue - (6 + facilities / 25), 0, 100);

    // forma decai lentamente para a média
    p.form = p.form + (62 - p.form) * 0.02;
    p.form = clamp(p.form, 1, 99);

    // lesão: tratamento
    if (p.injury) {
      if (p.injury.recoveryDate <= world.date) {
        p.injury = null;
        p.condition = clamp(p.condition + 15, 1, 100);
      }
      continue;
    }

    // declínio de veteranos
    if (p.age >= 31) {
      const declineRate = 0.06 + (p.age - 31) * 0.02;
      if (rng.chance(declineRate)) {
        const attr = rng.pick(Object.keys(p.attrs) as (keyof PlayerAttributes)[]);
        adjustAttr(p.attrs, attr, -1);
        p.devTrend = clamp(p.devTrend - 1, -3, 3);
        if (isUserClub) {
          reports.push({ playerId: p.id, name: `${p.firstName} ${p.lastName}`, attr, delta: -1, age: p.age, clubId: p.clubId ?? '' });
        }
      }
      p.morale = clamp(p.morale - 0.15, 1, 100);
      continue;
    }

    if (p.age > 35) continue;

    // desenvolvimento
    const gap = p.potential - overallOf(p);
    if (gap <= 0) continue;
    const ageFactor = p.age <= 18 ? 1.6 : p.age <= 21 ? 1.25 : p.age <= 24 ? 0.9 : p.age <= 28 ? 0.5 : 0.2;
    const minutesFactor = clamp(p.seasonStats.minutes / 1500, 0.3, 1.4);
    const personalityFactor = p.personality === 'Profissional' ? 1.35 : p.personality === 'Trabalhador' ? 1.25 : p.personality === 'Jovem promessa' ? 1.2 : p.personality === 'Temperamental' ? 0.75 : p.personality === 'Inconsistente' ? 0.7 : 1;
    const moraleFactor = 0.7 + p.morale / 200;
    const base = 0.14 * gap * ageFactor * minutesFactor * personalityFactor * moraleFactor * (facilities / 70) * (coachDev / 60) * difficulty;

    const gain = rng.next() < base ? 1 : 0;
    if (gain === 0) continue;

    // escolhe atributo: prioriza foco do treino
    let attr: keyof PlayerAttributes;
    if (focusAttrs.length > 0 && rng.chance(0.55)) {
      attr = rng.pick(focusAttrs);
    } else {
      const groupPool: (keyof PlayerAttributes)[] =
        p.position === 'GK'
          ? ['reflexes', 'handling', 'gkPositioning', 'rushing', 'kicking']
          : p.position === 'CB' || p.position === 'LB' || p.position === 'RB'
            ? ['marking', 'tackling', 'interception', 'defPositioning', 'heading']
            : p.position === 'ST' || p.position === 'CF' || p.position === 'LW' || p.position === 'RW'
              ? ['finishing', 'attackPositioning', 'dribbling', 'pace', 'shotPower']
              : ['passing', 'vision', 'technique', 'control', 'stamina'];
      attr = rng.pick(groupPool);
    }

    const cap = Math.min(p.potential + 5, 99);
    const cur = p.attrs[attr];
    if (cur >= cap) continue;

    adjustAttr(p.attrs, attr, 1);
    p.devTrend = clamp(p.devTrend + 1, -3, 3);
    p.value = estimateValue(overallOf(p), p.age, p.potential, p.reputation, 1);
    if (isUserClub) {
      reports.push({ playerId: p.id, name: `${p.firstName} ${p.lastName}`, attr, delta: 1, age: p.age, clubId: p.clubId ?? '' });
    }
  }

  return reports;
}

// ------------------------------------------------------------
// Evolução de fim de temporada (mais significativa)
// ------------------------------------------------------------
export function seasonalDevelopment(world: World, difficulty: number): void {
  const rng = new RNG(hashString(world.seed) ^ hashString(world.season + 'seasonal'));
  for (const p of Object.values(world.players)) {
    if (p.status !== 'active') continue;
    const club = p.clubId ? world.clubs[p.clubId] : null;
    const facilities = club?.facilities.training ?? 40;
    const gap = p.potential - overallOf(p);
    if (p.age <= 29 && gap > 0) {
      const ageFactor = p.age <= 18 ? 2.2 : p.age <= 21 ? 1.5 : p.age <= 24 ? 1.0 : 0.6;
      const minutesFactor = clamp(p.seasonStats.minutes / 1800, 0.4, 1.5);
      const personalityFactor = p.personality === 'Profissional' ? 1.4 : p.personality === 'Trabalhador' ? 1.25 : p.personality === 'Temperamental' ? 0.7 : 1;
      const steps = Math.round(rng.gaussian(0.4 * gap * ageFactor * minutesFactor * personalityFactor * (facilities / 75) * difficulty, 0.8));
      for (let i = 0; i < Math.max(0, steps); i++) {
        const keys = Object.keys(p.attrs) as (keyof PlayerAttributes)[];
        adjustAttr(p.attrs, rng.pick(keys), 1);
      }
      if (steps > 2) p.devTrend = 2;
    } else if (p.age >= 31) {
      const decline = Math.round(rng.gaussian(1 + (p.age - 31) * 0.4, 0.6));
      for (let i = 0; i < decline; i++) {
        const keys = Object.keys(p.attrs) as (keyof PlayerAttributes)[];
        adjustAttr(p.attrs, rng.pick(keys), -1);
      }
      if (decline > 0) p.devTrend = -1;
    }
    p.value = estimateValue(overallOf(p), p.age, p.potential, p.reputation, 1);
  }
}

// ------------------------------------------------------------
// Envelhecimento
// ------------------------------------------------------------
export function agePlayers(world: World, newSeasonStart: string): void {
  for (const p of Object.values(world.players)) {
    p.age = ageAt(p.birthDate, newSeasonStart);
  }
}

// ------------------------------------------------------------
// Aposentadorias
// ------------------------------------------------------------
export function processRetirements(world: World): { name: string; clubName: string; age: number }[] {
  const rng = new RNG(hashString(world.seed) ^ hashString(world.season + 'retire'));
  const retired: { name: string; clubName: string; age: number }[] = [];
  for (const p of Object.values(world.players)) {
    if (p.status !== 'active') continue;
    const ov = overallOf(p);
    const prob =
      p.age >= 38 ? 0.85 :
      p.age >= 36 ? 0.5 :
      p.age >= 34 ? 0.22 + (65 - ov) * 0.01 :
      p.age >= 32 ? (70 - ov) * 0.006 :
      0;
    if (rng.chance(clamp(prob, 0, 0.95))) {
      const formerClub = p.clubId ? world.clubs[p.clubId] : null;
      p.status = 'retired';
      retired.push({ name: `${p.firstName} ${p.lastName}`, clubName: formerClub?.name ?? '—', age: p.age });
      p.clubId = null;
      p.contract = null;
      if (formerClub) refreshClubCaches(formerClub, Object.values(world.players).filter((x) => x.clubId === formerClub.id && x.status === 'active'));
    }
  }
  return retired;
}

// ------------------------------------------------------------
// Categorias de base (jovens promessas)
// ------------------------------------------------------------
let youthCounter = 0;

/** Número de jovens revelados por temporada conforme o nível da academia. */
export function youthIntakeSize(facilitiesYouth: number, rng: RNG): number {
  if (facilitiesYouth >= 80) return rng.int(2, 4);
  if (facilitiesYouth >= 55) return rng.int(1, 3);
  if (facilitiesYouth >= 30) return rng.chance(0.7) ? 1 : 0;
  return rng.chance(0.4) ? 1 : 0;
}

/** Custo para elevar a academia em `levels` pontos (escala com nível e porte do clube). */
export function youthUpgradeCost(facilities: { youth: number }, tier: string, levels: number): number {
  const tierMul = tier === 'Gigante' ? 1.6 : tier === 'Grande' ? 1.2 : tier === 'Médio' ? 0.9 : tier === 'Pequeno' ? 0.6 : 0.35;
  let cost = 0;
  for (let i = 0; i < levels; i++) {
    const lvl = Math.min(facilities.youth + i, 99);
    cost += Math.round(150_000 * (1 + lvl * 0.045) * tierMul);
  }
  return cost;
}

/** Investe na academia. Retorna o valor gasto (0 se não pode pagar). */
export function investInYouthFacility(world: World, clubId: string, levels: number): number {
  const club = world.clubs[clubId];
  if (!club) return 0;
  const cost = youthUpgradeCost(club.facilities, club.tier, levels);
  if (club.balance < cost || club.facilities.youth >= 100) return 0;
  club.balance -= cost;
  club.financeAccum.expenses += cost;
  club.facilities.youth = clamp(club.facilities.youth + levels, 1, 100);
  return cost;
}

/** Promove um jovem da base ao elenco profissional. */
export function promoteYouthPlayer(world: World, career: Career | null, playerId: string): boolean {
  for (const clubId of Object.keys(world.youth)) {
    const pool = world.youth[clubId];
    const idx = pool.findIndex((p) => p.id === playerId);
    if (idx === -1) continue;
    const [p] = pool.splice(idx, 1);
    if (pool.length === 0) delete world.youth[clubId];

    const squad = Object.values(world.players).filter((x) => x.clubId === clubId && x.status === 'active');
    const used = new Set(squad.map((x) => x.squadNumber));
    let num = 30 + Math.floor(Math.random() * 30);
    while (used.has(num)) num = 30 + Math.floor(Math.random() * 30);
    p.squadNumber = num;
    p.morale = 78;
    p.condition = 96;
    p.fatigue = 4;
    updatePlayerAverages(p, world.date);
    world.players[p.id] = p;

    const club = world.clubs[clubId];
    if (club) {
      refreshClubCaches(club, [...squad, p]);
      addNews(world, {
        date: world.date,
        title: `⭐ ${p.firstName} ${p.lastName} é promovido à equipe principal`,
        subtitle: `${club.name} integra o jovem de ${p.age} anos ao elenco profissional.`,
        category: 'Clubes',
        clubId,
        playerId: p.id,
        importance: 50,
      });
    }
    if (career && clubId === career.clubId) {
      career.flags.youthPromoted++;
      notify(career, `${p.firstName} ${p.lastName} foi promovido da base!`, 'success', '⭐', `player:${p.id}`);
    }
    return true;
  }
  return false;
}

/** Dispensa um jovem da base. */
export function releaseYouthPlayer(world: World, playerId: string): boolean {
  for (const clubId of Object.keys(world.youth)) {
    const pool = world.youth[clubId];
    const idx = pool.findIndex((p) => p.id === playerId);
    if (idx === -1) continue;
    pool.splice(idx, 1);
    if (pool.length === 0) delete world.youth[clubId];
    return true;
  }
  return false;
}

/** Fim de temporada: forma os juniores mais promissores e renova a fornada. */
export function advanceYouthSeason(world: World, career: Career | null): void {
  for (const club of Object.values(world.clubs)) {
    const prev = world.youth[club.id] ?? [];
    delete world.youth[club.id];

    // promove os melhores da fornada anterior (o restante é liberado)
    const ranked = [...prev].sort((a, b) => (b.potential + overallOf(b)) - (a.potential + overallOf(a)));
    const nPromote = Math.min(2, Math.max(1, Math.floor(ranked.length / 2)));
    for (let i = 0; i < nPromote; i++) {
      const p = ranked[i];
      if (!p) break;
      if (p.potential >= club.squadStrength - 25) {
        const squad = Object.values(world.players).filter((x) => x.clubId === club.id && x.status === 'active');
        const used = new Set(squad.map((x) => x.squadNumber));
        let num = 30 + Math.floor(Math.random() * 30);
        while (used.has(num)) num = 30 + Math.floor(Math.random() * 30);
        p.squadNumber = num;
        p.morale = 78;
        p.condition = 96;
        p.fatigue = 4;
        updatePlayerAverages(p, world.date);
        world.players[p.id] = p;
        if (club.isUserControlled && career) {
          career.flags.youthPromoted++;
          notify(career, `${p.firstName} ${p.lastName} foi promovido ao elenco profissional.`, 'success', '⭐', `player:${p.id}`);
        }
      }
    }
    // promovidos entram no elenco profissional → folha salarial, força e idade
    // média do clube precisam ser recalculadas
    refreshClubCaches(club, Object.values(world.players).filter((x) => x.clubId === club.id && x.status === 'active'));

    // nova fornada da temporada
    const intake = generateYouthIntake(world, club.id);
    if (intake.length > 0) world.youth[club.id] = intake;
  }
}

export function generateYouthIntake(world: World, clubId: string): Player[] {
  const club = world.clubs[clubId];
  if (!club) return [];
  const rng = new RNG(hashString(world.seed) ^ hashString(`${clubId}|${world.season}|youth`));
  const n = youthIntakeSize(club.facilities.youth, rng);
  const out: Player[] = [];
  const countryData = COUNTRIES.find((c) => c.id === club.countryId);

  // academias melhores revelam jovens mais talentosos
  const youthQuality = 0.68 + (club.facilities.youth / 100) * 0.52;

  for (let i = 0; i < n; i++) {
    const age = rng.int(15, 18);
    const pos = rng.pick(['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'CF'] as const);
    const baseTarget = clamp(club.squadStrength * 0.62 * youthQuality + rng.gaussian(2, 5), 30, 68) - (17 - age) * 2.2;
    const potential = Math.round(clamp(baseTarget + rng.int(10, 22) * youthQuality + club.facilities.youth * 0.1, 42, 99));
    const firstName = countryData ? rng.pick(countryData.first) : 'Jovem';
    const lastName = countryData ? rng.pick(countryData.last) : 'Promessa';

    const p: Player = {
      id: `y${youthCounter++}_${Date.now()}`,
      firstName,
      lastName,
      nationality: club.countryId ? world.countries.find((c) => c.id === club.countryId)?.name ?? '—' : '—',
      birthDate: addDays(world.date, -Math.round(age * 365.25)),
      age,
      position: pos,
      secondaryPositions: [],
      foot: rng.weighted(['D', 'E', 'Ambidestro'], [60, 32, 8]) as Player['foot'],
      height: pos === 'GK' ? rng.int(182, 196) : rng.int(165, 188),
      weight: 0,
      attrs: {
        pace: 40, acceleration: 40, finishing: 40, shotPower: 40, passing: 40, vision: 40,
        dribbling: 40, control: 40, defending: 40, physical: 40, stamina: 40, strength: 40,
        agility: 40, balance: 40, reflexes: 40, handling: 40, gkPositioning: 40, rushing: 40,
        kicking: 40, marking: 40, tackling: 40, interception: 40, defPositioning: 40,
        heading: 40, technique: 40, attackPositioning: 40,
      },
      potential: Math.min(99, potential),
      value: 50_000,
      contract: {
        signedAt: world.date,
        until: `${Number(world.season.slice(0, 4)) + 3}-06-30`,
        wage: 300,
        bonus: 0,
        releaseClause: null,
      },
      clubId,
      squadNumber: 0,
      morale: 70,
      form: 55,
      condition: 95,
      fatigue: 5,
      personality: rng.weighted(['Jovem promessa', 'Profissional', 'Trabalhador', 'Ambicioso'], [40, 20, 25, 15]),
      reputation: 10,
      status: 'active',
      injury: null,
      injuryHistory: [],
      suspension: 0,
      isLoan: false,
      parentClubId: null,
      loanUntil: null,
      loanOptionFee: 0,
      loanObligationGames: 0,
      futureSellPct: 0,
      futureSellClubId: null,
      agentId: null,
      transferRequested: false,
      arrivingUntil: null,
      awards: [],
      seasonStats: { apps: 0, starts: 0, goals: 0, assists: 0, yellows: 0, reds: 0, minutes: 0, ratingSum: 0, ratingCount: 0, cleanSheets: 0, manOfMatch: 0, shots: 0, shotsOnTarget: 0, passes: 0, tackles: 0, interceptions: 0, keyPasses: 0, xg: 0, xa: 0 },
      careerStats: { apps: 0, starts: 0, goals: 0, assists: 0, yellows: 0, reds: 0, minutes: 0, ratingSum: 0, ratingCount: 0, cleanSheets: 0, manOfMatch: 0, shots: 0, shotsOnTarget: 0, passes: 0, tackles: 0, interceptions: 0, keyPasses: 0, xg: 0, xa: 0 },
      history: [],
      lastRatings: [],
      happiness: 70,
      relation: 65,
      loanListed: false,
      transferListed: false,
      devTrend: 0,
      avgRating: 6.0,
    };
    // ajusta atributos para aproximar do target
    const keys = Object.keys(p.attrs) as (keyof PlayerAttributes)[];
    for (const k of keys) {
      const base = clamp(Math.round(rng.gaussian(baseTarget, 10)), 15, 80);
      (p.attrs as unknown as Record<string, number>)[k] = base;
    }
    // overall calculado em cima dos atributos gerados
    p.weight = Math.round(p.height - 100 + rng.gaussian(2, 2));
    p.squadNumber = 30 + i + 1;
    out.push(p);
  }
  return out;
}

// ------------------------------------------------------------
// Recalcular caches após qualquer mudança grande
// ------------------------------------------------------------
export function refreshAllClubs(world: World): void {
  const byClub = new Map<string, Player[]>();
  for (const p of Object.values(world.players)) {
    if (!p.clubId) continue;
    const arr = byClub.get(p.clubId) ?? [];
    arr.push(p);
    byClub.set(p.clubId, arr);
  }
  for (const [clubId, players] of byClub) {
    const club = world.clubs[clubId];
    if (!club) continue;
    refreshClubCaches(club, players);
  }
}

export function weeklyReportNews(world: World, reports: DevReport[], userClubId: string): void {
  if (reports.length === 0) return;
  const ups = reports.filter((r) => r.delta > 0);
  const downs = reports.filter((r) => r.delta < 0);
  if (ups.length > 0) {
    const sample = ups.slice(0, 3).map((r) => `${r.name} +1 em ${trainingLabel(r.attr)}`).join(', ');
    addNews(world, {
      date: world.date,
      title: `Evolução no treino: ${sample}`,
      subtitle: ups.length > 3 ? `E mais ${ups.length - 3} jogadores evoluíram.` : 'Bom trabalho no CT.',
      category: 'Clubes',
      clubId: userClubId,
      importance: 30,
    });
  }
  if (downs.length > 0) {
    const sample = downs.slice(0, 2).map((r) => `${r.name} -1 em ${trainingLabel(r.attr)}`).join(', ');
    addNews(world, {
      date: world.date,
      title: `Queda de rendimento: ${sample}`,
      subtitle: 'Veteranos sentem o desgaste da temporada.',
      category: 'Clubes',
      clubId: userClubId,
      importance: 25,
    });
  }
}

export type { InjuryType };
