import { readFileSync } from 'node:fs';

const metricsUrl = new URL('../metrics.json', import.meta.url);

export const metrics = JSON.parse(readFileSync(metricsUrl, 'utf8'));
