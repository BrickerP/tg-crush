/**
 * Taxonomy ported from FerryCorleone/crush-monitor (MIT, see LICENSE.crush-monitor).
 * One registry serves both the Jev criteria and the UI labels.
 */

export const EMOTIONS = {
  happy: { label: "开心", criteria: "愉快、满足、开心或兴奋" },
  confused: { label: "疑惑", criteria: "不理解、好奇、疑问或困惑" },
  angry: {
    label: "愤怒",
    criteria: "真实生气、愤怒或强烈不满，排除亲密玩笑式骂人",
  },
  sad: { label: "难过", criteria: "伤心、低落、悲伤" },
  shy: { label: "害羞", criteria: "羞涩、难为情或暧昧时不好意思" },
  caring: { label: "关心", criteria: "担心、关切或体贴对方" },
  teasing: { label: "调侃", criteria: "开玩笑、逗对方、玩梗或善意戏谑" },
  calm: { label: "平静", criteria: "客观陈述、平静中性交流，无明显情绪" },
  annoyed: { label: "不耐烦", criteria: "厌烦、想赶紧结束、不愿重复解释" },
  surprised: { label: "惊讶", criteria: "意外、吃惊、超出预期" },
  disappointed: { label: "失落", criteria: "期待落空、委屈、失望" },
  unknown: { label: "难判断", criteria: "无法判断主要情绪或以上均不适合" },
} as const;

export const INTENTS = {
  share: { label: "分享近况", criteria: "主动讲自己的经历、活动或状态，主要是分享而非回答问题" },
  answer: { label: "回答问题", criteria: "回应前面的具体询问，主要目的是提供所问信息" },
  inform: { label: "告知信息", criteria: "通知事实、安排或进展，区别于分享个人感受和经历" },
  ask: { label: "询问信息", criteria: "获取事实、原因、安排或情况，无需额外假定暧昧动机" },
  clarify: { label: "确认理解", criteria: "核对自己对前文的理解，询问是不是某个意思" },
  explain: { label: "解释说明", criteria: "澄清原因、误会或补充背景，让对方理解自己的话或行为" },
  opinion: { label: "表达观点", criteria: "陈述看法或评价，未明显要求对方赞同" },
  agree: { label: "表示认同", criteria: "赞同对方观点、感受或提议，不只是确认收到消息" },
  disagree: { label: "表达异议", criteria: "提出不同观点、反驳或纠正，不等于拒绝关系" },
  acknowledge: { label: "回应收到", criteria: "简短确认已看到或听懂，例如嗯、好的；没有更明确的沟通目的" },
  continue: { label: "延续话题", criteria: "接住前文或补充话头，主要在维持对话而非传达新信息" },
  change: { label: "转移话题", criteria: "将交流引向另一个话题，不能仅因转移就推断逃避或拒绝" },
  joke: { label: "玩笑逗趣", criteria: "开玩笑、接梗或善意互损，主要为了有趣；没有明显浪漫试探" },
  vent: { label: "倾诉烦恼", criteria: "表达困扰或抱怨以释放感受，没有明显要求解决方案" },
  comfort_seek: { label: "寻求安慰", criteria: "通过表达脆弱或委屈，希望得到情绪支持，而不只是分享情况" },
  validation: { label: "寻求认同", criteria: "希望对方肯定自己的感受、看法或价值，区别于单纯表达观点" },
  help: { label: "请求帮助", criteria: "希望对方提供具体建议、信息或实际帮助" },
  advice: { label: "提供建议", criteria: "主动提供解决办法或行动建议，不只是表达评价" },
  care: { label: "表达关心", criteria: "关注对方状态或需要，主要是关怀，不自动表示恋爱好感" },
  comfort: { label: "安慰支持", criteria: "接住对方困扰、鼓励或给予支持，区别于寻求安慰" },
  praise: { label: "赞美欣赏", criteria: "肯定对方特质或表现，不自动等于调情" },
  thanks: { label: "表达感谢", criteria: "感谢对方的回应、帮助或付出" },
  apologize: { label: "道歉修复", criteria: "承认不妥、致歉或尝试修复交流关系" },
  attention: { label: "寻求关注", criteria: "希望对方多注意、回应或陪伴自己，需要语境证据，普通分享不默认归此" },
  interest: { label: "试探好感", criteria: "间接探询对方是否在意自己或对自己有浪漫兴趣，须有具体上下文支持" },
  invite_hint: { label: "试探邀约", criteria: "含蓄创造共同活动或见面的机会，尚未直接提出邀请；单说无聊不够" },
  invite: { label: "发出邀约", criteria: "直接邀请对方见面、一起活动或协商具体安排" },
  flirt: {
    label: "暧昧逗弄",
    criteria: "用双关、亲昵或有浪漫意味的玩笑试探互动；普通互损不默认暧昧，不等于同意进一步行为",
  },
  affection: { label: "表达在意", criteria: "表达想念、珍惜或对彼此关系的重视，须有可见文本证据" },
  ease: { label: "缓和气氛", criteria: "缓解尴尬、冲突或紧张，玩笑在这里主要为了缓和关系" },
  refuse: { label: "婉拒提议", criteria: "委婉推辞当前提议或邀约，不能扩大成拒绝恋爱或否定对方" },
  boundary: {
    label: "表达边界",
    criteria: "说明不愿、不能接受或要求停止的行为，不把明确拒绝曲解为欲擒故纵",
  },
  close: { label: "结束聊天", criteria: "明确或含蓄表示本次对话先结束、自己要忙或休息" },
  other: { label: "其他意图", criteria: "能看出沟通目的，但不属于上述任何一类" },
  unknown: { label: "难以判断", criteria: "必要上下文缺失或存在无法消除的歧义，无法判断主要沟通意图" },
} as const;

