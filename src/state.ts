import { EventEmitter } from "node:events";
import {
  judgeDraft,
  readArrival,
  readOverview,
  readSent,
  type Relation,
} from "./jev.ts";
import type {
  Chat,
  DraftJudgment,
  LineRead,
  Meta,
  Msg,
  OverviewRead,
  SentRead,
  Sender,
  ServerEvent,
} from "./types.ts";

type Thread = {
  chat: Chat;
  relation: Relation;
  messages: Msg[];
  pending: Set<string>;
  reads: Map<string, { read: LineRead; meta: Meta }>;
  sentReads: Map<string, { read: SentRead; meta: Meta }>;
  overview?: { overview: OverviewRead; meta: Meta };
  selfTyping: boolean;
  otherTyping: boolean;
  typingTimer?: ReturnType<typeof setTimeout>;
  queue: Promise<unknown>;
  revision: number;
  overviewStale: boolean;
  overviewRunning: boolean;
};

class Session {
  readonly bus = new EventEmitter();
  private threads = new Map<string, Thread>();
  private self = { id: "self", name: "me" };
  watched: string | null = null;

  setSelf(id: string, name: string) {
    this.self = { id, name };
  }

  getSelf() {
    return this.self;
  }

  listChats(): Chat[] {
    return [...this.threads.values()]
      .sort(
        (a, b) =>
          (b.messages.at(-1)?.at ?? 0) - (a.messages.at(-1)?.at ?? 0),
      )
      .map((t) => t.chat);
  }

  messages(chatId: string): Msg[] {
    return this.threads.get(chatId)?.messages ?? [];
  }

  relation(chatId: string): Relation {
    return this.threads.get(chatId)?.relation ?? "crush";
  }

  setRelation(chatId: string, relation: Relation) {
    const t = this.threads.get(chatId);
    if (t) {
      t.relation = relation;
      t.overviewStale = true;
    }
  }

  get(chatId: string): Thread | undefined {
    return this.threads.get(chatId);
  }

  emit(event: ServerEvent) {
    this.bus.emit("event", event);
  }

  /** pending 由服务端独占管理，客户端只跟随，避免任何失败路径留下永久"分析中"。 */
  private setPending(t: Thread, id: string, on: boolean) {
    const changed = on ? !t.pending.has(id) : t.pending.has(id);
    if (!changed) return;
    if (on) t.pending.add(id);
    else t.pending.delete(id);
    this.emit({ type: "pending", chatId: t.chat.id, pending: [...t.pending] });
  }

  private ensure(chat: Chat): Thread {
    let t = this.threads.get(chat.id);
    if (!t) {
      t = {
        chat,
        relation: "crush",
        messages: [],
        pending: new Set(),
        reads: new Map(),
        sentReads: new Map(),
        selfTyping: false,
        otherTyping: false,
        queue: Promise.resolve(),
        revision: 0,
        overviewStale: false,
        overviewRunning: false,
      };
      this.threads.set(chat.id, t);
      this.emit({ type: "chat", chat, messages: [], relation: t.relation, pending: [] });
    } else if (chat.title && chat.title !== t.chat.title) {
      t.chat = { ...t.chat, ...chat };
    }
    return t;
  }

