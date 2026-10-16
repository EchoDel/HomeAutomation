# Lighting Dashboard Builder

A small, dependency-free webpage for building the Home Assistant lighting dashboards in
this repo. Drop a floor plan on the canvas, place the light icons on it, fill in the
entities, and download ready-to-install YAML.

Nothing here needs npm, a build step or a network connection. `server.py` is plain
Python 3 standard library; the page is plain HTML, CSS and JavaScript.

## Running it

```bash
cd LightingControls/AutomaticDashboardCreation
python3 server.py
```

Then open <http://127.0.0.1:8765/>.

The server is needed for three things: saving drafts, storing uploaded images and
reading your entity list from Home Assistant.
Opening `index.html` directly still works, but drafts then live in the browser's
`localStorage` and images are kept in memory for the session only. The badge in the top
right always says which mode you are in.

| Option | Meaning |
| --- | --- |
| `--host` | interface to bind (default `127.0.0.1`, localhost only) |
| `--port` | port (default `8765`) |
| `--verbose` | log every request |

## How to use it

1. **Locations** (left) - add one view per floor or room, e.g. *Floor 1*, *Attic*.
2. **Base image** (canvas toolbar) - upload a floor plan, pick one of the PNGs already
   in `LightingControls/`, or type a path you already serve. Auto-place drops the icons
   on a spread-out grid if you would rather not drag them by hand.
3. **Icons** - set the count from 1 to 15 with the stepper, drag each icon onto the
   plan, click one to edit it. Arrow keys nudge the selected icon, `Delete` removes it.
   Lowering the count asks before it removes anything.
4. **Inspector** (right) - the *Location* tab holds the view, image and automation
   options and the entity field for the selected fixture; the *Tuya Smart Plus* tab
   holds per-device details for fixtures that Home Assistant cannot already see, and
   can be ignored otherwise.
5. **Download** - pick a file from the dropdown, or *Download files* to get everything.
   *Export draft* saves the editable project as JSON; *Import* loads one back.

