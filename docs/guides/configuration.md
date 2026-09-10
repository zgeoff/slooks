# Configuration

slooks reads `~/.config/slooks/config.json`. A missing file is an empty config, and `SLOOKS_CONFIG`
points at a different file.

```json
{
  "appToken": null,
  "userToken": null,
  "hooks": {}
}
```

| Field       | Default | Meaning                                                                          |
| ----------- | ------- | -------------------------------------------------------------------------------- |
| `appToken`  | `null`  | The `xapp-` app-level token that opens the Socket Mode websocket. Daemon only.   |
| `userToken` | `null`  | The `xoxp-` user token every read and post runs on.                              |
| `hooks`     | `{}`    | Commands keyed by event name. The [hooks guide](./hooks.md) covers every field.  |

`SLACK_APP_TOKEN` and `SLACK_USER_TOKEN` in the environment win over the file. The tokens are
yours, not a bot's: keep the file at mode `0600`, and never put a token in a hook command.

## State

The daemon keeps its state under `~/.local/state/slooks/` (`XDG_STATE_HOME` moves it):

| File           | Holds                                                                         |
| -------------- | ----------------------------------------------------------------------------- |
| `slooks.db`    | SQLite: the `event_id`s seen in the last 24 hours, for dedup.                 |
| `events.sock`  | The unix socket behind `slooks events`. Removed when the daemon exits.        |

## Running the daemon

`slooks daemon` runs in the foreground and logs to stderr. `--verbose` adds one line per event:
time, event name, channel, user, subtype, and the first sixty characters of text. To keep it up,
give it to launchd or a tmux window; slooks does not daemonize itself.
