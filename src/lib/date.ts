// Datas do jogo são strings 'YYYY-MM-DD' para serialização estável.

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(s: string, days: number): string {
  const d = fromDateStr(s);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function daysBetween(a: string, b: string): number {
  const da = fromDateStr(a).getTime();
  const db = fromDateStr(b).getTime();
  return Math.round((db - da) / 86400000);
}

export function addMonths(s: string, months: number): string {
  const d = fromDateStr(s);
  d.setMonth(d.getMonth() + months);
  return toDateStr(d);
}

export function formatDateBR(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateShort(s: string): string {
  const [y, m, d] = s.split('-');
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${d} ${meses[(Number(m) - 1)]} ${y}`;
}

export function dayOfWeek(s: string): number {
  return fromDateStr(s).getDay(); // 0 = domingo
}

export function monthOf(s: string): number {
  return Number(s.slice(5, 7));
}

export function yearOf(s: string): number {
  return Number(s.slice(0, 4));
}

export function seasonFromDate(s: string): string {
  // temporada começa em agosto; julho/agosto pertencem à nova temporada
  const m = monthOf(s);
  const y = yearOf(s);
  if (m >= 7) return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
  return `${y - 1}/${String(y % 100).padStart(2, '0')}`;
}

export function ageAt(birthDate: string, date: string): number {
  const b = fromDateStr(birthDate);
  const d = fromDateStr(date);
  let age = d.getFullYear() - b.getFullYear();
  const bd = new Date(d.getFullYear(), b.getMonth(), b.getDate());
  if (d < bd) age--;
  return age;
}

export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
