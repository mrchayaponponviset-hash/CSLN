// นำเข้า Firebase SDK สำหรับการ Initialize App และ Authentication
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// ============================================================
// Firebase Configuration — ดึงค่าจาก Environment Variables
// ============================================================
// ⚠️ ค่าเหล่านี้ถูกตั้งไว้ใน .env.local (ไม่ commit ขึ้น Git)
// ⚠️ ตัวแปร NEXT_PUBLIC_* จะถูกเปิดเผยใน browser (เป็น public keys)
// ⚠️ ต้องตั้ง Firebase Security Rules + Domain Restriction ใน Firebase Console
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// ตรวจสอบว่า Firebase config ครบถ้วนหรือไม่ (แสดง warning ใน console ถ้าไม่ครบ)
const REQUIRED_FIREBASE_KEYS = ["apiKey", "authDomain", "projectId", "appId"] as const;
const missing_keys = REQUIRED_FIREBASE_KEYS.filter(
  (key) => !firebaseConfig[key]
);
if (missing_keys.length > 0) {
  console.warn(
    `⚠️ Firebase config ไม่ครบ: ${missing_keys.join(", ")} — ตรวจสอบไฟล์ .env.local`
  );
}

// Initialize Firebase (SSR Safe — ป้องกัน initialize ซ้ำเมื่อ SSR)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth — ส่งออก auth instance และ Google Provider สำหรับ Login
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
