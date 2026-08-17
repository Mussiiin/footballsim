// ------------------------------------------------------------
// Padronização de elencos — 28 jogadores (3 GK / 8 DEF / 8 MID / 9 ATT)
// Validação, composição e preenchimento automático de lacunas.
// ------------------------------------------------------------
import { World, Player, Position, PositionGroup } from '../lib/types';
import { POSITION_GROUPS } from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { COUNTRIES } from './names';
import { generatePlayer } from './worldgen';
import { refreshClubCaches } from './overall';
import { squadOf } from './transfers';

export const SQUAD_TARGETS = {
  GK: 3,
  DEF: 8,
  MID: 8,
  ATT: 9,
  TOTAL: 28,
  MIN: 26,
  MAX: 30,
} as const;

// distribuição fina por posição dentro de cada grupo
const DEF_SHARE: Record<string, number> = { CB: 4, LB: 2, RB: 2 };
const MID_SHARE: Record<string, number> = { DM: 2, CM: 4, AM: 2 };
const ATT_SHARE: Record<string, number> = { LW: 2, RW: 2, ST: 3, CF: 2 };

export interface SquadComposition {
  total: number;
  GK: number;
  DEF: number;
  MID: number;
  ATT: number;
  byPosition: Partial<Record<Position, number>>;
}

export function squadComposition(world: World, clubId: string): SquadComposition {
  const players = squadOf(world, clubId);
  const byPosition: Partial<Record<Position, number>> = {};
  let GK = 0, DEF = 0, MID = 0, ATT = 0;
  for (const p of players) {
    const g = POSITION_GROUPS[p.position];
    if (g === 'GK') GK++;
    else if (g === 'DEF') DEF++;
    else if (g === 'MID') MID++;
    else ATT++;
    byPosition[p.position] = (byPosition[p.position] ?? 0) + 1;
  }
  return { total: players.length, GK, DEF, MID, ATT, byPosition };
}

export interface SquadReport {
  clubId: string;
  total: number;
  targets: { GK: number; DEF: number; MID: number; ATT: number };
  GK: number;
  DEF: number;
  MID: number;
  ATT: number;
  missing: Position[];
  duplicates: number;
  noPosition: number;
  noClub: number;
  issues: string[];
  status: 'ok' | 'incomplete' | 'excess' | 'missing_positions';
}

export function validateSquad(world: World, clubId: string): SquadReport {
  const comp = squadComposition(world, clubId);
  const t = SQUAD_TARGETS;
  const issues: string[] = [];
  const missing: Position[] = [];
  const groupNeeds: Array<['GK' | 'DEF' | 'MID' | 'ATT', string]> = [
    ['GK', 'goleiros'],
    ['DEF', 'defensores'],
    ['MID', 'meio-campistas'],
    ['ATT', 'atacantes'],
  ];
  for (const [k, label] of groupNeeds) {
    const cur = comp[k];
    const need = t[k];
    if (cur < need) {
      missing.push(...missingPositionsFor(comp, k, need - cur));
      issues.push(`Faltam ${need - cur} ${label} (tem ${cur}/${need}).`);
    }
  }
  if (comp.total < t.MIN) issues.push(`Elenco incompleto: apenas ${comp.total} jogadores (mínimo ${t.MIN}).`);
  if (comp.total > t.MAX) issues.push(`Elenco excessivo: ${comp.total} jogadores (máximo ${t.MAX}).`);

  const ids = new Set<string>();
  let duplicates = 0;
  const seen = new Set<string>();
  for (const p of Object.values(world.players)) {
    if (p.clubId !== clubId) continue;
    if (seen.has(p.id)) duplicates++;
    seen.add(p.id);
    ids.add(p.id);
  }
  let noPosition = 0;
  for (const p of Object.values(world.players)) {
    if (p.clubId === clubId && !p.position) noPosition++;
  }
  const noClub = Object.values(world.players).filter((p) => p.status === 'active' && !p.clubId).length;

  let status: SquadReport['status'] = 'ok';
  if (duplicates > 0 || noPosition > 0) status = 'missing_positions';
  else if (comp.total > t.MAX) status = 'excess';
  else if (missing.length > 0 || comp.total < t.MIN) status = 'incomplete';

  return {
    clubId,
    total: comp.total,
    targets: { GK: t.GK, DEF: t.DEF, MID: t.MID, ATT: t.ATT },
    GK: comp.GK,
    DEF: comp.DEF,
    MID: comp.MID,
    ATT: comp.ATT,
    missing,
    duplicates,
    noPosition,
    noClub,
    issues,
    status,
  };
}

