// Spades Royale — worldwide peer-to-peer rooms test (no game server running!)
// Opens index.html from file:// in separate Chrome sessions ("phones") that connect
// through the free public PeerJS service. Needs internet + `cd tests && npm install`.
// Run:  node tests/p2p.e2e.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'spades-p2p-'));
const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check']
});
const errors = [];

async function phone(label, name) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 420, height: 880 });
  page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
  page.on('dialog', d => d.accept());
  await page.goto(APP);
  await page.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-login', { timeout: 10000 });
  // No server in this test: the account is created on the phone (works on mobile data)
  await page.evaluate(() => document.querySelector('[data-auth-mode="register"]').click());
  await page.evaluate((n) => {
    document.querySelector('#auth-username').value = n;
    document.querySelector('#auth-password').value = 'secret1';
    document.querySelector('#auth-password2').value = 'secret1'; { const __pin = document.querySelector('#auth-pin'); if (__pin) __pin.value = '1234'; }
    document.querySelector('.auth-submit').click();
  }, name);
  await page.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-menu', { timeout: 8000 });
  await page.evaluate(() => window.spadesApp.navigateTo('multiplayer'));
  return page;
}
const tap = async (page, sel) => {
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.$eval(sel, el => el.click());
  if (sel.includes('data-nav')) {
    await sleep(120);
    await page.evaluate(() => { const yes = document.querySelector('.choice-overlay [data-choice-tone="yes"]'); if (yes) yes.click(); });
  }
};
const screen = (page) => page.$eval('.screen-view.active', el => el.id);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

