import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, PlayerAvatar, Modal } from '../components';
import { fmtMoney } from '../../lib/format';
import { overallOf } from '../../game/overall';
import { expiringContracts } from '../../game/season';
import { SeasonSummary } from '../../lib/types';

function averageRating(s: { ratingSum: number; ratingCount: number }): number {
  return s.ratingCount > 0 ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : 0;
}

/** Fase exata em que o clube foi eliminado (ou chegou) numa copa, a partir das partidas reais. */
function cupRoundReached(
  store: { matches: { id: string; homeId: string; awayId: string; played: boolean }[] } | undefined,
  rounds: { name: string; matchIds: string[] }[],
  clubId: string,
): string | null {
  if (!store || rounds.length === 0) return null;
  const played = store.matches.filter(
    (m) => m.played && (m.homeId === clubId || m.awayId === clubId) && m.homeId !== '__TBD__' && m.awayId !== '__TBD__',
  );
  if (played.length === 0) return null;
  let lastRound = -1;
  rounds.forEach((r, ri) => {
    if (r.matchIds.some((id) => played.some((m) => m.id === id))) lastRound = Math.max(lastRound, ri);
  });
  return lastRound >= 0 ? rounds[lastRound].name : null;
}

type Tab = 'resumo' | 'competicoes' | 'financas' | 'melhores' | 'premios' | 'contratos' | 'evolucao' | 'recordes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumo', label: '📊 Resumo' },
  { id: 'competicoes', label: '🏆 Competições' },
  { id: 'financas', label: '💰 Finanças' },
  { id: 'melhores', label: '⭐ Melhores' },
  { id: 'premios', label: '🏅 Prêmios' },
  { id: 'contratos', label: '📄 Contratos' },
  { id: 'evolucao', label: '📈 Evolução' },
  { id: 'recordes', label: '🏟️ Recordes' },
];

