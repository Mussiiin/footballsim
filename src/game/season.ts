import {
  World, Career, Club, Competition, Player, SeasonHistoryEntry, HallOfFameEntry, SeasonSummary,
  DIFFICULTY_CONFIG,
} from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { overallOf, estimateValue, estimateWage, refreshClubCaches } from './overall';
import { clamp } from '../lib/format';
import { addDays } from '../lib/date';
import { sortedStandings, topScorersOf } from './competitions';
import { seasonalDevelopment, agePlayers, processRetirements, advanceYouthSeason } from './development';
import { addNews, newsFromTitle, newsFromRetirement, notify } from './news';
import { isVitalPlayer, squadOf } from './transfers';
import { balanceAllSquads } from './squad';
import { resetMatchCounter, leagueFixtures, cupFixtures, continentalFixtures } from './worldgen';
import { stadiumSeasonReset } from './stadium';

function nextSeason(season: string): string {
  const y = Number(season.slice(0, 4));
  return `${y + 1}/${String((y + 2) % 100).padStart(2, '0')}`;
}

// ------------------------------------------------------------
// 1. Finaliza ligas
// ------------------------------------------------------------
function finalizeLeagues(world: World, summary: SeasonSummary): void {
  for (const country of world.countries) {
    for (const lid of country.divisions) {
      const comp = world.competitions[lid];
      const sorted = sortedStandings(comp);
      if (sorted.length === 0) continue;
      const champion = world.clubs[sorted[0].clubId];
      const runnerUp = world.clubs[sorted[1]?.clubId ?? sorted[0].clubId];

      // premiação por posição
      const prize = (pos: number): number => {
        if (pos === 1) return comp.prizeMoney.champion ?? 0;
        if (pos === 2) return comp.prizeMoney.runnerUp ?? 0;
        if (comp.tier === 1) {
          if (pos <= 5) return 1_800_000 - (pos - 3) * 300_000;
          if (pos <= 10) return 600_000;
          if (pos <= 15) return 300_000;
          return 150_000;
        }
        if (comp.tier === 2) return pos <= 5 ? 400_000 : 150_000;
        return pos <= 5 ? 120_000 : 50_000;
      };
      sorted.forEach((s, i) => {
        const club = world.clubs[s.clubId];
        if (!club) return;
        const p = prize(i + 1);
        if (p > 0) {
          club.balance += p;
          club.financeAccum.revenue += p;
        }
        club.lastSeasonPosition = i + 1;
        // snapshot completo da temporada (para comparação no resumo do ano seguinte)
        club.lastSeason = { season: comp.season, position: i + 1, points: s.points, gf: s.gf, ga: s.ga };
        summary.positions[s.clubId] = i + 1;
      });

      comp.champions.push({
        season: comp.season,
        champion: champion.name,
        runnerUp: runnerUp.name,
      });
      champion.titles.push({ competitionId: comp.id, competitionName: comp.name, season: comp.season });
      champion.reputation = clamp(champion.reputation + 2, 5, 99);
      newsFromTitle(world, champion.name, comp.name, world.date);

      summary.leagues.push({
        competitionId: comp.id,
        name: comp.name,
        champion: champion.name,
        runnerUp: runnerUp.name,
        championId: champion.id,
      });

      // promoção e rebaixamento
      if (comp.rules.relegationSpots > 0) {
        const bottom = sorted.slice(-comp.rules.relegationSpots).map((s) => s.clubId);
        for (const cid of bottom) {
          const club = world.clubs[cid];
          const toId = `${country.id}_L${comp.tier + 1}`;
          if (club && world.competitions[toId]) {
            summary.relegated.push({ clubId: cid, from: comp.id, to: toId });
            club.reputation = clamp(club.reputation - 3, 5, 99);
          }
        }
      }
      if (comp.rules.promotionSpots > 0) {
        const top = sorted.slice(0, comp.rules.promotionSpots).map((s) => s.clubId);
        for (const cid of top) {
          const club = world.clubs[cid];
          const toId = `${country.id}_L${comp.tier - 1}`;
          if (club && world.competitions[toId]) {
            summary.promoted.push({ clubId: cid, from: comp.id, to: toId });
            club.reputation = clamp(club.reputation + 3, 5, 99);
          }
        }
      }
      comp.status = 'finished';
    }
  }
}

