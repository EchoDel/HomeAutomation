/* Draft persistence.
   Primary backend: the bundled server.py (files on disk under temp/).
   Fallback: localStorage, so the page still works when opened straight from
   the filesystem (file://) without the server running. */
(function (global) {
  'use strict';

  var LS_KEY = 'lighting-dashboard-builder.drafts.v1';
  var LS_ACTIVE = 'lighting-dashboard-builder.active.v1';

  var Store = {
    mode: 'unknown',      // 'server' | 'local' | 'none'
    serverDrafts: false,  // server stores images too
    current: null,        // name of the draft last saved/loaded
    dirty: false
  };

  /* ---------------------------------------------------------------- server */

  function api(method, path, body, isBinary) {
    var opts = { method: method, headers: {} };
    if (body != null) {
      opts.headers['Content-Type'] = isBinary ? 'application/octet-stream' : 'application/json';
      opts.body = isBinary ? body : JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error('HTTP ' + res.status + (text ? ': ' + text.slice(0, 160) : ''));
        });
      }
      return res.status === 204 ? null : res.json();
    });
  }

  Store.probe = function () {
    return fetch('api/health', { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('bad status')); })
      .then(function (info) {
        Store.mode = 'server';
        Store.serverDrafts = true;
        Store.info = info;
        return info;
      })
      .catch(function () {
        Store.mode = localAvailable() ? 'local' : 'none';
        Store.info = null;
        return null;
      });
  };

  Store.list = function () {
    if (Store.mode === 'server') {
      return api('GET', 'api/drafts').then(function (items) { return items || []; })
        .catch(function () { return localList(); });
    }
    return Promise.resolve(localList());
  };

  Store.load = function (name) {
    if (Store.mode === 'server') {
      return api('GET', 'api/draft?name=' + encodeURIComponent(name))
        .then(function (data) { return typeof data === 'string' ? JSON.parse(data) : data; });
    }
    var drafts = localAll();
    if (!drafts[name]) return Promise.reject(new Error('draft not found: ' + name));
    return Promise.resolve(JSON.parse(drafts[name].data));
  };

  Store.save = function (name, state) {
    var payload = JSON.stringify(state, null, 2);
    if (Store.mode === 'server') {
      return api('PUT', 'api/draft?name=' + encodeURIComponent(name), payload, true)
        .then(function (res) { return (res && res.name) || name; });
    }
    var drafts = localAll();
    drafts[name] = {
      name: name,
      updated: new Date().toISOString(),
      bytes: payload.length,
      data: payload
    };
    localWrite(drafts);
    return Promise.resolve(name);
  };

  Store.remove = function (name) {
    if (Store.mode === 'server') {
      return api('DELETE', 'api/draft?name=' + encodeURIComponent(name))
        .then(function () { return true; })
        .catch(function () { return localRemove(name); });
    }
    return Promise.resolve(localRemove(name));
  };

  Store.baseImages = function () {
    if (Store.mode !== 'server') return Promise.resolve([]);
    return api('GET', 'api/base-images').then(function (items) { return items || []; })
      .catch(function () { return []; });
  };

  /* Upload a base image; returns { path, file, dataUrl }.
     Without the server the image is kept inline (draft only) and the user is
     told to set the /local path by hand. */
  Store.uploadImage = function (file) {
    var dataUrlPromise = U.readFileAsDataUrl(file);
    if (Store.mode !== 'server') {
      return dataUrlPromise.then(function (dataUrl) {
        return { path: '', file: '', dataUrl: dataUrl, uploaded: false };
      });
    }
    return dataUrlPromise.then(function (dataUrl) {
      var base = file.name.replace(/\.[^.]+$/, '') || 'base';
      return fetch('api/image?name=' + encodeURIComponent(base), {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file
      }).then(function (res) {
        if (!res.ok) throw new Error('image upload failed (HTTP ' + res.status + ')');
        return res.json();
      }).then(function (info) {
        return { path: info.path, file: info.file, dataUrl: dataUrl, uploaded: true };
      });
    });
  };

  /* Resolve a stored /local path back to something the canvas can display.
     An uploaded image has its own file in temp/images; a path typed by hand (or
     one of the defaults) is looked up by the server in temp/images and in the
     repo folder, so the canvas can preview it too. */
  Store.imageUrl = function (loc) {
    if (loc.imageDataUrl) return Promise.resolve(loc.imageDataUrl);
    if (Store.mode !== 'server') return Promise.resolve('');
    var query = loc.imageFile
      ? 'api/image?name=' + encodeURIComponent(loc.imageFile)
      : (loc.imagePath
        ? 'api/image?path=' + encodeURIComponent(loc.imagePath)
        : '');
    if (!query) return Promise.resolve('');
    return fetch(query, { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.blob() : null; })
      .then(function (blob) { return blob ? URL.createObjectURL(blob) : ''; })
      .catch(function () { return ''; });
  };

  Store.forgetImage = function (fileName) {
    if (Store.mode !== 'server' || !fileName) return Promise.resolve();
    return fetch('api/image?name=' + encodeURIComponent(fileName), { method: 'DELETE' })
      .catch(function () { /* best effort */ });
  };

  /* ------------------------------------------------------------ localStore */

  function localAvailable() {
    try {
      window.localStorage.setItem('__t', '1');
      window.localStorage.removeItem('__t');
      return true;
    } catch (err) {
      return false;
    }
  }

  function localAll() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function localWrite(drafts) {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(drafts));
      return true;
    } catch (err) {
      Store.mode = 'none';
      throw new Error('localStorage is full or unavailable: ' + err.message);
    }
  }

  function localList() {
    var drafts = localAll();
    return Object.keys(drafts).map(function (key) {
      return {
        name: key,
        updated: drafts[key].updated,
        bytes: drafts[key].bytes
      };
    }).sort(function (a, b) {
      return String(b.updated || '').localeCompare(String(a.updated || ''));
    });
  }

  function localRemove(name) {
    var drafts = localAll();
    delete drafts[name];
    localWrite(drafts);
    return true;
  }

  Store.localKeys = localAll;
  Store.setActive = function (name) {
    try { window.localStorage.setItem(LS_ACTIVE, name || ''); } catch (err) { /* ignore */ }
  };
  Store.getActive = function () {
    try { return window.localStorage.getItem(LS_ACTIVE) || ''; } catch (err) { return ''; }
  };

  /* Session persistence so a refresh does not lose work. */
  Store.saveSession = function (name, state) {
    try {
      window.localStorage.setItem(LS_ACTIVE, name || '');
      window.sessionStorage.setItem(LS_ACTIVE, JSON.stringify({ name: name, state: state }));
    } catch (err) { /* ignore quota errors */ }
  };

  Store.loadSession = function () {
    try {
      var raw = window.sessionStorage.getItem(LS_ACTIVE);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.state ? parsed : null;
    } catch (err) {
      return null;
    }
  };

  global.LightingStore = Store;
})(window);
