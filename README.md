# dsh-sound

English · [中文](README.zh.md)

Sound notifications for DSH Web UI and Desktop: turn completion, queued human follow-ups, stops, approvals, questions, plan reviews, blocked goals, and failures. Main and subagent channels have separate sounds and volumes; custom audio is stored in the browser.

This is the [iBobbyTS fork](https://github.com/iBobbyTS/dsh-sound) of [AI-Galaxy-GPU/dsh-sound](https://github.com/AI-Galaxy-GPU/dsh-sound). Install this checkout to get the fork's changes; the upstream npm package does not include them.

## Install

Requires DSH, Node.js `>=20`, and pnpm for DSH plugin installation. The repository already contains the runtime files and needs no build.

```sh
git clone https://github.com/iBobbyTS/dsh-sound.git
cd dsh-sound
dsh plugin --profile web add "$PWD"
```

In Desktop, select this directory in the application's plugin manager; the application owns the `desktop` profile. Use a full directory path in Windows cmd. Restart the DSH Host and refresh the page. To update, update this checkout and add the same directory again in the same profile.

## Use

Open Settings → Sound Notification. Choose a sound and volume for each event. The main panel has eight event rows; the subagent panel has seven and an ignore-all switch. Stop sounds default to mute. Ordinary forks use the main channel; only explicit subagent sessions use the subagent channel.

Audio files live in IndexedDB and settings in localStorage. Browser autoplay restrictions may prevent playback; choosing a sound previews it. Import/export settings to transfer custom audio and preferences.

## Documentation

- [Events, settings, storage, and compatibility](docs/events-and-storage.md)
- [Development](docs/development.md) · [Development rules](https://github.com/iBobbyTS/dsh-sound/blob/main/AGENTS.md)
- [History](CHANGELOG.md) · [MIT license](LICENSE)
