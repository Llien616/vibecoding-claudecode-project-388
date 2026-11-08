#!/usr/bin/env node
// Full tracker run: prices -> comparison with the previous run -> publish.
//
//   1. Collect prices for every URL with the extract-price skill scripts.
//   2. List the run files in Llien616/tracker-data and read the newest one
//      before the current date (the previous run). No previous runs — no comparison.
//   3. Match products by URL and compare regular_price / sale_price using the
//      rules from KNOWLEDGE.md (repository root).
//   4. Publish the run as YYYY-MM-DD.json (single commit through the connector).
//
// Only significant changes are printed (JSON array, [] when nothing happened).
//
// Usage:
//   node track.mjs [--limit=N] [--date=YYYY-MM-DD] [--no-publish]

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareRuns } from './compare.mjs';
import { findPreviousRun, localDate, readRun, writeRun } from './lib/github.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const runScript = path.join(here, 'run.mjs');

const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [key, value] = a.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const date = String(flags.date ?? localDate());

const collectPrices = () => {
  const passthrough = ['--limit', '--urls', '--pause']
    .filter((name) => flags[name.replace(/^--/, '')] !== undefined)
    .map((name) => `${name}=${flags[name.replace(/^--/, '')]}`);
  const res = spawnSync(process.execPath, [runScript, ...passthrough], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error('price collection failed');
  return JSON.parse(res.stdout);
};

const main = async () => {
  const currentRows = collectPrices();
  process.stderr.write(`collected ${currentRows.length} rows\n`);

  const previousFile = await findPreviousRun(date);
  let events = [];
  if (previousFile) {
    const previousRows = await readRun(previousFile);
    events = compareRuns(previousRows, currentRows);
    process.stderr.write(`compared with ${previousFile}: ${events.length} significant changes\n`);
  } else {
    process.stderr.write('no previous run — comparison skipped\n');
  }

  if (!flags['no-publish']) {
    const published = await writeRun(`${date}.json`, currentRows);
    process.stderr.write(`published ${published.path} (${published.commit})\n`);
  }

  console.log(JSON.stringify(events, null, 2));
};

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
