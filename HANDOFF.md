# Spades Royale — where we left off (18 Oct 2026, evening)

*Play. Win. Rule.* — made by Hadzz. Version **1.0.13** is live (apps + website + Render server all updated).

## Links
| What | Where |
|---|---|
| Download page (Android / Windows / Mac / iPhone) | https://spades-royale.github.io |
| Play in a browser (iPhone & iPad) | https://spades-royale.github.io/play/ |
| Code on GitHub (account `spades-royale`) | https://github.com/spades-royale/spades-royale.github.io |
| Build status | https://github.com/spades-royale/spades-royale.github.io/actions |
| Online login server (Render, free) | https://spades-royale.onrender.com (dashboard.render.com → spades-royale) |
| Account storage (Upstash, free) | console.upstash.com → database `spades` |

## How updates work
1. Edit the modular files (`styles.css`, `js/*.js`, `server/*.js`), then run `python3 bundle.py` to rebuild `index.html`.
2. Run the tests in `tests/`. Each file has a short note at the top on how to run it.
3. Push to `main` on GitHub. GitHub Actions (`.github/workflows/release.yml`) then:
   - builds the Android APK, the Windows .exe and the Mac .dmg;
   - publishes a release and updates the download page and `version.json`.
4. Installed apps show an **"Update available"** popup when a newer version is out. iPhone players play the website version, which is always up to date.
5. Reinstall on the Mac:
   1. Download the new .dmg and copy the app to `/Applications`.
   2. Run `xattr -cr "/Applications/Spades Royale.app"` so macOS lets it open.

## Owner account
- Username **hadzz**, with unlimited Lions & Diamonds (shown as ∞).
- The password is **not** stored in the code. It lives only in Render → spades-royale → Environment → `SPADES_ADMIN_PASSWORD`.

## Keep safe (back these up)
- **`~/Documents/Spades-Royale-signing-key/`** — the Android signing key and its password note.
  - Lose it and Android updates can no longer install over the old app.
  - A copy is also stored as GitHub secrets (`ANDROID_KEYSTORE_*`).
- The Upstash URL and token are in Render's Environment settings. They were pasted in chat once, so you may want to make a new token later.

## Features (all done)
**Game**
- Offline vs bots: 4-player teams and 3-player solo.
- Pass & Play on one device.
- Online rooms with friends worldwide: phone-hosted with a room code (peer-to-peer).

**Accounts & friends**
- Online accounts on Render, saved in Upstash. Login waits up to 1 minute while the free server wakes.
- Friends, invites, and Add Friend by tapping a player at the table (8-second ✓/✗ popup).

**Lions, Diamonds & gifts**
- Lions & Diamonds: start with 50 Lions and 5 Diamonds; a game costs 2 Lions; a win pays +50 (250 pts) or +80 (500 pts).
- Gifts by username from the Shop. Players who are offline get them next time they open the app.

**Shop & profile**
- Avatars (5 free) and diamond avatars.
- 5 card designs.
- Table colours for Lions plus 6 💎 VIP tables.
- Profile photo; sell items for half price.
- Name change: first one free, then 💎 50 each time.

**Daily & social extras**
- Daily login streak: day 7 gives 100 Lions + 1 Diamond.
- Daily +1 Diamond.
- Leaderboard (everyone / friends).
- Stats card on Profile.
- Rematch after online games.
- Chat (everyone / team), redeal your hand for 350 Lions.

**Branding**
- 5-second loading screen with the gold Hadzz signature and the "no-ad game" note.

## Added in v1.0.11 – v1.0.13
- **Purchases sync across devices:** Lions, Diamonds, owned avatars, cards, tables, stats and streaks follow the online account.
  - The server keeps a versioned master copy.
  - Each device sends changes on top of that copy, so offline changes are merged, not lost.
  - A device that played before sync existed merges once: union of items, higher balance.
  - Logging into another account on the same device starts that account fresh.
- **Recovery PIN:** sign-up asks for a 4-digit PIN (any numbers).
  - "Forgot password?" on the login screen: username + PIN + new password.
  - Profile has "Change password" and "Set / change PIN".
