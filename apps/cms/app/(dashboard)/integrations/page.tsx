import { serverFetch } from "@/lib/auth";
import { IntegrationsClient } from "./integrations-client";

export interface ChannelIntegration {
  id: string;
  channel: "WEBSITE" | "MESSENGER" | "ZALO" | "SLACK";
  name: string;
  isActive: boolean;
  webhookSecret: string | null;
  createdAt: string;
  updatedAt: string;
  knowledgeBaseId: string;
  knowledgeBase?: { name: string };
}

export default async function IntegrationsPage() {
  let integrations: ChannelIntegration[] = [];

  try {
    integrations = await serverFetch<ChannelIntegration[]>("/cms/integrations");
  } catch {
    // render client với data rỗng, lỗi hiển thị ở client
  }

  return (
    <div className="p-6 ">
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight">
          Tích hợp kênh
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Kết nối chatbot với các nền tảng nhắn tin. Bấm vào kênh để cấu hình.
        </p>
      </div>
      <IntegrationsClient initialData={integrations} />
    </div>
  );
}
