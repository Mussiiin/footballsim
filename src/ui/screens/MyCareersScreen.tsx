import { useState } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, Modal, Empty, TierBadge } from '../components';
import { formatDateBR } from '../../lib/date';
import { fmtMoney } from '../../lib/format';

export function MyCareersScreen() {
  const { careers, navigate, loadCareer, deleteCareer, newCareer, user } = useGame();
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    await deleteCareer(toDelete);
    setToDelete(null);
  };

  return (
    <div className="min-h-full max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Minhas Carreiras</h1>
          <p className="text-sm text-slate-500">{user?.name} — {careers.length} carreira(s)</p>
        </div>
        <button onClick={() => navigate('new-career')} className="btn-primary">➕ Nova</button>
      </div>

      {careers.length === 0 ? (
        <div className="card">
          <Empty
            icon="📂"
            title="Nenhuma carreira ainda"
            subtitle="Crie seu treinador, escolha um clube e comece a escrever sua história."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {careers.map((row) => {
            const c = row.data;
            const club = c.world.clubs[c.clubId];
            return (
              <div key={row.id} className="card p-4 flex items-center gap-4 card-hover">
                {club && <ClubCrest club={club} size={52} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-100 truncate">{c.manager.name}</p>
                    <span className="badge bg-surface-700 text-slate-300">{c.difficulty}</span>
                    {club && <TierBadge tier={club.tier} />}
                  </div>
                  <p className="text-sm text-slate-400 truncate">
                    {club ? club.name : 'Desempregado'} · Temporada {c.world.season} · {formatDateBR(c.world.date)}
                  </p>
                  <p className="text-xs text-slate-600">
                    {c.flags.titles} título(s) · {c.flags.wins}V {c.flags.draws}E {c.flags.losses}D · Último acesso {formatDateBR(row.updatedAt.slice(0, 10))}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button onClick={() => { void loadCareer(row.id); }} className="btn-primary">Continuar</button>
                  <button onClick={() => setToDelete(row.id)} className="btn-danger">Excluir</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Excluir carreira">
        <p className="text-sm text-slate-400">Tem certeza? Esta ação não pode ser desfeita e toda a história da carreira será perdida.</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setToDelete(null)} className="btn-secondary">Cancelar</button>
          <button onClick={() => void confirmDelete()} disabled={busy} className="btn-danger">Excluir definitivamente</button>
        </div>
      </Modal>
    </div>
  );
}
