-- LinguaRAG Database Schema
-- Run this once to initialize the database.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Sessions: Anonymous user identification via cookie
CREATE TABLE IF NOT EXISTS sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations: One thread per (session, unit)
-- New unit → new conversation (FR-3)
CREATE TABLE IF NOT EXISTS conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_conversations_session_unit
    ON conversations(session_id, unit_id);

CREATE INDEX IF NOT EXISTS idx_conversations_session_updated
    ON conversations(session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages(conversation_id, created_at DESC);