import {
  World, Match, Player, MatchEvent, MatchEventType, MatchStats, PlayerMatchStat,
  Position, PositionGroup, TeamStyle, IndividualInstruction, InjuryType,
  FORMATIONS, POSITION_GROUPS, POSITION_LABELS,
} from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { overallAt, overallOf } from './overall';
import { clamp } from '../lib/format';
import { addDays } from '../lib/date';
import { stadiumMatchDay, StadiumMatchDay, applyStadiumMatchResult } from './stadium';

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------
export interface LineupChoice {
  formation: string;
  playerIds: string[]; // ordem = slots da formação
}

export interface SimOptions {
  homeLineup?: LineupChoice;
  awayLineup?: LineupChoice;
  homeStyle?: TeamStyle;
  awayStyle?: TeamStyle;
  homeInstructions?: Record<string, IndividualInstruction>;
  awayInstructions?: Record<string, IndividualInstruction>;
  homeCoachTactical?: number;
  awayCoachTactical?: number;
  homeUserBoost?: number;  // dificuldade (bônus ao clube do usuário)
  aiQuality?: number;      // dificuldade (qualidade da IA)
  decider?: 'none' | 'extra+penalties';
  trackEvents?: boolean;
  crowd?: number;
}

export interface MatchSubstitution {
  outId: string;
  inId: string;
  minute: number;
  team: 'home' | 'away';
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  events: MatchEvent[];
  stats: MatchStats;
  playerStats: PlayerMatchStat[];
  substitutions: MatchSubstitution[];
  penaltyShootout?: { home: number; away: number };
  extraTime: boolean;
  manOfMatch: string | null;
  winner: 'home' | 'away' | 'draw';
}

const DEFAULT_STYLE: TeamStyle = {
  possession: 50, counterAttack: 40, highPress: 45, lowBlock: 40,
  widePlay: 50, throughMiddle: 50, longBalls: 35, shortBuildUp: 55,
  tempo: 50, intensity: 50, defensiveLine: 50,
};

export function defaultStyle(managerStyle?: string): TeamStyle {
  const s = { ...DEFAULT_STYLE };
  switch (managerStyle) {
    case 'Ofensivo': s.possession = 60; s.tempo = 62; s.defensiveLine = 58; s.highPress = 55; break;
    case 'Defensivo': s.lowBlock = 70; s.defensiveLine = 28; s.possession = 40; s.tempo = 38; break;
    case 'Pressing alto': s.highPress = 80; s.defensiveLine = 70; s.intensity = 70; s.tempo = 62; break;
    case 'Contra-ataque': s.counterAttack = 75; s.lowBlock = 55; s.longBalls = 60; s.possession = 38; break;
    case 'Posse de bola': s.possession = 78; s.shortBuildUp = 80; s.tempo = 55; break;
    default: break;
  }
  return s;
}

// ------------------------------------------------------------
// Seleção de escalação
// ------------------------------------------------------------
export function positionFit(player: Player, slotPos: Position): number {
  if (player.position === slotPos) return 100;
  if (player.secondaryPositions.includes(slotPos)) return 80;
  if (slotPos !== 'GK' && POSITION_GROUPS[player.position] === POSITION_GROUPS[slotPos]) return 55;
  return 20;
}

function availableFor(clubPlayers: Player[], date: string): Player[] {
  return clubPlayers.filter(
    (p) => p.status === 'active' && !p.arrivingUntil && !p.injury && p.suspension <= 0 && p.condition >= 30,
  );
}

/** Melhor escalação possível para uma formação. */
export function pickBestLineup(
  players: Player[],
  formation: string,
  rng: RNG,
  date: string,
): LineupChoice {
  const slots = FORMATIONS[formation];
  const avail = availableFor(players, date);
  const used = new Set<string>();
  const picks: string[] = [];

  for (const slot of slots) {
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of avail) {
      if (used.has(p.id)) continue;
      const fit = positionFit(p, slot.position);
      const score = overallAt(p, slot.position) + (fit === 100 ? 3 : fit === 80 ? 2 : fit === 55 ? 1 : -4) + p.condition / 30;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (!best) {
      // qualquer jogador disponível
      for (const p of avail) {
        if (!used.has(p.id)) {
          best = p;
          break;
        }
      }
    }
    if (best) {
      used.add(best.id);
      picks.push(best.id);
    } else {
      picks.push('');
    }
  }

  if (picks.some((p) => p === '')) {
    // tenta outra formação
    return { formation, playerIds: picks };
  }
  return { formation, playerIds: picks };
}

/** Preenche a escalação do usuário a partir do setup salvo, cobrindo lacunas. */
export function fillUserLineup(
  clubPlayers: Player[],
  formation: string,
  slotsMap: Record<string, string>,
  date: string,
): LineupChoice {
  const slots = FORMATIONS[formation];
  const avail = availableFor(clubPlayers, date);
  const used = new Set<string>();
  const picks: string[] = [];

  for (const slot of slots) {
    const preferred = slotsMap[slot.id];
    let chosen: Player | null = null;
    if (preferred) {
      const p = clubPlayers.find((x) => x.id === preferred);
      if (p && !used.has(p.id) && p.status === 'active' && !p.injury && p.suspension <= 0 && p.condition >= 30) {
        chosen = p;
      }
    }
    if (!chosen) {
      let best: Player | null = null;
      let bestScore = -Infinity;
      for (const p of avail) {
        if (used.has(p.id)) continue;
        const fit = positionFit(p, slot.position);
        const score = overallAt(p, slot.position) + (fit === 100 ? 3 : fit === 80 ? 2 : fit === 55 ? 1 : -4) + p.condition / 30;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      chosen = best;
    }
    if (chosen) {
      used.add(chosen.id);
      picks.push(chosen.id);
    } else {
      picks.push('');
    }
  }
  return { formation, playerIds: picks };
}

/** Escolhe uma formação para um clube da IA. */
export function pickAILineup(
  players: Player[],
  rng: RNG,
  date: string,
  coachTactical: number,
): LineupChoice {
  const formations = Object.keys(FORMATIONS);
  const shuffled = rng.shuffle(formations);
  // treinadores melhores escolhem formações mais balanceadas; tentamos preencher
  for (const f of shuffled) {
    const attempt = pickBestLineup(players, f, rng, date);
    if (!attempt.playerIds.some((p) => p === '')) {
      void coachTactical;
      return attempt;
    }
  }
  return pickBestLineup(players, formations[0], rng, date);
}

// ------------------------------------------------------------
// Força do time
// ------------------------------------------------------------
interface TeamPower {
  strength: number;
  possessionFactor: number;
  style: TeamStyle;
}

function computeTeamPower(
  world: World,
  clubId: string,
  lineup: LineupChoice,
  side: 'home' | 'away',
  opts: SimOptions,
): TeamPower {
  const club = world.clubs[clubId];
  const style = (side === 'home' ? opts.homeStyle : opts.awayStyle) ?? defaultStyle();
  const coachTactical = side === 'home' ? (opts.homeCoachTactical ?? club.coach.tactical) : (opts.awayCoachTactical ?? club.coach.tactical);

  const players: Player[] = [];
  for (const pid of lineup.playerIds) {
    const p = world.players[pid];
    if (p) players.push(p);
  }
  if (players.length === 0) return { strength: 50, possessionFactor: 0, style };

  let total = 0;
  let condSum = 0;
  let moraleSum = 0;
  let formSum = 0;
  let fatigueSum = 0;
  for (const p of players) {
    total += overallOf(p);
    condSum += p.condition;
    moraleSum += p.morale;
    formSum += p.form;
    fatigueSum += p.fatigue;
  }
  const n = players.length;
  let strength = total / n;

  // condição física (0-100) → até ±2.5
  strength += (condSum / n - 85) * 0.1;
  // moral → até ±1.5
  strength += (moraleSum / n - 65) * 0.045;
  // forma → até ±1
  strength += (formSum / n - 62) * 0.03;
  // fadiga → até -1.5
  strength -= Math.max(0, fatigueSum / n - 20) * 0.03;
  // treinador
  strength += (coachTactical - 50) * 0.03;
  // mando de campo
  if (side === 'home') strength += 1.1;
  // dificuldade
  if (opts.homeUserBoost !== undefined && side === 'home') strength += opts.homeUserBoost;
  if (opts.aiQuality !== undefined && side === 'away') strength *= opts.aiQuality;
  if (opts.aiQuality !== undefined && side === 'home') strength *= opts.aiQuality;

  // estilo → pequenos ajustes
  strength += (style.tempo - 50) * 0.008 + (style.intensity - 50) * 0.006;

  // posse
  let possessionFactor = 0;
  const otherStyle = (side === 'home' ? opts.awayStyle : opts.homeStyle) ?? defaultStyle();
  possessionFactor += (style.possession - otherStyle.possession) * 0.18;
  possessionFactor += (otherStyle.highPress - style.highPress) * 0.06;
  possessionFactor += (style.shortBuildUp - otherStyle.shortBuildUp) * 0.08;
  possessionFactor -= (style.counterAttack - otherStyle.counterAttack) * 0.12;

  return { strength, possessionFactor, style };
}

// ------------------------------------------------------------
// Distribuição de estatísticas por posição
// ------------------------------------------------------------
function weightsFor(p: Player): Record<string, number> {
  const g = POSITION_GROUPS[p.position];
  if (g === 'GK') return { saves: 1 };
  if (g === 'DEF') return { tackles: 1, passes: 0.5, fouls: 0.4 };
  if (g === 'MID') return { passes: 1, tackles: 0.5, shots: 0.5, fouls: 0.35 };
  return { shots: 1, passes: 0.5, dribbles: 0.6, fouls: 0.15 };
}

function distribute(total: number, weights: number[]): number[] {
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((total * w) / wsum));
  let rem = total - out.reduce((a, b) => a + b, 0);
  let i = 0;
  while (rem > 0) {
    out[i % out.length]++;
    rem--;
    i++;
  }
  return out;
}

