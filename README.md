# tg-crush

用 **Jev**（TypeSafe 的 System One 模型）实时判断 Telegram 对话的本地工具。

不是"帮你写回复"，而是**在你发出去之前告诉你这条会怎么被接收**——以及对方那句话到底是什么意思。

## 它解决什么

`crush-monitor` 那类工具要你先把微信聊天记录导出来再粘贴分析，是**事后复盘**。这个项目改成**实时**：以你本人的身份登录 Telegram（MTProto 用户客户端），消息一进来就判读，不用导出、不用粘贴。

## 一个反直觉的设计结论

**Jev 不能生成文本。** 官方原话是 *"gives up string generation"*——它只返回结构化判断（选项、分值、概率），没有任何自由文本输出。

所以最初"让 Jev 告诉我该怎么回"的想法走不通。整个设计反过来才成立：

> **你自己写草稿，Jev 在发出去之前判你。**

同一句话、同一个判据，只是换了 Jev 站的位置：

| | 结果 |
|---|---|
| 草稿「那你就直接跟领导说你干不完啊」 | **28/100**，情绪贴合 21，命中「没接情绪就讲道理」0.94 |
| 草稿「临下班来这个 换谁都得炸」 | **75/100**，情绪贴合 93，无命中 |

要生成文案，用别的模型；要**决定该不该发**，用 Jev。这也是整个项目最值得带走的一条经验。

## 四个能力

| 位置 | 做什么 |
|---|---|
| 对方的每条消息 | 情绪 / 意图 / 语气 / 事件（带概率分布）+「留了一个待回应的问题」标记 |
| 会话级（对方打字时预热） | 六维好感 + 关系阶段 + 此刻该做什么 + 边界闸门 |
| 我方已发出的每条 | 评级（妙/稳/一般/有点尬/刹车）+ 实际起了什么作用 + 命中的问题 |
| 草稿体检（发之前） | 质量分 + 情绪贴合 + 5 项命中检测 + **时机**（现在该不该发） |

**"对方正在输入"是唯一能提前算的窗口**——那一刻就预热会话级判断，等消息落地时读数几乎同时出现（实测读数平均延迟约 700ms）。

## 跑起来

需要 Node 22+ 和 TypeSafe API Key（[console.typesafe.ai](https://console.typesafe.ai/)，模型用 `jev-1.13.0`）。

```bash
npm install
cp .env.example .env     # 填 TYPESAFE_API_KEY / TG_API_ID / TG_API_HASH
npm run login            # 一次性登录（手机号 + Telegram 里收到的验证码）
npm start                # 打开 http://127.0.0.1:3180
```

`TG_API_ID` / `TG_API_HASH` 去 [my.telegram.org](https://my.telegram.org) 免费申请。

### 没有第二个号怎么测

不预写台词也能做**真实的**实时演示——用机器人扮演"对方"，消息真的经过 Telegram 服务器，不是喂给管线的假数据：

```bash
npm run newbot           # 自动跟 @BotFather 对话建机器人 + 写 .env + 发 /start
npm run partner          # 你现场敲"她"要说的话，机器人先「正在输入」再发
```

或者全自动跑一段脚本对话（含真实的"正在输入"和停顿）：

```bash
npm run autoplay         # 17 条台词，约 5 分钟
```

### 其他脚本

| 命令 | 用途 |
|---|---|
| `npm run check` | 类型校验（`tsc --noEmit`） |
| `npm run smoke` | 脱离 Telegram，直接用 fixture 验 Jev 判据质量 |
| `npm run verify` | 验 Telegram 消息 + typing 链路是否通 |

## 几个踩过的坑，写下来省得你再踩

**1. 一个 session 只能有一个进程用。** 别让两个客户端同时用同一份 `.session`——Telegram 不报错，但会悄悄打断更新投递，表现为"服务端能收到消息，但界面不更新"。所有需要"以你的身份发消息"的能力都必须挂在**同一个长驻客户端**上（见 `POST /api/send`）。

**2. 一个分数只能承载一个语义。** 曾经写成"现在不适合发就把质量分封顶 55"，结果**所有好回复都恰好 55 分**，看起来像判据坏了。拆成"质量分 + 时机"两个独立数字后才有 28 vs 75 的区分度。

**3. 怀疑判据不对时，先绕开自己的封装。** 直接调 API 裸问同一个 rubric——如果裸问是对的，bug 就在你的包装层（某个 clamp、某个合并、某个阈值），不在模型。

**4. 结果要校验输入是否还成立。** 请求飞行期间消息被编辑或删除，回来的答案就不算数了，得丢弃，否则新文本会永久挂着旧结论。

**5. GramJS 是纯 CJS**，Node ESM 下要 `createRequire`；而且它的 `events/index.js` 漏导出了 `EditedMessage` / `DeletedMessage`，必须深引 `telegram/events/EditedMessage`。

## 隐私

- **聊天原文会发到 TypeSafe 分析。** "本机运行"指不用服务器存你的数据，**不等于本地推理**。
- `.env` 和 `.session` 已在 `.gitignore` 里。`.session` 是 Telegram 登录凭据，泄露等于泄露账号。

## 归因

情绪/意图/好感六维的 taxonomy 移植自 [FerryCorleone/crush-monitor](https://github.com/FerryCorleone/crush-monitor)（MIT，见 `LICENSE.crush-monitor`）。那个项目的批量分析设计是这里的起点。

## License

MIT
