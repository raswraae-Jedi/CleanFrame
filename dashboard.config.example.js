/* Copy to .local/config.js (git-ignored) and insert the Worker's DASHBOARD_TOKEN.
   `npm run dev` and `npm run package` serve/package it as app/dashboard-config.js.
   `npm run export:public` never includes it. Never commit the real token. */
window.CleanFrameDashboardConfig = {
  apiUrl: 'https://tv-dashboard.rasmus-wraae.workers.dev/api/dashboard',
  token: 'PUT-DASHBOARD-TOKEN-HERE'
};
