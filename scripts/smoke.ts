import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";

const web = new WebClient(process.env['SLACK_USER_TOKEN']);
const who = await web.auth.test();
console.log(JSON.stringify({ auth: { user: who.user, user_id: who.user_id, team: who.team, bot: who.bot_id ?? null } }));

const client = new SocketModeClient({ appToken: process.env['SLACK_APP_TOKEN']! });

client.on("slack_event", async ({ ack, body }) => {
  await ack();
  console.log(JSON.stringify(body));
});
client.on("connected", () => console.log(JSON.stringify({ socket: "connected" })));
client.on("disconnected", () => console.log(JSON.stringify({ socket: "disconnected" })));

await client.start();