export function validateAllSquads(world: World): SquadReport[] {
  return Object.values(world.clubs).map((c) => validateSquad(world, c.id));
}

// posição mais carente dentro de um grupo
function missingPositionsFor(comp: SquadComposition, group: 'GK' | 'DEF' | 'MID' | 'ATT', n: number): Position[] {
  if (group === 'GK') return ['GK'];
  const share = group === 'DEF' ? DEF_SHARE : group === 'MID' ? MID_SHARE : ATT_SHARE;
  const out: Position[] = [];
  for (let i = 0; i < n; i++) {
    let best: Position | null = null;
    let bestRatio = Infinity;
    for (const [pos, target] of Object.entries(share)) {
      const cur = (comp.byPosition[pos as Position] ?? 0) + out.filter((x) => x === pos).length;
      const ratio = cur / target;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = pos as Position;
      }
    }
    if (best) out.push(best);
  }
  return out;
}

function nextPlayerId(world: World): string {
  let max = -1;
  for (const id of Object.keys(world.players)) {
    const m = /^p(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `p${max + 1}`;
}

/**
 * Completa as lacunas do elenco de um clube até os alvos (3/8/8/9), sem remover
 * ninguém. Nunca passa do máximo (30). Retorna quantos jogadores criou.
 */
export function ensureSquadBalanced(world: World, clubId: string, seasonYear?: number): number {
  const club = world.clubs[clubId];
  if (!club) return 0;
  const year = seasonYear ?? Number(world.season.slice(0, 4));
  const rng = new RNG(hashString(`${clubId}|${world.seed ?? ''}|squad`));
  const country = COUNTRIES.find((c) => c.id === club.countryId);
  if (!country) return 0;

  let added = 0;
  const fill = (group: 'GK' | 'DEF' | 'MID' | 'ATT', need: number) => {
    const positions = missingPositionsFor(squadComposition(world, clubId), group, need);
    for (const pos of positions) {
      const squad = squadOf(world, clubId);
      if (squad.length >= SQUAD_TARGETS.MAX) return;
      const used = new Set(squad.map((p) => p.squadNumber));
      let num = 1 + Math.floor(rng.next() * 40);
      while (used.has(num)) num = 1 + Math.floor(rng.next() * 40);
      const p = generatePlayer(
        rng,
        country,
        club,
        club.squadStrength,
        pos,
        num,
        year,
        rng.chance(0.4) ? 'youth' : 'bench',
        nextPlayerId(world),
      );
      p.squadNumber = num;
      world.players[p.id] = p;
      added++;
    }
  };

  const comp0 = squadComposition(world, clubId);
  if (comp0.GK < SQUAD_TARGETS.GK) fill('GK', SQUAD_TARGETS.GK - comp0.GK);
  if (comp0.DEF < SQUAD_TARGETS.DEF) fill('DEF', SQUAD_TARGETS.DEF - comp0.DEF);
  if (comp0.MID < SQUAD_TARGETS.MID) fill('MID', SQUAD_TARGETS.MID - comp0.MID);
  if (comp0.ATT < SQUAD_TARGETS.ATT) fill('ATT', SQUAD_TARGETS.ATT - comp0.ATT);

  if (added > 0) {
    refreshClubCaches(club, squadOf(world, clubId));
  }
  return added;
}

/** Aplica o balanceamento em todos os clubes. Retorna total de jogadores criados. */
export function balanceAllSquads(world: World, seasonYear?: number): number {
  let total = 0;
  for (const club of Object.values(world.clubs)) {
    total += ensureSquadBalanced(world, club.id, seasonYear);
  }
  return total;
}

export { POSITION_GROUPS };
