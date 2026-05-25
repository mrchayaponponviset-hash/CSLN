# AI-Powered Computer Science Learning Platform

ระบบแพลตฟอร์มการเรียนรู้วิทยาการคอมพิวเตอร์อัจฉริยะ ที่ใช้ AI ช่วยในการสอน ออกแบบมาเพื่อให้นักศึกษาเรียนรู้ได้ตรงประเด็นและทบทวนความรู้ได้อย่างมีประสิทธิภาพ

## 🌟 Overview

โปรเจกต์นี้เป็น Web Application สำหรับการเรียนการสอนในรายวิชาวิทยาการคอมพิวเตอร์ โดยมีจุดเด่นที่การนำ AI (Large Language Models) เข้ามาบูรณาการในทุกส่วนของการเรียนรู้ ตั้งแต่การตอบคำถามข้อสงสัยในบทเรียน ไปจนถึงการสุ่มสร้างข้อสอบและแบบฝึกหัดจากเนื้อหาบทเรียนโดยตรง เพื่อสร้างประสบการณ์การเรียนรู้แบบเฉพาะบุคคล (Personalized Learning)

## 🛠 Tech Stack

### Frontend
- **Framework**: [Next.js 16.2.4](https://nextjs.org/) (App Router)
- **React**: [React 19.2.4](https://react.dev/) & React DOM 19.2.4
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) with PostCSS 4
- **State Management**: React Context API
- **Authentication**: [Firebase Auth](https://firebase.google.com/docs/auth) (Google Login)
- **Data Visualization**: [Recharts 3.8.1](https://recharts.org/) (สำหรับ Dashboard ผลสอบ)
- **Content Rendering**: React Markdown 10.1.0, KaTeX 0.16.45 (สำหรับสมการคณิตศาสตร์)
- **Utilities**: Lucide React Icons, html-to-image, jsPDF

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python)
- **AI Orchestration**: [LangChain](https://www.langchain.com/) & [LangGraph](https://langchain-ai.github.io/langgraph/)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
- **LLM Gateway**: [OpenRouter](https://openrouter.ai/) (รองรับ Llama 3.3, GPT-4o และอื่นๆ)
- **PDF Generation**: [WeasyPrint](https://weasyprint.org/) & Jinja2 templates

### Infrastructure
- **Containerization**: [Docker](https://www.docker.com/) & Docker Compose
- **Development Tools**: ESLint 9, TypeScript 5, Uvicorn

### Key Dependencies
- **Backend OCR**: Tesseract OCR (via pytesseract)
- **PDF Generation**: WeasyPrint + Jinja2
- **HTTP Client**: HTTPX, Requests
- **Encryption**: cryptography (for BYOK API key storage)

## 📂 Folder Structure

```text
Product/
│
├── 📁 backend/                          # ฝั่ง Server (FastAPI + LangChain + RAG)
│   ├── main.py                          # 🔑 Main API Server - ทุก Endpoints
│   ├── retriever.py                     # RAG System & Vector Search
│   ├── byok.py                          # Bring Your Own Key Management
│   ├── supabase_client.py               # Database Connection
│   ├── requirements.txt                 # Python Dependencies
│   ├── Dockerfile                       # Docker Config (รวม Tesseract OCR)
│   ├── Procfile                         # Deployment Config
│   ├── .env                             # Environment Variables (ห้ามขึ้น Git)
│   ├── 📁 data/                         # Syllabus & Content Data
│   ├── 📁 migrations/                   # Database Schema Migrations
│   ├── 📁 templates/                    # HTML Templates (PDF Generation)
│   ├── 📁 fonts/                        # Fonts for PDF Output
│   ├── ingest_curriculum.py             # Import Curriculum Data Script
│   ├── ingest_lessons.py                # Import Lessons Script
│   ├── parse_year1_content.py           # Year 1 Content Parser
│   ├── migrate_lessons.py               # Migration Script
│   ├── test_rag.py                      # RAG Testing Script
│   └── test_rag_terminal.py             # Terminal-based RAG Test
│
├── 📁 frontend/                         # ฝั่ง Client (Next.js 16 + React 19)
│   ├── 📁 src/
│   │   ├── 📁 app/                      # Pages & Routing (App Router)
│   │   │   ├── page.tsx                 # Landing Page
│   │   │   ├── layout.tsx               # Main Layout
│   │   │   ├── loading.tsx              # Loading UI
│   │   │   ├── 📁 year/[number]/       # Year Selection Pages
│   │   │   ├── 📁 course/[slug]/       # Course/Lesson Main Pages
│   │   │   └── 📁 usage/               # Usage Statistics Pages
│   │   ├── 📁 components/               # Reusable React Components
│   │   │   ├── AIChatPanel.tsx          # AI Chat Interface
│   │   │   ├── ExamPlayer.tsx           # Exam/Quiz Player
│   │   │   ├── FlashcardsPlayer.tsx     # Flashcard Component
│   │   │   ├── AuthNavbar.tsx           # Navigation & Auth
│   │   │   ├── SettingsModal.tsx        # Settings & BYOK
│   │   │   ├── ErrorBoundary.tsx        # Error Handling
│   │   │   └── ... (อื่นๆ)
│   │   ├── 📁 contexts/                 # React Context Providers
│   │   │   ├── AuthContext.tsx          # Authentication State
│   │   │   └── UsageContext.tsx         # Token Quota State
│   │   ├── 📁 services/                 # API Client & Utilities
│   │   │   └── api.ts                   # Main API Client
│   │   ├── 📁 data/                     # Static Data
│   │   │   └── courses.json             # Curriculum Structure
│   │   ├── 📁 lib/                      # Utilities & Config
│   │   │   └── firebase.ts              # Firebase Setup
│   │   ├── 📁 hooks/                    # Custom React Hooks
│   │   └── globals.css                  # Global Styles & Design Tokens
│   ├── 📁 public/                       # Static Assets (Images, Icons)
│   ├── package.json                     # NPM Dependencies
│   ├── tsconfig.json                    # TypeScript Config
│   ├── next.config.ts                   # Next.js Config
│   ├── eslint.config.mjs                # ESLint Config
│   ├── postcss.config.mjs               # PostCSS Config
│   ├── Dockerfile                       # Docker Config
│   ├── .env.local                       # Local Environment Variables
│   └── next-env.d.ts                    # Next.js Type Definitions
│
├── 📁 data/                             # Curriculum Data Files
│   └── courses.json                     # Course Metadata
│
├── 📁 scratch/                          # Temporary/Development Scripts
│   ├── debug_usage.json                 # Debug Data
│   ├── test_token_usage.py              # Token Testing
│   └── usage_output.txt                 # Output Logs
│
├── 📁 year 1/                           # Year 1 Course Content (Text Files)
│   ├── 1. Introduction to Computer Science.txt
│   ├── 2. Structured Programming.txt
│   ├── 3. Discrete Structures.txt
│   ├── ... (6 Courses)
│   └── keyword+fisrtparagraph_year1.txt
│
├── 📁 year 2/                           # Year 2 Course Content
│   ├── 1. Database Systems.txt
│   ├── 2. Numerical Methods.txt
│   ├── ... (13 Courses)
│   └── keyword+fisrtparagraph_year2.txt
│
├── 📁 year 3/                           # Year 3 Course Content
│   ├── 1. Software Engineering.txt
│   ├── 2. UXUI Design.txt
│   ├── ... (6 Courses)
│   └── keyword+fisrtparagraph_year3.txt
│
├── 📁 year 4/                           # Year 4 Course Content
│   ├── 1 Cybersecurity.txt
│   └── keyword+fisrtparagraph_year4.txt
│
├── docker-compose.yml                   # Docker Compose Config (รวม Backend & Frontend)
├── PROJECT_GUIDE.md                     # Detailed Project Documentation
├── plan-v4.md                           # RAG System Architecture & Roadmap
├── README.md                            # This File (Project Overview)
├── clear_all_content.py                 # Utility Script for Cleanup
├── fix.js                               # Frontend Fix Script
├── fix_css.py                           # CSS Fix Script
├── .gitignore                           # Git Ignore File
└── .git/                                # Git Repository Metadata
```

## 🚀 Installation

### สิ่งที่ต้องเตรียม (Prerequisites)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ติดตั้งในเครื่อง (รองรับ Windows, macOS, Linux)
- API Key จาก [OpenRouter](https://openrouter.ai/)
- Firebase Project Config (สำหรับ Google Authentication)
- Supabase Project (URL & Anon Key)
- Node.js 18+ (สำหรับ Frontend development)
- Python 3.10+ (สำหรับ Backend development)

#### วิธีที่ 1: ใช้ Docker Compose (แนะนำ)
1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd Product
   ```

2. **Setup Environment Variables**
   - สร้างไฟล์ `.env` ในโฟลเดอร์ `backend/`:
   ```env
   OPENROUTER_API_KEY=your_key_here
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   FIREBASE_PROJECT_ID=your_firebase_project
   CORS_ORIGINS=http://localhost:3000,http://localhost:5000
   ```
   - ตั้งค่า Firebase ใน `frontend/src/lib/firebase.ts`
   - ตั้งค่า API URL ใน `frontend/.env.local`:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000
   ```

3. **รัน Docker Compose**
   ```bash
   docker-compose up --build
   ```
   - Frontend จะรันที่: `http://localhost:3000`
   - Backend API จะรันที่: `http://localhost:5000`
   - API Documentation: `http://localhost:5000/docs` (Swagger UI)

#### วิธีที่ 2: ติดตั้งและรันแยกตามส่วน (Development)

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 5000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## 📖 Features

### 🎓 สำหรับนักศึกษา
- 📚 **Personalized Learning Paths**: เนื้อหาบทเรียนจากปีที่ 1-4 ของวิทยาการคอมพิวเตอร์
- 🤖 **AI-Powered Tutor**: ถามคำถาม AI ได้ 24/7 บนพื้นฐาน RAG system
- 📝 **Quiz & Flashcards**: สุ่มสร้างข้อสอบและการ์ดจำจากบทเรียนแต่ละบท
- 📊 **Progress Tracking**: ติดตามความก้าวหน้าด้วยกราฟ Radar Chart ตามหลักเกณฑ์ Bloom's Taxonomy
- 📤 **Export as PDF**: ส่งออกผลสรุปความสำเร็จเป็น PDF

### 👨‍🏫 สำหรับผู้สอน
- 📄 **PDF Evaluator**: อัพโหลดไฟล์ PDF เพื่อประเมินคุณภาพของเนื้อหา
- 🔍 **OCR Support**: รองรับไฟล์สแกนด้วย Tesseract OCR
- 🔐 **BYOK (Bring Your Own Key)**: ใช้ API Key ของตัวเองสำหรับโมเดล AI ที่ดีกว่า
- 📈 **Content Quality Metrics**: วัดการครอบคลุมของ Bloom's Taxonomy และสามารถสร้างข้อสอบได้จำนวนเท่าไหร่

## 📚 Curriculum Structure

โปรเจกต์นี้ครอบคลุมหลักสูตรวิทยาการคอมพิวเตอร์ 4 ปี:

- **Year 1**: Introduction to CS, Structured Programming, Discrete Structures, Functional Programming, OOP, Digital Algebra
- **Year 2**: Database Systems, Numerical Methods, Data Structures, Computer Organization, OS, HCI, AI, Systems Analysis, Algorithms, Data Communications, Web Development, SQL, Mobile Development
- **Year 3**: Software Engineering, UX/UI Design, Programming Languages, Modern Web Development, Cloud Computing, CS Project
- **Year 4**: Cybersecurity

## 🤝 Contributing

เราต้องการความช่วยเหลือจากคุณ! วิธีการมีส่วนร่วม:
1. Fork repository
2. สร้าง feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push ไปยัง branch (`git push origin feature/AmazingFeature`)
5. เปิด Pull Request

## 📝 Configuration

### Environment Variables (Backend)
```env
# Required
OPENROUTER_API_KEY=<Your OpenRouter API Key>
SUPABASE_URL=<Your Supabase Project URL>
SUPABASE_KEY=<Your Supabase Anon Key>

# Optional
CORS_ORIGINS=http://localhost:3000,http://localhost:5000
DEBUG=false
```

### Firebase Setup (Frontend)
1. สร้าง Firebase Project ที่ [Firebase Console](https://console.firebase.google.com/)
2. Enable Google Authentication
3. ปรับปรุง `frontend/src/lib/firebase.ts` ด้วย Config ของคุณ

## 🐛 Troubleshooting

### Frontend doesn't connect to Backend
- ตรวจสอบว่า Backend API รันที่พอร์ต 5000
- ตรวจสอบ `NEXT_PUBLIC_API_URL` ใน `.env.local`
- ลองใช้ `docker-compose logs backend` เพื่อดู logs

### OCR ไม่ทำงาน
- ตรวจสอบว่า Tesseract OCR ติดตั้งใน Docker image
- ลองรัน Backend ใหม่: `docker-compose restart backend`

### Token Quota หมด
- หากใช้ OpenRouter API Key ของแพลตฟอร์ม ให้ใช้ BYOK กับ API Key ของตัวเอง

## 📖 Documentation

- **[PROJECT_GUIDE.md](PROJECT_GUIDE.md)**: คู่มายละเอียดของโครงสร้างโปรเจกต์
- **[plan-v4.md](plan-v4.md)**: แผนพัฒนา RAG System และ Architecture
- **Backend API Docs**: ที่ `http://localhost:5000/docs` (Swagger UI)

## 📄 License

Project นี้ใช้ License [MIT](LICENSE) - ดูไฟล์ LICENSE สำหรับรายละเอียด

## 👥 Authors & Contributors

- **Developed**: ด้วยความช่วยเหลือของ AI Assistants
- **Maintained**: โปรแกรมเมอร์และผู้เชี่ยวชาญด้าน AI

## 🌐 ติดต่อเรา

สำหรับคำถามหรือข้อเสนอแนะ:
- 📧 Email: support@cslearning.local
- 💬 GitHub Issues: [Report an issue](https://github.com/yourrepo/issues)

---

**Last Updated**: May 2026  
*ถัดไปอัพเดท README นี้เมื่อมีการเปลี่ยนแปลง Tech Stack หรือฟีเจอร์ใหญ่ๆ*
