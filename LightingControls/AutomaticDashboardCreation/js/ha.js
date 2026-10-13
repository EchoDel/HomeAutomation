/* Reading entities that already exist in Home Assistant.

   The page never talks to Home Assistant directly: it asks server.py, which
   holds the URL and long lived token on disk (temp/ha-config.json, git-ignored)
   and returns slimmed states. Nothing in here stores a token, and no entity
   list is ever written into a draft or the generated YAML. */
(function (global) {
  'use strict';

  var CACHE_MS = 20000;
  var MAX_SUGGEST = 8;

  var store = { loaded: false, configured: false, url: '', tokenSet: false, error: '' };
  var lists = {};       /* domainsKey -> { at: number, list: Array } */
  var pending = {};     /* domainsKey -> Promise */

  function readJson(res) {
    return res.text().then(function (text) {
      var data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (err) { data = {}; }
      if (!res.ok) {
        throw new Error(data.error || ('request failed with HTTP ' + res.status));
      }
      return data;
    });
  }

  function applyStatus(data) {
    store.loaded = true;
    store.configured = !!(data && data.configured);
    store.url = (data && data.url) || '';
    store.tokenSet = !!(data && data.tokenSet);
    store.error = '';
    return store;
  }

  function status(refresh) {
    if (store.loaded && !refresh) return Promise.resolve(store);
    return fetch('api/ha/status')
      .then(readJson)
      .then(applyStatus)
      .catch(function (err) {
        store.loaded = true;
        store.error = err.message;
        return store;
      });
  }

  function save(url, token) {
    return fetch('api/ha/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url, token: token })
    }).then(readJson).then(function (data) {
      lists = {};
      pending = {};
      return applyStatus(data);
    });
  }

  function clear() {
    return fetch('api/ha/config', { method: 'DELETE' })
      .then(readJson)
      .then(function (data) {
        lists = {};
        pending = {};
        return applyStatus(data || { configured: false });
      });
  }

  function connected() {
    return store.loaded && store.configured && store.tokenSet;
  }

  function keyFor(domains) {
    var list = Array.isArray(domains) ? domains.slice().sort() : [];
    return list.join(',');
  }

  /* Fetch (or reuse) the entity list for a set of domains. Never rejects for
     "not connected" - the picker simply has nothing to suggest. */
  function entities(domains, refresh) {
    var key = keyFor(domains);
    if (!connected()) return Promise.resolve([]);
    if (!refresh && lists[key] && Date.now() - lists[key].at < CACHE_MS) {
      return Promise.resolve(lists[key].list);
    }
    if (!refresh && pending[key]) return pending[key];

    var query = key ? '?domains=' + encodeURIComponent(key) : '';
    var request = fetch('api/ha/entities' + query)
      .then(readJson)
      .then(function (data) {
        var list = (data && data.entities) || [];
        lists[key] = { at: Date.now(), list: list };
        delete pending[key];
        return list;
      })
      .catch(function (err) {
        delete pending[key];
        store.error = err.message;
        throw err;
      });
    pending[key] = request;
    return request;
  }

  function loaded(domains) {
    var hit = lists[keyFor(domains)];
    return !!(hit && Date.now() - hit.at < CACHE_MS);
  }

  function domainOf(id) {
    return String(id || '').split('.')[0];
  }

  /* Synchronous suggestions over whatever has been fetched already. Ordered:
     exact id, id prefix, name, then anything else containing the text. */
  function query(text, domains, limit) {
    var key = keyFor(domains);
    var hit = lists[key];
    if (!hit) return [];
    var needle = String(text || '').trim().toLowerCase();
    var allowed = key ? key.split(',') : null;
    var pool = hit.list.filter(function (entity) {
      if (!allowed) return true;
      return allowed.indexOf(entity.domain) !== -1;
    });
    if (!needle) return pool.slice(0, limit || MAX_SUGGEST);

    var exact = [], prefix = [], name = [], rest = [];
    pool.forEach(function (entity) {
      var id = entity.id.toLowerCase();
      var nameText = String(entity.name || '').toLowerCase();
      if (id === needle) exact.push(entity);
      else if (id.indexOf(needle) === 0 || id.indexOf('.' + needle) !== -1) prefix.push(entity);
      else if (nameText.indexOf(needle) !== -1) name.push(entity);
      else if (id.indexOf(needle) !== -1) rest.push(entity);
    });
    return exact.concat(prefix).concat(name).concat(rest).slice(0, limit || MAX_SUGGEST);
  }

  function find(id, domains) {
    var wanted = String(id || '');
    var key = keyFor(domains);
    var hit = lists[key];
    if (!hit) return null;
    for (var i = 0; i < hit.list.length; i += 1) {
      if (hit.list[i].id === wanted) return hit.list[i];
    }
    return null;
  }

  /* Short state word for a suggestion row: "on", "off", "42" or the raw state. */
  function stateWord(entity) {
    if (!entity) return '';
    var state = String(entity.state == null ? '' : entity.state);
    if (entity.domain === 'number') return state;
    if (state === 'on') return 'on';
    if (state === 'off') return 'off';
    if (state === 'open' || state === 'closed') return state;
    if (state === 'unavailable') return 'unavailable';
    return state.length > 14 ? state.slice(0, 13) + '…' : state;
  }

  function reset() {
    store = { loaded: false, configured: false, url: '', tokenSet: false, error: '' };
    lists = {};
    pending = {};
  }

  global.LightingHA = {
    status: status,
    save: save,
    clear: clear,
    connected: connected,
    entities: entities,
    loaded: loaded,
    query: query,
    find: find,
    domainOf: domainOf,
    stateWord: stateWord,
    reset: reset,
    /* One shared copy for the settings panel and the toolbar badge. */
    info: function () { return store; }
  };
})(window);
