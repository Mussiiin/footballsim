// ============================================================
// FootballSim — Tipos centrais do jogo
// ============================================================

export type Position =
  | 'GK' | 'CB' | 'LB' | 'RB'
  | 'DM' | 'CM' | 'AM'
  | 'LW' | 'RW'
  | 'ST' | 'CF';

export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

export type Personality =
  | 'Líder' | 'Profissional' | 'Ambicioso' | 'Trabalhador'
  | 'Temperamental' | 'Inconsistente' | 'Leal' | 'Mercenário'
  | 'Jovem promessa' | 'Veterano';

export type InjuryType =
  | 'Muscular' | 'Tornozelo' | 'Joelho' | 'Coxa' | 'Ombro' | 'Contusão';

export type Difficulty = 'Fácil' | 'Normal' | 'Difícil' | 'Hardcore';

export type ManagerLicense = 'Nenhuma' | 'C' | 'B' | 'A' | 'PRO';

export type ManagerStyle =
  | 'Ofensivo' | 'Defensivo' | 'Equilibrado'
  | 'Pressing alto' | 'Contra-ataque' | 'Posse de bola';

export type IndividualInstruction =
  | 'Atacar' | 'Apoiar' | 'Defender' | 'Ficar atrás'
  | 'Liberdade' | 'Pressionar' | 'Marcar' | 'Avançar';

export type TrainingFocus =
  | 'Físico' | 'Ataque' | 'Defesa' | 'Passe'
  | 'Finalização' | 'Posse' | 'Tática' | 'Recuperação';

// ------------------------------------------------------------
// Atributos
// ------------------------------------------------------------
export interface PlayerAttributes {
  // Gerais
  pace: number; acceleration: number; finishing: number; shotPower: number;
  passing: number; vision: number; dribbling: number; control: number;
  defending: number; physical: number; stamina: number; strength: number;
  agility: number; balance: number;
  // Goleiros
  reflexes: number; handling: number; gkPositioning: number; rushing: number; kicking: number;
  // Defensores
  marking: number; tackling: number; interception: number; defPositioning: number; heading: number;
  // Meio-campo / ataque
  technique: number; attackPositioning: number;
}

export interface Injury {
  id: string;
  type: InjuryType;
  startDate: string;
  recoveryDate: string;
  severity: 'Leve' | 'Moderada' | 'Grave';
  weeks: number;
  daysOut: number;
  bodyPart: string;
}

export interface InjuryRecord {
  date: string;
  type: InjuryType;
  bodyPart: string;
  daysOut: number;
  severity: string;
}

export interface SeasonStats {
  apps: number; starts: number; goals: number; assists: number;
  yellows: number; reds: number; minutes: number;
  ratingSum: number; ratingCount: number;
  cleanSheets: number;
  manOfMatch: number;
  shots: number; shotsOnTarget: number; passes: number; tackles: number;
  interceptions: number; keyPasses: number; xg: number; xa: number;
}

export interface PlayerHistoryEntry {
  season: string;
  clubId: string;
  clubName: string;
  apps: number; starts: number; goals: number; assists: number; rating: number;
  titles: string[];
  awards: string[];
  minutes: number; shots: number; shotsOnTarget: number; passes: number;
  tackles: number; interceptions: number; keyPasses: number; xg: number; xa: number;
}

export interface Contract {
  signedAt: string; // YYYY-MM-DD
  until: string;    // YYYY-MM-DD
  wage: number;     // por semana (moeda do jogo)
  bonus: number;    // bônus por assinatura
  releaseClause: number | null;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string;
  birthDate: string; // YYYY-MM-DD
  age: number;
  position: Position;
  secondaryPositions: Position[];
  foot: 'E' | 'D' | 'Ambidestro';
  height: number; // cm
  weight: number; // kg
  attrs: PlayerAttributes;
  potential: number;
  value: number;
  contract: Contract | null;
  clubId: string | null;
  squadNumber: number;
  morale: number;      // 1-100
  form: number;        // 1-100 (forma recente)
  condition: number;   // 1-100 (condição física)
  fatigue: number;     // 0-100 (fadiga acumulada)
  personality: Personality;
  reputation: number;  // 1-100
  status: 'active' | 'retired';
  injury: Injury | null;
  injuryHistory: InjuryRecord[];
  suspension: number;  // partidas restantes de suspensão
  isLoan: boolean;
  parentClubId: string | null;
  loanUntil: string | null;
  loanOptionFee: number;
  loanObligationGames: number;
  agentId: string | null;
  transferRequested: boolean;
  arrivingUntil: string | null; // contratação em trânsito: entra no elenco nesta data
  awards: { season: string; award: string; detail?: string }[];
  seasonStats: SeasonStats;
  careerStats: SeasonStats;
  history: PlayerHistoryEntry[];
  lastRatings: number[]; // últimas notas (para forma)
  happiness: number;     // 0-100 satisfação
  relation: number;      // 0-100 relação com treinador
  loanListed: boolean;
  transferListed: boolean;
  devTrend: number;      // tendência recente de desenvolvimento -3..+3
  avgRating: number;     // média de notas da temporada (cache)
  futureSellPct: number;       // % de futura venda devida ao clube anterior (nós, quando vendemos com cláusula)
  futureSellClubId: string | null; // clube que recebe a % de futura venda
}

// ------------------------------------------------------------
// Clubes
// ------------------------------------------------------------
export type ClubTier = 'Gigante' | 'Grande' | 'Médio' | 'Pequeno' | 'Amador';

export type StadiumSectorId = 'arquibancada' | 'cadeira' | 'premium' | 'vip' | 'camarote';

export interface StadiumSector {
  seats: number;
  price: number;
  share: number; // proporção da capacidade (0-1)
}

export interface StadiumWork {
  id: string;
  title: string;
  detail: string;
  kind: 'expansion' | 'renovation' | 'comfort' | 'parking' | 'food' | 'store' | 'security' | 'tech' | 'new';
  cost: number;
  totalDays: number;
  daysLeft: number;
  capacityCut: number;  // redução temporária de capacidade durante a obra (0-1)
  extraCost: number;    // custo extra mensal durante a obra
  amount?: number;      // ex.: lugares adicionados na expansão
}

export interface StadiumNaming {
  company: string;
  years: number;
  yearsLeft: number;
  annual: number;
}

export interface StadiumBooking {
  id: string;
  title: string;
  kind: 'show' | 'evento' | 'convencao';
  date: string;
  revenue: number;
}

export interface StadiumHistoryEntry {
  season: string;
  attendance: number;
  occupancy: number;
  ticketRevenue: number;
  commercial: number;
  matchCosts: number;
  maintenance: number;
  avgPrice: number;
  capacity: number;
  value: number;
  satisfaction: number;
}

