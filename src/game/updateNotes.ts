// ------------------------------------------------------------
// Sistema de atualizações do FootballSim
// ------------------------------------------------------------
// Centraliza a versão do jogo, as patch notes e o controle de
// versão salvo no navegador. Totalmente separado dos dados de
// carreira (que ficam no IndexedDB/Supabase).
//
// O popup é DISPARADO AUTOMATICAMENTE: cada publicação/deploy gera
// um BUILD_VERSION único (hash do commit + timestamp) injetado pelo
// Vite no build. Assim, TODA atualização publicada aparece na tela,
// mesmo sem bump manual de versão. As patch notes (UPDATE_HISTORY)
// são opcionais — quando não existem notas novas, o popup mostra um
// resumo genérico da atualização.
//
// Para lançar um novo patch com notas: adicione um novo objeto no
// topo de UPDATE_HISTORY e ajuste GAME_VERSION (npm run release).
// ------------------------------------------------------------

export interface UpdateNoteItem {
  title: string;
  description: string;
}

export interface UpdateNoteVersion {
  version: string;
  title: string;
  date: string;
  /** Se true, o jogador NÃO pode adiar — precisa atualizar para continuar. */
  required?: boolean;
  newFeatures: UpdateNoteItem[];
  improvements: UpdateNoteItem[];
  bugFixes: UpdateNoteItem[];
  football?: UpdateNoteItem[];
}

/** Versão do build atual do jogo (a mais recente disponível). */
export const GAME_VERSION = '1.8.8';

/** Versão "instalada" padrão de quem nunca passou por uma atualização. */
const DEFAULT_APPLIED_VERSION = '1.4.2';

