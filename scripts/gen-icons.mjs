// Gera os ícones PWA do FootballSim (PNG) sem dependências externas.
// Desenha um escudo com faixas de campo e uma bola de futebol estilizada.
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
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  const bg = (x, y) => { set(x, y, 11, 15, 25); }; // #0b0f19 fundo
  const blend = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255;
    px[i] = Math.round(px[i] * (1 - na) + r * na);
    px[i + 1] = Math.round(px[i + 1] * (1 - na) + g * na);
    px[i + 2] = Math.round(px[i + 2] * (1 - na) + b * na);
    px[i + 3] = 255;
  };
  const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

  // fundo
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) bg(x, y);

  const S = size;
  // escudo: polígono (faixa superior maior, base pontuda)
  const shield = (x, y) => {
    const w = 0.62 * S, h = 0.66 * S;
    const cx = S / 2;
    const topY = (0.5 - 0.33) * S;
    const botY = (0.5 + 0.33) * S;
    const topW = w / 2, botW = (0.30) * S / 2;
    if (y < topY || y > botY) return false;
    const t = (y - topY) / (botY - topY);
    const half = topW + (botW - topW) * t;
    return Math.abs(x - cx) <= half;
  };
  // preencher escudo com gradiente verde
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (shield(x, y)) {
        const t = y / S;
        blend(x, y, 12 + Math.round(16 * t), 96 + Math.round(28 * t), 54 + Math.round(22 * t), 255);
      }
    }
  }
  // faixas verticais do campo dentro do escudo
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (shield(x, y)) {
        const band = Math.floor(x / (S / 10)) % 2 === 0;
        if (band) blend(x, y, 255, 255, 255, 10);
      }
    }
  }
  // borda do escudo
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!shield(x, y)) continue;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (!shield(x + dx, y + dy)) set(x, y, 232, 190, 40); // dourado
      }
    }
  }

  // bola: círculo branco com pentágono preto no centro
  const bcx = S / 2, bcy = S / 2, br = 0.17 * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (inCircle(x, y, bcx, bcy, br)) set(x, y, 245, 245, 245);
    }
  }
  // pentágono central
  const pr = 0.075 * S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.sqrt((x - bcx) ** 2 + (y - bcy) ** 2);
      if (d <= pr) {
        const ang = Math.atan2(y - bcy, x - bcx);
        // aproximação de pentágono: 5 lóbulos
        const lobe = Math.abs(((ang * 180 / Math.PI) % 72 + 72) % 72 - 36);
        if (lobe < 30) set(x, y, 30, 32, 40);
      }
    }
  }
  // contorno da bola
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.sqrt((x - bcx) ** 2 + (y - bcy) ** 2);
      if (Math.abs(d - br) < 1.6) set(x, y, 60, 62, 70);
    }
  }

  if (maskable) {
    // máscara: garante zona segura (80% central) — preenche cantos com fundo
    const safe = 0.42 * S;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = Math.abs(x - S / 2) - safe;
        const dy = Math.abs(y - S / 2) - safe;
        if (dx > 0 && dy > 0) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 0.16 * S) bg(x, y);
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
console.log('Ícones gerados em public/icons/');
