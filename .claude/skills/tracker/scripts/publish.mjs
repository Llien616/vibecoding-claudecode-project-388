#!/usr/bin/env node
// Publish a tracker run to the Llien616/tracker-data repository.
//
// This is the "write via connector" step: a single GitHub Contents API call
// creates one commit directly in the remote repository. Nothing is cloned and
// no local copy of the run file is kept.
//
// Usage:
//   node run.mjs | node publish.mjs            # date = today (YYYY-MM-DD)
//   node publish.mjs --file=run.json --date=2026-11-06
//
// Token: GITHUB_PERSONAL_ACCESS_TOKEN (or GITHUB_TOKEN).
// Prints {"path":"...","commit":"...","html_url":"..."} on success.

import fs from 'node:fs';

const flags = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [key, value] = a.replace(/^--/, '').split('=');
    return [key, value ?? true];
  }),
);

const repo = flags.repo ?? 'Llien616/tracker-data';
const branch = flags.branch ?? 'main';
const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GITHUB_TOKEN;

const today = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const date = String(flags.date ?? today());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(JSON.stringify({ error: `bad date: ${date}` }));
  process.exit(2);
}

const raw = flags.file ? fs.readFileSync(String(flags.file), 'utf8') : fs.readFileSync(0, 'utf8');
let rows;
try {
  rows = JSON.parse(raw);
} catch {
  console.error(JSON.stringify({ error: 'stdin is not valid JSON' }));
  process.exit(2);
}
if (!Array.isArray(rows) || rows.length === 0) {
  console.error(JSON.stringify({ error: 'expected a non-empty JSON array of rows' }));
  process.exit(2);
}
if (!token) {
  console.error(JSON.stringify({ error: 'GITHUB_PERSONAL_ACCESS_TOKEN is not set' }));
  process.exit(3);
}

const api = `https://api.github.com/repos/${repo}/contents`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'price-tracker-skill',
};

const main = async () => {
  const filePath = `${date}.json`;
  const content = `${JSON.stringify(rows, null, 2)}\n`;

  // Existing file => need its sha to update it, otherwise GitHub rejects the PUT.
  let sha;
  const existing = await fetch(`${api}/${encodeURIComponent(filePath)}?ref=${branch}`, { headers });
  if (existing.ok) sha = (await existing.json()).sha;
  else if (existing.status !== 404) {
    throw new Error(`GET ${filePath}: ${existing.status} ${await existing.text()}`);
  }

  const res = await fetch(`${api}/${encodeURIComponent(filePath)}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `${sha ? 'Update' : 'Add'} price run ${date}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) throw new Error(`PUT ${filePath}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  console.log(
    JSON.stringify({ path: filePath, commit: body.commit?.sha, html_url: body.content?.html_url }, null, 2),
  );
};

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
