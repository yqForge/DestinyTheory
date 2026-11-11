/** SSE framing shared by the upstream adapter and browser (UTF-8 / CRLF / split frames). */
export async function* readSseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let data: string[] = [];
  let eventSize = 0;
  let ended = false;
  const accept = (line: string): string | undefined => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line === '') {
      const event = data.length ? data.join('\n') : undefined;
      data = [];
      eventSize = 0;
      return event;
    }
    if (line.startsWith('data:')) {
      const value = line.slice(5).replace(/^ /, '');
      eventSize += value.length;
      if (eventSize > 262144) throw new Error('AI 响应帧过大。');
      data.push(value);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        const event = accept(line);
        if (event !== undefined) yield event;
      }
      if (pending.length > 262144) throw new Error('AI 响应帧过大。');
      if (done) {
        ended = true;
        if (pending) {
          const event = accept(pending);
          if (event !== undefined) yield event;
        }
        const event = accept('');
        if (event !== undefined) yield event;
        break;
      }
    }
  } finally {
    if (!ended) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