Click **Home Assistant** in the top bar once to point the builder at your instance, and
the entity fields turn into searchable lists - see
[Using the entities you already have](#using-the-entities-you-already-have).

Changes autosave. Drafts are listed under **Drafts** in the toolbar.

## What comes out

| File | Destination in Home Assistant |
| --- | --- |
| `dashboard.yaml` | `/config/lighting_dashboard.yaml` |
| `lighting_package.yaml` | `/config/packages/lighting.yaml` |
| `lighting_theme.yaml` | `/config/themes/lighting.yaml` |
| `lighting_secrets.yaml` | merge into `/config/secrets.yaml` - **never commit this** |
| `INSTALL.txt` | not for Home Assistant, it is the step-by-step install guide |

The dashboard is stock Lovelace: a **panel view** per location, which gives its one
`picture-elements` card the whole screen - the floor plan as an image with one
`state-icon` per light (tap toggles, hold opens the detail dialog). Icon positions are
percentages, so the same view works on a phone and on a wall panel. The "All Lights"
overview is a `sections` view of buttons and entity lists.

Because a panel view hands the card the full width, a wide floor plan would otherwise
grow taller than the browser and need a scroll. The builder measures each floor plan's
own aspect ratio - every location, at start up and again on export, straight from the
image - stores it on the location, and emits a small `card_mod` block that letterboxes
the plan: `#root` gets `aspect-ratio` matching that image and a `max-width` capped by the
height still available under the Home Assistant header, so the plan always fits the
screen - as wide as the screen allows, or as tall as it allows - and never scrolls. The
icons stay aligned because Home Assistant positions them against `#root`, which is now
the same shape as the image. Each floor keeps its own ratio (a 738x928 plan and a
535x844 plan letterbox differently). This block needs card-mod (see [Installing](#installing));
without it the plan still renders, it just may scroll on a very wide screen.

The package adds an `input_boolean` enable helper per fixture (turn one off and the
all-on / all-off scripts skip it), a group per location
(`group.lighting_floor_1`, written in the id-keyed form Home Assistant's `group`
integration expects), and the scripts and automations you ticked - sunset, sunrise,
motion and welcome-home.

When you pick a Tuya mode, the `tuya` and `tuya_local` blocks are generated at the top
of the package with a comment saying so, because packages cannot own them: move them
into `/config/configuration.yaml`. Local keys are always written as `!secret`
references, so they stay out of the package. With the default *no Tuya config* mode,
neither block is written and there is nothing to move.

If Home Assistant refuses the package with
`integration 'group' cannot be merged, expected a dict`, the copy you installed was
made by an older build that wrote `group:` as a list. Open the draft, export
`lighting_package.yaml` again and replace the installed file, then check the
configuration and restart - no manual editing needed.

### card-mod (the icon colours)

Two things in the export use [card-mod](https://github.com/thomasloven/lovelace-card-mod)
by thomasloven: the `card_mod:` block on each icon (per-light accent colour and the
dim-when-off effect) and the custom theme. It is optional - without it the dashboard
still renders and the icons keep Home Assistant's normal state colours.

Install it once through **HACS**:

1. HACS &rarr; search **card-mod** &rarr; **Download** &rarr; restart Home Assistant.
   HACS registers the dashboard resource for you.
2. Optionally also load it as a frontend module - it is faster and it covers
   non-dashboard panels. Copy the exact URL HACS shows under
   **Settings &rarr; Dashboards &rarr; Resources** into `configuration.yaml`:

   ```yaml
   frontend:
     extra_module_url:
       - /hacsfiles/lovelace-card-mod/card-mod.js?hacstag=00000000000
   ```

   The `hacstag` must match in both places; loading two different versions prints
   `CARD-MOD ... already patched by ...` in the browser console.

card-mod colours an icon through the CSS variables `--card-mod-icon-color` and
`--card-mod-icon-dim`, which is why the generated icons use those rather than
`--state-icon-color` (with `state_color: true`, Home Assistant writes an inline
`color` that wins over `--state-icon-color`, so the accent colour would never show).
It behaves the same in Firefox and Chrome; if a change does not appear, hard-reload
(`Ctrl-Shift-R`) - both Home Assistant and card-mod cache aggressively.

To remove the dependency entirely, delete every `card_mod:` block from
`dashboard.yaml` and switch theme generation off.

## Adding the dashboard through the UI instead of a config file

Yes. The dashboard does not need a restart or a `configuration.yaml` entry:
`dashboard.yaml` is exactly what the Lovelace **raw configuration editor** takes -
it already starts with `views:` - so you can paste it in as-is.

1. **Settings &rarr; Dashboards &rarr; + Add Dashboard**, then choose
   **New dashboard from scratch** and give it a title, URL and icon.
2. Open the new dashboard, pick **Edit dashboard**, then the three-dot menu &rarr;
   **Raw configuration editor**.
3. Replace the starter content with the whole of `dashboard.yaml` and **Save**.

The views, floor plans and light icons are live straight away, with no restart.
This route is per-dashboard, so the sidebar entry and icon come from step 1 rather
than from the YAML.

The optional extras are the only parts that still come from a file, because Home
Assistant only loads packages and themes from `configuration.yaml`:

| Extra | How it gets loaded |
| --- | --- |
| All On / All Off buttons, automations, enable helpers (`lighting_package.yaml`) | `homeassistant: packages:` (see [What comes out](#what-comes-out)) |
| Per-light colours (`lighting_theme.yaml`) | `frontend: themes:`, or skip it and delete the `theme:` lines from the views |
| Icon accent colours + off-dim (`card_mod:`) | the [card-mod](#card-mod-the-icon-colours) module, or delete the `card_mod:` blocks |
| Floor plan images | copy to `/config/www/lighting/` (works the same whichever route you use) |

Skip the package and the plan still works - tap an icon to toggle that light, hold
it for more info. You only lose the buttons and the automations.

### If the plan loads but the icons do not

The floor plan and the icons both come from the `picture-elements` card, so they
succeed or fail together. Each floor is a `panel: true` view, which makes its one
card fill the screen. (If you ever put cards on a `sections` view instead, they
must sit inside a `sections:` grid - a top-level `cards:` key there is silently
ignored at runtime.) Check, in order:

1. **Do the entities exist?** *Developer Tools &rarr; States*, search one of the ids
   from `dashboard.yaml`. `light.floor_1_uplighter` and friends are the builder's
   placeholders - if you never picked your own, the icons have nothing to draw. Use
   the Home Assistant entity picker in the builder and export again.
2. **Was the file made by an older build?** Older exports put Jinja templates
   (`{{ ... }}`, `{% if %}`) inside the element `style`, which `picture-elements`
   does not evaluate and which makes the element fail. Export and repaste again.
   State-dependent styling now lives in a `card_mod:` block, which needs the
   [card-mod](https://github.com/thomasloven/lovelace-card-mod) frontend module
   (the custom theme needs it too). Without card-mod the icons still show - you just
   lose the per-light colours and the dimming of "off" lights. You can delete the
   `card_mod:` blocks to be sure.
3. **Look at the errors.** Browser console (F12) and *Settings &rarr; System &rarr;
   Logs* both report a card that failed to configure.
4. **Isolate it.** Paste this one-icon card on its own; if it appears, the card and
   the image path are fine and the problem is the entity id:

   ```yaml
   type: picture-elements
   image: /local/lighting/floor1.png
   elements:
     - type: state-icon
       entity: light.your_light
       style:
         top: 20%
         left: 20%
   ```

## Using the entities you already have

Smart Life / Tuya plugs, Matter lights, Thread bulbs, Zigbee strips - if Home Assistant
can already see a device, the builder only needs its entity id. The dashboard drives
entities, never devices, so the integration behind them makes no difference.

To pick from what you have instead of typing ids:

1. Click **Home Assistant** in the top bar.
2. Enter your Home Assistant URL and a long lived token
   (Profile &rarr; Security &rarr; Long-lived tokens), then **Save & connect**.
3. The *Entity ID* field becomes a searchable list - type part of a name, click the
   entity you meant. The same picker is used for the motion and person entities.

What that buys you:

* Only real entities are offered: the list is read from `/api/states`, with each
  entity's current state beside it.
* An id that is not there is flagged while you are still in the builder, not after
  the YAML is installed.
* The **Domain** follows the entity id, so `switch.matter_hall_plug` is switched rather
  than dimmed, and a view made only of `light.*` entities keeps `light.turn_on` and its
  brightness handling. The fixture domains offered are `light`, `switch` and `number`.

The token is kept in `temp/ha-config.json` on this machine only, which is git-ignored.
It is never sent back to the page, never written into a draft and never written into
the generated YAML: the server holds it to read `/api/states` and nothing else. **Forget**
in the same dialog deletes it, and `curl -X DELETE /api/ha/config` does the same from a
shell.

Nothing works without a connection? Everything else does: type
`light.kitchen_pendant` by hand and the field simply has nothing to suggest.

## Tuya Smart Plus

You only need this if Home Assistant cannot already see your lights. If your fixtures
are entities in Home Assistant, the dashboard is built from their entity ids and this
whole tab can be left alone - the default mode is *none*, which generates the dashboard
and nothing else.

Pick a mode only when you want Home Assistant to reach a device itself:

| Mode | What it adds |
| --- | --- |
| *No Tuya config* (default) | Nothing. The dashboard is generated for the entity ids you entered. |
| *tuya_local - LAN* | A `tuya_local:` block per fixture, so devices are controlled over the LAN with no cloud account. |
| *tuya - cloud* | A `tuya:` block for the Smart Life / Smart Living cloud. |
| *Both* | Both blocks; `tuya_local` wins for devices it can reach locally. |

Per fixture, under the *Tuya Smart Plus* tab: device id, local key, host, protocol,
model, category, and the datapoint map (switch, brightness, colour temperature, mode).
Those fields feed the `tuya_local:` block and the `tuya_local_key_*` secrets only -
the dashboard itself never references them, so a wrong or missing device id cannot
break a view. In *both* mode `tuya_local` wins for devices it can reach locally.

## Saved work

| What | Where |
| --- | --- |
| Drafts (with `server.py`) | `temp/drafts/*.draft.json` |
| Drafts (no server) | browser `localStorage` |
| Uploaded images | `temp/images/` |
| Floor plans from the repo | read-only, from `LightingControls/` |

`temp/` is git-ignored, so drafts, images and anything containing local keys stay out of
git. The two floor plans in this repo are picked up automatically by the *Repo images*
dropdown.

Uploaded images are stored with a tidy file name, and the toast tells you to copy it to
`/config/www/lighting/` - that is the only place a `/local/lighting/...` path resolves
from.

The canvas can preview any `/local/...` path as long as the server can find a file with
that name in `temp/images/` or in `LightingControls/` (case and underscores are
ignored, so `/local/lighting/floor1.png` finds `Floor1.png`). That covers the default
paths and anything you type by hand. When nothing matches, the canvas says so instead of
showing a blank box.

## Tests

```
cd tests
npm install
npm test               # 199 checks, plus 14 server tests and every generated yaml parsed
npm run test:browser   # 36 checks in real Firefox, needs the server running
npm run test:e2e       # 8 checks, real Firefox -> server -> fake Home Assistant
```

`npm test` boots the real app in jsdom and covers placing lights (adding never
moves one already on the plan, and nothing overlaps), the artwork and text names,
the entity pickers (including a run with no Home Assistant connected), and the
generated YAML: every icon count from 1 to 15, odd names, untracked and
duplicate fixtures, that an entity id decides how the fixture is controlled, and
that Tuya data never reaches `dashboard.yaml`. It also pins the layout to what a
`sections` view will actually render: cards live under a `sections:` grid, never
as a top-level `cards:` key that Home Assistant ignores at runtime. The YAML it writes goes to
`tests/yaml-out/`, which `check-yaml.py` then parses with PyYAML
(`pip install pyyaml`) so the output is checked by a real parser, not just by
string matching. It also replays Home Assistant's own `createStyledHuiElement`
code over every generated element (341 of them) to prove the `style` blocks are
mappings that actually reach the DOM. `test_server.py` starts a stand-in Home
Assistant on a local port and runs the server's `/api/ha/*` routes against it: the
token never leaks into a response, the config file is mode 0600, and `temp/`
cannot be downloaded over HTTP.

`npm run test:browser` drives a real Firefox over the Marionette protocol, with
no browser automation packages to install. It checks that the icons paint, the
names are legible and scale with the icon size, that nothing hangs off the plan
or overlaps, that the label toggle works, and that the connection dialog opens
without writing any config. It expects the app to be served on
`http://127.0.0.1:8765/` (`python3 server.py` in this folder) and Firefox at
`/usr/bin/firefox`, or set `APP_URL` and `FIREFOX`.

`npm run test:e2e` is the whole chain at once: it starts `fake_ha.py`, opens
the builder in Firefox, saves a connection through the dialog, picks an entity
that came from that instance, checks the generated YAML, then forgets the
connection again. It refuses to run if a connection is already saved, so it
never disturbs a real setup.

The app itself has no dependencies; only the tests do.

## Regenerating a draft later

Open the draft in the builder rather than editing the YAML by hand. If you do have to
move a single icon, its `left` and `top` percentages are in the `state-icon` `style`
block of that view.