// ------------------------------------------------------------
// Motor principal
// ------------------------------------------------------------
export function simulateMatch(world: World, match: Match, opts: SimOptions = {}): MatchResult {
  const rng = new RNG(hashString(world.seed) ^ hashString(`${match.competitionId}|${match.id}|${match.date}`));
  const track = opts.trackEvents ?? false;

  const homeClub = world.clubs[match.homeId];
  const awayClub = world.clubs[match.awayId];
  const homePlayers = Object.values(world.players).filter((p) => p.clubId === match.homeId);
  const awayPlayers = Object.values(world.players).filter((p) => p.clubId === match.awayId);

  const homeLineup = opts.homeLineup ?? pickAILineup(homePlayers, rng, match.date, homeClub.coach.tactical);
  const awayLineup = opts.awayLineup ?? pickAILineup(awayPlayers, rng, match.date, awayClub.coach.tactical);

  const homePower = computeTeamPower(world, match.homeId, homeLineup, 'home', opts);
  const awayPower = computeTeamPower(world, match.awayId, awayLineup, 'away', opts);

  // atmosfera do estádio dá um leve fator casa (torcida empurra o time)
  const homeAtmo = homeClub.stadium.atmosphere ?? 50;
  homePower.strength = Math.round(homePower.strength * (1 + (homeAtmo - 50) / 900));

  const diff = homePower.strength - awayPower.strength;
  let homeEG = 1.42 + diff * 0.085;
  let awayEG = 1.15 - diff * 0.085;

  // clima
  const weather = match.weather;
  if (weather === 'Chuva forte' || weather === 'Neve') {
    homeEG *= 0.85;
    awayEG *= 0.85;
  } else if (weather === 'Vento') {
    homeEG *= 0.95;
    awayEG *= 0.95;
  }
  // partida decisiva → mais cautela
  if (match.importance >= 80) {
    homeEG *= 0.94;
    awayEG *= 0.94;
  }
  // posse
  const possession = clamp(50 + diff * 1.2 + homePower.possessionFactor - awayPower.possessionFactor, 30, 70);
  homeEG *= possession / 50;
  awayEG *= (100 - possession) / 50;

  homeEG = clamp(homeEG, 0.18, 3.4);
  awayEG = clamp(awayEG, 0.18, 3.4);

  // ------------------------------------------------------------
  // Simulação minuto a minuto (lance a lance quando rastreado)
  // ------------------------------------------------------------
  const events: MatchEvent[] = [];
  let homeGoals = 0;
  let awayGoals = 0;

  const goalMinutesHome: number[] = [];
  const goalMinutesAway: number[] = [];
  let cornerHome = 0, cornerAway = 0, foulHome = 0, foulAway = 0;
  let yellowHome = 0, yellowAway = 0, redHome = 0, redAway = 0;
  let offHome = 0, offAway = 0;
  let shotHome = 0, shotAway = 0, sotHome = 0, sotAway = 0;
  let passHome = 0, passAway = 0, tackleHome = 0, tackleAway = 0, saveHome = 0, saveAway = 0;
  let injuryHome = false, injuryAway = false;

  const homeStarters = homeLineup.playerIds.map((id) => world.players[id]).filter((p): p is Player => !!p);
  const awayStarters = awayLineup.playerIds.map((id) => world.players[id]).filter((p): p is Player => !!p);

  const shortName = (p: Player): string => `${p.firstName[0]}. ${p.lastName}`;
  const pickWeighted = (players: Player[], weight: (p: Player) => number): Player | null => {
    const pool = players.filter((p) => p.status === 'active');
    if (pool.length === 0) return null;
    const weights = pool.map((p) => Math.max(1, weight(p)));
    return rng.weighted(pool, weights);
  };
  const pickWeightedRaw = (players: Player[], weight: (p: Player) => number): Player | null => {
    const pool = players.filter((p) => p.status === 'active');
    if (pool.length === 0) return null;
    const weights = pool.map((p) => Math.max(0.1, weight(p)));
    return rng.weighted(pool, weights);
  };
  const shootWeight = (p: Player): number =>
    p.position === 'GK' ? 0 : p.attrs.finishing * 0.5 + p.attrs.attackPositioning * 0.3 + p.attrs.pace * 0.2;
  const gkWeight = (p: Player): number => (p.position === 'GK' ? 10 : 0.01);

  // ------------------------------------------------------------
  // Disciplina: personalidade afeta faltas e cartões
  // ------------------------------------------------------------
  const disciplineFactor = (p: Player): number => {
    switch (p.personality) {
      case 'Temperamental': return 2.3;
      case 'Ambicioso': return 1.15;
      case 'Mercenário': return 1.1;
      case 'Inconsistente': return 1.1;
      case 'Veterano': return 1.05;
      case 'Leal': return 0.85;
      case 'Líder': return 0.75;
      case 'Profissional': return 0.45;
      default: return 1;
    }
  };
  const teamDiscipline = (players: Player[]): number => {
    if (players.length === 0) return 1;
    let s = 0;
    for (const p of players) s += disciplineFactor(p);
    return clamp(s / players.length, 0.5, 1.8);
  };
  const homeDisc = teamDiscipline(homeStarters);
  const awayDisc = teamDiscipline(awayStarters);

  // ------------------------------------------------------------
  // Energia, reservas e substituições
  // ------------------------------------------------------------
  const staminaOf = (p: Player): number => playerEnergy(p);

  const homeOnPitch = [...homeStarters];
  const awayOnPitch = [...awayStarters];
  const homeBench = homePlayers.filter((p) => !homeLineup.playerIds.includes(p.id) && p.status === 'active' && !p.injury && p.suspension <= 0 && p.condition >= 50);
  const awayBench = awayPlayers.filter((p) => !awayLineup.playerIds.includes(p.id) && p.status === 'active' && !p.injury && p.suspension <= 0 && p.condition >= 50);

  const homeStamina = new Map<string, number>();
  const awayStamina = new Map<string, number>();
  for (const p of homeStarters) homeStamina.set(p.id, staminaOf(p));
  for (const p of awayStarters) awayStamina.set(p.id, staminaOf(p));

  const homeSubs: { outId: string; inId: string; minute: number }[] = [];
  const awaySubs: { outId: string; inId: string; minute: number }[] = [];
  const homeSubbedOut = new Set<string>();
  const awaySubbedOut = new Set<string>();
  const homeSubbedIn = new Set<string>();
  const awaySubbedIn = new Set<string>();
  const homeYellows = new Set<string>();
  const awayYellows = new Set<string>();
  const homeExpelledAt = new Map<string, number>();
  const awayExpelledAt = new Map<string, number>();
  const homeIntensity = opts.homeStyle?.intensity ?? 50;
  const awayIntensity = opts.awayStyle?.intensity ?? 50;

  /** Tenta uma substituição: por fadiga (a partir do 2º tempo) ou forçada por lesão. */
  const doSubstitution = (side: 'home' | 'away', minute: number, forcedId?: string): boolean => {
    const onPitch = side === 'home' ? homeOnPitch : awayOnPitch;
    const staminaMap = side === 'home' ? homeStamina : awayStamina;
    const subsArr = side === 'home' ? homeSubs : awaySubs;
    const bench = side === 'home' ? homeBench : awayBench;
    const subbedOut = side === 'home' ? homeSubbedOut : awaySubbedOut;
    const subbedIn = side === 'home' ? homeSubbedIn : awaySubbedIn;
    if (subsArr.length >= 3) return false;
    const lastSub = subsArr[subsArr.length - 1];
    if (lastSub && minute - lastSub.minute < 10) return false;

    let out = forcedId ? onPitch.find((p) => p.id === forcedId) : null;
    if (!out) {
      if (minute < 55) return false;
      const candidates = onPitch.filter((p) => p.position !== 'GK' && !subbedOut.has(p.id));
      if (candidates.length < 2) return false;
      let weakest = candidates[0];
      for (const p of candidates) {
        if ((staminaMap.get(p.id) ?? 100) < (staminaMap.get(weakest.id) ?? 100)) weakest = p;
      }
      if ((staminaMap.get(weakest.id) ?? 100) > 34) return false;
      out = weakest;
    }

    const posGroup = POSITION_GROUPS[out.position];
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const b of bench) {
      if (subbedIn.has(b.id)) continue;
      const fit = b.position === out.position ? 100 : b.secondaryPositions.includes(out.position) ? 80 : POSITION_GROUPS[b.position] === posGroup ? 60 : 20;
      const score = overallOf(b) + (fit === 100 ? 4 : fit === 80 ? 2 : fit === 60 ? 0 : -6) - (b.condition < 65 ? 8 : 0);
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (!best) return false;

    const idx = onPitch.indexOf(out);
    if (idx < 0) return false;
    onPitch[idx] = best;
    subbedOut.add(out.id);
    subbedIn.add(best.id);
    staminaMap.set(best.id, 86);
    subsArr.push({ outId: out.id, inId: best.id, minute });
    if (track) events.push({
      minute,
      type: 'sub',
      team: side,
      playerId: out.id,
      playerId2: best.id,
      detail: `Substituição: sai ${shortName(out)}, entra ${shortName(best)}`,
    });
    return true;
  };

  const totalMinutes = 90;
  const ph = homeEG / totalMinutes;
  const pa = awayEG / totalMinutes;

  /** Momentum realista: o placar influencia a intensidade. Quem está muito à
   *  frente joga com mais calma (controla menos chances); quem está atrás
   *  pressiona mais no fim. Evita goleadas artificiais entre times do mesmo nível. */
  const momentum = (min: number, diff: number): number => {
    if (diff >= 3) return min >= 30 ? 0.7 : 0.9;
    if (diff >= 2) return min >= 55 ? 0.84 : 1;
    if (diff <= -3) return min >= 55 ? 1.3 : 1;
    if (diff <= -2) return min >= 70 ? 1.32 : 1;
    return 1;
  };

  for (let min = 1; min <= totalMinutes; min++) {
    // energia cai a cada minuto (a intensidade do estilo acelera o desgaste)
    for (const [id, s] of homeStamina) homeStamina.set(id, s - (0.5 + homeIntensity * 0.007) * (0.8 + rng.next() * 0.5));
    for (const [id, s] of awayStamina) awayStamina.set(id, s - (0.5 + awayIntensity * 0.007) * (0.8 + rng.next() * 0.5));

    const homeMom = momentum(min, homeGoals - awayGoals);
    const awayMom = momentum(min, awayGoals - homeGoals);

    // ----- ataque da casa -----
    if (rng.chance(ph * homeMom)) {
      homeGoals++;
      goalMinutesHome.push(min);
      shotHome++; sotHome++;
    } else if (rng.chance(0.55)) {
      // tentativa de gol
      if (rng.chance(0.28)) {
        shotHome++;
        if (rng.chance(0.34)) {
          sotHome++;
          saveAway++;
          if (track) {
            const shooter = pickWeighted(homeOnPitch, shootWeight);
            if (shooter) events.push({ minute: min, type: 'shotOnTarget', team: 'home', playerId: shooter.id, detail: `Finalização de ${shortName(shooter)} no alvo!` });
            const gk = pickWeighted(awayOnPitch, gkWeight);
            if (gk) events.push({ minute: min, type: 'save', team: 'away', playerId: gk.id, detail: `Grande defesa de ${shortName(gk)}!` });
          }
        } else if (track) {
          const shooter = pickWeighted(homeOnPitch, shootWeight);
          if (shooter) events.push({ minute: min, type: 'shot', team: 'home', playerId: shooter.id, detail: `Chute de ${shortName(shooter)} para fora!` });
        }
      }
      if (rng.chance(0.14)) {
        cornerHome++;
        if (track) events.push({ minute: min, type: 'corner', team: 'home', detail: 'Escanteio para o time da casa.' });
      }
    }
    // ----- ataque do visitante -----
    if (rng.chance(pa * awayMom)) {
      awayGoals++;
      goalMinutesAway.push(min);
      shotAway++; sotAway++;
    } else if (rng.chance(0.55)) {
      if (rng.chance(0.28)) {
        shotAway++;
        if (rng.chance(0.34)) {
          sotAway++;
          saveHome++;
          if (track) {
            const shooter = pickWeighted(awayOnPitch, shootWeight);
            if (shooter) events.push({ minute: min, type: 'shotOnTarget', team: 'away', playerId: shooter.id, detail: `Finalização de ${shortName(shooter)} no alvo!` });
            const gk = pickWeighted(homeOnPitch, gkWeight);
            if (gk) events.push({ minute: min, type: 'save', team: 'home', playerId: gk.id, detail: `Grande defesa de ${shortName(gk)}!` });
          }
        } else if (track) {
          const shooter = pickWeighted(awayOnPitch, shootWeight);
          if (shooter) events.push({ minute: min, type: 'shot', team: 'away', playerId: shooter.id, detail: `Chute de ${shortName(shooter)} para fora!` });
        }
      }
      if (rng.chance(0.14)) {
        cornerAway++;
        if (track) events.push({ minute: min, type: 'corner', team: 'away', detail: 'Escanteio para o time visitante.' });
      }
    }
    // faltas — probabilidade escalada pela disciplina média do time
    if (rng.chance(0.06 * homeDisc)) {
      foulHome++;
      if (track) {
        const p = pickWeightedRaw(homeOnPitch, disciplineFactor);
        if (p) events.push({ minute: min, type: 'foul', team: 'home', playerId: p.id, detail: `Falta de ${shortName(p)}.` });
      }
    }
    if (rng.chance(0.06 * awayDisc)) {
      foulAway++;
      if (track) {
        const p = pickWeightedRaw(awayOnPitch, disciplineFactor);
        if (p) events.push({ minute: min, type: 'foul', team: 'away', playerId: p.id, detail: `Falta de ${shortName(p)}.` });
      }
    }
    if (rng.chance(0.004 * homeDisc)) {
      yellowHome++;
      if (track) {
        const p = pickWeightedRaw(homeOnPitch, (pp) => disciplineFactor(pp) * (homeYellows.has(pp.id) ? 3 : 1));
        if (p) {
          homeYellows.add(p.id);
          events.push({ minute: min, type: 'yellow', team: 'home', playerId: p.id, detail: `Cartão amarelo para ${shortName(p)}.` });
        }
      }
    }
    if (rng.chance(0.004 * awayDisc)) {
      yellowAway++;
      if (track) {
        const p = pickWeightedRaw(awayOnPitch, (pp) => disciplineFactor(pp) * (awayYellows.has(pp.id) ? 3 : 1));
        if (p) {
          awayYellows.add(p.id);
          events.push({ minute: min, type: 'yellow', team: 'away', playerId: p.id, detail: `Cartão amarelo para ${shortName(p)}.` });
        }
      }
    }
    // vermelho — quem já tem amarelo tem muito mais chance
    if (rng.chance(0.00055 * homeDisc)) {
      redHome++;
      if (track) {
        const p = pickWeightedRaw(homeOnPitch, (pp) => disciplineFactor(pp) * (homeYellows.has(pp.id) ? 9 : 1));
        if (p) {
          events.push({ minute: min, type: 'red', team: 'home', playerId: p.id, detail: `Expulsão de ${shortName(p)}!` });
          const idx = homeOnPitch.indexOf(p);
          if (idx >= 0) homeOnPitch.splice(idx, 1);
          homeSubbedOut.add(p.id);
          homeExpelledAt.set(p.id, min);
        }
      }
    }
    if (rng.chance(0.00055 * awayDisc)) {
      redAway++;
      if (track) {
        const p = pickWeightedRaw(awayOnPitch, (pp) => disciplineFactor(pp) * (awayYellows.has(pp.id) ? 9 : 1));
        if (p) {
          events.push({ minute: min, type: 'red', team: 'away', playerId: p.id, detail: `Expulsão de ${shortName(p)}!` });
          const idx = awayOnPitch.indexOf(p);
          if (idx >= 0) awayOnPitch.splice(idx, 1);
          awaySubbedOut.add(p.id);
          awayExpelledAt.set(p.id, min);
        }
      }
    }
    if (rng.chance(0.002)) {
      offHome++;
      if (track) {
        const p = pickWeighted(homeOnPitch, () => 1);
        if (p) events.push({ minute: min, type: 'offside', team: 'home', playerId: p.id, detail: `Impedimento de ${shortName(p)}.` });
      }
    }
    if (rng.chance(0.002)) {
      offAway++;
      if (track) {
        const p = pickWeighted(awayOnPitch, () => 1);
        if (p) events.push({ minute: min, type: 'offside', team: 'away', playerId: p.id, detail: `Impedimento de ${shortName(p)}.` });
      }
    }
    if (rng.chance(0.09)) passHome++;
    if (rng.chance(0.09)) passAway++;
    if (rng.chance(0.05)) tackleHome++;
    if (rng.chance(0.05)) tackleAway++;
    // lesão durante a partida: forçando troca imediata
    if (rng.chance(0.0018)) {
      injuryHome = true;
      const p = pickWeighted(homeOnPitch, () => 1);
      if (track && p) events.push({ minute: min, type: 'injury', team: 'home', playerId: p.id, detail: `Lesão de ${shortName(p)}!` });
      if (p) doSubstitution('home', min, p.id);
    }
    if (rng.chance(0.0018)) {
      injuryAway = true;
      const p = pickWeighted(awayOnPitch, () => 1);
      if (track && p) events.push({ minute: min, type: 'injury', team: 'away', playerId: p.id, detail: `Lesão de ${shortName(p)}!` });
      if (p) doSubstitution('away', min, p.id);
    }
    // substituições por fadiga (apenas a partir do 2º tempo)
    doSubstitution('home', min);
    doSubstitution('away', min);
  }

  // ------------------------------------------------------------
  // Participantes (titulares + reservas que entraram)
  // ------------------------------------------------------------
  const homeParticipants: { p: Player; started: boolean }[] = [
    ...homeStarters.map((p) => ({ p, started: true })),
    ...homeSubs.map((s) => {
      const pp = world.players[s.inId];
      return pp ? { p: pp, started: false } : null;
    }).filter((x): x is { p: Player; started: boolean } => !!x),
  ];
  const awayParticipants: { p: Player; started: boolean }[] = [
    ...awayStarters.map((p) => ({ p, started: true })),
    ...awaySubs.map((s) => {
      const pp = world.players[s.inId];
      return pp ? { p: pp, started: false } : null;
    }).filter((x): x is { p: Player; started: boolean } => !!x),
  ];

  // stats finais realistas
  shotHome += Math.round(rng.gaussian(2.5, 1.5));
  shotAway += Math.round(rng.gaussian(2.5, 1.5));
  passHome = Math.round(passHome * 8 + possession * 6);
  passAway = Math.round(passAway * 8 + (100 - possession) * 6);

  // xG coerente com as chances reais criadas (finalização no alvo ≈ 0.32,
  // fora ≈ 0.06, gol ≈ 0.45). Assim o xG exibido nunca contradiz o placar
  // nem as finalizações — um time que marca 4 tem xG alto de verdade.
  const xgHomeFinal = Math.round((sotHome * 0.32 + (shotHome - sotHome) * 0.06 + homeGoals * 0.13) * 10) / 10;
  const xgAwayFinal = Math.round((sotAway * 0.32 + (shotAway - sotAway) * 0.06 + awayGoals * 0.13) * 10) / 10;

  // ------------------------------------------------------------
  // Prorrogação / pênaltis (copas)
  // ------------------------------------------------------------
  let extraTime = false;
  let penaltyShootout: { home: number; away: number } | undefined;
  if (opts.decider === 'extra+penalties' && homeGoals === awayGoals) {
    extraTime = true;
    const pExH = clamp(homeEG * 0.35, 0.05, 1.5);
    const pExA = clamp(awayEG * 0.35, 0.05, 1.5);
    for (let min = 91; min <= 120; min++) {
      if (rng.chance(pExH / 30)) { homeGoals++; goalMinutesHome.push(min); }
      if (rng.chance(pExA / 30)) { awayGoals++; goalMinutesAway.push(min); }
    }
    if (homeGoals === awayGoals) {
      let phs = 0, pas = 0;
      for (let i = 0; i < 5; i++) {
        if (rng.chance(0.76)) phs++;
        if (rng.chance(0.76)) pas++;
      }
      let rounds = 5;
      while (phs === pas && rounds < 12) {
        if (rng.chance(0.76)) phs++;
        if (rng.chance(0.76)) pas++;
        rounds++;
      }
      penaltyShootout = { home: phs, away: pas };
    }
  }

  // ------------------------------------------------------------
  // Eventos com jogadores (apenas quando rastreado)
  // ------------------------------------------------------------
  const attackersOf = (players: Player[]): Player[] =>
    players.filter((p) => POSITION_GROUPS[p.position] === 'ATT');
  const midsOf = (players: Player[]): Player[] =>
    players.filter((p) => POSITION_GROUPS[p.position] === 'MID');
  const gkOf = (players: Player[]): Player[] =>
    players.filter((p) => p.position === 'GK');

  const pickScorer = (players: Player[]): Player | null => {
    const pool = attackersOf(players).length > 0 ? attackersOf(players) : players;
    if (pool.length === 0) return null;
    const weights = pool.map((p) => {
      const ov = overallAt(p, p.position);
      const fin = p.position === 'GK' ? 0 : p.attrs.finishing * 0.5 + p.attrs.attackPositioning * 0.3 + p.attrs.pace * 0.2;
      return Math.max(1, fin + ov / 2 + p.form / 4);
    });
    return rng.weighted(pool, weights);
  };
  const pickAssist = (players: Player[], scorer: Player): Player | null => {
    const pool = midsOf(players).length > 0 ? midsOf(players) : players;
    const candidates = pool.filter((p) => p.id !== scorer.id);
    if (candidates.length === 0) return null;
    const weights = candidates.map((p) => Math.max(1, p.attrs.passing * 0.5 + p.attrs.vision * 0.4 + p.attrs.technique * 0.1));
    return rng.weighted(candidates, weights);
  };

  const eventMinute = (mins: number[]): number[] => {
    // adiciona minutos de acréscimo para alguns gols
    return mins;
  };

  const homeGoalMins = eventMinute(goalMinutesHome);
  const awayGoalMins = eventMinute(goalMinutesAway);

  const homeScorers: { playerId: string; goals: number }[] = [];
  const awayScorers: { playerId: string; goals: number }[] = [];
  const homePool = homeParticipants.map((x) => x.p);
  const awayPool = awayParticipants.map((x) => x.p);
  // quem foi expulso não pode marcar nem dar assistência depois do minuto da expulsão
  const eligibleForMinute = (pool: Player[], expelledAt: Map<string, number>, minute: number): Player[] =>
    pool.filter((p) => !expelledAt.has(p.id) || (expelledAt.get(p.id) ?? 999) > minute);

  if (track) {
    for (const m of homeGoalMins) {
      const scorer = pickScorer(eligibleForMinute(homePool, homeExpelledAt, m));
      if (!scorer) break;
      const assist = rng.chance(0.72) ? pickAssist(eligibleForMinute(homePool, homeExpelledAt, m), scorer) : null;
      events.push({
        minute: m,
        type: 'goal',
        team: 'home',
        playerId: scorer.id,
        playerId2: assist?.id,
      });
      const rec = homeScorers.find((s) => s.playerId === scorer.id);
      if (rec) rec.goals++;
      else homeScorers.push({ playerId: scorer.id, goals: 1 });
    }
    for (const m of awayGoalMins) {
      const scorer = pickScorer(eligibleForMinute(awayPool, awayExpelledAt, m));
      if (!scorer) break;
      const assist = rng.chance(0.72) ? pickAssist(eligibleForMinute(awayPool, awayExpelledAt, m), scorer) : null;
      events.push({
        minute: m,
        type: 'goal',
        team: 'away',
        playerId: scorer.id,
        playerId2: assist?.id,
      });
      const rec = awayScorers.find((s) => s.playerId === scorer.id);
      if (rec) rec.goals++;
      else awayScorers.push({ playerId: scorer.id, goals: 1 });
    }
    events.sort((a, b) => a.minute - b.minute);

    // narração contextual: preenche os intervalos sem lances com momentos de jogo
    // (construção, recuperação, pressão, defesa, cruzamento) em ritmo variável,
    // reagindo ao placar, ao tempo e à intensidade. Não altera o resultado.
    const activeActionMinutes = new Set(
      events.filter((e) => !['kickoff', 'whistle'].includes(e.type)).map((e) => e.minute),
    );
    const gkOfSide = (side: 'home' | 'away'): Player | null => {
      const pool = (side === 'home' ? homePool : awayPool).filter((p) => p.position === 'GK');
      return pool.length > 0 ? pool[0] : null;
    };
    let nextNarration = 4 + rng.int(0, 3);
    let narrationCount = 0;
    while (nextNarration <= 88 && narrationCount < 22) {
      if (!activeActionMinutes.has(nextNarration)) {
        const side: 'home' | 'away' = rng.chance(0.5) ? 'home' : 'away';
        const pool = side === 'home' ? homePool : awayPool;
        const p = pickWeightedRaw(pool, (x) => x.attrs.technique * 0.4 + x.attrs.passing * 0.3 + x.attrs.attackPositioning * 0.3);
        const homeGoalsN = homeGoals, awayGoalsN = awayGoals;
        const losing = side === 'home' ? homeGoalsN < awayGoalsN : awayGoalsN < homeGoalsN;
        const leading = side === 'home' ? homeGoalsN > awayGoalsN : awayGoalsN > homeGoalsN;
        const sideName = side === 'home' ? homeClub.shortName : awayClub.shortName;
        const namePart = p ? shortName(p) : 'o time';
        const roll = rng.int(0, 99);
        let type: MatchEventType = 'buildUp';
        let detail = '';
        if (nextNarration >= 78 && leading) {
          type = 'timeWasting';
          detail = `${namePart} segura a bola no campo de defesa para gastar tempo.`;
        } else if (losing && nextNarration >= 62) {
          type = 'pressure';
          detail = `${sideName} aumenta a pressão em busca de reação no placar.`;
        } else if (roll < 28) {
          type = 'buildUp';
          detail = `${sideName} tenta construir pelo ${roll < 14 ? 'lado direito' : 'lado esquerdo'} com ${namePart}.`;
        } else if (roll < 52) {
          type = 'recovery';
          detail = `${namePart} recupera a bola no meio-campo e inicia a transição.`;
        } else if (roll < 72) {
          type = 'pressure';
          detail = `${sideName} pressiona a saída de bola do adversário.`;
        } else if (roll < 88) {
          const gk = gkOfSide(side === 'home' ? 'away' : 'home');
          type = 'save';
          detail = gk ? `Defesa segura de ${shortName(gk)}!` : `${sideName} chega com perigo à área.`;
        } else {
          type = 'cross';
          detail = `${namePart} cruza na área, mas a defesa afasta.`;
        }
        events.push({ minute: nextNarration, team: side, type, detail });
        narrationCount++;
      }
      nextNarration += 4 + rng.int(0, 7); // intervalos variáveis (4-11 min)
    }
    // reação da torcida em campo: torcida satisfeita empurra, insatisfeita vaia
    const stHome = homeClub.stadium;
    if (stHome.satisfaction >= 75) {
      events.push({ minute: 14 + rng.int(0, 8), team: 'home', type: 'crowd', detail: '🗣️ A torcida canta sem parar e empurra o time da casa!' });
      events.push({ minute: 58 + rng.int(0, 10), team: 'home', type: 'crowd', detail: '🔥 O estádio inteiro apoiando — pressão enorme sobre o visitante.' });
    } else if (stHome.protest >= 55 || stHome.satisfaction < 35) {
      events.push({ minute: 22 + rng.int(0, 8), team: 'home', type: 'crowd', detail: '📢 Parte do estádio começa a vaiar a diretoria.' });
      if (stHome.protest >= 72) events.push({ minute: 62 + rng.int(0, 10), team: 'home', type: 'crowd', detail: '😡 Torcedores protestam contra a política de ingressos.' });
    }
    events.sort((a, b) => a.minute - b.minute);
    if (extraTime) events.push({ minute: 90, type: 'whistle', team: 'home' });
    if (penaltyShootout) events.push({ minute: 120, type: 'whistle', team: 'home', detail: `Pênaltis ${penaltyShootout.home}-${penaltyShootout.away}` });
  }

  // ------------------------------------------------------------
  // Notas e estatísticas individuais
  // ------------------------------------------------------------
  const playerStats: PlayerMatchStat[] = [];

  const fullMinutes = 90 + (extraTime ? 30 : 0);
  const buildPlayerStats = (
    participants: { p: Player; started: boolean }[],
    teamGoals: number,
    goalsAgainst: number,
    side: 'home' | 'away',
    shotsTeam: number,
    passesTeam: number,
    tacklesTeam: number,
    foulsTeam: number,
    savesTeam: number,
    cleanSheet: boolean,
  ): void => {
    const goalIds = new Set((side === 'home' ? homeScorers : awayScorers).map((s) => s.playerId));
    const assistIds = new Set(
      events.filter((e) => e.type === 'goal' && e.team === side && e.playerId2).map((e) => e.playerId2!),
    );

    const subsArr = side === 'home' ? homeSubs : awaySubs;
    const subOutMin = new Map<string, number>();
    const subInMin = new Map<string, number>();
    for (const s of subsArr) {
      subOutMin.set(s.outId, s.minute);
      subInMin.set(s.inId, s.minute);
    }
    const minutesOf = (p: Player, started: boolean): number => {
      if (started) return Math.min(subOutMin.get(p.id) ?? fullMinutes, fullMinutes);
      return Math.max(0, fullMinutes - (subInMin.get(p.id) ?? fullMinutes));
    };

    const minutesList = participants.map(({ p, started }) => minutesOf(p, started));
    const mf = (i: number) => clamp(minutesList[i] / fullMinutes, 0.15, 1); // fator de minutos

    const shotsW = participants.map(({ p }, i) => (weightsFor(p).shots ?? 0) * mf(i));
    const passesW = participants.map(({ p }, i) => (weightsFor(p).passes ?? 0) * mf(i));
    const tacklesW = participants.map(({ p }, i) => (weightsFor(p).tackles ?? 0) * mf(i));
    const foulsW = participants.map(({ p }, i) => (weightsFor(p).fouls ?? 0) * mf(i));
    const interW = participants.map(({ p }, i) => (weightsFor(p).tackles ?? 0) * 0.55 * mf(i));

    const shotsDist = distribute(shotsTeam, shotsW.map((w) => w + 0.01));
    const passesDist = distribute(passesTeam, passesW.map((w) => w + 0.01));
    const tacklesDist = distribute(tacklesTeam, tacklesW.map((w) => w + 0.01));
    const foulsDist = distribute(foulsTeam, foulsW.map((w) => w + 0.01));
    const interDist = distribute(Math.max(2, Math.round(tacklesTeam * 0.35)), interW.map((w) => w + 0.01));

    // xG/xA individuais derivados das estatísticas reais da partida
    const teamXG = side === 'home' ? xgHomeFinal : xgAwayFinal;
    const totalShots = Math.max(1, shotsDist.reduce((a, b) => a + b, 0));
    const totalKP = Math.max(1, passesDist.reduce((a, b) => a + b, 0) * 0.05);

    participants.forEach(({ p, started }, i) => {
      const minutes = minutesList[i];
      const goals = goalIds.has(p.id) ? (side === 'home' ? homeScorers.find((s) => s.playerId === p.id)?.goals : awayScorers.find((s) => s.playerId === p.id)?.goals) ?? 0 : 0;
      const assists = assistIds.has(p.id) ? 1 : 0;
      const isGK = p.position === 'GK';
      const saves = isGK ? Math.round(savesTeam * (0.7 + rng.next() * 0.6)) : 0;
      const conceded = isGK ? goalsAgainst : 0;

      let rating = isGK ? 6.3 : POSITION_GROUPS[p.position] === 'DEF' ? 6.0 : 6.1;
      rating += goals * 0.75 + assists * 0.4;
      rating += saves * 0.08;
      rating += shotsDist[i] * 0.02 + passesDist[i] * 0.003 + tacklesDist[i] * 0.02;
      rating -= foulsDist[i] * 0.04;
      if (cleanSheet && (isGK || POSITION_GROUPS[p.position] === 'DEF')) rating += 0.45;
      if (isGK && goalsAgainst > 0) rating -= goalsAgainst * 0.15;
      if (!started) rating -= 0.1; // leve desconto por entrar no decorrer
      rating += rng.gaussian(0, 0.25);
      rating = clamp(rating, 3.0, 10.0);

      playerStats.push({
        playerId: p.id,
        rating: Math.round(rating * 10) / 10,
        goals,
        assists,
        shots: shotsDist[i],
        passes: passesDist[i],
        tackles: tacklesDist[i],
        fouls: foulsDist[i],
        yellows: 0,
        reds: 0,
        minutes,
        saves,
        conceded,
        ownGoals: 0,
        keyPasses: Math.round(passesDist[i] * 0.05),
        dribbles: Math.round(shotsDist[i] * 0.3),
        offsides: Math.round(rng.next() < 0.4 ? 1 : 0),
        interceptions: interDist[i],
        xg: Math.round((shotsDist[i] / totalShots) * teamXG * 10) / 10,
        xa: Math.round(((passesDist[i] * 0.05) / totalKP) * (Math.max(0.15, teamXG * 0.6)) * 10) / 10,
        manOfMatch: false,
        position: p.position,
        started,
      });
    });
  };

  const homeClean = awayGoals === 0;
  const awayClean = homeGoals === 0;
  buildPlayerStats(homeParticipants, homeGoals, awayGoals, 'home', shotHome, passHome, tackleHome, foulHome, saveAway, homeClean);
  buildPlayerStats(awayParticipants, awayGoals, homeGoals, 'away', shotAway, passAway, tackleAway, foulAway, saveHome, awayClean);

  // cartões para jogadores — personalidade influencia quem é punido
  const yellowCount = { home: 0, away: 0 };
  const redCount = { home: 0, away: 0 };
  const assignCards = (participants: { p: Player; started: boolean }[], side: 'home' | 'away') => {
    const nYellow = side === 'home' ? yellowHome : yellowAway;
    const nRed = side === 'home' ? redHome : redAway;
    const candidates = participants.filter((x) => x.p.position !== 'GK').map((x) => x.p);
    if (candidates.length === 0) return;

    // quando há eventos, usa exatamente os jogadores dos eventos
    if (track) {
      const evYellows = events.filter((e) => e.type === 'yellow' && e.team === side && e.playerId).map((e) => e.playerId!);
      for (const pid of evYellows) {
        const ps = playerStats.find((s) => s.playerId === pid);
        if (ps) { ps.yellows++; yellowCount[side]++; }
      }
      const evReds = events.filter((e) => e.type === 'red' && e.team === side && e.playerId).map((e) => e.playerId!);
      for (const pid of evReds) {
        const ps = playerStats.find((s) => s.playerId === pid);
        if (ps) { ps.reds++; ps.rating = clamp(ps.rating - 0.8, 3, 10); redCount[side]++; }
      }
      return;
    }

    for (let i = 0; i < nYellow; i++) {
      const weights = candidates.map((p) => Math.max(0.1, disciplineFactor(p)));
      const p = rng.weighted(candidates, weights);
      const ps = playerStats.find((s) => s.playerId === p.id);
      if (ps) { ps.yellows++; yellowCount[side]++; }
    }
    for (let i = 0; i < nRed; i++) {
      const weights = candidates.map((p) => {
        const ps = playerStats.find((s) => s.playerId === p.id);
        return Math.max(0.1, disciplineFactor(p) * (ps && ps.yellows > 0 ? 8 : 1));
      });
      const p = rng.weighted(candidates, weights);
      const ps = playerStats.find((s) => s.playerId === p.id);
      if (ps) { ps.reds++; ps.rating = clamp(ps.rating - 0.8, 3, 10); redCount[side]++; }
    }
  };
  assignCards(homeParticipants, 'home');
  assignCards(awayParticipants, 'away');

  // man of the match
  let manOfMatch: string | null = null;
  const winner = homeGoals > awayGoals ? 'home' : awayGoals > homeGoals ? 'away' : 'draw';
  let bestRating = 0;
  for (const ps of playerStats) {
    const isWinnerSide = (winner === 'home' && homeStarters.some((p) => p.id === ps.playerId)) || (winner === 'away' && awayStarters.some((p) => p.id === ps.playerId));
    if (isWinnerSide && ps.rating > bestRating) {
      bestRating = ps.rating;
      manOfMatch = ps.playerId;
    }
  }
  if (winner === 'draw') {
    for (const ps of playerStats) {
      if (ps.rating > bestRating) {
        bestRating = ps.rating;
        manOfMatch = ps.playerId;
      }
    }
  }
  if (manOfMatch) {
    const ps = playerStats.find((s) => s.playerId === manOfMatch);
    if (ps) ps.manOfMatch = true;
  }

  const stats: MatchStats = {
    possession: [Math.round(possession), Math.round(100 - possession)],
    shots: [shotHome, shotAway],
    shotsOnTarget: [sotHome, sotAway],
    corners: [cornerHome, cornerAway],
    fouls: [foulHome, foulAway],
    yellows: [yellowHome, yellowAway],
    reds: [redHome, redAway],
    passes: [passHome, passAway],
    passAccuracy: [
      clamp(Math.round(78 + rng.gaussian(3, 3) + possession / 10), 50, 95),
      clamp(Math.round(78 + rng.gaussian(3, 3) + (100 - possession) / 10), 50, 95),
    ],
    offsides: [offHome, offAway],
    tackles: [tackleHome, tackleAway],
    saves: [saveHome, saveAway],
    xg: [xgHomeFinal, xgAwayFinal],
    attendance: 0,
  };

  // público e receitas do estádio (demanda por preço/adversário/forma)
  const md = stadiumMatchDay(world, homeClub, awayClub, match, rng);
  stats.attendance = md.attendance;

  const substitutions: MatchSubstitution[] = [
    ...homeSubs.map((s) => ({ outId: s.outId, inId: s.inId, minute: s.minute, team: 'home' as const })),
    ...awaySubs.map((s) => ({ outId: s.outId, inId: s.inId, minute: s.minute, team: 'away' as const })),
  ];

  const result: MatchResult = {
    homeScore: homeGoals,
    awayScore: awayGoals,
    events,
    stats,
    playerStats,
    substitutions,
    penaltyShootout,
    extraTime,
    manOfMatch,
    winner,
  };

  // ------------------------------------------------------------
  // Aplica resultado ao mundo
  // ------------------------------------------------------------
  applyMatchToWorld(world, match, result, homeLineup, awayLineup, opts, md);
  return result;
}

