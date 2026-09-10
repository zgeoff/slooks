import { SocketModeClient } from '@slack/socket-mode';
import { buildWebClient } from './build-web-client.ts';
import { getPaths } from './get-paths.ts';
import { makeHookRunner } from './make-hook-runner.ts';
import { makeNameResolver } from './make-name-resolver.ts';
import { normalizeEnvelope } from './normalize-envelope.ts';
import type { SlackEnvelope } from './normalize-envelope.ts';
import { openStore } from './open-store.ts';
import { readIdentity } from './read-identity.ts';
import { startEventsServer } from './start-events-server.ts';
import type { Config, SlooksEvent } from './types.ts';

export interface DaemonOptions {
  readonly verbose: boolean;
}

/**
 * Runs the daemon in the foreground: opens the Socket Mode connection, acks
 * every envelope first, dedups by `event_id`, normalizes, then fans each
 * event out to the configured hooks and the events socket.
 */
export async function startDaemon(config: Config, options: DaemonOptions): Promise<void> {
  if (config.appToken === null) {
    throw new Error('slooks: no app token; set SLACK_APP_TOKEN or "appToken" in config.json');
  }

  const paths = getPaths();
  const web = buildWebClient(config);
  const me = await readIdentity(web);
  const names = makeNameResolver(web);
  const store = openStore(paths.dbFile);
  const events = startEventsServer(paths.socketFile);
  const runHooks = makeHookRunner(config.hooks);
  const socket = new SocketModeClient({ appToken: config.appToken });

  const emit = (event: SlooksEvent): void => {
    if (options.verbose) {
      console.error(formatSummary(event));
    }

    events.broadcast(JSON.stringify(event));
    void runHooks(event);
  };

  const emitLifecycle = (ev: 'Connected' | 'Disconnected'): void => {
    emit({
      ev,
      event_id: `local-${Bun.randomUUIDv7()}`,
      time: new Date().toISOString(),
      ts: null,
      channel: null,
      user: { id: me.userID, name: me.userName, is_me: true },
      text: '',
      thread_ts: null,
      subtype: null,
      mentions_me: false,
      permalink: null,
      raw: null,
    });
  };

  socket.on('slack_event', async ({ ack, body }: { ack: () => Promise<void>; body: unknown }) => {
    await ack();

    const envelope = body as SlackEnvelope;
    const eventID = envelope.event_id;

    if (eventID !== undefined && store.hasSeen(eventID)) {
      return;
    }

    let event: SlooksEvent | null;

    try {
      event = await normalizeEnvelope(envelope, me, names);
    } catch (error) {
      console.error(`slooks: failed to normalize ${eventID ?? 'event'}: ${String(error)}`);

      return;
    }

    if (eventID !== undefined) {
      store.recordSeen(eventID);
    }

    if (event !== null) {
      emit(event);
    }
  });

  socket.on('connected', () => {
    emitLifecycle('Connected');
  });
  socket.on('disconnected', () => {
    emitLifecycle('Disconnected');
  });

  const shutdown = (): void => {
    void socket.disconnect().finally(() => {
      events.stop();
      store.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await socket.start();
  console.error(`slooks: connected as @${me.userName} (${me.userID}); events on ${paths.socketFile}`);
}

function formatSummary(event: SlooksEvent): string {
  const where = event.channel === null ? '-' : (event.channel.name ?? event.channel.id);
  const who = event.user === null ? '-' : (event.user.name ?? event.user.id);
  const what = event.reaction ?? event.text.replace(/\s+/g, ' ').slice(0, 60);

  return `${event.time} ${event.ev} ${where} ${who}${event.subtype === null ? '' : ` [${event.subtype}]`} ${what}`;
}
