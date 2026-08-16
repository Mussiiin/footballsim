import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, ResultPill } from '../components';
import { allMatchesForClub } from '../../game/competitions';
import { formatDateBR, WEEKDAYS_SHORT, addDays } from '../../lib/date';
import { fmtMoney } from '../../lib/format';
import { Match } from '../../lib/types';

export function CalendarScreen() {
  const { career, navigate, advanceDay, advanceWeek, advanceToMatch } = useGame();
  const world = career!.world;
  const clubId = career!.clubId;
  const [advancing, setAdvancing] = useState<'day' | 'week' | 'match' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const matches = useMemo(() => (clubId ? allMatchesForClub(world, clubId).reverse() : []), [world, clubId]);

  // partidas da temporada atual, da 1ª à última rodada (ordem cronológica)
  const seasonYear = Number(world.season.slice(0, 4));
  const seasonMatches = useMemo(() => {
    if (!clubId) return [];
    return allMatchesForClub(world, clubId)
      .filter((m) => m.date.startsWith(String(seasonYear)))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [world, clubId, seasonYear]);
  const [seasonFilter, setSeasonFilter] = useState<'all' | 'played' | 'remaining'>('all');
  const shownSeason = seasonFilter === 'played' ? seasonMatches.filter((m) => m.played) : seasonFilter === 'remaining' ? seasonMatches.filter((m) => !m.played) : seasonMatches;

  const clubMatchesByDate = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const arr = map.get(m.date) ?? [];
      arr.push(m);
      map.set(m.date, arr);
    }
    return map;
  }, [matches]);

  // próximos 10 dias úteis (dias com partida do clube ou janela)
  const upcomingDays: string[] = [];
  for (let i = 0; i < 60; i++) {
    const d = addDays(world.date, i);
    if (clubMatchesByDate.has(d)) upcomingDays.push(d);
    if (upcomingDays.length >= 12) break;
  }

  const inWindow = (() => {
    const mmdd = world.date.slice(5);
    return (mmdd >= world.windows.summer.start && mmdd <= world.windows.summer.end) || (mmdd >= world.windows.winter.start && mmdd <= world.windows.winter.end);
  })();

  const doAdvance = async (kind: 'day' | 'week' | 'match') => {
    setAdvancing(kind);
    await new Promise((r) => setTimeout(r, 30));
    let r;
    if (kind === 'day') r = advanceDay();
    else if (kind === 'week') r = advanceWeek();
    else r = advanceToMatch();
    setAdvancing(null);
    if (r?.userMatch) {
      navigate('matchday');
      return;
    }
    if (r?.seasonAdvanced) {
      setMsg(`Nova temporada: ${world.season}!`);
      return;
    }
    setMsg(r ? `Simulado até ${formatDateBR(r.date)} · ${r.simulated} partida(s) simulada(s)` : null);
  };

  return (
    <div className="space-y-4 animate-fadeUp">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Calendário</h1>
          <p className="text-sm text-slate-500">{formatDateBR(world.date)} · Temporada {world.season}{inWindow && ' · 📢 Janela de transferências aberta'}</p>
        </div>
        <div className="flex-1" />
        {msg && <span className="text-xs text-accent animate-fadeIn">{msg}</span>}
        <div className="flex gap-2">
          <button onClick={() => void doAdvance('day')} disabled={!!advancing} className="btn-secondary">{advancing === 'day' ? '…' : 'Dia'}</button>
          <button onClick={() => void doAdvance('week')} disabled={!!advancing} className="btn-secondary">{advancing === 'week' ? '…' : 'Semana'}</button>
          <button onClick={() => void doAdvance('match')} disabled={!!advancing} className="btn-primary">{advancing === 'match' ? '…' : '⚽ Próxima partida'}</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* próximas partidas */}
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Próximos compromissos</p>
          <div className="space-y-2">
            {upcomingDays.length === 0 && <p className="text-sm text-slate-500">Sem partidas agendadas.</p>}
            {upcomingDays.map((d) => {
              const ms = clubMatchesByDate.get(d)!;
              const dow = WEEKDAYS_SHORT[new Date(d + 'T12:00:00').getDay()];
              return (
                <div key={d} className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
                  <p className="text-[11px] text-slate-500 mb-2">{dow}, {formatDateBR(d)}</p>
                  {ms.map((m) => {
                    const home = world.clubs[m.homeId];
                    const away = world.clubs[m.awayId];
                    const isHome = m.homeId === clubId;
                    const comp = world.competitions[m.competitionId];
                    return (
                      <button key={m.id} onClick={() => { if (m.played) navigate('competitions'); }} className="flex items-center gap-2 w-full text-left py-1">
                        <span className={`text-[10px] font-semibold w-14 truncate ${m.played ? 'text-slate-600' : 'text-accent'}`}>{m.played ? 'Jogada' : comp?.shortName ?? ''}</span>
                        <span className={`flex-1 truncate text-sm ${isHome ? 'text-slate-200' : 'text-slate-400'}`}>{isHome ? away?.name : home?.name}</span>
                        <span className="text-xs text-slate-500">{isHome ? '🏠' : '✈️'}</span>
                        <ResultPill m={m} perspective={clubId} />
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* partidas recentes */}
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Partidas recentes</p>
          <div className="space-y-2">
            {matches.filter((m) => m.played).slice(0, 12).map((m) => {
              const home = world.clubs[m.homeId];
              const away = world.clubs[m.awayId];
              const isHome = m.homeId === clubId;
              return (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-surface-700/50 bg-surface-800/30 p-2.5 text-sm">
                  <span className="text-[10px] text-slate-600 w-16 shrink-0">{formatDateBR(m.date)}</span>
                  <span className={`flex-1 truncate ${isHome ? 'text-slate-200' : 'text-slate-400'}`}>{isHome ? away?.name : home?.name}</span>
                  <span className="text-xs text-slate-500">{isHome ? '🏠' : '✈️'}</span>
                  <ResultPill m={m} perspective={clubId} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* partidas da temporada: da 1ª rodada à última */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Partidas da temporada</p>
          <div className="flex-1" />
          <div className="flex gap-1">
            <button onClick={() => setSeasonFilter('all')} className={`badge border px-3 py-1.5 ${seasonFilter === 'all' ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600'}`}>Todas ({seasonMatches.length})</button>
            <button onClick={() => setSeasonFilter('played')} className={`badge border px-3 py-1.5 ${seasonFilter === 'played' ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600'}`}>✓ Jogadas ({seasonMatches.filter((m) => m.played).length})</button>
            <button onClick={() => setSeasonFilter('remaining')} className={`badge border px-3 py-1.5 ${seasonFilter === 'remaining' ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600'}`}>⏳ Restantes ({seasonMatches.filter((m) => !m.played).length})</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="table-th">Rodada</th>
                <th className="table-th">Data</th>
                <th className="table-th">Competição</th>
                <th className="table-th">Casa</th>
                <th className="table-th text-center">Placar</th>
                <th className="table-th">Fora</th>
              </tr>
            </thead>
            <tbody>
              {shownSeason.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-slate-500 py-6">Nenhuma partida neste filtro.</td></tr>
              )}
              {shownSeason.map((m) => {
                const comp = world.competitions[m.competitionId];
                const isLeague = comp?.type === 'league';
                return (
                  <tr key={m.id} className={`border-t border-surface-700/40 ${m.homeId === clubId || m.awayId === clubId ? 'bg-accent/[0.03]' : ''}`}>
                    <td className="table-td font-mono text-slate-500">{isLeague ? `R${m.round}` : '—'}</td>
                    <td className="table-td text-slate-500">{formatDateBR(m.date)}</td>
                    <td className="table-td text-xs text-slate-400">{comp?.name ?? '—'}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        <ClubCrest club={world.clubs[m.homeId]} size={20} />
                        <span className={m.homeId === clubId ? 'font-semibold text-accent' : 'text-slate-300'}>{world.clubs[m.homeId]?.shortName}</span>
                        {m.homeId === clubId && <span className="text-[9px] text-slate-500">🏠</span>}
                      </div>
                    </td>
                    <td className="table-td text-center"><ResultPill m={m} /></td>
                    <td className="table-td">
                      <div className="flex items-center gap-1.5 justify-end">
                        {m.awayId === clubId && <span className="text-[9px] text-slate-500">✈️</span>}
                        <span className={m.awayId === clubId ? 'font-semibold text-accent' : 'text-slate-300'}>{world.clubs[m.awayId]?.shortName}</span>
                        <ClubCrest club={world.clubs[m.awayId]} size={20} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-600 mt-3">{seasonMatches.filter((m) => m.played).length} jogadas · {seasonMatches.filter((m) => !m.played).length} restantes na temporada {world.season}</p>
      </div>
    </div>
  );
}
