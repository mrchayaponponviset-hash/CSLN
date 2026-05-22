# 📘 คู่มือโครงสร้างโปรเจค CSLearning (Project Guide)

คู่มือนี้สรุปโครงสร้างไฟล์และการทำงานของส่วนต่างๆ ในโปรเจค เพื่อให้ง่ายต่อการพัฒนาและแก้ไขในอนาคต

---

## 📂 โครงสร้างภาพรวม (High-Level Structure)

```text
Product/
├── frontend/             # ส่วนหน้าบ้าน (Next.js 16, TailwindCSS 4, React 19)
├── backend/              # ส่วนหลังบ้าน (FastAPI, LangChain, LangGraph — Python)
├── data/                 # ข้อมูลหลักสูตรดิบ
├── plan-v4.md            # แผนงาน RAG System
└── PROJECT_GUIDE.md      # คู่มือโครงสร้างโปรเจค (ไฟล์นี้)
```

---

## 🖥️ ส่วน Frontend (`/frontend`)

ใช้เทคโนโลยี Next.js 16 (App Router) + React 19 + TailwindCSS 4 และดีไซน์แบบ **Premium Monochrome Glassmorphism**

### 1. หน้าหลักและการนำทาง (`src/app`)
- **`app/page.tsx`**: Landing Page หลัก (หน้าที่มีการเลือกชั้นปี Year 1-4)
- **`app/layout.tsx`**: โครงสร้างหลักของเว็บ (รวม AuthProvider, UsageProvider, BackgroundAnimation)
- **`app/globals.css`**: ไฟล์ CSS หลักที่เก็บ **Design Tokens** (สี, Font, Animation และสไตล์ Scrollbar)
- **`app/year/[number]/page.tsx`**: หน้ารายชื่อวิชาของแต่ละชั้นปี
- **`app/course/[slug]/page.tsx`**: หน้าห้องเรียนหลัก (มีแท็บ Content, Flashcards, Quiz, Exam)
- **`app/usage/page.tsx`**: หน้าแสดง Token Usage
- **`app/not-found.tsx`**: หน้า 404 Error
- **`app/loading.tsx`**: หน้า Loading ขณะ Page Transition
- **`app/template.tsx`**: Template wrapper สำหรับ animation

### 2. คอมโพเนนต์ที่สำคัญ (`src/components`)
- **`InlineAIChat.tsx`**: ห้องแชท AI ที่อยู่ด้านขวาของหน้าเรียน (รองรับ Streaming + PDF Extract + Quick Prompts)
- **`AIChatPanel.tsx`**: แผงควบคุมแชท AI
- **`AuthNavbar.tsx`**: แถบเมนูด้านบนที่จัดการเรื่องการล็อกอิน
- **`ExamPlayer.tsx`**: ระบบสอบ 40 ข้อ พร้อม Bloom's Taxonomy + คละบท
- **`QuizPlayer.tsx`**: ระบบ Quiz 5/10 ข้อ
- **`FlashcardsPlayer.tsx`**: ระบบ Flashcard พลิกด้านหน้า/หลัง
- **`SettingsModal.tsx`**: หน้าตั้งค่า BYOK + เลือกโมเดล AI
- **`TypewriterEffect.tsx`**: เอฟเฟกต์พิมพ์ตัวอักษรทีละตัว
- **`AILoader.tsx`**: อนิเมชัน Loading สำหรับ AI
- **`ErrorBoundary.tsx`**: จับ Error ระดับ Component เพื่อไม่ให้ทั้งหน้าขาว
- **`usage/*`**: คอมโพเนนต์ Token Quota (8 ไฟล์)

### 3. ระบบจัดการข้อมูลและ Auth (`src/contexts`, `src/services`, `src/lib`)
- **`contexts/AuthContext.tsx`**: **(สำคัญ)** จัดการเรื่องการ Login ด้วย Google และสถานะผู้ใช้
- **`contexts/UsageContext.tsx`**: จัดการ Token Quota แบบ Real-time
- **`lib/firebase.ts`**: การตั้งค่า Firebase SDK สำหรับ Google Auth
- **`services/api.ts`**: ตัวเชื่อมต่อ (API Client) ระหว่าง Frontend และ Backend
- **`data/courses.json`**: ไฟล์ฐานข้อมูลวิชาทั้งหมด (ชื่อวิชา, รหัสวิชา, บทเรียน)

---

## ⚙️ ส่วน Backend (`/backend`)

ใช้ **FastAPI (Python)** ร่วมกับ **LangChain + LangGraph** ในการจัดการ AI

### 1. ไฟล์หลัก
- **`main.py`**: **(สำคัญ)** ไฟล์หลักที่รัน Server และจัดการ API Endpoints ทั้งหมด (รวมถึงการเชื่อมต่อ OpenRouter, Token Quota, BYOK)
- **`retriever.py`**: จัดการระบบ RAG (Retrieval-Augmented Generation) — Vector Search + Syllabus + Legacy Keyword Fallback
- **`byok.py`**: ระบบ Bring Your Own Key — Encryption, Model Registry, Key Resolver
- **`supabase_client.py`**: ตั้งค่าเชื่อมต่อ Supabase
- **`.env`**: เก็บ API Keys ต่างๆ **(ห้ามนำขึ้น Git)**

### 2. ข้อมูลและการประมวลผล
- **`data/syllabus.txt`**: เนื้อหาหลักสูตรแบบ text สำหรับ RAG context
- **`templates/`**: HTML templates สำหรับ PDF generation (WeasyPrint)
- **`fonts/`**: ฟอนต์สำหรับ PDF generation

---

## 🎨 จุดที่ต้องแก้ไขบ่อย (Common Customizations)

### แก้ไขสีหรือดีไซน์หลัก
- เข้าไปที่ `frontend/src/app/globals.css` มองหาช่วง `:root` เพื่อเปลี่ยนค่าตัวแปรสี (Design Tokens)

### เพิ่ม/ลดวิชาหรือบทเรียน
- แก้ไขที่ `frontend/src/data/courses.json` ระบบจะอัปเดตหน้าเว็บและเมนู Sidebar ให้โดยอัตโนมัติ

### ปรับเปลี่ยนการตอบสนองของ AI
- แก้ไข Prompt หรือ Logic ใน `backend/main.py`

### แก้ไขหน้าห้องเรียน (Content/Quiz/Exam)
- แก้ไขที่ `frontend/src/app/course/[slug]/page.tsx` ซึ่งเป็นจุดศูนย์กลางของ Logic แท็บต่างๆ

### ตั้งค่า CORS สำหรับ Production
- แก้ไข `CORS_ORIGINS` ใน `backend/.env` เพิ่ม production URL

---

## 🚀 วิธีการรันโปรเจค (Development)

1. **Backend**: เข้าไปที่โฟลเดอร์ `backend` แล้วรัน `uvicorn main:app --reload --port 5000`
2. **Frontend**: เข้าไปที่โฟลเดอร์ `frontend` แล้วรัน `npm run dev`

---
*คู่มือนี้จัดทำขึ้นเพื่อให้ทีมพัฒนาเข้าใจตำแหน่งไฟล์ได้รวดเร็วขึ้น หากมีการเพิ่มฟีเจอร์ใหญ่ๆ ควรมาอัปเดตไฟล์นี้ด้วย*
*อัปเดตล่าสุด: 21 พฤษภาคม 2569*
