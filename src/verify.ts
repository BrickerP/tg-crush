import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { config } from "./config.ts";

const require = createRequire(import.meta.url);
const { TelegramClient, Api } = require("telegram") as typeof import("telegram");
const { StringSession } = require("telegram/sessions") as typeof import("telegram/sessions");
const { NewMessage, Raw } = require("telegram/events") as typeof import("telegram/events");

const token = process.env.TELEGRAM_BOT_TOKEN!;
const chatId = process.env.TELEGRAM_CHAT_ID!;
const botId = String(
  ((await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json()) as {
    result: { id: number };
  }).result.id,
);
const client = new TelegramClient(
  new StringSession(readFileSync(config.sessionPath, "utf8").trim()),
  config.apiId,
  config.apiHash,
  { connectionRetries: 3 },
);

await client.connect();
const me = await client.getMe();
console.log(`登录身份 id=${me.id}  机器人 id=${botId}  (你 = ${chatId})\n`);

let gotMessage = false;
let gotTyping = false;

client.addEventHandler((event: any) => {
  const m = event.message;
  const peer = m.peerId;
  const other = m.out ? peer?.userId?.toString() : m.senderId?.toString();
  console.log("① 收到消息");
  console.log(`   chatId 派生 = u${other}    (期望 u${botId})`);
  console.log(`   sender = ${m.out ? "self" : "other"}   text = ${JSON.stringify(m.message)}`);
  gotMessage = other === botId && !m.out;
}, new NewMessage({}));

client.addEventHandler(
  (update: any) => {
    if (!(update instanceof Api.UpdateUserTyping)) return;
    const id = update.userId.toString();
    const typing = !(update.action instanceof Api.SendMessageCancelAction);
    console.log(`② 收到 typing：userId=${id} active=${typing}  (期望 ${botId})`);
    if (id === botId && typing) gotTyping = true;
  },
  new Raw({ types: [Api.UpdateUserTyping] }),
);

console.log("让机器人先『正在输入』再发一句…");
await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, action: "typing" }),
});
await new Promise((r) => setTimeout(r, 1500));
await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: chatId, text: "端到端验证：今天上班累死了" }),
});

await new Promise((r) => setTimeout(r, 6000));
await client.disconnect();
console.log(`\n消息链路: ${gotMessage ? "通过" : "失败"}`);
console.log(`typing 链路: ${gotTyping ? "通过" : "没收到（机器人 sendChatAction 可能不推 UpdateUserTyping）"}`);
process.exit(gotMessage ? 0 : 1);
