# dsh-sound

English | [中文](README.zh.md)

A DeepSeek Harness (DSH 0.2.x) plugin for the **Web UI**: play a customizable sound when a
task finishes, and an attention sound whenever something needs a human. A user-initiated
stop is its own event — silent by default, configurable on its own.

> 📬 **Submitted to [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)** — [PR #752](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/752) (pending maintainer approval)

## Screenshots

![dsh-sound settings](assets/screenshots/sound-image.png)

## Features

### Seven independent events

Each event type has its **own sound and its own volume** (0–100%):

| Event | Detection (DSH 0.2.x client surface) | Default sound |
|---|---|---|
| Turn end | retained session `turn/end` with `reason.kind === 'completed'`; other sessions via list-row `running` true → false | Chime |
| User stop | `turn/end` with `reason.kind === 'aborted'` (`user` / `parent` / `disposed` / `legacy`) | Mute |
| Approval request | `uiSession.sessionStatus` `pendingInteraction.kind === 'approval'` | Ding |
| User question | `pendingInteraction.kind === 'question'` | Ding |
| Plan review | `pendingInteraction.kind === 'plan-review'` | Ding |
| Goal blocked | list-row goal projection `phase` entering `blocked` | Ding |
| Failure | `turn/end` `error` / `interrupted` / `aborted(hook)`; `api-session/error` | Bell |

- **Completion** respects the “quiet current session” option (current session derived from
  the list row `retainedBy.mainView`); **attention** events (approval / question / plan-review /
  goal-blocked / failure) always ring.
- **User stop** no longer borrows the failure sound: it is its own event, silent by default,
  with its own sound/volume if you want an audible acknowledgement. `blocked` / `max-tokens` /
  `forked` (and the internal `parent` / `disposed` cancellations) stay silent.
- Pending human interactions come from `uiSession.sessionStatus`; a request `key` defines
  “new request”, so refresh recovery and reconnect replay of the same pending request stay
  quiet while the next request rings as usual.
- The turn-end reason is only available for **retained (open) sessions**
  (`SessionBinding.eventSource` `turn/end`); a background session that is not open exposes
  only `running`, so it is treated as completed. That is the platform boundary after DSH
  0.2.x removed the global session event stream.
- `session/jobs` frames no longer exist: one-shot subagent tasks now reach the subagent
  channel through their child session's `running` / `turn/end`.
- **Multiple tabs**: the same event rings only once (BroadcastChannel tie-break). A single
  tab plays immediately, with no 40 ms handshake.

### Separate subagent channel

Subagent-originated events are detected and routed independently from the main agent:

- **Subagent sessions** — events whose session row is marked `origin: 'subagent'` /
  `parentId` (continuable subagents), including child-session turn ends, user stops,
  approvals, questions, plan reviews, goal projections, and failures.

The settings panel adds a **子代理事件 / Subagent Events** section with seven rows (same sound
sources and per-row volume as the main events) plus an **ignore all subagent events** master
switch. Subagent completion and stop default to **mute**; the other rows are configurable.
Main-agent events are unchanged.

### Sound sources

Each event picks one sound from a **Radio.Button group** in the settings panel:

- **Built-in synthesized sounds** — Ding / Chime / Bell / Complete / Success, generated live
  with Web Audio, no audio files required.
- **Mute** — silence that event.
- **Local file** — choose any MP3/WAV/etc. file; a **file picker appears below the event row**
  once selected. Uploaded files are stored in IndexedDB (`dsh-sound-audio`), immune to the
  localStorage quota.

### Settings panel (Settings → 声音通知 / Sound Notification)

The master switch and config export/import stay visible; a **主 Agent / 子代理** tab bar
switches the panel between the seven main event rows and the subagent panel (its own seven
rows plus the 「忽略子代理事件」/ ignore-all-subagent-events switch). Each event row has a volume
slider on the title row and a Radio.Group of Radio.Button options below — click to select
and play; a local-file row with a choose/replace button appears when 本地文件 is selected.

## Install

Requires a DSH version with bundle-plugin support (`dsh.profile.bundles` + `dsh.bundle.patch`)
and `pnpm` on PATH (`corepack enable` or `npm i -g pnpm`).

```sh
# One command: pnpm installs the package and adds it to the profile's bundle layer
dsh plugin --profile web add @ai-galaxy/dsh-sound

# Restart the server (or refresh the page), then open Settings → 声音通知
```

Other profiles work the same way: `dsh plugin --profile <name> add @ai-galaxy/dsh-sound`.

The Plugins page shows this package as **Notification Sound** with a matching summary,
localized to the UI language (English, Chinese, Portuguese, Spanish). The display name and
intro come from `locale/<language>.json` (`meta.title` / `meta.description`), exported as
`./locale/*.json`; the package name is only the fallback. The same page renders the icon
declared by `package.json`'s `icon` field. A Plugins page already open before an install or
metadata change caches its snapshot — refresh it (or restart DSH) to see either update.

To track unreleased `main`, install from the GitHub source instead:

```sh
dsh plugin --profile web add github:AI-Galaxy-GPU/dsh-sound
```

### Manual install (without pnpm)

1. Copy this package and its runtime deps (`@deepseek-ai/schemastery`,
   `@deepseek-ai/cosmokit`, `@standard-schema/spec`) into
   `$DSH_HOME/profiles/web/node_modules/`.
2. Append `"@ai-galaxy/dsh-sound"` to `dsh.profile.bundles` in
   `$DSH_HOME/profiles/web/package.json`.
3. Restart `dsh web`.

## Configuration storage

- The browser half persists its configuration in **localStorage** (key
  `dsh-sound:config`), sanitizing every read and filling defaults. Uploaded
  local music files are stored in **IndexedDB** (`dsh-sound-audio`) instead —
  no localStorage quota limits.
- Config keys: `enabled`, `quietCurrent`, `ignoreSubagent`, and seven main sound + seven main
  volume fields — `completionSound` / `stoppedSound` / `approvalSound` / `questionSound` /
  `planReviewSound` / `goalBlockedSound` / `failureSound` (builtin key, `none`, `local`,
  `data:` URL, or `audio:<id>`) and `completionVolume` … `failureVolume` (0–1) — plus the
  matching `subagentCompletionSound` … `subagentFailureSound` /
  `subagentCompletionVolume` … `subagentFailureVolume` pairs for the subagent channel
  (completion and stop default to `none`). `localFiles` keeps the last chosen local file per
  event (`completion`, … and `subagent-completion`, …) so switching to a built-in sound and
  back does not drop it.
- **Migration**: 0.2.0 configs get `defaultSound` → `completionSound`; 0.4.x configs missing
  the `stoppedSound` / `stoppedVolume` fields pick up their defaults (user stop = mute).
  Voice/TTS values degrade to the per-event default, and `attentionSound` / `workspaces` /
  `debounceMs` / global `volume` / voice settings are dropped.
- **Export / import**: the settings panel downloads the full config as JSON
  (IndexedDB audio references are inlined as data URLs) and restores it from a
  JSON file — moving browsers or machines does not require reconfiguration.
- The host half also registers the `dsh-sound` settings namespace: on rc.6 the
  settings API allowlist (`WEB_SETTINGS_NAMESPACES` in `dsh-host-apiproxy`) does not expose
  third-party namespaces to browsers, so the client does not depend on `settingsScope` today;
  the registration keeps the migration path open for future releases.

## Compatibility & capability disclosure

**Compatibility**

- Node.js: `>=20` (`engines.node`).
- DSH: `0.2.1-rc.2` and `0.2.1-rc.3` (declared as `compatible` in
  `dsh.compatibility.dshReleases`). Those releases replaced the 0.1.5 client surface
  (`connection.api.events`, `approval`/`question requested` and `session/jobs` frames) with
  `ctx.remote` forwarded events plus `uiSession.sessionStatus`; 0.1.5 and earlier are
  **no longer supported**.
- Verification (2026-10-28): every event name, payload, and control-flow assumption was
  checked against the `deepseek-harness` 0.2.1 source (waterfall registration order,
  `pendingInteraction` `kind`/`key`, `turn/end` `reason.kind`, `api-session/error`, goal
  projection) and covered by the simulated runtime in `tools/test-client.mjs`. The package
  is also installed in a local desktop profile as a linked dependency, where the plugin
  card renders the declared icon and the localized title/intro. Per-event sound behaviour
  was not re-tested in a live session for this release.

**Dependencies**

- Host half: `@deepseek-ai/schemastery` (settings schema) plus the peer
  `@deepseek-ai/cordis`. No other runtime dependencies.
- Client half: React is provided by the host application through the client module table;
  the package ships no copies of it. The client half only consumes host-exposed services
  (`sessions` / `locale` / `slots`, plus optional `uiSession` / `remote`).

**Capabilities and permissions**

- Local files: the settings panel opens the browser's own file picker for an audio
  file the user selects; the audio is stored in IndexedDB (`dsh-sound-audio`). There is
  no filesystem access outside the browser sandbox and no automatic file scanning.
- Storage: configuration lives in `localStorage` (`dsh-sound:config`), audio files in
  IndexedDB.
- No network requests, no external services, no shell or command execution, no
  credentials, no native artifacts, and no install lifecycle scripts
  (`preinstall` / `install` / `postinstall` / `prepare` are absent).

**Failure bounds**

- Playback failures (browser autoplay policy, unsupported audio) stay silent; the UI
  keeps working.
- Unavailable IndexedDB/localStorage degrades to in-memory configuration; unreadable
  audio references are ignored.
- Unavailable or unparseable event streams degrade to session-snapshot diffing;
  malformed frames are ignored without crashing.
- Every configuration read is sanitized against the known field set and defaults.

## Development

```sh
npm test      # 100+ assertions across host and client halves (Node only, no browser needed)
npm run check # syntax check
```

Layout:

> **Profile development note**: the profile's pnpm uses `nodeLinker: hoisted`,
> which COPIES `file:` dependencies into `node_modules` at install time —
> edits to this checkout do not reach the running app until you either
> re-run `pnpm --dir ~/.dsh/profiles/web update @ai-galaxy/dsh-sound` or replace the
> copied directory with a symlink to this checkout. The web server reads
> bundle content per request (only the boot-page rev hash is cached at
> startup), so after refreshing the copy a browser hard-refresh (Cmd+Shift+R)
> is enough — no server restart needed.

- `lib/index.js` — host half: registers the settings namespace (schema + defaults)
- `lib/client.js` — browser bundle: event detection, sound engine
  (Web Audio / IndexedDB audio), settings panel
- `lib/types/index.d.ts` — host-side type declarations
- `cordis.patch.yml` — bundle patch layer (inserts the `dsh-sound` row)
- `tools/` — tests and verification scripts (not shipped in the npm package)

## Publish

Published as `@ai-galaxy/dsh-sound` (requires membership of the `ai-galaxy` npm org;
`publishConfig.access` is already `public`).

```sh
npm login                       # npm account (2FA recommended)
npm publish --access public
```

## License

[MIT](LICENSE)
