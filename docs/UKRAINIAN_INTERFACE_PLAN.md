# Ukrainian interface implementation plan

This document defines the implementation and release-review contract for the
Ukrainian interface in Turku Departures.

**Implementation status (2026-10-02):** PR #139 added the generic locale
registry, lazy Ukrainian dictionary, Ukrainian plural/formatting rules and the
full passenger UI. Ukrainian is currently reachable through the generic
language switch in the pre-field build. This does **not** close native-language,
physical-device accessibility or speech review; those remain explicit manual
release gates.

The target is not "most labels translated". Broad release requires the full
passenger flow to be safe, complete and test-protected.

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
- direct, one-transfer and two-transfer journeys;
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

## Phase 1 — make i18n locale-agnostic — implemented in PR #139

- [x] replace Finnish-specific locale assumptions with a locale registry;
- [x] support `en`, `fi`, and `uk` as explicit locale identifiers;
- [x] map browser `uk` / `uk-*` to Ukrainian on first visit;
- [x] keep an existing stored language choice authoritative;
- [x] make `intlLocale()` return the correct locale per enabled language;
- [x] make document/root language metadata follow the selected UI language;
- [x] ensure native Android and PWA use the same persisted locale contract;
- [x] generalize dictionary completeness/placeholder/stale-key checks across
      the enabled locale registry.

Acceptance remains fail-closed: a dictionary load failure falls back to English
rather than rendering a half-translated interface.

## Phase 2 — Ukrainian language model — implemented in PR #139

The Ukrainian dictionary now follows the same modular structure as Finnish.

Requirements:

- [x] use `uk-UA` for date/number/speech formatting where a regional locale
      is required;
- [x] implement correct Ukrainian plural rules (one/few/many/other);
- [x] preserve placeholders exactly;
- [x] keep transit clock format 24-hour;
- [x] use concise passenger language suitable for reading on a moving bus;
- [x] never decline/translate Föli stop and destination names;
- [x] keep provider/source text truthful when no Ukrainian source exists.

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

## Phase 3 — safety-critical surfaces first — translation implemented; manual review open

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

## Phase 4 — complete passenger UI — implemented in PR #139

Translate the remaining surfaces:

- [x] header/navigation/language switcher;
- [x] stop search, favourites and recents;
- [x] Nearby;
- [x] board/filter/service updates;
- [x] Journey Assistant/place search/provider handoff;
- [x] My Places setup and backup stops;
- [x] Get me Home;
- [x] printable/shareable recovery information;
- [x] About & privacy;
- [x] Help guide;
- [x] iPhone install hint;
- [x] errors, empty states and all accessibility labels.

No English fallback should be visible in a normal Ukrainian flow.

## Phase 5 — driver card and provider-language boundaries

The passenger-facing button/control is Ukrainian.

The actual **driver-facing card** keeps Finnish and English as the primary
operational languages. Ukrainian may be added as supplementary passenger
context, but must not displace Finnish/English.

Föli-supplied stop names, destination signs and service-alert text remain
source data. The app does not invent Ukrainian translations for provider data.

## Phase 6 — automated QA — implemented in PR #142

Automated and merge-gated:

- [x] Ukrainian dictionary completeness;
- [x] placeholder equality;
- [x] unused Ukrainian translation detection;
- [x] source-level guard against literal English accessible labels bypassing the translator;
- [x] Ukrainian first-visit language selection in locale-unit tests;
- [x] plural-rule tests for counts such as 1, 2, 5, 21, 22, 25;
- [x] generated lazy locale-pack validation, including HTTP failure, malformed payload and non-string-entry fail-closed paths;
- [x] cross-browser language picker, choosing **UK → SV → EN** directly from Finnish, asserting Ukrainian UI is actually rendered;
- [x] dedicated Ukrainian Ride Mode component tests, including NEXT/NOW safety semantics;
- [x] dedicated transfer/recovery Ukrainian component tests with explicit-selection/no-silent-switch assertions;
- [x] Ukrainian-specific axe WCAG A/AA pass after switching into Ukrainian;
- [x] 320 px / 360 px / 412 px Ukrainian overflow checks;
- [x] 200% Ukrainian text checks;
- [x] Ukrainian dark-theme check;
- [x] persisted Ukrainian reload plus production PWA/offline reopen;
- [x] Android emulator/WebView smoke preserving Ukrainian selection across reload.

A missing Ukrainian phrase or stale Ukrainian key fails CI exactly as a Finnish
or Swedish localization defect does. PR #142 keeps locale payload growth inside
the unchanged aggregate locale budget by storing the shared English source-key
table once and loading compact per-locale value arrays; malformed/misaligned
packs and runtime grammar-slot mismatches fail closed.

## Phase 7 — language and accessibility review — manual gate, not yet complete

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

Ukrainian is already reachable in the pre-field language switch so the
complete flow can be exercised before field freeze. Broad public-release
acceptance remains blocked until:

- all enabled-locale completeness gates pass;
- unit/integration/browser/Android regression suites are green;
- every safety-critical Ride Mode and transfer-recovery phrase is translated;
- no normal Ukrainian passenger flow falls back to English UI copy;
- native Ukrainian review is complete;
- physical-phone accessibility/speech smoke is complete.

## Follow-up

Swedish is implemented as the next first-class locale in PR #142 using the
same generalized registry and automated QA model. Native Swedish review and
physical-device accessibility/speech review remain separate manual gates.
