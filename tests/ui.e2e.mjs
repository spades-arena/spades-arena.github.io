// Spades Arena — fast browser smoke test (~1–2 min)
// Setup once:  cd tests && npm install        Run:  node tests/ui.e2e.mjs
// Uses your installed Chrome (override with CHROME_PATH). Starts its own game server.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'spades-ui-'));
const PORT = 19000 + Math.floor(Math.random() * 500);
const DATA_DIR = fs.mkdtempSync(path.join(OUT, 'data-'));
const BASE = `http://127.0.0.1:${PORT}/`;
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR }, stdio: 'ignore' });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
const errors = [];

async function openPhone(label) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 420, height: 880 });
  page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/AudioContext|Failed to load resource|WebSocket/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
  page.on('dialog', d => d.accept());
  return page;
}
const screen = (p) => p.$eval('.screen-view.active', el => el.id);
const waitScreen = (p, id, timeout = 10000) => p.waitForFunction(i => document.querySelector('.screen-view.active')?.id === i, { timeout }, id);
const tap = async (p, sel) => { await p.waitForSelector(sel, { timeout: 8000 }); await p.$eval(sel, el => el.click()); await sleep(80); };
const yes = (p) => p.evaluate(() => { const b = document.querySelector('.choice-overlay [data-choice-tone="yes"]'); if (b) b.click(); return Boolean(b); });
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `${name}.png`) });
const prof = (p) => p.evaluate(() => { const x = SpadesHadzz.store.getProfile(); return { coins: x.coins, diamonds: x.diamonds, avatar: x.selectedAvatar, name: x.username }; });

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'healthz')).ok) break; } catch (e) {} await sleep(100); }
  const A = await openPhone('Ali');
  const t0 = Date.now();
  await A.goto(BASE);

  // 1) Opening screen: logo, Play · Win · Rule, no-ads note, gold signature — no bars
  await sleep(600);
  const loading = await A.evaluate(() => ({
    screen: document.querySelector('.screen-view.active').id,
    sub: document.querySelector('.loading-subtitle').textContent,
    noads: document.querySelector('#loading-noads').textContent,
    sig: getComputedStyle(document.querySelector('#screen-loading .hadzz-signature')).maskImage || getComputedStyle(document.querySelector('#screen-loading .hadzz-signature')).webkitMaskImage,
    madeBy: document.querySelector('#screen-loading .signature-caption').textContent,
    topbar: document.getElementById('app-topbar').classList.contains('hidden'),
    nav: document.getElementById('android-bottom-nav').classList.contains('hidden')
  }));
  ok(loading.screen === 'screen-loading' && /Premium · Fierce · Competitive/.test(loading.sub) && /no-ad/.test(loading.noads) && /data:image\/png/.test(loading.sig) && /Made by Hadzz/i.test(loading.madeBy) && loading.topbar && loading.nav,
    'opening screen: Spades Arena · Premium · Fierce · Competitive, "no-ad game", gold Hadzz signature + "Made by Hadzz", no bars');
  await shot(A, '01-loading');
  await waitScreen(A, 'screen-login', 9000);
  const loadMs = Date.now() - t0;
  ok(loadMs >= 2800 && loadMs < 4500, `opening screen lasts 3 seconds (${(loadMs / 1000).toFixed(1)}s) and can't be skipped`);

  // 2) Login is mandatory and the login page has no other buttons
  const login = await A.evaluate(() => ({
    topbar: document.getElementById('app-topbar').classList.contains('hidden'),
    nav: document.getElementById('android-bottom-nav').classList.contains('hidden'),
    guest: Boolean(document.querySelector('.auth-guest-btn')),
    otherNav: document.querySelectorAll('#screen-login [data-nav]').length
  }));
  ok(login.topbar && login.nav && !login.guest && login.otherNav === 0, 'login page: no top bar, no bottom bar, no guest/menu buttons');
  await A.evaluate(() => window.spadesApp.navigateTo('menu'));
  ok(await screen(A) === 'screen-login', 'cannot open the app without logging in');
  await tap(A, '[data-auth-mode="register"]');
  await A.evaluate(() => { document.querySelector('#auth-username').value = 'Ali'; document.querySelector('#auth-password').value = 'lion123'; document.querySelector('#auth-password2').value = 'lion123'; { const __pin = document.querySelector('#auth-pin'); if (__pin) __pin.value = '1234'; } document.querySelector('.auth-submit').click(); });
  await waitScreen(A, 'screen-menu');
  const fresh = await prof(A);
  ok(fresh.coins === 50 && fresh.diamonds === 5, `new account starts with 🦁 ${fresh.coins} and 💎 ${fresh.diamonds}`);
  await shot(A, '02-login-done-menu');

  // 3) Top bar & bottom bar
  const bars = await A.evaluate(() => ({
    difficulty: Boolean(document.querySelector('[data-hud-difficulty]:not(.menu-quick-status *)') && document.querySelector('#app-topbar [data-hud-difficulty]')),
    gift: Boolean(document.querySelector('#app-topbar [data-nav="gift"]')),
    avatar: Boolean(document.querySelector('#app-topbar .hud-avatar-btn[data-nav="profile"]')),
    sig: Boolean(document.querySelector('#app-topbar .hadzz-signature')),
    navItems: [...document.querySelectorAll('#android-bottom-nav .bnav-item')].map(b => b.dataset.nav)
  }));
  ok(!bars.difficulty && bars.gift && bars.avatar && bars.sig, 'top bar: 🎁 Gift button, your avatar opens Profile, small signature');
  ok(!bars.navItems.includes('profile') && bars.navItems.join() === 'menu,game,multiplayer,friends,shop,settings', `bottom bar has SHOP right before Settings: ${bars.navItems.join(', ')}`);

  // 4) Reload keeps you where you were (no loading screen)
  await tap(A, '#android-bottom-nav [data-nav="shop"]');
  await waitScreen(A, 'screen-shop');
  const r0 = Date.now();
  await A.reload();
  await waitScreen(A, 'screen-shop', 4000);
  ok(Date.now() - r0 < 3500, `reloading the page returns straight to the Shop (${Date.now() - r0} ms, no loading screen)`);

  // 5) Shop: buy, not-enough → soft chime, Profile: sell for half price, photo, name
  const grid = await A.evaluate(() => [...document.querySelectorAll('.arena-cat')].map(c => `${c.querySelectorAll('.arena-item:not(.locked)').length}+${c.querySelectorAll('.arena-item.locked').length}`).join(' '));
  ok(grid === '8+2 8+2 8+2', `shop: 3 categories × 8 items + 2 Coming Soon (${grid})`);
  await A.evaluate(() => { SpadesHadzz.store.credit({ lions: 80 }); });
  await A.waitForSelector('[data-shop-buy^="card:cd_gold"]');
  await tap(A, '[data-shop-buy^="card:cd_gold"]');
  await yes(A);
  await sleep(200);
  ok((await prof(A)).coins === 30 && await A.evaluate(() => SpadesHadzz.store.getProfile().selectedCardSkin === 'cd_gold'), 'bought & equipped Royal Gold cards for 100 🦁 (130 → 30)');
  const chime = await A.evaluate(() => {
    let soft = 0; const o = SpadesHadzz.audio.notEnoughFunds; SpadesHadzz.audio.notEnoughFunds = () => { soft++; };
    document.querySelector('[data-shop-buy^="avatar:av_legend"]').click();
    SpadesHadzz.audio.notEnoughFunds = o; return soft;
  });
  ok(chime === 1, 'can’t afford → soft "need Coins" chime');
  await shot(A, '03-shop');
  await tap(A, '.hud-avatar-btn');
  await waitScreen(A, 'screen-profile');
  await tap(A, '[data-sell-skin="cd_gold"]');
  await yes(A);
  await sleep(200);
  ok((await prof(A)).coins === 80, 'sold it back for half price (+50 🦁)');
  const png = path.join(OUT, 'me.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQEAA/jB/l8IqiyAAAAAElFTkSuQmCC', 'base64'));
  const input = await A.$('#photo-input');
  await input.uploadFile(png);
  await A.waitForFunction(() => SpadesHadzz.store.getProfile().selectedAvatar === 'photo', { timeout: 5000 });
  ok(await A.evaluate(() => Boolean(document.querySelector('.hud-avatar-btn img.avatar-photo')) && /^data:image\/jpeg/.test(SpadesHadzz.store.getProfile().photo)), 'profile photo from the gallery is used (top bar shows it)');
  await A.evaluate(() => { document.querySelector('#username-input').value = 'AliKing'; document.querySelector('#username-form button').click(); });
  await A.waitForFunction(() => SpadesHadzz.store.getProfile().username === 'AliKing', { timeout: 5000 });
  ok(true, 'name changed to AliKing');
  await shot(A, '04-profile');

  // 6) Offline game: 2 🦁 entry, 5s intro with signature, avatars at the table, round-only badge
  await tap(A, '#android-bottom-nav [data-nav="menu"]');
  await tap(A, '.menu-tile[data-offline-seats="4"]');
  await waitScreen(A, 'screen-game');
  ok((await prof(A)).coins === 78, 'starting a game costs 🦁 2 (80 → 78)');
  ok(await A.evaluate(() => Boolean(document.querySelector('.game-intro .hadzz-signature')) && /Made by Hadzz/i.test(document.querySelector('.game-intro').textContent)), 'game-start intro shows the gold signature + Made by Hadzz');
  const i0 = Date.now();
  await A.waitForFunction(() => !document.querySelector('.game-intro'), { timeout: 8000 });
  ok(Date.now() - i0 >= 4000, `game intro lasts ~5 seconds (${((Date.now() - i0) / 1000 + 0.3).toFixed(1)}s)`);
  const table = await A.evaluate(() => ({ avatars: document.querySelectorAll('.table-edge-seat .edge-avatar').length, badge: document.querySelector('.rcb-top').textContent.trim(), photo: Boolean(document.querySelector('.seat-south .edge-avatar img')) }));
  ok(table.avatars === 4 && table.photo && table.badge === 'Round 1', `table: avatars next to every name (yours = your photo), badge "${table.badge}"`);

  // 7) Redeal only your hand for 350 🦁
  ok(/350/.test(await A.$eval('#redeal-bid-btn', el => el.textContent)), 'redeal costs 🦁 350');
  const before = await A.evaluate(() => { SpadesHadzz.store.getProfile().coins = 400; SpadesHadzz.store.save(); const g = window.spadesApp.game; return { me: g.players[0].hand.map(c => c.id).join(), all: g.players.flatMap(p => p.hand.map(c => c.id)).sort().join(), round: g.roundNumber }; });
  await tap(A, '#redeal-bid-btn');
  await A.evaluate(() => [...document.querySelectorAll('.choice-overlay [data-choice]')].find(b => /Redeal for/.test(b.textContent)).click());
  await sleep(300);
  const after = await A.evaluate(() => { const g = window.spadesApp.game; return { me: g.players[0].hand.map(c => c.id).join(), all: g.players.flatMap(p => p.hand.map(c => c.id)).sort().join(), round: g.roundNumber, coins: SpadesHadzz.store.getProfile().coins, n: g.players[0].hand.length }; });
  ok(after.me !== before.me && after.all === before.all && after.round === before.round && after.coins === 50 && after.n === 13, 'redeal gives YOU a fresh 13-card hand (same deck, same round, −350 🦁)');

  // 8) Typed chat works in bot games
  await tap(A, '#toggle-chat-btn');
  await A.evaluate(() => { document.querySelector('#chat-text-input').value = 'Let’s go team!'; document.querySelector('#chat-text-form button').click(); });
  await A.waitForFunction(() => [...document.querySelectorAll('.seat-south .chat-bubble')].some(b => /Let’s go team/.test(b.textContent)), { timeout: 3000 });
  ok(true, 'typed chat works in games against bots (your bubble shows)');
  await tap(A, '#toggle-chat-btn');
  await shot(A, '05-table');

  // 9) Win → Collect (+80 at 500 pts, +2 entry back, +10 round) → "Collected", confetti
  await A.evaluate(() => {
    const app = window.spadesApp; const g = app.game;
    g.teamScores = [480, 100];
    g.players.forEach((p, i) => { p.bid = 3; p.tricks = [5, 2, 4, 2][i]; });
    g.phase = 'playing';
    app.evaluateRoundEnd();
  });
  await A.waitForSelector('#collect-reward-btn', { timeout: 3000 });
  const collectText = await A.$eval('#collect-reward-btn', el => el.textContent.replace(/\s+/g, ' '));
  const coinIcon = await A.$eval('#collect-reward-btn', el => Boolean(el.querySelector('.cur-icon.cur-coin')));
  ok(coinIcon && /Collect\s*\+92/.test(collectText) && /\+80 Game Win/.test(collectText) && /2 entry back/.test(collectText), `win shows "${collectText.trim()}" with the gold coin icon`);
  ok(Boolean(await A.waitForSelector('.confetti-layer', { timeout: 3000 }).catch(() => null)), '🎉 confetti celebration on a game win');
  const c0 = (await prof(A)).coins;
  await tap(A, '#collect-reward-btn');
  await A.waitForSelector('#reward-collected', { timeout: 3000 });
  const c1 = (await prof(A)).coins;
  ok(c1 === c0 + 92 && /Collected/.test(await A.$eval('#reward-collected', el => el.textContent)), `tapping Collect pays once and says "✓ Collected" (${c0} → ${c1})`);
  await shot(A, '06-collected');
  ok(await A.evaluate(() => SpadesHadzz.store.gameWinLions(250) === 50 && SpadesHadzz.store.gameWinLions(500) === 80), 'game win prize: 50 🦁 at 250 pts, 80 🦁 at 500 pts');

  // 10) Not enough Coins for a game → must sell something (half price)
  await A.evaluate(() => { const p = SpadesHadzz.store.getProfile(); p.coins = 1; p.ownedCardSkins.push('frost'); SpadesHadzz.store.save(); });
  await tap(A, '[data-nav="menu"]');
  await tap(A, '.menu-tile[data-offline-seats="4"]');
  await A.waitForSelector('.choice-overlay', { timeout: 3000 });
  const dlg = await A.$eval('.choice-card', el => el.textContent);
  ok(/Not enough Coins/.test(dlg) && /half/.test(dlg), 'can’t afford a game → asked to sell an avatar or card design for half price');
  await yes(A);
  await waitScreen(A, 'screen-profile');
  await tap(A, '[data-sell-skin="frost"]');
  await yes(A);
  await sleep(200);
  ok((await prof(A)).coins === 101, 'sold Frost Pearl cards for 100 🦁 (half of 200)');

  // 11) Settings: calming sounds
  await tap(A, '#android-bottom-nav [data-nav="settings"]');
  await waitScreen(A, 'screen-settings');
  const amb = await A.evaluate(() => [...document.querySelectorAll('[data-set-ambience]')].map(b => b.dataset.setAmbience));
  await tap(A, '[data-set-ambience="rain"]');
  ok(amb.join() === 'lounge,rain,ocean,piano' && await A.evaluate(() => SpadesHadzz.store.getSettings().ambience === 'rain' && SpadesHadzz.store.getSettings().music === true) && Boolean(await A.$('#music-volume')),
    'Settings: calming sounds (Lounge / Soft Rain / Ocean / Piano) + volume');
  await shot(A, '07-settings');

  // 12) Pass & Play: no avatars at the table
  await tap(A, '[data-nav="menu"]');
  await tap(A, '.menu-tile[data-nav="passplay"]');
  await tap(A, '#pp-start-btn');
  await waitScreen(A, 'screen-game');
  ok(await A.evaluate(() => document.querySelectorAll('.table-edge-seat .edge-avatar').length === 0), 'Pass & Play: no avatars on the table');
  await A.evaluate(() => { const b = document.querySelector('#leave-local-btn'); b.click(); });
  await yes(A);

  // 13) Sign out → login screen
  await tap(A, '.hud-avatar-btn');
  await waitScreen(A, 'screen-profile');
  await tap(A, '#profile-logout-btn');
  await yes(A);
  await waitScreen(A, 'screen-login');
  ok(true, 'sign out returns to the login screen');
} catch (e) {
  ok(false, `exception: ${e.message}`);
} finally {
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' || ') : ''}`);
  await browser.close();
  server.kill('SIGTERM');
  console.log(`Screenshots: ${OUT}`);
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL UI TESTS PASSED');
  process.exit(failures ? 1 : 0);
}
