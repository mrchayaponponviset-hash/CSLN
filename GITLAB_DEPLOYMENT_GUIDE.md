# 🚀 คู่มือการเตรียมความพร้อมขึ้น GitLab และ Deploy บนเซิร์ฟเวอร์องค์กร

เอกสารนี้สรุป **"สิ่งที่ต้องเตรียม"** ทั้งในส่วนของระบบ GitLab (CI/CD) และฝั่งเซิร์ฟเวอร์ปลายทาง (Production Server) เพื่อให้กระบวนการ Deploy ทำงานได้อย่างอัตโนมัติและปลอดภัยตามมาตรฐานองค์กร

---

## 1. 🦊 สิ่งที่ต้องเตรียมฝั่ง GitLab (ตั้งค่า CI/CD Variables)

เพื่อความปลอดภัย เราจะไม่นำข้อมูลความลับ (Secrets) เข้าไปใน Source Code แต่จะนำไปกำหนดไว้ใน GitLab CI/CD Variables แทน
**วิธีตั้งค่า:** ไปที่ GitLab Project ➡️ `Settings` ➡️ `CI/CD` ➡️ `Variables` แล้วเพิ่มตัวแปรดังต่อไปนี้:

### กลุ่ม A: ข้อมูลการเชื่อมต่อเซิร์ฟเวอร์ (Server Connection)
> [!IMPORTANT]
> ตัวแปรเหล่านี้จำเป็นสำหรับการให้ GitLab วิ่งเข้าไปสั่งรันระบบบนเซิร์ฟเวอร์จริงได้ผ่าน SSH

*   `SERVER_HOST` : หมายเลข IP หรือ โดเมนเนม ของเซิร์ฟเวอร์องค์กร
*   `SERVER_USER` : ชื่อผู้ใช้งานบนเซิร์ฟเวอร์ (เช่น `root`, `ubuntu`, `admin`)
*   `SSH_PRIVATE_KEY` : Private Key (`id_rsa`) ที่จับคู่กับ Public Key บนเซิร์ฟเวอร์ เพื่อใช้ล็อกอินโดยไม่ต้องใส่พาสเวิร์ด (แนะนำให้ Mask ตัวแปรนี้)

### กลุ่ม B: ข้อมูล Environment ของ Frontend (Firebase & API)
> [!NOTE]
> ค่าเหล่านี้จะถูกฝังลงไปในกระบวนการ Build ของ Next.js

*   `PROD_NEXT_PUBLIC_API_URL` : URL จริงของ Backend (เช่น `https://api.your-org.com` หรือใช้ IP หากรันเครื่องเดียวกัน)
*   `PROD_FIREBASE_API_KEY` : Firebase API Key ของโปรเจกต์ Production
*   `PROD_FIREBASE_AUTH_DOMAIN` : โดเมน Auth ของ Firebase
*   `PROD_FIREBASE_PROJECT_ID` : Project ID ของ Firebase
*   `PROD_FIREBASE_STORAGE_BUCKET` : Storage Bucket
*   `PROD_FIREBASE_MESSAGING_SENDER_ID` : Sender ID
*   `PROD_FIREBASE_APP_ID` : App ID

---

## 2. 🖥️ สิ่งที่ต้องเตรียมฝั่งเซิร์ฟเวอร์ (Production Server)

เจ้าหน้าที่ผู้ดูแลเซิร์ฟเวอร์ (System Admin / DevOps) ต้องจัดเตรียมสภาพแวดล้อมดังนี้:

### 2.1 ซอฟต์แวร์พื้นฐาน
1.  **Docker Engine & Docker Compose**: ติดตั้งเวอร์ชันล่าสุด เพื่อใช้ในการรัน Container
2.  **SSH Service**: เปิดให้บริการ SSH เพื่อให้ GitLab Runner เข้ามาเชื่อมต่อสั่ง Deploy ได้

### 2.2 โฟลเดอร์สำหรับ Deploy
1.  สร้างโฟลเดอร์สำหรับแอปพลิเคชัน (ตามที่ระบุใน `.gitlab-ci.yml`) เช่น:
    ```bash
    mkdir -p ~/app/backend
    mkdir -p ~/app/frontend
    ```

