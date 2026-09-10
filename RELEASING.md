# Releasing

Releases are automated off `main` by [release-please](https://github.com/googleapis/release-please)
in manifest mode, with the binaries, the Homebrew formula, and an OIDC npm publish in
`.github/workflows/main.yml`. No npm tokens live in CI. The setup mirrors
[zgeoff/atc](https://github.com/zgeoff/atc/blob/main/RELEASING.md).

## Flow

1. A `feat:` or `fix:` PR merges to `main`.
2. `main.yml` runs release-please, which opens or updates the release PR: version bump per
   conventional-commit type, `CHANGELOG.md`, manifest update. The job syncs `bun.lock` on the PR
   branch and enables auto-merge. GitHub waits for all required PR checks before the merge.
3. The merge triggers `main.yml` again: release-please tags `@zgeoff/slooks@X.Y.Z` and creates the
   GitHub release.
4. The same run attaches the compiled binaries to the release, pushes the Homebrew formula, and
   publishes to npm, in that order, so an npm failure leaves the binaries and the tap intact.

## Binaries

`binaries.yml` compiles one static binary per platform (`bun run build:binaries`, cross-compiled
from one Linux runner) and smoke-tests each on its own platform: `--version`, `help`, `events`
with no daemon, and `send` with no token. The PR workflow runs it as a check. The main workflow runs
it before the release job, which uploads `dist/slooks-*` and `dist/SHA256SUMS` to the GitHub release
with `--clobber`, so a re-run replaces what a failed run left behind.

The binary is `src/main.ts` compiled; `bin/slooks` imports the same module for a source run.

## One-time setup

### GitHub App

The release App creates PRs and enables auto-merge so their CI and merge events trigger workflows.
Configure both the client ID and private key before the first merge. An ID without a private key
fails the token step before release-please starts.

1. Install the `zgeoff-release-bot` App (GitHub, Settings, Developer settings, GitHub Apps) on
   `zgeoff/slooks`. It needs Contents and Pull requests, read and write.
2. In the repo settings, add the Actions variable `RELEASE_APP_ID` (the App's client id) and the
   Actions secret `RELEASE_APP_PRIVATE_KEY` (the `.pem` contents).
3. Repo Settings, Actions, General: check "Allow GitHub Actions to create and approve pull
   requests".

### Required checks

Enable "Allow auto-merge" in the repository settings. Protect `main` with these required checks:
`gitleaks`, `checks`, `binaries / build`, and all four `binaries / smoke (...)` checks from the PR
workflow. Require checks from the GitHub Actions App. Do not give the release App a bypass.
The workflow uses `--auto --match-head-commit` so GitHub waits for those checks on the current PR
commit. The main workflow does not cancel an active release when another push arrives.

### Homebrew tap

The formula lives in `zgeoff/homebrew-tap` under `Formula/slooks.rb`.
`scripts/build-formula.sh <version> dist/SHA256SUMS` prints it, and the release job commits it with
a token from the release App:

1. Install the release App on `homebrew-tap` as well.
2. Add the Actions variable `HOMEBREW_TAP` = `homebrew-tap` (the repository name, not the slug).

An empty `HOMEBREW_TAP` skips the formula. If the variable is set but the App lacks access,
the tap step fails and npm does not run until access is fixed.
`brew install zgeoff/tap/slooks` then resolves to that repository.

### First publish

npm trusted publishing can't create a package that doesn't exist yet, so the first publish is
manual, then OIDC takes over:

```sh
npm login
scripts/first-publish.sh
```

The script publishes the current version from your machine and prints the trusted publisher
settings to add on npmjs.com (Access, Trusted Publisher: repo `zgeoff/slooks`, workflow
`main.yml`, no environment, direct `npm publish` allowed). The script uses Bun to pack and npm
to publish with your npm login. Until the trusted publisher is configured, the npm step fails
and the rest of the release stands.

## Troubleshooting

- Release PR open but nothing published: check its required CI results and auto-merge state.
  If the token step failed before a PR was created, fix the App secret or installation and re-run
  the failed workflow.
- Tagged and released but a later step failed: re-run the publish steps with

  ```sh
  gh workflow run main.yml --ref main -f release_tag='@zgeoff/slooks@0.1.0'
  ```

  Replace the example tag with the failed release's tag. Recovery checks that the GitHub release
  exists and its tag matches `package.json`, then resolves it to a commit SHA. Checks, binary
  builds, and publication all use that SHA, even if `main` has advanced. Assets are re-uploaded
  with `--clobber`, and versions already on npm are skipped.

- Cutting a specific version: put `Release-As: X.Y.Z` in the footer of a commit that lands on
  `main`. With squash merges that is the squash commit body:
  `gh pr merge <n> --squash --body 'Release-As: X.Y.Z'`.
