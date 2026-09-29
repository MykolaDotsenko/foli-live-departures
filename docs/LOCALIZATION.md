# Localization

The interface is available in English and Finnish. It follows the phone's
language on a first visit (Finnish for `fi`, English for everything else) and
the passenger's own choice from the header switch after that. The choice is
kept on the phone.

Swedish is the obvious next language: Turku is officially bilingual and Föli
publishes its data in Finnish, Swedish and English.

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

`src/i18n/i18n.test.js` fails when the code asks for a phrase the Finnish
dictionary lacks, when a translation's placeholders differ from its key's,
when a dictionary keeps a phrase nothing asks for, or when a component names
a control in literal English, whether the attribute is quoted or an
expression. ESLint (`react/jsx-no-literals`) catches text between tags,
including `{"text"}` and template literals, and an end-to-end test looks for
English left on the Finnish screens.

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
