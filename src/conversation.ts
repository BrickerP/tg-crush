/**
 * 演示对话的唯一真源。autoplay 拿它走真实 Telegram 往返，smoke 拿它离线验 Jev 判据。
 *
 * 注意：这里只是"对方"要说的台词。台词本身总得有人写，但它不是喂给管线的假数据 ——
 * 消息真的发到 Telegram，再从 MTProto 推回来，和有人拿手机发是同一条路径。
 */
export type Turn = {
  who: "her" | "you";
  text: string;
  /** 这条发出前先静默停顿多久，模拟真实的思考间隔 */
  gapMs?: number;
  /** "正在输入"持续多久；不填按字数估（140ms/字，1.5~4s） */
  typingMs?: number;
};

const t = (who: Turn["who"], text: string, gapMs = 0): Turn => ({ who, text, gapMs });

export const CONVERSATION: Turn[] = [
  t("her", "刚下班 今天累瘫了"),
  t("you", "那早点睡", 9_000),
  t("her", "嗯…… 才八点", 8_000),
  t("you", "哈哈也对 那你想干嘛", 5_000),
  t("her", "不知道 就是不想动", 7_000),
  t("you", "那我陪你聊会儿", 5_000),
  t("her", "说实话今天真的挺憋的 领导临下班又塞了一堆活 回到家连饭都不想吃", 6_000),
  // 故意发烂的：讲道理而不是接情绪，用来对比下一条
  t("you", "那你就直接跟领导说你干不完啊", 4_000),
  t("you", "临下班来这个 换谁都得炸", 7_000),
  t("her", "你还挺懂的", 8_000),
  t("her", "对了 你上次说的那部电影 你看了吗", 6_000),
  t("you", "还没 想等你有空一起看", 9_000),
  t("her", "最近好想吃那家新开的日料 一直没找到人去", 10_000),
  t("you", "那这周找个时间？你定地方", 9_000),
  // 留一段沉默：验证「等对方接球」的闸门会在我方发完后自己跳出来
  t("her", "……刚才在忙 你说什么", 40_000),
  t("you", "没事 就是想约你吃饭", 6_000),
  t("her", "不过想想还是算了 我觉得我们还是做朋友比较好", 12_000),
];

export function asMessages(base = Date.now()) {
  let at = base;
  return CONVERSATION.map((turn, i) => {
    at += turn.gapMs ?? 0;
    return {
      id: String(100 + i),
      sender: turn.who === "her" ? ("other" as const) : ("self" as const),
      text: turn.text,
      at,
    };
  });
}
