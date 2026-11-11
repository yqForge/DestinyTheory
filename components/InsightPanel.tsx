'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';
import type { TimeView } from './TimeNav';
import AIConsent from './AIConsent';
import { consumeInterpretation } from '@/lib/ai/interpret-client';
import styles from './InsightPanel.module.css';
import { useFollowScroll } from '@/lib/ai/use-follow-scroll';
import { useAIModels } from '@/lib/ai/use-ai-models';
import AIModelPicker from './AIModelPicker';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean; // don't show user bubble for auto/topic messages
  model?: string; // Actual model for this answer; later switching must not relabel old replies.
}

interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: TimeView;
}

interface InsightPanelProps {
  chart: ZiweiChart;
  selectedPalace?: Palace | null;
  selectedSiHua?: SelectedSiHua | null;
}

const TOPICS = [
  { key: 'overview',     label: '命格' },
  { key: 'love',        label: '感情' },
  { key: 'career',      label: '事业' },
  { key: 'wealth',      label: '财运' },
  { key: 'health',      label: '健康' },
  { key: 'personality', label: '性格' },
] as const;

const TOPIC_PROMPTS: Record<string, string> = {
  overview: `请生成命格总览，按以下结构输出：

**【命格定性】**
用一句话概括这个命盘的核心格局与命主气质。

**【主星解读】**
命宫主星的核心特质，说明传统观点；未核验原文时不要杜撰倪师引语。

**【三方四正】**
财、官、迁三宫的联动分析及整体格局。

**【当前大限】**
当下大限运势方向与最值得关注的事项。

**【优势与注意】**
命盘天赋优势，以及需要注意的风险或功课。`,

  love: `请深度分析感情婚姻运，按以下结构输出：

**【感情格局】**
一句话定性感情命格。

**【夫妻宫分析】**
夫妻宫主星、四化，以及倪海厦体系的具体解读。

**【三方联动】**
相关宫位对感情的影响。

**【当前大限感情运】**
当下10年感情走向与关键节点。

**【实际建议】**
具体可行的感情建议。`,

  career: `请深度分析事业运，按以下结构输出：

**【事业格局】**
一句话定性事业命格，宜任职或宜创业。

**【官禄宫分析】**
官禄宫主星、四化，以及倪师对这种配置的判断。

**【财帛宫联动】**
财运与事业的关系，财路来源分析。

**【当前大限事业运】**
当下10年事业走向。

**【实际建议】**
适合的方向、行业与策略。`,

  wealth: `请深度分析财运，按以下结构输出：

**【财运格局】**
一句话定性财运模式，是主动财还是被动财。

**【财帛宫分析】**
财帛宫主星、四化，财富来源与流动模式。

**【田宅宫（财库）】**
积蓄能力与不动产运势分析。

**【当前大限财运】**
当下财运走向与注意事项。

**【理财建议】**
具体的财务建议。`,

  health: `请分析健康运势，按以下结构输出：

**【疾厄宫主星】**
疾厄宫星曜与健康含义。

**【传统象义】**
说明传统命理中的健康象义及其解释边界，不推断具体疾病。

**【大限参考】**
仅讨论该体系内的关注方向，不预测发病时间或寿命。

**【预防建议】**
具体注意事项与养生方向。`,

  personality: `请深度解析性格特质，按以下结构输出：

**【命宫主星性格】**
命宫主星的核心性格特质；未经原文核验不要冒充倪师原话。

**【三方性格综合】**
财、官、迁三宫对性格的影响，全貌描绘。

**【人际关系模式】**
与他人互动方式、待人处世风格。

**【优势与人生课题】**
天赋优势，以及需要面对的人生功课。`,
};

const PALACE_ROLES: Record<string, string> = {
  '命宫':   '自我、性格、先天格局',
  '兄弟宫': '兄弟关系、合伙人',
  '夫妻宫': '感情关系、婚姻状态',
  '子女宫': '子女缘分、下属关系',
  '财帛宫': '财运来源、收入方式',
  '疾厄宫': '身体健康、意外',
  '迁移宫': '外出机遇、人际格局',
  '交友宫': '朋友圈、贵人、小人',
  '官禄宫': '事业成就、社会地位',
  '田宅宫': '不动产、家庭环境',
  '福德宫': '精神享受、内心福分',
  '父母宫': '父母关系、文书契约',
};

/** Render AI markdown: **【Title】** → gold header, **bold** → strong */
function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div className={styles.answer}>
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) return <h3 key={i}>【{sectionMatch[1]}】</h3>;
        if (!line.trim()) return <div key={i} className={styles.gap} aria-hidden="true" />;
        return <p key={i}>{line.split(/\*\*(.+?)\*\*/).map((part, j) =>
          j % 2 === 0 ? part : <strong key={j}>{part}</strong>)}</p>;
      })}
      {streaming && <span className={styles.cursor} aria-hidden="true" />}
    </div>
  );
}

