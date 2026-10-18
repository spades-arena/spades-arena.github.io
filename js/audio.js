/**
 * Spades by Hadzz - Procedural Sound, Music & Android Haptics Engine
 * Zero external audio assets required; respects user sound & music settings.
 */
(function (root) {
  const SH = (root.SpadesHadzz = root.SpadesHadzz || {});

  class SoundController {
    constructor() {
      this.ctx = null;
      this.soundEnabled = true;
      this.hapticsEnabled = true;
      this.musicEnabled = false;
      this.musicTimer = null;
      this.musicStep = 0;
    }

    vibrate(pattern) {
      if (!this.hapticsEnabled) return;
      try {
        // Online events can arrive before the first tap; browsers block vibration until then
        const activated = typeof navigator !== 'undefined' && (!navigator.userActivation || navigator.userActivation.hasBeenActive);
        if (activated && typeof navigator.vibrate === 'function') {
          navigator.vibrate(pattern);
        }
      } catch (e) {
        // Ignore on devices without vibration hardware
      }
    }

    ensureContext() {
      if (typeof window === 'undefined') return;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    }

    applySettings({ sound, music, haptics, ambience = 'lounge', musicVolume = 0.6 }) {
      this.soundEnabled = Boolean(sound);
      this.hapticsEnabled = haptics !== false;
      this.musicVolume = Math.max(0, Math.min(1, Number(musicVolume)));
      if (this.musicGain && this.ctx) this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.2);
      const shouldPlayMusic = Boolean(music);
      const ambienceChanged = ambience !== this.ambience;
      this.ambience = ambience;
      if (shouldPlayMusic !== this.musicEnabled || (shouldPlayMusic && ambienceChanged)) {
        this.musicEnabled = shouldPlayMusic;
        if (this.musicEnabled) {
          this.startAmbientLoop();
        } else {
          this.stopAmbientLoop();
        }
      }
    }

    playTone(freq, durationMs, type = 'sine', gainLevel = 0.08, slideFreq = null) {
      if (!this.soundEnabled || typeof window === 'undefined') return;
      this.ensureContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideFreq) {
        osc.frequency.exponentialRampToValueAtTime(slideFreq, now + durationMs / 1000);
      }

      gain.gain.setValueAtTime(gainLevel, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + durationMs / 1000);
    }

    /** Cached 1s of white noise used to synthesize paper / card sounds. */
    getNoiseBuffer() {
      if (this.noiseBuffer) return this.noiseBuffer;
      const length = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
      return buffer;
    }

    /**
     * Filtered-noise burst: a band-pass sweep (fromHz → toHz) shaped by a quick
     * attack and soft decay — sounds like paper sliding across felt.
     */
    playNoise({ durationMs, fromHz, toHz, q = 0.9, gainLevel = 0.2, attackMs = 12, delayMs = 0, filterType = 'bandpass' }) {
      if (!this.soundEnabled || typeof window === 'undefined') return;
      this.ensureContext();
      if (!this.ctx) return;

      const start = this.ctx.currentTime + delayMs / 1000;
      const end = start + durationMs / 1000;
      const src = this.ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer();

      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.Q.setValueAtTime(q, start);
      filter.frequency.setValueAtTime(fromHz, start);
      filter.frequency.exponentialRampToValueAtTime(toHz, end);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainLevel, start + attackMs / 1000);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start(start, Math.random() * 0.5); // random offset so no two swishes sound identical
      src.stop(end + 0.02);
    }

    cardPlay() {
      this.vibrate(12);
      // One soft paper swoosh: gentle fade-in, low-passed (no sharp hiss or tap), slow fade-out
      this.playNoise({ durationMs: 300, fromHz: 2600, toHz: 700, q: 0.5, gainLevel: 0.07, attackMs: 70, filterType: 'lowpass' });
    }

    cardDeal() {
      this.vibrate(10);
      // Quick riffle flicks while the hand is dealt
      for (let i = 0; i < 4; i++) {
        this.playNoise({ durationMs: 110, fromHz: 3200, toHz: 1200, q: 0.6, gainLevel: 0.045, attackMs: 25, delayMs: i * 70, filterType: 'lowpass' });
      }
    }

    trickWin() {
      this.vibrate([18, 30, 25]);
      this.playTone(523.25, 110, 'triangle', 0.08, 659.25);
    }

    /** 💥 Spades broken: a sharp crack, then glass shattering & tinkling pieces. */
    spadeBroken() {
      this.vibrate([40, 30, 20, 30, 15]);
      // the crack: a hard, very short burst of bright noise + a low thump under it
      this.playNoise({ durationMs: 70, fromHz: 5200, toHz: 2400, q: 0.7, gainLevel: 0.32, attackMs: 2, filterType: 'highpass' });
      this.playNoise({ durationMs: 160, fromHz: 900, toHz: 160, q: 0.8, gainLevel: 0.22, attackMs: 3, filterType: 'lowpass' });
      // the shatter: a spray of short glassy bursts
      for (let i = 0; i < 7; i++) {
        const f = 3500 + Math.random() * 4500;
        this.playNoise({ durationMs: 60 + Math.random() * 90, fromHz: f, toHz: f * 0.7, q: 6, gainLevel: 0.07 + Math.random() * 0.05, attackMs: 2, delayMs: 45 + i * 28 + Math.random() * 20, filterType: 'bandpass' });
      }
      // falling pieces: little high "tink"s
      for (let i = 0; i < 5; i++) {
        const tink = 2200 + Math.random() * 2600;
        setTimeout(() => this.playTone(tink, 70, 'sine', 0.025, tink * 0.98), 220 + i * 70 + Math.random() * 40);
      }
    }

    illegalMove() {
      this.vibrate([45, 40, 65]);
      this.playTone(155, 160, 'sawtooth', 0.09, 120);
    }

    /** "Need more Lions": a soft, friendly falling chime (like an empty purse) — not a buzzer. */
    notEnoughFunds() {
      this.vibrate([12, 60, 12]);
      this.playTone(698.5, 150, 'sine', 0.05, 659.3);
      if (typeof setTimeout !== 'undefined') {
        setTimeout(() => this.playTone(523.3, 260, 'sine', 0.045, 440), 150);
      }
    }

    coinReward() {
      this.vibrate([20, 40, 40]);
      this.playTone(784, 90, 'sine', 0.09, 1046.5);
      if (typeof setTimeout !== 'undefined') {
        setTimeout(() => this.playTone(1046.5, 160, 'sine', 0.09, 1318.5), 95);
      }
    }

    uiClick() {
      this.vibrate(8);
      this.playTone(600, 35, 'sine', 0.04);
    }

    /**
     * Calming background ambience (all generated, no audio files):
     * lounge = soft chord pads · rain = gentle rainfall · ocean = slow waves · piano = sparse soft notes
     */
    startAmbientLoop() {
      this.stopAmbientLoop();
      if (typeof setInterval === 'undefined' || typeof window === 'undefined') return;
      this.ensureContext();
      if (!this.ctx) return;
      const ctx = this.ctx;
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicVolume === undefined ? 0.6 : this.musicVolume;
      this.musicGain.connect(ctx.destination);
      const out = this.musicGain;
      const kind = this.ambience || 'lounge';

      const pad = (freq, start, dur, level, type = 'sine') => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(level, start + Math.min(0.9, dur / 3));
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(g);
        g.connect(out);
        osc.start(start);
        osc.stop(start + dur + 0.05);
      };

      if (kind === 'rain' || kind === 'ocean') {
        // Looping noise through a low-pass filter; ocean swells slowly like waves
        const src = ctx.createBufferSource();
        src.buffer = this.getNoiseBuffer();
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = kind === 'rain' ? 2600 : 600;
        const g = ctx.createGain();
        g.gain.value = kind === 'rain' ? 0.05 : 0.04;
        src.connect(filter);
        filter.connect(g);
        g.connect(out);
        src.start();
        this.ambientNodes = [src];
        let t = 0;
        this.musicTimer = setInterval(() => {
          if (!this.musicEnabled || ctx.state !== 'running') return;
          const now = ctx.currentTime;
          t += 1;
          if (kind === 'ocean') {
            const swell = 0.5 + 0.5 * Math.sin(t / 3.2);
            g.gain.setTargetAtTime(0.012 + 0.06 * swell, now, 1.2);
            filter.frequency.setTargetAtTime(350 + 700 * swell, now, 1.2);
          } else if (Math.random() < 0.5) {
            // soft droplets
            pad(1800 + Math.random() * 1600, now, 0.12, 0.004, 'sine');
          }
        }, 1000);
        return;
      }

      // Musical ambiences
      const lounge = [[220, 277.18, 329.63], [196, 246.94, 293.66], [174.61, 220, 261.63], [196, 246.94, 329.63]];
      const pentatonic = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
      this.musicStep = 0;
      const tick = () => {
        if (!this.musicEnabled || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (kind === 'piano') {
          const note = pentatonic[Math.floor(Math.random() * pentatonic.length)];
          pad(note, now, 2.6, 0.03, 'triangle');
          if (Math.random() < 0.35) pad(note / 2, now + 0.05, 3, 0.02, 'sine');
        } else {
          const chord = lounge[this.musicStep % lounge.length];
          chord.forEach((f, i) => pad(f, now + i * 0.04, 3.8, 0.012, 'sine'));
          this.musicStep += 1;
        }
      };
      tick();
      this.musicTimer = setInterval(tick, kind === 'piano' ? 1700 : 3600);
    }

    stopAmbientLoop() {
      if (this.musicTimer && typeof clearInterval !== 'undefined') {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      (this.ambientNodes || []).forEach(n => { try { n.stop(); } catch (e) { /* ignore */ } });
      this.ambientNodes = [];
      if (this.musicGain) {
        try { this.musicGain.disconnect(); } catch (e) { /* ignore */ }
        this.musicGain = null;
      }
    }
  }

  SH.audio = new SoundController();
})(typeof globalThis !== 'undefined' ? globalThis : window);
