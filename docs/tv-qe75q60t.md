# TV-note: Samsung QE75Q60T (Tizen 5.5)

Denne fork er kun kørt i browser-preview. Intet her er installeret eller set på TV'et endnu. Noten samler det, installationen skal tage højde for; den tidligere TV Dashboard-installation er beskrevet i [tv-dashboard/docs/installation-tv.md](https://github.com/raswraae-Jedi/tv-dashboard/blob/main/docs/installation-tv.md).

## Skal ændres før installation

1. **Egen app-identitet.** `app/config.xml` har stadig vedligeholderens `nClrkHome1.FrameHome`, og `scripts/check.py`, `app/device.js` (`SELF`), `scripts/package.py` (profil `FrameHome`), `scripts/tv.py` og `scripts/native-home/` forventer den. Vælg et nyt pakke-ID (10 tegn, fx `RWHome0001`), og ret alle steder samtidig. Signér med din egen Samsung-profil (`tvdash` med TV'ets DUID virker til samme TV). Genbrug ikke `TVdashRW01`, medmindre den nye app skal erstatte TV Dashboard.
2. **Launch-ID'er.** Netflix, YouTube, Spotify og Disney+ har `KANDIDAT`-ID'er fra et andet Samsung-TV; Twitch, DR TV, TV 2 Play og HBO Max er `PLADSHOLDER`. Læs de rigtige ID'er fra TV'et (fx med `sdb shell 0 vd_applist`, som Samsung-TV'er normalt har – bekræft på dit TV), og skriv dem i `app/device.js`. Indtil da slår CleanFrame pladsholdere op på app-navnet ved hvert tryk; et forkert kandidat-ID giver en fejlbesked.
3. **Token.** `.local/config.js` skal findes på den computer, der bygger. `npm run build` skriver `dist/CleanFrame-unsigned.wgt` med tokenet indeni – hold filen privat.

Allerede gjort i koden: `required_version="5.5"` (før `6.5`, som et Tizen 5.5-TV ville afvise), `<access origin="https://tv-dashboard.rasmus-wraae.workers.dev">` og privilegiet `internet`, uden hvilke Worker-kaldet blokeres.

## Byg og installér (Windows, som sidst)

`scripts/package.py` er skrevet til en Mac med SDK i `.local/` og kan ikke bruges direkte. Brug i stedet:

```powershell
npm run build                                   # usigneret, med token
tizen package -t wgt -s tvdash -- dist\CleanFrame-unsigned.wgt
# Filnavnet må ikke indeholde mellemrum (fejlen fra sidst). Omdøb hvis nødvendigt.
tizen install -n CleanFrame.wgt -s <TV-IP>:26101
tizen run -p <dit-pakke-id>.<app-navn> -s <TV-IP>:26101
```

Faldgruberne fra TV Dashboard-installationen (`RunAsInvoker`, `NoDefaultCurrentDirectoryInExePath`, kommaseparerede pakkenavne) gælder stadig.

## Browsermotoren

Ifølge Samsungs specifikation har Tizen 5.5 en Chromium 69-baseret motor; den præcise version er ikke målt på TV'et.

- **Dashboardet** er skrevet til det: ES5, flexbox uden `gap`, ingen `inset`, `clamp()`, `backdrop-filter` eller filtre.
- **CleanFrames egen CSS** bruger `gap` i flexbox 37 steder. Det kræver Chromium 84, så på TV'et forsvinder mellemrummet mellem fx knapperne oppe til højre, knapper i Indstillinger og ikon/tekst i nogle rækker. Det er kosmetisk, men det første, der skal kigges efter; rettes med margins, hvis det ser forkert ud. `inset:0` er allerede skiftet til `left/top/right/bottom:0`.
- JavaScript-funktioner nyere end Chromium 69 (`document.fonts`, `img.decode`, canvas-fontmål) har fallbacks i koden. Variable fonts (Geist, Newsreader) kræver Chromium 62 og bør virke; kontrollér dem i Indstillinger → Typografi.

## På TV'et

- **Ingen Art Mode.** Q60T er ikke et The Frame-TV, så knappen er skjult (`ART_MODE = false`).
- **Home-knappen.** CleanFrames native Home-integration (`scripts/native-home/`) er bygget og testet til et Tizen 9-TV med firmware 2130 og bruger udokumenterede funktioner. Den virker ikke uden videre på Tizen 5.5 og er en separat opgave med gendannelses-baseline. På Q60T er den sikre vej den samme som for TV Dashboard: *Kør sidste app automatisk* til, *Kør Smart Hub automatisk* fra, og CleanFrame først i Home-bjælken.
- **Tilbage-knappen** åbner CleanFrames "Forlad Home?" i stedet for at skjule appen, som TV Dashboard gjorde.
- **Pauseskærm.** TV Dashboard slog Samsungs pauseskærm fra med `webapis.appcommon.setScreenSaver`. Det er ikke porteret, fordi det kun kan prøves på TV'et; hvis skærmen dæmpes efter et par timer, så tilføj `$WEBAPIS/webapis/webapis.js` og `keepScreenOn()` fra tv-dashboard.
- **Ydeevne.** Glas og sløring er forudrenderede JPEG'er, og dashboardet tegner kun om ved nyt minut eller nye data. Mærk alligevel efter, om dokken føles hurtig nok på et 2020-mellemklasse-TV, og kig efter hukommelsesproblemer ved skift af baggrundsbillede.
- **To apps.** TV Dashboard (`TVdashRW01`) bliver liggende, indtil du fjerner den. De to apps deler hverken data eller indstillinger.

## Bekræft med fjernbetjeningen

1. Dashboardet vises over dokken, og teksten kan læses fra sofaen.
2. Statuslinjen viser "Opdateret kl. …" uden "Demodata", og den bliver gul uden netværk.
3. Venstre/højre i dokken, op til knapperne og tilbage igen; ingen fokus på dashboardet.
4. Hver af de otte apps starter; skriv de fundne ID'er i `app/device.js`.
5. Indstillinger → Dashboard: Fra/Til og 2 uger/Måned huskes efter genstart.
6. Afstande i knapper og Indstillinger (flexbox `gap`, se ovenfor).
