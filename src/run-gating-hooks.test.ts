import { describe, expect, test } from 'bun:test';
import { runGatingHooks } from './run-gating-hooks.ts';
import type { Action, HookEntry, SlooksEvent } from './types.ts';

const action: Action = { action: 'send', channel: 'C1', text: 'hello', ts: null, thread_ts: null, reaction: null };

const event: SlooksEvent = {
  ev: 'PreAction',
  event_id: 'local-1',
  time: '2026-09-10T00:00:00.000Z',
  ts: null,
  channel: { id: 'C1', name: null, type: null },
  user: { id: 'U1', name: 'alice', is_me: true },
  text: 'hello',
  thread_ts: null,
  subtype: null,
  mentions_me: false,
  permalink: null,
  action: 'send',
  raw: null,
};

const entry = (command: string, overrides: Partial<HookEntry> = {}): HookEntry => ({
  command,
  timeout: 2000,
  debounce: null,
  channel: null,
  channel_type: null,
  user: null,
  not_user: null,
  subtype: null,
  text: null,
  thread: 'any',
  reaction: null,
  action: null,
  ...overrides,
});

describe('runGatingHooks', () => {
  test('no hooks allows the action unchanged', async () => {
    expect(await runGatingHooks([], event, action)).toEqual({ blocked: false, action });
  });

  test('exit 2 blocks with stderr as the reason', async () => {
    const verdict = await runGatingHooks([entry('echo "no swearing" >&2; exit 2')], event, action);

    expect(verdict).toEqual({ blocked: true, reason: 'no swearing' });
  });

  test('stdout JSON rewrites the text and the next hook sees it', async () => {
    const verdict = await runGatingHooks(
      [entry(`echo '{"text":"rewritten"}'`), entry(`jq -e '.text == "rewritten"' >/dev/null || exit 2`)],
      event,
      action,
    );

    expect(verdict).toEqual({ blocked: false, action: { ...action, text: 'rewritten' } });
  });

  test('a non-2 failure is ignored and the action proceeds', async () => {
    expect(await runGatingHooks([entry('exit 1')], event, action)).toEqual({ blocked: false, action });
  });

  test('the action filter skips non-matching entries', async () => {
    expect(await runGatingHooks([entry('exit 2', { action: ['react'] })], event, action)).toEqual({ blocked: false, action });
  });

  test('a hook past its timeout is killed and does not block', async () => {
    const verdict = await runGatingHooks([entry('sleep 5', { timeout: 100 })], event, action);

    expect(verdict.blocked).toBe(false);
  });
});
