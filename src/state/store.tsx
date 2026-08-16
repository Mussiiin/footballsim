import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Career, Settings, DEFAULT_SETTINGS, TeamSetup, TrainingFocus, Difficulty, Match } from '../lib/types';
import { getCurrentUser, signIn, signUp, signOut, User, onAuthChange, resetPassword } from '../lib/auth';
import { storage } from '../lib/db';
import { createCareer, acceptJobOffer, sackManager } from '../game/career';
import { advanceToNextMatch, playUserMatch, simulateOneDay, finishMatchDay, DayResult } from '../game/sim';
import { negotiateTransfer, executeTransfer, NegotiationResult, releasePlayer } from '../game/transfers';
import { investInYouthFacility, promoteYouthPlayer, releaseYouthPlayer } from '../game/development';
import { SeasonSummary } from '../lib/types';
import { startNextSeason as runStartNextSeason } from '../game/season';
import {
  scoutPlayer as runScout, startNegotiation as runStartNegotiation,
  sendClubOffer, respondToSeller, sendWageOffer, respondToPlayer, respondToBidWar,
  startRenewal as runStartRenewal, sendRenewalOffer, respondToRenewal, completeRenewal,
  runMedical, signDeal, cancelNegotiation, respondToIncomingOffer, SigningResult, TransferNegotiation,
  NegotiationKind,
} from '../game/negotiation';
import { RenewalNegotiation } from '../lib/types';
import { ScoutReport } from '../lib/types';

interface CareerRow {
  id: string;
  userId: string;
  data: Career;
  updatedAt: string;
}

export type NegotiationAction =
  | { type: 'club-offer'; fee: number; bonus: number; sellOnPct: number; installments: number; loanOptionFee?: number; loanObligationGames?: number; loanWageShare?: number }
  | { type: 'seller-response'; action: 'accept' | 'withdraw' | 'add-bonus' | 'add-sellon' | 'counter'; fee?: number; bonus?: number; sellOnPct?: number }
  | { type: 'bidwar-response'; action: 'cover' | 'raise' | 'withdraw'; fee?: number }
  | { type: 'wage-offer'; wage: number; bonus: number; years: number; role: string; promises: string[] }
  | { type: 'player-response'; action: 'accept' | 'end' | 'add-bonus' | 'counter'; wage?: number; bonus?: number }
  | { type: 'renewal-offer'; wage: number; bonus: number; years: number; role: string; promises: string[] }
  | { type: 'renewal-response'; action: 'accept' | 'end' | 'add-bonus' | 'counter'; wage?: number; bonus?: number }
  | { type: 'renewal-sign' }
  | { type: 'medical' }
  | { type: 'sign' }
  | { type: 'cancel'; reason: string }
  | { type: 'incoming-offer'; offerId: string; action: 'accept' | 'reject' | 'counter'; fee?: number };

