#!/usr/bin/env node
/**
 * Generates src/engine/angle-tables.ts. Run by hand, at release time:
 *   npm run gen:angle && npm test && git diff --stat src/engine/angle-tables.ts
 *
 * It is NOT wired into `prepare`. `prepare` runs on the INSTALLING machine, so a table
 * built there is a table built by that machine's `Math.cos` — the exact divergence the
 * generated file exists to prevent, wearing a build step as a disguise.
 *
 * If a regeneration that changed no parameter here produces a non-empty diff, this
 * machine's `Math.cos` moved. That is a deliberate re-baseline of every golden hash in
 * every game on this framework, not a chore to wave through.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ANG_TURN = 1048576; // 2^20
const SCALE = 16777216; // 2^24 — the table's own fixed-point, not Fx
const COARSE_N = 1024;
const FINE_N = 1024; // COARSE_N * FINE_N === ANG_TURN, which is what makes the split exact
const ATAN_N = 4096;

/**
 * The coarse table, from ONE OCTANT. Sampling all 1024 with `Math.cos` happens to come
 * out 8-fold symmetric today, but that is a property of this machine's libm; folding
 * makes it a property of the file. 129 calls seed the other 896 entries by integer
 * negate-and-swap, which is exact.
 */
const coarse = new Int32Array(COARSE_N * 2);
const put = (i, x, y) => {
  const k = ((i % COARSE_N) + COARSE_N) % COARSE_N;
  coarse[k * 2] = x;
  coarse[k * 2 + 1] = y;
};
const Q = COARSE_N / 4;
for (let i = 0; i <= COARSE_N / 8; i++) {
  const t = (2 * Math.PI * i) / COARSE_N;
  const x = Math.round(SCALE * Math.cos(t));
  const y = Math.round(SCALE * Math.sin(t));
  put(i, x, y);
  put(Q - i, y, x);
  put(Q + i, -y, x);
  put(2 * Q - i, -x, y);
  put(2 * Q + i, -x, -y);
  put(3 * Q - i, -y, -x);
  put(3 * Q + i, y, -x);
  put(4 * Q - i, x, -y);
}

/** The fine table: one coarse step, subdivided. No symmetry to exploit across 1/1024 turn. */
const fine = new Int32Array(FINE_N * 2);
for (let i = 0; i < FINE_N; i++) {
  const t = (2 * Math.PI * i) / ANG_TURN;
  fine[i * 2] = Math.round(SCALE * Math.cos(t));
  fine[i * 2 + 1] = Math.round(SCALE * Math.sin(t));
}

/** atan(i/ATAN_N) in Ang units. ATAN_N + 1 entries: the last cell needs an upper value to
 *  interpolate toward, and the octant diagonal lands exactly on it. */
const atan = new Int32Array(ATAN_N + 1);
for (let i = 0; i <= ATAN_N; i++) {
  atan[i] = Math.round((Math.atan(i / ATAN_N) / (2 * Math.PI)) * ANG_TURN);
}

const rows = (a) => {
  const out = [];
  for (let i = 0; i < a.length; i += 16) out.push("  " + a.slice(i, i + 16).join(", ") + ",");
  return out.join("\n");
};

const body = `/**
 * GENERATED — DO NOT EDIT. Regenerate with \`npm run gen:angle\` and commit the result.
 *
 * These numbers ARE the sim's trigonometry. They are checked in, and not built at module
 * init, because \`Math.cos\` is not specified to a bit: two clients on different engine
 * builds would each construct their own table, differ in a handful of entries by one, and
 * disagree about a ship's facing forever. Nothing here is derived at runtime.
 *
 * The guard that this file is still right is \`test/angle-tables.test.ts\`, which reproduces
 * it within a TOLERANCE rather than to the bit — so an engine changing \`Math.cos\` fails
 * nothing, and a corrupted digit fails loudly.
 *
 * Interleaved [cos, sin, cos, sin, …], scaled by 2^24. \`Int32Array\` because every entry is
 * at most 2^24: these are not \`Fx\` values, which is the one case where a container other
 * than \`Float64Array\` is the right one.
 *
 * COARSE is 8-fold symmetric BY CONSTRUCTION — the generator seeds one octant and folds
 * the rest with integer negate-and-swap.
 */

export const ANG_COARSE_N = ${COARSE_N};
export const ANG_FINE_N = ${FINE_N};
export const ANG_ATAN_N = ${ATAN_N};
/** The tables' own scale, 2^24 — finer than \`Fx\` so the final rounding is the only one. */
export const ANG_TABLE_SCALE = ${SCALE};

export const ANG_COARSE: Int32Array = /*#__PURE__*/ new Int32Array([
${rows(coarse)}
]);

export const ANG_FINE: Int32Array = /*#__PURE__*/ new Int32Array([
${rows(fine)}
]);

export const ANG_ATAN: Int32Array = /*#__PURE__*/ new Int32Array([
${rows(atan)}
]);
`;

const out = fileURLToPath(new URL("../src/engine/angle-tables.ts", import.meta.url));
writeFileSync(out, body);
console.log(`wrote ${out}`);
console.log(`  coarse ${COARSE_N}, fine ${FINE_N}, atan ${ATAN_N + 1}, scale 2^24`);
