import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Paths {
  readonly configFile: string;
  readonly stateDir: string;
  readonly dbFile: string;
  readonly socketFile: string;
}

/** Where slooks reads its config and keeps its state. `SLOOKS_CONFIG` overrides the config file. */
export function getPaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = homedir();
  const configHome = env['XDG_CONFIG_HOME'] ?? join(home, '.config');
  const stateHome = env['XDG_STATE_HOME'] ?? join(home, '.local', 'state');
  const stateDir = join(stateHome, 'slooks');

  return {
    configFile: env['SLOOKS_CONFIG'] ?? join(configHome, 'slooks', 'config.json'),
    stateDir,
    dbFile: join(stateDir, 'slooks.db'),
    socketFile: join(stateDir, 'events.sock'),
  };
}
