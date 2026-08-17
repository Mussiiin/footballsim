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
const releaseFiles = ['src/game/updateNotes.ts', 'public/manifest.webmanifest'];
const featurePending = pending.filter((p) => !releaseFiles.some((f) => p.includes(f)));
if (featurePending.length > 0) {
  const files = featurePending.map((p) => p.slice(3).split(' ')[0]).slice(0, 5).join(', ');
  const msg = `Atualizações do jogo: ${files}${featurePending.length > 5 ? ' e mais' : ''}`;
  console.log(`📝 Commitando mudanças pendentes (${featurePending.length} arquivo(s))…`);
  sh(`git add -A`);
  sh(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
  console.log(`   ✔ ${msg}`);
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
