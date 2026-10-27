"""Private dashboard configuration for preview and local packaging.

app/dashboard-config.js is public and has no Worker token, so the dashboard shows demo
data. A git-ignored .local/config.js (copied from dashboard.config.example.js) replaces it
in `npm run dev` and `npm run package`. Without that file, a DASHBOARD_TOKEN environment
variable is used instead. Public exports and browser checks never include either.
"""
from pathlib import Path
import json
import os
import re

ROOT = Path(__file__).resolve().parents[1]
NAME = 'dashboard-config.js'
DEFAULT_API = 'https://tv-dashboard.rasmus-wraae.workers.dev/api/dashboard'
PLACEHOLDER = 'PUT-DASHBOARD-TOKEN-HERE'


def private_config(root=ROOT):
    """Return the private config script as bytes, or None when only demo data is available."""
    path = root / '.local/config.js'
    if path.is_file() and not path.is_symlink():
        content = path.read_bytes()
        if token_of(content.decode(errors='replace')):
            return content
    token = os.environ.get('DASHBOARD_TOKEN', '').strip()
    if token:
        api = os.environ.get('DASHBOARD_API_URL', DEFAULT_API)
        return ('window.CleanFrameDashboardConfig = ' + json.dumps({'apiUrl': api, 'token': token})
                + ';\n').encode()
    return None


def token_of(content):
    """The configured token in a config script, ignoring the example placeholder."""
    match = re.search(r'''["']?token["']?\s*:\s*["']([^"']*)["']''', content)
    token = match.group(1).strip() if match else ''
    return '' if token == PLACEHOLDER else token


def config_overlay(root=ROOT, include_private=True):
    """Package-relative path mapped to the private config bytes, when present."""
    content = private_config(root) if include_private else None
    return {NAME: content} if content else {}
