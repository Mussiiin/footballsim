import { useGame } from '../../state/store';
import { Bar, StatCard } from '../components';
import { fmtMoney, fmtInt } from '../../lib/format';

const ROLE_ICON: Record<string, string> = {
  'Assistente': '🧑‍💼', 'Preparador físico': '💪', 'Treinador de goleiros': '🧤',
  'Analista': '📊', 'Scout': '🔭', 'Médico': '🩺',
};

export function StaffScreen() {
  const { career, navigate } = useGame();
  const club = career!.world.clubs[career!.clubId];
  const coach = career!.manager;

  const attrs = [
    { label: 'Tática', value: coach.attrs.tactical },
    { label: 'Desenvolvimento', value: coach.attrs.development },
    { label: 'Motivação', value: coach.attrs.motivation },
    { label: 'Gestão', value: coach.attrs.management },
    { label: 'Scouting', value: coach.attrs.scouting },
    { label: 'Negociação', value: coach.attrs.negotiation },
  ];

  return (
    <div className="space-y-5 animate-fadeUp">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Comissão técnica</h1>
        <p className="text-sm text-slate-500">{club.name}</p>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-sky-500 flex items-center justify-center font-display font-bold text-2xl text-surface-950">
            {coach.name[0]}
          </div>
          <div className="flex-1">
            <p className="font-display font-bold text-lg text-slate-100">{coach.name}</p>
            <p className="text-sm text-slate-400">Treinador principal · {coach.nationality} · {coach.age} anos</p>
            <p className="text-xs text-slate-500">Licença {coach.license} · Salário {fmtMoney(coach.salary)}/sem · Reputação {coach.reputation}</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          {attrs.map((a) => (
            <div key={a.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{a.label}</span>
                <span className="font-mono font-bold text-slate-200">{fmtInt(a.value)}</span>
              </div>
              <Bar value={a.value} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {club.staff.map((s) => (
          <div key={s.id} className="card p-4 card-hover">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-surface-700 flex items-center justify-center text-xl">{ROLE_ICON[s.role] ?? '👤'}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-100 truncate">{s.name}</p>
                <p className="text-xs text-slate-500">{s.role}</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-500">Qualidade</span>
                <span className="font-mono font-bold text-accent">{fmtInt(s.quality)}</span>
              </div>
              <Bar value={s.quality} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 mt-2">
              <span>{fmtMoney(s.salary)}/sem</span>
              <span>até {s.contractUntil.slice(0, 4)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5 text-sm text-slate-400">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Como a comissão ajuda</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li><span className="text-slate-300">Assistente</span> — melhora a motivação e ajuda na gestão do elenco.</li>
          <li><span className="text-slate-300">Preparador físico</span> — acelera a recuperação de condição e reduz lesões musculares.</li>
          <li><span className="text-slate-300">Treinador de goleiros</span> — desenvolve seus goleiros mais rápido.</li>
          <li><span className="text-slate-300">Scout</span> — melhora a precisão das informações no mercado.</li>
          <li><span className="text-slate-300">Médico</span> — reduz o tempo de recuperação de lesões.</li>
          <li><span className="text-slate-300">Analista</span> — refina a preparação tática para cada partida.</li>
        </ul>
        <button onClick={() => navigate('training')} className="btn-secondary mt-4 text-xs">Ir para o treinamento</button>
      </div>
    </div>
  );
}