// ------------------------------------------------------------
// 2. Contratos
// ------------------------------------------------------------
function processContracts(world: World, career: Career | null): void {
  const seasonEnd = `${Number(world.season.slice(0, 4)) + 1}-06-30`;
  for (const p of Object.values(world.players)) {
    if (p.status !== 'active' || !p.contract || !p.clubId) continue;
    if (p.contract.until < seasonEnd) {
      const club = world.clubs[p.clubId];
      // IA renova se importante
      if (club && !club.isUserControlled && isVitalPlayer(world, p)) {
        p.contract.until = `${Number(seasonEnd.slice(0, 4)) + rngInt(2, 4)}-06-30`;
        p.contract.wage = Math.round(p.contract.wage * 1.1);
        // salário aumentou → mantém a folha salarial do clube consistente
        if (club) refreshClubCaches(club, squadOf(world, club.id));
        continue;
      }
      if (club?.isUserControlled && career && isVitalPlayer(world, p)) {
        // jogador importante do usuário vira livre se não renovado
        notify(career, `${p.firstName} ${p.lastName} está sem contrato e saiu do clube!`, 'danger', '⚠️');
      }
      p.clubId = null;
      p.isLoan = false;
      p.parentClubId = null;
      if (club) refreshClubCaches(club, squadOf(world, club.id));
    }
  }
}

function rngInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ------------------------------------------------------------
// 3. Histórico de temporada dos jogadores
// ------------------------------------------------------------
function writePlayerHistories(world: World): void {
  const titlesByClub = new Map<string, string[]>();
  for (const club of Object.values(world.clubs)) {
    const won = club.titles.filter((t) => t.season === world.season).map((t) => t.competitionName);
    if (won.length > 0) titlesByClub.set(club.id, won);
  }

  // prêmios individuais da temporada (calculados a partir de estatísticas reais)
  const players = Object.values(world.players).filter((p) => p.status === 'active');
  const topScorer = [...players].sort((a, b) => b.seasonStats.goals - a.seasonStats.goals)[0];
  const bestRated = [...players].filter((p) => p.seasonStats.ratingCount >= 8)
    .sort((a, b) => (b.seasonStats.ratingSum / b.seasonStats.ratingCount) - (a.seasonStats.ratingSum / a.seasonStats.ratingCount))[0];
  const bestYoung = [...players].filter((p) => p.age <= 21 && p.seasonStats.ratingCount >= 5)
    .sort((a, b) => (b.seasonStats.ratingSum / b.seasonStats.ratingCount) - (a.seasonStats.ratingSum / a.seasonStats.ratingCount))[0];
  const teamOfSeason = [...players]
    .filter((p) => p.seasonStats.ratingCount >= 8)
    .sort((a, b) => (b.seasonStats.ratingSum / b.seasonStats.ratingCount) - (a.seasonStats.ratingSum / a.seasonStats.ratingCount))
    .slice(0, 11);
  const awardFor = (p: Player, award: string, detail?: string) => {
    if (p) {
      p.awards.push({ season: world.season, award, detail });
      if (p.awards.length > 40) p.awards.shift();
    }
  };
  if (topScorer && topScorer.seasonStats.goals > 0) awardFor(topScorer, 'Artilheiro da temporada', `${topScorer.seasonStats.goals} gols`);
  if (bestRated && bestRated.seasonStats.apps > 0) awardFor(bestRated, 'Melhor jogador da temporada', `${(bestRated.seasonStats.ratingSum / bestRated.seasonStats.ratingCount).toFixed(1)} de média`);
  if (bestYoung) awardFor(bestYoung, 'Melhor jovem da temporada');
  for (const tp of teamOfSeason) awardFor(tp, 'Seleção da temporada');

  for (const p of players) {
    if (p.seasonStats.apps === 0 && p.clubId === null) continue;
    const rating = p.seasonStats.ratingCount > 0
      ? Math.round((p.seasonStats.ratingSum / p.seasonStats.ratingCount) * 10) / 10
      : 6.5;
    const seasonAwards = p.awards.filter((a) => a.season === world.season).map((a) => a.award);
    p.history.push({
      season: world.season,
      clubId: p.clubId ?? '',
      clubName: p.clubId ? world.clubs[p.clubId]?.name ?? 'Sem clube' : 'Sem clube',
      apps: p.seasonStats.apps,
      starts: p.seasonStats.starts,
      goals: p.seasonStats.goals,
      assists: p.seasonStats.assists,
      rating,
      titles: p.clubId ? titlesByClub.get(p.clubId) ?? [] : [],
      awards: seasonAwards,
      minutes: p.seasonStats.minutes,
      shots: p.seasonStats.shots,
      shotsOnTarget: p.seasonStats.shotsOnTarget,
      passes: p.seasonStats.passes,
      tackles: p.seasonStats.tackles,
      interceptions: p.seasonStats.interceptions,
      keyPasses: p.seasonStats.keyPasses,
      xg: Math.round(p.seasonStats.xg * 10) / 10,
      xa: Math.round(p.seasonStats.xa * 10) / 10,
    });
    if (p.history.length > 20) p.history.shift();
  }
}

