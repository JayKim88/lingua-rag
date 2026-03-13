CREATE TABLE IF NOT EXISTS vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pdf_id TEXT NOT NULL,
  page_num INTEGER NOT NULL,
  word TEXT NOT NULL,
  context TEXT,
  meaning TEXT,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_user_pdf ON vocabulary (user_id, pdf_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_user_pdf_page ON vocabulary (user_id, pdf_id, page_num);
