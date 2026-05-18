"use client";

import { useState } from "react";
import { apiService } from "@/services/api";

interface Question {
  question: string;
  options: string[];
  correct_answer: number;
  explanation?: string;
}

interface QuizPlayerProps {
  questions: Question[];
  OnClose: () => void;
  userId?: string;
  lessonId?: string;
  onGenerateMore?: () => Promise<void>;
}

export function QuizPlayer({ questions, OnClose, userId, lessonId, onGenerateMore }: QuizPlayerProps) {
  const [current_idx, set_current_idx] = useState(0);
  const [selected_option, set_selected_option] = useState<number | null>(null);
  const [user_answers, set_user_answers] = useState<(number | null)[]>([]);
  const [score, set_score] = useState(0);
  const [is_finished, set_is_finished] = useState(false);
  const [is_reviewing, set_is_reviewing] = useState(false);
  const [is_saving, set_is_saving] = useState(false);
  const [is_generating_more, set_is_generating_more] = useState(false);
  const [has_checked, set_has_checked] = useState(false);

  const letters = ["A", "B", "C", "D"];

  // Safety check to prevent crash when mounted with empty data
  if (!questions || questions.length === 0) {
    return null;
  }

  const HandleOptionClick = (idx: number) => {
    if (has_checked) return;
    set_selected_option(idx);
  };

  const HandleNext = async () => {
    if (!has_checked) {
      // --- SUBMIT ANSWER STEP (ตรวจและบันทึกคะแนนของข้อนี้ทันที) ---
      const isCorrect = selected_option === questions[current_idx].correct_answer;
      
      // บันทึกคำตอบของผู้ใช้
      const updatedAnswers = [...user_answers, selected_option];
      set_user_answers(updatedAnswers);

      if (isCorrect) {
        set_score(prev => prev + 1);
      }

      set_has_checked(true);
    } else {
      // --- NEXT QUESTION / FINISH STEP ---
      if (current_idx < questions.length - 1) {
        set_current_idx(current_idx + 1);
        set_selected_option(null);
        set_has_checked(false);
      } else {
        // --- FINISH QUIZ STEP (ส่งคะแนนที่บันทึกแล้วทั้งหมด) ---
        set_is_finished(true);
        
        if (userId && lessonId) {
          set_is_saving(true);
          try {
            await apiService.saveScore({
              userId,
              lessonId,
              type: 'quiz',
              score: score, // score ถูกบวกขึ้นเรียบร้อยตั้งแต่ตอน Submit ในสเต็ปที่แล้ว
              totalQuestions: questions.length
            });
          } catch (error) {
            console.error("Failed to save score:", error);
            alert("Failed to save score. Check console.");
          } finally {
            set_is_saving(false);
          }
        } else {
          console.error("Missing userId or lessonId", { userId, lessonId });
          alert(`คะแนนไม่ถูกบันทึก เนื่องจากข้อมูลไม่ครบ (userId: ${!!userId}, lessonId: ${!!lessonId})`);
        }
      }
    }
  };

  if (is_finished) {
    if (is_reviewing) {
      return (
        <div className="h-full flex flex-col px-6 md:px-8 lg:px-12 py-4 overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <h2 className="text-xl font-bold text-[var(--color-black)]">Review Answers</h2>
            <button 
              onClick={() => set_is_reviewing(false)}
              className="p-2 text-[var(--color-gray-400)] hover:text-black transition-colors rounded-full hover:bg-[var(--color-gray-50)]"
              title="Back to Summary"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden relative">
            {/* 🛡️ INTERNAL COVER TRICK (Hiding Scrollbar Arrows) */}
            <div className="absolute top-0 right-[2px] w-3 h-4 bg-white z-[60] pointer-events-none" />
            <div className="absolute bottom-0 right-[2px] w-3 h-4 bg-white z-[60] pointer-events-none" />

            <div className="absolute inset-0 overflow-y-auto premium-scrollbar pr-2 space-y-6 pb-10">
              {questions.map((q, qIdx) => {
              const userSelectedIdx = user_answers[qIdx];
              const isCorrectAnswer = userSelectedIdx === q.correct_answer;
              const correctLetter = ["A", "B", "C", "D"][q.correct_answer];
              
              return (
                <div key={qIdx} className="border-b border-[var(--color-gray-100)] pb-6 last:border-0">
                  <div className="flex items-center gap-3 mb-4">
                     <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm ${isCorrectAnswer ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-gray-400)]'}`}>
                      {isCorrectAnswer ? "✓" : "!"}
                    </span>
                    <h3 className="text-[15px] font-bold text-[var(--color-black)] leading-none">
                      {qIdx + 1}. {q.question}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 gap-2 pl-8">
                    {q.options.map((opt, oIdx) => {
                      const isOptionCorrect = oIdx === q.correct_answer;
                      const isOptionSelected = oIdx === userSelectedIdx;
                      
                      let bgColor = "bg-white";
                      let borderColor = "border-[var(--color-gray-100)]";
                      let textColor = "text-[var(--color-gray-600)]";

                      if (isOptionCorrect) {
                        bgColor = "bg-[#b9f28d]"; // เขียวที่คุณกำหนด
                        borderColor = "border-[#b9f28d]";
                        textColor = "text-black font-bold";
                      } else if (isOptionSelected && !isCorrectAnswer) {
                        bgColor = "bg-[#f28d8d]"; // แดงที่คุณกำหนด
                        borderColor = "border-[#f28d8d]";
                        textColor = "text-white font-medium";
                      }

                      return (
                        <div 
                          key={oIdx} 
                          className={`flex items-center gap-3 p-2.5 rounded-lg border-2 text-[13px] transition-all ${bgColor} ${borderColor} ${textColor}`}
                        >
                          <span className={`w-6 h-6 shrink-0 rounded-md border flex items-center justify-center text-[10px] font-bold ${
                            isOptionCorrect 
                              ? 'bg-black/10 border-black/20 text-black' 
                              : (isOptionSelected ? 'border-white/40 text-white' : 'border-gray-200 text-gray-400')
                          }`}>
                            {["A", "B", "C", "D"][oIdx]}
                          </span>
                          <span>{opt}</span>
                        </div>
                      );
                    })}

                    {/* แสดงคำอธิบายเฉพาะตอนตอบผิดเท่านั้น */}
                    {!isCorrectAnswer && q.explanation && (
                      <div className="mt-4 p-4 rounded-xl bg-red-50">
                        <p className="text-[14px] leading-relaxed text-red-800">
                          <strong>ตอบ {correctLetter} เพราะ </strong>
                          {q.explanation}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          
        </div>
      );
    }

    return (
      <div className="h-full overflow-y-auto flex flex-col items-center justify-center py-8 px-4 gap-0 relative">
        {/* ปุ่มปิด X ที่มุมขวาบน ทำหน้าที่ปิด */}
        <button 
          onClick={OnClose}
          className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-[var(--color-gray-400)] hover:text-black transition-colors rounded-full hover:bg-[var(--color-gray-50)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <h2 className="text-3xl font-bold text-[var(--color-black)] mb-1">Quiz Completed!</h2>
        <p className="text-[var(--color-gray-500)] mb-6">You've finished the assessment</p>
        
        <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-10 flex flex-col items-center mb-6 w-full max-w-sm">
          <div className="text-6xl font-black text-[#8c8cf3] mb-2">{score}/{questions.length}</div>
          <div className="text-sm font-bold text-[var(--color-gray-400)] uppercase tracking-widest">Your Score</div>
          {is_saving && <div className="text-xs text-[var(--color-gray-400)] mt-2">Saving your score...</div>}
        </div>

        <div className="flex gap-4 w-full max-w-sm px-0 mb-3">
          <button
            onClick={() => set_is_reviewing(true)}
            className="flex-1 py-4 bg-[#8c8cf3] text-white rounded-lg font-bold text-lg hover:brightness-110 active:scale-95 transition-all"
          >
            Review Answers
          </button>

          {onGenerateMore ? (
            <button
              onClick={async () => {
                set_is_generating_more(true);
                try {
                  await onGenerateMore();
                  // Reset states to resume quiz
                  set_current_idx(prev => prev + 1);
                  set_selected_option(null);
                  set_is_finished(false);
                  set_is_reviewing(false);
                  set_has_checked(false);
                } finally {
                  set_is_generating_more(false);
                }
              }}
              disabled={is_generating_more}
              className={`flex-1 py-4 rounded-lg font-bold text-base transition-all flex items-center justify-center gap-2 border-2 ${
                is_generating_more
                  ? "border-[#8c8cf3]/30 text-[#8c8cf3]/50 cursor-not-allowed bg-[#8c8cf3]/5"
                  : "border-[#8c8cf3]/40 text-[#8c8cf3] hover:bg-[#8c8cf3]/10 active:scale-95"
              }`}
            >
              {is_generating_more ? (
                <>
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                  </svg>
                  กำลังสร้าง...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="16"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  เพิ่มอีก 5 ข้อ
                </>
              )}
            </button>
          ) : (
            <button
              onClick={OnClose}
              className="flex-1 py-4 border-2 border-[var(--color-gray-200)] text-[var(--color-gray-600)] rounded-lg font-bold text-lg hover:bg-[var(--color-gray-50)] transition-all"
            >
              Back to Course
            </button>
          )}
        </div>

        {onGenerateMore && (
          <p className="text-center text-[11px] text-[var(--color-gray-400)] mb-4">
            ข้อใหม่จะถูกสร้างจากเนื้อหาเดิม และนำมาต่อท้ายชุดนี้
          </p>
        )}
      </div>
    );
  }

  const current_q = questions[current_idx];
  const progress = ((current_idx + 1) / questions.length) * 100;

  return (
    <div className="h-full flex flex-col px-6 md:px-8 lg:px-12 pt-2 md:pt-4 pb-16 animate-in fade-in duration-500 overflow-hidden w-full">
      {/* Top Progress */}
      <div className="mb-4 shrink-0 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[13px] font-bold text-[#8c8cf3]">
            Question {current_idx + 1} <span className="text-[var(--color-gray-300)] font-normal">of {questions.length}</span>
          </div>
          <button onClick={OnClose} className="p-2 text-[var(--color-gray-400)] hover:text-black transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-[#8c8cf3] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Main Content Area: Question + Options */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative p-1 md:p-2 max-w-3xl mx-auto w-full">
        {/* 🛡️ INTERNAL COVER TRICK (Hiding Scrollbar Arrows) */}
        <div className="absolute top-0 right-0 w-8 h-2 bg-white z-[60] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-8 h-2 bg-white z-[60] pointer-events-none" />

        {/* Question */}
        <div className="mb-6 shrink-0">
          <h2 className="text-lg md:text-xl font-normal text-[var(--color-black)] leading-snug">
            {current_idx + 1}. {current_q.question}
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto premium-scrollbar pl-2 pr-3 pb-2">
          <div className="grid grid-cols-1 gap-4">
            {current_q.options.map((option, idx) => {
              const is_selected = selected_option === idx;
              const is_correct_option = idx === current_q.correct_answer;

              let btn_class = "";
              let letter_box_class = "";
              let text_class = "";

              if (has_checked) {
                // --- AFTER CHECK STATE (สีและคำเฉลยเต็มกล่องแบบดั้งเดิม) ---
                if (is_correct_option) {
                  btn_class = "border-[#c9f28a] bg-[#c9f28a]";
                  letter_box_class = "bg-black/5 border-black/10 text-black";
                  text_class = "text-black font-bold";
                } else if (is_selected) {
                  btn_class = "border-[#f2918a] bg-[#f2918a]";
                  letter_box_class = "bg-white/20 border-white/20 text-white";
                  text_class = "text-white font-semibold";
                } else {
                  // ปรับปรุงคลาสตัวเลือกที่ไม่เกี่ยวข้อง (ไม่ใช่ข้อถูกและผู้ใช้ไม่ได้ตอบ):
                  // 1. เปลี่ยนคลาสขอบที่มีปัญหาพิมพ์ผิดจาก border-gray-150 เป็น border-gray-200 เพื่อลบขอบสีดำเข้มออก
                  // 2. เปลี่ยนพื้นหลังเป็น bg-gray-50 เพื่อให้แสดงผลเป็นสีเทาอ่อนนุ่มนวล
                  // 3. ปรับ opacity-60 เพื่อลดความโปร่งใส ทำให้ตัวเลือกดูจางลงและเป็นสีเทาอย่างเป็นธรรมชาติ
                  btn_class = "border-gray-200 bg-gray-50 opacity-60";
                  letter_box_class = "bg-gray-50 border-gray-200 text-gray-400";
                  text_class = "text-gray-400";
                }
              } else {
                // --- ACTIVE SELECTION STATE (สภาวะกำลังทำและเลือก) ---
                if (is_selected) {
                  btn_class = "border-[#8c8cf3] bg-[#8c8cf3] scale-[1.005]";
                  letter_box_class = "bg-white border-white text-[#8c8cf3]";
                  text_class = "text-white font-semibold";
                } else {
                  btn_class = "border-gray-200 bg-white hover:border-[#8c8cf3]/50 hover:bg-gray-50 active:scale-[0.995]";
                  letter_box_class = "bg-white border-[#8c8cf3]/30 text-[#8c8cf3] group-hover:border-[#8c8cf3]";
                  text_class = "text-gray-700";
                }
              }

              return (
                <button
                  key={idx}
                  disabled={has_checked}
                  onClick={() => HandleOptionClick(idx)}
                  className={`w-full flex items-center gap-4 p-3.5 md:p-4 rounded-xl border-2 transition-all text-left group shrink-0 ${btn_class}`}
                >
                  <div className={`w-9 h-9 md:w-10 md:h-10 rounded-lg border-2 flex items-center justify-center shrink-0 text-sm md:text-base font-bold transition-all ${letter_box_class}`}>
                    {letters[idx]}
                  </div>
                  <span className={`text-[15px] md:text-base leading-relaxed transition-colors ${text_class}`}>
                    {option}
                  </span>
                </button>
              );
            })}
          </div>

          {/* คำอธิบายเฉลยปรากฏด้านล่างตัวเลือกเมื่อตรวจคำตอบแล้ว */}
          {has_checked && current_q.explanation && (() => {
            const is_correct_selection = selected_option === current_q.correct_answer;
            if (is_correct_selection) {
              return (
                <div className="mt-4 p-5 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] animate-in slide-in-from-bottom duration-300">
                  <p className="text-[13px] md:text-[14px] leading-relaxed text-[#166534] font-normal">
                    <span className="font-bold mr-1">ถูกต้อง! 🎉 ตอบ {letters[current_q.correct_answer]} เพราะ:</span>
                    {current_q.explanation}
                  </p>
                </div>
              );
            } else {
              return (
                <div className="mt-4 p-5 rounded-xl bg-[#fde8e8] border border-[#fbd5d5] animate-in slide-in-from-bottom duration-300">
                  <p className="text-[13px] md:text-[14px] leading-relaxed text-[#9b1c1c] font-normal">
                    <span className="font-bold mr-1">ตอบ {letters[current_q.correct_answer]} เพราะ:</span>
                    {current_q.explanation}
                  </p>
                </div>
              );
            }
          })()}
        </div>
      </div>

      {/* Footer - Fixed at bottom */}
      <div className="pt-4 shrink-0 flex justify-center w-full max-w-3xl mx-auto pl-3 pr-4 md:pl-4 md:pr-5">
        <button
          onClick={HandleNext}
          disabled={selected_option === null}
          className={`w-full h-[83px] md:h-[88px] rounded-2xl font-bold text-[18px] transition-all flex items-center justify-center gap-2 ${
            selected_option === null 
              ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
              : "bg-[#8c8cf3] text-white hover:brightness-110 active:scale-95"
          }`}
        >
          {!has_checked ? "Submit Answer" : (
            current_idx === questions.length - 1 ? "Finish & See Results" : "Next Question"
          )}
        </button>
      </div>
    </div>
  );
}
