CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character TEXT NOT NULL UNIQUE,
    pinyin TEXT,
    error_type TEXT NOT NULL,
    source_section TEXT,
    phonetic_category TEXT,
    cantonese_interference TEXT,
    box INTEGER DEFAULT 0,
    next_review_at TEXT DEFAULT (datetime('now')),
    times_correct INTEGER DEFAULT 0,
    times_wrong INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flashcard_id INTEGER NOT NULL REFERENCES flashcards(id),
    score REAL,
    was_correct INTEGER NOT NULL,
    error_detail TEXT,
    box_before INTEGER,
    box_after INTEGER,
    reviewed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS error_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern_name TEXT NOT NULL,
    pattern_type TEXT,
    description TEXT,
    affected_cards TEXT,
    severity REAL DEFAULT 0.0,
    genai_diagnosis TEXT,
    generated_at TEXT DEFAULT (datetime('now'))
);
