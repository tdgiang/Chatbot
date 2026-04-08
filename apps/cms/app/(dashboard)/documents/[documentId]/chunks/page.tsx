import { serverFetch } from "@/lib/auth";
import { ChunksClient } from "./chunks-client";

interface Document {
  id: string;
  originalName: string;
  status: string;
  chunkCount: number;
}

interface ChunkListResponse {
  data: ChunkDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

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

async function getData(documentId: string) {
  try {
    const [documents, chunks] = await Promise.all([
      serverFetch<Document[]>("/cms/documents"),
      serverFetch<ChunkListResponse>(`/cms/documents/${documentId}/chunks?page=1&limit=20`),
    ]);
    const document = documents.find((d) => d.id === documentId) ?? null;
    return { document, chunks, error: null };
  } catch (e) {
    return { document: null, chunks: null, error: String(e) };
  }
}

export default async function ChunksPage({
  params,
}: {
  params: { documentId: string };
}) {
  const { document, chunks, error } = await getData(params.documentId);

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Lỗi kết nối API: {error}
        </div>
      )}
      <ChunksClient
        documentId={params.documentId}
        documentName={document?.originalName ?? "Tài liệu"}
        documentStatus={document?.status ?? "UNKNOWN"}
        initialData={chunks ?? { data: [], total: 0, page: 1, limit: 20, totalPages: 0 }}
      />
    </div>
  );
}
