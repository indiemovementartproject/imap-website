// node run.mjs <width> <url> <js-file> [m]  -> loads the page in headless Chrome, runs the script, prints its result
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
const [width, url, jsFile, mobile] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(new URL('./p-', import.meta.url).pathname);
const ch = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--disable-gpu','--mute-audio',`--remote-debugging-port=${port}`,`--user-data-dir=${prof}`,'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
try {
  let t; for (let k = 0; k < 40 && !t; k++) { await sleep(250); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(x => x.type === 'page'); } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || { error: m.error }); pend.delete(m.id); } };
  await send('Emulation.setDeviceMetricsOverride', { width: +width, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile: !!mobile });
  await send('Page.enable'); await send('Page.navigate', { url }); await sleep(2500);
  for (let k = 0; k < 40; k++) { const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }); if (r.result?.value === 'complete') break; await sleep(500); }
  await sleep(1500);
  const r = await send('Runtime.evaluate', { expression: readFileSync(jsFile, 'utf8'), returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails ?? r, null, 1));
} catch (e) { console.log('FAILED', e.message); } finally { try { ws.close(); } catch {} ch.kill(); }
process.exit(0);