// ------------------------------------------------------------
// 4. Registros e hall da fama
// ------------------------------------------------------------
function updateRecordsAndHall(world: World): void {
  // artilheiro da temporada (todas as competições)
  let best: { name: string; goals: number; clubName: string; id: string } | null = null;
  for (const p of Object.values(world.players)) {
    if (p.seasonStats.goals > (best?.goals ?? 0)) {
      best = {
        name: `${p.firstName} ${p.lastName}`,
        goals: p.seasonStats.goals,
        clubName: p.clubId ? world.clubs[p.clubId]?.name ?? '—' : '—',
        id: p.id,
      };
    }
  }
  if (best && best.goals > 15) {
    const rec = world.records.find((r) => r.key === 'top_scorer');
    if (rec) {
      if (best.goals > (rec.value as number)) {
        rec.value = best.goals;
        rec.holder = `${best.name} (${best.clubName})`;
        rec.season = world.season;
      }
    }
    // hall da fama
    if (best.goals >= 30) {
      world.hallOfFame.push({
        name: best.name,
        kind: 'jogador',
        detail: `${best.goals} gols em ${world.season}`,
        season: world.season,
      });
    }
  }
  // clubes dominantes
  for (const club of Object.values(world.clubs)) {
    if (club.titles.length >= 5 && club.titles.length % 5 === 0) {
      world.hallOfFame.push({
        name: club.name,
        kind: 'clube',
        detail: `${club.titles.length} títulos conquistados`,
        season: world.season,
      });
    }
  }
  if (world.hallOfFame.length > 60) world.hallOfFame.splice(0, world.hallOfFame.length - 60);
}

