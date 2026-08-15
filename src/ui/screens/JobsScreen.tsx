import { useMemo } from 'react';
import { useGame } from '../../state/store';
import { offersForManager } from '../../game/career';
import { ClubCrest, TierBadge, Empty } from '../components';
import { fmtMoney } from '../../lib/format';
import { formatDateBR } from '../../lib/date';

export function JobsScreen() {
  const { career, acceptJob } = useGame();
  const world = career!.world;
  const offers = useMemo(() => offersForManager(career!), [career]);

  if (career!.clubId) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-fadeUp">
        <h1 className="font-display font-bold text-2xl text-slate-100">Ofertas de emprego</h1>
        <div className="card p-6">
          <Empty
            icon="🏟️"
            title="Você está empregado"
            subtitle={`Comandando o ${world.clubs[career!.clubId].name}. Outros clubes podem demonstrar interesse ao longo da carreira.`}
          />
        </div>
        {offers.length > 0 && (
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Clubes interessados em você</p>
            {offers.map((o) => (
              <div key={o.clubId} className="flex items-center gap-3 rounded-lg bg-surface-800/40 p-3 mb-2">
                <ClubCrest club={world.clubs[o.clubId]} size={40} />
                <div className="flex-1">
                  <p className="font-semibold text-slate-100">{o.clubName}</p>
                  <p className="text-xs text-slate-500">{fmtMoney(o.salary)}/sem · reputação {o.rep}</p>
                </div>
                <button onClick={() => acceptJob(o.clubId)} className="btn-secondary text-xs">Aceitar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fadeUp">
      <div className="card p-6 border-gold/30">
        <p className="text-2xl mb-2">💼</p>
        <h1 className="font-display font-bold text-2xl text-gold">Desempregado</h1>
        <p className="text-sm text-slate-400 mt-1">
          Após {career!.manager.sackedCount} demissão(ões), você está no mercado. Aceite uma oferta para voltar aos gramados.
          Use <span className="text-slate-200">Avançar dia/semana</span> para o mundo gerar novas oportunidades.
        </p>
        <p className="text-xs text-slate-500 mt-2">Temporada {world.season} · {formatDateBR(world.date)} · Reputação {career!.manager.reputation}</p>
      </div>

      {offers.length === 0 ? (
        <div className="card">
          <Empty icon="🔍" title="Nenhuma oferta no momento" subtitle="Avance o tempo — clubes insatisfeitos com seus técnicos abrem vagas." />
        </div>
      ) : (
        offers.map((o) => (
          <div key={o.clubId} className="card p-4 flex items-center gap-4 card-hover">
            <ClubCrest club={world.clubs[o.clubId]} size={52} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-100">{o.clubName}</p>
                <TierBadge tier={world.clubs[o.clubId].tier} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{world.clubs[o.clubId].city} · Força {world.clubs[o.clubId].squadStrength.toFixed(1)} · Caixa {fmtMoney(world.clubs[o.clubId].balance)}</p>
            </div>
            <div className="text-right">
              <p className="font-display font-bold text-gold">{fmtMoney(o.salary)}/sem</p>
              <button onClick={() => acceptJob(o.clubId)} className="btn-primary mt-2 text-xs">Aceitar emprego</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
