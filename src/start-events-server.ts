import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

export interface EventsServer {
  readonly broadcast: (line: string) => void;
  readonly stop: () => void;
}

/**
 * The read-only NDJSON broadcast socket behind `slooks events`. No handshake,
 * no requests: a subscriber connects and receives every event line the hooks
 * see. Anything written to the socket is ignored.
 */
export function startEventsServer(socketFile: string): EventsServer {
  mkdirSync(dirname(socketFile), { recursive: true, mode: 0o700 });
  rmSync(socketFile, { force: true });

  const clients = new Set<import('bun').Socket>();
  const server = Bun.listen({
    unix: socketFile,
    socket: {
      open(socket) {
        clients.add(socket);
      },
      close(socket) {
        clients.delete(socket);
      },
      error(socket) {
        clients.delete(socket);
      },
      data() {},
    },
  });

  return {
    broadcast: (line) => {
      for (const client of clients) {
        client.write(`${line}\n`);
      }
    },
    stop: () => {
      for (const client of clients) {
        client.end();
      }

      server.stop(true);
      rmSync(socketFile, { force: true });
    },
  };
}