// ------------------------------------------------------------
// Aplicação de efeitos pós-partida
// ------------------------------------------------------------
function applyMatchToWorld(
  world: World,
  match: Match,
  result: MatchResult,
  homeLineup: LineupChoice,
  awayLineup: LineupChoice,
  opts: SimOptions,
  md: StadiumMatchDay,
): void {
  // idempotência: nunca aplica duas vezes o mesmo resultado (evita J/forma/estatísticas duplicadas)
  if (match.played) return;
  match.played = true;
  match.homeScore = result.homeScore;
  match.awayScore = result.awayScore;
  match.events = result.events;
  match.stats = result.stats;
  match.playerStats = result.playerStats;
  match.homeLineup = homeLineup.playerIds;
  match.awayLineup = awayLineup.playerIds;
  match.homeFormation = homeLineup.formation;
  match.awayFormation = awayLineup.formation;
  match.attendance = result.stats.attendance;
  match.penaltyShootout = result.penaltyShootout ?? null;
  match.extraTimePlayed = result.extraTime;
  match.substitutions = result.substitutions;

  const homeClub = world.clubs[match.homeId];
  const awayClub = world.clubs[match.awayId];
  const homeWon = result.homeScore > result.awayScore;
  const awayWon = result.awayScore > result.homeScore;
  const draw = !homeWon && !awayWon;

  // forma dos clubes
  homeClub.lastResults.push(homeWon ? 'W' : draw ? 'D' : 'L');
  awayClub.lastResults.push(awayWon ? 'W' : draw ? 'D' : 'L');
  if (homeClub.lastResults.length > 8) homeClub.lastResults.shift();
  if (awayClub.lastResults.length > 8) awayClub.lastResults.shift();

  // receitas e despesas do estádio no dia de jogo
  const totalRev = md.ticketRevenue + md.foodRevenue + md.storeRevenue + md.parkingRevenue + md.vipRevenue;
  homeClub.balance += totalRev - md.matchCosts;
  homeClub.financeAccum.revenue += totalRev;
  homeClub.financeAccum.expenses += md.matchCosts;
  applyStadiumMatchResult(world, homeClub, match, homeWon, awayWon, md);

  // efeitos nos jogadores
  const applySide = (playerIds: string[], side: 'home' | 'away', won: boolean, isDraw: boolean, goalsFor: number, goalsAgainst: number) => {
    for (const pid of playerIds) {
      const p = world.players[pid];
      if (!p || p.status !== 'active') continue;
      const ps = result.playerStats.find((s) => s.playerId === pid);
      if (!ps) continue;

      // estatísticas
      p.seasonStats.apps += 1;
      p.careerStats.apps += 1;
      if (ps.started) { p.seasonStats.starts += 1; p.careerStats.starts += 1; }
      p.seasonStats.minutes += ps.minutes;
      p.careerStats.minutes += ps.minutes;
      p.seasonStats.goals += ps.goals;
      p.careerStats.goals += ps.goals;
      p.seasonStats.assists += ps.assists;
      p.careerStats.assists += ps.assists;
      p.seasonStats.yellows += ps.yellows;
      p.careerStats.yellows += ps.yellows;
      p.seasonStats.reds += ps.reds;
      p.careerStats.reds += ps.reds;
      p.seasonStats.ratingSum += ps.rating;
      p.seasonStats.ratingCount += 1;
      p.careerStats.ratingSum += ps.rating;
      p.careerStats.ratingCount += 1;
      const sot = ps.goals + (ps.saves > 0 ? 0 : Math.round(ps.shots * 0.34));
      p.seasonStats.shots += ps.shots;
      p.careerStats.shots += ps.shots;
      p.seasonStats.shotsOnTarget += sot;
      p.careerStats.shotsOnTarget += sot;
      p.seasonStats.passes += ps.passes;
      p.careerStats.passes += ps.passes;
      p.seasonStats.tackles += ps.tackles;
      p.careerStats.tackles += ps.tackles;
      p.seasonStats.interceptions += ps.interceptions;
      p.careerStats.interceptions += ps.interceptions;
      p.seasonStats.keyPasses += ps.keyPasses;
      p.careerStats.keyPasses += ps.keyPasses;
      p.seasonStats.xg += ps.xg;
      p.careerStats.xg += ps.xg;
      p.seasonStats.xa += ps.xa;
      p.careerStats.xa += ps.xa;
      if (p.position === 'GK' && goalsAgainst === 0) {
        p.seasonStats.cleanSheets += 1;
        p.careerStats.cleanSheets += 1;
      }
      if (ps.manOfMatch) {
        p.seasonStats.manOfMatch += 1;
        p.careerStats.manOfMatch += 1;
      }

      // forma
      p.lastRatings.push(ps.rating);
      if (p.lastRatings.length > 5) p.lastRatings.shift();
      const avgRating = p.lastRatings.reduce((a, b) => a + b, 0) / p.lastRatings.length;
      p.form = clamp(Math.round(40 + avgRating * 6), 1, 99);

      // condição e fadiga
      const intensity = opts.homeStyle?.intensity ?? 50;
      const effIntensity = side === 'home' ? intensity : (opts.awayStyle?.intensity ?? 50);
      p.condition = clamp(p.condition - (ps.minutes / 90) * (16 + effIntensity * 0.12) - 2, 1, 100);
      p.fatigue = clamp(p.fatigue + (ps.minutes / 90) * (10 + effIntensity * 0.1), 0, 100);

      // moral
      let moraleDelta = won ? 4 : isDraw ? 0 : -4;
      if (ps.goals > 0) moraleDelta += 4;
      if (ps.assists > 0) moraleDelta += 2;
      if (ps.reds > 0) moraleDelta -= 8;
      if (ps.yellows > 1) moraleDelta -= 3;
      p.morale = clamp(p.morale + moraleDelta, 1, 100);

      // relação com treinador
      const relationDelta = won ? 1 : isDraw ? 0 : -1;
      p.relation = clamp(p.relation + relationDelta, 1, 100);

      // suspensão por cartão vermelho
      if (ps.reds > 0) p.suspension += 1;

      p.avgRating = p.seasonStats.ratingCount > 0 ? p.seasonStats.ratingSum / p.seasonStats.ratingCount : 6.5;
    }
  };

  // inclui reservas que entraram nos efeitos pós-jogo
  const allHomeIds = [
    ...homeLineup.playerIds,
    ...result.substitutions.filter((s) => s.team === 'home').map((s) => s.inId),
  ];
  const allAwayIds = [
    ...awayLineup.playerIds,
    ...result.substitutions.filter((s) => s.team === 'away').map((s) => s.inId),
  ];

  applySide(allHomeIds, 'home', homeWon, draw, result.homeScore, result.awayScore);
  applySide(allAwayIds, 'away', awayWon, draw, result.awayScore, result.homeScore);

  // cumprimento de suspensão: cada partida disputada pelo clube serve uma
  // partida de suspensão para quem estava suspenso (e não entrou em campo).
  // Quem levou vermelho NESTA partida não conta (estava em campo) — cumpre na
  // próxima. Antes a suspensão nunca decrescia e o jogador ficava fora para sempre.
  const playedThisMatch = new Set([...allHomeIds, ...allAwayIds]);
  for (const clubId of [match.homeId, match.awayId]) {
    for (const p of Object.values(world.players)) {
      if (p.clubId === clubId && p.suspension > 0 && !playedThisMatch.has(p.id)) {
        p.suspension -= 1;
      }
    }
  }

  // lesões
  maybeInjure(world, allHomeIds, match);
  maybeInjure(world, allAwayIds, match);

  // moral do elenco
  homeClub.morale = clamp(homeClub.morale + (homeWon ? 2 : draw ? 0 : -2), 1, 100);
  awayClub.morale = clamp(awayClub.morale + (awayWon ? 2 : draw ? 0 : -2), 1, 100);

  // tabela da liga
  const comp = world.competitions[match.competitionId];
  if (comp && comp.type === 'league') {
    applyLeagueStandings(comp, match, homeWon, draw);
  }
}

