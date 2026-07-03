export class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.55;
  }

  unlock() {
    if (this.context) {
      if (this.context.state === "suspended") this.context.resume();
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.context.destination);
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  beep(frequency, duration, type = "square", gain = 0.12, delay = 0, slide = 0) {
    if (!this.context || this.muted) return;

    const now = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    const amp = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    }

    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(amp);
    amp.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playStart() {
    this.beep(180, 0.07, "square", 0.08, 0);
    this.beep(360, 0.07, "square", 0.08, 0.08);
    this.beep(720, 0.12, "triangle", 0.09, 0.16);
  }

  playPop(type, combo = 0) {
    const lift = Math.min(320, combo * 18);
    const base = type === "red" ? 620 : type === "amber" ? 520 : 420;
    this.beep(base + lift, 0.045, "square", 0.09, 0, 140);
    this.beep(base * 1.5 + lift, 0.07, "triangle", 0.055, 0.035, -180);
  }

  playMiss() {
    this.beep(120, 0.09, "sawtooth", 0.07, 0, -45);
  }

  playExpire() {
    this.beep(92, 0.18, "sawtooth", 0.08, 0, -38);
  }

  playGameOver() {
    this.beep(280, 0.12, "square", 0.1, 0, -90);
    this.beep(160, 0.18, "sawtooth", 0.09, 0.13, -70);
    this.beep(70, 0.32, "triangle", 0.12, 0.32, -20);
  }
}
