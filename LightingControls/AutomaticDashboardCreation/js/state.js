/* State model, icon catalogue and draft defaults.
   Everything the user edits lives in one plain JSON object so a draft is just
   a serialisable snapshot of this structure. */
(function (global) {
  'use strict';

  /* Icon catalogue. `domain` is the Home Assistant entity domain normally used
     for the fixture; Tuya Smart Plus uplighters are often plugs (switch). */
  var ICON_TYPES = [
    { value: 'uplighter', label: 'Uplighter', icon: 'mdi:ceiling-light-multiple', domain: 'light', hue: '#ffd479' },
    { value: 'lamp', label: 'Lamp', icon: 'mdi:lamp', domain: 'light', hue: '#f8c471' },
    { value: 'floorlamp', label: 'Floor lamp', icon: 'mdi:floor-lamp', domain: 'light', hue: '#f5b041' },
    { value: 'ceiling', label: 'Ceiling light', icon: 'mdi:ceiling-light', domain: 'light', hue: '#ffe9b0' },
    { value: 'pendant', label: 'Pendant', icon: 'mdi:chandelier', domain: 'light', hue: '#f2d092' },
    { value: 'downlight', label: 'Downlight', icon: 'mdi:spotlight-beam', domain: 'light', hue: '#fff3c4' },
    { value: 'strip', label: 'LED strip', icon: 'mdi:led-strip', domain: 'light', hue: '#a5d8ff' },
    { value: 'outdoor', label: 'Outdoor', icon: 'mdi:outdoor-lamp', domain: 'light', hue: '#c8e6a0' },
    { value: 'switch', label: 'Smart switch / plug', icon: 'mdi:power-plug', domain: 'switch', hue: '#9ad5a0' },
    { value: 'custom', label: 'Other / custom', icon: 'mdi:lightbulb', domain: 'light', hue: '#ffffff' }
  ];

  var TYPE_BY_VALUE = {};
  ICON_TYPES.forEach(function (t) { TYPE_BY_VALUE[t.value] = t; });

  function typeInfo(value) {
    return TYPE_BY_VALUE[value] || TYPE_BY_VALUE.custom;
  }

  /* Entity domains a fixture may be bound to. Devices such as Tuya Smart Life
     plugs and Matter / Thread lights arrive in Home Assistant as ordinary
     entities, so the dashboard only ever needs the id - and these are the
     domains the generated scripts can drive well. */
  var SUPPORTED_DOMAINS = [
    { value: 'light', label: 'light (dimmable)' },
    { value: 'switch', label: 'switch (on/off)' },
    { value: 'number', label: 'number (brightness)' }
  ];

  function isSupportedDomain(domain) {
    return SUPPORTED_DOMAINS.some(function (item) { return item.value === domain; });
  }

  /* The domain an entity id already claims: light.matter_x is a light whatever
     the fixture type dropdown says. */
  function domainOf(entity) {
    var text = String(entity || '');
    var dot = text.indexOf('.');
    return dot > 0 ? text.slice(0, dot) : '';
  }

  /* How many icons one view may carry. 1-15 covers a single lamp through a
     large open plan; the floor plan keeps percentage positions, so a busy
     view still lands on the same spots on a wall panel. */
  var MIN_ICONS = 1;
  var MAX_ICONS = 15;

  function clampIconCount(value) {
    var n = Math.round(Number(value));
    if (!isFinite(n) || isNaN(n)) return 5;
    return U.clamp(n, MIN_ICONS, MAX_ICONS);
  }

  var DEFAULTS = {
    meta: {
      title: 'Lighting',
      slug: 'lighting',
      icon: 'mdi:ceiling-light',
      theme: 'Lighting'
    },
    options: {
      masterView: true,
      wallpanel: false,
      showNames: true,
      perLightColour: true,
      offDim: true,
      snap: 0.5,
      iconSize: 48,
      genPackage: true,
      genTheme: true,
      genSecrets: true,
      genInstall: true
    },
    tuya: {
      /* Fixtures that already exist in Home Assistant need nothing but their
         entity id, so 'none' is the default. Pick 'local' or 'cloud' only to
         have a tuya / tuya_local block written for devices the integration
         cannot reach. */
      mode: 'none',             // 'none' | 'local' | 'cloud' | 'both'
      cloudHost: 'a1.tuyacn.com',
      countryCode: '1',
      clientId: '',
      clientSecret: '',
      localHost: '',
      protocol: '3.3',
      eveningOffset: '+00:30:00',
      morningOffset: '-00:15:00',
      personEntity: '',
      motionSensors: true,
      autos: {
        sunsetScene: true,
        sunriseOff: true,
        personArrival: false,
        motion: true,
        helperSwitches: true,
        allScripts: true
      }
    },
    activeLocation: null,
    activeIcon: null,
    locations: []
  };

  /* Pick a name that is not already used on this location, so two uplighters
     never end up sharing an entity id, helper or theme variable. */
  function nextIconName(icons, type) {
    var info = typeInfo(type);
    var taken = {};
    (icons || []).forEach(function (icon) { taken[String(icon.name).toLowerCase()] = true; });
    if (!taken[info.label.toLowerCase()]) return info.label;
    var n = 2;
    while (taken[(info.label + ' ' + n).toLowerCase()]) n += 1;
    return info.label + ' ' + n;
  }

  function makeIcon(opts) {
    opts = opts || {};
    var type = opts.type || 'uplighter';
    var info = typeInfo(type);
    var name = opts.name || info.label;
    return {
      id: U.uid('icon'),
      name: name,
      type: type,
      domain: opts.domain || info.domain,
      entity: opts.entity || '',
      x: typeof opts.x === 'number' ? opts.x : 50,
      y: typeof opts.y === 'number' ? opts.y : 50,
      size: typeof opts.size === 'number' ? opts.size : 48,
      colour: opts.colour || info.hue,
      enabled: opts.enabled !== false,
      tracked: opts.tracked !== false,
      helper: opts.helper !== false,
      hidden: !!opts.hidden,
      brightnessEntity: opts.brightnessEntity || '',
      colourTempEntity: opts.colourTempEntity || '',
      tuya: {
        deviceId: opts.tuya && opts.tuya.deviceId ? opts.tuya.deviceId : '',
        localKey: opts.tuya && opts.tuya.localKey ? opts.tuya.localKey : '',
        host: (opts.tuya && opts.tuya.host) || '',
        protocol: (opts.tuya && opts.tuya.protocol) || '3.3',
        model: (opts.tuya && opts.tuya.model) || '',
        category: (opts.tuya && opts.tuya.category) || (info.domain === 'switch' ? 'kg' : 'dj'),
        dpSwitch: opts.tuya && opts.tuya.dpSwitch != null ? opts.tuya.dpSwitch : 1,
        dpBrightness: opts.tuya && opts.tuya.dpBrightness != null ? opts.tuya.dpBrightness : 2,
        dpColourTemp: opts.tuya && opts.tuya.dpColourTemp != null ? opts.tuya.dpColourTemp : 0,
        dpMode: opts.tuya && opts.tuya.dpMode != null ? opts.tuya.dpMode : 0
      }
    };
  }

  function makeLocation(opts) {
    opts = opts || {};
    var name = opts.name || 'New location';
    var loc = {
      id: U.uid('loc'),
      name: name,
      path: opts.path || U.slugify(name),
      icon: opts.icon || 'mdi:map-marker-radius',
      viewIcon: opts.viewIcon || 'mdi:floor-plan',
      imagePath: opts.imagePath || '',
      imageDataUrl: opts.imageDataUrl || '',
      imageFile: opts.imageFile || '',
      imageRatio: opts.imageRatio || 0,
      iconCount: clampIconCount(opts.iconCount === undefined ? 5 : opts.iconCount),
      title: opts.title || '',
      icons: [],
      auto: {
        sunset: true,
        sunriseOff: true,
        motion: false,
        motionEntity: '',
        autoBrightness: 60
      }
    };
    (opts.icons || []).forEach(function (icon) { loc.icons.push(makeIcon(icon)); });
    return loc;
  }

  /* Starting mix of fixtures for a view of any size. The first five are the
     ones a normal room needs, then the catalogue cycles so 12 uplighters do
     not all end up the same. */
  function starterPlan(count) {
    if (count <= 3) return ['uplighter', 'uplighter', 'lamp'].slice(0, count);
    if (count === 4) return ['uplighter', 'uplighter', 'lamp', 'floorlamp'];
    return [
      'uplighter', 'uplighter', 'uplighter', 'lamp', 'floorlamp',
      'ceiling', 'pendant', 'downlight', 'uplighter', 'lamp',
      'floorlamp', 'ceiling', 'pendant', 'downlight', 'strip'
    ].slice(0, count);
  }

  function starterIcons(count) {
    count = clampIconCount(count);
    var icons = [];
    starterPlan(count).forEach(function (type) {
      icons.push(makeIcon({ type: type, name: nextIconName(icons, type) }));
    });
    return layoutPositions(icons, count);
  }

  /* Distribute icons over the canvas in a readable grid. Column count is
     chosen so 1-15 icons all land on a tidy, evenly spaced grid. */
  function layoutPositions(icons, count) {
    var n = icons.length || count || 1;
    var cols = n <= 2 ? n
      : n === 3 ? 3
        : n === 4 ? 2
          : n <= 8 ? 3
            : n <= 12 ? 4
              : 5;
    var rows = Math.ceil(n / cols);
    var padX = 16, padY = 20;
    icons.forEach(function (icon, i) {
      var col = i % cols, row = Math.floor(i / cols);
      var stepX = (100 - padX * 2) / Math.max(1, cols - 1);
      var stepY = (100 - padY * 2) / Math.max(1, rows - 1);
      icon.x = cols === 1 ? 50 : U.round(padX + col * stepX, 2);
      icon.y = rows === 1 ? 50 : U.round(padY + row * stepY, 2);
    });
    return icons;
  }

  /* ------------------------------------------------------------- placement */

  /* A new icon is dropped near the middle of the plan: the exact centre first,
     then the closest ring around it that has a free spot, so it ends up as close
     to the middle as it can while still clear of everything already placed.
     Icons that are already on the plan are never touched.

     Positions are percentages of the image box and a plan is rarely square, so
     the rendered box size is needed to keep distances even: the rings and the
     clearance are worked out in pixels and converted back to percentages at the
     end. Callers that know the box pass it in, otherwise a nominal one is used.

     The icons are drawn as round pips, so clearance is measured centre to
     centre rather than box to box: a light needs to be one icon diameter plus
     PLACE_GAP away from its neighbour, which packs a busy plan sensibly instead
     of ruling out every diagonal position. */
  var NOMINAL_BOX = { width: 1000, height: 1000 };
  var PLACE_GAP = 12;        /* px of clear space wanted between two icons */
  var PLACE_EDGE = 6;        /* px kept clear at the plan edges */
  var PLACE_SPOKES = 12;     /* most candidate spots tried per ring */
  var PLACE_SPREAD = 1.35;   /* ring spacing, as a multiple of the clearance */

  function boxOf(box) {
    var width = box && Number(box.width) > 0 ? Number(box.width) : NOMINAL_BOX.width;
    var height = box && Number(box.height) > 0 ? Number(box.height) : NOMINAL_BOX.height;
    return { width: width, height: height };
  }

  function iconSize(icon) {
    return Number(icon && icon.size) > 0 ? Number(icon.size) : 48;
  }

  /* A stable -1..1 number from a string, so a given draft always places its
     icons the same way and nothing jumps to a new spot on reload. */
  function wobble(seed) {
    var n = 2166136261;
    for (var i = 0; i < seed.length; i += 1) {
      n = (n ^ seed.charCodeAt(i)) >>> 0;
      n = Math.imul(n, 16777619) >>> 0;
    }
    return ((n % 2001) / 1000) - 1;
  }

  /* Room left around a candidate spot, in pixels. Negative means it would sit on
     top of an existing icon; bigger is better. */
  function clearance(px, py, taken, box, size) {
    var worst = Infinity;
    for (var i = 0; i < taken.length; i += 1) {
      var other = taken[i];
      var dx = px - ((Number(other.x) || 0) - 50) / 100 * box.width;
      var dy = py - ((Number(other.y) || 0) - 50) / 100 * box.height;
      var gap = (size + iconSize(other)) / 2 + PLACE_GAP;
      worst = Math.min(worst, Math.sqrt(dx * dx + dy * dy) - gap);
    }
    return worst;
  }

  function placeIcon(taken, icon, box) {
    var size = iconSize(icon);
    box = boxOf(box);
    var others = (taken || []).filter(function (i) { return i !== icon; });
    var padX = ((size / 2 + PLACE_EDGE) / box.width) * 100;
    var padY = ((size / 2 + PLACE_EDGE) / box.height) * 100;
    /* Percentages the icon centre may sit at. A plan too small for that falls
       back to the middle rather than an impossible range. */
    var loX = Math.min(50, padX), hiX = Math.max(50, 100 - padX);
    var loY = Math.min(50, padY), hiY = Math.max(50, 100 - padY);
    var room = Math.min(box.width, box.height);
    var need = size + PLACE_GAP;                     /* px between two centres */
    var step = need * PLACE_SPREAD;                  /* px between two rings */
    var rings = Math.max(2, Math.ceil((room * 0.5) / step));
    var seed = (icon.name || 'icon') + '|' + others.length;
    /* Each icon starts its ring at its own angle, so successive additions do
       not stack up above one another. */
    var phase = wobble(seed) * Math.PI * 2;
    var best = null;

    for (var ring = 0; ring < rings; ring += 1) {
      var radius = ring * step;
      if (radius === 0) radius = 0;
      /* Evenly spaced slots, however many fit around this ring. */
      var spokes = ring === 0 ? 1
        : Math.max(4, Math.min(PLACE_SPOKES, Math.floor(2 * Math.PI * radius / need)));
      for (var spoke = 0; spoke < spokes; spoke += 1) {
        var angle = phase + (spoke / spokes) * 2 * Math.PI;
        var cos = Math.cos(angle), sin = Math.sin(angle);
        /* Pull the spot in along its own angle until it sits inside the plan,
           instead of clamping the finished coordinates: clamping would squash
           every outer candidate onto the same edge and pile them up. */
        var reach = radius;
        if (cos > 1e-6) reach = Math.min(reach, ((hiX - 50) / 100) * box.width / cos);
        if (sin > 1e-6) reach = Math.min(reach, ((hiY - 50) / 100) * box.height / sin);
        var x = U.clamp(50 + ((reach * cos) / box.width) * 100, loX, hiX);
        var y = U.clamp(50 + ((reach * sin) / box.height) * 100, loY, hiY);
        if (others.length === 0) {
          icon.x = U.round(x, 2);
          icon.y = U.round(y, 2);
          return icon;
        }
        var free = clearance(((x - 50) / 100) * box.width, ((y - 50) / 100) * box.height,
          others, box, size);
        if (free >= 0) {
          icon.x = U.round(x, 2);
          icon.y = U.round(y, 2);
          return icon;
        }
        if (!best || free > best.free) best = { free: free, x: x, y: y };
      }
    }

    /* Every candidate overlapped, which only happens on a very crowded plan:
       take the roomiest spot rather than dropping the icon on top of another. */
    icon.x = U.round(best ? best.x : 50, 2);
    icon.y = U.round(best ? best.y : 50, 2);
    return icon;
  }

  function defaultState() {
    var state = JSON.parse(JSON.stringify(DEFAULTS));
    var f1 = makeLocation({
      name: 'Floor 1',
      path: 'floor-1',
      viewIcon: 'mdi:floor-plan',
      imagePath: '/local/lighting/floor1.png',
      iconCount: 5
    });
    f1.icons = starterIcons(5);
    f1.icons.forEach(function (icon) {
      icon.entity = icon.domain + '.' + U.slugify(f1.name + ' ' + icon.name);
    });

    var f2 = makeLocation({
      name: 'Floor 2',
      path: 'floor-2',
      viewIcon: 'mdi:floor-plan',
      imagePath: '/local/lighting/floor2.png',
      iconCount: 4
    });
    f2.icons = starterIcons(4);
    f2.icons.forEach(function (icon) {
      icon.entity = icon.domain + '.' + U.slugify(f2.name + ' ' + icon.name);
    });
    f2.auto.motion = true;

    state.locations = [f1, f2];
    state.activeLocation = f1.id;
    state.activeIcon = f1.icons[0].id;
    return state;
  }

  /* Merge a loaded draft onto the current defaults so older/partial drafts
     keep working. */
  function migrate(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    var state = {
      meta: Object.assign({}, base.meta, raw.meta || {}),
      options: Object.assign({}, base.options, raw.options || {}),
      tuya: Object.assign({}, base.tuya, raw.tuya || {}),
      activeLocation: raw.activeLocation || null,
      activeIcon: raw.activeIcon || null,
      locations: []
    };
    state.tuya.autos = Object.assign({}, base.tuya.autos, (raw.tuya || {}).autos || {});

    var locations = Array.isArray(raw.locations) ? raw.locations : [];
    if (!locations.length) return defaultState();

    state.locations = locations.map(function (loc) {
      var next = makeLocation({
        name: loc.name,
        path: loc.path,
        icon: loc.icon,
        viewIcon: loc.viewIcon,
        imagePath: loc.imagePath,
        imageDataUrl: loc.imageDataUrl,
        imageFile: loc.imageFile,
        imageRatio: loc.imageRatio,
        iconCount: loc.iconCount,
        title: loc.title
      });
      next.id = loc.id || next.id;
      next.auto = Object.assign({}, next.auto, loc.auto || {});
      next.icons = (loc.icons || []).map(function (icon) {
        var made = makeIcon(icon);
        made.id = icon.id || made.id;
        return made;
      });
      return next;
    });

    if (!state.locations.some(function (l) { return l.id === state.activeLocation; })) {
      state.activeLocation = state.locations[0].id;
    }
    var active = state.locations.filter(function (l) { return l.id === state.activeLocation; })[0];
    if (!active.icons.some(function (i) { return i.id === state.activeIcon; })) {
      state.activeIcon = active.icons.length ? active.icons[0].id : null;
    }
    return state;
  }

  function activeLocation(state) {
    return state.locations.filter(function (l) { return l.id === state.activeLocation; })[0] || state.locations[0] || null;
  }

  function activeIcon(state) {
    var loc = activeLocation(state);
    if (!loc) return null;
    return loc.icons.filter(function (i) { return i.id === state.activeIcon; })[0] || loc.icons[0] || null;
  }

  function allIcons(state) {
    return state.locations.reduce(function (acc, loc) { return acc.concat(loc.icons); }, []);
  }

  /* Unique entity ids, used for validation. */
  function entityIndex(state) {
    var map = {};
    allIcons(state).forEach(function (icon) {
      if (!icon.entity) return;
      (map[icon.entity] = map[icon.entity] || []).push(icon.name);
    });
    return map;
  }

  /* A usable, unique entity id for a fixture the builder invented. Without one
     the icon is skipped when the dashboard is generated, so a new light always
     gets an identity here rather than at the call site. */
  function defaultEntity(loc, icon) {
    var domain = icon.domain || 'light';
    var base = domain + '.' + U.slugify((loc.name || 'light') + ' ' + (icon.name || 'icon'));
    var taken = {};
    loc.icons.forEach(function (other) {
      if (other !== icon && other.entity) taken[other.entity] = true;
    });
    if (!taken[base]) return base;
    var n = 2;
    while (taken[base + '_' + n]) n += 1;
    return base + '_' + n;
  }

  /* Icons already on the plan keep the exact positions the user gave them:
     only the newly created ones are placed. */
  function setIconCount(loc, count, box) {
    count = clampIconCount(count);
    loc.iconCount = count;
    var plan = starterPlan(count);
    while (loc.icons.length > count) loc.icons.pop();
    while (loc.icons.length < count) {
      var type = plan[loc.icons.length] || 'uplighter';
      var icon = makeIcon({ type: type, name: nextIconName(loc.icons, type) });
      if (!icon.entity) icon.entity = defaultEntity(loc, icon);
      placeIcon(loc.icons, icon, box);
      loc.icons.push(icon);
    }
  }

  global.LightingState = {
    ICON_TYPES: ICON_TYPES,
    SUPPORTED_DOMAINS: SUPPORTED_DOMAINS,
    isSupportedDomain: isSupportedDomain,
    domainOf: domainOf,
    MIN_ICONS: MIN_ICONS,
    MAX_ICONS: MAX_ICONS,
    clampIconCount: clampIconCount,
    typeInfo: typeInfo,
    makeIcon: makeIcon,
    makeLocation: makeLocation,
    nextIconName: nextIconName,
    layoutPositions: layoutPositions,
    placeIcon: placeIcon,
    defaultEntity: defaultEntity,
    starterPlan: starterPlan,
    starterIcons: starterIcons,
    defaultState: defaultState,
    migrate: migrate,
    activeLocation: activeLocation,
    activeIcon: activeIcon,
    allIcons: allIcons,
    entityIndex: entityIndex,
    setIconCount: setIconCount
  };
})(window);