### 2.3 การจัดการ Environment Variables (ไฟล์ `.env`)
> [!WARNING]
> เซิร์ฟเวอร์ต้องมีไฟล์ `.env` ของตัวเอง เนื่องจากไฟล์เหล่านี้ถูกยกเว้นการอัปโหลดขึ้น GitLab

1.  คัดลอกไฟล์ `backend/.env.example` จากโปรเจกต์ นำไปสร้างเป็น `backend/.env` บนเซิร์ฟเวอร์ และใส่ค่าจริงดังนี้:
    *   `OPENROUTER_API_KEY` : คีย์การใช้งาน AI
    *   `SUPABASE_URL` และ `SUPABASE_ANON_KEY` : การเชื่อมต่อฐานข้อมูล
    *   `ENCRYPTION_KEY` : คีย์สำหรับถอดรหัส (สำคัญมาก: หากสูญหายจะไม่สามารถถอดรหัส BYOK ได้)
    *   `CORS_ORIGINS` : โดเมนที่อนุญาตให้เรียกใช้งาน API (เช่น โดเมนของฝั่ง Frontend)
    *   `APP_URL` : โดเมนหลักของแพลตฟอร์ม

2.  คัดลอกไฟล์ `frontend/.env.example` นำไปสร้างเป็น `frontend/.env` บนเซิร์ฟเวอร์สำหรับค่าที่จำเป็นตอน Runtime (ถึงแม้หลายค่าจะถูกฝังตอน Build แล้วก็ตาม)

### 2.4 การอนุญาต SSH Key จาก GitLab
1.  นำ Public Key (ที่สอดคล้องกับ `SSH_PRIVATE_KEY` ใน GitLab Variables) ไปใส่ในไฟล์ `~/.ssh/authorized_keys` ของผู้ใช้ที่จะรัน Docker บนเซิร์ฟเวอร์

---

## 3. 🚀 ขั้นตอนการนำระบบขึ้น (Deployment Workflow)

เมื่อตั้งค่าทั้งฝั่ง GitLab และ เซิร์ฟเวอร์เสร็จสิ้น กระบวนการทำงานจะเป็นดังนี้:

1.  **Push Code**: นักพัฒนา (Developer) รันคำสั่ง `git push origin main`
2.  **GitLab Pipeline ทำงาน**:
    *   **Lint**: ตรวจสอบความถูกต้องของโค้ด Frontend
    *   **Build**: สร้าง Docker Image ทั้ง Backend และ Frontend โดยอัตโนมัติ พร้อมฝัง Environment variables แล้วอัปโหลดเข้า GitLab Container Registry
    *   **Deploy**: ระบบหยุดรอให้กดยืนยัน (Manual Action) ในหน้า CI/CD Pipeline
3.  **Approve Deploy**: ทีมนำขึ้นระบบเข้าไปกด Play ที่ขั้นตอน Deploy
4.  **เซิร์ฟเวอร์รันระบบ**: GitLab Runner จะใช้ SSH เข้าไปยังเซิร์ฟเวอร์ ดึงอิมเมจใหม่ (pull) และเริ่มบริการด้วย `docker compose -f docker-compose.prod.yml up -d` ทันที

---

## 🎯 สรุป Checklist ก่อนแจ้งทีมดำเนินการ
- [ ] โค้ดทั้งหมดพร้อมและแก้ปัญหา Hardcode Credentials (ไฟล์ .env ต่างๆ) เรียบร้อยแล้ว (ปัจจุบันเสร็จแล้ว ✅)
- [ ] แอดมินเซิร์ฟเวอร์เพิ่ม SSH Key ของ GitLab Runner เข้าเซิร์ฟเวอร์แล้ว
- [ ] แอดมินเซิร์ฟเวอร์สร้างไฟล์ `.env` ให้ทั้ง Backend ไว้บนโฟลเดอร์รันงานแล้ว
- [ ] กำหนดค่า GitLab CI/CD Variables ทั้ง 10 ตัวครบถ้วน
- [ ] เซิร์ฟเวอร์ติดตั้ง Docker และเปิด Port ที่จำเป็น (เช่น Port 80, 443 ใช้งานผ่าน Nginx ยิงเข้า Port 3000/5000) เรียบร้อยแล้ว
