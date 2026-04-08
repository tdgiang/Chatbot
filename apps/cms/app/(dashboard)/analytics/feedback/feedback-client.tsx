"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";

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

interface Props {
  initialData: FeedbackListResponse;
  initialStats: FeedbackStatsDto;
}

type RatingFilter = "all" | "1" | "-1";

const LIMIT = 20;

export function FeedbackClient({ initialData, initialStats }: Props) {
  const [feedbacks, setFeedbacks] = useState<FeedbackDto[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<FeedbackStatsDto>(initialStats);
  const [filter, setFilter] = useState<RatingFilter>("all");
  const [loadingPage, setLoadingPage] = useState(false);

  const fetchPage = useCallback(async (p: number, ratingFilter: RatingFilter) => {
    setLoadingPage(true);
    try {
      const ratingParam = ratingFilter !== "all" ? `&rating=${ratingFilter}` : "";
      const [listRes, statsRes] = await Promise.all([
        apiClient.get<FeedbackListResponse>(
          `/cms/analytics/feedback?page=${p}&limit=${LIMIT}${ratingParam}`
        ),
        apiClient.get<FeedbackStatsDto>(`/cms/analytics/feedback/stats`),
      ]);
      setFeedbacks(listRes.data.data);
      setTotal(listRes.data.total);
      setTotalPages(listRes.data.totalPages);
      setPage(p);
      setStats(statsRes.data);
    } catch {
      toast({ title: "Lỗi", description: "Không thể tải phản hồi.", variant: "destructive" });
    } finally {
      setLoadingPage(false);
    }
  }, []);

  function handleFilterChange(f: RatingFilter) {
    setFilter(f);
    void fetchPage(1, f);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Phản Hồi Người Dùng</h1>
        <p className="text-sm text-gray-500 mt-0.5">Đánh giá chất lượng câu trả lời của chatbot</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ThumbsUp className="h-4 w-4 text-green-500" />
            <p className="text-sm text-gray-500">Tích cực</p>
          </div>
          <p className="text-2xl font-semibold text-green-600">{stats.positive}</p>
          <p className="text-xs text-gray-400 mt-0.5">{stats.positiveRate}% tổng phản hồi</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ThumbsDown className="h-4 w-4 text-red-500" />
            <p className="text-sm text-gray-500">Tiêu cực</p>
          </div>
          <p className="text-2xl font-semibold text-red-600">{stats.negative}</p>
          <p className="text-xs text-gray-400 mt-0.5">{100 - stats.positiveRate}% tổng phản hồi</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500 mb-1">Tổng phản hồi</p>
          <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-400 rounded-full"
              style={{ width: `${stats.positiveRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {([["all", "Tất cả"], ["1", "👍 Tốt"], ["-1", "👎 Xấu"]] as [RatingFilter, string][]).map(
          ([val, label]) => (
            <Button
              key={val}
              variant={filter === val ? "default" : "outline"}
              size="sm"
              onClick={() => handleFilterChange(val)}
            >
              {label}
            </Button>
          )
        )}
        <span className="ml-auto text-sm text-gray-500 self-center">{total} kết quả</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Câu hỏi</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Câu trả lời (bot)</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-20">Đánh giá</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-36">Ghi chú</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">Tạo FAQ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingPage ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Đang tải...</td>
              </tr>
            ) : feedbacks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Chưa có phản hồi nào
                </td>
              </tr>
            ) : (
              feedbacks.map((fb) => (
                <tr key={fb.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-gray-800 line-clamp-2 text-xs leading-relaxed">
                      {fb.userQuestion ?? <span className="text-gray-400 italic">—</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 max-w-sm">
                    <p className="text-gray-600 line-clamp-2 text-xs leading-relaxed">
                      {fb.botAnswer ?? <span className="text-gray-400 italic">—</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {fb.rating === 1 ? (
                      <Badge variant="success" className="text-xs gap-1">
                        <ThumbsUp className="h-3 w-3" /> Tốt
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <ThumbsDown className="h-3 w-3" /> Xấu
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {fb.note ?? <span className="text-gray-300">—</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {fb.rating === -1 && fb.userQuestion && (
                      <Link
                        href={`/faq?prefill=${encodeURIComponent(fb.userQuestion)}`}
                        title="Tạo FAQ từ câu hỏi này"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Tạo FAQ
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <Button
            variant="outline" size="sm"
            onClick={() => fetchPage(page - 1, filter)}
            disabled={page <= 1 || loadingPage}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">Trang {page} / {totalPages}</span>
          <Button
            variant="outline" size="sm"
            onClick={() => fetchPage(page + 1, filter)}
            disabled={page >= totalPages || loadingPage}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
