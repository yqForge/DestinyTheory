import LegalPage, { H2, List } from '@/components/LegalPage';

export const metadata = { title: '使用说明 · DestinyTheory', description: 'DestinyTheory 使用范围、免责声明与许可' };

export default function TermsPage() {
  return (
    <LegalPage title="使用说明" updated="2026 年 11 月" other={{ href: '/privacy', label: '隐私说明' }}>
      <H2>1. 项目性质</H2>
      <p>DestinyTheory 是紫微斗数排盘、AI 解盘与推理的开源研究工具，面向传统文化学习与体系内研究。所有输出仅供参考，<strong>不构成医疗、投资、法律、心理咨询或重大人生决策建议</strong>，也不作任何宿命式保证。</p>

      <H2>2. 结果的局限</H2>
      <List>
        <li>排盘结果依赖出生日期、时辰、历法与真太阳时等口径；时辰不确定时请比较全部候选盘，不要把任意一个当作定盘。</li>
        <li>紫微斗数的五行局、格局与八字的旺衰、喜用神属于不同体系，不能互相替代。</li>
        <li>AI 生成的内容可能出错或引用不准，请对照命盘与原典自行判断。</li>
      </List>

      <H2>3. 第三方服务</H2>
      <p>使用 AI 解读时，你需遵守所选模型服务商的条款，并自行承担其额度与费用。本项目不提供模型服务，也不代表任何服务商。</p>

      <H2>4. 许可</H2>
      <p>代码按仓库中的 MIT 许可证发布，第三方组件与古籍资料的说明见仓库 <code>NOTICE.md</code>。软件“按现状”提供，不附带任何担保。</p>
    </LegalPage>
  );
}
