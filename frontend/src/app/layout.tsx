import type { Metadata } from "next";
import { JetBrains_Mono, Inter, Noto_Sans_Thai, Bai_Jamjuree } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"], 
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const inter = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter",
  display: "swap",
});

const notoSansThai = Noto_Sans_Thai({ 
  subsets: ["thai", "latin"], 
  variable: "--font-noto-sans-thai",
  display: "swap",
});

const baiJamjuree = Bai_Jamjuree({ 
  subsets: ["thai", "latin"], 
  weight: ["400", "500", "600", "700"],
  variable: "--font-bai-jamjuree",
  display: "swap",
});

/* ===== SEO: Metadata สำหรับทั้งเว็บไซต์ ===== */
export const metadata: Metadata = {
  title: "CSLearning",
  description:
    "แพลตฟอร์มเรียน Computer Science ที่ใช้ AI ช่วยสร้าง Quiz, Flashcard และตอบคำถามตรงตามเนื้อหาหลักสูตร สำหรับนักศึกษาวิทยาการคอมพิวเตอร์",
  keywords: [
    "CSLearning",
    "Computer Science",
    "AI Learning",
    "Quiz Generator",
    "Flashcard",
    "วิทยาการคอมพิวเตอร์",
  ],
};

import { AuthProvider } from "@/contexts/AuthContext";
import { UsageProvider } from "@/contexts/UsageContext";
import { QuotaToast } from "@/components/usage/QuotaToast";
import { QuotaExceededModal } from "@/components/usage/QuotaExceededModal";
import { BackgroundAnimation } from "@/components/BackgroundAnimation";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${jetbrainsMono.variable} ${inter.variable} ${notoSansThai.variable} ${baiJamjuree.variable}`}>
      <body className="antialiased font-sans">
        <BackgroundAnimation />
        <AuthProvider>
          <UsageProvider>
            {/* ErrorBoundary ครอบ children เพื่อจับ Error ระดับ Component ป้องกันหน้าจอขาวทั้งหน้า */}
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
            <QuotaToast />
            <QuotaExceededModal />
          </UsageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

