# Parses every file test-yaml.js generated with a real YAML parser, then plays
# Home Assistant's own picture-elements style code over every element to prove
# the generated `style` blocks would actually reach the DOM.
# Run: python3 check-yaml.py   (needs pyyaml)
import pathlib
import sys

try:
    import yaml
except ImportError:
    print("pyyaml is not installed: pip install pyyaml")
    sys.exit(3)


class HomeAssistant(yaml.SafeLoader):
    """!secret is a Home Assistant tag, not a mistake in the output."""


HomeAssistant.add_constructor("!secret", lambda loader, node: {"!secret": loader.construct_scalar(node)})

root = pathlib.Path(__file__).parent / "yaml-out"
files = sorted(root.rglob("*.yaml"))
if not files:
    print("no yaml found - run: node test-yaml.js")
    sys.exit(3)

bad = []
secrets = 0
documents = []
for path in files:
    text = path.read_text()
    secrets += text.count("!secret")
    try:
        documents.append((path, list(yaml.load_all(text, Loader=HomeAssistant))))
    except Exception as exc:  # noqa: BLE001
        bad.append((path.relative_to(root), str(exc).splitlines()[0]))

for path, err in bad:
    print("  FAIL", path, err)
print(f"parsed {len(files)} yaml files, {secrets} !secret refs, {len(bad)} failures")

# --- Home Assistant's picture-elements style handling -------------------------
# Mirrors create-styled-hui-element.ts: Object.keys(style) then setProperty().
# A block scalar (style: |-) is a string, so Object.keys() returns character
# indices, setProperty("0", "l") does nothing, and the element keeps
# top:auto/left:auto -> it lands at the card's top-left corner and is clipped
# away by ha-card's overflow:hidden. Only a mapping survives.


def ha_applied_style(style):
    if isinstance(style, dict):
        return {str(k): v for k, v in style.items()}
    return {}


ANCHORED = ("state-icon", "state-label", "image", "state-badge", "icon")
problems = []
elements = 0


def check_element(element, where):
    global elements
    elements += 1
    if not isinstance(element, dict):
        problems.append(f"{where}: not a mapping")
        return
    style = element.get("style")
    applied = ha_applied_style(style)
    if not applied:
        problems.append(
            f"{where}: style is {type(style).__name__}, Home Assistant would apply nothing"
        )
        return
    if element.get("type") in ANCHORED:
        for prop in ("left", "top"):
            if prop not in applied:
                problems.append(f"{where}: no {prop} - element would sit at the top-left and be clipped")
    card_mod = element.get("card_mod")
    if card_mod is not None:
        mod_style = card_mod.get("style") if isinstance(card_mod, dict) else None
        if not isinstance(mod_style, str):
            problems.append(f"{where}: card_mod.style must be a string, got {type(mod_style).__name__}")


def walk(node, where):
    if isinstance(node, list):
        for index, item in enumerate(node):
            walk(item, f"{where}[{index}]")
        return
    if not isinstance(node, dict):
        return
    if node.get("type") == "picture-elements":
        card_mod = node.get("card_mod")
        if card_mod is not None:
            # The card-level block (the fit/letterbox CSS) is a real card-mod
            # style, so it must be a plain string - card-mod injects it into
            # this card's shadow root, where #root lives.
            mod_style = card_mod.get("style") if isinstance(card_mod, dict) else None
            if not isinstance(mod_style, str):
                problems.append(
                    f"{where}: card-level card_mod.style must be a string, "
                    f"got {type(mod_style).__name__}"
                )
        elements_list = node.get("elements")
        if not isinstance(elements_list, list):
            problems.append(f"{where}: picture-elements without an elements list")
        else:
            for index, element in enumerate(elements_list):
                kind = element.get("type", "?") if isinstance(element, dict) else "?"
                check_element(element, f"{where}.elements[{index}] ({kind})")
            return
    for key in ("cards", "views", "sections", "elements"):
        if key in node:
            walk(node[key], f"{where}.{key}")


for path, docs in documents:
    for index, doc in enumerate(docs):
        if isinstance(doc, dict) and "views" in doc:
            walk(doc["views"], path.name)

# --- view layout --------------------------------------------------------------
# A `type: sections` view renders cards only under a `sections:` grid; a
# top-level `cards:` key there is ignored at runtime (it is the editor's
# "imported cards" list). A panel view takes cards directly and makes its one
# card fill the screen - that is what the floor plan views use.
for path, docs in documents:
    for doc in docs:
        if not isinstance(doc, dict) or "views" not in doc:
            continue
        for index, view in enumerate(doc["views"] or []):
            if not isinstance(view, dict):
                continue
            where = f"{path.name}.views[{index}]"
            if view.get("type") == "sections":
                if "cards" in view:
                    problems.append(
                        f"{where}: sections view has a top-level cards key - "
                        "Home Assistant ignores it at runtime, put them under sections:"
                    )
                if "sections" not in view:
                    problems.append(f"{where}: sections view without a sections list")
            elif view.get("panel") is True or view.get("type") == "panel":
                if "sections" in view:
                    problems.append(f"{where}: panel view must list cards directly, not sections:")
                if "cards" not in view:
                    problems.append(f"{where}: panel view without a cards list")

if problems:
    for problem in problems:
        print("  FAIL", problem)
print(f"checked {elements} picture-elements elements against Home Assistant's style code")

ok = not bad and not problems
print("RESULT: all parse" if ok else f"RESULT: {len(bad)} parse failures, {len(problems)} element problems")
sys.exit(0 if ok else 1)
