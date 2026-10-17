# Spades Royale — where we left off (18 Oct 2026)

*Play. Win. Rule.* — made by Hadzz. Version **1.0.10** is live.

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

## To do next time
- [ ] **Render Deploy Hook:** the server doesn't update itself when code is pushed.
  - Go to Render → spades-royale → Settings → **Deploy Hook**, copy the link and give it to Claude to wire into the GitHub build.
  - Until then, click **Manual Deploy → Deploy latest commit** after each update.
  - This is needed for the **leaderboard** to work online.
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