interface GameStore {
  user: User | null;
  loading: boolean;
  settings: Settings;
  careers: CareerRow[];
  career: Career | null;
  route: string;
  navigate: (route: string) => void;
  goBack: () => void;
  login: (email: string, password: string) => Promise<{ error: string | null }>;
  register: (email: string, password: string, name: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ error: string | null }>;
  refreshCareers: () => Promise<void>;
  newCareer: (input: { name: string; nationality: string; age: number; license: Career['manager']['license']; style: Career['manager']['style'] }, clubId: string, difficulty: Difficulty) => Promise<Career>;
  loadCareer: (id: string) => Promise<void>;
  deleteCareer: (id: string) => Promise<void>;
  continueCareer: () => Promise<void>;
  saveNow: () => Promise<void>;
  touch: () => void; // força re-render após mutação
  mutate: (fn: (c: Career) => void) => void;
  advanceDay: () => DayResult | null;
  advanceToMatch: () => DayResult | null;
  advanceWeek: () => DayResult | null;
  playMatch: () => Match | null;
  finishDay: () => DayResult | null;
  startNextSeason: () => void;
  setLineup: (l: TeamSetup) => void;
  setTrainingFocus: (f: TrainingFocus) => void;
  proposeTransfer: (playerId: string, fee: number, wage: number) => NegotiationResult;
  confirmTransfer: (playerId: string, fee: number, wage: number) => void;
  sellPlayer: (playerId: string, fee: number) => void;
  loanPlayer: (playerId: string, toClubId: string) => void;
  freePlayer: (playerId: string) => void;
  scoutPlayer: (playerId: string) => ScoutReport;
  toggleShortlist: (playerId: string) => void;
  startNegotiation: (playerId: string, kind: NegotiationKind) => TransferNegotiation;
  startRenewal: (playerId: string) => RenewalNegotiation;
  sendNegotiationAction: (negId: string, action: NegotiationAction) => void;
  signing: SigningResult | null;
  clearSigning: () => void;
  negotiationRoute: (playerId: string) => void;
  acceptJob: (clubId: string) => void;
  investInYouth: (levels: number) => void;
  promoteYouth: (playerId: string) => void;
  releaseYouth: (playerId: string) => void;
  updateSettings: (s: Partial<Settings>) => void;
  lastSaved: Date | null;
  seasonSummary: SeasonSummary | null;
  clearSeasonSummary: () => void;
}

const Ctx = createContext<GameStore | null>(null);

