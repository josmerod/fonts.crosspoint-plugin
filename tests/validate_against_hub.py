"""Local pre-flight for CrossPoint Plugin Hub automatic discovery.

Mirrors the literal rules the hub applies in tools/build_catalog.py
(derive_plugin_id / safe_runtime_files / normalize_version / build_entry), so
a publish can only fail on GitHub-side facts (the release and the topic).
Hermetic on purpose: no network, no dynamic execution.

Usage: python -I tests/validate_against_hub.py <payload-dir>
"""
import json
import re
import sys
from pathlib import Path

payload = Path(sys.argv[1])
PLUGIN_DIRECTORY_SUFFIX = ".crosspoint-plugin"
CONVENTIONAL_FILES = ("manifest.json", "device.json", "plugin.js", "README.md")
VERSION_RE = re.compile(r"^[vV]?(\d+\.\d+\.\d+)$")
PLUGIN_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


def normalize_version(tag: str):
    m = VERSION_RE.fullmatch(tag.strip())
    return m.group(1) if m else None


def derive_plugin_id(repo_name: str, manifest: dict):
    declared = manifest.get("name")
    if isinstance(declared, str) and PLUGIN_ID_RE.fullmatch(declared):
        return declared
    name = repo_name
    if name.lower().endswith(PLUGIN_DIRECTORY_SUFFIX):
        name = name[: -len(PLUGIN_DIRECTORY_SUFFIX)]
    name = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")
    return name if PLUGIN_ID_RE.fullmatch(name) else None


def safe_runtime_files(manifest: dict, root_names: set):
    declared = manifest.get("files")
    if declared is None:
        files = [n for n in CONVENTIONAL_FILES if n in root_names]
    elif isinstance(declared, list) and all(isinstance(i, str) for i in declared):
        files = list(dict.fromkeys(declared))
    else:
        return None
    if not files or len(files) > 64:
        return None
    for path in files:
        if not path or path.startswith("/") or "\\" in path or ".." in path.split("/") or len(path) > 180:
            return None
    if "manifest.json" not in files:
        return None
    if "device.json" not in files and "plugin.js" not in files:
        return None
    return files


repo_name = "fonts.crosspoint-plugin"
assert payload.name.endswith(PLUGIN_DIRECTORY_SUFFIX), "payload dir must end in .crosspoint-plugin"
manifest = json.loads((payload / "manifest.json").read_text(encoding="utf-8"))
root_names = {p.name for p in payload.iterdir() if p.is_file()}

# build_entry: exactly one root-level payload dir whose stem is a safe id.
plugin_id = derive_plugin_id(repo_name, manifest)
if plugin_id is None:
    fail("hub could not derive a safe plugin id")
if plugin_id != payload.name[: -len(PLUGIN_DIRECTORY_SUFFIX)]:
    fail(f"payload dir stem {payload.name!r} must equal plugin id {plugin_id!r}")

# The release tag is compared against the manifest version.
version = manifest.get("version")
if not isinstance(version, str) or normalize_version(version) != version:
    fail(f"version {version!r} is not MAJOR.MINOR.PATCH")

files = safe_runtime_files(manifest, root_names)
if files is None:
    fail("hub rejected manifest.files")
for f in files:
    if not (payload / f).is_file():
        fail(f"declared file missing on disk: {f}")

compat = manifest.get("compatibility")
if compat is not None and not isinstance(compat, dict):
    fail("compatibility must be an object")

print(f"PASS: hub rules accept {repo_name} ({plugin_id} {version})")
print("  files:", ", ".join(files))
