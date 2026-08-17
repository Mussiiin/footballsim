import {
  World, Competition, Match, StandingRow, MatchRef, CupMatchStore, ContinentalMatchStore, Career,
} from '../lib/types';
import { getPrizeRules, stagePrizeFor, grantPrize } from './cupPrizes';
import { RNG, hashString } from '../lib/rng';

// ------------------------------------------------------------
// Confronto de ida e volta (agregado; pênaltis em caso de empate)
// ------------------------------------------------------------
export function aggregateWinner(ida: Match, volta: Match): { winner: string; loser: string } | null {
  if (!ida || !volta || !ida.played || !volta.played) return null;
  const teamA = ida.homeId;
  const teamB = ida.awayId;
  const aggA = (ida.homeScore ?? 0) + (volta.awayScore ?? 0);
  const aggB = (ida.awayScore ?? 0) + (volta.homeScore ?? 0);
  if (aggA > aggB) return { winner: teamA, loser: teamB };
  if (aggB > aggA) return { winner: teamB, loser: teamA };
  // agregado empatado → pênaltis (determinístico por partida)
  const rng = new RNG(hashString(ida.id + '|' + volta.id + '|pens'));
  let home = 0, away = 0;
  for (let i = 0; i < 5; i++) {
    if (rng.chance(0.72)) home++;
    if (rng.chance(0.72)) away++;
  }
  let rounds = 5;
  while (home === away && rounds < 12) {
    if (rng.chance(0.72)) home++;
    if (rng.chance(0.72)) away++;
    rounds++;
  }
  // a volta tem o time B em casa → home da disputa = time B
  const winner = home > away ? teamB : teamA;
  const loser = winner === teamA ? teamB : teamA;
  volta.penaltyShootout = { home, away };
  return { winner, loser };
}

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
  if (ref.kind === 'loser') {
    // perdedor de um confronto — pode estar em outra competição (ex.: playoff de acesso da Série D)
    const target = ref.competitionId && ref.competitionId !== comp.id
      ? world.cupMatches[ref.competitionId]
      : store;
    return target?.roundLosers?.[ref.matchId] ?? null;
  }
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
    } else if (home && world.clubs[home] && (away === null || !world.clubs[away])) {
      // defensivo: o adversário sumiu do mundo → W.O. direto para o mandante
      m.homeId = home;
      m.awayId = home;
      m.homeName = world.clubs[home].name;
      m.awayName = world.clubs[home].name;
      m.played = true;
      m.homeScore = 3;
      m.awayScore = 0;
      m.events = [{ minute: 1, type: 'kickoff', team: 'home', detail: 'W.O. — adversário ausente' }];
    } else if (away && world.clubs[away] && (home === null || !world.clubs[home])) {
      m.homeId = away;
      m.awayId = away;
      m.homeName = world.clubs[away].name;
      m.awayName = world.clubs[away].name;
      m.played = true;
      m.homeScore = 3;
      m.awayScore = 0;
      m.events = [{ minute: 1, type: 'kickoff', team: 'home', detail: 'W.O. — adversário ausente' }];
    }
  }
}

