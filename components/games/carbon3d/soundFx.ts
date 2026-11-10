import { sound } from "@/lib/sound";
import { CarbonWeaponId } from "@/games/carbon3d/types";

/**
 * Procedural Web Audio Sci-Fi Gunfire, Impact, Shield & Haptic Synthesizer
 * Zero network download, sub-millisecond trigger latency on iOS/Android browsers.
 */
class CarbonSoundSynth {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private ensureCtx(): AudioContext | null {
    if (sound.isMuted || typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.noiseBuffer) {
      const sr = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, Math.floor(sr * 0.4), sr);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        ch[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }
    return this.ctx;
  }

  public haptic(pattern: number | number[]) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  private playFilteredNoise(
    duration: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    gainPeak: number
  ) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freqStart, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration);
  }

  public playWeaponFire(weapon: CarbonWeaponId | "GRENADE", isLocal = true) {
    const ctx = this.ensureCtx();
    if (!ctx) return;

    const vol = isLocal ? 1.0 : 0.35;
    const now = ctx.currentTime;

    if (isLocal) this.haptic(weapon === "SHOTGUN" || weapon === "RAILGUN" ? 16 : 7);

    if (weapon === "CARBINE") {
      // Crisp sci-fi plasma snap + sub-punch
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.085);
      gain.gain.setValueAtTime(0.24 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);

      this.playFilteredNoise(0.065, "bandpass", 2400, 650, 0.22 * vol);
    } else if (weapon === "SHOTGUN") {
      // Heavy kinetic boom + wide transient crack
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = "triangle";
      sub.frequency.setValueAtTime(190, now);
      sub.frequency.exponentialRampToValueAtTime(38, now + 0.22);
      subGain.gain.setValueAtTime(0.48 * vol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.23);

      this.playFilteredNoise(0.19, "lowpass", 3200, 260, 0.42 * vol);
    } else if (weapon === "RAILGUN") {
      // Iconic electromagnetic rail whip + deep ion drop
      const whip = ctx.createOscillator();
      const whipGain = ctx.createGain();
      whip.type = "sawtooth";
      whip.frequency.setValueAtTime(1850, now);
      whip.frequency.exponentialRampToValueAtTime(72, now + 0.28);
      whipGain.gain.setValueAtTime(0.36 * vol, now);
      whipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.29);
      whip.connect(whipGain);
      whipGain.connect(ctx.destination);
      whip.start(now);
      whip.stop(now + 0.29);

      this.playFilteredNoise(0.16, "highpass", 1800, 420, 0.28 * vol);
    } else {
      // LOBBER / GRENADE hollow plasma thump
      const thump = ctx.createOscillator();
      const g = ctx.createGain();
      thump.type = "sine";
      thump.frequency.setValueAtTime(290, now);
      thump.frequency.exponentialRampToValueAtTime(68, now + 0.16);
      g.gain.setValueAtTime(0.36 * vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      thump.connect(g);
      g.connect(ctx.destination);
      thump.start(now);
      thump.stop(now + 0.17);
    }
  }

  public playHitmarker(isCrit = false) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(isCrit ? 1580 : 1080, now);
    osc.frequency.exponentialRampToValueAtTime(isCrit ? 2250 : 680, now + 0.045);
    gain.gain.setValueAtTime(isCrit ? 0.28 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
    if (isCrit) this.haptic(14);
  }

  public playShieldBreak() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [1620, 1180, 820].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(f, now + idx * 0.035);
      g.gain.setValueAtTime(0.18, now + idx * 0.035);
      g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.1);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + idx * 0.035);
      osc.stop(now + idx * 0.035 + 0.1);
    });
  }

  public playKillConfirm(streak = 1) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    this.haptic([18, 30, 26]);
    const base = streak >= 3 ? 659.25 : 523.25;
    [base, base * 1.25, base * 1.5, base * 2].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + i * 0.055);
      g.gain.setValueAtTime(0.24, now + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.22);
    });
  }

  public playExplosion() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    const g = ctx.createGain();
    sub.type = "sawtooth";
    sub.frequency.setValueAtTime(135, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.36);
    g.gain.setValueAtTime(0.42, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    sub.connect(g);
    g.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.38);

    this.playFilteredNoise(0.32, "lowpass", 1600, 120, 0.38);
  }

  public playDash() {
    this.haptic(10);
    this.playFilteredNoise(0.18, "bandpass", 520, 2200, 0.26);
  }

  public playJumpPad() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.haptic(15);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.28);
    g.gain.setValueAtTime(0.26, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playPickup() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.haptic(12);
    const now = ctx.currentTime;
    [587.33, 880, 1174.66].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now + i * 0.05);
      g.gain.setValueAtTime(0.2, now + i * 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.14);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.14);
    });
  }
}

export const carbonSfx = new CarbonSoundSynth();
