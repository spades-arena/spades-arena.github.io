// Spades Arena — friends & gifts browser test (~30s)
// Add Friend from the table (✓ / ✗ popup for 8 seconds) and Shop → Send a Gift by username.
// Setup once:  cd tests && npm install        Run:  node tests/social.e2e.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'spades-social-'));
const PORT = 19500 + Math.floor(Math.random() * 400);
const DATA_DIR = fs.mkdtempSync(path.join(OUT, 'data-'));
const BASE = `http://127.0.0.1:${PORT}/`;
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR, SPADES_ADMIN_USERNAME: 'OwnerTest', SPADES_ADMIN_PASSWORD: 'owner-test-pw' }, stdio: 'ignore' });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
const errors = [];

async function openPhone(label) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 420, height: 880 });
  page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/AudioContext|Failed to load resource|WebSocket/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
  return page;
}
const waitScreen = (p, id, timeout = 12000) => p.waitForFunction(i => document.querySelector('.screen-view.active')?.id === i, { timeout }, id);
const prof = (p) => p.evaluate(() => { const x = SpadesHadzz.store.getProfile(); return { coins: x.coins, diamonds: x.diamonds }; });
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });

async function register(page, name) {
  await page.goto(BASE);
  await waitScreen(page, 'screen-login');
  await page.$eval('[data-auth-mode="register"]', el => el.click());
  await page.evaluate((n) => {
    document.querySelector('#auth-username').value = n;
    document.querySelector('#auth-password').value = '1234'; { const __pin = document.querySelector('#auth-pin'); if (__pin) __pin.value = '1234'; }
    document.querySelector('.auth-submit').click();
  }, name);
  await waitScreen(page, 'screen-menu');
  await page.waitForFunction(() => SpadesHadzz.networkAdapter.isOnlineReady(), { timeout: 8000 });
}

