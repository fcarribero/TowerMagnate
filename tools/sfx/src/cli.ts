import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findApiKey } from "./apiKey.ts";
import { assertFfmpegAvailable, ffmpegBinary, normalizeAndEncode } from "./audio.ts";
import { requestSoundEffect } from "./elevenlabs.ts";
import { loadEffects, selectEffects } from "./effects.ts";
import { generate } from "./generate.ts";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageDir, "..", "..");

const usage = `Usage: pnpm generate [options]

  --only <ids>      comma-separated effect ids (default: all)
  --dry-run         show what would happen; no API calls, no files written
  --reprocess       re-encode from tools/sfx/raw even if outputs exist
  --effects <path>  effects list (default: tools/sfx/effects.json)
  --help            show this help`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      only: { type: "string", default: "" },
      "dry-run": { type: "boolean", default: false },
      reprocess: { type: "boolean", default: false },
      effects: { type: "string", default: join(packageDir, "effects.json") },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }

  const only = values.only.split(",").map((id) => id.trim()).filter((id) => id !== "");
  const effects = selectEffects(await loadEffects(resolve(values.effects)), only);
  const ffmpeg = ffmpegBinary();
  if (!values["dry-run"]) {
    await assertFfmpegAvailable(ffmpeg);
  }

  const envFiles = [
    join(packageDir, ".env"),
    join(repoRoot, ".env"),
    join(homedir(), ".claude", "elevenlabs.env"),
  ];

  const summary = await generate(
    {
      effects,
      rawDir: join(packageDir, "raw"),
      outDir: join(repoRoot, "assets", "sfx"),
      dryRun: values["dry-run"],
      reprocess: values.reprocess,
    },
    {
      getApiKey: () => findApiKey(process.env, envFiles),
      requestSound: (effect, apiKey) => requestSoundEffect(effect, apiKey),
      encode: (input, effect, outputs) => normalizeAndEncode(ffmpeg, input, effect, outputs),
      log: (message) => console.log(message),
    },
  );

  console.log(
    `API calls: ${summary.generated.length}, encoded: ${summary.encoded.length}, ` +
      `skipped: ${summary.skipped.length}, failed: ${summary.failed.length}`,
  );
  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
