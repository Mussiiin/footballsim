// ------------------------------------------------------------
// Sondagens (mercado vivo fora da janela de transferências)
// O treinador pode sondar jogadores de outros clubes mesmo com a
// janela fechada. A sondagem NÃO é proposta nem transferência: o
// clube vendedor responde se está (ou não) disposto a negociar.
// ------------------------------------------------------------
import { World, Career, Player, Inquiry, InquiryStatus } from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { isVitalPlayer } from './transfers';
import { marketAnalysis } from './negotiation';
import { pushInbox } from './messages';
import { addNews } from './news';
import { daysBetween } from '../lib/date';

let inquiryCounter = 0;

export const INQUIRY_LABEL: Record<InquiryStatus, string> = {
  pendente: 'Aguardando resposta',
  aberto: 'Aberto a negociar',
  'so-alta': 'Só aceita proposta alta',
  'nao-vende': 'Não pretende vender',
  indisponivel: 'Jogador indisponível',
};

export function inquiryIcon(status: InquiryStatus): string {
  return status === 'pendente' ? '⏳' : status === 'aberto' ? '🟢' : status === 'so-alta' ? '🟡' : status === 'nao-vende' ? '🟠' : '🔴';
}

/** Envia uma sondagem ao clube dono do jogador. Não gera transferência. */
export function sendInquiry(world: World, career: Career, playerId: string): Inquiry | null {
  const p = world.players[playerId];
  if (!p || !p.clubId) return null;
  const seller = world.clubs[p.clubId];
  const analysis = marketAnalysis(world, p);
  const existing = world.inquiries.find((i) => i.playerId === playerId && i.status === 'pendente');
  if (existing) return existing;
  const inq: Inquiry = {
    id: `inq${inquiryCounter++}`,
    playerId,
    sellerClubId: p.clubId,
    date: world.date,
    status: 'pendente',
    responseDate: null,
    note: null,
    suggestedFee: analysis.value,
  };
  world.inquiries.unshift(inq);
  pushInbox(world, career, {
    senderName: 'Central de transferências',
    title: `🔎 Sondagem enviada: ${p.firstName} ${p.lastName}`,
    preview: `Perguntamos ao ${seller?.shortName ?? 'clube'} se está disposto a negociar. Aguardando resposta.`,
    category: 'transfer',
    priority: 'normal',
    link: 'transfers:sondagens',
  });
  return inq;
}

/** Resolve as sondagens pendentes após alguns dias — o clube vendedor responde. */
export function tickInquiries(world: World, career: Career | null): void {
  for (const inq of world.inquiries) {
    if (inq.status !== 'pendente') continue;
    if (daysBetween(inq.date, world.date) < 3) continue; // resposta leva 3+ dias
    const p = world.players[inq.playerId];
    if (!p) {
      inq.status = 'indisponivel';
      inq.responseDate = world.date;
      inq.note = 'Jogador não está mais disponível.';
      continue;
    }
    const seller = world.clubs[inq.sellerClubId];
    if (!seller) {
      inq.status = 'indisponivel';
      inq.responseDate = world.date;
      inq.note = 'Clube não encontrado.';
      continue;
    }
    const analysis = marketAnalysis(world, p);
    const vital = isVitalPlayer(world, p);
    const rng = new RNG(hashString(world.seed) ^ hashString(`${inq.id}|resp`));

    let status: InquiryStatus;
    let note: string;
    if (vital) {
      const roll = rng.next();
      if (roll < 0.35) {
        status = 'so-alta';
        inq.suggestedFee = Math.round(analysis.value * rng.float(1.3, 1.65) / 1e5) * 1e5;
        note = 'É um jogador importante do elenco. Só aceitamos uma proposta muito acima do valor de mercado.';
      } else if (roll < 0.7) {
        status = 'nao-vende';
        note = 'Não temos interesse em vender este jogador neste momento.';
      } else {
        status = 'indisponivel';
        note = 'O jogador não está disponível para negociação.';
      }
    } else if (rng.chance(0.3)) {
      status = 'so-alta';
      inq.suggestedFee = Math.round(analysis.value * rng.float(1.2, 1.45) / 1e5) * 1e5;
      note = 'Aberto a negociar, mas apenas mediante uma proposta alta.';
    } else {
      status = 'aberto';
      note = 'Estamos abertos a negociar. Uma proposta em torno do valor de mercado seria bem recebida.';
    }
    inq.status = status;
    inq.responseDate = world.date;
    inq.note = note;

    if (career) {
      pushInbox(world, career, {
        senderName: seller.shortName,
        title: `🔎 Resposta à sondagem por ${p.firstName} ${p.lastName}`,
        preview: note,
        category: 'transfer',
        priority: status === 'aberto' ? 'important' : status === 'so-alta' ? 'normal' : 'low',
        link: 'transfers:sondagens',
      });
    }
    addNews(world, {
      date: world.date,
      title: `🔎 ${seller.shortName} responde sondagem por ${p.firstName} ${p.lastName}`,
      subtitle: note,
      category: 'Transferências',
      importance: 35,
      clubId: inq.sellerClubId,
      playerId: p.id,
    });
  }
}

/** A sondagem mais recente de um jogador (para a UI). */
export function inquiryForPlayer(world: World, playerId: string): Inquiry | null {
  return world.inquiries.find((i) => i.playerId === playerId) ?? null;
}

export type { Player };
