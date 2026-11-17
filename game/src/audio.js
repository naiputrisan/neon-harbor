// audio.js — all sound is synthesised with WebAudio; the game ships no audio
// files. One engine: a master gain, a tiny music sequencer (bass + pad chords
// in a sun-drenched minor groove), and one-shot synth effects for driving,
// combat and UI. Nothing starts until the player's first click, per browser
// autoplay rules.
'use strict';
window.NH = window.NH || {};

NH.Audio = class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicOn = true;
    this._musicTimer = null;
    this._engineOsc = null;
    this._engineGain = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenPhase = 0;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._startMusic();
  }

  // --- music: a slow 8-bar loop, Am7 – Fmaj7 – Cmaj7 – G6, pad + soft bass --
  _startMusic() {
    if (!this.ctx || this._musicTimer) return;
    const chords = [
      [110.0, 164.8, 220.0, 261.6],   // Am7
      [87.3, 174.6, 220.0, 349.2],    // Fmaj7
      [130.8, 196.0, 261.6, 329.6],   // Cmaj7
      [98.0, 196.0, 246.9, 293.7],    // G6
    ];
    let bar = 0;
    const playBar = () => {
      if (!this.musicOn || !this.ctx) return;
      const t = this.ctx.currentTime + 0.05;
      const notes = chords[bar % chords.length];
      // pad
      for (const f of notes) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.028, t + 0.6);
        g.gain.linearRampToValueAtTime(0.0, t + 3.9);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 4.0);
      }
      // bass pulse on 1 and 3.5
      for (const when of [0, 1.75]) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = notes[0] / 2;
        g.gain.setValueAtTime(0.09, t + when);
        g.gain.exponentialRampToValueAtTime(0.001, t + when + 0.5);
        o.connect(g); g.connect(this.master);
        o.start(t + when); o.stop(t + when + 0.55);
      }
      bar++;
    };
    playBar();
    this._musicTimer = setInterval(playBar, 4000);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicOn) this._startMusic();
    return this.musicOn;
  }

  // --- continuous driving sounds ------------------------------------------
  setEngine(speedRatio, driving) {
    if (!this.ctx) return;
    if (!this._engineOsc) {
      this._engineOsc = this.ctx.createOscillator();
      this._engineGain = this.ctx.createGain();
      this._engineOsc.type = 'sawtooth';
      this._engineGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      this._engineOsc.connect(lp); lp.connect(this._engineGain);
      this._engineGain.connect(this.master);
      this._engineOsc.start();
    }
    const target = driving ? 0.05 + Math.abs(speedRatio) * 0.05 : 0.0;
    this._engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this._engineOsc.frequency.setTargetAtTime(
      55 + Math.abs(speedRatio) * 165, this.ctx.currentTime, 0.06);
  }

  setSiren(level, distance) {
    if (!this.ctx) return;
    if (!this._sirenOsc) {
      this._sirenOsc = this.ctx.createOscillator();
      this._sirenGain = this.ctx.createGain();
      this._sirenOsc.type = 'square';
      this._sirenGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1600;
      this._sirenOsc.connect(lp); lp.connect(this._sirenGain);
      this._sirenGain.connect(this.master);
      this._sirenOsc.start();
    }
    if (level <= 0) {
      this._sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    this._sirenPhase += 0.11;
    const wail = Math.sin(this._sirenPhase) * 0.5 + 0.5;
    this._sirenOsc.frequency.value = 660 + wail * 340;
    const vol = Math.max(0, 0.055 - distance * 0.00045);
    this._sirenGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
  }

  // --- one-shots ------------------------------------------------------------
  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  click() { this._blip(880, 0.06, 'sine', 0.08); }
  door() { this._noise(0.12, 0.15, 500); this._blip(140, 0.1, 'sine', 0.1, 90); }
  crash(strength) {
    this._noise(0.28, Math.min(0.5, 0.15 + strength * 0.05), 700);
    this._blip(70, 0.25, 'sine', 0.3, 40);
  }
  skid() { this._noise(0.16, 0.05, 2400, 'bandpass'); }
  gunshot() {
    this._noise(0.11, 0.4, 3200, 'highpass');
    this._blip(160, 0.09, 'square', 0.2, 60);
  }
  hit() { this._blip(220, 0.08, 'square', 0.12, 110); }
  hurt() { this._blip(110, 0.18, 'sawtooth', 0.16, 70); }
  cash() {
    this._blip(1320, 0.09, 'sine', 0.1);
    setTimeout(() => this._blip(1760, 0.14, 'sine', 0.1), 70);
  }
  missionDone() {
    const seq = [523.3, 659.3, 784.0, 1046.5];
    seq.forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 'triangle', 0.12), i * 110));
  }
  busted() {
    const seq = [392, 329.6, 261.6, 196];
    seq.forEach((f, i) => setTimeout(() => this._blip(f, 0.3, 'triangle', 0.14), i * 160));
  }
};
