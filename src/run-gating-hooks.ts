import { isMatch } from './is-match.ts';
import type { Action, HookEntry, SlooksEvent } from './types.ts';

export type GateVerdict =
  | { readonly blocked: false; readonly action: Action }
  | { readonly blocked: true; readonly reason: string };

/**
 * Runs the `PreAction` entries that match an action, in order, each seeing
 * the action as the previous one left it. Exit 2 blocks with stderr as the
 * reason. Exit 0 with JSON on stdout replaces `text`, `thread_ts`, or
 * `reaction`. Any other exit is logged and does not block, and a hook past
 * its timeout is killed and treated the same way.
 */
export async function runGatingHooks(
  entries: readonly HookEntry[],
  event: SlooksEvent,
  action: Action,
): Promise<GateVerdict> {
  let current = action;

  for (const entry of entries) {
    if (!isMatch(entry, { ...event, action: current.action, text: current.text })) {
      continue;
    }

    const outcome = await runGate(entry, { ...event, ...current, action: current.action });

    if (outcome.code === 2) {
      return { blocked: true, reason: outcome.stderr.trim() || `blocked by: ${entry.command}` };
    }

    if (outcome.code !== 0) {
      console.error(`slooks PreAction hook exited ${outcome.code}: ${entry.command}`);

      continue;
    }

    current = mergeOverride(current, outcome.stdout);
  }

  return { blocked: false, action: current };
}

interface GateOutcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

// After the hook exits, its pipes normally hit EOF at once. A hook that
// backgrounded a child, or a killed `sh` whose command outlived it (dash
// does not exec a single command the way bash does), leaves a process
// holding the pipes open, so the wait for EOF is capped and the gate takes
// whatever output arrived.
const PIPE_GRACE_MS = 200;

async function runGate(entry: HookEntry, payload: unknown): Promise<GateOutcome> {
  const proc = Bun.spawn(['/bin/sh', '-c', entry.command], {
    stdin: Buffer.from(`${JSON.stringify(payload)}\n`),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, SLOOKS_EVENT: 'PreAction', SLOOKS_COUNT: '1' },
  });
  const timer = setTimeout(() => {
    proc.kill();
  }, entry.timeout);
  const stdout = collectText(proc.stdout);
  const stderr = collectText(proc.stderr);

  try {
    const code = await proc.exited;

    await Promise.race([Promise.all([stdout.done, stderr.done]), Bun.sleep(PIPE_GRACE_MS)]);

    return { code, stdout: stdout.text(), stderr: stderr.text() };
  } finally {
    clearTimeout(timer);
  }
}

interface TextCollector {
  readonly done: Promise<void>;
  readonly text: () => string;
}

function collectText(stream: ReadableStream<Uint8Array>): TextCollector {
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const done = (async () => {
    for await (const chunk of stream) {
      chunks.push(decoder.decode(chunk, { stream: true }));
    }
  })();

  return { done, text: () => chunks.join('') };
}

function mergeOverride(action: Action, stdout: string): Action {
  const text = stdout.trim();

  if (text === '') {
    return action;
  }

  let override: unknown;

  try {
    override = JSON.parse(text);
  } catch {
    console.error(`slooks PreAction hook wrote non-JSON stdout, ignored: ${text.slice(0, 80)}`);

    return action;
  }

  if (typeof override !== 'object' || override === null) {
    return action;
  }

  const o = override as Record<string, unknown>;

  return {
    ...action,
    text: typeof o['text'] === 'string' ? o['text'] : action.text,
    thread_ts: typeof o['thread_ts'] === 'string' ? o['thread_ts'] : action.thread_ts,
    reaction: typeof o['reaction'] === 'string' ? o['reaction'] : action.reaction,
  };
}
