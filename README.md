# FootballSim ⚽

Um simulador de futebol web completo e profundo, no espírito de *Football Manager* e *FootSim*, com identidade própria. Você cria um treinador, assume um clube, monta elenco e tática, negocia transferências, acompanha partidas simuladas em tempo real e conduz uma carreira por dezenas de temporadas — enquanto o mundo continua vivo mesmo quando você não está jogando.

**100% jogável sem backend:** sem configuração, o jogo roda inteiro no navegador (mundo gerado por seed + persistência em IndexedDB). Com Supabase configurado, ganha autenticação real, contas e carreiras sincronizadas com RLS.

---

## 🚀 Rodando

```bash
npm install
npm run dev        # desenvolvimento (http://localhost:5173)
npm run typecheck  # checagem de tipos
npm run build      # build de produção
npm run smoke      # smoke test headless do fluxo completo (mundo → 3 temporadas)
```

### Supabase (opcional)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Execute a migração `supabase/migrations/0001_init.sql` no SQL Editor.
3. Copie `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (a anon key é pública por design — a segurança vem do RLS, nunca de segredos no frontend).
4. Reinicie o dev server.

Sem as variáveis, o jogo usa o **modo demo**: autenticação simulada e saves locais.

---

## 🏗️ Arquitetura

Separação estrita em camadas, para escalar a milhares de jogadores, centenas de clubes e temporadas ilimitadas:

```
src/
├── lib/        # UTILITIES — tipos do jogo, RNG determinístico, datas, formatadores
├── game/       # GAME LOGIC — todo o motor, puro e testável (sem React)
│   ├── overall.ts      # cálculo de overall com pesos por posição
│   ├── worldgen.ts     # geração do universo (países, clubes, jogadores, calendário)
│   ├── matchEngine.ts  # motor de partidas determinístico (seed por partida)
│   ├── competitions.ts # ligas (tabela, promoção/rebaixamento) e copas (mata-mata)
│   ├── finances.ts     # receitas, despesas, folha salarial
│   ├── development.ts  # evolução de atributos, forma, moral, lesões
│   ├── transfers.ts    # mercado, propostas, contrapropostas, empréstimos
│   ├── ai.ts           # IA dos clubes (escalações, contratações, demissões)
│   ├── news.ts         # geração automática de notícias a partir de eventos reais
│   ├── season.ts       # ciclo de temporada (prêmios, aposentadorias, novo ano)
│   ├── sim.ts          # loop do mundo — avança dias e processa tudo
│   └── career.ts       # treinador, diretoria, conquistas, ofertas de emprego
├── state/      # estado global React (store conectando UI ↔ lógica)
├── ui/         # UI — componentes reutilizáveis + telas
├── lib/auth.ts # AUTH — Supabase Auth com fallback demo
└── lib/db.ts   # DATABASE — adaptador IndexedDB ↔ Supabase
```

**Regra central:** toda a lógica do jogo vive em `src/game/` como funções puras que recebem um `World` (o estado serializável inteiro) e retornam um novo `World`. A UI apenas dispara e renderiza. Isso torna o motor 100% testável headless (`scripts/smoke.ts` roda 3 temporadas completas sem navegador), determinístico quando desejado e fácil de migrar para server-side no futuro.

### O `World`

Um único objeto contém tudo: países, clubes, jogadores, competições, partidas, finanças, notícias, histórico. O save é o `World` + o `Career` (treinador, clube, flags) serializados. Em Supabase, vai como JSONB em `public.careers` — um save = uma linha, transacional por construção, com RLS por usuário.

---

## 🎮 Sistemas principais

| Sistema | O que faz |
|---|---|
| **Treinador** | Perfil com nome, nacionalidade, licença, estilo e 6 atributos evolutivos (tática, desenvolvimento, motivação, gestão, scouting, negociação). |
| **Clubes** | Inglaterra, Alemanha, Espanha e Itália × 3 divisões × 20 clubes (240 no total) com estádio, torcida, orçamento, infraestrutura, folha salarial, objetivos por nível (gigante → amador). |
| **Jogadores** | ~6.000 com atributos por posição (GK/defesa/meio/ataque), overall ponderado, potencial, personalidade (líder, profissional, mercenário…), moral, forma, condição, contrato, valor. |
| **Elenco** | Tabela completa com filtros, ordenação, escalação (formações clássicas + custom), instruções individuais. |
| **Motor de partidas** | Determinístico por seed. Resultado depende de overall, atributos, tática, moral, forma, condição, mando, treinador, fadiga, importância, suspensões e lesões. Gera eventos (gol, cartões, lesões, substituições, pênaltis…), stats (posse, finalizações, xG, passes) e notas individuais. |
| **Partida ao vivo** | Placar, tempo, stats, timeline, velocidade 1x–8x, pausa, finalização imediata. |
| **Calendário** | Dias avançáveis (dia / semana / próxima partida) com verificação de eventos, treinos, janelas de transferência e datas de jogos. |
| **Competições** | Ligas com tabela, artilharia e promoção/rebaixamento; copas nacionais e torneio continental em mata-mata com ida e volta, prorrogação e pênaltis. |
| **Transferências** | Busca com filtros, proposta, contraproposta, recusa, empréstimo, renovação, liberação. Preço derivado de valor, idade, potencial, contrato e reputação. |
| **Finanças** | Receitas (bilheteria, TV, patrocínio, prêmios, vendas) × despesas (salários, manutenção, comissão) com histórico mensal e gráfico. |
| **Treinamento** | Tipos (físico, ataque, defesa, passe, finalização, posse, tática, recuperação) influenciando forma, condição, fadiga e desenvolvimento. |
| **Evolução** | Jovens evoluem conforme minutos, treino, instalações e personalidade; veteranos declinam. Potencial não garante o teto. |
| **IA dos clubes** | Todos os clubes escalam, contratam, vendem, renovam, demitem e contratam treinadores conforme seus objetivos — o mercado acontece mesmo sem você. |
| **Diretoria** | Avalia resultados vs. objetivos: pressão, ultimato e demissão. Outros clubes podem oferecer emprego. |
| **Notícias** | Feed gerado automaticamente a partir de eventos reais: contratações, lesões, títulos, recordes, demissões. |
| **Temporadas** | Ciclo completo: finalizar competições → prêmios → reputação → evolução → aposentadorias → nova geração de jovens → calendário novo. Rótulo correto (2026/27, 2027/28…). |
| **Conquistas** | Primeiro título, campeão nacional/continental, invicto, tríplice coroa, 10/20 temporadas, etc. |

---

## 🔐 Segurança (Supabase)

- **RLS em todas as tabelas.** `careers` e `profiles` só permitem acesso quando `auth.uid() = user_id`. O mundo de um jogador é invisível para os demais.
- A anon key exposta no frontend é segura **porque** o servidor nunca confia nela sem RLS.
- Nenhuma chave secreta no cliente. Operações administrativas futuras (seed global, moderação) devem usar o service role apenas em edge functions.
- A migração inclui índices (`user_id`, `updated_at`) para listagem eficiente de carreiras.

## 🧪 Testes

```bash
npm run typecheck   # zero erros de tipo
npm run smoke       # valida: geração → partidas → transferências → lesões →
                    # notícias → 3 temporadas completas → economia estável
```

O smoke test simula centenas de partidas e o rollover de três temporadas, verificando invariantes: elencos nunca vazios, tabelas com 20 clubes, saldos financeiros estáveis, calendários sem conflito de datas e rótulos de temporada corretos.

---

## 🔮 Evolução futura

- **Dados reais via API:** o gerador de mundo é a única fonte de dados fictícios; basta um adaptador para injetar dados reais mantendo o mesmo schema.
- **Seleções nacionais:** a arquitetura de competições já suporta torneios continentais.
- **Expansão de estádio, Hall da Fama e recordes globais** — o histórico já é persistido por temporada.
- **Server-side determinístico:** como o motor é puro, pode ser movido para edge functions para simulação multijogador/anti-cheat.

## Deploy

Publicado no Vercel com deploy automático a partir da branch `main` (repositório [Mussiiin/footballsim](https://github.com/Mussiiin/footballsim)).
