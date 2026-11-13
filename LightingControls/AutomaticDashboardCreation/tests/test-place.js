/* Adding a light must never move one that is already on the plan. */
const { boot, checker, BOX } = require('./_harness.js');

(async () => {
  const { win, $, $$, tick, errors } = boot();
  const { say, done } = checker();
  const State = win.LightingState;

  const spots = () => $$('#canvas .hotspot').map(n => ({
    id: n.dataset.iconId, x: parseFloat(n.style.left), y: parseFloat(n.style.top),
    size: parseFloat(n.style.width) || 48
  }));
  const key = l => l.map(s => s.id + ':' + s.x + ',' + s.y).join('|');
  const px = (s, ax) => (s[ax] - 50) / 100 * (ax === 'x' ? BOX.width : BOX.height);
  const overlapsAmong = list => {
    const bad = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const d = Math.hypot(px(a, 'x') - px(b, 'x'), px(a, 'y') - px(b, 'y'));
        if (d < (a.size + b.size) / 2 + 12) bad.push(i + '/' + j + ' ' + d.toFixed(0) + 'px');
      }
    }
    return bad;
  };

  await tick(600);

  console.log('\n== the stepper adds without disturbing anything ==');
  const start = spots();
  $('#btnIconPlus').click(); await tick(150);
  const after = spots();
  say(after.length === 6, 'a sixth light appeared, got ' + after.length);
  say(key(after.slice(0, 5)) === key(start), 'the five already there kept their exact positions');
  const fresh = after[5];
  say(Math.hypot(px(fresh, 'x'), px(fresh, 'y')) < 130,
    'the new light landed near the middle (' + fresh.x + '%, ' + fresh.y + '%)');
  say(overlapsAmong(after).length === 0, 'nothing overlaps: ' + (overlapsAmong(after).join(', ') || 'clean'));

  console.log('\n== growing to 15 ==');
  const before = spots();
  for (let n = 7; n <= 15; n++) { $('#btnIconPlus').click(); await tick(70); }
  const full = spots();
  say(full.length === 15, 'fifteen lights, got ' + full.length);
  say(key(full.slice(0, before.length)) === key(before), 'none of the earlier ones moved');
  say(overlapsAmong(full).length === 0, 'no overlap: ' + (overlapsAmong(full).join(', ') || 'clean'));
  const near = full.filter(s => Math.hypot(px(s, 'x'), px(s, 'y')) < 200).length;
  say(near >= 10, 'the plan stays clustered around the middle, ' + near + '/15 within 200px');
  say(full.every(s => s.x > 2 && s.x < 98 && s.y > 2 && s.y < 98), 'nothing pushed off the edge');

  console.log('\n== shrink then grow back ==');
  $('#btnIconMinus').click(); await tick(150);
  const cut = spots();
  say(cut.length === 14 && key(cut) === key(full.slice(0, 14)), 'the survivors kept their spots');
  $('#btnIconPlus').click(); await tick(150);
  say(key(spots().slice(0, 14)) === key(cut), 'the returning light did not disturb them');
  say(overlapsAmong(spots()).length === 0, 'and it cleared the others again');

  console.log('\n== the + Icon button ==');
  $('#btnAddLocation').click(); await tick(250);
  for (let n = 0; n < 4; n++) { $('#btnIconMinus').click(); await tick(80); }
  say(spots().length === 1, 'a fresh view reduced to one light, got ' + spots().length);
  $('#btnAddIcon').click(); await tick(150);
  say(spots().length === 2 && overlapsAmong(spots()).length === 0, 'the button adds without overlapping');
  for (let n = 0; n < 4; n++) { $('#btnAddIcon').click(); await tick(80); }
  say(spots().length === 6, 'six lights via the button, got ' + spots().length);
  say(overlapsAmong(spots()).length === 0, 'still no overlap: ' + (overlapsAmong(spots()).join(', ') || 'clean'));

  console.log('\n== deterministic, aspect aware, non destructive ==');
  const busy = [{ name: 'a', x: 50, y: 50, size: 48 }];
  const one = State.placeIcon(busy, { name: 'Lamp 3', size: 48 }, BOX);
  const two = State.placeIcon(busy, { name: 'Lamp 3', size: 48 }, BOX);
  say(one.x === two.x && one.y === two.y, 'the same inputs always give the same spot');
  for (const box of [{ width: 1600, height: 400 }, { width: 400, height: 1600 }, { width: 900, height: 900 }]) {
    const spot = State.placeIcon(busy, { name: 'Lamp 3', size: 48 }, box);
    const d = Math.hypot((spot.x - 50) / 100 * box.width, (spot.y - 50) / 100 * box.height);
    say(d >= 60, 'clears the middle by ' + d.toFixed(0) + 'px on a ' + box.width + 'x' + box.height + ' plan');
  }
  const given = [{ name: 'a', x: 11, y: 22, size: 48 }, { name: 'b', x: 77, y: 33, size: 48 }];
  const snapshot = JSON.stringify(given);
  State.placeIcon(given, { name: 'new', size: 48 }, BOX);
  say(JSON.stringify(given) === snapshot, 'placeIcon never touches the icons it is given');
  say(new Set(State.starterIcons(5).map(i => i.x + '|' + i.y)).size === 5, 'a new view still starts on a spread grid');

  console.log('\n== every new light gets a unique entity id ==');
  const st = State.defaultState();
  State.setIconCount(State.activeLocation(st), 15, BOX);
  const ids = State.activeLocation(st).icons.map(i => i.entity);
  say(ids.every(Boolean), 'all 15 have an entity id');
  say(new Set(ids).size === 15, 'and no duplicates');

  console.log('\n== no errors ==');
  say(errors.length === 0, 'no errors' + (errors.length ? ': ' + errors[0] : ''));

  const bad = done('placement');
  win.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('harness error:', e); process.exit(2); });
