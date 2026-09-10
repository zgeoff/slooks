import type { WebClient } from '@slack/web-api';
import type { Identity } from './types.ts';

/** Who the user token belongs to, from `auth.test`. Throws when the token is not a user token. */
export async function readIdentity(web: WebClient): Promise<Identity> {
  const auth = await web.auth.test();

  if (auth.user_id === undefined || auth.user === undefined || auth.url === undefined) {
    throw new Error('slooks: auth.test returned no user; SLACK_USER_TOKEN must be an xoxp- user token');
  }

  if (auth.bot_id !== undefined) {
    throw new Error('slooks: SLACK_USER_TOKEN is a bot token; slooks runs as you, not as a bot');
  }

  return { userID: auth.user_id, userName: auth.user, teamURL: auth.url };
}
