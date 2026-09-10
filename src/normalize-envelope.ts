import type { NameResolver } from './make-name-resolver.ts';
import type { EventChannel, EventUser, Identity, SlooksEvent } from './types.ts';

/** The subset of a Socket Mode `events_api` envelope that slooks reads. */
export interface SlackEnvelope {
  readonly event_id?: string;
  readonly event_time?: number;
  readonly token?: string;
  readonly event?: SlackEvent;
}

interface SlackMessage {
  readonly ts?: string;
  readonly user?: string;
  readonly text?: string;
  readonly thread_ts?: string;
  readonly subtype?: string;
}

interface SlackEvent extends SlackMessage {
  readonly type?: string;
  readonly channel?: string;
  readonly channel_type?: string;
  readonly event_ts?: string;
  readonly bot_id?: string;
  readonly message?: SlackMessage;
  readonly previous_message?: SlackMessage;
  readonly deleted_ts?: string;
  readonly reaction?: string;
  readonly item_user?: string;
  readonly item?: { readonly type?: string; readonly channel?: string; readonly ts?: string };
}

/**
 * Turns a Slack envelope into the normalized slooks event, or null for an
 * event type slooks does not model. Resolves channel and user names through
 * the cache and strips the verification token from `raw`.
 */
export async function normalizeEnvelope(
  envelope: SlackEnvelope,
  me: Identity,
  names: NameResolver,
): Promise<SlooksEvent | null> {
  const event = envelope.event;

  if (event === undefined) {
    return null;
  }

  const base = {
    event_id: envelope.event_id ?? `local-${Bun.randomUUIDv7()}`,
    time: new Date((envelope.event_time ?? Date.now() / 1000) * 1000).toISOString(),
  };
  const normalized = await normalizeEvent(event, base, me, names);

  return normalized === null ? null : { ...normalized, raw: stripToken(envelope) };
}

type Base = Pick<SlooksEvent, 'event_id' | 'time'>;

type Normalized = Omit<SlooksEvent, 'raw'>;

function normalizeEvent(event: SlackEvent, base: Base, me: Identity, names: NameResolver): Promise<Normalized | null> {
  switch (event.type) {
    case 'message':
      return normalizeMessage(event, base, me, names);
    case 'reaction_added':
    case 'reaction_removed':
      return normalizeReaction(event, base, me, names);
    default:
      return Promise.resolve(null);
  }
}

async function normalizeMessage(
  event: SlackEvent,
  base: Base,
  me: Identity,
  names: NameResolver,
): Promise<Normalized | null> {
  if (event.channel === undefined) {
    return null;
  }

  const channel = await buildChannel(event.channel, event.channel_type, names);

  if (event.subtype === 'message_changed') {
    const message = event.message ?? {};
    const ts = message.ts ?? event.event_ts ?? null;
    const threadTS = message.thread_ts ?? null;

    return {
      ev: 'MessageEdited',
      ...base,
      ts,
      channel,
      user: await buildUser(message.user, me, names),
      text: message.text ?? '',
      thread_ts: threadTS,
      subtype: message.subtype ?? null,
      mentions_me: hasMention(message.text, me.userID),
      permalink: buildPermalink(me.teamURL, channel.id, ts, threadTS),
      previous: { text: event.previous_message?.text ?? '' },
    };
  }

  if (event.subtype === 'message_deleted') {
    const previous = event.previous_message ?? {};

    return {
      ev: 'MessageDeleted',
      ...base,
      ts: event.event_ts ?? null,
      channel,
      user: await buildUser(previous.user, me, names),
      text: previous.text ?? '',
      thread_ts: previous.thread_ts ?? null,
      subtype: previous.subtype ?? null,
      mentions_me: false,
      permalink: null,
      deleted_ts: event.deleted_ts ?? '',
    };
  }

  const ts = event.ts ?? event.event_ts ?? null;
  const threadTS = event.thread_ts ?? null;

  return {
    ev: 'MessagePosted',
    ...base,
    ts,
    channel,
    user: await buildUser(event.user, me, names),
    text: event.text ?? '',
    thread_ts: threadTS,
    subtype: event.subtype ?? null,
    mentions_me: hasMention(event.text, me.userID),
    permalink: buildPermalink(me.teamURL, channel.id, ts, threadTS),
  };
}

async function normalizeReaction(
  event: SlackEvent,
  base: Base,
  me: Identity,
  names: NameResolver,
): Promise<Normalized | null> {
  const item = event.item;

  if (item?.channel === undefined || item.ts === undefined) {
    return null;
  }

  const channel = await buildChannel(item.channel, undefined, names);

  return {
    ev: event.type === 'reaction_added' ? 'ReactionAdded' : 'ReactionRemoved',
    ...base,
    ts: event.event_ts ?? null,
    channel,
    user: await buildUser(event.user, me, names),
    text: '',
    thread_ts: null,
    subtype: null,
    mentions_me: false,
    permalink: buildPermalink(me.teamURL, channel.id, item.ts, null),
    reaction: event.reaction ?? '',
    item: { channel: item.channel, ts: item.ts, user: event.item_user ?? null },
  };
}

async function buildChannel(
  id: string,
  channelType: string | undefined,
  names: NameResolver,
): Promise<EventChannel> {
  const info = await names.resolveChannel(id);
  const type = info.type ?? toChannelType(channelType);

  return { id, name: info.name, type };
}

function toChannelType(value: string | undefined): EventChannel['type'] {
  switch (value) {
    case 'channel':
    case 'group':
    case 'im':
    case 'mpim':
      return value;
    default:
      return null;
  }
}

async function buildUser(
  id: string | undefined,
  me: Identity,
  names: NameResolver,
): Promise<EventUser | null> {
  if (id === undefined) {
    return null;
  }

  const isMe = id === me.userID;

  return { id, name: isMe ? me.userName : await names.resolveUser(id), is_me: isMe };
}

function hasMention(text: string | undefined, userID: string): boolean {
  return text !== undefined && text.includes(`<@${userID}>`);
}

/** Slack's archive URL shape: `.../archives/<channel>/p<ts without the dot>`. */
export function buildPermalink(
  teamURL: string,
  channel: string,
  ts: string | null,
  threadTS: string | null,
): string | null {
  if (ts === null) {
    return null;
  }

  const base = `${teamURL.replace(/\/$/, '')}/archives/${channel}/p${ts.replace('.', '')}`;

  return threadTS !== null && threadTS !== ts ? `${base}?thread_ts=${threadTS}&cid=${channel}` : base;
}

function stripToken(envelope: SlackEnvelope): unknown {
  const { token: _token, ...rest } = envelope;

  return rest;
}
