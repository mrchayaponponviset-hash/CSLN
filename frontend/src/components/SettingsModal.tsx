"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useUsage } from "@/contexts/UsageContext";
import { apiService } from "@/services/api";

// Types
interface ModelInfo {
  id: string;
  label: string;
  tier: "free" | "premium";
  description: string;
  requires_byok: boolean;
  locked: boolean;
}

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "free-chat",
    label: "GPT OSS 120B (Free)",
    tier: "free",
    description: "โมเดลฟรีสำหรับแชทและถามตอบทั่วไป",
    requires_byok: false,
    locked: false,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    tier: "premium",
    description: "โมเดลระดับสูงจาก OpenAI — ฉลาดและเร็ว",
    requires_byok: true,
    locked: true,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    tier: "premium",
    description: "GPT-4o ขนาดเล็ก — ประหยัดกว่าแต่ยังฉลาด",
    requires_byok: true,
    locked: true,
  },
  {
    id: "claude-sonnet",
    label: "Claude Sonnet 4",
    tier: "premium",
    description: "โมเดลจาก Anthropic — เก่งเรื่องการวิเคราะห์",
    requires_byok: true,
    locked: true,
  },
  {
    id: "gemini-pro",
    label: "Gemini 2.5 Pro",
    tier: "premium",
    description: "โมเดลจาก Google — รองรับ context ยาวมาก",
    requires_byok: true,
    locked: true,
  }
];

