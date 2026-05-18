"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { apiService, ChatMessage } from "@/services/api";
import { TypewriterEffect } from "./TypewriterEffect";
import { useAuth } from "@/contexts/AuthContext";
import { AILoader } from "./AILoader";

/* ===== ค่าคงที่สำหรับ Quick Prompt Chips ===== */
const QUICK_PROMPTS = [
  { label: "สรุปเนื้อหา", prompt: "ช่วยสรุปเนื้อหาบทเรียนนี้ให้หน่อยครับ" },
  { label: "ขอตัวอย่างโค้ด", prompt: "ขอตัวอย่างโค้ดที่เกี่ยวกับเนื้อหาบทเรียนนี้หน่อยครับ" },
  { label: "อธิบาย concept", prompt: "ช่วยอธิบาย concept หลักของบทเรียนนี้ให้เข้าใจง่ายๆ หน่อยครับ" },
  { label: "ให้โจทย์ฝึกทำ", prompt: "ขอโจทย์ฝึกทำเกี่ยวกับเนื้อหาบทเรียนนี้หน่อยครับ" },
];

interface InlineAIChatProps {
  courseName: string;
  initialTopic?: string;
  currentLesson?: string;
  externalPrompt?: string;
  onPromptProcessed?: () => void;
}

/**
 * CopyButton Component
 * ปุ่มสำหรับคัดลอกข้อความพร้อม Feedback เมื่อกดสำเร็จ
 */
function CopyButton({ text }: { text: string }) {
  const [is_copied, set_is_copied] = useState(false);

  const HandleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      set_is_copied(true);
      setTimeout(() => set_is_copied(false), 2000);
    } catch (err) {
      console.error("Failed to copy!", err);
    }
  };

  return (
    <button
      onClick={HandleCopy}
      className="mt-2 flex items-center gap-1.5 text-white/40 hover:text-white transition-colors duration-200 group"
      title="Copy message"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span className="text-[10px] font-bold uppercase tracking-wider transition-opacity">
        {is_copied ? "Copied!" : ""}
      </span>
    </button>
  );
}

