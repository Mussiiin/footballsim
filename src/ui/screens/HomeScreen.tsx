import { useGame } from '../../state/store';
import { formatDateShort } from '../../lib/date';

export function HomeScreen() {
  const { navigate, careers, continueCareer, user, logout, settings } = useGame();
  const last = careers[0];
  const world = last?.data.world;
  const countryCount = world?.countries.length ?? 4;
  const leagueCount = world ? world.countries.reduce((a, c) => a + c.divisions.length, 0) : 12;
  const clubCount = world ? Object.keys(world.clubs).length : 240;

  return (
    <div className="min-h-full flex flex-col relative overflow-hidden">
      {/* fundo decorativo */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full bg-accent/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-sky-500/10 blur-[120px]" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="animate-fadeUp">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent via-accent-400 to-sky-500 flex items-center justify-center font-display font-extrabold text-2xl text-surface-950 shadow-glow animate-pulseGlow">
              FS
            </div>
          </div>
          <h1 className="text-center font-display font-extrabold text-5xl md:text-6xl text-slate-50">
            Football<span className="text-gradient">Sim</span>
          </h1>
          <p className="text-center text-slate-400 mt-3 max-w-md mx-auto">
            Comande seu clube, monte o elenco, defina a tática e escreva sua história no futebol.
            Cada partida, cada transferência e cada temporada importa.
          </p>
        </div>

        <div className="mt-10 w-full max-w-sm space-y-3 animate-fadeUp" style={{ animationDelay: '0.15s' }}>
          <button onClick={() => navigate('new-career')} className="btn-primary w-full py-3.5 text-base">
            ➕ Nova Carreira
          </button>
          <button
            onClick={() => void continueCareer()}
            disabled={!last}
            className="btn-secondary w-full py-3"
          >
            ▶️ Continuar{last ? ` — ${last.data.manager.name}` : ''}
          </button>
          <button onClick={() => navigate('my-careers')} disabled={careers.length === 0} className="btn-ghost w-full py-3">
            📂 Carregar Carreira{careers.length > 0 ? ` (${careers.length})` : ''}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate('settings')} className="btn-ghost py-3">⚙️ Configurações</button>
            <button onClick={() => navigate('about')} className="btn-ghost py-3">ℹ️ Sobre</button>
            <button onClick={() => navigate('auth')} className="btn-ghost py-3">👤 Minha conta</button>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-1.5 text-xs text-slate-500 animate-fadeIn" style={{ animationDelay: '0.4s' }}>
          {last && (
            <p className="rounded-full bg-surface-800/80 border border-surface-700 px-4 py-1.5">
              Última carreira: <span className="text-slate-300 font-medium">{last.data.manager.name}</span> no <span className="text-slate-300 font-medium">{last.data.world.clubs[last.data.clubId]?.name ?? '—'}</span> · {formatDateShort(last.updatedAt.slice(0, 10))}
            </p>
          )}
          <button onClick={() => void logout()} className="hover:text-slate-300 transition">
            Sair da conta ({user?.name ?? user?.email})
          </button>
        </div>
      </div>

      <div className="relative text-center text-[11px] text-slate-600 pb-6">
        {countryCount} países · {leagueCount} ligas · {clubCount} clubes · {settings.theme === 'dark' ? 'modo escuro' : 'modo claro'}
      </div>
    </div>
  );
}
