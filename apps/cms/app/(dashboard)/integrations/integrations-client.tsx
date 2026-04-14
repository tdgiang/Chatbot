"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  Trash2,
  X,
  ExternalLink,
  Link2,
  Link2Off,
} from "lucide-react";
import type { ChannelIntegration } from "./page";

// ─── Channel catalogue ────────────────────────────────────────────────────────

type ChannelKey = "WEBSITE" | "MESSENGER" | "ZALO" | "SLACK";

interface ChannelDef {
  key: ChannelKey;
  label: string;
  tagline: string;
  accent: string; // hex for dynamic styles
  iconBg: string; // tailwind class
  iconFg: string; // tailwind class
  fields: {
    key: string;
    label: string;
    placeholder: string;
    hint?: string;
    sensitive?: boolean;
  }[];
}

const CHANNELS: ChannelDef[] = [
  {
    key: "WEBSITE",
    label: "Website Widget",
    tagline: "Nhúng floating chatbot qua thẻ <script>",
    accent: "#059669",
    iconBg: "bg-emerald-100",
    iconFg: "text-emerald-700",
    fields: [],
  },
  {
    key: "MESSENGER",
    label: "Facebook Messenger",
    tagline: "Trả lời tự động trong Messenger của Facebook Page",
    accent: "#0866ff",
    iconBg: "bg-blue-100",
    iconFg: "text-blue-700",
    fields: [
      {
        key: "pageId",
        label: "Page ID",
        placeholder: "123456789",
        hint: "Numeric ID của Facebook Page",
      },
      {
        key: "pageAccessToken",
        label: "Page Access Token",
        placeholder: "EAABsbCS…",
        hint: "Token dài hạn từ Meta for Developers",
        sensitive: true,
      },
      {
        key: "appSecret",
        label: "App Secret",
        placeholder: "abc123…",
        hint: "Dùng để xác thực chữ ký webhook",
        sensitive: true,
      },
      {
        key: "verifyToken",
        label: "Verify Token",
        placeholder: "my-verify-token",
        hint: "Chuỗi bạn tự đặt khi cài đặt webhook",
      },
    ],
  },
  {
    key: "ZALO",
    label: "Zalo Official Account",
    tagline: "Trả lời tự động trong Zalo OA",
    accent: "#0068ff",
    iconBg: "bg-sky-100",
    iconFg: "text-sky-700",
    fields: [
      {
        key: "oaId",
        label: "OA ID",
        placeholder: "1234567890",
        hint: "ID của Zalo Official Account",
      },
      {
        key: "accessToken",
        label: "Access Token",
        placeholder: "eXlBbG…",
        hint: "Hết hạn ~3 tháng, nhớ renew định kỳ",
        sensitive: true,
      },
      {
        key: "secretKey",
        label: "Secret Key",
        placeholder: "zalo-secret-key",
        hint: "Dùng để verify MAC signature",
        sensitive: true,
      },
    ],
  },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function webhookUrl(integration: ChannelIntegration) {
  return `${API_BASE}/webhooks/${integration.channel.toLowerCase()}/${integration.id}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntegrationsClient({
  initialData,
}: {
  initialData: ChannelIntegration[];
}) {
  const [integrations, setIntegrations] = useState(initialData);
  const [activeChannel, setActiveChannel] = useState<ChannelKey | null>(null);

  // derived: lookup integration by channel key
  const byChannel = Object.fromEntries(
    integrations.map((i) => [i.channel, i]),
  ) as Partial<Record<ChannelKey, ChannelIntegration>>;

  function openModal(key: ChannelKey) {
    setActiveChannel(key);
  }
  function closeModal() {
    setActiveChannel(null);
  }

  async function handleToggle(
    integration: ChannelIntegration,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    try {
      const res = await apiClient.patch<ChannelIntegration>(
        `/cms/integrations/${integration.id}`,
        { isActive: !integration.isActive },
      );
      setIntegrations((prev) =>
        prev.map((i) => (i.id === integration.id ? res.data : i)),
      );
    } catch {
      toast({ title: "Không thể cập nhật trạng thái", variant: "destructive" });
    }
  }

  function onSaved(updated: ChannelIntegration, isNew: boolean) {
    setIntegrations((prev) =>
      isNew
        ? [updated, ...prev]
        : prev.map((i) => (i.id === updated.id ? updated : i)),
    );
  }

  function onDeleted(id: string) {
    setIntegrations((prev) => prev.filter((i) => i.id !== id));
    closeModal();
  }

  const activeDef = CHANNELS.find((c) => c.key === activeChannel);
  const activeIntegration = activeChannel
    ? byChannel[activeChannel]
    : undefined;

  return (
    <>
      {/* ── Channel grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CHANNELS.map((ch) => {
          const integration = byChannel[ch.key];
          const connected = !!integration;
          const active = connected && integration.isActive;

          return (
            <button
              key={ch.key}
              onClick={() => openModal(ch.key)}
              className="group relative text-left rounded-2xl border bg-white p-5 transition-all duration-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                borderColor: connected ? `${ch.accent}40` : "#e5e7eb",
                // @ts-expect-error CSS variable
                "--tw-ring-color": ch.accent,
                boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.06)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow =
                  `0 8px 24px 0 ${ch.accent}20, 0 2px 6px 0 rgb(0 0 0 / 0.06)`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 1px 3px 0 rgb(0 0 0 / 0.06)";
              }}
            >
              {/* Top row: icon + toggle */}
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${ch.iconBg}`}
                >
                  <ChannelIcon
                    channelKey={ch.key}
                    className={`w-6 h-6 ${ch.iconFg}`}
                  />
                </div>

                {/* Toggle — only shown when connected */}
                {connected && (
                  <Toggle
                    checked={active}
                    accentColor={ch.accent}
                    onClick={(e) => handleToggle(integration, e)}
                  />
                )}

                {/* "Not connected" indicator */}
                {!connected && (
                  <span className="text-[11px] font-medium text-gray-400 border border-gray-200 rounded-full px-2.5 py-1">
                    Chưa kết nối
                  </span>
                )}
              </div>

              {/* Channel info */}
              <p className="text-sm font-semibold text-gray-900 leading-tight">
                {ch.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                {ch.tagline}
              </p>

              {/* Connection status */}
              <div className="mt-4 pt-3.5 border-t border-gray-100">
                {connected ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: active ? ch.accent : "#d1d5db" }}
                    />
                    <span className="text-xs text-gray-600 truncate font-medium">
                      {integration.name}
                    </span>
                    {active && (
                      <span
                        className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                        style={{
                          background: `${ch.accent}15`,
                          color: ch.accent,
                        }}
                      >
                        Bật
                      </span>
                    )}
                    {!active && (
                      <span className="ml-auto text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-md shrink-0">
                        Tắt
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Link2 className="w-3.5 h-3.5" />
                    Bấm để kết nối
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Modal ────────────────────────────────────────────────── */}
      {activeChannel && activeDef && (
        <ChannelModal
          def={activeDef}
          integration={activeIntegration}
          onClose={closeModal}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  accentColor,
  onClick,
}: {
  checked: boolean;
  accentColor: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      title={checked ? "Tắt kênh" : "Bật kênh"}
      className="relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{ background: checked ? accentColor : "#d1d5db" }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: checked ? "translateX(22px)" : "translateX(3px)" }}
      />
    </button>
  );
}

// ─── Channel icon SVGs ────────────────────────────────────────────────────────

function ChannelIcon({
  channelKey,
  className,
}: {
  channelKey: ChannelKey;
  className?: string;
}) {
  if (channelKey === "WEBSITE")
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  if (channelKey === "MESSENGER")
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.145 2 11.259c0 2.821 1.323 5.341 3.405 7.025V22l3.104-1.705A10.96 10.96 0 0 0 12 20.518c5.523 0 10-4.145 10-9.259C22 6.145 17.523 2 12 2zm1.002 12.457L10.636 12 5.997 14.457l5.117-5.44 2.375 2.457 4.63-2.457-5.117 5.44z" />
      </svg>
    );
  if (channelKey === "ZALO")
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2.5-9.5L7 13l4.5-1.5L13 16l-1.5-4.5L16 10l-4.5 1.5L10 7l-.5 3.5z" />
      </svg>
    );
  // SLACK
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

// ─── Channel Modal ────────────────────────────────────────────────────────────

function ChannelModal({
  def,
  integration,
  onClose,
  onSaved,
  onDeleted,
}: {
  def: ChannelDef;
  integration: ChannelIntegration | undefined;
  onClose: () => void;
  onSaved: (updated: ChannelIntegration, isNew: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const isConnected = !!integration;

  // form state
  const [name, setName] = useState(integration?.name ?? "");
  const [knowledgeBaseId, setKnowledgeBaseId] = useState(
    integration?.knowledgeBaseId ?? "",
  );
  const [configFields, setConfigFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Website channel: no form, just snippet info
  const isWebsite = def.key === "WEBSITE";

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Vui lòng nhập tên kết nối", variant: "destructive" });
      return;
    }
    if (!isConnected && !knowledgeBaseId.trim()) {
      toast({
        title: "Vui lòng nhập Knowledge Base ID",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (isConnected) {
        const res = await apiClient.patch<ChannelIntegration>(
          `/cms/integrations/${integration.id}`,
          {
            name,
            ...(Object.keys(configFields).length > 0 && {
              config: configFields,
            }),
          },
        );
        onSaved(res.data, false);
        toast({ title: "Đã cập nhật" });
      } else {
        const res = await apiClient.post<ChannelIntegration>(
          "/cms/integrations",
          {
            channel: def.key,
            name,
            knowledgeBaseId,
            config: configFields,
          },
        );
        onSaved(res.data, true);
        toast({ title: `Đã kết nối ${def.label}` });
      }
      onClose();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Có lỗi xảy ra";
      toast({ title: "Lỗi", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!integration) return;
    if (!confirm(`Ngắt kết nối ${def.label}? Webhook sẽ ngừng hoạt động.`))
      return;
    setDeleting(true);
    try {
      await apiClient.delete(`/cms/integrations/${integration.id}`);
      onDeleted(integration.id);
      toast({ title: "Đã ngắt kết nối" });
    } catch {
      toast({ title: "Không thể xoá", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  async function copyWebhook() {
    if (!integration) return;
    await navigator.clipboard.writeText(webhookUrl(integration));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(2px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Colored top bar */}
        <div className="h-1 w-full" style={{ background: def.accent }} />

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${def.iconBg}`}
            >
              <ChannelIcon
                channelKey={def.key}
                className={`w-5 h-5 ${def.iconFg}`}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{def.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isConnected ? (
                  <span className="flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full inline-block"
                      style={{
                        background: integration.isActive
                          ? def.accent
                          : "#9ca3af",
                      }}
                    />
                    {integration.isActive ? "Đang hoạt động" : "Đã tắt"}
                  </span>
                ) : (
                  "Chưa kết nối"
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* WEBSITE channel: just show guide */}
          {isWebsite && <WebsiteModalBody />}

          {/* Non-website channels */}
          {!isWebsite && (
            <>
              {/* Webhook URL (connected only) */}
              {isConnected && integration && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    Webhook URL
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] font-mono text-gray-700 truncate">
                      {webhookUrl(integration)}
                    </code>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={copyWebhook}
                        className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                        title="Copy"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-500" />
                        )}
                      </button>
                      <a
                        href={webhookUrl(integration)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                        title="Open"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">
                  Tên kết nối
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`VD: ${def.label} chính`}
                  className="text-sm"
                />
              </div>

              {/* KB ID (create only) */}
              {!isConnected && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">
                    Knowledge Base ID
                  </Label>
                  <Input
                    value={knowledgeBaseId}
                    onChange={(e) => setKnowledgeBaseId(e.target.value)}
                    placeholder="Lấy từ URL trang Chatbot config"
                    className="text-sm font-mono"
                  />
                </div>
              )}

              {/* Config fields */}
              {def.fields.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Thông tin xác thực
                    {isConnected && (
                      <span className="ml-1 normal-case font-normal">
                        (để trống nếu không đổi)
                      </span>
                    )}
                  </p>
                  {def.fields.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs text-gray-600">{f.label}</Label>
                      <Input
                        type={f.sensitive ? "password" : "text"}
                        value={configFields[f.key] ?? ""}
                        onChange={(e) =>
                          setConfigFields((prev) => ({
                            ...prev,
                            [f.key]: e.target.value,
                          }))
                        }
                        placeholder={isConnected ? "••••••••" : f.placeholder}
                        autoComplete="off"
                        className="text-sm font-mono"
                      />
                      {f.hint && (
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                          {f.hint}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Post-connect note */}
              {!isConnected && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-xs text-amber-800 leading-relaxed">
                  Sau khi kết nối, copy <strong>Webhook URL</strong> và đăng ký
                  tại dashboard của {def.label}.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex items-center gap-2">
          {/* Disconnect (connected + non-website) */}
          {isConnected && !isWebsite && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
              ) : (
                <Link2Off className="w-3.5 h-3.5" />
              )}
              Ngắt kết nối
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {isWebsite ? "Đóng" : "Huỷ"}
          </button>

          {!isWebsite && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-60"
              style={{ background: saving ? "#9ca3af" : def.accent }}
            >
              {saving && (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/50 border-t-transparent animate-spin" />
              )}
              {isConnected ? (
                "Lưu thay đổi"
              ) : (
                <span className="flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" />
                  Kết nối
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Website modal body ───────────────────────────────────────────────────────

function WebsiteModalBody() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 leading-relaxed">
        Website Widget hoạt động qua API Key — không cần cấu hình thêm ở đây.
      </p>

      <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-100">
        {[
          { step: "1", text: "Tạo API Key tại trang API Keys" },
          { step: "2", text: "Vào trang Embed để lấy mã nhúng" },
          { step: "3", text: "Dán code vào trước </body> của website" },
        ].map(({ step, text }) => (
          <div key={step} className="flex items-center gap-3 px-4 py-3">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center shrink-0">
              {step}
            </span>
            <span className="text-xs text-gray-700">{text}</span>
          </div>
        ))}
      </div>

      <a
        href="/integrations/website"
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-emerald-200 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Mở trang lấy mã nhúng
      </a>
    </div>
  );
}
