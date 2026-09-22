import express from "express";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { config } from "./config.ts";
import { session } from "./state.ts";
import type { ClientCommand, ServerEvent } from "./types.ts";

export type Telegram = {
  start: () => Promise<void>;
  loadHistory: (chatId: string, limit?: number) => Promise<void>;
  sendAsMe: (chatId: string, text: string) => Promise<string>;
};

export async function serve(telegram: Telegram) {
  const app = express();
  app.use(express.json());
  app.use(express.static(new URL("../public", import.meta.url).pathname));

  // 发送必须走服务端唯一的那个 Telegram 客户端；另开客户端会和它抢更新投递。
  app.post("/api/send", async (req, res) => {
    const { chatId, text } = (req.body ?? {}) as { chatId?: string; text?: string };
    if (!chatId || !text?.trim()) {
      res.status(400).json({ error: "需要 chatId 和 text" });
      return;
    }
    try {
      res.json({ id: await telegram.sendAsMe(chatId, text.trim()) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const sockets = new Set<WebSocket>();

  const send = (ws: WebSocket, event: ServerEvent) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event));
  };

  session.bus.on("event", (event: ServerEvent) => {
    for (const ws of sockets) {
      if (event.type === "chat" || !("chatId" in event) || event.chatId === session.watched) {
        send(ws, event);
      }
    }
  });

  // 半死的连接不会自己触发 close，会一直留在 sockets 里被反复 send，
  // 浏览器就静默地再也收不到更新。用心跳把这种连接踢掉。
  const alive = new WeakSet<WebSocket>();
  const heartbeat = setInterval(() => {
    for (const ws of sockets) {
      if (!alive.has(ws)) {
        ws.terminate();
        sockets.delete(ws);
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 20_000);
  server.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (ws) => {
    sockets.add(ws);
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    send(ws, {
      type: "hello",
      self: session.getSelf(),
      chats: session.listChats(),
      watched: session.watched,
    });
    if (session.watched) {
      for (const event of session.snapshot(session.watched)) send(ws, event);
    }

    ws.on("message", (raw) => {
      void (async () => {
        let command: ClientCommand;
        try {
          command = JSON.parse(String(raw)) as ClientCommand;
        } catch {
          return;
        }
        if (command.type === "watch") {
          session.watch(command.chatId);
          const known = session.messages(command.chatId).length;
          if (!known) await telegram.loadHistory(command.chatId);
          session.backfill(command.chatId);
          for (const event of session.snapshot(command.chatId)) send(ws, event);
          session.refreshOverview(command.chatId);
          return;
        }
        if (command.type === "judge") {
          await session.judge(command.chatId, command.draft);
          return;
        }
        if (command.type === "refresh") {
          session.refreshOverview(command.chatId);
          return;
        }
        if (command.type === "relation") {
          session.setRelation(command.chatId, command.relation);
          session.refreshOverview(command.chatId);
          for (const event of session.snapshot(command.chatId)) send(ws, event);
        }
      })().catch((err: unknown) => {
        send(ws, {
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    });

    // ws 对畸形帧会 emit('error')，没有监听器时 Node 会直接打挂进程。
    ws.on("error", (err: Error) => console.error("[ws]", err.message));
    ws.on("close", () => sockets.delete(ws));
  });

  server.listen(config.port, config.host, () => {
    console.log(`\n  打开 http://${config.host}:${config.port}\n`);
  });

  return server;
}
