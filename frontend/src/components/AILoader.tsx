"use client";

interface AILoaderProps {
  isThinking: boolean;
  size?: number; // size=1 คือ 80px (ตามโค้ด Uiverse)
}

/**
 * AILoader Component
 * ปรับปรุงขนาดให้ "ใหญ่ยักษ์" ตามวงกลมสีขาวที่ผู้ใช้ระบุ
 * โดยการกำหนดขนาดพิกเซลโดยตรงลงใน style object เพื่อความแม่นยำสูงสุด
 */
export function AILoader({ isThinking, size = 1 }: AILoaderProps) {
  // ขนาดพื้นฐาน 80px
  const base_size = 80;
  const total_size = base_size * size;
  
  // สัดส่วน: Gap เล็กน้อยเพื่อให้จุดเรียงตัวชิดกันแบบทรงกลม
  const gap_size = 4 * size;

  return (
    <div className="relative flex items-center justify-center">
      <div 
        className={`circle-loader ${isThinking ? 'is-thinking' : ''} z-10`}
        style={{ 
          width: `${total_size}px`, 
          height: `${total_size}px`,
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: `${gap_size}px`,
          padding: '0px',
          background: 'transparent',
          border: 'none',
          placeItems: 'center',
          animationPlayState: isThinking ? 'running' : 'paused'
        }}
      >
        {[...Array(9)].map((_, i) => (
          <div 
            key={i} 
            className={`circle circle${i + 1}`}
            style={{
              width: '100%', 
              height: '100%',
              borderRadius: '50%',
              background: 'white',
              boxShadow: 'inset 2px 2px 5px rgba(255,255,255,0.5)',
              animationPlayState: isThinking ? 'running' : 'paused'
            }}
          />
        ))}
      </div>
    </div>
  );
}
