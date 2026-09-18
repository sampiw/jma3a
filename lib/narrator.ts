/**
 * JMA3A Narrator Audio System
 * Plays voice clips from /audio/narrator/[key].mp3 if available,
 * falling back smoothly to procedural sound synthesizer in lib/sound.ts.
 */

import { sound } from "@/lib/sound";

class NarratorEngine {
  private currentAudio: HTMLAudioElement | null = null;
  private isMuted: boolean = false;

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.currentAudio) {
      this.currentAudio.pause();
    }
  }

  public playCue(key: string) {
    if (this.isMuted || typeof window === "undefined") return;

    // First try loading pre-recorded Darija voice clip if available
    const audioPath = `/audio/narrator/${key}.mp3`;
    const audio = new Audio(audioPath);

    audio.play().catch(() => {
      // Fallback to procedural web audio synthesizer
      switch (key) {
        case "dawn":
        case "day_announcement":
          sound.playDawnChime();
          break;
        case "game_over":
        case "victory":
          sound.playSuccess();
          break;
        case "vote_tick":
          sound.playTick();
          break;
        case "alert":
        case "tie":
          sound.playBuzzer();
          break;
        default:
          sound.playCardFlip();
          break;
      }
    });

    this.currentAudio = audio;
  }
}

export const narrator = new NarratorEngine();
