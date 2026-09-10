# slooks documentation

Guides and architecture for slooks, the Slack hooks daemon. The [root README](../README.md) covers
install and everyday use.

## Guides

- [Hooks](./guides/hooks.md): every event, the payload, the filters on a hook entry, debounce, and
  the gating contract for outbound actions.
- [Configuration](./guides/configuration.md): `config.json` fields, token sources, and the files
  under `~/.local/state/slooks/`.
- [Slack app setup](./guides/slack-app.md): the app manifest, the scopes, and where the two tokens
  come from.

## Architecture

- [Daemon](./architecture/daemon.md): the Socket Mode loop, ack and dedup, normalization, fan-out to
  hooks and the events socket, and why outbound actions run in the CLI process.
