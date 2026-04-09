"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import Link from "next/link";
import { Upload, Trash2, RefreshCw, RotateCcw, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Document {
  id: string;
  filename: string;
  originalName: string;
  fileSize: number;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  chunkCount: number;
  createdAt: string;
  errorMessage?: string;
}

const statusBadge = (status: Document["status"]) => {
  const map = {
    PENDING: { variant: "secondary" as const, label: "Chờ xử lý" },
    PROCESSING: { variant: "warning" as const, label: "Đang xử lý" },
    DONE: { variant: "success" as const, label: "Hoàn thành" },
    FAILED: { variant: "destructive" as const, label: "Lỗi" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsClient({
  initialDocuments,
  knowledgeBaseId,
}: {
  initialDocuments: Document[];
  knowledgeBaseId: string;
}) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const startPolling = useCallback((docId: string) => {
    if (pollingRefs.current[docId]) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiClient.get<{ status: string; chunkCount: number; errorMessage?: string }>(
          `/cms/documents/${docId}/status`
        );
        const { status, chunkCount, errorMessage } = res.data;
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === docId
              ? { ...d, status: status as Document["status"], chunkCount, errorMessage }
              : d
          )
        );
        if (status === "DONE" || status === "FAILED") {
          clearInterval(pollingRefs.current[docId]);
          delete pollingRefs.current[docId];
          toast({
            title: status === "DONE" ? "Xử lý hoàn thành" : "Xử lý thất bại",
            description: status === "DONE"
              ? `Tài liệu đã được index thành công.`
              : (errorMessage ?? "Có lỗi xảy ra."),
            variant: status === "DONE" ? "default" : "destructive",
          });
        }
      } catch {
        clearInterval(pollingRefs.current[docId]);
        delete pollingRefs.current[docId];
      }
    }, 3000);
    pollingRefs.current[docId] = interval;
  }, []);

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const res = await apiClient.get("/cms/documents/template", { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document-template.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Lỗi", description: "Không thể tải file mẫu.", variant: "destructive" });
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!knowledgeBaseId) {
      toast({ title: "Lỗi", description: "Chưa có Knowledge Base", variant: "destructive" });
      return;
    }

    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Lỗi", description: "Chỉ chấp nhận PDF, DOCX, TXT", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("knowledgeBaseId", knowledgeBaseId);

      const res = await apiClient.post<Document>("/cms/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newDoc = res.data;
      setDocuments((prev) => [newDoc, ...prev]);
      toast({ title: "Upload thành công", description: "Đang xử lý tài liệu..." });
      startPolling(newDoc.id);
    } catch {
      toast({ title: "Upload thất bại", description: "Có lỗi khi upload file.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleReindex(docId: string) {
    setReindexingId(docId);
    try {
      await apiClient.post(`/cms/documents/${docId}/reindex`);
      setDocuments((prev) =>
        prev.map((d) => d.id === docId ? { ...d, status: "PENDING", chunkCount: 0, errorMessage: undefined } : d)
      );
      toast({ title: "Đang reindex", description: "Tài liệu sẽ được xử lý lại." });
      startPolling(docId);
    } catch {
      toast({ title: "Lỗi", description: "Không thể reindex tài liệu.", variant: "destructive" });
    } finally {
      setReindexingId(null);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Xóa tài liệu này? Hành động không thể hoàn tác.")) return;
    setDeletingId(docId);
    try {
      await apiClient.delete(`/cms/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      toast({ title: "Đã xóa tài liệu" });
    } catch {
      toast({ title: "Lỗi", description: "Không thể xóa tài liệu.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{documents.length} tài liệu</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            disabled={downloadingTemplate}
            title="Tải file .docx mẫu để xem định dạng khuyến nghị"
          >
            <Download className="h-4 w-4 mr-1" />
            {downloadingTemplate ? "Đang tải..." : "Tải file mẫu"}
          </Button>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !knowledgeBaseId}
            title="Upload tài liệu PDF, DOCX, hoặc TXT"
          >
            {uploading ? (
              <><RefreshCw className="h-4 w-4 mr-1 animate-spin" />Đang upload...</>
            ) : (
              <><Upload className="h-4 w-4 mr-1" />Upload tài liệu</>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
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
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tên file</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Kích thước</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Chunks</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày tạo</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {documents.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Chưa có tài liệu nào
                </td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 truncate max-w-xs" title={doc.originalName}>
                      {doc.originalName}
                    </div>
                    {doc.errorMessage && (
                      <div className="text-xs text-red-500 mt-0.5 truncate max-w-xs" title={doc.errorMessage}>
                        {doc.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatSize(doc.fileSize)}</td>
                  <td className="px-4 py-3">{statusBadge(doc.status)}</td>
                  <td className="px-4 py-3">
                    {doc.status === "DONE" && doc.chunkCount > 0 ? (
                      <Link
                        href={`/documents/${doc.id}/chunks`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {doc.chunkCount}
                      </Link>
                    ) : (
                      <span className="text-gray-600">{doc.chunkCount}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(doc.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    {(doc.status === "DONE" || doc.status === "FAILED") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleReindex(doc.id)}
                        disabled={reindexingId === doc.id}
                        title="Reindex lại tài liệu"
                        className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <RotateCcw className={`h-4 w-4 ${reindexingId === doc.id ? "animate-spin" : ""}`} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
