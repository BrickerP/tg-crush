import { judgeDraft, readArrival, readOverview, readSent } from "./jev.ts";
import { asMessages, CONVERSATION } from "./conversation.ts";

const all = asMessages(Date.now() - 3_600_000);
const upto = (i: number) => all.slice(0, i + 1);
const idx = (i: number) => all[i].id;
const line = (i: number) => all[i].text;

const show = (meta: { model: string; latencyMs: number; usage: { input_tokens: number } }) =>
  console.log(`   └ ${meta.model} ${meta.latencyMs}ms ${meta.usage.input_tokens}in\n`);

console.log("\n① 对方读数（倾诉）——", JSON.stringify(line(6)));
const a = await readArrival(upto(6), idx(6), "crush");
if (a) {
  console.log("   情绪:", a.read.emotions.map((e) => `${e.label} ${e.percent}`).join(" / "));
  console.log("   意图:", a.read.intents.map((e) => `${e.label} ${e.percent}`).join(" / "));
  console.log("   语气:", a.read.tone?.label, "| 事件:", a.read.event?.label ?? "无");
  console.log("   有待回应的问题:", a.read.openQuestion.toFixed(2));
  show(a.meta);
}

console.log("② 对方读数（具体提问）——", JSON.stringify(line(10)));
const q = await readArrival(upto(10), idx(10), "crush");
if (q) {
  console.log("   情绪:", q.read.emotions.map((e) => `${e.label} ${e.percent}`).join(" / "));
  console.log("   意图:", q.read.intents.map((e) => `${e.label} ${e.percent}`).join(" / "));
  console.log("   有待回应的问题:", q.read.openQuestion.toFixed(2), "(红标阈值 0.6)");
  show(q.meta);
}

console.log("③ 我方评级 ——", JSON.stringify(line(5)));
const s = await readSent(upto(5), idx(5), "crush");
if (s) {
  console.log(`   分数 ${s.read.value} (${s.read.status}) | 作用: ${s.read.effectLabel}`);
  console.log("   命中:", s.read.hits.filter((h) => h.fired).map((h) => h.label).join(" / ") || "无");
  console.log("   下一步:", s.read.nextMoveLabel);
  show(s.meta);
}

for (const [tag, draft] of [
  ["坏（讲道理）", "那你就直接跟领导说你干不完啊"],
  ["好（接情绪）", "临下班来这个 换谁都得炸"],
] as const) {
  console.log(`④ 草稿体检 ${tag} —— ${JSON.stringify(draft)}`);
  const j = await judgeDraft(upto(7), draft, "crush");
  console.log(
    `   分数 ${j.judgment.value} | 情绪贴合 ${j.judgment.emotionFit} | 方向 ${j.judgment.directionLabel}`,
  );
  console.log(
    "   命中:",
    j.judgment.hits
      .filter((h) => h.fired)
      .map((h) => `${h.label}(${h.probability.toFixed(2)})`)
      .join(" / ") || "无",
  );
  show(j.meta);
}

console.log("⑤ 会话级（边界句之前）");
const before = await readOverview(upto(15), "crush");
if (before) {
  console.log(
    `   总分 ${before.overview.affinity} | 阶段 ${before.overview.stageLabel} | 行动 ${before.overview.actionLabel}`,
  );
  console.log("   边界约束:", before.overview.boundaryApplied);
  for (const d of before.overview.dimensions) {
    console.log(`   ${String(d.weight).padStart(2)} ${d.label.padEnd(5, "　")} ${String(d.value ?? "—").padStart(3)} ${d.status}`);
  }
  show(before.meta);
}

console.log("⑥ 安全阀 ——", JSON.stringify(line(16)));
const b = await readArrival(all, idx(16), "crush");
if (b) console.log("   意图:", b.read.intents.map((e) => `${e.label} ${e.percent}`).join(" / "));
const after = await readOverview(all, "crush");
if (after) {
  console.log(
    `   总分 ${after.overview.affinity} | 行动 ${after.overview.actionLabel} | 边界约束 ${after.overview.boundaryApplied}`,
  );
  console.log("   （期望：总分被压到 25 以下，行动变「尊重边界」）");
  show(after.meta);
}

console.log(`共 ${CONVERSATION.length} 条台词\n`);
