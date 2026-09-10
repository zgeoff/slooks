import { describe, expect, test } from 'bun:test';
import type { NameResolver } from './make-name-resolver.ts';
import { buildPermalink, normalizeEnvelope } from './normalize-envelope.ts';
import type { Identity } from './types.ts';

const me: Identity = { userID: 'U_ME', userName: 'alice', teamURL: 'https://example.slack.com/' };

const names: NameResolver = {
  resolveChannel: async (id) => (id === 'D1' ? { name: '@sam', type: 'im' } : { name: 'alerts', type: 'channel' }),
  resolveUser: async (id) => (id === 'U_SAM' ? 'sam' : null),
};

describe('normalizeEnvelope', () => {
  test('a DM becomes MessagePosted with names, is_me, and permalink; token stripped', async () => {
    const event = await normalizeEnvelope(
      {
        event_id: 'Ev1',
        event_time: 1_757_462_400,
        token: 'secret',
        event: { type: 'message', channel: 'D1', channel_type: 'im', user: 'U_ME', text: 'hello <@U_ME>', ts: '1757462400.000100' },
      },
      me,
      names,
    );

    expect(event).toMatchObject({
      ev: 'MessagePosted',
      event_id: 'Ev1',
      channel: { id: 'D1', name: '@sam', type: 'im' },
      user: { id: 'U_ME', name: 'alice', is_me: true },
      text: 'hello <@U_ME>',
      subtype: null,
      mentions_me: true,
      permalink: 'https://example.slack.com/archives/D1/p1757462400000100',
    });
    expect(JSON.stringify(event?.raw)).not.toContain('secret');
  });

  test('a bot_message has no user and keeps its subtype', async () => {
    const event = await normalizeEnvelope(
      { event_id: 'Ev2', event: { type: 'message', subtype: 'bot_message', channel: 'C1', bot_id: 'B1', text: '', ts: '2.000' } },
      me,
      names,
    );

    expect(event).toMatchObject({ ev: 'MessagePosted', subtype: 'bot_message', user: null });
  });

  test('message_changed becomes MessageEdited with previous text', async () => {
    const event = await normalizeEnvelope(
      {
        event_id: 'Ev3',
        event: {
          type: 'message',
          subtype: 'message_changed',
          channel: 'C1',
          event_ts: '3.001',
          message: { ts: '3.000', user: 'U_SAM', text: 'after' },
          previous_message: { ts: '3.000', user: 'U_SAM', text: 'before' },
        },
      },
      me,
      names,
    );

    expect(event).toMatchObject({ ev: 'MessageEdited', ts: '3.000', text: 'after', previous: { text: 'before' }, user: { name: 'sam', is_me: false } });
  });

  test('message_deleted becomes MessageDeleted', async () => {
    const event = await normalizeEnvelope(
      { event_id: 'Ev4', event: { type: 'message', subtype: 'message_deleted', channel: 'C1', event_ts: '4.001', deleted_ts: '4.000', previous_message: { text: 'gone' } } },
      me,
      names,
    );

    expect(event).toMatchObject({ ev: 'MessageDeleted', deleted_ts: '4.000', text: 'gone' });
  });

  test('reaction_added becomes ReactionAdded pointing at the item', async () => {
    const event = await normalizeEnvelope(
      { event_id: 'Ev5', event: { type: 'reaction_added', user: 'U_ME', reaction: 'eyes', item_user: 'U_SAM', item: { type: 'message', channel: 'C1', ts: '5.000' }, event_ts: '5.001' } },
      me,
      names,
    );

    expect(event).toMatchObject({
      ev: 'ReactionAdded',
      reaction: 'eyes',
      item: { channel: 'C1', ts: '5.000', user: 'U_SAM' },
      channel: { id: 'C1', name: 'alerts' },
      permalink: 'https://example.slack.com/archives/C1/p5000',
    });
  });

  test('an unmodelled event type is null', async () => {
    expect(await normalizeEnvelope({ event_id: 'Ev6', event: { type: 'channel_created' } }, me, names)).toBeNull();
  });
});

describe('buildPermalink', () => {
  test('a reply carries thread_ts and cid', () => {
    expect(buildPermalink('https://t.slack.com/', 'C1', '2.000', '1.000')).toBe(
      'https://t.slack.com/archives/C1/p2000?thread_ts=1.000&cid=C1',
    );
  });

  test('no ts means no permalink', () => {
    expect(buildPermalink('https://t.slack.com/', 'C1', null, null)).toBeNull();
  });
});