// ------------------------------------------------------------
// 5. Nova temporada
// ------------------------------------------------------------
function setupNewSeason(world: World): void {
  const newSeason = nextSeason(world.season);
  const prevSeason = world.season; // temporada que acaba de terminar (para o histórico do estádio)
  const seasonYear = Number(newSeason.slice(0, 4));

  // comprime: mantém só partidas do clube do usuário e apaga o resto
  const userClubId = Object.values(world.clubs).find((c) => c.isUserControlled)?.id ?? null;
  const keepUser = (clubId: string) => userClubId === null || clubId === userClubId;

  for (const key of Object.keys(world.leagueMatches)) {
    world.leagueMatches[key] = world.leagueMatches[key].filter((m) => keepUser(m.homeId) || keepUser(m.awayId));
  }
  for (const key of Object.keys(world.cupMatches)) {
    const store = world.cupMatches[key];
    store.matches = store.matches.filter((m) => keepUser(m.homeId) || keepUser(m.awayId));
    store.roundWinners = {};
    store.refs = {};
  }
  for (const key of Object.keys(world.continentalMatches)) {
    const store = world.continentalMatches[key];
    store.matches = store.matches.filter((m) => keepUser(m.homeId) || keepUser(m.awayId));
    store.roundWinners = {};
    store.refs = {};
    store.groups = {};
  }
  resetMatchCounter();

  world.season = newSeason;
  world.seasonNumber++;
  world.date = `${seasonYear}-07-01`;
  world.generationCount++;
  world.seasonEvents = [];

  // zera estatísticas de temporada
  for (const p of Object.values(world.players)) {
    p.seasonStats = {
      apps: 0, starts: 0, goals: 0, assists: 0, yellows: 0, reds: 0, minutes: 0,
      ratingSum: 0, ratingCount: 0, cleanSheets: 0, manOfMatch: 0,
      shots: 0, shotsOnTarget: 0, passes: 0, tackles: 0, interceptions: 0,
      keyPasses: 0, xg: 0, xa: 0,
    };
    p.avgRating = 6.5;
    p.lastRatings = [];
    p.suspension = 0;
    p.condition = clamp(p.condition + 20, 1, 100);
    p.fatigue = Math.max(0, p.fatigue - 30);
    p.morale = clamp(p.morale + 5, 1, 100);
    if (p.clubId) {
      p.value = estimateValue(overallOf(p), p.age, p.potential, p.reputation, 1);
      if (p.contract && p.contract.wage < 400) p.contract.wage = estimateWage(overallOf(p), p.age, p.reputation);
    }
  }

  // recalcula folha salarial de todos os clubes após o reset (salários e elencos mudaram)
  for (const club of Object.values(world.clubs)) {
    refreshClubCaches(club, squadOf(world, club.id));
    // forma dos clubes começa zerada na nova temporada (não herda resultados antigos)
    club.lastResults = [];
    // estádio: histórico da temporada, camarotes e naming rights renovam
    stadiumSeasonReset(world, club, prevSeason);
  }

  // padronização de elencos: completa lacunas que surgiram ao longo da temporada
  balanceAllSquads(world, seasonYear);

  // atualiza clubes: ligas após promoção/rebaixamento
  for (const country of world.countries) {
    for (const lid of country.divisions) {
      const comp = world.competitions[lid];
      comp.season = newSeason;
      comp.status = 'scheduled';
      comp.standings = [];
      comp.rounds = [];
      comp.currentRoundIndex = 0;
      comp.topScorers = [];
    }
  }

  // notícia de abertura
  addNews(world, {
    date: world.date,
    title: `Temporada ${newSeason} começa!`,
    subtitle: 'Novas batalhas, novos campeões. Boa sorte a todos os clubes.',
    category: 'Clubes',
    importance: 40,
  });
}

