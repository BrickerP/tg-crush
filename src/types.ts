export type Sender = "self" | "other";

export type Msg = {
  id: string;
  sender: Sender;
  text: string;
  at: number;
};

export type Ranked = {
  key: string;
  label: string;
  percent: string;
  probability: number;
};

export type Usage = { input_tokens: number; output_tokens: number };

export type LineRead = {
  id: string;
  emotions: Ranked[];
  intents: Ranked[];
  event?: { kind: string; label: string; confidence: number };
  tone?: { key: string; label: string };
  openQuestion: number;
  at: number;
};

export type AffinityDimension = {
  key: string;
  label: string;
  weight: number;
  value: number | null;
  confidence: number;
  status: "clear" | "ambiguous" | "insufficient";
};

export type OverviewRead = {
  affinity: number | null;
  dimensions: AffinityDimension[];
  boundaryApplied: boolean;
  stage: string;
  stageLabel: string;
  action: string;
  actionLabel: string;
  actionDetail: string;
  alternative?: string;
  evidenceId: string | null;
  at: number;
};

export type DraftJudgment = {
  draft: string;
  value: number | null;
  /** 现在该不该发，和"写得好不好"分开算：一个高分的草稿也可能时机不对。 */
  sendNow: number;
  timing: "now" | "soon" | "wait";
  confidence: number;
  status: "clear" | "ambiguous" | "insufficient";
  emotionFit: number | null;
  hits: { key: string; label: string; fired: boolean; probability: number }[];
  direction: string;
  directionLabel: string;
  directionDetail: string;
  ranked: Ranked[];
  at: number;
};

export type Hit = {
  key: string;
  label: string;
  fired: boolean;
  probability: number;
};

export type SentRead = {
  id: string;
  value: number | null;
  confidence: number;
  status: "clear" | "ambiguous" | "insufficient";
  effect: string;
  effectLabel: string;
  hits: Hit[];
  nextMove: string;
  nextMoveLabel: string;
  nextMoveDetail: string;
  at: number;
};

export type Meta = {
  model: string;
  latencyMs: number;
  usage: Usage;
};

export type Chat = {
  id: string;
  title: string;
  username?: string;
};

export type ServerEvent =
  | {
      type: "hello";
      self: { id: string; name: string };
      chats: Chat[];
      watched: string | null;
    }
  | {
      type: "chat";
      chat: Chat;
      messages: Msg[];
      relation: "crush" | "new" | "couple";
      /** 正在排队分析的消息 id；不在这个集合里又没有读数的，就是不会分析的历史。 */
      pending: string[];
    }
  | { type: "message"; chatId: string; msg: Msg }
  | { type: "messageEdited"; chatId: string; msg: Msg }
  | { type: "messageDeleted"; chatId: string; id: string }
  | { type: "typing"; chatId: string; who: Sender; active: boolean }
  | {
      type: "line";
      chatId: string;
      read: LineRead;
      meta: Meta;
    }
  | { type: "overview"; chatId: string; overview: OverviewRead; meta: Meta }
  | { type: "sent"; chatId: string; read: SentRead; meta: Meta }
  | { type: "judge"; chatId: string; judgment: DraftJudgment; meta: Meta }
  | { type: "busy"; chatId: string; task: string; active: boolean }
  | { type: "pending"; chatId: string; pending: string[] }
  | { type: "error"; chatId?: string; message: string };

export type ClientCommand =
  | { type: "watch"; chatId: string }
  | { type: "judge"; chatId: string; draft: string }
  | { type: "refresh"; chatId: string }
  | { type: "relation"; chatId: string; relation: "crush" | "new" | "couple" };
