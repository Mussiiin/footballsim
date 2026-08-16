// Camada de persistência.
// Sem configuração Supabase: IndexedDB local (modo demo).
// Com VITE_SUPABASE_URL/ANON_KEY: tabela `careers` no Supabase com RLS.
import { Career, Settings, SeasonStats, PlayerHistoryEntry, RecruitmentOfficer } from './types';
import { allocateSectorSeats } from '../game/stadium';
import { addDays } from './date';

// ------------------------------------------------------------
// Migração de saves antigos para o schema atual
// ------------------------------------------------------------
const OFFICER_NAMES = ['Ricardo Andrade', 'Marcos Vinícius', 'Fernanda Lima', 'Paulo César', 'Beatriz Nunes', 'André Siqueira'];

function migrateCareer(c: Career): Career {
  const w = c.world;
  w.version = Math.max(w.version ?? 1, 2);
  if (!w.negotiations) w.negotiations = {};
  for (const n of Object.values(w.negotiations)) {
    if (!n.bidWar) n.bidWar = null;
  }
  if (!w.renewals) w.renewals = {};
  for (const r of Object.values(w.renewals)) {
    r.messages = r.messages ?? [];
    r.offers = r.offers ?? [];
    r.promises = r.promises ?? [];
    r.rejectedReason = r.rejectedReason ?? null;
  }
  if (!w.incomingOffers) w.incomingOffers = [];
  for (const o of w.incomingOffers) {
    o.messages = o.messages ?? [];
    o.mood = o.mood ?? '😐 Neutro';
    o.hiddenMax = o.hiddenMax ?? Math.round(o.fee * 1.15);
    o.playerWantsOut = o.playerWantsOut ?? false;
    o.sellerWar = o.sellerWar ?? false;
    o.saleReport = o.saleReport ?? null;
    o.soldAt = o.soldAt ?? o.createdAt;
    o.attentionNotified = o.attentionNotified ?? false;
  }
  const PROMISE_LABELS: Record<string, string> = {
    'titularidade': 'Titularidade garantida',
    'min-jogos': 'Mínimo de 15 partidas na temporada',
    'posicao': 'Jogar na posição preferida',
    'competicoes': 'Participar de todas as competições',
    'desenvolvimento': 'Foco em desenvolvimento individual',
    'aumento': 'Aumento salarial no fim da temporada',
    'venda': 'Será vendido se chegar proposta boa',
  };
  for (const pr of (c.promises ?? [])) {
    pr.broken = pr.broken ?? false;
    pr.baseline = pr.baseline ?? undefined;
    pr.target = pr.target ?? undefined;
    pr.playerId = pr.playerId ?? '';
    if (PROMISE_LABELS[pr.text]) pr.text = PROMISE_LABELS[pr.text];
  }
  if (!w.marketHighlights) w.marketHighlights = [];
  if (!w.pendingArrivals) w.pendingArrivals = [];
  // migração: chegadas antigas (sem o sistema de etapas) ganham o fluxo completo
  for (const a of w.pendingArrivals) {
    if (a.stage && a.stageEndsOn && a.transferStatus) continue;
    const windowOpen = (() => {
      const mmdd = w.date.slice(5);
      return (mmdd >= w.windows.summer.start && mmdd <= w.windows.summer.end) || (mmdd >= w.windows.winter.start && mmdd <= w.windows.winter.end);
    })();
    a.stage = windowOpen ? 'travel' : 'waiting';
    a.stageEndsOn = a.arrivesOn ?? addDays(w.date, 1);
    a.travelDays = Math.max(1, a.travelDays ?? 1);
    a.registeredOn = null;
    a.medical = null;
    a.registration = windowOpen ? 'pending' : 'awaiting_window';
    a.transferStatus = windowOpen ? 'in_transit' : 'awaiting_window';
    a.status = windowOpen
      ? `✈️ Em trânsito — viagem de ${a.travelDays} dia${a.travelDays > 1 ? 's' : ''}`
      : '🚫 Janela fechada — aguardando próxima abertura';
  }
  if (!w.playerTalks) w.playerTalks = {};
  if (!w.windowRecordFee) w.windowRecordFee = 0;
  // migração: negociações antigas sem exame em andamento
  for (const neg of Object.values(w.negotiations ?? {})) {
    neg.medicalDoneOn = neg.medicalDoneOn ?? null;
    if (neg.medical && neg.medical.status === 'pending' && !neg.medicalDoneOn) {
      neg.medicalDoneOn = addDays(w.date, 1);
    }
  }
  for (const cl of Object.values(w.clubs)) {
    cl.fanTrust = cl.fanTrust ?? 55;
  }
  c.flags.promisesBroken = c.flags.promisesBroken ?? 0;
  c.flags.promisesBrokenSeason = c.flags.promisesBrokenSeason ?? 0;
  c.flags.promisesFulfilledRun = c.flags.promisesFulfilledRun ?? 0;
  c.flags.boardCrisis = c.flags.boardCrisis ?? false;
  c.flags.talksHad = c.flags.talksHad ?? 0;
  c.flags.lastTalkDate = c.flags.lastTalkDate ?? '';
  const fillStadium = (st: any) => {
    const S = ['arquibancada', 'cadeira', 'premium', 'vip', 'camarote'] as const;
    st.reputation = st.reputation == null ? Math.min(95, Math.round(20 + st.capacity / 800)) : Math.min(100, st.reputation);
    st.satisfaction = st.satisfaction ?? 65;
    st.atmosphere = st.atmosphere ?? 55;
    st.protest = st.protest ?? 0;
    if (!st.sectors || !st.sectors.arquibancada) {
      const prices = { arquibancada: 10, cadeira: 20, premium: 40, vip: 70, camarote: 110 } as const;
      const seats = allocateSectorSeats(st.capacity);
      st.sectors = Object.fromEntries(S.map((id) => [id, { seats: seats[id], price: prices[id], share: seats[id] / st.capacity }])) as any;
    } else {
      const sum = S.reduce((a, id) => a + (st.sectors[id]?.seats ?? 0), 0);
      // setores mal distribuídos (soma ≠ capacidade, ex.: bug antigo que somava 183%)
      if (Math.abs(sum - st.capacity) / Math.max(1, st.capacity) > 0.01) {
        const seats = allocateSectorSeats(st.capacity);
        const prices = st.sectors.arquibancada?.price;
        for (const id of S) {
          st.sectors[id].seats = seats[id];
          st.sectors[id].share = seats[id] / st.capacity;
          st.sectors[id].price = st.sectors[id].price ?? (id === 'arquibancada' ? 10 : id === 'cadeira' ? 20 : id === 'premium' ? 40 : id === 'vip' ? 70 : 110);
        }
      } else {
        for (const id of S) {
          st.sectors[id].share = st.sectors[id].share ?? 0.2;
          st.sectors[id].price = st.sectors[id].price ?? (id === 'arquibancada' ? 10 : id === 'cadeira' ? 20 : id === 'premium' ? 40 : id === 'vip' ? 70 : 110);
        }
      }
    }
    st.comfort = st.comfort ?? { assentos: 70, banheiros: 60, alimentacao: 65, climatizacao: 55, acessibilidade: 55, limpeza: 70, iluminacao: 70, acustica: 60 };
    st.foodLevel = st.foodLevel ?? 1;
    st.storeLevel = st.storeLevel ?? 1;
    st.vipLevel = st.vipLevel ?? 1;
    st.parking = st.parking ?? { spaces: Math.round(st.capacity * 0.06), price: 8, level: 1 };
    st.security = st.security ?? 65;
    st.tech = st.tech ?? { telao: 1, som: 1, wifi: false, app: false, catapulta: false, smartTickets: false };
    st.boxes = st.boxes ?? { total: Math.max(4, Math.round(st.capacity / 1200)), sold: 0, price: 150000 };
    if (st.boxes.sold === 0 && st.boxes.total > 0) st.boxes.sold = Math.round(st.boxes.total * 0.6);
    st.works = st.works ?? [];
    st.naming = st.naming ?? null;
    st.namingProposal = st.namingProposal ?? null;
    st.bookings = st.bookings ?? [];
    st.dynamicPricing = st.dynamicPricing ?? false;
    st.lastPriceChange = st.lastPriceChange ?? null;
    st.history = st.history ?? [];
    st.value = st.value ?? Math.round(st.capacity * 2100 + st.capacity * (st.reputation ?? 40) * 22);
    st.eventsHosted = st.eventsHosted ?? 0;
    st.protestsFired = st.protestsFired ?? 0;
    st.seasonAccum = st.seasonAccum ?? { attendance: 0, matches: 0, ticket: 0, commercial: 0, costs: 0 };
  };
  for (const cl of Object.values(w.clubs) as any[]) {
    fillStadium(cl.stadium);
    cl.rivals = cl.rivals ?? [];
  }
  if (!w.agents) w.agents = {};
  if (!w.scoutReports) w.scoutReports = {};
  if (!w.negotiationHistory) w.negotiationHistory = [];
  if (!w.loanOptionTriggers) w.loanOptionTriggers = [];

  const fillStats = (s?: SeasonStats): SeasonStats => ({
    apps: s?.apps ?? 0, starts: s?.starts ?? 0, goals: s?.goals ?? 0, assists: s?.assists ?? 0,
    yellows: s?.yellows ?? 0, reds: s?.reds ?? 0, minutes: s?.minutes ?? 0,
    ratingSum: s?.ratingSum ?? 0, ratingCount: s?.ratingCount ?? 0, cleanSheets: s?.cleanSheets ?? 0,
    manOfMatch: s?.manOfMatch ?? 0, shots: s?.shots ?? 0, shotsOnTarget: s?.shotsOnTarget ?? 0,
    passes: s?.passes ?? 0, tackles: s?.tackles ?? 0, interceptions: s?.interceptions ?? 0,
    keyPasses: s?.keyPasses ?? 0, xg: s?.xg ?? 0, xa: s?.xa ?? 0,
  });

  for (const p of Object.values(w.players)) {
    p.injuryHistory = p.injuryHistory ?? [];
    p.agentId = p.agentId ?? null;
    p.transferRequested = p.transferRequested ?? false;
    p.awards = p.awards ?? [];
    p.loanUntil = p.loanUntil ?? null;
    p.loanOptionFee = p.loanOptionFee ?? 0;
    p.futureSellPct = p.futureSellPct ?? 0;
    p.futureSellClubId = p.futureSellClubId ?? null;
    p.loanObligationGames = p.loanObligationGames ?? 0;
    p.seasonStats = fillStats(p.seasonStats);
    p.careerStats = fillStats(p.careerStats);
    if (Array.isArray(p.history)) {
      p.history = p.history.map((h: PlayerHistoryEntry) => ({
        ...h,
        starts: h.starts ?? 0, awards: h.awards ?? [], minutes: h.minutes ?? 0, shots: h.shots ?? 0,
        shotsOnTarget: h.shotsOnTarget ?? 0, passes: h.passes ?? 0, tackles: h.tackles ?? 0,
        interceptions: h.interceptions ?? 0, keyPasses: h.keyPasses ?? 0, xg: h.xg ?? 0, xa: h.xa ?? 0,
      }));
    }
  }

  if (!c.recruitment) {
    const idx = Math.abs((c.manager.name.charCodeAt(0) ?? 65) % OFFICER_NAMES.length);
    const officer: RecruitmentOfficer = {
      name: OFFICER_NAMES[idx],
      personality: 'Analítico',
      negotiation: 55,
      scouting: 60,
      marketKnowledge: 55,
      reputation: 55,
    };
    c.recruitment = officer;
  }
  c.scouted = c.scouted ?? [];
  c.promises = c.promises ?? [];
  // estado de fim de temporada (intertemporada) — saves antigos não o tinham
  w.seasonEnded = w.seasonEnded ?? false;
  w.seasonEndSummary = w.seasonEndSummary ?? null;
  return c;
}

