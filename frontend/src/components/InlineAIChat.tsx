"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Paperclip, Mic, Globe, Image as ImageIcon, Send, Loader2, StopCircle, RefreshCw, Copy, Check } from "lucide-react";
import { apiService, ChatMessage } from "@/services/api";
import { TypewriterEffect } from "./TypewriterEffect";
import { useAuth } from "@/contexts/AuthContext";
import { useUsage } from "@/contexts/UsageContext";
import { useGoogleDrivePicker } from "@/hooks/useGoogleDrivePicker";
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
  const [is_extracting_pdf, set_is_extracting_pdf] = useState(false);
  const { user } = useAuth();
  const { updateFromStream } = useUsage();
  const current_user_id = (user as any)?.uid || 'anonymous';

  /* ไฟล์ภายนอกที่แนบ */
  const [attached_file, set_attached_file] = useState<File | null>(null);
  const [is_menu_open, set_is_menu_open] = useState(false);
  const file_input_ref = useRef<HTMLInputElement>(null);
  const attach_menu_ref = useRef<HTMLDivElement>(null);
  const drag_counter = useRef(0);
  const [is_dragging, set_is_dragging] = useState(false);

  const HandleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      set_attached_file(e.target.files[0]);
    }
    set_is_menu_open(false);
  };

  // --- Google Drive Picker ---
  const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";

  const { openPicker: openGoogleDrivePicker } = useGoogleDrivePicker({
    clientId: GOOGLE_CLIENT_ID,
    apiKey: GOOGLE_API_KEY,
    onFileSelect: (driveFile) => {
      // สร้าง File จำลองจากข้อมูลของ Drive เพื่อแสดงใน UI
      // ในความเป็นจริงต้องส่ง driveFile.url หรือ driveFile.id ไปให้ Backend ประมวลผล
      const mockFile = new File([""], driveFile.name, { type: driveFile.mimeType });
      // แปะ property url เข้าไปเพื่อให้ใช้งานต่อได้ถ้าต้องการ
      (mockFile as any).driveUrl = driveFile.url;
      set_attached_file(mockFile);
      set_is_menu_open(false);
    }
  });

  const HandleAttachClick = () => {
    if (attached_file) {
      set_attached_file(null);
      if (file_input_ref.current) file_input_ref.current.value = '';
    } else {
      set_is_menu_open(!is_menu_open);
    }
  };

  // --- Drag and Drop ---
  // --- การลากวางไฟล์ (Drag and Drop Event Handlers) ---
  // ดักจับเมื่อผู้ใช้ลากไฟล์เข้ามาในส่วนขอบเขตของแชท
  const HandleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    drag_counter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      set_is_dragging(true);
    }
  };

  // ดักจับเมื่อผู้ใช้ลากไฟล์ออกไปจากส่วนขอบเขต
  const HandleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    drag_counter.current--;
    if (drag_counter.current === 0) {
      set_is_dragging(false);
    }
  };

  // ดักจับขณะที่ผู้ใช้กำลังลากไฟล์ค้างไว้เหนือขอบเขต
  const HandleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // ดักจับเมื่อผู้ใช้วางไฟล์ในขอบเขตอินพุต
  const HandleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    set_is_dragging(false);
    drag_counter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // ดึงไฟล์แรกออกมาและตรวจสอบความถูกต้องของประเภทไฟล์
      const file = e.dataTransfer.files[0];
      if (file.type === "application/pdf" || file.name.endsWith('.pdf')) {
        set_attached_file(file);
      } else {
        alert("กรุณาอัปโหลดไฟล์ PDF เท่านั้นครับ");
      }
      e.dataTransfer.clearData();
    }
  };

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (attach_menu_ref.current && !attach_menu_ref.current.contains(event.target as Node)) {
        set_is_menu_open(false);
      }
    };
    if (is_menu_open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [is_menu_open]);

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
  
  /* Auto-scroll เมื่อมีข้อความใหม่ */
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
    
    // ป้องกันการส่งข้อความหากไม่มีทั้งข้อความและไฟล์แนบ หรือกำลังโหลด/สกัด PDF อยู่
    if ((!actual_text && !attached_file) || isLoading || is_extracting_pdf) return;

    /* System prompt สำหรับ AI */
    const systemMessage: ChatMessage = { 
      role: 'system', 
      content: `คุณคือติวเตอร์อัจฉริยะในวิชา ${courseName} ที่มีความเชี่ยวชาญสูงในการเขียนโปรแกรมและวิทยาการคอมพิวเตอร์ จงตอบคำถามอย่างสร้างสรรค์ โดยเน้นเนื้อหาจากบทเรียนเรื่อง \"${currentLesson}\" เป็นหลัก แต่สามารถขยายความ เขียนโค้ดตัวอย่าง หรืออธิบายหัวข้อที่เกี่ยวข้องได้เสมอ ตอบอย่างกระชับ ตรงประเด็น ใช้ Markdown เท่านั้น และระบุหัวข้อที่อ้างอิงถึงเสมอ **ข้อสำคัญ: ห้ามใช้ Emoji หรือสัญลักษณ์รูปภาพใดๆ ในคำตอบโดยเด็ดขาด**` 
    };

    let processed_text = actual_text;
    const display_user_content = actual_text || `📂 แนบไฟล์เอกสาร: ${attached_file?.name}`;

    // 📌 ดำเนินการสกัดข้อความจากเอกสาร PDF ฝั่ง Backend
    if (attached_file) {
      set_is_extracting_pdf(true);
      try {
        const extract_result = await apiService.extractPdfText(attached_file);
        if (extract_result && extract_result.text) {
          // เสริมโครงสร้างข้อความ context ส่งต่อให้ AI
          processed_text = `[ไฟล์เอกสารแนบ: ${attached_file.name}]\n\n--- เริ่มต้นเนื้อหาจากไฟล์เอกสาร ---\n${extract_result.text}\n--- สิ้นสุดเนื้อหาจากไฟล์เอกสาร ---\n\nคำถาม: ${actual_text || "ช่วยสรุปเนื้อหาและประเด็นสำคัญของไฟล์เอกสารนี้ให้หน่อยครับ"}`;
        }
      } catch (err: any) {
        console.error("PDF Extraction failed:", err);
        alert(err.message || "ไม่สามารถอ่านหรือสกัดข้อความจากไฟล์ PDF นี้ได้ กรุณาลองใหม่อีกครั้งครับ");
        set_is_extracting_pdf(false);
        return; // หยุดทำงานหากสกัดข้อมูลไม่ได้
      } finally {
        set_is_extracting_pdf(false);
      }
    }

    const newMessages: ChatMessage[] = [systemMessage, ...messages, { role: 'user', content: processed_text }];
    
    /* แสดงข้อความผู้ใช้ + placeholder สำหรับ AI response */
    const displayMessages = [...messages, { role: 'user', content: display_user_content, animate: false } as ChatMessage];
    setMessages([...displayMessages, { role: 'assistant', content: "", animate: true }]);
    
    setInput("");
    set_attached_file(null); // ล้างไฟล์แนบ
    if (file_input_ref.current) file_input_ref.current.value = '';
    
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
            updateFromStream(usageData);
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
              updateFromStream(usageData);
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

  // ฟังก์ชันย่อยสำหรับเรนเดอร์ช่องกรอกข้อความและแนบไฟล์ (Input Form) แบบนำมาใช้ใหม่ได้ตามเงื่อนไข (DRY Principle)
  const RenderInputForm = (is_initial: boolean = false) => {
    return (
      <div 
        className="relative w-full"
        onDragEnter={HandleDragEnter}
        onDragLeave={HandleDragLeave}
        onDragOver={HandleDragOver}
        onDrop={HandleDrop}
      >
        <form 
          onSubmit={HandleSendMessage}
          className={`relative flex items-end gap-2 bg-[var(--color-gray-50)] border border-[var(--color-gray-300)] focus-within:border-[var(--color-primary)] focus-within:bg-white focus-within:shadow-[0_0_25px_rgba(177,178,255,0.45)] rounded-[24px] p-1.5 transition-all duration-500 w-full ${is_initial ? 'scale-105' : ''} ${is_dragging ? 'h-[148px]' : ''}`}
        >
          {/* 📌 หน้าจอ Overlay เมื่อลากไฟล์เข้ามาวาง (ย้ายเข้าข้างใน form เพื่อให้ขนาดโค้งมนและเอฟเฟกต์ขยาย scale-105 เท่ากับกล่องจริง 100%) */}
          {is_dragging && (
            <div className="absolute -inset-[1px] z-50 bg-white/95 backdrop-blur-[1.5px] border-2 border-[var(--color-primary)]/40 shadow-[0_8px_32px_rgba(177,178,255,0.15)] rounded-[24px] flex flex-col items-center justify-center transition-all duration-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mb-1.5 opacity-90">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
              <span className="text-[var(--color-primary)] text-[13px] font-bold tracking-wide opacity-90">วางไฟล์ที่นี่</span>
            </div>
          )}

          {/* ปุ่มเพิ่มไฟล์ภายนอกและเมนู Dropdown */}
          <div className="flex items-center pl-1 pb-1 relative" ref={attach_menu_ref}>
            <input 
              type="file" 
              ref={file_input_ref} 
              className="hidden" 
              accept=".pdf"
              onChange={HandleFileChange} 
            />
            
            <button 
              type="button" 
              onClick={HandleAttachClick}
              disabled={is_extracting_pdf || isLoading}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--color-gray-400)] hover:text-[var(--color-gray-700)] hover:bg-[var(--color-gray-200)] transition-all duration-300 shrink-0 group relative disabled:opacity-50 disabled:cursor-not-allowed"
              title={attached_file ? "Remove file" : "Attach"}
            >
              <svg 
                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" 
                className={`transition-all duration-300 ${(attached_file || is_menu_open) ? 'text-[var(--color-gray-700)]' : 'group-hover:scale-110'}`}
                style={{ transform: (attached_file || is_menu_open) ? 'rotate(45deg)' : 'rotate(0deg)' }}
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>

            {/* Dropdown Menu */}
            {is_menu_open && !attached_file && (
              <div className="absolute top-[32px] left-0 mt-0 w-[240px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100 py-2 flex flex-col z-50 animate-fade-in-down origin-top-left">
                <button 
                  type="button"
                  onClick={() => file_input_ref.current?.click()}
                  disabled={is_extracting_pdf || isLoading}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed w-full"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <text x="6.5" y="16.5" fontSize="6.5" fontWeight="bold" fill="currentColor" stroke="none" fontFamily="sans-serif">PDF</text>
                  </svg>
                  <span className="text-[14px] font-medium">อัปโหลดไฟล์ PDF</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col flex-1 justify-end">
            {/* File Attachment Preview */}
            {attached_file && (
              <div className="relative group -ml-11 mt-2 mb-0 w-20 h-24 bg-[var(--color-gray-100)] rounded-[14px] p-2.5 flex flex-col gap-2 border border-[var(--color-gray-200)] shadow-sm">
                {/* PDF Badge */}
                <div className="bg-[#E53935] w-fit rounded-[4px] px-1.5 py-0.5">
                  <span className="text-white text-[9px] font-bold tracking-wide">PDF</span>
                </div>
                {/* Filename */}
                <div className="flex-1 mt-1 text-[11px] leading-snug text-[var(--color-gray-600)] break-words line-clamp-3 overflow-hidden font-medium" title={attached_file.name}>
                  {attached_file.name}
                </div>
                {/* Delete button on hover */}
                <button 
                  type="button"
                  onClick={() => {
                    set_attached_file(null);
                    if (file_input_ref.current) file_input_ref.current.value = '';
                  }}
                  disabled={is_extracting_pdf || isLoading}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md border border-[var(--color-gray-200)] text-[var(--color-gray-500)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
            )}

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  HandleSendMessage(e);
                }
              }}
              disabled={is_extracting_pdf || isLoading}
              placeholder={is_extracting_pdf ? "กำลังวิเคราะห์เอกสาร PDF..." : "ถามโจทย์ หรือให้อธิบายเนื้อหา..."}
              className="flex-1 max-h-48 min-h-[44px] bg-transparent border-none outline-none focus:outline-none focus:ring-0 resize-none px-4 py-3 text-[14px] leading-relaxed text-[var(--color-black)] placeholder:text-[var(--color-gray-400)] no-scrollbar disabled:opacity-50 disabled:cursor-not-allowed"
              rows={1}
            />
          </div>
          
          <div className="flex items-center pr-1 pb-0.5">
            <button 
              type={isLoading ? "button" : "submit"}
              onClick={isLoading ? HandleStopGeneration : undefined}
              disabled={(!input.trim() && !isLoading && !attached_file) || is_extracting_pdf}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                (input.trim() || isLoading || attached_file)
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
    );
  };

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

      {/* 📌 พื้นที่เนื้อหาหลักแบ่งออกเป็น 2 Flow อย่างยืดหยุ่นตามความพร้อมการแชท (Responsive Layout Optimization) */}
      <div className="flex-1 relative overflow-hidden">
        
        {/* 🚀 CASE A: เมื่อเปิดแชทเริ่มต้น ยังไม่มีการส่งข้อความ (ใช้ Normal Block Flow ในแนวตั้ง ไม่มี Absolute / TranslateY) */}
        {!has_sent_message ? (
          <div className="h-full w-full flex flex-col justify-center items-center p-6 sm:p-8 overflow-y-auto space-y-6 sm:space-y-8 select-none z-10">
            {/* ตัวอนิเมชั่น AILoader ด้านบนสุด */}
            <div className="transform transition-all duration-1000 hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center shrink-0">
              <AILoader isThinking={true} size={1.2} />
            </div>

            {/* ข้อความชื่อบทเรียนและยินดีต้อนรับ */}
            <div className="text-center space-y-4 max-w-2xl px-4 shrink-0">
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-white/90 tracking-wider uppercase drop-shadow-2xl break-words whitespace-normal">
                {courseName}
              </h3>
              <div className="text-white/70 text-[14px] sm:text-[15px] leading-relaxed font-medium px-4">
                <TypewriterEffect 
                  text={`สวัสดีครับ! มีข้อสงสัยไหนในวิชา ${courseName} ที่อยากให้ผมช่วยอธิบายเพิ่มเติมไหมครับ?`} 
                  animate={true} 
                />
              </div>
            </div>

            {/* ช่องฟอร์มรับคำถามเริ่มต้น (Scale-105 เด่นสง่าและไม่มีทางทับซ้อนกัน) */}
            <div className="w-full max-w-[480px] px-6 shrink-0">
              {RenderInputForm(true)}
            </div>

            {/* ชิปคำสั่งลัดคำถามด่วน (Quick Prompt Chips) เรียงด้านล่างอย่างเป็นระเบียบ */}
            {!isLoading && (
              <div className="w-full max-w-[480px] flex flex-wrap justify-center gap-1.5 md:gap-2 px-4 shrink-0">
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
        ) : (
          /* 💬 CASE B: เมื่อส่งข้อความโต้ตอบกันแล้ว (สลับมาแสดงประวัติคำสนทนา พร้อมหน้าต่างเลื่อนขึ้นลงปกติ) */
          <div className="h-full relative overflow-hidden bg-black/5">
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
              className="h-full overflow-y-auto premium-scrollbar px-5 py-6 flex flex-col gap-6 relative z-0"
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

              {/* PDF Scanning Animation */}
              {is_extracting_pdf && (
                <div className="flex justify-start animate-fade-in-up py-2">
                  <div className="flex gap-4 items-center">
                    <div className="w-9 h-9 flex items-center justify-center shrink-0 rounded-full bg-[#E53935]/15 backdrop-blur-sm border border-[#E53935]/30 overflow-hidden">
                      <Loader2 className="w-4 h-4 text-[#E53935] animate-spin" />
                    </div>
                    <span className="text-[12px] text-white/50 font-medium tracking-wide animate-pulse">กำลังสแกนและวิเคราะห์ไฟล์ PDF...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* 🚀 CASE B (ต่อ): ส่วนกล่องพิมพ์ข้อความด้านล่างสุดของตัวกล่องแชท (แสดงผลเฉพาะเมื่อเริ่มการพิมพ์โต้ตอบจริงเท่านั้น) */}
      {has_sent_message && (
        <div className="relative z-20 py-4 shrink-0 bg-transparent transition-all duration-500">
          <div className="w-full flex flex-col items-center">
            <div className="w-full max-w-[480px] px-6 mx-auto">
              {RenderInputForm(false)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
