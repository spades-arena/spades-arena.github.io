// Spades by Hadzz — shuffle & deal fairness test (no dependencies)
// Run:  node tests/shuffle.test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
require(path.join(ROOT, 'js/engine.js'));
const SH = globalThis.SpadesHadzz;

let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

const DEALS = 20000;
const seen = new Set();
const southCount = {};
let allValid = true;
for (let i = 0; i < DEALS; i++) {
  const hands = SH.dealFourHands(i % 4);
  const ids = hands.flat().map(c => c.id);
  if (hands.some(h => h.length !== 13) || new Set(ids).size !== 52) allValid = false;
  seen.add(hands.map(h => h.map(c => c.id).join('')).join('|'));
  for (const c of hands[0]) southCount[c.id] = (southCount[c.id] || 0) + 1;
}
ok(allValid, `${DEALS} deals: every deal gives 4 × 13 cards using all 52 unique cards`);
ok(seen.size === DEALS, `every one of ${DEALS} deals is different (fresh shuffle each time)`);

// Each card should land in South's hand ~25% of the time
const expected = DEALS / 4;
const worst = Math.max(...Object.values(southCount).map(n => Math.abs(n - expected) / expected));
ok(Object.keys(southCount).length === 52 && worst < 0.06, `every card reaches South ~25% of deals (max deviation ${(worst * 100).toFixed(2)}%)`);

const aceSpadesSeat = [0, 0, 0, 0];
for (let i = 0; i < DEALS; i++) {
  const hands = SH.dealFourHands(3);
  aceSpadesSeat[hands.findIndex(h => h.some(c => c.id === 'AS'))]++;
}
ok(aceSpadesSeat.every(n => Math.abs(n - expected) / expected < 0.06), `A♠ is equally likely in every seat (${aceSpadesSeat.join(' / ')})`);

console.log(failures ? `${failures} FAILURE(S)` : 'ALL SHUFFLE TESTS PASSED');
process.exit(failures ? 1 : 0);
