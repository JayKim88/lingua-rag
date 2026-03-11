-- Migration: unit-based → PDF-based architecture
-- Run in Supabase SQL editor
--
-- This migration renames unit_id/textbook_id/level columns to pdf_id/pdf_name
-- across conversations, summaries, notes, and document_chunks tables.

-- ============================================================================
-- 1. conversations: unit_id/textbook_id/level → pdf_id
-- ============================================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pdf_id TEXT;

-- Drop NOT NULL on old columns so new INSERT (pdf_id only) works
ALTER TABLE conversations ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN textbook_id DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN level DROP NOT NULL;

-- Migrate existing data: use unit_id as pdf_id for backward compatibility
UPDATE conversations SET pdf_id = unit_id WHERE pdf_id IS NULL AND unit_id IS NOT NULL;

-- Drop old columns
ALTER TABLE conversations DROP COLUMN IF EXISTS unit_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS textbook_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS level;

CREATE INDEX IF NOT EXISTS idx_conversations_user_pdf
  ON conversations(user_id, pdf_id);

-- ============================================================================
-- 2. summaries: unit_id/unit_title → pdf_id/pdf_name
-- ============================================================================

ALTER TABLE summaries ADD COLUMN IF NOT EXISTS pdf_id TEXT;
ALTER TABLE summaries ADD COLUMN IF NOT EXISTS pdf_name TEXT;

-- Drop NOT NULL on old columns
ALTER TABLE summaries ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE summaries ALTER COLUMN unit_title DROP NOT NULL;

-- Migrate existing data
UPDATE summaries SET pdf_id = unit_id, pdf_name = unit_title
  WHERE pdf_id IS NULL AND unit_id IS NOT NULL;

-- Drop old columns
ALTER TABLE summaries DROP COLUMN IF EXISTS unit_id;
ALTER TABLE summaries DROP COLUMN IF EXISTS unit_title;

CREATE INDEX IF NOT EXISTS idx_summaries_user_pdf
  ON summaries(user_id, pdf_id);

-- ============================================================================
-- 3. notes: unit_id/unit_title → pdf_id/pdf_name
-- ============================================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS pdf_id TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS pdf_name TEXT;

-- Drop NOT NULL on old columns
ALTER TABLE notes ALTER COLUMN unit_id DROP NOT NULL;
ALTER TABLE notes ALTER COLUMN unit_title DROP NOT NULL;

-- Migrate existing data
UPDATE notes SET pdf_id = unit_id, pdf_name = unit_title
  WHERE pdf_id IS NULL AND unit_id IS NOT NULL;

-- Drop old columns
ALTER TABLE notes DROP COLUMN IF EXISTS unit_id;
ALTER TABLE notes DROP COLUMN IF EXISTS unit_title;

CREATE INDEX IF NOT EXISTS idx_notes_user_pdf
  ON notes(user_id, pdf_id);

-- ============================================================================
-- 4. document_chunks: textbook_id → pdf_id
-- ============================================================================

ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS pdf_id TEXT;

-- Migrate existing data
UPDATE document_chunks SET pdf_id = textbook_id
  WHERE pdf_id IS NULL AND textbook_id IS NOT NULL;

-- Drop old columns
ALTER TABLE document_chunks DROP COLUMN IF EXISTS textbook_id;
ALTER TABLE document_chunks DROP COLUMN IF EXISTS unit_id;

CREATE INDEX IF NOT EXISTS idx_document_chunks_pdf_id
  ON document_chunks(pdf_id);
