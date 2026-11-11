# 参与贡献

欢迎提 issue 和 PR。

## 提问题之前

- 觉得某张盘排得不对：用「排盘结果疑问」模板，附上**虚构或已获本人同意**的出生信息与可核对的对照结果。
- 代码报错、页面异常：用「程序问题」模板，写清复现步骤。
- AI 登录或模型问题：说明服务商、登录方式和界面提示，**不要贴 API Key、令牌、`auth.json` 或 `.env.local` 内容**。
- 不要贴手机号、验证码，或未经本人同意的他人生辰信息。

## 提交代码

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:ui   # 动到界面时：先启动网页，需本机 Chrome / Chromium
```

- 一个 PR 只做一件事，说明里写清改了什么、为什么。
- **改排盘结果的**：附上依据（古籍原文或可核对的对照），并在 `scripts/regression/` 加回归测试、登记到 `package.json` 的 `test` 脚本。
- **改 AI 相关代码的**：测试一律模拟模型与登录，不读取真实凭据、不调用真实模型；不得把密钥或令牌返回浏览器。
- 保持八字与紫微口径分离，不要用紫微五行局代替八字喜用神。
- CI 会在每次 push 和 PR 上运行类型检查、回归测试与构建。

## 许可

提交即表示你同意贡献内容按 [MIT](./LICENSE) 发布。

---

**English.** Issues and PRs are welcome. Never post API keys, tokens, `auth.json`, `.env.local` contents, or anyone's birth data without consent. Before opening a PR run `npm ci`, `npm run typecheck`, `npm test` and `npm run build`; chart-result changes need evidence and a regression test, and AI tests must use mocks only.
