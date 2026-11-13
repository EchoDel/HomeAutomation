/* End to end through the whole chain: real Firefox -> real server.py ->
   fake Home Assistant. Saves a connection, picks an entity from what it read,
   then forgets it again.

   Needs server.py running (python3 server.py) and Firefox. Run with:

       npm run test:e2e

   It refuses to run if a connection is already saved, and always deletes what
   it created, so it never disturbs a real setup. */
const { spawn } = require('child_process');
const path = require('path');
const { launch, connect, sleep } = require('./marionette.js');
const { checker } = require('./_harness.js');

const APP = process.env.APP_URL || 'http://127.0.0.1:8765/';
const API = new URL('/api/ha/', APP).href;
const sleepFor = ms => new Promise(r => setTimeout(r, ms));

async function api(pathname, opts) {
  let res;
  try {
    res = await fetch(API + pathname, opts);
  } catch (e) {
    throw new Error(`cannot reach ${APP} - start it with "python3 server.py" ` +
      `or set APP_URL (${e.message})`);
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (err) { data = { raw: text }; }
  return { status: res.status, data };
}

function startFakeHA() {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [path.join(__dirname, 'fake_ha.py'), '0'],
      { stdio: ['ignore', 'pipe', 'inherit'] });
    let buffer = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('fake Home Assistant did not start'));
    }, 15000);
    proc.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const match = buffer.match(/PORT (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ proc, url: 'http://127.0.0.1:' + match[1] });
      }
    });
    proc.on('error', reject);
  });
}

(async () => {
  /* Never touch a connection the user already has. */
  const before = await api('status');
  if (!before.data || before.data.configured) {
    console.log('SKIPPED: a Home Assistant connection is already saved, nothing was touched.');
    return process.exit(0);
  }

  const fake = await startFakeHA();
  const { say, done } = checker();
  let ff = null;
  let client = null;

  try {
    ff = await launch('about:blank');
    client = await connect(ff.port);
    await client.newSession();
    await client.navigate(APP);
    await sleep(3500);
    const run = async script => (await client.script(script, [])).value;
    const wait = async script => (await client.asyncScript(script, [])).value;

    console.log('\n== connect through the dialog ==');
    await run(`document.querySelector('#btnHA').click(); return true;`);
    await sleepFor(600);
    say(await run(`return document.querySelector('#haDialog').hasAttribute('open');`),
      'the dialog opened');
    await run(`
      document.querySelector('#haUrl').value = ${JSON.stringify(fake.url)};
      document.querySelector('#haToken').value = 'e2e-token';
      document.querySelector('#btnHASave').click();
      return true;
    `);
    const status = await wait(`
      const done = arguments[arguments.length - 1];
      let n = 0;
      (function poll() {
        const text = (document.querySelector('#haStatus') || {}).textContent || '';
        if (/entities read|error|reject|reach/i.test(text) || ++n > 40) return done(text.trim());
        setTimeout(poll, 250);
      })();
    `);
    console.log('  status: ' + status);
    say(/5 entities read/.test(status), 'five entities read from the fake instance');
    say(!/e2e-token/.test(status), 'and the token is not echoed back into the page');

    console.log('\n== pick one of them on a fixture ==');
    await run(`
      const d = document.querySelector('#haDialog');
      if (d && d.close) d.close();
      document.querySelector('#iconChips .chip').click();
      return true;
    `);
    await sleepFor(500);
    const offered = JSON.parse(await wait(`
      const done = arguments[arguments.length - 1];
      const input = document.querySelector('#inspectorBody .entity-input');
      if (!input) return done('{"rows":[]}');
      input.focus();
      let n = 0;
      (function poll() {
        const rows = Array.from(document.querySelectorAll('.entity-row code'))
          .map(x => x.textContent);
        if (rows.length || ++n > 30) {
          const target = Array.from(document.querySelectorAll('#inspectorBody .entity-row'))
            .find(r => r.querySelector('code').textContent === 'switch.tuya_plug_1');
          if (target) target.click();
          return done(JSON.stringify({ rows: rows }));
        }
        setTimeout(poll, 250);
      })();
    `));
    console.log('  offered: ' + offered.rows.join(', '));
    say(offered.rows.indexOf('switch.tuya_plug_1') !== -1,
      'the Smart Life plug was offered');

    await sleepFor(700);
    const fixture = JSON.parse(await run(`
      const input = document.querySelector('#inspectorBody .entity-input');
      const domain = Array.from(document.querySelectorAll('#inspectorBody select'))
        .find(s => Array.from(s.options).some(o => o.value === 'switch'
          && /on\\/off/.test(o.textContent)));
      const note = document.querySelector('#inspectorBody .entity-note');
      return JSON.stringify({
        entity: input ? input.value : '',
        domain: domain ? domain.value : '',
        note: note ? note.textContent.trim() : '',
        yaml: /switch\\.tuya_plug_1/.test(document.querySelector('#yamlOutput').textContent)
      });
    `));
    console.log('  fixture: ' + JSON.stringify(fixture));
    say(fixture.entity === 'switch.tuya_plug_1', 'the fixture holds that entity id');
    say(fixture.domain === 'switch', 'the domain followed it, got ' + fixture.domain);
    say(/Smart Life plug/.test(fixture.note), 'the note confirms the entity name');
    say(fixture.yaml, 'the id is in the generated dashboard');
  } finally {
    if (client) client.close();
    if (ff) ff.cleanup();
    fake.proc.kill('SIGKILL');
    /* Whatever happened, leave no connection behind. */
    const now = await api('status').catch(() => ({ data: {} }));
    if (now.data && now.data.configured) await api('config', { method: 'DELETE' });
    const after = await api('status').catch(() => ({ data: {} }));
    console.log('\nleft over: ' + JSON.stringify(after.data || {}));
  }

  process.exit(done('end to end') ? 1 : 0);
})().catch(e => { console.error('harness error:', e.message); process.exit(2); });
