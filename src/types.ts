/** Shared types for slooks: the hook config, the normalized event, and actions. */

export const INBOUND_EVENTS = [
  'MessagePosted',
  'MessageEdited',
  'MessageDeleted',
  'ReactionAdded',
  'ReactionRemoved',
] as const;

export const LIFECYCLE_EVENTS = ['Connected', 'Disconnected'] as const;

export const ACTION_EVENTS = ['PreAction', 'PostAction'] as const;

export const EVENT_NAMES = [...INBOUND_EVENTS, ...LIFECYCLE_EVENTS, ...ACTION_EVENTS] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export type ChannelType = 'channel' | 'group' | 'im' | 'mpim';

export interface EventChannel {
  readonly id: string;
  readonly name: string | null;
  readonly type: ChannelType | null;
}

export interface EventUser {
  readonly id: string;
  readonly name: string | null;
  readonly is_me: boolean;
}

/**
 * The normalized event every hook and every `slooks events` subscriber sees.
 * `raw` is the Slack event with the verification token stripped.
 */
export interface SlooksEvent {
  readonly ev: EventName;
  readonly event_id: string;
  readonly time: string;
  readonly ts: string | null;
  readonly channel: EventChannel | null;
  readonly user: EventUser | null;
  readonly text: string;
  readonly thread_ts: string | null;
  readonly subtype: string | null;
  readonly mentions_me: boolean;
  readonly permalink: string | null;
  readonly reaction?: string;
  readonly item?: { readonly channel: string; readonly ts: string; readonly user: string | null };
  readonly previous?: { readonly text: string };
  readonly deleted_ts?: string;
  readonly action?: ActionName;
  readonly result?: ActionResult;
  readonly raw: unknown;
}

export type ActionName = 'send' | 'react' | 'edit';

export interface Action {
  readonly action: ActionName;
  readonly channel: string;
  readonly text: string;
  readonly ts: string | null;
  readonly thread_ts: string | null;
  readonly reaction: string | null;
}

export interface ActionResult {
  readonly ts: string;
  readonly channel: string;
  readonly permalink: string | null;
}

export type ThreadFilter = 'top' | 'reply' | 'any';

export interface HookEntry {
  readonly command: string;
  readonly timeout: number;
  readonly debounce: number | null;
  readonly channel: readonly string[] | null;
  readonly channel_type: readonly ChannelType[] | null;
  readonly user: readonly string[] | null;
  readonly not_user: readonly string[] | null;
  readonly subtype: readonly string[] | null;
  readonly text: RegExp | null;
  readonly thread: ThreadFilter;
  readonly reaction: readonly string[] | null;
  readonly action: readonly ActionName[] | null;
}

export type HooksConfig = Partial<Record<EventName, readonly HookEntry[]>>;

export interface Config {
  readonly hooks: HooksConfig;
  readonly appToken: string | null;
  readonly userToken: string | null;
}

/** Who the daemon is: the installing user, from `auth.test`. */
export interface Identity {
  readonly userID: string;
  readonly userName: string;
  readonly teamURL: string;
}
