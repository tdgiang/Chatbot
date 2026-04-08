import { serverFetch } from "@/lib/auth";
import { FeedbackClient } from "./feedback-client";

interface FeedbackDto {
  id: string;
  messageId: string;
  sessionId: string;
  rating: 1 | -1;
  note?: string | null;
  createdAt: string;
  botAnswer?: string;
  userQuestion?: string;
}

interface FeedbackListResponse {
  data: FeedbackDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface FeedbackStatsDto {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
}

async function getData() {
  try {
    const [list, stats] = await Promise.all([
      serverFetch<FeedbackListResponse>("/cms/analytics/feedback?page=1&limit=20"),
      serverFetch<FeedbackStatsDto>("/cms/analytics/feedback/stats"),
    ]);
    return { list, stats, error: null };
  } catch (e) {
    return { list: null, stats: null, error: String(e) };
  }
}

export default async function FeedbackPage() {
  const { list, stats, error } = await getData();

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Lỗi kết nối API: {error}
        </div>
      )}
      <FeedbackClient
        initialData={list ?? { data: [], total: 0, page: 1, limit: 20, totalPages: 0 }}
        initialStats={stats ?? { total: 0, positive: 0, negative: 0, positiveRate: 0 }}
      />
    </div>
  );
}
