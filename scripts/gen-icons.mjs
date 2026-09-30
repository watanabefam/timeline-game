#!/usr/bin/env node
/*
 * scripts/gen-icons.mjs
 * ------------------------------------------------------------------
 * Generates the home-screen / manifest icons into icons/.
 *
 * Why a generator instead of committed hand-drawn art: the install prompt
 * needs a 192px and a 512px icon, "Add to Home Screen" needs a 180px
 * apple-touch-icon, and Android needs a maskable variant. None existed
 * (there was not even a favicon). Drawing them here means the set is
 * reproducible, reviewable as code, and cheap for a designer to replace
 * later — and it needs no image dependency, because Node's zlib is enough
 * to write a PNG (see the encoder below).
 *
 * The art is the game's own motif: a dark card with a horizontal timeline
 * and three event nodes. Palette is read from styles.css's :root tokens, so
 * the icon cannot drift from the app's colours.
 *
 * Icons live in icons/, NOT assets/ — assets/ is vendored third-party code
 * and is never edited (AGENTS.md hard rule 2).
 *
 * Run:
 *   node scripts/gen-icons.mjs          # write icons/*.png
 *   node scripts/gen-icons.mjs --check  # exit 1 if stale (gate)
 */
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "icons");
const check = process.argv.includes("--check");

/* ---------- palette ---------- */
function tokens() {
  const css = readFileSync(join(root, "styles.css"), "utf8");
  const get = (name) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
    if (!m) throw new Error(`styles.css has no --${name} colour token`);
    return hexToRgba(m[1], 1);
  };
  return {
    bg: get("bg"),
    card: get("card"),
    border: get("border"),
    accent: get("accent"),
    accent2: get("accent-2"),
    good: get("good"),
  };
}
function hexToRgba(hex, a) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
    a,
  ];
}

/* ---------- geometry (normalised 0..1, so every size renders the same art) ---------- */
const INK = {
  // Node centres and radii along the timeline, as fractions of the canvas.
  nodes: [
    { x: 0.30, y: 0.60, r: 0.052, color: "accent" },
    { x: 0.50, y: 0.60, r: 0.072, color: "accent2" },
    { x: 0.70, y: 0.60, r: 0.052, color: "good" },
  ],
  line: { x0: 0.22, x1: 0.78, y: 0.60, w: 0.022, color: "border" },
  // A rising "in order" arrow above the line — distinguishes the mark from a
  // generic dots-on-a-line at small sizes.
  arrow: { x0: 0.36, y0: 0.34, x1: 0.64, y1: 0.20, w: 0.034, color: "accent" },
  arrowHead: { x: 0.64, y: 0.20, len: 0.075, color: "accent" },
};

