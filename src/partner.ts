/**
 * 用 Telegram Bot API 扮演对话的另一方，好在你没有第二个号、也不想用假数据的时候
 * 做真实的实时测试。机器人发的是真实 Telegram 消息，走完整的 MTProto 事件流，
 * 连"正在输入"都是真的 —— 不是喂给管线的 fixture。
 *
 * 用法：npm run partner
 *   - 直接敲一句 -> 机器人先"正在输入…"再把这句话发给你
 *   - 用 | 分隔可以连发多条
 *   - 回车不填 -> 只刷新一下你那边发来的消息
 *   - Ctrl-C 退出
 */
import { createInterface } from "node:readline/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.ts";

const token = config.botToken;
if (!token) {
  console.error("先在 .env 里填 TELEGRAM_BOT_TOKEN（@BotFather 给的）");
  process.exit(1);
}

const root = new URL("../.env", import.meta.url).pathname;

async function api<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

type Update = {
  update_id: number;
  message?: { text?: string; from?: { first_name?: string; id: number }; chat: { id: number } };
};

let offset = 0;
let chatId = config.botChatId;
const me = await api<{ username: string; first_name: string }>("getMe");

async function drain() {
  const updates = await api<Update[]>("getUpdates", { offset, timeout: 0 });
  if (!updates.length) return;
  offset = updates[updates.length - 1].update_id + 1;
  for (const u of updates) {
    if (!u.message) continue;
    if (!chatId) {
      chatId = u.message.chat.id;
      const env = readFileSync(root, "utf8");
      writeFileSync(
        root,
        env.includes("TELEGRAM_CHAT_ID=")
          ? env.replace(/TELEGRAM_CHAT_ID=.*/g, `TELEGRAM_CHAT_ID=${chatId}`)
          : `${env.trimEnd()}\nTELEGRAM_CHAT_ID=${chatId}\n`,
      );
      console.log(`   → 已记住你的 chat id ${chatId}`);
    }
    const who = u.message.from?.id === chatId ? "你" : "对方";
    if (u.message.text) console.log(`   [${who}] ${u.message.text}`);
  }
}

if (!chatId) {
  console.log(`机器人 @${me.username} 还没跟你聊过。`);
  console.log("去 Telegram 里打开它，点 Start 随便发一句，然后回车继续。");
  const rl0 = createInterface({ input: process.stdin, output: process.stdout });
  await rl0.question("弄好了按回车…");
  rl0.close();
  await drain();
  if (!chatId) {
    console.error("还是没看到你的消息，确认你给它发过消息了。");
    process.exit(1);
  }
} else {
  // 跳过上次运行积压下来的旧消息，否则每次启动都会重播一遍历史。
  const last = await api<Update[]>("getUpdates", { offset: -1, timeout: 0 });
  offset = last.length ? last[last.length - 1].update_id + 1 : 0;
}

console.log(`\n机器人：${me.first_name} (@${me.username})  目标 chat：${chatId}`);
console.log("敲一句「她」要说的话，回车发送。用 | 分隔可连发多条。\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });

while (true) {
  await drain();
  const input = (await rl.question("她说> ")).trim();
  if (!input) continue;
  for (const part of input.split("|").map((s) => s.trim()).filter(Boolean)) {
    const typing = Math.min(4000, Math.max(1200, part.length * 140));
    await api("sendChatAction", { chat_id: chatId, action: "typing" });
    await new Promise((r) => setTimeout(r, typing));
    await api("sendMessage", { chat_id: chatId, text: part });
    console.log(`   [已发] ${part}`);
  }
}