// ------------------------------------------------------------
// Ciclo completo — dividido em duas fases:
//  finalizeSeason  → encerra a temporada atual (resumo, prêmios, desenvolvimento, histórico)
//  startNextSeason → monta a temporada seguinte (calendário, promoções/rebaixamentos)
// A separação permite que o jogador veja o resumo e fique na intertemporada antes de avançar.
// ------------------------------------------------------------
export function finalizeSeason(world: World, career: Career | null, difficulty: Career['difficulty']): SeasonSummary {
  const summary: SeasonSummary = {
    season: world.season,
    leagues: [],
    cups: [],
    continental: null,
    topScorers: [],
    promoted: [],
    relegated: [],
    retired: [],
    positions: {},
    // guarda a temporada anterior ANTES de finalizeLeagues sobrescrever o snapshot do clube
    lastSeason: career?.clubId ? world.clubs[career.clubId]?.lastSeason ?? null : null,
  };

  // finais de copas e continental (se ainda não finalizados)
  finalizeLeagues(world, summary);

  // copas já finalizadas pelo syncBrackets; registra no resumo
  for (const country of world.countries) {
    const cup = world.competitions[country.cupId];
    if (cup.champions.some((c) => c.season === world.season)) {
      const champ = cup.champions.find((c) => c.season === world.season)!;
      summary.cups.push({ competitionId: cup.id, name: cup.name, champion: champ.champion, championId: '', runnerUp: champ.runnerUp });
      newsFromTitle(world, champ.champion, cup.name, world.date);
    }
  }
  const cont = world.competitions['CONTINENTAL'];
  if (cont.champions.some((c) => c.season === world.season)) {
    const champ = cont.champions.find((c) => c.season === world.season)!;
    summary.continental = { competitionId: cont.id, name: cont.name, champion: champ.champion, championId: '', runnerUp: champ.runnerUp };
    newsFromTitle(world, champ.champion, cont.name, world.date);
  }

  summary.topScorers = topScorersOf(world, world.countries[0].divisions[0], 10);

  // evolução sazonal — captura o overall antes/depois para mostrar no resumo
  const devBefore = new Map<string, number>();
  for (const p of Object.values(world.players)) {
    if (p.status === 'active') devBefore.set(p.id, overallOf(p));
  }
  seasonalDevelopment(world, DIFFICULTY_CONFIG[difficulty].devSpeed);
  if (career?.clubId) {
    summary.development = Object.values(world.players)
      .filter((p) => p.status === 'active' && p.clubId === career.clubId && devBefore.has(p.id))
      .map((p) => ({
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        clubId: p.clubId ?? '',
        from: devBefore.get(p.id)!,
        to: overallOf(p),
      }))
      .filter((d) => d.from !== d.to)
      .sort((a, b) => (b.to - b.from) - (a.to - a.from))
      .slice(0, 20);
  }

  // envelhece
  const newStart = `${Number(world.season.slice(0, 4)) + 1}-07-01`;
  agePlayers(world, newStart);

  // contratos
  processContracts(world, career);

  // aposentadorias
  const retired = processRetirements(world);
  summary.retired = retired;
  for (const r of retired) {
    newsFromRetirement(world, r.name, r.age, world.date);
  }

  // categorias de base: forma os juniores mais promissores e renova a fornada
  advanceYouthSeason(world, career);

  // histórico de jogadores
  writePlayerHistories(world);

  // registros e hall da fama
  updateRecordsAndHall(world);

  // histórico de temporada do mundo
  world.history.push({
    season: world.season,
    leagues: summary.leagues.map((l) => ({
      competitionId: l.competitionId,
      champion: l.champion,
      runnerUp: l.runnerUp,
      championId: l.championId,
    })),
    cups: summary.cups.map((c) => ({
      competitionId: c.competitionId,
      champion: c.champion,
      championId: c.championId,
    })),
    continental: summary.continental ? [{
      competitionId: summary.continental.competitionId,
      champion: summary.continental.champion,
      championId: summary.continental.championId,
    }] : [],
    topScorers: summary.topScorers.map((t) => ({ playerId: t.playerId, name: t.name, clubName: t.clubName, goals: t.goals })),
    recordTransfers: world.transfers.slice(0, 5).map((t) => ({
      playerName: t.playerName,
      fromClubName: t.fromClubName,
      toClubName: t.toClubName,
      fee: t.fee,
    })),
    retired: retired.map((r) => ({ playerName: r.name, clubName: r.clubName, age: r.age })),
  });

  // marca a intertemporada: a temporada atual está encerrada, aguardando o usuário
  // iniciar a próxima (startNextSeason) — nunca avança sozinho.
  world.seasonEnded = true;
  world.seasonEndSummary = summary;

  return summary;
}

/**
 * Monta a temporada seguinte. Deve ser chamado APENAS pelo usuário (botão "Iniciar próxima
 * temporada"), após ele analisar o resumo e fazer o que quiser na intertemporada.
 */
