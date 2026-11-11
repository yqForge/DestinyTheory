# DestinyTheory

紫微斗数 AI 自动化排盘、解盘与推理。在本机生成命盘，经你确认后交由所选模型逐步解读、追问。

**中文** · [English](./README.en.md)

## 功能

- **排盘引擎**（`lib/ziwei/`）：十四主星、辅煞杂曜、生年/大限/流年四化、十二神煞、大限流年与童限、格局识别。
- **口径可配置**：闰月四种归属、晚子时换日、星曜亮度流派；1986–1991 中国夏令时只判定、不自动扣除。
- **出生信息输入**：公历或农历（含闰月）；精确时间、模糊时间段 `[开始, 结束)` 或完全不详。时间段会列出全部候选盘，不伪造出生分钟。详见 [出生输入说明](./docs/BIRTH-INPUT.md)。
- **AI 解盘与追问**：流式输出，可停止、重试；向上阅读时不强制滚到底部。服务端根据出生参数重新排盘，只向模型发送命盘结构，不发送姓名、原始日期和地点。
- **多模型服务**：可复用 Pi 的 GitHub Copilot 登录，在网页中登录 ChatGPT、Claude、xAI、Kimi Code、OpenRouter，或配置 DeepSeek、Gemini 等 API Key，并从该服务的实时目录选择模型。详见 [AI 服务商](./docs/AI-PROVIDERS.md)、[模型选择](./docs/MODEL-SELECTION.md)。
- **古籍与知识库**：《骨髓赋》《紫微斗数全集》《紫微斗数全书》公版原文及全文搜索。
- **响应式工作台**：桌面左侧命盘、右侧解读；手机可在命盘与 AI 间切换；深浅主题。

## 快速开始

需要 Node.js 22.19 或更高版本。

```bash
git clone https://github.com/yqForge/DestinyTheory.git
cd DestinyTheory
npm ci
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1 --port 3000
```

打开 <http://127.0.0.1:3000/chart>。只排盘不需要任何密钥。使用 AI 时，在解读区点击 **“登录 / 模型”** 选择服务并连接；也可以先在 [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) 中执行 `/login github-copilot`，再把 `.env.local` 的 `AI_MODEL` 改为你有权使用的模型。配置说明见 [本地 AI](./docs/LOCAL-AI.md)。

## 验证

```bash
npm run typecheck   # TypeScript 类型检查
npm test            # 排盘回归 + 出生输入 + AI 接口（全部模拟，不调用真实模型）
npm run build       # 生产构建
npm run test:ui     # 浏览器回归：需先启动网页，并安装 Chrome / Chromium
```

排盘回归覆盖 768 张采样盘的紫微安星铁律、夏令时、立春边界、闰月口径、日期合法性、格局规则等。所有自动测试只使用虚构资料。

## 目录

| 路径 | 内容 |
|---|---|
| `lib/ziwei/` | 排盘引擎：`algorithm.ts`（入口 `generateChart`）、四化、格局、流派配置、历法转换、出生输入 |
| `lib/ai/` | AI 服务商、登录会话、模型目录、解读上下文与流式传输 |
| `lib/classics/` | 公版古籍原文 |
| `app/api/` | 本机接口：`/api/interpret`、`/api/ai/{providers,login,models}` |
| `components/` | 命盘、表单、解读与模型选择界面 |
| `scripts/regression/`、`scripts/browser/` | 回归与浏览器测试 |
| `docs/` | 使用与设计说明 |

`BirthInfo.hour` 是时辰地支索引 0–11（0 = 子时），不是钟表小时；年、月、日是已处理换日规则的公历排盘日。

## 安全与隐私

- AI 接口只接受本机同源请求，没有用户系统与生产限流，**不要部署到公网或局域网**，否则他人可能使用你登录的账号。
- 网页保存的登录凭据与 API Key 位于 `~/.destiny-theory/`（权限 0700/0600），与 Pi 的凭据隔离，不返回浏览器。
- 只有点击“同意发送”或主动提问才会调用模型；连接、切换服务或模型都不会自动发送命盘。
- 不要提交 `.env.local`、凭据、私人命盘或截图。

## 口径与边界

- 本项目是紫微斗数工具，不是八字旺衰、喜用神引擎；紫微五行局不等于八字喜用。命盘中的节气四柱按时辰中点近似，交节附近须另行核验。
- 出生地修正目前只是经度差（地方平太阳时近似），未计入均时差，不自动处理历史夏令时。
- 合盘 AI 分析（`/api/heming`）尚未实现；主星 × 宫位论断库（`db-analysis.ts`）尚未收录。
- AI 不会逐字检索古籍，引用可能不准，请对照原文自行判断。
- 所有内容仅供传统文化研究参考，不构成医疗、投资、法律或重大决策建议。

## 许可

代码采用 [MIT](./LICENSE)。古籍原文属公有领域。第三方开源组件与版权声明见 [NOTICE.md](./NOTICE.md)。贡献方式见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
