#!/usr/bin/env node
// ------------------------------------------------------------
// npm run release — lança uma nova versão do FootballSim
// ------------------------------------------------------------
// O que faz:
//   1. Sobe a versão do jogo (GAME_VERSION em src/game/updateNotes.ts)
//   2. Cria o registro de patch notes da nova versão com a data de hoje
//   3. Atualiza a versão no manifest do PWA (public/manifest.webmanifest)
//
// Depois que a nova versão for publicada (commit + push → Vercel),
// o popup "🚀 Nova atualização" aparece automaticamente para quem
// tem uma versão antiga instalada no navegador.
//
// Uso:
//   npm run release                    # interativo (pergunta tudo)
//   npm run release -- 1.7.0           # versão direta (resto interativo)
//   npm run release -- 1.7.0 "Título"  # versão + título (notas em branco)
// ------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const isTTY = Boolean(stdin.isTTY);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOTES_PATH = join(root, 'src', 'game', 'updateNotes.ts');
const MANIFEST_PATH = join(root, 'public', 'manifest.webmanifest');

const CATEGORIES = [
  { key: 'newFeatures', emoji: '✨', label: 'NOVO' },
  { key: 'improvements', emoji: '🔧', label: 'MELHORIAS' },
  { key: 'bugFixes', emoji: '🐛', label: 'CORREÇÕES' },
  { key: 'football', emoji: '⚽', label: 'FUTEBOL' },
];

function todayBR() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function bumpPatch(v) {
  const [a, b, c] = v.split('.').map(Number);
  return `${a}.${b}.${c + 1}`;
}

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Constrói um item de nota: { title: '...', description: '' }. */
function noteItem(title) {
  return `      { title: '${esc(title)}', description: '' },`;
}

/** Constrói o objeto da nova versão para inserir no topo de UPDATE_HISTORY. */
function buildEntry(version, title, date, notes) {
  const parts = [`  {`, `    version: '${esc(version)}',`, `    title: '${esc(title)}',`, `    date: '${date}',`, `    required: false,`];
  for (const cat of CATEGORIES) {
    parts.push(`    ${cat.key}: [`);
    for (const t of notes[cat.key]) parts.push(noteItem(t));
    parts.push(`    ],`);
  }
  parts.push(`  },`);
  return parts.join('\n');
}

async function askNotes(rl, cat) {
  const items = [];
  console.log(`\n${cat.emoji} ${cat.label} — uma nota por linha (linha em branco para terminar):`);
  for (;;) {
    const line = (await rl.question('  > ')).trim();
    if (!line) break;
    items.push(line);
  }
  return items;
}

// ------------------------------------------------------------
// Leitura do estado atual
// ------------------------------------------------------------
const notesSrc = readFileSync(NOTES_PATH, 'utf8');
const current = notesSrc.match(/export const GAME_VERSION = '([^']+)'/)?.[1];
if (!current) {
  console.error('❌ Não encontrei GAME_VERSION em src/game/updateNotes.ts');
  process.exit(1);
}
const date = todayBR();
console.log(`🚀 Release FootballSim — versão atual: ${current}`);
console.log(`📅 Data de hoje: ${date}`);

const args = process.argv.slice(2);
let version = args[0]?.trim();
let title = args[1]?.trim();
const notes = { newFeatures: [], improvements: [], bugFixes: [], football: [] };

if (isTTY) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    if (!version) {
      const def = bumpPatch(current);
      version = (await rl.question(`Nova versão (Enter = ${def}): `)).trim() || def;
    }
    if (!title) {
      title = (await rl.question('Título da atualização (Enter = "Atualização X.Y.Z"): ')).trim();
    }
    for (const cat of CATEGORIES) {
      notes[cat.key] = await askNotes(rl, cat);
    }
  } finally {
    rl.close();
  }
} else if (!version) {
  version = bumpPatch(current);
  console.log(`ℹ️  Modo não-interativo: usando ${version}. Para notas interativas, rode num terminal.`);
}

version = version.trim();
title = (title || `Atualização ${version}`).trim();

const [a, b, c] = version.split('.').map(Number);
const [ca, cb, cc] = current.split('.').map(Number);
const cmp = (a - ca) * 100 + (b - cb) * 10 + (c - cc);
if (cmp <= 0) {
  console.error(`❌ A nova versão (${version}) deve ser maior que a atual (${current}).`);
  process.exit(1);
}

// ------------------------------------------------------------
// Atualiza src/game/updateNotes.ts
// ------------------------------------------------------------
const entry = buildEntry(version, title, date, notes);
const newNotes = notesSrc
  .replace(/export const GAME_VERSION = '[^']+'/, `export const GAME_VERSION = '${version}'`)
  .replace(
    /export const UPDATE_HISTORY: UpdateNoteVersion\[\] = \[\n/,
    `export const UPDATE_HISTORY: UpdateNoteVersion[] = [\n${entry}\n`
  );
if (newNotes === notesSrc) {
  console.error('❌ Não consegui atualizar src/game/updateNotes.ts (padrão não encontrado).');
  process.exit(1);
}
writeFileSync(NOTES_PATH, newNotes);
console.log(`✅ src/game/updateNotes.ts — GAME_VERSION = ${version} + patch notes (${date})`);

// ------------------------------------------------------------
// Atualiza public/manifest.webmanifest
// ------------------------------------------------------------
let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
} catch {
  console.error('❌ Não consegui ler public/manifest.webmanifest.');
  process.exit(1);
}
manifest.version = version;
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✅ public/manifest.webmanifest — version = ${version}`);

// ------------------------------------------------------------
// Resumo final
// ------------------------------------------------------------
const noteCount = CATEGORIES.reduce((s, cat) => s + notes[cat.key].length, 0);
console.log('\n──────────────────────────────────────────────');
console.log(`🎉 Release ${version} — "${title}" (${date})`);
console.log(`   ${noteCount} nota(s) registrada(s):`);
for (const cat of CATEGORIES) {
  if (notes[cat.key].length > 0) {
    console.log(`   ${cat.emoji} ${cat.label}:`);
    for (const t of notes[cat.key]) console.log(`      • ${t}`);
  }
}
console.log('\n💡 Para completar:');
console.log('   1. Edite src/game/updateNotes.ts para escrever as descrições das notas (campo description).');
console.log('   2. Commit e push para o Vercel publicar:');
console.log('      git add src/game/updateNotes.ts public/manifest.webmanifest');
console.log('      git commit -m "Release ' + version + ' — ' + title + '"');
console.log('      git push origin main');
console.log('   3. Quem tiver uma versão antiga verá o popup 🚀 Nova atualização automaticamente.');
