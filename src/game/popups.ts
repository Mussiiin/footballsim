// ============================================================
// FootballSim — Popups e notificações na tela
// Eventos importantes (propostas, sondagens, contratações,
// conversas de jogadores) viram popups visíveis imediatamente,
// com fila (um modal por vez) e toasts que somem sozinhos.
// As mensagens continuam registradas na inbox normalmente —
// fechar o popup nunca descarta o evento.
// ============================================================
import type { IncomingOffer, Player } from '../lib/types';

export type PopupPriority = 'urgent' | 'important' | 'normal';

export interface GamePopup {
  id: string;
  type:
    | 'proposal'
    | 'inquiry'
    | 'interest'
    | 'player-accepted'
    | 'player-refused'
    | 'club-refused'
    | 'transfer-concluded'
    | 'player-talk'
    | 'info';
  title: string;
  message: string;
  icon: string;
  priority: PopupPriority;
  link: string;
  actionLabel: string;
  /** pares rótulo → valor mostrados no modal (valor, clube, jogador, etc.). */
  meta: { label: string; value: string }[];
  createdAt: string;
}

let sink: ((p: GamePopup) => void) | null = null;

/** O provider (store) registra o destino dos popups. */
export function registerPopupSink(fn: (p: GamePopup) => void): void {
  sink = fn;
}

/** Emite um popup — o destino enfileira e exibe. */
export function emitPopup(p: Omit<GamePopup, 'id' | 'createdAt'>): void {
  if (!sink) return;
  sink({
    ...p,
    id: `pop${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  });
}

// ------------------------------------------------------------
// Construtores para cada tipo de evento
// ------------------------------------------------------------

/** 💰 Nova proposta oficial recebida por um jogador do nosso elenco. */
export function popupIncomingProposal(offer: IncomingOffer, clubName: string, p: Player, officerLine?: string): void {
  emitPopup({
    type: 'proposal',
    title: 'NOVA PROPOSTA DE TRANSFERÊNCIA',
    message: `${clubName} fez uma proposta oficial por ${p.firstName} ${p.lastName}.`,
    icon: '💰',
    priority: 'urgent',
    link: `transfers:offers:${offer.id}`,
    actionLabel: 'VER PROPOSTA',
    meta: [
      { label: 'Jogador', value: `${p.firstName} ${p.lastName}` },
      { label: 'Clube', value: clubName },
      { label: 'Valor oferecido', value: `€${(offer.fee / 1e6).toFixed(1)}M${offer.bonus > 0 ? ` + €${(offer.bonus / 1e6).toFixed(1)}M bônus` : ''}` },
      ...(offer.sellOnPct > 0 ? [{ label: 'Futura venda', value: `${offer.sellOnPct}% para nós` }] : []),
    ],
  });
}

/** 📞 Sondagem recebida por um jogador do nosso elenco. */
export function popupIncomingInquiry(clubName: string, p: Player): void {
  emitPopup({
    type: 'inquiry',
    title: 'SONDAGEM DE TRANSFERÊNCIA',
    message: `${clubName} entrou em contato para saber as condições de contratação de ${p.firstName} ${p.lastName}.`,
    icon: '📞',
    priority: 'important',
    link: 'transfers:sond-recebidas',
    actionLabel: 'VER SONDAGEM',
    meta: [
      { label: 'Jogador', value: `${p.firstName} ${p.lastName}` },
      { label: 'Clube', value: clubName },
      { label: 'Status', value: 'Aguardando sua resposta' },
    ],
  });
}

/** 👀 Interesse de um clube por um jogador nosso. */
export function popupInterest(clubName: string, p: Player): void {
  emitPopup({
    type: 'interest',
    title: 'INTERESSE EM JOGADOR',
    message: `${clubName} está monitorando ${p.firstName} ${p.lastName}.`,
    icon: '👀',
    priority: 'normal',
    link: 'transfers',
    actionLabel: 'VER',
    meta: [{ label: 'Jogador', value: `${p.firstName} ${p.lastName}` }],
  });
}

/** ✅ O jogador de outro clube aceitou nossa proposta salarial. */
export function popupPlayerAccepted(p: Player, wage: number, years: number): void {
  emitPopup({
    type: 'player-accepted',
    title: 'JOGADOR ACEITOU A PROPOSTA',
    message: `${p.firstName} ${p.lastName} aceitou as condições contratuais oferecidas pelo seu clube.`,
    icon: '✅',
    priority: 'urgent',
    link: `negotiation:${p.id}`,
    actionLabel: 'VER PROPOSTA',
    meta: [
      { label: 'Jogador', value: `${p.firstName} ${p.lastName}` },
      { label: 'Salário', value: `€${(wage / 1000).toFixed(0)} mil/sem` },
      { label: 'Contrato', value: `${years} ano(s)` },
    ],
  });
}

/** ❌ O jogador recusou nossa proposta. */
export function popupPlayerRefused(p: Player, reason: string): void {
  emitPopup({
    type: 'player-refused',
    title: 'PROPOSTA RECUSADA',
    message: `${p.firstName} ${p.lastName} recusou a proposta contratual. ${reason}`,
    icon: '❌',
    priority: 'urgent',
    link: `negotiation:${p.id}`,
    actionLabel: 'VER DETALHES',
    meta: [{ label: 'Jogador', value: `${p.firstName} ${p.lastName}` }],
  });
}

/** ❌ O clube vendedor recusou nossa proposta de transferência. */
export function popupClubRefused(p: Player, clubName: string): void {
  emitPopup({
    type: 'club-refused',
    title: 'PROPOSTA RECUSADA',
    message: `${clubName} recusou sua proposta de transferência por ${p.firstName} ${p.lastName}.`,
    icon: '❌',
    priority: 'urgent',
    link: `negotiation:${p.id}`,
    actionLabel: 'VER DETALHES',
    meta: [{ label: 'Jogador', value: `${p.firstName} ${p.lastName}` }],
  });
}

/** 🎉 Uma transferência foi concluída (chegada ou venda do nosso elenco). */
export function popupTransferConcluded(p: Player, toClubName: string, fee: number, type: string): void {
  const isArrival = type === 'arrival';
  emitPopup({
    type: 'transfer-concluded',
    title: 'TRANSFERÊNCIA CONCLUÍDA',
    message: isArrival
      ? `${p.firstName} ${p.lastName} é oficialmente jogador do seu clube!`
      : `${p.firstName} ${p.lastName} foi vendido para ${toClubName}.`,
    icon: '🎉',
    priority: 'urgent',
    link: `player:${p.id}`,
    actionLabel: isArrival ? 'VER JOGADOR' : 'VER',
    meta: [
      { label: 'Jogador', value: `${p.firstName} ${p.lastName}` },
      { label: 'Clube', value: toClubName },
      ...(fee > 0 ? [{ label: 'Valor', value: `€${(fee / 1e6).toFixed(1)}M` }] : []),
    ],
  });
}

/** 🗣️ Um jogador do nosso elenco quer conversar. */
export function popupPlayerTalk(p: Player, line: string): void {
  emitPopup({
    type: 'player-talk',
    title: 'MENSAGEM DO JOGADOR',
    message: `${p.firstName} ${p.lastName} quer conversar com você.`,
    icon: '🗣️',
    priority: 'important',
    link: `talk:${p.id}`,
    actionLabel: 'RESPONDER',
    meta: [{ label: p.firstName, value: line.slice(0, 120) }],
  });
}
