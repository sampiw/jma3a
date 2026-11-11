import { sound } from "@/lib/sound";

/**
 * Procedural Web Audio Arcade Racing, Engine RPM, Tire Screech, Crash & Moroccan Meme Horn Synth
 * Zero external audio downloads — instant sub-millisecond playback on iOS, Android & Desktop.
 */
class KsidaSoundSynth {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Continuous engine + drift tire audio nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private screechSrc: AudioBufferSourceNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private loopRunning = false;

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
      const buf = this.ctx.createBuffer(1, Math.floor(sr * 1.0), sr);
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

  public updateEngineAndDrift(
    speedAbs: number,
    isDrifting: boolean,
    isNitro: boolean,
    isAlive: boolean
  ) {
    if (sound.isMuted || !isAlive) {
      this.stopEngineLoop();
      return;
    }
    const ctx = this.ensureCtx();
    if (!ctx || ctx.state !== "running" || !this.noiseBuffer) return;

    if (!this.loopRunning) {
      try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const engFilter = ctx.createBiquadFilter();
        const engGain = ctx.createGain();

        osc1.type = "sawtooth";
        osc2.type = "triangle";
        osc1.frequency.value = 58;
        osc2.frequency.value = 116;

        engFilter.type = "lowpass";
        engFilter.frequency.value = 420;

        engGain.gain.value = 0.001;

        osc1.connect(engFilter);
        osc2.connect(engFilter);
        engFilter.connect(engGain);
        engGain.connect(ctx.destination);

        osc1.start();
        osc2.start();

        // Looping tire screech buffer
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = this.noiseBuffer;
        nSrc.loop = true;

        const sFilter = ctx.createBiquadFilter();
        sFilter.type = "bandpass";
        sFilter.frequency.value = 1550;
        sFilter.Q.value = 5.5;

        const sGain = ctx.createGain();
        sGain.gain.value = 0.0001;

        nSrc.connect(sFilter);
        sFilter.connect(sGain);
        sGain.connect(ctx.destination);
        nSrc.start();

        this.engineOsc1 = osc1;
        this.engineOsc2 = osc2;
        this.engineGain = engGain;
        this.screechSrc = nSrc;
        this.screechFilter = sFilter;
        this.screechGain = sGain;
        this.loopRunning = true;
      } catch {
        return;
      }
    }

    const now = ctx.currentTime;
    const normSpeed = Math.min(1.35, speedAbs / 30);
    const baseFreq = 52 + normSpeed * 128 + (isNitro ? 36 : 0);

