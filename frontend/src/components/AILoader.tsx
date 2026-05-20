"use client";

interface AILoaderProps {
  isThinking: boolean;
  size?: number; // scale multiplier
}

/**
 * AILoader Component
 * อัปเดตแอนิเมชั่นใหม่ตามที่ผู้ใช้ระบุ (Uiverse.io by cosnametv)
 */
export function AILoader({ isThinking, size = 1 }: AILoaderProps) {
  return (
    <div className="relative flex items-center justify-center">
      <div 
        className={`loader ${isThinking ? 'is-thinking' : ''} z-10`}
        style={{ transform: `scale(${size})` }}
      >
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
