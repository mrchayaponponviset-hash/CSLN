# บังคับใช้รุ่นเสถียร (Bookworm) เพื่อหลีกเลี่ยงปัญหาจากรุ่นทดสอบ (Trixie)
FROM python:3.11-bookworm

# ตั้งค่า Working Directory ใน Container
WORKDIR /app

# ตั้งค่า Environment สำหรับ apt
ENV DEBIAN_FRONTEND=noninteractive

# ล้างแคชเก่าและติดตั้งไลบรารีใหม่เพื่อให้มั่นใจว่าดึงไฟล์จากแหล่งที่ถูกต้อง
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get update -y && \
    apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libpango-1.0-0 \
    libharfbuzz0b \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    shared-mime-info \
    fonts-thai-tlwg \
    tesseract-ocr \
    tesseract-ocr-tha \
    tesseract-ocr-eng && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# คัดลอกไฟล์ requirements.txt และติดตั้ง library
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# คัดลอกโค้ดทั้งหมดเข้าไปใน Container
COPY . .

# เปิด Port (Render จะส่งค่า PORT ผ่าน environment variable)
EXPOSE 5000

# รัน Backend server ผ่าน uvicorn (ใช้ shell form เพื่อให้ $PORT expand ได้)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-5000}
