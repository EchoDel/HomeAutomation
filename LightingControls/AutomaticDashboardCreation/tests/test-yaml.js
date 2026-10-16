/* Generates every yaml the builder can emit, writes it to yaml-out/ for a real
   parser to check (see check-yaml.py), and asserts on the content itself. */
const fs = require('fs');
const path = require('path');
const { boot, checker, BOX, APP } = require('./_harness.js');
const OUT = path.join(__dirname, 'yaml-out');

const { win, errors } = boot({ offline: true, box: false });
const { say, done } = checker();
const State = win.LightingState, Y = win.LightingYaml;

const cases = [];
for (let n = 1; n <= 15; n++) {
  const st = State.defaultState();
  st.locations = [st.locations[0]];                 /* one view, so counts are unambiguous */
  State.setIconCount(State.activeLocation(st), n, BOX);
  cases.push({ name: 'count-' + String(n).padStart(2, '0'), state: st });
}

const odd = State.defaultState();
odd.locations[0].name = "Bob & Sue's Loft / Attic!";
odd.locations[0].path = 'weird path';
odd.locations[0].icons = State.ICON_TYPES.map((t, i) =>
  State.makeIcon({ type: t.value, name: t.label + ' ' + (i + 1), entity: 'light.x' + i }));
odd.locations[0].iconCount = odd.locations[0].icons.length;
odd.meta.slug = 'Bad Slug!!';
cases.push({ name: 'all-types-and-odd-names', state: odd });

const rough = State.defaultState();
rough.locations[0].icons[0].entity = '';
rough.locations[0].icons[1].entity = 'nodots';
rough.locations[0].icons[2].entity = 'light.dupe';
rough.locations[0].icons[3].entity = 'light.dupe';
rough.locations[0].icons[4].hidden = true;
rough.locations[0].icons[4].tracked = false;
rough.locations[0].auto.motion = true;
cases.push({ name: 'rough-drafts', state: rough });

const opted = State.defaultState();
opted.tuya.mode = 'local';
opted.locations[0].icons[0].tuya.deviceId = 'bfabc';
opted.locations[0].icons[0].tuya.localKey = 'k1';
cases.push({ name: 'tuya-local-opt-in', state: opted });

/* A measured floor plan emits the card-level card_mod that letterboxes #root;
   this case gets it into yaml-out so check-yaml.py parses the block scalar. */
const sized = State.defaultState();
sized.locations[0].imageRatio = 1.7778;
cases.push({ name: 'measured-floor-plan', state: sized });

