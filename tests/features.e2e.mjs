// Spades Royale — login streak, table colours, stats, leaderboard & rematch (~40s)
// Setup once:  cd tests && npm install        Run:  node tests/features.e2e.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'spades-features-'));
const PORT = 19950 + Math.floor(Math.random() * 40);
const DATA_DIR = fs.mkdtempSync(path.join(OUT, 'data-'));
const BASE = `http://127.0.0.1:${PORT}/`;
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- 🔁 Rematch: RoomHost unit check (no browser needed) ---
const require = createRequire(import.meta.url);
for (const m of ['js/engine.js', 'js/bot.js', 'js/match.js', 'js/p2p.js']) require(path.join(ROOT, m));
const SH = globalThis.SpadesHadzz;
{
  const sent = [];
  const room = new SH.p2p.RoomHost({ code: 'HDZ-TEST', mode: 2, settings: { targetScore: 250 }, host: { id: 'hosthosthosthost01', name: 'Ali', avatar: 'free_ace' }, deliver: (id, msg) => sent.push({ id, msg }) });
  room.join({ id: 'guestguestguest001', name: 'Bea', avatar: 'free_wave', team: 'red' });
  room.handle('hosthosthosthost01', { t: 'room:ready', ready: true });
  room.handle('guestguestguest001', { t: 'room:ready', ready: true });
  ok(room.status === 'playing', 'room starts when both players are ready');
  room.finishMatch(); // game over
  ok(room.status === 'lobby' && [...room.members.values()].every(m => !m.ready), 'after the game both players are back, not ready');
  sent.length = 0;
  room.handle('guestguestguest001', { t: 'room:ready', ready: true });
  const notice = sent.find(s => s.id === 'hosthosthosthost01' && s.msg.t === 'notice');
  ok(notice && /Bea wants a rematch/.test(notice.msg.message), `other player is told: "${notice && notice.msg.message}"`);
  room.handle('hosthosthosthost01', { t: 'room:ready', ready: true });
  ok(room.status === 'playing' && room.match, '🔁 rematch starts a new game with the same players once both tap Rematch');
  if (room.match) room.match.destroy();
}

