import LegalPage, { H2, List } from '@/components/LegalPage';

export const metadata = { title: '隐私说明 · DestinyTheory', description: 'DestinyTheory 本地运行时的数据处理说明' };

export default function PrivacyPage() {
  return (
    <LegalPage title="隐私说明" updated="2026 年 11 月" other={{ href: '/terms', label: '使用说明' }}>
      <p>DestinyTheory 是开源的本地研究工具，<strong>没有账号系统、支付或云端数据库</strong>，也不内置统计分析脚本。以下说明适用于在自己电脑上运行的默认配置。</p>

      <H2>1. 本地处理的数据</H2>
      <List>
        <li>出生日期、时辰或时间段、性别、出生地经度：在浏览器和本机服务中用于排盘。</li>
        <li>主题偏好、排盘流派设置，以及使用历史记录功能时保存的最近命盘表单（可能含姓名、日期、地点）：只保存在本浏览器 localStorage，可随时在浏览器中清除。</li>
        <li>命盘分享链接会把出生参数编码在网址里，发给他人前请自行确认。</li>
      </List>

      <H2>2. AI 解读会发送什么</H2>
      <List>
        <li>只有点击“同意发送”或之后主动提问时，才会经本机服务把请求发给你选择的模型服务商。</li>
        <li>服务端根据出生参数重新排盘，只发送命盘结构（宫位、星曜、四化、格局、大限等）和对话内容，<strong>不发送姓名、原始出生日期、地点或私人文件</strong>。</li>
        <li>请求到达模型服务商后，按该服务商自己的隐私政策、数据保留与计费规则处理。</li>
      </List>

      <H2>3. 登录凭据与 API Key</H2>
      <List>
        <li>复用 Pi 的 GitHub Copilot 登录时，凭据仍由 Pi 管理，本项目不复制或输出令牌。</li>
        <li>在网页中登录或保存的 API Key 存放在本机用户目录 <code>~/.destiny-theory/auth.json</code>（权限 0600），不会返回浏览器，也不在仓库中。</li>
        <li>可在“登录 / 模型”面板中退出网页登录，删除对应凭据。</li>
      </List>

      <H2>4. 不建议公网部署</H2>
      <p>AI 接口只允许本机同源访问。若自行改为公网或局域网服务，他人可能使用你登录的账号额度，处理他人出生信息时还需自行承担相应的告知与合规义务。</p>
    </LegalPage>
  );
}
