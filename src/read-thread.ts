import type { WebClient } from '@slack/web-api';
import { buildPermalink } from './normalize-envelope.ts';
import type { Identity } from './types.ts';

export interface ThreadMessage {
  readonly ts: string;
  readonly user: string | null;
  readonly text: string;
  readonly subtype: string | null;
  readonly permalink: string | null;
}

/** Reads a thread (parent first) as normalized messages. A top-level `ts` with no replies returns just that message. */
export async function readThread(web: WebClient, me: Identity, channel: string, ts: string): Promise<ThreadMessage[]> {
  const messages: ThreadMessage[] = [];
  let cursor: string | undefined;

  do {
    const page = await web.conversations.replies({
      channel,
      ts,
      limit: 200,
      ...(cursor === undefined ? {} : { cursor }),
    });

    for (const m of page.messages ?? []) {
      const messageTS = m.ts ?? '';

      messages.push({
        ts: messageTS,
        user: m.user ?? null,
        text: m.text ?? '',
        subtype: (m as { subtype?: string }).subtype ?? null,
        permalink: buildPermalink(me.teamURL, channel, messageTS, ts),
      });
    }

    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor !== undefined);

  return messages;
}
