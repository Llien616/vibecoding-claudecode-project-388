#!/usr/bin/env node
// Compare a tracker run with the previous one and report significant changes.
//
// The rules live in ../KNOWLEDGE.md:
//   1. regular_price changed by >= 5% (both directions)
//   2. sale_price appeared (was missing before)
//   3. sale_price decreased
//   4. URL is new
//   5. URL disappeared
//
// Usage:
//   node run.mjs | node compare.mjs            # baseline = latest run before today
//   node compare.mjs --file=run.json --date=2026-11-06
//
// Prints a JSON array of significant events ([] when there is nothing to report).

import fs from 'node:fs';
import { findPreviousRun, localDate, readRun } from './lib/github.mjs';

const PRICE_THRESHOLD_PERCENT = 5;

const ABSENT = new Set(['', '—', '-', 'null', 'undefined']);

export const parsePrice = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (ABSENT.has(text)) return null;
  const digits = text.replace(/[\s\u00a0\u202f₽]/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (!digits) return null;
  const num = Number(digits);
  return Number.isFinite(num) ? num : null;
};

const round2 = (n) => Math.round(n * 100) / 100;

const priceField = (rule, url, field, previous, current, extra = {}) => ({
  rule,
  url,
  field,
  previous,
  current,
  ...extra,
});

// Rows are matched by URL. Returns only significant events.
export const compareRuns = (previousRows, currentRows) => {
  const previousByUrl = new Map(previousRows.map((row) => [row.url, row]));
  const currentByUrl = new Map(currentRows.map((row) => [row.url, row]));
  const events = [];

  for (const current of currentRows) {
    const previous = previousByUrl.get(current.url);
    if (!previous) {
      // Rule 4: the URL was not present in the previous run.
      events.push(priceField(4, current.url, 'url', null, current.url, { reason: 'new url' }));
      continue;
    }

    // Rule 1: regular_price moved by the threshold in either direction.
    const oldRegular = parsePrice(previous.regular_price);
    const newRegular = parsePrice(current.regular_price);
    if (oldRegular !== null && oldRegular > 0 && newRegular !== null) {
      const changePercent = round2(((newRegular - oldRegular) / oldRegular) * 100);
      if (Math.abs(changePercent) >= PRICE_THRESHOLD_PERCENT) {
        events.push(
          priceField(1, current.url, 'regular_price', previous.regular_price, current.regular_price, {
            change_percent: changePercent,
            reason: `regular_price changed by ${changePercent}% (threshold ${PRICE_THRESHOLD_PERCENT}%)`,
          }),
        );
      }
    }

    // Rules 2 and 3: sale_price appeared or became cheaper.
    const oldSale = parsePrice(previous.sale_price);
    const newSale = parsePrice(current.sale_price);
    if (oldSale === null && newSale !== null) {
      events.push(
        priceField(2, current.url, 'sale_price', null, current.sale_price, { reason: 'sale_price appeared' }),
      );
    } else if (oldSale !== null && newSale !== null && newSale < oldSale) {
      events.push(
        priceField(3, current.url, 'sale_price', previous.sale_price, current.sale_price, {
          reason: 'sale_price decreased',
        }),
      );
    }
  }

  for (const previous of previousRows) {
    if (!currentByUrl.has(previous.url)) {
      // Rule 5: the URL disappeared from the current run.
      events.push(priceField(5, previous.url, 'url', previous.url, null, { reason: 'url missing in current run' }));
    }
  }

  return events;
};

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/compare.mjs');

if (isMain) {
  const flags = Object.fromEntries(
    process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
      const [key, value] = a.replace(/^--/, '').split('=');
      return [key, value ?? true];
    }),
  );

  const raw = flags.file ? fs.readFileSync(String(flags.file), 'utf8') : fs.readFileSync(0, 'utf8');
  const currentRows = JSON.parse(raw);
  const date = String(flags.date ?? localDate());
  const previousFile = await findPreviousRun(date);

  if (!previousFile) {
    console.log(JSON.stringify([], null, 2));
    process.stderr.write('no previous run — nothing to compare\n');
  } else {
    const previousRows = await readRun(previousFile);
    process.stderr.write(`comparing with ${previousFile}\n`);
    console.log(JSON.stringify(compareRuns(previousRows, currentRows), null, 2));
  }
}
