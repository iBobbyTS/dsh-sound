# Development

[AGENTS](https://github.com/iBobbyTS/dsh-sound/blob/main/AGENTS.md) owns development requirements. `src/index.ts` is the Host source and `src/client.ts` is the browser source. Explicit builds generate `lib/` JS, maps and the Host declarations from these sources; `locale/` owns localized metadata and settings copy.

From the fork checkout:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
```

`pnpm test` exercises Host and simulated browser contracts. It does not replace real audio/browser verification. `pnpm check` checks both type environments, behavior and independently rebuilt distribution contents. Run the affected checks, preserving the distinction between source/simulated evidence and actual playback.

## Local loading

Install this checkout using [README](../README.md). Restart the Host and refresh the page after installation. When a profile copies a `file:` dependency, edits in this checkout do not change the copy: add the same checkout again through the profile/plugin manager before refreshing. Do not assume every profile uses the same pnpm linker or dependency layout.

## Release

The package retains the upstream `@ai-galaxy/dsh-sound` name for loading. It does not grant this fork access to the upstream npm organization. Historical releases remain in [CHANGELOG](../CHANGELOG.md); confirm this fork's target, package ownership, and publishing workflow with the maintainer before an authorized release.

## Build and distribution checks

Use Node 24.11.0 and the `packageManager` pnpm version for maintenance. `pnpm install --frozen-lockfile` prepares development dependencies. `pnpm typecheck` checks Host and Client separately; `pnpm build:runtime` refreshes generated `lib/`; `pnpm test` builds an isolated candidate before testing; `pnpm check:dist` independently rebuilds and compares all artifacts, then packs and tests clean tarball/Git installation. `pnpm check` combines these with one candidate build. Installation uses prebuilt JS; it runs no plugin compiler lifecycle hook.

Automated/source checks target DSH 0.2.2-rc.1. Desktop interaction and real user accounts remain separate validation.