try {
  const A = await phone('Ali (UK)', 'Ali');
  ok(await screen(A) === 'screen-multiplayer', 'Lobby opens without logging in (no server needed)');
  const banner = await A.$eval('#multiplayer-mount .backend-notice-banner', el => el.textContent);
  ok(/Worldwide Rooms/.test(banner), 'Lobby shows free worldwide rooms banner');

  // Host a 2-human room on "Ali's phone"
  await tap(A, '[data-mp-mode="2"]');
  await tap(A, '#mp-create-room-btn');
  await A.waitForSelector('.room-code-value', { timeout: 20000 });
  const code = await A.$eval('.room-code-value', el => el.textContent.trim());
  ok(/^HDZ-[A-Z2-9]{4}$/.test(code), `Ali's phone is hosting room ${code} (registered with free PeerJS matchmaking)`);
  await shot(A, '01-host-room');

  // Invalid code from another phone
  const B = await phone('Bilal (PK)', 'Bilal');
  await B.$eval('#mp-code-input', el => { el.value = 'HDZ-ZZZZ'; });
  await tap(B, '#mp-join-form button[type="submit"]');
  await B.waitForFunction(() => /No room found with code HDZ-ZZZZ/.test(document.querySelector('.state-alert')?.textContent || ''), { timeout: 25000 });
  ok(true, 'unknown code → "No room found" error');

  // Bilal joins with the code (lowercase, no dash)
  await B.$eval('#mp-code-input', (el, c) => { el.value = c; }, code.toLowerCase().replace('-', ''));
  await tap(B, '#mp-join-form button[type="submit"]');
  await B.waitForSelector('.room-code-value', { timeout: 25000 });
  await A.waitForFunction(() => [...document.querySelectorAll('.slot-name')].some(e => e.textContent.includes('Bilal')), { timeout: 10000 });
  const seatsB = await B.$$eval('.slot-name', els => els.map(e => e.textContent.trim()));
  ok(seatsB.some(n => n.includes('Ali')) && seatsB.some(n => n.includes('Bilal (You)')), `Bilal joined over WebRTC; seats: ${seatsB.join(' | ')}`);
  await shot(B, '02-guest-joined');

  // 🎁 Ali gifts Bilal 25 Lions + 1 Diamond from the lobby
  await A.evaluate(() => { const p = SpadesHadzz.store.getProfile(); p.coins = 100; p.diamonds = 3; SpadesHadzz.store.save(); });
  const before = await B.evaluate(() => ({ l: SpadesHadzz.store.getProfile().coins, d: SpadesHadzz.store.getProfile().diamonds }));
  await tap(A, '[data-gift-room]');
  await A.waitForSelector('#gift-lions', { timeout: 5000 });
  await A.evaluate(() => { document.querySelector('#gift-lions').value = '25'; document.querySelector('#gift-diamonds').value = '1'; document.querySelector('[data-gift-send]').click(); });
  await B.waitForFunction((b) => SpadesHadzz.store.getProfile().coins === b.l + 25 && SpadesHadzz.store.getProfile().diamonds === b.d + 1, { timeout: 15000 }, before);
  const aAfter = await A.evaluate(() => ({ l: SpadesHadzz.store.getProfile().coins, d: SpadesHadzz.store.getProfile().diamonds }));
  ok(aAfter.l === 75 && aAfter.d === 2, `🎁 gift delivered over P2P: Bilal +25 🦁 +1 💎, Ali now ${aAfter.l} 🦁 / ${aAfter.d} 💎`);
  const overGift = await A.evaluate(() => SpadesHadzz.networkAdapter.sendGift({ via: 'room', to: 'x', lions: 999999 }));
  ok(!overGift.ok && overGift.funds, 'cannot gift more than you have');

  // Ready → match on both phones
  await tap(A, '#mp-toggle-ready-btn');
  await sleep(300);
  await tap(B, '#mp-toggle-ready-btn');
  await A.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-game', { timeout: 15000 });
  await B.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-game', { timeout: 15000 });
  ok(true, 'match starts on both phones');
  const handA = await A.$$eval('.player-hand-row .hand-card', els => els.map(e => e.dataset.cardId));
  const handB = await B.$$eval('.player-hand-row .hand-card', els => els.map(e => e.dataset.cardId));
  ok(handA.length === 13 && handB.length === 13 && !handA.some(c => handB.includes(c)), 'each phone sees only its own 13 cards');
  const leak = await B.evaluate(() => JSON.stringify(window.spadesApp.onlineSnapshot.players).includes('"hand"'));
  ok(!leak, 'guest never receives other players’ hands');

  // Play a few tricks
  await sleep(4300); // intro
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    for (const P of [A, B]) {
      await P.evaluate(() => {
        const b = document.querySelector('[data-bid-val="3"]');
        if (b) return b.click();
        const c = document.querySelector('.card-legal-ready');
        if (c) c.click();
      });
    }
    const trick = await A.evaluate(() => window.spadesApp.game.trickNumber);
    if (trick >= 3) break;
    await sleep(350);
  }
  const tA = await A.evaluate(() => window.spadesApp.game.trickNumber);
  const tB = await B.evaluate(() => window.spadesApp.game.trickNumber);
  ok(tA >= 3 && tA === tB, `play stays in sync over P2P (trick ${tA} on both phones)`);
  await shot(B, '03-guest-table');

  // Chat
  await tap(B, '#toggle-chat-btn');
  await tap(B, '[data-qc-id="qc_good_game"]');
  await A.waitForFunction(() => [...document.querySelectorAll('.chat-bubble')].some(b => b.textContent.includes('Good game!')), { timeout: 8000 });
  ok(true, 'quick chat reaches the host');

  // Typed chat: everyone, team-only, and HTML is shown as text (no injection)
  await B.evaluate(() => { if (!document.querySelector('#chat-text-input')) document.querySelector('#toggle-chat-btn').click(); });
  await B.waitForSelector('#chat-text-input', { timeout: 5000 });
  await B.evaluate(() => { const i = document.querySelector('#chat-text-input'); i.value = 'Salam from Pakistan 🇵🇰'; document.querySelector('#chat-text-form button').click(); });
  await A.waitForFunction(() => window.spadesApp.chatLog.some(m => m.text === 'Salam from Pakistan 🇵🇰' && m.to === 'all'), { timeout: 8000 });
  const bubbleA = await A.$$eval('.chat-bubble', els => els.map(e => e.textContent));
  ok(bubbleA.some(t => t.includes('Salam from Pakistan')), 'typed message reaches the other phone (bubble + chat log)');
  ok(Boolean(await B.$('[data-chat-to="team"]')), 'partners get a "Team only" option');
  await B.evaluate(() => document.querySelector('[data-chat-to="team"]').click());
  await sleep(1100);
  await B.evaluate(() => { const i = document.querySelector('#chat-text-input'); i.value = '<img src=x onerror=alert(1)> play spades'; document.querySelector('#chat-text-form button').click(); });
  await A.waitForFunction(() => window.spadesApp.chatLog.some(m => m.to === 'team'), { timeout: 8000 });
  ok(!(await A.$('.chat-bubble img, .chat-log img')), 'team message delivered and HTML is shown as plain text');
  const unread = await A.$eval('#toggle-chat-btn', el => el.textContent);
  ok(/\d/.test(unread), `unread badge on the host's Chat button ("${unread.trim()}")`);
  await shot(B, '03b-chat');

  // Guest app restarts → auto-rejoins the same seat
  const handBefore = await B.$$eval('.player-hand-row .hand-card', els => els.length);
  await B.reload();
  await B.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-login', { timeout: 8000 }).catch(() => {});
  await B.evaluate(() => { const g = document.querySelector('.auth-guest-btn'); if (g) g.click(); });
  await B.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-game', { timeout: 30000 });
  const handAfter = await B.$$eval('.player-hand-row .hand-card', els => els.length);
  ok(handAfter > 0 && handAfter <= handBefore, `guest app restart → auto-rejoined the game with their hand (${handAfter} cards)`);

  // Host app restarts → room reopens with the same code and the guest reconnects
  const roundBefore = await A.evaluate(() => window.spadesApp.onlineSnapshot.seq);
  await A.reload();
  await A.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-login', { timeout: 8000 }).catch(() => {});
  await A.evaluate(() => { const g = document.querySelector('.auth-guest-btn'); if (g) g.click(); });
  await A.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-game', { timeout: 45000 });
  await B.waitForFunction(() => /Reconnected to the host/.test(document.getElementById('app-toast')?.textContent || '') || window.SpadesHadzz.networkAdapter.state.p2pStatus === 'joined', { timeout: 60000 });
  const restored = await A.evaluate(() => ({ code: SpadesHadzz.networkAdapter.state.roomCode, cards: document.querySelectorAll('.player-hand-row .hand-card').length }));
  ok(restored.code === code && restored.cards > 0, `host app restart → room ${restored.code} reopened with the game restored (${restored.cards} cards) and the guest reconnected`);

  // Host quits → guest is told the room closed
  await A.evaluate(() => window.spadesApp.quitOnlineMatch(true));
  await B.waitForFunction(() => /room has closed|host closed|closed the room/i.test(document.getElementById('app-toast')?.textContent || ''), { timeout: 15000 });
  ok(true, 'when the host leaves, the guest is told the room closed');

  // 3-player room
  const C = await phone('Chen (US)', 'Chen');
  const D = await phone('Dua (UAE)', 'Dua');
  await tap(C, '[data-mp-mode="3"]');
  await tap(C, '#mp-create-room-btn');
  await C.waitForSelector('.room-code-value', { timeout: 20000 });
  const code3 = await C.$eval('.room-code-value', el => el.textContent.trim());
  for (const P of [D, B]) {
    await P.evaluate(() => window.spadesApp.navigateTo('multiplayer'));
    await P.$eval('#mp-code-input', (el, c) => { el.value = c; }, code3);
    await tap(P, '#mp-join-form button[type="submit"]');
    await P.waitForSelector('.room-code-value', { timeout: 25000 });
  }
  await C.waitForFunction(() => document.querySelectorAll('.lobby-seat-slot .slot-name').length === 3 && ![...document.querySelectorAll('.slot-name')].some(e => /Open/.test(e.textContent)), { timeout: 10000 });
  for (const P of [C, D, B]) await tap(P, '#mp-toggle-ready-btn');
  await C.waitForFunction(() => document.querySelector('.screen-view.active')?.id === 'screen-game', { timeout: 15000 });
  const three = await D.evaluate(() => ({ cards: document.querySelectorAll('.player-hand-row .hand-card').length, pills: document.querySelectorAll('.team-score-pill').length }));
  ok(three.cards === 17 && three.pills === 3, '3-player worldwide room: 17 cards each, 3 colour scores');
  await sleep(4500);
  await shot(D, '04-three-player-p2p');
} catch (e) {
  ok(false, `exception: ${e.message}`);
} finally {
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' || ') : ''}`);
  await browser.close();
  console.log(`Screenshots: ${OUT}`);
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL P2P TESTS PASSED');
  process.exit(failures ? 1 : 0);
}
