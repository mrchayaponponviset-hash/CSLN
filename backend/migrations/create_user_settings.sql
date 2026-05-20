-- ============================================================
-- BYOK: สร้างตาราง user_settings สำหรับเก็บ Encrypted API Key
-- รันใน Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    encrypted_key TEXT,           -- Fernet-encrypted API key (ห้ามเก็บ plain text!)
    is_verified BOOLEAN DEFAULT FALSE,
    active_model TEXT DEFAULT 'free-chat',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index สำหรับ lookup ที่เร็ว
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- อัปเดต updated_at อัตโนมัติเมื่อมีการเปลี่ยนแปลง
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON user_settings;
CREATE TRIGGER trg_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) — ป้องกันการเข้าถึงข้ามผู้ใช้
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policy: อนุญาตให้ service_role (backend) เข้าถึงได้ทั้งหมด
-- anon/authenticated ไม่สามารถอ่าน encrypted_key ได้โดยตรง
CREATE POLICY "Service role full access" ON user_settings
    FOR ALL
    USING (true)
    WITH CHECK (true);