- **Lobby:** the team buttons show who's on each team and how many spots are free, plus a hint about which team your friend is on.
- **Gifts:** no 500 limit. The cap is 1 billion per gift. Added +1,000 / +10,000 / All buttons.
- **Chat:** bots no longer reply to your chat.
- **Speeds:** Relaxed = old Normal, Normal = old Fast, and Fast = Super Fast.
- 💎 VIP tables (6, bought with Diamonds).
- Name change: first one free, then 💎 50 each time.

## To do next time
- [ ] **hadzz** has no recovery PIN yet: Profile → Set PIN.
- [ ] Open the app on the laptop where the purchases were made, so they merge into the account. The server copy only had 1 table and 6 avatars on 18 Oct.
- [ ] **Render Deploy Hook:** the server doesn't update itself when code is pushed.
  - Go to Render → spades-royale → Settings → **Deploy Hook**, copy the link and give it to Claude to wire into the GitHub build.
  - Until then, after every update that changes `server/`, click **Manual Deploy → Deploy latest commit**.
  - Otherwise new server features (and limits) won't work. Done manually for v1.0.13 on 18 Oct.
- [ ] Test the Android APK and the Windows installer on real devices.
- [ ] Optional: make a new Upstash token. Optional: remove the GitHub CLI access at github.com/settings/applications.
- Ideas not built yet:
  - spin wheel;
  - achievements & badges;
  - WhatsApp invite link;
  - hint button;
  - house rules (Blind Nil, bag limits);
  - how-to-play tutorial;
  - emote packs.

## Notes for Claude
- The project memory is in `~/.claude/projects/-Users-hadzz-Documents-Spades/memory/`.
- The user wants free-only services and quick, autonomous work: test, push, then reinstall on the Mac.
- The GitHub CLI login lives in that session's scratchpad. In a new session, log in again with `gh auth login --web` (device code).

## Session end — 18 Oct 2026 (late)
- Uploaded **v2.0.15**:
  - red-first team colours (your team is shown as Red);
  - 2-player rooms: Play Together / Play Against Each Other, with teams locked;
  - VIP welcome on Home;
  - bigger hand and table cards with a gold glow on playable cards;
  - owner balance shows 1B;
  - small-phone top bar fix.
- ⚠️ The **test suites were NOT run on the v2 changes**: the user stopped the run. Run all of `tests/*.mjs` first next time.
- Requested but **not started**:
  - a **green theme "like real Spades"** for v2;
  - "make the app fresh": ask whether that means a fresh look, or wiping all accounts. **Don't wipe without confirming.**
- Server code didn't change since the v1.0.13 Render deploy, so Render is up to date (the user may redeploy anyway).

## v3.0.20 — live 19 Oct 2026 (apps + website + Render all updated)
- Version numbers are now **3.0.<build>**.
  - Never go back to a lower number: update checks and the server's minimum version both compare numbers.
- **Required updates:**
  - Apps from v2.0.17 on show a full-screen update message with no "Later" button.
  - The server rejects logins from apps older than `MIN_APP_VERSION` (default **2.0.17**, in `server/server.js`; set the env var `''` to turn it off).
- **Cards:** sized from the screen height (`--card-h`). Phones use 2 non-overlapping rows (7 + 6), so each card is about 48px wide for a finger. The table is shorter.
- **Trick winner:** a slim 2-second strip at the top of the table says who won. The winner's name tag turns gold (no pop-out, as the user asked) and the winning card gets a gold glow and 👑.
  - The user REJECTED a big banner in the middle of the table, and a pop-out name.
  - The pause after each trick is 1.5–2s on every speed.
- **Spades broken:** crack + glass-shatter sound, and crack lines flash over the table for about 1s.
- **Opening screen:** 3 seconds.
- **Colours:** red is the main colour (your team shows as Red). It's display-only: internal team ids are still 'blue' (seats 0/2) and 'red'.
- **2-player rooms:** the host picks Play Together or Play Against Each Other, and teams are locked.
- **Still to do:** green "real Spades" theme (asked for, not started); Render Deploy Hook.
