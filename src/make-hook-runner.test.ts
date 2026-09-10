import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHookRunner } from './make-hook-runner.ts';
import type { HookEntry, SlooksEvent } from './types.ts';

const event = (id: string, text = 'x'): SlooksEvent => ({
  ev: 'MessagePosted',
  event_id: id,
  time: '2026-09-10T00:00:00.000Z',
  ts: '1.000',
  channel: { id: 'C1', name: 'c', type: 'channel' },
  user: null,
  text,
  thread_ts: null,
  subtype: null,
  mentions_me: false,
  permalink: null,
  raw: null,
});

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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('makeHookRunner', () => {
  test('fires a matching command with the event on stdin and the name in env', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'slooks-')), 'out');
    const run = makeHookRunner({ MessagePosted: [entry(`cat > ${out}; echo $SLOOKS_EVENT >> ${out}`)] });

    run(event('Ev1', 'hi'));
    await wait(300);

    const lines = readFileSync(out, 'utf8').trim().split('\n');

    expect(JSON.parse(lines[0] as string)).toMatchObject({ event_id: 'Ev1', text: 'hi' });
    expect(lines[1]).toBe('MessagePosted');
  });

  test('a filtered-out event does not fire', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'slooks-')), 'out');
    const run = makeHookRunner({ MessagePosted: [entry(`touch ${out}`, { text: /nope/ })] });

    run(event('Ev1'));
    await wait(200);

    expect(() => readFileSync(out)).toThrow();
  });

  test('debounce batches events into one run with an array on stdin', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'slooks-')), 'out');
    const run = makeHookRunner({ MessagePosted: [entry(`cat > ${out}; echo $SLOOKS_COUNT >> ${out}`, { debounce: 100 })] });

    run(event('Ev1'));
    run(event('Ev2'));
    run(event('Ev3'));
    await wait(400);

    const lines = readFileSync(out, 'utf8').trim().split('\n');
    const batch = JSON.parse(lines[0] as string) as SlooksEvent[];

    expect(batch.map((e) => e.event_id)).toEqual(['Ev1', 'Ev2', 'Ev3']);
    expect(lines[1]).toBe('3');
  });
});
