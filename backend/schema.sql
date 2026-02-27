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
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_unit
    ON conversations(user_id, unit_id);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
    ON conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at DESC);
