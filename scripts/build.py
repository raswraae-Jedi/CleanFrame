"""Build an unsigned private widget with the local dashboard token. No signing, no TV.

Sign the result yourself with the Tizen CLI and your own certificate profile, e.g.
`tizen package -t wgt -s <profile> -- dist/CleanFrame-unsigned.wgt`. The widget contains
the Worker token in dashboard-config.js: keep it private and never publish it.
"""
import zipfile

from dashboard_config import token_of
from font_assets import ROOT, write_widget_archive

output = ROOT / 'dist/CleanFrame-unsigned.wgt'
output.parent.mkdir(exist_ok=True)
write_widget_archive(output)
with zipfile.ZipFile(output) as archive:
    has_token = bool(token_of(archive.read('dashboard-config.js').decode()))
print('Created ' + str(output.relative_to(ROOT)) + ' (unsigned).')
print('Dashboard: ' + ('Worker token included from local configuration; keep this file private.' if has_token
                       else 'no token found (.local/config.js or DASHBOARD_TOKEN); the TV will show demo data.'))
