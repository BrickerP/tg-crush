import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { config } from "./config.ts";
import { session } from "./state.ts";
import type { Chat, Msg } from "./types.ts";

// GramJS ships CommonJS only, so load it through require() to keep Node ESM happy.
const require = createRequire(import.meta.url);
const { TelegramClient, Api } = require("telegram") as typeof import("telegram");
const { StringSession } = require("telegram/sessions") as typeof import("telegram/sessions");
// The published telegram/events/index.js only re-exports Raw and NewMessage,
// so the other builders have to be reached by their own path.
const { NewMessage, Raw } = require("telegram/events") as typeof import("telegram/events");
const { EditedMessage } = require("telegram/events/EditedMessage") as typeof import("telegram/events/EditedMessage");
const { DeletedMessage } = require("telegram/events/DeletedMessage") as typeof import("telegram/events/DeletedMessage");

function savedSession() {
  try {
    return readFileSync(config.sessionPath, "utf8").trim();
  } catch {
    throw new Error("找不到 .session，先执行 npm run login");
  }
}

export const client = new TelegramClient(
  new StringSession(savedSession()),
  config.apiId,
  config.apiHash,
  { connectionRetries: 10, autoReconnect: true },
);

type RawUser = {
  id: { toString(): string };
  firstName?: string;
  lastName?: string;
  username?: string;
};

/** Telegram 官方的服务号，只发登录验证码之类的系统通知，不该被当成聊天对象。 */
const SERVICE_IDS = new Set(["777000"]);

function displayName(user: RawUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return name.trim() || user.username || user.id.toString();
}

function chatFrom(user: RawUser): Chat {
  return {
    id: `u${user.id.toString()}`,
    title: displayName(user),
    username: user.username,
  };
}

/** A private chat is keyed by the other person, whichever direction the message went. */
function chatIdOf(message: {
  out?: boolean;
  peerId?: unknown;
  senderId?: unknown;
}): string | null {
  const peer = message.peerId as { userId?: { toString(): string } } | undefined;
  const other = message.out ? peer?.userId : (message.senderId as RawUser["id"]);
  const id = other?.toString() ?? peer?.userId?.toString();
  if (!id || id === session.getSelf().id || SERVICE_IDS.has(id)) return null;
  return `u${id}`;
}

function toMsg(message: {
  id: number;
  message?: string;
  date?: number;
  out?: boolean;
  peerId?: unknown;
  senderId?: unknown;
}): { chatId: string; msg: Msg } | null {
  const chatId = chatIdOf(message);
  if (!chatId) return null;
  const text = (message.message ?? "").trim();
  return {
    chatId,
    msg: {
      id: String(message.id),
      sender: message.out ? "self" : "other",
      text: text || "[非文字消息]",
      at: (message.date ?? 0) * 1000,
    },
  };
}

async function userOf(chatId: string): Promise<Chat> {
  const found = session.get(chatId)?.chat;
  if (found) return found;
  const user = (await client.getEntity(Number(chatId.slice(1)))) as RawUser;
  return chatFrom(user);
}

export async function start() {
  await client.connect();
  const me = await client.getMe();
  session.setSelf(me.id.toString(), displayName(me as unknown as RawUser));

  for (const dialog of await client.getDialogs({ limit: 50 })) {
    const entity = dialog.entity;
    if (!(entity instanceof Api.User) || entity.self) continue;
    if (SERVICE_IDS.has(entity.id.toString())) continue;
    session.register(chatFrom(entity as unknown as RawUser));
  }

  const onMessage = (event: unknown) => {
    const parsed = toMsg((event as { message: never }).message);
    if (!parsed || !parsed.msg.text) return;
    void userOf(parsed.chatId)
      .then((chat) => {
        // 打到终端上，这样"浏览器不更新"能一眼分清是链路断了还是界面问题。
        const who = parsed.msg.sender === "self" ? "我" : "对方";
        console.log(`[tg] ${who} · ${chat.title}：${parsed.msg.text.slice(0, 40)}`);
        session.ingest(chat, parsed.msg);
      })
      .catch((err: unknown) => {
        console.error("[tg] 消息入库失败", err);
      });
  };
  client.addEventHandler(onMessage, new NewMessage({}));
  client.addEventHandler(onMessage, new EditedMessage({}));

  client.addEventHandler(
    (event: unknown) => {
      for (const id of (event as { deletedIds?: number[] }).deletedIds ?? []) {
        for (const chat of session.listChats()) {
          if (session.messages(chat.id).some((m) => m.id === String(id))) {
            session.delete(chat.id, String(id));
          }
        }
      }
    },
    new DeletedMessage({}),
  );

  client.addEventHandler(
    (update: unknown) => {
      if (!(update instanceof Api.UpdateUserTyping)) return;
      const id = update.userId.toString();
      if (id === session.getSelf().id) return;
      const typing = !(update.action instanceof Api.SendMessageCancelAction);
      void session.typing(`u${id}`, "other", typing);
    },
    new Raw({ types: [Api.UpdateUserTyping] }),
  );
}

export async function loadHistory(chatId: string, limit = 60) {
  const chat = await userOf(chatId);
  const peer = await client.getInputEntity(Number(chatId.slice(1)));
  const messages = await client.getMessages(peer, { limit });
  for (const m of [...messages].reverse()) {
    if (!(m instanceof Api.Message)) continue;
    session.ingest(
      chat,
      {
        id: String(m.id),
        sender: m.out ? "self" : "other",
        text: (m.message ?? "").trim() || "[非文字消息]",
        at: (m.date ?? 0) * 1000,
      },
      false,
    );
  }
}

/**
 * 以本人的身份发一条消息。
 * 自己发的消息 MTProto 不一定回推给自己，所以发完直接入库 —— 界面立刻能看到，
 * 也不依赖"一个 session 开多个客户端"那种会打断投递的用法。
 */
export async function sendAsMe(chatId: string, text: string) {
  const chat = await userOf(chatId);
  const sent = (await client.sendMessage(await client.getInputEntity(Number(chatId.slice(1))), {
    message: text,
  })) as { id: number; date?: number };
  session.ingest(chat, {
    id: String(sent.id),
    sender: "self",
    text,
    at: (sent.date ?? Math.floor(Date.now() / 1000)) * 1000,
  });
  return String(sent.id);
}