/** Atualiza o estado dos mata-matas após as partidas de um dia. */
export function syncBrackets(world: World, career: Career | null = null): void {
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
    if (!store.roundLosers) store.roundLosers = {};

    // Série D (ligas com fase de grupos + mata-mata): quando a fase de grupos termina
    // (todas as partidas de liga jogadas), resolve a 2ª fase do chaveamento.
    if (comp.knockoutAfterGroups && comp.rounds.length > 0 && !comp.rounds[0].complete) {
      const leagueMs = world.leagueMatches[comp.id] ?? [];
      const groupsDone = leagueMs.length > 0 && leagueMs.every((m) => m.played);
      if (groupsDone) {
        resolveRound(world, compId, 0);
        // 💰 Participação (todos) + classificação aos 64 (4 melhores de cada grupo)
        const rules = getPrizeRules(world, compId);
        if (rules) {
          const qualified = new Set<string>();
          for (const g of comp.groups ?? []) {
            const groupRows = comp.standings
              .filter((s) => comp.clubGroup?.[s.clubId] === g.id)
              .sort(compareStandings);
            groupRows.slice(0, 4).forEach((s) => qualified.add(s.clubId));
          }
          for (const cid of comp.clubIds) {
            const club = world.clubs[cid];
            if (!club) continue;
            grantPrize(world, career, compId, cid, 'Participação', stagePrizeFor(rules, 'Participação', club));
            if (qualified.has(cid)) {
              grantPrize(world, career, compId, cid, 'Classificação', stagePrizeFor(rules, 'Classificação', club));
            }
          }
        }
      }
    }
    // playoff de acesso: resolve assim que os perdedores das quartas forem conhecidos
    if (comp.accessPlayoffId && world.competitions[comp.accessPlayoffId]) {
      resolveRound(world, comp.accessPlayoffId, 0);
    }

    for (let r = 0; r < comp.rounds.length; r++) {
      const round = comp.rounds[r];
      if (round.matchIds.length === 0) continue;
      const allPlayed = round.matchIds.every((id) => {
        const m = store.matches.find((x) => x.id === id);
        return m?.played === true;
      });
      if (allPlayed && !round.complete) {
        // registra vencedores (e perdedores, para o playoff de acesso)
        const winners: string[] = [];
        if (round.legs === 'two') {
          // confrontos de ida e volta: agregado + pênaltis
          for (let i = 0; i < round.matchIds.length; i += 2) {
            const ida = store.matches.find((x) => x.id === round.matchIds[i]);
            const volta = store.matches.find((x) => x.id === round.matchIds[i + 1]);
            if (!ida || !volta) continue;
            let res = aggregateWinner(ida, volta);
            // defensivo: partida sem placar (save antigo) → manda o mandante da ida
            if (!res && ida.homeScore !== null && ida.awayScore !== null && ida.homeId !== '__TBD__') {
              res = { winner: ida.homeId, loser: ida.awayId };
            }
            if (res && world.clubs[res.winner]) {
              store.roundWinners[ida.id] = res.winner;
              store.roundWinners[volta.id] = res.winner;
              store.roundLosers![ida.id] = res.loser;
              store.roundLosers![volta.id] = res.loser;
              winners.push(res.winner);
            }
          }
        } else {
          for (const id of round.matchIds) {
            const m = store.matches.find((x) => x.id === id);
            if (m) {
              let w = winnerOf(m);
              if (!w && m.homeScore !== null && m.awayScore !== null && m.homeId !== '__TBD__') {
                w = m.homeId;
              }
              if (w && w !== '__TBD__' && world.clubs[w]) {
                store.roundWinners[id] = w;
                const loser = w === m.homeId ? m.awayId : m.homeId;
                store.roundLosers![id] = loser;
                winners.push(w);
              }
            }
          }
        }
        round.complete = true;
        comp.currentRoundIndex = r + 1;
        // 💰 Premiação por avanço: cada vencedor recebe o valor da fase concluída
        const rules = getPrizeRules(world, compId);
        if (rules && round.name !== 'Final') {
          for (const w of winners) {
            const club = world.clubs[w];
            if (!club) continue;
            grantPrize(world, career, compId, w, round.name, stagePrizeFor(rules, round.name, club));
          }
        }
        // resolve a próxima fase
        if (r + 1 < comp.rounds.length) {
          resolveRound(world, compId, r + 1);
        }
      }
    }

    // Série D: registra os acessos (4 vencedores das quartas + 2 do playoff de acesso)
    if (comp.knockoutAfterGroups && comp.rules.accessPlayoffLosers) {
      const qf = comp.rounds.find((r) => r.name === 'Quartas de final');
      if (qf && qf.complete && comp.status !== 'finished') {
        const promoted: string[] = [];
        for (const id of qf.matchIds.filter((_, i) => i % 2 === 0)) {
          const w = store.roundWinners[id];
          if (w && !promoted.includes(w)) promoted.push(w);
        }
        // vencedores do playoff de acesso
        const accComp = world.competitions[comp.accessPlayoffId!];
        const accStore = world.cupMatches[comp.accessPlayoffId!];
        if (accComp && accStore && accComp.rounds[0]?.complete) {
          for (const id of accComp.rounds[0].matchIds.filter((_, i) => i % 2 === 0)) {
            const w = accStore.roundWinners[id];
            if (w && !promoted.includes(w)) promoted.push(w);
          }
        }
        comp.knockoutPromoted = promoted;
      }
    }

    // competição terminada? (guard: só registra o campeão uma vez)
    const last = comp.rounds[comp.rounds.length - 1];
    if (comp.isAccessPlayoff) continue; // playoff de acesso: sem campeão próprio
    if (last && last.complete && comp.status !== 'finished') {
      comp.status = 'finished';
      const finalMatch = store.matches.find((m) => m.id === last.matchIds[0]);
      if (finalMatch) {
        const championId = store.roundWinners[last.matchIds[0]] ?? winnerOf(finalMatch);
        if (championId) {
          const runnerUpId = championId === finalMatch.homeId ? finalMatch.awayId : finalMatch.homeId;
          const championName = world.clubs[championId]?.name ?? '';
          comp.champions.push({
            season: comp.season,
            champion: championName,
            runnerUp: world.clubs[runnerUpId]?.name ?? '',
          });
          const club = world.clubs[championId];
          if (club) {
            club.titles.push({ competitionId: comp.id, competitionName: comp.name, season: comp.season });
            // 💰 Campeão recebe SOMENTE a premiação de campeão (nunca a do vice)
            const rules = getPrizeRules(world, compId);
            const championAmt = rules?.prizes.champion ?? comp.prizeMoney.champion ?? 0;
            grantPrize(world, career, compId, championId, 'Campeão', championAmt);
            if (!club.isUserControlled) club.coach.reputation = Math.min(99, club.coach.reputation + 2);
          }
          const runnerUp = world.clubs[runnerUpId];
          if (runnerUp) {
            // 💰 Vice-campeão recebe a premiação de vice
            const rules = getPrizeRules(world, compId);
            const runnerUpAmt = rules?.prizes.runnerUp ?? comp.prizeMoney.runnerUp ?? 0;
            grantPrize(world, career, compId, runnerUpId, 'Vice-campeão', runnerUpAmt);
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

/** Store de partidas de uma competição de mata-mata (copa, continental ou liga com knockout). */
function knockoutStoreOf(world: World, comp: Competition): { matches: Match[] } | undefined {
  if (comp.type === 'continental') return world.continentalMatches[comp.id];
  if (comp.type === 'cup') return world.cupMatches[comp.id];
  // liga com mata-mata (ex.: Série D) — o chaveamento vive no store de copa da própria liga
  if (comp.knockoutAfterGroups) return world.cupMatches[comp.id];
  return undefined;
}

/**
 * Fase em que um clube está (ou chegou) numa competição de mata-mata.
 * - "🏆 Campeão" se venceu a competição
 * - nome da fase atual se ainda está disputando
 * - "Eliminado: X" se foi eliminado no mata-mata
 * - null se o clube não participa do mata-mata (ex.: eliminado na fase de grupos)
 */
export function phaseForClub(world: World, comp: Competition, clubId: string): string | null {
  const store = knockoutStoreOf(world, comp);
  if (!store || comp.rounds.length === 0) return null;
  const inKnockout = store.matches.some(
    (m) => (m.homeId === clubId || m.awayId === clubId) && m.homeId !== '__TBD__' && m.awayId !== '__TBD__',
  );
  // clube participa da competição mas ainda não jogou nada no mata-mata
  if (!inKnockout && comp.clubIds?.includes(clubId)) {
    // liga com grupos (Série D): ainda na fase de grupos
    if (comp.knockoutAfterGroups) return 'Fase de grupos';
    // copa/continental: primeira fase ainda não concluída
    const current = comp.rounds.find((r) => !r.complete);
    return current?.name ?? comp.rounds[0]?.name ?? null;
  }
  if (!inKnockout) return null;
  // campeão da temporada?
  const clubName = world.clubs[clubId]?.name;
  const champ = comp.champions.find((c) => c.season === world.season && c.champion === clubName);
  if (champ) return '🏆 Campeão';
  let lastIdx = -1;
  comp.rounds.forEach((r, ri) => {
    const hasUser = r.matchIds.some((id) =>
      store.matches.some((m) => m.id === id && (m.homeId === clubId || m.awayId === clubId)),
    );
    if (hasUser) lastIdx = ri;
  });
  if (lastIdx < 0) return null;
  const round = comp.rounds[lastIdx];
  const userMatches = store.matches.filter(
    (m) => round.matchIds.includes(m.id) && (m.homeId === clubId || m.awayId === clubId),
  );
  const playedCount = userMatches.filter((m) => m.played).length;
  const expected = Math.min(round.legs === 'two' ? 2 : 1, userMatches.length);
  if (playedCount < expected) return round.name;
  const nextHas = lastIdx + 1 < comp.rounds.length && comp.rounds[lastIdx + 1].matchIds.some((id) =>
    store.matches.some((m) => m.id === id && (m.homeId === clubId || m.awayId === clubId)),
  );
  return nextHas ? comp.rounds[lastIdx + 1].name : `Eliminado: ${round.name}`;
}

/** Fase (nome) a que uma partida pertence, se for de mata-mata. */
export function phaseOfMatch(world: World, m: Match): string | null {
  const comp = world.competitions[m.competitionId];
  if (!comp || comp.rounds.length === 0) return null;
  const store = knockoutStoreOf(world, comp);
  if (!store) return null;
  for (const r of comp.rounds) {
    if (r.matchIds.includes(m.id)) return r.name;
  }
  return null;
}
