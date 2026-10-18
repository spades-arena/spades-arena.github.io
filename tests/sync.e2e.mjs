// Spades Royale — same account on two devices: purchases & balances follow you (~40s)
// Also checks: no gift limit, bots don't reply in chat, new game speeds.
// Setup once:  cd tests && npm install        Run:  node tests/sync.e2e.mjs
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'spades-sync-'));
const PORT = 20100 + Math.floor(Math.random() * 300);
const DATA_DIR = fs.mkdtempSync(path.join(OUT, 'data-'));
const BASE = `http://127.0.0.1:${PORT}/`;
let failures = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Game speeds (engine only)
const require = createRequire(import.meta.url);
require(path.join(ROOT, 'js/engine.js'));
const SP = globalThis.SpadesHadzz.GAME_SPEEDS;
ok(SP.relaxed.botPlayMs === 1150 && SP.normal.botPlayMs === 600 && SP.normal.trickPauseMs === 1400 && SP.fast.botPlayMs < 300 && SP.fast.label === 'Super Fast',
  `speeds: Relaxed = old Normal (${SP.relaxed.botPlayMs}ms), Normal = old Fast (${SP.normal.botPlayMs}ms), Super Fast ${SP.fast.botPlayMs}ms`);

const server = spawn(process.execPath, [path.join(ROOT, 'server/server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR }, stdio: 'ignore' });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
const errors = [];
async function openDevice(label, ctx) {
  ctx = ctx || await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 900, height: 900 });
  page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/AudioContext|Failed to load resource|WebSocket/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
  return page;
}
const waitScreen = (p, id, timeout = 12000) => p.waitForFunction(i => document.querySelector('.screen-view.active')?.id === i, { timeout }, id);
const prof = (p) => p.evaluate(() => { const x = SpadesHadzz.store.getProfile(); return { coins: x.coins, diamonds: x.diamonds, avatars: x.ownedAvatars.length, skins: [...x.ownedCardSkins].sort().join(','), themes: [...x.ownedTableThemes].sort().join(','), dirty: x.syncDirty }; });
const waitClean = (p) => p.waitForFunction(() => SpadesHadzz.store.getProfile().syncDirty === false, { timeout: 8000 });
async function auth(page, mode, name, pw = 'lion123') {
  await page.goto(BASE);
  await waitScreen(page, 'screen-login');
  await page.$eval(`[data-auth-mode="${mode}"]`, el => el.click());
  await page.evaluate((n, w) => {
    document.querySelector('#auth-username').value = n;
    document.querySelector('#auth-password').value = w;
    const p2 = document.querySelector('#auth-password2'); if (p2) p2.value = w; { const __pin = document.querySelector('#auth-pin'); if (__pin) __pin.value = '1234'; }
    document.querySelector('.auth-submit').click();
  }, name, pw);
  await waitScreen(page, 'screen-menu');
  await page.waitForFunction(() => SpadesHadzz.networkAdapter.isOnlineReady(), { timeout: 8000 });
}

try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE + 'healthz')).ok) break; } catch (e) {} await sleep(100); }

  // 1) Laptop: new account, buy things
  const laptop = await openDevice('laptop');
  await auth(laptop, 'register', 'Hadz2');
  await laptop.evaluate(() => {
    const st = SpadesHadzz.store;
    st.credit({ lions: 1000, diamonds: 20 });
    st.selectOrBuyAvatar('free_panda');
    st.selectOrBuyCardSkin('frost');
    st.selectOrBuyTableTheme('royal');
    st.selectOrBuyTableTheme('galaxy');
  });
  await waitClean(laptop);
  const L1 = await prof(laptop);
  ok(L1.coins === 1050 - 30 - 200 - 150 && L1.diamonds === 25 - 5, `laptop bought avatar, Frost cards, Royal Blue & Galaxy (🦁 ${L1.coins}, 💎 ${L1.diamonds})`);

  // 2) Tablet: log in to the same account → everything is there
  const tablet = await openDevice('tablet');
  await auth(tablet, 'login', 'hadz2');
  await tablet.waitForFunction(() => SpadesHadzz.store.getProfile().ownedTableThemes.includes('galaxy'), { timeout: 8000 });
  const T1 = await prof(tablet);
  ok(T1.coins === L1.coins && T1.diamonds === L1.diamonds && T1.skins === L1.skins && T1.themes === L1.themes && T1.avatars === L1.avatars,
    `tablet sees the laptop's purchases: 🦁 ${T1.coins}, 💎 ${T1.diamonds}, cards ${T1.skins}, tables ${T1.themes}`);

  // 3) Buy on the tablet → laptop updates live
  await tablet.evaluate(() => SpadesHadzz.store.selectOrBuyCardSkin('nebula'));
  await laptop.waitForFunction(() => SpadesHadzz.store.getProfile().ownedCardSkins.includes('nebula'), { timeout: 8000 });
  const L2 = await prof(laptop);
  ok(L2.coins === L1.coins - 400, `tablet bought Neon Nebula → laptop updated live (🦁 ${L2.coins})`);

  // 4) Both change things while the laptop is offline → nothing is lost
  await laptop.evaluate(() => {
    const net = SpadesHadzz.networkAdapter;
    net.connect = () => {}; net.reconnectNow = () => {}; net.scheduleReconnect = () => {};
    net.ws.close();
  });
  await sleep(300);
  await laptop.evaluate(() => { SpadesHadzz.store.credit({ lions: 100, diamonds: 1 }); SpadesHadzz.store.selectOrBuyTableTheme('velvet'); }); // +100 −250, +1 💎
  await tablet.evaluate(() => { SpadesHadzz.store.credit({ lions: 500 }); SpadesHadzz.store.selectOrBuyTableTheme('marble'); }); // +500 −400
  await waitClean(tablet);
  await laptop.evaluate(() => { const net = SpadesHadzz.networkAdapter; delete net.connect; delete net.reconnectNow; delete net.scheduleReconnect; net.connect(); });
  await waitClean(laptop);
  await tablet.waitForFunction(() => SpadesHadzz.store.getProfile().ownedTableThemes.includes('velvet'), { timeout: 8000 });
  const L3 = await prof(laptop);
  const T3 = await prof(tablet);
  const expect = L2.coins + 100 - 250 + 500 - 400;
  ok(L3.coins === expect && T3.coins === expect && L3.diamonds === L2.diamonds + 1 && T3.diamonds === L3.diamonds && L3.themes === T3.themes && /marble/.test(L3.themes) && /velvet/.test(L3.themes),
    `offline changes merged: both devices 🦁 ${L3.coins}/${T3.coins} (expected ${expect}), 💎 ${L3.diamonds}, tables ${L3.themes}`);

  // 5) A device that played before syncing existed keeps its purchases too (first sync merges)
  const oldPhone = await openDevice('oldPhone');
  await oldPhone.goto(BASE);
  await oldPhone.evaluate(() => {
    const st = SpadesHadzz.store; const p = st.getProfile();
    p.ownedAvatars.push('leg_oracle'); p.coins = 5000; delete p.syncedAccount; st.save();
  });
  await auth(oldPhone, 'login', 'Hadz2');
  await oldPhone.waitForFunction(() => SpadesHadzz.store.getProfile().ownedTableThemes.includes('marble'), { timeout: 8000 });
  await waitClean(oldPhone);
  await laptop.waitForFunction(() => SpadesHadzz.store.getProfile().ownedAvatars.includes('leg_oracle'), { timeout: 8000 });
  const O = await prof(oldPhone);
  ok(O.coins === 5000 && (await prof(laptop)).coins === 5000, `old phone's items & bigger balance kept and shared (🦁 ${O.coins} everywhere, Nil Seer avatar on the laptop)`);

  // 6) Another account on the same device starts fresh — it doesn't get Hadz2's stuff
  await oldPhone.evaluate(() => window.spadesApp.signOut());
  await auth(oldPhone, 'register', 'Newbie');
  await sleep(500);
  const N = await prof(oldPhone);
  ok(N.coins === 50 && N.diamonds === 5 && N.themes === 'emerald', `new account on that device starts fresh (🦁 ${N.coins}, 💎 ${N.diamonds}, tables ${N.themes})`);
  await oldPhone.evaluate(() => window.spadesApp.signOut());
  await auth(oldPhone, 'login', 'Hadz2');
  await oldPhone.waitForFunction(() => SpadesHadzz.store.getProfile().coins === 5000, { timeout: 8000 });
  ok(true, 'logging back in to Hadz2 on that device brings its 🦁 5000 & items back');

  // 7) No gift limit
  await auth(await openDevice('friend'), 'register', 'Pal');
  await laptop.evaluate(() => window.spadesApp.showGiftDialog({ via: 'username', to: 'Pal', name: 'Pal' }));
  await laptop.evaluate(() => { document.querySelector('#gift-lions').value = '3000'; document.querySelector('[data-gift-send]').click(); });
  await laptop.waitForFunction(() => /Gift of/.test(document.querySelector('#app-toast').textContent), { timeout: 8000 });
  ok(/3000/.test(await laptop.$eval('#app-toast', el => el.textContent)), `sent a 🦁 3,000 gift (no 500 limit): "${await laptop.$eval('#app-toast', el => el.textContent)}"`);

  // 8) Bots don't reply to your chat
  await laptop.evaluate(() => window.spadesApp.navigateTo('game', true));
  await waitScreen(laptop, 'screen-game');
  await sleep(6000);
  await laptop.evaluate(() => {
    const app = window.spadesApp;
    app.chatDrawerOpen = true; app.renderGameScreen();
  });
  const sent = await laptop.evaluate(() => {
    const input = document.querySelector('#chat-text-input, .chat-text-input, input[data-chat-input]');
    if (!input) return false;
    input.value = 'hello bots';
    const form = input.closest('form');
    if (form) form.requestSubmit(); else document.querySelector('[data-chat-send]')?.click();
    return true;
  });
  await sleep(2500);
  const log = await laptop.evaluate(() => window.spadesApp.chatLog.map(m => `${m.name}: ${m.text}`));
  ok(sent && log.length === 1 && /You: hello bots/.test(log[0]), `bots stay quiet: chat = ${JSON.stringify(log)}`);

  // 9) 🔑 Forgot password → recovery PIN; change password & PIN in Profile
  const pinDev = await openDevice('pinUser');
  await auth(pinDev, 'register', 'PinUser'); // signs up with PIN 1234
  await pinDev.evaluate(() => window.spadesApp.signOut());
  await waitScreen(pinDev, 'screen-login');
  const tryReset = async (pin, pw) => {
    await pinDev.$eval('[data-auth-mode="login"]', el => el.click());
    await pinDev.$eval('[data-auth-mode="reset"]', el => el.click());
    await pinDev.evaluate((n, pin, pw) => {
      document.querySelector('#auth-username').value = n;
      document.querySelector('#auth-pin').value = pin;
      document.querySelector('#auth-password').value = pw;
      document.querySelector('#auth-password2').value = pw;
      document.querySelector('.auth-submit').click();
    }, 'pinuser', pin, pw);
    await sleep(1200);
  };
  await tryReset('9999', 'newpass1');
  const wrongPin = await pinDev.evaluate(() => [document.querySelector('.screen-view.active').id, document.querySelector('#screen-login').innerText]);
  ok(wrongPin[0] === 'screen-login' && /Wrong username or PIN/.test(wrongPin[1]), 'wrong PIN is refused');
  await tryReset('1234', 'newpass1');
  await waitScreen(pinDev, 'screen-menu');
  ok(true, 'forgot password: right PIN + new password logs you straight in');
  await pinDev.evaluate(() => window.spadesApp.signOut());
  await auth(pinDev, 'login', 'PinUser', 'newpass1');
  ok(true, 'the new password works');
  await pinDev.evaluate(() => window.spadesApp.navigateTo('profile'));
  await waitScreen(pinDev, 'screen-profile');
  ok(/PIN set/.test(await pinDev.$eval('.security-card', el => el.textContent)), 'Profile shows the PIN is set');
  await pinDev.evaluate(() => {
    document.querySelector('#pw-old').value = 'newpass1';
    document.querySelector('#pw-new').value = 'secret99';
    document.querySelector('#password-form').requestSubmit();
  });
  await pinDev.waitForFunction(() => /Password changed/.test(document.querySelector('#app-toast').textContent), { timeout: 6000 });
  await pinDev.evaluate(() => {
    document.querySelector('#pin-new').value = '0007';
    document.querySelector('#pin-password').value = 'wrongpw';
    document.querySelector('#pin-form').requestSubmit();
  });
  await pinDev.waitForFunction(() => /password is wrong/.test(document.querySelector('#app-toast').textContent), { timeout: 6000 });
  await pinDev.evaluate(() => {
    document.querySelector('#pin-new').value = '0007';
    document.querySelector('#pin-password').value = 'secret99';
    document.querySelector('#pin-form').requestSubmit();
  });
  await pinDev.waitForFunction(() => /PIN saved/.test(document.querySelector('#app-toast').textContent), { timeout: 6000 });
  ok(true, 'changed password in Profile; PIN change needs the right password; new PIN 0007 saved');
  await pinDev.evaluate(() => window.spadesApp.signOut());
  await waitScreen(pinDev, 'screen-login');
  await tryReset('0007', 'final123');
  await waitScreen(pinDev, 'screen-menu');
  ok(true, 'reset works with the new PIN (0007 — any 4 numbers allowed)');
  await pinDev.screenshot({ path: path.join(OUT, 'pin-menu.png') });

  ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} catch (e) {
  console.log('FAIL  exception:', e.message);
  failures++;
} finally {
  await browser.close();
  server.kill('SIGTERM');
  console.log(`Screenshots: ${OUT}`);
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL SYNC TESTS PASSED');
  process.exit(failures ? 1 : 0);
}
