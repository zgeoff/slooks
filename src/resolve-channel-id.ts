import type { WebClient } from '@slack/web-api';

/**
 * Follows a `#name` to its channel id by scanning the conversations the
 * token can list. A bare id passes through. Throws when the name is unknown.
 */
export async function resolveChannelID(web: WebClient, channel: string): Promise<string> {
  if (!channel.startsWith('#')) {
    return channel;
  }

  const wanted = channel.slice(1);
  let cursor: string | undefined;

  do {
    const page = await web.conversations.list({
      types: 'public_channel,private_channel,mpim',
      exclude_archived: true,
      limit: 1000,
      ...(cursor === undefined ? {} : { cursor }),
    });
    const hit = page.channels?.find((c) => c.name === wanted);

    if (hit?.id !== undefined) {
      return hit.id;
    }

    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor !== undefined);

  throw new Error(`slooks: no channel named ${channel}`);
}
