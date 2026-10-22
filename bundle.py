#!/usr/bin/env python3
"""
Spades Royale — Standalone HTML Bundler
Bundles styles.css and js/*.js into index.html so index.html works both
from file:// (double-click / Android WebView) and over HTTP.
"""
import pathlib

root = pathlib.Path(__file__).resolve().parent
index_path = root / 'index.html'
html = index_path.read_text(encoding='utf-8')

style_start = html.index('<style>') + len('<style>\n')
style_end = html.index('  </style>')

script_start = html.index('<script>') + len('<script>\n')
script_end = html.rindex('  </script>')

css = (root / 'styles.css').read_text(encoding='utf-8')
modules = [
    'js/vendor/peerjs.min.js',
    'js/avatars.js',
    'js/audio.js',
    'js/store.js',
    'js/engine.js',
    'js/bot.js',
    'js/match.js',
    'js/p2p.js',
    'js/network-adapter.js',
    'js/app.js',
]
js_bundle = '\n\n'.join(
    f"// === MODULE: {m} ===\n" + (root / m).read_text(encoding='utf-8')
    for m in modules
)

# Inline brand images so index.html stays a single self-contained file (works from file:// too)
import base64
for asset in ('assets/logo.jpg', 'assets/mark.jpg', 'assets/signature.png'):
    data = base64.b64encode((root / asset).read_bytes()).decode('ascii')
    mime = 'image/png' if asset.endswith('.png') else 'image/jpeg'
    css = css.replace(f'url("{asset}")', f'url("data:{mime};base64,{data}")')

# Embed the classic court pictures (J/Q/K) so cards work offline in every app
for sub in ('cards', 'avatars'):
    img_dir = root / 'assets' / sub
    if img_dir.is_dir():
        for f in sorted(img_dir.glob('*.webp')):
            data = base64.b64encode(f.read_bytes()).decode('ascii')
            js_bundle = js_bundle.replace(f"'assets/{sub}/{f.name}'", f"'data:image/webp;base64,{data}'")

# Point the app at the free cloud server when building for release (GitHub Actions sets this)
import os
server_url = os.environ.get('SPADES_SERVER_URL', '').strip()
if server_url:
    js_bundle = js_bundle.replace("const HOSTED_SERVER_URL = '';", f"const HOSTED_SERVER_URL = {server_url!r};", 1)
app_version = os.environ.get('SPADES_APP_VERSION', '').strip()
if app_version:
    js_bundle = js_bundle.replace("const APP_VERSION = 'dev';", f"const APP_VERSION = {app_version!r};", 1)
display_version = os.environ.get('SPADES_DISPLAY_VERSION', '').strip()
if display_version:
    js_bundle = js_bundle.replace("const DISPLAY_VERSION = 'dev';", f"const DISPLAY_VERSION = {display_version!r};", 1)

new_html = (
    html[:style_start]
    + css
    + '\n'
    + html[style_end:script_start]
    + js_bundle
    + '\n'
    + html[script_end:]
)

index_path.write_text(new_html, encoding='utf-8')
print(f"Bundled styles.css + {len(modules)} JS modules into index.html ({len(new_html)} bytes)"
      + (f" — server {server_url}" if server_url else ''))
