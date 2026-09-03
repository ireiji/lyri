// Web Audio API lightweight rhythm and chord synth for synced demo playback
export class DemoAudioEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.intervalId = null;
    this.isPlaying = false;
    this.currentStep = 0;
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playKick(time) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.12);

    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.start(time);
    osc.stop(time + 0.22);
  }

  playSnare(time) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, time);
    oscGain.gain.setValueAtTime(0.18, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  playHiHat(time) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(8500, time);
    gain.gain.setValueAtTime(0.04, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    osc.start(time);
    osc.stop(time + 0.05);
  }

  playChord(frequencies, time, duration = 0.38) {
    if (!this.ctx || this.isMuted) return;
    frequencies.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.035, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + duration);
    });
  }

  startBeat(bpm = 90) {
    this.initContext();
    this.isPlaying = true;
    this.currentStep = 0;
    const stepTimeMs = (60 / bpm / 4) * 1000;

    if (this.intervalId) clearInterval(this.intervalId);

    const chords = [
      [233.08, 277.18, 349.23], // Bb
      [207.65, 261.63, 311.13], // Ab / Gm
      [174.61, 220.00, 261.63], // F
      [196.00, 246.94, 293.66], // Eb
    ];

    this.intervalId = window.setInterval(() => {
      if (!this.ctx || !this.isPlaying) return;
      const now = this.ctx.currentTime;
      const step = this.currentStep % 16;
      const bar = Math.floor((this.currentStep / 16) % 4);

      if (step === 0 || step === 8 || step === 10) {
        this.playKick(now);
      }
      if (step === 4 || step === 12) {
        this.playSnare(now);
      }
      if (step % 2 === 0) {
        this.playHiHat(now);
      }
      if (step === 0 || step === 8) {
        this.playChord(chords[bar], now, 0.38);
      }

      this.currentStep++;
    }, stepTimeMs);
  }

  stopBeat() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  setMuted(muted) {
    this.isMuted = muted;
  }
}

export const demoAudio = new DemoAudioEngine();
