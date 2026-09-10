import type { WebClient } from '@slack/web-api';
import type { ChannelType } from './types.ts';

export interface ChannelInfo {
  readonly name: string | null;
  readonly type: ChannelType | null;
}

export interface NameResolver {
  readonly resolveChannel: (id: string) => Promise<ChannelInfo>;
  readonly resolveUser: (id: string) => Promise<string | null>;
}

const UNKNOWN_CHANNEL: ChannelInfo = { name: null, type: null };

/**
 * Cached channel and user name lookups. Each id costs one API call for the
 * daemon's lifetime; a failed lookup is cached as unknown so a channel the
 * token cannot read does not retry on every event.
 */
export function makeNameResolver(web: WebClient): NameResolver {
  const channels = new Map<string, Promise<ChannelInfo>>();
  const users = new Map<string, Promise<string | null>>();

  const resolveUser = (id: string): Promise<string | null> => {
    let pending = users.get(id);

    if (pending === undefined) {
      pending = readUserName(web, id);
      users.set(id, pending);
    }

    return pending;
  };

  const resolveChannel = (id: string): Promise<ChannelInfo> => {
    let pending = channels.get(id);

    if (pending === undefined) {
      pending = readChannelInfo(web, id, resolveUser);
      channels.set(id, pending);
    }

    return pending;
  };

  return { resolveChannel, resolveUser };
}

async function readUserName(web: WebClient, id: string): Promise<string | null> {
  try {
    const { user } = await web.users.info({ user: id });

    return user?.name ?? null;
  } catch {
    return null;
  }
}

async function readChannelInfo(
  web: WebClient,
  id: string,
  resolveUser: (id: string) => Promise<string | null>,
): Promise<ChannelInfo> {
  try {
    const { channel } = await web.conversations.info({ channel: id });

    if (channel === undefined) {
      return UNKNOWN_CHANNEL;
    }

    if (channel.is_im === true) {
      const dmUser = (channel as { user?: string }).user;
      const counterpart = dmUser === undefined ? null : await resolveUser(dmUser);

      return { name: counterpart === null ? null : `@${counterpart}`, type: 'im' };
    }

    if (channel.is_mpim === true) {
      return { name: channel.name ?? null, type: 'mpim' };
    }

    return { name: channel.name ?? null, type: channel.is_private === true ? 'group' : 'channel' };
  } catch {
    return UNKNOWN_CHANNEL;
  }
}
