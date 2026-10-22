#!/usr/bin/env node
/* The fairness checks in a real page (headless Chrome over the DevTools protocol, node 22's built-in WebSocket, no npm):
   node tools/fair.js [script.js] [width height]
   Defaults: tools/fair-checks.js at 1280 x 800, on this folder's index.html opened from file://, or set URL=... The script is one async function expression; it runs muted, drives the game
   with real keydown / keyup events on window, and returns { ok, checks }. Exit code 0 when ok. */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const [script = path.join(__dirname, 'fair-checks.js'), W = '1280', H = '800'] = process.argv.slice(2);
const code = fs.readFileSync(script, 'utf8');
const port = 9400 + Math.floor(Math.random() * 400);
const prof = fs.mkdtempSync(path.join(require('os').tmpdir(), 'jetpacktt-fair-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
  '--no-first-run', '--no-default-browser-check', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let ws, ok = false;
  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) {
      try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(200); }
    }
    const page = targets.find((t) => t.type === 'page');
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map(), logs = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description));
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('ERR ' + d.params.args.map((a) => a.value || a.description).join(' '));
    };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
    const url = process.env.URL || 'file://' + path.join(__dirname, '..', 'index.html');
    await send('Page.navigate', { url });
    await sleep(3000);
    // always muted (Alan works next to the sessions), English, no saved bests
    await send('Runtime.evaluate', { expression: "localStorage.setItem('claudeGames.muted', '1'); localStorage.removeItem('claudeGames.lang'); localStorage.removeItem('jetpackTT.v1'); location.reload()" });
    await sleep(4000);
    const r = await send('Runtime.evaluate', { expression: `(${code})()`, awaitPromise: true, returnByValue: true, timeout: 900000 });
    const res = r.result || {};
    if (res.exceptionDetails || !res.result || res.result.value === undefined) {
      console.log('the script did not return a value:', JSON.stringify(res.exceptionDetails || res).slice(0, 1500));
    }
    const v = res.result ? res.result.value : undefined;
    const out = typeof v === 'string' ? JSON.parse(v) : v || {};
    ok = !!(out && out.ok);
    console.log(JSON.stringify(out, null, 1));
    if (logs.length) console.log('page errors:\n' + logs.join('\n'));
  } catch (e) {
    console.error(e);
  } finally {
    try { ws && ws.close(); } catch (e) { /* closed */ }
    await new Promise((r) => { chrome.once('exit', r); chrome.kill(); setTimeout(r, 3000); });
    try { fs.rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* temp folder */ }
    process.exit(ok ? 0 : 1);
  }
})();
