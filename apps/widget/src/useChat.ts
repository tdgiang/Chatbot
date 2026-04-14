import { useState, useCallback, useRef } from 'react';
import type { Message, WidgetConfig } from './types';

const SESSION_KEY = 'chatbot_session_id';

export function useChat(config: WidgetConfig) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string | null>(
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null
  );

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAssistant = useCallback((delta: string, done: boolean) => {
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last?.role === 'assistant') {
        copy[copy.length - 1] = {
          ...last,
          content: last.content + delta,
          streaming: !done,
        };
      }
      return copy;
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const apiUrl = config.apiUrl ?? 'http://localhost:4000';

      // Add user message
      addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
      setLoading(true);

      // Placeholder streaming message
      const assistantId = crypto.randomUUID();
      addMessage({ id: assistantId, role: 'assistant', content: '', streaming: true });

      try {
        const res = await fetch(`${apiUrl}/api/v1/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            message: text,
            stream: true,
            ...(sessionIdRef.current && { session_id: sessionIdRef.current }),
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response body');

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE events are delimited by \n\n — split on double newline
          // keep the last (potentially incomplete) segment in buffer
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const event of events) {
            // Each event may have multiple lines; find the data: line
            const line = event.split('\n').find((l) => l.startsWith('data: ')) ?? '';
            if (!line) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            try {
              const data = JSON.parse(json) as {
                delta: string;
                done: boolean;
                session_id?: string;
              };

              if (data.session_id) {
                sessionIdRef.current = data.session_id;
                sessionStorage.setItem(SESSION_KEY, data.session_id);
              }

              updateLastAssistant(data.delta, data.done);
            } catch {
              // ignore malformed SSE line
            }
          }
        }
      } catch {
        updateLastAssistant(
          'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại sau.',
          true
        );
      } finally {
        setLoading(false);
      }
    },
    [config, loading, addMessage, updateLastAssistant]
  );

  const clearSession = useCallback(() => {
    sessionIdRef.current = null;
    sessionStorage.removeItem(SESSION_KEY);
    setMessages([]);
  }, []);

  return { messages, loading, sendMessage, clearSession };
}
