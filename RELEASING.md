# Releasing

Releases are automated off `main` by [release-please](https://github.com/googleapis/release-please)
in manifest mode, with the binaries, the Homebrew formula, and an OIDC npm publish in
`.github/workflows/main.yml`. No npm tokens live in CI. The setup mirrors
[zgeoff/atc](https://github.com/zgeoff/atc/blob/main/RELEASING.md).

## Flow

1. A `feat:` or `fix:` PR merges to `main`.
2. `main.yml` runs release-please, which opens or updates the release PR: version bump per
   conventional-commit type, `CHANGELOG.md`, manifest update. The job syncs `bun.lock` on the PR
   branch and auto-merges the PR.
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

`GITHUB_TOKEN` events don't trigger workflows, so a release PR it creates gets no CI and its merge
would never fire the publish run. The workflow therefore uses a GitHub App token; without it,
release PRs are still created but must be merged by hand.

1. Install the `zgeoff-release` App (GitHub, Settings, Developer settings, GitHub Apps) on
   `zgeoff/slooks`. It needs Contents and Pull requests, read and write.
2. In the repo settings, add the Actions variable `RELEASE_APP_ID` (the App's client id) and the
   Actions secret `RELEASE_APP_PRIVATE_KEY` (the `.pem` contents).
3. Repo Settings, Actions, General: check "Allow GitHub Actions to create and approve pull
   requests".

### Homebrew tap

The formula lives in `zgeoff/homebrew-tap` under `Formula/slooks.rb`.
`scripts/build-formula.sh <version> dist/SHA256SUMS` prints it, and the release job commits it with
a token from the release App:

1. Install the release App on `homebrew-tap` as well.
2. Add the Actions variable `HOMEBREW_TAP` = `homebrew-tap` (the repository name, not the slug).

With either missing, the release job leaves the formula alone and every other step still runs.
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
`main.yml`). Until that is done the npm step fails and the rest of the release stands.

## Troubleshooting

- Release PR open but nothing published: the App isn't configured or its token step failed. Merge
  the PR by hand from the GitHub UI; that triggers the publish run.
- Tagged and released but a later step failed: re-run the publish steps with

  ```sh
  gh workflow run main.yml -f republish_paths='["."]'
  ```

  Assets are re-uploaded with `--clobber`, the formula commit is a no-op at the same version, and
  versions already on npm are skipped.

- Cutting a specific version: put `Release-As: X.Y.Z` in the footer of a commit that lands on
  `main`. With squash merges that is the squash commit body:
  `gh pr merge <n> --squash --body 'Release-As: X.Y.Z'`.