export function applyLeagueStandings(comp: { standings: { clubId: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; gd: number; points: number; form: ('W' | 'D' | 'L')[] }[] }, match: Match, homeWon: boolean, draw: boolean): void {
  let home = comp.standings.find((s) => s.clubId === match.homeId);
  let away = comp.standings.find((s) => s.clubId === match.awayId);
  // defensivo: se a tabela estiver sem a entrada do clube (save antigo/corrompido),
  // cria a linha em vez de ignorar silenciosamente o resultado
  const mk = (clubId: string) => ({ clubId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [] as ('W' | 'D' | 'L')[] });
  if (!home) { home = mk(match.homeId); comp.standings.push(home); }
  if (!away) { away = mk(match.awayId); comp.standings.push(away); }
  if (!home || !away) return;
  const hs = match.homeScore ?? 0;
  const as = match.awayScore ?? 0;
  home.played++; away.played++;
  home.gf += hs; home.ga += as; away.gf += as; away.ga += hs;
  home.gd = home.gf - home.ga;
  away.gd = away.gf - away.ga;
  if (homeWon) {
    home.won++; home.points += 3; home.form.push('W');
    away.lost++; away.form.push('L');
  } else if (draw) {
    home.drawn++; away.drawn++;
    home.points += 1; away.points += 1;
    home.form.push('D'); away.form.push('D');
  } else {
    away.won++; away.points += 3; away.form.push('W');
    home.lost++; home.form.push('L');
  }
  if (home.form.length > 5) home.form.shift();
  if (away.form.length > 5) away.form.shift();
}

