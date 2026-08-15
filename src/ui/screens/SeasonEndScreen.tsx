import { useGame } from '../../state/store';
import { ClubCrest } from '../components';

export function SeasonEndScreen() {
  const { seasonSummary, clearSeasonSummary, navigate, career } = useGame();

  if (!seasonSummary) {
    return <div className="card p-8 text-slate-500">Sem resumo disponível.</div>;
  }

  const s = seasonSummary;
  const world = career!.world;
  const myClubId = career!.clubId;
  const myClub = myClubId ? world.clubs[myClubId] : null;

  const myTitles = [
    ...s.leagues.filter((l) => l.championId === myClubId).map((l) => `🏆 ${l.name}`),
    ...s.cups.filter((c) => c.champion === myClub?.name).map((c) => `🏆 ${c.name}`),
    ...(s.continental && s.continental.champion === myClub?.name ? [`🏆 ${s.continental.name}`] : []),
  ];
  const promoted = s.promoted.some((p) => p.clubId === myClubId);
  const relegated = s.relegated.some((p) => p.clubId === myClubId);
  const pos = myClubId ? s.positions[myClubId] ?? null : null;

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fadeUp py-6">
      <div className="text-center">
        <p className="text-sm text-slate-500 uppercase tracking-widest">Fim de temporada</p>
        <h1 className="font-display font-extrabold text-4xl text-slate-50 mt-1">Temporada {s.season}</h1>
        {myClub && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <ClubCrest club={myClub} size={56} />
            <div className="text-left">
              <p className="font-semibold text-slate-100">{myClub.name}</p>
              <p className="text-sm text-slate-400">
                {pos ? `${pos}º lugar na liga` : 'Sem clube'} {promoted && '· ⬆️ Promovido!'} {relegated && '· ⬇️ Rebaixado!'}
              </p>
            </div>
          </div>
        )}
      </div>

      {myTitles.length > 0 && (
        <div className="card p-5 border-gold/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold mb-2">Seus títulos</p>
          {myTitles.map((t, i) => <p key={i} className="text-lg font-display font-bold text-gold">{t}</p>)}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Campeões das ligas</p>
          <div className="space-y-2">
            {s.leagues.map((l) => (
              <div key={l.competitionId} className="flex items-center gap-2 text-sm">
                <span className="text-lg">🏆</span>
                <span className="flex-1 text-slate-400">{l.name}</span>
                <span className="font-semibold text-gold">{l.champion}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Copas &amp; continental</p>
          <div className="space-y-2">
            {s.cups.map((c, i) => (
              <p key={i} className="text-sm">🍾 <span className="text-slate-400">{c.name}:</span> <span className="text-gold font-semibold">{c.champion}</span></p>
            ))}
            {s.continental && <p className="text-sm">🌍 <span className="text-slate-400">{s.continental.name}:</span> <span className="text-gold font-semibold">{s.continental.champion}</span></p>}
          </div>
        </div>
      </div>

      {(s.promoted.length > 0 || s.relegated.length > 0) && (
        <div className="card p-5">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent mb-2">⬆️ Promovidos</p>
              {s.promoted.map((p) => <p key={p.clubId} className="text-slate-300 py-0.5">{world.clubs[p.clubId]?.name ?? p.clubId}</p>)}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">⬇️ Rebaixados</p>
              {s.relegated.map((p) => <p key={p.clubId} className="text-slate-300 py-0.5">{world.clubs[p.clubId]?.name ?? p.clubId}</p>)}
            </div>
          </div>
        </div>
      )}

      {s.topScorers.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Artilharia do continente</p>
          <div className="flex gap-6 flex-wrap">
            {s.topScorers.slice(0, 5).map((t, i) => (
              <div key={i} className="text-center">
                <p className="font-display font-bold text-2xl text-gold">{t.goals}</p>
                <p className="text-sm text-slate-200">{t.name}</p>
                <p className="text-xs text-slate-500">{t.clubName}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5 text-sm text-slate-400">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">📜 Outros acontecimentos</p>
        {s.retired.length > 0 && <p>🎓 {s.retired.length} jogador(es) se aposentaram.</p>}
        <p>✨ A nova temporada <span className="text-accent font-semibold">{world.season}</span> já começou — novas contratações, jovens da base e novos desafios esperam por você.</p>
      </div>

      <div className="flex justify-center gap-3">
        <button onClick={() => { clearSeasonSummary(); navigate('dashboard'); }} className="btn-primary px-10 py-3">Continuar carreira →</button>
        {!myClubId && (
          <button onClick={() => { clearSeasonSummary(); navigate('jobs'); }} className="btn-gold px-6 py-3">💼 Ver ofertas de emprego</button>
        )}
      </div>
    </div>
  );
}
