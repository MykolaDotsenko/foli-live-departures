# Repository governance

Turku Departures treats repository configuration as part of the production
security boundary.

## Required `master` protection

The repository owner must keep `master` protected with all of the following:

- changes enter through pull requests;
- the current CI checks are required before merge;
- force-push is disabled;
- branch deletion is disabled;
- the branch is required to be up to date when that remains compatible with the
  repository's merge workflow;
- production deployment/release environments are not writable by untrusted
  automation.

The codebase adds a second, fail-closed release boundary: production Pages,
`android-latest`, and production Android publication verify that the exact
candidate SHA is the merge commit of a GitHub PR merged into `master`.
This is defense in depth, not a substitute for branch protection.

## Android production environment

`android-production` must be a protected GitHub environment. Persistent
signing material belongs there, not in repository-level variables and never in
source control.

Required secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

A manual approval rule may be added for production signing/publication.

## Audit procedure

Before a release candidate is frozen:

1. verify `master` reports as protected in GitHub;
2. verify required checks match the checks actually emitted by CI;
3. verify force-push and deletion are disabled;
4. verify `android-production` has the intended reviewers/secrets;
5. run the repository workflow-contract checks;
6. verify the release candidate is a merged-PR commit, not a direct push.

If repository administration cannot be inspected by automation, that limitation
must remain explicit in the production-readiness checklist rather than being
marked complete.