// ------------------------------------------------------------
// Lesões
// ------------------------------------------------------------
let injuryCounter = 0;

function maybeInjure(world: World, playerIds: string[], match: Match): void {
  const rng = new RNG(hashString(world.seed) ^ hashString(`injury|${match.id}`));
  for (const pid of playerIds) {
    const p = world.players[pid];
    if (!p || p.status !== 'active' || p.injury) continue;
    const baseProb = 0.008;
    const ageFactor = p.age > 34 ? 3 : p.age > 30 ? 1.8 : 1;
    const physFactor = (100 - p.attrs.physical) / 100;
    if (!rng.chance(baseProb * ageFactor * physFactor)) continue;
    const severity = rng.weighted(['Leve', 'Moderada', 'Grave'] as const, [55, 33, 12]);
    const weeks = severity === 'Leve' ? rng.int(1, 2) : severity === 'Moderada' ? rng.int(3, 5) : rng.int(6, 14);
    const types: { type: string; body: string }[] = [
      { type: 'Muscular', body: 'coxa' }, { type: 'Tornozelo', body: 'tornozelo' },
      { type: 'Joelho', body: 'joelho' }, { type: 'Coxa', body: 'coxa posterior' },
      { type: 'Ombro', body: 'ombro' }, { type: 'Contusão', body: 'tornozelo' },
    ];
    const pick = rng.pick(types);
    p.injury = {
      id: `inj${injuryCounter++}`,
      type: pick.type as Player['injury'] extends { type: infer T } | null ? T : never,
      startDate: match.date,
      recoveryDate: addDays(match.date, weeks * 7 + rng.int(0, 4)),
      severity,
      weeks,
      daysOut: weeks * 7,
      bodyPart: pick.body,
    };
    p.condition = clamp(p.condition - 25, 1, 100);
    p.morale = clamp(p.morale - 8, 1, 100);
    p.injuryHistory.push({
      date: match.date,
      type: pick.type as InjuryType,
      bodyPart: pick.body,
      daysOut: p.injury.daysOut,
      severity: severity,
    });
    if (p.injuryHistory.length > 12) p.injuryHistory.shift();
  }
}

// ------------------------------------------------------------
// Consultas úteis
// ------------------------------------------------------------
export function getPlayerById(world: World, id: string): Player | undefined {
  return world.players[id];
}

export function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

/**
 * Energia do jogador para o início de uma partida (0-100).
 * Usa a mesma fórmula do motor (condição + resistência − fadiga acumulada),
 * para que o número mostrado no quadro tático seja exatamente o usado na simulação.
 */
export function playerEnergy(p: Player): number {
  return clamp(p.condition * 0.5 + p.attrs.stamina * 0.42 + (100 - p.fatigue) * 0.08, 20, 100);
}

export function matchResultText(m: Match): string {
  if (!m.played) return '—';
  return `${m.homeScore} - ${m.awayScore}`;
}

export { POSITION_LABELS };
