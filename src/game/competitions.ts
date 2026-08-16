import {
  World, Competition, Match, StandingRow, MatchRef, CupMatchStore, ContinentalMatchStore,
} from '../lib/types';

// ------------------------------------------------------------
// Vencedor de uma partida (considera pênaltis)
// ------------------------------------------------------------
export function winnerOf(m: Match): string | null {
  if (!m.played) return null;
  if (m.homeScore !== null && m.awayScore !== null) {
    if (m.homeScore > m.awayScore) return m.homeId;
    if (m.awayScore > m.homeScore) return m.awayId;
    if (m.penaltyShootout) {
      return m.penaltyShootout.home > m.penaltyShootout.away ? m.homeId : m.awayId;
    }
  }
  return null;
}

// ------------------------------------------------------------
// Resolução de referências de mata-mata
// ------------------------------------------------------------
export function resolveRef(ref: MatchRef, comp: Competition, store: CupMatchStore, world: World): string | null {
  if (ref.kind === 'club') return ref.id;
  if (ref.kind === 'winner') return store.roundWinners[ref.matchId] ?? null;
  if (ref.kind === 'group') {
    const cstore = store as ContinentalMatchStore;
    const groupStandings = comp.standings
      .filter((s) => cstore.groups?.[s.clubId] === ref.group)
      .sort(compareStandings);
    return groupStandings[ref.pos]?.clubId ?? null;
  }
  return null;
}

export function resolveRound(world: World, compId: string, roundIndex: number): void {
  const comp = world.competitions[compId];
  const store = comp.type === 'continental'
    ? world.continentalMatches[compId]
    : world.cupMatches[compId];
  if (!store || !comp.rounds[roundIndex]) return;
  const round = comp.rounds[roundIndex];
  for (const matchId of round.matchIds) {
    const m = store.matches.find((x) => x.id === matchId);
    if (!m || m.homeId !== '__TBD__') continue;
    const ref = store.refs[m.id];
    if (!ref) continue;
    const home = resolveRef(ref.home, comp, store, world);
    const away = resolveRef(ref.away, comp, store, world);
    if (home && away && world.clubs[home] && world.clubs[away]) {
      m.homeId = home;
      m.awayId = away;
      m.homeName = world.clubs[home].name;
      m.awayName = world.clubs[away].name;
    }
  }
}

