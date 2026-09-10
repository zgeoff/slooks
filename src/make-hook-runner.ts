import { isMatch } from './is-match.ts';
import type { HookEntry, HooksConfig, SlooksEvent } from './types.ts';

/** Resolves when every hook fired for this event has exited; a debounced entry resolves at once. */
export type RunHooks = (event: SlooksEvent) => Promise<void>;

/**
 * Builds the observational hook runner. Each call fires every entry under
 * the event's name whose filters accept it, with the event JSON on stdin and
 * the name in `SLOOKS_EVENT`. An entry with `debounce` collects matching
 * events and fires once per window with a JSON array on stdin and the count
 * in `SLOOKS_COUNT`. Hooks are fire-and-forget: the daemon never waits, a run
 * past its timeout is killed, and a nonzero exit is logged and ignored. The
 * returned promise lets a short-lived caller (the CLI) wait for its hooks.
 */
export function makeHookRunner(hooks: HooksConfig): RunHooks {
  const pending = new Map<HookEntry, { events: SlooksEvent[]; timer: ReturnType<typeof setTimeout> }>();

  return async (event) => {
    const running: Promise<void>[] = [];

    for (const entry of hooks[event.ev] ?? []) {
      if (!isMatch(entry, event)) {
        continue;
      }

      if (entry.debounce === null) {
        running.push(runHook(entry, event.ev, JSON.stringify(event), 1));

        continue;
      }

      const batch = pending.get(entry);

      if (batch !== undefined) {
        batch.events.push(event);

        continue;
      }

      const events = [event];
      const timer = setTimeout(() => {
        pending.delete(entry);
        void runHook(entry, event.ev, JSON.stringify(events), events.length);
      }, entry.debounce);

      timer.unref();
      pending.set(entry, { events, timer });
    }

    await Promise.all(running);
  };
}

async function runHook(entry: HookEntry, name: string, payload: string, count: number): Promise<void> {
  let proc: ReturnType<typeof Bun.spawn>;

  try {
    proc = Bun.spawn(['/bin/sh', '-c', entry.command], {
      stdin: Buffer.from(`${payload}\n`),
      stdout: 'ignore',
      stderr: 'inherit',
      env: { ...process.env, SLOOKS_EVENT: name, SLOOKS_COUNT: String(count) },
    });
  } catch (error) {
    console.error(`slooks hook for ${name} failed to spawn: ${String(error)}`);

    return;
  }

  const timer = setTimeout(() => {
    proc.kill();
  }, entry.timeout);

  timer.unref();

  try {
    const code = await proc.exited;

    if (code !== 0) {
      console.error(`slooks hook for ${name} exited ${code}: ${entry.command}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
