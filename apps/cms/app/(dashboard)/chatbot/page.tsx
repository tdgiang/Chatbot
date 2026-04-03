import { serverFetch } from "@/lib/auth";
import { ChatbotConfigClient } from "./chatbot-config-client";

interface KnowledgeBase {
  id: string;
  name: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export default async function ChatbotPage() {
  let kb: KnowledgeBase | null = null;
  let error: string | null = null;

  try {
    kb = await serverFetch<KnowledgeBase>("/cms/knowledge-base");
  } catch (e) {
    error = String(e);
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Cấu hình Chatbot</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tùy chỉnh system prompt, nhiệt độ và giới hạn token
        </p>
      </div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          Lỗi kết nối API: {error}
        </div>
      )}
      <ChatbotConfigClient initialConfig={kb} />
    </div>
  );
}
