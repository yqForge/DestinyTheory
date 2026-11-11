'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart } from '@/lib/ziwei/types';
import AIConsent from './AIConsent';
import { consumeInterpretation } from '@/lib/ai/interpret-client';
import { useFollowScroll } from '@/lib/ai/use-follow-scroll';
import { useAIModels } from '@/lib/ai/use-ai-models';
import AIModelPicker from './AIModelPicker';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}

interface ChatPanelProps {
  chart: ZiweiChart;
}

const PRESET_QUESTIONS = [
  '我的整体命格如何？性格特点是什么？',
  '我的感情婚姻运势如何？',
  '我的事业财运如何？适合什么方向？',
  '我现在的大限运势如何？',
  '我的健康需要注意什么？',
  '今年的流年运势如何？',
];

export default function ChatPanel({ chart }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { scrollRef, hasUnread, resume, onScroll, onWheel, pause } = useFollowScroll(messages);
  const [approved, setApproved] = useState(false);
  const modelState = useAIModels();
  const [error, setError] = useState('');
  const loadingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);

  const sendMessage = async (text: string) => {
    if (!approved || !text.trim() || loadingRef.current || !modelState.ready) return;
    const model = modelState.selectedRef.current;
    const provider = modelState.providerRef.current;
    loadingRef.current = true;
    resume();
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const abort = new AbortController();
    requestRef.current = abort;
    setError('');
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST', signal: abort.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })), consent: true, provider, model }),
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
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : '解读失败，请稍后重试。');
      setMessages(prev => prev.filter(m => m.content.trim()));
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden card-glass">
      {/* 标题 */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <h3 className="text-xs font-medium tracking-widest" style={{ color: 'var(--t-gold)' }}>AI 命盘解读</h3>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--t-faint)' }}>DestinyTheory · 紫微斗数 AI 解盘</p>
      </div>

      {approved && <div className="px-3 py-2"><AIModelPicker state={modelState} disabled={loading} /></div>}

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
        tabIndex={0} onScroll={onScroll} onWheel={onWheel}
        onKeyDown={event => { if (['PageUp', 'Home', 'ArrowUp'].includes(event.key)) pause(); }}>
        {!approved && <AIConsent modelState={modelState} onConfirm={() => setApproved(true)} />}
        {approved && messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <div className="text-4xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.15 }}>✦</div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--t-faint)' }}>
              命盘已生成，可直接提问<br />
              或从下方选择常见问题开始解读
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
                style={msg.role === 'user' ? {
                  background: 'rgba(212,168,67,0.1)',
                  border: '1px solid rgba(212,168,67,0.2)',
                  color: 'var(--t-gold)',
                } : {
                  background: 'var(--t-card)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-text)',
                }}
              >
                {msg.role === 'assistant' && (
                  <div className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>命理解读 · {msg.model}</div>
                )}
                <div className="whitespace-pre-wrap text-xs leading-relaxed">
                  {msg.content}
                  {loading && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="inline-block w-1.5 h-3 ml-0.5 animate-pulse" style={{ background: 'var(--t-gold)', opacity: 0.6 }} />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {error && <p role="alert" className="text-xs leading-relaxed" style={{ color: '#f87171' }}>{error}</p>}
      </div>

      {hasUnread && <button type="button" className="text-xs py-2" style={{ color: 'var(--t-gold)' }} onClick={resume}>有新内容 · 回到底部 ↓</button>}

      {/* 预设问题 */}
      {approved && messages.length === 0 && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                disabled={loading}
                className="text-left text-[10px] rounded-lg px-2.5 py-2 transition-all line-clamp-2"
                style={{
                  color: 'var(--t-text2)',
                  border: '1px solid var(--t-border)',
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)';
                  e.currentTarget.style.color = 'var(--t-gold)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--t-border)';
                  e.currentTarget.style.color = 'var(--t-text2)';
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div className="px-3 pb-3 pt-2 flex-shrink-0" style={{ borderTop: '1px solid var(--t-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="输入问题，如：我的感情运势如何？"
            disabled={loading || !approved}
            className="flex-1 rounded-lg px-3 py-2 text-xs focus:outline-none transition-colors"
            style={{
              background: 'var(--t-card)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-text)',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !approved || !modelState.ready || !input.trim()}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(212,168,67,0.15)',
              border: '1px solid rgba(212,168,67,0.25)',
              color: 'var(--t-gold)',
            }}
          >
            解读
          </button>
        </div>
      </div>
    </div>
  );
}