export interface Stadium {
  name: string;
  capacity: number;
  avgAttendance: number;
  condition: number;       // 0-100 conservação
  maintenanceCost: number;  // mensal
  reputation: number;       // 0-100
  satisfaction: number;     // 0-100 satisfação da torcida (preços/experiência)
  atmosphere: number;       // 0-100
  protest: number;          // 0-100 descontentamento com preços
  sectors: Record<StadiumSectorId, StadiumSector>;
  comfort: Record<'assentos' | 'banheiros' | 'alimentacao' | 'climatizacao' | 'acessibilidade' | 'limpeza' | 'iluminacao' | 'acustica', number>;
  foodLevel: number;        // 0..3
  storeLevel: number;       // 0..3
  vipLevel: number;         // 0..3
  parking: { spaces: number; price: number; level: number };
  security: number;         // 0-100
  tech: { telao: number; som: number; wifi: boolean; app: boolean; catapulta: boolean; smartTickets: boolean };
  boxes: { total: number; sold: number; price: number };
  works: StadiumWork[];
  naming: StadiumNaming | null;
  namingProposal: StadiumNaming | null;
  bookings: StadiumBooking[];
  dynamicPricing: boolean;
  lastPriceChange: { date: string; pct: number } | null;
  history: StadiumHistoryEntry[];
  value: number;
  eventsHosted: number;
  protestsFired: number;
  seasonAccum: { attendance: number; matches: number; ticket: number; commercial: number; costs: number };
}

export interface Coach {
  name: string;
  nationality: string;
  reputation: number;
  tactical: number;
  development: number;
  motivation: number;
  management: number;
  scouting: number;
  negotiation: number;
  salary: number;
}

export type StaffRole = 'Assistente' | 'Preparador físico' | 'Treinador de goleiros' | 'Analista' | 'Scout' | 'Médico';

export interface StaffMember {
  id: string;
  role: StaffRole;
  name: string;
  nationality: string;
  quality: number; // 1-100
  salary: number;
  contractUntil: string;
}

export interface ClubObjective {
  text: string;
  weight: number;      // importância 1-10
  kind: 'trophy' | 'continental' | 'league' | 'avoid-relegation' | 'develop-youth' | 'finances' | 'mid-table' | 'promotion' | 'cup-run';
  status: 'pending' | 'achieved' | 'failed';
}

export interface FinanceEntry {
  month: string;      // YYYY-MM
  revenue: number;
  expenses: number;
  balance: number;    // saldo ao fim do mês
}

/** Transação financeira individual (premiação, venda, compra etc.). */
export interface FinanceTransaction {
  /** id único (evita duplicação de premiação). */
  id: string;
  date: string;       // YYYY-MM-DD
  type: 'competition_prize' | 'sale' | 'purchase' | 'other';
  competition?: string;   // nome da competição
  competitionId?: string;
  season?: string;
  stage?: string;         // fase (ex.: 'Oitavas de final')
  description: string;
  /** valor positivo = receita, negativo = despesa. */
  amount: number;
}

/**
 * Regras de premiação de uma competição por temporada (centralizadas p/ ajuste futuro).
 * Fases com cota por categoria (A/B) do clube usam { tierA, tierB }.
 */
export interface CompetitionPrizeRules {
  competition: string; // id da competição
  competitionName: string;
  season: string;
  prizes: {
    firstRound?: number;                        // 1ª fase
    secondRound?: { tierA: number; tierB: number };
    thirdRound?: { tierA: number; tierB: number };
    fourthRound?: { tierA: number; tierB: number };
    fifthRound?: number;                        // 5ª fase
    roundOf16?: number;                         // Oitavas de final
    quarterFinal?: number;                      // Quartas de final
    semiFinal?: number;                         // Semifinal
    runnerUp?: number;                          // Final — vice-campeão
    champion?: number;                          // Final — campeão
    participation?: number;                     // Participação (Série D)
    groupStage?: number;                        // Classificação na fase de grupos (Série D)
    accessPlayoff?: number;                     // Playoff de acesso (Série D)
  };
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  countryId: string;
  city: string;
  stadium: Stadium;
  fans: number;            // torcida (milhares)
  reputation: number;      // 1-100
  tier: ClubTier;
  colors: [string, string];
  budget: number;          // orçamento de transferências
  balance: number;         // saldo financeiro
  clubValue: number;
  wageBill: number;        // folha salarial mensal
  facilities: { training: number; youth: number; medical: number; commercial: number }; // 1-100
  leagueId: string;
  coach: Coach;
  staff: StaffMember[];
  objectives: ClubObjective[];
  boardPatience: number;   // 0-100
  fanTrust: number;        // 0-100 confiança da torcida no comando do clube
  boardMessage: string | null;
  boardMessageUntil: string | null;
  managerId: string | null;   // id do manager (carreira) se controlado
  isUserControlled: boolean;
  titles: { competitionId: string; competitionName: string; season: string }[];
  lastResults: ('W' | 'D' | 'L')[];
  financeHistory: FinanceEntry[];
  /** Transações financeiras individuais (premiações etc.), mais recentes primeiro. */
  financeTransactions: FinanceTransaction[];
  /** Ids únicos de premiação já recebidos (ex.: CDB-2026-FLAMENGO-OITAVAS) — evita pagamento duplicado. */
  competitionPrizes: string[];
  lastSeasonPosition: number | null;
  /** snapshot da classificação final da temporada anterior (para comparação no resumo). */
  lastSeason?: { season: string; position: number; points: number; gf: number; ga: number } | null;
  rivals: string[];         // rivalidades (ids de clubes)
  averageAge: number;  // cache
  squadStrength: number; // cache overall médio
  morale: number;      // cache moral média
  transferHistory: string[];
  founded: number;
  financeAccum: { revenue: number; expenses: number };
}

// ------------------------------------------------------------
// Competições
// ------------------------------------------------------------
export type CompetitionType = 'league' | 'cup' | 'continental';

export interface StandingRow {
  clubId: string;
  played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; gd: number; points: number;
  form: ('W' | 'D' | 'L')[];
}

export interface CupRound {
  name: string;
  legs: 'single' | 'two';
  extraTime: boolean;
  penalties: boolean;
  matchIds: string[];
  complete: boolean;
}

