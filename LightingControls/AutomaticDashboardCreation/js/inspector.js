/* Right-hand inspector: selected icon, its Tuya Smart Plus details, the
   selected location, and the global Tuya / automation settings. */
(function (global) {
  'use strict';

  var body = null;
  var titleEl = null;
  var ctx = null;
  var currentMode = 'location';

  /* --------------------------------------------------------------- helpers */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function section(name) {
    var wrap = el('div', 'insp-section');
    if (name) wrap.appendChild(el('h3', null, name));
    return wrap;
  }

  function field(label, control) {
    var wrap = el('label', 'field');
    wrap.appendChild(el('span', null, label));
    wrap.appendChild(control);
    return wrap;
  }

  function row(children, extraClass) {
    var grid = el('div', extraClass || 'insp-row');
    children.forEach(function (child) { grid.appendChild(child); });
    return grid;
  }

  function textInput(value, onInput, placeholder) {
    var input = el('input');
    input.type = 'text';
    input.value = value == null ? '' : value;
    if (placeholder) input.placeholder = placeholder;
    input.addEventListener('input', function () { onInput(input.value); });
    return input;
  }

  /* Same label/control layout as field(), but a div: pickers hold buttons of
     their own and a <label> wrapper would swallow those clicks. */
  function fieldDiv(label, control) {
    var wrap = el('div', 'field');
    wrap.appendChild(el('span', null, label));
    wrap.appendChild(control);
    return wrap;
  }

  /* Entity field wired to what is really in Home Assistant. Connected, it
     offers a searchable list and says whether the id is a real entity;
     otherwise it stays a plain text box with a hint. */
  function entityPicker(opts) {
    opts = opts || {};
    var wrap = el('div', 'entity-picker');
    var input = el('input', 'entity-input');
    input.type = 'text';
    input.value = opts.value == null ? '' : opts.value;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    if (opts.placeholder) input.placeholder = opts.placeholder;

    var list = el('div', 'entity-suggest');
    list.hidden = true;
    var note = el('div', 'entity-note');
    wrap.appendChild(input);
    wrap.appendChild(list);
    wrap.appendChild(note);

    var connected = LightingHA.connected();
    var token = 0;

    function hide() {
      list.hidden = true;
      list.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
    }

    function row(entity) {
      var item = el('button', 'entity-row');
      item.type = 'button';
      item.appendChild(el('code', null, entity.id));
      item.appendChild(el('span', 'entity-name', entity.name || ''));
      var state = el('span', 'entity-state', LightingHA.stateWord(entity));
      if (entity.state === 'on') state.classList.add('is-on');
      if (entity.state === 'unavailable') state.classList.add('is-bad');
      item.appendChild(state);
      item.addEventListener('mousedown', function (event) { event.preventDefault(); });
      item.addEventListener('click', function (event) {
        event.preventDefault();
        input.value = entity.id;
        hide();
        updateNote();
        if (opts.onPick) opts.onPick(entity);
      });
      item.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' && item.nextElementSibling) {
          event.preventDefault();
          item.nextElementSibling.focus();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          if (item.previousElementSibling) item.previousElementSibling.focus();
          else input.focus();
        } else if (event.key === 'Escape') {
          hide();
          input.focus();
        }
      });
      return item;
    }

    function show(text) {
      if (!connected) { hide(); return; }
      var mine = ++token;
      LightingHA.entities(opts.domains).then(function () {
        if (mine !== token) return;
        var found = LightingHA.query(text, opts.domains);
        list.innerHTML = '';
        if (!found.length) {
          list.appendChild(el('div', 'entity-empty muted small',
            text ? 'no entity matches "' + text + '"' : 'nothing in that domain yet'));
        } else {
          found.forEach(function (entity) { list.appendChild(row(entity)); });
        }
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
      }).catch(function (err) {
        if (mine !== token) return;
        note.className = 'entity-note warn';
        note.textContent = err.message;
      });
    }

    function updateNote() {
      if (!connected) {
        note.className = 'entity-note';
        note.textContent = 'Type an entity id, or connect Home Assistant in the top bar to pick from your devices.';
        return;
      }
      var value = input.value.trim();
      if (!LightingHA.loaded(opts.domains)) {
        note.className = 'entity-note';
        note.textContent = 'checking against Home Assistant…';
        LightingHA.entities(opts.domains).then(function () {
          if (document.body.contains(note)) updateNote();
        }).catch(function (err) {
          note.className = 'entity-note warn';
          note.textContent = err.message;
        });
        return;
      }
      note.className = 'entity-note';
      if (!value) {
        note.textContent = 'Pick from the entities already in Home Assistant.';
      } else {
        var hit = LightingHA.find(value, opts.domains);
        if (hit) {
          note.classList.add('ok');
          note.textContent = '✓ ' + hit.name + ' · ' + (hit.state == null ? 'unknown' : hit.state);
        } else if (value.indexOf('.') === -1) {
          note.textContent = 'needs a domain, e.g. ' + (opts.domains[0] || 'light') + '.' + value;
        } else {
          note.classList.add('warn');
          note.textContent = '✕ not found in Home Assistant - check the id';
        }
      }
      var refresh = el('button', 'entity-refresh');
      refresh.type = 'button';
      refresh.textContent = 'refresh';
      refresh.title = 'Read the entity list from Home Assistant again';
      refresh.addEventListener('click', function (event) {
        event.preventDefault();
        note.className = 'entity-note';
        note.textContent = 'refreshing…';
        LightingHA.entities(opts.domains, true).then(function () {
          if (!document.body.contains(note)) return;
          updateNote();
          show(input.value);
        }).catch(function (err) {
          note.className = 'entity-note warn';
          note.textContent = err.message;
        });
      });
      note.appendChild(refresh);
    }

    input.addEventListener('focus', function () {
      /* Show what is available rather than filtering on the id already in
         the box: picking usually starts from "what have I got?". */
      show('');
    });
    input.addEventListener('input', function () {
      if (opts.onType) opts.onType(input.value);
      updateNote();
      show(input.value);
    });
    input.addEventListener('blur', function () {
      setTimeout(function () { if (!wrap.contains(document.activeElement)) hide(); }, 150);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { hide(); return; }
      if (event.key === 'ArrowDown') {
        var first = list.querySelector('.entity-row');
        if (first) { event.preventDefault(); first.focus(); }
      }
    });
    updateNote();
    return wrap;
  }

  function numberInput(value, onChange, opts) {
    opts = opts || {};
    var input = el('input');
    input.type = 'number';
    input.value = value;
    if (opts.min != null) input.min = opts.min;
    if (opts.max != null) input.max = opts.max;
    input.step = opts.step || 1;
    input.addEventListener('input', function () {
      var n = Number(input.value);
      if (!isFinite(n)) return;
      onChange(n);
    });
    return input;
  }

  function selectInput(value, options, onChange) {
    var select = el('select');
    options.forEach(function (opt) {
      var option = el('option', null, opt.label);
      option.value = opt.value;
      if (opt.value === value) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', function () { onChange(select.value); });
    return select;
  }

  function checkbox(label, checked, onChange) {
    var wrap = el('label', 'check');
    var input = el('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.addEventListener('change', function () { onChange(input.checked); });
    wrap.appendChild(input);
    wrap.appendChild(el('span', null, label));
    return wrap;
  }

  function colourInput(value, onChange) {
    var input = el('input');
    input.type = 'color';
    input.value = normaliseHex(value);
    input.addEventListener('input', function () { onChange(input.value); });
    return input;
  }

  function normaliseHex(value) {
    var v = String(value || '#ffd479').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (/^#[0-9a-f]{3}$/i.test(v)) {
      return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
    }
    return '#ffd479';
  }

  /* Value that is edited without rebuilding the panel (keeps focus/caret). */
  function soft(fn) { fn(false); }
  /* Value whose change may alter the panel structure. */
  function hard(fn) { fn(true); }

  /* ------------------------------------------------------------ icon panel */

  function iconSection(state, icon, loc) {
    var sec = section('Selected icon');
    var head = el('div', 'icon-title');
    var swatch = el('span', 'swatch');
    swatch.style.background = normaliseHex(icon.colour);
    head.appendChild(swatch);
    head.appendChild(el('strong', null, icon.name || 'Icon'));
    head.appendChild(el('span', 'muted small', '@ ' + U.round(icon.x, 2) + '%, ' + U.round(icon.y, 2) + '%'));
    sec.appendChild(head);

    var typeOptions = LightingState.ICON_TYPES.map(function (t) {
      return { value: t.value, label: t.label };
    });

    sec.appendChild(row([
      field('Name', textInput(icon.name, function (v) { icon.name = v; soft(function () { ctx.onEdit('name'); }); })),
      field('Type', selectInput(icon.type, typeOptions, function (v) {
        var info = LightingState.typeInfo(v);
        var oldDomain = icon.domain;
        icon.type = v;
        icon.domain = info.domain;
        if (icon.colour === LightingState.typeInfo(icon.domain).hue) icon.colour = info.hue;
        if (icon.entity && oldDomain && icon.entity.indexOf(oldDomain + '.') === 0) {
          icon.entity = info.domain + icon.entity.slice(oldDomain.length);
        }
        if (!icon.colour) icon.colour = info.hue;
        ctx.onEdit('type', true);
      }))
    ]));

    sec.appendChild(row([
      field('Domain', selectInput(icon.domain, LightingState.SUPPORTED_DOMAINS, function (v) {
        icon.domain = v;
        ctx.onEdit('domain', true);
      })),
      fieldDiv('Entity ID', entityPicker({
        value: icon.entity,
        domains: LightingState.SUPPORTED_DOMAINS.map(function (item) { return item.value; }),
        placeholder: icon.domain + '.floor1_uplighter',
        onType: function (v) {
          icon.entity = v.trim();
          soft(function () { ctx.onEdit('entity'); });
        },
        onPick: function (entity) {
          /* The entity id knows its own domain: light.matter_x stays a light
             whatever the fixture type said before. */
          icon.entity = entity.id;
          var domain = LightingState.domainOf(entity.id);
          var changed = !!domain && domain !== icon.domain && LightingState.isSupportedDomain(domain);
          if (changed) icon.domain = domain;
          ctx.onEdit('entity', changed);
        }
      }))
    ]));

    sec.appendChild(row([
      field('X position %', numberInput(U.round(icon.x, 2), function (v) { icon.x = U.clamp(v, 0, 100); ctx.onEdit('pos', true); }, { min: 0, max: 100, step: 0.5 })),
      field('Y position %', numberInput(U.round(icon.y, 2), function (v) { icon.y = U.clamp(v, 0, 100); ctx.onEdit('pos', true); }, { min: 0, max: 100, step: 0.5 }))
    ]));

    sec.appendChild(row([
      field('Icon size (px)', numberInput(icon.size, function (v) { icon.size = U.clamp(v, 16, 200); ctx.onEdit('size', true); }, { min: 16, max: 200 })),
      field('On colour', colourInput(icon.colour, function (v) { icon.colour = v; soft(function () { ctx.onEdit('colour'); }); }))
    ]));

    sec.appendChild(row([
      field('Brightness entity', textInput(icon.brightnessEntity, function (v) { icon.brightnessEntity = v.trim(); soft(function () { ctx.onEdit('be'); }); }, 'light.x_brightness')),
      field('Colour temp entity', textInput(icon.colourTempEntity, function (v) { icon.colourTempEntity = v.trim(); soft(function () { ctx.onEdit('ce'); }); }, 'light.x_color_temp'))
    ], 'insp-row'));

    sec.appendChild(checkbox('Include in generated YAML (exclude to disable the fixture)', icon.tracked, function (v) { icon.tracked = v; ctx.onEdit('tracked', true); }));
    sec.appendChild(checkbox('Add an on/off enable helper', icon.helper, function (v) { icon.helper = v; ctx.onEdit('helper', true); }));
    sec.appendChild(checkbox('Show on the floor plan', !icon.hidden, function (v) { icon.hidden = !v; ctx.onEdit('hidden', true); }));
    return sec;
  }

  /* --------------------------------------------------------- tuya icon tab */

  function tuyaIconSection(state, icon) {
    var sec = section('Tuya Smart Plus - ' + (icon.name || 'this device'));
    var t = icon.tuya;
    var local = state.tuya.mode === 'local' || state.tuya.mode === 'both';
    var cloud = state.tuya.mode === 'cloud' || state.tuya.mode === 'both';

    var callout = el('div', 'callout');
    callout.innerHTML = state.tuya.mode === 'none'
      ? 'This light is used through its Home Assistant entity id, which is all the'
        + ' dashboard needs. Fill these fields in only if you want Home Assistant to'
        + ' reach a device directly over LAN.'
      : (local && cloud
        ? 'Both <code>tuya</code> (cloud) and <code>tuya_local</code> blocks will be written. Local wins where a device id matches.'
        : (local
          ? 'A <code>tuya_local</code> block will be written for this device (LAN only, no cloud account needed).'
          : 'This device is discovered through the <code>tuya</code> cloud integration; no per-device block is needed.'));
    sec.appendChild(callout);

    sec.appendChild(row([
      field('Device ID', textInput(t.deviceId, function (v) { t.deviceId = v.trim(); soft(function () { ctx.onEdit('tid'); }); }, 'bfe0400lxxxxxx')),
      field('Local key', textInput(t.localKey, function (v) { t.localKey = v.trim(); soft(function () { ctx.onEdit('tlk'); }); }, 'from the Tuya app or tuya.local'))
    ]));

    sec.appendChild(row([
      field('Host (LAN IP)', textInput(t.host, function (v) { t.host = v.trim(); soft(function () { ctx.onEdit('th'); }); }, state.tuya.localHost || '192.168.1.')),
      field('Protocol', selectInput(t.protocol, [
        { value: '3.1', label: '3.1' },
        { value: '3.2', label: '3.2' },
        { value: '3.3', label: '3.3' },
        { value: '3.4', label: '3.4' },
        { value: '3.5', label: '3.5' }
      ], function (v) { t.protocol = v; ctx.onEdit('tproto', true); }))
    ]));

    sec.appendChild(row([
      field('Model / code', textInput(t.model, function (v) { t.model = v.trim(); soft(function () { ctx.onEdit('tmodel'); }); }, 'e.g. 3xzqdsy')),
      field('Category', selectInput(t.category, [
        { value: 'dj', label: 'dj = light' },
        { value: 'kg', label: 'kg = switch/plug' },
        { value: 'qt', label: 'qt = robot vacuum' },
        { value: 'cl', label: 'cl = curtain' },
        { value: 'pc', label: 'pc = power strip' }
      ], function (v) { t.category = v; ctx.onEdit('tcat', true); }))
    ]));

    sec.appendChild(el('h3', null, 'Datapoint (DP) mapping'));
    sec.appendChild(row([
      field('Switch DP', numberInput(t.dpSwitch, function (v) { t.dpSwitch = v; ctx.onEdit('dp', true); }, { min: 0, max: 255 })),
      field('Brightness DP', numberInput(t.dpBrightness, function (v) { t.dpBrightness = v; ctx.onEdit('dp', true); }, { min: 0, max: 255 }))
    ]));
    sec.appendChild(row([
      field('Colour temp DP', numberInput(t.dpColourTemp, function (v) { t.dpColourTemp = v; ctx.onEdit('dp', true); }, { min: 0, max: 255 })),
      field('Work mode DP', numberInput(t.dpMode, function (v) { t.dpMode = v; ctx.onEdit('dp', true); }, { min: 0, max: 255 }))
    ]));

    var dpTable = el('div', 'callout');
    dpTable.innerHTML = '<strong>Common Tuya light DPs:</strong> 1 = switch, 2 = mode, ' +
      '3 = brightness (for dimmable strips/plugs using the basic schema) or 4 = mode for ' +
      'screws-schema bulbs, 101 = mode, 102 = brightness, 103 = colour temp, 104 = colour. ' +
      'Check your device with <code>python -m tuya_local</code> / the Tuya developer console.';
    sec.appendChild(dpTable);
    return sec;
  }

  /* -------------------------------------------------------- location panel */

  function locationSection(state, loc) {
    var sec = section('Location - ' + loc.name);
    sec.appendChild(row([
      field('Name', textInput(loc.name, function (v) { loc.name = v; soft(function () { ctx.onEdit('lname'); }); })),
      field('URL path', textInput(loc.path, function (v) { loc.path = U.slugify(v); ctx.onEdit('lpath', true); }))
    ]));
    sec.appendChild(row([
      field('View icon', textInput(loc.viewIcon, function (v) { loc.viewIcon = v; soft(function () { ctx.onEdit('lvi'); }); }, 'mdi:floor-plan')),
      field('View title', textInput(loc.title, function (v) { loc.title = v; soft(function () { ctx.onEdit('ltitle'); }); }, '(blank = name)'))
    ]));
    sec.appendChild(field('Base image /local path',
      textInput(loc.imagePath, function (v) { loc.imagePath = v.trim(); soft(function () { ctx.onEdit('imgpath'); }); },
        '/local/lighting/' + U.slugify(loc.name) + '.png')));
    var note = el('p', 'hint');
    note.innerHTML = 'Base images live in Home Assistant at <code>/config/www/lighting/</code>. ' +
      'Uploaded files from this page are written to <code>temp/images/</code> &mdash; copy them there and restart HA.';
    sec.appendChild(note);
    var countOptions = [];
    for (var n = LightingState.MIN_ICONS; n <= LightingState.MAX_ICONS; n += 1) {
      countOptions.push({ value: String(n), label: n + (n === 1 ? ' icon' : ' icons') });
    }
    sec.appendChild(row([
      field('Icons on this view', selectInput(String(loc.iconCount), countOptions, function (v) {
        LightingState.setIconCount(loc, Number(v), LightingCanvas.box());
        ctx.onEdit('count', true);
      }))
    ]));
    return sec;
  }

  function locationAutoSection(state, loc) {
    var sec = section('Automation - ' + loc.name);
    sec.appendChild(checkbox('Include uplighter/lamp scene at sunset', loc.auto.sunset, function (v) { loc.auto.sunset = v; ctx.onEdit('auto', true); }));
    sec.appendChild(checkbox('Turn everything off after sunrise', loc.auto.sunriseOff, function (v) { loc.auto.sunriseOff = v; ctx.onEdit('auto', true); }));
    sec.appendChild(checkbox('Motion sensor turns this location on', loc.auto.motion, function (v) { loc.auto.motion = v; ctx.onEdit('auto', true); }));
    if (loc.auto.motion) {
      sec.appendChild(row([
        fieldDiv('Motion entity', entityPicker({
          value: loc.auto.motionEntity,
          domains: ['binary_sensor'],
          placeholder: 'binary_sensor.hallway_motion',
          onType: function (v) { loc.auto.motionEntity = v.trim(); soft(function () { ctx.onEdit('motion'); }); },
          onPick: function (entity) { loc.auto.motionEntity = entity.id; ctx.onEdit('motion'); }
        })),
        field('On brightness %', numberInput(loc.auto.autoBrightness, function (v) { loc.auto.autoBrightness = U.clamp(v, 1, 100); ctx.onEdit('motion', true); }, { min: 1, max: 100 }))
      ]));
    }
    return sec;
  }

  /* ---------------------------------------------------------- global tuya  */

  function tuyaGlobalSection(state) {
    var t = state.tuya;
    var sec = section('Tuya Smart Plus - integration');

    sec.appendChild(field('How are the devices joined?', selectInput(t.mode, [
      { value: 'none', label: 'No Tuya config (entities already exist)' },
      { value: 'local', label: 'tuya_local - LAN, no cloud login' },
      { value: 'cloud', label: 'tuya - cloud (Smart Living / Smart Life app)' },
      { value: 'both', label: 'Both' }
    ], function (v) { t.mode = v; ctx.onEdit('mode', true); })));

    if (t.mode === 'cloud' || t.mode === 'both') {
      sec.appendChild(el('h3', null, 'Cloud (tuya)'));
      sec.appendChild(row([
        field('Cloud host', textInput(t.cloudHost, function (v) { t.cloudHost = v.trim(); soft(function () { ctx.onEdit('chost'); }); }, 'a1.tuyacn.com')),
        field('Country code', textInput(t.countryCode, function (v) { t.countryCode = v.trim(); soft(function () { ctx.onEdit('cc'); }); }, '1 = EU'))
      ]));
      sec.appendChild(row([
        field('Client id', textInput(t.clientId, function (v) { t.clientId = v.trim(); soft(function () { ctx.onEdit('cid'); }); }, 'from iot.tuya.com')),
        field('Client secret', textInput(t.clientSecret, function (v) { t.clientSecret = v.trim(); soft(function () { ctx.onEdit('csec'); }); }, 'from iot.tuya.com'))
      ]));
    }

    if (t.mode === 'local' || t.mode === 'both') {
      sec.appendChild(el('h3', null, 'Local (tuya_local)'));
      sec.appendChild(field('Default host for new devices',
        textInput(t.localHost, function (v) { t.localHost = v.trim(); soft(function () { ctx.onEdit('lhost'); }); }, '192.168.1.')));
      sec.appendChild(row([
        field('Default protocol', selectInput(t.protocol, [
          { value: '3.1', label: '3.1' }, { value: '3.2', label: '3.2' },
          { value: '3.3', label: '3.3' }, { value: '3.4', label: '3.4' },
          { value: '3.5', label: '3.5' }
        ], function (v) { t.protocol = v; ctx.onEdit('lproto', true); })),
        field('Local key secret style', el('div', 'muted small', '!secret tuya_local_key_&lt;location&gt;_&lt;fixture&gt;'))
      ]));
      var warn = el('div', 'callout warn');
      warn.innerHTML = 'Local keys and device ids are shown in the generated <code>lighting_secrets.yaml</code> ' +
        'and referenced with <code>!secret</code>. <strong>Never commit that file to git.</strong>';
      sec.appendChild(warn);
    }

    var autos = section('Generated automations');
    autos.appendChild(checkbox('Global "all lights on / off" scripts', t.autos.allScripts, function (v) { t.autos.allScripts = v; ctx.onEdit('autos', true); }));
    autos.appendChild(checkbox('Per-location on/off scripts', t.autos.helperSwitches, function (v) { t.autos.helperSwitches = v; ctx.onEdit('autos', true); }));
    autos.appendChild(checkbox('Evening scene at sunset', t.autos.sunsetScene, function (v) { t.autos.sunsetScene = v; ctx.onEdit('autos', true); }));
    autos.appendChild(checkbox('All off after sunrise', t.autos.sunriseOff, function (v) { t.autos.sunriseOff = v; ctx.onEdit('autos', true); }));
    autos.appendChild(checkbox('Welcome-home automation', t.autos.personArrival, function (v) { t.autos.personArrival = v; ctx.onEdit('autos', true); }));
    if (t.autos.personArrival) {
      autos.appendChild(fieldDiv('Person entity',
        entityPicker({
          value: t.personEntity,
          domains: ['person', 'device_tracker'],
          placeholder: 'person.your_name',
          onType: function (v) { t.personEntity = v.trim(); soft(function () { ctx.onEdit('person'); }); },
          onPick: function (entity) { t.personEntity = entity.id; ctx.onEdit('person'); }
        })));
    }
    autos.appendChild(checkbox('Motion automations per location', t.autos.motion, function (v) { t.autos.motion = v; ctx.onEdit('autos', true); }));

    if (t.autos.sunsetScene || t.autos.sunriseOff) {
      autos.appendChild(el('h3', null, 'Sun offsets'));
      autos.appendChild(row([
        field('Evening offset', textInput(t.eveningOffset, function (v) { t.eveningOffset = v.trim(); soft(function () { ctx.onEdit('ev'); }); }, '+00:30:00')),
        field('Morning offset', textInput(t.morningOffset, function (v) { t.morningOffset = v.trim(); soft(function () { ctx.onEdit('mo'); }); }, '-00:15:00'))
      ]));
    }
    return { integration: sec, automations: autos };
  }

  /* ------------------------------------------------------------- rendering */

  function render(state, mode) {
    if (!body) return;
    currentMode = mode || currentMode;
    body.innerHTML = '';

    var loc = LightingState.activeLocation(state);
    var icon = LightingState.activeIcon(state);

    if (!loc) {
      titleEl.textContent = 'Inspector';
      body.appendChild(el('p', 'insp-empty', 'No locations yet. Use "+ Location" to add one.'));
      return;
    }

    if (currentMode === 'tuya') {
      titleEl.textContent = 'Tuya Smart Plus';
      body.appendChild(el('p', 'insp-empty', 'Configure the ' + (icon ? 'selected icon' : 'integration') + ' below.'));
      if (icon) body.appendChild(tuyaIconSection(state, icon));
      var g = tuyaGlobalSection(state);
      body.appendChild(g.integration);
      body.appendChild(g.automations);
      return;
    }

    titleEl.textContent = 'Inspector';
    if (icon) {
      body.appendChild(iconSection(state, icon, loc));
    } else {
      body.appendChild(el('p', 'insp-empty', 'No icons on this view. Use "+ Icon" to add one.'));
    }
    body.appendChild(locationSection(state, loc));
    body.appendChild(locationAutoSection(state, loc));

    document.querySelectorAll('#inspectorSeg button').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.mode === currentMode);
    });
  }

  function init(options) {
    body = document.getElementById('inspectorBody');
    titleEl = document.getElementById('inspectorTitle');
    ctx = options;
    document.querySelectorAll('#inspectorSeg button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentMode = btn.dataset.mode;
        ctx.onModeChange(currentMode);
      });
    });
  }

  global.LightingInspector = {
    init: init,
    render: render,
    mode: function () { return currentMode; }
  };
})(window);
