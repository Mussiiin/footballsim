import { World, Club } from '../lib/types';
import { clamp } from '../lib/format';

export function monthlyTvMoney(club: Club): number {
  const div = club.leagueId.split('_').pop();
  if (div === 'L1') return Math.round(400_000 + club.reputation * 38_000);
  if (div === 'L2') return Math.round(90_000 + club.reputation * 6_000);
  if (div === 'L3') return Math.round(30_000 + club.reputation * 2_200);
  // Série D — receita de TV mínima, coerente com a escala da divisão
  return Math.round(8_000 + club.reputation * 600);
}

export function monthlySponsorship(club: Club): number {
  return Math.round(club.reputation * club.fans * 0.9 + club.facilities.commercial * 6_000);
}

function staffCost(club: Club): number {
  return club.staff.reduce((s, m) => s + m.salary, 0) + club.coach.salary;
}

/** Processa o fechamento mensal de finanças de um clube. */
export function applyMonthlyFinances(club: Club, month: string): void {
  const revenue = club.financeAccum.revenue + monthlyTvMoney(club) + monthlySponsorship(club);
  const expenses =
    club.financeAccum.expenses +
    club.wageBill +
    staffCost(club) +
    club.stadium.maintenanceCost +
    Math.round(club.wageBill * 0.06); // bônus estimados

  club.balance += revenue - expenses;
  club.financeHistory.push({ month, revenue, expenses, balance: Math.round(club.balance) });
  if (club.financeHistory.length > 36) club.financeHistory.shift();
  club.financeAccum.revenue = 0;
  club.financeAccum.expenses = 0;
}

export function monthlyFinancesTick(world: World, monthKey: string): void {
  for (const club of Object.values(world.clubs)) {
    applyMonthlyFinances(club, monthKey);
  }
}

export function inFinancialTrouble(club: Club): boolean {
  return club.balance < club.wageBill * 2;
}

export function financeTrend(club: Club): number {
  const h = club.financeHistory;
  if (h.length < 2) return 0;
  return h[h.length - 1].balance - h[0].balance;
}

export function balanceAfterMonths(club: Club, months: number): number {
  const h = club.financeHistory;
  if (h.length === 0) return club.balance;
  return h[h.length - 1].balance;
}

export function clampMoney(v: number): number {
  return clamp(v, -500_000_000, 2_000_000_000);
}
