import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./resolve-release-ref.sh', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'slooks-release-ref-'));
const bin = join(root, 'mock-bin');
let releasedSHA: string;
let currentSHA: string;

function runGit(...args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], { cwd: root });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function resolveRef(tag = '', releaseExists = true) {
  return Bun.spawnSync(['bash', script, tag], {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env['PATH']}`,
      GITHUB_REPOSITORY: 'zgeoff/slooks',
      TEST_RELEASE_EXISTS: releaseExists ? '1' : '0',
    },
  });
}

beforeAll(() => {
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), `#!/bin/sh
test "$1" = release && test "$2" = view &&
test "$3" = '@zgeoff/slooks@0.1.0' &&
test "$4" = --repo && test "$5" = zgeoff/slooks &&
test "$TEST_RELEASE_EXISTS" = 1
`, { mode: 0o755 });
  runGit('init', '--quiet', '--initial-branch=main');
  runGit('config', 'user.name', 'Release Test');
  runGit('config', 'user.email', 'release-test@example.invalid');
  writeFileSync(join(root, 'package.json'), '{"version":"0.1.0"}\n');
  runGit('add', 'package.json');
  runGit('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'feat: initial version');
  releasedSHA = runGit('rev-parse', 'HEAD');
  runGit('-c', 'tag.gpgsign=false', 'tag', '-a', '@zgeoff/slooks@0.1.0', '-m', 'release');
  writeFileSync(join(root, 'package.json'), '{"version":"0.2.0"}\n');
  runGit('-c', 'commit.gpgsign=false', 'commit', '--quiet', '-am', 'feat: later version');
  currentSHA = runGit('rev-parse', 'HEAD');
  runGit('-c', 'tag.gpgsign=false', 'tag', '@zgeoff/slooks@0.9.0');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

test('normal runs use the checked-out commit without a release lookup', () => {
  const result = resolveRef('', false);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString().trim()).toBe(currentSHA);
});

test('recovery resolves an annotated release tag after main advances', () => {
  const result = resolveRef('@zgeoff/slooks@0.1.0');
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString().trim()).toBe(releasedSHA);
  expect(releasedSHA).not.toBe(currentSHA);
});

test('recovery rejects a branch', () => {
  expect(resolveRef('main').exitCode).not.toBe(0);
});

test('recovery rejects a missing tag', () => {
  expect(resolveRef('@zgeoff/slooks@0.3.0').exitCode).not.toBe(0);
});

test('recovery rejects a tag whose version differs from package.json', () => {
  expect(resolveRef('@zgeoff/slooks@0.9.0').exitCode).not.toBe(0);
});

test('recovery rejects a tag without a GitHub release', () => {
  const result = resolveRef('@zgeoff/slooks@0.1.0', false);
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout.toString()).toBe('');
});
