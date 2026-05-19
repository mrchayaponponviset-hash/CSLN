"use client";

import { useState, useEffect } from "react";
import { apiService } from "@/services/api";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { toPng } from "html-to-image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Question {
  question: string;
  options: string[];
  correct_answer: number;
  domain?: string;
  chapterTitle?: string;
  explanation?: string;
}

interface ExamPlayerProps {
  questions: Question[];
  OnClose: () => void;
  topics?: string[];
  courseName?: string;
  userId?: string;
  onGenerateMore?: (config: { mode: "general" | "difficult" | "bloom", bloom_levels: string[], instruction: string }) => Promise<void>;
  initialIsSubmitted?: boolean;
}

export function ExamPlayer({ questions, OnClose, topics: course_topics, courseName, userId, onGenerateMore, initialIsSubmitted = false }: ExamPlayerProps) {
  const [current_idx, set_current_idx] = useState(0);
  const [selected_option, set_selected_option] = useState<number | null>(null);
  const [user_answers, set_user_answers] = useState<(number | null)[]>(() => Array(questions.length).fill(null));
  
  // อัปเดตขนาดของอาเรย์คำตอบเมื่อมีข้อสอบใหม่เพิ่มขึ้นมา โดยยังคงรักษาคำตอบเก่าเอาไว้
  useEffect(() => {
    set_user_answers(prev => {
      if (prev.length >= questions.length) return prev;
      const next = [...prev];
      while (next.length < questions.length) {
        next.push(null);
      }
      return next;
    });
  }, [questions]);

  useEffect(() => {
    if (initialIsSubmitted && questions.length > 0) {
      // คำนวณคะแนนสำหรับ Mock Data โดยอัตโนมัติ
      const mockAnswers = Array(questions.length).fill(null).map((_, i) => i % 2 === 0 ? questions[i].correct_answer : (questions[i].correct_answer + 1) % 4);
      CalculateScore(mockAnswers);
    }
  }, [initialIsSubmitted, questions]);

  const [is_submitted, set_is_submitted] = useState(initialIsSubmitted);
  const [final_score, set_final_score] = useState(0);
  const [result_data, set_result_data] = useState<any>(null);
  
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);
  const [ai_analysis_text, set_ai_analysis_text] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Custom Prompt Modal States
  const [show_prompt_modal, set_show_prompt_modal] = useState(false);
  const [custom_prompt, set_custom_prompt] = useState("");
  const [is_generating_more, set_is_generating_more] = useState(false);
  const [batch_start_idx, set_batch_start_idx] = useState(0);
  const [generation_step_text, set_generation_step_text] = useState("วิเคราะห์ความยากง่ายและหัวข้อข้อสอบ . . .");

  // เอฟเฟกต์สำหรับอัปเดตสเตตัสการทำงานจริงของ AI ตามลำดับ LangGraph
  useEffect(() => {
    if (!is_generating_more) {
      set_generation_step_text("วิเคราะห์ความยากง่ายและหัวข้อข้อสอบ . . .");
      return;
    }

    const steps = [
      { delay: 0, text: "วิเคราะห์ความยากง่ายและระดับพฤติกรรมบลูมที่กำหนด . . ." },
      { delay: 2000, text: "จัดสรรเนื้อหาและดึงรายละเอียดรายบทเพื่อออกข้อสอบ . . ." },
      { delay: 4500, text: "ส่งมอบ Prompt และข้อกำหนดตัวชี้วัดความรู้ไปยังระบบ AI . . ." },
      { delay: 7000, text: "ปัญญาประดิษฐ์กำลังสังเคราะห์โจทย์คำถามใหม่ 5 ข้อ . . ." },
      { delay: 10000, text: "กำลังร่างคำอธิบายเฉลยและกำหนดตัวเลือกที่ถูกต้อง . . ." },
      { delay: 13500, text: "กำลังตรวจสอบคุณภาพ ความถูกต้อง และระดับความน่าเชื่อถือ . . ." },
      { delay: 16500, text: "จัดเตรียมหน้าข้อสอบชุดถัดไปเรียบร้อยแล้ว . . ." }
    ];

    const timers: NodeJS.Timeout[] = [];

    steps.forEach(step => {
      const timer = setTimeout(() => {
        set_generation_step_text(step.text);
      }, step.delay);
      timers.push(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [is_generating_more]);

  // Review Answers State
  const [is_reviewing, set_is_reviewing] = useState(false);
  const [is_viewing_analysis, set_is_viewing_analysis] = useState(false);

  // การตั้งค่าสำหรับการสร้างข้อสอบบทถัดไป
  const [exam_mode, set_exam_mode] = useState<"general" | "difficult" | "bloom">("general");
  const [selected_bloom_levels, set_selected_bloom_levels] = useState<string[]>([]);

  // Safety check to prevent crash when mounted with empty data
  if (!questions || questions.length === 0) {
    return null;
  }

  const HandleSelect = (q_idx: number, opt_idx: number) => {
    set_user_answers(prev => {
      const next = [...prev];
      next[q_idx] = opt_idx;
      return next;
    });
  };

  const CalculateScore = (answers: (number | null)[]) => {
    let score = 0;
    const radarData: any = { Remember: 0, Understand: 0, Apply: 0, Analyze: 0, Evaluate: 0, Create: 0 };
    const totalPerDomain: any = { Remember: 0, Understand: 0, Apply: 0, Analyze: 0, Evaluate: 0, Create: 0 };
    const chapterStats: any = {};

    questions.forEach((q, idx) => {
      const domain = q.domain || "Remember";
      const chapter = q.chapterTitle || "General";
      
      if (!chapterStats[chapter]) chapterStats[chapter] = { correct: 0, total: 0 };
      
      totalPerDomain[domain]++;
      chapterStats[chapter].total++;
      
      if (answers[idx] === q.correct_answer) {
        score++;
        radarData[domain]++;
        chapterStats[chapter].correct++;
      }
    });

    const chartData = Object.keys(radarData).map(key => ({
      subject: key,
      A: (radarData[key] / (totalPerDomain[key] || 1)) * 100,
      fullMark: 100
    }));

    set_final_score(score);
    set_result_data({
      score,
      total: questions.length,
      chartData,
      chapterStats,
    });
    
    // Save minimal result initially (without AI recommendation)
    if (userId) {
      apiService.saveExamResult({
        userId,
        totalScore: score,
        totalQuestions: questions.length,
        categoryScores: chartData,
        recommendation: ""
      }).catch(e => console.error("Auto save error:", e));
    }
  };

  const HandleNext = () => {
    const updatedAnswers = [...user_answers, selected_option];
    set_user_answers(updatedAnswers);

    if (current_idx < questions.length - 1) {
      set_current_idx(current_idx + 1);
      set_selected_option(null);
    } else {
      CalculateScore(updatedAnswers);
      set_is_submitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const GenerateAIAnalysis = async () => {
    set_is_viewing_analysis(true);
    setGeneratingAnalysis(true);
    try {
      const summaryData = await apiService.generatePdfSummary({
        quizScores: result_data.chapterStats,
        examResults: { score: final_score, total: questions.length },
        radarScores: result_data.chartData
      });
      set_ai_analysis_text(summaryData.summary);

      // Re-save with recommendation
      if (userId) {
        apiService.saveExamResult({
          userId,
          totalScore: final_score,
          totalQuestions: questions.length,
          categoryScores: result_data.chartData,
          recommendation: summaryData.summary
        }).catch(e => console.error("Auto save error:", e));
      }
    } catch (error) {
      console.error("Failed to generate AI analysis:", error);
      alert("เกิดข้อผิดพลาดในการวิเคราะห์ AI");
    } finally {
      setGeneratingAnalysis(false);
    }
  };

  // ฟังก์ชันสำหรับเรียก Generate ข้อสอบเพิ่มเติมผ่าน API บอร์ด
  const HandleGenerateMore = async (
    instruction: string,
    mode: "general" | "difficult" | "bloom",
    bloom_levels: string[]
  ) => {
    if (!onGenerateMore) return;
    const next_batch_start = questions.length;
    set_is_generating_more(true);
    try {
      // เรียก props เพื่อขอสร้างข้อสอบชุดถัดไปตามโหมดที่กำหนด
      await onGenerateMore({
        mode,
        bloom_levels,
        instruction
      });
      set_show_prompt_modal(false);
      set_custom_prompt("");
      
      // ดำเนินการรีเซ็ต state เพื่อเริ่มทำชุดใหม่เฉพาะ 5 ข้อล่าสุดที่สร้างขึ้น
      set_batch_start_idx(next_batch_start);
      set_current_idx(next_batch_start);
      set_selected_option(null);
      set_is_submitted(false);
      set_is_reviewing(false);
      set_ai_analysis_text(null);
    } catch (error) {
      console.error(error);
    } finally {
      set_is_generating_more(false);
    }
  };

  const downloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      const chartElement = document.querySelector(".recharts-wrapper");
      let chartImageUrl = null;
      if (chartElement) {
        chartImageUrl = await toPng(chartElement as HTMLElement, { 
          backgroundColor: '#ffffff',
          pixelRatio: 2
        });
      }

      // Replace mockSummary with actual ai_analysis_text
      const summaryText = (ai_analysis_text || "No analysis available.").trim();
      const sectionBlocks = summaryText.split(/###\s+/).filter(Boolean);
      
      const sections = sectionBlocks.map((block: string) => {
        const lines = block.split('\n');
        const title = lines[0].trim();
        const content = lines.slice(1).join('\n').trim();
        return { title, content };
      });

      sections.unshift({
        title: "ผลคะแนนการทดสอบรวม",
        content: `ในภาพรวมของการทดสอบ คุณทำคะแนนได้ **${final_score}** จากคะแนนเต็ม **${questions.length}** คิดเป็น **${Math.round((final_score/questions.length)*100)}%**`
      });

      const pdfBlob = await apiService.generatePdf({
        title: courseName || 'Computer Science Assessment',
        sections,
        score: final_score,
        total: questions.length,
        chartImage: chartImageUrl,
        footerText: `รายงานประเมินผลอัตโนมัติสร้างโดยระบบ CSL AI Learning Dashboard (Ref ID: ${new Date().getTime()})`
      });

      const finalBlob = new Blob([pdfBlob], { type: "application/pdf" });
      const url = window.URL.createObjectURL(finalBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Exam-Report-${new Date().getTime()}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 200);
    } catch (error) {
      console.error("PDF Export Error:", error);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // --- REVIEW MODE ---
  if (is_reviewing) {
    return (
      <div className="h-full flex flex-col bg-white animate-in fade-in duration-700">
        {/* ส่วนหัวหน้าเฉลย - ปรับมาใช้ระบบ Grid เดียวกับหน้าข้อสอบ px-6 md:px-8 lg:px-14 เพื่อความสมบูรณ์แบบ */}
        <div className="flex items-center justify-between px-6 md:px-8 lg:px-14 py-4 border-b border-gray-100 shrink-0 sticky top-0 bg-white/80 backdrop-blur-md z-10">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-black)]">Review Answers</h2>
            <p className="text-xs font-bold text-[var(--color-gray-400)] uppercase tracking-widest mt-0.5">Exam Final Check</p>
          </div>
          <button 
            onClick={() => set_is_reviewing(false)} 
            className="p-2 text-[var(--color-gray-400)] hover:text-black hover:bg-gray-50 transition-all rounded-full active:scale-90"
            title="Back to Summary"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        {/* คอนเทนเนอร์หน้าเฉลย - ขยับสกรอลล์บาร์สีม่วงเยื้องซ้าย pr-5 พร้อมกล่องสีขาวปิดทับลูกศรหัวท้าย */}
        <div className="flex-1 min-h-0 overflow-hidden relative pr-5">
          {/* กล่องสีขาวเล็กๆ ทับลูกศรด้านบน */}
          <div className="absolute top-0 right-5 w-[14px] h-[10px] bg-white z-[60] pointer-events-none" />
          {/* กล่องสีขาวเล็กๆ ทับลูกศรด้านล่าง */}
          <div className="absolute bottom-0 right-5 w-[14px] h-[10px] bg-white z-[60] pointer-events-none" />

          {/* ปรับสกรอลล์คอนเทนเนอร์เป็น premium-scrollbar และจัดแนว Padding ให้สมมาตรรับกับตัวสกรอลล์บาร์เยื้องซ้าย */}
          <div className="absolute inset-0 overflow-y-auto premium-scrollbar pl-6 md:pl-8 lg:pl-14 pr-1 md:pr-3 lg:pr-[36px] py-8 pb-16">
            <div className="max-w-3xl mx-auto space-y-8">
            {questions.map((q, idx) => {
              const userAnswer = user_answers[idx];
              const isCorrect = userAnswer === q.correct_answer;
              const isUnanswered = userAnswer === null || userAnswer === undefined;
              const letters = ["a.", "b.", "c.", "d."];
 
              return (
                <div key={idx} className={`p-6 md:p-8 rounded-[24px] border-2 transition-all ${isCorrect ? 'border-[#b9f28d]/40 bg-[#b9f28d]/5' : 'border-[#f28d8d]/40 bg-[#f28d8d]/5'}`}>
                  <div className="mb-4">
                    {/* ย้ายเครื่องหมาย ถูกผิด ไปไว้ที่ระดับเดียวกับหัวข้อ Question {idx + 1} เพื่อความสวยงามสมมาตร */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isCorrect ? 'bg-[#b9f28d] text-green-800' : 'bg-[#f28d8d] text-red-800'}`}>
                        {isCorrect ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        )}
                      </div>
                      <span className="text-sm font-black text-gray-400 uppercase tracking-wider">Question {idx + 1}</span>
                    </div>
                    
                    {/* ตัวข้อความโจทย์คำถาม สตาร์ทที่ขอบซ้ายของการ์ดเสมอกันเพื่อความเป็นระเบียบเรียบร้อย */}
                    <h3 className="text-[17px] font-medium text-gray-900 leading-relaxed">{q.question}</h3>
                  </div>
 
                  {/* กล่องตัวเลือก - เอา padding ด้านซ้ายออก เพื่อให้ตั้งแถวตรงกับคำถามด้านบนพอดี */}
                  <div className="space-y-3">
                    {q.options.map((opt, oIdx) => {
                      const isSelected = userAnswer === oIdx;
                      const isCorrectOption = q.correct_answer === oIdx;
                      
                      let bgClass = "bg-white border-gray-200";
                      let textClass = "text-gray-600";

                      if (isCorrectOption) {
                        bgClass = "bg-[#b9f28d] border-[#b9f28d]";
                        textClass = "text-black font-bold";
                      } else if (isSelected && !isCorrectOption) {
                        bgClass = "bg-[#f28d8d] border-[#f28d8d]";
                        textClass = "text-white font-bold";
                      }

                      return (
                        <div key={oIdx} className={`flex items-start gap-4 p-4 rounded-xl border-2 ${bgClass}`}>
                          <span className={`text-[15px] font-mono font-bold mt-0.5 ${isCorrectOption ? 'text-black/60' : isSelected ? 'text-white/90' : 'text-gray-400'}`}>
                            {letters[oIdx]}
                          </span>
                          <span className={`text-[15px] leading-relaxed ${textClass}`}>{opt}</span>
                          {isSelected && (
                            <span className={`ml-auto text-[11px] font-black uppercase tracking-widest mt-1 ${isCorrectOption ? 'text-black/50' : 'text-white/80'}`}>Your Answer</span>
                          )}
                        </div>
                      );
                    })}

                    {!isCorrect && q.explanation && (
                      <div className="mt-4 p-4 rounded-xl bg-gray-100 border border-gray-200">
                        <p className="text-[14px] leading-relaxed text-gray-700">
                          <strong className="text-gray-900">คำอธิบาย: </strong>
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
      </div>
    );
  }

  // --- AI ANALYSIS MODE ---
  if (is_submitted && is_viewing_analysis) {
    return (
      <div className="h-full flex flex-col bg-white animate-in fade-in duration-700">
        <div className="flex items-center justify-between px-6 md:px-8 py-4 border-b border-gray-100 shrink-0 sticky top-0 bg-white/80 backdrop-blur-md z-10">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-black)]">AI Personal Recommendation</h2>
            <p className="text-xs font-bold text-[var(--color-gray-400)] uppercase tracking-widest mt-0.5">วิเคราะห์เจาะลึกเฉพาะบุคคล</p>
          </div>
          {/* ปรับปรุงปุ่ม Back to Summary ในหน้า AI Analysis: เปลี่ยนจากปุ่มข้อความปกติเป็นไอคอนปิด "X" (Close SVG Icon) เพื่อความกลมกลืนและสอดคล้องกับหน้าเฉลยอื่นๆ */}
          <button 
            onClick={() => set_is_viewing_analysis(false)} 
            className="p-2 text-[var(--color-gray-400)] hover:text-black hover:bg-gray-50 transition-all rounded-full active:scale-90"
            title="Back to Summary"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        {/* คอนเทนเนอร์หน้าวิเคราะห์ AI - ขยับสกรอลล์บาร์สีม่วงเยื้องซ้าย pr-5 พร้อมกล่องสีขาวปิดทับลูกศรหัวท้ายตามสูตรเดิม */}
        <div className="flex-1 min-h-0 overflow-hidden relative pr-5">
          {/* กล่องสีขาวเล็กๆ ทับลูกศรด้านบน */}
          <div className="absolute top-0 right-5 w-[14px] h-[10px] bg-white z-[60] pointer-events-none" />
          {/* กล่องสีขาวเล็กๆ ทับลูกศรด้านล่าง */}
          <div className="absolute bottom-0 right-5 w-[14px] h-[10px] bg-white z-[60] pointer-events-none" />

          {/* ปรับสกรอลล์คอนเทนเนอร์เป็น premium-scrollbar และจัดแนว Padding ให้สมมาตรรับกับตัวสกรอลล์บาร์เยื้องซ้าย */}
          <div className="absolute inset-0 overflow-y-auto premium-scrollbar pl-6 md:pl-12 pr-1 md:pr-[28px] py-8 pb-16">
            <div className="max-w-4xl mx-auto">
              {generatingAnalysis ? (
                <div className="h-64 flex flex-col items-center justify-center gap-6 mt-10">
                  <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                  <div className="text-center">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">กำลังประมวลผลข้อมูลเชิงลึก...</h3>
                    <p className="text-sm text-gray-500">AI กำลังวิเคราะห์รูปแบบการตอบของคุณเพื่อเสนอแนวทางพัฒนา</p>
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--color-gray-50)] rounded-[32px] p-6 sm:p-10 border border-[var(--color-gray-100)] animate-in slide-in-from-bottom-4 duration-700">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[var(--color-primary)]/10 rounded-2xl flex items-center justify-center text-[var(--color-primary)] shrink-0">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-[var(--color-black)]">ผลการวิเคราะห์</h3>
                        <p className="text-sm font-bold text-gray-500 mt-1">อิงจากรูปแบบการตอบของข้อสอบชุดนี้</p>
                      </div>
                    </div>
                    
                    <button 
                      onClick={downloadPdf}
                      disabled={generatingPdf}
                      className="shrink-0 flex items-center justify-center gap-2 bg-black text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-gray-800 active:scale-95 transition-all shadow-md"
                    >
                      {generatingPdf ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline></svg>
                      )}
                      <span>Export PDF</span>
                    </button>
                  </div>
                  
                  <div className="prose prose-sm md:prose-base prose-gray max-w-none text-[var(--color-gray-700)]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {ai_analysis_text || ""}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- SUMMARY MODE ---
  if (is_submitted && result_data) {
    const percentage = (final_score / questions.length) * 100;
    
    const display_topics = Object.entries(result_data.chapterStats).map(([name, stats]: [string, any]) => ({
      name: name.length > 40 ? name.substring(0, 37) + "..." : name,
      score: stats.correct,
      total: stats.total
    }));

    return (
      <div className="h-full relative bg-white animate-in fade-in duration-700 overflow-hidden flex flex-col">
        {/* โมดอลออกแบบข้อสอบเพิ่มเติม (Custom Prompt Modal) */}
        {show_prompt_modal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-transparent backdrop-blur-md px-4">
            <div className="relative bg-white rounded-[24px] p-5 sm:p-6 w-full max-w-[420px] shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[98%] overflow-hidden border border-gray-100">
              {is_generating_more ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 animate-in fade-in duration-500 min-h-[340px]">
                  {/* แอนิเมชันกล่องขยับ (banter-loader) ขนาดและอัตราส่วนเทียบเท่าหน้า Flashcard */}
                  <div className="relative w-full h-24 flex items-center justify-center mb-8 scale-100">
                    <div className="banter-loader">
                      <div className="banter-loader__box"></div>
                      <div className="banter-loader__box"></div>
                      <div className="banter-loader__box"></div>
                      <div className="banter-loader__box"></div>
                      <div className="banter-loader__box"></div>
                      <div className="banter-loader__box"></div>
                      <div className="banter-loader__box"></div>
                      <div className="banter-loader__box"></div>
                      <div className="banter-loader__box"></div>
                    </div>
                  </div>
                  
                  {/* หัวข้อหน้าระหว่าง Generate ข้อสอบ - ปรับขนาดเพื่อให้แสดงในบรรทัดเดียวอย่างสง่างาม */}
                  <h3 className="text-[17px] sm:text-[19px] md:text-[21px] font-black text-gray-900 tracking-tight text-center mb-4.5 uppercase">
                    Generating Examination
                  </h3>
                  
                  {/* ข้อความจำลองการทำงานของ AI แบบกระพริบเรียลไทม์ (animate-pulse) ตามจริง */}
                  <div className="flex flex-col items-center gap-1 text-center animate-pulse px-2">
                    <span className="text-[11px] sm:text-[12px] font-bold text-[var(--color-primary)] tracking-wider uppercase mb-0.5">
                      ชุดที่ {Math.floor(questions.length / 5) + 1} (ข้อ {questions.length + 1} - {questions.length + 5})
                    </span>
                    <span className="text-[12.5px] font-medium text-gray-400 leading-relaxed min-h-[38px] max-w-[290px]">
                      {generation_step_text}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => set_show_prompt_modal(false)}
                    className="absolute top-4.5 right-4.5 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all active:scale-95 z-10"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                  <h3 className="text-lg font-black text-gray-900 mb-0.5">ตั้งค่าข้อสอบบทถัดไป</h3>
                  <p className="text-[11px] text-gray-500 mb-3.5">เลือกรูปแบบของข้อสอบ 5 ข้อถัดไปที่ต้องการให้ AI ออกแบบ</p>
                  
                  <div className="space-y-2 mb-3.5">
                    {/* ตัวเลือกที่ 1: ทั่วไป */}
                    <button
                      onClick={() => set_exam_mode("general")}
                      className={`w-full p-2.5 px-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                        exam_mode === "general"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                          : "border-gray-100 hover:border-gray-200 bg-white"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        exam_mode === "general" ? "border-[var(--color-primary)]" : "border-gray-300"
                      }`}>
                        {exam_mode === "general" && <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />}
                      </div>
                      <div>
                        <h4 className="text-[12.5px] font-bold text-gray-900">1. ทั่วไป (General)</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">คละระดับความยากทั่วไป เน้นความรู้และความเข้าใจตามหลักสูตร</p>
                      </div>
                    </button>

                    {/* ตัวเลือกที่ 2: ยาก */}
                    <button
                      onClick={() => set_exam_mode("difficult")}
                      className={`w-full p-2.5 px-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                        exam_mode === "difficult"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                          : "border-gray-100 hover:border-gray-200 bg-white"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        exam_mode === "difficult" ? "border-[var(--color-primary)]" : "border-gray-300"
                      }`}>
                        {exam_mode === "difficult" && <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />}
                      </div>
                      <div>
                        <h4 className="text-[12.5px] font-bold text-gray-900">2. ยาก (Difficult)</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">ท้าทายระดับสูง เน้นโจทย์แนววิเคราะห์ การประเมินค่า และการประยุกต์ใช้งาน</p>
                      </div>
                    </button>

                    {/* ตัวเลือกที่ 3: กำหนดข้อจาก Bloom Taxonomy */}
                    <button
                      onClick={() => set_exam_mode("bloom")}
                      className={`w-full p-2.5 px-3.5 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                        exam_mode === "bloom"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/5"
                          : "border-gray-100 hover:border-gray-200 bg-white"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                        exam_mode === "bloom" ? "border-[var(--color-primary)]" : "border-gray-300"
                      }`}>
                        {exam_mode === "bloom" && <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />}
                      </div>
                      <div>
                        <h4 className="text-[12.5px] font-bold text-gray-900">3. กำหนดข้อจาก Bloom&apos;s Taxonomy</h4>
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">เลือกเน้นระดับพฤติกรรมการเรียนรู้ที่คุณต้องการพัฒนาเป็นพิเศษ</p>
                      </div>
                    </button>
                  </div>

                  {/* ส่วนขยายการเลือกของ Bloom's Taxonomy */}
                  {exam_mode === "bloom" && (
                    <div className="bg-gray-50/50 rounded-lg p-2 border border-gray-100 mb-2.5 animate-in slide-in-from-top-2 duration-300">
                      <h5 className="text-[10px] font-bold text-gray-700 mb-1.5">เลือกระดับ Bloom&apos;s Taxonomy</h5>
                      
                      {result_data?.chartData && (
                        <div className="bg-white/70 rounded-lg p-2 border border-gray-100 mb-2 text-[9px] text-gray-600 flex flex-col gap-1">
                          <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-gray-500">
                            {[
                              { key: "Remember", label: "ความจำ" },
                              { key: "Understand", label: "ความเข้าใจ" },
                              { key: "Apply", label: "การประยุกต์ใช้" },
                              { key: "Analyze", label: "การวิเคราะห์" },
                              { key: "Evaluate", label: "การประเมินค่า" },
                              { key: "Create", label: "การสร้างสรรค์" }
                            ].map((item) => {
                              const score_obj = result_data.chartData.find((d: any) => d.subject === item.key);
                              const score = score_obj ? Math.round(score_obj.A) : 0;
                              return (
                                <div key={item.key} className="flex justify-between border-b border-gray-50 pb-0.5">
                                  <span>{item.label}:</span>
                                  <span className="font-black text-[var(--color-primary)]">{score}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { key: "Remember", label: "ความจำ (Remember)" },
                          { key: "Understand", label: "ความเข้าใจ (Understand)" },
                          { key: "Apply", label: "การประยุกต์ใช้ (Apply)" },
                          { key: "Analyze", label: "การวิเคราะห์ (Analyze)" },
                          { key: "Evaluate", label: "การประเมินค่า (Evaluate)" },
                          { key: "Create", label: "การสร้างสรรค์ (Create)" }
                        ].map((bloom_item) => {
                          const is_checked = selected_bloom_levels.includes(bloom_item.key);
                          return (
                            <button
                              key={bloom_item.key}
                              type="button"
                              onClick={() => {
                                if (is_checked) {
                                  set_selected_bloom_levels(prev => prev.filter(k => k !== bloom_item.key));
                                } else {
                                  set_selected_bloom_levels(prev => [...prev, bloom_item.key]);
                                }
                              }}
                              className={`p-1.5 rounded-lg border text-[10px] font-bold text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                                is_checked
                                  ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white"
                                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                              }`}
                            >
                              <span>{bloom_item.label}</span>
                              {result_data?.chartData && (
                                <span className={`text-[8.5px] font-bold ${is_checked ? 'text-white/80' : 'text-gray-400'}`}>
                                  {Math.round(result_data.chartData.find((d: any) => d.subject === bloom_item.key)?.A ?? 0)}%
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        let prompt_text = "";
                        if (exam_mode === "general") {
                          prompt_text = "ขอข้อสอบระดับทั่วไป คละเนื้อหาและความยากง่าย";
                        } else if (exam_mode === "difficult") {
                          prompt_text = "ขอข้อสอบที่ยากขึ้นระดับยากและท้าทาย เน้นโจทย์แนววิเคราะห์ การสังเคราะห์ และการประเมินค่าระดับสูง";
                        } else if (exam_mode === "bloom") {
                          if (selected_bloom_levels.length === 0) {
                            alert("โปรดเลือกระดับ Bloom's Taxonomy อย่างน้อย 1 ข้อ");
                            return;
                          }
                          prompt_text = `ขอข้อสอบเน้นคำถามระดับ Bloom's Taxonomy ดังต่อไปนี้เท่านั้น: ${selected_bloom_levels.join(", ")}`;
                        }
                        
                        // เรียก HandleGenerateMore โดยเก็บ Modal โหลดไว้
                        HandleGenerateMore(prompt_text, exam_mode, selected_bloom_levels);
                      }}
                      disabled={exam_mode === "bloom" && selected_bloom_levels.length === 0}
                      className={`w-full py-2.5 font-bold text-xs rounded-xl transition-all text-center ${
                        exam_mode === "bloom" && selected_bloom_levels.length === 0
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-[var(--color-primary)] text-white hover:brightness-110 active:scale-95"
                      }`}
                    >
                      {is_generating_more ? "กำลังสร้าง..." : "เริ่มสร้างข้อสอบ"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        
        {/* คอนเทนเนอร์หลักของผลลัพธ์ - ปรับระยะ Padding ให้ใช้ px-6 md:px-8 lg:px-14 และ py-6 เพื่อความสง่างาม */}
        <div id="result-container" className="flex-1 overflow-hidden px-6 md:px-8 lg:px-14 py-6 flex flex-col">
          <div className="flex flex-col gap-6 flex-1 min-h-0 max-w-6xl mx-auto w-full">
            
            {/* แถวที่ 1: การ์ดคะแนน + วิเคราะห์หัวข้อ (ซ้าย) และ Bloom's Taxonomy (ขวา) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1 min-h-0">
              
              {/* คอลัมน์ซ้าย: คะแนนรวม + การ์ดวิเคราะห์หัวข้อ (Topic Analysis) */}
              <div className="lg:col-span-5 flex flex-col gap-6 h-full min-h-0">
                {/* การ์ดคะแนนรวม (Overall Score) - สไตล์มนกลมพรีเมียม */}
                <div className="bg-white border border-[var(--color-gray-100)] rounded-[24px] p-5 flex items-center gap-5 shadow-sm shrink-0">
                  <div className="relative w-[80px] h-[80px] flex items-center justify-center shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-gray-100)" strokeWidth="6" />
                      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-primary)" strokeWidth="6" strokeDasharray={213.63} strokeDashoffset={213.63 - (213.63 * percentage) / 100} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-[var(--color-black)] leading-none">{final_score}</span>
                      <span className="text-[10px] font-bold text-[var(--color-gray-400)] mt-0.5">/ {questions.length}</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--color-black)] mb-1">Overall Score</h3>
                    <p className="text-xs text-[var(--color-gray-500)] leading-relaxed">You scored {Math.round(percentage)}% on this exam batch. Keep up the great work!</p>
                  </div>
                </div>

                {/* การ์ดวิเคราะห์หัวข้อ (Topic Analysis Card) - ปรับปรุงสไตล์เป็นแบบกล่องพรีเมียมที่มีระดับสมมาตรกับขวา */}
                <div className="bg-white border border-[var(--color-gray-100)] rounded-[24px] p-6 shadow-sm flex flex-col flex-1 min-h-0">
                  <h4 className="text-[11px] font-bold text-[var(--color-gray-400)] uppercase tracking-widest shrink-0 mb-3 text-left">Topic Analysis</h4>
                  <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pr-1">
                    {display_topics.map((topic_item, topic_index) => (
                      <div key={topic_index} className="bg-[var(--color-gray-50)] rounded-2xl p-4 border border-[var(--color-gray-100)] shrink-0">
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-[13px] font-bold text-[var(--color-black)] truncate pr-2">{topic_item.name}</div>
                          <div className="text-right whitespace-nowrap">
                            <span className="text-base font-black text-[var(--color-primary)]">{topic_item.score}</span>
                            <span className="text-[10px] font-bold text-[var(--color-gray-400)]"> / {topic_item.total}</span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--color-gray-200)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--color-primary)] transition-all duration-1000 delay-300" style={{ width: `${topic_item.total > 0 ? (topic_item.score / topic_item.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* คอลัมน์ขวา: Bloom's Taxonomy Analytics - สไตล์การ์ดโค้งมน สวยงาม สมมาตร 100% */}
              <div className="lg:col-span-7 h-full min-h-0">
                <div className="bg-white border border-[var(--color-gray-100)] rounded-[24px] p-6 shadow-sm flex flex-col h-full min-h-0">
                  <h4 className="text-[11px] font-bold text-[var(--color-gray-400)] uppercase tracking-widest mb-2 w-full text-center shrink-0">Bloom&apos;s Taxonomy Analytics</h4>
                  <div className="w-full flex-1 flex items-center justify-center min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={result_data.chartData}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 'bold' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="Performance" dataKey="A" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.25} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* แถวปุ่มปฏิบัติการที่อยู่ในระบบ Grid เดียวกันเพื่อให้มีขนาดกว้างเท่ากับกล่องข้อมูลด้านบนอย่างสมมาตร */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 shrink-0 mt-2">
              {/* ปุ่ม Review Answers (แสดงคำตอบ) อยู่ใน lg:col-span-5 เท่ากับกล่องทางซ้าย */}
              <div className="lg:col-span-5">
                <button 
                  onClick={() => set_is_reviewing(true)} 
                  className="w-full py-4 bg-[#8c8cf3] text-white hover:brightness-110 active:scale-95 rounded-2xl font-bold text-[16px] transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_-4px_rgba(140,140,243,0.4)]"
                >
                  แสดงคำตอบ
                </button>
              </div>

              {/* ปุ่ม บทถัดไป อยู่ใน lg:col-span-7 เท่ากับกล่องทางขวา */}
              <div className="lg:col-span-7">
                {onGenerateMore && (
                  <button 
                    onClick={() => set_show_prompt_modal(true)}
                    className="w-full py-4 border-2 border-[#8c8cf3]/40 text-[#8c8cf3] hover:bg-[#8c8cf3]/10 active:scale-95 rounded-2xl font-bold text-[16px] transition-all flex items-center justify-center gap-2"
                  >
                    บทถัดไป
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }


  // --- QUESTION MODE (Single Scrollable Page Layout) ---
  // แสดงผลทำควิซชุดใหม่ทีละ 5 ข้อ แต่ยังบันทึกสะสมคะแนนจากชุดเก่าทั้งหมดไว้ในเบื้องหลัง
  const active_questions = questions.slice(batch_start_idx, batch_start_idx + 5);
  const current_batch_answers = user_answers.slice(batch_start_idx, batch_start_idx + 5);
  
  const answeredCount = current_batch_answers.filter(a => a !== null).length;
  const progressPercent = (answeredCount / 5) * 100;
  const is_batch_empty = current_batch_answers.every(a => a === null);

  return (
    <div className="h-full flex flex-col bg-white animate-in fade-in duration-700 overflow-hidden relative">
      {/* ส่วนหัวของหน้าข้อสอบ - ปรับปรุงมาใช้ระบบ Grid เดียวกับแท็บเนื้อหาหลักด้านบน (px-6 md:px-8 lg:px-14) เพื่อความสมมาตรแบบ 100% */}
      <div className="border-b border-gray-100 z-10 bg-white shadow-sm shrink-0 px-6 md:px-8 lg:px-14">
        <div className="max-w-4xl mx-auto w-full flex items-center justify-between py-3.5">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-black)] leading-tight">Course Examination</h2>
            <p className="text-[10px] font-bold text-[var(--color-gray-400)] uppercase tracking-widest mt-0.5">
              Answered {answeredCount} of 5 Questions (Batch {Math.floor(batch_start_idx / 5) + 1} / 8)
            </p>
          </div>
          <button onClick={OnClose} className="p-2 text-[var(--color-gray-400)] hover:bg-gray-50 rounded-full transition-colors active:scale-90">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Top Progress (ดีไซน์หลอดมนเหมือนหน้า Flashcard และ Quiz) - ปรับให้สั้นลงกว่ากล่องคำถามเล็กน้อยด้วย px-4 md:px-6 lg:px-8 เพื่อมิติที่สวยงามยิ่งขึ้น */}
      <div className="shrink-0 w-full px-6 md:px-8 lg:px-14 pt-5 pb-2">
        <div className="max-w-4xl mx-auto w-full px-4 md:px-6 lg:px-8">
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#8c8cf3] transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-white pr-5">
        {/* กล่องสีขาวเล็กๆ ทับลูกศรด้านบน */}
        <div className="absolute top-0 right-5 w-[14px] h-[10px] bg-white z-10 pointer-events-none" />
        {/* กล่องสีขาวเล็กๆ ทับลูกศรด้านล่าง */}
        <div className="absolute bottom-0 right-5 w-[14px] h-[10px] bg-white z-10 pointer-events-none" />

        {/* ปรับสกรอลล์คอนเทนเนอร์ - ใช้ pl-6 md:pl-8 lg:pl-14 และคำนวณหักลบ pr-5 ของสกรอลล์บาร์ด้วย pr-1 md:pr-3 lg:pr-[36px] เพื่อให้ได้ความสมมาตรซ้ายขวาพอดีเป๊ะ */}
        <div className="h-full overflow-y-auto pl-6 md:pl-8 lg:pl-14 pr-1 md:pr-3 lg:pr-[36px] py-6 flex flex-col premium-scrollbar">
          <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
          {active_questions.map((q, local_idx) => {
            const q_idx = batch_start_idx + local_idx;
            return (
              <div key={q_idx} className="bg-white border border-gray-200 rounded-2xl p-6 md:p-8 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <h3 className="text-[16px] md:text-[18px] font-normal text-[var(--color-black)] leading-relaxed mb-4">
                  {q_idx + 1}. {q.question}
                </h3>

                <div className="flex flex-col gap-3">
                  {q.options.map((opt, o_idx) => {
                    const is_selected = user_answers[q_idx] === o_idx;
                    const letters = ["a.", "b.", "c.", "d."];
                    return (
                      <button
                        key={o_idx}
                        onClick={() => HandleSelect(q_idx, o_idx)}
                        className={`flex items-center gap-4 px-5 py-3.5 rounded-xl border transition-all text-left group w-full ${
                          is_selected 
                            ? "border-[#8c8cf3] bg-[#8c8cf3]/5 text-[#8c8cf3] font-medium" 
                            : "border-gray-200 bg-white hover:border-[#8c8cf3]/50 hover:bg-gray-50 active:scale-[0.995]"
                        }`}
                      >
                        {/* Circular radio indicator */}
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                          is_selected ? "border-[#8c8cf3] bg-[#8c8cf3]" : "border-gray-300 bg-white"
                        }`}>
                          {is_selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className={`text-[14px] md:text-[15px] leading-relaxed transition-colors ${
                          is_selected ? "text-[#8c8cf3]" : "text-gray-700"
                        }`}>
                          <span className="mr-2 font-mono font-medium text-gray-400">{letters[o_idx]}</span>
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Large submit button at bottom */}
          <div className="py-6 shrink-0 pb-12 w-full flex justify-center">
            <button
              onClick={() => {
                CalculateScore(user_answers);
                set_is_submitted(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={is_batch_empty}
              className={`w-full h-[64px] md:h-[68px] rounded-2xl font-bold text-[18px] transition-all flex items-center justify-center gap-2 ${
                is_batch_empty
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                  : "bg-[#8c8cf3] text-white hover:brightness-110 active:scale-95 shadow-[0_4px_14px_-4px_rgba(140,140,243,0.4)]"
              }`}
            >
              Submit Exam
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}

