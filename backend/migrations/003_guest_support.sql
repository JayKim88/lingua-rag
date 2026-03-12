-- Migration 003: Support guest (unauthenticated) PDF uploads
-- Run in Supabase SQL editor
--
-- Guest PDFs use a sentinel user_id (all zeros). The existing FK constraint
-- on pdf_files.user_id references auth.users, which blocks this.
-- Strategy: drop the FK, keep the column NOT NULL with a default sentinel,
-- and enforce ownership at the application layer for authenticated users.
-- conversations.user_id also needs the same treatment for future guest chat persistence.

-- ============================================================================
-- 1. pdf_files: drop FK to auth.users so guest UUID is allowed
-- ============================================================================

-- Find and drop the FK constraint (name may vary by environment)
DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'pdf_files'
    AND tc.constraint_type = 'FOREIGN KEY';
  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE pdf_files DROP CONSTRAINT ' || fk_name;
  END IF;
END
$$;

-- ============================================================================
-- 2. conversations: drop FK to auth.users for future guest chat support
-- ============================================================================

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  WHERE tc.table_name = 'conversations'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND tc.constraint_name LIKE '%user%';
  IF fk_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE conversations DROP CONSTRAINT ' || fk_name;
  END IF;
END
$$;

-- ============================================================================
-- 3. Cleanup index: help find guest PDFs for periodic purge
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pdf_files_guest
  ON pdf_files(created_at)
  WHERE user_id = '00000000-0000-0000-0000-000000000000';
