"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { Copy, Plus, Ban } from "lucide-react";

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

interface NewKeyResponse extends ApiKey {
  rawKey: string;
}

export function ApiKeysClient({
  initialKeys,
  knowledgeBaseId,
}: {
  initialKeys: ApiKey[];
  knowledgeBaseId: string;
}) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [name, setName] = useState("");
  const [allowedOrigins, setAllowedOrigins] = useState("");
  const [rateLimit, setRateLimit] = useState(100);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [showKeyDialog, setShowKeyDialog] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !knowledgeBaseId) return;
    setCreating(true);
    try {
      const res = await apiClient.post<NewKeyResponse>("/cms/api-keys", {
        name: name.trim(),
        knowledgeBaseId,
        allowedOrigins: allowedOrigins
          ? allowedOrigins.split(",").map((o) => o.trim()).filter(Boolean)
          : [],
        rateLimit,
      });
      const newKey = res.data;
      setKeys((prev) => [newKey, ...prev]);
      setNewRawKey(newKey.rawKey ?? newKey.key);
      setShowKeyDialog(true);
      setName("");
      setAllowedOrigins("");
      setRateLimit(100);
    } catch {
      toast({ title: "Lỗi", description: "Không thể tạo API key.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm("Revoke API key này? Các website đang dùng key này sẽ bị mất quyền truy cập.")) return;
    setRevokingId(keyId);
    try {
      await apiClient.patch(`/cms/api-keys/${keyId}/revoke`);
      setKeys((prev) =>
        prev.map((k) => (k.id === keyId ? { ...k, isActive: false } : k))
      );
      toast({ title: "Đã revoke API key" });
    } catch {
      toast({ title: "Lỗi", description: "Không thể revoke API key.", variant: "destructive" });
    } finally {
      setRevokingId(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Đã copy vào clipboard" });
    });
  }

  return (
    <div className="space-y-6">
      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Tạo API key mới
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tên key *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Website chính thức"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rateLimit">Rate limit (req/giờ)</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  min={1}
                  max={10000}
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="origins">Allowed Origins (phân cách bằng dấu phẩy)</Label>
              <Input
                id="origins"
                value={allowedOrigins}
                onChange={(e) => setAllowedOrigins(e.target.value)}
                placeholder="https://example.com, https://shop.example.com"
              />
              <p className="text-xs text-gray-500">Để trống = cho phép mọi origin</p>
            </div>
            <Button type="submit" disabled={creating || !knowledgeBaseId}>
              {creating ? "Đang tạo..." : "Tạo API key"}
            </Button>
            {!knowledgeBaseId && (
              <p className="text-xs text-red-500">Chưa cấu hình Knowledge Base</p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Keys table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Tên</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Trạng thái</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Rate limit</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Dùng lần cuối</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {keys.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Chưa có API key nào
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{key.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Tạo {new Date(key.createdAt).toLocaleDateString("vi-VN")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={key.isActive ? "success" : "secondary"}>
                      {key.isActive ? "Hoạt động" : "Đã revoke"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{key.rateLimit}/giờ</td>
                  <td className="px-4 py-3 text-gray-600">
                    {key.lastUsedAt
                      ? new Date(key.lastUsedAt).toLocaleDateString("vi-VN")
                      : "Chưa dùng"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {key.isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(key.id)}
                        disabled={revokingId === key.id}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* New key dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key đã được tạo</DialogTitle>
            <DialogDescription>
              Sao chép key này ngay bây giờ. Key sẽ không được hiển thị lại sau khi đóng hộp thoại này.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 border border-gray-200 rounded p-2 text-sm font-mono break-all">
                {newRawKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => newRawKey && copyToClipboard(newRawKey)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
              Lưu ý: Key này chỉ hiển thị một lần. Vui lòng lưu lại ở nơi an toàn.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowKeyDialog(false)}>Đã hiểu</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