/** Atualiza o estado dos mata-matas após as partidas de um dia. */
export function syncBrackets(world: World): void {
  const koComps = [
    ...Object.keys(world.cupMatches),
    ...Object.keys(world.continentalMatches),
  ];
  for (const compId of koComps) {
    const comp = world.competitions[compId];
    if (!comp) continue;
    const store = comp.type === 'continental'
      ? world.continentalMatches[compId]
      : world.cupMatches[compId];
    if (!store) continue;

    if (comp.status === 'scheduled') comp.status = 'ongoing';

    for (let r = 0; r < comp.rounds.length; r++) {
      const round = comp.rounds[r];
      if (round.matchIds.length === 0) continue;
      const allPlayed = round.matchIds.every((id) => {
        const m = store.matches.find((x) => x.id === id);
        return m?.played === true;
      });
      if (allPlayed && !round.complete) {
        // registra vencedores
        for (const id of round.matchIds) {
          const m = store.matches.find((x) => x.id === id);
          if (m) {
            const w = winnerOf(m);
            if (w) store.roundWinners[id] = w;
          }
        }
        round.complete = true;
        comp.currentRoundIndex = r + 1;
        // resolve a próxima fase
        if (r + 1 < comp.rounds.length) {
          resolveRound(world, compId, r + 1);
        }
      }
    }

    // competição terminada? (guard: só registra o campeão uma vez)
    const last = comp.rounds[comp.rounds.length - 1];
    if (last && last.complete && comp.status !== 'finished') {
      comp.status = 'finished';
      const finalMatch = store.matches.find((m) => m.id === last.matchIds[0]);
      if (finalMatch) {
        const championId = winnerOf(finalMatch);
        if (championId) {
          const championName = world.clubs[championId]?.name ?? '';
          comp.champions.push({
            season: comp.season,
            champion: championName,
            runnerUp: world.clubs[championId === finalMatch.homeId ? finalMatch.awayId : finalMatch.homeId]?.name ?? '',
          });
          const club = world.clubs[championId];
          if (club) {
            club.titles.push({ competitionId: comp.id, competitionName: comp.name, season: comp.season });
            club.balance += comp.prizeMoney.champion;
            club.financeAccum.revenue += comp.prizeMoney.champion;
            if (!club.isUserControlled) club.coach.reputation = Math.min(99, club.coach.reputation + 2);
          }
          const runnerUp = world.clubs[championId === finalMatch.homeId ? finalMatch.awayId : finalMatch.homeId];
          if (runnerUp) {
            runnerUp.balance += comp.prizeMoney.runnerUp;
            runnerUp.financeAccum.revenue += comp.prizeMoney.runnerUp;
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------
// Tabelas
// ------------------------------------------------------------
export function compareStandings(a: StandingRow, b: StandingRow): number {
  // critérios de desempate (regulamento): pontos → vitórias → saldo de gols → gols marcados
  if (b.points !== a.points) return b.points - a.points;
  if (b.won !== a.won) return b.won - a.won;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return a.clubId.localeCompare(b.clubId);
}

export function sortedStandings(comp: Competition): StandingRow[] {
  return [...comp.standings].sort(compareStandings);
}

export function positionOf(comp: Competition, clubId: string): number {
  const sorted = sortedStandings(comp);
  const idx = sorted.findIndex((s) => s.clubId === clubId);
  return idx === -1 ? 0 : idx + 1;
}

// ------------------------------------------------------------
// Consultas de partidas
// ------------------------------------------------------------
export function competitionMatches(world: World, compId: string): Match[] {
  const out: Match[] = [];
  if (world.leagueMatches[compId]) out.push(...world.leagueMatches[compId]);
  if (world.cupMatches[compId]) out.push(...world.cupMatches[compId].matches);
  if (world.continentalMatches[compId]) out.push(...world.continentalMatches[compId].matches);
  return out;
}

export function allMatchesForClub(world: World, clubId: string): Match[] {
  const out: Match[] = [];
  for (const list of Object.values(world.leagueMatches)) {
    for (const m of list) {
      if (m.homeId === clubId || m.awayId === clubId) out.push(m);
    }
  }
  for (const store of Object.values(world.cupMatches)) {
    for (const m of store.matches) {
      if (m.homeId === clubId || m.awayId === clubId) out.push(m);
    }
  }
  for (const store of Object.values(world.continentalMatches)) {
    for (const m of store.matches) {
      if (m.homeId === clubId || m.awayId === clubId) out.push(m);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function matchesOnDate(world: World, date: string): Match[] {
  const out: Match[] = [];
  for (const list of Object.values(world.leagueMatches)) {
    for (const m of list) {
      if (m.date === date && !m.played) out.push(m);
    }
  }
  for (const store of Object.values(world.cupMatches)) {
    for (const m of store.matches) {
      if (m.date === date && !m.played) out.push(m);
    }
  }
  for (const store of Object.values(world.continentalMatches)) {
    for (const m of store.matches) {
      if (m.date === date && !m.played) out.push(m);
    }
  }
  return out;
}

export function nextMatchForClub(world: World, clubId: string, afterDate?: string): Match | null {
  let best: Match | null = null;
  const consider = (m: Match) => {
    if (m.played) return;
    if ((m.homeId === clubId || m.awayId === clubId) && m.homeId !== '__TBD__' && m.awayId !== '__TBD__') {
      // partida pendente com data passada (órfã, ex.: semi de copa com fase anterior atrasada)
      // é oferecida normalmente — ela vem antes de qualquer partida futura por ter data menor
      if (afterDate && m.date < afterDate && !isOrphanCandidate(m)) return;
      if (!best || m.date < best.date) best = m;
    }
  };
  for (const list of Object.values(world.leagueMatches)) list.forEach(consider);
  for (const store of Object.values(world.cupMatches)) store.matches.forEach(consider);
  for (const store of Object.values(world.continentalMatches)) store.matches.forEach(consider);
  return best;
}

/**
 * Partidas com data passada e não jogadas são candidatas a "próxima partida" apenas quando
 * são de fases de mata-mata ainda pendentes (ex.: semifinal de copa) — ou seja, quando a
 * data passou mas a partida continua no calendário aguardando ser jogada. Partidas de liga
 * com data passada são sempre órfãs e o repair diário as resolve.
 */
function isOrphanCandidate(m: Match): boolean {
  if (m.competitionId.startsWith('cup_') || m.competitionId === 'CONTINENTAL' || m.competitionId.startsWith('continental')) {
    return true;
  }
  return false;
}

/** Próxima partida do clube no dia informado (ou null). */
export function matchForClubOnDate(world: World, clubId: string, date: string): Match | null {
  for (const list of Object.values(world.leagueMatches)) {
    for (const m of list) {
      if (!m.played && m.date === date && (m.homeId === clubId || m.awayId === clubId)) return m;
    }
  }
  for (const store of Object.values(world.cupMatches)) {
    for (const m of store.matches) {
      if (!m.played && m.date === date && (m.homeId === clubId || m.awayId === clubId)) return m;
    }
  }
  for (const store of Object.values(world.continentalMatches)) {
    for (const m of store.matches) {
      if (!m.played && m.date === date && (m.homeId === clubId || m.awayId === clubId)) return m;
    }
  }
  return null;
}

/** Última partida jogada do clube. */
export function lastMatchForClub(world: World, clubId: string): Match | null {
  let best: Match | null = null;
  const consider = (m: Match) => {
    if (!m.played) return;
    if (m.homeId === clubId || m.awayId === clubId) {
      if (!best || m.date > best.date) best = m;
    }
  };
  for (const list of Object.values(world.leagueMatches)) list.forEach(consider);
  for (const store of Object.values(world.cupMatches)) store.matches.forEach(consider);
  for (const store of Object.values(world.continentalMatches)) store.matches.forEach(consider);
  return best;
}

// ------------------------------------------------------------
// Artilharia de uma competição
// ------------------------------------------------------------
export function topScorersOf(world: World, compId: string, limit = 10): { playerId: string; name: string; clubName: string; goals: number }[] {
  const goals = new Map<string, { name: string; clubId: string; goals: number }>();
  const matches = competitionMatches(world, compId);
  for (const m of matches) {
    if (!m.played || !m.playerStats) continue;
    for (const ps of m.playerStats) {
      if (ps.goals > 0) {
        const p = world.players[ps.playerId];
        if (!p) continue;
        const rec = goals.get(ps.playerId) ?? { name: `${p.firstName} ${p.lastName}`, clubId: p.clubId ?? '', goals: 0 };
        rec.goals += ps.goals;
        goals.set(ps.playerId, rec);
      }
    }
  }
  return [...goals.entries()]
    .map(([playerId, v]) => ({
      playerId,
      name: v.name,
      clubName: v.clubId ? world.clubs[v.clubId]?.name ?? '—' : '—',
      goals: v.goals,
    }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, limit);
}/** Assistências de uma competição. */
export function topAssistsOf(world: World, compId: string, limit = 10): { playerId: string; name: string; clubName: string; assists: number }[] {
  const assists = new Map<string, { name: string; clubId: string; assists: number }>();
  const matches = competitionMatches(world, compId);
  for (const m of matches) {
    if (!m.played || !m.playerStats) continue;
    for (const ps of m.playerStats) {
      if (ps.assists > 0) {
        const p = world.players[ps.playerId];
        if (!p) continue;
        const rec = assists.get(ps.playerId) ?? { name: `${p.firstName} ${p.lastName}`, clubId: p.clubId ?? '', assists: 0 };
        rec.assists += ps.assists;
        assists.set(ps.playerId, rec);
      }
    }
  }
  return [...assists.entries()]
    .map(([playerId, v]) => ({
      playerId,
      name: v.name,
      clubName: v.clubId ? world.clubs[v.clubId]?.name ?? '—' : '—',
      assists: v.assists,
    }))
    .sort((a, b) => b.assists - a.assists)
    .slice(0, limit);
}

/** Fase atual de um mata-mata (nome). */

export function currentCupRoundName(comp: Competition): string {
  if (comp.status === 'finished') return 'Finalizada';
  const idx = Math.min(comp.currentRoundIndex, comp.rounds.length - 1);
  return comp.rounds[idx]?.name ?? '—';
}
