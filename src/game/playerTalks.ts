// ============================================================
// FootballSim — Conversas entre treinador e jogadores
// Jogadores procuram o treinador com pedidos contextuais e o
// treinador pode iniciar conversas. As respostas alteram moral,
// satisfação, relação e podem registrar promessas reais.
// ============================================================
import {
  World, Career, Player, PlayerTalk, TalkOption, TalkTopic,
} from '../lib/types';
import { RNG } from '../lib/rng';
import { clamp } from '../lib/format';
import { notify } from './news';
import { roleForPlayer, addPlayerPromise } from './negotiation';

const talkId = () => `talk${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const setM = (p: Player, d: number) => { p.morale = clamp(p.morale + d, 1, 100); };
const setH = (p: Player, d: number) => { p.happiness = clamp(p.happiness + d, 1, 100); };
const setR = (p: Player, d: number) => { p.relation = clamp(p.relation + d, 1, 100); };

export function talkTopicLabel(t: TalkTopic): string {
  const map: Record<TalkTopic, string> = {
    minutes: 'Tempo de jogo', starter: 'Pedido de titularidade', bench: 'Queixa do banco',
    loan: 'Pedido de empréstimo', exit: 'Pedido de saída', raise: 'Aumento salarial',
    position: 'Posição em campo', training: 'Treinamento', praise: 'Elogio ao treinador',
    performance: 'Preocupação com desempenho', conflict: 'Conflito com companheiro',
    plans: 'Planos para o futuro', youth: 'Oportunidade da base', veteran: 'Papel no elenco',
    checkin: 'Conversa do treinador',
  };
  return map[t];
}

/** Contexto da conversa: papel atual, jogos, salário, forma — tudo real. */
function contextOf(world: World, career: Career, p: Player): string {
  const role = roleForPlayer(world, career.clubId, p);
  const apps = p.seasonStats.apps;
  const wage = p.contract ? `Salário de €${(p.contract.wage / 1000).toFixed(0)} mil/sem.` : 'Sem contrato.';
  return `${role} · ${apps} jogos na temporada · ${wage} Moral ${p.morale}% · Satisfação ${p.happiness}%.`;
}

/** Escolhe uma conversa iniciada pelo jogador conforme a situação real do elenco. */
export function generateDailyTalk(world: World, career: Career, rng: RNG): PlayerTalk | null {
  // cooldown: no máximo 1 conversa por dia e 1 a cada 2 dias em média
  if (career.flags.lastTalkDate === world.date) return null;
  if (!rng.chance(0.26)) return null;

  const squad = Object.values(world.players).filter((p) => p.clubId === career.clubId && p.status === 'active');
  if (squad.length < 3) return null;
  const existing = new Set(Object.keys(world.playerTalks));

  const candidates: { p: Player; topic: TalkTopic; score: number }[] = [];
  for (const p of squad) {
    if (existing.has(p.id)) continue;
    if (p.injury) continue;
    const role = roleForPlayer(world, career.clubId, p);
    const apps = p.seasonStats.apps;
    const bench = role === 'Reserva' || role === 'Rotação' || role === 'Base';
    const score = Math.max(1, Math.round(p.happiness / 18) + (bench ? 6 : 0) + (p.morale < 45 ? 5 : 0));
    if (bench || p.happiness < 45 || p.age <= 20 || p.age >= 32 || p.morale < 45) {
      let topic: TalkTopic = 'minutes';
      if (p.age <= 20) topic = 'youth';
      else if (p.age >= 32) topic = 'veteran';
      else if (bench && rng.chance(0.4)) topic = 'bench';
      else if (p.transferRequested && rng.chance(0.5)) topic = 'exit';
      else if (p.happiness < 35 && rng.chance(0.35)) topic = 'loan';
      else if (p.personality === 'Ambicioso' && rng.chance(0.35)) topic = 'raise';
      else if (p.seasonStats.apps >= 8 && rng.chance(0.3)) topic = 'starter';
      candidates.push({ p, topic, score });
    }
  }
  if (candidates.length === 0) return null;

  // 25% dos dias um evento positivo/neutro (elogio, preocupação, planos)
  const pick = rng.weighted(candidates, candidates.map((c) => c.score));
  if (!pick) return null;
  let topic = pick.topic;
  if (rng.chance(0.22)) {
    topic = rng.pick(['praise', 'performance', 'plans', 'conflict', 'position', 'training'] as TalkTopic[]);
  }

  const talk = buildTalk(world, career, pick.p, topic, 'player');
  career.flags.lastTalkDate = world.date;
  world.playerTalks[talk.id] = talk;
  notify(
    career,
    `💬 ${pick.p.firstName} ${pick.p.lastName} quer conversar: ${talkTopicLabel(topic).toLowerCase()}.`,
    'info', '💬', `talk:${pick.p.id}`,
  );
  return talk;
}

/** Conversa iniciada pelo treinador (contextual ou "como você está?"). */
export function startManagerTalk(world: World, career: Career, playerId: string): PlayerTalk {
  const p = world.players[playerId];
  if (!p) throw new Error('Jogador não encontrado');
  // se já existe uma conversa ativa com o jogador, reaproveita
  const existing = Object.values(world.playerTalks).find((t) => t.playerId === playerId && t.active);
  if (existing) return existing;
  const role = roleForPlayer(world, career.clubId, p);
  const bench = role === 'Reserva' || role === 'Rotação' || role === 'Base';
  let topic: TalkTopic = 'checkin';
  if (p.age <= 20) topic = 'youth';
  else if (p.age >= 32) topic = 'veteran';
  else if (bench) topic = 'bench';
  else if (p.happiness < 40) topic = 'minutes';
  else if (p.transferRequested) topic = 'exit';
  const talk = buildTalk(world, career, p, topic, 'manager');
  world.playerTalks[talk.id] = talk;
  return talk;
}

function buildTalk(world: World, career: Career, p: Player, topic: TalkTopic, initiatedBy: 'player' | 'manager'): PlayerTalk {
  const ctx = contextOf(world, career, p);
  let line = '';
  let options: TalkOption[] = [];
  const opt = (id: string, label: string) => options.push({ id, label });

  switch (topic) {
    case 'minutes':
      line = `Mister, sinto que estou merecendo mais minutos. Tenho treinado bem e queria uma oportunidade.`;
      opt('promise', 'Você terá mais oportunidades (prometo mais partidas)');
      opt('work', 'Precisa continuar trabalhando');
      opt('ahead', 'No momento, outros jogadores estão à sua frente');
      break;
    case 'starter':
      line = `Professor, acredito que estou pronto para começar a próxima partida. Posso ter uma chance?`;
      opt('promise', 'Prometo titularidade');
      opt('minutes', 'Prometo mais minutos, não a titularidade');
      opt('training', 'Depende do treinamento');
      opt('refuse', 'Recusar — você fica no banco');
      break;
    case 'bench':
      line = `Estou incomodado de ficar no banco. Venho trabalhando forte e mereço mais consideração.`;
      opt('empathy', 'Entendo, vou acompanhar sua evolução');
      opt('promise', 'Prometo mais minutos');
      opt('ahead', 'Outros estão à sua frente por mérito');
      break;
    case 'loan':
      line = `Não estou tendo oportunidades aqui. Você consideraria me emprestar para eu ganhar ritmo?`;
      opt('agree', 'Concordo — vou procurar um empréstimo');
      opt('promise', 'Não, mas prometo mais minutos aqui');
      opt('refuse', 'Não — você fica');
      break;
    case 'exit':
      line = `Mister, quero ser honesto: estou pensando em sair. Preciso de novos ares.`;
      opt('listen', 'Vou ouvir propostas por você');
      opt('stay', 'Você é importante — quero que fique');
      opt('ask', 'Me dê mais uma chance de te convencer');
      break;
    case 'raise':
      line = `Meu contrato não reflete meu valor para o elenco. Gostaria de conversar sobre o salário.`;
      opt('promise', 'Prometo aumento salarial no fim da temporada');
      opt('renew', 'Vamos abrir uma negociação de renovação');
      opt('no', 'Não agora — o momento do clube é difícil');
      break;
    case 'position':
      line = `Estou rendendo menos porque não jogo na minha posição. Gostaria de voltar para a minha posição natural.`;
      opt('promise', 'Prometo escalar você na posição preferida');
      opt('try', 'Vou tentar te usar melhor');
      opt('no', 'Preciso de você onde está');
      break;
    case 'training':
      line = `Sinto que a intensidade dos treinos não está me ajudando. Pode revisar o foco?`;
      opt('adjust', 'Vou ajustar o foco de treino');
      opt('reassure', 'Continue firme, está rendendo bem');
      break;
    case 'praise':
      line = `Só queria dizer que o senhor mudou meu papel no time e estou rendendo muito melhor. Obrigado, mister!`;
      opt('thanks', 'Obrigado, continue assim');
      opt('more', 'Ainda quero mais de você');
      break;
    case 'performance':
      line = `Estou preocupado com meu desempenho. Sinto que não estou entregando o que esperam de mim.`;
      opt('support', 'Confio em você — relaxe e jogue seu futebol');
      opt('demand', 'Você precisa mostrar mais nos treinos');
      break;
    case 'conflict':
      line = `Está difícil a convivência com um companheiro. Estamos tendo atritos no vestiário.`;
      opt('mediate', 'Vou conversar com os dois e mediar');
      opt('solve', 'Resolvam isso entre vocês como profissionais');
      break;
    case 'plans':
      line = `Mister, quero entender o que o senhor planeja para mim daqui para frente.`;
      opt('clear', 'Você tem um papel claro no meu projeto');
      opt('compete', 'Tudo depende da disputa por posição');
      break;
    case 'youth':
      line = `Sou da base e quero mostrar meu valor. Posso ter uma chance no time principal?`;
      opt('promise', 'Prometo mais oportunidades (partidas)');
      opt('work', 'Continue evoluindo — sua hora vai chegar');
      break;
    case 'veteran':
      line = `Com a idade, quero entender meu papel. Ainda sou útil para este elenco?`;
      opt('leader', 'Você é essencial — liderança do vestiário');
      opt('rotation', 'Seu papel agora é de rotação e experiência');
      opt('honest', 'Seu tempo está diminuindo, mas respeito sua história');
      break;
    case 'checkin':
      line = `Tudo sob controle, mister. Como o senhor está vendo o time?`;
      opt('good', 'Estou satisfeito com você e com o grupo');
      opt('need', 'Preciso de mais de você nos próximos jogos');
      break;
  }

  return {
    id: talkId(),
    playerId: p.id,
    topic,
    line,
    context: ctx,
    options,
    createdAt: world.date,
    active: true,
    initiatedBy,
  };
}

/** Aplica a consequência da escolha do treinador e encerra a conversa. */
export function respondTalk(world: World, career: Career, talkIdKey: string, optionId: string): PlayerTalk | null {
  const talk = world.playerTalks[talkIdKey];
  if (!talk || !talk.active) return null;
  const p = world.players[talk.playerId];
  if (!p) return null;
  career.flags.talksHad = (career.flags.talksHad ?? 0) + 1;
  talk.active = false;

  const ok = (msg: string) => { talk.result = msg; };

  switch (talk.topic) {
    case 'minutes':
      if (optionId === 'promise') {
        addPlayerPromise(world, career, p.id, 'Mínimo de 15 partidas na temporada');
        setM(p, 8); setH(p, 8); setR(p, 6);
        ok(`Promessa registrada no contrato: você terá mais oportunidades. ${p.firstName} ficou satisfeito (moral +8).`);
      } else if (optionId === 'work') {
        setM(p, 3); setR(p, 2);
        ok(`${p.firstName} aceitou, mas vai seguir cobrando espaço (moral +3).`);
      } else {
        setM(p, -6); setH(p, -8); setR(p, -5);
        ok(`${p.firstName} ficou frustrado com a resposta (moral -6, satisfação -8).`);
      }
      break;
    case 'starter':
      if (optionId === 'promise') {
        addPlayerPromise(world, career, p.id, 'Titularidade garantida');
        setM(p, 10); setH(p, 10); setR(p, 8);
        ok('Prometida titularidade. Se você não cumprir, ele pode ficar insatisfeito e pedir para sair.');
      } else if (optionId === 'minutes') {
        addPlayerPromise(world, career, p.id, 'Mínimo de 15 partidas na temporada');
        setM(p, 7); setH(p, 6); setR(p, 5);
        ok(`${p.firstName} aceitou mais minutos como primeiro passo (moral +7).`);
      } else if (optionId === 'training') {
        setM(p, -2); setR(p, 4);
        ok('Ele entendeu: depende do treinamento. Relação melhorou (relação +4).');
      } else {
        setM(p, -10); setH(p, -10); setR(p, -6);
        ok(`${p.firstName} ficou muito decepcionado com a recusa (moral -10, satisfação -10).`);
      }
      break;
    case 'bench':
      if (optionId === 'empathy') {
        setM(p, 4); setH(p, 6); setR(p, 5);
        ok(`${p.firstName} agradeceu a atenção (moral +4, relação +5).`);
      } else if (optionId === 'promise') {
        addPlayerPromise(world, career, p.id, 'Mínimo de 15 partidas na temporada');
        setM(p, 9); setH(p, 9); setR(p, 6);
        ok('Promessa de mais minutos registrada (moral +9).');
      } else {
        setM(p, -8); setH(p, -10); setR(p, -4);
        if (p.happiness < 35) p.transferRequested = true;
        ok(`${p.firstName} se sentiu desvalorizado. Se continuar no banco, pode pedir para sair (satisfação -10).`);
      }
      break;
    case 'loan':
      if (optionId === 'agree') {
        setH(p, 14); setR(p, 8);
        p.transferRequested = true; // clubes da IA podem fazer propostas
        ok('Você concordou em emprestá-lo — ele vai procurar ritmo fora. Satisfação +14.');
      } else if (optionId === 'promise') {
        addPlayerPromise(world, career, p.id, 'Mínimo de 15 partidas na temporada');
        setM(p, 8); setH(p, 8); setR(p, 6);
        ok('Promessa de mais minutos registrada — ele ficou e terá chances.');
      } else {
        setM(p, -6); setH(p, -8);
        ok(`${p.firstName} aceitou a decisão, mas com descontentamento (moral -6).`);
      }
      break;
    case 'exit':
      if (optionId === 'listen') {
        p.transferRequested = true;
        setH(p, 8); setR(p, 4);
        ok('Você vai ouvir propostas. Os clubes da IA podem começar a negociar.');
      } else if (optionId === 'stay') {
        setM(p, 6); setH(p, -4); setR(p, 6);
        ok(`${p.firstName} vai ficar, mas você precisa mostrar valor para ele (moral +6).`);
      } else {
        setM(p, -4); setH(p, -6); setR(p, -2);
        ok('Ele vai esperar mais um pouco, mas está de olho nas portas de saída.');
      }
      break;
    case 'raise':
      if (optionId === 'promise') {
        addPlayerPromise(world, career, p.id, 'Aumento salarial no fim da temporada');
        setM(p, 8); setH(p, 10); setR(p, 7);
        ok('Promessa de aumento registrada (satisfação +10). Cumpra no fim da temporada.');
      } else if (optionId === 'renew') {
        setH(p, 8); setR(p, 6);
        ok('Você sugeriu abrir uma renovação. Use a opção de renovar no perfil dele.');
      } else {
        setH(p, -10); setR(p, -4);
        ok(`${p.firstName} entendeu, mas a satisfação caiu (satisfação -10).`);
      }
      break;
    case 'position':
      if (optionId === 'promise') {
        addPlayerPromise(world, career, p.id, 'Jogar na posição preferida');
        setM(p, 9); setH(p, 8); setR(p, 7);
        ok('Promessa de jogar na posição preferida registrada (moral +9).');
      } else if (optionId === 'try') {
        setM(p, 4); setH(p, 4); setR(p, 5);
        ok(`${p.firstName} agradeceu a disposição de testá-lo melhor (relação +5).`);
      } else {
        setM(p, -8); setH(p, -7); setR(p, -4);
        ok(`${p.firstName} ficou contrariado com a posição mantida (moral -8).`);
      }
      break;
    case 'training':
      if (optionId === 'adjust') {
        setM(p, 6); setH(p, 5); setR(p, 5);
        ok('Você prometeu revisar o treino — moral +6. Ajuste o foco na tela de Treino.');
      } else {
        setM(p, 4); setR(p, 3);
        ok(`${p.firstName} foi encorajado (moral +4).`);
      }
      break;
    case 'praise':
      if (optionId === 'thanks') {
        setM(p, 6); setH(p, 5); setR(p, 8);
        ok(`${p.firstName} valorizou o reconhecimento (relação +8, moral +6).`);
      } else {
        setM(p, -2); setR(p, 2);
        ok('Você exigiu mais — ele aceitou o desafio (moral -2, relação +2).');
      }
      break;
    case 'performance':
      if (optionId === 'support') {
        setM(p, 7); setH(p, 6); setR(p, 6);
        ok(`Você deu confiança a ${p.firstName} (moral +7).`);
      } else {
        setM(p, -6); setH(p, -4); setR(p, -3);
        p.form = clamp(p.form + 3, 1, 100);
        ok('Cobrança feita: moral caiu, mas ele prometeu reagir (forma +3).');
      }
      break;
    case 'conflict':
      if (optionId === 'mediate') {
        setM(p, 8); setH(p, 10); setR(p, 8);
        ok('Você prometeu mediar o conflito. O ambiente deve melhorar (satisfação +10).');
      } else {
        setM(p, -6); setH(p, -6); setR(p, -5);
        ok('O jogador sentiu falta de apoio da comissão (moral -6).');
      }
      break;
    case 'plans':
      if (optionId === 'clear') {
        setM(p, 8); setH(p, 6); setR(p, 7);
        ok(`${p.firstName} saiu confiante da conversa (moral +8).`);
      } else {
        setM(p, 3); setH(p, -2); setR(p, 4);
        ok('Ele entendeu que a vaga depende de desempenho (relação +4).');
      }
      break;
    case 'youth':
      if (optionId === 'promise') {
        addPlayerPromise(world, career, p.id, 'Mínimo de 15 partidas na temporada');
        setM(p, 12); setH(p, 10); setR(p, 8);
        ok('Promessa de oportunidades registrada — moral +12. A jovem promessa está motivada.');
      } else {
        setM(p, 2); setH(p, 2); setR(p, 5);
        ok('Você incentivou o jovem a continuar evoluindo (relação +5).');
      }
      break;
    case 'veteran':
      if (optionId === 'leader') {
        setM(p, 10); setH(p, 8); setR(p, 9);
        ok('O veterano se sentiu valorizado pela liderança (relação +9, moral +10).');
      } else if (optionId === 'rotation') {
        setM(p, -3); setH(p, -2); setR(p, 2);
        ok('Ele aceitou o papel de rotação, mas com ressalvas (moral -3).');
      } else {
        setM(p, -10); setH(p, -12); setR(p, -6);
        if (p.age >= 32) p.transferRequested = true;
        ok(`O veterano ficou magoado com a resposta. Com ${p.age} anos, pode buscar outros ares.`);
      }
      break;
    case 'checkin':
      if (optionId === 'good') {
        setM(p, 4); setH(p, 3); setR(p, 5);
        ok('Clima positivo no vestiário (relação +5).');
      } else {
        setM(p, -2); setR(p, 2);
        ok('Você pediu mais — o jogador vai se dedicar (relação +2).');
      }
      break;
  }

  delete world.playerTalks[talkIdKey];
  return talk;
}

/** Pega a conversa ativa de um jogador (se houver). */
export function activeTalkForPlayer(world: World, playerId: string): PlayerTalk | null {
  return Object.values(world.playerTalks).find((t) => t.playerId === playerId && t.active) ?? null;
}
