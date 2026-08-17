#!/usr/bin/env node
// ------------------------------------------------------------
// npm run release — lança uma nova versão do FootballSim
// ------------------------------------------------------------
// O que faz:
//   1. Sobe a versão do jogo (GAME_VERSION em src/game/updateNotes.ts)
//   2. Gera as patch notes AUTOMATICAMENTE a partir do git log desde a
//      última release (categoriza cada commit em NOVO / MELHORIAS /
//      CORREÇÕES / FUTEBOL) — sem precisar escrever nada à mão
//   3. Atualiza a versão no manifest do PWA (public/manifest.webmanifest)
//
// Depois que a nova versão for publicada (commit + push → Vercel),
// o popup "🚀 Nova atualização" aparece automaticamente para quem
// tem uma versão antiga instalada no navegador — com as notas.
//
// Uso:
//   npm run release                    # gera notas automáticas do git log
//   npm run release -- 1.9.0           # versão direta + notas automáticas
//   npm run release -- 1.9.0 "Título"  # versão + título + notas automáticas
// ------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
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

/** Constrói um item de nota: { title: '...', description: '...' }. */
function noteItem(title, description) {
  const desc = description || '';
  return `      { title: '${esc(title)}', description: '${esc(desc)}' },`;
}

/** Constrói o objeto da nova versão para inserir no topo de UPDATE_HISTORY. */
function buildEntry(version, title, date, notes) {
  const parts = [`  {`, `    version: '${esc(version)}',`, `    title: '${esc(title)}',`, `    date: '${date}',`, `    required: false,`];
  for (const cat of CATEGORIES) {
    parts.push(`    ${cat.key}: [`);
    for (const { title: t, description } of notes[cat.key]) parts.push(noteItem(t, description));
    parts.push(`    ],`);
  }
  parts.push(`  },`);
  return parts.join('\n');
}

// ------------------------------------------------------------
// Geração automática de patch notes a partir do git log
// ------------------------------------------------------------

/** Executa um comando e devolve a saída (sem erro). */
function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Último commit antes de HEAD que tocou updateNotes.ts (a "última release"). */
function lastReleaseCommit() {
  const hash = git(`log -1 --format=%H -- src/game/updateNotes.ts HEAD~1`);
  return hash || '';
}

/**
 * Lê os commits desde a última release e gera as notas categorizadas.
 * Cada commit vira um item em uma das 4 categorias, usando palavras-chave.
 */
