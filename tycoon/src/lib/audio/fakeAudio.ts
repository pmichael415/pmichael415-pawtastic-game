// A stand-in AudioContext for tests: records what was started, when, and at which frequency. Never makes sound.
type Param = { value: number; setValueAtTime: (v: number, t: number) => void; linearRampToValueAtTime: (v: number, t: number) => void; exponentialRampToValueAtTime: (v: number, t: number) => void; setTargetAtTime: (v: number, t: number, c: number) => void };
const param = (v = 0): Param => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
const node = () => ({ connect() {}, disconnect() {} });

export class FakeAudioContext {
  static made = 0;
  static started: { kind: string; at: number; freq?: number }[] = [];
  currentTime = 0;
  sampleRate = 44100;
  state: "running" | "suspended" = "suspended";
  destination = node();
  constructor() {
    FakeAudioContext.made++;
  }
  static reset() {
    FakeAudioContext.made = 0;
    FakeAudioContext.started = [];
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  createGain() {
    return { ...node(), gain: param(1) };
  }
  createOscillator() {
    const freq = param(440);
    return {
      ...node(),
      type: "sine",
      frequency: freq,
      detune: param(0),
      start: (at = 0) => FakeAudioContext.started.push({ kind: "osc", at, freq: freq.value }),
      stop() {},
    };
  }
  createBiquadFilter() {
    return { ...node(), type: "lowpass", frequency: param(1000), Q: param(1), gain: param(0) };
  }
  createDynamicsCompressor() {
    return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() };
  }
  createBuffer(_ch: number, len: number, sr: number) {
    const data = new Float32Array(len);
    return { length: len, sampleRate: sr, duration: len / sr, getChannelData: () => data };
  }
  createBufferSource() {
    return { ...node(), buffer: null as unknown, playbackRate: param(1), start: (at = 0) => FakeAudioContext.started.push({ kind: "noise", at }), stop() {} };
  }
  createStereoPanner() {
    return { ...node(), pan: param(0) };
  }
}
