import { buildWebClient } from './build-web-client.ts';
import { getPaths } from './get-paths.ts';
import { loadConfig } from './load-config.ts';
import { printHelp } from './print-help.ts';
import { readIdentity } from './read-identity.ts';
import { readThread } from './read-thread.ts';
import { resolveChannelID } from './resolve-channel-id.ts';
import { runAction } from './run-action.ts';
import { startDaemon } from './start-daemon.ts';
import type { Action } from './types.ts';

export async function runCLI(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { flags, positional } = parseArgs(rest);

  switch (command) {
    case 'daemon':
      await startDaemon(await loadConfig(), { verbose: flags.has('verbose') });

      return -1;
    case 'events':
      return runEvents();
    case 'send':
    case 'react':
    case 'edit':
      return runActionCommand(command, positional, flags);
    case 'thread':
      return runThread(positional, flags);
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();

      return 0;
    default:
      console.error(`slooks: unknown command "${command}"`);
      printHelp();

      return 1;
  }
}

interface ParsedArgs {
  readonly flags: Map<string, string | true>;
  readonly positional: string[];
}

function parseArgs(args: readonly string[]): ParsedArgs {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;

    if (arg === '--thread') {
      flags.set('thread', args[i + 1] ?? '');
      i += 1;
    } else if (arg.startsWith('--')) {
      flags.set(arg.slice(2), true);
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

async function runEvents(): Promise<number> {
  const { socketFile } = getPaths();

  return new Promise((resolve) => {
    Bun.connect({
      unix: socketFile,
      socket: {
        data(_socket, data) {
          process.stdout.write(data);
        },
        close() {
          resolve(0);
        },
        error(_socket, error) {
          console.error(`slooks events: ${error.message}`);
          resolve(1);
        },
        connectError() {
          console.error(`slooks events: no daemon on ${socketFile}; start one with \`slooks daemon\``);
          resolve(1);
        },
      },
    }).catch(() => {
      console.error(`slooks events: no daemon on ${socketFile}; start one with \`slooks daemon\``);
      resolve(1);
    });
  });
}

async function runActionCommand(
  name: Action['action'],
  positional: readonly string[],
  flags: ParsedArgs['flags'],
): Promise<number> {
  const config = await loadConfig();
  const web = buildWebClient(config);
  const me = await readIdentity(web);
  const [channelArg, ...args] = positional;

  if (channelArg === undefined) {
    console.error(`slooks ${name}: a channel is required`);

    return 1;
  }

  const channel = await resolveChannelID(web, channelArg);
  const action = await buildAction(name, channel, args, flags);
  const outcome = await runAction(action, config, web, me);

  if (!outcome.ok) {
    console.error(`slooks ${name}: blocked: ${outcome.reason}`);

    return 2;
  }

  console.log(JSON.stringify(outcome.result));

  return 0;
}

async function buildAction(
  name: Action['action'],
  channel: string,
  args: readonly string[],
  flags: ParsedArgs['flags'],
): Promise<Action> {
  const thread = flags.get('thread');
  const threadTS = typeof thread === 'string' && thread !== '' ? thread : null;

  switch (name) {
    case 'send':
      return { action: 'send', channel, text: await readText(args[0]), ts: null, thread_ts: threadTS, reaction: null };
    case 'react': {
      const [ts, reaction] = args;

      if (ts === undefined || reaction === undefined) {
        throw new Error('slooks react: usage: slooks react <channel> <ts> <emoji>');
      }

      return { action: 'react', channel, text: '', ts, thread_ts: null, reaction: reaction.replace(/^:|:$/g, '') };
    }
    case 'edit': {
      const [ts, text] = args;

      if (ts === undefined) {
        throw new Error('slooks edit: usage: slooks edit <channel> <ts> [text]');
      }

      return { action: 'edit', channel, text: await readText(text), ts, thread_ts: null, reaction: null };
    }
  }
}

async function readText(arg: string | undefined): Promise<string> {
  const text = arg === undefined || arg === '-' ? (await Bun.stdin.text()).replace(/\n$/, '') : arg;

  if (text === '') {
    throw new Error('slooks: message text is empty');
  }

  return text;
}

async function runThread(positional: readonly string[], flags: ParsedArgs['flags']): Promise<number> {
  const [channelArg, ts] = positional;

  if (channelArg === undefined || ts === undefined) {
    console.error('slooks thread: usage: slooks thread <channel> <ts> [--json]');

    return 1;
  }

  const config = await loadConfig();
  const web = buildWebClient(config);
  const me = await readIdentity(web);
  const channel = await resolveChannelID(web, channelArg);
  const messages = await readThread(web, me, channel, ts);

  if (flags.has('json')) {
    for (const message of messages) {
      console.log(JSON.stringify(message));
    }
  } else {
    for (const message of messages) {
      console.log(`[${message.ts}] ${message.user ?? message.subtype ?? '-'}: ${message.text}`);
    }
  }

  return 0;
}
