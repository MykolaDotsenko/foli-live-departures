# Localization

The locale registry currently contains **English (`en`)**, **Finnish (`fi`)**,
**Ukrainian (`uk`)** and **Swedish (`sv`)**. It follows the first browser
language the app supports on a first visit and then keeps the passenger's
explicit choice on the phone. Finnish, Ukrainian and Swedish **string
translations** are generated from the canonical source dictionaries into
same-origin lazy JSON packs so repeated English source keys do not inflate
executable JS. Function-valued plural/count grammar remains
in small lazy runtime modules. The generated locale packs have their own
raw/gzip bundle budgets, so this split cannot hide translation growth.

Current implementation state:

- **Ukrainian (`uk`)** was implemented in PR #139 across Ride Mode, Journey
  Assistant, recovery, offline/degraded states, Places, privacy/help and the
  rest of the passenger UI. PR #140 added generated lazy locale packs and
  fail-closed locale loading. PR #142 adds dedicated Ride/recovery safety
  coverage, cross-browser axe, 320/360/412 px + 200% text + dark-theme reflow,
  production PWA offline reopen and Android WebView persistence.
- **Swedish (`sv`)** is implemented in PR #142 as a full first-class locale:
  canonical dictionary, lazy pack, count grammar, first-visit `sv-FI`,
  Swedish provider-text precedence, Ride/recovery safety coverage, browser
  accessibility/reflow, PWA offline reopen and Android persistence.

For both Ukrainian and Swedish, native-language review, physical
VoiceOver/TalkBack, speech pronunciation and real-bus validation remain manual
release gates; automated coverage does not claim those reviews happened.

The detailed Ukrainian acceptance and remaining review plan is in
[Ukrainian interface plan](UKRAINIAN_INTERFACE_PLAN.md).

## How it works

- `t("English text", params)` from `src/i18n` returns the phrase in the
  current language. The English text is the key, so the code reads as the
  screen does, and a phrase missing from a dictionary falls back to English
  instead of breaking.
- Templates take `{name}` placeholders: `t("Stop {id}", { id })`.
- Where the word form follows a number, the Finnish entry is a function of
  the same parameters. The code keeps its own English singular and plural
  keys (`"1 stop"`, `"{count} stops"`).
- Components call `useLanguage()` so they re-render when the language
  changes.
- Dates use `intlLocale()`. Distances are written by hand ("1.4 km",
  "1,4 km"), so a phone without Finnish locale data still gets the comma.
  The transit clock stays 24-hour with a colon (`15:16`) in every language,
  as on Föli's stop displays.
- A message kept in state (a search error, a share confirmation) keeps its
  phrase and values, not the finished sentence, so it follows a switch of
  language while it is on screen.

`src/i18n/i18n.test.js` protects dictionary completeness, placeholders,
stale/unused keys, plural behavior and fail-closed lazy-pack loading for the
implemented locales. Source-level tests also reject literal English accessible
labels that bypass the translator. Browser QA exercises the full registry cycle
`en → fi → uk → sv → en` and dedicated Ukrainian/Swedish production flows.
Both added locales have explicit layout, 200% text, dark-theme, axe,
offline/PWA, Ride/recovery and Android persistence coverage rather than relying
on dictionary completeness alone.

## Rules

1. **Never translate names.** Stop names, destination names (the bus sign)
   and line numbers are shown exactly as Föli publishes them.
2. **Do not inflect names in Finnish.** A stop name cannot be declined
   reliably, so it goes after a noun in the needed case or after a colon:
   "pysäkillä Kauppatori", "Jää pois: Kauppatori", never "Kauppatorilla".
3. **Keep it short.** These phrases are read on a moving bus.
4. **Keep instructions imperative and singular** (sinä-muoto), as Föli's
   own passenger guidance does.
5. **A clock time in a Finnish sentence takes "klo"**: "lähtee klo 17:55",
   "Päivitetty klo 15:16". A time standing alone, in the Lähtee column or a
   countdown, does not.
6. **Mark names with their language.** Stop names and bus signs carry
   `lang="fi"` and the English brand `lang="en"`, so a screen reader in
   either language pronounces them as they are written.
7. **A control's accessible name starts with its visible words** (WCAG
   2.5.3): "Kävele sinne: Kauppatori, pysäkki 164, Google Mapsissa" for a
   button reading "Kävele sinne".
8. **A long compound on a narrow button gets a soft hyphen** (`­`) at
   its seam, so large text breaks it where a Finn would: "Pysäkki­hälytys".
   Screen readers ignore it; a test matching the name allows it
   (`/^Pysäkki­?hälytys$/`).

