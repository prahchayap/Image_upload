#!/usr/bin/env node
// Dependency-free PNG icon generator for the RaceRadar PWA.
// Draws a rounded brand-gradient tile with a radar ring + dot, at the sizes a
// PWA needs. No external libraries — encodes PNG with Node's built-in zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

// --- CRC32 (for PNG chunks) ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function draw(size, { padded = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.22;               // rounded-corner radius
  const inset = padded ? size * 0.10 : 0;   // maskable safe padding
  const set = (x, y, r, g, b, a) => { const i = (y * size + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; };
  const inRounded = (x, y) => {
    const l = inset, t = inset, rt = size - inset, bt = size - inset;
    if (x < l || y < t || x > rt || y > bt) return false;
    const rr = radius;
    const dx = Math.min(x - (l + rr), (rt - rr) - x, 0);
    const dy = Math.min(y - (t + rr), (bt - rr) - y, 0);
    return dx * dx + dy * dy <= rr * rr;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRounded(x, y)) { set(x, y, 0, 0, 0, 0); continue; }
      // vertical brand gradient  #f5533d -> #c62b16
      const f = y / size;
      let r = Math.round(245 + (198 - 245) * f);
      let g = Math.round(83 + (43 - 83) * f);
      let b = Math.round(61 + (22 - 61) * f);
      const d = Math.hypot(x - cx, y - cy);
      // white radar rings
      const ringW = size * 0.028;
      const rings = [size * 0.30, size * 0.20];
      let white = 0;
      for (const rad of rings) if (Math.abs(d - rad) < ringW) white = 1;
      if (d < size * 0.075) white = 1;                    // center dot
      // sweep line (thin) from center up-right
      const ang = Math.atan2(y - cy, x - cx);
      if (d < size * 0.32 && Math.abs(ang + Math.PI / 4) < 0.05) white = 1;
      if (white) { r = 255; g = 255; b = 255; }
      set(x, y, r, g, b, 255);
    }
  }
  return png(size, size, buf);
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { padded: true }],
  ['apple-touch-icon.png', 180, {}],
];
for (const [name, size, opts] of targets) {
  writeFileSync(join(OUT, name), draw(size, opts));
  console.log('wrote icons/' + name + ' (' + size + 'px)');
}
