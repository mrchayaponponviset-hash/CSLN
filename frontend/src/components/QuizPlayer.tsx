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

  // Safety check to prevent crash when mounted with empty data
  if (!questions || questions.length === 0) {
    return null;
  }

  const HandleOptionClick = (idx: number) => {
    set_selected_option(idx);
  };

  const HandleNext = async () => {
    const isCorrect = selected_option === questions[current_idx].correct_answer;
    
    // บันทึกคำตอบของผู้ใช้
    const updatedAnswers = [...user_answers, selected_option];
    set_user_answers(updatedAnswers);

    let finalScore = score;
    if (isCorrect) {
      finalScore += 1;
      set_score(finalScore);
    }

    if (current_idx < questions.length - 1) {
      set_current_idx(current_idx + 1);
      set_selected_option(null);
    } else {
      set_is_finished(true);
      
      if (userId && lessonId) {
        set_is_saving(true);
        try {
          await apiService.saveScore({
            userId,
            lessonId,
            type: 'quiz',
            score: finalScore,
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
      <div className="h-full overflow-y-auto flex flex-col items-center justify-center py-8 px-4 gap-0">
        <h2 className="text-3xl font-bold text-[var(--color-black)] mb-1">Quiz Completed!</h2>
        <p className="text-[var(--color-gray-500)] mb-6">You've finished the assessment</p>
        
        <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-10 flex flex-col items-center mb-6 w-full max-w-sm">
          <div className="text-6xl font-black text-[#8c8cf3] mb-2">{score}/{questions.length}</div>
          <div className="text-sm font-bold text-[var(--color-gray-400)] uppercase tracking-widest">Your Score</div>
          {is_saving && <div className="text-xs text-[var(--color-gray-400)] mt-2">Saving your score...</div>}
        </div>

        <div className="flex gap-4 w-full max-w-md px-6 mb-3">
          <button
            onClick={OnClose}
            className="flex-1 py-4 border-2 border-[var(--color-gray-200)] text-[var(--color-gray-600)] rounded-lg font-bold text-lg hover:bg-[var(--color-gray-50)] transition-all"
          >
            Back to Course
          </button>
          <button
            onClick={() => set_is_reviewing(true)}
            className="flex-1 py-4 bg-[#8c8cf3] text-white rounded-lg font-bold text-lg hover:brightness-110 active:scale-95 transition-all"
          >
            Review Answers
          </button>
        </div>

        {/* ปุ่มขอเพิ่มอีก 5 ข้อ */}
        {onGenerateMore && (
          <div className="w-full max-w-md px-6">
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
                } finally {
                  set_is_generating_more(false);
                }
              }}
              disabled={is_generating_more}
              className={`w-full py-3.5 rounded-lg font-bold text-base transition-all flex items-center justify-center gap-2 border-2 ${
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
                  กำลังสร้างข้อเพิ่มเติม...
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
            <p className="text-center text-[11px] text-[var(--color-gray-400)] mt-2">
              ข้อใหม่จะถูกสร้างจากเนื้อหาเดิม และนำมาต่อท้ายชุดนี้
            </p>
          </div>
        )}
      </div>
    );
  }

  const current_q = questions[current_idx];
  const progress = ((current_idx + 1) / questions.length) * 100;

  return (
    <div className="h-full flex flex-col px-6 md:px-8 lg:px-12 pt-2 md:pt-4 pb-16 animate-in fade-in duration-500 overflow-hidden w-full">
      {/* Top Progress */}
      <div className="mb-4 shrink-0">
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
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative p-1 md:p-2">
        {/* 🛡️ INTERNAL COVER TRICK (Hiding Scrollbar Arrows) */}
        <div className="absolute top-0 right-0 w-8 h-2 bg-white z-[60] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-8 h-2 bg-white z-[60] pointer-events-none" />

        {/* Question */}
        <div className="mb-6 shrink-0">
          <h2 className="text-lg md:text-xl font-normal text-[var(--color-black)] leading-snug">
            {current_idx + 1}. {current_q.question}
          </h2>
        </div>

        {/* Options - Scrollable only if content exceeds space */}
        <div className="flex-1 min-h-0 overflow-y-auto premium-scrollbar pr-2 pb-2">
          <div className="grid grid-cols-1 gap-4">
            {current_q.options.map((option, idx) => {
              const letters = ["A", "B", "C", "D"];
              const is_selected = selected_option === idx;

              let border_color = "border-[#8c8cf3]/30";
              let bg_color = "bg-white";
              let text_color = "text-[#262626]";
 
              if (is_selected) {
                border_color = "border-[#8c8cf3]";
                bg_color = "bg-[#8c8cf3]";
                text_color = "text-white";
              }

              return (
                <button
                  key={idx}
                  onClick={() => HandleOptionClick(idx)}
                  className={`w-full flex items-center gap-5 p-5 md:p-6 rounded-lg border-2 transition-all text-left group ${border_color} ${bg_color} ${selected_option === null ? "hover:border-[#8c8cf3] hover:brightness-110" : ""}`}
                >
                  <div className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center shrink-0 text-xl font-bold transition-all ${is_selected ? "bg-white border-white text-[#8c8cf3]" : "bg-white border-[#8c8cf3]/30 text-[#8c8cf3] group-hover:border-[#8c8cf3]"}`}>
                    {letters[idx]}
                  </div>
                  <span className={`text-lg md:text-xl font-medium leading-snug ${text_color}`}>{option}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer - Fixed at bottom */}
      <div className="pt-4 shrink-0 flex justify-end">
        <button
          onClick={HandleNext}
          disabled={selected_option === null}
          className={`px-8 py-3 rounded-lg font-bold text-sm transition-all ${selected_option === null 
            ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
            : "bg-[#8c8cf3] text-white hover:brightness-110 active:scale-95"}`}
        >
          {current_idx === questions.length - 1 ? "Finish Quiz" : "Next Question"}
        </button>
      </div>
    </div>
  );
}
