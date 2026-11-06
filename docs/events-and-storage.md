# Events, settings, and storage

[Installation and quick start](../README.md) · [中文](events-and-storage.zh.md)

## Features

### Eight independent events (main agent)

Each event type has its **own sound and its own volume** (0–100%):

| Event | Detection (DSH 0.2.x client surface) | Default sound |
|---|---|---|
| Turn end | retained session `turn/end` with `reason.kind === 'completed'`; other sessions via list-row `running` true → false | Chime |
| Queued follow-up | same, and the agent's `inbox` projection still holds **human** input (`next-turn` / `next-step`) | Ding |
| User stop | `turn/end` with `reason.kind === 'aborted'` (`user` / `parent` / `disposed` / `legacy`) | Mute |
| Approval request | `uiSession.sessionStatus` `pendingInteraction.kind === 'approval'` | Ding |
| User question | `pendingInteraction.kind === 'question'` | Ding |
| Plan review | `pendingInteraction.kind === 'plan-review'` | Ding |
| Goal blocked | list-row goal projection `phase` entering `blocked` | Ding |
| Failure | `turn/end` `error` / `interrupted` / `aborted(hook)`; `api-session/error` | Bell |

- **Completion** respects the “quiet current session” option (current session derived from
  the list row `retainedBy.mainView`); **attention** events (approval / question / plan-review /
  goal-blocked / failure) always ring.
- **Queued follow-up** separates a turn boundary from real completion: when a `completed`
  turn still has human input in the `inbox` projection, the Host immediately opens the next
  turn (`if (!this.inbox.hasPending) return false` in `agent-loop`), so the completion chime
  is replaced by the dedicated queued sound (`queuedSound` / `queuedVolume`, Ding by
  default). Only human input counts (`source.kind === 'user'`); goal continuations and
  subagent back-fills do not. Other end reasons are untouched, so failures and user stops
  keep their own sounds. The queue is tracked from `agent/inbox/spliced` events (the same
  ordered log as `turn/end`), seeded by the `inbox` entry of `Session.projections`.
- **User stop** no longer borrows the failure sound: it is its own event, silent by default,
  with its own sound/volume if you want an audible acknowledgement. `blocked` / `max-tokens` /
  `forked` stay silent. Internal `parent` / `disposed` cancellations use the configurable stop sound, which is silent by default.
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

- **Subagent sessions** — events whose session row is explicitly marked
  `origin: 'subagent'`, including child-session turn ends, user stops, approvals,
  questions, plan reviews, goal projections, and failures. A parent ID alone records
  lineage, not delegation: ordinary forked sessions stay on the main-agent channel,
  unaffected by the subagent mute or ignore settings.

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
switches the panel between the eight main event rows and the subagent panel (its own seven
rows plus the 「忽略子代理事件」/ ignore-all-subagent-events switch). Each event row has a volume
slider on the title row and a Radio.Group of Radio.Button options below — click to select
and play; a local-file row with a choose/replace button appears when 本地文件 is selected.

## Configuration storage

- The browser half persists its configuration in **localStorage** (key
  `dsh-sound:config`), sanitizing every read and filling defaults. Uploaded
  local music files are stored in **IndexedDB** (`dsh-sound-audio`) instead —
  no localStorage quota limits.
- Config keys: `enabled`, `quietCurrent`, `ignoreSubagent`, and eight main sound + eight main
  volume fields — `completionSound` / `queuedSound` / `stoppedSound` / `approvalSound` /
  `questionSound` / `planReviewSound` / `goalBlockedSound` / `failureSound` (builtin key,
  `none`, `local`, `data:` URL, or `audio:<id>`) and `completionVolume` … `failureVolume`
  (0–1, including `queuedVolume`) — plus the matching `subagentCompletionSound` …
  `subagentFailureSound` / `subagentCompletionVolume` … `subagentFailureVolume` pairs for
  the subagent channel (seven events, completion and stop default to `none`; there is no
  `subagentQueued*`). `localFiles` keeps the last chosen local file per
  event (`completion`, … and `subagent-completion`, …) so switching to a built-in sound and
  back does not drop it.
- **Migration**: 0.2.0 configs get `defaultSound` → `completionSound`; 0.4.x configs missing
  the `stoppedSound` / `stoppedVolume` fields pick up their defaults (user stop = mute).
  Voice/TTS values degrade to the per-event default, and `attentionSound` / `workspaces` /
  `debounceMs` / global `volume` / voice settings are dropped.
- **Export / import**: the settings panel downloads the full config as JSON
  (IndexedDB audio references are inlined as data URLs) and restores it from a
  JSON file — moving browsers or machines does not require reconfiguration.
- The host half exports its `Config` schema for Loader discovery. Browser sound
  preferences remain in localStorage; no settings-service registration is needed.

## Compatibility & capability disclosure

**Compatibility**

- Node.js `>=20`; package compatibility declarations remain in `package.json`.
- DSH `0.2.2-rc.1` has been checked against source contracts and automated tests. This is not a real Desktop per-event sound acceptance result. The open peer ranges and older manifest declarations do not certify every host version.

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
