export interface PlayedSound {
  loop: boolean;
  /** The gain of the sound's own node. */
  volume: number;
  /** The volume after every gain node between the sound and the speakers. */
  heard: number;
  stopped: boolean;
}

export interface GainRamp {
  to: number;
  durationMs: number;
}

interface FakeGainNode {
  gain: {
    value: number;
    cancelScheduledValues(time: number): void;
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
  };
  output: FakeGainNode | null;
  connect(node: FakeGainNode): void;
}

/** Records what SfxPlayer starts. Only the members the player touches exist. */
export class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  readonly destination = { gain: { value: 1 }, output: null } as unknown as AudioDestinationNode;
  readonly played: PlayedSound[] = [];
  /** Every ramp on a gain node, in order. Ramps finish at once. */
  readonly ramps: GainRamp[] = [];

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({ length: data.byteLength } as unknown as AudioBuffer);
  }

  createGain(): GainNode {
    const ramps = this.ramps;
    const now = (): number => this.currentTime;
    const node: FakeGainNode = {
      gain: {
        value: 1,
        cancelScheduledValues: () => {},
        setValueAtTime(value: number) {
          node.gain.value = value;
        },
        linearRampToValueAtTime(value: number, time: number) {
          node.gain.value = value;
          ramps.push({ to: value, durationMs: Math.round((time - now()) * 1000) });
        },
      },
      output: null,
      connect: (target) => {
        node.output = target;
      },
    };
    return node as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    let gain: FakeGainNode | null = null;
    const sound: PlayedSound = {
      loop: false,
      // Read live, so later gain changes on a playing sound show up.
      get volume() {
        return gain?.gain.value ?? 1;
      },
      get heard() {
        let volume = 1;
        for (let node = gain; node !== null; node = node.output) {
          volume *= node.gain.value;
        }
        return volume;
      },
      stopped: false,
    };
    const played = this.played;
    return {
      buffer: null,
      onended: null,
      set loop(value: boolean) {
        sound.loop = value;
      },
      connect: (node: FakeGainNode) => {
        gain = node;
      },
      start: () => played.push(sound),
      stop: () => {
        sound.stopped = true;
      },
      disconnect: () => {},
    } as unknown as AudioBufferSourceNode;
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}
