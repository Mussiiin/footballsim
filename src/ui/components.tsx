import React, { useEffect, useState } from 'react';
import { Club, Player, Position, Match } from '../lib/types';
import { POSITION_SHORT, POSITION_GROUPS } from '../lib/types';
import { fmtMoney, fmtInt, fmtRating, ratingColor, overallColor } from '../lib/format';
import { overallOf } from '../game/overall';
import { playerName, playerEnergy } from '../game/matchEngine';
import { X } from 'lucide-react';

// ------------------------------------------------------------
// Escudo do clube (gerado com iniciais + cores)
// ------------------------------------------------------------
export function ClubCrest({ club, size = 36, className = '' }: { club?: Club; size?: number; className?: string }) {
  if (!club) return <div className={`rounded-lg bg-surface-700 flex items-center justify-center ${className}`} style={{ width: size, height: size }}>?</div>;
  const initials = club.shortName.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div
      className={`rounded-lg flex items-center justify-center font-display font-bold text-white shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${club.colors[0]} 0%, ${club.colors[1]} 120%)`,
        fontSize: size * 0.34,
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.15)',
      }}
    >
      {initials}
    </div>
  );
}

// ------------------------------------------------------------
// Avatar do jogador
// ------------------------------------------------------------
export function PlayerAvatar({ player, size = 36, showPos = true }: { player?: Player; size?: number; showPos?: boolean }) {
  if (!player) return <div className="rounded-full bg-surface-700 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>—</div>;
  const g = POSITION_GROUPS[player.position];
  const colors: Record<string, string> = {
    GK: '#f5b942', DEF: '#4cc9f0', MID: '#3ddc84', ATT: '#ef476f',
  };
  const initials = `${player.firstName[0]}${player.lastName[0]}`;
  return (
    <div className="relative shrink-0">
      <div
        className="rounded-full flex items-center justify-center font-display font-bold text-surface-950"
        style={{ width: size, height: size, background: colors[g], fontSize: size * 0.36 }}
      >
        {initials}
      </div>
      {showPos && (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-surface-950 border border-surface-600 px-1 text-[9px] font-bold text-slate-200"
        >
          {POSITION_SHORT[player.position]}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Badges
// ------------------------------------------------------------
export function PositionBadge({ pos }: { pos: Position }) {
  const colors: Record<string, string> = {
    GK: 'bg-gold/15 text-gold border-gold/30',
    DEF: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    MID: 'bg-accent/15 text-accent border-accent/30',
    ATT: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  };
  return (
    <span className={`badge border ${colors[POSITION_GROUPS[pos]]}`}>{POSITION_SHORT[pos]}</span>
  );
}

export function OverallBadge({ player, size = 'md' }: { player: Player; size?: 'sm' | 'md' }) {
  const ov = overallOf(player);
  const color = ov >= 85 ? 'text-gold border-gold/40 bg-gold/10' : ov >= 75 ? 'text-accent border-accent/40 bg-accent/10' : ov >= 65 ? 'text-sky-400 border-sky-500/40 bg-sky-500/10' : 'text-slate-300 border-surface-600 bg-surface-700/50';
  return (
    <span className={`badge border font-display ${color} ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`} style={{ minWidth: 30, justifyContent: 'center' }}>
      {ov}
    </span>
  );
}

// ------------------------------------------------------------
// Energia (condição + resistência − fadiga)
// ------------------------------------------------------------
export function EnergyBadge({ player, showPct = false, className = '' }: { player: Player; showPct?: boolean; className?: string }) {
  const e = Math.round(playerEnergy(player));
  const color = e >= 70 ? 'bg-accent/10 text-accent border-accent/30' : e >= 45 ? 'bg-gold/10 text-gold border-gold/30' : 'bg-red-500/10 text-red-400 border-red-500/30';
  const label = e >= 70 ? 'Ótima' : e >= 45 ? 'Média' : 'Baixa';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none ${color} ${className}`}
      title={`⚡ ${label} · Condição ${player.condition}% · Fadiga ${player.fatigue}%`}
    >
      ⚡{e}{showPct ? '%' : ''}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Club['tier'] }) {
  const map: Record<string, string> = {
    Gigante: 'bg-gold/15 text-gold border-gold/40',
    Grande: 'bg-accent/15 text-accent border-accent/40',
    Médio: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
    Pequeno: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
    Amador: 'bg-slate-700/20 text-slate-400 border-slate-600/40',
  };
  return <span className={`badge border ${map[tier]}`}>{tier}</span>;
}

export function FormBadge({ rating }: { rating: number }) {
  const color = rating >= 8 ? 'text-accent' : rating >= 6.5 ? 'text-slate-300' : 'text-red-400';
  return <span className={`font-mono text-xs font-bold ${color}`}>{fmtRating(rating)}</span>;
}

export function StatPill({ label, value, color = 'text-slate-200' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-surface-800/70 px-3 py-2">
      <span className={`text-sm font-display font-bold ${color}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
}

// ------------------------------------------------------------
// Barras de progresso / atributos
// ------------------------------------------------------------
export function Bar({ value, max = 100, color, className = '' }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const autoColor = pct >= 80 ? '#3ddc84' : pct >= 55 ? '#4cc9f0' : pct >= 35 ? '#f5b942' : '#ef476f';
  return (
    <div className={`h-1.5 rounded-full bg-surface-700 overflow-hidden ${className}`}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color ?? autoColor }} />
    </div>
  );
}

export function AttrBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 text-xs text-slate-400 shrink-0">{label}</span>
      <Bar value={value} className="flex-1" />
      <span className="w-7 text-right text-xs font-mono font-bold text-slate-200">{value}</span>
    </div>
  );
}

