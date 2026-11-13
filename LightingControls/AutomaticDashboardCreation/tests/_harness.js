/* Shared jsdom harness: boots the real app scripts against the real index.html
   and hands back the window plus a few helpers.

   The app has no dependencies; this needs jsdom (npm install in this folder). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const APP = path.resolve(__dirname, '..');
const BASE = 'http://127.0.0.1:8765';
/* Read the script tags out of index.html, so the harness cannot fall behind
   the app whenever a new file is added. */
const SCRIPTS = Array.from(
  fs.readFileSync(path.join(APP, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g),
  m => m[1]
);
/* jsdom has no layout, so give the hotspots a believable floor plan. */
const BOX = { width: 760, height: 980 };

function boot(opts) {
  opts = opts || {};
  const scripts = opts.scripts || SCRIPTS;
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.stack || e.message)));
  const dom = new JSDOM(fs.readFileSync(path.join(APP, 'index.html'), 'utf8'), {
    url: BASE + '/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc
  });
  const win = dom.window;
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  win.Image = class { set src(v) {} };
  if (!win.URL.createObjectURL) win.URL.createObjectURL = () => 'blob:x';
  if (opts.offline) {
    /* Prove the app works with no network at all. */
    win.fetch = () => Promise.reject(new Error('offline'));
  } else if (opts.fetch) {
    /* A canned Home Assistant / server reply, so connection tests are stable
       whatever happens to be listening on the real ports. */
    win.fetch = opts.fetch;
  } else {
    win.fetch = (...a) => fetch(new URL(a[0], BASE + '/'), a[1]);
  }
  win.confirm = () => true;
  win.HTMLElement.prototype.setPointerCapture = function () {};
  win.HTMLElement.prototype.releasePointerCapture = function () {};
  if (opts.box !== false) {
    Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { value: BOX.width, configurable: true });
    Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { value: BOX.height, configurable: true });
  }
  for (const f of scripts) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), dom.getInternalVMContext(), { filename: f });
  }
  const $ = s => win.document.querySelector(s);
  const $$ = s => Array.from(win.document.querySelectorAll(s));
  const tick = (ms = 80) => new Promise(r => setTimeout(r, ms));
  return { dom, win, $, $$, tick, errors, APP, BASE, BOX };
}

/* Counting checker, so a summary line reports the real number of checks. */
function checker() {
  const results = [];
  const say = (ok, label) => {
    results.push(ok);
    if (!ok) process.exitCode = 1;
    console.log((ok ? '  pass  ' : '  FAIL  ') + label);
  };
  const done = name => {
    const bad = results.filter(r => !r).length;
    console.log(bad
      ? '\nRESULT: ' + name + ' - ' + bad + ' of ' + results.length + ' checks FAILED'
      : '\nRESULT: ' + name + ' - all ' + results.length + ' checks passed');
    return bad;
  };
  return { say, done };
}

module.exports = { boot, checker, APP, BASE, BOX, SCRIPTS };