/** Histórico completo de versões (mais recente primeiro). */
export const UPDATE_HISTORY: UpdateNoteVersion[] = [
  {
    version: '1.8.8',
    title: 'Atualização 1.8.8',
    date: '17/08/2026',
    required: false,
    newFeatures: [
    ],
    improvements: [
      { title: 'Mecânicas do jogo, Calendário', description: 'scripts/publish.mjs: mecânica' },
    ],
    bugFixes: [
    ],
    football: [
    ],
  },
  {
    version: '1.8.7',
    title: 'Atualização 1.8.7',
    date: '17/08/2026',
    required: false,
    newFeatures: [
    ],
    improvements: [
      { title: 'Mecânicas do jogo', description: 'rc/ui/screens/DashboardScreen.tsx: mecânica' },
    ],
    bugFixes: [
    ],
    football: [
    ],
  },
  {
    version: '1.8.6',
    title: 'Atualização 1.8.6',
    date: '17/08/2026',
    required: false,
    newFeatures: [
      { title: 'Mercado de transferências realista', description: 'Propostas agora são eventos raros e por mérito: a maioria dos dias passa sem nada. O interesse é calculado pelo jogador (OVR relativo à divisão, potencial, idade, desempenho, contrato e pedido de saída).' },
      { title: '👀 Interesse → 📞 Sondagem → 💰 Proposta oficial', description: 'Nem todo interesse vira proposta. Clubes primeiro monitoram, depois sondam e só então fazem proposta oficial — com cooldown de dias entre eventos para cada jogador (fim da enxurrada de propostas).' },
      { title: 'Compradores compatíveis', description: 'O clube interessado agora tem divisão compatível com o jogador, necessidade real de posição e orçamento para pagar. Destaque da Série D atrai clubes de Série C/B; excepcionais, da Série A.' },
    ],
    improvements: [
      { title: 'Card "Fase atual das competições" completo no Painel', description: 'Mostra a liga do usuário (ex.: Série D, com a rodada/fase atual) além da Copa do Brasil e das competições continentais.' },
      { title: 'Clique abre a competição certa', description: 'Ao clicar em uma competição no Painel, a tela de Competições abre exatamente aquela competição (e lembra a seleção entre visitas).' },
      { title: 'Patch notes detalhadas automaticamente', description: 'O sistema de publicação agora gera notas descritivas do que foi implementado em cada atualização, em vez de um resumo genérico.' },
      { title: 'Performance do mercado', description: 'Geração de propostas otimizada em mais de 300× — o avanço de dias/semanas ficou muito mais rápido.' },
    ],
    bugFixes: [
      { title: 'Propostas em excesso na Série D', description: 'Corrigido o sistema que gerava várias propostas em poucos dias para jogadores comuns — agora a frequência respeita a divisão do clube e o valor real do jogador.' },
      { title: 'Competição errada ao clicar no card', description: 'Antes, clicar na Copa do Brasil abria a Série D. Agora cada botão do Painel abre a competição correspondente.' },
    ],
    football: [
    ],
  },
  {
    version: '1.8.5',
    title: 'Atualização 1.8.5',
    date: '17/08/2026',
    required: false,
    newFeatures: [
      { title: 'Mercado de transferências realista', description: 'Propostas agora são eventos raros e por mérito: a maioria dos dias passa sem nada. O interesse é calculado pelo jogador (OVR relativo à divisão, potencial, idade, desempenho, contrato e pedido de saída).' },
      { title: '👀 Interesse → 📞 Sondagem → 💰 Proposta', description: 'Nem todo interesse vira proposta. Clubes primeiro monitoram, depois sondam e só então fazem proposta oficial — com cooldown de dias entre eventos para cada jogador (fim da enxurrada de propostas).' },
      { title: 'Compradores compatíveis', description: 'O clube interessado agora tem divisão compatível com o jogador, necessidade real de posição e orçamento para pagar. Destaque da Série D atrai clubes de Série C/B; excepcionais, da Série A.' },
    ],
    improvements: [
      { title: 'Card "Fase atual das competições" completo', description: 'O Painel agora mostra a liga do usuário (ex.: Série D, com a rodada/fase atual) além da Copa do Brasil e das competições continentais.' },
      { title: 'Clique abre a competição certa', description: 'Ao clicar em uma competição no Painel, a tela de Competições abre exatamente aquela competição (e lembra a seleção entre visitas).' },
      { title: 'Performance do mercado', description: 'Geração de propostas otimizada em mais de 300× — o avanço de dias/semanas ficou muito mais rápido.' },
    ],
    bugFixes: [
      { title: 'Propostas em excesso na Série D', description: 'Corrigido o sistema que gerava várias propostas em poucos dias para jogadores comuns — agora a frequência respeita a divisão do clube e o valor real do jogador.' },
      { title: 'Competição errada ao clicar no card', description: 'Antes, clicar na Copa do Brasil abria a Série D. Agora cada botão abre a competição correspondente.' },
    ],
    football: [
    ],
  },
  {
    version: '1.8.4',
    title: 'Atualização 1.8.4',
    date: '17/08/2026',
    required: false,
    newFeatures: [
    ],
    improvements: [
      { title: 'Atualizações do jogo', description: '' },
    ],
    bugFixes: [
    ],
    football: [
      { title: 'Mostrar fase atual da Copa do Brasil, continental e Série D n…', description: 'Painel: novo bloco "Fase atual das competições" com a fase de cada mata-mata (copa, continental, Série D), incluindo eliminados e campeões. Calendário: badge da fase do mata-mata ao lado de cada…' },
      { title: 'Mostrar a fase atual e alcançada na Série D', description: 'Resumo de fim de temporada: ligas com mata-mata (Série D) agora mostram a fase real alcançada pelo clube ("Eliminado: Oitavas de final", "⬆️ Promovido (Quartas)") em vez de só a posição na tabela.…' },
    ],
  },
  {
    version: '1.8.3',
    title: 'Atualização 1.8.3',
    date: '17/08/2026',
    required: false,
    newFeatures: [
    ],
    improvements: [
      { title: 'Atualizações do jogo', description: '' },
    ],
    bugFixes: [
    ],
    football: [
    ],
  },
  {
    version: '1.8.2',
    title: 'Publicação em um comando',
    date: '17/08/2026',
    required: false,
    newFeatures: [
      { title: 'npm run publish — publica no Vercel com um comando', description: 'Roda release (versão + patch notes automáticas do git log), typecheck, build, commit e push de uma vez. O deploy automático do Vercel cuida do resto.' },
    ],
    improvements: [
    ],
    bugFixes: [
    ],
    football: [
    ],
  },
  {
    version: '1.8.1',
    title: 'Campeonato Brasileiro Série D 2026 completo · correções: Rótulos Casa/',
    date: '17/08/2026',
    required: false,
    newFeatures: [
      { title: 'Campeonato Brasileiro Série D 2026 completo', description: '96 clubes reais da Série D em 16 grupos de 6, com 10 rodadas em ida e volta. Mata-mata de 64 em ida/volta com agregado + pênaltis: 4 vencedores das quartas garantem vaga direta na Série C e os 4 derrotados disputam os playoffs de acesso, somando 6 promovidos para 2027.' },
      { title: 'Sistema real de contratos individuais', description: 'Cada jogador tem contrato próprio com distribuição realista (10/20/25/25/15/5 por ano de vínculo), todos terminando em 30/06 e sem expirados na criação. O perfil mostra o status (🟢 ativo, 🟡 aproximando, 🔴 elegível para pré-contrato) e o mercado só destaca os realmente elegíveis.' },
    ],
    improvements: [
    ],
    bugFixes: [
      { title: 'Rótulos Casa/Fora invertidos', description: 'Os badges descreviam o status do usuário em vez do mando de campo de cada time — quando o usuário jogava fora, seu time aparecia com "🏠 Casa". Agora o badge de cada equipe reflete o mando real (mandante 🏠 Casa, visitante ✈️ Fora) no Painel, no Dia de Jogo e nas Competições.' },
      { title: 'Forma atual mostra "Temporada ainda não começou" quando não h…', description: '' },
    ],
    football: [
    ],
  },
  {
    version: '1.8.0',
    title: 'Recrutamento, pré-contrato, sondagens e elencos',
    date: '17/08/2026',
    required: false,
    newFeatures: [
      { title: 'Conversa de recrutamento com jogador de outro clube', description: 'Ao conversar com um jogador que ainda pertence a outro clube, o popup agora abre um contexto separado: projeto do clube, papel no elenco, salário e interesse na transferência — sem queixas de banco ou promessas de minutos que só fazem sentido para o nosso elenco.' },
      { title: 'Sondagens com a janela de transferências fechada', description: 'O mercado continua vivo fora da janela: faça sondagens, converse com o jogador, monitore e negocie para a próxima janela. Transferência normal só é registrada durante a janela.' },
      { title: 'Pré-contrato por contrato individual', description: 'A opção de pré-contrato só aparece para jogadores realmente elegíveis (contrato terminando em até 6 meses), analisando a data de término de cada contrato.' },
      { title: 'Elencos padronizados de 28 jogadores', description: 'Todos os clubes agora seguem o padrão 3 goleiros, 8 defensores, 8 meio-campistas e 9 atacantes, com hierarquia de titular/rotação/reserva/jovem e força por divisão.' },
    ],
    improvements: [
      { title: 'Ficha do clube com composição do elenco', description: 'Barras de profundidade por posição e avisos de elenco incompleto ou cheio, com dica de empréstimo quando necessário.' },
      { title: 'Aviso de elenco na Central de Transferências', description: 'Banner dinâmico que indica se o elenco está no padrão, cheio (venda/empreste antes de contratar) ou carente de opções.' },
      { title: 'Conversa de recrutamento vinculada à negociação', description: 'As respostas na conversa com jogador de outro clube ajustam o interesse real da negociação em andamento.' },
    ],
    bugFixes: [
      { title: 'Pré-contrato aparecendo para todos os jogadores', description: 'Jogadores com contrato longo (ex.: até 2030) não mostram mais a opção de pré-contrato nem a mensagem de "contrato acabando".' },
      { title: 'Conversa interna abrindo para jogador de outro clube', description: 'Jogadores de outros clubes nunca mais recebem opções de gestão do elenco (banco, minutos, promessas) — sempre o contexto de recrutamento.' },
      { title: 'Renovação podia encurtar o contrato', description: 'Renovar o contrato de um jogador com vínculo longo não reduz mais o tempo restante — a renovação parte do fim atual do contrato.' },
    ],
    football: [
      { title: 'Mercado realista fora da janela', description: 'Sondagem, monitoramento, negociação antecipada e pré-contrato acontecem mesmo com a janela fechada, como no futebol real.' },
    ],
  },
  {
    version: '1.7.1',
    title: 'Conversa com jogador nas transferências e compras',
    date: '16/08/2026',
    required: false,
    newFeatures: [
      {
        title: 'Conversar ao receber proposta de venda',
        description: 'Na aba Propostas da Central de Transferências, cada proposta recebida tem o botão "💬 Conversar" — e o detalhe da proposta também. Abre o mesmo popup de conversa, com humor, personalidade e consequências reais nas suas decisões.',
      },
      {
        title: 'Conversar durante a contratação',
        description: 'Na negociação de compra (inclusive jogadores livres), o botão "💬 Conversar com o jogador" no cabeçalho abre o popup para avaliar interesse, exigências e expectativas antes de fechar o acordo.',
      },
    ],
    improvements: [
      {
        title: 'Um único sistema de conversas',
        description: 'Venda, compra, renovação, mensagens e perfil agora usam o mesmo modal reutilizável — toda conversa fica registrada no histórico do jogador.',
      },
    ],
    bugFixes: [
      {
        title: 'Teste de chegada de contratação estável',
        description: 'A reprovação aleatória nos exames médicos não derruba mais a validação automática do fluxo completo de chegada (viagem → exames → documentação → contrato → registro).',
      },
    ],
    football: [
    ],
  },
  {
    version: '1.7.0',
    title: 'Copa do Brasil com premiação e Oitavas',
    date: '16/08/2026',
    required: false,
    newFeatures: [
      {
        title: 'Premiação da Copa do Brasil',
        description: 'O clube recebe os valores reais de 2026 ao avançar de fase: 1ª R$ 400 mil, cotas A/B na 2ª-4ª fase, Oitavas R$ 3 mi, Quartas R$ 4 mi, Semi R$ 9 mi, vice R$ 34 mi e campeão R$ 78 mi — tudo pago automaticamente ao classificar, sem duplicação.',
      },
      {
        title: 'Oitavas de final no chaveamento',
        description: 'A Copa do Brasil agora tem 8 fases (1ª-4ª, Oitavas, Quartas, Semifinal e Final), com os cabeças de chave entrando ao longo das fases iniciais — como na competição real.',
      },
      {
        title: 'Card de premiação na competição',
        description: 'Na tela da Copa: premiação recebida, prêmio da fase atual, quanto ainda pode ganhar e a projeção de total se for campeão ou vice, com histórico das fases recebidas.',
      },
    ],
    improvements: [
      {
        title: 'Histórico de premiações em Finanças',
        description: 'Cada premiação aparece como transação (competição, fase, valor e data) na tela de Finanças da temporada.',
      },
      {
        title: 'Mensagens de premiação na Central',
        description: 'Ao classificar, o clube recebe uma mensagem na Central de Mensagens com a nova categoria Finanças.',
      },
      {
        title: 'Atualizações automáticas',
        description: 'O popup de atualização aparece sozinho a cada nova publicação do jogo, sem precisar de atualização manual de versão.',
      },
    ],
    bugFixes: [
      {
        title: 'Goleiro no ataque',
        description: '“Melhor time”, “Time descansado”, troca de formação e escalações automáticas nunca mais escalam goleiro em vaga de linha enquanto houver jogador de linha disponível.',
      },
      {
        title: 'Card de premiação com byes',
        description: 'Clubes cabeça de chave (que entram direto na 2ª fase) não são mais marcados como eliminados no card de premiação.',
      },
    ],
    football: [
      {
        title: 'Chaveamento real da Copa',
        description: '80 clubes, 79 partidas e 8 fases — o prêmio de R$ 3 mi das Oitavas de final agora é pago de verdade.',
      },
    ],
  },
  {
    version: '1.6.0',
    title: 'Resumo de Temporada e Navegação',
    date: '17/08/2026',
    required: false,
    newFeatures: [
      {
        title: 'Fase exata por competição no resumo',
        description: 'O fim de temporada agora mostra o avanço real do clube em cada copa e continental (ex.: "Quartas de final", "Oitavas"), calculado pelas partidas disputadas — em vez de "Participou".',
      },
      {
        title: 'Comparação com a temporada anterior',
        description: 'Card no resumo mostrando a evolução do clube entre anos: posição, pontos e gols marcados/sofridos, com indicadores de melhora ou piora.',
      },
    ],
    improvements: [
      {
        title: 'Botão Voltar nas Configurações',
        description: 'Volte para a tela anterior de onde abriu as Configurações (Elenco, Home, Partida…) usando o histórico de navegação.',
      },
      {
        title: 'Evolução do elenco no resumo',
        description: 'Jogadores que mais evoluíram e quedas de rendimento registradas durante a temporada, com overall antes → depois.',
      },
      {
        title: 'Recordes e prêmios da temporada',
        description: 'Recordes quebrados com valores formatados e prêmios individuais por tipo no resumo de fim de temporada.',
      },
    ],
    bugFixes: [],
  },
  {
    version: '1.5.0',
    title: 'Grande Atualização',
    date: '16/08/2026',
    required: false,
    newFeatures: [
      {
        title: 'Aba de Estádio',
        description: 'Aumente a capacidade, defina o preço dos ingressos e acompanhe a satisfação da torcida e as receitas do clube.',
      },
      {
        title: 'Fim de temporada completo',
        description: 'Resumo da temporada com finanças, títulos, prêmios e evolução do elenco — e um botão para iniciar a próxima temporada quando você decidir.',
      },
      {
        title: 'Campeonato Brasileiro Série A',
        description: 'Brasileirão completo integrado ao calendário, classificação, estatísticas, finanças e carreira.',
      },
      {
        title: 'Guerra de propostas',
        description: 'Clubes rivais cobrem suas ofertas no mercado — você decide cobrir, subir o valor ou desistir.',
      },
    ],
    improvements: [
      {
        title: 'Simulação de partidas',
        description: 'Estatísticas e eventos construídos minuto a minuto, com reação ao placar e ao momento da partida.',
      },
      {
        title: 'IA do mercado',
        description: 'Clubes da IA negociam entre si, com grandes transferências, notícias e impacto nas finanças.',
      },
      {
        title: 'Táticas',
        description: 'Monte o melhor time ou o time descansado, arraste jogadores pelo campo e organize as reservas por posição.',
      },
    ],
    bugFixes: [
      {
        title: 'Janela de transferências',
        description: 'Jogadores não chegam mais ao clube com a janela fechada — a validação vale em toda a lógica de transferências.',
      },
      {
        title: 'Tabela e forma recente',
        description: 'A coluna de forma agora mostra o resultado real do clube em todas as competições, igual ao painel de moral.',
      },
      {
        title: 'Cores dos placares',
        description: 'Vitória aparece em verde e derrota em vermelho mesmo jogando fora de casa.',
      },
      {
        title: 'Folha salarial',
        description: 'Renovações, empréstimos e promoções da base agora atualizam corretamente a folha salarial do clube.',
      },
    ],
    football: [
      {
        title: 'Novas regras da Copa do Brasil',
        description: 'Fases de mata-mata nunca mais ficam sem partida marcada — o chaveamento é blindado contra partidas órfãs.',
      },
      {
        title: 'Calendário completo',
        description: 'Partidas da temporada da 1ª à última rodada, com filtros de jogadas e restantes.',
      },
    ],
  },
  {
    version: '1.4.2',
    title: 'Atualização de Correções',
    date: '10/08/2026',
    newFeatures: [],
    improvements: [],
    bugFixes: [
      {
        title: 'Travamentos de temporada',
        description: 'Corrigidas partidas órfãs que prendiam o avanço da temporada e do calendário.',
      },
      {
        title: 'Copa do Brasil',
        description: 'Semifinais e fases futuras nunca mais ficam sem partida marcada.',
      },
      {
        title: 'Fluxo de transferências',
        description: 'Chegada em etapas: viagem, exames médicos, documentação, contrato e registro.',
      },
    ],
  },
  {
    version: '1.4.0',
    title: 'Mercado e Renovações',
    date: '02/08/2026',
    newFeatures: [
      {
        title: 'Renovações de contrato',
        description: 'Converse com jogadores do elenco, negocie salário, bônus e faça promessas.',
      },
      {
        title: 'Promessas',
        description: 'Acompanhe o cumprimento das promessas ao longo da temporada e lide com as consequências.',
      },
      {
        title: 'Destaques do mercado',
        description: 'Ranking das maiores negociações, guerras de propostas e avaliações pós-venda da janela.',
      },
    ],
    improvements: [],
    bugFixes: [],
  },
];

