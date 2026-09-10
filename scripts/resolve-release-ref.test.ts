import { $ } from 'bun';
import { expect, onTestFinished, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('it uses the checked-out commit for a normal run', async () => {
  const ctx = setupTest();
  await ctx.shell`git commit --quiet --allow-empty -m 'feat: initial version'`.quiet();
  const current = await ctx.shell`git rev-parse HEAD`.quiet();

  const result = await ctx.shell`bash ${ctx.script}`.quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe(current.stdout.toString());
});

test('it recovers an annotated release tag after main advances', async () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'package.json'), '{"version":"0.1.0"}\n');
  await ctx.shell`git add package.json`.quiet();
  await ctx.shell`git commit --quiet -m 'feat: initial version'`.quiet();
  const released = await ctx.shell`git rev-parse HEAD`.quiet();
  await ctx.shell`git tag -a '@zgeoff/slooks@0.1.0' -m release`.quiet();
  writeFileSync(join(ctx.root, 'package.json'), '{"version":"0.2.0"}\n');
  await ctx.shell`git commit --quiet -am 'feat: later version'`.quiet();

  const result = await ctx.shell`bash ${ctx.script} '@zgeoff/slooks@0.1.0'`.quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe(released.stdout.toString());
});

test('it rejects a branch as a recovery target', async () => {
  const ctx = setupTest();
  await ctx.shell`git commit --quiet --allow-empty -m 'feat: initial version'`.quiet();

  const result = await ctx.shell`bash ${ctx.script} main`.quiet().nothrow();

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe('expected a release tag such as @zgeoff/slooks@0.1.0\n');
  expect(result.stdout.toString()).toBe('');
});

test('it rejects a missing recovery tag', async () => {
  const ctx = setupTest();
  await ctx.shell`git commit --quiet --allow-empty -m 'feat: initial version'`.quiet();

  const result = await ctx.shell`bash ${ctx.script} '@zgeoff/slooks@0.3.0'`.quiet().nothrow();

  expect(result.exitCode).toBe(128);
  expect(result.stderr.toString()).toContain('Needed a single revision');
  expect(result.stdout.toString()).toBe('');
});

test('it rejects a recovery tag whose version differs from the package', async () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'package.json'), '{"version":"0.2.0"}\n');
  await ctx.shell`git add package.json`.quiet();
  await ctx.shell`git commit --quiet -m 'feat: initial version'`.quiet();
  await ctx.shell`git tag '@zgeoff/slooks@0.9.0'`.quiet();

  const result = await ctx.shell`bash ${ctx.script} '@zgeoff/slooks@0.9.0'`.quiet().nothrow();

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe('release tag does not match package.json version 0.2.0\n');
  expect(result.stdout.toString()).toBe('');
});

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'slooks-release-ref-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: root });

  const shell = new $.Shell().cwd(root).env({
    ...process.env,
    LC_ALL: 'C',
    GIT_AUTHOR_NAME: 'Release Test',
    GIT_AUTHOR_EMAIL: 'release-test@example.invalid',
    GIT_COMMITTER_NAME: 'Release Test',
    GIT_COMMITTER_EMAIL: 'release-test@example.invalid',
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'commit.gpgsign',
    GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'tag.gpgsign',
    GIT_CONFIG_VALUE_1: 'false',
    GIT_CONFIG_KEY_2: 'core.hooksPath',
    GIT_CONFIG_VALUE_2: '/dev/null',
  });

  return { root, shell, script: fileURLToPath(new URL('./resolve-release-ref.sh', import.meta.url)) };
}
