/* A new draft should need nothing but entity ids, and an existing draft must
   keep the mode it was saved with. This is the behaviour the Tuya Smart Plus
   default change was about. */
const { boot, checker } = require('./_harness.js');

const { win } = boot({ offline: true, box: false });
const { say, done } = checker();
const S = win.LightingState, Y = win.LightingYaml;

const gen = st => Object.fromEntries(Y.generate(st).files.map(f => [f.name, f.content]));
const issues = st => Y.generate(st).issues;

const fresh = S.defaultState();
const freshIssues = issues(fresh);
const warns = freshIssues.filter(i => i.level !== 'info');

console.log('== a brand new draft ==');
say(fresh.tuya.mode === 'none', 'the default mode is "no Tuya config", got ' + fresh.tuya.mode);
say(!freshIssues.some(i => /Tuya device id|Tuya Smart Plus/.test(i.text)), 'no fixture is nagged about a device id');
say(!warns.filter(i => /tuya/i.test(i.text)).length, 'no Tuya warnings at all');
say(freshIssues.some(i => i.level === 'info' && /only the dashboard is generated/.test(i.text)),
  'it says plainly that only the dashboard is generated');
say(fresh.locations.every(l => l.icons.every(i => i.entity)), 'every fixture already has an entity id');

console.log('\n== the dashboard is complete and usable as is ==');
const files = gen(fresh);
const dash = files['dashboard.yaml'];
const icons = (dash.match(/- type: state-icon/g) || []).length;
say(icons === 9, 'nine lights across both views, got ' + icons);
say(dash.includes('entity: \'light.floor_1_uplighter\''), 'the entity ids are what the cards use');
say(!/tuya_local|device_id|local_key/.test(dash), 'the dashboard contains no Tuya device data');
say(files['INSTALL.txt'].includes('Nothing to add'), 'the install notes say there is nothing to add');

console.log('\n== an existing draft keeps its own setting ==');
const old = S.defaultState();
old.tuya.mode = 'local';
say(S.migrate(JSON.parse(JSON.stringify(old))).tuya.mode === 'local',
  'a draft saved as local still opens as local');
say(S.migrate({ locations: [{ name: 'Old', icons: [] }] }).tuya.mode === 'none',
  'a draft with no tuya section gets the new default');

console.log('\n== a measured image ratio survives a reload ==');
const measured = S.defaultState();
measured.locations[0].imageRatio = 1.7778;
say(S.migrate(JSON.parse(JSON.stringify(measured))).locations[0].imageRatio === 1.7778,
  'the ratio the builder measured is kept when the draft is reopened');
say(S.defaultState().locations[0].imageRatio === 0,
  'and a draft that has never measured an image defaults to 0 (no fit block)');

console.log('\n== opting in still works ==');
const opted = S.defaultState();
opted.tuya.mode = 'local';
opted.locations[0].icons[0].tuya.deviceId = 'bfabc';
opted.locations[0].icons[0].tuya.localKey = 'k1';
const pkg = gen(opted)['lighting_package.yaml'];
say(/tuya_local:/.test(pkg), 'choosing local writes the tuya_local block');
say(pkg.includes('device_id: \'bfabc\''), 'with the device id it was given');
const reminders = issues(opted).filter(i => i.level !== 'info' && /device id/.test(i.text));
say(reminders.length === 8, 'the reminders then cover only the other eight fixtures (' + reminders.length + ')');

process.exit(done('defaults') ? 1 : 0);
