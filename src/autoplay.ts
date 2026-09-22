/**
 * 全自动对跑：机器人说"她"的话，你自己的账号说"你"的话。
 * 两边都真的经过 Telegram 服务器，只是不用你手打 —— 你只管录网页。
 *
 * 用法：npm run autoplay  [-- --loop] [-- --speed 1.5]
 */
import { config } from "./config.ts";
import { CONVERSATION } from "./conversation.ts";

const OWN = `http://${config.host}:${config.port}`;

const args = process.argv.slice(2);
const loop = args.includes("--loop");
const speedArg = args.indexOf("--speed");
const speed = speedArg >= 0 ? Number(args[speedArg + 1]) : 1;

if (!config.botToken) {
  console.error("先在 .env 里填 TELEGRAM_BOT_TOKEN（跑 npm run newbot 可以自动建）");
  process.exit(1);
}

async function bot<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

const botInfo = await bot<{ username: string; first_name: string }>("getMe");
let chatId = config.botChatId;
if (!chatId) {
  const updates = await bot<{ message?: { chat: { id: number } } }[]>("getUpdates", {
    offset: -1,
    timeout: 0,
  });
  chatId = updates.find((u) => u.message)?.message?.chat.id ?? 0;
}
if (!chatId) {
  console.error("拿不到 chat id，先跑一次建机器人的脚本。");
  process.exit(1);
}
const CHAT = `u${chatId}`;

// 我方消息交给正在运行的服务端去发，这里不再自己连 Telegram。
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms / speed));
const typingFor = (text: string) => Math.min(4000, Math.max(1500, text.length * 140));

console.log(`\n「她」= ${botInfo.first_name} (@${botInfo.username})`);
console.log(`「你」= 你自己的账号（消息从你的客户端发出，你手机上也会看到）`);
console.log(`共 ${CONVERSATION.length} 条，${speed}x 速度${loop ? "，循环播放" : ""}\n`);

let round = 0;
do {
  round += 1;
  if (round > 1) console.log(`\n—— 第 ${round} 遍 ——\n`);
  for (const [i, turn] of CONVERSATION.entries()) {
    await sleep(turn.gapMs ?? 0);
    if (turn.who === "her") {
      const typing = turn.typingMs ?? typingFor(turn.text);
      console.log(`${String(i + 1).padStart(2)} 她 「正在输入」${(typing / speed / 1000).toFixed(1)}s …`);
      await bot("sendChatAction", { chat_id: chatId, action: "typing" });
      await sleep(typing);
      await bot("sendMessage", { chat_id: chatId, text: turn.text });
    } else {
      const r = (await fetch(`${OWN}/api/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId: CHAT, text: turn.text }),
      }).then((x) => x.json())) as { id?: string; error?: string };
      if (r.error) throw new Error(`发送失败：${r.error}`);
    }
    console.log(`   ${turn.who === "her" ? "她" : "你"}：${turn.text}`);
    // 留出时间让 Jev 算完这一次
    await sleep(turn.who === "her" ? 7000 : 4000);
  }
} while (loop);

console.log("\n播完了。");
process.exit(0);