const iconsSrc = fs.readFileSync(path.join(APP, 'js/icons.js'), 'utf8');
const vendored = Array.from(iconsSrc.matchAll(/'([a-z-]+)':\s*'M/g)).map(m => m[1]);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let written = 0;
const iconNames = new Set();
for (const c of cases) {
  const dir = path.join(OUT, c.name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of Y.generate(c.state).files) {
    fs.writeFileSync(path.join(dir, f.name), f.content);
    written += 1;
    if (/\.(yaml|yml)$/.test(f.name)) {
      for (const m of f.content.matchAll(/icon:\s*'?mdi:([a-z0-9-]+)'?/g)) iconNames.add(m[1]);
    }
  }
}
console.log('wrote ' + written + ' files across ' + cases.length + ' drafts to ' + OUT);
console.log('vendored artwork: ' + vendored.length + ' icons');

const gen = st => Object.fromEntries(Y.generate(st).files.map(f => [f.name, f.content]));
const issues = st => Y.generate(st).issues;
const dash = out => out['dashboard.yaml'];

console.log('\n== icon names in the generated yaml ==');
const used = Array.from(iconNames).sort();
console.log('  ' + used.join(', '));
say(!used.includes('lamp-floor'), 'the invalid mdi:lamp-floor is gone');
say(used.includes('floor-lamp'), 'mdi:floor-lamp is used instead');
const known = vendored.concat(['lightbulb-on', 'lightbulb-off', 'floor-plan', 'map-marker-radius', 'lamp', 'power-plug']);
const unknown = used.filter(n => !known.includes(n));
say(unknown.length === 0, 'every icon name is a real mdi name' + (unknown.length ? ': ' + unknown.join(', ') : ''));

console.log('\n== draft shapes ==');
say((dash(gen(cases[0].state)).match(/- type: state-icon/g) || []).length === 1, 'a one light view emits one state-icon');
say((dash(gen(cases[14].state)).match(/- type: state-icon/g) || []).length === 15, 'a fifteen light view emits fifteen');
say(dash(gen(odd)).includes('mdi:chandelier'), 'a chandelier type reaches the yaml');
const roughDash = dash(gen(rough));
const kept = (roughDash.match(/- type: state-icon/g) || []).length;
/* Nine fixtures in the default draft. The one with no entity and the untracked
   one are dropped; a dotless entity is still a real thing to switch, so it
   stays on the plan even though the all-on/off scripts ignore it. */
say(kept === 7, 'the entity-less and untracked fixtures are left out, kept ' + kept);
say(roughDash.includes("entity: 'nodots'"), 'a dotless entity is still placed on the plan');
const roughIssues = issues(rough).filter(i => /is used by 2 icons/.test(i.text));
say(roughIssues.length === 2, 'a shared entity id is reported for both fixtures (' + roughIssues.length + ')');
say(kept === 9 - 2, 'and both cards are still placed, so the plan matches the draft');


console.log('\n== the package groups use the modern id-keyed form ==');
const grouped = gen(State.defaultState())['lighting_package.yaml'];
say(!/^group:\n\s+- /m.test(grouped),
  'group is a mapping, not the old list form Home Assistant now rejects');
say(/^group:\n  lighting_floor_1:\n    name: 'Lighting Floor 1'\n    entities: \[/m.test(grouped),
  'each location is keyed by its group id');
const groupLines = grouped.split('\n');
const groupAt = groupLines.indexOf('group:');
let groupCount = 0;
for (let i = groupAt + 1; i < groupLines.length && /^\s/.test(groupLines[i]); i++) {
  if (/^ {2}\S/.test(groupLines[i])) groupCount += 1;
}
say(groupCount === 2, 'one group per location, got ' + groupCount);

console.log('\n== the dashboard is raw-editor ready ==');
const rawState = State.defaultState();
const rawDash = dash(gen(rawState));
say(/^views:$/m.test(rawDash), 'dashboard.yaml is a views: mapping');
say(!/^- title:/m.test(rawDash), 'not a bare list, so the UI raw editor can take it as-is');
say(/Raw configuration editor/.test(gen(rawState)['INSTALL.txt']),
  'the install notes mention the UI route');

console.log('\n== the elements use only what picture-elements supports ==');
const elDash = dash(gen(State.defaultState()));
say(!/grid_options:/.test(elDash), 'no grid_options on picture-elements elements');
say(!/state_color: false/.test(elDash), 'no invalid state_color on the image element');
/* picture-elements ignores Jinja in `style`, so a template there breaks the
   element. Every template must sit under a card_mod block instead. */
let inCardMod = false;
const strayTemplates = [];
elDash.split('\n').forEach(line => {
  if (/^\s*- type: /.test(line)) inCardMod = false;
  if (/^\s*card_mod:/.test(line)) inCardMod = true;
  if (/\{\{|\{%/.test(line) && !inCardMod) strayTemplates.push(line.trim());
});
say(strayTemplates.length === 0,
  'no Jinja inside a plain style block' + (strayTemplates.length ? ': ' + strayTemplates[0] : ''));
say(/card_mod:/.test(elDash), 'state-dependent styling lives in card_mod instead');
say(/attribute: friendly_name/.test(elDash), 'a name label asks for friendly_name, not the state');
/* Home Assistant does Object.keys(config.style) and setProperty() each entry,
   so `style` must be a YAML mapping. A block scalar (style: |-) makes every
   setProperty a no-op and the element lands top-left, clipped by the card. */
say(/\n {12}style:\n {14}left: '[0-9.]+%'\n {14}top: '[0-9.]+%'/.test(elDash),
  'state-icon style is a mapping with left/top, not a block scalar');
say(/\n {12}style:\n {14}left: '50%'\n {14}top: '50%'\n {14}width: '100%'/.test(elDash),
  'the image element style is a mapping too, and anchored to the centre');
say(!/\n {12}style: \|-/.test(elDash),
  'no element style is emitted as a block scalar string');
/* A hardcoded white icon vanishes on a light floor plan, so the icon must
   let state_color pick the hue. (The text label keeps white + a text-shadow.) */
const iconStyleBlock = elDash.split('- type: state-icon')[1]
  ? elDash.split('- type: state-icon')[1].split('- type: ')[0] : '';
say(!/color: 'white'/.test(iconStyleBlock),
  'the icon never forces white over state_color');
/* card-mod colours an icon through --card-mod-icon-color. --state-icon-color is
   useless here: state_color: true makes state-badge write an inline color that
   beats it, so the accent colour would never show. */
say(/--card-mod-icon-color: var\(--/.test(elDash),
  "the accent colour uses card-mod's --card-mod-icon-color");
say(!/--state-icon-color/.test(elDash),
  'it does not use --state-icon-color, which state_color: true overrides inline');
say(/--card-mod-icon-dim: none/.test(elDash),
  'card-mod is told not to dim the icon a second time');

console.log('\n== the views use a layout Home Assistant will render ==');
/* Floor views are panel views so the single picture-elements card fills the
   screen; the All Lights overview stays a sections view. A `type: sections`
   view only renders cards under a `sections:` grid - a top-level `cards:` key
   there is ignored at runtime (editor-only "imported cards" list). */
const layoutDash = dash(gen(State.defaultState()));
say(/^ {4}panel: true$/m.test(layoutDash), 'the floor views are panel views');
say(/^ {6}- type: picture-elements$/m.test(layoutDash),
  'the floor plan card is a direct child of the panel view, so it fills it');
say(/^ {4}type: sections$/m.test(layoutDash), 'the All Lights overview is a sections view');
say(/^ {6}- type: grid$/m.test(layoutDash), 'with its cards in a grid section');
say(/^ {10}- type: horizontal-stack$/m.test(layoutDash),
  'the All On / All Off stack is inside that grid');
say(!/^ {4}background:$/m.test(layoutDash),
  'no view-level background block (the floor plan is the card image)');
say(/--ha-view-sections-column-max-width: "1600px"/.test(gen(State.defaultState())['lighting_theme.yaml']),
  'the theme stretches a sections column past the 500px default');
say(!/#root \{/.test(layoutDash),
  'a floor plan with no measured ratio emits no fit block (nothing to size it by)');

/* A panel view hands the single card the whole screen, so a wide floor plan
   grows past the bottom of the viewport. Once the image ratio is known, #root
   is letterboxed to the ratio and its width capped by the height under the
   header, so the plan always fits the screen. */
const fitState = State.defaultState();
fitState.locations[0].imageRatio = 1.7778;
const fitDash = dash(gen(fitState));
say(/\n {8}card_mod:\n {10}style: \|-\n {12}#root \{/.test(fitDash),
  'a floor plan with a measured ratio letterboxes #root');
say(/aspect-ratio: 1\.7778/.test(fitDash), 'using the image aspect ratio');
say(/max-width: calc\(\(100dvh - var\(--header-height, 56px\)/.test(fitDash),
  'and caps its width by the height left under the Home Assistant header');

console.log('\n== the install notes cover card-mod ==');
const install = gen(State.defaultState())['INSTALL.txt'];
say(/card_mod:/.test(install) && /card-mod/.test(install),
  'the notes explain the card_mod blocks');
say(/HACS/.test(install) && /card-mod/.test(install),
  'and how to install card-mod through HACS');
say(/extra_module_url/.test(install),
  'and the optional frontend module route');

console.log('\n== the tuya data never reaches the dashboard ==');
const bare = gen(State.defaultState());
const filled = (() => {
  const st = State.defaultState();
  st.tuya.mode = 'local';
  st.locations.forEach(l => l.icons.forEach(i => {
    i.tuya.deviceId = 'bf' + i.id;
    i.tuya.localKey = 'k' + i.id;
    i.tuya.model = '3xzqdsy';
  }));
  return gen(st);
})();
say(dash(bare) === dash(filled), 'dashboard.yaml is identical with and without tuya device data');
say(bare['lighting_theme.yaml'] === filled['lighting_theme.yaml'], 'the theme is identical too');
say(bare['lighting_package.yaml'] !== filled['lighting_package.yaml'], 'only the package differs');

console.log('\n== opting in to tuya_local ==');
const opt = gen(cases.find(c => c.name === 'tuya-local-opt-in').state);
say(/tuya_local:/.test(opt['lighting_package.yaml']), 'a tuya_local block is written');
say(opt['lighting_package.yaml'].includes('device_id: \'bfabc\''), 'with the device id given');
const keyName = (opt['lighting_package.yaml'].match(/local_key: !secret (\S+)/) || [])[1];
say(!!keyName && opt['lighting_secrets.yaml'].includes(keyName + ": 'k1'"),
  'and the local key secret, referenced as ' + keyName);

console.log('\n== the default needs none of it ==');
const none = (() => { const st = State.defaultState(); st.tuya.mode = 'none'; return gen(st); })();
say(!/tuya_local:|device_id:/.test(none['lighting_package.yaml']), 'no tuya_local block');
say(!/tuya_local_key_/.test(none['lighting_secrets.yaml']), 'no local key secrets demanded');
say(none['INSTALL.txt'].includes('Nothing to add'), 'the install notes say there is nothing to add');
say(dash(none) === dash(bare), 'and the dashboard is the same either way');

console.log('\n== an entity id decides how the fixture is controlled ==');
function quiet(st) {
  st.tuya.autos.sunsetScene = false;
  st.tuya.autos.sunriseOff = false;
  st.tuya.autos.personArrival = false;
  st.tuya.autos.motion = false;
  return st;
}
/* Everything typed as a lamp: Matter, Thread, a Smart Life plug, a dimmer and
   a blind. The ids, not the dropdown, say what each one really is. */
const mixed = quiet(State.defaultState());
mixed.locations = [mixed.locations[0]];
mixed.locations[0].icons.forEach(function (icon, i) {
  icon.domain = 'light';
  icon.entity = ['light.matter_kitchen_pendant', 'light.thread_led_strip_4',
    'switch.tuya_plug_1', 'number.hallway_dimmer', 'cover.lounge_blind'][i];
});
const mixedOut = gen(mixed);
const mixedText = issues(mixed).map(function (i) { return i.level + ': ' + i.text; }).join('\n');
say(/the entity is switch\.\*, so it is controlled as a switch/.test(mixedText),
  'a Smart Life plug bound to a lamp fixture is controlled as a switch');
say(/cover\.\* is not a fixture domain/.test(mixedText),
  'a blind is called out as outside the domains this dashboard drives');
say(/the entity is number\.\*, so it is controlled as a number/.test(mixedText),
  'a number dimmer is reported too');
say(/action: homeassistant\.turn_on/.test(mixedOut['lighting_package.yaml']),
  'a mixed view switches through homeassistant.turn_on, which every domain obeys');
say(!/action: light\.turn_on/.test(mixedOut['lighting_package.yaml']),
  'and never a light only service');
say((dash(mixedOut).match(/- type: state-icon/g) || []).length === 5,
  'every fixture, whatever its domain, is still on the plan');

const matterOnly = quiet(State.defaultState());
matterOnly.locations = [matterOnly.locations[0]];
matterOnly.locations[0].icons.forEach(function (icon, i) {
  icon.domain = 'switch';                          /* the dropdown is wrong on purpose */
  icon.entity = ['light.matter_kitchen_pendant', 'light.thread_led_strip_4',
    'light.matter_hall_light', 'light.thread_bed_light', 'light.matter_kitchen_light'][i];
});
const matterOut = gen(matterOnly);
say(/action: light\.turn_on/.test(matterOut['lighting_package.yaml']),
  'views of nothing but Matter / Thread lights keep light.turn_on, so they still dim');
say(!/not a fixture domain/.test(issues(matterOnly).map(i => i.text).join('\n')),
  'and no fixture in it is questioned');
say(/the entity is light\.\*, so it is controlled as a light/.test(
  issues(matterOnly).map(i => i.text).join('\n')),
  'the mismatch with the domain dropdown is reported, then ignored in favour of the id');

console.log('\n== no errors ==');
say(errors.length === 0, 'no errors' + (errors.length ? ': ' + errors[0] : ''));

win.close();
process.exit(done('yaml') ? 1 : 0);
