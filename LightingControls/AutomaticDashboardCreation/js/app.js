/* Application wiring: state <-> DOM, drafts, export. */
(function () {
  'use strict';

  var state = null;
  var output = { files: [], issues: [] };
  var activeFile = 'dashboard.yaml';
  var saveTimer = null;
  var suppressBind = false;

  var el = {
    locationList: document.getElementById('locationList'),
    iconChips: document.getElementById('iconChips'),
    canvasTitle: document.getElementById('canvasTitle'),
    canvasSubtitle: document.getElementById('canvasSubtitle'),
    canvasStatus: document.getElementById('canvasStatus'),
    imagePath: document.getElementById('imagePath'),
    existingImages: document.getElementById('existingImages'),
    iconCount: document.getElementById('iconCount'),
    btnIconMinus: document.getElementById('btnIconMinus'),
    btnIconPlus: document.getElementById('btnIconPlus'),
    btnAddIcon: document.getElementById('btnAddIcon'),
    yamlOutput: document.getElementById('yamlOutput'),
    filePicker: document.getElementById('filePicker'),
    issueBox: document.getElementById('issueBox'),
    storageBadge: document.getElementById('storageBadge'),
    draftsDialog: document.getElementById('draftsDialog'),
    draftList: document.getElementById('draftList'),
    draftName: document.getElementById('draftName'),
    draftStoreNote: document.getElementById('draftStoreNote'),
    toast: document.getElementById('toast'),
    btnHA: document.getElementById('btnHA'),
    haDot: document.getElementById('haDot'),
    haDialog: document.getElementById('haDialog'),
    haUrl: document.getElementById('haUrl'),
    haToken: document.getElementById('haToken'),
    haStatus: document.getElementById('haStatus')
  };

  var HA_DOMAINS = ['light', 'switch', 'number', 'binary_sensor', 'person', 'device_tracker'];

  /* ------------------------------------------------------------------ utils */

  function toast(message, kind) {
    el.toast.textContent = message;
    el.toast.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.className = 'toast'; }, 3200);
  }

  function getPath(obj, path) {
    return path.split('.').reduce(function (acc, key) {
      return acc == null ? acc : acc[key];
    }, obj);
  }

  function setPath(obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (acc, key) {
      if (acc[key] == null) acc[key] = {};
      return acc[key];
    }, obj);
    target[last] = value;
  }

  /* ---------------------------------------------------------------- persist */

  /* Keep drafts small: base images uploaded to the server live as files, so the
     data url is only kept where nothing else can serve it (localStorage). */
  function snapshot(stripDataUrl) {
    var clone = JSON.parse(JSON.stringify(state));
    clone.locations.forEach(function (loc) {
      delete loc.imageUrl;          // runtime only
      if (stripDataUrl) loc.imageDataUrl = '';
    });
    return clone;
  }

  function persistSession() {
    LightingStore.saveSession(LightingStore.current, snapshot(true));
  }

  function scheduleSave() {
    persistSession();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!LightingStore.current) return;
      LightingStore.save(LightingStore.current, snapshot(LightingStore.mode === 'server'))
        .then(function () { el.draftStoreNote && refreshDraftNote(); })
        .catch(function (err) { console.warn('autosave failed', err); });
    }, 1500);
  }

  function markDirty() {
    scheduleSave();
    refreshOutput();
  }

  /* ----------------------------------------------------------------- render */

  function render() {
    renderLocations();
    renderCanvas();
    renderChips();
    renderInspector();
    syncGlobalInputs();
    refreshOutput();
  }

  function renderLocations() {
    var list = el.locationList;
    list.innerHTML = '';
    state.locations.forEach(function (loc) {
      var active = loc.id === state.activeLocation;
      var item = document.createElement('li');
      item.className = 'location-item' + (active ? ' active' : '');

      var icon = LightingCanvas.iconNode(loc.viewIcon, 'li-icon');
      item.appendChild(icon);

      var body = document.createElement('div');
      body.className = 'li-body';
      var name = document.createElement('div');
      name.className = 'li-name';
      name.textContent = loc.name || '(unnamed)';
      var sub = document.createElement('div');
      sub.className = 'li-sub';
      sub.textContent = loc.icons.length + ' icons - ' + (loc.imagePath ? loc.imagePath : 'no image');
      body.appendChild(name);
      body.appendChild(sub);
      item.appendChild(body);

      var btns = document.createElement('div');
      btns.className = 'li-btns';
      btns.appendChild(button('▲', 'Move up', function () { moveLocation(loc.id, -1); }));
      btns.appendChild(button('▼', 'Move down', function () { moveLocation(loc.id, 1); }));
      btns.appendChild(button('✕', 'Delete location', function () { deleteLocation(loc.id); }));
      item.appendChild(btns);

      item.addEventListener('click', function (event) {
        if (event.target.closest('.li-btns')) return;
        state.activeLocation = loc.id;
        state.activeIcon = loc.icons.length ? loc.icons[0].id : null;
        render();
        markDirty();
      });
      list.appendChild(item);
    });
  }

  function button(label, title, handler) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      handler();
    });
    return btn;
  }

  function renderChips() {
    var loc = LightingState.activeLocation(state);
    el.iconChips.innerHTML = '';
    if (!loc) return;
    loc.icons.forEach(function (icon) {
      var chip = document.createElement('span');
      chip.className = 'chip' + (icon.id === state.activeIcon ? ' active' : '');
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.color = icon.colour || '#ffd479';
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(icon.name || 'icon'));
      var x = document.createElement('span');
      x.className = 'chip-x';
      x.textContent = '✕';
      x.title = 'Remove this icon';
      x.addEventListener('click', function (event) {
        event.stopPropagation();
        removeIcon(icon.id);
      });
      chip.appendChild(x);
      chip.addEventListener('click', function () {
        state.activeIcon = icon.id;
        renderCanvas();
        renderChips();
        renderInspector();
      });
      el.iconChips.appendChild(chip);
    });

    var count = loc.iconCount;
    el.iconCount.value = count;
    el.iconCount.min = LightingState.MIN_ICONS;
    el.iconCount.max = LightingState.MAX_ICONS;
    el.btnIconMinus.disabled = count <= LightingState.MIN_ICONS;
    el.btnIconPlus.disabled = count >= LightingState.MAX_ICONS;
    el.btnAddIcon.disabled = loc.icons.length >= LightingState.MAX_ICONS;
  }

  /* Typing a /local path should preview straight away, but not once per
     keystroke, so the canvas re-render waits for a pause. */
  var renderCanvasSoon = U.debounce(function () { renderCanvas(); }, 350);

  function renderCanvas() {
    var loc = LightingState.activeLocation(state);
    if (!loc) {
      el.canvasTitle.textContent = 'No location';
      el.canvasSubtitle.textContent = '';
      LightingCanvas.render(null, null, state.options.snap);
      return;
    }
    el.canvasTitle.textContent = loc.name || '(unnamed location)';
    var placed = loc.icons.length;
    el.canvasSubtitle.textContent = placed + ' icon' + (placed === 1 ? '' : 's') + ' - view path "' + loc.path + '"';
    LightingCanvas.setShowNames(state.options.showNames);
    el.imagePath.value = loc.imagePath || '';

    var wanted = loc.imageDataUrl ? Promise.resolve(loc.imageDataUrl) : LightingStore.imageUrl(loc);
    wanted.then(function (url) {
      var latest = LightingState.activeLocation(state);
      if (!latest || latest.id !== loc.id) return;
      setPreviewUrl(latest, url || '');
      LightingCanvas.render(latest, state.activeIcon, state.options.snap);
      fitCanvas(latest);
    });
  }

  /* Object URLs are ours to release; data URLs are not. */
  var previewObjectUrl = '';

  function setPreviewUrl(loc, url) {
    if (previewObjectUrl && previewObjectUrl !== url) {
      try { URL.revokeObjectURL(previewObjectUrl); } catch (err) { /* ignore */ }
      previewObjectUrl = '';
    }
    if (url && url.indexOf('blob:') === 0) previewObjectUrl = url;
    loc.imageUrl = url;
  }

  /* Read an image's natural size, so we can letterbox a floor plan to its own
     aspect ratio. Resolves to zeros when the image does not load. */
  function probeImage(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve({ width: 0, height: 0, ratio: 0 }); return; }
      var probe = new Image();
      probe.onload = function () {
        var w = probe.naturalWidth, h = probe.naturalHeight;
        resolve({ width: w, height: h, ratio: (w > 0 && h > 0) ? U.round(w / h, 4) : 0 });
      };
      probe.onerror = function () { resolve({ width: 0, height: 0, ratio: 0 }); };
      probe.src = url;
    });
  }

  /* Every location with an image needs its own ratio, not just the one on
     screen, so measure them all. Each image is resolved the same way the canvas
     previews it: an uploaded data url, or a file server.py can find for a
     /local path. Runs at most once at a time; any change marks the draft dirty
     so the next export carries the ratio. */
  var measuring = null;
  function measureImages() {
    if (measuring) return measuring;
    if (!state) return Promise.resolve(false);
    var pending = state.locations.filter(function (loc) {
      return !(loc.imageRatio > 0) && (loc.imageDataUrl || loc.imageFile || loc.imagePath);
    });
    if (!pending.length) return Promise.resolve(false);
    measuring = Promise.all(pending.map(function (loc) {
      var wanted = loc.imageDataUrl ? Promise.resolve(loc.imageDataUrl) : LightingStore.imageUrl(loc);
      return wanted.then(function (url) {
        return probeImage(url).then(function (info) {
          if (url && url.indexOf('blob:') === 0) {
            try { URL.revokeObjectURL(url); } catch (err) { /* ignore */ }
          }
          if (info.ratio > 0) loc.imageRatio = info.ratio;
          return info.ratio > 0;
        });
      }).catch(function () { return false; });
    })).then(function (results) {
      measuring = null;
      var changed = results.some(Boolean);
      if (changed) markDirty();
      return changed;
    });
    return measuring;
  }

  /* Match the canvas box to the base image aspect ratio, and remember the ratio
     on the location so the dashboard can letterbox the plan to the screen. */
  function fitCanvas(loc) {
    loc = loc || LightingState.activeLocation(state);
    if (!loc || !loc.imageUrl) {
      LightingCanvas.applyAspect(null);
      return;
    }
    probeImage(loc.imageUrl).then(function (info) {
      var latest = LightingState.activeLocation(state);
      if (!latest || latest.id !== loc.id) return;
      if (info.ratio > 0) latest.imageRatio = info.ratio;
      LightingCanvas.applyAspect(latest, info.width, info.height);
      if (info.ratio > 0) markDirty();
    });
  }

  function renderInspector() {
    LightingInspector.render(state, LightingInspector.mode());
  }

  function syncGlobalInputs() {
    suppressBind = true;
    document.querySelectorAll('[data-bind]').forEach(function (input) {
      if (document.activeElement === input) return;   // never fight the caret
      var value = getPath(state, input.dataset.bind);
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else {
        input.value = value == null ? '' : value;
      }
    });
    suppressBind = false;
  }

  function refreshOutput() {
    output = LightingYaml.generate(state);
    if (!output.files.some(function (f) { return f.name === activeFile; })) {
      activeFile = output.files.length ? output.files[0].name : '';
    }
    el.filePicker.innerHTML = '';
    output.files.forEach(function (file) {
      var opt = document.createElement('option');
      opt.value = file.name;
      opt.textContent = file.name + '  -  ' + file.note;
      if (file.name === activeFile) opt.selected = true;
      el.filePicker.appendChild(opt);
    });
    var file = output.files.filter(function (f) { return f.name === activeFile; })[0];
    el.yamlOutput.textContent = file ? file.content : 'Nothing to generate yet.';

    el.issueBox.innerHTML = '';
    var counts = { error: 0, warn: 0, info: 0 };
    output.issues.forEach(function (issue) {
      counts[issue.level] = (counts[issue.level] || 0) + 1;
      var node = document.createElement('div');
      node.className = 'issue issue-' + issue.level;
      node.textContent = (issue.level === 'error' ? '✕ ' : issue.level === 'warn' ? '! ' : 'i ') + issue.text;
      el.issueBox.appendChild(node);
    });
    el.canvasStatus.textContent = counts.error
      ? counts.error + ' error(s), ' + counts.warn + ' warning(s)'
      : (counts.warn ? counts.warn + ' warning(s) - check the YAML panel' : 'ready');
  }

  /* ---------------------------------------------------------------- actions */

  function moveLocation(id, delta) {
    var index = state.locations.findIndex(function (l) { return l.id === id; });
    var next = index + delta;
    if (index < 0 || next < 0 || next >= state.locations.length) return;
    state.locations = U.moveItem(state.locations, index, next);
    render();
    markDirty();
  }

  function deleteLocation(id) {
    if (state.locations.length <= 1) {
      toast('Keep at least one location', 'error');
      return;
    }
    var loc = state.locations.filter(function (l) { return l.id === id; })[0];
    if (!window.confirm('Delete "' + (loc ? loc.name : 'this location') + '" and its icons?')) return;
    state.locations = state.locations.filter(function (l) { return l.id !== id; });
    if (state.activeLocation === id) {
      state.activeLocation = state.locations[0].id;
      state.activeIcon = state.locations[0].icons.length ? state.locations[0].icons[0].id : null;
    }
    render();
    markDirty();
    toast('Location deleted');
  }

  function addLocation() {
    var number = state.locations.length + 1;
    var loc = LightingState.makeLocation({
      name: 'Location ' + number,
      path: 'location-' + number,
      iconCount: 5
    });
    loc.icons = LightingState.starterIcons(5);
    loc.icons.forEach(function (icon) {
    icon.entity = LightingState.defaultEntity(loc, icon);
    });
    state.locations.push(loc);
    state.activeLocation = loc.id;
    state.activeIcon = loc.icons[0].id;
    render();
    markDirty();
    toast('Added ' + loc.name);
  }

  function addIcon() {
    var loc = LightingState.activeLocation(state);
    if (!loc) return;
    if (loc.icons.length >= LightingState.MAX_ICONS) {
      toast('A view holds at most ' + LightingState.MAX_ICONS + ' icons', 'error');
      return;
    }
    var type = LightingState.ICON_TYPES[loc.icons.length % LightingState.ICON_TYPES.length].value;
    var icon = LightingState.makeIcon({
      type: type,
      name: LightingState.nextIconName(loc.icons, type),
      size: state.options.iconSize
    });
    icon.entity = icon.domain + '.' + U.slugify(loc.name + ' ' + icon.name);
    /* Land near the middle, jittered clear of what is already placed. The icons
       already on the plan keep their positions. */
    LightingState.placeIcon(loc.icons, icon, LightingCanvas.box());
    loc.icons.push(icon);
    loc.iconCount = loc.icons.length;
    state.activeIcon = icon.id;
    render();
    markDirty();
  }

  function removeIcon(iconId) {
    var loc = LightingState.activeLocation(state);
    if (!loc) return;
    loc.icons = loc.icons.filter(function (i) { return i.id !== iconId; });
    loc.iconCount = loc.icons.length;
    if (state.activeIcon === iconId) {
      state.activeIcon = loc.icons.length ? loc.icons[0].id : null;
    }
    render();
    markDirty();
  }

  /* The count field keeps whatever the user is typing, so anything that
     changes the count from elsewhere has to push the real value back in. */
  function syncCountField() {
    var loc = LightingState.activeLocation(state);
    if (loc) el.iconCount.value = loc.iconCount;
  }

  function setIconCount(raw) {
    var loc = LightingState.activeLocation(state);
    if (!loc) return;
    var wanted = LightingState.clampIconCount(raw);
    if (wanted === loc.iconCount) {
      el.iconCount.value = wanted;
      return;
    }
    if (wanted < loc.iconCount) {
      var doomed = loc.icons.length - wanted;
      var ok = window.confirm('Reduce ' + loc.name + ' to ' + wanted + ' icon' +
        (wanted === 1 ? '' : 's') + '?\n\n' + doomed + ' icon' + (doomed === 1 ? '' : 's') +
        ' will be removed from this view.');
      if (!ok) {
        el.iconCount.value = loc.iconCount;
        return;
      }
    }
    LightingState.setIconCount(loc, wanted, LightingCanvas.box());
    state.activeIcon = loc.icons.length ? loc.icons[0].id : null;
    render();
    markDirty();
  }

  function autoPlace() {
    var loc = LightingState.activeLocation(state);
    if (!loc) return;
    var selected = loc.icons.filter(function (i) { return i.id === state.activeIcon; });
    if (selected.length) {
      var icon = selected[0];
      icon.x = 50;
      icon.y = 50;
      render();
      markDirty();
      toast('"' + icon.name + '" moved to the middle');
    } else {
      gridLayout();
    }
  }

  function gridLayout() {
    var loc = LightingState.activeLocation(state);
    if (!loc) return;
    LightingState.layoutPositions(loc.icons, loc.icons.length);
    render();
    markDirty();
    toast('Icons spread evenly');
  }

  function applyImage(result, name) {
    var loc = LightingState.activeLocation(state);
    if (!loc) return;
    var previous = loc.imageFile;
    loc.imageDataUrl = result.dataUrl || '';
    loc.imageFile = result.file || '';
    loc.imageUrl = loc.imageDataUrl || '';
    loc.imageRatio = 0;
    if (result.path) loc.imagePath = result.path;
    else if (!loc.imagePath) loc.imagePath = '/local/lighting/' + U.slugify(loc.name) + '.png';
    if (previous && previous !== result.file) LightingStore.forgetImage(previous);
    render();
    measureImages();
    markDirty();
    toast(result.uploaded
      ? 'Image stored in temp/images - copy it to /config/www' + (result.path || '').replace('/local', '') + ' for Home Assistant'
      : 'Image kept in the draft. Run server.py to store the file, and set the /local path by hand.');
  }

  function uploadImage(file) {
    var loc = LightingState.activeLocation(state);
    if (!loc) {
      toast('Add a location first', 'error');
      return;
    }
    if (!file.type || file.type.indexOf('image/') !== 0) {
      toast('That is not an image file', 'error');
      return;
    }
    toast('Uploading ' + file.name + '...');
    LightingStore.uploadImage(file)
      .then(function (result) { applyImage(result, file.name); })
      .catch(function (err) { toast('Upload failed: ' + err.message, 'error'); });
  }

  function useRepoImage(name) {
    var loc = LightingState.activeLocation(state);
    if (!loc || !name) return;
    if (LightingStore.mode !== 'server') {
      toast('Repo images need server.py running', 'error');
      return;
    }
    fetch('api/base-image?name=' + encodeURIComponent(name), { method: 'POST' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (info) {
        applyImage({ dataUrl: '', file: info.file, path: info.path, uploaded: true }, name);
      })
      .catch(function (err) { toast('Copy failed: ' + err.message, 'error'); });
  }

  /* ----------------------------------------------------------------- drafts */

  /* ------------------------------------------------------ Home Assistant */

  function haStatusLine(message, kind) {
    if (!el.haStatus) return;
    el.haStatus.textContent = message;
    el.haStatus.className = 'hint' + (kind ? ' ' + kind : '');
  }

  function updateHaBadge() {
    if (!el.haDot) return;
    var info = LightingHA.info();
    el.haDot.className = 'ha-dot' + (LightingHA.connected()
      ? ' on'
      : (info.loaded && info.error ? ' off' : ''));
    el.btnHA.title = LightingHA.connected()
      ? 'Reading entities from ' + info.url + ' - click to change the connection'
      : (info.error || 'Not connected. Click to pick the entities your devices already have in Home Assistant.');
  }

  function openHaDialog() {
    var info = LightingHA.info();
    if (el.haUrl) el.haUrl.value = info.url || '';
    if (el.haToken) {
      el.haToken.value = '';
      el.haToken.placeholder = info.tokenSet
        ? 'saved - leave blank to keep it'
        : 'Profile -> Security -> Long-lived tokens';
    }
    haStatusLine(info.configured
      ? 'Connected to ' + info.url + '.'
      : (info.error || 'Not connected. Paste the URL and a long lived token.'));
    if (!el.haDialog) return;
    if (typeof el.haDialog.showModal === 'function') el.haDialog.showModal();
    else el.haDialog.setAttribute('open', '');
  }

  function bindHa() {
    if (!el.btnHA) return;
    el.btnHA.addEventListener('click', function () {
      LightingHA.status(true).then(function () {
        updateHaBadge();
        openHaDialog();
      });
    });

    var btnSave = document.getElementById('btnHASave');
    if (btnSave) btnSave.addEventListener('click', function () {
      var url = (el.haUrl.value || '').trim();
      var token = (el.haToken.value || '').trim();
      haStatusLine('Saving…');
      LightingHA.save(url, token).then(function () {
        updateHaBadge();
        el.haToken.value = '';
        if (!url) {
          haStatusLine('Disconnected.');
          toast('Home Assistant connection cleared');
          if (state) renderInspector();
          return null;
        }
        haStatusLine('Connected to ' + url + '. Reading entities…');
        return LightingHA.entities(HA_DOMAINS, true).then(function (list) {
          haStatusLine('Connected to ' + url + ' - ' + list.length + ' entities read.');
          toast('Home Assistant connected - ' + list.length + ' entities');
          if (state) renderInspector();
        }).catch(function (err) {
          haStatusLine(err.message, 'warn');
          toast('Could not read entities: ' + err.message, 'error');
        });
      }).catch(function (err) {
        haStatusLine(err.message, 'warn');
        toast(err.message, 'error');
      });
    });

    var btnFetch = document.getElementById('btnHAFetch');
    if (btnFetch) btnFetch.addEventListener('click', function () {
      if (!LightingHA.connected()) {
        haStatusLine('Save a URL and token first.', 'warn');
        return;
      }
      haStatusLine('Reading entities…');
      LightingHA.entities(HA_DOMAINS, true).then(function (list) {
        haStatusLine('Read ' + list.length + ' entities from ' + LightingHA.info().url + '.');
        if (state) renderInspector();
      }).catch(function (err) {
        haStatusLine(err.message, 'warn');
      });
    });

    var btnClear = document.getElementById('btnHAClear');
    if (btnClear) btnClear.addEventListener('click', function () {
      LightingHA.clear().then(function () {
        updateHaBadge();
        haStatusLine('Disconnected. The saved token was deleted.');
        if (el.haUrl) el.haUrl.value = '';
        toast('Home Assistant connection forgotten');
        if (state) renderInspector();
      });
    });
  }

  function openDrafts() {
    el.draftsDialog.showModal();
    el.draftName.value = LightingStore.current || suggestDraftName();
    refreshDrafts();
  }

  function suggestDraftName() {
    var base = U.slugify(state.meta.title || 'lighting') + '-draft';
    return base;
  }

  function refreshDraftNote() {
    if (!el.draftStoreNote) return;
    el.draftStoreNote.textContent = LightingStore.mode === 'server'
      ? 'Saved as files in the repo under temp/ (via server.py).'
      : (LightingStore.mode === 'local'
        ? 'server.py is not running, so drafts live in this browser\'s localStorage.'
        : 'No storage available - use Export draft to keep your work.');
  }

  function refreshDrafts() {
    refreshDraftNote();
    el.draftList.innerHTML = '';
    LightingStore.list().then(function (items) {
      if (!items.length) {
        var empty = document.createElement('li');
        empty.className = 'muted small';
        empty.textContent = 'No drafts saved yet.';
        el.draftList.appendChild(empty);
        return;
      }
      items.forEach(function (item) {
        var li = document.createElement('li');
        li.className = 'draft-item' + (item.name === LightingStore.current ? ' active' : '');

        var name = document.createElement('span');
        name.className = 'd-name';
        name.textContent = item.name;
        li.appendChild(name);

        var meta = document.createElement('span');
        meta.className = 'd-meta';
        meta.textContent = U.fmtTime(item.updated) + ' - ' + U.fmtBytes(item.bytes);
        li.appendChild(meta);

        li.appendChild(button('Open', 'Open this draft', function () { loadDraft(item.name); }));
        li.appendChild(button('Overwrite', 'Replace it with the current work', function () { saveDraft(item.name, true); }));
        li.appendChild(button('✕', 'Delete', function () {
          if (!window.confirm('Delete draft "' + item.name + '"?')) return;
          LightingStore.remove(item.name).then(function () {
            if (LightingStore.current === item.name) LightingStore.setActive('');
            refreshDrafts();
            toast('Draft deleted');
          }).catch(function (err) { toast('Delete failed: ' + err.message, 'error'); });
        }));
        el.draftList.appendChild(li);
      });
    }).catch(function (err) {
      toast('Could not list drafts: ' + err.message, 'error');
    });
  }

  function saveDraft(name, overwrite) {
    name = U.slugify(name || suggestDraftName());
    if (!name) return;
    if (!overwrite) {
      LightingStore.list().then(function (items) {
        if (items.some(function (i) { return i.name === name; }) &&
            !window.confirm('A draft called "' + name + '" exists. Overwrite it?')) {
          return;
        }
        doSave(name);
      });
      return;
    }
    doSave(name);
  }

  function doSave(name) {
    LightingStore.save(name, snapshot(LightingStore.mode === 'server'))
      .then(function () {
        LightingStore.current = name;
        LightingStore.setActive(name);
        LightingStore.saveSession(name, snapshot(true));
        refreshDrafts();
        toast('Saved draft "' + name + '"', 'ok');
      })
      .catch(function (err) { toast('Save failed: ' + err.message, 'error'); });
  }

  function loadDraft(name) {
    LightingStore.load(name)
      .then(function (raw) {
        state = LightingState.migrate(raw);
        LightingStore.current = name;
        LightingStore.setActive(name);
        el.draftsDialog.close();
        render();
        markDirty();
        toast('Opened "' + name + '"', 'ok');
      })
      .catch(function (err) { toast('Could not open draft: ' + err.message, 'error'); });
  }

  function newDraft() {
    if (!window.confirm('Start a new draft? The current work stays available in the drafts list once saved.')) return;
    state = LightingState.defaultState();
    LightingStore.current = null;
    LightingStore.setActive('');
    render();
    markDirty();
    toast('New draft created');
  }

  function exportDraft() {
    var name = (LightingStore.current || suggestDraftName()) + '.draft.json';
    U.download(name, JSON.stringify(snapshot(false), null, 2), 'application/json');
    toast('Draft exported');
  }

  function importDraft(file) {
    U.readFileAsText(file).then(function (text) {
      var raw = JSON.parse(text);
      state = LightingState.migrate(raw);
      render();
      markDirty();
      toast('Imported ' + file.name, 'ok');
    }).catch(function (err) {
      toast('Import failed: ' + err.message, 'error');
    });
  }

  /* ----------------------------------------------------------------- export */

  /* Exports read the generated files, so make sure every image has been
     measured first - a downloaded dashboard should carry its aspect ratios
     even if a location was never opened. */
  function withMeasuredImages(action) {
    return measureImages().then(function () { action(); });
  }

  function downloadAll() {
    withMeasuredImages(function () {
      if (!output.files.length) {
        toast('Nothing to download', 'error');
        return;
      }
      output.files.forEach(function (file, index) {
        setTimeout(function () {
          U.download(file.name, file.content, /\.ya?ml$/.test(file.name) ? 'text/yaml;charset=utf-8' : 'text/plain;charset=utf-8');
        }, index * 250);
      });
      toast('Downloading ' + output.files.length + ' files', 'ok');
    });
  }

  /* ------------------------------------------------------------------ binds */

  function bindGlobals() {
    document.querySelectorAll('[data-bind]').forEach(function (input) {
      if (input.tagName === 'SELECT') input.dataset.numeric = '1';
      input.addEventListener('input', function () {
        if (suppressBind) return;
        var path = input.dataset.bind;
        var value;
        if (input.type === 'checkbox') {
          value = input.checked;
        } else if (input.type === 'number' || input.dataset.numeric === '1') {
          value = Number(input.value);
          if (!isFinite(value)) return;
        } else {
          value = input.value;
          if (path === 'meta.slug') value = U.slugify(value);
        }
        setPath(state, path, value);
        if (path === 'options.iconSize') {
          var loc = LightingState.activeLocation(state);
          if (loc) loc.icons.forEach(function (icon) { icon.size = value; });
        }
        if (path === 'options.showNames') LightingCanvas.setShowNames(value);
        render();
        markDirty();
      });
    });
  }

  function bindCanvas() {
    var canvas = LightingCanvas.element();

    canvas.addEventListener('pointerdown', function () {
      if (document.activeElement !== canvas) canvas.focus();
    });

    document.getElementById('fileImage').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) uploadImage(file);
      event.target.value = '';
    });

    el.imagePath.addEventListener('input', function () {
      var loc = LightingState.activeLocation(state);
      if (!loc) return;
      loc.imagePath = el.imagePath.value.trim();
      loc.imageRatio = 0;
      markDirty();
      renderCanvasSoon();
    });

    el.existingImages.addEventListener('change', function () {
      var value = el.existingImages.value;
      el.existingImages.value = '';
      if (value) useRepoImage(value);
    });

    document.getElementById('btnAutoPlace').addEventListener('click', autoPlace);
    document.getElementById('btnDistribute').addEventListener('click', gridLayout);
    el.btnAddIcon.addEventListener('click', addIcon);
    document.getElementById('btnAddLocation').addEventListener('click', addLocation);

    el.btnIconMinus.addEventListener('click', function () {
      var loc = LightingState.activeLocation(state);
      if (!loc) return;
      setIconCount(loc.iconCount - 1);
      syncCountField();
    });
    el.btnIconPlus.addEventListener('click', function () {
      var loc = LightingState.activeLocation(state);
      if (!loc) return;
      setIconCount(loc.iconCount + 1);
      syncCountField();
    });
    /* Only on change, never on every keystroke: typing "12" would otherwise
       pass through 1 and wipe the view down to a single icon. */
    el.iconCount.addEventListener('change', function () {
      var loc = LightingState.activeLocation(state);
      if (!loc) return;
      setIconCount(el.iconCount.value);
      el.iconCount.value = loc.iconCount;
    });

    window.addEventListener('resize', U.debounce(fitCanvas, 200));
  }

  function bindInspector() {
    LightingInspector.init({
      onEdit: function (reason, structural) {
        if (structural) {
          render();
        } else {
          renderChips();
          LightingCanvas.render(LightingState.activeLocation(state), state.activeIcon, state.options.snap);
        }
        /* A new base image path needs its ratio measured again. */
        if (reason === 'imgpath') measureImages();
        markDirty();
      },
      onModeChange: function () { renderInspector(); }
    });
  }

  /* ------------------------------------------------- inspector / YAML split */

  var SPLIT_KEY = 'lighting-dashboard-builder.inspector-max.v1';
  var SPLIT_DEFAULT = 66;          /* percent of the column for the inspector */
  var SPLIT_MIN = 25;
  var SPLIT_MAX = 80;

  /* The panes are sized by a flex ratio, so a percentage share is converted
     into one: share : (100 - share). */
  function shareToGrow(share) {
    return share / Math.max(1, 100 - share);
  }

  function setInspectorShare(percent) {
    var value = U.clamp(Math.round(percent), SPLIT_MIN, SPLIT_MAX);
    document.getElementById('panelRight').style.setProperty('--inspector-grow', shareToGrow(value).toFixed(3));
    try { window.localStorage.setItem(SPLIT_KEY, String(value)); } catch (err) { /* ignore */ }
    return value;
  }

  function currentInspectorShare() {
    var panel = document.getElementById('panelRight');
    if (!panel) return SPLIT_DEFAULT;
    var grow = parseFloat(panel.style.getPropertyValue('--inspector-grow'));
    if (!isFinite(grow) || grow <= 0) return SPLIT_DEFAULT;
    return Math.round((grow / (grow + 1)) * 100);
  }

  function restoreInspectorShare() {
    var saved = null;
    try { saved = window.localStorage.getItem(SPLIT_KEY); } catch (err) { /* ignore */ }
    if (saved != null && saved !== '') setInspectorShare(Number(saved));
  }

  function bindSplitter() {
    var handle = document.getElementById('inspectorSplitter');
    var panel = document.getElementById('panelRight');
    if (!handle || !panel) return;

    function shareFromEvent(event) {
      var rect = panel.getBoundingClientRect();
      var splitter = handle.getBoundingClientRect();
      var grip = splitter.height || 0;
      var usable = rect.height - grip;
      if (usable <= 0) return SPLIT_DEFAULT;
      return ((event.clientY - rect.top - grip / 2) / usable) * 100;
    }

    handle.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      handle.classList.add('dragging');
      handle.setPointerCapture(event.pointerId);
      setInspectorShare(shareFromEvent(event));

      function onMove(moveEvent) { setInspectorShare(shareFromEvent(moveEvent)); }
      function onUp(upEvent) {
        handle.classList.remove('dragging');
        handle.releasePointerCapture && handle.releasePointerCapture(upEvent.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
      }
      /* The handle has pointer capture, but tracking on window too keeps the
         drag alive if the pointer leaves the 9px handle. */
      document.body.style.userSelect = 'none';
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    handle.addEventListener('dblclick', function () {
      setInspectorShare(SPLIT_DEFAULT);
      toast('Inspector back to ' + SPLIT_DEFAULT + '%');
    });

    /* Keyboard resize so the split is reachable without a mouse. */
    handle.addEventListener('keydown', function (event) {
      var current = currentInspectorShare();
      if (event.key === 'ArrowUp') setInspectorShare(current + 2);
      else if (event.key === 'ArrowDown') setInspectorShare(current - 2);
      else if (event.key === 'Home') setInspectorShare(SPLIT_DEFAULT);
      else return;
      event.preventDefault();
    });

    restoreInspectorShare();
  }

  function bindToolbar() {
    document.getElementById('btnNew').addEventListener('click', newDraft);
    document.getElementById('btnDrafts').addEventListener('click', openDrafts);
    document.getElementById('btnExportDraft').addEventListener('click', exportDraft);
    document.getElementById('btnImport').addEventListener('click', function () {
      document.getElementById('fileImport').click();
    });
    document.getElementById('fileImport').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) importDraft(file);
      event.target.value = '';
    });
    document.getElementById('btnDownloadAll').addEventListener('click', downloadAll);
    document.getElementById('btnDownload').addEventListener('click', function () {
      withMeasuredImages(function () {
        var file = output.files.filter(function (f) { return f.name === activeFile; })[0];
        if (!file) return;
        U.download(file.name, file.content, /\.ya?ml$/.test(file.name) ? 'text/yaml;charset=utf-8' : 'text/plain;charset=utf-8');
      });
    });
    document.getElementById('btnCopy').addEventListener('click', function () {
      withMeasuredImages(function () {
        var file = output.files.filter(function (f) { return f.name === activeFile; })[0];
        if (!file) return;
        U.copyText(file.content)
          .then(function () { toast('Copied ' + file.name, 'ok'); })
          .catch(function () { toast('Copy failed - select the text instead', 'error'); });
      });
    });
    el.filePicker.addEventListener('change', function () {
      activeFile = el.filePicker.value;
      refreshOutput();
    });
    document.getElementById('btnSaveDraft').addEventListener('click', function () {
      saveDraft(el.draftName.value, false);
    });
    document.getElementById('btnOverwriteDraft').addEventListener('click', function () {
      var name = el.draftName.value || LightingStore.current;
      if (!name) {
        toast('Type a draft name first', 'error');
        return;
      }
      saveDraft(name, true);
    });

    document.addEventListener('keydown', function (event) {
      if (event.target.matches('input, textarea, select')) return;
      if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        openDrafts();
      }
    });
  }

  /* ------------------------------------------------------------------- boot */

  function loadRepoImages() {
    LightingStore.baseImages().then(function (items) {
      if (!items.length) return;
      items.forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = item.name;
        el.existingImages.appendChild(opt);
      });
    });
  }

  function updateStorageBadge() {
    if (LightingStore.mode === 'server') {
      el.storageBadge.className = 'badge badge-ok';
      el.storageBadge.textContent = 'drafts: temp/ (server.py)';
      el.storageBadge.title = 'Running against the bundled server. Drafts and images are written to temp/.';
    } else if (LightingStore.mode === 'local') {
      el.storageBadge.className = 'badge badge-warn';
      el.storageBadge.textContent = 'drafts: browser storage';
      el.storageBadge.title = 'server.py is not running, so drafts are kept in this browser only. Run "python3 server.py" for file based drafts and image uploads.';
    } else {
      el.storageBadge.className = 'badge badge-err';
      el.storageBadge.textContent = 'no draft storage';
    }
  }

  function boot() {
    LightingCanvas.init({
      onChange: function (info) {
        if (!state) return;
        var loc = LightingState.activeLocation(state);
        /* The canvas drops icons itself on Delete, so the count has to follow. */
        if (loc && info && info.removed) loc.iconCount = loc.icons.length;
        renderCanvas();
        renderChips();
        renderInspector();
        markDirty();
      },
      onSelect: function (iconId) {
        if (!state) return;
        if (state.activeIcon !== iconId) {
          state.activeIcon = iconId;
          renderChips();
          renderCanvas();
          renderInspector();
        }
      },
      onStatus: function (text) { el.canvasStatus.textContent = text; }
    });

    bindGlobals();
    bindCanvas();
    bindInspector();
    bindToolbar();
    bindHa();
    bindSplitter();

    LightingStore.probe().then(function () {
      updateStorageBadge();
      loadRepoImages();
      var session = LightingStore.loadSession();
      if (session && session.state) {
        state = LightingState.migrate(session.state);
        LightingStore.current = session.name || null;
        toast('Restored your last session' + (session.name ? ' (' + session.name + ')' : ''));
      } else {
        state = LightingState.defaultState();
      }
      render();
      /* The connection is read once at start up so the entity pickers know
         on first paint whether they can offer anything. */
      LightingHA.status().then(function () {
        updateHaBadge();
        if (state) renderInspector();
      });
      /* Measure every floor plan so the export can letterbox each one. */
      measureImages();
    }).catch(function (err) {
      console.error(err);
      state = LightingState.defaultState();
      render();
      toast('Storage probe failed: ' + err.message, 'error');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