## Glossary

| English | Finnish |
| --- | --- |
| stop | pysäkki |
| departure, departures | lähtö, lähdöt |
| line | linja |
| bus | bussi |
| waterbus | vesibussi |
| live (a live time) | reaaliaikainen, as a status "Reaaliaika" |
| scheduled, timetable | aikataulu, aikataulun mukainen |
| late, early | myöhässä, etuajassa |
| service updates | liikennetiedotteet |
| reduced service | supistettu liikenne |
| service update | liikennetiedote |
| detour | poikkeusreitti |
| cancelled | peruttu |
| due (column) | lähtee |
| next stops | seuraavat pysäkit |
| wheelchair accessible | esteetön |
| refresh | päivitä |
| try again | yritä uudelleen |
| offline | ei yhteyttä |
| near you | lähelläsi |
| Get-off alert (the feature, everywhere a passenger sees it; "Ride Mode" is the developers' name; lower case in running text) | pysäkkihälytys (capitalised only where it starts a label: "Pysäkkihälytys") |
| Alert on | Hälytys päällä |
| Turn off alert | Lopeta hälytys |
| get off | jäädä pois |
| press STOP | paina STOP-nappia |
| My Places | Omat paikat |
| Home, School, Work | Koti, Koulu, Työ |
| main stop | pääpysäkki |
| backup stop | varapysäkki |
| backup card (printed) | varakortti |
| driver | kuljettaja |
| driver card; in passenger copy name its button, Show to driver | kuljettajakortti; in passenger copy name the button in quotes, ”Näytä kuljettajalle” |
| Get me Home | Vie minut kotiin |
| recent (stops) | viimeksi käytetyt |
| About & privacy | Tietoa ja tietosuoja |

## Review

The Finnish text was written for this app and has not yet been reviewed by
a native speaker. That review should come before a city-wide launch.


## Ukrainian locale — implemented, review gates open

Ukrainian is implemented as a first-class locale rather than a small set of
translated labels. The rules below remain the contract for review and future
changes.

Key rules:

- locale code: `uk`; formatting/speech preference: `uk-UA`;
- first-visit language detection recognizes `uk` / `uk-*`, while a stored
  passenger choice remains authoritative;
- stop names, route destinations and line numbers stay exactly as Föli
  publishes them and keep their source-language metadata;
- Ukrainian plural forms must be handled correctly (one/few/many), not by an
  English-style singular/plural shortcut;
- all safety copy — Get-off alert, STOP instruction, Get off now, missed-stop
  recovery, transfer failure/recovery and degraded-data states — must be
  reviewed as operational instructions, not literal translations;
- speech uses an available `uk-UA` voice when possible, but text remains the
  source of truth and the app must degrade safely if no Ukrainian voice exists;
- the **Show to driver** passenger control is translated into Ukrainian, while
  the driver-facing card keeps Finnish + English as the primary operational
  languages; Ukrainian may be supplementary but must not replace the languages
  a local driver can reasonably be expected to read;
- Föli service-alert text is not machine-translated by the app. Source text is
  shown truthfully when Föli does not provide Ukrainian;
- Ukrainian UI must pass the same phone-width, 200% text, dark-mode, keyboard,
  VoiceOver/TalkBack and axe checks as Finnish/English.

See [Ukrainian interface plan](UKRAINIAN_INTERFACE_PLAN.md) for the staged
implementation and release criteria.


## Swedish locale — implemented, review gates open

Swedish follows the same safety and provenance rules as the other first-class
locales.

Key rules:

- locale code: `sv`; formatting/speech preference: `sv-FI`;
- first-visit language detection recognizes `sv` / `sv-*`, while a stored
  passenger choice remains authoritative;
- provider-owned text prefers Föli's own Swedish (`sv`) value, then provider
  English if Swedish is unavailable; the app never fabricates a Swedish
  translation of provider text;
- stop names and route signs retain their provider/source language metadata;
- Ride Mode keeps certainty identical to English/Finnish/Ukrainian: timetable
  evidence may warn early but does not become a stronger “Stig av nu” claim;
- transfer recovery never commits another journey until the passenger chooses
  one explicitly;
- Swedish must pass the same phone-width, 200% text, dark-mode, PWA/offline,
  Android, keyboard and axe gates as the other locales;
- native Swedish, physical VoiceOver/TalkBack and speech review remain manual
  pre-release gates.