const DB_NAME = 'footballsim';
const DB_VERSION = 2;

interface CareerRow {
  id: string;
  userId: string;
  data: Career;
  updatedAt: string;
}

interface MetaRow {
  k: string;
  v: unknown;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('careers')) {
        db.createObjectStore('careers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'k' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'k' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

async function txAll<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest[]): Promise<T[]> {
  const db = await openDB();
  return new Promise<T[]>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const reqs = fn(t.objectStore(store));
    const results: T[] = [];
    reqs.forEach((r, i) => {
      r.onsuccess = () => {
        results[i] = r.result as T;
      };
      r.onerror = () => reject(r.error);
    });
    t.oncomplete = () => {
      db.close();
      resolve(results);
    };
  });
}

export const localDB = {
  async saveCareer(c: Career): Promise<void> {
    const row: CareerRow = { id: c.id, userId: c.userId, data: c, updatedAt: new Date().toISOString() };
    await tx('careers', 'readwrite', (s) => s.put(row));
  },
  async getCareer(id: string): Promise<Career | null> {
    const row = await tx<CareerRow | undefined>('careers', 'readonly', (s) => s.get(id));
    return row?.data ?? null;
  },
  async listCareers(userId: string): Promise<CareerRow[]> {
    // txAll resolve com um array de resultados — getAll() retorna uma lista, então vem [rows]
    const all = await txAll<CareerRow[]>('careers', 'readonly', (s) => [s.getAll()]);
    const rows: CareerRow[] = all[0] ?? [];
    return rows.filter((r) => r && r.userId === userId).sort((a, b) => (b.updatedAt < a.updatedAt ? -1 : 1));
  },
  async deleteCareer(id: string): Promise<void> {
    await tx('careers', 'readwrite', (s) => s.delete(id));
  },
  async getMeta<T>(k: string): Promise<T | null> {
    const row = await tx<MetaRow | undefined>('meta', 'readonly', (s) => s.get(k));
    return (row?.v as T) ?? null;
  },
  async setMeta(k: string, v: unknown): Promise<void> {
    await tx('meta', 'readwrite', (s) => s.put({ k, v }));
  },
  async getSettings(): Promise<Settings | null> {
    return this.getMeta<Settings>('settings');
  },
  async saveSettings(s: Settings): Promise<void> {
    await this.setMeta('settings', s);
  },
};

