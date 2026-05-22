"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { apiService, ChatMessage } from "@/services/api";
import { TypewriterEffect } from "./TypewriterEffect";
import { AILoader } from "./AILoader";

export function AIChatPanel() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'สวัสดีครับผม CSLearning AI! มีเรื่องอะไรเกี่ยวกับ Computer Science ที่อยากสอบถามผมไหมครับ?',
    animate: false
  }]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '0px';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const systemMessage: ChatMessage = { 
      role: 'system', 
      content: 'คุณคือติวเตอร์วิชา Computer Science ที่เก่งกาจ จงตอบคำถามอย่างกระชับ ตรงประเด็น และไม่ออกนอกเรื่อง หลีกเลี่ยงคำเกริ่นนำที่ยาวเกินไป เน้นการใช้ Bullet points หรือตารางเพื่อความชัดเจน และประหยัด Token ให้ได้มากที่สุด' 
    };

    const newMessages: ChatMessage[] = [systemMessage, ...messages, { role: 'user', content: input.trim(), animate: false }];
    
    // Setup UI for streaming: display the user's message and an empty placeholder for the assistant
    setMessages([...messages, { role: 'user', content: input.trim(), animate: false }, { role: 'assistant', content: "", animate: true }]);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);

    try {
      await apiService.streamChatMessage(newMessages, (chunk) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: updated[lastIndex].content + chunk
          };
          return updated;
        });
      });
    } catch (error) {
      console.error(error);
      setMessages(prev => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        updated[lastIndex] = {
          ...updated[lastIndex],
          content: updated[lastIndex].content + "\n\n*(ขออภัยครับ เกิดข้อผิดพลาด: " + (error instanceof Error ? error.message : "เชื่อมต่อกับเซิร์ฟเวอร์ไม่ได้") + ")*"
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (pathname?.startsWith("/course/")) {
    return null;
  }

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-8 right-8 w-14 h-14 bg-[var(--color-primary)] text-white rounded-full shadow-[0_8px_16px_rgba(0,0,0,0.2)] flex items-center justify-center transition-all duration-300 hover:scale-105 z-40 ${isOpen ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </button>

      {/* Background Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/5 backdrop-blur-[2px] z-40 transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-in Chat Panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-[var(--color-primary-dark)] border-l border-white/10 shadow-[-12px_0_32px_rgba(0,0,0,0.2)] z-50 transform transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="h-20 border-b border-white/10 flex items-center justify-center px-6 pt-4 shrink-0 bg-black/10 backdrop-blur-md relative">
          <h2 className="text-lg font-bold tracking-tight text-white uppercase">CHATBOT</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="absolute right-6 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/10 text-white/70 transition-colors mt-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Messages Layout */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 no-scrollbar bg-black/5">
          {messages.map((msg, idx) => {
            // Hide empty assistant messages to prevent double bubbles
            if (msg.role === 'assistant' && !msg.content) return null;
            
            return (
              <div 
                key={idx} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`text-[13.5px] leading-[1.6] ${
                    msg.role === 'user' 
                    ? 'w-fit max-w-[85%] sm:max-w-[calc(100%-104px)] bg-[var(--color-primary)] text-white rounded-[24px] px-4 py-2.5 shadow-[0_6px_20px_rgba(177,178,255,0.3)] mr-0 sm:mr-[52px]' 
                    : 'w-full text-white/90 py-2'
                  }`}
                >
                  {msg.role === 'user' 
                    ? msg.content 
                    : (
                      <div className="flex gap-4 items-start">
                        <div className="w-9 h-9 flex items-center justify-center shrink-0 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 shadow-[0_4px_12px_rgba(0,0,0,0.1)] mt-0.5 overflow-hidden">
                          <AILoader isThinking={isLoading} size={0.35} />
                        </div>
                        <div className="assistant-message-dark pt-1 flex-1 pr-0 sm:pr-[52px]">
                          <TypewriterEffect text={msg.content} animate={msg.animate} />
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
          })}
          {/* Show generic loading animation only if the last message is assistant and content is still empty (waiting for first byte) */}
          {isLoading && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && (
            <div className="flex justify-start animate-fade-in-up py-4">
              <div className="w-full flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area Area */}
        <div className="pb-10 pt-6 px-6 border-t border-white/10 shrink-0 bg-transparent">
          {/* ปรับปรุงแอนิเมชั่นระดับพรีเมียม: เพิ่มเอฟเฟกต์เรืองแสง (Focus Glow Effect) สำหรับ Chat Panel ใน Dark Mode */}
          <form 
            onSubmit={handleSendMessage}
            className="flex items-end gap-3 bg-white/5 border border-white/20 rounded-xl p-2 focus-within:border-[var(--color-primary)] focus-within:bg-white/10 focus-within:shadow-[0_0_20px_rgba(177,178,255,0.3)] transition-all relative"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder="Ask me anything..."
              className="flex-1 max-h-32 min-h-[44px] bg-transparent border-none outline-none focus:outline-none focus:ring-0 resize-none p-3 text-sm text-white placeholder:text-white/40"
              rows={1}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`p-3 rounded-lg mb-0.5 flex items-center justify-center transition-all ${
                input.trim() && !isLoading 
                ? 'bg-[var(--color-primary)] text-white hover:shadow-lg' 
                : 'bg-white/10 text-white/20'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
          <div className="text-center mt-3">
            <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Powered by GPT-OSS-120B</span>
          </div>
        </div>
      </aside>
    </>
  );
}