// ------------------------------------------------------------
// StatCard
// ------------------------------------------------------------
export function StatCard({ icon, label, value, sub, accent }: { icon?: React.ReactNode; label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="card p-4 card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
          <p className="mt-1 text-2xl font-display font-bold text-slate-100">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        {icon && <div className={`rounded-lg p-2 ${accent ?? 'bg-accent/10 text-accent'}`}>{icon}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Modal
// ------------------------------------------------------------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[85vh] overflow-y-auto animate-fadeUp p-6`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-700 hover:text-slate-200"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Tabs
// ------------------------------------------------------------
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-800/70 p-1 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition ${active === t.id ? 'bg-accent text-surface-950' : 'text-slate-400 hover:text-slate-200'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Match result pill
// ------------------------------------------------------------
export function ResultPill({ m, perspective, colorFor }: { m: Match; perspective?: string; colorFor?: string }) {
  if (!m.played) return <span className="text-slate-500 text-xs">agendada</span>;
  const hs = m.homeScore ?? 0;
  const as = m.awayScore ?? 0;
  // Com `perspective` (clube do usuário), o placar é exibido da perspectiva
  // desse clube: vitória sempre em verde, derrota em vermelho, independente
  // de mandar/visitar.
  if (perspective) {
    const isHome = m.homeId === perspective;
    const gf = isHome ? hs : as;
    const ga = isHome ? as : hs;
    const color = gf > ga ? 'text-accent' : gf < ga ? 'text-red-400' : 'text-slate-300';
    return <span className={`font-mono font-bold ${color}`}>{gf}-{ga}</span>;
  }
  // Sem `perspective`, mantém o placar casa x fora (usado em tabelas com os
  // dois times rotulados). A cor segue `colorFor` quando informado E o clube
  // participa da partida (ex.: clube do usuário — vitória em verde mesmo
  // jogando fora); caso contrário, segue o mandante.
  const ref = colorFor && (m.homeId === colorFor || m.awayId === colorFor) ? colorFor : m.homeId;
  const isHomeRef = m.homeId === ref;
  const gf = isHomeRef ? hs : as;
  const ga = isHomeRef ? as : hs;
  const color = gf > ga ? 'text-accent' : gf < ga ? 'text-red-400' : 'text-slate-300';
  return <span className={`font-mono font-bold ${color}`}>{hs}-{as}</span>;
}

export function FormRow({ results }: { results: ('W' | 'D' | 'L')[] }) {
  return (
    <div className="flex gap-0.5">
      {results.slice(-5).map((r, i) => (
        <span key={i} className={`flex h-4.5 w-4.5 min-w-[18px] h-[18px] items-center justify-center rounded text-[9px] font-bold ${r === 'W' ? 'bg-accent/20 text-accent' : r === 'D' ? 'bg-slate-600/40 text-slate-300' : 'bg-red-500/20 text-red-400'}`}>
          {r}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------
// Empty state
// ------------------------------------------------------------
export function Empty({ icon = '📭', title, subtitle }: { icon?: string; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <p className="font-display font-semibold text-slate-300">{title}</p>
      {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-sm">{subtitle}</p>}
    </div>
  );
}

// ------------------------------------------------------------
// Count-up animation
// ------------------------------------------------------------
export function useCountUp(target: number, duration = 800): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

export function fmtOv(p: Player): number {
  return overallOf(p);
}

export { playerName, fmtMoney, fmtInt, overallColor };
