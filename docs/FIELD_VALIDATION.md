# Real-bus field validation

Automated tests prove deterministic contracts. This checklist proves that those contracts survive real buses, real phones, real Föli latency and real GPS.

## Devices

Record at least:

- one current physical Android phone;
- one current physical iPhone;
- browser/PWA version and OS version;
- whether the app was foreground, backgrounded and restored.

## Minimum ride matrix

Run this matrix only after the feature-complete pre-field release candidate is
frozen. Complete at least 20 journeys:

### Direct rides — 5

Cover:

- dense city-centre stop spacing;
- a longer suburban segment;
- a loop/repeated-stop route if available;
- a delayed bus;
- a normal on-time bus.

For every ride verify:

- [ ] concrete bus identity is correct;
- [ ] SOON is not shown prematurely;
- [ ] NEXT appears only with sufficient evidence;
- [ ] STOP instruction is useful and not dangerously late;
- [ ] NOW appears at/after the target evidence boundary;
- [ ] leaving the bus ends cleanly;
- [ ] no stale live observation is presented as fresh.

### One-transfer journeys — 5

Cover both same-stop and cross-platform transfers when possible.

Verify:

- [ ] first leg remains authoritative in Ride Mode;
- [ ] next committed connection stays visible without displacing urgent get-off guidance;
- [ ] transfer instructions name the right stop/platform context;
- [ ] second leg revalidates with fresh SIRI;
- [ ] delay/early-running changes catchability correctly;
- [ ] cancellation/disappearance never silently switches the journey;
- [ ] recovery retains the destination and requires explicit replacement choice.

### Two-transfer journeys — 5

Cover both same-stop and cross-platform changes when practical.

Verify:

- [ ] leg 1 remains authoritative in Ride Mode until the exact first transfer occurrence;
- [ ] leg 2 becomes current only after authoritative handoff;
- [ ] leg 3 never silently replaces an earlier committed leg;
- [ ] both future legs are revalidated from fresh SIRI without timetable data being presented as live;
- [ ] a distant future-leg problem is recorded without interrupting the current ride prematurely;
- [ ] the problem becomes actionable at the next safe transfer boundary;
- [ ] both transfer instructions identify the correct stop/platform context;
- [ ] no cancellation, disappearance or delay causes a silent itinerary switch.

### Degraded / recovery scenarios — 5

Safely exercise combinations such as:

- weak GPS / phone in pocket;
- foreground → background → foreground;
- temporary data loss;
- stale SIRI snapshot;
- connection becomes unreliable;
- intentionally missed transfer;
- target stop already passed.

Verify fail-closed behaviour and truthful copy.

## Accessibility smoke

On the physical phones:

- [ ] VoiceOver: start a get-off alert, hear stage changes, use recovery;
- [ ] TalkBack: same flow;
- [ ] focus returns to a sensible control after dialogs/setup close;
- [ ] 200% text does not hide the urgent Ride Mode action;
- [ ] vibration/sound behaviour matches the text and user permissions.

## Evidence to record

For each run keep:

- the local sanitized field-test report from the exact release candidate when field-test mode is enabled;
- date/time;
- route and boarding/target stop IDs;
- device/OS/browser;
- planned vs observed stage timings;
- whether SIRI/GPS was available;
- any false positive, false negative or confusing instruction;
- screenshot only when it does not expose private location information.

A release blocker is any reproducible case where the app gives an unsafe definitive instruction from stale/ambiguous evidence.