export interface Competition {
  id: string;
  name: string;
  shortName: string;
  countryId: string | null; // null = continental
  type: CompetitionType;
  tier: number;             // 1 = 1ª divisão
  season: string;
  clubIds: string[];
  standings: StandingRow[]; // ligas (fase de grupos = tabela única com todos os clubes)
  /** Fase de grupos (ex.: Série D — 16 grupos de 6). standings é a tabela única; clubGroup mapeia o clube ao grupo. */
  groups?: CompetitionGroup[];
  clubGroup?: Record<string, string>; // clubId -> grupo.id
  /** Mata-mata após a fase de grupos; o campeão e os acessos saem do chaveamento, não da tabela. */
  knockoutAfterGroups?: boolean;
  /** Competição de playoff de acesso (ex.: Série D — 4 perdedores das quartas → 2 acessos). */
  accessPlayoffId?: string;
  /** Clubes promovidos por avanço no mata-mata (4 vencedores das quartas + 2 do playoff). */
  knockoutPromoted?: string[];
  /** Competição interna de playoff de acesso (não tem campeão próprio). */
  isAccessPlayoff?: boolean;
  rounds: CupRound[];       // copas / mata-mata
  currentRoundIndex: number;
  status: 'scheduled' | 'ongoing' | 'finished';
  prizeMoney: { champion: number; runnerUp: number; [pos: number]: number };
  champions: { season: string; champion: string; runnerUp: string }[];
  topScorers: { playerId: string; goals: number }[];
  rules: {
    promotionSpots: number;
    relegationSpots: number;
    continentalSpots: number;
    /** Vagas extras de segunda competição continental (ex.: Sul-Americana). Zona visual na tabela. */
    sudamericanaSpots?: number;
    points: number;
    /** Promoção sai do mata-mata (ex.: Série D — vencedores de quartas + playoff de acesso). */
    promotionByKnockout?: boolean;
    /** Quantos perdedores das quartas entram no playoff de acesso. */
    accessPlayoffLosers?: number;
  };
}

// ------------------------------------------------------------
// Partidas
// ------------------------------------------------------------
export type MatchEventType =
  | 'goal' | 'ownGoal' | 'penalty' | 'penaltyMiss' | 'assist'
  | 'yellow' | 'red' | 'injury' | 'sub' | 'corner' | 'foul'
  | 'save' | 'shot' | 'shotOnTarget' | 'offside' | 'kickoff' | 'whistle' | 'penaltyShootoutGoal' | 'penaltyShootoutMiss'
  | 'crowd'
  // narração contextual (construção, recuperação, pressão, defesa)
  | 'buildUp' | 'recovery' | 'pressure' | 'timeWasting' | 'cross';

export interface PendingArrival {
  id: string;
  playerId: string;
  clubId: string;        // clube de destino (o seu)
  fromName: string;      // clube de origem (p/ exibição)
  toName: string;
  fee: number;
  type: 'transfer' | 'free';
  signedAt: string;      // data da assinatura
  arrivesOn: string;     // data prevista de chegada (próxima etapa)
  /** Etapa atual do processo de chegada. */
  stage: 'waiting' | 'travel' | 'medical' | 'docs' | 'contract' | 'registration' | 'done' | 'cancelled';
  /** Dias de viagem (recalculados ao retomar de uma janela bloqueada). */
  travelDays: number;
  /** Data em que a etapa atual termina (usada para avançar com a data do jogo). */
  stageEndsOn: string;
  /** Texto de status exibido na UI (ex.: "✈️ Em trânsito — viagem de 2 dias"). */
  status: string;
  /** Data prevista de disponibilidade no elenco (registro concluído). */
  registeredOn: string | null;
  /** Resultado dos exames médicos, quando concluídos. */
  medical: 'pending' | 'approved' | 'conditional' | 'failed' | null;
  /** Estado do registro (só 'registered' libera o jogador para o elenco). */
  registration: 'pending' | 'awaiting_window' | 'registered' | 'blocked';
  /** Estado geral da transferência. */
  transferStatus: 'in_transit' | 'awaiting_window' | 'completed' | 'cancelled';
  /** Motivo de cancelamento, quando aplicável. */
  cancelReason?: string;
  /** Exceção regulamentar explícita (nunca criada automaticamente). */
  exception?: string;
  /** True quando a janela fechou no meio do processo (bloqueio informado). */
  windowClosedNotified?: boolean;
}

export type TalkTopic =
  | 'minutes' | 'starter' | 'bench' | 'loan' | 'exit' | 'raise' | 'contract' | 'position'
  | 'training' | 'praise' | 'performance' | 'conflict' | 'plans' | 'youth' | 'veteran' | 'checkin'
  | 'recruit';

/** Estágio da conversa de recrutamento (jogador de outro clube). */
export type RecruitStage = 'intro' | 'project' | 'role' | 'wage' | 'interest' | 'close';

export interface TalkOption {
  id: string;
  label: string;
}

export interface PlayerTalk {
  id: string;
  playerId: string;
  topic: TalkTopic;
  line: string;          // o que o jogador diz
  context: string;       // contexto exibido (papel, salário, situação)
  options: TalkOption[];
  createdAt: string;
  active: boolean;
  result?: string;       // mensagem após a resposta
  initiatedBy: 'player' | 'manager';
  /** Estágio da conversa de recrutamento (apenas quando topic === 'recruit'). */
  stage?: RecruitStage;
}

export type InboxCategory = 'transfer' | 'squad' | 'contract' | 'board' | 'finance';
export type InboxPriority = 'low' | 'normal' | 'important' | 'urgent';

/** Mensagem na Central de Mensagens (caixa de entrada do treinador). */
export interface InboxMessage {
  id: string;
  date: string;
  /** playerId quando vem de um jogador; clubId quando de outro clube; null p/ sistema/diretoria. */
  playerId?: string;
  clubId?: string;
  senderName: string;
  title: string;
  preview: string;
  category: InboxCategory;
  priority: InboxPriority;
  read: boolean;
  /** Rota para onde navegar ao clicar (ex.: talk:playerId, transfers). */
  link?: string;
  /** Se houver conversa ativa, id da PlayerTalk associada. */
  talkId?: string;
}

export interface TalkHistoryEntry {
  id: string;
  playerId: string;
  topic: TalkTopic;
  date: string;
  summary: string;
}

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: 'home' | 'away';
  playerId?: string;
  playerId2?: string;
  detail?: string;
}

export interface MatchStats {
  possession: [number, number];
  shots: [number, number];
  shotsOnTarget: [number, number];
  corners: [number, number];
  fouls: [number, number];
  yellows: [number, number];
  reds: [number, number];
  passes: [number, number];
  passAccuracy: [number, number];
  offsides: [number, number];
  tackles: [number, number];
  saves: [number, number];
  xg: [number, number];
  attendance: number;
}

export interface PlayerMatchStat {
  playerId: string;
  rating: number;      // 1-10
  goals: number;
  assists: number;
  shots: number;
  passes: number;
  tackles: number;
  fouls: number;
  yellows: number;
  reds: number;
  minutes: number;
  saves: number;       // goleiros
  conceded: number;    // goleiros
  ownGoals: number;
  keyPasses: number;
  dribbles: number;
  offsides: number;
  interceptions: number;
  xg: number;
  xa: number;
  manOfMatch: boolean;
  position: Position;
  started: boolean;
}

