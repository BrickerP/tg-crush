import "dotenv/config";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`缺少环境变量 ${name}，请检查 ~/Projects/tg-crush/.env`);
  return v;
}

export const config = {
  apiKey: required("TYPESAFE_API_KEY"),
  apiId: Number(required("TG_API_ID")),
  apiHash: required("TG_API_HASH"),
  sessionPath: new URL("../.session", import.meta.url).pathname,
  port: Number(process.env.PORT ?? 3180),
  host: process.env.HOST ?? "127.0.0.1",
  model: process.env.TYPESAFE_MODEL ?? "jev-1.13.0",
  contextMessages: Number(process.env.CONTEXT_MESSAGES ?? 120),
  // 只有当"对方"用机器人扮演时才需要，见 npm run partner
  botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  botChatId: Number(process.env.TELEGRAM_CHAT_ID ?? 0) || 0,
};
