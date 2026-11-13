/* Floor plan canvas: base image plus draggable icon hotspots.
   Positions are stored as percentages of the image box, so the same draft
   lines up on any screen / wall panel resolution. */
(function (global) {
  'use strict';

  var canvas = null;
  var ctx = {
    location: null,
    selectedId: null,
    snap: 0.5,
    showNames: true,
    imageUrl: '',
    onChange: function () {},
    onSelect: function () {},
    onStatus: function () {}
  };

  /* Whether each light carries its name on the plan. Kept here rather than on
     the exported object so the renderer and its callers cannot drift apart. */
  function setShowNames(value) {
    ctx.showNames = value !== false;
  }

  function mdiGlyph(name) {
    if (global.LightingIcons) return global.LightingIcons.glyph(name);
    if (!name) return '?';
    // Material Design Icons are published as "<name>.svg" on GitHub; we render
    // a readable abbreviation offline and use the real image when reachable.
    return name.replace(/^mdi:/, '').split(/[-_]/).map(function (part) {
      return part ? part[0].toUpperCase() : '';
    }).join('').slice(0, 3);
  }

  /* Real artwork when it is vendored, the abbreviation otherwise, so a hand
     typed mdi: name still shows something. */
  function iconNode(name, className) {
    if (global.LightingIcons) return global.LightingIcons.node(name, className);
    var span = document.createElement('span');
    span.className = 'mdi-fallback' + (className ? ' ' + className : '');
    span.textContent = mdiGlyph(name);
    return span;
  }

  function element(parent, tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function Canvas(options) {
    canvas = document.getElementById('canvas');
    ctx.onChange = options.onChange || function () {};
    ctx.onSelect = options.onSelect || function () {};
    ctx.onStatus = options.onStatus || function () {};

    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    canvas.addEventListener('keydown', onKeyDown);
  }

  /* ------------------------------------------------------------- rendering */

  function render(location, selectedId, snap) {
    ctx.location = location;
    ctx.selectedId = selectedId;
    ctx.snap = Number(snap) || 0;

    var hotspots = canvas.querySelectorAll('.hotspot');
    hotspots.forEach(function (node) { node.remove(); });

    var hasImage = !!(location && location.imageUrl);
    var empty = document.getElementById('canvasEmpty');
    if (empty) {
      empty.style.display = hasImage ? 'none' : 'grid';
      if (!hasImage) {
        var title = document.getElementById('canvasEmptyTitle');
        var text = document.getElementById('canvasEmptyText');
        var path = (location && location.imagePath) || '';
        if (title) {
          title.textContent = path
            ? 'No preview for ' + path
            : 'No base image yet';
        }
        if (text) {
          text.textContent = path
            ? (location && location.imageFile
              ? 'The stored copy could not be read back from the server.'
              : 'Nothing with that name in temp/images or LightingControls/. Upload the plan, pick a repo image, or correct the path.')
            : 'Upload a floor plan, pick one of the repo images, or set an existing /local/... path.';
        }
      }
    }
    canvas.classList.toggle('has-image', hasImage);

    canvas.style.backgroundImage = hasImage
      ? 'url("' + location.imageUrl.replace(/["\\]/g, '\\$&') + '")'
      : 'none';

    if (!location) return;

    var showNames = ctx.showNames;
    location.icons.forEach(function (icon) {
      var size = Math.max(18, Number(icon.size) || 48);
      var node = element(canvas, 'div', 'hotspot');
      node.dataset.iconId = icon.id;
      node.style.left = U.clamp(icon.x, 0, 100) + '%';
      node.style.top = U.clamp(icon.y, 0, 100) + '%';
      node.style.width = size + 'px';
      node.style.height = size + 'px';
      node.style.fontSize = Math.round(size * 0.5) + 'px';
      node.style.opacity = icon.hidden ? '0.35' : '1';
      if (icon.colour) node.style.color = icon.colour;
      if (icon.id === selectedId) node.classList.add('selected');
      node.title = (icon.name || 'Icon') + (icon.entity ? '\n' + icon.entity : '');
      node.setAttribute('aria-label', node.title);

      var type = LightingState.typeInfo(icon.type);
      var art = iconNode(type.icon, 'hs-art');
      art.setAttribute('title', type.label);
      node.appendChild(art);
      /* The name rides with the icon on the plan, so a light is recognisable
         without opening the inspector. */
      if (showNames && !icon.hidden) element(node, 'span', 'hs-label', icon.name || '');
      if (icon.id === selectedId) {
        element(node, 'span', 'hs-bounds',
          U.round(icon.x, 2) + '% , ' + U.round(icon.y, 2) + '%');
      }
    });
  }

  function applySnap(value) {
    if (!ctx.snap) return U.round(value, 2);
    return U.round(Math.round(value / ctx.snap) * ctx.snap, 2);
  }

  /* ---------------------------------------------------------------- events */

  function findHotspot(target) {
    var node = target && target.closest ? target.closest('.hotspot') : null;
    return node || null;
  }

  function onCanvasPointerDown(event) {
    var node = findHotspot(event.target);
    if (!node) {
      if (event.target === canvas) ctx.onSelect(null);
      return;
    }
    var iconId = node.dataset.iconId;
    ctx.onSelect(iconId);

    var loc = ctx.location;
    var icon = loc && loc.icons.filter(function (i) { return i.id === iconId; })[0];
    if (!icon) return;

    event.preventDefault();
    node.setPointerCapture(event.pointerId);
    node.classList.add('dragging');

    var rect = canvas.getBoundingClientRect();
    var offsetX = event.clientX - rect.left - (icon.x / 100) * rect.width;
    var offsetY = event.clientY - rect.top - (icon.y / 100) * rect.height;

    function onMove(moveEvent) {
      var x = ((moveEvent.clientX - rect.left - offsetX) / rect.width) * 100;
      var y = ((moveEvent.clientY - rect.top - offsetY) / rect.height) * 100;
      icon.x = applySnap(U.clamp(x, 0, 100));
      icon.y = applySnap(U.clamp(y, 0, 100));
      node.style.left = icon.x + '%';
      node.style.top = icon.y + '%';
      var bounds = node.querySelector('.hs-bounds');
      if (bounds) bounds.textContent = U.round(icon.x, 2) + '% , ' + U.round(icon.y, 2) + '%';
      ctx.onStatus('Position ' + U.round(icon.x, 2) + '%, ' + U.round(icon.y, 2) + '%');
    }

    function onUp(upEvent) {
      node.releasePointerCapture && node.releasePointerCapture(upEvent.pointerId);
      node.classList.remove('dragging');
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
      ctx.onChange({ moved: true, iconId: icon.id });
    }

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
  }

  function onKeyDown(event) {
    var loc = ctx.location;
    if (!loc) return;
    var icon = loc.icons.filter(function (i) { return i.id === ctx.selectedId; })[0];
    if (!icon) return;

    var step = event.shiftKey ? 5 : 1;
    var handled = true;
    switch (event.key) {
      case 'ArrowLeft': icon.x = applySnap(U.clamp(icon.x - step, 0, 100)); break;
      case 'ArrowRight': icon.x = applySnap(U.clamp(icon.x + step, 0, 100)); break;
      case 'ArrowUp': icon.y = applySnap(U.clamp(icon.y - step, 0, 100)); break;
      case 'ArrowDown': icon.y = applySnap(U.clamp(icon.y + step, 0, 100)); break;
      case 'Delete':
      case 'Backspace':
        loc.icons = loc.icons.filter(function (i) { return i.id !== icon.id; });
        ctx.selectedId = loc.icons.length ? loc.icons[0].id : null;
        ctx.onChange({ removed: true });
        break;
      default: handled = false;
    }
    if (handled) {
      event.preventDefault();
      ctx.onChange({ nudged: true });
      render(loc, ctx.selectedId, ctx.snap);
    }
  }

  /* Keep the box the same shape as the base image so percentage positions map
     onto the same spots on any screen / wall panel resolution. */
  function applyAspect(location, naturalWidth, naturalHeight) {
    if (!location || !naturalWidth || !naturalHeight) {
      canvas.style.width = '';
      canvas.style.height = '';
      canvas.style.backgroundSize = '';
      return;
    }
    var host = canvas.parentElement;
    var maxWidth = (host ? host.clientWidth : canvas.clientWidth) - 36;
    if (maxWidth <= 0) return;
    var targetWidth = Math.min(maxWidth, 1100);
    var targetHeight = targetWidth * (naturalHeight / naturalWidth);
    canvas.style.width = Math.round(targetWidth) + 'px';
    canvas.style.height = Math.max(260, Math.round(targetHeight)) + 'px';
    canvas.style.backgroundSize = '100% 100%';
  }

  /* The rendered box size, in pixels. Icon positions are percentages, so this is
     what turns a pixel gap into an even gap on a plan that is not square. */
  function box() {
    return {
      width: canvas ? canvas.clientWidth || canvas.offsetWidth || 0 : 0,
      height: canvas ? canvas.clientHeight || canvas.offsetHeight || 0 : 0
    };
  }

  global.LightingCanvas = {
    init: Canvas,
    render: render,
    element: function () { return canvas; },
    box: box,
    context: ctx,
    setShowNames: setShowNames,
    applyAspect: applyAspect,
    mdiGlyph: mdiGlyph,
    iconNode: iconNode
  };
})(window);