export interface Match {
  id: string;
  competitionId: string;
  season: string;
  date: string;
  homeId: string;
  awayId: string;
  round: number;
  played: boolean;
  homeScore: number | null;
  awayScore: number | null;
  events: MatchEvent[];
  stats: MatchStats | null;
  playerStats: PlayerMatchStat[] | null;
  homeLineup: string[];
  awayLineup: string[];
  homeFormation: string;
  awayFormation: string;
  attendance: number | null;
  importance: number;   // 0-100
  weather: string;
  penaltyShootout: { home: number; away: number } | null;
  homeName: string;     // cache p/ histórico
  awayName: string;
  extraTimePlayed: boolean;
  substitutions: { outId: string; inId: string; minute: number; team: 'home' | 'away' }[];
}

// ------------------------------------------------------------
// Treinador / carreira
// ------------------------------------------------------------
export interface Manager {
  name: string;
  nationality: string;
  age: number;
  experience: number;    // anos de experiência
  license: ManagerLicense;
  style: ManagerStyle;
  reputation: number;    // 1-100
  attrs: {
    tactical: number; development: number; motivation: number;
    management: number; scouting: number; negotiation: number;
  };
  salary: number;
  clubId: string | null;
  employed: boolean;
  jobHistory: { clubId: string; clubName: string; seasonStart: string; seasonEnd: string; achievements: string[] }[];
  status: 'active' | 'sacked' | 'resigned' | 'unemployed' | 'retired';
  sackedCount: number;
  trophies: number;
}

export interface Notification {
  id: string;
  date: string;
  icon: string;
  text: string;
  kind: 'info' | 'success' | 'warning' | 'danger';
  read: boolean;
  link?: string;
}

export interface CareerFlags {
  matchesManaged: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  titles: number;
  transfersIn: number;
  transfersOut: number;
  moneySpent: number;
  moneyEarned: number;
  seasons: number;
  unbeatenRun: number;
  bestUnbeatenRun: number;
  youthPromoted: number;
  recordSale: number;
  recordBuy: number;
  biggestWin: number;
  biggestLoss: number;
  goalsByTopScorer: Record<string, number>;
  promisesBroken: number;        // total de promessas quebradas na carreira
  promisesBrokenSeason: number;  // quebras na temporada atual (reseta no fim de temporada)
  promisesFulfilledRun: number;  // promessas cumpridas em sequência (zera a cada quebra)
  boardCrisis: boolean;          // crise ativa (3+ quebras na temporada) aguardando redenção
  talksHad: number;              // conversas com jogadores concluídas
  lastTalkDate: string;          // última conversa gerada (cooldown diário)
}

// ------------------------------------------------------------
// Mercado de transferências / negociações
// ------------------------------------------------------------
export type AgentStyle = 'Flexível' | 'Equilibrado' | 'Exigente' | 'Agressivo';

export interface PlayerAgent {
  id: string;
  name: string;
  style: AgentStyle;
  reputation: number;   // 1-100
}

export type SquadRole =
  | 'Titular absoluto' | 'Titular' | 'Rotação' | 'Reserva' | 'Promessa' | 'Base';

export interface PlayerPromise {
  id: string;
  playerId: string;
  text: string;
  kind: 'titularidade' | 'min-jogos' | 'posicao' | 'competicoes' | 'desenvolvimento' | 'aumento' | 'venda';
  madeAt: string;
  deadline: string;
  fulfilled: boolean;
  broken: boolean; // promessa quebrada pelo clube (moral cai, pode pedir transferência)
  baseline?: number; // valor de referência (ex.: overall ou salário na época da promessa)
  target?: number;   // meta numérica (ex.: partidas, overall alvo, salário alvo)
}

export interface ScoutReport {
  id: string;
  date: string;
  playerId: string;
  knowledge: number;       // 0-1 quanto se conhece o jogador
  overallLow: number;
  overallHigh: number;
  potLow: number;
  potHigh: number;
  strengths: string[];
  weaknesses: string[];
  valueLow: number;
  valueHigh: number;
  wageEst: number;
  risk: 'Baixo' | 'Médio' | 'Alto';
  stars: number;           // 1-5
  squadFit: string;
  recommendation: string;  // 'Contratar' | 'Considerar' | 'Somente se o preço cair' | 'Não recomendo'
  analysis: string;
}

export type InterestLevel =
  | 'Muito desinteressado' | 'Desinteressado' | 'Pouco interessado' | 'Neutro'
  | 'Interessado' | 'Muito interessado';

export type NegotiationMood = '😡 Irritado' | '😕 Insatisfeito' | '😐 Neutro' | '🙂 Satisfeito' | '😄 Muito satisfeito';

export type NegotiationKind = 'transfer' | 'loan' | 'free' | 'pre-contract';

export type NegotiationStatus =
  | 'observando' | 'scout' | 'interessado'
  | 'proposta-enviada' | 'contraproposta' | 'acordo-clube'
  | 'negociacao-jogador' | 'acordo-verbal' | 'exames'
  | 'concluida' | 'rejeitada' | 'cancelada' | 'expirada';

export interface TransferOffer {
  id: string;
  side: 'user' | 'seller' | 'player' | 'agent';
  kind: 'fee' | 'counter' | 'wage' | 'bonus' | 'addons';
  fee: number;
  bonus: number;
  sellOnPct: number;
  installments: number;    // 1-5
  wage?: number;
  years?: number;
  message: string;
  createdAt: string;
  mood?: NegotiationMood;
}

export interface NegotiationMessage {
  id: string;
  side: 'officer' | 'user' | 'seller' | 'player' | 'agent' | 'system' | 'medical';
  text: string;
  date: string;
  mood?: NegotiationMood;
  actor?: string;
}

export interface TransferNegotiation {
  id: string;
  playerId: string;
  kind: NegotiationKind;
  status: NegotiationStatus;
  createdAt: string;
  updatedAt: string;
  deadline: string | null;
  buyerClubId: string;
  sellerClubId: string | null;   // null = livre
  offers: TransferOffer[];
  messages: NegotiationMessage[];
  // termos do acordo (preenchidos ao longo das etapas)
  fee: number;
  bonus: number;
  sellOnPct: number;
  installments: number;
  wage: number;
  years: number;
  role: SquadRole | null;
  promises: PlayerPromise[];
  // interesse
  interestScore: number;
  interestReasons: string[];
  competingClubs: { clubId: string; level: InterestLevel; score: number }[];
  // estado interno (escondido do usuário)
  sellerAsk: number;           // preço mínimo que o clube aceita (segredo)
  sellerAskHigh: number;       // valor que fecha de imediato (segredo)
  playerWageAsk: number;       // salário mínimo aceito (segredo)
  playerWageWant: number;      // salário desejado (segredo)
  playerPatience: number;      // 0-100 — cai com propostas ruins
  sellerPatience: number;      // 0-100
  mood: { seller: NegotiationMood; player: NegotiationMood };
  // guerra de propostas: outro clube cobriu nossa oferta
  bidWar: {
    rivalClubId: string;
    rivalOffer: number;        // valor da proposta rival (segredo parcial — revelado pelo vendedor)
    raisedAt: string;
  } | null;
  medical: { status: 'pending' | 'approved' | 'conditional' | 'failed'; note?: string } | null;
  medicalDoneOn: string | null; // data em que os exames médicos terminam (resultado)
  rejectedReason: string | null;
  loanFee: number;
  loanWageShare: number;       // % pago pelo clube que recebe
  loanOptionFee: number;       // opção de compra
  loanObligationGames: number; // obrigação de compra após N jogos
}

