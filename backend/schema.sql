-- LinguaRAG Database Schema
-- Run this once to initialize the database.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable vector similarity search (v0.2 RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- Conversations: One thread per (user, unit)
-- user_id references Supabase auth.users.id
CREATE TABLE IF NOT EXISTS conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    unit_id         VARCHAR(10) NOT NULL,
    textbook_id     VARCHAR(50) NOT NULL DEFAULT 'dokdokdok-a1',
    level           VARCHAR(10) NOT NULL DEFAULT 'A1',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages: Individual chat messages
CREATE TABLE IF NOT EXISTS messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    token_count     INTEGER,
    feedback        VARCHAR(4) CHECK (feedback IN ('up', 'down')) DEFAULT NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_unit
    ON conversations(user_id, unit_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
    ON conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at DESC);

-- Document chunks: PDF textbook content indexed for RAG (v0.2)
CREATE TABLE IF NOT EXISTS document_chunks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    textbook_id  VARCHAR(50) NOT NULL DEFAULT 'dokdokdok-a1',
    unit_id      VARCHAR(10),           -- NULL = cross-unit content
    chunk_index  INTEGER NOT NULL,
    content      TEXT NOT NULL,
    embedding    vector(1536),          -- text-embedding-3-small
    metadata     JSONB DEFAULT '{}',    -- {"page_start": N, "page_end": N}
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_unit
    ON document_chunks(textbook_id, unit_id);

-- ivfflat index for approximate nearest neighbor search
-- Run AFTER inserting data (requires at least 1 row with non-null embedding)
-- CREATE INDEX ON document_chunks
--     USING ivfflat (embedding vector_cosine_ops)
--     WITH (lists = 10);

-- Summaries: User-saved chat session summaries
CREATE TABLE IF NOT EXISTS summaries (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    unit_id    VARCHAR(50) NOT NULL,
    unit_title VARCHAR(255) NOT NULL,
    content    TEXT NOT NULL,
    saved_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_user_unit
    ON summaries(user_id, unit_id, saved_at DESC);

-- Notes: User-written free-form study notes
CREATE TABLE IF NOT EXISTS notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL,
    unit_id    VARCHAR(50) NOT NULL,
    unit_title VARCHAR(255) NOT NULL,
    content    TEXT NOT NULL,
    saved_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_unit
    ON notes(user_id, unit_id, saved_at DESC);
