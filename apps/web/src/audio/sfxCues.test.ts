import { describe, expect, it } from 'vitest';
import { FakeAudioContext } from '../testing/fakeAudio';
import { readRepoManifest } from '../testing/sfxManifestFile';
import { SfxCues } from './sfxCues';
import { parseSfxManifest } from './sfxManifest';
import { SfxPlayer } from './sfxPlayer';

const manifest = parseSfxManifest(readRepoManifest());

async function setup({ unlocked = true } = {}) {
  const context = new FakeAudioContext();
  const player = new SfxPlayer({
    baseUrl: '/sfx/',
    format: 'ogg',
    fetchFile: () => Promise.resolve(new ArrayBuffer(8)),
    createAudioContext: () => context.asAudioContext(),
  });
  let now = 0;
  const cues = new SfxCues(player, () => now);
  await player.setManifest(manifest);
  if (unlocked) {
    await player.unlock();
  }
  const advance = (ms: number): void => {
    now += ms;
  };
  return { context, player, cues, advance };
}

describe('SfxCues rate limits', () => {
  it('gives one notification sound for six notices in one second', async () => {
    const { context, cues, advance } = await setup();
    for (let notice = 0; notice < 6; notice += 1) {
      cues.play('notice.show');
      advance(150);
    }
    expect(context.played).toHaveLength(1);
  });

  it('drops a skipped notification instead of queueing it', async () => {
    const { context, cues, advance } = await setup();
    cues.play('notice.show');
    advance(500);
    cues.play('notice.show');
    advance(2000);
    expect(context.played).toHaveLength(1);
  });

  it('counts the 1000 ms from the last sound, not from a skipped notice', async () => {
    const { context, cues, advance } = await setup();
    cues.play('notice.show');
    advance(999);
    cues.play('notice.show');
    advance(1);
    cues.play('notice.show');
    expect(context.played).toHaveLength(2);
  });

  it('limits the cash register to one per second', async () => {
    const { context, cues, advance } = await setup();
    cues.play('money.income');
    advance(999);
    cues.play('money.income');
    advance(1);
    cues.play('money.income');
    expect(context.played).toHaveLength(2);
  });

  it('plays construction every time', async () => {
    const { context, cues } = await setup();
    cues.play('build.place');
    cues.play('build.place');
    expect(context.played).toHaveLength(2);
  });

  it('ignores a trigger with no effect', async () => {
    const { context, cues } = await setup();
    cues.play('kazoo');
    expect(context.played).toHaveLength(0);
  });
});

describe('SfxCues loops', () => {
  it('plays one instance of an alarm however often it starts', async () => {
    const { context, cues } = await setup();
    cues.startLoop('event.bomb');
    cues.startLoop('event.bomb');
    expect(context.played).toHaveLength(1);
    expect(context.played[0]?.loop).toBe(true);
  });

  it('stops the alarm and can start it again', async () => {
    const { context, cues } = await setup();
    cues.startLoop('event.fire');
    cues.stopLoop('event.fire');
    expect(context.played[0]?.stopped).toBe(true);
    expect(cues.isLooping('event.fire')).toBe(false);
    cues.startLoop('event.fire');
    expect(context.played).toHaveLength(2);
  });

  it('starts an alarm asked for before unlock once audio is unlocked', async () => {
    const { context, player, cues } = await setup({ unlocked: false });
    cues.startLoop('event.bomb');
    expect(context.played).toHaveLength(0);
    await player.unlock();
    expect(context.played).toHaveLength(1);
  });

  it('forgets an alarm stopped before unlock', async () => {
    const { context, player, cues } = await setup({ unlocked: false });
    cues.startLoop('event.bomb');
    cues.stopLoop('event.bomb');
    await player.unlock();
    expect(context.played).toHaveLength(0);
  });

  it('keeps an alarm silent but running while muted', async () => {
    const { context, player, cues } = await setup();
    player.setMasterGain(0);
    cues.startLoop('event.bomb');
    expect(context.played[0]?.heard).toBe(0);
    player.setMasterGain(1);
    expect(context.played[0]?.heard).toBeCloseTo(0.8);
  });
});

describe('SfxCues ducking', () => {
  it('plays other effects at half volume during an alarm and at full volume after', async () => {
    const { context, cues } = await setup();
    cues.startLoop('event.bomb');
    cues.play('build.place');
    expect(context.played[1]?.heard).toBeCloseTo(0.8 * 0.5);
    cues.stopLoop('event.bomb');
    cues.play('build.place');
    expect(context.played[2]?.heard).toBeCloseTo(0.8);
  });
});
