/* End to end: boots the whole app and drives it the way a person would.
   Covers icons, names, the label switch, 1-15 placement and the generated yaml. */
const { boot, checker, BOX, APP } = require('./_harness.js');

(async () => {
  const { win, $, $$, tick, errors } = boot();
  const { say, done } = checker();
  const State = win.LightingState;

  const spots = () => $$('#canvas .hotspot').map(n => ({
    id: n.dataset.iconId,
    name: (n.getAttribute('aria-label') || '').split('\n')[0],
    x: parseFloat(n.style.left), y: parseFloat(n.style.top),
    size: parseFloat(n.style.width) || 48,
    art: n.querySelector('.hs-art'),
    label: n.querySelector('.hs-label')
  }));
  const key = l => l.map(s => s.id + ':' + s.x + ',' + s.y).join('|');
  const posKey = l => l.map(s => s.x + ',' + s.y).join('|');
  const yamlText = () => $('#yamlOutput').textContent;
  const stateIcons = () => (yamlText().match(/- type: state-icon/g) || []).length;
  const entities = () => Array.from(yamlText().matchAll(/- entity: '([^']+)'/g)).map(m => m[1]);
  const px = (s, ax) => (s[ax] - 50) / 100 * (ax === 'x' ? BOX.width : BOX.height);
  const overlapsAmong = list => {
    const bad = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const d = Math.hypot(px(a, 'x') - px(b, 'x'), px(a, 'y') - px(b, 'y'));
        if (d < (a.size + b.size) / 2 + 12) bad.push(i + '/' + j);
      }
    }
    return bad;
  };

  await tick(600);

  console.log('\n== the app boots ==');
  say($('#canvas') !== null, 'the canvas is there');
  say(!!State, 'the state layer is available');

  console.log('\n== every light on the plan has an icon and a name ==');
  const start = spots();
  say(start.length === 5, 'the default view has five lights, got ' + start.length);
  say(start.every(s => s.art && s.art.tagName.toLowerCase() === 'svg'), 'every light has an inline svg');
  say(start.every(s => s.art.querySelector('path').getAttribute('d').length > 8), 'every svg has real path data');
  say(start.every(s => s.label && s.label.textContent.trim()), 'every light is labelled');
  say(start.every(s => s.name && s.name.length), 'every light has an accessible name');

  console.log('\n== every fixture type has artwork ==');
  say(State.ICON_TYPES.every(t => win.LightingIcons.has(t.icon.replace('mdi:', ''))),
    'all ' + State.ICON_TYPES.length + ' catalogue icons are vendored');
  say(State.ICON_TYPES.every(t => {
    const svg = win.LightingIcons.svg(t.icon.replace('mdi:', ''));
    return svg && svg.querySelector('path').getAttribute('d').length > 8;
  }), 'all of them have real path data');
  say(State.ICON_TYPES.every(t => win.LightingIcons.glyph(t.icon.replace('mdi:', '')).length > 0),
    'and each has a readable abbreviation for the fallback');

  console.log('\n== a hand typed icon name still renders something ==');
  const odd = win.LightingIcons.node('mdi:definitely-not-a-real-icon', 'hs-art');
  say(odd.textContent.trim().length > 0,
    'an unknown name falls back to an abbreviation: ' + JSON.stringify(odd.textContent));

  console.log('\n== the location list shows artwork as well ==');
  const items = $$('#locationList .location-item');
  say(items.length === 2, 'two locations listed, got ' + items.length);
  const liIcons = items.map(n => n.querySelector('.li-icon'));
  say(liIcons.every(Boolean), 'each location has an icon element');
  say(liIcons.every(n => n.tagName.toLowerCase() === 'svg' || n.textContent.trim()),
    'each renders artwork or a fallback');

  console.log('\n== the floor lamp icon name is a real MDI one ==');
  say(State.ICON_TYPES.some(t => t.icon === 'mdi:floor-lamp'), 'the catalogue uses mdi:floor-lamp');
  say(win.LightingIcons.has('floor-lamp'), 'and it is vendored');
  say(yamlText().includes('mdi:floor-lamp'), 'the generated yaml uses it');
  say(!/lamp-floor/.test(yamlText()), 'the old invalid name is gone from the yaml');

  console.log('\n== labels follow the "show labels" switch ==');
  $('#optShowNames').click(); await tick(120);
  say($$('#canvas .hs-label').length === 0, 'labels hidden');
  say($$('#canvas svg.hs-art').length === 5, 'the icons stay when the labels are off');
  $('#optShowNames').click(); await tick(120);
  say($$('#canvas .hs-label').length === 5, 'labels back on');

  console.log('\n== changing a fixture type swaps the artwork ==');
  const beforeType = spots()[0].art.getAttribute('class');
  const sel = $$('#inspectorBody select').find(s => Array.from(s.options).some(o => o.value === 'pendant'));
  say(!!sel, 'found the fixture type select');
  if (sel) {
    sel.value = 'pendant';
    sel.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(150);
    const afterType = spots()[0].art.getAttribute('class');
    say(afterType !== beforeType, 'the icon changed with the type: ' + afterType);
  }

  console.log('\n== 1-15 all render, and nothing else moves ==');
  const anchor = spots();
  for (let n = 6; n <= 15; n++) { $('#btnIconPlus').click(); await tick(70); }
  const full = spots();
  say(full.length === 15, 'fifteen lights, got ' + full.length);
  say(key(full.slice(0, anchor.length)) === key(anchor), 'the lights already there kept their positions');
  say(full.every(s => s.art && s.art.tagName.toLowerCase() === 'svg'), 'all fifteen have artwork');
  say(full.every(s => s.label && s.label.textContent.trim()), 'all fifteen are labelled');
  say(overlapsAmong(full).length === 0, 'no overlap: ' + (overlapsAmong(full).join(', ') || 'clean'));
  const kinds = new Set($$('#canvas .hotspot svg.mdi').map(n => n.getAttribute('class')));
  say(kinds.size >= 4, kinds.size + ' different fixture icons on the plan');
  const cards = $$('#locationList .location-item').length;
  say(cards === 2 && stateIcons() === 19,
    'yaml carries one state-icon per light across both views (' + stateIcons() + ' over ' + cards + ' views)');

  console.log('\n== the inspector count select also produces real lights ==');
  /* The select calls the state layer directly, so it has to invent the entity
     ids the yaml generator filters on: without them new lights vanish. */
  const countSelect = () => $$('#inspectorBody select').find(s =>
    Array.from(s.options).some(o => o.value === '15'));
  const setViaSelect = async v => {
    const s = countSelect();
    s.value = String(v);
    s.dispatchEvent(new win.Event('change', { bubbles: true }));
    await tick(200);
  };
  say(!!countSelect(), 'found the 1-15 select in the inspector');
  say(stateIcons() === 19, '19 lights in the yaml at fifteen on Floor 1, got ' + stateIcons());
  say(new Set(entities()).size === entities().length, 'no duplicate entity ids');
  await setViaSelect(9);
  say(spots().length === 9, 'the select set the view to 9, got ' + spots().length);
  say(stateIcons() === 13, 'the yaml followed it down to 13, got ' + stateIcons());
  await setViaSelect(15);
  say(spots().length === 15, 'the select set the view to 15, got ' + spots().length);
  say(stateIcons() === 19, 'the six new lights reached the yaml, got ' + stateIcons());
  say(new Set(entities()).size === 19, 'all 19 entity ids are present and unique');
  say(!$('#issueBox').textContent.includes('no entity'), 'the validator reports no missing entity ids');
  const dupes = entities().filter((e, i) => entities().indexOf(e) !== i);
  say(dupes.length === 0, 'the select invents no duplicate ids' + (dupes.length ? ': ' + dupes[0] : ''));

  console.log('\n== removing and adding back ==');
  $('#btnIconMinus').click(); await tick(150);
  const cut = spots();
  say(cut.length === 14, 'one removed, got ' + cut.length);
  say(cut.every(s => s.art && s.art.tagName.toLowerCase() === 'svg'), 'the survivors keep their artwork');
  say(posKey(cut) === posKey(full.slice(0, 14)), 'and their positions');
  $('#btnIconPlus').click(); await tick(150);
  say(posKey(spots().slice(0, 14)) === posKey(cut), 'the light that came back did not disturb them');
  say(spots().every(s => s.art && s.art.tagName.toLowerCase() === 'svg'), 'and it has artwork too');

  console.log('\n== a brand new view ==');
  $('#btnAddLocation').click(); await tick(300);
  const fresh = spots();
  say(fresh.length === 5, 'a new view starts with five lights, got ' + fresh.length);
  say(fresh.every(s => s.art && s.art.querySelector('path').getAttribute('d').length > 8), 'all with artwork');
  say(fresh.every(s => s.label && s.label.textContent.trim()), 'all with text');
  say(new Set(fresh.map(s => s.x + ',' + s.y)).size === 5, 'spread on a grid, not stacked');

  console.log('\n== a fresh draft needs nothing from Tuya ==');
  say(State.defaultState().tuya.mode === 'none', 'the default mode is "no Tuya config"');
  say(!$('#issueBox').textContent.includes('Tuya device id'), 'nothing nags about a device id');

  console.log('\n== nothing is fetched from the network ==');
  const fs = require('fs'), path = require('path');
  say(!/\bfetch\(|XMLHttpRequest/.test(fs.readFileSync(path.join(APP, 'js/icons.js'), 'utf8')),
    'js/icons.js holds no network calls');
  const ext = $$('#canvas *').concat($$('#locationList *')).filter(n =>
    /^(img|iframe|object|embed|video|audio|source)$/i.test(n.tagName) &&
    /^(https?:)?\/\//i.test(n.getAttribute('src') || n.getAttribute('data') || ''));
  say(ext.length === 0, 'no element points at an external image');

  console.log('\n== no errors ==');
  say(errors.length === 0, 'no errors' + (errors.length ? ': ' + errors[0] : ''));

  const bad = done('app');
  win.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('harness error:', e); process.exit(2); });
