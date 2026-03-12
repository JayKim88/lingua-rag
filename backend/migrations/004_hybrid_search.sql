-- Migration 004: Hybrid Search support (BM25 + Vector)
--
-- Adds a tsvector column for PostgreSQL full-text search alongside
-- the existing pgvector embedding column. Enables Reciprocal Rank
-- Fusion (RRF) hybrid search at query time.
--
-- Run in Supabase SQL Editor.

-- 1. Add tsvector column for full-text search
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector;

-- 2. Populate tsvector for existing chunks using 'simple' config
--    (language-agnostic tokenizer — works for any language)
UPDATE document_chunks
SET tsv = to_tsvector('simple', content)
WHERE tsv IS NULL;

-- 3. Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv
  ON document_chunks USING GIN (tsv);

-- 4. Composite index for pdf_id + tsv queries
CREATE INDEX IF NOT EXISTS idx_document_chunks_pdf_tsv
  ON document_chunks (pdf_id)
  WHERE tsv IS NOT NULL;
