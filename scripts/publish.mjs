#!/usr/bin/env node
// ------------------------------------------------------------
// npm run publish — publica uma nova versão no Vercel com UM comando
// ------------------------------------------------------------
// Fluxo completo:
//   1. Verifica o estado do git (branch main, mudanças pendentes)
//   2. Commita as mudanças pendentes do jogo (se houver)
//   3. Roda o release: bump de versão + patch notes automáticas do git log
//   4. Typecheck + build (se falhar, para antes de commitar a release)
//   5. Commita os arquivos da release (updateNotes.ts + manifest)
//   6. Push para origin main → deploy automático do Vercel
//
// Uso:
//   npm run publish                        # bump patch automático
//   npm run publish -- 1.9.0               # versão específica
//   npm run publish -- 1.9.0 "Título"      # versão + título
// ------------------------------------------------------------

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...opts }).trim();
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

console.log('🚀 Publicando FootballSim no Vercel…\n');

// ------------------------------------------------------------
// 1. Verificações de estado
// ------------------------------------------------------------
const NO_PUSH = process.argv.includes('--no-push');
const branch = sh('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') die(`Você está na branch "${branch}" — publique a partir da main.`);

const porcelain = sh('git status --porcelain');
const pending = porcelain.split('\n').filter(Boolean);

// ------------------------------------------------------------
// 2. Commit das mudanças pendentes do jogo (se houver)
// ------------------------------------------------------------
// Mapa arquivo → recurso, para gerar uma mensagem de commit descritiva que
// vira patch notes reais (o release lê subject + body do git log).
const FILE_FEATURES = {
  'src/game/negotiation.ts': 'Mercado de transferências',
  'src/game/transfers.ts': 'Mercado de transferências',
  'src/game/preContracts.ts': 'Pré-contratos',
  'src/game/messages.ts': 'Mensagens e notificações',
  'src/game/playerTalks.ts': 'Conversas com jogadores',
  'src/game/season.ts': 'Fim de temporada e promoções',
  'src/game/economy.ts': 'Finanças e objetivos da diretoria',
  'src/game/finances.ts': 'Finanças do clube',
  'src/game/worldgen.ts': 'Geração do mundo e elencos',
  'src/game/competitions.ts': 'Competições e fases',
  'src/game/sim.ts': 'Simulação de partidas',
  'src/game/career.ts': 'Carreira e diretoria',
  'src/game/contracts.ts': 'Contratos de jogadores',
  'src/game/overall.ts': 'Atributos e valores de jogadores',
  'src/ui/screens/DashboardScreen.tsx': 'Painel principal',
  'src/ui/screens/CompetitionsScreen.tsx': 'Tela de Competições',
  'src/ui/screens/SeasonEndScreen.tsx': 'Resumo de fim de temporada',
  'src/ui/screens/CalendarScreen.tsx': 'Calendário',
  'src/ui/screens/TransfersScreen.tsx': 'Mercado de transferências',
  'src/ui/screens/FinancesScreen.tsx': 'Finanças',
  'src/ui/screens/MessagesScreen.tsx': 'Central de mensagens',
  'src/ui/screens/PlayerScreen.tsx': 'Ficha do jogador',
  'src/ui/PlayerConversationModal.tsx': 'Conversas com jogadores',
  'src/ui/UpdateModal.tsx': 'Popup de atualização',
  'src/lib/types.ts': 'Dados e estrutura do jogo',
  'src/lib/db.ts': 'Saves e migração',
  'src/App.tsx': 'Navegação do jogo',
  'src/ui/Shell.tsx': 'Navegação do jogo',
  'scripts/publish.mjs': 'Sistema de publicação',
  'scripts/release.mjs': 'Sistema de publicação',
  'package.json': 'Sistema de publicação',
};
const releaseFiles = ['src/game/updateNotes.ts', 'public/manifest.webmanifest'];
const featurePending = pending.filter((p) => !releaseFiles.some((f) => p.includes(f)));
if (featurePending.length > 0) {
  // formato porcelain "XY path" pode variar (com/sem espaço inicial) e ter \r no Windows
  const paths = featurePending.map((p) => p.replace(/\r/g, '').trim().split(/\s+/).pop());
  const features = [...new Set(paths.map((p) => FILE_FEATURES[p] ?? 'Mecânicas do jogo').filter(Boolean))];
  const subject = `Atualizações: ${features.join(', ')}`;
  const body = paths.map((p) => `- ${p}: ${FILE_FEATURES[p] ?? 'mecânica'}`).join('\n');
  console.log(`📝 Commitando mudanças pendentes (${featurePending.length} arquivo(s))…`);
  sh(`git add -A`);
  sh(`git commit -m "${subject.replace(/"/g, '\\"')}" -m "${body.replace(/"/g, '\\"')}"`);
  console.log(`   ✔ ${subject}`);
} else {
  console.log('ℹ️  Nenhuma mudança de jogo pendente — só a release será publicada.');
}

// ------------------------------------------------------------
// 3. Release (bump + patch notes automáticas)
// ------------------------------------------------------------
const args = process.argv.slice(2).filter((a) => a !== '--auto' && a !== '--no-push');
console.log('\n📦 Rodando release…');
try {
  execSync(`node scripts/release.mjs --auto ${args.map((a) => `"${a}"`).join(' ')}`, {
    cwd: root,
    stdio: 'inherit',
  });
} catch {
  die('O release falhou — nada foi publicado.');
}

const notesSrc = readFileSync(join(root, 'src', 'game', 'updateNotes.ts'), 'utf8');
const version = notesSrc.match(/export const GAME_VERSION = '([^']+)'/)?.[1] || '?';
console.log(`   ✔ Versão: ${version}`);

// ------------------------------------------------------------
// 4. Typecheck + build
// ------------------------------------------------------------
console.log('\n🔨 Verificando typecheck e build…');
try {
  sh('npm run typecheck');
  sh('npm run build');
  console.log('   ✔ Typecheck e build OK');
} catch {
  die('Typecheck/build falharam — não vou publicar uma versão quebrada.');
}

// ------------------------------------------------------------
// 5. Commit dos arquivos da release
// ------------------------------------------------------------
console.log('\n📝 Commitando a release…');
const title = notesSrc.match(/version: '[^']+',\s*\n\s*title: '([^']+)'/)?.[1] || `Atualização ${version}`;
const relMsg = `Release ${version} — ${title}`;
try {
  sh(`git add src/game/updateNotes.ts public/manifest.webmanifest`);
  sh(`git commit -m "${relMsg.replace(/"/g, '\\"')}"`);
  console.log(`   ✔ ${relMsg}`);
} catch {
  console.log('   ℹ️  Nada novo para commitar na release (já estava pronto).');
}

// ------------------------------------------------------------
// 6. Push
// ------------------------------------------------------------
if (NO_PUSH) {
  console.log('\n🔒 --no-push: release commitada localmente, PUSH PULADO (teste).');
  console.log('   Para publicar de verdade, rode: npm run publish');
} else {
  console.log('\n📡 Enviando para o GitHub (deploy automático do Vercel)…');
  sh('git push origin main');
  console.log('   ✔ Push concluído');
}

console.log('\n🎉 Publicado! O Vercel vai gerar o deploy automático.');
console.log('   Quem abrir o jogo com versão antiga verá o popup 🚀 com as patch notes.');
console.log(`   Para conferir o deploy: vercel ls footballsim`);
