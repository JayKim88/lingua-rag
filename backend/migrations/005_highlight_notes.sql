-- Migration 005: Highlight Notes
--
-- Extends pdf_annotations to support text-highlight notes (in addition to
-- existing position-based sticky notes).
--
-- New columns:
--   type            — 'sticky' (default, existing) or 'highlight'
--   highlighted_text — the PDF text that was selected/highlighted
--
-- Run in Supabase SQL Editor.

-- 1. Add type column (default 'sticky' preserves existing data)
ALTER TABLE pdf_annotations
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'sticky';

-- 2. Add highlighted_text column (nullable — only used for type='highlight')
ALTER TABLE pdf_annotations
  ADD COLUMN IF NOT EXISTS highlighted_text TEXT;
