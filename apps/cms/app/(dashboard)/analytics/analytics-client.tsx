"use client";

import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { ChevronDown, ChevronRight, ChevronLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  createdAt: string;
  lastMessageAt: string;
  externalUserId: string | null;
  knowledgeBase?: { name: string };
  _count?: { messages: number };
}

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  tokensUsed: number;
  latencyMs: number;
  createdAt: string;
}

interface MessagesResponse {
  data: Message[];
  total: number;
}

export function AnalyticsClient({
  initialSessions,
  total,
  page,
  limit,
}: {
  initialSessions: Session[];
  total: number;
  page: number;
  limit: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionMessages, setSessionMessages] = useState<Record<string, Message[]>>({});
  const [loadingMessages, setLoadingMessages] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function toggleSession(sessionId: string) {
    if (expandedSession === sessionId) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(sessionId);
    if (sessionMessages[sessionId]) return;

    setLoadingMessages(sessionId);
    try {
      const res = await apiClient.get<MessagesResponse>(
        `/cms/analytics/messages?sessionId=${sessionId}&page=1&limit=50`
      );
      setSessionMessages((prev) => ({
        ...prev,
        [sessionId]: res.data.data ?? [],
      }));
    } catch {
      setSessionMessages((prev) => ({ ...prev, [sessionId]: [] }));
    } finally {
      setLoadingMessages(null);
    }
  }

  function changePage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Sessions table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-8" />
              <th className="px-4 py-3 text-left font-medium text-gray-600">Session ID</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Knowledge Base</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tin nhắn</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày tạo</th>
            </tr>
          </thead>
          <tbody>
            {initialSessions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Chưa có session nào
                </td>
              </tr>
            ) : (
              initialSessions.map((session) => (
                <Fragment key={session.id}>
                  <tr
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => void toggleSession(session.id)}
                  >
                    <td className="px-4 py-3">
                      {expandedSession === session.id ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {session.id.slice(0, 16)}...
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {session.knowledgeBase?.name ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        {session._count?.messages ?? 0}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(session.createdAt).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                  {expandedSession === session.id && (
                    <tr key={`${session.id}-expand`}>
                      <td colSpan={5} className="bg-gray-50 px-8 py-4 border-t border-gray-100">
                        {loadingMessages === session.id ? (
                          <p className="text-sm text-gray-400">Đang tải...</p>
                        ) : sessionMessages[session.id]?.length === 0 ? (
                          <p className="text-sm text-gray-400">Chưa có tin nhắn</p>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {(sessionMessages[session.id] ?? []).map((msg) => (
                              <div
                                key={msg.id}
                                className={cn(
                                  "flex gap-3 text-xs",
                                  msg.role === "USER" ? "justify-end" : "justify-start"
                                )}
                              >
                                <div
                                  className={cn(
                                    "rounded px-2.5 py-1.5 max-w-[80%]",
                                    msg.role === "USER"
                                      ? "bg-blue-100 text-blue-900"
                                      : "bg-white border border-gray-200 text-gray-800"
                                  )}
                                >
                                  <p className="whitespace-pre-wrap">{msg.content}</p>
                                  {msg.role === "ASSISTANT" && msg.latencyMs > 0 && (
                                    <p className="text-gray-400 mt-1">{msg.latencyMs}ms · {msg.tokensUsed} tokens</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Trang {page} / {totalPages} ({total} sessions)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => changePage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => changePage(page + 1)}
              disabled={page >= totalPages}
            >
              Sau
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
