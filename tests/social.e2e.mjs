// Spades Royale — friends & gifts browser test (~30s)
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
    document.querySelector('#auth-password').value = 'lion123';
    document.querySelector('#auth-password2').value = 'lion123'; { const __pin = document.querySelector('#auth-pin'); if (__pin) __pin.value = '1234'; }
    document.querySelector('.auth-submit').click();
  }, name);
  await waitScreen(page, 'screen-menu');
  await page.waitForFunction(() => SpadesHadzz.networkAdapter.isOnlineReady(), { timeout: 8000 });
}

async function giftByName(page, name) {
  await page.evaluate(() => window.spadesApp.navigateTo('shop'));
  await waitScreen(page, 'screen-shop');
  await page.evaluate((n) => {
    document.querySelector('#gift-user-name').value = n;
    document.querySelector('#gift-user-form').requestSubmit();
  }, name);
}
const status = (p) => p.waitForFunction(() => {
  const el = document.querySelector('#gift-user-status');
  return el && /good|bad/.test(el.className) ? { cls: el.className, text: el.textContent } : null;
}, { timeout: 8000 }).then(h => h.jsonValue());

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'healthz')).ok) break; } catch (e) {} await sleep(100); }
  let A = await openPhone('Ali');
  const B = await openPhone('Bea');
  await Promise.all([register(A, 'Ali'), register(B, 'Bea')]);
  const a0 = await prof(A);

  // 1) Shop → Send a Gift: unknown usernames are rejected
  await giftByName(B, 'nobody_xyz');
  const miss = await status(B);
  ok(/bad/.test(miss.cls) && /No Spades Royale player/.test(miss.text), `unknown username rejected: "${miss.text}"`);
  ok(!(await B.$('.gift-card')), 'no gift popup for an unknown player');

  // 2) Real player → "what do you want to send" → Lions + Diamonds
  await giftByName(B, 'ali');
  const hit = await status(B);
  await B.waitForSelector('.gift-card', { timeout: 3000 });
  ok(/good/.test(hit.cls) && /Ali/.test(hit.text), `real player found: "${hit.text}" and the Lions / Diamonds popup opens`);
  await shot(B, '01-shop-gift-dialog');
  await B.evaluate(() => {
    document.querySelector('#gift-lions').value = '10';
    document.querySelector('#gift-diamonds').value = '1';
    document.querySelector('[data-gift-send]').click();
  });
  await A.waitForFunction((c) => SpadesHadzz.store.getProfile().coins === c + 10, { timeout: 6000 }, a0.coins);
  const a1 = await prof(A);
  const toastA = await A.$eval('#app-toast', el => el.textContent);
  ok(a1.coins === a0.coins + 10 && a1.diamonds === a0.diamonds + 1, `Ali received 🦁 10 + 💎 1 (now 🦁 ${a1.coins}, 💎 ${a1.diamonds})`);
  ok(/Bea sent you/.test(toastA), `Ali got the notification: "${toastA}"`);
  await shot(A, '02-gift-received');
  const b1 = await prof(B);
  ok(b1.coins === 40 && b1.diamonds === 4, `Bea paid for the gift (🦁 ${b1.coins}, 💎 ${b1.diamonds})`);

  // 3) Gift while the other player is offline → arrives when they open the app
  const ctxA = A.browserContext();
  await A.close(); // Ali closes the app
  let online = 0;
  for (let i = 0; i < 80; i++) { online = (await (await fetch(BASE + 'healthz')).json()).online; if (online === 1) break; await sleep(100); }
  await giftByName(B, 'Ali');
  await status(B);
  await B.waitForSelector('.gift-card', { timeout: 3000 });
  await B.evaluate(() => { document.querySelector('#gift-lions').value = '5'; document.querySelector('[data-gift-send]').click(); });
  const queuedToast = await B.waitForFunction(() => {
    const t = document.querySelector('#app-toast').textContent;
    return /Gift of/.test(t) ? t : null;
  }, { timeout: 6000 }).then(h => h.jsonValue());
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
    app.game = { online: true, numSeats: 4, players: [{ name: 'Ali', avatar: 'free_ace' }, { name: 'Bea', avatar: 'free_wave', account: 'Bea', wasHuman: true, isBot: false }, { name: 'Bot', isBot: true }, { name: 'Bot', isBot: true }] };
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

  // 6) Owner account (set on the server) has unlimited Lions & Diamonds; sign out → normal balance returns
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
  ok(hud === '∞' && hudD === '∞', `owner account shows unlimited Lions ${hud} and Diamonds ${hudD}`);
  const bought = await C.evaluate(() => SpadesHadzz.store.selectOrBuyAvatar('myth_cat').ok && SpadesHadzz.store.selectOrBuyAvatar('dia_icedragon').ok);
  const after = await prof(C);
  ok(bought && after.coins >= 999999999 && after.diamonds >= 999999999, 'buying the priciest items never runs the owner out');
  await C.evaluate(() => window.spadesApp.signOut());
  await waitScreen(C, 'screen-login');
  const back = await prof(C);
  ok(back.coins === before.coins && back.diamonds === before.diamonds && !(await C.evaluate(() => SpadesHadzz.store.isUnlimited)), `after signing out the normal balance comes back (🦁 ${back.coins}, 💎 ${back.diamonds})`);
  await C.evaluate(() => {
    document.querySelector('[data-auth-mode="register"]')?.click();
  });
  await C.evaluate(() => {
    document.querySelector('#auth-username').value = 'OWNERTEST';
    document.querySelector('#auth-password').value = 'anything1';
    const p2 = document.querySelector('#auth-password2'); if (p2) p2.value = 'anything1'; { const __pin = document.querySelector('#auth-pin'); if (__pin) __pin.value = '1234'; }
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
