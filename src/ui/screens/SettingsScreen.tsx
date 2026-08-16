import { useGame } from '../../state/store';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  GAME_VERSION,
  appliedVersion,
  isUpdateAvailable,
  openUpdateModal,
  openUpdateHistory,
} from '../../game/updateNotes';

export function SettingsScreen() {
  const { settings, updateSettings, user, logout, navigate, saveNow, lastSaved } = useGame();

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fadeUp">
      <h1 className="font-display font-bold text-2xl text-slate-100">Configurações</h1>

      <div className="card p-5 space-y-5">
        <div>
          <label className="label">Tema</label>
          <div className="flex gap-2">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} onClick={() => void updateSettings({ theme: t })} className={`btn ${settings.theme === t ? 'btn-primary' : 'btn-secondary'}`}>
                {t === 'dark' ? '🌙 Escuro' : '☀️ Claro'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Animações</label>
          <button onClick={() => void updateSettings({ animations: !settings.animations })} className={`btn ${settings.animations ? 'btn-primary' : 'btn-secondary'}`}>
            {settings.animations ? '✅ Ativadas' : 'Desativadas'}
          </button>
        </div>

        <div>
          <label className="label">Notificações</label>
          <button onClick={() => void updateSettings({ notifications: !settings.notifications })} className={`btn ${settings.notifications ? 'btn-primary' : 'btn-secondary'}`}>
            {settings.notifications ? '🔔 Ativas' : '🔕 Desativadas'}
          </button>
        </div>

        <div>
          <label className="label">Volume de efeitos ({settings.volume}%)</label>
          <input type="range" min={0} max={100} value={settings.volume} onChange={(e) => void updateSettings({ volume: Number(e.target.value) })} className="w-full accent-[#3ddc84]" />
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Atualizações</p>
          <span className="badge bg-accent/15 text-accent border border-accent/30">⚙️ v{GAME_VERSION}</span>
        </div>
        <p className="text-sm text-slate-300 mb-3">
          Versão instalada: <span className="font-mono font-bold text-accent">v{appliedVersion()}</span>
        </p>
        {isUpdateAvailable() ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openUpdateModal()} className="btn-primary !py-2 text-sm">
              🚀 Atualização disponível
            </button>
            <button onClick={() => openUpdateHistory()} className="btn-secondary !py-2 text-sm">
              📜 Histórico de atualizações
            </button>
          </div>
        ) : (
          <p className="text-xs text-accent">✅ Jogo atualizado para a versão mais recente.</p>
        )}
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Conta</p>
        <p className="text-sm text-slate-300 mb-1">{user?.name} · {user?.email}</p>
        <p className="text-xs text-slate-500 mb-3">
          {isSupabaseConfigured() ? '🔐 Autenticado via Supabase (RLS ativo)' : '🧪 Modo demo — dados locais neste navegador'}
        </p>
        <div className="flex gap-2">
          <button onClick={() => void saveNow()} className="btn-secondary">💾 Salvar agora {lastSaved ? `(${lastSaved.toLocaleTimeString('pt-BR')})` : ''}</button>
          <button onClick={() => void logout()} className="btn-danger">Sair</button>
          <button onClick={() => navigate('home')} className="btn-ghost">Voltar</button>
        </div>
      </div>

      <div className="card p-5 text-xs text-slate-500 space-y-1">
        <p>⚙️ FootballSim v{GAME_VERSION} — jogo de gerenciamento de futebol.</p>
        <p>Os dados fictícios são gerados deterministicamente a partir de seeds. Nenhuma API externa é necessária.</p>
      </div>
    </div>
  );
}
