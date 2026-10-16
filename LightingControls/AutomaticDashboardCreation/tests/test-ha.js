/* Picking entities that already exist in Home Assistant: the picker itself,
   the connection dialog, and that a fixture works with no connection at all.

   fetch is stubbed so these checks do not depend on anything listening. */
const { boot, checker } = require('./_harness.js');

const ENTITIES = [
  { id: 'light.matter_kitchen_pendant', name: 'Kitchen pendant', state: 'on', domain: 'light', dims: true },
  { id: 'light.thread_led_strip_4', name: 'LED strip 4', state: 'off', domain: 'light', dims: true },
  { id: 'switch.tuya_plug_1', name: 'Plug 1', state: 'off', domain: 'switch', dims: false },
  { id: 'number.hallway_dimmer', name: 'Hallway dimmer', state: '42', domain: 'number', unit: '%', dims: true },
  { id: 'binary_sensor.hall_motion', name: 'Hall motion', state: 'off', domain: 'binary_sensor', deviceClass: 'motion' },
  { id: 'person.echo', name: 'Echo', state: 'home', domain: 'person' }
];
const SUPPORTED = ['light', 'switch', 'number'];

function makeFetch(config, log) {
  return (url, opts) => {
    const u = String(url);
    const method = (opts && opts.method) || 'GET';
    let payload = {};
    if (u.indexOf('api/ha/status') === 0) {
      payload = { configured: config.configured, url: config.url, tokenSet: config.tokenSet };
    } else if (u.indexOf('api/ha/entities') === 0) {
      const raw = u.split('domains=')[1] || '';
      const wanted = decodeURIComponent(raw).split(',').filter(Boolean);
      payload = { entities: wanted.length
        ? ENTITIES.filter(e => wanted.indexOf(e.domain) !== -1)
        : ENTITIES, count: ENTITIES.length };
    } else if (u.indexOf('api/ha/config') === 0) {
      if (method === 'PUT') {
        const body = JSON.parse(opts.body || '{}');
        config.url = body.url || '';
        config.configured = !!(body.url && (body.token || config.tokenSet));
        config.tokenSet = config.configured;
        payload = { configured: config.configured, url: config.url, tokenSet: config.tokenSet };
      } else {
        config.configured = false;
        config.tokenSet = false;
        config.url = '';
        payload = { configured: false, url: '', tokenSet: false };
      }
    } else if (u.indexOf('api/health') === 0) {
      payload = { ok: true, server: 'LightingBuilder' };
    } else if (u.indexOf('api/base-images') === 0) {
      payload = [];
    } else if (u.indexOf('api/drafts') === 0) {
      payload = [];
    }
    const text = JSON.stringify(payload);
    log.push(method + ' ' + u + (opts && opts.body ? ' ' + opts.body : ''));
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(JSON.parse(text)),
      text: () => Promise.resolve(text)
    });
  };
}