export interface RecruitmentOfficer {
  name: string;
  personality: 'Conservador' | 'Agressivo' | 'Analítico' | 'Visionário';
  negotiation: number;
  scouting: number;
  marketKnowledge: number;
  reputation: number;
}

// ------------------------------------------------------------
// Propostas recebidas (clubes da IA pelo nosso elenco)
// ------------------------------------------------------------
export type IncomingOfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface IncomingOfferMessage {
  id: string;
  from: 'club' | 'officer' | 'system';
  text: string;
  date: string;
  mood?: NegotiationMood;
  actor?: string;
}

// ------------------------------------------------------------
// Destaques do mercado (aba na Central de Transferências)
// ------------------------------------------------------------
export type MarketHighlightKind = 'big-deal' | 'bid-war' | 'user-sale' | 'user-buy';

export interface MarketHighlight {
  id: string;
  kind: MarketHighlightKind;
  date: string;
  title: string;
  detail: string;
  fee: number;
  playerId?: string;
  clubId?: string;
  importance: number;
}

export interface SaleReport {
  grade: number;            // 0-10
  fee: number;
  marketValue: number;
  wageSaved: number;        // folha mensal economizada
  nextUp: string[];         // quem assume a vaga no elenco
  fans: { icon: string; text: string };
  dressingRoom: { icon: string; text: string };
  reasons: string[];
}

export interface IncomingOffer {
  id: string;
  playerId: string;
  clubId: string;          // clube comprador
  fee: number;             // valor atual da proposta
  bonus: number;
  sellOnPct: number;       // % de futura venda que fica para nós
  installments: number;    // 1-5
  status: IncomingOfferStatus;
  createdAt: string;
  expiresAt: string;
  rounds: number;          // contrapropostas trocadas
  mood: NegotiationMood;
  hiddenMax: number;       // teto do clube comprador (segredo)
  messages: IncomingOfferMessage[];
  playerWantsOut: boolean; // o jogador pediu para sair (contexto)
  rejectedReason?: string | null;
  sellerWar?: boolean;     // guerra de propostas ao vender (2+ clubes disputando)
  saleReport?: SaleReport | null; // relatório gerado na conclusão da venda
  soldAt?: string;         // data da conclusão da venda (para ranking por mês)
  attentionNotified?: boolean;     // já notificou o usuário sobre a disputa pelo jogador
}

// ------------------------------------------------------------
// Renovação de contrato (jogadores do nosso elenco)
// ------------------------------------------------------------
export type RenewalStatus =
  | 'iniciada' | 'negociando' | 'acordo' | 'assinada' | 'rejeitada' | 'cancelada';

export interface RenewalNegotiation {
  id: string;
  playerId: string;
  status: RenewalStatus;
  createdAt: string;
  updatedAt: string;
  offers: TransferOffer[];
  messages: NegotiationMessage[];
  wage: number;              // novo salário acordado
  bonus: number;             // bônus de assinatura
  years: number;             // anos de extensão
  role: SquadRole | null;
  promises: PlayerPromise[];
  // estado interno (oculto)
  playerWageAsk: number;     // mínimo aceito (segredo)
  playerWageWant: number;    // desejado (segredo)
  playerPatience: number;    // 0-100
  mood: NegotiationMood;
  loyalty: number;           // 0-100 vontade de ficar (calculada na abertura)
  rejectedReason: string | null;
}

// ------------------------------------------------------------
// Mundo
// ------------------------------------------------------------
export interface Country {
  id: string;
  name: string;
  flag: string;
  reputation: number;
  divisions: string[];   // ids das ligas (tier 1, 2, 3)
  cupId: string;
  continentalId: string;
}

export interface TransferRecord {
  id: string;
  date: string;
  playerId: string;
  playerName: string;
  fromClubId: string | null;
  fromClubName: string;
  toClubId: string | null;
  toClubName: string;
  fee: number;
  type: 'transfer' | 'loan' | 'free' | 'release';
}

export interface NewsItem {
  id: string;
  date: string;
  title: string;
  subtitle?: string;
  category: 'Transferências' | 'Partidas' | 'Mercado' | 'Lesões' | 'Clubes' | 'Seleções' | 'Títulos' | 'Carreira' | 'Estádio';
  clubId?: string;
  playerId?: string;
  importance: number; // 0-100
  read: boolean;
}

export interface SeasonHistoryEntry {
  season: string;
  leagues: { competitionId: string; champion: string; runnerUp: string; championId: string }[];
  cups: { competitionId: string; champion: string; championId: string }[];
  continental: { competitionId: string; champion: string; championId: string }[];
  topScorers: { playerId: string; name: string; clubName: string; goals: number }[];
  recordTransfers: { playerName: string; fromClubName: string; toClubName: string; fee: number }[];
  retired: { playerName: string; clubName: string; age: number }[];
}

export interface RecordItem {
  key: string;
  label: string;
  value: string | number;
  holder: string;
  season: string;
}

export interface HallOfFameEntry {
  name: string;
  kind: 'jogador' | 'treinador' | 'clube';
  detail: string;
  season: string;
}

export interface TransferWindow {
  summer: { start: string; end: string }; // MM-DD
  winter: { start: string; end: string };
}

export interface SeasonSummary {
  season: string;
  leagues: { competitionId: string; name: string; champion: string; runnerUp: string; championId: string }[];
  cups: { competitionId: string; name: string; champion: string; championId: string; runnerUp: string }[];
  continental: { competitionId: string; name: string; champion: string; championId: string; runnerUp: string } | null;
  topScorers: { playerId: string; name: string; clubName: string; goals: number }[];
  promoted: { clubId: string; from: string; to: string }[];
  relegated: { clubId: string; from: string; to: string }[];
  retired: { name: string; clubName: string; age: number }[];
  positions: Record<string, number>;
  /** evolução de overall dos jogadores do clube do usuário durante a temporada (antes → depois). */
  development?: { playerId: string; name: string; clubId: string; from: number; to: number }[];
  /** dados da temporada anterior do clube do usuário (para comparação no resumo). */
  lastSeason?: { season: string; position: number; points: number; gf: number; ga: number } | null;
}

export type InquiryStatus = 'pendente' | 'aberto' | 'so-alta' | 'nao-vende' | 'indisponivel';

/** Sondagem enviada a outro clube (mercado vivo mesmo com a janela fechada). */
export interface Inquiry {
  id: string;
  playerId: string;
  sellerClubId: string;
  date: string;           // data em que a sondagem foi enviada
  status: InquiryStatus;  // pendente → resposta da IA
  responseDate: string | null;
  note: string | null;
  /** valor de referência para uma futura negociação (o vendedor pode sinalizar). */
  suggestedFee: number;
}