export const LATEST_UPDATE: UpdateNoteVersion = UPDATE_HISTORY[0];

// ------------------------------------------------------------
// Build atual (detecção automática de novas publicações)
// ------------------------------------------------------------
// Cada deploy gera um __BUILD_VERSION__ único injetado pelo Vite no
// momento do build. Quando o build servido muda (nova publicação),
// o popup aparece — sem depender de bump manual de versão.

declare const __BUILD_VERSION__: string;

/** Build exato servido neste momento (muda a cada deploy/publicação). */
export const BUILD_VERSION: string =
  typeof __BUILD_VERSION__ !== 'undefined' && __BUILD_VERSION__
    ? __BUILD_VERSION__
    : 'dev';

/** Identificador curto do build (para exibição). */
export const BUILD_ID: string = BUILD_VERSION.slice(0, 12);

/**
 * Notas exibidas quando a atualização é um build novo sem patch notes
 * dedicadas (o usuário já viu a versão mais recente do UPDATE_HISTORY).
 */
export const GENERIC_BUILD_UPDATE: UpdateNoteVersion = {
  version: 'build',
  title: 'Novas melhorias publicadas',
  date: new Date().toLocaleDateString('pt-BR'),
  newFeatures: [],
  improvements: [
    {
      title: 'Atualização automática',
      description: 'O jogo agora detecta automaticamente cada nova publicação e avisa você assim que ela fica disponível.',
    },
    {
      title: 'Melhorias e correções',
      description: 'Este build traz as novidades, melhorias e correções publicadas recentemente no FootballSim.',
    },
  ],
  bugFixes: [],
};

