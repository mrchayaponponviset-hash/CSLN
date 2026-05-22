-- ============================================================
-- Migration: อัปเดต limit_tokens จาก 100,000 → 1,000,000 (1M)
-- รันใน Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

-- 1. อัปเดต user ทั้งหมดที่ยังมี limit_tokens = 100000 (ค่าเก่า)
UPDATE user_quotas
SET limit_tokens = 1000000
WHERE limit_tokens = 100000;

-- 2. ตรวจสอบผล (ควรเห็น limit_tokens = 1000000 ทั้งหมด)
SELECT user_id, used, limit_tokens, last_reset_date
FROM user_quotas
ORDER BY last_reset_date DESC;
