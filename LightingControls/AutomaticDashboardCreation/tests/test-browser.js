/* Real Firefox: the icons and text names actually paint, are big enough to read,
   sit on top of the plan, and do not overlap each other.

   Needs the app served (python3 server.py) and Firefox installed. */
const { launch, connect, sleep } = require('./marionette.js');
const { checker } = require('./_harness.js');
const { say, done } = checker();
const URL = process.env.APP_URL || 'http://127.0.0.1:8765/';

(async () => {
  const ff = await launch('about:blank');
  const c = await connect(ff.port);
  try {
    await c.newSession();
    await c.navigate(URL);
    await sleep(3500);
    const read = async src => (await c.script(src, [])).value;

    const g = await read(`
      const hot = Array.from(document.querySelectorAll('#canvas .hotspot'));
      const cv = document.querySelector('#canvas');
      const box = cv.getBoundingClientRect();
      const svg = hot.map(h => h.querySelector('svg.hs-art'));
      const lab = hot.map(h => h.querySelector('.hs-label'));
      const cs = n => n ? getComputedStyle(n) : null;
      return {
        count: hot.length,
        box: Math.round(box.width) + 'x' + Math.round(box.height),
        svg: {
          present: svg.filter(Boolean).length,
          painted: svg.map(s => s && s.querySelector('path').getAttribute('d').length > 8),
          classes: Array.from(new Set(svg.map(s => s && s.getAttribute('class')))),
          px: svg.map(s => s ? Math.round(s.getBoundingClientRect().width) : 0),
          fill: svg.map(s => s ? cs(s).fill : ''),
          rects: svg.map(s => (s ? s.getBoundingClientRect() : null))
        },
        labels: {
          present: lab.filter(Boolean).length,
          text: lab.map(n => (n ? n.textContent.trim() : '')),
          px: lab.map(n => (n ? Math.round(n.getBoundingClientRect().height) : 0)),
          fs: lab.map(n => (n ? parseFloat(cs(n).fontSize) : 0)),
          colour: lab.map(n => (n ? cs(n).color : ''))
        },
        overflow: hot.map(h => {
          const r = h.getBoundingClientRect();
          return r.left < box.left - 1 || r.top < box.top - 1 ||
            r.right > box.right + 1 || r.bottom > box.bottom + 1;
        }).filter(Boolean).length
      };
    `);

    console.log('\ncanvas ' + g.box + ', ' + g.count + ' lights, window 1600x914');
    console.log('\n== artwork ==');
    say(g.count === 5, 'the default view has its five lights');
    say(g.svg.present === g.count, 'every light has an inline svg, got ' + g.svg.present);
    say(g.svg.painted.every(Boolean), 'every svg has real path data');
    say(g.svg.classes.length >= 2, g.svg.classes.length + ' distinct icon classes in use');
    say(g.svg.px.every(w => w >= 12 && w <= 60), 'icon sizes are readable: ' + g.svg.px.join(', ') + 'px');
    say(g.svg.fill.every(f => /rgb/.test(f)), 'icons are painted, not invisible: ' + g.svg.fill[0]);
    say(g.overflow === 0, 'nothing hangs off the plan');

    console.log('\n== every floor plan is measured for the letterbox ==');
    /* The export letterboxes each panel view to its own image, so the builder
       measures every location up front - not only the one on screen. Both
       default floors point at real images on the server. */
    const dash = await read(`
      var sel = document.getElementById('filePicker');
      sel.value = 'dashboard.yaml';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return document.getElementById('yamlOutput').textContent;
    `);
    const ratios = Array.from(dash.matchAll(/aspect-ratio: ([0-9.]+)/g)).map(m => m[1]);
    say(ratios.length === 2, 'both floor plans carry their own aspect ratio, got ' + JSON.stringify(ratios));
    say(ratios.every(r => Number(r) > 0), 'and each is a positive ratio from the image: ' + ratios.join(', '));
    say(new Set(ratios).size === ratios.length,
      'the two floors get different ratios, so it is measured not assumed: ' + ratios.join(', '));

    console.log('\n== the text names ==');
    say(g.labels.present === g.count, 'every light is labelled, got ' + g.labels.present);
    say(g.labels.text.every(t => t.length > 0), 'the labels carry text: ' + g.labels.text.join(' / '));
    const ratio = g.labels.fs.map((f, i) => f / g.svg.px[i]);
    say(ratio.every(r => r > 0.35 && r < 0.6),
      'the name is sized against its icon: ' + ratio.map(r => r.toFixed(2)).join(', '));
    say(g.labels.px.every(h => h > 0), 'the labels have height: ' + g.labels.px.join(', '));
    say(g.labels.colour.every(x => /rgb/.test(x)), 'the label colour resolves: ' + g.labels.colour[0]);

    console.log('\n== labels do not collide ==');
    const rs = g.svg.rects.filter(Boolean);
    let hits = 0;
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i], b = rs[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) hits += 1;
      }
    }
    say(hits === 0, 'no two icons overlap on the plan (' + hits + ' collisions)');

    console.log('\n== the label toggle in a real browser ==');
    const off = (await c.asyncScript(`
      const done = arguments[arguments.length - 1];
      const t = document.querySelector('#optShowNames');
      t.click();
      setTimeout(() => {
        /* Re-query after the toggle: it re-renders the canvas, so a node grabbed
           before the click is detached and measures as zero. */
        const h = document.querySelector('#canvas .hotspot');
        const l = h.querySelector('.hs-label');
        const s = h.querySelector('svg.hs-art');
        done({
          checked: t.checked,
          labelDisplay: l ? getComputedStyle(l).display : 'gone',
          labelCount: document.querySelectorAll('#canvas .hs-label').length,
          svgStill: s ? s.getBoundingClientRect().width > 0 : false
        });
      }, 500);
    `, [])).value;
    say(off.checked === false, 'the switch turned off');
    say(off.labelDisplay === 'none' || off.labelCount === 0,
      'the names are hidden, display ' + off.labelDisplay + ', ' + off.labelCount + ' left in the dom');
    say(off.svgStill, 'the icons stay visible with the names off');
    const backOn = (await c.asyncScript(`
      const done = arguments[arguments.length - 1];
      const t = document.querySelector('#optShowNames');
      t.click();
      setTimeout(() => {
        const l = document.querySelector('#canvas .hotspot .hs-label');
        done({ checked: t.checked, font: l ? parseFloat(getComputedStyle(l).fontSize) : 0 });
      }, 500);
    `, [])).value;
    say(backOn.checked === true && backOn.font > 0,
      'switching back restores them at ' + backOn.font.toFixed(1) + 'px');

    console.log('\n== the name follows the icon size ==');
    const scaled = (await c.asyncScript(`
      const done = arguments[arguments.length - 1];
      const read = h => ({
        icon: h.querySelector('svg.hs-art').getBoundingClientRect().width,
        font: parseFloat(getComputedStyle(h.querySelector('.hs-label')).fontSize)
      });
      const first = read(document.querySelector('#canvas .hotspot'));
      const field = document.querySelector('#optIconSize');
      field.value = '110';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#btnAddIcon').click();
      setTimeout(() => {
        const all = Array.from(document.querySelectorAll('#canvas .hotspot'));
        done({ field: field.value, first, last: read(all[all.length - 1]), count: all.length });
      }, 700);
    `, [])).value;
    say(scaled.count === 6, 'the + Icon button added a light, got ' + scaled.count);
    say(scaled.last.icon > scaled.first.icon,
      'the new icon is bigger: ' + scaled.first.icon.toFixed(0) + ' -> ' + scaled.last.icon.toFixed(0) + 'px');
    say(scaled.last.font > scaled.first.font,
      'and its name grew too: ' + scaled.first.font.toFixed(1) + ' -> ' + scaled.last.font.toFixed(1) + 'px');
    const r1 = scaled.first.font / scaled.first.icon, r2 = scaled.last.font / scaled.last.icon;
    say(Math.abs(r1 - r2) < 0.02,
      'the name keeps its proportion to the icon (' + r1.toFixed(2) + ' vs ' + r2.toFixed(2) + ')');

    console.log('\n== a fresh visit needs nothing from Tuya ==');
    const fresh = (await read(`
      return {
        switchOn: document.querySelector('#optShowNames').checked,
        labels: document.querySelectorAll('#canvas .hs-label').length,
        hotspots: document.querySelectorAll('#canvas .hotspot').length,
        issues: document.querySelector('#issueBox').textContent,
        tuyaTab: Array.from(document.querySelectorAll('#inspectorSeg button')).map(b => b.textContent.trim())
      };
    `));
    say(fresh.switchOn === true, 'labels are on by default');
    say(fresh.labels === fresh.hotspots,
      'every light on the plan is named (' + fresh.labels + ' of ' + fresh.hotspots + ')');
    say(!/Tuya device id/.test(fresh.issues), 'nothing nags about a Tuya device id');
    say(fresh.issues.indexOf('only the dashboard is generated') !== -1,
      'it explains that only the dashboard is generated');

    console.log('\n== the Home Assistant connection dialog ==');
    const spy = (await read(`
      window.__origFetch = window.fetch;
      window.__haCalls = [];
      window.fetch = function () {
        var u = String(arguments[0]);
        if (u.indexOf('api/ha/') !== -1) window.__haCalls.push(u);
        return window.__origFetch.apply(window, arguments);
      };
      const btn = document.querySelector('#btnHA');
      if (!btn) return { present: false };
      btn.click();
      return { present: true };
    `));
    await sleep(500);
    const dlg = (await read(`
      const d = document.querySelector('#haDialog');
      const s = document.querySelector('#haStatus');
      const url = document.querySelector('#haUrl');
      const token = document.querySelector('#haToken');
      const dot = document.querySelector('#haDot');
      const opened = !!(d && d.hasAttribute('open'));
      if (d && d.close) d.close();
      window.fetch = window.__origFetch;
      return {
        opened: opened,
        status: s ? s.textContent.trim() : '',
        hasUrl: !!url, hasToken: !!token,
        tokenType: token ? token.type : '',
        dotClass: dot ? dot.className : '',
        note: ((document.querySelector('#inspectorBody .entity-note') || {}).textContent || '').trim(),
        calls: window.__haCalls.slice()
      };
    `));
    say(spy.present, 'the Home Assistant button is on the toolbar');
    say(dlg.opened, 'and it opens the connection dialog');
    say(dlg.hasUrl && dlg.hasToken && dlg.tokenType === 'password',
      'with a url field and a masked token field');
    say(dlg.status.length > 0, 'it says where it stands: "' + dlg.status.slice(0, 64) + '"');
    say(/Not connected|https?:\/\//.test(dlg.status),
      'and reports either no connection or the url it is using');
    say(dlg.calls.filter(c => c.indexOf('api/ha/config') !== -1).length === 0,
      'looking at the dialog wrote nothing: ' + (dlg.calls.join(', ') || 'no config request'));
    say(dlg.note.length > 0,
      'the fixture entity field explains itself: "' + dlg.note.slice(0, 58) + '"');

    console.log('\n== no page errors ==');
    const errs = (await read('return (window.__errs || []).slice(0, 5);')) || [];
    say(!errs.length, 'no errors' + (errs.length ? ': ' + JSON.stringify(errs) : ''));
  } finally {
    c.close();
    ff.cleanup();
  }
  process.exit(done('browser') ? 1 : 0);
})().catch(e => { console.error('harness error:', e.message); process.exit(2); });
