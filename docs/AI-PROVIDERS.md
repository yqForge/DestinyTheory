# AI 服务商登录与 API Key

解读页的 **“登录 / 模型”** 面板提供统一入口：先选模型服务，再用账号登录或 API Key 连接，最后选择该服务可用的模型。连接、切换服务或模型都**不会自动发送命盘**；只有点击“同意发送，开始 AI 解读”或之后主动提问才会调用模型。

## 支持范围

只接入固定版本 Pi SDK（`@earendil-works/pi-coding-agent` / `pi-ai` 1.5.2）中有官方实现的服务商，不使用非官方的抓包、Cookie 或令牌伪造。

| 服务 | 账号登录 | API Key | 说明 |
|---|---|---|---|
| GitHub Copilot | 复用 Pi 已有登录 | — | 网页不发起、不修改、不退出 Pi 的 Copilot 登录；需在 Pi 中执行 `/login github-copilot` |
| ChatGPT / OpenAI | ✓ Sign in with ChatGPT | ✓ | 订阅登录与 API Key 是两种不同计费/权限方式 |
| Claude | ✓ Claude Pro/Max | ✓ | |
| xAI / Grok | ✓ | ✓ | |
| Kimi Code | ✓ | ✓ | |
| OpenRouter | ✓ | ✓ | |
| DeepSeek | — | ✓ | |
| Google Gemini、Moonshot 中国区、智谱 Z.AI Coding 中国区、通义千问 Token Plan 中国区、小米 MiMo | — | ✓ | |
| **Kiro** | **暂不支持** | **暂不支持** | 当前 SDK 无 Kiro 官方登录或模型接口，界面中显示为禁用项 |

账号登录是否真的可用，取决于该账号的订阅、地区、组织策略和服务商条款；SDK 支持登录流程不代表任何账号都能调用全部模型。

## 登录流程

- **账号登录**：服务端调用 Pi SDK 的官方 OAuth 流程。页面显示“打开官方登录页”或设备验证码，在官方页面完成授权；若浏览器无法自动回调，按提示粘贴回调地址或授权码。
- **API Key**：点击“配置 API Key”，在密码输入框中填写后保存。密钥只提交给本机服务，不回显到页面、状态接口或日志。
- 每个服务同时只允许一个进行中的登录流程，流程 15 分钟后过期，可随时取消。
- 部分 OAuth 流程会在本机临时监听固定回调端口；若提示端口被占用，请先结束其他未完成的登录（例如另一个 Pi / Codex 登录）。

## 凭据存放与隔离

| 来源 | 位置 | 网页能否退出 |
|---|---|---|
| Copilot（复用 Pi） | Pi 自己的 `~/.pi/agent/auth.json` | 否 |
| 网页中新登录或保存的服务 | `~/.destiny-theory/auth.json`（可用 `DESTINY_THEORY_DATA_DIR` 修改目录） | 是，“退出网页登录” |

- 网页登录**不写入** Pi 的凭据文件，退出网页登录也不会影响 Pi CLI。
- 凭据目录权限为 `0700`，文件为 `0600`，位于仓库之外，不会被 Git 提交。
- 同目录下的 `device.json` 只保存 Sign in with ChatGPT 所需的本机安装 UUID，不是凭据。
- 环境变量中的 Key 也可能被 SDK 识别为“已连接”，但网页无法删除环境变量，只能退出网页保存的凭据。
- OAuth 令牌刷新由 Pi SDK 在凭据锁内完成，项目代码不直接读取或输出令牌。

## 模型列表

- Copilot：读取账号实时模型目录，并按 SDK 兼容性筛选，详见 [模型选择](./MODEL-SELECTION.md)。
- 其他服务：使用 Pi SDK 的服务商模型目录及其账号可见性规则，只列出可做文本对话的模型。点击“刷新模型列表”会请求服务商目录更新。
- 列表可选不代表逐个模型试调用成功，仍可能遇到额度不足、权限变化或限流。
- 每次请求都会在服务端重新校验“服务商 + 模型”是否在当前可用列表，浏览器不能指定任意服务商、地址或密钥。

## 接口

全部接口仅限本机、同源调用，均不返回密钥、令牌、账号邮箱或私有端点。

| 接口 | 作用 |
|---|---|
| `GET /api/ai/providers` | 服务商列表、支持的登录方式、是否已连接、能否网页退出 |
| `DELETE /api/ai/providers` `{provider}` | 删除网页保存的该服务凭据 |
| `POST /api/ai/login` `{provider, method}` | 开始 `oauth` 或 `api_key` 登录，返回流程状态 |
| `GET /api/ai/login?id=` | 查询登录进度、官方链接/设备码、待输入项 |
| `POST /api/ai/login` `{action:'answer', id, promptId, value}` | 提交 API Key、授权码或选项 |
| `DELETE /api/ai/login` `{id}` | 取消登录 |
| `GET /api/ai/models?provider=&refresh=1` | 读取该服务可用模型 |
| `POST /api/interpret` `{provider, model, ...}` | 用指定服务商和模型解读；省略 `provider` 时仍兼容 `.env.local` 默认配置 |

## 安全边界

- 这是**单用户本机工具**：没有用户系统，不能部署到公网或局域网供他人使用，否则其他人可能使用你登录的账号额度。
- 只发送服务端重算的命盘结构和对话，不发送姓名、原始出生日期、地点或私人档案。
- 不同服务商的数据保留、隐私政策和计费方式不同，选择前请自行确认。

## 验证

```bash
npm run test:ai   # 含官方 SDK 白名单、Kiro 禁用、隔离凭据存储及权限、不回传密钥、模型白名单、退出保护
npm run test:ui   # 含服务切换、API Key 连接、跨服务追问、生成锁定与失败恢复（全部模拟，无真实账号）
```

真实联调仅用虚构命盘验证了 Copilot 经统一接口的流式解读；其他服务商需要你提供自己的账号或 Key 后才能实际验证。
