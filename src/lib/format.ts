export function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)} bi`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 1)} mi`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)} mil`;
  return `${sign}${Math.round(abs)}`;
}

export function fmtMoneyFull(v: number): string {
  return `€${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString('pt-BR');
}

export function fmtPct(v: number): string {
  return `${Math.round(v)}%`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function fmtRating(r: number): string {
  return r.toFixed(1);
}

/** Cor/estilo para overall */
export function overallColor(ov: number): string {
  if (ov >= 85) return 'text-gold';
  if (ov >= 75) return 'text-accent';
  if (ov >= 65) return 'text-sky-400';
  if (ov >= 55) return 'text-slate-300';
  return 'text-slate-500';
}

export function valueTier(rep: number): string {
  if (rep >= 85) return 'Lendário';
  if (rep >= 70) return 'Elite';
  if (rep >= 55) return 'Internacional';
  if (rep >= 40) return 'Nacional';
  if (rep >= 25) return 'Regional';
  return 'Amador';
}

/** Nota de partida → cor */
export function ratingColor(r: number): string {
  if (r >= 8) return 'text-gold';
  if (r >= 7) return 'text-accent';
  if (r >= 6) return 'text-slate-300';
  return 'text-red-400';
}
