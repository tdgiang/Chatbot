"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight } from "lucide-react";

interface FaqDto {
  id: string;
  knowledgeBaseId: string;
  question: string;
  answer: string;
  isActive: boolean;
  priority: number;
  matchCount: number;
  createdAt: string;
}

interface FaqListResponse {
  data: FaqDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Props {
  knowledgeBaseId: string;
  initialData: FaqListResponse;
}

const LIMIT = 20;

export function FaqClient({ knowledgeBaseId, initialData }: Props) {
  const [faqs, setFaqs] = useState<FaqDto[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);
  const [page, setPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqDto | null>(null);
  const [formQuestion, setFormQuestion] = useState("");
  const [formAnswer, setFormAnswer] = useState("");
  const [formPriority, setFormPriority] = useState(0);
  const [saving, setSaving] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPage = useCallback(async (p: number) => {
    setLoadingPage(true);
    try {
      const res = await apiClient.get<FaqListResponse>(
        `/cms/faq?knowledgeBaseId=${knowledgeBaseId}&page=${p}&limit=${LIMIT}`
      );
      setFaqs(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(p);
    } catch {
      toast({ title: "Lỗi", description: "Không thể tải danh sách FAQ.", variant: "destructive" });
    } finally {
      setLoadingPage(false);
    }
  }, [knowledgeBaseId]);

  function openCreate() {
    setEditingFaq(null);
    setFormQuestion("");
    setFormAnswer("");
    setFormPriority(0);
    setDialogOpen(true);
  }

  function openEdit(faq: FaqDto) {
    setEditingFaq(faq);
    setFormQuestion(faq.question);
    setFormAnswer(faq.answer);
    setFormPriority(faq.priority);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (formQuestion.trim().length < 5) {
      toast({ title: "Lỗi", description: "Câu hỏi tối thiểu 5 ký tự.", variant: "destructive" });
      return;
    }
    if (formAnswer.trim().length < 5) {
      toast({ title: "Lỗi", description: "Câu trả lời tối thiểu 5 ký tự.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingFaq) {
        const res = await apiClient.patch<FaqDto>(`/cms/faq/${editingFaq.id}`, {
          question: formQuestion,
          answer: formAnswer,
          priority: formPriority,
        });
        setFaqs((prev) => prev.map((f) => f.id === editingFaq.id ? res.data : f));
        toast({ title: "Đã cập nhật FAQ" });
      } else {
        await apiClient.post("/cms/faq", {
          knowledgeBaseId,
          question: formQuestion,
          answer: formAnswer,
          priority: formPriority,
        });
        toast({ title: "Đã tạo FAQ", description: "Đang tạo embedding cho câu hỏi..." });
        await fetchPage(1);
      }
      setDialogOpen(false);
    } catch {
      toast({ title: "Lỗi", description: "Không thể lưu FAQ.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(faq: FaqDto) {
    setTogglingId(faq.id);
    try {
      const res = await apiClient.patch<FaqDto>(`/cms/faq/${faq.id}/toggle`);
      setFaqs((prev) => prev.map((f) => f.id === faq.id ? res.data : f));
      toast({
        title: res.data.isActive ? "Đã bật FAQ" : "Đã tắt FAQ",
        description: res.data.isActive ? "FAQ sẽ được dùng trong tìm kiếm." : "FAQ sẽ không hoạt động.",
      });
    } catch {
      toast({ title: "Lỗi", description: "Không thể thay đổi trạng thái FAQ.", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xóa FAQ này? Hành động không thể hoàn tác.")) return;
    setDeletingId(id);
    try {
      await apiClient.delete(`/cms/faq/${id}`);
      const remainingOnPage = faqs.filter((f) => f.id !== id).length;
      if (remainingOnPage === 0 && page > 1) {
        await fetchPage(page - 1);
      } else {
        await fetchPage(page);
      }
      toast({ title: "Đã xóa FAQ" });
    } catch {
      toast({ title: "Lỗi", description: "Không thể xóa FAQ.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">FAQ & Câu Trả Lời Cố Định</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} câu hỏi — trả lời ngay, không qua AI</p>
        </div>
        <Button onClick={openCreate} disabled={!knowledgeBaseId} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Thêm FAQ
        </Button>
      </div>

      {!knowledgeBaseId && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
          Chưa cấu hình Knowledge Base.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Câu hỏi mẫu</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Câu trả lời</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-16">Hit</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-20">Ưu tiên</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">Trạng thái</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 w-28">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingPage ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Đang tải...</td>
              </tr>
            ) : faqs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Chưa có FAQ nào. Nhấn &quot;Thêm FAQ&quot; để bắt đầu.
                </td>
              </tr>
            ) : (
              faqs.map((faq) => (
                <tr key={faq.id} className={`hover:bg-gray-50 transition-colors ${!faq.isActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-gray-900 line-clamp-2">{faq.question}</p>
                  </td>
                  <td className="px-4 py-3 max-w-sm">
                    <p className="text-gray-600 line-clamp-2 text-xs">{faq.answer}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="secondary" className="text-xs font-mono">{faq.matchCount}</Badge>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500 text-xs">{faq.priority}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(faq)}
                      disabled={togglingId === faq.id}
                      className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
                      title={faq.isActive ? "Nhấn để tắt" : "Nhấn để bật"}
                    >
                      {faq.isActive ? (
                        <><ToggleRight className="h-5 w-5 text-green-500" /><span className="text-green-600">Bật</span></>
                      ) : (
                        <><ToggleLeft className="h-5 w-5 text-gray-400" /><span className="text-gray-500">Tắt</span></>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(faq)}
                      className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      title="Chỉnh sửa"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(faq.id)}
                      disabled={deletingId === faq.id}
                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Xóa"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
          <Button variant="outline" size="sm" onClick={() => fetchPage(page - 1)} disabled={page <= 1 || loadingPage}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">Trang {page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => fetchPage(page + 1)} disabled={page >= totalPages || loadingPage}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingFaq ? "Chỉnh sửa FAQ" : "Thêm FAQ Mới"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Câu hỏi mẫu <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formQuestion}
                onChange={(e) => setFormQuestion(e.target.value)}
                placeholder="Nhập câu hỏi thường gặp..."
                rows={3}
                maxLength={500}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{formQuestion.length}/500</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Câu trả lời <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                placeholder="Nhập câu trả lời chính xác..."
                rows={5}
                maxLength={5000}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{formAnswer.length}/5000</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Độ ưu tiên <span className="text-gray-400 font-normal">(số cao hơn = ưu tiên hơn khi nhiều FAQ match)</span>
              </label>
              <input
                type="number"
                value={formPriority}
                onChange={(e) => setFormPriority(parseInt(e.target.value) || 0)}
                min={0}
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {editingFaq && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Nếu bạn thay đổi câu hỏi, embedding sẽ được tạo lại tự động.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Hủy
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || formQuestion.trim().length < 5 || formAnswer.trim().length < 5}
            >
              {saving ? "Đang lưu..." : "Lưu FAQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
