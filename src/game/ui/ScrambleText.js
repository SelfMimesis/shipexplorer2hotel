const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_ ";

export class ScrambleText {
  constructor(text = "", options = {}) {
    this.text = text;
    this.age = 0;
    this.scrambleDuration = options.scrambleDuration ?? this.randomDuration();
    this.revealDuration = options.revealDuration ?? 0.18;
  }

  randomDuration() {
    return 0.4 + Math.random() * 0.4;
  }

  setText(text) {
    if (text === this.text) return;
    this.text = text;
    this.reset();
  }

  reset() {
    this.age = 0;
    this.scrambleDuration = this.randomDuration();
  }

  update(dt) {
    this.age += dt;
  }

  value() {
    if (this.age >= this.scrambleDuration + this.revealDuration) {
      return this.text;
    }

    const revealProgress = this.age <= this.scrambleDuration ? 0 : (this.age - this.scrambleDuration) / this.revealDuration;
    const revealed = Math.floor(this.text.length * revealProgress);
    let output = "";

    for (let i = 0; i < this.text.length; i += 1) {
      const char = this.text[i];
      if (char === " " || i < revealed) {
        output += char;
      } else {
        const index = (i * 11 + Math.floor(this.age * 48)) % GLYPHS.length;
        output += GLYPHS[index];
      }
    }

    return output;
  }
}