const server = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR }, stdio: 'ignore' });
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
const prof = (p) => p.evaluate(() => { const x = SpadesHadzz.store.getProfile(); return { coins: x.coins, diamonds: x.diamonds, streak: x.loginStreak }; });
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });
async function register(page, name) {
  await page.goto(BASE);
  await waitScreen(page, 'screen-login');
  await page.$eval('[data-auth-mode="register"]', el => el.click());
  await page.evaluate((n) => {
    document.querySelector('#auth-username').value = n;
    document.querySelector('#auth-password').value = 'lion123';
    document.querySelector('#auth-password2').value = 'lion123';
    document.querySelector('.auth-submit').click();
  }, name);
  await waitScreen(page, 'screen-menu');
  await page.waitForFunction(() => SpadesHadzz.networkAdapter.isOnlineReady(), { timeout: 8000 });
}

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'healthz')).ok) break; } catch (e) {} await sleep(100); }
  const A = await openPhone('Ali');
  const B = await openPhone('Bea');
  await Promise.all([register(A, 'Ali'), register(B, 'Bea')]);

  // 1) 🔥 Login streak
  await sleep(1000);
  const p0 = await prof(A);
  ok(p0.coins === 50 && p0.diamonds === 5 && !(await A.$('.streak-overlay')), 'new player still starts with 🦁 50 & 💎 5 (streak starts tomorrow)');
  const streak = async (page) => page.evaluate(() => {
    const p = SpadesHadzz.store.getProfile();
    const d = new Date(); d.setDate(d.getDate() - 1);
    p.lastLoginDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    SpadesHadzz.store.save();
    window.spadesApp.maybeShowLoginStreak();
    return document.querySelector('.streak-card h3')?.textContent || null;
  });
  const t1 = await streak(A);
  const p1 = await prof(A);
  ok(/Day 1/.test(t1) && p1.coins === 60, `next day: "${t1}" and +10 🦁 (now ${p1.coins})`);
  await A.$eval('[data-streak-close]', el => el.click());
  for (let d = 2; d <= 6; d++) { await streak(A); await A.$eval('[data-streak-close]', el => el.click()); }
  const t7 = await streak(A);
  await sleep(700);
  await shot(A, '01-streak-day7');
  const p7 = await prof(A);
  ok(/Day 7/.test(t7) && p7.coins === 60 + 20 + 30 + 40 + 60 + 80 + 100 && p7.diamonds === 6, `day 7 pays 🦁 100 + 💎 1 (now 🦁 ${p7.coins}, 💎 ${p7.diamonds})`);
  await A.$eval('[data-streak-close]', el => el.click());
  ok(await A.evaluate(() => SpadesHadzz.store.claimLoginStreak() === null), 'only once per day');
  await A.evaluate(() => {
    const p = SpadesHadzz.store.getProfile(); p.lastLoginDay = '2020-01-01'; SpadesHadzz.store.save();
  });
  ok(await A.evaluate(() => SpadesHadzz.store.claimLoginStreak().day === 1), 'missing a day starts the streak again at Day 1');

  // 2) 🎨 Table colours in the Shop
  await A.evaluate(() => window.spadesApp.navigateTo('shop'));
  await waitScreen(A, 'screen-shop');
  ok(await A.$$eval('[data-shop-theme]', els => els.length) === 5, 'Shop shows 5 table colours');
  await A.$eval('[data-shop-theme="royal"]', el => el.click());
  await A.evaluate(() => document.querySelector('.choice-overlay [data-choice-tone="yes"]').click());
  await sleep(200);
  ok(await A.evaluate(() => document.body.getAttribute('data-table-theme')) === 'royal', 'bought Royal Blue (150 🦁) and it is in use');
  await shot(A, '02-shop-table-colours');
  await A.evaluate(() => window.spadesApp.navigateTo('game', true));
  await waitScreen(A, 'screen-game');
  await A.waitForSelector('.felt-arena', { timeout: 8000 });
  const bg = await A.$eval('.felt-arena', el => getComputedStyle(el).backgroundImage);
  ok(/29, 78, 216/.test(bg), 'the game table is now royal blue');
  await sleep(6500); // past the 5-second "cat in a hat" intro
  await shot(A, '03-blue-table');

  // 3) 📊 Stats
  await A.evaluate(() => {
    const st = SpadesHadzz.store;
    st.recordRoundStats({ bid: 3, tricks: 4 });
    st.recordRoundStats({ bid: 4, tricks: 2 });
    st.recordRoundStats({ bid: 0, tricks: 0 });
    st.claimReward(null, 0, { gamesPlayed: 2, gamesWon: 1 });
  });
  await A.evaluate(() => { window.spadesApp.game = null; window.spadesApp.navigateTo('profile'); });
  await waitScreen(A, 'screen-profile');
  const stats = await A.$$eval('.stat-tile', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(stats.some(s => /50%.*Win rate/.test(s)) && stats.some(s => /50%.*Bids made.*1 of 2/.test(s)) && stats.some(s => /100%.*Nil success/.test(s)) && stats.some(s => /6.*Tricks won/.test(s)), `stats card: ${stats.slice(0, 4).join(' | ')}`);
  await shot(A, '04-stats');

  // 4) 🏆 Leaderboard
  await B.evaluate(() => SpadesHadzz.store.claimReward(null, 0, { gamesPlayed: 5, gamesWon: 4 }));
  await B.evaluate(() => SpadesHadzz.networkAdapter.reportStats());
  await sleep(300);
  await A.evaluate(() => window.spadesApp.navigateTo('menu'));
  await A.$eval('[data-leaderboard]', el => el.click());
  await A.waitForSelector('.lb-row', { timeout: 8000 });
  await sleep(600);
  const rows = await A.$$eval('.lb-row', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(rows.length === 2 && /Bea/.test(rows[0]) && /4 wins/.test(rows[0]) && /1 win\b/.test(rows[1]) && /Ali.*you/.test(rows[1]), `leaderboard: ${rows.join(' | ')}`);
  ok(/#2 of 2/.test(await A.$eval('.leaderboard-card', el => el.textContent)), 'shows "You are #2 of 2 players"');
  await shot(A, '05-leaderboard');
  await A.$eval('[data-lb-tab="friends"]', el => el.click());
  await A.waitForSelector('.lb-row', { timeout: 8000 });
  const fr = await A.$$eval('.lb-row', els => els.length);
  ok(fr === 1, 'friends tab shows just you until you add friends');

  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.log('FAIL  exception:', e.message);
  failures++;
} finally {
  await browser.close();
  server.kill('SIGTERM');
  console.log(`Screenshots: ${OUT}`);
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL FEATURE TESTS PASSED');
  process.exit(failures ? 1 : 0);
}