function render(size, maskable, pal) {
  const px = new Uint8ClampedArray(size * size * 4); // transparent
  const S = size;
  const SS = 4; // 4x4 supersampling per pixel → clean edges without AA libs
  const inv = 1 / (SS * SS);

  const inside = {
    // inset shrinks the rounded rect inward, which is how the rim ring is
    // drawn: (full rect) minus (rect inset by the stroke width).
    roundRect: (x, y, inset = 0) => {
      if (maskable) return true; // full bleed: no corners to crop
      const r = 0.22 - inset;
      const [a, b] = [inset + r, 1 - inset - r];
      const cx = Math.min(Math.max(x, a), b);
      const cy = Math.min(Math.max(y, a), b);
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    },
    circle: (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r,
    segment: (x, y, x0, y0, x1, y1, w) => {
      const dx = x1 - x0, dy = y1 - y0;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
      const qx = x0 + t * dx, qy = y0 + t * dy;
      return (x - qx) ** 2 + (y - qy) ** 2 <= (w / 2) ** 2;
    },
  };

  // Painting order: card, rim, timeline, arrow, nodes.
  const shapes = [];
  shapes.push({
    color: pal.card,
    alpha: 1,
    test: (x, y) => inside.roundRect(x, y),
    // vertical gradient card → bg
    grad: pal.bg,
  });
  if (!maskable) {
    shapes.push({
      color: pal.border,
      alpha: 1,
      test: (x, y) => inside.roundRect(x, y) && !inside.roundRect(x, y, 0.012),
    });
  }
  const inkScale = maskable ? 0.72 : 1; // maskable art stays inside the safe zone
  const T = (v) => 0.5 + (v - 0.5) * inkScale; // scale ink about the centre
  const Z = (v) => v * inkScale; // scale sizes/widths

  shapes.push({
    color: pal.border,
    alpha: 0.95,
    test: (x, y) => inside.segment(x, y, T(INK.line.x0), T(INK.line.y), T(INK.line.x1), T(INK.line.y), Z(INK.line.w)),
  });
  shapes.push({
    color: pal.accent,
    alpha: 1,
    test: (x, y) => inside.segment(x, y, T(INK.arrow.x0), T(INK.arrow.y0), T(INK.arrow.x1), T(INK.arrow.y1), Z(INK.arrow.w)),
  });
  // arrow head: two short segments
  const ah = INK.arrowHead;
  shapes.push({
    color: pal.accent,
    alpha: 1,
    test: (x, y) =>
      inside.segment(x, y, T(ah.x), T(ah.y), T(ah.x - ah.len), T(ah.y + ah.len * 0.15), Z(INK.arrow.w)) ||
      inside.segment(x, y, T(ah.x), T(ah.y), T(ah.x - ah.len * 0.55), T(ah.y + ah.len * 0.95), Z(INK.arrow.w)),
  });
  for (const n of INK.nodes) {
    shapes.push({
      color: pal[n.color],
      alpha: 1,
      test: (x, y) => inside.circle(x, y, T(n.x), T(n.y), Z(n.r)),
    });
  }

  for (let py = 0; py < S; py++) {
    for (let pxi = 0; pxi < S; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (pxi + (sx + 0.5) / SS) / S;
          const y = (py + (sy + 0.5) / SS) / S;
          let cr = 0, cg = 0, cb = 0, ca = 0;
          for (const sh of shapes) {
            if (!sh.test(x, y)) continue;
            let col = sh.color;
            if (sh.grad) {
              const t = y; // top = card, bottom = bg
              col = [
                sh.color[0] + (sh.grad[0] - sh.color[0]) * t,
                sh.color[1] + (sh.grad[1] - sh.color[1]) * t,
                sh.color[2] + (sh.grad[2] - sh.color[2]) * t,
                1,
              ];
            }
            const sa = col[3] * sh.alpha;
            cr = col[0] * sa + cr * (1 - sa);
            cg = col[1] * sa + cg * (1 - sa);
            cb = col[2] * sa + cb * (1 - sa);
            ca = sa + ca * (1 - sa);
          }
          r += cr; g += cg; b += cb; a += ca;
        }
      }
      r *= inv; g *= inv; b *= inv; a *= inv;
      const o = (py * S + pxi) * 4;
      // Un-premultiply: shapes were composited premultiplied.
      px[o] = a > 0 ? Math.round(Math.min(255, r / a)) : 0;
      px[o + 1] = a > 0 ? Math.round(Math.min(255, g / a)) : 0;
      px[o + 2] = a > 0 ? Math.round(Math.min(255, b / a)) : 0;
      px[o + 3] = Math.round(Math.min(255, a * 255));
    }
  }
  return px;
}

/* ---------- minimal PNG encoder (no dependencies) ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(px.buffer, px.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- output set ---------- */
const pal = tokens();
const TARGETS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "icon-maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon-180.png", size: 180, maskable: true },
];

if (!check && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let stale = 0;
const made = [];
for (const t of TARGETS) {
  const png = encodePng(render(t.size, t.maskable, pal), t.size);
  const target = join(outDir, t.file);
  if (check) {
    const cur = existsSync(target) ? readFileSync(target) : null;
    if (!cur || !cur.equals(png)) {
      console.error(`✗ icons/${t.file} is missing or out of date — run: node scripts/gen-icons.mjs`);
      stale++;
    }
  } else {
    writeFileSync(target, png);
    made.push(`icons/${t.file} (${t.size}px${t.maskable ? ", maskable" : ""}, ${png.length} bytes)`);
  }
}

if (check) {
  if (stale) process.exit(1);
  console.log(`✓ icons/ up to date (${TARGETS.length} PNGs).`);
  process.exit(0);
}
for (const line of made) console.log(`✓ wrote ${line}`);
