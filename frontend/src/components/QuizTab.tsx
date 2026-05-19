"use client";

import { useState } from "react";
import { TokenEstimator, ESTIMATED_TOKENS } from "./usage/TokenEstimator";
import { QuotaWarningInline } from "./usage/QuotaWarningInline";
import { useUsage } from "@/contexts/UsageContext";

interface QuizTabProps {
  topics: string[];
  selected_topics: string[];
  OnToggle: (topic: string) => void;
  OnGenerate: () => void;
}

/**
 * QuizTab Component
 * หน้าจอเลือกหัวข้อสำหรับสร้าง Quiz ออกแบบด้วยธีมพรีเมียม Monochrome / Pastel Jelly
 */
export function QuizTab({ topics, selected_topics, OnToggle, OnGenerate }: QuizTabProps) {
  const [is_open, set_is_open] = useState(false);
  const selected_topic = selected_topics[0] || null;
  const { canGenerate } = useUsage();

  // ฟังก์ชันสำหรับจัดการการกดปุ่มสร้าง Quiz
  const HandleGenerateClick = () => {
    if (!selected_topic) return;
    OnGenerate();
  };

  return (
    <div className="flex flex-col h-full px-6 md:px-8 lg:px-12 pt-4 md:pt-6 pb-14 animate-fade-in-up relative min-h-[400px]">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-gray-400)] mb-5">
          Select Topic
        </h3>
        
        {/* Custom Dropdown */}
        <div className="relative">
          {/* Trigger Button */}
          <button
            onClick={() => set_is_open(!is_open)}
            className={`
              w-full flex items-center justify-between p-4 md:p-5 rounded-lg border transition-all duration-300 bg-[var(--color-white)]
              ${is_open 
                ? "border-[var(--color-gray-300)]" 
                : "border-[var(--color-gray-200)] hover:border-[var(--color-gray-300)]"
              }
            `}
          >
            <div className="flex items-center gap-4">
              <span className={`text-base font-normal ${selected_topic ? "text-[var(--color-black)]" : "text-[var(--color-gray-400)]"}`}>
                {selected_topic || "Select a topic for practice..."}
              </span>
            </div>
            <svg 
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className={`text-[var(--color-gray-400)] transition-transform duration-300 ${is_open ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          {/* Dropdown Menu */}
          {is_open && (
            <>
              {/* Backdrop to close */}
              <div className="fixed inset-0 z-20" onClick={() => set_is_open(false)} />
              
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[var(--color-gray-200)] rounded-lg overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-200 origin-top">
                <div className="p-4 relative">
                  {/* Masking boxes to cover potential scrollbar arrows */}
                  <div className="absolute top-0 right-0 w-8 h-6 bg-white z-10" />
                  <div className="absolute bottom-0 right-0 w-8 h-6 bg-white z-10" />
                  
                  <div className="max-h-[320px] overflow-y-auto premium-scrollbar pr-2 relative z-0">
                    {topics.map((topic, idx) => {
                      const is_selected = selected_topics.includes(topic);
                      // ตรวจสอบสถานะเรียนจบจาก Session Storage
                      const is_completed = typeof window !== "undefined" && sessionStorage.getItem(`completed_${topic}`) === 'true';
                      
                      return (
                        <button
                          key={idx}
                          disabled={!is_completed}
                          onClick={() => {
                            if (is_completed) {
                              OnToggle(topic);
                              set_is_open(false);
                            }
                          }}
                          className={`
                            w-full flex items-center gap-4 px-5 py-4 rounded-lg transition-all mb-1 group
                            ${is_selected ? "bg-[#8c8cf3]/10" : is_completed ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"}
                          `}
                        >
                          <div className={`
                            w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 text-[11px] font-bold
                            ${is_selected 
                              ? "bg-[#8c8cf3] border-[#8c8cf3] text-white shadow-[0_0_15px_rgba(140,140,243,0.4)]" 
                              : is_completed
                                ? "bg-white border-gray-200 text-gray-400 group-hover:border-gray-300"
                                : "bg-[var(--color-gray-100)] border-[var(--color-gray-200)] text-[var(--color-gray-300)]"
                            }
                          `}>
                            {!is_completed ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                              </svg>
                            ) : idx + 1}
                          </div>
                          
                          <div className="flex flex-col items-start text-left">
                            <span className={`text-sm md:text-base transition-colors ${is_selected ? "text-[var(--color-black)]" : is_completed ? "text-[var(--color-gray-600)]" : "text-[var(--color-gray-400)]"}`}>
                              {topic}
                            </span>
                            {!is_completed && (
                              <span className="text-[10px] text-[var(--color-gray-400)] uppercase tracking-wider font-bold">Please complete this chapter first</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer Action */}
      <div className="mt-8">
        <TokenEstimator type="quiz_5" />
        <QuotaWarningInline />
        <button
          onClick={HandleGenerateClick}
          disabled={!selected_topic || !canGenerate(ESTIMATED_TOKENS.quiz_5)}
          className={`
            w-full py-4 md:py-5 rounded-lg font-bold text-lg md:text-xl transition-all duration-300
            ${selected_topic
              ? "bg-[#8c8cf3] text-white hover:brightness-110 active:scale-95 cursor-pointer"
              : "bg-gray-200 text-gray-400 cursor-not-allowed opacity-50"
            }
          `}
        >
          Generate Quiz
        </button>
      </div>
    </div>
  );
}
