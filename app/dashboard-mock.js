/* Demo data for the dashboard, in the Worker's /api/dashboard shape (from tv-dashboard).
   Used when no Worker token is configured, or with ?mock. Scenarios via ?scenario=:
   "normal", "pending" (nothing scored yet, lesson not done), "stale" and "offline". */
(function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function plusDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

  // Hourly values for three days. Day 1 is a real Open-Meteo forecast for Odense.
  var HOURLY = [
    {
      precip: [0, 0.1, 0.4, 1.8, 3.5, 3.9, 1.8, 1.1, 1.0, 0.2, 0, 0.5, 0.6, 1.4, 0.8, 3.7, 0.8, 0.4, 0.9, 0, 0.2, 0.9, 0, 0.1],
      prob: [60, 70, 85, 95, 100, 100, 95, 90, 85, 60, 40, 55, 65, 80, 75, 95, 70, 55, 60, 35, 40, 55, 30, 25],
      uv: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 1.0, 1.5, 1.9, 1.9, 0.3, 0.4, 0.5, 0.1, 0, 0, 0, 0, 0, 0]
    },
    {
      precip: [0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      prob: [20, 20, 25, 30, 35, 40, 46, 40, 30, 20, 15, 10, 10, 10, 10, 10, 15, 15, 20, 20, 20, 20, 20, 20],
      uv: [0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.7, 1.2, 1.6, 1.9, 1.8, 1.4, 0.9, 0.4, 0.1, 0, 0, 0, 0, 0, 0]
    },
    {
      precip: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.3, 0.5, 0, 0, 0, 0, 0],
      prob: [10, 10, 10, 10, 10, 10, 10, 15, 15, 20, 25, 30, 40, 55, 70, 85, 88, 80, 60, 40, 30, 20, 15, 10],
      uv: [0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.6, 1.0, 1.4, 1.6, 1.5, 1.1, 0.7, 0.3, 0.1, 0, 0, 0, 0, 0, 0]
    }
  ];

  function sum(a) {
    var t = 0;
    for (var i = 0; i < a.length; i++) t += a[i];
    return Math.round(t * 10) / 10;
  }

  function build(now, scenario) {
    var iso = now.toISOString(), old = new Date(now.getTime() - 47 * 60000).toISOString();
    var status = scenario === 'stale' ? 'stale' : 'mock', updatedAt = scenario === 'stale' ? old : iso;
    var busy = [0, 2, 3, 7, 11, 16, -4, -9], dates = [], days = [], i;
    var pending = scenario === 'pending';
    for (i = 0; i < busy.length; i++) dates.push(ymd(plusDays(now, busy[i])));
    dates.sort();
    for (i = 0; i < 3; i++) {
      days.push({
        date: ymd(plusDays(now, i)), code: [63, 51, 2][i], text: ['Regn', 'Let støvregn', 'Delvist skyet'][i],
        max: [11, 13, 12][i], min: [8, 10, 6][i], precipitation: [100, 46, 88][i],
        precipSum: sum(HOURLY[i].precip), uvMax: [1.9, 1.9, 1.6][i], hourly: HOURLY[i]
      });
    }
    return {
      generatedAt: iso,
      timezone: 'Europe/Copenhagen',
      today: ymd(now),
      weather: { status: status, updatedAt: updatedAt, data: {
        location: 'Odense',
        current: { temperature: 10, apparent: 7, code: 3, text: 'Overskyet', isDay: true, wind: 7 },
        days: days
      } },
      calendar: { status: status, updatedAt: updatedAt, data: { dates: dates } },
      duolingo: { status: status, updatedAt: updatedAt,
        data: { streak: pending ? 400 : 401, doneToday: !pending, lastStreakDate: ymd(now) } },
      whoop: { status: status, updatedAt: updatedAt,
        data: pending ? { recovery: null, sleepPerformance: null, strain: 0.3, steps: null }
          : { recovery: 72, sleepPerformance: 88, strain: 8.4, steps: 6420 } }
    };
  }

  window.CleanFrameDashboardMock = { build: build };
}());
