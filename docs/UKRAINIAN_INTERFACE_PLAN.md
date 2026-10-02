# Ukrainian interface implementation plan

This document defines the implementation contract for adding a complete
Ukrainian interface to Turku Departures.

The target is not "most labels translated". Ukrainian becomes selectable only
after the full passenger flow is safe, complete and test-protected.

## Priority and scope

**Priority:** P1 localization expansion after the current production-hardening
gates. It does not block the existing Finnish + English v1 launch, but once
implementation begins it must not ship partially.

In scope:

- web/PWA;
- Android WebView build;
- first-run language detection;
- language switcher and persisted language choice;
- departure board and filters;
- service/degraded/offline states;
- Journey Assistant;
- direct and one-transfer journeys;
- Active Journey;
- Get-off alert / Ride Mode;
- transfer revalidation and recovery;
- My Places / Get me Home;
- driver/recovery cards;
- About/privacy/help/install guidance;
- notifications, accessible names and spoken announcements;
- tests, screenshots where language-specific layout matters, and CI gates.

Out of scope:

- machine-translating Föli service alerts;
- translating stop names, route destination names or line identifiers;
- weakening Finnish/English coverage to make room for Ukrainian.

## Phase 1 — make i18n locale-agnostic

Before translating copy:

- [ ] replace Finnish-specific locale assumptions with a locale registry;
- [ ] support `en`, `fi`, and `uk` as explicit locale identifiers;
- [ ] map browser `uk` / `uk-*` to Ukrainian on first visit;
- [ ] keep an existing stored language choice authoritative;
- [ ] make `intlLocale()` return the correct locale per enabled language;
- [ ] make document/root language metadata follow the selected UI language;
- [ ] ensure native Android and PWA use the same persisted locale contract;
- [ ] generalize translation completeness tests so every enabled dictionary is
      checked for missing keys, stale keys and placeholder mismatches.

Acceptance: adding an incomplete `uk` dictionary must fail CI.

## Phase 2 — Ukrainian language model

Create the Ukrainian dictionary in the same modular structure as Finnish.

Requirements:

- [ ] use `uk-UA` for date/number/speech formatting where a regional locale
      is required;
- [ ] implement correct Ukrainian plural rules (one/few/many/other);
- [ ] preserve placeholders exactly;
- [ ] keep transit clock format 24-hour;
- [ ] use concise passenger language suitable for reading on a moving bus;
- [ ] never decline/translate Föli stop and destination names;
- [ ] keep provider/source text truthful when no Ukrainian source exists.

Core terminology to settle before bulk translation:

| English concept | Ukrainian target direction |
| --- | --- |
| stop | зупинка |
| departures | відправлення / рейси, chosen by context |
| line | маршрут |
| live | наживо / актуальні дані, chosen by context |
| timetable | розклад |
| service updates | зміни в русі |
| cancelled | скасовано |
| offline | немає з’єднання |
| Get-off alert | сповіщення про вихід |
| Alert on | сповіщення увімкнено |
| Turn off alert | вимкнути сповіщення |
| press STOP | натисніть STOP |
| Get off now | виходьте зараз |
| My Places | Мої місця |
| Home / School / Work | Дім / Школа / Робота |
| Get me Home | Провести додому |
| Show to driver | Показати водієві |

Final wording is validated in-context, not accepted from the glossary alone.

## Phase 3 — safety-critical surfaces first

Translate and manually review these before general UI:

1. Get-off alert setup;
2. BOARDED / SOON / NEXT / NOW / MISSED states;
3. STOP and Get off now instructions;
4. stale/degraded/live-confidence notices;
5. missed-stop recovery;
6. one-transfer instructions;
7. second-leg cancellation/delay/disappearance recovery;
8. offline/reload recovery;
9. notification titles/bodies and spoken announcements.

Safety acceptance:

- [ ] no instruction becomes more certain in Ukrainian than in English;
- [ ] fail-closed states remain fail-closed;
- [ ] urgent actions stay short at 320–360 px and 200% text;
- [ ] screen-reader order still puts the urgent action first;
- [ ] missing Ukrainian speech voice never suppresses visible guidance.

## Phase 4 — complete passenger UI

Translate the remaining surfaces:

- [ ] header/navigation/language switcher;
- [ ] stop search, favourites and recents;
- [ ] Nearby;
- [ ] board/filter/service updates;
- [ ] Journey Assistant/place search/provider handoff;
- [ ] My Places setup and backup stops;
- [ ] Get me Home;
- [ ] printable/shareable recovery information;
- [ ] About & privacy;
- [ ] Help guide;
- [ ] iPhone install hint;
- [ ] errors, empty states and all accessibility labels.

No English fallback should be visible in a normal Ukrainian flow.

## Phase 5 — driver card and provider-language boundaries

The passenger-facing button/control is Ukrainian.

The actual **driver-facing card** keeps Finnish and English as the primary
operational languages. Ukrainian may be added as supplementary passenger
context, but must not displace Finnish/English.

Föli-supplied stop names, destination signs and service-alert text remain
source data. The app does not invent Ukrainian translations for provider data.

## Phase 6 — automated QA

Extend CI with:

- [ ] Ukrainian dictionary completeness;
- [ ] placeholder equality;
- [ ] unused Ukrainian translation detection;
- [ ] no literal English accessibility labels on Ukrainian screens;
- [ ] Ukrainian first-visit language detection tests;
- [ ] persisted switch EN ⇄ FI ⇄ UK;
- [ ] plural-rule tests for counts such as 1, 2, 5, 21, 22, 25;
- [ ] Ukrainian Ride Mode component tests;
- [ ] transfer/recovery Ukrainian component tests;
- [ ] browser E2E Ukrainian smoke on a phone viewport;
- [ ] axe WCAG A/AA checks;
- [ ] 320 px / 360 px / 412 px overflow checks;
- [ ] 200% text checks;
- [ ] dark-theme check;
- [ ] PWA/offline reopen in Ukrainian;
- [ ] Android emulator smoke preserving Ukrainian selection.

A missing Ukrainian phrase or stale Ukrainian key must fail CI exactly as a
Finnish localization defect does.

## Phase 7 — language and accessibility review

Before declaring Ukrainian complete:

- [ ] native Ukrainian language review of the full phone flow;
- [ ] separate review of safety/imperative wording;
- [ ] TalkBack smoke in Ukrainian;
- [ ] VoiceOver smoke in Ukrainian;
- [ ] verify available Ukrainian speech synthesis behaviour on representative
      Android and iPhone devices;
- [ ] verify stop names are not mispronounced because the UI language changed;
- [ ] verify driver-facing material remains usable locally.

## Release criteria

Ukrainian may appear in the production language switcher only when:

- all enabled-locale completeness gates pass;
- unit/integration/browser/Android regression suites are green;
- every safety-critical Ride Mode and transfer-recovery phrase is translated;
- no normal Ukrainian passenger flow falls back to English UI copy;
- native Ukrainian review is complete;
- physical-phone accessibility/speech smoke is complete.

## Follow-up

Swedish remains a separate localization milestone. The i18n generalization
done for Ukrainian should intentionally make Swedish cheaper: adding `sv`
should be mostly dictionary/review work rather than another architecture
rewrite.
