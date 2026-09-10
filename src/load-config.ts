import { z } from 'zod';
import { getPaths } from './get-paths.ts';
import { ACTION_EVENTS, EVENT_NAMES } from './types.ts';
import type { ActionName, ChannelType, Config, EventName, HookEntry, HooksConfig } from './types.ts';

const DEFAULT_TIMEOUT_MS = 10_000;

const list = <T extends z.ZodType>(item: T) =>
  z
    .union([item, z.array(item)])
    .transform((v) => (Array.isArray(v) ? v : [v]) as z.output<T>[])
    .nullable()
    .default(null);

const channelTypeSchema = z.enum(['channel', 'group', 'im', 'mpim']);
const actionSchema = z.enum(['send', 'react', 'edit']);

const entrySchema = z.object({
  command: z.string().min(1),
  timeout: z.number().int().positive().default(DEFAULT_TIMEOUT_MS),
  debounce: z.number().int().positive().nullable().default(null),
  channel: list(z.string()),
  channel_type: list(channelTypeSchema),
  user: list(z.string()),
  not_user: list(z.string()),
  subtype: list(z.string()),
  text: z.string().nullable().default(null),
  thread: z.enum(['top', 'reply', 'any']).default('any'),
  reaction: list(z.string()),
  action: list(actionSchema),
});

const configSchema = z.object({
  hooks: z.partialRecord(z.enum(EVENT_NAMES), z.array(entrySchema)).default({}),
  appToken: z.string().nullable().default(null),
  userToken: z.string().nullable().default(null),
});

/**
 * Loads `~/.config/slooks/config.json`, validates it, and merges the Slack
 * tokens from `SLACK_APP_TOKEN` / `SLACK_USER_TOKEN` (env wins). A missing
 * config file is an empty config; a malformed one throws with the path.
 */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const { configFile } = getPaths(env);
  const file = Bun.file(configFile);
  const rawText = (await file.exists()) ? await file.text() : '{}';
  let rawJSON: unknown;

  try {
    rawJSON = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`slooks config ${configFile} is not valid JSON: ${String(error)}`);
  }

  const parsed = configSchema.safeParse(rawJSON);

  if (!parsed.success) {
    throw new Error(`slooks config ${configFile} is invalid:\n${z.prettifyError(parsed.error)}`);
  }

  return {
    hooks: buildHooks(parsed.data.hooks),
    appToken: env['SLACK_APP_TOKEN'] ?? parsed.data.appToken,
    userToken: env['SLACK_USER_TOKEN'] ?? parsed.data.userToken,
  };
}

type ParsedEntry = z.output<typeof entrySchema>;

function buildHooks(raw: Partial<Record<EventName, ParsedEntry[]>>): HooksConfig {
  const hooks: Partial<Record<EventName, HookEntry[]>> = {};

  for (const [name, entries] of Object.entries(raw) as [EventName, ParsedEntry[]][]) {
    hooks[name] = entries.map((entry) => buildEntry(name, entry));
  }

  return hooks;
}

function buildEntry(name: EventName, entry: ParsedEntry): HookEntry {
  const isGating = name === ACTION_EVENTS[0];

  if (isGating && entry.debounce !== null) {
    throw new Error(`slooks config: PreAction hooks cannot debounce (command: ${entry.command})`);
  }

  return {
    command: entry.command,
    timeout: entry.timeout,
    debounce: entry.debounce,
    channel: entry.channel,
    channel_type: entry.channel_type as ChannelType[] | null,
    user: entry.user,
    not_user: entry.not_user,
    subtype: entry.subtype,
    text: entry.text === null ? null : new RegExp(entry.text),
    thread: entry.thread,
    reaction: entry.reaction,
    action: entry.action as ActionName[] | null,
  };
}
