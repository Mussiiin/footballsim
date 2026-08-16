import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, PlayerAvatar, Modal } from '../components';
import { formatDateBR } from '../../lib/date';
import { fmtMoney, fmtInt } from '../../lib/format';
import { overallOf } from '../../game/overall';
import { expiringContracts } from '../../game/season';
import { SeasonSummary } from '../../lib/types';

function averageRating(s: { ratingSum: number; ratingCount: number }): number {
  return s.ratingCount > 0 ? Math.round((s.ratingSum / s.ratingCount) * 10) / 10 : 0;
}

export function SeasonEndScreen() {
  const { career, navigate, startNextSeason, clearSeasonSummary } = useGame();
  const [confirming, setConfirming] = useState(false);

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

    // estatísticas do clube na temporada (soma da última partida jogada na liga + copas)
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
    // prêmios da temporada (jogadores do clube)
    const awardWinners = squad.filter((p) => p.awards.some((a) => a.season === world.season));

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

    return {
      pos, promoted, relegated, titles, myRow, flags, topScorer, topAssist, topRated, topKeeper,
      revelation, expiring, awardWinners, totalRevenue, totalExpenses, balance, objectives,
      achieved, failed, objectiveScore, boardNote, fanTrust: myClub?.fanTrust ?? 0,
      boardPatience: myClub?.boardPatience ?? 0,
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

      {data.titles.length > 0 && (
        <div className="card p-5 border-gold/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold mb-2">🏆 Títulos conquistados</p>
          {data.titles.map((t, i) => <p key={i} className="text-lg font-display font-bold text-gold">{t}</p>)}
        </div>
      )}

      {/* Classificação e desempenho */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">📊 Campanha</p>
          <div className="space-y-1 text-sm">
            <p className="flex justify-between"><span className="text-slate-400">Vitórias</span><b>{data.flags.wins}</b></p>
            <p className="flex justify-between"><span className="text-slate-400">Empates</span><b>{data.flags.draws}</b></p>
            <p className="flex justify-between"><span className="text-slate-400">Derrotas</span><b>{data.flags.losses}</b></p>
            <p className="flex justify-between"><span className="text-slate-400">Gols marcados</span><b>{data.flags.goalsFor}</b></p>
            <p className="flex justify-between"><span className="text-slate-400">Gols sofridos</span><b>{data.flags.goalsAgainst}</b></p>
          </div>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">🏆 Competições</p>
          <div className="space-y-1.5 text-sm">
            {summary.leagues.map((l) => (
              <p key={l.competitionId} className="flex justify-between"><span className="text-slate-400">{l.name}</span><span className="text-gold font-semibold">{l.champion}</span></p>
            ))}
            {summary.cups.map((c, i) => <p key={i} className="flex justify-between"><span className="text-slate-400">{c.name}</span><span className="text-gold font-semibold">{c.champion}</span></p>)}
            {summary.continental && <p className="flex justify-between"><span className="text-slate-400">{summary.continental.name}</span><span className="text-gold font-semibold">{summary.continental.champion}</span></p>}
            {summary.leagues.length === 0 && <p className="text-slate-500 text-xs">Sem ligas finalizadas.</p>}
          </div>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">💰 Finanças da temporada</p>
          <div className="space-y-1 text-sm">
            <p className="flex justify-between"><span className="text-slate-400">Receitas</span><b className="text-green-400">+ {fmtMoney(data.totalRevenue)}</b></p>
            <p className="flex justify-between"><span className="text-slate-400">Despesas</span><b className="text-red-400">- {fmtMoney(data.totalExpenses)}</b></p>
            <p className="flex justify-between border-t border-slate-800 pt-1">
              <span className="text-slate-400">{data.balance >= 0 ? 'Lucro' : 'Prejuízo'}</span>
              <b className={data.balance >= 0 ? 'text-green-400' : 'text-red-400'}>{data.balance >= 0 ? '+' : ''}{fmtMoney(data.balance)}</b>
            </p>
            <p className="flex justify-between text-xs text-slate-500"><span>Saldo atual</span><span>{fmtMoney(myClub?.balance ?? 0)}</span></p>
          </div>
        </div>
      </div>

      {/* Melhores jogadores */}
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
          {data.awardWinners.length > 0 && (
            <div className="bg-slate-800/40 rounded-lg p-3 text-center">
              <p className="text-sm font-semibold text-slate-100 mt-1">🏅 Prêmios</p>
              <p className="text-xs text-slate-500">{data.awardWinners.slice(0, 3).map((p) => p.firstName).join(', ')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Diretoria e torcida */}
      <div className="grid md:grid-cols-2 gap-4">
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

      {/* Contratos e aposentadorias */}
      {(data.expiring.length > 0 || summary.retired.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {data.expiring.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">📄 Contratos terminando</p>
              <p className="text-xs text-slate-400 mb-2">{data.expiring.length} jogador(es) com contrato no fim. Renove antes de iniciar a próxima temporada.</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {data.expiring.map((p) => (
                  <p key={p.id} className="text-sm flex justify-between">
                    <span className="text-slate-200">{p.firstName} {p.lastName}</span>
                    <span className="text-slate-500 text-xs">{overallOf(p)} OVR</span>
                  </p>
                ))}
              </div>
              <button onClick={() => navigate('squad')} className="btn-secondary w-full !py-2 text-sm mt-3">Renovar no Elenco →</button>
            </div>
          )}
          {summary.retired.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">👴 Aposentadorias</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {summary.retired.slice(0, 10).map((r, i) => (
                  <p key={i} className="text-sm text-slate-300">{r.name} <span className="text-slate-500 text-xs">— {r.clubName} · {r.age} anos</span></p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Promovidos/rebaixados e recordes */}
      {(summary.promoted.length > 0 || summary.relegated.length > 0) && (
        <div className="card p-5">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">⬆️ Promovidos</p>
              {summary.promoted.map((p) => <p key={p.clubId} className="text-slate-300 py-0.5">{world.clubs[p.clubId]?.name ?? p.clubId}</p>)}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">⬇️ Rebaixados</p>
              {summary.relegated.map((p) => <p key={p.clubId} className="text-slate-300 py-0.5">{world.clubs[p.clubId]?.name ?? p.clubId}</p>)}
            </div>
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
