const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/+<>[]";

export class ScrambleText {
  constructor(text = "", revealRate = 20) {
    this.text = text;
    this.revealRate = revealRate;
    this.age = 0;
  }

  setText(text) {
    if (text === this.text) return;
    this.text = text;
    this.age = 0;
  }

  reset() {
    this.age = 0;
  }

  update(dt) {
    this.age += dt;
  }

  value() {
    const revealed = Math.floor(this.age * this.revealRate);
    let out = "";

    for (let i = 0; i < this.text.length; i += 1) {
      const char = this.text[i];
      if (char === " " || i < revealed) {
        out += char;
      } else {
        out += GLYPHS[(i * 7 + Math.floor(this.age * 35)) % GLYPHS.length];
      }
    }

    return out;
  }
}
