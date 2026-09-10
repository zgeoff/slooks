<div align="center">
  <h1>slooks</h1>
  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>
  <p>
    <a href="./docs/README.md">Documentation</a> •
    <a href="./docs/guides/hooks.md">Hooks</a> •
    <a href="./docs/guides/slack-app.md">Slack app setup</a> •
    <a href="./docs/architecture/daemon.md">Architecture</a>
  </p>
</div>

**slooks** runs your shell commands when things happen in Slack, and it runs them as you.

A small daemon holds a Socket Mode connection to a user-token Slack app: no bot user, no channel
invites, no public URL. Every message, edit, deletion, and reaction you can see becomes one JSON
event, and `config.json` maps event names to commands the way Claude Code hooks do. Filters on each
entry drop the noise before a process spawns, a debounce turns a burst of alerts into one batch, and
a gate hook can block or rewrite anything slooks posts on your behalf.

```text
Slack ── Socket Mode ──> slooks daemon ──> hooks (sh -c, JSON on stdin)
                              └──> events socket (`slooks events`)
slooks send / react / edit ──> PreAction hooks ──> Slack ──> PostAction hooks
```

## Install

From source, with [Bun](https://bun.sh):

```sh
git clone https://github.com/zgeoff/slooks && cd slooks
bun install
ln -s "$PWD/bin/slooks" ~/.local/bin/slooks
```

slooks needs a Slack app with Socket Mode on and user scopes only. The
[Slack app guide](./docs/guides/slack-app.md) has the manifest and the two tokens to copy out. Put
them in the environment as `SLACK_APP_TOKEN` and `SLACK_USER_TOKEN`, or in `config.json` as
`appToken` and `userToken`.

## Use

```sh
slooks daemon --verbose
```

The daemon runs in the foreground and prints one line per event. In another terminal:

```sh
slooks events | jq -r 'select(.ev == "MessagePosted") | .channel.name + ": " + .text'
```

Hooks go in `~/.config/slooks/config.json`, keyed by event name. This entry batches a minute of
human messages from two channels and hands them to an agent for triage:

```json
{
  "hooks": {
    "MessagePosted": [
      {
        "command": "claude -p 'Triage these Slack messages. Use `slooks thread` for context.'",
        "channel": ["#support", "#alerts"],
        "subtype": "human",
        "not_user": "me",
        "debounce": 60000,
        "timeout": 300000
      }
    ]
  }
}
```

The command gets the events as JSON on stdin and the event name in `$SLOOKS_EVENT`. Message text
never enters the command string. The [hooks guide](./docs/guides/hooks.md) covers every event, every
filter, and the gating contract.

The rest of the CLI posts as you and needs only the user token:

| Command                                     | Does                                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| `slooks send <channel> [text] [--thread ts]`| post a message; text comes from stdin when omitted      |
| `slooks react <channel> <ts> <emoji>`       | add a reaction                                          |
| `slooks edit <channel> <ts> [text]`         | edit one of your messages                               |
| `slooks thread <channel> <ts> [--json]`     | print a thread, parent first                            |
| `slooks events`                             | stream every event the daemon sees as NDJSON            |

`<channel>` is an id (`C…`, `D…`, `G…`) or `#name`. Each outbound command runs through your
`PreAction` hooks first, so a one-line `jq` test can stop a message before it posts.

## Configuration

`~/.config/slooks/config.json` holds the hooks and, optionally, the tokens. The
[configuration guide](./docs/guides/configuration.md) covers every field and the state files.

## Documentation

[docs/](./docs/README.md) covers the hook contract, the Slack app, and the daemon internals.
