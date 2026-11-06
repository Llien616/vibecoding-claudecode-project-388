// GitHub connector helpers for the tracker skill.
//
// The run data lives in the Llien616/tracker-data repository; files are read and
// written through the GitHub Contents API (one write = one commit), so the skill
// never clones the repository.

export const REPO = process.env.TRACKER_REPO ?? 'Llien616/tracker-data';
export const BRANCH = process.env.TRACKER_BRANCH ?? 'main';

const token = () => process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GITHUB_TOKEN;

const headers = () => {
  const value = token();
  if (!value) throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN is not set');
  return {
    Authorization: `Bearer ${value}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'price-tracker-skill',
  };
};

export const RUN_FILE_RE = /^\d{4}-\d{2}-\d{2}\.json$/;

export const localDate = (now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

// All run files in the repository, newest first.
export const listRunFiles = async () => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents?ref=${BRANCH}`, { headers: headers() });
  if (!res.ok) throw new Error(`list ${REPO}: ${res.status} ${await res.text()}`);
  const entries = await res.json();
  return entries
    .filter((entry) => entry.type === 'file' && RUN_FILE_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
};

// Last run strictly before `date` — that is the run to compare with.
export const findPreviousRun = async (date) => listRunFiles().then((files) => files.find((name) => name < `${date}.json`) ?? null);

export const readRun = async (fileName) => {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${fileName}?ref=${BRANCH}`, { headers: headers() });
  if (!res.ok) throw new Error(`read ${fileName}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
};

export const writeRun = async (fileName, rows) => {
  const content = `${JSON.stringify(rows, null, 2)}\n`;
  const existing = await fetch(`https://api.github.com/repos/${REPO}/contents/${fileName}?ref=${BRANCH}`, {
    headers: headers(),
  });
  const sha = existing.ok ? (await existing.json()).sha : undefined;
  if (!existing.ok && existing.status !== 404) {
    throw new Error(`read ${fileName}: ${existing.status} ${await existing.text()}`);
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${fileName}`, {
    method: 'PUT',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `${sha ? 'Update' : 'Add'} price run ${fileName.replace(/\.json$/, '')}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`write ${fileName}: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return { path: fileName, commit: body.commit?.sha, html_url: body.content?.html_url };
};