/** O usuário ainda não viu as patch notes da versão mais recente? */
export function hasUnseenPatchNotes(): boolean {
  return compareVersions(appliedVersion(), LATEST_UPDATE.version) < 0;
}

// ------------------------------------------------------------
// Controle de versão salvo no navegador
// ------------------------------------------------------------

interface UpdateState {
  /** Versão que o usuário tem "instalada" (aplicada). */
  appliedVersion: string;
  /** Última versão cujo popup automático já foi visto/fechado. */
  viewedVersion: string;
  /** Build em que o popup já foi visto/adiado (evita reabrir no mesmo build). */
  viewedBuild: string;
  /** Build que o usuário tem instalado. */
  appliedBuild: string;
}

const STORAGE_KEY = 'footballsim_update_state';

function readState(): UpdateState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UpdateState>;
      return {
        appliedVersion: parsed.appliedVersion || DEFAULT_APPLIED_VERSION,
        viewedVersion: parsed.viewedVersion || '',
        viewedBuild: parsed.viewedBuild || '',
        appliedBuild: parsed.appliedBuild || '',
      };
    }
  } catch {
    /* localStorage indisponível — usa padrões */
  }
  return {
    appliedVersion: DEFAULT_APPLIED_VERSION,
    viewedVersion: '',
    viewedBuild: '',
    appliedBuild: '',
  };
}