export function InlineAIChat({ courseName, currentLesson, initialTopic, externalPrompt, onPromptProcessed }: InlineAIChatProps) {
  /* สร้างข้อความต้อนรับเริ่มต้น */
  const CreateWelcomeMessage = useCallback((): ChatMessage => ({
    role: 'assistant',
    content: `สวัสดีครับ! มีข้อสงสัยไหนในวิชา **${courseName}** ที่อยากให้ผมช่วยอธิบายเพิ่มเติมไหมครับ?`,
    animate: false
  }), [courseName]);

  const [messages, setMessages] = useState<ChatMessage[]>([CreateWelcomeMessage()]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [quota, setQuota] = useState({ used: 0, limit: 100000 });
  const { user } = useAuth();
  const current_user_id = (user as any)?.uid || 'anonymous';

  /* #2 — Scroll to Bottom: ตรวจสอบว่าผู้ใช้ scroll ขึ้นไปหรือไม่ */
  const [is_at_bottom, set_is_at_bottom] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages_container_ref = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /* ตรวจสอบว่าเคยส่งข้อความแล้วหรือยัง — ใช้แสดง/ซ่อน Quick Prompts */
  const has_sent_message = messages.length > 1;

  const ScrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const HandleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  /* Auto-scroll เมื่อมีข้อความใหม่ */
  useEffect(() => {
    if (is_at_bottom) {
      ScrollToBottom();
    }
  }, [messages, is_at_bottom]);

  /* #2 — ตรวจจับ scroll position เพื่อแสดง/ซ่อนปุ่ม Scroll to Bottom */
  useEffect(() => {
    const container = messages_container_ref.current;
    if (!container) return;

    const HandleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      /* ถ้าห่างจากล่างสุดไม่เกิน 100px ถือว่าอยู่ด้านล่าง */
      const is_near_bottom = scrollHeight - scrollTop - clientHeight < 100;
      set_is_at_bottom(is_near_bottom);
    };

    container.addEventListener('scroll', HandleScroll, { passive: true });
    return () => container.removeEventListener('scroll', HandleScroll);
  }, []);
  
  /* Load Quota on mount */
  useEffect(() => {
    const fetchQuota = async () => {
      const data = await apiService.getUserQuota(current_user_id);
      setQuota(data);
    };
    fetchQuota();
  }, [current_user_id]);

  /* Handle external prompts (e.g. from clicking keywords) */
  useEffect(() => {
    if (externalPrompt) {
      setInput(externalPrompt);
    }
  }, [externalPrompt]);

  /* Notify parent that prompt was received */
  useEffect(() => {
    if (externalPrompt && input === externalPrompt) {
      onPromptProcessed?.();
    }
  }, [input, externalPrompt, onPromptProcessed]);

  /* ===== ฟังก์ชันส่งข้อความหลัก ===== */
  const HandleSendMessage = async (e: React.FormEvent, override_input?: string) => {
    e?.preventDefault?.();
    const actual_text = override_input || input.trim();
    if (!actual_text || isLoading) return;

    /* System prompt สำหรับ AI */
    const systemMessage: ChatMessage = { 
      role: 'system', 
      content: `คุณคือติวเตอร์อัจฉริยะในวิชา ${courseName} ที่มีความเชี่ยวชาญสูงในการเขียนโปรแกรมและวิทยาการคอมพิวเตอร์ จงตอบคำถามอย่างสร้างสรรค์ โดยเน้นเนื้อหาจากบทเรียนเรื่อง \"${currentLesson}\" เป็นหลัก แต่สามารถขยายความ เขียนโค้ดตัวอย่าง หรืออธิบายหัวข้อที่เกี่ยวข้องได้เสมอ ตอบอย่างกระชับ ตรงประเด็น ใช้ Markdown เท่านั้น และระบุหัวข้อที่อ้างอิงถึงเสมอ **ข้อสำคัญ: ห้ามใช้ Emoji หรือสัญลักษณ์รูปภาพใดๆ ในคำตอบโดยเด็ดขาด**` 
    };

    const newMessages: ChatMessage[] = [systemMessage, ...messages, { role: 'user', content: actual_text }];
    
    /* แสดงข้อความผู้ใช้ + placeholder สำหรับ AI response */
    const displayMessages = [...messages, { role: 'user', content: actual_text, animate: false } as ChatMessage];
    setMessages([...displayMessages, { role: 'assistant', content: "", animate: true }]);
    
    setInput("");
    setIsLoading(true);
    set_is_at_bottom(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await apiService.streamChatMessage(newMessages, (chunk) => {
        // ตรวจสอบ metadata ท้าย stream
        if (chunk.includes("__USAGE__:")) {
          try {
            const usageStr = chunk.split("__USAGE__:")[1];
            const usageData = JSON.parse(usageStr);
            setQuota(usageData);
          } catch (e) {
            console.error("Failed to parse usage", e);
          }
          return; // ไม่ต้องนำไปแสดงในเนื้อหาข้อความ
        }

        setMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: updated[lastIndex].content + chunk
          };
          return updated;
        });
      }, current_user_id, controller.signal, currentLesson);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Generation stopped by user');
        return;
      }
      console.error(error);
      setMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        updated[lastIndex] = {
          ...updated[lastIndex],
          content: updated[lastIndex].content + "\n\n*(ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับเซิร์ฟเวอร์)*"
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  /* #1 — Quick Prompt: กดชิปแล้วส่งข้อความทันที */
  const HandleQuickPrompt = (prompt: string) => {
    const fake_event = { preventDefault: () => {} } as React.FormEvent;
    HandleSendMessage(fake_event, prompt);
  };

  /* #3 — Clear Chat: ล้างบทสนทนาทั้งหมด เริ่มใหม่ */
  const HandleClearChat = () => {
    if (isLoading) {
      HandleStopGeneration();
    }
    setMessages([CreateWelcomeMessage()]);
    setInput("");
    set_is_at_bottom(true);
  };

  /* #4 — Regenerate: สร้างคำตอบ AI ใหม่จากคำถามล่าสุด */
  const HandleRegenerate = () => {
    if (isLoading) return;

    /* หาข้อความผู้ใช้ล่าสุด */
    let last_user_message_index = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        last_user_message_index = i;
        break;
      }
    }
    if (last_user_message_index === -1) return;

    const last_user_content = messages[last_user_message_index].content;

    /* ลบ AI response ล่าสุดออก แล้วส่งคำถามใหม่ */
    const messages_without_last_ai = messages.slice(0, last_user_message_index);
    setMessages(messages_without_last_ai);

    /* ส่งข้อความใหม่ในรอบถัดไปหลัง state อัปเดต */
    setTimeout(() => {
      const fake_event = { preventDefault: () => {} } as React.FormEvent;
      setMessages(prev => {
        const systemMessage: ChatMessage = { 
          role: 'system', 
          content: `คุณคือติวเตอร์อัจฉริยะในวิชา ${courseName} ที่มีความเชี่ยวชาญสูงในการเขียนโปรแกรมและวิทยาการคอมพิวเตอร์ จงตอบคำถามอย่างสร้างสรรค์ โดยเน้นเนื้อหาจากบทเรียนเรื่อง \"${currentLesson}\" เป็นหลัก แต่สามารถขยายความ เขียนโค้ดตัวอย่าง หรืออธิบายหัวข้อที่เกี่ยวข้องได้เสมอ ตอบอย่างกระชับ ตรงประเด็น ใช้ Markdown เท่านั้น และระบุหัวข้อที่อ้างอิงถึงเสมอ **ข้อสำคัญ: ห้ามใช้ Emoji หรือสัญลักษณ์รูปภาพใดๆ ในคำตอบโดยเด็ดขาด**`
        };
        const display = [...messages_without_last_ai, { role: 'user', content: last_user_content, animate: false } as ChatMessage];
        
        /* เพิ่ม placeholder สำหรับ AI */
        const with_placeholder = [...display, { role: 'assistant', content: "", animate: true } as ChatMessage];
        
        /* เริ่ม streaming */
        setIsLoading(true);
        set_is_at_bottom(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;
        
        const api_messages: ChatMessage[] = [systemMessage, ...display];
        apiService.streamChatMessage(api_messages, (chunk) => {
          // ตรวจสอบ metadata ท้าย stream
          if (chunk.includes("__USAGE__:")) {
            try {
              const usageStr = chunk.split("__USAGE__:")[1];
              const usageData = JSON.parse(usageStr);
              setQuota(usageData);
            } catch (e) {
              console.error("Failed to parse usage", e);
            }
            return;
          }

          setMessages(p => {
            const u = [...p];
            const li = u.length - 1;
            u[li] = { ...u[li], content: u[li].content + chunk };
            return u;
          });
        }, current_user_id, controller.signal, currentLesson)
        .catch((error: any) => {
          if (error.name !== 'AbortError') {
            setMessages(p => {
              const u = [...p];
              const li = u.length - 1;
              u[li] = { ...u[li], content: u[li].content + "\n\n*(ขออภัยครับ เกิดข้อผิดพลาด)*" };
              return u;
            });
          }
        })
        .finally(() => setIsLoading(false));
        
        return with_placeholder;
      });
    }, 50);
  };

  /* ตรวจสอบว่าข้อความล่าสุดเป็น AI response หรือไม่ (ใช้แสดงปุ่ม Regenerate) */
  const is_last_message_ai = messages.length > 1 && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content;

  return (
    <div className="flex flex-col h-full bg-[var(--color-primary-dark)] rounded-3xl overflow-hidden border border-white/20">
      {/* Header — พร้อมปุ่ม Clear Chat (#3) */}
      <div className="h-[73px] border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-white/5 relative">
        {/* Spacer ซ้าย */}
        <div className="w-9" />

        <h2 className="text-lg font-bold tracking-tight text-white">CHATBOT</h2>


        {/* #3 — ปุ่ม Clear Chat */}
        <button
          onClick={HandleClearChat}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200"
          title="New Chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
      </div>

      {/* Messages Area */}
      <div className={`flex-1 relative overflow-hidden ${has_sent_message ? 'bg-black/5' : 'bg-transparent'}`}>
        {/* กล่องสีม่วงทับลูกศร Scrollbar */}
        <div className="absolute top-0 right-0 w-[14px] h-[12px] bg-[#8c8cf3] z-10 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[14px] h-[12px] bg-[#8c8cf3] z-10 pointer-events-none" />

        {/* #2 — ปุ่ม Scroll to Bottom (แสดงเมื่อ scroll ขึ้นไป) */}
        {!is_at_bottom && (
          <button
            onClick={ScrollToBottom}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-9 h-9 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/25 transition-all duration-300 shadow-lg"
            title="Scroll to bottom"
            style={{ animation: 'FadeInUp 0.3s ease-out' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        )}

        <div 
          ref={messages_container_ref}
          className={`h-full overflow-y-auto premium-scrollbar px-5 py-6 flex flex-col gap-6 relative z-0 transition-all duration-700 ${has_sent_message ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12 pointer-events-none'}`}
        >
          {messages.map((msg, idx) => {
            /* ซ่อน AI message ที่ยังไม่มีเนื้อหา */
            if (msg.role === 'assistant' && !msg.content) return null;
            /* ซ่อนข้อความต้อนรับในลิสต์ถ้าเราโชว์ในหน้า Greeting แล้ว */
            if (idx === 0) return null;
          
            return (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                <div 
                  className={`text-[13.5px] leading-[1.6] ${
                    msg.role === 'user' 
                    ? 'w-fit max-w-[85%] sm:max-w-[calc(100%-104px)] bg-[var(--color-primary)] text-white rounded-[24px] px-4 py-2.5 shadow-[0_6px_20px_rgba(177,178,255,0.3)] mr-0 sm:mr-[52px]' 
                    : 'w-full text-white/90 py-2'
                  }`}
                >
                  {msg.role === 'user' 
                    ? msg.content.replace(/\[Context:.*?\]\s*/, "") 
                    : (
                      <div className="flex gap-4 items-start">
                        <div className="w-9 h-9 flex items-center justify-center shrink-0 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.1)] mt-0.5 overflow-hidden">
                          <AILoader isThinking={isLoading} size={0.35} />
                        </div>
                        <div className="assistant-message-dark pt-2 flex-1 min-w-0 overflow-hidden pr-0 sm:pr-[52px]">
                          <TypewriterEffect text={msg.content} animate={msg.animate} />

                          {/* Action Buttons — Copy + Regenerate (#4) */}
                          {idx !== 0 && !isLoading && (
                            <div className="mt-2 flex items-center gap-3">
                              <CopyButton text={msg.content} />
                              
                              {/* #4 — ปุ่ม Regenerate (แสดงเฉพาะ AI message ล่าสุด) */}
                              {idx === messages.length - 1 && (
                                <button
                                  onClick={HandleRegenerate}
                                  className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors duration-200"
                                  title="Regenerate response"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="23 4 23 10 17 10"></polyline>
                                    <polyline points="1 20 1 14 7 14"></polyline>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
          })}

          {/* Thinking Animation */}
          {isLoading && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
            <div className="flex justify-start animate-fade-in-up py-2">
              <div className="flex gap-4 items-center">
                <div className="w-9 h-9 flex items-center justify-center shrink-0 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 overflow-hidden">
                  <AILoader isThinking={true} size={0.35} />
                </div>
                <span className="text-[12px] text-white/40 font-medium tracking-wide">Thinking....</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Greeting State (แสดงตรงกลางจอใหญ่ๆ ตามรูปภาพ) */}
        {!has_sent_message && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 z-10 transition-all duration-700">
            <div className="mb-16 transform transition-all duration-1000 hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center">
              <AILoader isThinking={true} size={3.15} />
            </div>
            <div className="text-center space-y-8 max-w-2xl animate-fade-in">
              <h3 className="text-4xl font-black text-white/90 tracking-tighter uppercase drop-shadow-2xl">
                {courseName}
              </h3>
              <div className="text-white/60 text-[15px] leading-relaxed font-medium px-6">
                <TypewriterEffect 
                  text={`สวัสดีครับ! มีข้อสงสัยไหนในวิชา ${courseName} ที่อยากให้ผมช่วยอธิบายเพิ่มเติมไหมครับ?`} 
                  animate={true} 
                />
              </div>
              
              {/* Quick Prompt Chips (ย้ายไปจัดวางใต้ฟอร์มกรอกข้อความใน Input Area แล้ว) */}
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompt Chips (ย้ายไปรวมใน Greeting แล้ว) */}

      {/* Input Area - ยกระดับขึ้น 70px ให้พอดีสมมาตรลอยพ้นขอบล่าง 100% โดยไม่สูงเกินไป (Symmetrical 70px) และสไลด์ลงล่างเมื่อส่งข้อความ */}
      {/* ขั้นตอนการปรับปรุงแอนิเมชั่น: เอาเส้นขอบด้านบนและ pt-3 ออกเพื่อแก้ปัญหา "เส้นดำๆ" ที่เกิดจากการแปลงสีและเลย์เอาต์ */}
      {/* เพิ่มเติมระดับพรีเมียม: ใช้ cubic-bezier(0.16, 1, 0.3, 1) (Ease Out Expo) และ will-change เพื่อเร่งประสิทธิภาพของ GPU ให้แอนิเมชั่นสไลด์ลื่นไหล 100% ไร้รอยต่อ */}
      {/* ปรับระยะขอบแนวตั้งจาก pb-6 pt-2 เป็น py-4 เพื่อให้กล่องข้อความจัดวางอยู่กึ่งกลางแนวตั้งของแถบด้านล่างอย่างสมมาตรเมื่อแชทเลื่อนลงมา */}
      <div 
        className="py-4 shrink-0 bg-transparent"
        style={{
          transform: !has_sent_message && !isLoading ? 'translateY(-70px)' : 'translateY(0)',
          transition: 'transform 800ms cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform'
        }}
      >
        <div className="w-full flex flex-col items-center">
          {/* กล่องข้อความกรอกคำถาม - ปรับลดความกว้างสูงสุดให้เท่ากับความกว้างของกลุ่มชุดคำแนะนำด้านล่าง (Pixel-Perfect max-w-[480px]) */}
          <div className="w-full max-w-[480px] px-6 mx-auto">
            {/* ปรับปรุงแอนิเมชั่นระดับพรีเมียม: เพิ่มเอฟเฟกต์เรืองแสง (Focus Glow Effect) สีม่วงนุ่มนวลรอบกล่องข้อความเมื่อมีการโฟกัสพิมพ์คำถาม */}
            <form 
              onSubmit={HandleSendMessage}
              className={`flex items-end gap-2 bg-[var(--color-gray-50)] border border-[var(--color-gray-300)] focus-within:border-[var(--color-primary)] focus-within:bg-white focus-within:shadow-[0_0_25px_rgba(177,178,255,0.45)] rounded-[24px] p-1.5 transition-all duration-500 w-full ${!has_sent_message ? 'scale-105' : ''}`}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    HandleSendMessage(e);
                  }
                }}
                placeholder="ถามโจทย์ หรือให้อธิบายเนื้อหา..."
                className="flex-1 max-h-48 min-h-[44px] bg-transparent border-none outline-none focus:outline-none focus:ring-0 resize-none px-4 py-3 text-[14px] leading-relaxed text-[var(--color-black)] placeholder:text-[var(--color-gray-400)] no-scrollbar"
                rows={1}
              />
              
              <div className="flex items-center pr-1 pb-0.5">
                <button 
                  type={isLoading ? "button" : "submit"}
                  onClick={isLoading ? HandleStopGeneration : undefined}
                  disabled={!input.trim() && !isLoading}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                    (input.trim() || isLoading)
                    ? 'bg-[var(--color-primary)] text-white hover:scale-105 shadow-sm' 
                    : 'bg-transparent text-[var(--color-gray-300)]'
                  }`}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 bg-white rounded-sm animate-pulse" title="Stop generation" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={input.trim() ? "mr-0.5 mt-0.5" : ""}>
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* ปรับปรุงชุดคำแนะนำ (Quick Prompt Chips) ด้านล่างช่องกรอกข้อความ:
              1. ปรับขนาดความกว้างสูงสุดของคอนเทนเนอร์ให้เท่ากับช่องกรอกที่ max-w-[480px] เพื่อความสมมาตร 100%
              2. ลด Padding ของปุ่มเป็น px-3 py-1.5 เพื่อให้ชุดปุ่มทั้งหมดเรียงตัวเป็นแถวเดียวพอดีในกรอบ 480px อย่างสวยงาม
              3. ปรับการจัดระยะห่างตัวอักษรภาษาไทยจาก tracking-widest เป็น tracking-wide เพื่อความสวยงามพรีเมียม
              4. ปรับเปลี่ยนชื่อตัวแปรในการวนลูปให้อยู่ในรูปแบบ snake_case ตามมาตรฐานของระบบอย่างเคร่งครัด */}
          {!isLoading && !has_sent_message && (
            <div className="w-full max-w-[480px] overflow-x-auto no-scrollbar flex flex-nowrap justify-start sm:justify-center gap-1.5 mt-4 px-6 py-3 animate-fade-in mx-auto" style={{ animationDelay: '0.4s' }}>
              {QUICK_PROMPTS.map((quick_prompt_item, prompt_idx) => (
                <button
                  key={prompt_idx}
                  type="button"
                  onClick={() => HandleQuickPrompt(quick_prompt_item.prompt)}
                  className="text-[11px] font-extrabold text-white/50 hover:text-white bg-white/[0.04] hover:bg-white/[0.12] border border-white/5 hover:border-white/20 rounded-full px-3 py-1.5 transition-all duration-300 uppercase tracking-wide shadow-sm active:scale-95 shrink-0 whitespace-nowrap"
                >
                  {quick_prompt_item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