// ------------------------------------------------------------
// Adapter Supabase (quando configurado)
// ------------------------------------------------------------
import { supabase } from './supabase';

export const isSupabaseConfigured = () => supabase !== null;

async function sbSaveCareer(c: Career): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('careers')
    .upsert({ id: c.id, user_id: c.userId, data: c as unknown as Record<string, unknown>, updated_at: new Date().toISOString() });
  if (error) console.warn('Supabase save error:', error.message);
}

async function sbGetCareer(id: string): Promise<Career | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('careers').select('data').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return migrateCareer((data as { data: Career }).data);
}

async function sbListCareers(userId: string): Promise<CareerRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('careers')
    .select('id, user_id, data, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  return (data as { id: string; user_id: string; data: Career; updated_at: string }[]).map((r) => ({
    id: r.id,
    userId: r.user_id,
    data: r.data,
    updatedAt: r.updated_at,
  }));
}

async function sbDeleteCareer(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('careers').delete().eq('id', id);
}

export const storage = {
  saveCareer: async (c: Career): Promise<void> => {
    if (isSupabaseConfigured()) await sbSaveCareer(c);
    await localDB.saveCareer(c);
  },
  getCareer: async (id: string): Promise<Career | null> => {
    if (isSupabaseConfigured()) {
      const remote = await sbGetCareer(id);
      if (remote) return remote;
    }
    const local = await localDB.getCareer(id);
    return local ? migrateCareer(local) : null;
  },
  listCareers: async (userId: string): Promise<CareerRow[]> => {
    if (isSupabaseConfigured()) {
      const remote = await sbListCareers(userId);
      if (remote.length > 0) return remote;
    }
    return localDB.listCareers(userId);
  },
  deleteCareer: async (id: string): Promise<void> => {
    if (isSupabaseConfigured()) await sbDeleteCareer(id);
    await localDB.deleteCareer(id);
  },
  getSettings: localDB.getSettings.bind(localDB),
  saveSettings: localDB.saveSettings.bind(localDB),
};
