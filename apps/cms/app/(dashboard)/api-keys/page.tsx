import { serverFetch } from "@/lib/auth";
import { ApiKeysClient } from "./api-keys-client";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  isActive: boolean;
  allowedOrigins: string[];
  rateLimit: number;
  lastUsedAt: string | null;
  createdAt: string;
  knowledgeBaseId: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
}

export default async function ApiKeysPage() {
  let apiKeys: ApiKey[] = [];
  let kb: KnowledgeBase | null = null;
  let error: string | null = null;

  try {
    [apiKeys, kb] = await Promise.all([
      serverFetch<ApiKey[]>("/cms/api-keys"),
      serverFetch<KnowledgeBase>("/cms/knowledge-base"),
    ]);
  } catch (e) {
    error = String(e);
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
        <p className="text-sm text-gray-500 mt-1">
          Quản lý API keys cho phép website nhúng chatbot
        </p>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Lỗi kết nối API: {error}
        </div>
      )}
      <ApiKeysClient initialKeys={apiKeys} knowledgeBaseId={kb?.id ?? ""} />
    </div>
  );
}