interface ByokStatus {
  has_key: boolean;
  masked_key: string | null;
  is_verified: boolean;
  active_model: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user } = useAuth();
  const { refreshUsage } = useUsage();

  // State
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [status, setStatus] = useState<ByokStatus>({
    has_key: false,
    masked_key: null,
    is_verified: false,
    active_model: "free-chat",
  });
  const [models, setModels] = useState<ModelInfo[]>(DEFAULT_MODELS);
  const [activeModel, setActiveModel] = useState("free-chat");
  const [loading, setLoading] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);

  // Fetch status & models on open
  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [statusRes, modelsRes] = await Promise.all([
        apiService.getByokStatus(user.uid),
        apiService.getByokModels(user.uid),
      ]);
      setStatus(statusRes);
      setModels(modelsRes.models || []);
      setActiveModel(modelsRes.active_model || "free-chat");
    } catch {
      /* ignore */
    }
    setLoading(false);
    setIsFirstLoad(false);
  }, [user?.uid]);

  useEffect(() => {
    if (isOpen && user?.uid) fetchData();
  }, [isOpen, user?.uid, fetchData]);

  // Clear message after 5s
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [message]);

  // Handlers
  const handleVerifyAndSave = async () => {
    if (!user?.uid || !apiKeyInput.trim()) return;
    const key = apiKeyInput.trim();

    // Step 1: Verify
    setVerifying(true);
    setMessage(null);
    const verifyRes = await apiService.verifyByokKey(key);
    setVerifying(false);

    if (!verifyRes.valid) {
      setMessage({ type: "error", text: verifyRes.message });
      return;
    }

    // Step 2: Save (encrypted)
    setSaving(true);
    const saveRes = await apiService.saveByokKey(user.uid, key);
    setSaving(false);

    if (!saveRes.success) {
      setMessage({
        type: "error",
        text: saveRes.error || "ไม่สามารถบันทึก Key ได้",
      });
      return;
    }

    setMessage({ type: "success", text: "✓ API Key ยืนยันและบันทึกสำเร็จ!" });
    setApiKeyInput("");
    await fetchData();
    await refreshUsage();
  };

  const handleRemoveKey = async () => {
    if (!user?.uid) return;
    setRemoving(true);
    await apiService.removeByokKey(user.uid);
    setRemoving(false);
    setShowConfirmRemove(false);
    setMessage({ type: "info", text: "ลบ API Key เรียบร้อยแล้ว" });
    await fetchData();
    await refreshUsage();
  };

  const handleSelectModel = async (modelId: string) => {
    if (!user?.uid) return;
    const model = models.find((m) => m.id === modelId);
    if (model?.locked) {
      setMessage({
        type: "error",
        text: "ต้องเพิ่ม API Key ก่อนถึงจะใช้ Premium Model ได้",
      });
      // เลื่อนโฟกัสไปที่ช่องกรอก API Key
      document.getElementById("api-key-input")?.focus();
      return;
    }
    setActiveModel(modelId);
    const res = await apiService.setByokModel(user.uid, modelId);
    if (!res.success) {
      setMessage({
        type: "error",
        text: res.error || "ไม่สามารถเปลี่ยน Model ได้",
      });
      await fetchData();
    } else {
      await refreshUsage();
    }
  };

  if (!isOpen) return null;

  const isProcessing = verifying || saving || removing;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#FAFAFA] w-full max-w-lg rounded-[2rem] shadow-2xl z-10 animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B1B2FF] to-[#9293FF] flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[var(--color-black)]">
                  Settings
                </h2>
                <p className="text-xs font-medium text-[var(--color-gray-400)]">
                  API Key & Model Configuration
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-black/5 hover:bg-black/10 transition-colors text-gray-500"
            >
              <svg className="w-4 h-4" fill="none" strokeWidth="2.5" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — Scrollable */}
        <div className="px-8 py-6 max-h-[65vh] overflow-y-auto premium-scrollbar space-y-6">
          {/* === Section 1: API Key Management === */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-bold text-[var(--color-black)] tracking-tight">
                OpenRouter API Key
              </h3>
              {!isFirstLoad && status.has_key && status.is_verified && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 tracking-wide">
                  VERIFIED
                </span>
              )}
              {loading && !isFirstLoad && (
                <div className="w-3 h-3 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin ml-2" />
              )}
            </div>

            {isFirstLoad ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3 h-[116px] flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : status.has_key ? (
                  /* Key is already saved */
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-[var(--color-gray-400)] mb-1">
                          Current Key
                        </p>
                        <p className="text-sm font-mono font-semibold text-[var(--color-black)]">
                          {status.masked_key || "***"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowConfirmRemove(!showConfirmRemove)}
                          className="px-3 py-1.5 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors"
                        >
                          {showConfirmRemove ? "Cancel" : "Remove"}
                        </button>
                      </div>
                    </div>

                    {showConfirmRemove && (
                      <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                        <p className="text-xs text-red-600 mb-2 font-medium">
                          ลบ API Key จะทำให้ไม่สามารถใช้ Premium Models ได้ ยืนยันหรือไม่?
                        </p>
                        <button
                          onClick={handleRemoveKey}
                          disabled={removing}
                          className="px-4 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50"
                        >
                          {removing ? "กำลังลบ..." : "ยืนยันลบ"}
                        </button>
                      </div>
                    )}

                    {/* Replace key */}
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-medium text-[var(--color-gray-400)] mb-2">
                        เปลี่ยน Key ใหม่
                      </p>
                      <div className="flex gap-2">
                        <input
                          id="api-key-input"
                          type="password"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          placeholder="sk-or-v1-..."
                          className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent font-mono"
                        />
                        <button
                          onClick={handleVerifyAndSave}
                          disabled={isProcessing || !apiKeyInput.trim()}
                          className="px-4 py-2 text-xs font-bold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {verifying
                            ? "Verifying..."
                            : saving
                            ? "Saving..."
                            : "Update"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* No key yet */
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                    <p className="text-xs text-[var(--color-gray-500)] leading-relaxed">
                      เพิ่ม OpenRouter API Key เพื่อปลดล็อก Premium AI Models
                      เช่น GPT-4o, Claude Sonnet ดูรายละเอียดที่{" "}
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-primary)] underline hover:opacity-80"
                      >
                        openrouter.ai/keys
                      </a>
                    </p>
                    <div className="flex gap-2">
                      <input
                        id="api-key-input"
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="sk-or-v1-..."
                        className="flex-1 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent font-mono"
                      />
                      <button
                        onClick={handleVerifyAndSave}
                        disabled={isProcessing || !apiKeyInput.trim()}
                        className="px-5 py-2.5 text-sm font-bold text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] rounded-xl transition-all disabled:opacity-50 shadow-[0_3px_0_0_rgba(100,90,240,1)] hover:shadow-[0_4px_0_0_rgba(100,90,240,1)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none whitespace-nowrap"
                      >
                        {verifying
                          ? "Verifying..."
                          : saving
                          ? "Saving..."
                          : "Verify & Save"}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* === Section 2: Model Selector === */}
              <section>
                <h3 className="text-sm font-bold text-[var(--color-black)] tracking-tight mb-3">
                  AI Model
                </h3>
                <div className="space-y-2">
                  {models.map((m) => {
                    const isActive = activeModel === m.id;
                    const isLocked = m.locked;

                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectModel(m.id)}
                        disabled={isFirstLoad || isProcessing}
                        className={`w-full text-left px-4 py-3 rounded-2xl border transition-all group ${
                          isActive
                            ? "border-[var(--color-primary)] bg-[#B1B2FF]/10 shadow-sm"
                            : isLocked
                            ? "border-gray-200 bg-gray-50 opacity-70 hover:border-red-200 hover:bg-red-50/50"
                            : "border-gray-200 bg-white hover:border-[var(--color-primary)] hover:bg-[#B1B2FF]/5"
                        } disabled:opacity-70 disabled:cursor-wait`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Radio indicator */}
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                                isActive
                                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                                  : "border-gray-300"
                              }`}
                            >
                              {isActive && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-[var(--color-black)]">
                                  {m.label}
                                </span>
                                {/* Badge */}
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md tracking-wider ${
                                    m.tier === "premium"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  {m.tier === "premium" ? "PREMIUM" : "FREE"}
                                </span>
                                {isLocked && (
                                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                  </svg>
                                )}
                              </div>
                              <p className="text-[11px] text-[var(--color-gray-400)] mt-0.5">
                                {m.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* === Warning for Premium === */}
              {status.has_key && activeModel !== "free-chat" && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                    การใช้ Premium Models อาจมีค่าใช้จ่ายเกิดขึ้นบนบัญชี OpenRouter ของคุณ
                  </p>
                </div>
              )}
          {/* === Status Message === */}
          {message && (
            <div
              className={`rounded-2xl px-4 py-3 text-xs font-semibold transition-all ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : message.type === "error"
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-blue-50 text-blue-600 border border-blue-200"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 bg-white/50">
          <p className="text-[11px] text-center text-[var(--color-gray-400)] font-medium">
            API Key จะถูกเข้ารหัสก่อนบันทึกลงเซิร์ฟเวอร์ — ไม่มีการเก็บแบบ Plain Text
          </p>
        </div>
      </div>
    </div>
  );
}