export function useGame(): GameStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGame fora do provider');
  return ctx;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [careers, setCareers] = useState<CareerRow[]>([]);
  const [career, setCareer] = useState<Career | null>(null);
  const [route, setRoute] = useState('home');
  const routeRef = useRef('home');
  const historyRef = useRef<string[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [seasonSummary, setSeasonSummary] = useState<SeasonSummary | null>(null);
  const [signing, setSigning] = useState<SigningResult | null>(null);
  const [, setVersion] = useState(0);
  const careerRef = useRef<Career | null>(null);
  const userRef = useRef<User | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const u = await getCurrentUser();
      if (!mounted) return;
      setUser(u);
      const s = await storage.getSettings();
      if (s) setSettings(s);
      setLoading(false);
      if (u) {
        const list = await storage.listCareers(u.id);
        if (mounted) setCareers(list);
      }
    })();
    const unsub = onAuthChange((u) => {
      setUser(u);
      if (u) void refreshCareers();
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const touch = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  const saveNow = useCallback(async () => {
    const c = careerRef.current;
    if (!c) return;
    c.lastPlayedAt = new Date().toISOString();
    await storage.saveCareer(c);
    setLastSaved(new Date());
    // atualiza o resumo
    const list = await storage.listCareers(c.userId);
    setCareers(list);
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveNow();
    }, 1200);
  }, [saveNow]);

  const mutate = useCallback((fn: (c: Career) => void) => {
    if (!careerRef.current) return;
    fn(careerRef.current);
    setCareer({ ...careerRef.current });
    touch();
    scheduleSave();
  }, [scheduleSave, touch]);

  /** Navegação raiz: limpa o histórico de volta (ex.: home, dashboard). */
  const navigateRoot = useCallback((r: string) => {
    historyRef.current = [];
    routeRef.current = r;
    setRoute(r);
  }, []);

  const navigate = useCallback((r: string) => {
    historyRef.current.push(routeRef.current);
    routeRef.current = r;
    setRoute(r);
  }, []);

  /** Volta para a tela anterior (ex.: do quadro tático/elenco de volta ao dia de jogo). */
  const goBack = useCallback(() => {
    const prev = historyRef.current.pop();
    routeRef.current = prev ?? 'dashboard';
    setRoute(routeRef.current);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u, error } = await signIn(email, password);
    if (error || !u) return { error };
    setUser(u);
    await refreshCareers();
    navigateRoot('home');
    return { error: null };
  }, [navigateRoot]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { user: u, error } = await signUp(email, password, name);
    if (error || !u) return { error };
    setUser(u);
    await refreshCareers();
    navigateRoot('home');
    return { error: null };
  }, [navigateRoot]);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
    setCareer(null);
    careerRef.current = null;
    navigateRoot('home');
  }, [navigateRoot]);

  const forgotPassword = useCallback(async (email: string) => {
    const { error } = await resetPassword(email);
    return { error };
  }, []);

  const refreshCareers = useCallback(async () => {
    if (!userRef.current) return;
    const list = await storage.listCareers(userRef.current.id);
    setCareers(list);
  }, []);

  const newCareer = useCallback(async (
    input: { name: string; nationality: string; age: number; license: Career['manager']['license']; style: Career['manager']['style'] },
    clubId: string,
    difficulty: Difficulty,
  ) => {
    if (!userRef.current) throw new Error('Sem usuário');
    const c = createCareer(userRef.current.id, input, clubId, difficulty);
    careerRef.current = c;
    setCareer(c);
    await storage.saveCareer(c);
    await refreshCareers();
    navigateRoot('dashboard');
    return c;
  }, [navigateRoot]);

  const loadCareer = useCallback(async (id: string) => {
    const c = await storage.getCareer(id);
    if (!c) return;
    careerRef.current = c;
    setCareer({ ...c });
    // save em intertemporada: restaura a tela de resumo da temporada que acabou
    if (c.world.seasonEnded && c.world.seasonEndSummary) {
      setSeasonSummary(c.world.seasonEndSummary);
      navigateRoot('season-end');
    } else {
      navigateRoot('dashboard');
    }
  }, [navigateRoot]);

  const deleteCareer = useCallback(async (id: string) => {
    await storage.deleteCareer(id);
    await refreshCareers();
  }, []);

  const continueCareer = useCallback(async () => {
    const list = await storage.listCareers(userRef.current?.id ?? '');
    if (list.length === 0) return;
    await loadCareer(list[0].id);
  }, [loadCareer]);

  // ------------------------------------------------------------
  // Ações de jogo
  // ------------------------------------------------------------
  const handleSeason = useCallback((r: DayResult | null) => {
    if (r?.seasonAdvanced) {
      if (r.summary) {
        setSeasonSummary(r.summary);
        navigateRoot('season-end');
      } else {
        navigateRoot('dashboard');
      }
    }
  }, [navigateRoot]);

  const advanceDay = useCallback((): DayResult | null => {
    if (!careerRef.current) return null;
    const c = careerRef.current;
    const result = simulateOneDay(c.world, c, c.difficulty);
    mutate(() => { void c; });
    handleSeason(result);
    return result;
  }, [mutate, handleSeason]);

  const advanceToMatch = useCallback((): DayResult | null => {
    if (!careerRef.current) return null;
    const c = careerRef.current;
    const result = advanceToNextMatch(c.world, c, c.difficulty);
    mutate(() => { void c; });
    handleSeason(result.lastDay ?? null);
    return result.lastDay ?? null;
  }, [mutate, handleSeason]);

  const advanceWeek = useCallback((): DayResult | null => {
    if (!careerRef.current) return null;
    const c = careerRef.current;
    let last: DayResult | null = null;
    for (let i = 0; i < 7; i++) {
      const d = simulateOneDay(c.world, c, c.difficulty);
      last = d;
      if (d.userMatch || d.seasonAdvanced) break;
    }
    mutate(() => { void c; });
    handleSeason(last);
    return last;
  }, [mutate, handleSeason]);

  const playMatch = useCallback((): Match | null => {
    if (!careerRef.current) return null;
    const c = careerRef.current;
    const m = playUserMatch(c.world, c, c.difficulty);
    mutate(() => { void c; });
    return m;
  }, [mutate]);

  const finishDay = useCallback((): DayResult | null => {
    if (!careerRef.current) return null;
    const c = careerRef.current;
    const r = finishMatchDay(c.world, c, c.difficulty);
    mutate(() => { void c; });
    handleSeason(r);
    return r;
  }, [mutate, handleSeason]);

  const startNextSeason = useCallback(() => {
    if (!careerRef.current) return;
    const c = careerRef.current;
    if (!c.world.seasonEnded) return;
    runStartNextSeason(c.world, c, c.difficulty);
    mutate(() => { void c; });
    setSeasonSummary(null);
    navigateRoot('dashboard');
  }, [mutate, navigateRoot]);

  const setLineup = useCallback((l: TeamSetup) => {
    mutate((c) => { c.lineup = l; });
  }, [mutate]);

  const setTrainingFocus = useCallback((f: TrainingFocus) => {
    mutate((c) => { c.trainingFocus = f; });
  }, [mutate]);

  const proposeTransfer = useCallback((playerId: string, fee: number, wage: number): NegotiationResult => {
    if (!careerRef.current) return { status: 'rejected', message: 'Sem carreira' };
    return negotiateTransfer(careerRef.current.world, careerRef.current, playerId, fee, wage);
  }, []);

  const confirmTransfer = useCallback((playerId: string, fee: number, wage: number) => {
    mutate((c) => {
      const p = c.world.players[playerId];
      if (!p) return;
      executeTransfer(c.world, c, {
        playerId,
        fee,
        wage,
        toClubId: c.clubId,
        fromClubId: p.clubId,
        type: 'transfer',
      });
    });
  }, [mutate]);

  const sellPlayer = useCallback((playerId: string, fee: number) => {
    mutate((c) => {
      const p = c.world.players[playerId];
      if (!p) return;
      // encontra comprador: clube mais rico que precise de posição
      const buyers = Object.values(c.world.clubs).filter((club) => !club.isUserControlled && club.balance > fee * 1.3);
      buyers.sort((a, b) => b.balance - a.balance);
      const buyer = buyers[0];
      if (!buyer) return;
      executeTransfer(c.world, c, {
        playerId,
        fee,
        wage: p.contract?.wage ?? 1000,
        toClubId: buyer.id,
        fromClubId: c.clubId,
        type: 'transfer',
      });
    });
  }, [mutate]);

  const loanPlayer = useCallback((playerId: string, toClubId: string) => {
    mutate((c) => {
      executeTransfer(c.world, c, {
        playerId,
        fee: 0,
        wage: c.world.players[playerId]?.contract?.wage ?? 500,
        toClubId,
        fromClubId: c.clubId,
        type: 'loan',
      });
    });
  }, [mutate]);

  const freePlayer = useCallback((playerId: string) => {
    mutate((c) => releasePlayer(c.world, c, playerId));
  }, [mutate]);

  const scoutPlayer = useCallback((playerId: string): ScoutReport => {
    let report: ScoutReport | null = null;
    mutate((c) => { report = runScout(c.world, c, playerId); });
    if (!report) throw new Error('Falha ao gerar relatório');
    return report;
  }, [mutate]);

  const toggleShortlist = useCallback((playerId: string) => {
    mutate((c) => {
      const i = c.shortlist.indexOf(playerId);
      if (i >= 0) c.shortlist.splice(i, 1);
      else c.shortlist.unshift(playerId);
    });
  }, [mutate]);

  const startNegotiation = useCallback((playerId: string, kind: NegotiationKind): TransferNegotiation => {
    let neg: TransferNegotiation | null = null;
    mutate((c) => { neg = runStartNegotiation(c.world, c, playerId, kind); });
    if (!neg) throw new Error('Falha ao iniciar negociação');
    return neg;
  }, [mutate]);

  const sendNegotiationAction = useCallback((negId: string, action: NegotiationAction) => {
    mutate((c) => {
      const findNeg = () => Object.values(c.world.negotiations).find((n) => n.id === negId);
      if (action.type === 'club-offer') {
        sendClubOffer(c.world, c, negId, { fee: action.fee, bonus: action.bonus, sellOnPct: action.sellOnPct, installments: action.installments, loanOptionFee: action.loanOptionFee, loanObligationGames: action.loanObligationGames, loanWageShare: action.loanWageShare });
      } else if (action.type === 'seller-response') {
        respondToSeller(c.world, c, negId, action.action, { fee: action.fee, bonus: action.bonus, sellOnPct: action.sellOnPct });
      } else if (action.type === 'bidwar-response') {
        respondToBidWar(c.world, c, negId, action.action, { fee: action.fee });
      } else if (action.type === 'wage-offer') {
        sendWageOffer(c.world, c, negId, {
          wage: action.wage, bonus: action.bonus, years: action.years,
          role: action.role as never, promises: action.promises,
        });
      } else if (action.type === 'player-response') {
        respondToPlayer(c.world, c, negId, action.action, { wage: action.wage, bonus: action.bonus });
      } else if (action.type === 'renewal-offer') {
        const ren = Object.values(c.world.renewals).find((r) => r.id === negId);
        if (ren) sendRenewalOffer(c.world, c, ren.id, {
          wage: action.wage, bonus: action.bonus, years: action.years,
          role: action.role as never, promises: action.promises,
        });
      } else if (action.type === 'renewal-response') {
        const ren = Object.values(c.world.renewals).find((r) => r.id === negId);
        if (ren) respondToRenewal(c.world, c, ren.id, action.action, { wage: action.wage, bonus: action.bonus });
      } else if (action.type === 'renewal-sign') {
        const ren = Object.values(c.world.renewals).find((r) => r.id === negId);
        if (ren) completeRenewal(c.world, c, ren.id);
      } else if (action.type === 'medical') {
        runMedical(c.world, c, negId);
      } else if (action.type === 'sign') {
        const r = signDeal(c.world, c, negId);
        setSigning(r);
      } else if (action.type === 'cancel') {
        cancelNegotiation(c.world, c, negId, action.reason);
      } else if (action.type === 'incoming-offer') {
        respondToIncomingOffer(c.world, c, action.offerId, action.action, { fee: action.fee });
      }
      void findNeg;
    });
  }, [mutate]);

  const startRenewal = useCallback((playerId: string): RenewalNegotiation => {
    let ren: RenewalNegotiation | null = null;
    mutate((c) => { ren = runStartRenewal(c.world, c, playerId); });
    if (!ren) throw new Error('Falha ao iniciar renovação');
    return ren;
  }, [mutate]);

  const negotiationRoute = useCallback((playerId: string) => {
    navigate(`negotiation:${playerId}`);
  }, [navigate]);

  const acceptJob = useCallback((clubId: string) => {
    mutate((c) => acceptJobOffer(c, clubId));
  }, [mutate]);

  const investInYouth = useCallback((levels: number) => {
    mutate((c) => { investInYouthFacility(c.world, c.clubId, levels); });
  }, [mutate]);

  const promoteYouth = useCallback((playerId: string) => {
    mutate((c) => { promoteYouthPlayer(c.world, c, playerId); });
  }, [mutate]);

  const releaseYouth = useCallback((playerId: string) => {
    mutate((c) => { releaseYouthPlayer(c.world, playerId); });
  }, [mutate]);

  const updateSettings = useCallback(async (s: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...s };
      void storage.saveSettings(next);
      return next;
    });
  }, []);

  const store: GameStore = {
    user,
    loading,
    settings,
    careers,
    career,
    route,
    navigate,
    goBack,
    login,
    register,
    logout,
    forgotPassword,
    refreshCareers,
    newCareer,
    loadCareer,
    deleteCareer,
    continueCareer,
    saveNow,
    touch,
    mutate,
    advanceDay,
    advanceToMatch,
    advanceWeek,
    playMatch,
    finishDay,
    startNextSeason,
    setLineup,
    setTrainingFocus,
    proposeTransfer,
    confirmTransfer,
    sellPlayer,
    loanPlayer,
    freePlayer,
    scoutPlayer,
    toggleShortlist,
    startNegotiation,
    startRenewal,
    sendNegotiationAction,
    signing,
    clearSigning: () => setSigning(null),
    negotiationRoute,
    acceptJob,
    investInYouth,
    promoteYouth,
    releaseYouth,
    updateSettings,
    lastSaved,
    seasonSummary,
    clearSeasonSummary: () => setSeasonSummary(null),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
