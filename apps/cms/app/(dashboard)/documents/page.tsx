import { serverFetch } from "@/lib/auth";
import { DocumentsClient } from "./documents-client";

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

interface KnowledgeBase {
  id: string;
  name: string;
}

async function getData() {
  try {
    const [kb, documents] = await Promise.all([
      serverFetch<KnowledgeBase>("/cms/knowledge-base"),
      serverFetch<Document[]>("/cms/documents"),
    ]);
    return { kb, documents, error: null };
  } catch (e) {
    return { kb: null, documents: [], error: String(e) };
  }
}

export default async function DocumentsPage() {
  const { kb, documents, error } = await getData();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Tài liệu</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload và quản lý tài liệu cho Knowledge Base
        </p>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Lỗi kết nối API: {error}
        </div>
      )}
      <DocumentsClient
        initialDocuments={documents}
        knowledgeBaseId={kb?.id ?? ""}
      />
    </div>
  );
}
