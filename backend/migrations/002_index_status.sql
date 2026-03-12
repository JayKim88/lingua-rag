-- Migration 002: Add index_status to pdf_files + clean up document_chunks schema
-- Run in Supabase SQL editor

-- ============================================================================
-- 1. pdf_files: add index_status column
-- ============================================================================

ALTER TABLE pdf_files
  ADD COLUMN IF NOT EXISTS index_status TEXT NOT NULL DEFAULT 'pending';

-- Valid values: pending, indexing, ready, failed

-- ============================================================================
-- 2. document_chunks: ensure post-migration schema is clean
--    After 001_unit_to_pdf.sql, columns should be:
--    id, pdf_id, chunk_index, content, embedding, metadata, created_at
--    Add page_number for page-based chunking
-- ============================================================================

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS page_number INTEGER;

-- Drop legacy columns if they still exist
ALTER TABLE document_chunks DROP COLUMN IF EXISTS textbook_id;
ALTER TABLE document_chunks DROP COLUMN IF EXISTS unit_id;

-- Index for filtering chunks by pdf + page
CREATE INDEX IF NOT EXISTS idx_document_chunks_pdf_page
  ON document_chunks(pdf_id, page_number);
