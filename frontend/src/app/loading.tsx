/**
 * Loading Page — แสดงขณะ Page Transition (Suspense Fallback)
 * ใช้ Animation แบบ Pulse เพื่อให้ผู้ใช้รู้ว่าระบบกำลังโหลดข้อมูล
 */
export default function Loading() {
  return (
    <main className="fixed inset-0 h-screen w-screen flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-50">
      {/* โลโก้กำลังโหลด */}
      <div className="animate-pulse flex flex-col items-center gap-4">
        {/* วงกลมโลโก้ */}
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)] opacity-20" />

        {/* ข้อความ Loading */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-4 w-32 bg-[var(--color-gray-200)] rounded-full" />
          <div className="h-3 w-24 bg-[var(--color-gray-100)] rounded-full" />
        </div>
      </div>

      {/* จุดกระพริบ */}
      <div className="mt-8 flex gap-1.5">
        {[0, 1, 2].map((dot_index) => (
          <div
            key={dot_index}
            className="w-2 h-2 rounded-full bg-[var(--color-primary)]"
            style={{
              animation: "pulse 1.4s ease-in-out infinite",
              animationDelay: `${dot_index * 0.2}s`,
              opacity: 0.4,
            }}
          />
        ))}
      </div>
    </main>
  );
}
