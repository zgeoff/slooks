import { WebClient } from '@slack/web-api';
import type { Config } from './types.ts';

/** The Slack Web API client on the user token. Throws when no token is configured. */
export function buildWebClient(config: Config): WebClient {
  if (config.userToken === null) {
    throw new Error('slooks: no user token; set SLACK_USER_TOKEN or "userToken" in config.json');
  }

  return new WebClient(config.userToken);
}