export const EVENT_KINDS = {
  boundary: "明确提出保持距离、只做朋友、拒绝追求或停止联系的边界，不是暂时忙碌",
  reopen: "明确撤回先前的拒绝、重新允许接近或说明先前拒绝只是误会",
  invitation: "提出具体邀约或相处计划",
  confirmation: "明确接受或确认此前的邀约、承诺或安排",
  cancellation: "明确取消、拒绝或改期已有的具体安排",
  care: "针对对方具体处境或需要提供关心、支持或帮助",
  preference: "明确说出个人偏好、忌讳或重要习惯",
  disclosure: "主动分享重要个人经历、真实感受或脆弱处境",
  commitment: "明确表达喜欢、爱意或关系承诺，不是普通夸奖",
  question: "向对方提出一个具体、尚待回应的问题",
  correction: "明确澄清、纠正或解释前面某句话的意思",
  none: "没有值得跨片段保留的明确事件，只有普通接话、模糊暗示或证据不够",
} as const;

/** EVENT_KINDS 的值是给 Jev 看的判据长句，界面上要用短名。 */
export const EVENT_LABELS: Record<keyof typeof EVENT_KINDS, string> = {
  boundary: "明确边界",
  reopen: "撤回拒绝",
  invitation: "提出邀约",
  confirmation: "确认安排",
  cancellation: "取消安排",
  care: "针对性关心",
  preference: "个人偏好",
  disclosure: "自我披露",
  commitment: "心意承诺",
  question: "待答问题",
  correction: "澄清纠正",
  none: "无",
};

export const TONES = {
  warm: "关心靠近",
  playful: "俏皮试探",
  neutral: "平静交流",
  polite: "礼貌客气",
  upset: "不满委屈",
  closing: "回避收尾",
  unknown: "难以判断",
} as const;

export const STAGES = {
  unknown: "信息不足",
  contact: "刚搭上线",
  flow: "聊得起来",
  flirt: "出现暧昧",
  date: "有具体约会安排",
  mutual: "明确互表心意",
} as const;

export const ACTIONS = {
  continue: { label: "顺着聊", detail: "接住刚才的话题，别急着切换频道。" },
  ask: { label: "轻轻追问", detail: "问一个具体、容易回答的小问题，把球轻轻递过去。" },
  empathize: { label: "先接情绪", detail: "先回应对方的感受，再考虑讲道理或给建议。" },
  flirt: { label: "轻轻调情", detail: "顺着已经被接住的玩笑，留一点刚刚好的暧昧。" },
  invite: { label: "试着约一下", detail: "把共同兴趣变成一个具体、没有压力的小邀约。" },
  clarify: { label: "直接问清", detail: "这句话有不止一种理解，温和确认比反复猜更有效。" },
  wait: { label: "等对方接球", detail: "球已经递出去了。先留一点空间，不用急着补发。" },
  close: { label: "今天先收尾", detail: "让聊天停在舒服的位置，下次还有话可说。" },
  respect: { label: "尊重边界", detail: "对方表达了拒绝或需要空间。尊重这个意思，停止推进。" },
  insufficient: { label: "再多一点上下文", detail: "这几句话还看不准，补上前后文再一起看看。" },
} as const;

