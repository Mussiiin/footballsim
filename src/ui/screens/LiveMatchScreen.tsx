import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest } from '../components';
import { lastMatchForClub } from '../../game/competitions';
import { Match, MatchEvent } from '../../lib/types';
import { formatDateBR } from '../../lib/date';
import { Pause, Play, SkipForward, Zap } from 'lucide-react';

const EVENT_ICON: Record<string, string> = {
  goal: '⚽', ownGoal: '⚽', penalty: '⚽', penaltyMiss: '❌', yellow: '🟨', red: '🟥',
  injury: '🩹', sub: '🔄', corner: '🚩', foul: '🟡', save: '🧤', shot: '🎯',
  shotOnTarget: '🎯', offside: '🚩', kickoff: '🏁', whistle: '🛎️', penaltyShootoutGoal: '⚽', penaltyShootoutMiss: '❌',
  buildUp: '🧭', recovery: '💨', pressure: '🔥', timeWasting: '⏱️', cross: '🎯',
};

export function LiveMatchScreen() {
  const { career, navigate, finishDay } = useGame();
  const world = career!.world;
  const match = useMemo(() => lastMatchForClub(world, career!.clubId), [world, career]);

  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [halftime, setHalftime] = useState(false);
  const [halftimeTalk, setHalftimeTalk] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  const events: MatchEvent[] = useMemo(() => {
    if (!match) return [];
    const ev = [...(match.events ?? [])];
    // garante kickoff inicial
    if (ev.length === 0 || ev[0].type !== 'kickoff') {
      ev.unshift({ minute: 0, type: 'kickoff', team: 'home' });
    }
    ev.push({ minute: 90 + (match.extraTimePlayed ? 30 : 0), type: 'whistle', team: 'home' });
    return ev;
  }, [match]);

  useEffect(() => {
    if (!playing || finished || halftime || events.length === 0) return;
    const interval = 700 / speed;
    timer.current = setInterval(() => {
      setPos((p) => {
        if (p >= events.length - 1) {
          if (timer.current) clearInterval(timer.current);
          setFinished(true);
          return p;
        }
        const nextMinute = events[p + 1]?.minute ?? 0;
        // intervalo: primeiro evento do 2º tempo pausa a reprodução
        if (nextMinute >= 45 && (events[p]?.minute ?? 0) < 45) {
          if (timer.current) clearInterval(timer.current);
          setHalftime(true);
          setPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, interval);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, finished, halftime, events.length]);

  const finalize = async () => {
    if (finishing) return;
    setFinishing(true);
    await new Promise((r) => setTimeout(r, 50));
    finishDay();
    navigate('dashboard');
  };

  if (!match) {
    return <div className="card p-8 text-slate-500">Nenhuma partida para exibir.</div>;
  }

  const home = world.clubs[match.homeId];
  const away = world.clubs[match.awayId];
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const currentMinute = events[Math.min(pos, events.length - 1)]?.minute ?? 0;
  const visibleEvents = events.slice(0, pos + 1);
  const stats = match.stats;
  const playerStats = match.playerStats ?? [];

  // estatísticas progressivas: derivadas apenas dos eventos JÁ revelados.
  // Nada aparece antes de acontecer. Posse e passes (sem evento próprio) usam
  // projeção linear dos totais reais da partida pelo tempo decorrido.
  const countUpTo = (limit: number) => {
    const evs = events.slice(0, Math.min(pos, events.length - 1) + 1);
    const c = {
      shots: [0, 0] as [number, number], sot: [0, 0] as [number, number], corners: [0, 0] as [number, number],
      fouls: [0, 0] as [number, number], yellows: [0, 0] as [number, number], reds: [0, 0] as [number, number],
      offsides: [0, 0] as [number, number], saves: [0, 0] as [number, number], goals: [0, 0] as [number, number],
      attack: [0, 0] as [number, number], xg: [0, 0] as [number, number],
    };
    for (const e of evs) {
      if (limit > 0 && e.minute >= limit) continue;
      const i = e.team === 'home' ? 0 : 1;
      const j = i === 0 ? 1 : 0;
      // cada gol É uma finalização no alvo — a estatística nunca fica menor
      // que o placar, e o xG é construído das chances reais já reveladas.
      if (e.type === 'goal' || e.type === 'penalty') { c.goals[i]++; c.shots[i]++; c.sot[i]++; c.xg[i] += 0.45; c.attack[i] += 3; }
      else if (e.type === 'shotOnTarget') { c.sot[i]++; c.shots[i]++; c.xg[i] += 0.32; c.attack[i] += 2; }
      else if (e.type === 'shot') { c.shots[i]++; c.xg[i] += 0.06; c.attack[i] += 1; }
      else if (e.type === 'corner') { c.corners[i]++; c.attack[i] += 1; }
      else if (e.type === 'foul') c.fouls[i]++;
      else if (e.type === 'yellow') c.yellows[i]++;
      else if (e.type === 'red') c.reds[i]++;
      else if (e.type === 'offside') c.offsides[i]++;
      else if (e.type === 'save') c.saves[j]++; // defesa do goleiro = atividade do time atacante
    }
    return c;
  };

  const c = countUpTo(0);
  const elapsed = Math.max(1, Math.min(90, currentMinute));
  const totalAttack = c.attack[0] + c.attack[1];
  const finalPos = stats?.possession ?? [50, 50];
  // mistura a atividade real dos eventos revelados com a projeção linear do total final
  const livePosHome = totalAttack > 0
    ? clamp(Math.round((Math.round((c.attack[0] / totalAttack) * 100) + (finalPos[0] * (elapsed / 90) + 50 * (1 - elapsed / 90))) / 2), 20, 80)
    : Math.round(50 + (finalPos[0] - 50) * (elapsed / 90));

  const liveHomeG = finished ? homeScore : c.goals[0];
  const liveAwayG = finished ? awayScore : c.goals[1];
  // xG ao vivo: acumulado das chances reais reveladas (nunca uma projeção
  // pré-carregada). Ao fim da partida converge para o xG final do motor.
  const xgHome = Math.round(c.xg[0] * 10) / 10;
  const xgAway = Math.round(c.xg[1] * 10) / 10;
  const passHomeFin = stats ? Math.round(stats.passes[0] * (elapsed / 90)) : 0;
  const passAwayFin = stats ? Math.round(stats.passes[1] * (elapsed / 90)) : 0;
  const statRows = stats ? [
    { label: 'Posse', home: `${livePosHome}%`, away: `${100 - livePosHome}%` },
    { label: 'Finalizações', home: c.shots[0], away: c.shots[1] },
    { label: 'No alvo', home: c.sot[0], away: c.sot[1] },
    { label: 'Escanteios', home: c.corners[0], away: c.corners[1] },
    { label: 'Faltas', home: c.fouls[0], away: c.fouls[1] },
    { label: 'Cartões', home: `🟨${c.yellows[0]} 🟥${c.reds[0]}`, away: `🟨${c.yellows[1]} 🟥${c.reds[1]}` },
    { label: 'Passes', home: passHomeFin, away: passAwayFin },
    { label: 'xG', home: xgHome.toFixed(1), away: xgAway.toFixed(1) },
  ] : [];

  // destaques do 1º tempo (para a tela de intervalo)
  const firstHalfEvents = events.filter((e) => e.minute < 45 && !['kickoff', 'whistle'].includes(e.type));
  const firstHalfGoalScorers: { name: string; team: string; minute: number }[] = [];
  for (const e of firstHalfEvents) {
    if (e.type === 'goal' || e.type === 'penalty') {
      const p = e.playerId ? world.players[e.playerId] : undefined;
      if (p) firstHalfGoalScorers.push({ name: `${p.firstName[0]}. ${p.lastName}`, team: e.team, minute: e.minute });
    }
  }
  const shotLeaders = new Map<string, number>();
  for (const e of firstHalfEvents) {
    if ((e.type === 'shot' || e.type === 'shotOnTarget') && e.playerId) {
      shotLeaders.set(e.playerId, (shotLeaders.get(e.playerId) ?? 0) + 1);
    }
  }
  const leaders = [...shotLeaders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const name = (id?: string) => {
    if (!id) return '';
    const p = world.players[id];
    return p ? `${p.firstName[0]}. ${p.lastName}` : '';
  };

  const resume = () => {
    // avança um evento para sair da borda do intervalo; senão o timer
    // re-pausa no primeiro tick (a condição 45' ainda é verdadeira na posição atual)
    setPos((p) => Math.min(p + 1, events.length - 1));
    setHalftime(false);
    setPlaying(true);
  };

  const halftimeTalkBoost = () => {
    // conversa motivacional: moral dos titulares do seu time sobe (persistente)
    const squad = Object.values(world.players).filter((p) => p.clubId === career!.clubId && p.status === 'active');
    for (const p of squad) {
      p.morale = Math.min(100, p.morale + 4);
      p.happiness = Math.min(100, p.happiness + 2);
    }
    setHalftimeTalk(true);
    resume();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 animate-fadeUp">
      {/* placar */}
      <div className="card p-6 pitch-bg relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 text-[120px] leading-none flex items-center justify-center font-display font-extrabold select-none">⚽</div>
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex-1 flex flex-col items-center gap-2">
              <ClubCrest club={home} size={64} />
              <p className="font-display font-bold text-slate-100 text-center text-lg">{home.shortName}</p>
            </div>
            <div className="text-center mx-4">
              <div className="flex items-end justify-center gap-4">
                <span className="font-display font-extrabold text-6xl text-slate-50">{liveHomeG}</span>
                <span className="font-display font-extrabold text-4xl text-slate-500">x</span>
                <span className="font-display font-extrabold text-6xl text-slate-50">{liveAwayG}</span>
              </div>
              <p className="mt-2 text-xs font-mono text-accent bg-surface-950/70 rounded-full px-3 py-1 inline-block">
                {finished ? 'FIM DE JOGO' : halftime ? "INTERVALO" : `${currentMinute}'`}
              </p>
              {match.penaltyShootout && (
                <p className="mt-1 text-xs text-gold">Pênaltis: {match.penaltyShootout.home}-{match.penaltyShootout.away}</p>
              )}
            </div>
            <div className="flex-1 flex flex-col items-center gap-2">
              <ClubCrest club={away} size={64} />
              <p className="font-display font-bold text-slate-100 text-center text-lg">{away.shortName}</p>
            </div>
          </div>
          <p className="text-center text-xs text-slate-400 mt-3">{home.name} vs {away.name} · {world.competitions[match.competitionId]?.name}</p>
        </div>
      </div>

      {/* controles */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setPlaying(!playing)} className="btn-secondary !px-3">
          {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pausar' : 'Continuar'}
        </button>
        <div className="flex gap-1">
          {[1, 2, 4, 8].map((s) => (
            <button key={s} onClick={() => { setSpeed(s); setPlaying(true); }} className={`btn !px-3 ${speed === s ? 'bg-accent text-surface-950' : 'btn-ghost'}`}>
              <Zap size={13} /> {s}x
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => { setPos(events.length - 1); setFinished(true); setPlaying(false); }} className="btn-ghost !px-3">
          <SkipForward size={15} /> Finalizar
        </button>
        {finished && (
          <button onClick={() => void finalize()} disabled={finishing} className="btn-primary !px-5">
            {finishing ? '…' : 'Continuar →'}
          </button>
        )}
      </div>

      {/* intervalo */}
      {halftime && !finished && (
        <div className="card p-6 border-gold/40 bg-surface-900/90 animate-fadeUp">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">⏸️</span>
            <div>
              <h2 className="font-display font-bold text-xl text-slate-100">Intervalo</h2>
              <p className="text-sm text-slate-400">Fim do primeiro tempo — {liveHomeG} x {liveAwayG}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">1º tempo</p>
              <div className="space-y-1.5 text-sm">
                <p className="flex justify-between"><span className="text-slate-400">Finalizações</span><span className="font-mono">{c.shots[0]} x {c.shots[1]}</span></p>
                <p className="flex justify-between"><span className="text-slate-400">No alvo</span><span className="font-mono">{c.sot[0]} x {c.sot[1]}</span></p>
                <p className="flex justify-between"><span className="text-slate-400">Escanteios</span><span className="font-mono">{c.corners[0]} x {c.corners[1]}</span></p>
                <p className="flex justify-between"><span className="text-slate-400">Posse</span><span className="font-mono">{livePosHome}% x {100 - livePosHome}%</span></p>
                <p className="flex justify-between"><span className="text-slate-400">xG</span><span className="font-mono">{xgHome.toFixed(1)} x {xgAway.toFixed(1)}</span></p>
              </div>
            </div>
            <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Destaques</p>
              {firstHalfGoalScorers.length === 0 && leaders.length === 0 ? (
                <p className="text-sm text-slate-500">Primeiro tempo equilibrado, sem grandes lances.</p>
              ) : (
                <div className="space-y-1.5 text-sm">
                  {firstHalfGoalScorers.map((g, i) => (
                    <p key={i} className="flex justify-between"><span className="text-gold font-semibold">⚽ {g.name}</span><span className="font-mono text-slate-500">{g.minute}'</span></p>
                  ))}
                  {leaders.map(([pid, n]) => {
                    const p = world.players[pid];
                    return <p key={pid} className="flex justify-between"><span className="text-slate-300">🎯 {p ? `${p.firstName[0]}. ${p.lastName}` : ''}</span><span className="font-mono text-slate-500">{n} chutes</span></p>;
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-5">
            <button onClick={resume} className="btn-primary">▶️ Continuar partida</button>
            <button onClick={halftimeTalkBoost} disabled={halftimeTalk} className="btn-secondary">
              {halftimeTalk ? '✅ Conversa feita — moral elevada' : '🗣️ Conversa motivacional (moral +4)'}
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* timeline */}
        <div className="card p-5 max-h-[420px] overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Timeline</p>
          <div className="space-y-1">
            {visibleEvents.map((e, i) => {
              const isHome = e.team === 'home';
              return (
                <div key={i} className={`flex items-center gap-2 text-sm ${i === visibleEvents.length - 1 ? 'animate-fadeIn' : ''}`}>
                  <span className="font-mono text-xs text-slate-500 w-8 text-right">{e.minute}'</span>
                  <span className="w-6 text-center">{EVENT_ICON[e.type] ?? '•'}</span>
                  <span className={`flex-1 truncate ${isHome ? 'text-slate-200' : 'text-slate-400'}`}>
                    {e.type === 'goal' || e.type === 'penalty' ? `Gol de ${name(e.playerId)}${e.playerId2 ? ` (assist. ${name(e.playerId2)})` : ''}` :
                      e.type === 'yellow' ? `Cartão amarelo · ${name(e.playerId)}` :
                      e.type === 'red' ? `Expulsão · ${name(e.playerId)}` :
                      e.type === 'injury' ? `Lesão · ${name(e.playerId)}` :
                      e.type === 'sub' ? (e.detail ?? `Substituição`) :
                      e.type === 'kickoff' ? 'Começa a partida!' :
                      e.type === 'whistle' ? (e.detail ?? 'Fim de jogo') :
                      e.type === 'corner' ? 'Escanteio' :
                      e.type === 'foul' ? 'Falta' :
                      e.type === 'save' ? (e.detail ?? `Defesa de ${name(e.playerId)}`) :
                      e.type === 'offside' ? 'Impedimento' :
                      e.detail ?? e.type}
                  </span>
                  <span className="text-[10px] text-slate-600">{isHome ? home.shortName : away.shortName}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* estatísticas */}
        <div className="space-y-4">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Estatísticas</p>
            <div className="space-y-2">
              {statRows.map((r) => (
                <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                  <span className="text-right font-mono text-slate-200">{r.home}</span>
                  <span className="text-[10px] text-slate-500 uppercase text-center w-20">{r.label}</span>
                  <span className="font-mono text-slate-200">{r.away}</span>
                </div>
              ))}
            </div>
          </div>

          {finished && (
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Notas dos jogadores</p>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {[...playerStats].sort((a, b) => b.rating - a.rating).slice(0, 15).map((ps) => {
                  const p = world.players[ps.playerId];
                  if (!p) return null;
                  return (
                    <div key={ps.playerId} className="flex items-center gap-2 text-sm">
                      <span className={`flex-1 truncate ${ps.manOfMatch ? 'text-gold font-semibold' : 'text-slate-300'}`}>
                        {p.firstName} {p.lastName} {ps.manOfMatch && '⭐'}
                      </span>
                      <span className="text-xs text-slate-500">{ps.goals > 0 && `⚽${ps.goals} `}{ps.assists > 0 && `🅰${ps.assists} `}</span>
                      <span className={`font-mono font-bold ${ps.rating >= 8 ? 'text-gold' : ps.rating >= 7 ? 'text-accent' : ps.rating >= 6 ? 'text-slate-300' : 'text-red-400'}`}>{ps.rating.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
