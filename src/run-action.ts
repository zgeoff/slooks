import type { WebClient } from '@slack/web-api';
import { makeHookRunner } from './make-hook-runner.ts';
import { buildPermalink } from './normalize-envelope.ts';
import { runGatingHooks } from './run-gating-hooks.ts';
import type { Action, ActionResult, Config, Identity, SlooksEvent } from './types.ts';

export type ActionOutcome =
  | { readonly ok: true; readonly result: ActionResult }
  | { readonly ok: false; readonly reason: string };

/**
 * Performs an outbound action as the user: `PreAction` hooks gate it and may
 * rewrite it, the Slack call runs, then `PostAction` hooks see the result.
 */
export async function runAction(
  action: Action,
  config: Config,
  web: WebClient,
  me: Identity,
): Promise<ActionOutcome> {
  const event = buildActionEvent('PreAction', action, me, null);
  const verdict = await runGatingHooks(config.hooks.PreAction ?? [], event, action);

  if (verdict.blocked) {
    return { ok: false, reason: verdict.reason };
  }

  const result = await applyAction(verdict.action, web, me);

  await makeHookRunner(config.hooks)(buildActionEvent('PostAction', verdict.action, me, result));

  return { ok: true, result };
}

async function applyAction(action: Action, web: WebClient, me: Identity): Promise<ActionResult> {
  switch (action.action) {
    case 'send': {
      const response = await web.chat.postMessage({
        channel: action.channel,
        text: action.text,
        ...(action.thread_ts === null ? {} : { thread_ts: action.thread_ts }),
      });
      const ts = response.ts ?? '';
      const channel = response.channel ?? action.channel;

      return { ts, channel, permalink: buildPermalink(me.teamURL, channel, ts, action.thread_ts) };
    }
    case 'react': {
      if (action.ts === null || action.reaction === null) {
        throw new Error('slooks: react needs a message ts and a reaction');
      }

      await web.reactions.add({ channel: action.channel, timestamp: action.ts, name: action.reaction });

      return { ts: action.ts, channel: action.channel, permalink: buildPermalink(me.teamURL, action.channel, action.ts, null) };
    }
    case 'edit': {
      if (action.ts === null) {
        throw new Error('slooks: edit needs a message ts');
      }

      const response = await web.chat.update({ channel: action.channel, ts: action.ts, text: action.text });
      const ts = response.ts ?? action.ts;

      return { ts, channel: action.channel, permalink: buildPermalink(me.teamURL, action.channel, ts, null) };
    }
  }
}

function buildActionEvent(
  ev: 'PreAction' | 'PostAction',
  action: Action,
  me: Identity,
  result: ActionResult | null,
): SlooksEvent {
  return {
    ev,
    event_id: `local-${Bun.randomUUIDv7()}`,
    time: new Date().toISOString(),
    ts: action.ts,
    channel: { id: action.channel, name: null, type: null },
    user: { id: me.userID, name: me.userName, is_me: true },
    text: action.text,
    thread_ts: action.thread_ts,
    subtype: null,
    mentions_me: false,
    permalink: null,
    action: action.action,
    ...(action.reaction === null ? {} : { reaction: action.reaction }),
    ...(result === null ? {} : { result }),
    raw: null,
  };
}
