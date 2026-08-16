import { useMemo } from 'react';
import { useGame } from '../../state/store';
import { StatCard } from '../components';
import { fmtMoney, fmtMoneyFull } from '../../lib/format';
import { monthlyTvMoney, monthlySponsorship } from '../../game/finances';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export function FinancesScreen() {
  const { career } = useGame();
  const world = career!.world;
  const club = world.clubs[career!.clubId];

  const staffCost = club.staff.reduce((s, m) => s + m.salary, 0) + club.coach.salary;
  const tv = monthlyTvMoney(club);
  const sponsor = monthlySponsorship(club);
  const monthlyCost = club.wageBill + staffCost + club.stadium.maintenanceCost + Math.round(club.wageBill * 0.06);

  const chart = useMemo(() => {
    const data = club.financeHistory.slice(-24).map((h) => ({
      name: h.month.slice(5),
      Receitas: Math.round(h.revenue / 1000),
      Despesas: Math.round(h.expenses / 1000),
      Saldo: Math.round(h.balance / 1000000),
    }));
    return data;
  }, [club.financeHistory]);

  const squad = Object.values(world.players).filter((p) => p.clubId === career!.clubId && p.status === 'active' && !p.arrivingUntil);
  const topWages = [...squad].sort((a, b) => (b.contract?.wage ?? 0) - (a.contract?.wage ?? 0)).slice(0, 8);

  return (
    <div className="space-y-5 animate-fadeUp">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Finanças</h1>
        <p className="text-sm text-slate-500">{club.name} · Temporada {world.season}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Caixa" value={fmtMoney(club.balance)} sub={club.balance < 0 ? '⚠️ Endividado' : 'Situação saudável'} accent={club.balance < 0 ? 'bg-red-500/10 text-red-400' : 'bg-gold/10 text-gold'} />
        <StatCard label="Orçamento" value={fmtMoney(club.budget)} sub="Para transferências" />
        <StatCard label="Folha salarial" value={fmtMoney(club.wageBill)} sub={`${squad.length} jogadores`} />
        <StatCard label="Valor do clube" value={fmtMoney(club.clubValue)} sub={`${club.tier}`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Balanço mensal (últimos 24 meses)</p>
          {chart.length > 1 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3ddc84" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#3ddc84" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef476f" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#ef476f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f2a38" strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke="#475569" fontSize={10} />
                  <YAxis stroke="#475569" fontSize={10} tickFormatter={(v) => `${v}k`} />
                  <Tooltip contentStyle={{ background: '#10161d', border: '1px solid #1f2a38', borderRadius: 8 }} />
                  <Area type="monotone" dataKey="Receitas" stroke="#3ddc84" fill="url(#gRev)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Despesas" stroke="#ef476f" fill="url(#gExp)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Dados insuficientes — aguarde o fechamento mensal.</p>
          )}
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Receitas mensais</p>
            <div className="space-y-2 text-sm">
              <Row label="📺 Televisão" value={tv} />
              <Row label="🤝 Patrocínio" value={sponsor} />
              <Row label="🎟️ Bilheteria" value={(club.financeHistory[club.financeHistory.length - 1]?.revenue ?? 0) - tv - sponsor} />
            </div>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Despesas mensais</p>
            <div className="space-y-2 text-sm">
              <Row label="💼 Salários" value={club.wageBill} />
              <Row label="🧑‍🏫 Comissão técnica" value={staffCost} />
              <Row label="🏟️ Manutenção" value={club.stadium.maintenanceCost} />
              <Row label="📊 Custo total" value={monthlyCost} strong />
            </div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Maiores salários</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {topWages.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg bg-surface-800/50 px-3 py-2 text-sm">
              <span className="text-slate-200">{p.firstName} {p.lastName}</span>
              <span className="font-mono text-gold">{fmtMoney(p.contract?.wage ?? 0)}/sem</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-600 mt-3">{fmtMoneyFull(club.balance)} de caixa · Estádio {club.stadium.name} (capacidade {club.stadium.capacity.toLocaleString('pt-BR')})</p>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${strong ? 'text-slate-100 font-bold' : 'text-slate-300'}`}>{fmtMoney(value)}</span>
    </div>
  );
}
