import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { findApiKey, readKeyFromEnvFile } from "../src/apiKey.ts";

describe("readKeyFromEnvFile", () => {
  it("reads a plain assignment", () => {
    assert.equal(readKeyFromEnvFile("ELEVENLABS_API_KEY=abc123\n"), "abc123");
  });

  it("handles quotes, export, comments and CRLF", () => {
    const content = "# key\r\nOTHER=1\r\nexport ELEVENLABS_API_KEY = \"abc 123\"\r\n";
    assert.equal(readKeyFromEnvFile(content), "abc 123");
  });

  it("returns undefined when the key is missing or empty", () => {
    assert.equal(readKeyFromEnvFile("OTHER=1"), undefined);
    assert.equal(readKeyFromEnvFile("ELEVENLABS_API_KEY="), undefined);
  });
});

describe("findApiKey", () => {
  it("prefers the environment variable", async () => {
    const key = await findApiKey({ ELEVENLABS_API_KEY: "from-env" }, ["/does/not/exist"]);
    assert.equal(key, "from-env");
  });

  it("uses the first env file that has the key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfx-key-"));
    const empty = join(dir, "empty.env");
    const full = join(dir, "full.env");
    await writeFile(empty, "OTHER=1\n");
    await writeFile(full, "ELEVENLABS_API_KEY=from-file\n");
    const key = await findApiKey({}, [join(dir, "missing.env"), empty, full]);
    assert.equal(key, "from-file");
  });

  it("names the searched files when no key is found", async () => {
    await assert.rejects(findApiKey({}, ["/nope/.env"]), /ELEVENLABS_API_KEY not found.*\/nope\/\.env/);
  });
});
