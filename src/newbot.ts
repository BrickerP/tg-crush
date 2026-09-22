/**
 * 用已登录的会话替你跟 @BotFather 对话，建一个机器人并把 token 写进 .env。
 * 只是把你在 Telegram 里手点的那几步自动化，账号动作完全一样。
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";

const require = createRequire(import.meta.url);
const { TelegramClient, Api } = require("telegram") as typeof import("telegram");
const { StringSession } = require("telegram/sessions") as typeof import("telegram/sessions");

const DISPLAY_NAME = process.env.BOT_NAME ?? "小 A";
const USERNAME_BASE = process.env.BOT_USERNAME ?? "mycrush";
const TOKEN_RE = /\b(\d{6,12}:[A-Za-z0-9_-]{30,45})\b/;

const client = new TelegramClient(
  new StringSession(readFileSync(config.sessionPath, "utf8").trim()),
  config.apiId,
  config.apiHash,
  { connectionRetries: 5 },
);

await client.connect();
const father = await client.getEntity("BotFather");
let seen = 0;

async function poll(): Promise<string[]> {
  const messages = await client.getMessages(father, { limit: 10 });
  const fresh = [...messages]
    .reverse()
    .filter((m) => m instanceof Api.Message && m.id > seen && !m.out);
  const texts: string[] = [];
  for (const m of fresh) {
    seen = Math.max(seen, m.id);
    const text = m.message ?? "";
    if (text) {
      texts.push(text);
      console.log(`   [BotFather] ${text.replace(/\n+/g, " ⏎ ").slice(0, 160)}`);
    }
  }
  return texts;
}

async function waitFor(match: (t: string) => boolean, label: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const text of await poll()) {
      if (match(text)) return text;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`等 ${label} 超时`);
}

const say = (text: string) => client.sendMessage(father, { message: text });

console.log("初始化对话（拉取历史，避免把旧消息当新回复）…");
await poll();

console.log(`\n1. /newbot`);
await say("/newbot");
await waitFor((t) => /call it|call your bot|name for your bot/i.test(t), "机器人名称提示");

console.log(`2. 名称：${DISPLAY_NAME}`);
await say(DISPLAY_NAME);
await waitFor((t) => /username|must end in/i.test(t), "用户名提示");

let token: string | null = null;
for (let attempt = 0; attempt < 5 && !token; attempt += 1) {
  const username = `${USERNAME_BASE}_${Math.floor(Math.random() * 90_000 + 10_000)}_bot`;
  console.log(`3. 用户名：${username}`);
  await say(username);
  const reply = await waitFor(
    (t) => TOKEN_RE.test(t) || /sorry|taken|invalid|too long|can't|can not/i.test(t),
    "创建结果",
  );
  token = TOKEN_RE.exec(reply)?.[1] ?? null;
  if (!token) console.log("   名字被占了，换一个再试。");
}

if (!token) throw new Error("没能拿到 token");

const env = readFileSync(new URL("../.env", import.meta.url).pathname, "utf8");
const next = env.includes("TELEGRAM_BOT_TOKEN=")
  ? env.replace(/TELEGRAM_BOT_TOKEN=.*/g, `TELEGRAM_BOT_TOKEN=${token}`)
  : `${env.trimEnd()}\nTELEGRAM_BOT_TOKEN=${token}\n`;
writeFileSync(new URL("../.env", import.meta.url).pathname, next);
console.log(`\ntoken 已写入 .env`);

// 机器人只能回复先开口的人，所以替你先说一句。
const botInfo = (await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json()) as {
  result: { username: string; first_name: string };
};
const bot = await client.getEntity(botInfo.result.username);
const before = await client.getMessages(bot, { limit: 1 });
if (!before.length) {
  await client.sendMessage(bot, { message: "/start" });
  console.log(`已替你给 @${botInfo.result.username} 发了 /start`);
}
const username = botInfo.result.username;

await client.disconnect();

const updates = (await (
  await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=0`)
).json()) as { result: { message?: { chat: { id: number } } }[] };
const chatId = updates.result.find((u) => u.message)?.message?.chat.id;

if (chatId) {
  const finalEnv = readFileSync(new URL("../.env", import.meta.url).pathname, "utf8");
  writeFileSync(
    new URL("../.env", import.meta.url).pathname,
    finalEnv.includes("TELEGRAM_CHAT_ID=")
      ? finalEnv.replace(/TELEGRAM_CHAT_ID=.*/g, `TELEGRAM_CHAT_ID=${chatId}`)
      : `${finalEnv.trimEnd()}\nTELEGRAM_CHAT_ID=${chatId}\n`,
  );
}

console.log(`
搞定：
  机器人    @${username}（显示名「${DISPLAY_NAME}」）
  你的 chat ${chatId ?? "没拿到，npm run partner 会自动认"}

下一步：
  终端 1  npm start
  终端 2  npm run partner
`);
process.exit(0);
