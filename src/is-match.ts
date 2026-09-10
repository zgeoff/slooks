import type { HookEntry, SlooksEvent } from './types.ts';

/**
 * Whether a hook entry's filters accept an event. Every filter set on the
 * entry must pass; an unset filter passes. Aliases: `me` in `user` /
 * `not_user`, `human` in `subtype` (no subtype), `#name` in `channel`.
 */
export function isMatch(entry: HookEntry, event: SlooksEvent): boolean {
  return (
    isChannelMatch(entry, event) &&
    isChannelTypeMatch(entry, event) &&
    isUserMatch(entry, event) &&
    isSubtypeMatch(entry, event) &&
    isTextMatch(entry, event) &&
    isThreadMatch(entry, event) &&
    isReactionMatch(entry, event) &&
    isActionMatch(entry, event)
  );
}

function isChannelMatch(entry: HookEntry, event: SlooksEvent): boolean {
  if (entry.channel === null) {
    return true;
  }

  if (event.channel === null) {
    return false;
  }

  const { id, name } = event.channel;

  return entry.channel.some((c) => c === id || (name !== null && c === `#${name}`));
}

function isChannelTypeMatch(entry: HookEntry, event: SlooksEvent): boolean {
  if (entry.channel_type === null) {
    return true;
  }

  return event.channel?.type !== null && event.channel !== null && entry.channel_type.includes(event.channel.type);
}

function isUserMatch(entry: HookEntry, event: SlooksEvent): boolean {
  if (entry.user !== null && !hasUser(entry.user, event)) {
    return false;
  }

  if (entry.not_user !== null && hasUser(entry.not_user, event)) {
    return false;
  }

  return true;
}

function hasUser(list: readonly string[], event: SlooksEvent): boolean {
  if (event.user === null) {
    return false;
  }

  const { id, name, is_me } = event.user;

  return list.some((u) => u === id || (u === 'me' && is_me) || (name !== null && u === `@${name}`));
}

function isSubtypeMatch(entry: HookEntry, event: SlooksEvent): boolean {
  if (entry.subtype === null) {
    return true;
  }

  return entry.subtype.some((s) => (s === 'human' ? event.subtype === null : s === event.subtype));
}

function isTextMatch(entry: HookEntry, event: SlooksEvent): boolean {
  return entry.text === null || entry.text.test(event.text);
}

function isThreadMatch(entry: HookEntry, event: SlooksEvent): boolean {
  if (entry.thread === 'any') {
    return true;
  }

  const isReply = event.thread_ts !== null && event.thread_ts !== event.ts;

  return entry.thread === 'reply' ? isReply : !isReply;
}

function isReactionMatch(entry: HookEntry, event: SlooksEvent): boolean {
  if (entry.reaction === null) {
    return true;
  }

  return event.reaction !== undefined && entry.reaction.includes(event.reaction);
}

function isActionMatch(entry: HookEntry, event: SlooksEvent): boolean {
  if (entry.action === null) {
    return true;
  }

  return event.action !== undefined && entry.action.includes(event.action);
}
