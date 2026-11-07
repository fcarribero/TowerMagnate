import { readFileSync } from 'node:fs';

interface PackageManifest {
  version: string;
}

export function readServerVersion(): string {
  const manifestUrl = new URL('../package.json', import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8')) as PackageManifest;
  return manifest.version;
}
