-- ============================================================
-- Migration: Add paid_tokens_used to user_quotas
-- ============================================================

ALTER TABLE user_quotas 
ADD COLUMN IF NOT EXISTS paid_tokens_used INT DEFAULT 0;
