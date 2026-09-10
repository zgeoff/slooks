export function printHelp(): void {
  console.log(`slooks: Slack hooks daemon. Runs your commands on Slack events, as you.

Usage:
  slooks daemon [--verbose]              Run the daemon in the foreground
  slooks events                          Stream events as NDJSON from the running daemon
  slooks send <channel> [text] [--thread <ts>]
                                         Post a message (text from stdin when omitted or "-")
  slooks react <channel> <ts> <emoji>    Add a reaction to a message
  slooks edit <channel> <ts> [text]      Edit one of your messages
  slooks thread <channel> <ts> [--json]  Print a thread (parent first)
  slooks help
  slooks --version

<channel> is a channel id (C…, D…, G…) or #name.
Tokens: SLACK_APP_TOKEN (xapp-) and SLACK_USER_TOKEN (xoxp-), or "appToken" / "userToken" in
~/.config/slooks/config.json (SLOOKS_CONFIG overrides the path).`);
}
