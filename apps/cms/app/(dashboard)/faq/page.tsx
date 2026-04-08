import { serverFetch } from "@/lib/auth";
import { FaqClient } from "./faq-client";

interface FaqDto {
  id: string;
  knowledgeBaseId: string;
  question: string;
  answer: string;
  isActive: boolean;
  priority: number;
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

interface FaqListResponse {
  data: FaqDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface KnowledgeBase {
  id: string;
  name: string;
}

async function getData() {
  try {
    const [kb, faqs] = await Promise.all([
      serverFetch<KnowledgeBase>("/cms/knowledge-base"),
      serverFetch<FaqListResponse>("/cms/faq?page=1&limit=20"),
    ]);
    return { kb, faqs, error: null };
  } catch (e) {
    return { kb: null, faqs: null, error: String(e) };
  }
}

export default async function FaqPage() {
  const { kb, faqs, error } = await getData();

  return (
    <div className="p-6">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Lỗi kết nối API: {error}
        </div>
      )}
      <FaqClient
        knowledgeBaseId={kb?.id ?? ""}
        initialData={faqs ?? { data: [], total: 0, page: 1, limit: 20, totalPages: 0 }}
      />
    </div>
  );
}
