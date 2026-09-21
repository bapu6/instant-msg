import { Platform } from 'react-native';

class RingtoneService {
  private isPlaying: boolean = false;
  private currentMode: 'ringback' | 'ringtone' | null = null;
  private audioCtx: any = null;
  private oscLoopTimer: any = null;
  private activeOscillators: any[] = [];
  private mobilePlayer: any = null;

  private startWebTone(type: 'ringback' | 'ringtone') {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioCtx) {
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.stopWebTone();

    if (type === 'ringback') {
      // Standard dual frequency ringback: 440Hz + 480Hz, 1.5s on, 2s pause
      const playPulse = () => {
        if (!this.isPlaying || this.currentMode !== 'ringback' || !this.audioCtx) return;
        try {
          const now = this.audioCtx.currentTime;
          const osc1 = this.audioCtx.createOscillator();
          const osc2 = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();

          osc1.frequency.value = 440;
          osc2.frequency.value = 480;

          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
          gain.gain.setValueAtTime(0.12, now + 1.45);
          gain.gain.linearRampToValueAtTime(0, now + 1.5);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.audioCtx.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 1.5);
          osc2.stop(now + 1.5);

          this.activeOscillators = [osc1, osc2];
        } catch (e) {
          console.warn('[RingtoneService] Web ringback error:', e);
        }
      };

      playPulse();
      this.oscLoopTimer = setInterval(playPulse, 3500);
    } else {
      // Incoming Ringtone Melody: 5-note chime arpeggio
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.50];
      const playMelody = () => {
        if (!this.isPlaying || this.currentMode !== 'ringtone' || !this.audioCtx) return;
        try {
          const now = this.audioCtx.currentTime;
          notes.forEach((freq, idx) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const noteStart = now + idx * 0.18;

            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0, noteStart);
            gain.gain.linearRampToValueAtTime(0.18, noteStart + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.35);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start(noteStart);
            osc.stop(noteStart + 0.4);
            this.activeOscillators.push(osc);
          });
        } catch (e) {
          console.warn('[RingtoneService] Web ringtone error:', e);
        }
      };

      playMelody();
      this.oscLoopTimer = setInterval(playMelody, 2000);
    }
  }

  private stopWebTone() {
    if (this.oscLoopTimer) {
      clearInterval(this.oscLoopTimer);
      this.oscLoopTimer = null;
    }
    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeOscillators = [];
  }

  private async startMobileTone(type: 'ringback' | 'ringtone') {
    try {
      const { createAudioPlayer } = require('expo-audio');
      const soundSource =
        type === 'ringback'
          ? require('../assets/audio/ringback.wav')
          : require('../assets/audio/ringtone.wav');

      this.stopMobileTone();

      this.mobilePlayer = createAudioPlayer(soundSource);
      this.mobilePlayer.loop = true;
      this.mobilePlayer.volume = 0.8;
      this.mobilePlayer.play();
    } catch (err) {
      console.warn('[RingtoneService] Mobile audio error:', err);
    }
  }

  private stopMobileTone() {
    if (this.mobilePlayer) {
      try {
        this.mobilePlayer.pause();
        this.mobilePlayer.release?.();
      } catch {}
      this.mobilePlayer = null;
    }
  }

  public playRingback() {
    if (this.isPlaying && this.currentMode === 'ringback') return;
    this.isPlaying = true;
    this.currentMode = 'ringback';
    if (Platform.OS === 'web') {
      this.startWebTone('ringback');
    } else {
      this.startMobileTone('ringback');
    }
  }

  public playRingtone() {
    if (this.isPlaying && this.currentMode === 'ringtone') return;
    this.isPlaying = true;
    this.currentMode = 'ringtone';
    if (Platform.OS === 'web') {
      this.startWebTone('ringtone');
    } else {
      this.startMobileTone('ringtone');
    }
  }

  public stop() {
    this.isPlaying = false;
    this.currentMode = null;
    this.stopWebTone();
    this.stopMobileTone();
  }
}

export const ringtoneService = new RingtoneService();
export default ringtoneService;
