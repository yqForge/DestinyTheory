# 本地 AI 解读接口

本项目的 AI 解读只在本机运行：浏览器 → 本机 Next.js 接口 → 你选择并登录的模型服务商。

> **多服务商**：解读页可直接登录 ChatGPT、Claude、xAI、Kimi Code、OpenRouter 等账号，或配置 DeepSeek、Gemini 等 API Key，无需修改 `.env.local`。见 [AI 服务商登录与 API Key](./AI-PROVIDERS.md)。以下为默认 Copilot 及兼容配置说明。

## 当前已接通：GitHub Copilot

本机使用 Pi 已登录的 GitHub Copilot 账号，模型配置为当前会话使用的 `gpt-6.1-sol`：

```dotenv
AI_PROVIDER=github-copilot
AI_MODEL=gpt-6.1-sol
AI_REASONING=medium
AI_MAX_TOKENS=8192
AI_TIMEOUT_MS=180000
```

新克隆仓库后需复制 `.env.example` 为 `.env.local`，并选择自己有权访问的 Copilot 模型；本仓库不包含任何人的 `.env.local` 或登录凭据。使用 Copilot 时**无需再申请 DeepSeek 或 OpenAI Key。**

### 认证与权限

- 通过固定版本 `@earendil-works/pi-coding-agent` / `pi-ai` SDK 的 `ModelRuntime` 复用 Pi 的凭据存储（默认 `~/.pi/agent/auth.json`，支持 Pi 自带的 `PI_CODING_AGENT_DIR` 覆盖）。
- OAuth 令牌不复制进项目、不写进 `.env.local`、不传给浏览器；SDK 在原凭据存储中按其正常锁定流程处理刷新。
- 只创建模型运行时，**不创建 AgentSession**；不加载用户项目模型配置、扩展、技能、私有背景或会话，不给模型文件、Shell、联网检索等工具。
- 这是调用远程 Copilot 服务，不是本机大模型，使用现有账号额度，可能计入高级请求。实际可用模型、计费与限额以账号权限及服务条款为准，不保证订阅无限可用。
- 未登录或登录失效时，在 Pi 中执行 `/login github-copilot`，然后刷新网页。模型被账号禁用时，须按服务商要求启用或换成自己有权使用的模型，不绕过限制。

### 使用方法

1. 打开 <http://127.0.0.1:3000/chart>，选择公历或农历（含闰月），选择精确时间、模糊时间段或完全不详。核对公历换算与候选时辰后起盘，规则见 [出生输入说明](./BIRTH-INPUT.md)。
2. 桌面左侧显示命盘、右侧显示解读；窄窗口/手机顶部有 **“查看命盘 / AI 解读 / 提问”** 切换，起盘后默认进入可操作的 AI 页。切换不会清空命盘或对话。
3. 默认显示 `github-copilot / gpt-6.1-sol`。点击模型信息处的“登录 / 模型”可从账号目录选择其他兼容模型，不改 Pi 默认值，也不自动发送命盘。目录刷新和跨模型追问说明见 [模型选择](./MODEL-SELECTION.md)；连接失败时可以点击“重新检测连接”。
4. 阅读数据发送提示，点击首屏金色 **“同意发送，开始 AI 解读”** 按钮，不必滚到整张命盘底部。
5. 获得流式命格解读后，可以点击主题、点宫位，或在固定于面板底部的 **“向 AI 提问”** 文本框输入内容并点击 **“发送”**。Enter 发送，Shift+Enter 换行；中文输入法确认候选字不会误发送。长回复在消息区域独立滚动；向上阅读时暂停自动跟随，点击“有新内容 · 回到底部”或手动回到底部后恢复。
6. 生成中可“停止生成”；模型错误或中断后可“重新尝试”，重试不会重复追加用户问题，已收到的部分正文会保留到重试前。
7. 重新起盘会创建新的解读会话并重新确认；刷新页面会清空内存中的出生表单、命盘和对话，不自动保存个人记录。

新克隆项目的启动方式（仓库根目录）：

```bash
npm ci
cp .env.example .env.local  # 仅首次配置；已有配置时不要覆盖
npm run dev -- --hostname 127.0.0.1 --port 3000
```

若服务已在后台运行，不要重复启动。修改模型配置后重启 Next.js 服务并刷新页面；不要同时运行多个争用 3000 端口的实例。

## 接口契约

### `GET /api/interpret`

只检查配置、SDK 模型目录和本机登录元数据，不进行模型推理。不返回密钥、令牌、账户详情或私有端点地址。

示例：

```json
{"configured":true,"provider":"github-copilot","model":"gpt-6.1-sol","remote":true}
```

`configured: true` 不代表已联网核验账号剩余额度或模型的实际服务端访问权限。

### `GET /api/interpret?models=1`

读取账号可选模型目录（短时缓存），不进行推理或发送出生资料。支持 `&refresh=1` 强制刷新。列表会过滤账号禁用/待启用及 SDK 不兼容的项目，但不保证每次推理都成功；目录失败时明确提示仅保留配置默认模型。详见 [模型选择接口](./MODEL-SELECTION.md)。

### `POST /api/interpret`

