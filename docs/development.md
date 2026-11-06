# Development

[AGENTS](https://github.com/iBobbyTS/dsh-sound/blob/main/AGENTS.md) owns development requirements. `lib/index.js` is the editable Host entry and `lib/client.js` is the editable browser bundle; this package has no build step. `lib/types/index.d.ts` describes the Host API; `locale/` owns localized metadata and settings copy.

From the fork checkout:

```sh
npm ci --ignore-scripts
npm test
npm run check
```

`npm test` exercises Host and simulated browser contracts. It does not replace real audio/browser verification. `npm run check` checks syntax. Run the affected checks, preserving the distinction between source/simulated evidence and actual playback.

## Local loading

Install this checkout using [README](../README.md). Restart the Host and refresh the page after installation. When a profile copies a `file:` dependency, edits in this checkout do not change the copy: add the same checkout again through the profile/plugin manager before refreshing. Do not assume every profile uses the same pnpm linker or dependency layout.

## Release

The package retains the upstream `@ai-galaxy/dsh-sound` name for loading. It does not grant this fork access to the upstream npm organization. Historical releases remain in [CHANGELOG](../CHANGELOG.md); confirm this fork's target, package ownership, and publishing workflow with the maintainer before an authorized release.