const rowsOf = node => Array.from(node.querySelectorAll('.entity-row code')).map(n => n.textContent);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const bootLog = [];
  const { win, $, $$, tick, errors } = boot({ fetch: makeFetch(
    { configured: true, url: 'http://ha.local:8123', tokenSet: true }, bootLog) });
  const { say, done } = checker();
  const HA = win.LightingHA;
  const log = [];

  await tick(120);

  console.log('\n== the connection is known at start up ==');
  say(HA.connected(), 'LightingHA reports a connection');
  say(HA.info().url === 'http://ha.local:8123', 'and remembers the url');
  say($('#haDot').className.indexOf('on') !== -1, 'the toolbar dot shows connected');
  say(Object.keys(HA.info()).indexOf('token') === -1,
    'no token is held by the page');

  console.log('\n== the domain list is light, switch and number ==');
  const domainSelect = $$('#inspectorBody select').find(s =>
    Array.from(s.options).some(o => o.value === 'light' && /dimmable/.test(o.textContent)));
  say(!!domainSelect, 'a domain dropdown is present');
  const values = domainSelect ? Array.from(domainSelect.options).map(o => o.value) : [];
  say(JSON.stringify(values) === JSON.stringify(SUPPORTED),
    'exactly ' + SUPPORTED.join('/') + ', got ' + values.join(','));
  say(Array.from(domainSelect.options).every(o => /light|switch|number/.test(o.value)),
    'no fan or cover option is offered');

  console.log('\n== picking an existing entity ==');
  $('#iconChips .chip').click();
  await tick(40);
  const iconPicker = $('#inspectorBody .entity-picker');
  say(!!iconPicker, 'the fixture has an entity picker');
  const input = iconPicker.querySelector('.entity-input');
  input.focus();
  await tick(60);
  const suggested = rowsOf(iconPicker);
  say(suggested.length > 0, suggested.length + ' entities suggested');
  say(suggested.every(id => SUPPORTED.indexOf(id.split('.')[0]) !== -1),
    'only light/switch/number fixtures are offered: ' + suggested.join(', '));
  say(!suggested.some(id => /^(person|binary_sensor)\./.test(id)),
    'motion and person entities are not offered for a fixture');
  const titleRow = iconPicker.querySelector('.entity-row');
  say(!!titleRow && titleRow.title.indexOf(titleRow.querySelector('code').textContent) === 0,
    'each row spells out the full id (and name) on hover: ' + (titleRow && titleRow.title));

  input.value = 'plug';
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  await tick(60);
  const filtered = rowsOf(iconPicker);
  say(filtered.indexOf('switch.tuya_plug_1') !== -1,
    'typing "plug" finds the Smart Life plug: ' + filtered.join(', '));
  say(filtered.length < suggested.length, 'and narrows the list');

  const row = Array.from(iconPicker.querySelectorAll('.entity-row'))
    .find(r => r.querySelector('code').textContent === 'switch.tuya_plug_1');
  row.click();
  await tick(80);
  const afterPick = $('#inspectorBody .entity-picker');
  say(afterPick.querySelector('.entity-input').value === 'switch.tuya_plug_1',
    'the fixture now holds that entity id');
  const domainNow = $$('#inspectorBody select')
    .find(s => Array.from(s.options).some(o => o.value === 'switch' && /on\/off/.test(o.textContent)));
  say(domainNow && domainNow.value === 'switch',
    'the domain followed the entity id, got ' + (domainNow && domainNow.value));
  say(/✓|Plug 1/.test(afterPick.querySelector('.entity-note').textContent),
    'the note confirms it is a real entity: "' +
    afterPick.querySelector('.entity-note').textContent.trim().slice(0, 48) + '"');

  console.log('\n== an id that is not there says so ==');
  const input2 = $('#inspectorBody .entity-input');
  input2.value = 'light.does_not_exist';
  input2.dispatchEvent(new win.Event('input', { bubbles: true }));
  await tick(80);
  const note = $('#inspectorBody .entity-note');
  say(/not found in Home Assistant/.test(note.textContent), 'warns about a missing entity');
  say(note.className.indexOf('warn') !== -1, 'and marks it as a warning');

  console.log('\n== the motion picker only offers motion sensors ==');
  const motionToggle = $$('#inspectorBody .check').find(c =>
    /Motion sensor turns this location on/.test(c.textContent));
  say(!!motionToggle, 'the motion automation switch is there');
  if (motionToggle) { motionToggle.querySelector('input').click(); await tick(60); }
  const motionField = $$('#inspectorBody .entity-picker')
    .find(p => /Motion entity/.test(p.parentElement.textContent));
  say(!!motionField, 'a motion entity picker is present');
  if (motionField) {
    motionField.querySelector('.entity-input').focus();
    await tick(60);
    const motionRows = rowsOf(motionField);
    say(motionRows.every(id => id.indexOf('binary_sensor.') === 0),
      'only binary_sensor entities: ' + motionRows.join(', '));
  }

  console.log('\n== the connection dialog ==');
  $('#btnHA').click();
  await tick(80);
  say($('#haDialog').hasAttribute('open'), 'the dialog opens');
  say(/ha\.local:8123/.test($('#haStatus').textContent), 'and says where it is connected');

  const saveLog = [];
  const cfg = { configured: true, url: 'http://ha.local:8123', tokenSet: true };
  /* Re-point the stub's log so the save and forget calls are visible. */
  win.fetch = makeFetch(cfg, saveLog);
  $('#haUrl').value = 'http://192.168.1.10:8123';
  $('#haToken').value = 'my-long-lived-token';
  $('#btnHASave').click();
  await tick(120);
  const saved = saveLog.find(line => line.indexOf('PUT api/ha/config') === 0);
  say(!!saved, 'saving reaches the server: ' + (saved ? '(PUT /api/ha/config)' : 'nothing sent'));
  say(saved && saved.indexOf('http://192.168.1.10:8123') !== -1, 'the url is sent');
  say(saved && saved.indexOf('my-long-lived-token') !== -1, 'the token is sent once, to the server');
  say(/entities read/.test($('#haStatus').textContent),
    'the dialog reports what it read: "' + $('#haStatus').textContent.trim() + '"');
  const stored = Object.keys(win.localStorage).map(k => win.localStorage.getItem(k)).join('\n');
  say(stored.indexOf('my-long-lived-token') === -1, 'the token never reaches browser storage');
  say(JSON.stringify(HA.info()).indexOf('my-long-lived-token') === -1,
    'and never sits in the page state');

  $('#btnHAClear').click();
  await tick(80);
  say(saveLog.some(line => line.indexOf('DELETE api/ha/config') === 0), 'forget sends a delete');
  say(!HA.connected(), 'and the connection is gone');
  say($('#haDot').className.indexOf('on') === -1, 'the dot stops showing connected');
  say(/Disconnected/.test($('#haStatus').textContent), 'the dialog says it is disconnected');

  console.log('\n== with no connection at all ==');
  const offline = boot({ offline: true });
  const o = checker();
  const sayOff = (ok, label) => o.say(ok, label);
  await offline.tick(120);
  offline.$('#iconChips .chip').click();
  await offline.tick(40);
  const offPicker = offline.$('#inspectorBody .entity-picker');
  sayOff(!!offPicker, 'the picker is still there');
  const offInput = offPicker.querySelector('.entity-input');
  sayOff(/connect Home Assistant/.test(offPicker.querySelector('.entity-note').textContent),
    'it offers to connect instead of guessing: "' +
    offPicker.querySelector('.entity-note').textContent.trim().slice(0, 60) + '"');
  offInput.value = 'light.matter_kitchen_pendant';
  offInput.dispatchEvent(new offline.win.Event('input', { bubbles: true }));
  await offline.tick(120);
  sayOff(offInput.value === 'light.matter_kitchen_pendant', 'typing an id still works');
  sayOff(offPicker.querySelectorAll('.entity-row').length === 0, 'and no suggestions are offered');
  sayOff(/light\.matter_kitchen_pendant/.test(offline.$('#yamlOutput').textContent),
    'the id reaches the generated dashboard');
  sayOff(offline.$$('#inspectorBody select').find(s =>
    Array.from(s.options).some(o2 => o2.value === 'light')) !== undefined,
    'and the fixture still has its domain dropdown');

  console.log('\n== no errors ==');
  say(errors.length === 0, 'no errors' + (errors.length ? ': ' + errors[0] : ''));
  say(offline.errors.length === 0, 'no errors while offline' +
    (offline.errors.length ? ': ' + offline.errors[0] : ''));

  const bad = done('entity picker') + o.done('entity picker (offline)');
  win.close();
  offline.win.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('harness error:', e); process.exit(2); });
