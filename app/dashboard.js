/* CleanFrame dashboard layer, ported from tv-dashboard/tizen-app. ES5 for the TV.
   Clock, weather for Odense, calendar dots, Duolingo and WHOOP from the Cloudflare Worker.
   Renders above the Dock and below the Home controls; it never takes remote focus.
   DOM changes only when the minute, the day, an option or the data changes. */
(function () {
  'use strict';

  var POLL_MS = 15 * 60 * 1000;      // Worker caches weather/calendar 30 min, Duolingo/WHOOP 15 min
  var RETRY_MS = 60 * 1000;
  var STALE_MS = 5 * 60 * 1000;      // refresh on return when the data is older than this
  var STORE_KEY = 'cleanframe.dashboard.v1';
  var STRAIN_MAX = 21;               // WHOOP's strain scale
  var HOUR_FROM = 6, HOUR_TO = 24;   // today's rain chart shows 06:00-24:00

  var WEEKDAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
  var WEEKDAY_LETTERS = ['M', 'T', 'O', 'T', 'F', 'L', 'S'];   // Monday first
  var MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august',
    'september', 'oktober', 'november', 'december'];

  var config = window.CleanFrameDashboardConfig || {};
  var query = parseQuery(window.location.search);
  var useMock = !config.token || config.token === 'PUT-DASHBOARD-TOKEN-HERE' || !config.apiUrl || query.mock !== undefined;

  var root = null, els = {};
  var opts = { visible: false, cal: 'weeks' };
  var state = { data: null, offline: false, lastFetch: 0, loading: false, error: '', clock: '', today: '', hour: -1 };
  var pollTimer = 0, request = 0;
  var api = window.CleanFrameDashboard = {
    setOptions: setOptions, tick: tick, refresh: refresh, state: publicState, onChange: null
  };

  // ---------- small helpers ----------

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function dateFromYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function capital(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function thousands(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function decimal(n, digits) { return n.toFixed(digits).replace('.', ','); }
  function set(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }

  function parseQuery(search) {
    var out = {}, parts = (search || '').replace(/^\?/, '').split('&'), i, kv;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      kv = parts[i].split('=');
      try { out[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1]) : ''; } catch (e) { /* ignore malformed */ }
    }
    return out;
  }
  function readStore() { try { return window.localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
  function writeStore(value) { try { window.localStorage.setItem(STORE_KEY, value); } catch (e) { /* storage full */ } }

  // ISO week number, for the two-week calendar heading.
  function isoWeek(d) {
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate()), first;
    t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7);
    first = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - first) / 86400000 - 3 + (first.getDay() + 6) % 7) / 7);
  }

  // ---------- icons ----------

  var CLOUD = 'M20 50h26a11 11 0 0 0 1-22 15 15 0 0 0-28-4 13 13 0 0 0 1 26z';

  function weatherIcon(code, isDay) {
    var s = '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    var sun = '<circle cx="32" cy="32" r="11"/><path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M15 49l4-4M45 19l4-4"/>';
    var moon = '<path d="M42 40a16 16 0 0 1-18-24 17 17 0 1 0 18 24z"/>';
    var smallSun = '<circle cx="22" cy="22" r="8"/><path d="M22 6v4M6 22h4M10.5 10.5l3 3M33.5 10.5l-3 3"/>';
    var body;
    if (code === 0 || code === 1) body = isDay === false ? moon : sun;
    else if (code === 2) body = (isDay === false ? '' : smallSun) + '<path d="' + CLOUD + '"/>';
    else if (code === 45 || code === 48) body = '<path d="M12 26h40M8 34h48M14 42h36"/>';
    else if (code >= 95) body = '<path d="' + CLOUD + '"/><path d="M33 48l-5 9h8l-5 7"/>';
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
      body = '<path d="' + CLOUD + '"/><path d="M22 57h.01M32 59h.01M42 57h.01" stroke-width="5"/>';
    } else if (code >= 51) body = '<path d="' + CLOUD + '"/><path d="M24 54l-3 7M34 54l-3 7M44 54l-3 7"/>';
    else body = '<path d="' + CLOUD + '"/>';
    return s + body + '</svg>';
  }

  // Static glow behind the flame: a gradient, not a live filter.
  function flameSvg(lit) {
    var outer = 'M50 4C58 26 86 46 86 82c0 26-17 44-36 44S14 108 14 82c0-17 8-29 17-38 2 12 8 19 15 21C41 46 39 24 50 4z';
    var inner = 'M50 66c6 10 17 19 17 33 0 12-7 21-17 21s-17-9-17-21c0-8 4-14 8-18 1 6 4 9 8 10-3-8-3-17 1-25z';
    if (!lit) {
      return '<svg viewBox="0 0 100 130" aria-hidden="true"><path d="' + outer + '" fill="#4b545c"/>' +
        '<path d="' + inner + '" fill="#6b747c"/></svg>';
    }
    return '<svg viewBox="0 0 100 130" aria-hidden="true"><defs>' +
      '<radialGradient id="dashGlow" cx="50%" cy="62%" r="50%"><stop offset="0" stop-color="#ff9600" stop-opacity="0.45"/>' +
      '<stop offset="1" stop-color="#ff9600" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="dashFlameOuter" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff4b00"/>' +
      '<stop offset="0.55" stop-color="#ff9600"/><stop offset="1" stop-color="#ffc800"/></linearGradient>' +
      '<linearGradient id="dashFlameInner" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffc800"/>' +
      '<stop offset="1" stop-color="#fff0a8"/></linearGradient></defs>' +
      '<circle cx="50" cy="80" r="50" fill="url(#dashGlow)"/>' +
      '<path d="' + outer + '" fill="url(#dashFlameOuter)"/><path d="' + inner + '" fill="url(#dashFlameInner)"/></svg>';
  }

  function recoveryColor(score) {
    if (score >= 67) return '#16ec06';
    if (score >= 34) return '#ffde00';
    return '#ff0026';
  }

  // Progress ring; fraction is 0..1, or null for an empty ring ("afventer").
  function ringSvg(fraction, color) {
    var r = 46, c = 2 * Math.PI * r, f = isNum(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
    return '<svg viewBox="0 0 108 108" aria-hidden="true">' +
      '<circle class="dash-ring-track" cx="54" cy="54" r="' + r + '" fill="none" stroke-width="8"/>' +
      (f > 0
        ? '<circle cx="54" cy="54" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" ' +
          'stroke-linecap="round" stroke-dasharray="' + (f * c).toFixed(1) + ' ' + c.toFixed(1) + '" ' +
          'transform="rotate(-90 54 54)"/>'
        : '') +
      '</svg>';
  }

  // ---------- weather ----------

  var RAIN = '#4fa3ff', RAIN_CHANCE = 'rgba(79,163,255,0.22)';

  function mm(v) { return decimal(v, v >= 10 ? 0 : 1) + ' mm'; }

  function dayName(day, i) {
    if (i === 0) return 'I dag';
    return capital(WEEKDAYS[dateFromYmd(day.date).getDay()]);
  }

  // Today's hourly rain (06-24) with the chance as a faint bar behind, ported from tv-dashboard.
  function rainChart(day, now) {
    var W = 356, H = 56, h = day.hourly, n = HOUR_TO - HOUR_FROM, slot = W / n, bw = Math.max(4, slot * 0.66);
    var nowFrac = now.getHours() + now.getMinutes() / 60, scale = 2, out = '', k, hour, x, v, chance, past, ahead = 0;
    for (k = HOUR_FROM; k < HOUR_TO; k++) {
      scale = Math.max(scale, Math.ceil(h.precip[k] || 0));
      if (k + 1 > nowFrac) ahead += h.precip[k] || 0;
    }
    if (!ahead) return '<p class="dash-rain-none">Ingen regn resten af dagen</p>';
    for (k = 0; k < n; k++) {
      hour = HOUR_FROM + k; x = k * slot + (slot - bw) / 2; past = hour + 1 <= nowFrac ? ' opacity="0.3"' : '';
      chance = h.prob[hour];
      if (isNum(chance) && chance > 0) {
        v = chance / 100 * H;
        out += '<rect x="' + x.toFixed(1) + '" y="' + (H - v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + v.toFixed(1) + '" rx="2" fill="' + RAIN_CHANCE + '"' + past + '/>';
      }
      v = h.precip[hour] || 0;
      if (v > 0) {
        v = Math.max(3, Math.min(1, v / scale) * H);
        out += '<rect x="' + x.toFixed(1) + '" y="' + (H - v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + v.toFixed(1) + '" rx="2" fill="' + RAIN + '"' + past + '/>';
      }
    }
    if (nowFrac >= HOUR_FROM && nowFrac <= HOUR_TO) {
      x = (nowFrac - HOUR_FROM) / n * W;
      out += '<line x1="' + x.toFixed(1) + '" y1="0" x2="' + x.toFixed(1) + '" y2="' + H + '" class="dash-now" stroke-width="2" stroke-dasharray="3 3"/>';
    }
    out += '<line x1="0" y1="' + (H + 0.5) + '" x2="' + W + '" y2="' + (H + 0.5) + '" class="dash-axis" stroke-width="1"/>';
    [6, 12, 18].forEach(function (hr) {
      out += '<text x="' + ((hr - HOUR_FROM) / n * W).toFixed(1) + '" y="' + (H + 21) + '" class="dash-hour" text-anchor="middle">' + pad(hr) + '</text>';
    });
    return '<svg class="dash-rain" viewBox="0 0 ' + W + ' ' + (H + 24) + '" width="' + W + '" height="' + (H + 24) + '" aria-hidden="true">' + out + '</svg>';
  }

  function renderWeather(now) {
    var sec = state.data && state.data.weather, w, days = [], html, i, d;
    if (!sec || !sec.data) {
      set(els.weather, '<p class="dash-title">Vejret</p><p class="dash-empty">' + (sec ? 'Vejret kunne ikke hentes' : state.loading ? 'Henter vejret…' : 'Ingen data endnu') + '</p>');
      return;
    }
    w = sec.data;
    for (i = 0; i < (w.days || []).length && days.length < 3; i++) days.push(w.days[i]);
    html = '<div class="dash-now-row"><span class="dash-wx-icon">' + weatherIcon(w.current.code, w.current.isDay) + '</span>' +
      '<span class="dash-temp">' + Math.round(w.current.temperature) + '°</span>' +
      '<span class="dash-wx-meta"><span class="dash-place">' + esc(w.location || 'Odense') + '</span>' +
      '<span class="dash-desc">' + esc(w.current.text || '') + '</span></span></div>';
    html += days[0] && days[0].hourly ? rainChart(days[0], now) : '';
    html += '<div class="dash-days">';
    for (i = 0; i < days.length; i++) {
      d = days[i];
      html += '<div class="dash-day"><span class="dash-day-name">' + dayName(d, i) + '</span>' +
        '<span class="dash-day-icon">' + weatherIcon(d.code, true) + '</span>' +
        '<span class="dash-day-temp">' + Math.round(d.max) + '°<span class="dash-lo">' + Math.round(d.min) + '°</span></span>' +
        '<span class="dash-day-rain">' + (isNum(d.precipSum) && d.precipSum > 0 ? mm(d.precipSum) : '') + '</span></div>';
    }
    set(els.weather, html + '</div>');
  }

  // ---------- calendar ----------

  function busySet() {
    var out = {}, sec = state.data && state.data.calendar, dates = sec && sec.data && sec.data.dates ? sec.data.dates : [], i;
    for (i = 0; i < dates.length; i++) out[dates[i]] = true;
    return out;
  }

  function dayCell(d, todayStr, busy, outside) {
    var key = ymd(d), cls = 'dash-cell';
    if (key === todayStr) cls += ' is-today';
    else if (key < todayStr) cls += ' is-past';
    if (outside) cls += ' is-outside';
    return '<span class="' + cls + '"><span class="dash-num">' + d.getDate() + '</span>' + (busy[key] ? '<span class="dash-dot"></span>' : '') + '</span>';
  }

  function renderCalendar(now) {
    var todayStr = ymd(now), busy = busySet(), cells = [], i, start, rows, html, title, count = 0, d;
    var weeks = opts.cal !== 'month';
    if (weeks) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
      for (i = 0; i < 14; i++) {
        d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        cells.push(dayCell(d, todayStr, busy, false));
        if (busy[ymd(d)] && ymd(d) >= todayStr) count++;
      }
      title = 'Uge ' + isoWeek(start) + '–' + isoWeek(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7));
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      for (i = 0; i < (start.getDay() + 6) % 7; i++) cells.push('<span class="dash-cell is-blank"></span>');
      rows = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (i = 1; i <= rows; i++) cells.push(dayCell(new Date(now.getFullYear(), now.getMonth(), i), todayStr, busy, false));
      while (cells.length % 7) cells.push('<span class="dash-cell is-blank"></span>');
      title = capital(MONTHS[now.getMonth()]) + ' ' + now.getFullYear();
    }
    html = '<p class="dash-title">Kalender</p><p class="dash-cal-head">' + title + '</p><div class="dash-cal-grid is-' + (weeks ? 'weeks' : 'month') + ' rows-' + cells.length / 7 + '">';
    html += '<div class="dash-row dash-weekdays">';
    for (i = 0; i < 7; i++) html += '<span class="dash-cell">' + WEEKDAY_LETTERS[i] + '</span>';
    html += '</div>';
    for (i = 0; i < cells.length; i += 7) html += '<div class="dash-row">' + cells.slice(i, i + 7).join('') + '</div>';
    html += '</div>';
    if (weeks) html += '<p class="dash-cal-note">' + (count ? count + (count === 1 ? ' dag' : ' dage') + ' med aftaler fra i dag' : 'Ingen aftaler de kommende dage') + '</p>';
    set(els.calendar, html);
  }

  // ---------- Duolingo and WHOOP ----------

  function renderDuolingo() {
    var sec = state.data && state.data.duolingo, d, done, pill, html = '<p class="dash-title">Duolingo</p>';
    if (!sec || !sec.data) { set(els.duolingo, html + '<p class="dash-empty">Ingen data endnu</p>'); return; }
    d = sec.data; done = d.doneToday === true;
    if (done) pill = '<span class="dash-pill is-done">&#10003;&nbsp; Lavet i dag</span>';
    else if (d.doneToday === false) pill = '<span class="dash-pill is-todo">Ikke lavet endnu</span>';
    else pill = '<span class="dash-pill is-todo">Ukendt status</span>';
    set(els.duolingo, html + '<div class="dash-duo"><span class="dash-flame">' + flameSvg(done) + '</span>' +
      '<span class="dash-streak">' + (isNum(d.streak) ? d.streak : '–') + '</span>' +
      '<span class="dash-streak-label">' + (d.streak === 1 ? 'dag i træk' : 'dage i træk') + '</span>' + pill + '</div>');
  }

  function ringTile(label, fraction, color, valueHtml) {
    return '<div class="dash-tile"><div class="dash-ring">' + ringSvg(valueHtml === null ? null : fraction, color) +
      (valueHtml === null ? '<span class="dash-ring-value is-pending">afventer</span>'
        : '<span class="dash-ring-value" style="color:' + color + '">' + valueHtml + '</span>') +
      '</div><p class="dash-tile-label">' + label + '</p></div>';
  }

  function renderWhoop() {
    var sec = state.data && state.data.whoop, w, rec, sleep, strain, html = '<p class="dash-title">Whoop</p>';
    if (!sec || !sec.data) {
      set(els.whoop, html + '<p class="dash-empty">' + esc(sec && sec.error ? 'Whoop kunne ikke hentes' : 'Ingen data endnu') + '</p>');
      return;
    }
    w = sec.data;
    rec = isNum(w.recovery) ? w.recovery : null;
    sleep = isNum(w.sleepPerformance) ? w.sleepPerformance : null;
    strain = isNum(w.strain) ? w.strain : null;
    set(els.whoop, html + '<div class="dash-tiles">' +
      ringTile('Recovery', rec / 100, rec === null ? '' : recoveryColor(rec), rec === null ? null : Math.round(rec) + '<small>%</small>') +
      ringTile('Søvn', sleep / 100, '#8fb3cf', sleep === null ? null : Math.round(sleep) + '<small>%</small>') +
      ringTile('Strain', strain / STRAIN_MAX, '#2ea8ff', strain === null ? null : decimal(strain, 1)) +
      '<div class="dash-tile"><div class="dash-steps">' +
        (isNum(w.steps) ? '<span class="dash-steps-value">' + thousands(w.steps) + '</span>' : '<span class="dash-ring-value is-pending">afventer</span>') +
      '</div><p class="dash-tile-label">Skridt i dag</p></div></div>');
  }

  // ---------- clock and status ----------

  function problemText() {
    var d = state.data, keys = ['weather', 'calendar', 'duolingo', 'whoop'], i, s;
    if (state.offline) return 'ingen forbindelse til Worker';
    if (!d) return '';
    for (i = 0; i < keys.length; i++) {
      s = d[keys[i]];
      if (s && (s.status === 'stale' || s.status === 'error')) return 'nogle data er forældede';
    }
    return '';
  }

  function errorText() {
    if (/^HTTP 401/.test(state.error)) return 'Worker afviste tokenet (401) · tjek .local/config.js';
    return 'Kunne ikke hente data (' + state.error + ')';
  }

  function renderStatus() {
    var d = state.data, problem = problemText(), demo = useMock, keys = ['weather', 'calendar', 'duolingo', 'whoop'], i, text;
    for (i = 0; d && i < keys.length; i++) if (d[keys[i]] && d[keys[i]].status === 'mock') demo = true;
    if (!d || !d.generatedAt) text = state.loading ? 'Henter data…' : state.error ? errorText() : '';
    else text = (demo ? 'Demodata · ' : '') + 'Opdateret kl. ' + hhmm(new Date(d.generatedAt));
    els.updated.className = 'dash-updated' + (problem || (!d && state.error) ? ' is-warn' : '');
    set(els.updated, esc(text));
  }

  function renderClock(now) {
    set(els.time, hhmm(now));
    set(els.date, capital(WEEKDAYS[now.getDay()]) + ' ' + now.getDate() + '. ' + MONTHS[now.getMonth()]);
  }

  function renderAll() {
    var now = new Date();
    if (!root) return;
    renderClock(now); renderWeather(now); renderCalendar(now); renderDuolingo(); renderWhoop(); renderStatus();
    state.clock = hhmm(now); state.today = ymd(now); state.hour = now.getHours();
    if (typeof api.onChange === 'function') api.onChange();
  }

  /* Called by main.js at each minute boundary while Home is visible. */
  function tick() {
    var now = new Date();
    if (!root || !opts.visible) return;
    if (ymd(now) !== state.today) { renderAll(); refresh(); return; }
    if (hhmm(now) !== state.clock) { state.clock = hhmm(now); renderClock(now); }
    if (now.getHours() !== state.hour) { state.hour = now.getHours(); renderWeather(now); }
  }

  // ---------- data ----------

  function apply(data, offline, error) {
    state.data = data; state.offline = offline; state.error = error || '';
    renderAll();
  }

  function fetchLive(done) {
    var xhr = new XMLHttpRequest(), finished = false;
    function finish(err, body) { if (finished) return; finished = true; done(err, body); }
    try {
      xhr.open('GET', config.apiUrl, true);
      xhr.setRequestHeader('Authorization', 'Bearer ' + config.token);
      xhr.timeout = 20000;
      xhr.onreadystatechange = function () {
        var body;
        if (xhr.readyState !== 4) return;
        if (xhr.status !== 200) { finish(new Error(xhr.status ? 'HTTP ' + xhr.status : 'netværksfejl')); return; }
        try { body = JSON.parse(xhr.responseText); } catch (e) { finish(e); return; }
        finish(null, body);
      };
      xhr.ontimeout = function () { finish(new Error('timeout')); };
      xhr.send();
    } catch (e) { finish(e); }
  }

  function schedule(ms) {
    clearTimeout(pollTimer);
    pollTimer = opts.visible && !document.hidden ? setTimeout(refresh, ms) : 0;
  }

  function refresh() {
    var id = ++request;
    state.lastFetch = Date.now();
    if (useMock) {
      apply(window.CleanFrameDashboardMock.build(new Date(), query.scenario || 'normal'), query.scenario === 'offline');
      schedule(POLL_MS);
      return;
    }
    state.loading = true; renderStatus();
    fetchLive(function (err, body) {
      if (id !== request) return;
      state.loading = false;
      if (err) {
        // Keep showing the last good data; the status line turns amber.
        apply(state.data, true, err.message || 'fejl');
        schedule(RETRY_MS);
        return;
      }
      writeStore(JSON.stringify(body));
      apply(body, false);
      schedule(POLL_MS);
    });
  }

  function setOptions(next) {
    var wasVisible = opts.visible, calChanged = next.cal && next.cal !== opts.cal;
    if (next.cal) opts.cal = next.cal === 'month' ? 'month' : 'weeks';
    opts.visible = !!next.visible;
    if (!root) return;
    if (calChanged) renderCalendar(new Date());
    if (opts.visible && !wasVisible) {
      tick();
      if (Date.now() - state.lastFetch > STALE_MS) refresh(); else schedule(POLL_MS);
    } else if (!opts.visible && wasVisible) schedule(0);
  }

  function publicState() {
    var d = state.data;
    return { source: useMock ? 'mock' : 'worker', visible: opts.visible, cal: opts.cal, loading: state.loading,
      offline: state.offline, error: state.error, problem: problemText(),
      updated: d && d.generatedAt ? hhmm(new Date(d.generatedAt)) : '', hasData: !!d };
  }

  function start() {
    var saved;
    root = document.getElementById('dash');
    if (!root) return;
    root.innerHTML = '<div class="dash-head"><p class="dash-time" id="dashTime"></p><p class="dash-date" id="dashDate"></p><p class="dash-updated" id="dashUpdated"></p></div>' +
      '<section class="dash-panel dash-weather" id="dashWeather"></section>' +
      '<section class="dash-panel dash-calendar" id="dashCalendar"></section>' +
      '<section class="dash-panel dash-duolingo" id="dashDuolingo"></section>' +
      '<section class="dash-panel dash-whoop" id="dashWhoop"></section>';
    els = { time: document.getElementById('dashTime'), date: document.getElementById('dashDate'), updated: document.getElementById('dashUpdated'),
      weather: document.getElementById('dashWeather'), calendar: document.getElementById('dashCalendar'),
      duolingo: document.getElementById('dashDuolingo'), whoop: document.getElementById('dashWhoop') };
    if (!useMock) {
      saved = readStore();
      if (saved) { try { state.data = JSON.parse(saved); state.offline = true; } catch (e) { state.data = null; } }
    }
    renderAll();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { schedule(0); return; }
      if (opts.visible && Date.now() - state.lastFetch > STALE_MS) refresh(); else schedule(POLL_MS);
    });
  }

  start();
}());
