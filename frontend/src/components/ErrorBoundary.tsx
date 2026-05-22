"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

/* ===== ค่าคงที่สำหรับข้อความแสดงผล ===== */
const ERROR_TITLE = "เกิดข้อผิดพลาดในการแสดงผล";
const ERROR_DESCRIPTION = "ระบบพบปัญหาที่ไม่คาดคิด กรุณาลองรีเฟรชหน้าเว็บอีกครั้ง";
const RETRY_BUTTON_TEXT = "ลองใหม่";
const HOME_BUTTON_TEXT = "กลับหน้าหลัก";

/* ===== Props & State Interface ===== */
interface ErrorBoundaryProps {
  children: ReactNode;
  /** ข้อความ fallback ที่แสดงเมื่อเกิด error (ถ้าไม่ระบุจะใช้ค่าเริ่มต้น) */
  fallback_message?: string;
}

interface ErrorBoundaryState {
  has_error: boolean;
  error_message: string;
}

/**
 * ErrorBoundary Component
 * จับ Error ที่เกิดขึ้นในระดับ Component Tree เพื่อป้องกันไม่ให้ทั้งหน้าขาว
 * แสดง UI fallback พร้อมปุ่ม Retry และกลับหน้าหลัก
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      has_error: false,
      error_message: "",
    };
  }

  /* จับ Error จาก React Rendering Phase */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      has_error: true,
      error_message: error.message || "Unknown error occurred",
    };
  }

  /* บันทึก Error ลง Console สำหรับ Debug */
  componentDidCatch(error: Error, error_info: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", error_info.componentStack);
  }

  /* รีเซ็ต Error State เพื่อลองแสดงผลใหม่ */
  HandleRetry = (): void => {
    this.setState({ has_error: false, error_message: "" });
  };

  /* นำผู้ใช้กลับหน้าหลัก */
  HandleGoHome = (): void => {
    window.location.href = "/";
  };

  render() {
    if (this.state.has_error) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            {/* ไอคอน Error */}
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            {/* ข้อความ Error */}
            <h2 className="text-xl font-bold text-[var(--color-black)] mb-2 tracking-tight">
              {ERROR_TITLE}
            </h2>
            <p className="text-sm text-[var(--color-gray-500)] mb-6 leading-relaxed">
              {this.props.fallback_message || ERROR_DESCRIPTION}
            </p>

            {/* ข้อมูล Debug (แสดงเฉพาะ Development) */}
            {process.env.NODE_ENV === "development" && this.state.error_message && (
              <details className="mb-6 text-left">
                <summary className="text-xs text-[var(--color-gray-400)] cursor-pointer hover:text-[var(--color-gray-600)] transition-colors">
                  รายละเอียด Error (Development Only)
                </summary>
                <pre className="mt-2 p-3 bg-[var(--color-gray-50)] rounded-xl text-xs text-red-600 overflow-auto max-h-32 border border-[var(--color-gray-200)]">
                  {this.state.error_message}
                </pre>
              </details>
            )}

            {/* ปุ่มดำเนินการ */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.HandleRetry}
                className="px-6 py-2.5 bg-[var(--color-primary)] text-white text-sm font-bold rounded-xl
                           transition-all duration-200
                           shadow-[0_4px_0_0_rgba(100,90,240,1)]
                           hover:shadow-[0_6px_0_0_rgba(100,90,240,1)]
                           hover:-translate-y-0.5
                           active:translate-y-1 active:shadow-none"
              >
                {RETRY_BUTTON_TEXT}
              </button>
              <button
                onClick={this.HandleGoHome}
                className="px-6 py-2.5 bg-white text-[var(--color-gray-600)] text-sm font-medium rounded-xl
                           border border-[var(--color-gray-200)]
                           hover:bg-[var(--color-gray-50)] transition-all duration-200"
              >
                {HOME_BUTTON_TEXT}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