export const AFFINITY_DIMENSIONS = [
  {
    key: "initiative",
    label: "主动延续",
    weight: 15,
    question: "对方是否主动开启或延续与我的交流？不要靠消息条数推断。",
    levels: [
      "明确不愿继续交流",
      "有交流机会但只被动应付或反复终止话题",
      "自然接话，愿意保持交流",
      "主动追问、展开话题或在结束后重新找话题",
      "持续主动创造交流机会，并具体表达想与我保持联系",
    ],
  },
  {
    key: "engagement",
    label: "回应投入",
    weight: 20,
    question: "对方对我说的具体内容投入了多少注意与回应？短句、回复慢、忙碌本身不扣分。",
    levels: [
      "明确无视或贬低我的表达",
      "多次有回应机会却回避重点、只作敷衍应答",
      "正常回应问题，基本接得住话题",
      "回应细节、接住玩笑或认真展开我的话题",
      "持续专注地理解和回应我，主动跟进此前提到的具体事情",
    ],
  },
  {
    key: "care",
    label: "关心体贴",
    weight: 20,
    question: "对方是否针对我的感受、需要和处境表达个人化关心？礼貌客套与具体关心分开判断。",
    levels: [
      "明确嘲弄或漠视已表达的困难和感受",
      "在我表达需要时明显不愿回应或只敷衍",
      "普通礼貌与基本照顾，未见针对个人的特别关心",
      "具体理解、安慰我，记得其偏好或困扰",
      "主动持续照顾我的感受和需要，并提供具体支持",
    ],
  },
  {
    key: "openness",
    label: "自我开放",
    weight: 15,
    question: "对方是否愿意让我了解自己的生活、感受和个人想法？正常隐私边界不是疏远。",
    levels: [
      "明确拒绝让我了解自己并要求保持距离",
      "有相关话题但刻意保持非常表面的交流",
      "自然分享一般日常与观点",
      "主动分享个人细节、真实感受或寻求我的看法",
      "展现明显信任，主动分享脆弱感受、重要经历或内心想法",
    ],
  },
  {
    key: "intimacy",
    label: "亲密表达",
    weight: 20,
    question:
      "对方是否对我表达被双方接纳的特别亲近或恋爱意味？朋友间热闹、通用表情、普通夸奖不自动等于暧昧。",
    levels: [
      "明确拒绝恋爱或亲密接近，且当前仍有效",
      "明确限定普通关系、排除暧昧意味",
      "友好自然但没有明确恋爱意味，或亲近暗示尚不确定",
      "有针对我的特别称赞、想念、亲昵称呼或被接住的暧昧",
      "明确表达恋爱喜欢、爱意或双方接纳的亲密愿望",
    ],
  },
  {
    key: "action",
    label: "实际行动",
    weight: 10,
    question: "对方是否愿意把接近我落实为时间安排或具体行动？没有邀约机会不等于拒绝。",
    levels: [
      "明确拒绝进一步接触，且没有替代意愿",
      "有推进机会却反复含糊回避或拒绝且无替代安排",
      "只谈一般可能性，或这段聊天尚未涉及具体行动",
      "主动提出、接受具体相处安排，或没空但积极给出替代安排",
      "双方具体安排得到确认，或有直接文字证据表明已兑现关心与相处行动",
    ],
  },
] as const;

export type DimensionKey = (typeof AFFINITY_DIMENSIONS)[number]["key"];
export type ActionKey = keyof typeof ACTIONS;

export const EFFECTS = {
  landed: "接住了对方刚说的事或情绪",
  extended: "补充了新信息或开了新话头，对话有下一步",
  flat: "安全但泛泛，没有明显推进",
  closed: "话题到此为止，对方没什么可接的",
  diverted: "把方向换到了别处，没接住对方",
  pressured: "催促、追问或要求回应",
  overstepped: "无视了对方表达的边界",
  unknown: "无法判断这条消息起了什么作用",
} as const;


export function topEntries<T extends Record<string, { label: string }>>(
  registry: T,
  probabilities: Record<string, number> | undefined,
  n = 3,
) {
  return Object.entries(probabilities ?? {})
    .filter(([key, p]) => key in registry && Number.isFinite(p) && p > 0 && p <= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, p]) => ({
      key,
      label: registry[key as keyof T].label,
      percent: p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`,
      probability: p,
    }));
}
