const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const state = {
  self: null,
  chats: [],
  watched: null,
  relation: "crush",
  messages: [],
  pending: new Set(),
  reads: new Map(),
  sentReads: new Map(),
  overview: null,
  judgment: null,
  typing: false,
  busy: new Set(),
  visible: 0,
};

/** 一屏只展示最近这么多条：backfill 覆盖同一个窗口，可见的就有读数，页面不会大片空白。 */
const VISIBLE = 12;

/** 每个会话各自记一份草稿，切会话/重连都不丢。 */
const drafts = new Map();
/** 已经播过入场动画的分析卡，key 里带会话，切回来也不重播。 */
const animated = new Set();
function anim(kind, id) {
  const key = `${state.watched}:${kind}:${id}`;
  if (animated.has(key)) return "";
  animated.add(key);
  return " rise";
}

let socket;

/* ── 传送 ───────────────────────────────────────────── */

function connect() {
  socket = new WebSocket(`ws://${location.host}`);

  socket.onclose = () => {
    $("live-dot").className = "dot";
    setTimeout(connect, 1200);
  };

  socket.onmessage = (raw) => {
    const e = JSON.parse(raw.data);
    switch (e.type) {
      case "hello":
        state.self = e.self;
        state.chats = e.chats;
        $("self-name").textContent = e.self.name;
        renderChats();
        if (e.watched) watch(e.watched);
        else if (e.chats[0]) watch(e.chats[0].id);
        break;

      case "chat":
        if (!state.chats.some((c) => c.id === e.chat.id)) {
          state.chats.push(e.chat);
          renderChats();
          if (!state.watched) {
            watch(e.chat.id);
            break;
          }
        }
        if (e.chat.id !== state.watched) break;
        state.messages = e.messages;
        state.relation = e.relation;
        state.pending = new Set(e.pending ?? []);
        $("title").textContent = e.chat.title;
        renderMessages();
        break;

      case "message":
      case "messageEdited":
        if (e.chatId !== state.watched) break;
        upsert(e.msg);
        renderMessages();
        break;

      case "messageDeleted":
        if (e.chatId !== state.watched) break;
        state.messages = state.messages.filter((m) => m.id !== e.id);
        state.pending.delete(e.id);
        state.reads.delete(e.id);
        state.sentReads.delete(e.id);
        renderMessages();
        break;

      case "typing":
        if (e.chatId !== state.watched || e.who !== "other") break;
        state.typing = e.active;
        renderTyping();
        break;

      case "line":
        if (e.chatId !== state.watched) break;
        state.pending.delete(e.read.id);
        state.reads.set(e.read.id, { read: e.read, meta: e.meta });
        renderMessages();
        telemetry(e.meta, "对方消息读数");
        break;

      case "sent":
        if (e.chatId !== state.watched) break;
        state.pending.delete(e.read.id);
        state.sentReads.set(e.read.id, { read: e.read, meta: e.meta });
        renderMessages();
        telemetry(e.meta, "我方消息评级");
        break;

      case "overview":
        if (e.chatId !== state.watched) break;
        state.overview = e.overview;
        renderPanel();
        telemetry(e.meta, "好感全量");
        break;

      case "judge":
        if (e.chatId !== state.watched) break;
        // 连续打字会有多个判断并发返回，先发的后到会覆盖新草稿的结论。
        if (e.judgment.draft !== $("draft").value.trim()) break;
        state.judgment = e.judgment;
        renderJudge();
        telemetry(e.meta, "草稿判断");
        break;

      case "pending":
        if (e.chatId !== state.watched) break;
        state.pending = new Set(e.pending);
        // 正在重算的条目，旧结论已经不成立（典型是消息被编辑过）。
        for (const id of state.pending) {
          state.reads.delete(id);
          state.sentReads.delete(id);
        }
        renderMessages();
        break;

      case "busy":
        if (e.chatId && e.chatId !== state.watched) break;
        if (e.active) state.busy.add(e.task);
        else state.busy.delete(e.task);
        $("live-dot").className = state.busy.size ? "dot busy" : "dot on";
        break;

      case "error":
        console.error("[server]", e.message);
        $("telemetry").textContent = `错误 · ${e.message}`;
        break;
    }
  };
}

const send = (c) => socket?.readyState === 1 && socket.send(JSON.stringify(c));

function upsert(msg) {
  const at = state.messages.findIndex((m) => m.id === msg.id);
  if (at >= 0) state.messages[at] = msg;
  else state.messages.push(msg);
  state.messages.sort((a, b) => a.at - b.at);
}

function watch(chatId) {
  state.watched = chatId;
  state.messages = [];
  state.pending = new Set();
  state.visible = VISIBLE;
  state.reads = new Map();
  state.sentReads = new Map();
  state.overview = null;
  state.judgment = null;
  state.typing = false;
  clearTimeout(debounce);
  $("judge-result").hidden = true;
  $("draft").value = drafts.get(chatId) ?? "";
  $("judge-hint").textContent = "输入后自动判断";
  renderChats();
  renderMessages();
  renderPanel();
  renderTyping();
  send({ type: "watch", chatId });
}