function generateNotesFromGit() {
  const empty = () => ({ newFeatures: [], improvements: [], bugFixes: [], football: [] });
  const since = lastReleaseCommit();
  if (!since) {
    console.log('ℹ️  Não encontrei a última release no git — usando notas vazias.');
    return empty();
  }
  const log = git(`log --format=%H%x00%s%x00%b%x1f ${since}..HEAD`);
  if (!log) {
    console.log('ℹ️  Nenhum commit novo desde a última release — usando notas vazias.');
    return empty();
  }
  const notes = empty();
  const seen = new Set();
  for (const block of log.split('\x1f')) {
    const [hash, subject, body] = block.split('\x00');
    if (!hash || !subject) continue;
    const s = subject.trim();
    // ignora commits de release e geração automática
    if (/^Release\s/i.test(s) || /^Merge\b/i.test(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);

    const lower = s.toLowerCase();
    // remove prefixos de ação ("Implementar", "Adiciona", "Corrigir"...) para o título ficar legível
    let clean = s
      .replace(/^[A-Za-zÀ-ú]+:\s*/, '')
      .replace(/^\((fix|feat|refactor|chore)\)\s*/, '')
      .replace(/^(implementar|implementa|adiciona|adicionar|adicionado|corrigir|corrige|corrigido|correção de|correcao de|criar|cria|criado|sistema de|novo sistema de|melhora|melhorar|melhorado|otimiza|otimizar|ajusta|ajustar|refatora|refatorar|reforça|reforca|blinda|trata|permite|passa a|agora|inclui|incluir|adicionamos|implementamos|melhoramos|corrigimos)\s+/i, '');
    // corta em dois-pontos / parênteses / " para" e limita o tamanho
    clean = clean.split(':')[0].split('(')[0].split(' para ')[0].trim();
    if (clean.length > 64) clean = clean.slice(0, 61).trimEnd() + '…';
    let title = clean.replace(/\.+$/, '').trim();
    if (!title) continue;
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // descrição: primeiro parágrafo do corpo (sem o rodapé do Codebuff)
    let description = '';
    if (body) {
      const lines = body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^🤖/.test(l) && !/^Co-Authored/.test(l));
      if (lines.length > 0 && !/^-/.test(lines[0])) {
        description = lines[0];
      } else if (lines.length > 0) {
        description = lines.join(' ').slice(0, 180);
      }
    }

    // classificação por palavras-chave (prioridade: correção > novo > melhoria)
    const isBug = /corrig|correção|correcao|fix|bug|erro|quebra|trava|arrum|consert|repar|ajuste de bug|invertid|duplicad|mostrava|aparecia|sem partidas|não cont|nao cont|não há|nao ha/.test(lower);
    const isFeature = /adicion|implement|novo|nova|criar|cria |sistema|suporte|botão|botao|tela|modal|popup|aba |completo|formato|premia|mata-mata|campeonato|conversa|mercado|pré-contrato|pre-contrato|sondag|estádio|estadio|elencos|contratos|carreira|salvar|tática|tatica|melhor time|reserva|pwa|offline|release|script/.test(lower);
    const isFootball = /futebol|copa|liga|campeonato|série|serie|brasileir|transfer|mercado|elenc|jogador|estádio|estadio|gol|partida|tabela|rodada|chave|premia|acesso|clube|carreira/.test(lower);
    const isImprovement = /melhor|otimiz|aprimor|refin|polimento|visual|ui\b|ux\b|velocidade|desempenho|performance|ajusta|balance|reforça|reforca|blind|trata|permite|aparece|agora|fluxo|exibi/.test(lower);

    let cat = 'improvements';
    if (isBug && !isFeature) cat = 'bugFixes';
    else if (isFeature) cat = 'newFeatures';
    else if (isImprovement) cat = 'improvements';
    else if (isFootball) cat = 'football';
    notes[cat].push({ title, description });
  }
  return notes;
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
let notes = generateNotesFromGit();
const noteCount = Object.values(notes).reduce((s, arr) => s + arr.length, 0);
console.log(`📝 Notas geradas automaticamente do git log: ${noteCount} commit(s) categorizados.`);

if (isTTY) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    if (!version) {
      const def = bumpPatch(current);
      version = (await rl.question(`Nova versão (Enter = ${def}): `)).trim() || def;
    }
    if (!title) {
      title = (await rl.question('Título da atualização (Enter = automático): ')).trim();
    }
    const ok = await rl.question('Usar as notas geradas automaticamente? [S/n] ');
    if (ok.trim().toLowerCase() === 'n') {
      notes = { newFeatures: [], improvements: [], bugFixes: [], football: [] };
      console.log('ℹ️  Notas vazias — você pode editá-las em src/game/updateNotes.ts depois.');
    }
  } finally {
    rl.close();
  }
} else if (!version) {
  version = bumpPatch(current);
  console.log(`ℹ️  Modo não-interativo: usando ${version}.`);
}

if (!title) {
  const feats = notes.newFeatures.map((n) => n.title);
  const fixes = notes.bugFixes.map((n) => n.title);
  const parts = [];
  if (feats.length > 0) parts.push(feats[0]);
  if (fixes.length > 0) parts.push(`correções: ${fixes.slice(0, 2).join(' e ')}`);
  title = parts.length > 0 ? parts.join(' · ').slice(0, 70) : `Atualização ${version}`;
}
version = version.trim();
title = title.trim();

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
    /export const UPDATE_HISTORY: UpdateNoteVersion\[\] = \[(\r?\n)/,
    `export const UPDATE_HISTORY: UpdateNoteVersion[] = [$1${entry}\n`
  );
if (newNotes === notesSrc) {
  console.error('❌ Não consegui atualizar src/game/updateNotes.ts (padrão não encontrado).');
  process.exit(1);
}
if (newNotes === notesSrc.replace(/export const GAME_VERSION = '[^']+'/, `export const GAME_VERSION = '${version}'`)) {
  console.error('❌ Não consegui inserir as notas no histórico (padrão UPDATE_HISTORY não encontrado).');
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
console.log('\n──────────────────────────────────────────────');
console.log(`🎉 Release ${version} — "${title}" (${date})`);
for (const cat of CATEGORIES) {
  if (notes[cat.key].length > 0) {
    console.log(`   ${cat.emoji} ${cat.label}:`);
    for (const n of notes[cat.key]) console.log(`      • ${n.title}`);
  }
}
console.log('\n💡 Para completar:');
console.log('   1. Commit e push para o Vercel publicar:');
console.log('      git add src/game/updateNotes.ts public/manifest.webmanifest');
console.log('      git commit -m "Release ' + version + ' — ' + title + '"');
console.log('      git push origin main');
console.log('   2. Quem tiver uma versão antiga verá o popup 🚀 Nova atualização automaticamente, já com as notas.');
