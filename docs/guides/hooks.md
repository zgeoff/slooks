# Hooks

A hook is a command slooks runs when a Slack event happens. Hooks live in the `hooks` map of
[`config.json`](./configuration.md), keyed by event name. Each entry is a command plus filters, and
the entry fires only when every filter it sets passes.

```json
{
  "hooks": {
    "ReactionAdded": [
      { "command": "jq -r .permalink | xargs atc session spawn", "reaction": "eyes", "user": "me" }
    ],
    "MessagePosted": [
      { "command": "notify 'Slack'", "channel_type": "im", "not_user": "me", "subtype": "human" }
    ],
    "PreAction": [
      { "command": "jq -e '.text | test(\"password\") | not' >/dev/null || exit 2", "action": "send" }
    ]
  }
}
```

Each command runs through `/bin/sh -c` with the event JSON on stdin, the event name in
`$SLOOKS_EVENT`, and the number of events on stdin in `$SLOOKS_COUNT`. Message text reaches the
hook only on stdin, never in the command string, so a message cannot inject shell.

## Events

| Event             | Fires on                                | Extra fields                       |
| ----------------- | --------------------------------------- | ---------------------------------- |
| `MessagePosted`   | a new message, top-level or in a thread | `subtype`, `mentions_me`           |
| `MessageEdited`   | Slack's `message_changed`               | `previous.text`                    |
| `MessageDeleted`  | Slack's `message_deleted`               | `deleted_ts`                       |
| `ReactionAdded`   | `reaction_added`                        | `reaction`, `item.{channel,ts,user}` |
| `ReactionRemoved` | `reaction_removed`                      | same                               |
| `Connected`       | the socket comes up                     |                                    |
| `Disconnected`    | the socket drops                        |                                    |
| `PreAction`       | before `slooks send`, `react`, `edit`   | `action`; a gate, see below        |
| `PostAction`      | after the Slack call succeeds           | `action`, `result.{ts,channel,permalink}` |

There is no separate event for a mention, a DM, or a thread reply. Each is a filter on
`MessagePosted`: `text` for the mention, `channel_type` for the DM, `thread` for the reply.

## Payload

Every event carries the same base fields:

| Field         | Meaning                                                                  |
| ------------- | ------------------------------------------------------------------------ |
| `ev`          | the event name                                                           |
| `event_id`    | Slack's id, the dedup key; `local-…` for daemon and action events        |
| `time`        | ISO 8601 event time                                                      |
| `ts`          | the message timestamp, Slack's message id within a channel               |
| `channel`     | `{ id, name, type }`; `name` is `#`-less, a DM's name is `@user`         |
| `user`        | `{ id, name, is_me }`, or `null` for a bot post                          |
| `text`        | the message text, Slack markup intact                                    |
| `thread_ts`   | the parent's `ts` when the message is in a thread, else `null`           |
| `subtype`     | Slack's subtype (`bot_message`, `channel_join`, …), or `null`            |
| `mentions_me` | whether the text mentions the installing user                            |
| `permalink`   | the archive URL for the message                                          |
| `raw`         | the Slack event as received, with the verification token removed        |

With `debounce` set, stdin is a JSON array of these objects instead of one.

## Filters

| Field          | Accepts                                    | Meaning                                              |
| -------------- | ------------------------------------------ | ---------------------------------------------------- |
| `channel`      | id or `#name`, one or a list               | the event's channel is in the list                   |
| `channel_type` | `channel`, `group`, `im`, `mpim`           |                                                      |
| `user`         | id, `@name`, or `me`                       | the actor is in the list                             |
| `not_user`     | same                                       | the actor is not in the list                         |
| `subtype`      | a Slack subtype, or `human` for none       | `bot_message` carries most of the noise              |
| `text`         | a regular expression                       | tested against `text`                                |
| `thread`       | `top`, `reply`, or `any` (default)         |                                                      |
| `reaction`     | emoji names without colons                 | reaction events only                                 |
| `action`       | `send`, `react`, `edit`                    | `PreAction` and `PostAction` only                    |
| `timeout`      | milliseconds, default `10000`              | the hook is killed past it                           |
| `debounce`     | milliseconds                               | fire once per window with every matching event       |

A filter that is not set passes. A filter set on an event that lacks the field fails: `channel` on
`Connected`, `reaction` on `MessagePosted`.

## Debounce

An entry with `debounce` collects matching events and fires once when the window closes, with a
JSON array on stdin and the count in `$SLOOKS_COUNT`. The window opens on the first event and does
not extend, so a steady stream fires at a steady rate. Use it wherever the command is an agent turn:
forty alerts in a minute cost one turn, not forty.

## Observational hooks

Every event except `PreAction` is observational. The daemon fires the command and moves on: it never
waits, a run past `timeout` is killed, and a nonzero exit is logged to the daemon's stderr and
otherwise ignored. A broken hook cannot delay an event or take the daemon down.

## Gating

`PreAction` fires from the CLI process before `slooks send`, `slooks react`, or `slooks edit` calls
Slack. The payload is the action itself: `action`, `channel`, `text`, `ts`, `thread_ts`, and
`reaction`. Entries run in order, each seeing the action as the previous one left it.

| Exit | Effect                                                                                 |
| ---- | -------------------------------------------------------------------------------------- |
| `0`  | allow; a JSON object on stdout replaces `text`, `thread_ts`, or `reaction`             |
| `2`  | block; stderr is the reason, and the CLI exits 2 with it                               |
| else | logged, does not block                                                                 |

A hook past its `timeout` is killed and does not block. `debounce` is rejected on `PreAction`.

`PostAction` fires after the Slack call with `result.ts`, `result.channel`, and
`result.permalink` added. The CLI waits for `PostAction` hooks to exit before it returns, since the
process would otherwise end before they ran.

## Delivery

Slack redelivers an event up to three times, and a reconnect replays events from the gap. The
daemon acks every envelope before it does anything else, then checks `event_id` against a SQLite
table before any hook runs, so a hook sees each event once. Events arrive in no guaranteed order.
