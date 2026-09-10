import { describe, expect, test } from 'bun:test';
import { isMatch } from './is-match.ts';
import type { HookEntry, SlooksEvent } from './types.ts';

const entry = (overrides: Partial<HookEntry>): HookEntry => ({
  command: 'true',
  timeout: 1000,
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

const event = (overrides: Partial<SlooksEvent>): SlooksEvent => ({
  ev: 'MessagePosted',
  event_id: 'Ev1',
  time: '2026-09-10T00:00:00.000Z',
  ts: '1.000',
  channel: { id: 'C1', name: 'alerts', type: 'channel' },
  user: { id: 'U1', name: 'alice', is_me: true },
  text: 'hello',
  thread_ts: null,
  subtype: null,
  mentions_me: false,
  permalink: null,
  raw: null,
  ...overrides,
});

describe('isMatch', () => {
  test('an entry with no filters accepts everything', () => {
    expect(isMatch(entry({}), event({}))).toBe(true);
  });

  test('channel matches by id or #name', () => {
    expect(isMatch(entry({ channel: ['C1'] }), event({}))).toBe(true);
    expect(isMatch(entry({ channel: ['#alerts'] }), event({}))).toBe(true);
    expect(isMatch(entry({ channel: ['#other'] }), event({}))).toBe(false);
    expect(isMatch(entry({ channel: ['C1'] }), event({ channel: null }))).toBe(false);
  });

  test('channel_type filters', () => {
    expect(isMatch(entry({ channel_type: ['im'] }), event({}))).toBe(false);
    expect(isMatch(entry({ channel_type: ['im', 'channel'] }), event({}))).toBe(true);
  });

  test('user and not_user accept id, @name, and me', () => {
    expect(isMatch(entry({ user: ['me'] }), event({}))).toBe(true);
    expect(isMatch(entry({ user: ['@alice'] }), event({}))).toBe(true);
    expect(isMatch(entry({ not_user: ['me'] }), event({}))).toBe(false);
    expect(isMatch(entry({ not_user: ['U9'] }), event({}))).toBe(true);
    expect(isMatch(entry({ user: ['me'] }), event({ user: null }))).toBe(false);
  });

  test('subtype human means no subtype', () => {
    expect(isMatch(entry({ subtype: ['human'] }), event({}))).toBe(true);
    expect(isMatch(entry({ subtype: ['human'] }), event({ subtype: 'bot_message' }))).toBe(false);
    expect(isMatch(entry({ subtype: ['bot_message'] }), event({ subtype: 'bot_message' }))).toBe(true);
  });

  test('text is a regex', () => {
    expect(isMatch(entry({ text: /^hel/ }), event({}))).toBe(true);
    expect(isMatch(entry({ text: /FIRING/ }), event({}))).toBe(false);
  });

  test('thread distinguishes top-level from replies', () => {
    const reply = event({ ts: '2.000', thread_ts: '1.000' });

    expect(isMatch(entry({ thread: 'reply' }), reply)).toBe(true);
    expect(isMatch(entry({ thread: 'top' }), reply)).toBe(false);
    expect(isMatch(entry({ thread: 'top' }), event({}))).toBe(true);
    expect(isMatch(entry({ thread: 'top' }), event({ thread_ts: '1.000' }))).toBe(true);
  });

  test('reaction and action filters', () => {
    expect(isMatch(entry({ reaction: ['eyes'] }), event({ ev: 'ReactionAdded', reaction: 'eyes' }))).toBe(true);
    expect(isMatch(entry({ reaction: ['eyes'] }), event({}))).toBe(false);
    expect(isMatch(entry({ action: ['send'] }), event({ ev: 'PreAction', action: 'send' }))).toBe(true);
    expect(isMatch(entry({ action: ['react'] }), event({ ev: 'PreAction', action: 'send' }))).toBe(false);
  });

  test('all set filters must pass', () => {
    const e = entry({ channel: ['#alerts'], subtype: ['human'], not_user: ['me'] });

    expect(isMatch(e, event({ user: { id: 'U2', name: 'sam', is_me: false } }))).toBe(true);
    expect(isMatch(e, event({}))).toBe(false);
  });
});
