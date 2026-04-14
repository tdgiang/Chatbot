import { useState, useEffect, useRef } from 'react';
import { useChat } from './useChat';
import type { WidgetConfig } from './types';

interface Props {
  config: WidgetConfig;
}

export function ChatWidget({ config }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { messages, loading, sendMessage, clearSession } = useChat(config);

  const isLeft = config.position === 'bottom-left';
  const primaryColor = config.primaryColor ?? '#2563eb';
  const title = config.title ?? 'Hỗ trợ trực tuyến';
  const subtitle = config.subtitle ?? 'Chúng tôi sẵn sàng hỗ trợ bạn';
  const placeholder = config.placeholder ?? 'Nhập câu hỏi...';
  const welcomeMessage = config.welcomeMessage ?? 'Xin chào! Tôi có thể giúp gì cho bạn?';

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Show welcome message on first open
  const hasShownWelcome = useRef(false);
  useEffect(() => {
    if (open && !hasShownWelcome.current && messages.length === 0) {
      hasShownWelcome.current = true;
      // inject welcome as local message (no API call)
      import('./useChat').then(() => {
        // The welcomeMessage is just displayed locally, not sent to API
      });
    }
  }, [open, messages.length, welcomeMessage]);

  function handleSubmit() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    void sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <>
      {/* Chat Box */}
      {open && (
        <div
          className={`cw-fixed cw-bottom-20 ${isLeft ? 'cw-left-4' : 'cw-right-4'} cw-w-[360px] cw-max-w-[calc(100vw-2rem)] cw-rounded-2xl cw-shadow-2xl cw-flex cw-flex-col cw-overflow-hidden cw-border cw-border-gray-200 cw-animate-fade-in`}
          style={{ height: '520px', zIndex: 2147483646 }}
        >
          {/* Header */}
          <div
            className="cw-flex cw-items-center cw-justify-between cw-px-4 cw-py-3 cw-text-white cw-shrink-0"
            style={{ background: primaryColor }}
          >
            <div>
              <p className="cw-font-semibold cw-text-sm cw-leading-tight">{title}</p>
              <p className="cw-text-xs cw-opacity-80 cw-mt-0.5">{subtitle}</p>
            </div>
            <div className="cw-flex cw-items-center cw-gap-1">
              <button
                onClick={clearSession}
                title="Cuộc trò chuyện mới"
                className="cw-p-1.5 cw-rounded-md cw-opacity-70 hover:cw-opacity-100 hover:cw-bg-white/20 cw-transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                </svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Thu nhỏ"
                className="cw-p-1.5 cw-rounded-md cw-opacity-70 hover:cw-opacity-100 hover:cw-bg-white/20 cw-transition-all"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="cw-flex-1 cw-overflow-y-auto cw-p-4 cw-space-y-3 cw-bg-white">
            {/* Welcome */}
            {messages.length === 0 && (
              <div className="cw-flex cw-gap-2">
                <div
                  className="cw-w-7 cw-h-7 cw-rounded-full cw-flex cw-items-center cw-justify-center cw-shrink-0 cw-mt-0.5"
                  style={{ background: primaryColor }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                </div>
                <div className="cw-bg-gray-100 cw-rounded-2xl cw-rounded-tl-sm cw-px-3 cw-py-2 cw-max-w-[75%]">
                  <p className="cw-text-sm cw-text-gray-800 cw-leading-relaxed">{welcomeMessage}</p>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`cw-flex cw-gap-2 ${msg.role === 'user' ? 'cw-justify-end' : 'cw-justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div
                    className="cw-w-7 cw-h-7 cw-rounded-full cw-flex cw-items-center cw-justify-center cw-shrink-0 cw-mt-0.5"
                    style={{ background: primaryColor }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                    </svg>
                  </div>
                )}

                <div
                  className={`cw-max-w-[75%] cw-px-3 cw-py-2 cw-rounded-2xl cw-text-sm cw-leading-relaxed cw-whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'cw-text-white cw-rounded-tr-sm'
                      : 'cw-bg-gray-100 cw-text-gray-800 cw-rounded-tl-sm'
                  }`}
                  style={msg.role === 'user' ? { background: primaryColor } : {}}
                >
                  {msg.content}
                  {msg.streaming && (
                    <span className="cw-inline-block cw-w-0.5 cw-h-3.5 cw-bg-gray-500 cw-ml-0.5 cw-animate-blink cw-align-middle" />
                  )}
                  {msg.role === 'assistant' && !msg.content && !msg.streaming && (
                    <span className="cw-text-gray-400 cw-italic">...</span>
                  )}
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="cw-border-t cw-border-gray-100 cw-p-3 cw-bg-white cw-shrink-0">
            <div className="cw-flex cw-gap-2 cw-items-end">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={loading}
                className="cw-flex-1 cw-resize-none cw-border cw-border-gray-200 cw-rounded-xl cw-px-3 cw-py-2 cw-text-sm cw-outline-none cw-transition-colors focus:cw-border-blue-400 disabled:cw-opacity-50 cw-max-h-24 cw-overflow-y-auto cw-leading-relaxed"
                style={{ minHeight: '38px' }}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || loading}
                className="cw-w-9 cw-h-9 cw-rounded-xl cw-flex cw-items-center cw-justify-center cw-transition-all cw-shrink-0 disabled:cw-opacity-40"
                style={{ background: primaryColor }}
              >
                {loading ? (
                  <svg className="cw-animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="cw-text-center cw-text-xs cw-text-gray-300 cw-mt-2">
              Powered by AI · Nhấn Enter để gửi
            </p>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`cw-fixed cw-bottom-4 ${isLeft ? 'cw-left-4' : 'cw-right-4'} cw-w-14 cw-h-14 cw-rounded-full cw-shadow-lg cw-flex cw-items-center cw-justify-center cw-transition-all cw-duration-200 hover:cw-scale-110 active:cw-scale-95`}
        style={{ background: primaryColor, zIndex: 2147483647 }}
        aria-label={open ? 'Đóng chat' : 'Mở chat'}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
        )}
      </button>
    </>
  );
}
