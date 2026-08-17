// ============================================================
// FootballSim — Central de Mensagens (caixa de entrada)
// Mensagens de jogadores, clubes, diretoria e sistema entram na
// inbox. Conversas abrem o PlayerConversationModal reutilizável.
// ============================================================
import { World, Career, InboxMessage, InboxCategory, InboxPriority, PlayerTalk, TalkTopic, TalkHistoryEntry } from '../lib/types';
import { notify } from './news';

const msgId = () => `im${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export const CATEGORY_LABELS: Record<InboxCategory, string> = {
  transfer: 'Transferências',
  squad: 'Elenco',
  contract: 'Contratos',
  board: 'Diretoria',
  finance: 'Finanças',
};

export const PRIORITY_LABELS: Record<InboxPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  important: 'Importante',
  urgent: 'Urgente',
};

export function priorityOf(topic: TalkTopic): InboxPriority {
  switch (topic) {
    case 'exit': case 'starter': return 'important';
    case 'minutes': case 'bench': case 'raise': case 'contract': case 'loan': return 'normal';
    default: return 'low';
  }
}

/** Adiciona uma mensagem à inbox e cria uma notificação (com link se houver). */
export function pushInbox(world: World, career: Career, msg: Omit<InboxMessage, 'id' | 'date' | 'read'>): InboxMessage {
  const full: InboxMessage = {
    ...msg,
    id: msgId(),
    date: world.date,
    read: false,
  };
  world.inbox.unshift(full);
  if (world.inbox.length > 200) world.inbox.pop();

  // Notificação associada (sino). Não interrompe partidas — só o badge.
  const icon = msg.category === 'transfer' ? '📩' : msg.category === 'contract' ? '📄' : msg.category === 'board' ? '🏢' : '💬';
  const kind = msg.priority === 'urgent' ? 'danger' : msg.priority === 'important' ? 'warning' : 'info';
  notify(career, `${msg.senderName}: ${msg.title}`, kind, icon, msg.link);

  return full;
}

export function unreadInboxCount(world: World): number {
  return world.inbox.filter((m) => !m.read).length;
}

export function markInboxRead(world: World, id: string): void {
  const m = world.inbox.find((x) => x.id === id);
  if (m) m.read = true;
}

export function markAllInboxRead(world: World): void {
  for (const m of world.inbox) m.read = true;
}

/** Mensagem de conversa iniciada por um jogador (entra na inbox). */
export function pushTalkMessage(world: World, career: Career, talk: PlayerTalk, preview: string): InboxMessage | null {
  const p = world.players[talk.playerId];
  if (!p) return null;
  return pushInbox(world, career, {
    playerId: p.id,
    senderName: `${p.firstName} ${p.lastName}`,
    title: talkTopicTitle(talk.topic),
    preview,
    category: talk.topic === 'raise' || talk.topic === 'contract' ? 'contract' : 'squad',
    priority: priorityOf(talk.topic),
    link: `talk:${p.id}`,
    talkId: talk.id,
  });
}

export function talkTopicTitle(t: TalkTopic): string {
  const map: Partial<Record<TalkTopic, string>> = {
    minutes: 'Quer mais minutos',
    starter: 'Pedido de titularidade',
    bench: 'Reclamação do banco',
    loan: 'Pedido de empréstimo',
    exit: 'Pedido para sair',
    raise: 'Pedido de aumento salarial',
    contract: 'Pergunta sobre contrato',
    position: 'Reclamação de posição',
    training: 'Reclamação sobre treinos',
    praise: 'Elogio ao treinador',
    performance: 'Preocupação com desempenho',
    conflict: 'Conflito no vestiário',
    plans: 'Planos para o futuro',
    youth: 'Oportunidade da base',
    veteran: 'Papel no elenco',
    checkin: 'Conversa do treinador',
  };
  return map[t] ?? 'Mensagem do jogador';
}

/** Mensagem de proposta recebida de outro clube. */
export function pushOfferMessage(world: World, career: Career, clubName: string, playerId: string, fee: number): InboxMessage {
  const p = world.players[playerId];
  const name = p ? `${p.firstName} ${p.lastName}` : 'jogador';
  return pushInbox(world, career, {
    clubId: clubName,
    senderName: clubName,
    title: `Proposta por ${name}`,
    preview: `Oferta de €${(fee / 1e6).toFixed(1)}M pelo jogador.`,
    category: 'transfer',
    priority: 'important',
    link: 'transfers',
  });
}

/** Registra uma conversa no histórico permanente do jogador. */
export function recordTalk(world: World, playerId: string, topic: TalkTopic, summary: string): TalkHistoryEntry {
  const entry: TalkHistoryEntry = {
    id: msgId(),
    playerId,
    topic,
    date: world.date,
    summary,
  };
  world.talkHistory.unshift(entry);
  if (world.talkHistory.length > 500) world.talkHistory.pop();
  return entry;
}

export function talkHistoryFor(world: World, playerId: string): TalkHistoryEntry[] {
  return world.talkHistory.filter((t) => t.playerId === playerId);
}

// ------------------------------------------------------------
// Evento global para abrir o PlayerConversationModal de qualquer tela
// ------------------------------------------------------------
export const OPEN_CONVERSATION_EVENT = 'footballsim:open-conversation';

export function openPlayerConversation(playerId: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: { playerId } }));
}
