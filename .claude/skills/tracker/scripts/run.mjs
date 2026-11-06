#!/usr/bin/env node
// Run the price tracker over the fixed list of products.
//
// This script contains no price-parsing or anti-bot logic of its own: it calls
// the extract-price skill scripts in order (fetch_page.mjs -> extract_price.mjs)
// and collects their output into a single table.
//
// Usage:
//   node run.mjs [--limit=N] [--json] [--out=file.md] [--urls=path] [--pause=20]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.resolve(here, '..');
const repoRoot = path.resolve(skillDir, '..', '..', '..');
const extractDir = path.join(repoRoot, '.claude', 'skills', 'extract-price', 'scripts');

const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [key, value] = a.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const urlsFile = path.resolve(flags.urls ?? path.join(skillDir, 'urls.txt'));
const pauseMs = Number(flags.pause ?? 20) * 1000;
const limit = flags.limit ? Number(flags.limit) : Infinity;
const runJs = (script, args) => {
  const res = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || '').trim();
    throw new Error(detail || `exit code ${res.status}`);
  }
  return res.stdout;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readUrls = () =>
  fs
    .readFileSync(urlsFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

const productId = (url) => (url.match(/-(\d{6,})\/?/) ?? url.match(/\/product\/(\d{6,})/))?.[1] ?? '';

const checkOne = (url) => {
  const id = productId(url) || String(Date.now());
  const htmlPath = path.join(os.tmpdir(), `tracker-${id}.html`);
  const raw = runJs(path.join(extractDir, 'fetch_page.mjs'), [url, htmlPath, '--timeout=60']);
  const fetched = JSON.parse(raw);

  const parsed = JSON.parse(runJs(path.join(extractDir, 'extract_price.mjs'), [fetched.html]));
  return {
    url,
    regular_price: parsed.regularPrice ?? '—',
    sale_price: parsed.cardPrice ?? '—',
    has_credit: false,
  };
};

const toMarkdown = (rows) => {
  const lines = [
    '| # | URL | regular_price | sale_price | has_credit |',
    '|---|-----|---------------|------------|------------|',
    ...rows.map((row, i) => `| ${i + 1} | ${row.url} | ${row.regular_price} | ${row.sale_price} | ${row.has_credit} |`),
  ];
  return lines.join('\n');
};

const main = async () => {
  const urls = readUrls().slice(0, limit === Infinity ? undefined : limit);
  if (!urls.length) throw new Error(`no URLs in ${urlsFile}`);

  const rows = [];
  for (const [index, url] of urls.entries()) {
    if (index > 0) {
      process.stderr.write(`pause ${pauseMs / 1000}s\n`);
      await sleep(pauseMs);
    }
    process.stderr.write(`[${index + 1}/${urls.length}] ${url}\n`);
    try {
      rows.push(checkOne(url));
    } catch (err) {
      process.stderr.write(`  failed: ${err.message.split('\n')[0]}\n`);
      rows.push({ url, regular_price: '—', sale_price: '—', has_credit: false });
    }
  }

  const output = flags.json ? JSON.stringify(rows, null, 2) : toMarkdown(rows);
  console.log(output);
  if (typeof flags.out === 'string') {
    fs.writeFileSync(path.resolve(flags.out), `${output}\n`);
    process.stderr.write(`saved ${flags.out}\n`);
  }
};

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
