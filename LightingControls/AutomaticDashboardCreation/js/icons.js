/* Icon artwork, vendored from Material Design Icons 7.4.47
   (Apache 2.0, https://pictogrammers.com/library/mdi/).

   The path data is inlined rather than loaded as image files so the builder
   keeps working offline and stays free of dependencies. Anything not listed
   here falls back to a readable abbreviation, so a name typed by hand into the
   "View icon" field still shows something. */
(function (global) {
  'use strict';

  var PATHS = {
    'ceiling-light-multiple': 'M10 11H13V6H15V11H18L22 19H6L10 11M16 20C16 21.11 15.11 22 14 22S12 21.11 12 20H16M8.21 10.11L8.76 9H11V2H9V7H6L2 15H5.76L8.21 10.11Z',
    'lamp': 'M8,2H16L20,14H4L8,2M11,15H13V20H18V22H6V20H11V15Z',
    'floor-lamp': 'M15,2L17,9H7L9,2M11,10H13V20H16V22H8V20H11V10Z',
    'ceiling-light': 'M8,9H11V4H13V9H16L20,17H4L8,9M14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18H14Z',
    'chandelier': 'M15 13.1C15 14.76 13.66 16.1 12 16.1S9 14.76 9 13.1 10.34 10.1 12 10.1 15 11.44 15 13.1M9 2V3C9 4.11 9.9 5 11 5V9.1C11.32 9.04 11.66 9 12 9S12.68 9.04 13 9.1V5C14.11 5 15 4.11 15 3V2H9M4 11.1C2.34 11.1 1 12.44 1 14.1S2.34 17.1 4 17.1 7 15.76 7 14.1 5.66 11.1 4 11.1M20 11.1C18.34 11.1 17 12.44 17 14.1S18.34 17.1 20 17.1 23 15.76 23 14.1 21.66 11.1 20 11.1M20 18.1C19.32 18.1 18.67 17.96 18.08 17.71C17.6 17.95 17.07 18.1 16.5 18.1C15.39 18.1 14.41 17.57 13.77 16.77C13.22 17 12.63 17.1 12 17.1S10.78 17 10.23 16.77C9.59 17.57 8.61 18.1 7.5 18.1C6.93 18.1 6.4 17.95 5.92 17.71C5.33 17.96 4.68 18.1 4 18.1C3.73 18.1 3.46 18.06 3.2 18C4.21 19.29 5.76 20.1 7.5 20.1C8.83 20.1 10.05 19.63 11 18.84V21.1C11 21.65 11.45 22.1 12 22.1C12.55 22.1 13 21.65 13 21.1V18.84C13.95 19.63 15.17 20.1 16.5 20.1C18.24 20.1 19.79 19.29 20.8 18C20.54 18.06 20.27 18.1 20 18.1Z',
    'spotlight-beam': 'M9,16.5L9.91,15.59L15.13,20.8L14.21,21.71L9,16.5M15.5,10L16.41,9.09L21.63,14.3L20.71,15.21L15.5,10M6.72,2.72L10.15,6.15L6.15,10.15L2.72,6.72C1.94,5.94 1.94,4.67 2.72,3.89L3.89,2.72C4.67,1.94 5.94,1.94 6.72,2.72M14.57,7.5L15.28,8.21L8.21,15.28L7.5,14.57L6.64,11.07L11.07,6.64L14.57,7.5Z',
    'led-strip': 'M2.81,8.46L14.83,20.5L15.54,19.78L16.95,21.19L18.36,19.78L16.95,18.36L18.36,16.95L19.78,18.36L21.19,16.95L19.78,15.54L20.5,14.83L8.46,2.81L2.81,8.46M5.64,8.46L8.46,5.64L17.66,14.83L14.83,17.66L5.64,8.46M7.05,8.46L8.46,9.88L9.88,8.46L8.46,7.05L7.05,8.46M9.17,10.59L10.59,12L12,10.59L10.59,9.17L9.17,10.59M11.29,12.71L12.71,14.12L14.12,12.71L12.71,11.29L11.29,12.71M13.41,14.83L14.83,16.24L16.24,14.83L14.83,13.41L13.41,14.83Z',
    'outdoor-lamp': 'M15 22H13C11.9 22 11 21.1 11 20V15H17V20C17 21.1 16.1 22 15 22M7 14H21L15 9.71V6C15 4.39 13.94 2 11 2S7 4.39 7 6C7 6.45 6.81 7 6 7H5V3H3V12H5V9H6C8.2 9 9 7.21 9 6C9 5.67 9.1 4 11 4C12.83 4 13 5.54 13 6V9.71L7 14Z',
    'power-plug': 'M16,7V3H14V7H10V3H8V7H8C7,7 6,8 6,9V14.5L9.5,18V21H14.5V18L18,14.5V9C18,8 17,7 16,7Z',
    'lightbulb': 'M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z',
    'map-marker-radius': 'M12,2C15.31,2 18,4.66 18,7.95C18,12.41 12,19 12,19C12,19 6,12.41 6,7.95C6,4.66 8.69,2 12,2M12,6A2,2 0 0,0 10,8A2,2 0 0,0 12,10A2,2 0 0,0 14,8A2,2 0 0,0 12,6M20,19C20,21.21 16.42,23 12,23C7.58,23 4,21.21 4,19C4,17.71 5.22,16.56 7.11,15.83L7.75,16.74C6.67,17.19 6,17.81 6,18.5C6,19.88 8.69,21 12,21C15.31,21 18,19.88 18,18.5C18,17.81 17.33,17.19 16.25,16.74L16.89,15.83C18.78,16.56 20,17.71 20,19Z',
    'floor-plan': 'M10,5V10H9V5H5V13H9V12H10V17H9V14H5V19H12V17H13V19H19V17H21V21H3V3H21V15H19V10H13V15H12V9H19V5H10Z'
  };

  var NS = 'http://www.w3.org/2000/svg';

  function key(name) {
    return String(name || '').trim().replace(/^mdi:/, '').toLowerCase();
  }

  function has(name) {
    return Object.prototype.hasOwnProperty.call(PATHS, key(name));
  }

  /* A readable stand-in for an icon we do not have artwork for. */
  function glyph(name) {
    return key(name).split(/[-_]/).map(function (part) {
      return part ? part[0].toUpperCase() : '';
    }).join('').slice(0, 3) || '?';
  }

  /* An inline <svg> that inherits the surrounding text colour, so a hotspot can
     tint its own icon the way it already tints the abbreviation. */
  function svg(name) {
    var data = PATHS[key(name)];
    if (!data) return null;
    var node = document.createElementNS(NS, 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('class', 'mdi mdi-' + key(name));
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', data);
    path.setAttribute('fill', 'currentColor');
    node.appendChild(path);
    return node;
  }

  /* Always returns something to put in the DOM: the real artwork when it is
     vendored, the abbreviation otherwise. */
  function node(name, className) {
    var out = svg(name);
    if (!out) {
      out = document.createElement('span');
      out.className = 'mdi-fallback' + (className ? ' ' + className : '');
      out.textContent = glyph(name);
    } else if (className) {
      out.setAttribute('class', out.getAttribute('class') + ' ' + className);
    }
    return out;
  }

  global.LightingIcons = { has: has, glyph: glyph, svg: svg, node: node };
})(window);
