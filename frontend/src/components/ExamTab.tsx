"use client";
import { TokenEstimator, ESTIMATED_TOKENS } from "./usage/TokenEstimator";
import { QuotaWarningInline } from "./usage/QuotaWarningInline";
import { useUsage } from "@/contexts/UsageContext";

interface ExamTabProps {
  course_name: string;
  OnGenerate: () => void;
  OnMockResult?: () => void; // New optional prop for mocking
}

export function ExamTab({ course_name, OnGenerate, OnMockResult }: ExamTabProps) {
  const { canGenerate } = useUsage();
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 md:px-8 lg:px-12 pt-4 md:pt-6 pb-20 animate-fade-in-up">
      <div className="w-20 h-20 bg-[#8c8cf3]/10 rounded-3xl flex items-center justify-center mb-8">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8c8cf3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-[var(--color-black)] mb-3 text-center">
        Full Course Examination
      </h2>
      <p className="text-[var(--color-gray-500)] text-center mb-10 max-w-md">
        This exam covers all topics in <span className="text-[#8c8cf3] font-bold">{course_name}</span>.
        It contains 40 multiple-choice questions designed to test your overall understanding.
      </p>

      <div className="w-full max-w-md">
        <TokenEstimator type="exam_batch" />
        <QuotaWarningInline />
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={OnGenerate}
          disabled={!canGenerate(ESTIMATED_TOKENS.exam_batch)}
          className="px-10 py-4 bg-[#8c8cf3] text-white rounded-2xl font-bold text-lg hover:brightness-110 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_4px_14px_-4px_rgba(140,140,243,0.4)]"
        >
          Generate Exam
        </button>

        {OnMockResult && (
          <button
            onClick={OnMockResult}
            className="px-10 py-4 border-2 border-[#8c8cf3]/40 text-[#8c8cf3] bg-white rounded-2xl font-bold text-lg hover:bg-[#8c8cf3]/5 active:scale-95 transition-all"
          >
            Mock Exam Result
          </button>
        )}
      </div>
    </div>
  );
}