async function giftByName(page, name) {
  await page.evaluate(() => { window.spadesApp.giftState = null; window.spadesApp.navigateTo('gift'); });
  await waitScreen(page, 'screen-gift');
  await page.evaluate((n) => {
    document.querySelector('#gift-find-name').value = n;
    document.querySelector('#gift-find').requestSubmit();
  }, name);
}
const status = (p) => p.waitForFunction(() => {
  const el = document.querySelector('.gift-user-status');
  return el && /good|bad/.test(el.className) ? { cls: el.className, text: el.textContent } : null;
}, { timeout: 8000 }).then(h => h.jsonValue());
async function sendAmount(page, type, amount) {
  await page.evaluate((t) => document.querySelector(`[data-gift-type="${t}"]`).click(), type);
  await page.evaluate((a) => { const i = document.querySelector('#gift-amount'); i.value = String(a); i.dispatchEvent(new Event('input')); document.querySelector('#gift-review').click(); }, amount);
  await page.waitForSelector('.choice-overlay [data-choice-tone="yes"]', { timeout: 3000 });
  await page.evaluate(() => document.querySelector('.choice-overlay [data-choice-tone="yes"]').click());
}

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'healthz')).ok) break; } catch (e) {} await sleep(100); }
  let A = await openPhone('Ali');
  const B = await openPhone('Bea');
  await Promise.all([register(A, 'Ali'), register(B, 'Bea')]);
  const a0 = await prof(A);

  // 1) 🎁 GIFT screen (top bar button): unknown usernames are rejected
  ok(Boolean(await B.$('#app-topbar [data-nav="gift"]')), 'top bar has a 🎁 Gift button');
  await giftByName(B, 'nobody_xyz');
  const miss = await status(B);
  ok(/bad/.test(miss.cls) && /No Spades Arena player/.test(miss.text), `unknown username rejected: "${miss.text}"`);

  // 2) Real player → Coins, then Diamonds (server-checked: taken from the sender by the server)
  await giftByName(B, 'ali');
  const hit = await status(B);
  ok(/good/.test(hit.cls) && /Ali/.test(hit.text), `real player found: "${hit.text}"`);
  await shot(B, '01-gift-screen');
  await sendAmount(B, 'coins', 10);
  await A.waitForFunction((c) => SpadesHadzz.store.getProfile().coins === c + 10, { timeout: 8000 }, a0.coins);
  await sendAmount(B, 'diamonds', 1);
  await A.waitForFunction((d) => SpadesHadzz.store.getProfile().diamonds === d + 1, { timeout: 8000 }, a0.diamonds);
  const a1 = await prof(A);
  const toastA = await A.$eval('#app-toast', el => el.textContent);
  ok(a1.coins === a0.coins + 10 && a1.diamonds === a0.diamonds + 1, `Ali received 🦁 10 + 💎 1 (now 🦁 ${a1.coins}, 💎 ${a1.diamonds})`);
  ok(/Bea sent you/.test(toastA), `Ali got the notification: "${toastA}"`);
  await shot(A, '02-gift-received');
  await B.waitForFunction(() => { const p = SpadesHadzz.store.getProfile(); return p.coins === 40 && p.diamonds === 4; }, { timeout: 8000 });
  ok(true, 'Bea’s balance was reduced by the server (🦁 40, 💎 4)');

  // 2b) Gift an owned design: it leaves Bea and is unlocked for Ali straight away (no claiming)
  await B.evaluate(() => { SpadesHadzz.store.credit({ lions: 300 }); SpadesHadzz.store.selectOrBuyTableTheme('arena_gold'); });
  await B.waitForFunction(() => SpadesHadzz.store.getProfile().syncDirty === false, { timeout: 8000 });
  await giftByName(B, 'Ali');
  await status(B);
  await B.evaluate(() => document.querySelector('[data-gift-type="item"]').click());
  await B.waitForSelector('[data-gift-item="table:arena_gold"]', { timeout: 3000 });
  await B.evaluate(() => document.querySelector('[data-gift-item="table:arena_gold"]').click());
  await B.evaluate(() => document.querySelector('#gift-review').click());
  await B.waitForSelector('.choice-overlay [data-choice-tone="yes"]');
  await B.evaluate(() => document.querySelector('.choice-overlay [data-choice-tone="yes"]').click());
  await A.waitForFunction(() => SpadesHadzz.store.owns('table', 'arena_gold'), { timeout: 8000 });
  await B.waitForFunction(() => !SpadesHadzz.store.owns('table', 'arena_gold') && SpadesHadzz.store.getProfile().selectedTableTheme === 'emerald', { timeout: 8000 });
  ok(true, 'gifted Royal Gold table moved from Bea to Ali (Bea’s table went back to the free one)');
  await A.evaluate(() => window.spadesApp.navigateTo('shop'));
  await A.waitForSelector('[data-shop-item="table:arena_gold"] .ai-flag.gifted', { timeout: 4000 });
  ok(await A.$eval('[data-shop-item="table:arena_gold"]', el => /GIFTED/.test(el.textContent) && /Equip/.test(el.textContent)), 'Ali’s shop shows it as 🎁 GIFTED and ready to Equip — no claim step');
  await B.evaluate(() => { window.spadesApp.giftState = null; window.spadesApp.navigateTo('gift'); });
  await B.waitForFunction(() => document.querySelectorAll('.gh-row.sent').length === 3, { timeout: 8000 });
  ok(true, 'Bea’s gift history lists her 3 sent gifts');

  // 3) Gift while the other player is offline → arrives when they open the app
  const ctxA = A.browserContext();
  await A.close(); // Ali closes the app
  let online = 0;
  for (let i = 0; i < 80; i++) { online = (await (await fetch(BASE + 'healthz')).json()).online; if (online === 1) break; await sleep(100); }
  await giftByName(B, 'Ali');
  await status(B);
  await sendAmount(B, 'coins', 5);
  const queuedToast = await B.waitForFunction(() => {
    const t = document.querySelector('#app-toast').textContent;
    return /Gift of/.test(t) ? t : null;
  }, { timeout: 8000 }).then(h => h.jsonValue());
  ok(/next time they open/.test(queuedToast), `gift to an offline player is kept for them: "${queuedToast}"`);
  A = await ctxA.newPage();
  await A.setViewport({ width: 420, height: 880 });
  A.on('pageerror', e => errors.push(`Ali: ${e.message}`));
  await A.goto(BASE);
  await A.waitForFunction((c) => SpadesHadzz.store.getProfile().coins === c + 15, { timeout: 12000 }, a0.coins);
  ok(true, 'Ali got the offline gift (+5 🦁) when reopening the app');

  // 4) Tap a player at an online table → Add Friend → ✓ / ✗ popup on their screen
  await A.waitForFunction(() => SpadesHadzz.networkAdapter.isOnlineReady(), { timeout: 8000 });
  await A.evaluate(() => {
    const app = window.spadesApp;
    app.game = { online: true, numSeats: 4, players: [{ name: 'Ali', avatar: 'av_panther' }, { name: 'Bea', avatar: 'av_ace', account: 'Bea', wasHuman: true, isBot: false }, { name: 'Bot', isBot: true }, { name: 'Bot', isBot: true }] };
    app.showSeatPlayerCard(1);
  });
  const card = await A.$eval('.player-card', el => ({ name: el.querySelector('h3').textContent, add: Boolean(el.querySelector('[data-pc-add]')) }));
  ok(card.name === 'Bea' && card.add, 'tapping a player at the table shows their card with 👥 Add Friend');
  await shot(A, '03-player-card');
  await A.$eval('[data-pc-add]', el => el.click());
  await B.waitForSelector('.friend-req-pop.visible', { timeout: 6000 });
  const pop = await B.$eval('.friend-req-pop', el => ({ text: el.textContent, yes: Boolean(el.querySelector('.frp-yes')), no: Boolean(el.querySelector('.frp-no')) }));
  ok(/Ali/.test(pop.text) && pop.yes && pop.no, 'Bea gets "Ali wants to be your friend" with ✓ and ✗');
  await shot(B, '04-friend-popup');
  await B.$eval('.frp-yes', el => el.click());
  await A.waitForFunction(() => SpadesHadzz.networkAdapter.friendRelation('Bea') === 'friend', { timeout: 6000 });
  ok(await B.evaluate(() => SpadesHadzz.networkAdapter.friendRelation('Ali') === 'friend'), 'tapping ✓ makes them friends on the server (both lists updated)');
  await A.evaluate(() => window.spadesApp.showSeatPlayerCard(1));
  ok(/Already friends/.test(await A.$eval('.player-card', el => el.textContent)), 'player card now shows ✓ Already friends');
  await A.evaluate(() => { document.querySelectorAll('.choice-overlay').forEach(el => el.remove()); window.spadesApp.game = null; });

  // 5) Unanswered requests disappear after 8 seconds (still waiting in Friends → Requests)
  const C = await openPhone('Cy');
  await register(C, 'Cy');
  await C.evaluate(() => SpadesHadzz.networkAdapter.sendFriendRequestByName('Bea'));
  await B.waitForSelector('.friend-req-pop.visible', { timeout: 6000 });
  const shownAt = Date.now();
  await B.waitForFunction(() => !document.querySelector('.friend-req-pop'), { timeout: 12000 });
  const secs = (Date.now() - shownAt) / 1000;
  ok(secs > 7 && secs < 9.5, `request popup closes by itself after ~8 seconds (${secs.toFixed(1)}s)`);
  ok(await B.evaluate(() => SpadesHadzz.networkAdapter.state.incomingRequests.some(r => r.username === 'Cy')), 'unanswered request is still in Friends → Requests');

  // 6) Owner account (set on the server) has unlimited Coins & Diamonds; sign out → normal balance returns
  const before = await prof(C);
  await C.evaluate(() => window.spadesApp.signOut());
  await waitScreen(C, 'screen-login');
  await C.evaluate(() => {
    document.querySelector('[data-auth-mode="login"]')?.click();
  });
  await C.evaluate(() => {
    document.querySelector('#auth-username').value = 'ownertest';
    document.querySelector('#auth-password').value = 'owner-test-pw';
    document.querySelector('.auth-submit').click();
  });
  await waitScreen(C, 'screen-menu');
  await C.waitForFunction(() => SpadesHadzz.store.isUnlimited, { timeout: 6000 });
  const hud = await C.$eval('#app-topbar [data-hud-coins]', el => el.textContent);
  const hudD = await C.$eval('#app-topbar [data-hud-diamonds]', el => el.textContent);
  ok(hud === '∞' && hudD === '∞', `owner account shows unlimited Coins ${hud} and Diamonds ${hudD}`);
  const bought = await C.evaluate(() => SpadesHadzz.store.selectOrBuyAvatar('av_legend').ok && SpadesHadzz.store.selectOrBuyCardSkin('cd_gold').ok);
  const after = await prof(C);
  ok(bought && after.coins === 1000000000 && after.diamonds === 1000000000, 'buying the priciest items never runs the owner out');
  await C.evaluate(() => window.spadesApp.signOut());
  await waitScreen(C, 'screen-login');
  const back = await prof(C);
  ok(back.coins === before.coins && back.diamonds === before.diamonds && !(await C.evaluate(() => SpadesHadzz.store.isUnlimited)), `after signing out the normal balance comes back (🦁 ${back.coins}, 💎 ${back.diamonds})`);
  await C.evaluate(() => {
    document.querySelector('[data-auth-mode="register"]')?.click();
  });
  await C.evaluate(() => {
    document.querySelector('#auth-username').value = 'OWNERTEST';
    document.querySelector('#auth-password').value = 'anything1'; { const __pin = document.querySelector('#auth-pin'); if (__pin) __pin.value = '1234'; }
    document.querySelector('.auth-submit').click();
  });
  await sleep(1200);
  ok(await C.evaluate(() => !SpadesHadzz.store.isUnlimited && document.querySelector('.screen-view.active').id === 'screen-login'), 'nobody else can register the owner username');

  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.log('FAIL  exception:', e.message);
  failures++;
} finally {
  await browser.close();
  server.kill('SIGTERM');
  console.log(`Screenshots: ${OUT}`);
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL SOCIAL TESTS PASSED');
  process.exit(failures ? 1 : 0);
}
