// API Service for connecting to the LangGraph Backend
// Fast endpoints use Next.js proxy (/api/...), AI generation endpoints call backend directly to avoid proxy timeout.

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  animate?: boolean;
}

export const apiService = {
  // 0. ล้าง Backend In-Memory Cache
  async clearCache() {
    try {
      await fetch(`${BACKEND_URL}/api/clear-cache`, { method: 'POST' });
    } catch (_) { /* ไม่ block ถ้า backend ยังไม่พร้อม */ }
  },

  // 1. Chat Generation (direct to backend - can be slow)
  async sendChatMessage(messages: ChatMessage[], userId?: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, userId })
      });
      if (!res.ok) throw new Error('Network response was not ok');
      return await res.json();
    } catch (error) {
      console.error('Error in sendChatMessage:', error);
      throw error;
    }
  },

  // 1.1 Chat Generation with Stream (direct to backend)
  async streamChatMessage(messages: ChatMessage[], onChunk: (chunk: string) => void, userId?: string, signal?: AbortSignal, currentLesson?: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, userId, currentLesson }),
        signal
      });
      
      if (!res.ok) throw new Error('Network response was not ok');
      if (!res.body) throw new Error('ReadableStream not supported');
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            onChunk(chunk);
          }
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.log('Stream aborted');
          return;
        }
        throw error;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error('Error in streamChatMessage:', error);
      throw error;
    }
  },

  // 2. Quiz Generation (direct to backend - takes 15-30s for 5q, 30-60s for 10q)
  async generateQuiz(chapterTitle: string, content?: string, numQuestions: number = 5, userId?: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterTitle, content, numQuestions, userId })
      });
      if (!res.ok) throw new Error('Network response was not ok');
      return await res.json();
    } catch (error) {
      console.error('Error in generateQuiz:', error);
      throw error;
    }
  },

  // 3. Flashcard Generation (direct to backend - target: 5-10s)
  async generateFlashcards(chapterTitle: string, content?: string, userId?: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterTitle, content, userId })
      });
      if (!res.ok) throw new Error('Network response was not ok');
      return await res.json();
    } catch (error) {
      console.error('Error in generateFlashcards:', error);
      throw error;
    }
  },
  
  // รองรับการส่ง config ระดับความยาก, Bloom levels, และรายชื่อบทที่กำหนดสำหรับแต่ละข้อใน batch
  async generateExam(
    chapters: { title: string; content: string }[],
    courseSlug?: string,
    batchIdx: number = 0,
    numBatches: number = 8,
    customInstruction?: string,
    difficultyMode?: "general" | "difficult" | "bloom",
    bloomLevels?: string[],
    chapterAssignments?: string[],
    userId?: string
  ) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapters,
          courseSlug,
          batchIdx,
          numBatches,
          customInstruction,
          difficultyMode: difficultyMode || "general",
          bloomLevels: bloomLevels || [],
          chapterAssignments: chapterAssignments || [],
          userId
        })
      });
      if (!res.ok) throw new Error('Network response was not ok');
      return await res.json();
    } catch (error) {
      console.error('Error in generateExam:', error);
      throw error;
    }
  },

  // 5. PDF Summary Generation (direct to backend)
  async generatePdfSummary(data: { quizScores: any, examResults: any, radarScores: any }) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-pdf-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Network response was not ok');
      return await res.json();
    } catch (error) {
      console.error('Error in generatePdfSummary:', error);
      throw error;
    }
  },

  // 6. Supabase - Get Lessons
  async getLessons(courseSlug?: string) {
    try {
      const url = courseSlug ? `${BACKEND_URL}/api/lessons?course_slug=${courseSlug}` : `${BACKEND_URL}/api/lessons`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch lessons');
      return await res.json();
    } catch (error) {
      console.error('Error in getLessons:', error);
      throw error;
    }
  },

  // 7. Supabase - Mark Lesson as Completed
  async completeLesson(userId: string, lessonId: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/complete-lesson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, lessonId })
      });
      if (!res.ok) throw new Error('Failed to complete lesson');
      return await res.json();
    } catch (error) {
      console.error('Error in completeLesson:', error);
      throw error;
    }
  },

  async getUserProgress(userId: string, retries = 3) {
    if (!userId) return [];
    const url = `${BACKEND_URL}/api/user-progress/${userId}`;
    
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch user progress');
        return await res.json();
      } catch (error) {
        if (i === retries - 1) {
          console.error(`Final attempt failed for getUserProgress:`, error);
          return []; // Return empty progress instead of crashing the UI
        }
        // Exponential backoff: 1s, 2s, 4s...
        const waitTime = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    return [];
  },

  // 8. Supabase - Save Score
  async saveScore(data: { userId: string, lessonId: string, type: 'quiz' | 'flashcard', score: number, totalQuestions: number }) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/save-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to save score');
      return await res.json();
    } catch (error) {
      console.error('Error in saveScore:', error);
      throw error;
    }
  },

  // 9. Supabase - Save Exam Result
  async saveExamResult(data: { 
    userId: string, 
    totalScore: number, 
    totalQuestions: number, 
    categoryScores: any, 
    recommendation: string 
  }) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/save-exam-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to save exam result');
      return await res.json();
    } catch (error) {
      console.error('Error in saveExamResult:', error);
      throw error;
    }
  },

  // 10. PDF Generation via WeasyPrint Backend
  async generatePdf(data: { 
    title: string, 
    sections: { title: string, content: string }[], 
    score?: number,
    total?: number,
    chartImage?: string | null, 
    footerText?: string 
  }): Promise<Blob> {
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`PDF generation failed: ${errText}`);
      }
      return await res.blob();
    } catch (error) {
      console.error('Error in generatePdf:', error);
      throw error;
    }
  },
  
  // 11. Token Quota
  async getUserQuota(userId: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/user-quota/${userId}`);
      if (!res.ok) throw new Error('Failed to fetch user quota');
      return await res.json();
    } catch (error) {
      console.error('Error in getUserQuota:', error);
      return { used: 0, limit: 100000 };
    }
  }
};