export function startNextSeason(world: World, career: Career | null, difficulty: Career['difficulty']): void {
  const summary = world.seasonEndSummary;
  if (!summary) return;

  // nova temporada
  setupNewSeason(world);

  // promove/rebaixa clubes (leagueId) — feito após setupNewSeason
  for (const r of summary.relegated) {
    const club = world.clubs[r.clubId];
    if (club) club.leagueId = r.to;
  }
  for (const r of summary.promoted) {
    const club = world.clubs[r.clubId];
    if (club) club.leagueId = r.to;
  }
  // recalcula clubIds das ligas APÓS as mudanças (fonte da verdade)
  for (const country of world.countries) {
    for (const lid of country.divisions) {
      const comp = world.competitions[lid];
      comp.clubIds = [];
      for (const club of Object.values(world.clubs)) {
        if (club.countryId === country.id && club.leagueId === lid) comp.clubIds.push(club.id);
      }
      comp.clubIds.sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation);
      // tabela SEMPRE reconstruída a partir dos clubes corretos
      comp.standings = comp.clubIds.map((clubId) => ({
        clubId, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0, form: [],
      }));
    }
  }

  // copas e continental com os clubes atualizados (world.season já é a nova temporada)
  const curSeason = world.season;
  for (const country of world.countries) {
    const cup = world.competitions[country.cupId];
    cup.season = curSeason;
    cup.status = 'scheduled';
    cup.clubIds = [];
    cup.rounds = [];
    cup.currentRoundIndex = 0;
    for (const lid of country.divisions) {
      for (const cid of world.competitions[lid].clubIds) cup.clubIds.push(cid);
    }
  }
  const cont2 = world.competitions['CONTINENTAL'];
  cont2.season = curSeason;
  cont2.status = 'scheduled';
  cont2.clubIds = [];
  cont2.standings = [];
  cont2.rounds = [];
  cont2.currentRoundIndex = 0;
  for (const country of world.countries) {
    const l1 = world.competitions[country.divisions[0]];
    const sorted = [...l1.clubIds].sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation);
    for (const cid of sorted.slice(0, 4)) cont2.clubIds.push(cid);
  }

  // regenera calendário
  regenerateCalendar(world);

  // sai da intertemporada
  world.seasonEnded = false;
  world.seasonEndSummary = null;
}

function regenerateCalendar(world: World): void {
  const rng = new RNG(hashString(world.seed) ^ hashString(world.season + 'cal'));

  for (const country of world.countries) {
    for (const lid of country.divisions) {
      const comp = world.competitions[lid];
      world.leagueMatches[comp.id] = leagueFixtures(comp.clubIds, world, rng, comp);
    }
    const cup = world.competitions[country.cupId];
    const cf = cupFixtures(cup, world, rng);
    world.cupMatches[cup.id] = { matches: cf.matches, roundWinners: {}, refs: cf.refs };
    cup.rounds = cf.rounds;
  }
  const cont = world.competitions['CONTINENTAL'];
  const ctf = continentalFixtures(cont, world, rng);
  world.continentalMatches[cont.id] = { matches: ctf.matches, roundWinners: {}, refs: ctf.refs, groups: ctf.groups };
  cont.rounds = ctf.rounds;
}

/** Jogadores com contrato expirando em breve (aviso). */
export function expiringContracts(world: World, clubId: string): Player[] {
  const end = `${Number(world.season.slice(0, 4)) + 1}-06-30`;
  return Object.values(world.players).filter(
    (p) => p.clubId === clubId && p.status === 'active' && p.contract && p.contract.until <= end,
  );
}

export function isSeasonOver(world: World): boolean {
  // última partida da temporada foi jogada e estamos após o fim do calendário
  for (const list of Object.values(world.leagueMatches)) {
    for (const m of list) {
      if (!m.played) return false;
    }
  }
  return true;
}
