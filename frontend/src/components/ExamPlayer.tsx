"use client";

import { useState } from "react";
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
  onGenerateMore?: (instruction: string) => Promise<void>;
}

export function ExamPlayer({ questions, OnClose, topics: course_topics, courseName, userId, onGenerateMore }: ExamPlayerProps) {
  const [current_idx, set_current_idx] = useState(0);
  const [selected_option, set_selected_option] = useState<number | null>(null);
  const [user_answers, set_user_answers] = useState<(number | null)[]>([]);
  
  const [is_submitted, set_is_submitted] = useState(false);
  const [final_score, set_final_score] = useState(0);
  const [result_data, set_result_data] = useState<any>(null);
  
  const [generatingAnalysis, setGeneratingAnalysis] = useState(false);
  const [ai_analysis_text, set_ai_analysis_text] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Custom Prompt Modal States
  const [show_prompt_modal, set_show_prompt_modal] = useState(false);
  const [custom_prompt, set_custom_prompt] = useState("");
  const [is_generating_more, set_is_generating_more] = useState(false);

  // Review Answers State
  const [is_reviewing, set_is_reviewing] = useState(false);
  const [is_viewing_analysis, set_is_viewing_analysis] = useState(false);

  // Safety check to prevent crash when mounted with empty data
  if (!questions || questions.length === 0) {
    return null;
  }

  const HandleSelect = (opt_idx: number) => {
    set_selected_option(opt_idx);
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

  const HandleGenerateMore = async () => {
    if (!onGenerateMore) return;
    set_is_generating_more(true);
    try {
      await onGenerateMore(custom_prompt);
      set_show_prompt_modal(false);
      set_custom_prompt("");
      
      // Resume quiz
      set_current_idx(prev => prev + 1);
      set_selected_option(null);
      set_is_submitted(false);
      set_is_reviewing(false);
      set_ai_analysis_text(null); // clear old analysis for next batch
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
      console.error("PDF Formal Export Error:", error);
      alert(`ไม่สามารถสร้างรายงาน PDF ได้: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // --- REVIEW MODE ---
  if (is_reviewing) {
    return (
      <div className="h-full flex flex-col bg-white animate-in fade-in duration-700">
        <div className="flex items-center justify-between px-6 md:px-8 py-4 border-b border-gray-100 shrink-0 sticky top-0 bg-white/80 backdrop-blur-md z-10">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-black)]">Review Answers</h2>
            <p className="text-xs font-bold text-[var(--color-gray-400)] uppercase tracking-widest mt-0.5">Exam Final Check</p>
          </div>
          <button onClick={() => set_is_reviewing(false)} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm transition-all active:scale-95">
            Back to Summary
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 custom-exam-scrollbar">
          <div className="max-w-3xl mx-auto space-y-8">
          {questions.map((q, idx) => {
            const userAnswer = user_answers[idx];
            const isCorrect = userAnswer === q.correct_answer;
            const isUnanswered = userAnswer === null || userAnswer === undefined;
            const letters = ["a.", "b.", "c.", "d."];

            return (
              <div key={idx} className={`p-6 md:p-8 rounded-[24px] border-2 transition-all ${isCorrect ? 'border-green-100 bg-green-50/30' : 'border-red-100 bg-red-50/30'}`}>
                <div className="flex items-start gap-4 mb-6">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {isCorrect ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-black text-gray-400 uppercase tracking-wider">Question {idx + 1}</span>
                      {q.domain && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase">{q.domain}</span>}
                    </div>
                    <h3 className="text-[17px] font-medium text-gray-900 leading-relaxed">{q.question}</h3>
                  </div>
                </div>

                <div className="space-y-3 pl-0 md:pl-12">
                  {q.options.map((opt, oIdx) => {
                    const isSelected = userAnswer === oIdx;
                    const isCorrectOption = q.correct_answer === oIdx;
                    
                    let bgClass = "bg-white border-gray-200";
                    let textClass = "text-gray-600";
                    let ringClass = "";

                    if (isCorrectOption) {
                      bgClass = "bg-green-50 border-green-500";
                      textClass = "text-green-800 font-bold";
                      ringClass = isSelected ? "ring-2 ring-green-500 ring-offset-2" : "";
                    } else if (isSelected && !isCorrectOption) {
                      bgClass = "bg-red-50 border-red-500";
                      textClass = "text-red-800 font-bold";
                    }

                    return (
                      <div key={oIdx} className={`flex items-start gap-4 p-4 rounded-xl border-2 ${bgClass} ${ringClass}`}>
                        <span className={`text-[15px] font-mono font-bold mt-0.5 ${isCorrectOption ? 'text-green-600' : isSelected ? 'text-red-600' : 'text-gray-400'}`}>
                          {letters[oIdx]}
                        </span>
                        <span className={`text-[15px] leading-relaxed ${textClass}`}>{opt}</span>
                        {isSelected && (
                          <span className="ml-auto text-[11px] font-black uppercase tracking-widest text-gray-400 mt-1">Your Answer</span>
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
          <button onClick={() => set_is_viewing_analysis(false)} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold text-sm transition-all active:scale-95">
            Back to Summary
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8 custom-exam-scrollbar">
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
        {/* Custom Prompt Modal */}
        {show_prompt_modal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-white rounded-[24px] p-8 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-2xl font-black text-gray-900 mb-2">ออกแบบข้อสอบชุดถัดไป</h3>
              <p className="text-sm text-gray-500 mb-6">เลือกแนวทางข้อสอบ 5 ข้อถัดไป หรือพิมพ์คำสั่งพิเศษให้ AI</p>
              
              <div className="flex flex-wrap gap-2 mb-6">
                <button onClick={() => set_custom_prompt("ขอข้อสอบที่ยากขึ้น เน้นการวิเคราะห์เชิงลึก")} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-full text-sm font-bold transition-colors">🔥 ขอยากขึ้น</button>
                <button onClick={() => set_custom_prompt("ขอข้อสอบระดับพื้นฐาน เน้นความจำและความเข้าใจ")} className="px-4 py-2 bg-green-50 text-green-600 hover:bg-green-100 rounded-full text-sm font-bold transition-colors">🌱 เน้นพื้นฐาน</button>
                <button onClick={() => set_custom_prompt("ขอข้อสอบที่เน้นการนำไปใช้งานจริง (Apply/Create)")} className="px-4 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-full text-sm font-bold transition-colors">🚀 เน้นประยุกต์ใช้</button>
                <button onClick={() => set_custom_prompt("")} className="px-4 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-full text-sm font-bold transition-colors">🔄 สุ่มเหมือนเดิม</button>
              </div>

              <textarea 
                value={custom_prompt}
                onChange={e => set_custom_prompt(e.target.value)}
                placeholder="หรือพิมพ์คำสั่งพิเศษ เช่น 'ขอเน้นเรื่อง Array และ Linked List เป็นพิเศษ'"
                className="w-full h-24 p-4 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none resize-none text-sm font-medium mb-6 transition-all"
              />

              <div className="flex gap-3">
                <button 
                  onClick={() => set_show_prompt_modal(false)} 
                  disabled={is_generating_more}
                  className="flex-1 py-3.5 rounded-xl border-2 border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={HandleGenerateMore} 
                  disabled={is_generating_more}
                  className="flex-[2] py-3.5 rounded-xl bg-[var(--color-primary)] text-white font-bold hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {is_generating_more ? (
                    <><svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/></svg> กำลังสร้าง...</>
                  ) : "สร้างข้อสอบ 5 ข้อถัดไป"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-6 md:px-12 py-6 border-b border-gray-100 shrink-0">
          <div>
            <h1 className="text-2xl font-black text-[var(--color-black)]">Exam Results</h1>
            <p className="text-sm font-bold text-[var(--color-primary)] mb-1">{courseName}</p>
          </div>
          <button onClick={OnClose} className="p-2 text-[var(--color-gray-400)] hover:text-black rounded-full transition-all active:scale-90">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div id="result-container" className="flex-1 overflow-y-auto px-6 md:px-12 py-8 custom-exam-scrollbar">
          <div className="flex flex-col gap-8 pb-10 max-w-6xl mx-auto">
            
            {/* ROW 1: Scores & Radar */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left: Score & Topics */}
              <div className="lg:col-span-5 flex flex-col gap-8">
                <div className="bg-white border border-[var(--color-gray-100)] rounded-[32px] p-6 flex items-center gap-6 shadow-sm shrink-0">
                  <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full -rotate-90">
                      <circle cx="56" cy="56" r="48" fill="none" stroke="var(--color-gray-100)" strokeWidth="10" />
                      <circle cx="56" cy="56" r="48" fill="none" stroke="var(--color-primary)" strokeWidth="10" strokeDasharray={301.59} strokeDashoffset={301.59 - (301.59 * percentage) / 100} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center mt-1">
                      <span className="text-3xl font-black text-[var(--color-black)]">{final_score}</span>
                      <span className="text-[11px] font-bold text-[var(--color-gray-400)]">/ {questions.length}</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[var(--color-black)] mb-1">Overall Score</h3>
                    <p className="text-sm text-[var(--color-gray-500)] leading-tight">You scored {Math.round(percentage)}% on this exam batch.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <h4 className="text-[11px] font-bold text-[var(--color-gray-400)] uppercase tracking-widest ml-1">Topic Analysis</h4>
                  <div className="flex flex-col gap-2">
                    {display_topics.map((t, idx) => (
                      <div key={idx} className="bg-white rounded-2xl p-4 border border-[var(--color-gray-100)] shadow-sm shrink-0">
                        <div className="flex justify-between items-center mb-2">
                          <div className="text-xs font-bold text-[var(--color-black)] truncate pr-2">{t.name}</div>
                          <div className="text-right whitespace-nowrap">
                            <span className="text-base font-black text-[var(--color-primary)]">{t.score}</span>
                            <span className="text-[10px] font-bold text-[var(--color-gray-400)]"> / {t.total}</span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--color-gray-100)] rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--color-primary)] transition-all duration-1000 delay-300" style={{ width: `${t.total > 0 ? (t.score / t.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Radar Chart */}
              <div className="lg:col-span-7 h-full">
                <div className="bg-white border border-[var(--color-gray-100)] rounded-[32px] p-6 shadow-sm flex flex-col items-center justify-center h-full min-h-[350px]">
                  <h4 className="text-[11px] font-bold text-[var(--color-gray-400)] uppercase tracking-widest mb-2 w-full text-left">Bloom's Taxonomy Analytics</h4>
                  <div className="w-full flex-1 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={result_data.chartData}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 'bold' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                        <Radar name="Performance" dataKey="A" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.4} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Analysis Section */}
            <div className="w-full border-t border-gray-100 pt-8 mt-4">
              {!ai_analysis_text ? (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-[32px] p-8 md:p-12 border border-indigo-100 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm mb-6">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  </div>
                  <h3 className="text-2xl font-black text-indigo-950 mb-3">วิเคราะห์จุดแข็งด้วย AI</h3>
                  <p className="text-indigo-700/80 font-medium mb-8 max-w-lg">
                    ให้ระบบ AI ของเราวิเคราะห์ผลคะแนนและรูปแบบการตอบของคุณอย่างละเอียด พร้อมให้คำแนะนำในการพัฒนาที่ตรงจุด
                  </p>
                  <button 
                    onClick={GenerateAIAnalysis}
                    className="bg-indigo-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-xl shadow-indigo-200 flex items-center gap-3"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> Generate AI Analysis
                  </button>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-[32px] p-8 md:p-12 border border-indigo-100 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-indigo-500 shadow-sm mb-6">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  </div>
                  <h3 className="text-2xl font-black text-indigo-950 mb-3">การวิเคราะห์เสร็จสมบูรณ์</h3>
                  <p className="text-indigo-700/80 font-medium mb-8 max-w-lg">
                    AI ได้วิเคราะห์จุดแข็งและให้คำแนะนำในการพัฒนาที่ตรงจุดสำหรับคุณเรียบร้อยแล้ว
                  </p>
                  <button 
                    onClick={() => set_is_viewing_analysis(true)}
                    className="bg-indigo-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-xl shadow-indigo-200 flex items-center gap-3"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg> View AI Analysis & PDF
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons Row */}
            <div className="flex gap-4 pt-4 mt-4 border-t border-gray-100">
              <button onClick={OnClose} className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-2xl font-bold text-lg transition-all active:scale-95">
                ปิด / กลับไปหน้าเรียน
              </button>
              <button onClick={() => set_is_reviewing(true)} className="flex-1 py-4 border-2 border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 rounded-2xl font-bold text-lg transition-all active:scale-95">
                เฉลยและทบทวน (Review)
              </button>
              {onGenerateMore && (
                <button 
                  onClick={() => set_show_prompt_modal(true)}
                  className="flex-[1.5] py-4 bg-[var(--color-primary)] text-white hover:brightness-110 rounded-2xl font-bold text-lg transition-all active:scale-95 shadow-lg shadow-indigo-200"
                >
                  ทำข้อสอบเพิ่มอีก 5 ข้อ
                </button>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  }

  // --- QUESTION MODE (Like Quiz) ---
  const q = questions[current_idx];
  const progressPercent = ((current_idx) / questions.length) * 100;

  return (
    <div className="h-full flex flex-col bg-white animate-in fade-in duration-700 overflow-hidden relative">
      <div className="absolute top-0 left-0 h-1.5 bg-gray-100 w-full z-20">
        <div className="h-full bg-[#8c8cf3] transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="flex items-center justify-between px-6 md:px-10 py-5 border-b border-gray-100 z-10 bg-white">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-black)] leading-tight">Course Examination</h2>
          <p className="text-[11px] font-bold text-[var(--color-gray-400)] uppercase tracking-widest mt-1">
            Question {current_idx + 1} of {questions.length}
          </p>
        </div>
        <button onClick={OnClose} className="p-2 text-[var(--color-gray-400)] hover:bg-gray-50 rounded-full transition-colors active:scale-90">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-10 py-8 md:py-12 flex flex-col custom-exam-scrollbar">
        <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col">
          {q.domain && (
            <div className="mb-4 flex">
              <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold uppercase tracking-widest border border-indigo-100">
                {q.domain}
              </span>
            </div>
          )}

          <h3 className="text-[22px] md:text-[26px] font-medium text-[var(--color-black)] leading-snug mb-10">
            {q.question}
          </h3>

          <div className="grid grid-cols-1 gap-4 mb-10">
            {q.options.map((opt, o_idx) => {
              const is_selected = selected_option === o_idx;
              const letters = ["a.", "b.", "c.", "d."];
              
              return (
                <button
                  key={o_idx}
                  onClick={() => HandleSelect(o_idx)}
                  className={`flex items-center gap-5 p-5 md:p-6 rounded-[20px] border-2 transition-all text-left group ${
                    is_selected 
                      ? "border-[#8c8cf3] bg-[#8c8cf3]/5 shadow-[0_8px_20px_-10px_rgba(140,140,243,0.3)] scale-[1.01]" 
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99]"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    is_selected ? "border-[#8c8cf3] bg-[#8c8cf3]" : "border-gray-300 bg-white"
                  }`}>
                    {is_selected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                  </div>
                  <span className={`text-[16px] md:text-[18px] leading-relaxed transition-colors ${
                    is_selected ? "text-[var(--color-black)] font-semibold" : "text-gray-700"
                  }`}>
                    <span className={`mr-4 font-mono font-bold uppercase ${is_selected ? "text-[#8c8cf3]" : "text-gray-400"}`}>
                      {letters[o_idx]}
                    </span>
                    {opt}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex justify-between items-center pt-6 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-400">
              {selected_option !== null ? "คลิก Next เพื่อไปยังข้อถัดไป" : "กรุณาเลือกคำตอบ"}
            </p>
            <button
              onClick={HandleNext}
              disabled={selected_option === null}
              className={`px-10 py-4 rounded-2xl font-bold text-[17px] transition-all flex items-center gap-3 ${
                selected_option === null
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
                  : "bg-[#8c8cf3] text-white hover:brightness-110 active:scale-95 shadow-xl shadow-indigo-200"
              }`}
            >
              {current_idx < questions.length - 1 ? (
                <>Next Question <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></>
              ) : (
                "Finish & See Results"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