```json
{
  "consent": true,
  "chart": {
    "birthInfo": {
      "year": 2000, "month": 2, "day": 5,
      "hour": 5, "gender": "male", "leapMonthPolicy": "split"
    }
  },
  "messages": [{"role": "user", "content": "请分析命格和事业。"}]
}
```

请求还可附带 `model` 字段选择当前列表中的模型；省略时使用配置默认值，不能通过请求修改服务商或密钥。每条回复标记服务端确认的请求模型，切换不清除历史、不自动解读。

此日期为虚构示例。日期为**已处理换日规则的公历排盘日**；`hour` 为**时辰索引 0–11**，不是钟表小时。服务端不会再次进行真太阳时或日期校正。出生时间完全不详、表单标为 `unknownTime: true` 的占位盘会被拒绝，不能冒充已知子时进行解读。模糊时间段通过新增 `birthInfo.source` 保留，后端重建全部候选并要求 AI 比较共同点与差异，不取中点；数据格式与区间端点规则见 [出生输入说明](./BIRTH-INPUT.md)。

- 服务端根据出生参数重算命盘，不信任浏览器上传的星曜、年龄或其他任意文本元数据。
- 将宫位、星曜亮度、四化、借宫、大限和程序检测到的格局条件作为模型上下文。
- 默认不向模型转发姓名、原始出生年月日、出生地点或经度，也不读取任何本地私人文件。对于模糊时间段，确认发送后会把原始钟表时间范围及全部候选的盘面发送给模型。**命盘结构仍是敏感资料，对话中手工输入的个人信息会随对话发送。**
- 使用传统紫微体系内的解释；提示模型不得把八字与紫微混用，不伪造倪师逐字引用，不虚构没有排出的流年盘。
- 当前没有逐字古籍检索/RAG，也没有实现 `/api/heming` 合盘接口，不是线上 13 维断语库的复制。

成功返回 `text/event-stream`：

```text
data: {"delta":{"text":"解读正文"}}

data: [DONE]
```

流开始前的错误返回 `{ "error": "可读错误信息" }`，使用相应 HTTP 状态；流内错误返回 `data: {"error":"..."}` 并结束，前端保留已显示的部分内容并提示失败。不把模型服务商的原始错误、密钥或思考过程透传到浏览器。

## 其他模型（备用，不影响当前 Copilot）

只需修改 `.env.local`，不改前端。

### DeepSeek

```dotenv
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat
DEEPSEEK_API_KEY=填写你自己的密钥
```

### MiMo 或其他 OpenAI 兼容网关

```dotenv
AI_PROVIDER=custom
AI_BASE_URL=https://服务商提供的基址/v1
AI_MODEL=服务商提供的模型名
AI_API_KEY=填写你自己的密钥
```

也支持 `AI_PROVIDER=mimo` 配合 `MIMO_BASE_URL`、`MIMO_MODEL`、`MIMO_API_KEY`。通用 `AI_*` 值优先，切换服务商时清除旧 `AI_MODEL` 等覆盖项，避免仍然选择 Copilot 的模型 ID。

仅支持 Chat Completions 流式协议；基址不包含 `/chat/completions`。Copilot 不走这条普通网关路径，不能把它的登录令牌当作普通 OpenAI Key。

### 本机 Ollama

```dotenv
AI_PROVIDER=ollama
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=ollama-list中已安装的模型名
```

需自行安装并运行 Ollama / 模型；本机无鉴权服务可不填 Key。项目不自带本机模型。远程网关必须 HTTPS，仅明确的回环地址允许 HTTP。

## 安全与验证

- 本地服务仅监听 `127.0.0.1`。接口做本机 Host、同源、JSON 内容类型、128 KiB 请求大小及对话长度检查。
- `.env.local` 被 Git 忽略。**不要把此无用户认证、无生产限流的接口直接开放到公网或局域网**，也不要部署它来公开转发个人 Copilot 账号。
- 默认不保存请求或模型全文。需要保存个人研究结果时，放在仓库外或已被忽略的 `research/` 目录，不要提交到 Git。

```bash
npm run typecheck
npm run test:birth # 农历/闰月、时间范围及归日边界
npm run test:ai   # 模拟 SSE 与 SDK，不读取真实凭据、不调用真实模型
npm test         # 原有排盘回归 + AI 回归
npm run build
# 先启动本地网页，另开终端运行浏览器回归（使用已安装的 Chrome，无模型调用）：
npm run test:ui
# 非默认安装位置可设置 CHROME_PATH；UI_BASE_URL 可切换到另一个本地测试端口。
```

浏览器测试使用独立临时上下文和虚构资料，覆盖 1440×900、1024×768、734×900（2× 显示）、390×844、320×568 五种尺寸，验证实际指针点击、按钮首屏可见与未被遮挡、长回复滚动、深浅主题、主题/面板切换、键盘发送、配置重检、错误重试及停止恢复。测试截图默认放在已被 Git 忽略的 `.artifacts/ui/`，可用 `UI_ARTIFACT_DIR` 修改。

此外已在新界面中实际操作浏览器，使用虚构命盘完成 Copilot 流式总览及发送追问的真实联调；未发送用户私人资料。这不代表每一项命理解释已被独立核验。
