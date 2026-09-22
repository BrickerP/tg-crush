import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { config } from "./config.ts";

const require = createRequire(import.meta.url);
const { TelegramClient } = require("telegram") as typeof import("telegram");
const { StringSession } = require("telegram/sessions") as typeof import("telegram/sessions");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const digits = (s: string) => s.replace(/\D/g, "");

const client = new TelegramClient(new StringSession(""), config.apiId, config.apiHash, {
  connectionRetries: 5,
});

let asked = 0;
let stop = false;

try {
  await client.start({
    phoneNumber: async () => {
      const raw = await rl.question("手机号（带国家码，例如 +8613800138000）: ");
      const phone = `+${digits(raw)}`;
      console.log(`   → 提交 ${phone}`);
      return phone;
    },
    phoneCode: async (viaApp) => {
      asked += 1;
      if (asked === 1) {
        console.log(
          viaApp
            ? "\n验证码已发到你的 Telegram App（官方的「Telegram」服务对话里）。"
            : "\n验证码通过短信发送。",
        );
        console.log(
          "注意：只有最新那条消息里的数字有效；Telegram 的登录码是 5 位。\n",
        );
      }
      const raw = await rl.question("验证码（只填数字）: ");
      const code = digits(raw);
      console.log(`   → 提交 ${code.length} 位数字`);
      if (code.length !== 5 && code.length !== 6) {
        console.log("   ⚠ 位数不是 5 或 6，多半填错了。");
      }
      return code;
    },
    password: async () => {
      console.log("\n这个账号开了两步验证，需要密码。");
      return rl.question("两步验证密码: ");
    },
    onError: async (err) => {
      stop = true;
      const message = (err as { errorMessage?: string }).errorMessage ?? String(err);
      console.error(`\n[login] 失败：${message}`);
      const wait = /FLOOD_WAIT_(\d+)/.exec(message)?.[1];
      if (wait) {
        console.error(`Telegram 限流了，等 ${wait} 秒再跑 npm run login。`);
      } else if (message.includes("PHONE_CODE")) {
        console.error(
          "验证码没对上。等 1 分钟（避免限流）再跑一次，并且填 Telegram 里最新那条消息中的数字。",
        );
      }
      // GramJS 只在 onError 返回真值时才停止；返回假值它会拿同一个 hash 反复追问。
      return true;
    },
  });
} catch (err) {
  if (!stop) console.error(err);
  rl.close();
  process.exit(1);
}

writeFileSync(config.sessionPath, client.session.save() as unknown as string, {
  mode: 0o600,
});
const me = await client.getMe();
console.log(`\n登录成功：${me.firstName ?? ""} ${me.lastName ?? ""} (id ${me.id})`);
console.log(`会话已写入 ${config.sessionPath}，之后直接用 npm start。`);
rl.close();
process.exit(0);