    this.engineOsc1?.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.engineOsc2?.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.06);
    const targetEngVol = 0.032 + Math.min(0.055, normSpeed * 0.048) + (isNitro ? 0.025 : 0);
    this.engineGain?.gain.setTargetAtTime(targetEngVol, now, 0.08);

    const shouldScreech = isDrifting && speedAbs > 10;
    this.screechFilter?.frequency.setTargetAtTime(
      1380 + Math.min(600, speedAbs * 16),
      now,
      0.05
    );
    this.screechGain?.gain.setTargetAtTime(shouldScreech ? 0.065 : 0.0001, now, 0.06);
  }

  public stopEngineLoop() {
    if (!this.loopRunning) return;
    this.loopRunning = false;
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.screechSrc?.stop();
      this.engineOsc1?.disconnect();
      this.engineOsc2?.disconnect();
      this.engineGain?.disconnect();
      this.screechSrc?.disconnect();
      this.screechGain?.disconnect();
    } catch {}
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.screechSrc = null;
    this.screechFilter = null;
    this.screechGain = null;
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

  private playHornNote(
    startOffset: number,
    duration: number,
    f1: number,
    f2: number,
    vol = 0.22,
    type: OscillatorType = "sawtooth"
  ) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + startOffset;

    for (const freq of [f1, f2]) {
      if (freq <= 0) continue;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);

      filter.type = "bandpass";
      filter.frequency.value = freq * 2.2;
      filter.Q.value = 2.0;

      g.gain.setValueAtTime(0.001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
      g.gain.setValueAtTime(vol * 0.9, t0 + Math.max(0.02, duration - 0.025));
      g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

      osc.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.01);
    }
  }

  /**
   * Plays 6 iconic Moroccan & Meme car horns!
   */
  public playMemeHorn(styleIndex = 0, isLocal = true) {
    const mult = isLocal ? 1.0 : 0.45;
    if (isLocal) this.haptic([18, 30, 18]);

    const s = ((styleIndex % 6) + 6) % 6;
    if (s === 0) {
      // Petit Taxi Casablanca snappy dual-tone "BEEP-BEEP!"
      this.playHornNote(0, 0.11, 440, 554, 0.2 * mult);
      this.playHornNote(0.14, 0.16, 440, 554, 0.22 * mult);
    } else if (s === 1) {
      // Iconic Moroccan Wedding Convoy Rhythm: "TAT - TAT - TA-TA-TAT!"
      const beats = [
        [0.0, 0.13],
        [0.18, 0.13],
        [0.38, 0.09],
        [0.5, 0.09],
        [0.62, 0.22],
      ];
      for (const [off, dur] of beats) {
        this.playHornNote(off, dur, 466, 587, 0.22 * mult);
      }
    } else if (s === 2) {
      // Auto-École squeaky clown roast horn!
      this.playHornNote(0, 0.12, 620, 780, 0.2 * mult, "square");
      this.playHornNote(0.15, 0.24, 510, 640, 0.2 * mult, "square");
    } else if (s === 3) {
      // La Chancla / Walida siren whistle!
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(1480, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.36);
      g.gain.setValueAtTime(0.24 * mult, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.39);
    } else if (s === 4) {
      // C15 / Mercedes 240 Heavy Diesel Truck Foghorn!
      this.playHornNote(0, 0.42, 165, 208, 0.28 * mult, "sawtooth");
    } else {
      // MLG DJ Airhorn triple hype blast!
      this.playHornNote(0.0, 0.1, 740, 932, 0.22 * mult);
      this.playHornNote(0.12, 0.1, 740, 932, 0.22 * mult);
      this.playHornNote(0.24, 0.38, 740, 932, 0.26 * mult);
    }
  }

  public playCrashImpact(intensity = 1.0, isWreck = false) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const clampInt = Math.max(0.35, Math.min(1.6, intensity));

    this.haptic(isWreck ? [45, 30, 80] : Math.round(22 * clampInt));

    // Metallic crunch sub-punch
    const sub = ctx.createOscillator();
    const g = ctx.createGain();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(isWreck ? 165 : 130, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + (isWreck ? 0.42 : 0.22));
    g.gain.setValueAtTime(0.42 * clampInt, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + (isWreck ? 0.45 : 0.24));
    sub.connect(g);
    g.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + (isWreck ? 0.46 : 0.25));

    // Metal + glass noise burst
    this.playFilteredNoise(
      isWreck ? 0.38 : 0.18,
      "bandpass",
      2800,
      320,
      0.38 * clampInt
    );

    if (isWreck) {
      // Dramatic takedown power chord sting!
      this.playHornNote(0.06, 0.32, 523.25, 659.25, 0.22, "triangle");
    }
  }

  public playSandalaSlap() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.haptic([25, 20, 35]);
    // Sharp high-frequency comic SLAP crack!
    this.playFilteredNoise(0.11, "highpass", 1900, 900, 0.48);
    const now = ctx.currentTime;
    const pop = ctx.createOscillator();
    const g = ctx.createGain();
    pop.type = "square";
    pop.frequency.setValueAtTime(880, now);
    pop.frequency.exponentialRampToValueAtTime(140, now + 0.09);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    pop.connect(g);
    g.connect(ctx.destination);
    pop.start(now);
    pop.stop(now + 0.11);
  }

  public playButagazExplosion() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.haptic([55, 35, 95]);
    const now = ctx.currentTime;

    const boom = ctx.createOscillator();
    const g = ctx.createGain();
    boom.type = "sine";
    boom.frequency.setValueAtTime(145, now);
    boom.frequency.exponentialRampToValueAtTime(24, now + 0.58);
    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    boom.connect(g);
    g.connect(ctx.destination);
    boom.start(now);
    boom.stop(now + 0.62);

    this.playFilteredNoise(0.52, "lowpass", 2600, 140, 0.48);
  }

  public playDriftBoost(stage: 1 | 2 | 3) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.haptic(stage * 10);
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    const startF = stage === 3 ? 480 : stage === 2 ? 380 : 300;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(startF * 2.1, now + 0.22);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);

    this.playFilteredNoise(0.2, "bandpass", 1400, 3400, 0.22);
  }

  public playCratePickup() {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.haptic(14);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      const t0 = ctx.currentTime + idx * 0.055;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.22, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.13);
    });
  }

  public playLapFanfare(isFinal = false) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.haptic([20, 30, 40]);
    const seq = isFinal
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [440, 554.37, 659.25, 880];
    seq.forEach((f, idx) => {
      const t0 = ctx.currentTime + idx * 0.08;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t0);
      g.gain.setValueAtTime(0.26, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
  }
}

export const ksidaSfx = new KsidaSoundSynth();
