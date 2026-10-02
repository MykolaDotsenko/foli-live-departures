# Manual release-gate ledger

`config/release-gates.json` is the machine-checked ledger for evidence that repository automation cannot honestly manufacture.

A gate may be `open` or `closed`. Closing requires a `YYYY-MM-DD` completion date and at least one explicit evidence reference. The verifier checks structure and prevents evidence-free closure; it does not decide whether a human test was good enough.

The ledger covers repository protection, native-language review, VoiceOver/TalkBack, physical iPhone/Android lifecycle, real-bus validation, custom domain, production signing/upgrade evidence and final Google Play review/upload.

Run:

```bash
npm run verify:release-readiness
```

Do not close a gate merely because related code or automation merged.
