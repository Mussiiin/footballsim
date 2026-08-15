import React, { useState } from 'react';
import { useGame } from '../../state/store';
import { isSupabaseConfigured } from '../../lib/supabase';

type Mode = 'login' | 'signup' | 'recover';

export function AuthScreen() {
  const { login, register, forgotPassword } = useGame();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        const r = await login(email, password);
        if (r.error) setError(r.error);
      } else if (mode === 'signup') {
        const r = await register(email, password, name);
        if (r.error) setError(r.error);
      } else {
        const r = await forgotPassword(email);
        if (r.error) setError(r.error);
        else setMsg('Se o e-mail existir, enviaremos um link de recuperação.');
      }
    } finally {
      setBusy(false);
    }
  };

  const demo = !isSupabaseConfigured();

  return (
    <div className="min-h-full flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-accent/10 blur-[120px]" />
      </div>
      <div className="relative w-full max-w-md animate-fadeUp">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-sky-500 flex items-center justify-center font-display font-extrabold text-surface-950">FS</div>
          <span className="font-display font-bold text-xl text-slate-100">FootballSim</span>
        </div>

        <div className="card p-6">
          {demo && (
            <div className="mb-4 rounded-lg bg-accent/10 border border-accent/30 p-3 text-xs text-accent">
              <p className="font-semibold mb-0.5">🧪 Modo demo</p>
              <p>Sem Supabase configurado. As contas e carreiras ficam salvas localmente neste navegador.</p>
            </div>
          )}

          <div className="flex gap-1 rounded-xl bg-surface-800 p-1 mb-5">
            {(['login', 'signup', 'recover'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${mode === m ? 'bg-accent text-surface-950' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {m === 'login' ? 'Entrar' : m === 'signup' ? 'Criar conta' : 'Recuperar senha'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label">Nome</label>
                <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome de treinador" required />
              </div>
            )}
            <div>
              <label className="label">E-mail</label>
              <input className="input w-full" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" required />
            </div>
            {mode !== 'recover' && (
              <div>
                <label className="label">Senha</label>
                <input className="input w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            )}

            {error && <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">{error}</div>}
            {msg && <div className="rounded-lg bg-accent/10 border border-accent/30 p-3 text-xs text-accent">{msg}</div>}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? '…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-4">
          Cada treinador tem suas próprias carreiras protegidas por RLS.
        </p>
      </div>
    </div>
  );
}
