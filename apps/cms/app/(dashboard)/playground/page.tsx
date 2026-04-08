"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Bot, User, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Message {
  role: "user" | "assistant";
  content: string;
  latencyMs?: number;
  messageId?: string;    // present for assistant messages after response
  sessionId?: string;
  feedback?: 1 | -1;    // set after user clicks 👍/👎
  source?: "faq" | "rag";
}

export default function PlaygroundPage() {
  const [apiKey, setApiKey]     = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendFeedback(idx: number, rating: 1 | -1) {
    const msg = messages[idx];
    if (!msg.messageId || !msg.sessionId || msg.feedback !== undefined) return;

    // Optimistic update
    setMessages((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], feedback: rating };
      return updated;
    });

    try {
      await fetch(`${API_URL}/api/v1/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          message_id: msg.messageId,
          session_id: msg.sessionId,
          rating,
        }),
      });
    } catch {
      // Revert on error
      setMessages((prev) => {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], feedback: undefined };
        return updated;
      });
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !apiKey.trim() || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    const startTime = Date.now();
    let assistantContent = "";

    try {
      const res = await fetch(`${API_URL}/api/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: text,
          stream: true,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Lỗi ${res.status}: ${errText}`, latencyMs: Date.now() - startTime },
        ]);
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let newSessionId: string | null = null;
        let newMessageId: string | null = null;
        let newSource: "faq" | "rag" | undefined;

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "", latencyMs: undefined },
        ]);

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (!data) continue;
              try {
                const parsed = JSON.parse(data) as {
                  delta?: string; done?: boolean;
                  session_id?: string; message_id?: string; source?: "faq" | "rag";
                };
                if (parsed.delta) {
                  assistantContent += parsed.delta;
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                    return updated;
                  });
                }
                if (parsed.done) {
                  newSessionId = parsed.session_id ?? null;
                  newMessageId = parsed.message_id ?? null;
                  newSource    = parsed.source;
                }
              } catch { /* skip malformed */ }
            }
          }
        }

        const latencyMs = Date.now() - startTime;
        const currentSessionId = newSessionId ?? sessionId ?? "";
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantContent,
            latencyMs,
            messageId: newMessageId ?? undefined,
            sessionId: currentSessionId,
            source: newSource,
          };
          return updated;
        });
        if (newSessionId) setSessionId(newSessionId);
      } else {
        const data = await res.json() as {
          session_id: string; message_id?: string;
          message: { role: string; content: string };
          latency_ms: number; source?: "faq" | "rag";
        };
        assistantContent = data.message.content;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantContent,
            latencyMs: data.latency_ms ?? Date.now() - startTime,
            messageId: data.message_id,
            sessionId: data.session_id,
            source: data.source,
          },
        ]);
        if (data.session_id) setSessionId(data.session_id);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Lỗi kết nối. Vui lòng kiểm tra API key và thử lại.", latencyMs: Date.now() - startTime },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function resetSession() {
    setSessionId(null);
    setMessages([]);
  }

  return (
    <div className="p-6 h-screen flex flex-col max-h-screen">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Playground</h1>
        <p className="text-sm text-gray-500 mt-1">Test chatbot trực tiếp</p>
      </div>

      {/* API Key input */}
      <div className="mb-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-60 space-y-1.5">
          <Label htmlFor="apiKey">API Key</Label>
          <Input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Dán API key của bạn vào đây..."
          />
        </div>
        {sessionId && (
          <div className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-1 font-mono">
            Session: {sessionId.slice(0, 12)}...
          </div>
        )}
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={resetSession}>
            Xóa chat
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-lg p-4 space-y-4 mb-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Bot className="h-10 w-10 mb-2" />
            <p className="text-sm">Nhập API key và bắt đầu chat</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
                  <Bot className="h-4 w-4 text-gray-600" />
                </div>
              )}

              <div className="flex flex-col gap-1 max-w-[75%]">
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
                  )}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === "assistant" && msg.latencyMs !== undefined && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs text-gray-400">{msg.latencyMs}ms</p>
                      {msg.source && (
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded font-medium",
                          msg.source === "faq"
                            ? "bg-purple-100 text-purple-600"
                            : "bg-blue-100 text-blue-600"
                        )}>
                          {msg.source === "faq" ? "FAQ" : "RAG"}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Feedback buttons — only for assistant messages with messageId */}
                {msg.role === "assistant" && msg.messageId && (
                  <div className="flex items-center gap-1 pl-1">
                    {msg.feedback === undefined ? (
                      <>
                        <button
                          onClick={() => sendFeedback(idx, 1)}
                          className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                          title="Câu trả lời hữu ích"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => sendFeedback(idx, -1)}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                          title="Câu trả lời chưa tốt"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className={cn(
                        "text-xs flex items-center gap-1",
                        msg.feedback === 1 ? "text-green-600" : "text-red-500"
                      )}>
                        {msg.feedback === 1
                          ? <><ThumbsUp className="h-3 w-3" /> Đã đánh giá tốt</>
                          : <><ThumbsDown className="h-3 w-3" /> Đã đánh giá xấu</>
                        }
                      </span>
                    )}
                  </div>
                )}
              </div>

              {msg.role === "user" && (
                <div className="flex-shrink-0 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center">
              <Bot className="h-4 w-4 text-gray-600" />
            </div>
            <div className="bg-gray-100 rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={apiKey ? "Nhập tin nhắn... (Enter để gửi)" : "Nhập API key trước"}
          disabled={!apiKey.trim() || loading}
          className="flex-1"
        />
        <Button
          onClick={() => void sendMessage()}
          disabled={!input.trim() || !apiKey.trim() || loading}
          size="icon"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
