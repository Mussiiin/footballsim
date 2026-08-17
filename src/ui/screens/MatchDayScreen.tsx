import { useMemo } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, OverallBadge, PositionBadge, PlayerAvatar, EnergyBadge } from '../components';
import { matchForClubOnDate } from '../../game/competitions';
import { fillUserLineup } from '../../game/matchEngine';
import { overallOf, squadOverall } from '../../game/overall';
import { formatDateBR } from '../../lib/date';
import { FORMATIONS } from '../../lib/types';
import { Play, ClipboardList, MapPin, CloudSun } from 'lucide-react';

export function MatchDayScreen() {
  const { career, navigate, playMatch } = useGame();
  const world = career!.world;
  const clubId = career?.clubId ?? null;
  const match = clubId ? matchForClubOnDate(world, clubId, world.date) : null;

  const data = useMemo(() => {
    if (!match) return null;
    const isHome = match.homeId === career!.clubId;
    const oppId = isHome ? match.awayId : match.homeId;
    const opp = world.clubs[oppId];
    const oppPlayers = Object.values(world.players).filter((p) => p.clubId === oppId);
    const myPlayers = Object.values(world.players).filter((p) => p.clubId === career!.clubId);
    const myLineup = fillUserLineup(myPlayers, career!.lineup.formation, career!.lineup.slots, match.date);
    const myStarters = myLineup.playerIds.map((id) => world.players[id]).filter(Boolean);
    const oppLineup = myLineup; // placeholder (motor decide)
    void oppLineup;
    const comp = world.competitions[match.competitionId];
    return {
      isHome,
      opp,
      comp,
      myStarters,
      oppStrength: oppPlayers.length ? squadOverall(oppPlayers) : 0,
      myStrength: myStarters.length ? squadOverall(myStarters) : 0,
      oppTop: [...oppPlayers].sort((a, b) => overallOf(b) - overallOf(a)).slice(0, 3),
    };
  }, [match, world, career]);

  if (!match || !data) {
    return (
      <div className="card p-8 text-center">
        <p className="text-slate-400">Nenhuma partida para hoje. Avance o tempo até o dia de jogo.</p>
        <button onClick={() => navigate('calendar')} className="btn-primary mt-4">Ir para o calendário</button>
      </div>
    );
  }

  const { isHome, opp, comp, myStarters, oppStrength, myStrength, oppTop } = data;
  const home = world.clubs[match.homeId];
  const away = world.clubs[match.awayId];
  const venue = isHome ? home.stadium.name : opp.stadium.name;
  const myClub = world.clubs[career!.clubId];

  const start = () => {
    playMatch();
    navigate('live');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-fadeUp">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{comp?.name} · {formatDateBR(match.date)}</p>
        <p className="text-sm text-slate-400 mt-1 flex items-center justify-center gap-1.5">
          <MapPin size={13} /> {venue} · <CloudSun size={13} /> {match.weather} · importância {match.importance}/100
        </p>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 flex flex-col items-center gap-2">
            <ClubCrest club={home} size={72} />
            <p className="font-display font-bold text-slate-100 text-center">{home.name}</p>
            <span className="badge bg-surface-700 text-slate-300">🏠 Casa</span>
          </div>
          <div className="text-center">
            <p className="text-4xl font-display font-extrabold text-slate-200">VS</p>
            <p className="text-xs text-slate-500 mt-1">Hoje</p>
          </div>
          <div className="flex-1 flex flex-col items-center gap-2">
            <ClubCrest club={away} size={72} />
            <p className="font-display font-bold text-slate-100 text-center">{away.name}</p>
            <span className="badge bg-surface-700 text-slate-300">✈️ Fora</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5 text-center">
          <div className="rounded-xl bg-surface-800/70 p-3">
            <p className="font-display font-bold text-2xl text-slate-100">{myStrength.toFixed(1)}</p>
            <p className="text-[10px] text-slate-500 uppercase">{myClub.name}</p>
          </div>
          <div className="rounded-xl bg-surface-800/70 p-3 flex flex-col justify-center">
            <p className="text-[10px] text-slate-500 uppercase">Mando</p>
            <p className="text-sm text-slate-300">{isHome ? 'A favor' : 'Contra'}</p>
          </div>
          <div className="rounded-xl bg-surface-800/70 p-3">
            <p className="font-display font-bold text-2xl text-slate-100">{oppStrength.toFixed(1)}</p>
            <p className="text-[10px] text-slate-500 uppercase">{opp.name}</p>
          </div>
        </div>
      </div>

      {/* escalação prevista */}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Escalação ({career!.lineup.formation})</p>
          <div className="flex-1" />
          <p className="text-[10px] text-slate-500 flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" /> Energia ótima</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gold inline-block" /> média</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> baixa</span>
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {myStarters.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg bg-surface-800/50 px-2.5 py-1.5">
              <span className="text-[10px] text-slate-600 w-4">{i + 1}</span>
              <PlayerAvatar player={p} size={26} showPos={false} />
              <span className="flex-1 text-sm text-slate-200 truncate">{p.firstName} {p.lastName}</span>
              <EnergyBadge player={p} showPct />
              <OverallBadge player={p} size="sm" />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-2">⚡ A energia combina condição física, resistência e fadiga acumulada — jogadores com energia baixa rendem menos e se desgastam mais rápido.</p>
        <div className="flex gap-2 mt-4">
          <button onClick={() => navigate('tactics')} className="btn-secondary flex-1"><ClipboardList size={16} /> Táticas</button>
          <button onClick={() => navigate('squad')} className="btn-secondary flex-1">Elenco</button>
          <button onClick={start} className="btn-primary flex-1 py-2.5"><Play size={16} /> Iniciar partida</button>
        </div>
      </div>

      {oppTop.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Destaques do adversário</p>
          <div className="grid sm:grid-cols-3 gap-2">
            {oppTop.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-surface-700 p-2.5">
                <PlayerAvatar player={p} size={30} showPos={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{p.firstName} {p.lastName}</p>
                  <PositionBadge pos={p.position} />
                </div>
                <OverallBadge player={p} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
