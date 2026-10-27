/* Public Tizen application APIs. No Mac server, network address or credentials. */
(function () {
  'use strict';
  /* Launch IDs for the Home apps, in Dock order. None has been read from the QE75Q60T yet.
     KANDIDAT: Tizen store ID seen on another Samsung TV; confirm in the TV's installed-app list.
     PLADSHOLDER: unknown until the TV is checked. A placeholder is resolved by app name from
     tizen.application.getAppsInfo when the app is launched; replace it with the real ID. */
  var IDS = {
    netflix: 'org.tizen.netflix-app',     // KANDIDAT
    twitch: 'PLADSHOLDER.Twitch',         // PLADSHOLDER
    youtube: '9Ur5IzDKqV.TizenYouTube',   // KANDIDAT
    drtv: 'PLADSHOLDER.DRTV',             // PLADSHOLDER
    spotify: 'rJeHak5zRg.Spotify',        // KANDIDAT
    tv2play: 'PLADSHOLDER.TV2Play',       // PLADSHOLDER
    disneyplus: 'MCmYXNxgcu.DisneyPlus',  // KANDIDAT
    hbomax: 'PLADSHOLDER.HBOMax'          // PLADSHOLDER
  };
  var PLACEHOLDER = /^PLADSHOLDER\./;
  /* Installed names that identify the Home apps when their ID is a placeholder or differs. */
  var NAMES = {
    netflix: /^netflix$/i, twitch: /^twitch$/i, youtube: /^youtube$/i, drtv: /^dr ?tv$/i,
    spotify: /^spotify\b/i, tv2play: /^tv ?2 ?play$/i, disneyplus: /^disney ?\+|^disney plus$/i, hbomax: /^(hbo ?)?max$/i
  };
  var STREAMING = ['as6cYRgkPy.Binge', '73iTZRTc34.Stan', '5b8c3eb16b.BeamCTVDev',
    'KaLitts8bq.tenplaySamsungTizen', 'eYuOiOLYQX.KayoSports', 'Ne2ZsPWdKl.9NOW',
    '3KA0pm7a7V.TubiTV', 'icp4AvUPiA.7plus', 'IkWsFHtOY9.Stremio', 'com.samsung.tv.aria-video',
    'org.tizen.primevideo', 'org.tizen.apple.apple-music'];
  var CONSUMER_SYSTEM = ['org.tizen.browser', 'com.microsoft.copilot'];
  /* Other known services keep their bundled marks in All apps. */
  var EXTRA_BRANDS = {'5b8c3eb16b.BeamCTVDev': 'hbomax', '3KA0pm7a7V.TubiTV': 'tubi', 'IkWsFHtOY9.Stremio': 'stremio',
    'com.samsung.tv.aria-video': 'appletv', 'org.tizen.primevideo': 'primevideo', 'org.tizen.apple.apple-music': 'applemusic'};
  var INTERNAL = ['adplatform.ADPlayer', 'WykOS4t4F0.cmsWebApp', '25emanual3.emanual',
    'ZODRT12q2l.WebAccountExtension', 'ByJlgt0XeD.CastSettingsApp', 'tv6pbVMQFF.PrivacyChoices'];
  var SELF = 'nClrkHome1.FrameHome';
  function api() { return window.tizen && window.tizen.application; }
  function unavailable(done) {
    done({ message: 'Åbn CleanFrame på TV’et for at bruge denne funktion.', detail: 'Browser-preview kan ikke styre TV’et.' });
  }
  function failure(err) {
    return { message: 'TV’et kunne ikke åbne denne skærm.', detail: err && (err.message || err.name) || 'Prøv igen, eller tryk på Home på fjernbetjeningen for at vende tilbage til CleanFrame.' };
  }
  function bounded(done) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'TV’et svarede ikke. Prøv igen.' }); }, 8000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }
  function launchApp(id, done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try { api().launch(id, function () { finish(null); }, function (err) { finish(failure(err)); }); }
    catch (err) { finish(failure(err)); }
  }
  function launch(brand, done) {
    if (!IDS[brand]) { done({message: 'Appen har intet launch-ID.'}); return; }
    launchApp(IDS[brand], done);
  }
  function art(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      var data = [new tizen.ApplicationControlData('mode', ['fullscreen']), new tizen.ApplicationControlData('requester', ['mobile'])];
      var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, data);
      api().launchAppControl(control, 'org.tizen.art-app', function () { finish(null); }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function home(done) { launchApp('com.samsung.tv.csfs', done); }
  function settings(done) { launchApp('com.samsung.tv.coba.setting', done); }
  function brandByName(name) {
    var brand;
    for (brand in NAMES) if (NAMES.hasOwnProperty(brand) && NAMES[brand].test(String(name).trim())) return brand;
    return '';
  }
  function apps(done) {
    if (!api()) { unavailable(done); return; }
    var finish = bounded(done);
    try {
      api().getAppsInfo(function (list) {
        var known = {}, seen = {}, named = {}, result = [];
        Object.keys(IDS).forEach(function (brand) { known[IDS[brand]] = brand; });
        list.forEach(function (a) {
          var byName = a.name && !known[a.id] && !EXTRA_BRANDS[a.id] ? brandByName(a.name) : '';
          // A name match stands in for a Home app only once, and only when its own ID is absent.
          if (byName && (named[byName] || list.some(function (b) { return b.id === IDS[byName]; }))) byName = '';
          var brand = known[a.id] || byName, primary = !!brand, stream = STREAMING.indexOf(a.id) >= 0;
          var consumer = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/.test(a.id) || CONSUMER_SYSTEM.indexOf(a.id) >= 0;
          if (a.id === SELF || INTERNAL.indexOf(a.id) >= 0 || seen[a.id] || !a.name || (!primary && !stream && (!a.show || !consumer))) return;
          if (!primary && /(?:service|worker|preview|promotion|plugin|launcher|test|sdk|^ep[ -]|factory|daemon)/i.test(a.name + ' ' + a.id)) return;
          if (/-dummy$/.test(a.id) || a.id === 'com.samsung.tv.cobalt-yt') return;
          seen[a.id] = true;
          if (byName) named[byName] = true;
          result.push({ appId: a.id, name: a.name, brand: brand || EXTRA_BRANDS[a.id] || '', icon: a.iconPath || '', rank: primary ? Object.keys(IDS).indexOf(brand) : (stream ? 20 : 30) });
        });
        result.sort(function (a, b) { return a.rank - b.rank || a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
        finish(null, result);
      }, function (err) { finish(failure(err)); });
    } catch (err) { finish(failure(err)); }
  }
  function isPlaceholder(id) { return PLACEHOLDER.test(String(id || '')); }
  window.FrameDevice = { launch: launch, launchApp: launchApp, art: art, home: home, settings: settings, apps: apps, ids: IDS, isPlaceholder: isPlaceholder };
}());
