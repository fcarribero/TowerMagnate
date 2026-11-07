/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MESSAGE_IDS, NEWS_IDS, NEWS_RULES } from './messages';

const designDir = new URL('../../../docs/design/', import.meta.url);

interface CatalogRow {
  key: string;
  cells: string[];
}

function tableRows(markdown: string): CatalogRow[] {
  return markdown
    .split('\n')
    .filter((line) => /^\| `(news|dialog)\.[^`]+` \|/.test(line))
    .map((line) => {
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      const key = (cells[0] ?? '').replaceAll('`', '');
      return { key, cells };
    });
}

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  const next = markdown.indexOf('\n### ', start + heading.length);
  return markdown.slice(start, next === -1 ? undefined : next);
}

const catalog = tableRows(readFileSync(new URL('messages.md', designDir), 'utf8'));
const catalogByKey = new Map(catalog.map((row) => [row.key, row]));

describe('MESSAGE_IDS', () => {
  it('has no duplicates', () => {
    expect(new Set(MESSAGE_IDS).size).toBe(MESSAGE_IDS.length);
  });

  it('has a catalog row in messages.md for every id', () => {
    const missing = MESSAGE_IDS.filter((id) => !catalogByKey.has(id));
    expect(missing).toEqual([]);
  });

  it('lists every key of the messages.md catalog', () => {
    const known = new Set<string>(MESSAGE_IDS);
    const extra = catalog.map((row) => row.key).filter((key) => !known.has(key));
    expect(extra).toEqual([]);
  });

  it('keeps every news text of ui.md 13.9 unchanged in the catalog', () => {
    const ui = readFileSync(new URL('ui.md', designDir), 'utf8');
    const uiRows = tableRows(section(ui, '### 13.9 News and notices'));
    expect(uiRows.length).toBeGreaterThan(0);
    for (const uiRow of uiRows) {
      expect(catalogByKey.get(uiRow.key)?.cells[1], uiRow.key).toBe(uiRow.cells[1]);
    }
  });
});

describe('NEWS_RULES', () => {
  it('matches the alert flag and scope of each catalog row', () => {
    for (const id of NEWS_IDS) {
      const cells = catalogByKey.get(id)?.cells ?? [];
      const [, , , alertCell, , scopeCell] = cells;
      expect(NEWS_RULES[id].alert, id).toBe(alertCell === 'yes');
      expect(scopeCell?.split(',')[0], id).toBe(NEWS_RULES[id].scope);
      expect(scopeCell?.includes('1 per day') ?? false, id).toBe(NEWS_RULES[id].oncePerDay);
    }
  });

  it('keeps every notice at least one game hour apart', () => {
    for (const id of NEWS_IDS) {
      expect(NEWS_RULES[id].minGapMinutes, id).toBeGreaterThanOrEqual(60);
    }
  });

  it('marks as alerts only bomb, fire, negative balance, cockroaches and blocked star checks', () => {
    const alerts = NEWS_IDS.filter((id) => NEWS_RULES[id].alert);
    const allowed =
      /^news\.(bombThreat|bombExploded|fire|upkeepNegative|balanceNegative|cockroaches|starBlocked\w+)$/;
    expect(alerts.filter((id) => !allowed.test(id))).toEqual([]);
  });
});
