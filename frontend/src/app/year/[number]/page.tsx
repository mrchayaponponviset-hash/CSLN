'use client';

import { useState, useEffect } from 'react';
import Link from "next/link";
import { useParams } from 'next/navigation';
import courses_data from "@/data/courses.json";
import { AuthNavbar } from "@/components/AuthNavbar";
import { CourseRow } from "@/components/CourseRow";
import PdfEvaluator from "@/components/PdfEvaluator";

// ============================================================
// Type สำหรับข้อมูลผู้ใช้ (ดึง userId จาก Supabase Auth)
// ============================================================

/** ดึง userId จาก localStorage (Supabase Auth session) */
function GetUserId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    // Supabase Auth เก็บ session ใน localStorage
    const storage_keys = Object.keys(localStorage);
    const auth_key = storage_keys.find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (auth_key) {
      const raw = localStorage.getItem(auth_key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.user?.id || undefined;
      }
    }
  } catch {
    // ไม่มี session — ใช้ anonymous
  }
  return undefined;
}

// ============================================================
// YearPage — หน้ารายวิชาของแต่ละชั้นปี (Client Component)
// เปลี่ยนเป็น Client Component เพื่อรองรับ PdfEvaluator ที่ต้องใช้ state
// ============================================================

export default function YearPage() {
  const params = useParams();
  const number = params?.number as string;
  const year_number = parseInt(number || '0');

  // ดึง userId สำหรับ Token Quota tracking
  const [user_id, SetUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    SetUserId(GetUserId());
  }, []);

  /* ค้นหาข้อมูลชั้นปี */
  const year_data = courses_data?.years?.find((y) => y.year === year_number);

  // ถ้าไม่พบข้อมูลชั้นปี
  if (!year_data) {
    return (
      <main className="h-screen w-screen bg-transparent flex flex-col items-center justify-center">
        <AuthNavbar />
        <p className="text-[var(--color-gray-500)]">ไม่พบข้อมูลชั้นปีที่ {year_number}</p>
        <Link href="/#years" className="text-[var(--color-primary)] mt-4 hover:underline">กลับหน้าแรก</Link>
      </main>
    );
  }

  const total_chapters = year_data.courses.reduce((sum, c) => sum + c.chapters, 0);

  return (
    <main className="h-screen w-screen bg-transparent flex flex-col overflow-hidden">
      {/* ===== Auth Navbar (Client Component) ===== */}
      <div className="flex-shrink-0 z-50 relative">
        <AuthNavbar />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden relative bg-transparent">
        {/* ===== Header Area (Fixed) ===== */}
        <div className="w-full px-6 md:px-20 lg:px-40 pt-6 md:pt-12 shrink-0">
          {/* ===== Breadcrumb & Navigation ===== */}
          <div className="mb-4 md:mb-6 flex items-center gap-2 text-[12px] md:text-sm">
            <Link
              href="/#years"
              className="inline-flex items-center gap-1.5 text-[var(--color-gray-400)] hover:text-[var(--color-black)] transition-colors"
            >
              <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Home
            </Link>
            <span className="text-[var(--color-gray-300)]">/</span>
            <span className="font-medium text-[var(--color-gray-500)]">YEAR {year_data.year}</span>
          </div>

          {/* ===== Year Header ===== */}
          <div className="mb-4 md:mb-6 border-b border-[var(--color-gray-200)] pb-6 md:pb-8">
            <h1 className="text-4xl md:text-6xl font-black text-[var(--color-primary)] tracking-tighter mb-3 md:mb-4 flex items-center gap-3 md:gap-4.3">
              <span>YEAR</span>
              <span className="bg-[var(--color-primary)] text-white h-[2.0em] aspect-square flex items-center justify-center pr-1 rounded-lg md:rounded-xl leading-none text-[0.5em]">
                {year_data.year}
              </span>
            </h1>
            <p className="text-sm md:text-lg text-[var(--color-gray-500)] mb-4 md:mb-6 leading-relaxed max-w-2xl">
              {year_data.subtitle}
            </p>
            <div className="flex items-center gap-4 md:gap-6 text-[10px] md:text-xs font-mono uppercase tracking-widest text-[var(--color-gray-400)]">
              <span>{year_data.courses.length} courses</span>
              <span>{total_chapters} chapters</span>
            </div>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden p-2 md:p-4">
          {/* 🛡️ THE COVER TRICK: กล่องขาวบังลูกศร Scrollbar */}
          <div className="absolute top-0 right-0 w-8 h-6 bg-white z-50 pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-8 h-6 bg-white z-50 pointer-events-none" />

          <div className="h-full overflow-y-auto premium-scrollbar px-6 md:px-20 lg:px-40 pb-20 relative z-0">
            <div className="flex flex-col">
              {year_data.courses.map((course, idx) => {
                const indexNumber = (idx + 1).toString();

                return (
                  <CourseRow
                    key={course.code}
                    course={course}
                    indexNumber={indexNumber}
                  />
                );
              })}
            </div>

            {/* ===== PDF Evaluator — ส่วนประเมินคุณภาพเนื้อหา PDF ===== */}
            <PdfEvaluator user_id={user_id} />
          </div>
        </div>
      </div>
    </main>
  );
}
