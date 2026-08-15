-- ============================================================
-- FootballSim — migração inicial
-- ------------------------------------------------------------
-- O jogo roda 100% no cliente (IndexedDB) sem configuração.
-- Quando VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY são
-- definidos, o save/load de carreiras passa a usar esta tabela.
--
-- O estado completo de cada carreira é serializado em JSONB na
-- coluna `data`. Isso mantém o mundo do jogo (centenas de clubes,
-- milhares de jogadores, partidas, temporadas) transacionalmente
-- consistente e evita dezenas de joins por frame de simulação.
-- Consultas analíticas futuras (rankings globais, Hall da Fama)
-- podem ser servidas por tabelas derivadas criadas em migrações
-- posteriores.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- profiles — metadados públicos do usuário (opcional por enquanto)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_own_select" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_own_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_own_update" on public.profiles
  for update using (auth.uid() = id);

-- ------------------------------------------------------------
-- careers — saves de carreira do jogador (RLS estrito)
-- ------------------------------------------------------------
create table if not exists public.careers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Índices: cada usuário lista as próprias carreiras por atualização.
create index if not exists careers_user_id_idx on public.careers (user_id);
create index if not exists careers_updated_at_idx on public.careers (updated_at desc);

alter table public.careers enable row level security;

-- Política central: ninguém lê, cria, altera ou apaga carreira
-- que não seja sua. Dados globais do jogo (clubes, jogadores)
-- vivem dentro do JSONB da carreira e portanto também ficam
-- protegidos — o mundo de um jogador é invisível aos demais.
create policy "careers_own_select" on public.careers
  for select using (auth.uid() = user_id);

create policy "careers_own_insert" on public.careers
  for insert with check (auth.uid() = user_id);

create policy "careers_own_update" on public.careers
  for update using (auth.uid() = user_id);

create policy "careers_own_delete" on public.careers
  for delete using (auth.uid() = user_id);

-- Trigger: mantém updated_at fresco em upserts.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists careers_set_updated_at on public.careers;
create trigger careers_set_updated_at
  before update on public.careers
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Notas de segurança
-- ------------------------------------------------------------
-- 1. Nenhuma chave secreta vai para o frontend: o cliente usa
--    apenas a anon key (RLS aplica as políticas acima).
-- 2. A coluna `data` é tratada como opaca pelo servidor; nunca
--    confie nela server-side sem validação em migrações futuras
--    (RPCs de ranking, etc.).
-- 3. Admin: operações globais (seed, moderação) devem usar o
--    service role APENAS em funções server-side (edge functions),
--    nunca expostas ao cliente.