export interface World {
  version: number;
  seed: string;
  negotiations: Record<string, TransferNegotiation>;
  renewals: Record<string, RenewalNegotiation>;
  incomingOffers: IncomingOffer[];
  inquiries: Inquiry[]; // sondagens enviadas a outros clubes
  pendingArrivals: PendingArrival[]; // contratações em trânsito (documentação/viagem/exames)
  playerTalks: Record<string, PlayerTalk>; // conversas entre treinador e jogadores
  marketHighlights: MarketHighlight[];
  windowRecordFee: number; // maior negócio da janela atual (para notificações de recorde)
  agents: Record<string, PlayerAgent>;
  scoutReports: Record<string, ScoutReport>;
  negotiationHistory: TransferNegotiation[];
  loanOptionTriggers: { loanId: string; playerId: string; clubId: string; parentClubId: string; obligationGames: number }[];
  season: string;        // '2026/27'
  seasonNumber: number;  // 1 = primeira
  date: string;          // YYYY-MM-DD
  countries: Country[];
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  youth: Record<string, Player[]>;  // categorias de base por clube (fora do elenco profissional)
  competitions: Record<string, Competition>;
  news: NewsItem[];
  transfers: TransferRecord[];
  records: RecordItem[];
  hallOfFame: HallOfFameEntry[];
  history: SeasonHistoryEntry[];
  windows: TransferWindow;
  generationCount: number;
  seasonEvents: { date: string; text: string }[];
  /** true quando a última partida da temporada terminou e a próxima ainda não foi iniciada (intertemporada). */
  seasonEnded: boolean;
  /** resumo da temporada que acabou (persistido p/ exibir na tela de fim de temporada após reload). */
  seasonEndSummary: SeasonSummary | null;
  leagueMatches: Record<string, Match[]>;
  cupMatches: Record<string, CupMatchStore>;
  continentalMatches: Record<string, ContinentalMatchStore>;
  /** Central de Mensagens — caixa de entrada do treinador. */
  inbox: InboxMessage[];
  /** Histórico permanente de conversas com jogadores. */
  talkHistory: TalkHistoryEntry[];
  /** Regras de premiação por competição (centralizadas, ajustáveis por temporada). */
  competitionPrizeRules: Record<string, CompetitionPrizeRules>;
}

export type MatchRef =
  | { kind: 'club'; id: string }
  | { kind: 'winner'; matchId: string }
  | { kind: 'loser'; matchId: string; competitionId?: string }  // perdedor de um confronto (ex.: playoff de acesso)
  | { kind: 'group'; group: number; pos: number };

export interface CupMatchStore {
  matches: Match[];
  roundWinners: Record<string, string>; // matchId -> clubId vencedor
  roundLosers?: Record<string, string>; // matchId -> clubId perdedor (para refs 'loser')
  refs: Record<string, { home: MatchRef; away: MatchRef }>;
  /** Mapa clube -> grupo (para refs 'group' em ligas com fase de grupos, ex.: Série D). */
  groups?: Record<string, number>;
}

/** Grupo de fase de grupos de uma liga (ex.: Série D — 16 grupos de 6). */
export interface CompetitionGroup {
  id: string;
  name: string;      // 'Grupo A' ... 'Grupo P'
  clubIds: string[];
}

export interface ContinentalMatchStore extends CupMatchStore {
  groups: Record<string, number>; // clubId -> índice do grupo
}

export interface Career {
  id: string;
  userId: string;
  manager: Manager;
  clubId: string;
  difficulty: Difficulty;
  world: World;
  createdAt: string;
  lastPlayedAt: string;
  startedSeason: string;
  achievements: string[];
  notifications: Notification[];
  flags: CareerFlags;
  lineup: TeamSetup;
  trainingFocus: TrainingFocus;
  shortlist: string[];
  scouted: string[];
  recruitment: RecruitmentOfficer;
  promises: PlayerPromise[];
  settings: Settings;
}

export interface FormationSlot {
  id: string;
  position: Position;
  line: number;       // 0 = GK, 1 = def, 2 = meio, 3 = ataque
  x: number;          // 0-100 (campo)
  y: number;          // 0-100
  label: string;
}

export interface TeamStyle {
  possession: number;      // 0-100
  counterAttack: number;   // 0-100
  highPress: number;       // 0-100
  lowBlock: number;        // 0-100
  widePlay: number;        // 0-100
  throughMiddle: number;   // 0-100
  longBalls: number;       // 0-100
  shortBuildUp: number;    // 0-100
  tempo: number;           // 0-100
  intensity: number;       // 0-100
  defensiveLine: number;   // 0-100 (alto = linha alta)
}

export interface TeamSetup {
  formation: string;
  slots: Record<string, string>; // slotId -> playerId
  style: TeamStyle;
  instructions: Record<string, IndividualInstruction>; // playerId -> instrução
  captainId: string | null;
  setPieceTaker: string | null;
  /** posições livres (x,y em % do campo) por slotId — quando o jogador é solto em área do campo */
  positions?: Record<string, { x: number; y: number }>;
}

// ------------------------------------------------------------
// Configurações globais
// ------------------------------------------------------------
export interface Settings {
  theme: 'dark' | 'light';
  animations: boolean;
  simSpeed: number;
  volume: number;
  notifications: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  animations: true,
  simSpeed: 1,
  volume: 70,
  notifications: true,
};