function writeState(state: UpdateState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Compara versões x.y.z — retorna <0, 0 ou >0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Versão que o usuário tem instalada no momento. */
export function appliedVersion(): string {
  return readState().appliedVersion;
}

/**
 * Existe uma versão mais nova que a instalada? (indicador no menu)
 * Dispara por versão mais nova OU por build novo publicado.
 */
export function isUpdateAvailable(): boolean {
  const s = readState();
  const versionBehind = compareVersions(s.appliedVersion, LATEST_UPDATE.version) < 0;
  const buildBehind = s.appliedBuild !== '' && s.appliedBuild !== BUILD_VERSION;
  return versionBehind || buildBehind;
}

/**
 * O popup automático deve aparecer? (uma vez por versão/build, até aplicar).
 * Comportamento: aparece em TODA publicação nova — quando o build servido
 * mudou e ainda não foi visto nem aplicado por este navegador.
 */
export function shouldShowUpdatePopup(): boolean {
  const s = readState();
  const versionUnseen =
    compareVersions(s.appliedVersion, LATEST_UPDATE.version) < 0 &&
    compareVersions(s.viewedVersion, LATEST_UPDATE.version) < 0;
  const buildUnseen = s.appliedBuild !== BUILD_VERSION && s.viewedBuild !== BUILD_VERSION;
  return versionUnseen || buildUnseen;
}

/** Botão "Depois" — marca como vista para não reabrir no mesmo build (o indicador no menu continua). */
export function dismissUpdatePopup(): void {
  const s = readState();
  writeState({ ...s, viewedVersion: LATEST_UPDATE.version, viewedBuild: BUILD_VERSION });
}

/** Conclui a atualização — marca a versão e o build como instalados. */
export function markUpdateApplied(): void {
  writeState({
    appliedVersion: LATEST_UPDATE.version,
    viewedVersion: LATEST_UPDATE.version,
    viewedBuild: BUILD_VERSION,
    appliedBuild: BUILD_VERSION,
  });
}

// ------------------------------------------------------------
// Abrir o popup de qualquer tela (menu lateral / configurações)
// ------------------------------------------------------------

export const OPEN_UPDATE_EVENT = 'footballsim:open-update';

export function openUpdateModal(): void {
  window.dispatchEvent(new CustomEvent(OPEN_UPDATE_EVENT, { detail: { view: 'intro' } }));
}

export function openUpdateHistory(): void {
  window.dispatchEvent(new CustomEvent(OPEN_UPDATE_EVENT, { detail: { view: 'history' } }));
}
