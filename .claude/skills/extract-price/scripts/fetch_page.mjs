#!/usr/bin/env node
// Load an Ozon product page through a real, visible Chrome instance.
//
// Ozon's anti-bot blocks plain HTTP clients (curl) and headless Chrome with
// "Похоже, нет соединения" — the check is based on the client fingerprint, not
// on the IP address. A visible Chrome window passes it, so this script launches
// Chrome with the DevTools protocol enabled, waits for the page to render, and
// saves the resulting DOM.
//
// Usage:
//   node fetch_page.mjs <url> [output.html] [--port=9222] [--timeout=40]
//
// Prints {"html":"<path>","url":"...","title":"..."} on success.
// Exits with a non-zero code and a JSON error on failure.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const positional = args.filter((a) => !a.startsWith('--'));

const targetUrl = positional[0];
if (!targetUrl) {
  console.error(JSON.stringify({ error: 'usage: node fetch_page.mjs <url> [output.html]' }));
  process.exit(2);
}

const port = Number(flags.port ?? 9222);
const timeoutMs = Number(flags.timeout ?? 40) * 1000;
const outFile = path.resolve(positional[1] ?? path.join(os.tmpdir(), `ozon-${Date.now()}.html`));
const profileDir = path.join(os.tmpdir(), `ozon-cdp-profile-${Date.now()}`);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error(JSON.stringify({ error: 'Chrome not found; set CHROME_PATH' }));
  process.exit(3);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cdpVersion = async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

// Launch Chrome detached from this process tree: a plain spawn/& dies together
// with the calling shell, but a process created by the WMI provider survives.
const launchChrome = () => {
  const cmdline = [
    `"${chrome}"`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir="${profileDir}"`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-mode',
    '--window-size=1280,900',
    'about:blank',
  ].join(' ');

  if (process.platform === 'win32') {
    const ps = `$p = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '${cmdline.replace(/'/g, "''")}' }; $p.ProcessId`;
    const encoded = Buffer.from(ps, 'utf16le').toString('base64');
    execFileSync('powershell', ['-NoProfile', '-EncodedCommand', encoded], { stdio: 'ignore' });
  } else {
    spawn(chrome, cmdline.split(' ').slice(1), { detached: true, stdio: 'ignore' }).unref();
  }
};

const connect = async (wsUrl) => {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const waiter = msg.id && pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    msg.error ? waiter.reject(new Error(JSON.stringify(msg.error))) : waiter.resolve(msg.result);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
  });
  return { ws, send };
};

const main = async () => {
  let launched = false;
  if (!(await cdpVersion())) {
    launchChrome();
    launched = true;
    const deadline = Date.now() + 20000;
    while (!(await cdpVersion())) {
      if (Date.now() > deadline) throw new Error('Chrome did not expose the debugging port');
      await sleep(500);
    }
  }

  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!page) throw new Error('No page target in Chrome');

  const { ws, send } = await connect(page.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Page.navigate', { url: targetUrl });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'evaluation failed');
    return r.result.value;
  };

  // Wait until the price widget is rendered (means the anti-bot page is gone),
  // bail out early if Ozon served the block page.
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await evaluate(`(() => {
      const html = document.documentElement.outerHTML;
      return {
        url: location.href,
        title: document.title,
        ready: document.readyState,
        hasPrice: !!document.querySelector('[id^="state-webPrice-"]'),
        blocked: /Похоже, нет[\\s\\S]{0,20}соединения/.test(document.body.innerText || ''),
        blockedHeadless: /Доступ ограничен|Подтвердите, что запросы отправляли вы/i.test(document.body.innerText || ''),
      };
    })()`);
    if (state.blocked || state.blockedHeadless) throw new Error(`Ozon blocked the request (${state.title})`);
    if (state.hasPrice) break;
    await sleep(1000);
  }
  if (!state?.hasPrice) throw new Error(`Price widget not found after ${timeoutMs / 1000}s`);

  const html = await evaluate('document.documentElement.outerHTML');
  fs.writeFileSync(outFile, html ?? '');

  try {
    const v = await cdpVersion();
    if (v) {
      const { send: sendBrowser } = await connect(v.webSocketDebuggerUrl);
      await sendBrowser('Browser.close');
      await sleep(500);
    }
  } catch {
    /* browser already gone */
  }
  ws.close();

  console.log(JSON.stringify({ html: outFile, url: state.url, title: state.title }, null, 2));
};

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  if (!flags.keepOpen) {
    cdpVersion()
      .then((v) => v && connect(v.webSocketDebuggerUrl))
      .then((c) => c?.send('Browser.close'))
      .catch(() => {});
  }
  process.exit(1);
});