// ------------------------------------------------------------
// Formações
// ------------------------------------------------------------
export const FORMATIONS: Record<string, FormationSlot[]> = {
  '4-4-2': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'dl', position: 'LB', line: 1, x: 16, y: 76, label: 'LD' },
    { id: 'dcl', position: 'CB', line: 1, x: 38, y: 82, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 62, y: 82, label: 'Z' },
    { id: 'dr', position: 'RB', line: 1, x: 84, y: 76, label: 'LE' },
    { id: 'ml', position: 'LW', line: 2, x: 16, y: 52, label: 'ME' },
    { id: 'mcl', position: 'CM', line: 2, x: 40, y: 46, label: 'MC' },
    { id: 'mcr', position: 'CM', line: 2, x: 60, y: 46, label: 'MC' },
    { id: 'mr', position: 'RW', line: 2, x: 84, y: 52, label: 'MD' },
    { id: 'stl', position: 'ST', line: 3, x: 40, y: 18, label: 'SA' },
    { id: 'str', position: 'ST', line: 3, x: 60, y: 18, label: 'SA' },
  ],
  '4-3-3': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'dl', position: 'LB', line: 1, x: 16, y: 76, label: 'LD' },
    { id: 'dcl', position: 'CB', line: 1, x: 38, y: 82, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 62, y: 82, label: 'Z' },
    { id: 'dr', position: 'RB', line: 1, x: 84, y: 76, label: 'LE' },
    { id: 'dm', position: 'DM', line: 2, x: 50, y: 58, label: 'VOL' },
    { id: 'mcl', position: 'CM', line: 2, x: 32, y: 42, label: 'MC' },
    { id: 'mcr', position: 'CM', line: 2, x: 68, y: 42, label: 'MC' },
    { id: 'lw', position: 'LW', line: 3, x: 20, y: 18, label: 'PE' },
    { id: 'st', position: 'ST', line: 3, x: 50, y: 10, label: 'CA' },
    { id: 'rw', position: 'RW', line: 3, x: 80, y: 18, label: 'PD' },
  ],
  '4-2-3-1': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'dl', position: 'LB', line: 1, x: 16, y: 76, label: 'LD' },
    { id: 'dcl', position: 'CB', line: 1, x: 38, y: 82, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 62, y: 82, label: 'Z' },
    { id: 'dr', position: 'RB', line: 1, x: 84, y: 76, label: 'LE' },
    { id: 'dm1', position: 'DM', line: 2, x: 38, y: 62, label: 'VOL' },
    { id: 'dm2', position: 'DM', line: 2, x: 62, y: 62, label: 'VOL' },
    { id: 'am', position: 'AM', line: 2, x: 50, y: 38, label: 'MEI' },
    { id: 'lw', position: 'LW', line: 3, x: 22, y: 26, label: 'PE' },
    { id: 'rw', position: 'RW', line: 3, x: 78, y: 26, label: 'PD' },
    { id: 'st', position: 'ST', line: 3, x: 50, y: 10, label: 'CA' },
  ],
  '4-3-1-2': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'dl', position: 'LB', line: 1, x: 16, y: 76, label: 'LD' },
    { id: 'dcl', position: 'CB', line: 1, x: 38, y: 82, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 62, y: 82, label: 'Z' },
    { id: 'dr', position: 'RB', line: 1, x: 84, y: 76, label: 'LE' },
    { id: 'mcl', position: 'CM', line: 2, x: 30, y: 56, label: 'MC' },
    { id: 'mc', position: 'CM', line: 2, x: 50, y: 52, label: 'MC' },
    { id: 'mcr', position: 'CM', line: 2, x: 70, y: 56, label: 'MC' },
    { id: 'am', position: 'AM', line: 2, x: 50, y: 32, label: 'MEI' },
    { id: 'stl', position: 'ST', line: 3, x: 38, y: 14, label: 'SA' },
    { id: 'str', position: 'ST', line: 3, x: 62, y: 14, label: 'SA' },
  ],
  '3-5-2': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'dcl', position: 'CB', line: 1, x: 28, y: 80, label: 'Z' },
    { id: 'dc', position: 'CB', line: 1, x: 50, y: 84, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 72, y: 80, label: 'Z' },
    { id: 'wl', position: 'LW', line: 2, x: 8, y: 55, label: 'ALA' },
    { id: 'mcl', position: 'CM', line: 2, x: 36, y: 50, label: 'MC' },
    { id: 'mc', position: 'CM', line: 2, x: 50, y: 44, label: 'MC' },
    { id: 'mcr', position: 'CM', line: 2, x: 64, y: 50, label: 'MC' },
    { id: 'wr', position: 'RW', line: 2, x: 92, y: 55, label: 'ALA' },
    { id: 'stl', position: 'ST', line: 3, x: 40, y: 16, label: 'SA' },
    { id: 'str', position: 'ST', line: 3, x: 60, y: 16, label: 'SA' },
  ],
  '3-4-3': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'dcl', position: 'CB', line: 1, x: 28, y: 80, label: 'Z' },
    { id: 'dc', position: 'CB', line: 1, x: 50, y: 84, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 72, y: 80, label: 'Z' },
    { id: 'wl', position: 'LW', line: 2, x: 8, y: 55, label: 'ALA' },
    { id: 'mcl', position: 'CM', line: 2, x: 38, y: 44, label: 'MC' },
    { id: 'mcr', position: 'CM', line: 2, x: 62, y: 44, label: 'MC' },
    { id: 'wr', position: 'RW', line: 2, x: 92, y: 55, label: 'ALA' },
    { id: 'lw', position: 'LW', line: 3, x: 22, y: 16, label: 'PE' },
    { id: 'st', position: 'ST', line: 3, x: 50, y: 10, label: 'CA' },
    { id: 'rw', position: 'RW', line: 3, x: 78, y: 16, label: 'PD' },
  ],
  '5-3-2': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'wl', position: 'LB', line: 1, x: 10, y: 72, label: 'ALA' },
    { id: 'dcl', position: 'CB', line: 1, x: 30, y: 80, label: 'Z' },
    { id: 'dc', position: 'CB', line: 1, x: 50, y: 84, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 70, y: 80, label: 'Z' },
    { id: 'wr', position: 'RB', line: 1, x: 90, y: 72, label: 'ALA' },
    { id: 'mcl', position: 'CM', line: 2, x: 36, y: 46, label: 'MC' },
    { id: 'mc', position: 'CM', line: 2, x: 50, y: 40, label: 'MC' },
    { id: 'mcr', position: 'CM', line: 2, x: 64, y: 46, label: 'MC' },
    { id: 'stl', position: 'ST', line: 3, x: 40, y: 16, label: 'SA' },
    { id: 'str', position: 'ST', line: 3, x: 60, y: 16, label: 'SA' },
  ],
  '5-4-1': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'wl', position: 'LB', line: 1, x: 10, y: 72, label: 'ALA' },
    { id: 'dcl', position: 'CB', line: 1, x: 30, y: 80, label: 'Z' },
    { id: 'dc', position: 'CB', line: 1, x: 50, y: 84, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 70, y: 80, label: 'Z' },
    { id: 'wr', position: 'RB', line: 1, x: 90, y: 72, label: 'ALA' },
    { id: 'mcl', position: 'CM', line: 2, x: 36, y: 48, label: 'MC' },
    { id: 'mcr', position: 'CM', line: 2, x: 64, y: 48, label: 'MC' },
    { id: 'lw', position: 'LW', line: 2, x: 20, y: 38, label: 'ME' },
    { id: 'rw', position: 'RW', line: 2, x: 80, y: 38, label: 'MD' },
    { id: 'st', position: 'ST', line: 3, x: 50, y: 14, label: 'CA' },
  ],
  '4-5-1': [
    { id: 'gk', position: 'GK', line: 0, x: 50, y: 94, label: 'GK' },
    { id: 'dl', position: 'LB', line: 1, x: 16, y: 76, label: 'LD' },
    { id: 'dcl', position: 'CB', line: 1, x: 38, y: 82, label: 'Z' },
    { id: 'dcr', position: 'CB', line: 1, x: 62, y: 82, label: 'Z' },
    { id: 'dr', position: 'RB', line: 1, x: 84, y: 76, label: 'LE' },
    { id: 'mcl', position: 'CM', line: 2, x: 28, y: 52, label: 'MC' },
    { id: 'dm', position: 'DM', line: 2, x: 50, y: 56, label: 'VOL' },
    { id: 'mcr', position: 'CM', line: 2, x: 72, y: 52, label: 'MC' },
    { id: 'lw', position: 'LW', line: 2, x: 20, y: 34, label: 'ME' },
    { id: 'rw', position: 'RW', line: 2, x: 80, y: 34, label: 'MD' },
    { id: 'st', position: 'ST', line: 3, x: 50, y: 14, label: 'CA' },
  ],
};

