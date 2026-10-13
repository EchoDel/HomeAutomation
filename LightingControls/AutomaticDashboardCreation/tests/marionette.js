/* Minimal Marionette client: enough to open a page in a real Firefox and run
   script in it. Speaks the length prefixed JSON protocol over a raw socket.

   Firefox is used rather than a browser automation package so the tests need
   nothing installed beyond Firefox itself. */
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function canConnect(port) {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1');
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

async function launch(url, opts) {
  opts = opts || {};
  const binary = opts.binary || process.env.FIREFOX || '/usr/bin/firefox';
  /* A profile per run: a leftover session would carry the previous run's
     settings into this one. */
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lighting-ff-'));
  const port = opts.port || 2828;
  const args = ['--headless', '--marionette', '--no-remote', '--profile', profile, url,
    '--marionette-port', String(port), '--window-size', '1600,914'];
  const proc = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MOZ_HEADLESS: '1', MOZ_HEADLESS_WIDTH: '1600', MOZ_HEADLESS_HEIGHT: '914' }
  });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.stdout.on('data', () => {});
  const portFile = path.join(profile, 'MarionetteActivePort');
  for (let i = 0; i < 120; i += 1) {
    if (proc.exitCode !== null) {
      throw new Error('firefox exited: ' + stderr.slice(-400));
    }
    let real = port;
    if (fs.existsSync(portFile)) {
      const t = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (t) real = parseInt(t, 10);
    }
    if (real && await canConnect(real)) {
      return {
        proc, port: real, profile,
        stderr: () => stderr,
        cleanup() {
          try { proc.kill('SIGKILL'); } catch (e) { /* already gone */ }
          fs.rmSync(profile, { recursive: true, force: true });
        }
      };
    }
    await sleep(500);
  }
  throw new Error('marionette never came up: ' + stderr.slice(-400));
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let buf = Buffer.alloc(0);
    let nextId = 1;
    const pending = new Map();
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const colon = buf.indexOf(0x3a);
        if (colon === -1) return;
        const len = parseInt(buf.slice(0, colon).toString(), 10);
        if (!Number.isFinite(len)) return;
        if (buf.length < colon + 1 + len) return;
        const body = buf.slice(colon + 1, colon + 1 + len).toString();
        buf = buf.slice(colon + 1 + len);
        let msg;
        try { msg = JSON.parse(body); } catch (e) { continue; }
        /* The first frame is a plain handshake object, not a command reply. */
        if (!Array.isArray(msg)) continue;
        const [, id, err, res] = msg;
        const p = pending.get(id);
        if (!p) continue;
        pending.delete(id);
        if (err) p.reject(new Error(JSON.stringify(err).slice(0, 500)));
        else p.resolve(res);
      }
    });
    sock.on('error', reject);
    sock.on('connect', () => {
      const send = (name, params) => {
        const id = nextId++;
        const payload = JSON.stringify([0, id, name, params || {}]);
        sock.write(Buffer.byteLength(payload) + ':' + payload);
        return new Promise((res, rej) => {
          pending.set(id, { resolve: res, reject: rej });
          setTimeout(() => {
            if (pending.has(id)) { pending.delete(id); rej(new Error('timeout on ' + name)); }
          }, 60000);
        });
      };
      resolve({
        send,
        newSession: () => send('WebDriver:NewSession', { capabilities: {} }),
        navigate: u => send('WebDriver:Navigate', { url: u }),
        script: (src, args) => send('WebDriver:ExecuteScript', { script: src, args: args || [] }),
        asyncScript: (src, args) => send('WebDriver:ExecuteAsyncScript', { script: src, args: args || [] }),
        close: () => sock.destroy()
      });
    });
  });
}

module.exports = { launch, connect, sleep };