export default function InsightPanel({ chart, selectedPalace, selectedSiHua }: InsightPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string>('overview');
  const modelState = useAIModels();
  const messagesRef = useRef<Message[]>([]); // always-current copy for closures
  const loadingRef = useRef(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');
  const consentRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const lastRequestRef = useRef<Message[] | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current?.abort(); };
  }, []);
  const lastPalaceBranch = useRef<number | undefined>(undefined);
  const lastSiHuaKey = useRef<string | undefined>(undefined);
  const { scrollRef, hasUnread, resume, onScroll, onWheel, pause } = useFollowScroll(messages);

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    lastPalaceBranch.current = undefined;
    lastSiHuaKey.current = undefined;
  }, [chart]);

  // Inject palace analysis when palace selected
  useEffect(() => {
    if (!consentRef.current || !selectedPalace || selectedPalace.branch === lastPalaceBranch.current) return;
    if (loadingRef.current) return;

    const majorStars = selectedPalace.stars.filter(s => s.type === 'major');
    const starDesc = majorStars.length > 0
      ? majorStars.map(s => `${s.name}${s.siHua ? '化' + s.siHua : ''}`).join('、')
      : '空宫（借对宫）';
    const roleName = selectedPalace.name === '仆役' ? '交友宫'
      : selectedPalace.name.endsWith('宫') ? selectedPalace.name : `${selectedPalace.name}宫`;
    const role = PALACE_ROLES[roleName] ?? '';

    const prompt = `请重点分析【${selectedPalace.name}】（主管：${role}），该宫主星为${starDesc}，按以下结构输出：

**【宫位定性】**
${selectedPalace.name}在命盘中的意义，以及这种星曜配置的整体判断。

**【主星解读】**
主星在此宫的倪海厦体系解读，引用具体观点。

**【三方四正联动】**
三方四正宫位对此宫的影响。

**【实际建议】**
基于此宫的具体建议。`;

    if (sendMessage(prompt, true)) lastPalaceBranch.current = selectedPalace.branch;
  }, [selectedPalace]); // eslint-disable-line react-hooks/exhaustive-deps

  // 注入四化飞化分析
  useEffect(() => {
    if (!consentRef.current || !selectedSiHua) return;
    const key = `${selectedSiHua.starName}-${selectedSiHua.siHua}-${selectedSiHua.view}`;
    if (key === lastSiHuaKey.current) return;
    lastSiHuaKey.current = key;

    // 找出该星所在宫位
    const palaceOfStar = chart.palaces.find(p =>
      p.stars.some(s => s.name === selectedSiHua.starName)
    );
    const palaceName = palaceOfStar?.name ?? '未知宫位';
    const viewLabel = selectedSiHua.view === 'daxian' ? '大限' : '流年';

    const prompt = `请分析【${viewLabel}${selectedSiHua.starName}化${selectedSiHua.siHua}】的飞化影响，按以下结构输出：

**【化${selectedSiHua.siHua}基本含义】**
化${selectedSiHua.siHua}在倪海厦体系中的核心含义，以及${selectedSiHua.starName}化${selectedSiHua.siHua}的特殊含义。

**【落宫影响】**
${selectedSiHua.starName}化${selectedSiHua.siHua}落在【${palaceName}】，该宫主管的领域受到何种影响，倪师如何解读。

**【三方四正飞化路径】**
化${selectedSiHua.siHua}入${palaceName}后，对其三方四正（对宫、两个三合宫）的联动影响。

**【当前运势影响】**
在${viewLabel}时间维度下，此化${selectedSiHua.siHua}对命主近期运势的具体影响。

**【实际建议】**
基于此四化的具体可操作建议。`;

    sendMessage(prompt, true);
  }, [selectedSiHua]); // eslint-disable-line react-hooks/exhaustive-deps

  const streamResponse = async (apiMessages: { role: 'user' | 'assistant'; content: string }[], model: string, provider: string) => {
    const abort = new AbortController();
    requestRef.current = abort;
    setError('');
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST', signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: apiMessages, consent: true, provider, model }),
      });
      const actualModel = `${res.headers.get('X-AI-Provider') ?? provider} / ${res.headers.get('X-AI-Model') ? decodeURIComponent(res.headers.get('X-AI-Model')!) : model}`;
      if (res.ok) setMessages(prev => [...prev, { role: 'assistant', content: '', model: actualModel }]);
      await consumeInterpretation(res, text => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: text, model: actualModel };
          return updated;
        });
      });
    } catch (e) {
      if (mountedRef.current) {
        setError(abort.signal.aborted ? '已停止生成，可重新尝试或继续提问。'
          : e instanceof Error ? e.message : '解读失败，请稍后重试。');
        setMessages(prev => prev.filter(m => m.content.trim()));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
      loadingRef.current = false;
      if (requestRef.current === abort) requestRef.current = null;
    }
  };

  const beginRequest = (next: Message[]) => {
    if (!consentRef.current || loadingRef.current || !modelState.ready) return false;
    const model = modelState.selectedRef.current;
    const provider = modelState.providerRef.current;
    loadingRef.current = true;
    setLoading(true);
    lastRequestRef.current = next;
    resume();
    messagesRef.current = next;
    setMessages(next);
    void streamResponse(next.map(({ role, content }) => ({ role, content })), model, provider);
    return true;
  };

  const sendMessage = (text: string, hidden = false) => {
    if (!text.trim()) return false;
    const sent = beginRequest([...messagesRef.current, { role: 'user', content: text.trim(), hidden }]);
    if (sent) setInput('');
    return sent;
  };

  const handleTopicClick = (topicKey: string) => {
    if (loadingRef.current) return;
    setActiveTopic(topicKey);
    sendMessage(TOPIC_PROMPTS[topicKey], true);
  };

  const handleSend = () => {
    sendMessage(input);
  };

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2>AI 命盘解读</h2>
          <p role="status">{loading ? '模型正在生成，可随时停止…' : approved ? '已开启 · 可切换主题或继续提问' : '确认发送后开始，不会自动调用模型'}</p>
        </div>
        {loading && <button type="button" className={styles.stop} onClick={() => requestRef.current?.abort()}>停止生成</button>}
      </header>

      {!approved ? (
        <div className={styles.consent}>
          {chart.birthInfo.unknownTime ? <p className={styles.empty}>出生时辰完全不详，当前子时仅作占位展示。请点击“重新起盘”，选择模糊时间段后比较候选盘，AI 不解读占位盘。</p> : <AIConsent modelState={modelState} comparingRange={chart.birthInfo.source?.timeMode === 'range'} onConfirm={() => {
            consentRef.current = true;
            setApproved(true);
            sendMessage(TOPIC_PROMPTS.overview, true);
          }} />}
        </div>
      ) : <>
        <div className={styles.modelControls}><AIModelPicker state={modelState} disabled={loading} /></div>
        <div className={styles.topics} aria-label="解读主题">
          {TOPICS.map(t => <button key={t.key} type="button" className={styles.topic}
            aria-pressed={activeTopic === t.key} onClick={() => handleTopicClick(t.key)} disabled={loading || !modelState.ready}>
            {t.label}
          </button>)}
        </div>

        <div className={styles.messagesWrap}>
        <div ref={scrollRef} className={styles.messages} role="log" aria-label="解读记录" aria-busy={loading}
          tabIndex={0} onScroll={onScroll} onWheel={onWheel}
          onKeyDown={event => { if (['PageUp', 'Home', 'ArrowUp'].includes(event.key)) pause(); }}>
          {!messages.length && <p className={styles.empty}>选择上方主题，或在下方输入你关心的问题。</p>}
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              if (msg.role === 'user' && msg.hidden) return null;
              return <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={msg.role === 'user' ? styles.user : styles.assistant}>
                {msg.role === 'user' ? msg.content : <>
                  <div className={styles.messageLabel}>✦ 命理解读{msg.model ? ` · ${msg.model}` : ''}</div>
                  <AiContent text={msg.content} streaming={loading && i === messages.length - 1} />
                </>}
              </motion.div>;
            })}
          </AnimatePresence>
        </div>
        {hasUnread && <button type="button" className={styles.jump} onClick={resume}>有新内容 · 回到底部 ↓</button>}
        </div>

        {error && <div className={styles.error}>
          <p role="alert">{error}</p>
          {!loading && <button type="button" className={styles.retry} disabled={!modelState.ready}
            onClick={() => { if (lastRequestRef.current) beginRequest(lastRequestRef.current); }}>重新尝试</button>}
        </div>}

        <form className={styles.composer} onSubmit={event => { event.preventDefault(); handleSend(); }}>
          <label htmlFor="interpret-question">向 AI 提问</label>
          <div className={styles.inputRow}>
            <textarea id="interpret-question" rows={2} maxLength={16000} value={input}
              onChange={e => setInput(e.target.value)} disabled={loading}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }
              }}
              placeholder="例如：请分析我的事业方向与当前大限" />
            <button type="submit" className={styles.send} disabled={loading || !modelState.ready || !input.trim()}>发送</button>
          </div>
          <p className={styles.hint}>Enter 发送 · Shift+Enter 换行 · 传统文化研究参考</p>
        </form>
      </>}
    </div>
  );
}