export const FORMATION_LIST = Object.keys(FORMATIONS);

// ------------------------------------------------------------
// Utilidades de posição
// ------------------------------------------------------------
export const POSITION_GROUPS: Record<Position, PositionGroup> = {
  GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF',
  DM: 'MID', CM: 'MID', AM: 'MID',
  LW: 'ATT', RW: 'ATT', ST: 'ATT', CF: 'ATT',
};

export const ALL_POSITIONS: Position[] = [
  'GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'CF',
];

export const POSITION_LABELS: Record<Position, string> = {
  GK: 'Goleiro', CB: 'Zagueiro', LB: 'Lateral Esq.', RB: 'Lateral Dir.',
  DM: 'Volante', CM: 'Meia Central', AM: 'Meia Ofensivo',
  LW: 'Ponta Esq.', RW: 'Ponta Dir.', ST: 'Centroavante', CF: 'Segundo Atacante',
};

export const POSITION_SHORT: Record<Position, string> = {
  GK: 'GOL', CB: 'ZAG', LB: 'LDE', RB: 'LDI',
  DM: 'VOL', CM: 'MEC', AM: 'MEA',
  LW: 'PTE', RW: 'PTD', ST: 'CEN', CF: 'SEG',
};

export const PERSONALITIES: Personality[] = [
  'Líder', 'Profissional', 'Ambicioso', 'Trabalhador', 'Temperamental',
  'Inconsistente', 'Leal', 'Mercenário', 'Jovem promessa', 'Veterano',
];

export const INJURY_TYPES: InjuryType[] = ['Muscular', 'Tornozelo', 'Joelho', 'Coxa', 'Ombro', 'Contusão'];

export const DIFFICULTY_CONFIG: Record<Difficulty, {
  aiQuality: number;       // multiplicador da qualidade da IA adversária
  userBoost: number;       // bônus para o clube do usuário
  boardTolerance: number;  // paciência da diretoria
  transferDifficulty: number; // multiplicador de preços
  devSpeed: number;        // velocidade de desenvolvimento
  financeMultiplier: number;
  scoutingQuality: number; // qualidade inicial do scout
  promiseDifficulty: number; // 1 = base; <1 facilita cumprir promessas, >1 dificulta
}> = {
  'Fácil': { aiQuality: 0.94, userBoost: 0.8, boardTolerance: 60, transferDifficulty: 0.9, devSpeed: 1.2, financeMultiplier: 1.15, scoutingQuality: 75, promiseDifficulty: 0.8 },
  'Normal': { aiQuality: 1.0, userBoost: 0, boardTolerance: 45, transferDifficulty: 1.0, devSpeed: 1.0, financeMultiplier: 1.0, scoutingQuality: 60, promiseDifficulty: 1.0 },
  'Difícil': { aiQuality: 1.06, userBoost: -0.8, boardTolerance: 30, transferDifficulty: 1.15, devSpeed: 0.85, financeMultiplier: 0.85, scoutingQuality: 45, promiseDifficulty: 1.2 },
  'Hardcore': { aiQuality: 1.12, userBoost: -1.6, boardTolerance: 18, transferDifficulty: 1.3, devSpeed: 0.7, financeMultiplier: 0.7, scoutingQuality: 35, promiseDifficulty: 1.4 },
};

export const LICENSE_REQUIREMENTS: Record<ManagerLicense, { rep: number; salary: number }> = {
  'Nenhuma': { rep: 5, salary: 800 },
  'C': { rep: 15, salary: 1500 },
  'B': { rep: 30, salary: 3000 },
  'A': { rep: 55, salary: 6000 },
  'PRO': { rep: 80, salary: 12000 },
};

export const MANAGER_STYLES: ManagerStyle[] = [
  'Ofensivo', 'Defensivo', 'Equilibrado', 'Pressing alto', 'Contra-ataque', 'Posse de bola',
];

export const TRAINING_FOCUSES: TrainingFocus[] = [
  'Físico', 'Ataque', 'Defesa', 'Passe', 'Finalização', 'Posse', 'Tática', 'Recuperação',
];

export const INDIVIDUAL_INSTRUCTIONS: IndividualInstruction[] = [
  'Atacar', 'Apoiar', 'Defender', 'Ficar atrás', 'Liberdade', 'Pressionar', 'Marcar', 'Avançar',
];

export const ACHIEVEMENTS: { id: string; name: string; description: string; icon: string }[] = [
  { id: 'first_win', name: 'Primeira Vitória', description: 'Vença sua primeira partida', icon: '🏆' },
  { id: 'first_title', name: 'Primeiro Título', description: 'Conquiste seu primeiro título', icon: '🏆' },
  { id: 'league_title', name: 'Campeão Nacional', description: 'Venca a primeira divisão nacional', icon: '👑' },
  { id: 'continental', name: 'Campeão Continental', description: 'Venca a competição continental', icon: '🌍' },
  { id: 'unbeaten_10', name: 'Invicto', description: 'Fique 10 jogos sem perder', icon: '🛡️' },
  { id: 'treble', name: 'Tríplice Coroa', description: 'Venca liga, copa e continental na mesma temporada', icon: '🎖️' },
  { id: 'promotion', name: 'Promovido', description: 'Suba de divisão', icon: '⬆️' },
  { id: 'youth', name: 'Revelação', description: 'Promova um jovem da base ao time principal', icon: '⭐' },
  { id: 'record_sale', name: 'Venda Recorde', description: 'Venda um jogador por mais de 20M', icon: '💰' },
  { id: 'seasons_5', name: 'Veterano', description: 'Complete 5 temporadas', icon: '📅' },
  { id: 'seasons_10', name: 'Lenda Viva', description: 'Complete 10 temporadas', icon: '🗿' },
  { id: 'big_win', name: 'Goleada', description: 'Venca por 5 ou mais gols de diferença', icon: '💥' },
  { id: 'hattrick', name: 'Hat-trick', description: 'Um jogador seu marca 3 gols na mesma partida', icon: '🎩' },
  { id: 'finances', name: 'Gestor', description: 'Termine a temporada com saldo positivo de 10M', icon: '📈' },
  { id: 'cup_run', name: 'Herói de Copa', description: 'Venca a copa nacional', icon: '🍾' },
];
