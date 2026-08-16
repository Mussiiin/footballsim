import { supabase, isSupabaseConfigured } from './supabase';
import { localDB } from './db';

export interface User {
  id: string;
  email: string;
  name: string;
  isDemo: boolean;
}

const DEMO_USER_KEY = 'fs_demo_user';

function demoUser(): User | null {
  const raw = localStorage.getItem(DEMO_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

async function ensureDemoUser(): Promise<User> {
  let u = demoUser();
  if (!u) {
    u = { id: 'demo-user', email: 'demo@footballsim.local', name: 'Técnico Demo', isDemo: true };
    localStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
  }
  return u;
}

/** Obtém o usuário atual. Em modo demo, sempre há um usuário demo. */
export async function getCurrentUser(): Promise<User | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      return {
        id: data.session.user.id,
        email: data.session.user.email ?? '',
        name: data.session.user.user_metadata?.name ?? data.session.user.email ?? 'Treinador',
        isDemo: false,
      };
    }
    return null;
  }
  return ensureDemoUser();
}

export async function signIn(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: error.message };
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
        name: data.user.user_metadata?.name ?? email,
        isDemo: false,
      },
      error: null,
    };
  }
  // Modo demo: qualquer credencial aceita; guarda o e-mail no usuário local
  const user = await ensureDemoUser();
  if (email) user.email = email;
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
  return { user, error: null };
}

export async function signUp(email: string, password: string, name: string): Promise<{ user: User | null; error: string | null }> {
  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { user: null, error: error.message };
    return {
      user: {
        id: data.user?.id ?? '',
        email,
        name,
        isDemo: false,
      },
      error: null,
    };
  }
  // Modo demo: a “conta” fica salva localmente neste navegador
  const user = await ensureDemoUser();
  user.name = name || user.name;
  user.email = email || user.email;
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user));
  return { user, error: null };
}

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem(DEMO_USER_KEY);
}

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }
  return { error: null };
}

export function onAuthChange(cb: (user: User | null) => void): () => void {
  if (isSupabaseConfigured() && supabase) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        cb({
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.user_metadata?.name ?? session.user.email ?? 'Treinador',
          isDemo: false,
        });
      } else {
        cb(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }
  return () => {};
}

/** Atualiza o nome do usuário demo (usado na tela inicial). */
export async function setDemoName(name: string): Promise<void> {
  const u = await ensureDemoUser();
  u.name = name;
  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
}