/* ── 小工具 ─────────────────────────────────────────── */

const initial = (name) => Array.from(String(name ?? "?"))[0] ?? "?";
const timeOf = (at) => new Date(at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

function grade(v) {
  if (v === null || v === undefined) return { text: "看不准", cls: "g-bad" };
  if (v >= 80) return { text: "妙", cls: "g-good" };
  if (v >= 60) return { text: "稳", cls: "g-good" };
  if (v >= 40) return { text: "一般", cls: "g-mid" };
  if (v >= 20) return { text: "有点尬", cls: "g-bad" };
  return { text: "刹车", cls: "g-bad" };
}

/** 概率分布做成堆叠条，比一排小药丸好读。 */
function lensRow(name, ranked) {
  if (!ranked.length) return "";
  const rest = Math.max(0, 1 - ranked.reduce((sum, r) => sum + r.probability, 0));
  const segs =
    ranked.map((r) => `<i style="width:${(r.probability * 100).toFixed(2)}%"></i>`).join("") +
    (rest > 0.005 ? `<i class="rest" style="width:${(rest * 100).toFixed(2)}%"></i>` : "");
  const legend = ranked
    .map((r) => `<span><b>${esc(r.label)}</b> ${esc(r.percent)}</span>`)
    .join("");
  return `<div class="lens-row">
    <div class="lens-head"><span class="lens-name">${name}</span></div>
    <div class="meter">${segs}</div>
    <div class="legend">${legend}</div>
  </div>`;
}

/* ── 渲染 ───────────────────────────────────────────── */

function renderChats() {
  const list = $("chat-list");
  if (!state.chats.length) {
    list.innerHTML = `<li class="empty">还没有会话<br />让「小 A」先发一条消息</li>`;
    return;
  }
  list.innerHTML = state.chats
    .map(
      (c) => `<li data-id="${esc(c.id)}" class="${c.id === state.watched ? "active" : ""}">
        <span class="avatar">${esc(initial(c.title))}</span>
        <span class="name">${esc(c.title)}</span>
      </li>`,
    )
    .join("");
  for (const li of list.children) li.onclick = () => watch(li.dataset.id);
}

function lens(id) {
  const entry = state.reads.get(id);
  if (!entry) return state.pending.has(id) ? `<div class="pending">分析中</div>` : "";
  const { read } = entry;
  const flags = [];
  if (read.tone) flags.push(`<span class="flag">语气 · ${esc(read.tone.label)}</span>`);
  if (read.event) flags.push(`<span class="flag lang">事件 · ${esc(read.event.label)}</span>`);
  if (read.openQuestion >= 0.6) flags.push(`<span class="flag warn">留了一个待回应的问题</span>`);
  return `<div class="lens${anim("line", id)}">
    ${lensRow("情绪", read.emotions)}
    ${lensRow("意图", read.intents)}
    ${flags.length ? `<div class="flags">${flags.join("")}</div>` : ""}
  </div>`;
}

function report(id) {
  const entry = state.sentReads.get(id);
  if (!entry) {
    return state.pending.has(id)
      ? `<div class="report"><span class="pending">分析中</span></div>`
      : "";
  }
  const { read } = entry;
  const g = grade(read.value);
  const hits = read.hits.filter((h) => h.fired).map((h) => h.label);
  return `<div class="report${anim("sent", id)}">
    <div class="report-head">
      <span class="report-effect">${esc(read.effectLabel)}</span>
      <span class="grade ${g.cls}">${g.text}</span>
    </div>
    ${hits.length ? `<div class="report-hits">${esc(hits.join(" · "))}</div>` : ""}
    <div class="report-next">下一步 · ${esc(read.nextMoveLabel)}</div>
  </div>`;
}

function renderMessages() {
  const box = $("messages");
  // 重绘前记住位置：贴底才自动跟随，否则按高度差补偿，别把正在读历史的人拽回底部。
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const prevHeight = box.scrollHeight;
  const her = state.messages.filter((m) => m.sender === "other");
  const me = state.messages.filter((m) => m.sender === "self");
  const hidden = Math.max(0, state.messages.length - state.visible);
  const shown = state.messages.slice(hidden);
  box.innerHTML =
    (hidden
      ? `<button class="more" id="more">显示更早的 ${hidden} 条</button>`
      : "") +
    shown
    .map((m) =>
      m.sender === "other"
        ? `<div class="msg her">
             <span class="avatar">${esc(initial($("title").textContent))}</span>
             <div class="bubble">${esc(m.text)}</div>
             <div class="stamp">${timeOf(m.at)}</div>
             ${lens(m.id)}
           </div>`
        : `<div class="msg me">
             <div class="bubble">${esc(m.text)}</div>
             <div class="stamp">${timeOf(m.at)}</div>
             ${report(m.id)}
           </div>`,
    )
    .join("");
  if (atBottom) box.scrollTop = box.scrollHeight;
  else box.scrollTop += box.scrollHeight - prevHeight;
  const more = $("more");
  if (more) more.onclick = () => { state.visible += VISIBLE * 2; renderMessages(); };
  $("counters").innerHTML =
    `<span>${state.messages.length} 条</span>` +
    `<span>对方读数 ${state.reads.size}/${her.length}</span>` +
    `<span>我方评级 ${state.sentReads.size}/${me.length}</span>`;
}

const RING = 314.16;

function renderPanel() {
  const o = state.overview;
  if (!o) {
    $("affinity-number").textContent = "—";
    $("affinity-stage").textContent = "等待分析";
    $("ring-fill").style.strokeDashoffset = RING;
    $("dimensions").innerHTML = "";
    $("affinity-note").hidden = true;
    return;
  }
  const v = o.affinity;
  $("affinity-number").textContent = v ?? "—";
  $("affinity-stage").textContent = o.stageLabel;
  const ring = $("ring-fill");
  ring.style.strokeDashoffset = RING * (1 - (v ?? 0) / 100);
  ring.style.stroke = v === null ? "#2c3a4b" : v >= 60 ? "var(--hot)" : v >= 40 ? "var(--her)" : "var(--bad)";

  $("dimensions").innerHTML = o.dimensions
    .map((d) => {
      const cls = d.value === null ? "unknown" : d.value >= 70 ? "high" : d.value <= 30 ? "low" : "";
      return `<div class="dim-row ${cls}">
        <span class="label">${esc(d.label)}</span>
        <span class="track"><i style="width:${d.value ?? 0}%"></i></span>
        <span class="val">${d.value ?? "—"}</span>
      </div>`;
    })
    .join("");

  const note = $("affinity-note");
  note.hidden = !o.boundaryApplied;
  if (o.boundaryApplied) note.textContent = "对方明确表达了当前仍有效的边界，总分已封顶 25。";

  $("action-label").textContent = o.actionLabel;
  $("action-detail").textContent = o.actionDetail;
  const alt = $("action-alt");
  alt.hidden = !o.alternative;
  if (o.alternative) alt.textContent = `次选 · ${o.alternative}`;

  if (document.activeElement !== $("relation")) $("relation").value = state.relation;
}

function renderJudge() {
  const j = state.judgment;
  if (!j) return;
  const box = $("judge-result");
  box.hidden = false;

  const box2 = box.querySelector(".verdict");
  box2.className = `verdict t-${
    j.value === null ? "mid" : j.value >= 60 ? "good" : j.value >= 40 ? "mid" : "bad"
  }`;
  $("judge-score").textContent = j.value ?? "—";
  $("judge-verdict").textContent =
    j.value === null ? "上下文不够，看不准" : j.value >= 80 ? "很稳，可以发" : j.value >= 60 ? "可以发" : j.value >= 40 ? "再想想" : "先别发";
  $("judge-fit").textContent = j.emotionFit === null ? "" : `情绪贴合度 ${j.emotionFit}`;

  const timing = { now: ["时机 · 现在就发", "t-now"], soon: ["时机 · 不急", "t-soon"], wait: ["时机 · 先别发", "t-wait"] }[j.timing];
  const t = $("judge-timing");
  t.className = `timing ${timing[1]}`;
  t.textContent = `${timing[0]} ${Math.round(j.sendNow * 100)}%`;

  $("judge-hits").innerHTML = j.hits
    .map(
      (h) => `<li class="${h.fired ? "on" : ""}">
        <span class="mark">${h.fired ? "✕" : "·"}</span>
        <span>${esc(h.label)}</span>
      </li>`,
    )
    .join("");

  $("judge-direction").textContent = j.directionLabel;
  $("judge-direction-detail").textContent = j.directionDetail;
  $("judge-hint").textContent = `${j.draft.length} 字 · 已判断`;
}

function renderTyping() {
  $("typing").hidden = !state.typing;
  $("typing-text").textContent = state.typing ? "对方正在输入…（正在预热会话级判断）" : "";
}

function telemetry(meta, what) {
  $("telemetry").textContent =
    `${what} · ${meta.model} · ${meta.latencyMs}ms · ${meta.usage.input_tokens} in / ${meta.usage.output_tokens} out`;
}

/* ── 交互 ───────────────────────────────────────────── */

let debounce;
$("draft").addEventListener("input", () => {
  clearTimeout(debounce);
  const raw = $("draft").value;
  if (state.watched) drafts.set(state.watched, raw);
  const text = raw.trim();
  if (text.length < 2) {
    $("judge-result").hidden = true;
    $("judge-hint").textContent = "输入后自动判断";
    return;
  }
  // 捕获发起时的会话：700ms 内切走就不该把这条草稿算到别的会话头上。
  const forChat = state.watched;
  $("judge-hint").textContent = "判断中…";
  debounce = setTimeout(() => {
    if (!forChat || state.watched !== forChat) return;
    send({ type: "judge", chatId: forChat, draft: text });
  }, 700);
});

$("refresh").onclick = () => state.watched && send({ type: "refresh", chatId: state.watched });

$("relation").onchange = (e) => {
  state.relation = e.target.value;
  if (state.watched) send({ type: "relation", chatId: state.watched, relation: e.target.value });
};

connect();
