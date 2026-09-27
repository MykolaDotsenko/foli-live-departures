# Turku Departures brand guide

**Status:** final public identity  
**Product name:** **Turku Departures**

This document is the source of truth for how the product names, explains and presents itself. The repository slug may remain `foli-live-departures` until a custom-domain migration is planned; that internal URL is not the public brand.

## Brand idea

Turku Departures helps a passenger turn uncertain transport information into a clear next action.

It is an **independent transit companion for Turku / Åbo**, not an official Föli product and not a replacement for ticketing or full journey planning.

### Audience

Best fit:

- regular passengers who already know, or roughly know, their trip;
- newcomers and visitors who need a simpler recovery path;
- second-language passengers;
- people who want reassurance during the ride rather than continuous map watching;
- anyone who needs a clear distinction between live, scheduled, stale and unknown information.

### Promise

**Know what leaves next. Know when to press STOP.**

The promise is intentionally concrete. It describes what the product can help with without claiming that a browser can guarantee background alerts.

## Messaging hierarchy

### 1. Product name

**Turku Departures**

The name is not translated. Use it exactly across the app header, browser title, PWA install surface, README, screenshots and social sharing.

### 2. Descriptor

**Live bus times, disruptions & get-off alerts.**

In Finnish:

**Reaaliaikaiset bussiajat, häiriöt ja pysäkkihälytykset.**

### 3. Core line

**Know what leaves next. Know when to press STOP.**

### 4. Trust line

**Independent · Privacy-first · No account · No ads**

### 5. Attribution

The product **uses Föli open data**. Föli is the provider / official-service reference, not part of the product name.

## Naming rules

Use:

- **Turku Departures** — the product;
- **Föli open data** — data attribution;
- **Föli's website / official services** — when sending passengers to the operator;
- **Turku · Åbo** — local bilingual context in the visual lockup.

Do not use these as product names:

- Föli departures;
- Föli Live Departures;
- Turku Föli;
- variants that make the project sound like the official Föli app.

The independence statement should remain clear anywhere a passenger could reasonably mistake the product for an official service.

## Voice

The product voice is:

- **clear before clever** — labels should say what happens;
- **calm** — no alarmist or sales-heavy transport copy;
- **concrete** — use passenger actions such as “Show”, “Press STOP” and “Get me Home”;
- **truthful about uncertainty** — never upgrade scheduled or stale evidence into live certainty;
- **brief** — mobile transport use happens under time pressure;
- **helpful, not authoritative** — the app guides; official Föli services remain the source for tickets and official journey planning.

Avoid:

- “revolutionary”, “smart”, “AI-powered” or “best” without evidence;
- guarantees about locked-phone alerts;
- API vocabulary in passenger-facing copy;
- multiple names for the same feature or product.

## Visual identity

The canonical social / README artwork is:

- `docs/assets/turku-departures-social-card.jpg` — repository and README source;
- `public/social-card.jpg` — production/Open Graph copy;
- `scripts/build-social-card.mjs` — reproducible generator for both files.

The artwork belongs in brand, README and sharing surfaces. It is intentionally **not** placed inside the operational departures or Ride Mode UI, where it would compete with time-critical passenger information.

The existing visual system remains the brand system:

- primary teal: **#007985**;
- dark background: **#0c1416**;
- high-contrast white bus mark;
- warm amber reserved for time-sensitive STOP guidance;
- rounded, calm utility surfaces rather than decorative chrome;
- Turku imagery is allowed in onboarding / marketing surfaces, not behind live operational data.

The bus icon is intentionally generic and independent; it does not reproduce the official Föli wordmark.

## Contact and accountability

Public trust surfaces must answer three questions without opening developer documentation:

1. **Who made this?** — Mykola Dotsenko.
2. **How do I contact the maker?** — the footer Contact link opens the public project email.
3. **How do I report a problem?** — the footer opens a structured GitHub problem form.

The footer also exposes the source code and keeps About & privacy available for the full data-flow explanation.

When asking for reports, never ask passengers to post a home address, exact GPS history or other unnecessary personal information.

## Governance

CI runs `npm run verify:brand`.

The gate protects the user-facing surfaces from drifting back to retired names and checks that the PWA, browser metadata, README, social-card source and contact surface agree on the same identity.

Before changing the product name, update this document first and treat the change as a migration, not a copy edit.

## Framework influences

The system applies durable principles from:

- **The Brand Gap — Marty Neumeier:** brand strategy and lived customer experience must reinforce each other;
- **Designing Brand Identity — Alina Wheeler:** identity needs consistency and governance across every touchpoint;
- **Obviously Awesome — April Dunford:** position against real alternatives and lead with differentiated value for the best-fit user;
- **Building a StoryBrand — Donald Miller:** the passenger is the protagonist; the product is the guide;
- **Made to Stick — Chip Heath & Dan Heath:** keep the core idea simple, concrete and credible;
- **Don't Make Me Think — Steve Krug:** make navigation and actions obvious rather than clever.

These frameworks guide communication; actual passenger research remains the test of whether the brand works.
