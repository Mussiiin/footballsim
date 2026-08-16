// Gera os ícones PWA do FootballSim (PNG) sem dependências externas.
// Identidade do app: gradiente verde (#3ddc84) → azul, escudo com faixas,
// bola de futebol estilizada e detalhes dourados (#f5b942).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- PNG encoder mínimo ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const encodePNG = (w, h, rgba) => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};

// ---- desenho ----
const draw = (size, maskable = false) => {
  const px = Buffer.alloc(size * size * 4);
  const blend = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255;
    px[i] = Math.round(px[i] * (1 - na) + r * na);
    px[i + 1] = Math.round(px[i + 1] * (1 - na) + g * na);
    px[i + 2] = Math.round(px[i + 2] * (1 - na) + b * na);
    px[i + 3] = 255;
  };
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const S = size;

  // fundo: gradiente diagonal verde (#3ddc84) → azul (#38bdf8), estilo do logo do app
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = (x / S + y / S) / 2; // diagonal suave
      const r = lerp(61, 56, t), g = lerp(220, 189, t), b = lerp(132, 248, t);
      const i = (y * size + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }

  const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  // escudo (contorno dourado) mais escuro para dar contraste
  const shield = (x, y) => {
    const cx = S / 2;
    const topY = 0.18 * S, botY = 0.82 * S;
    if (y < topY || y > botY) return false;
    const t = (y - topY) / (botY - topY);
    const half = 0.30 * S + (0.20 * S - 0.30 * S) * t; // estreita na base
    return Math.abs(x - cx) <= half;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!shield(x, y)) continue;
      blend(x, y, 11, 15, 25, 200); // #0b0f19 translúcido
      // borda dourada
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
        if (!shield(x + dx, y + dy)) blend(x, y, 245, 185, 66, 255); // #f5b942
      }
    }
  }

  // bola no centro do escudo: branca com pentágono e costuras
  const bcx = S / 2, bcy = S / 2, br = 0.16 * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (inCircle(x, y, bcx, bcy, br)) blend(x, y, 248, 248, 250, 255);
    }
  }
  // pentágono central
  const pr = 0.07 * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.sqrt((x - bcx) ** 2 + (y - bcy) ** 2);
      if (d <= pr) {
        const ang = Math.atan2(y - bcy, x - bcx);
        const lobe = Math.abs((((ang * 180) / Math.PI) % 72 + 72) % 72 - 36);
        if (lobe < 30) blend(x, y, 26, 32, 44, 255);
      }
    }
  }
  // costuras da bola (estrela): 5 linhas do centro ao contorno
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inCircle(x, y, bcx, bcy, br)) continue;
      const ang = (Math.atan2(y - bcy, x - bcx) * 180) / Math.PI + 90;
      const seam = Math.abs(((ang % 72) + 72) % 72);
      if (seam < 3.5 && Math.sqrt((x - bcx) ** 2 + (y - bcy) ** 2) > pr) blend(x, y, 26, 32, 44, 200);
    }
  }
  // contorno da bola
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.sqrt((x - bcx) ** 2 + (y - bcy) ** 2);
      if (Math.abs(d - br) < 1.6) blend(x, y, 26, 32, 44, 255);
    }
  }

  if (maskable) {
    // máscara: garante zona segura (80% central)
    const safe = 0.42 * S;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = Math.abs(x - S / 2) - safe;
        const dy = Math.abs(y - S / 2) - safe;
        if (dx > 0 && dy > 0) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0.16 * S) {
            const t = (x / S + y / S) / 2;
            const i = (y * size + x) * 4;
            px[i] = lerp(61, 56, t); px[i + 1] = lerp(220, 189, t); px[i + 2] = lerp(132, 248, t); px[i + 3] = 255;
          }
        }
      }
    }
  }
  return encodePNG(S, S, px);
};

mkdirSync(join(root, 'public', 'icons'), { recursive: true });
writeFileSync(join(root, 'public', 'icons', 'icon-192.png'), draw(192, false));
writeFileSync(join(root, 'public', 'icons', 'icon-512.png'), draw(512, false));
writeFileSync(join(root, 'public', 'icons', 'icon-maskable-512.png'), draw(512, true));

// favicon SVG com o "FS" real (gradiente do app) para o navegador
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3ddc84"/>
      <stop offset="1" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)"/>
  <text x="32" y="43" font-family="Sora, system-ui, sans-serif" font-size="28" font-weight="800" text-anchor="middle" fill="#0b0f19">FS</text>
</svg>`;
writeFileSync(join(root, 'public', 'favicon.svg'), faviconSvg);
console.log('Ícones gerados em public/icons/ + favicon.svg');
