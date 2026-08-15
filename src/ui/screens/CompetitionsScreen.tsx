import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, FormRow, Tabs } from '../components';
import { sortedStandings, topScorersOf, currentCupRoundName, winnerOf } from '../../game/competitions';
import { Competition, CupMatchStore } from '../../lib/types';
import { fmtInt } from '../../lib/format';

export function CompetitionsScreen() {
  const { career, navigate } = useGame();
  const world = career!.world;
  const [countryId, setCountryId] = useState(world.countries[0].id);
  const [tab, setTab] = useState('league');

  const country = world.countries.find((c) => c.id === countryId)!;

  const comps = useMemo(() => {
    return {
      league: country.divisions.map((id) => world.competitions[id]),
      cup: world.competitions[country.cupId],
      continental: world.competitions['CONTINENTAL'],
    };
  }, [world, country]);

  return (
    <div className="space-y-4 animate-fadeUp">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display font-bold text-2xl text-slate-100">Competições</h1>
        <div className="flex-1" />
        <div className="flex gap-1.5">
          {world.countries.map((c) => (
            <button key={c.id} onClick={() => setCountryId(c.id)} className={`badge border px-3 py-1.5 ${countryId === c.id ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600'}`}>
              {c.flag} {c.name}
            </button>
          ))}
        </div>
      </div>

      <Tabs
        tabs={[
          { id: 'league', label: 'Ligas' },
          { id: 'cup', label: 'Copa Nacional' },
          { id: 'continental', label: 'Continental' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'league' && <LeagueView comps={comps.league} world={world} onClub={(id) => navigate(`club:${id}`)} />}
      {tab === 'cup' && <CupView comp={comps.cup} world={world} onClub={(id) => navigate(`club:${id}`)} />}
      {tab === 'continental' && <CupView comp={comps.continental} world={world} onClub={(id) => navigate(`club:${id}`)} continental />}
    </div>
  );
}

function LeagueView({ comps, world, onClub }: { comps: Competition[]; world: any; onClub: (id: string) => void }) {
  const { navigate } = useGame();
  const [tier, setTier] = useState(0);
  const comp = comps[tier];
  const standings = sortedStandings(comp);
  const scorers = topScorersOf(world, comp.id, 10);

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 card p-5">
        <div className="flex gap-1.5 mb-4">
          {comps.map((c, i) => (
            <button key={c.id} onClick={() => setTier(i)} className={`badge border px-3 py-1.5 ${tier === i ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600'}`}>
              D{i + 1}
            </button>
          ))}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{comp.name} · {comp.status === 'finished' ? 'finalizada' : 'em andamento'}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="table-th">#</th>
                <th className="table-th">Clube</th>
                <th className="table-th text-center">Pts</th>
                <th className="table-th text-center">J</th>
                <th className="table-th text-center">V</th>
                <th className="table-th text-center">E</th>
                <th className="table-th text-center">D</th>
                <th className="table-th text-center">GP</th>
                <th className="table-th text-center">GC</th>
                <th className="table-th text-center">SG</th>
                <th className="table-th">Forma</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const club = world.clubs[s.clubId];
                const isUser = club?.isUserControlled;
                const zone = comp.rules.promotionSpots > 0 && i < comp.rules.promotionSpots ? 'border-l-2 border-l-accent' : comp.rules.relegationSpots > 0 && i >= standings.length - comp.rules.relegationSpots ? 'border-l-2 border-l-red-500' : '';
                return (
                  <tr key={s.clubId} className={`${zone} border-t border-surface-700/40 hover:bg-surface-800/60 cursor-pointer ${isUser ? 'bg-accent/10' : ''}`} onClick={() => onClub(s.clubId)}>
                    <td className="table-td font-mono text-slate-500">{i + 1}</td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <ClubCrest club={club} size={24} />
                        <span className={isUser ? 'font-bold text-accent' : 'text-slate-300'}>{club?.shortName}</span>
                      </div>
                    </td>
                    <td className="table-td text-center font-display font-bold text-slate-100">{s.points}</td>
                    <td className="table-td text-center text-slate-400">{s.played}</td>
                    <td className="table-td text-center text-slate-400">{s.won}</td>
                    <td className="table-td text-center text-slate-400">{s.drawn}</td>
                    <td className="table-td text-center text-slate-400">{s.lost}</td>
                    <td className="table-td text-center text-slate-400">{s.gf}</td>
                    <td className="table-td text-center text-slate-400">{s.ga}</td>
                    <td className={`table-td text-center ${s.gd > 0 ? 'text-accent' : s.gd < 0 ? 'text-red-400' : 'text-slate-400'}`}>{s.gd > 0 ? '+' : ''}{s.gd}</td>
                    <td className="table-td"><FormRow results={s.form} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex gap-4 mt-3 text-[10px] text-slate-600">
          {comp.rules.promotionSpots > 0 && <span><span className="inline-block w-2 h-2 bg-accent rounded-sm mr-1" />Promoção</span>}
          {comp.rules.relegationSpots > 0 && <span><span className="inline-block w-2 h-2 bg-red-500 rounded-sm mr-1" />Rebaixamento</span>}
          {comp.rules.continentalSpots > 0 && <span>Top {comp.rules.continentalSpots} → continental</span>}
        </div>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Artilharia</p>
        <div className="space-y-2">
          {scorers.map((s, i) => (
            <div key={s.playerId} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-slate-500 font-mono">{i + 1}º</span>
              <button onClick={() => navigate(`player:${s.playerId}`)} className="flex-1 text-left hover:text-accent transition-colors">
                <span className="text-slate-300 truncate">{s.name}</span>
              </button>
              <span className="text-xs text-slate-500 truncate hidden sm:inline">{s.clubName}</span>
              <span className="font-display font-bold text-gold">{s.goals}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-surface-700/60">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Campeões</p>
          {[...comp.champions].reverse().slice(0, 5).map((c, i) => (
            <p key={i} className="text-xs text-slate-400 py-0.5">🏆 {c.season}: {c.champion}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function CupView({ comp, world, onClub, continental = false }: { comp: Competition; world: any; onClub: (id: string) => void; continental?: boolean }) {
  const { career } = useGame();
  const store: CupMatchStore | undefined = continental ? world.continentalMatches[comp.id] : world.cupMatches[comp.id];

  if (!store) return <div className="card p-8 text-slate-500">Sem dados.</div>;

  const currentRound = currentCupRoundName(comp);
  const isUserIn = career && comp.clubIds.includes(career.clubId);

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 card p-5">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Chaveamento · <span className="text-accent">{currentRound}</span></p>
          {isUserIn && <span className="badge bg-accent/15 text-accent border border-accent/30">Seu clube participa</span>}
          {comp.status === 'finished' && comp.champions.length > 0 && (
            <span className="badge bg-gold/15 text-gold border border-gold/30">🏆 {comp.champions[comp.champions.length - 1].champion}</span>
          )}
        </div>

        <div className="space-y-4">
          {comp.rounds.map((round, ri) => {
            const matches = round.matchIds
              .map((id) => store.matches.find((m) => m.id === id))
              .filter((m): m is NonNullable<typeof m> => !!m && m.homeId !== '__TBD__' && m.awayId !== '__TBD__');
            if (matches.length === 0) return null;
            const winner = ri === 0 ? null : (() => {
              const w = store.roundWinners[round.matchIds[0]];
              return w ? world.clubs[w] : null;
            })();
            return (
              <div key={ri}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-400">{round.name}</p>
                  {round.complete && <span className="badge bg-accent/10 text-accent border border-accent/30">✓ concluída</span>}
                  {winner && <span className="text-xs text-slate-400">vencedor: {winner.shortName}</span>}
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {matches.map((m) => {
                    const home = world.clubs[m.homeId];
                    const away = world.clubs[m.awayId];
                    const isUserMatch = career && (m.homeId === career.clubId || m.awayId === career.clubId);
                    return (
                      <div key={m.id} className={`rounded-lg border p-2.5 text-sm ${isUserMatch ? 'border-accent/50 bg-accent/5' : 'border-surface-700 bg-surface-800/40'}`}>
                        <div className="flex items-center gap-2 justify-between">
                          <button onClick={() => onClub(m.homeId)} className="flex items-center gap-1.5 text-slate-300 hover:text-white min-w-0">
                            <ClubCrest club={home} size={20} />
                            <span className="truncate">{home?.shortName}</span>
                          </button>
                          <span className="font-mono font-bold text-slate-200 shrink-0">
                            {m.played ? `${m.homeScore}-${m.awayScore}${m.penaltyShootout ? ` (${m.penaltyShootout.home}-${m.penaltyShootout.away} pen)` : ''}` : '—'}
                          </span>
                          <button onClick={() => onClub(m.awayId)} className="flex items-center gap-1.5 text-slate-300 hover:text-white min-w-0">
                            <span className="truncate">{away?.shortName}</span>
                            <ClubCrest club={away} size={20} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Histórico</p>
        {[...comp.champions].reverse().slice(0, 8).map((c, i) => (
          <p key={i} className="text-xs text-slate-400 py-1 border-b border-surface-700/40 last:border-0">
            🏆 {c.season}: <span className="text-slate-200">{c.champion}</span> {c.runnerUp && <span className="text-slate-600">(vice: {c.runnerUp})</span>}
          </p>
        ))}
        {continental && (
          <div className="mt-4 pt-3 border-t border-surface-700/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Participantes</p>
            {comp.clubIds.map((id) => {
              const c = world.clubs[id];
              return c ? (
                <button key={id} onClick={() => onClub(id)} className="flex items-center gap-2 text-xs text-slate-400 py-1 hover:text-slate-200 w-full text-left">
                  <ClubCrest club={c} size={18} />
                  {c.shortName}
                </button>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
