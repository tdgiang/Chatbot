"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";

interface ChunkDto {
  id: string;
  documentId: string;
  content: string;
  chunkIndex: number;
  hasEmbedding: boolean;
  isEnabled: boolean;
  sourceSection: string | null;
  chunkType: string;
  createdAt: string;
  updatedAt: string;
}

const chunkTypeBadge = (type: string) => {
  const map: Record<string, { label: string; className: string }> = {
    qa: { label: 'Q&A', className: 'bg-green-100 text-green-700 border-green-200' },
    structural: { label: 'Cấu trúc', className: 'bg-blue-100 text-blue-700 border-blue-200' },
    manual: { label: 'Thủ công', className: 'bg-purple-100 text-purple-700 border-purple-200' },
    raw: { label: 'Thô', className: 'bg-gray-100 text-gray-500 border-gray-200' },
  };
  const config = map[type] ?? map.raw;
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${config.className}`}>
      {config.label}
    </span>
  );
};

interface ChunkListResponse {
  data: ChunkDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Props {
  documentId: string;
  documentName: string;
  documentStatus: string;
  initialData: ChunkListResponse;
}

const LIMIT = 20;

export function ChunksClient({ documentId, documentName, documentStatus, initialData }: Props) {
  const [chunks, setChunks] = useState<ChunkDto[]>(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);
  const [page, setPage] = useState(1);
  const [loadingPage, setLoadingPage] = useState(false);

  // Edit / Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChunk, setEditingChunk] = useState<ChunkDto | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toggle
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPage = useCallback(async (p: number) => {
    setLoadingPage(true);
    try {
      const res = await apiClient.get<ChunkListResponse>(
        `/cms/documents/${documentId}/chunks?page=${p}&limit=${LIMIT}`
      );
      setChunks(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(p);
    } catch {
      toast({ title: "Lỗi", description: "Không thể tải danh sách chunk.", variant: "destructive" });
    } finally {
      setLoadingPage(false);
    }
  }, [documentId]);

  function openCreate() {
    setEditingChunk(null);
    setEditContent("");
    setDialogOpen(true);
  }

  function openEdit(chunk: ChunkDto) {
    setEditingChunk(chunk);
    setEditContent(chunk.content);
    setDialogOpen(true);
  }

  function handleDialogClose() {
    if (editContent !== (editingChunk?.content ?? "") && editContent.length > 0) {
      if (!confirm("Bạn có thay đổi chưa lưu. Đóng dialog?")) return;
    }
    setDialogOpen(false);
  }

  async function handleSave() {
    if (editContent.trim().length < 10) {
      toast({ title: "Lỗi", description: "Nội dung tối thiểu 10 ký tự.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingChunk) {
        const res = await apiClient.patch<ChunkDto>(
          `/cms/documents/${documentId}/chunks/${editingChunk.id}`,
          { content: editContent }
        );
        setChunks((prev) => prev.map((c) => c.id === editingChunk.id ? res.data : c));
        toast({ title: "Đã lưu", description: "Nội dung chunk đã được cập nhật và embedding được tạo lại." });
      } else {
        await apiClient.post(`/cms/documents/${documentId}/chunks`, { content: editContent });
        toast({ title: "Đã tạo", description: "Chunk mới đã được thêm vào tài liệu." });
        // Navigate to last page to see new chunk
        const lastPage = Math.ceil((total + 1) / LIMIT);
        await fetchPage(lastPage);
      }
      setDialogOpen(false);
    } catch {
      toast({ title: "Lỗi", description: "Không thể lưu chunk.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(chunk: ChunkDto) {
    setTogglingId(chunk.id);
    try {
      const res = await apiClient.patch<ChunkDto>(
        `/cms/documents/${documentId}/chunks/${chunk.id}/toggle`
      );
      setChunks((prev) => prev.map((c) => c.id === chunk.id ? res.data : c));
      toast({
        title: res.data.isEnabled ? "Đã bật chunk" : "Đã tắt chunk",
        description: res.data.isEnabled
          ? "Chunk sẽ được dùng trong tìm kiếm."
          : "Chunk sẽ không được dùng trong tìm kiếm.",
      });
    } catch {
      toast({ title: "Lỗi", description: "Không thể thay đổi trạng thái chunk.", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(chunkId: string) {
    if (!confirm("Xóa chunk này? Hành động không thể hoàn tác.")) return;
    setDeletingId(chunkId);
    try {
      await apiClient.delete(`/cms/documents/${documentId}/chunks/${chunkId}`);
      const remainingOnPage = chunks.filter((c) => c.id !== chunkId).length;
      if (remainingOnPage === 0 && page > 1) {
        await fetchPage(page - 1);
      } else {
        await fetchPage(page);
      }
      toast({ title: "Đã xóa chunk" });
    } catch {
      toast({ title: "Lỗi", description: "Không thể xóa chunk.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  const isProcessing = documentStatus === "PROCESSING";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/documents">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 truncate max-w-md" title={documentName}>
              {documentName}
            </h1>
            <p className="text-sm text-gray-500">{total} chunks</p>
          </div>
        </div>
        <Button onClick={openCreate} disabled={isProcessing} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Thêm chunk
        </Button>
      </div>

      {/* Processing warning */}
      {isProcessing && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
          Tài liệu đang được xử lý. Danh sách chunks có thể chưa đầy đủ.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-12">#</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Nội dung</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">Embedding</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">Trạng thái</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 w-32">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loadingPage ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Đang tải...</td>
              </tr>
            ) : chunks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Chưa có chunk nào</td>
              </tr>
            ) : (
              chunks.map((chunk) => (
                <tr
                  key={chunk.id}
                  className={`hover:bg-gray-50 transition-colors ${!chunk.isEnabled ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{chunk.chunkIndex}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      {chunkTypeBadge(chunk.chunkType)}
                    </div>
                    <p className="text-gray-800 line-clamp-2 leading-relaxed">
                      {chunk.content}
                    </p>
                    {chunk.sourceSection && (
                      <p className="text-xs text-blue-400 mt-1 truncate max-w-sm" title={chunk.sourceSection}>
                        ↳ {chunk.sourceSection}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {chunk.content.length} ký tự
                    </p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {chunk.hasEmbedding ? (
                      <Badge variant="success" className="text-xs">✓</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">—</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggle(chunk)}
                      disabled={togglingId === chunk.id}
                      className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
                      title={chunk.isEnabled ? "Nhấn để tắt" : "Nhấn để bật"}
                    >
                      {chunk.isEnabled ? (
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
                      onClick={() => openEdit(chunk)}
                      className="h-7 w-7 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      title="Chỉnh sửa"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(chunk.id)}
                      disabled={deletingId === chunk.id}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPage(page - 1)}
            disabled={page <= 1 || loadingPage}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-600">
            Trang {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPage(page + 1)}
            disabled={page >= totalPages || loadingPage}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleDialogClose(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingChunk ? `Chỉnh sửa Chunk #${editingChunk.chunkIndex}` : "Thêm Chunk Mới"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {editingChunk && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Lưu ý: Embedding sẽ được tạo lại tự động khi bạn lưu.
              </p>
            )}
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Nhập nội dung chunk..."
              className="min-h-[240px] font-mono text-sm resize-y"
              maxLength={10000}
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Tối thiểu 10 ký tự</span>
              <span className={editContent.length > 9500 ? "text-red-500" : ""}>
                {editContent.length.toLocaleString()} / 10,000
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleDialogClose} disabled={saving}>
              Hủy
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || editContent.trim().length < 10 || (editingChunk ? editContent === editingChunk.content : false)}
            >
              {saving ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
