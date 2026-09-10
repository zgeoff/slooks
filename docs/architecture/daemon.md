# Daemon architecture

slooks is one process holding one websocket. The daemon owns the inbound side: the Socket Mode
connection, dedup, normalization, and fan-out to hooks and subscribers. The outbound side, every
`slooks send`, `react`, and `edit`, runs in the CLI process that invoked it and does not need the
daemon at all.

## Process model

```text
Slack ── Socket Mode (wss) ──> slooks daemon
                                 ├── ack every envelope first
                                 ├── SQLite dedup on event_id (~/.local/state/slooks/slooks.db)
                                 ├── normalize: names, is_me, permalink, token stripped
                                 ├── hook runner: sh -c per matching entry, debounce per entry
                                 └── events socket: NDJSON broadcast (events.sock)

slooks send ── PreAction hooks ──> chat.postMessage ──> PostAction hooks
```

## The inbound loop

Every envelope is acknowledged before any work happens. Slack gives three seconds for the ack and
redelivers on silence, so an ack that waits on a hook would double every slow event.

The envelope's `event_id` is then checked against the `seen` table. Slack redelivers an event up
to three times, and a reconnect replays what was missed, so a hook would otherwise fire two to four
times under load. Rows older than a day are pruned when the daemon starts.

Normalization turns the Slack event into the slooks payload the [hooks guide](../guides/hooks.md)
describes. Channel and user names come from `conversations.info` and `users.info` through a cache
that holds for the daemon's lifetime, so an id costs one API call. A lookup the token cannot make
caches as unknown rather than retrying on every event. The permalink is built from the team URL,
channel, and `ts` without an API call. The verification token Slack includes on every envelope is
removed before the event reaches a hook or a subscriber.

The daemon models messages, edits, deletions, and reactions. Any other event type is acknowledged,
recorded as seen, and dropped.

## Fan-out

Each normalized event goes to two places, in this order: the events socket, then the hook runner.

The events socket is a unix socket with no handshake and no requests. A subscriber connects and
receives every subsequent event as one JSON line; anything it writes is ignored. `slooks events` is
a thin reader over it. The daemon removes the socket file on exit and replaces a stale one on
start.

The hook runner walks the entries under the event's name and spawns `/bin/sh -c` for each whose
filters pass, with the event on stdin. Runs are fire-and-forget with a kill timer. A debounced entry
instead appends the event to a pending batch and, when the window closes, spawns once with the
array. The daemon never awaits a hook; the runner also returns a promise, which only the CLI uses
so that a `PostAction` hook finishes before the process exits.

## Outbound actions

`slooks send`, `react`, and `edit` load the config, build an action, run the `PreAction` entries
against it in sequence, call Slack with whatever the last entry left, and then fire `PostAction`.
This runs in the CLI process because the gate needs the hook's exit code and stdout, which
fire-and-forget cannot give, and because posting should work with no daemon running.

## Identity

The daemon calls `auth.test` at start and refuses a bot token. The installing user's id drives
`is_me` and `mentions_me`, and the team URL drives permalinks.

## Dependencies

`@slack/socket-mode` is pinned to v2. v3 sends websocket pings through `undici.ping`, which Bun's
built-in `undici` shim does not export, so the ping fails and the client reconnects every few
seconds. v2 uses the `ws` package and holds the connection.
