"use client";

import { sound } from "@/lib/sound";

class SimsarSoundFx {
  private ctx: AudioContext | null = null;

  private getCtx(): AudioContext | null {
    if (sound.isMuted || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  haptic(ms: number | number[] = 14) {
    if (sound.isMuted || typeof navigator === "undefined") return;
    try {
      navigator.vibrate?.(ms);
    } catch {}
  }

  /** Crisp 3D dice shake & marble Zellige bounce clatter */
  playDiceRoll() {
    const ctx = this.getCtx();
    this.haptic([18, 28, 22]);
    if (!ctx) return;

    const now = ctx.currentTime;
    const hits = [0, 0.07, 0.15, 0.25, 0.37];
    hits.forEach((off, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(520 + idx * 95 + Math.random() * 80, now + off);
      osc.frequency.exponentialRampToValueAtTime(180, now + off + 0.055);
      gain.gain.setValueAtTime(0.18 * (1 - idx * 0.14), now + off);
      gain.gain.exponentialRampToValueAtTime(0.001, now + off + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + off);
      osc.stop(now + off + 0.065);
    });
  }

  /** Ascending playful marimba hop note as the 3D token bounces tile-by-tile! */
  playTileHop(stepIndex: number) {
    const ctx = this.getCtx();
    this.haptic(8);
    if (!ctx) return;

    const scale = [330, 370, 415, 440, 494, 554, 587, 659, 740, 831, 880, 988];
    const freq = scale[stepIndex % scale.length];
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 0.88, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + 0.08);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Cash register Cha-Ching for buying cities, salary, or winning jackpots! */
  playCashGain() {
    const ctx = this.getCtx();
    this.haptic([15, 30, 20]);
    if (!ctx) return;

    const now = ctx.currentTime;
    [880, 1174.66, 1567.98].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + i * 0.065);
      gain.gain.setValueAtTime(0.17, now + i * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.065 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.065);
      osc.stop(now + i * 0.065 + 0.26);
    });
  }

  /** Rent / Tax sting when money leaves your pocket */
  playRentPaid() {
    const ctx = this.getCtx();
    this.haptic([35, 25, 35]);
    if (!ctx) return;

    const now = ctx.currentTime;
    [392, 311, 233].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.1, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.2);
    });
  }

  /** 3D Building Pop-Up Chime */
  playBuildUpgrade(level: number) {
    const ctx = this.getCtx();
    this.haptic([20, 20, 35]);
    if (!ctx) return;

    const now = ctx.currentTime;
    const base = 440 + level * 110;
    [base, base * 1.25, base * 1.5, base * 2].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + i * 0.055);
      gain.gain.setValueAtTime(0.16, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.24);
    });
  }

  /** Moroccan Radar / Police Siren for Tile 18 */
  playRadarSiren() {
    const ctx = this.getCtx();
    this.haptic([45, 35, 45]);
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.16);
    osc.frequency.setValueAtTime(660, now + 0.32);
    osc.frequency.setValueAtTime(880, now + 0.48);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.66);
  }

  /** Auction Gavel / Tajine Lid Tap */
  playPopTap(pitchMult = 1) {
    const ctx = this.getCtx();
    this.haptic(12);
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(480 * pitchMult, now);
    osc.frequency.exponentialRampToValueAtTime(760 * pitchMult, now + 0.07);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Grand Victory / Mega-Heist Fanfare */
  playFanfare() {
    const ctx = this.getCtx();
    this.haptic([25, 35, 25, 60]);
    if (!ctx) return;

    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now + i * 0.09);
      gain.gain.setValueAtTime(0.2, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.4);
    });
  }
}

export const simsarSfx = new SimsarSoundFx();
