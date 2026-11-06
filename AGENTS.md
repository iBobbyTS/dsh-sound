# Development rules

## Purpose and boundaries

Provide local browser sound notifications for DSH events, with independent main/subagent channels and per-event settings. Browser settings/audio stay local except for an explicit user export; this plugin does not add model calls, TTS, external services, or shell execution.

- A session's explicit `origin: 'subagent'` identifies delegation. Parent IDs alone record lineage; ordinary forks keep the main channel.
- Establish a baseline before notifying. Opening history, replaying a connection, or restoring the same pending request must not replay old sounds. Preserve cross-tab deduplication and session-scoped cleanup.
- Distinguish human queued input from completion. Stop sounds are configurable and default to mute; hook aborts are failures. Keep event kinds, defaults, schema/types, and localized UI aligned.
- Preserve imported audio and configuration on unrelated changes. Keep playback/storage failures bounded so unavailable browser capabilities do not break the UI.
- Installation examples must load this fork's checkout; upstream attribution and package name are not upstream publishing authority. Keep secrets and personal data out of commits. Pushing, publishing, and tags require explicit user authorization.

## Owners and checks

[README](README.md) and its Chinese translation are the human entry. [Events and storage](docs/events-and-storage.md) owns detection/settings details; [development](docs/development.md) owns local loading and checks. CHANGELOG is history.

Use the affected `npm test` and `npm run check` checks; distinguish simulated browser contracts from real playback. Verify both documentation languages, links, and package document delivery after documentation changes.
