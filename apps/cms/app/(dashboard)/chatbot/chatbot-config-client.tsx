"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";

interface KnowledgeBase {
  id: string;
  name: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

export function ChatbotConfigClient({
  initialConfig,
}: {
  initialConfig: KnowledgeBase | null;
}) {
  const [systemPrompt, setSystemPrompt] = useState(
    initialConfig?.systemPrompt ??
      "Bạn là trợ lý AI hỗ trợ khách hàng. Trả lời bằng tiếng Việt, ngắn gọn và chính xác."
  );
  const [temperature, setTemperature] = useState(initialConfig?.temperature ?? 0.3);
  const [maxTokens, setMaxTokens] = useState(initialConfig?.maxTokens ?? 512);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.patch("/cms/knowledge-base", {
        systemPrompt,
        temperature,
        maxTokens,
      });
      toast({ title: "Đã lưu cấu hình", description: "Thay đổi có hiệu lực ngay lập tức." });
    } catch {
      toast({
        title: "Lưu thất bại",
        description: "Có lỗi khi cập nhật cấu hình.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {initialConfig?.name ?? "Knowledge Base"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              placeholder="Bạn là trợ lý AI..."
            />
            <p className="text-xs text-gray-500">
              Hướng dẫn hành vi cho chatbot. Nên viết bằng tiếng Việt.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Nhiệt độ (Temperature)</Label>
              <span className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                {temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.1}
              value={[temperature]}
              onValueChange={([val]) => setTemperature(val)}
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Chính xác (0.0)</span>
              <span>Sáng tạo (1.0)</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              min={64}
              max={4096}
              step={64}
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-32"
            />
            <p className="text-xs text-gray-500">
              Giới hạn độ dài phản hồi (64 – 4096 tokens)
            </p>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