  /** Serialize Jev work per thread so a chatty session cannot pile up requests. */
  private enqueue(thread: Thread, task: () => Promise<unknown>) {
    thread.queue = thread.queue.then(task).catch((err: unknown) => {
      this.emit({
        type: "error",
        chatId: thread.chat.id,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  register(chat: Chat) {
    this.ensure(chat);
  }

  ingest(chat: Chat, msg: Msg, analyze = true) {
    const t = this.ensure(chat);
    const existing = t.messages.findIndex((m) => m.id === msg.id);
    if (existing >= 0) {
      const before = t.messages[existing];
      if (before.text === msg.text && before.at === msg.at) return;
      t.messages[existing] = msg;
      t.revision += 1;
      t.overviewStale = true;
      this.emit({ type: "messageEdited", chatId: chat.id, msg });
      // 文本变了，旧的读数和评级就不再成立，作废重算。
      if (msg.sender === "other") t.reads.delete(msg.id);
      else t.sentReads.delete(msg.id);
      // 无条件重排：飞行中的那次会被上面的文本校验作废，所以必须补一次。
      if (analyze) {
        this.setPending(t, msg.id, true);
        this.enqueue(t, () =>
          msg.sender === "other" ? this.analyzeArrival(t, msg.id) : this.analyzeSent(t, msg.id),
        );
      }
      // 服务端是顺序权威，编辑改了时间就重排，别和客户端打架。
      t.messages.sort((a, b) => a.at - b.at);
      return;
    }
    const insertAt = t.messages.findIndex((m) => m.at > msg.at);
    if (insertAt < 0) t.messages.push(msg);
    else t.messages.splice(insertAt, 0, msg);
    t.revision += 1;
    t.overviewStale = true;
    this.emit({ type: "message", chatId: chat.id, msg });
    if (analyze) {
      this.setPending(t, msg.id, true);
      this.enqueue(t, () =>
        msg.sender === "other" ? this.analyzeArrival(t, msg.id) : this.analyzeSent(t, msg.id),
      );
    }
  }

  delete(chatId: string, id: string) {
    const t = this.threads.get(chatId);
    if (!t) return;
    t.messages = t.messages.filter((m) => m.id !== id);
    t.reads.delete(id);
    t.sentReads.delete(id);
    this.setPending(t, id, false);
    t.revision += 1;
    t.overviewStale = true;
    this.emit({ type: "messageDeleted", chatId, id });
  }

  typing(chatId: string, who: Sender, active: boolean) {
    const t = this.threads.get(chatId);
    if (!t) return;
    const was = who === "self" ? t.selfTyping : t.otherTyping;
    if (was === active) return;
    if (who === "self") t.selfTyping = active;
    else t.otherTyping = active;
    this.emit({ type: "typing", chatId, who, active });
    // Telegram 不保证推"停止输入"，所以自己带超时，否则指示器会永远亮着。
    if (t.typingTimer) clearTimeout(t.typingTimer);
    if (active) {
      t.typingTimer = setTimeout(() => {
        t.otherTyping = false;
        this.emit({ type: "typing", chatId, who: "other", active: false });
      }, 6_000);
    }
    // Their typing is the only warning we get that a message is coming.
    // Spend it refreshing the conversation-level read so the arrival is cheap.
    if (who === "other" && active && t.overviewStale) this.refreshOverview(chatId);
  }

  watch(chatId: string | null) {
    this.watched = chatId;
  }

  /** Everything a freshly connected UI needs to render one chat. */
  snapshot(chatId: string): ServerEvent[] {
    const t = this.threads.get(chatId);
    if (!t) return [];
    const events: ServerEvent[] = [
      {
        type: "chat",
        chat: t.chat,
        messages: t.messages,
        relation: t.relation,
        pending: [...t.pending],
      },
    ];
    for (const { read, meta } of t.reads.values()) {
      events.push({ type: "line", chatId, read, meta });
    }
    for (const { read, meta } of t.sentReads.values()) {
      events.push({ type: "sent", chatId, read, meta });
    }
    if (t.overview) {
      events.push({
        type: "overview",
        chatId,
        overview: t.overview.overview,
        meta: t.overview.meta,
      });
    }
    return events;
  }

  async analyzeArrival(t: Thread, id: string) {
    const at = t.messages.find((m) => m.id === id)?.text;
    try {
      this.emit({ type: "busy", chatId: t.chat.id, task: "read", active: true });
      const out = await readArrival(t.messages, id, t.relation);
      if (!out) return;
      // 请求飞行期间这条被改过或删了，结果就不再对应当前文本，直接作废。
      if (t.messages.find((m) => m.id === id)?.text !== at) return;
      t.reads.set(id, { read: out.read, meta: out.meta });
      this.emit({
        type: "line",
        chatId: t.chat.id,
        read: out.read,
        meta: out.meta,
      });
    } finally {
      this.setPending(t, id, false);
      this.emit({ type: "busy", chatId: t.chat.id, task: "read", active: false });
    }
  }

  /** Rate a message I actually sent, so the loop closes on my own output too. */
  async analyzeSent(t: Thread, id: string) {
    const at = t.messages.find((m) => m.id === id)?.text;
    try {
      this.emit({ type: "busy", chatId: t.chat.id, task: "sent", active: true });
      const out = await readSent(t.messages, id, t.relation);
      if (!out) return;
      if (t.messages.find((m) => m.id === id)?.text !== at) return;
      t.sentReads.set(id, { read: out.read, meta: out.meta });
      this.emit({
        type: "sent",
        chatId: t.chat.id,
        read: out.read,
        meta: out.meta,
      });
      // 我发完这条，球就到我这边了 —— 会话级判断必须跟着变，
      // 否则「等对方接球」要等到对方下次打字才会跳出来。
      this.refreshOverview(t.chat.id);
    } finally {
      this.setPending(t, id, false);
      this.emit({ type: "busy", chatId: t.chat.id, task: "sent", active: false });
    }
  }

  refreshOverview(chatId: string) {
    const t = this.threads.get(chatId);
    if (!t || t.overviewRunning || !t.messages.length) return;
    // 这个标志必须覆盖整个执行期，否则执行中的每一次触发都会再排一次 6k token 的调用。
    t.overviewRunning = true;
    this.enqueue(t, async () => {
      this.emit({ type: "busy", chatId, task: "overview", active: true });
      try {
        let rounds = 0;
        do {
          t.overviewStale = false;
          const revision = t.revision;
          const out = await readOverview(t.messages, t.relation);
          if (out) {
            t.overview = { overview: out.overview, meta: out.meta };
            this.emit({ type: "overview", chatId, overview: out.overview, meta: out.meta });
          }
          if (t.revision !== revision) t.overviewStale = true;
          rounds += 1;
        } while (t.overviewStale && rounds < 3);
      } finally {
        t.overviewRunning = false;
        this.emit({ type: "busy", chatId, task: "overview", active: false });
      }
    });
  }

  /**
   * 把拉回来的历史里还没分析的消息补上 —— 两边都要补，
   * 否则旧消息会永远停在"分析中"。从最近往前补，超出 limit 的保持不分析。
   */
  backfill(chatId: string, limit = 14) {
    const t = this.threads.get(chatId);
    if (!t) return;
    // 先切窗口再过滤。反过来的话，最近的条目被 pending 排除后会往前多吞一批
    // 更老的历史，每次 watch 都多分析一批。
    const todo = t.messages
      .slice(-limit)
      .filter(
        (m) =>
          !t.pending.has(m.id) &&
          (m.sender === "other" ? !t.reads.has(m.id) : !t.sentReads.has(m.id)),
      );
    for (const m of todo) {
      this.setPending(t, m.id, true);
      this.enqueue(t, () =>
        m.sender === "other" ? this.analyzeArrival(t, m.id) : this.analyzeSent(t, m.id),
      );
    }
  }

  async judge(chatId: string, draft: string): Promise<DraftJudgment | null> {
    const t = this.threads.get(chatId);
    if (!t || !draft.trim()) return null;
    this.emit({ type: "busy", chatId, task: "judge", active: true });
    try {
      const out = await judgeDraft(t.messages, draft.trim(), t.relation);
      this.emit({
        type: "judge",
        chatId,
        judgment: out.judgment,
        meta: out.meta,
      });
      return out.judgment;
    } finally {
      this.emit({ type: "busy", chatId, task: "judge", active: false });
    }
  }
}

export const session = new Session();
