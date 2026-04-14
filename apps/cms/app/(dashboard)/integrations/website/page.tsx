"use client";

import { useState } from "react";
import { Check, Copy, ChevronLeft, Globe, Shield, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function WebsiteEmbedPage() {
  const [apiKey, setApiKey]               = useState("");
  const [title, setTitle]                 = useState("Hỗ trợ trực tuyến");
  const [primaryColor, setPrimaryColor]   = useState("#2563eb");
  const [position, setPosition]           = useState<"bottom-right" | "bottom-left">("bottom-right");
  const [welcomeMessage, setWelcomeMessage] = useState("Xin chào! Tôi có thể giúp gì cho bạn?");
  const [copied, setCopied]               = useState(false);

  const snippet = `<script>
  window.ChatbotConfig = {
    apiKey: "${apiKey || "sk-your-api-key-here"}",
    apiUrl: "${API_URL}",
    title: "${title}",
    primaryColor: "${primaryColor}",
    position: "${position}",
    welcomeMessage: "${welcomeMessage}"
  };
</script>
<script src="${API_URL}/widget/chatbot.js" async></script>`;

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 max-w-4xl">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <Link
          href="/integrations"
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors mb-3"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Tích hợp kênh
        </Link>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
            <Globe className="h-4.5 w-4.5 text-emerald-600" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 tracking-tight">Website Widget</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Nhúng chatbot vào website chỉ với 2 dòng code
            </p>
          </div>
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Left: Config panel */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">

            {/* API Key */}
            <div className="p-4 space-y-1.5">
              <Label className="text-xs font-medium text-gray-700">
                API Key <span className="text-red-500">*</span>
              </Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-gray-400">
                Lấy từ trang{" "}
                <Link href="/api-keys" className="text-blue-600 hover:underline">
                  API Keys
                </Link>
              </p>
            </div>

            {/* Title */}
            <div className="p-4 space-y-1.5">
              <Label className="text-xs font-medium text-gray-700">Tiêu đề chat box</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
            </div>

            {/* Welcome message */}
            <div className="p-4 space-y-1.5">
              <Label className="text-xs font-medium text-gray-700">Lời chào đầu tiên</Label>
              <Input
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Color */}
            <div className="p-4 space-y-1.5">
              <Label className="text-xs font-medium text-gray-700">Màu chủ đạo</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer p-0.5 bg-white"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="font-mono text-sm w-28"
                  maxLength={7}
                />
                <div
                  className="h-9 w-9 rounded-lg border border-gray-200 shrink-0"
                  style={{ background: primaryColor }}
                />
              </div>
            </div>

            {/* Position */}
            <div className="p-4 space-y-1.5">
              <Label className="text-xs font-medium text-gray-700">Vị trí nút chat</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["bottom-right", "bottom-left"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPosition(p)}
                    className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                      position === p
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {p === "bottom-right" ? "↘ Góc phải" : "↙ Góc trái"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Snippet + instructions */}
        <div className="space-y-4">

          {/* Code snippet */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Code2 className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs text-gray-400 font-mono">HTML</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs text-gray-300 hover:text-white hover:bg-gray-700 gap-1"
                onClick={copySnippet}
              >
                {copied ? (
                  <><Check className="h-3 w-3 text-emerald-400" /> Đã copy</>
                ) : (
                  <><Copy className="h-3 w-3" /> Copy</>
                )}
              </Button>
            </div>
            <pre className="bg-gray-950 text-gray-300 p-4 text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
              <code>{snippet}</code>
            </pre>
          </div>

          {/* How to embed */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Hướng dẫn nhúng
            </p>
            <ol className="space-y-2">
              {[
                "Sao chép đoạn code phía trên",
                <>Dán vào trước thẻ <code className="bg-gray-100 text-gray-700 px-1 rounded text-[10px]">&lt;/body&gt;</code> của trang HTML</>,
                "Widget sẽ xuất hiện ngay tại góc dưới trang",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-gray-600">
                  <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Security note */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <p className="text-xs font-semibold text-amber-800">Bảo mật API Key</p>
            </div>
            <ul className="space-y-1.5 text-xs text-amber-700">
              <li className="flex items-start gap-1.5">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                Thêm domain website vào <strong>Allowed Origins</strong> của API Key để chặn request từ domain lạ
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                Mỗi website nên dùng API Key riêng để dễ thu hồi khi cần
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
