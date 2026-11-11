'use client';
import { useEffect, useRef, useState, type UIEvent, type WheelEvent } from 'react';

/** Follow streamed text only while the reader stays at the bottom. Never move keyboard focus. */
export function useFollowScroll(content: unknown) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [hasUnread, setHasUnread] = useState(false);
  const pause = () => { following.current = false; };
  const resume = () => {
    following.current = true;
    setHasUnread(false);
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  };
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight <= 32;
    following.current = atBottom;
    if (atBottom) setHasUnread(false);
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => { if (event.deltaY < 0) pause(); };
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (following.current) element.scrollTop = element.scrollHeight;
    else setHasUnread(true);
  }, [content]);
  return { scrollRef, hasUnread, resume, onScroll, onWheel, pause };
}
