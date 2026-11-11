# 解读模型选择

## 使用方式

1. 起盘后，在 AI 解读区点击 **“模型：… / 选择 / 刷新”**。
2. 展开后，在 **“选择解读模型”** 下拉框选择模型；点击 **“刷新模型列表”** 可重新查询目录。
3. 首次选择不会发送命盘。点击 **“同意发送，开始 AI 解读”** 才开始推理。
4. 开始解读后，同一位置仍可切换。切换只影响下一次发送、主题分析或重试，**不自动发起请求，也不清除已有对话**。
5. 生成期间下拉框和刷新按钮锁定，可等待完成或先停止生成。
6. 每条回复显示服务端确认的本次请求模型 ID；切换后不会修改旧回复的标记。这个 ID 不代表已经核验服务商内部的物理路由或模型版本别名。
7. 若目录刷新后先前模型已消失，必须重新选择，系统不自动替换其他模型。

选择只存在当前解读面板的浏览器内存中，不改 `.env.local`、Pi 默认模型、Pi 设置或账号模型策略。刷新页面/重新起盘会按配置重新初始化；切换命盘与 AI 面板、预览其他候选盘不会因此自动发起推理。

## 列表从哪里来

### GitHub Copilot

- 通过 Pi SDK 公共 `ModelRuntime.getAuth()` 获取正常解析/刷新的账号请求认证，OAuth 刷新与凭据锁仍由 SDK 管理。
- 服务器使用 SDK 所用的 Copilot 目录协议，只读查询该账号端点的 `GET /models`，不发送出生资料或对话，不进行解读推理。
- 目录只保留账号允许选择、且当前 SDK 具备兼容聊天协议的文本模型。禁用、待启用、分类/图像、协议不兼容或 SDK 未收录的模型不提供选择；不自动调用模型启用接口。
- 部分 Individual 账号所有 picker 标记为 false 时，沿用 SDK 的策略回退语义，只取明确 enabled 的项；其他账号不作该回退。
- 按账号认证指纹隔离，内存缓存60秒，并合并并发查询。显式刷新会重新请求；切换登录或正常令牌轮换会更换缓存键。失败刷新会失效旧目录缓存。
- 不返回令牌、密钥、账号详情、私有端点或服务商原始错误。

**列表可选不等于逐模型试调用通过**，仍可能遇到实时权限变化、组织策略、限流、额度不足等问题。选择器不会为了测可用性自动调用所有模型或消耗各模型的推理额度。

若目录暂时不可用，但 SDK 仍能识别默认模型及登录，界面明确提示降级，只保留 `.env.local` 的默认模型；不会声称拿到了完整实时列表。默认模型本身也可能受实时权限或额度限制。

### 其他服务商

网页内登录或配置 API Key 的 ChatGPT、Claude、DeepSeek 等服务，使用 Pi SDK 的服务商模型目录（`modelSource: sdk-catalog`），详见 [AI 服务商登录与 API Key](./AI-PROVIDERS.md)。`.env.local` 中的 MiMo/自定义网关/Ollama 兼容配置仍只提供已配置的默认模型。

## 接口

### `GET /api/interpret?models=1`

返回配置状态和安全模型信息，无推理：

```json
{
  "configured": true,
  "provider": "github-copilot",
  "model": "gpt-6.1-sol",
  "remote": true,
  "models": [{"id": "gpt-6.1-sol", "name": "GPT-6.1 Sol"}],
  "modelSource": "copilot-live",
  "checkedAt": "2026-01-01T00:00:00.000Z",
  "warning": "目录可选仍受实时权限及额度限制。"
}
```

`model` 是服务端默认值，不是替客户端保存的选择。`modelSource` 为 `copilot-live` 或 `configured`。显式刷新：`?models=1&refresh=1`。不带参数的原 GET 仍只检查配置、SDK 和登录元数据，不进行目录查询或推理。

### `POST /api/interpret`

在原有请求中增加可选字段：

```json
{
  "consent": true,
  "model": "gpt-6.1-sol",
  "chart": {"birthInfo": {"year":2000,"month":2,"day":5,"hour":5,"gender":"male"}},
  "messages": [{"role":"user","content":"请分析命格。"}]
}
```

示例为虚构出生资料。服务端校验模型必须属于当前可选列表，不能通过请求修改 provider、基址或密钥。没有 `model` 字段的旧客户端继续使用默认配置。成功流响应添加 `X-AI-Provider` 和 URL 编码的 `X-AI-Model`，用于标记服务端确认的请求模型。

## 实现与验证

- `lib/ai/copilot-models.ts`：账号目录、安全筛选、短时缓存。
- `lib/ai/model-selection.ts`：安全状态与单次请求模型验证。
- `lib/ai/use-ai-models.ts`：页面选择/刷新状态，无持久化或自动推理。
- `components/AIModelPicker.tsx`：首轮确认和后续追问共用的选择器。

```bash
npm run typecheck
npm run test:ai  # 含目录/权限/SDK/协议/缓存/令牌隔离/降级/请求白名单回归
npm test
npm run build
# 已启动本地服务、安装 Chrome 后：
npm run test:ui  # 含选择前不发送、跨模型追问、锁定、重试、刷新与模型消失场景
```

自动测试使用模拟账号目录和模型，不读取实际凭据。另已用虚构命盘分别验证当前账号的 GPT 与 Gemini 两种协议实际流式调用；未逐一测试目录中所有模型。
