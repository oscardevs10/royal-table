import { Injectable, signal } from '@angular/core';

export type SoundEffect = 'deal' | 'chip' | 'check' | 'call' | 'raise' | 'fold' | 'win';

/**
 * Lightweight synthesized sound effects via the WebAudio API, so the game has
 * real audio feedback without shipping binary placeholder assets. Swap
 * `playTone` calls for `new Audio('/sounds/x.mp3').play()` later if real
 * sample files are added under `public/sounds/`.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private context: AudioContext | null = null;
  readonly muted = signal(false);

  toggleMute(): void {
    this.muted.set(!this.muted());
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.context;
  }

  play(effect: SoundEffect): void {
    if (this.muted()) return;
    try {
      const ctx = this.getContext();
      const spec = this.specFor(effect);
      const now = ctx.currentTime;

      spec.frequencies.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = spec.type;
        oscillator.frequency.value = freq;

        const start = now + index * spec.stagger;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(spec.volume, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + spec.duration);

        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + spec.duration + 0.02);
      });
    } catch {
      // Audio not available (e.g. autoplay policy before user interaction) - fail silently.
    }
  }

  private specFor(effect: SoundEffect): { frequencies: number[]; type: OscillatorType; duration: number; volume: number; stagger: number } {
    switch (effect) {
      case 'deal':
        return { frequencies: [520], type: 'triangle', duration: 0.08, volume: 0.15, stagger: 0.03 };
      case 'chip':
        return { frequencies: [880, 660], type: 'square', duration: 0.06, volume: 0.08, stagger: 0.03 };
      case 'check':
        return { frequencies: [440], type: 'sine', duration: 0.1, volume: 0.15, stagger: 0 };
      case 'call':
        return { frequencies: [440, 550], type: 'sine', duration: 0.12, volume: 0.15, stagger: 0.05 };
      case 'raise':
        return { frequencies: [440, 660, 880], type: 'sawtooth', duration: 0.1, volume: 0.12, stagger: 0.04 };
      case 'fold':
        return { frequencies: [300, 220], type: 'sine', duration: 0.15, volume: 0.12, stagger: 0.06 };
      case 'win':
        return { frequencies: [523, 659, 784, 1046], type: 'triangle', duration: 0.2, volume: 0.18, stagger: 0.09 };
    }
  }
}
