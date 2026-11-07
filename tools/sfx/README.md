# Sound effects

Generates the game sound effects with the ElevenLabs sound effects API, normalizes their loudness and writes them to `assets/sfx/` as `<id>.ogg` and `<id>.mp3`.

## Requirements

- Node 22 and pnpm.
- ffmpeg with libvorbis and libmp3lame on the `PATH`, or its full path in `FFMPEG_PATH`. The gyan.dev "full" build on Windows (`winget install Gyan.FFmpeg`) and the Debian/Ubuntu `ffmpeg` package both include them.
- An ElevenLabs API key, only when an effect has to be generated. The script looks for `ELEVENLABS_API_KEY` in this order: the environment, `tools/sfx/.env`, the repo root `.env`, `~/.claude/elevenlabs.env`. `.env` files are ignored by git. The key is never printed.

## Usage

```bash
cd tools/sfx
pnpm install
pnpm generate --dry-run           # list what would be generated, no API calls
pnpm generate --only ui-click     # one effect
pnpm generate                     # every effect in effects.json
pnpm generate --reprocess         # re-encode everything from raw/, no API calls
```

`--effects <path>` reads a different effects list.

## How it works

The effects are listed in `effects.json`. Each one has an `id`, the `prompt`, the final `duration` in seconds, a `loop` flag and a `loudness` target in LUFS.

For each effect the script:

1. Skips it when both `assets/sfx/<id>.ogg` and `assets/sfx/<id>.mp3` exist.
2. Calls the API only when `raw/<id>.mp3` does not exist, and saves the response there. Commit the raw files: they are what the credits paid for, and every later encode starts from them.
3. Shapes the sound. One-shots are downmixed to mono, lose their leading silence, are cut to `duration` and get a short fade-out. The API does not accept less than 0.5 s, so shorter effects are requested at 0.5 s and cut. Loops stay stereo and are not trimmed, so the seam the API made stays clean.
4. Measures integrated loudness of the shaped sound (EBU R128, padded to 3 s so very short clips can be measured) and applies a fixed gain to reach the target. One-shots then go through a limiter at -3 dBFS, which may take up to 6 dB off the loudest peaks, so the true peak stays under -1 dBTP after encoding. Loops get no limiter; their gain is capped at -1 dBTP instead.
5. Writes 44.1 kHz ogg (Vorbis q4) and mp3 (128 kb/s).

If an effect fails to encode (for example the API returned near silence), the raw file is kept, the remaining effects are processed and the script exits with code 1.

MP3 adds a few milliseconds of padding at the start, so loops should be played from the ogg file where the browser supports it.

## Tests

The tests run with the rest of the repo from the root (`pnpm lint`, `pnpm typecheck`, `pnpm test`). From this folder, `pnpm test` runs only these tests. The ffmpeg tests are skipped when ffmpeg is missing.
