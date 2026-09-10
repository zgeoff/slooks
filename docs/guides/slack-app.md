# Slack app setup

slooks connects as a Slack app installed by you, with user scopes only. There is no bot user, so
nothing joins a channel, nothing shows in the member list, and nobody can message it. The app still
appears under **Manage apps** in the workspace, the same entry any personal integration has.

## Create the app

1. Open https://api.slack.com/apps and click **Create New App**, then **From a manifest**.
2. Pick the workspace and paste the manifest below.
3. Under **Basic Information**, **App-Level Tokens**, generate a token with the scope
   `connections:write`. That is `SLACK_APP_TOKEN` (`xapp-`).
4. Under **OAuth & Permissions**, click **Install to Workspace** and accept the scopes. The
   **User OAuth Token** shown afterwards is `SLACK_USER_TOKEN` (`xoxp-`).

If the workspace requires admin approval for new apps, step 4 waits on an admin. A free personal
workspace has no gate and is the quickest place to try slooks.

## Manifest

```yaml
_metadata:
  major_version: 1
  minor_version: 1
display_information:
  name: slooks
  description: Personal hook daemon
oauth_config:
  scopes:
    user:
      - channels:history
      - channels:read
      - groups:history
      - groups:read
      - im:history
      - im:read
      - mpim:history
      - mpim:read
      - users:read
      - reactions:read
      - reactions:write
      - chat:write
      - search:read
settings:
  socket_mode_enabled: true
  event_subscriptions:
    user_events:
      - message.channels
      - message.groups
      - message.im
      - message.mpim
      - reaction_added
      - reaction_removed
  org_deploy_enabled: false
  token_rotation_enabled: false
```

## Scopes

| Scope                                        | Lets slooks                                       |
| -------------------------------------------- | ------------------------------------------------- |
| `*:history`                                  | receive messages in channels, groups, DMs, group DMs |
| `*:read`, `users:read`                       | resolve channel and user names for the payload    |
| `reactions:read`                             | receive reaction events                           |
| `chat:write`, `reactions:write`              | `slooks send`, `edit`, and `react`                |
| `search:read`                                | reserved for a future `slooks search`             |

Drop `chat:write`, `reactions:write`, and `search:read` for a read-only install. Adding a scope
later is a reinstall, which is one consent click.

## What the token sees

Events cover the conversations you are a member of, and every read and post is attributed to you.
A hook that posts is you posting. Put a `PreAction` hook in front of `send` from the start; the
[hooks guide](./hooks.md#gating) shows one.
