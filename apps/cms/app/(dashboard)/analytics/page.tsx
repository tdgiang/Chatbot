import { serverFetch } from "@/lib/auth";
import { AnalyticsClient } from "./analytics-client";

interface Session {
  id: string;
  createdAt: string;
  lastMessageAt: string;
  externalUserId: string | null;
  knowledgeBase?: { name: string };
  _count?: { messages: number };
}

interface SessionsResponse {
  data: Session[];
  total: number;
  page: number;
  limit: number;
}

interface StatsResponse {
  totalSessions: number;
  totalMessages: number;
  sessionsToday: number;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Number(searchParams.page ?? 1);
  const limit = 20;

  let sessions: Session[] = [];
  let total = 0;
  let stats: StatsResponse = { totalSessions: 0, totalMessages: 0, sessionsToday: 0 };
  let error: string | null = null;

  try {
    const [sessionsRes, statsRes] = await Promise.allSettled([
      serverFetch<SessionsResponse>(`/cms/analytics/sessions?page=${page}&limit=${limit}`),
      serverFetch<StatsResponse>(`/cms/analytics/stats`),
    ]);

    if (sessionsRes.status === "fulfilled") {
      sessions = sessionsRes.value.data ?? [];
      total = sessionsRes.value.total ?? 0;
    }
    if (statsRes.status === "fulfilled") {
      stats = statsRes.value;
    }
  } catch (e) {
    error = String(e);
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">Thống kê và logs hội thoại</p>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Lỗi kết nối API: {error}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Sessions hôm nay</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.sessionsToday}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Tổng sessions</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.totalSessions}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Tổng tin nhắn</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.totalMessages}</p>
        </div>
      </div>

      <AnalyticsClient
        initialSessions={sessions}
        total={total}
        page={page}
        limit={limit}
      />
    </div>
  );
}
