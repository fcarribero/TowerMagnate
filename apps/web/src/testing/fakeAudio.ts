export interface PlayedSound {
  loop: boolean;
  volume: number;
  stopped: boolean;
}

/** Records what SfxPlayer starts. Only the members the player touches exist. */
export class FakeAudioContext {
  state: AudioContextState = 'suspended';
  readonly destination = {} as AudioDestinationNode;
  readonly played: PlayedSound[] = [];

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({ length: data.byteLength } as unknown as AudioBuffer);
  }

  createGain(): GainNode {
    return { gain: { value: 1 }, connect: () => {} } as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    let gain: GainNode | null = null;
    const sound: PlayedSound = {
      loop: false,
      // Read live, so later gain changes on a playing sound show up.
      get volume() {
        return gain?.gain.value ?? 1;
      },
      stopped: false,
    };
    const played = this.played;
    return {
      buffer: null,
      set loop(value: boolean) {
        sound.loop = value;
      },
      connect: (node: GainNode) => {
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