export function SeasonEndScreen() {
  const { career, navigate, startNextSeason, clearSeasonSummary } = useGame();
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<Tab>('resumo');

  const world = career!.world;
  const summary: SeasonSummary | null = world.seasonEndSummary;
  const myClubId = career!.clubId;
  const myClub = myClubId ? world.clubs[myClubId] : null;
  const squad = useMemo(
    () => (myClubId ? Object.values(world.players).filter((p) => p.clubId === myClubId && p.status === 'active' && !p.arrivingUntil) : []),
    [world, myClubId],
  );

  const data = useMemo(() => {
    if (!summary) return null;
    const pos = myClubId ? summary.positions[myClubId] ?? null : null;
    const promoted = summary.promoted.some((p) => p.clubId === myClubId);
    const relegated = summary.relegated.some((p) => p.clubId === myClubId);
    const titles = [
      ...summary.leagues.filter((l) => l.championId === myClubId).map((l) => `🏆 ${l.name}`),
      ...summary.cups.filter((c) => c.champion === myClub?.name).map((c) => `🏆 ${c.name}`),
      ...(summary.continental && summary.continental.champion === myClub?.name ? [`🏆 ${summary.continental.name}`] : []),
    ];

    const flags = career!.flags;
    const comp = myClub ? world.competitions[myClub.leagueId] : null;
    const myRow = comp?.standings.find((s) => s.clubId === myClubId);

    // melhores jogadores do clube
    const statsPlayers = squad.map((p) => ({
      p,
      goals: p.seasonStats.goals,
      assists: p.seasonStats.assists,
      apps: p.seasonStats.apps,
      rating: averageRating(p.seasonStats),
      mom: p.seasonStats.manOfMatch,
      cleanSheets: p.seasonStats.cleanSheets,
      minutes: p.seasonStats.minutes,
    }));
    const topScorer = [...statsPlayers].sort((a, b) => b.goals - a.goals || b.rating - a.rating)[0];
    const topAssist = [...statsPlayers].sort((a, b) => b.assists - a.assists || b.rating - a.rating)[0];
    const topRated = [...statsPlayers].filter((s) => s.apps >= 8).sort((a, b) => b.rating - a.rating)[0];
    const topKeeper = [...statsPlayers]
      .filter((s) => (s.p.position === 'GK' || s.p.secondaryPositions?.includes('GK')) && s.apps >= 5)
      .sort((a, b) => b.cleanSheets - a.cleanSheets || b.rating - a.rating)[0];
    const revelation = [...statsPlayers]
      .filter((s) => s.p.age <= 21 && s.apps >= 5)
      .sort((a, b) => b.rating - a.rating)[0];

    // contratos terminando
    const expiring = myClubId ? expiringContracts(world, myClubId) : [];

    // prêmios individuais da temporada (jogadores do clube)
    const awardWinners = squad.filter((p) => p.awards.some((a) => a.season === world.season));
    const awardsByType = new Map<string, string[]>();
    for (const p of awardWinners) {
      for (const a of p.awards.filter((x) => x.season === world.season)) {
        const list = awardsByType.get(a.award) ?? [];
        list.push(`${p.firstName} ${p.lastName}${a.detail ? ` — ${a.detail}` : ''}`);
        awardsByType.set(a.award, list);
      }
    }

    // receitas/despesas da temporada (histórico financeiro mensal da temporada)
    const finance = myClub ? myClub.financeHistory.filter((f) => f.month.startsWith(world.season.slice(0, 4))) : [];
    const totalRevenue = finance.reduce((s, f) => s + f.revenue, 0);
    const totalExpenses = finance.reduce((s, f) => s + f.expenses, 0);
    const balance = totalRevenue - totalExpenses;

    // avaliação da diretoria (objetivos)
    const objectives = myClub?.objectives ?? [];
    const achieved = objectives.filter((o) => o.status === 'achieved').length;
    const failed = objectives.filter((o) => o.status === 'failed').length;
    const objectiveScore = objectives.length > 0
      ? Math.max(0, Math.min(10, Math.round(((achieved * 2 + (objectives.length - achieved - failed) * 1) / (objectives.length * 2)) * 10)))
      : 5;
    const boardNote =
      objectiveScore >= 8 ? 'Excelente temporada!' :
      objectiveScore >= 6 ? 'Boa temporada.' :
      objectiveScore >= 4 ? 'Temporada mediana.' :
      'Temporada abaixo do esperado.';

    // recordes quebrados nesta temporada
    const records = world.records.filter((r) => r.season === world.season);

    // evolução do elenco
    const development = (summary.development ?? []).filter((d) => d.clubId === myClubId);

    // resultado do clube em cada competição (apenas as que ele disputou, com a fase real alcançada)
    const competitionResults: { name: string; result: string; champion: string }[] = [];
    const leagueComp = myClub ? world.competitions[myClub.leagueId] : null;
    if (leagueComp) {
      const place = summary.positions[myClubId] ?? null;
      const leagueChamp = summary.leagues.find((l) => l.competitionId === leagueComp.id);
      // liga com mata-mata (ex.: Série D): a fase alcançada vem do chaveamento, não da tabela
      if (leagueComp.knockoutAfterGroups) {
        const koStore = world.cupMatches[leagueComp.id];
        const round = cupRoundReached(koStore, leagueComp.rounds, myClubId);
        const promoted = summary.promoted.some((p) => p.clubId === myClubId && p.from === leagueComp.id);
        const champ = leagueComp.champions.find((c) => c.season === world.season);
        const isChampion = champ?.champion === myClub?.name;
        const isRunnerUp = champ?.runnerUp === myClub?.name;
        competitionResults.push({
          name: leagueComp.name,
          result: isChampion
            ? '🏆 Campeão'
            : isRunnerUp
              ? '🥈 Vice-campeão'
              : promoted
                ? `⬆️ Promovido (${round ?? 'mata-mata'})`
                : round
                  ? `Eliminado: ${round}`
                  : place
                    ? `${place}º na fase de grupos`
                    : 'Participou',
          champion: champ?.champion ?? '—',
        });
      } else {
        competitionResults.push({
          name: leagueComp.name,
          result: place === 1 ? '🏆 Campeão' : place ? `${place}º lugar` : 'Participou',
          champion: leagueChamp?.champion ?? '—',
        });
      }
    }
    for (const cup of Object.values(world.competitions)) {
      if (cup.type !== 'cup' && cup.type !== 'continental') continue;
      const store = cup.type === 'continental' ? world.continentalMatches[cup.id] : world.cupMatches[cup.id];
      if (!store) continue;
      const participated = store.matches.some(
        (m) => (m.homeId === myClubId || m.awayId === myClubId) && m.homeId !== '__TBD__' && m.awayId !== '__TBD__',
      );
      if (!participated) continue;
      const champ = cup.champions.find((c) => c.season === world.season);
      const round = cupRoundReached(store, cup.rounds, myClubId);
      competitionResults.push({
        name: cup.name,
        result:
          champ?.champion === myClub?.name ? '🏆 Campeão' :
          champ?.runnerUp === myClub?.name ? '🥈 Vice-campeão' :
          round ? round : 'Participou',
        champion: champ?.champion ?? '—',
      });
    }

    return {
      pos, promoted, relegated, titles, myRow, flags, topScorer, topAssist, topRated, topKeeper,
      revelation, expiring, awardWinners, awardsByType, totalRevenue, totalExpenses, balance, objectives,
      achieved, failed, objectiveScore, boardNote, fanTrust: myClub?.fanTrust ?? 0,
      boardPatience: myClub?.boardPatience ?? 0, records, development, competitionResults,
      lastSeason: summary.lastSeason ?? null,
    };
  }, [summary, world, myClubId, myClub, squad, career]);

  if (!summary || !data) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center space-y-4 animate-fadeUp">
        <p className="text-3xl">🏁</p>
        <p className="text-slate-300 font-semibold">Temporada encerrada</p>
        <p className="text-slate-500 text-sm">O resumo desta temporada não está mais disponível.</p>
        <button onClick={() => { clearSeasonSummary(); navigate('dashboard'); }} className="btn-primary px-8 py-3">Voltar ao painel →</button>
      </div>
    );
  }

  const nextSeason = `${Number(world.season.slice(0, 4)) + 1}/${String((Number(world.season.slice(0, 4)) + 2) % 100).padStart(2, '0')}`;

  const risers = data.development.filter((d) => d.to > d.from).slice(0, 5);
  const fallers = data.development.filter((d) => d.to < d.from).slice(0, 5);

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fadeUp py-6 pb-16">
      {/* Cabeçalho */}
      <div className="text-center">
        <p className="text-sm text-slate-500 uppercase tracking-widest">🏁 Fim de temporada</p>
        <h1 className="font-display font-extrabold text-4xl text-slate-50 mt-1">Temporada {summary.season}</h1>
        {myClub && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <ClubCrest club={myClub} size={56} />
            <div className="text-left">
              <p className="font-semibold text-slate-100">{myClub.name}</p>
              <p className="text-sm text-slate-400">
                {data.pos ? `${data.pos}º lugar na liga` : 'Sem clube'} {data.promoted && '· ⬆️ Promovido!'} {data.relegated && '· ⬇️ Rebaixado!'}
              </p>
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-2">🌴 Intertemporada — a próxima temporada só começa quando você iniciar.</p>
      </div>

      {/* Menu de seções do fim de temporada */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === t.id ? 'bg-accent text-surface-950' : 'bg-surface-800 text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo por seção */}
      <div className="min-h-[220px]">
        {tab === 'resumo' && (
          <div className="space-y-5">
            {data.titles.length > 0 && (
              <div className="card p-5 border-gold/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-gold mb-2">🏆 Títulos conquistados</p>
                {data.titles.map((t, i) => <p key={i} className="text-lg font-display font-bold text-gold">{t}</p>)}
              </div>
            )}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">📊 Campanha</p>
                <div className="space-y-1 text-sm">
                  <p className="flex justify-between"><span className="text-slate-400">Vitórias</span><b>{data.flags.wins}</b></p>
                  <p className="flex justify-between"><span className="text-slate-400">Empates</span><b>{data.flags.draws}</b></p>
                  <p className="flex justify-between"><span className="text-slate-400">Derrotas</span><b>{data.flags.losses}</b></p>
                  <p className="flex justify-between"><span className="text-slate-400">Gols marcados</span><b>{data.flags.goalsFor}</b></p>
                  <p className="flex justify-between"><span className="text-slate-400">Gols sofridos</span><b>{data.flags.goalsAgainst}</b></p>
                  {data.myRow && (
                    <p className="flex justify-between border-t border-slate-800 pt-1">
                      <span className="text-slate-400">Pontos na liga</span><b>{data.myRow.points}</b>
                    </p>
                  )}
                </div>
              </div>
              <div className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">🏢 Diretoria</p>
                <p className="text-3xl font-display font-extrabold text-slate-100">{data.objectiveScore}<span className="text-lg text-slate-500">/10</span></p>
                <p className="text-sm text-slate-400 mt-1">{data.boardNote}</p>
                <p className="text-xs text-slate-500 mt-2">Paciência da diretoria: {data.boardPatience}%</p>
                {data.objectives.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {data.objectives.map((o, i) => (
                      <p key={i} className="text-xs flex justify-between">
                        <span className="text-slate-400">{o.kind === 'trophy' ? '🏆 Vencer título' : o.kind === 'continental' ? '🌍 Continental' : o.kind === 'avoid-relegation' ? '🛟 Evitar rebaixamento' : o.kind === 'promotion' ? '⬆️ Promoção' : o.kind === 'finances' ? '💰 Finanças' : o.kind === 'develop-youth' ? '🌱 Base' : o.kind === 'mid-table' ? '📊 Meio da tabela' : o.kind === 'cup-run' ? '🍾 Copa' : '🎯 Liga'}</span>
                        <span className={o.status === 'achieved' ? 'text-green-400' : o.status === 'failed' ? 'text-red-400' : 'text-slate-500'}>
                          {o.status === 'achieved' ? '✓' : o.status === 'failed' ? '✗' : '…'}
                        </span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
              <div className="card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">👥 Torcida</p>
                <p className="text-3xl font-display font-extrabold text-slate-100">{data.fanTrust}%</p>
                <p className="text-sm text-slate-400 mt-1">
                  {data.fanTrust >= 75 ? '🔥 Torcida entusiasmada com a temporada!' :
                   data.fanTrust >= 55 ? '🙂 Torcida satisfeita.' :
                   data.fanTrust >= 35 ? '😐 Torcida esperava mais.' :
                   '😡 Torcida decepcionada com a temporada.'}
                </p>
              </div>
            </div>
            {data.lastSeason && (
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">📅 Comparação com a temporada anterior ({data.lastSeason.season})</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(() => {
                    const curPos = data.pos ?? data.lastSeason!.position;
                    const items = [
                      { label: 'Posição', prev: data.lastSeason!.position, cur: curPos, lowerBetter: true },
                      { label: 'Pontos', prev: data.lastSeason!.points, cur: data.myRow?.points ?? data.lastSeason!.points, lowerBetter: false },
                      { label: 'Gols marcados', prev: data.lastSeason!.gf, cur: data.myRow?.gf ?? data.lastSeason!.gf, lowerBetter: false },
                      { label: 'Gols sofridos', prev: data.lastSeason!.ga, cur: data.myRow?.ga ?? data.lastSeason!.ga, lowerBetter: true },
                    ];
                    return items.map((it) => {
                      const diff = it.cur - it.prev;
                      const better = diff === 0 ? null : it.lowerBetter ? diff < 0 : diff > 0;
                      return (
                        <div key={it.label} className="rounded-lg bg-surface-800/40 border border-surface-700 p-3">
                          <p className="text-[11px] text-slate-500">{it.label}</p>
                          <p className="font-mono text-sm text-slate-200 mt-0.5">{it.prev} → {it.cur}</p>
                          <p className={`text-xs font-semibold ${better === null ? 'text-slate-500' : better ? 'text-green-400' : 'text-red-400'}`}>
                            {better === null ? '→ estável' : better ? `▲ melhorou` : `▼ piorou`}
                          </p>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {summary.topScorers.length > 0 && (
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🥇 Artilharia do continente</p>
                <div className="flex gap-6 flex-wrap">
                  {summary.topScorers.slice(0, 5).map((t, i) => (
                    <div key={i} className="text-center">
                      <p className="font-display font-bold text-2xl text-gold">{t.goals}</p>
                      <p className="text-sm text-slate-200">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.clubName}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'competicoes' && (
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🏆 Competições disputadas</p>
            {data.competitionResults.length === 0 && <p className="text-sm text-slate-500">Nenhuma competição finalizada.</p>}
            <div className="space-y-2">
              {data.competitionResults.map((c, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-surface-700 bg-surface-800/40 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{c.name}</p>
                    <p className="text-xs text-slate-500">Campeão: {c.champion}</p>
                  </div>
                  <span className={`badge border ${c.result.includes('🏆') ? 'bg-gold/15 text-gold border-gold/40' : c.result.includes('🥈') ? 'bg-slate-500/15 text-slate-200 border-slate-500/40' : 'bg-surface-700/50 text-slate-300 border-surface-600'}`}>
                    {c.result}
                  </span>
                </div>
              ))}
            </div>
            {(summary.promoted.length > 0 || summary.relegated.length > 0) && (
              <div className="grid md:grid-cols-2 gap-4 text-sm mt-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">⬆️ Promovidos</p>
                  {summary.promoted.map((p) => <p key={p.clubId} className="text-slate-300 py-0.5">{world.clubs[p.clubId]?.name ?? p.clubId}</p>)}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">⬇️ Rebaixados</p>
                  {summary.relegated.map((p) => <p key={p.clubId} className="text-slate-300 py-0.5">{world.clubs[p.clubId]?.name ?? p.clubId}</p>)}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'financas' && (
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">💰 Finanças da temporada</p>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                <p className="text-xs text-slate-400 mb-1">Receitas</p>
                <p className="text-xl font-display font-bold text-green-400">+ {fmtMoney(data.totalRevenue)}</p>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                <p className="text-xs text-slate-400 mb-1">Despesas</p>
                <p className="text-xl font-display font-bold text-red-400">- {fmtMoney(data.totalExpenses)}</p>
              </div>
              <div className="rounded-lg border border-surface-600 bg-surface-800/40 p-4">
                <p className="text-xs text-slate-400 mb-1">{data.balance >= 0 ? 'Lucro' : 'Prejuízo'}</p>
                <p className={`text-xl font-display font-bold ${data.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {data.balance >= 0 ? '+' : ''}{fmtMoney(data.balance)}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Saldo atual do clube: {fmtMoney(myClub?.balance ?? 0)} · Folha mensal: {fmtMoney((myClub?.wageBill ?? 0) * 4.33)}</p>
            <div className="mt-4 flex gap-2 flex-wrap">
              <button onClick={() => navigate('finances')} className="btn-secondary !py-2 text-sm">💰 Ver finanças →</button>
              <button onClick={() => navigate('stadium')} className="btn-secondary !py-2 text-sm">🏟️ Estádio →</button>
            </div>
          </div>
        )}

        {tab === 'melhores' && (
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">⭐ Destaques do elenco</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.topScorer && (
                <div className="bg-slate-800/40 rounded-lg p-3 text-center">
                  <PlayerAvatar player={data.topScorer.p} size={40} />
                  <p className="text-sm font-semibold text-slate-100 mt-1">{data.topScorer.p.firstName} {data.topScorer.p.lastName}</p>
                  <p className="text-xs text-slate-500">⚽ Artilheiro · {data.topScorer.goals} gols</p>
                </div>
              )}
              {data.topAssist && (
                <div className="bg-slate-800/40 rounded-lg p-3 text-center">
                  <PlayerAvatar player={data.topAssist.p} size={40} />
                  <p className="text-sm font-semibold text-slate-100 mt-1">{data.topAssist.p.firstName} {data.topAssist.p.lastName}</p>
                  <p className="text-xs text-slate-500">🎯 Mais assistências · {data.topAssist.assists}</p>
                </div>
              )}
              {data.topRated && (
                <div className="bg-slate-800/40 rounded-lg p-3 text-center">
                  <PlayerAvatar player={data.topRated.p} size={40} />
                  <p className="text-sm font-semibold text-slate-100 mt-1">{data.topRated.p.firstName} {data.topRated.p.lastName}</p>
                  <p className="text-xs text-slate-500">⭐ Melhor nota · {data.topRated.rating}</p>
                </div>
              )}
              {data.topKeeper && (
                <div className="bg-slate-800/40 rounded-lg p-3 text-center">
                  <PlayerAvatar player={data.topKeeper.p} size={40} />
                  <p className="text-sm font-semibold text-slate-100 mt-1">{data.topKeeper.p.firstName} {data.topKeeper.p.lastName}</p>
                  <p className="text-xs text-slate-500">🧤 Goleiro · {data.topKeeper.cleanSheets} jogos sem sofrer</p>
                </div>
              )}
              {data.revelation && (
                <div className="bg-slate-800/40 rounded-lg p-3 text-center">
                  <PlayerAvatar player={data.revelation.p} size={40} />
                  <p className="text-sm font-semibold text-slate-100 mt-1">{data.revelation.p.firstName} {data.revelation.p.lastName}</p>
                  <p className="text-xs text-slate-500">🌟 Revelação · {data.revelation.p.age} anos</p>
                </div>
              )}
            </div>
            <button onClick={() => navigate('squad')} className="btn-secondary !py-2 text-sm mt-4">👥 Ver elenco →</button>
          </div>
        )}

        {tab === 'premios' && (
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🏅 Prêmios individuais da temporada</p>
            {data.awardsByType.size === 0 ? (
              <p className="text-sm text-slate-500">Nenhum prêmio individual para jogadores do clube nesta temporada.</p>
            ) : (
              <div className="space-y-3">
                {Array.from(data.awardsByType.entries()).map(([award, names]) => (
                  <div key={award} className="rounded-lg border border-surface-700 bg-surface-800/40 px-4 py-3">
                    <p className="text-sm font-semibold text-gold">🏆 {award}</p>
                    <p className="text-sm text-slate-300 mt-0.5">{names.join(' · ')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'contratos' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">📄 Contratos terminando</p>
              {data.expiring.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum jogador com contrato no fim.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-400 mb-2">{data.expiring.length} jogador(es) com contrato no fim. Renove antes de iniciar a próxima temporada.</p>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {data.expiring.map((p) => (
                      <p key={p.id} className="text-sm flex justify-between">
                        <span className="text-slate-200">{p.firstName} {p.lastName}</span>
                        <span className="text-slate-500 text-xs">{overallOf(p)} OVR</span>
                      </p>
                    ))}
                  </div>
                  <button onClick={() => navigate('squad')} className="btn-secondary w-full !py-2 text-sm mt-3">Renovar no Elenco →</button>
                </>
              )}
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">👴 Aposentadorias</p>
              {summary.retired.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma aposentadoria nesta temporada.</p>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {summary.retired.slice(0, 10).map((r, i) => (
                    <p key={i} className="text-sm text-slate-300">{r.name} <span className="text-slate-500 text-xs">— {r.clubName} · {r.age} anos</span></p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'evolucao' && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-2">📈 Quem mais evoluiu</p>
              {risers.length === 0 ? (
                <p className="text-sm text-slate-500">Sem evolução relevante no elenco.</p>
              ) : (
                <div className="space-y-1.5">
                  {risers.map((d) => (
                    <p key={d.playerId} className="text-sm flex justify-between">
                      <span className="text-slate-200">{d.name}</span>
                      <span className="font-mono text-green-400">{d.from} → {d.to} <span className="text-[10px]">↑{d.to - d.from}</span></span>
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">📉 Queda de rendimento</p>
              {fallers.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma queda de rendimento no elenco.</p>
              ) : (
                <div className="space-y-1.5">
                  {fallers.map((d) => (
                    <p key={d.playerId} className="text-sm flex justify-between">
                      <span className="text-slate-200">{d.name}</span>
                      <span className="font-mono text-red-400">{d.from} → {d.to} <span className="text-[10px]">↓{d.from - d.to}</span></span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'recordes' && (
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🏟️ Recordes quebrados nesta temporada</p>
            {data.records.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum recorde quebrado nesta temporada.</p>
            ) : (
              <div className="space-y-2">
                {data.records.map((r) => (
                  <div key={r.key} className="flex items-center justify-between rounded-lg border border-gold/30 bg-gold/5 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">🔥 {r.label}</p>
                      <p className="text-xs text-slate-500">Detentor: {r.holder}</p>
                    </div>
                    <span className="font-mono font-bold text-gold">
                      {typeof r.value === 'string' ? r.value : r.key.includes('transfer') ? fmtMoney(Number(r.value)) : r.value}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => navigate('records')} className="btn-secondary !py-2 text-sm mt-4">🏟️ Ver todos os recordes →</button>
          </div>
        )}
      </div>

      {/* Intertemporada + iniciar próxima */}
      <div className="card p-5 border-accent/40 bg-accent/5">
        <p className="text-sm font-semibold text-slate-100 mb-1">🌴 Intertemporada</p>
        <p className="text-xs text-slate-400 mb-4">
          Sem partidas oficiais. Aproveite para contratar, vender, renovar contratos, melhorar o estádio e ajustar as finanças.
          A temporada <b className="text-accent">{nextSeason}</b> só começa quando você quiser.
        </p>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('dashboard')} className="btn-secondary px-5 py-3">Continuar na intertemporada →</button>
          <button onClick={() => setConfirming(true)} className="btn-primary px-6 py-3">🚀 Iniciar temporada {nextSeason}</button>
        </div>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title={`⚠️ Iniciar temporada ${nextSeason}?`}>
        <div className="text-sm text-slate-400 mb-3">Essa ação irá:</div>
        <ul className="text-sm text-slate-300 space-y-1.5 mb-5">
          <li>✓ Atualizar elencos e salários</li>
          <li>✓ Gerar novo calendário e competições</li>
          <li>✓ Processar promoções/rebaixamentos</li>
          <li>✓ Atualizar idade dos jogadores</li>
          <li>✓ Gerar objetivos da diretoria</li>
        </ul>
        <div className="flex gap-3">
          <button onClick={() => setConfirming(false)} className="btn-secondary flex-1 py-2.5">Cancelar</button>
          <button
            onClick={() => { setConfirming(false); startNextSeason(); }}
            className="btn-primary flex-1 py-2.5"
          >
            🚀 Iniciar Temporada
          </button>
        </div>
      </Modal>
    </div>
  );
}
