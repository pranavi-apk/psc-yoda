const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'yoda.db'));
db.pragma('journal_mode = WAL');

// Run schema
const fs = require('fs');
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Clear existing data for clean seed
db.exec('DELETE FROM review_history');
db.exec('DELETE FROM error_patterns');
db.exec('DELETE FROM flashcards');

// ─── Seed Flashcards ────────────────────────────────────────────────────
const insertCard = db.prepare(`
    INSERT INTO flashcards (character, pinyin, error_type, source_section, phonetic_category, box, next_review_at, times_correct, times_wrong, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?, datetime('now', ?))
`);

const cards = [
    // Retroflex errors (zh/ch/sh/r) — boxes 0-1, high error rate
    { char: '石', pinyin: 'shí', type: 'sound', section: 'dan_yin_jie', cat: 'retroflex', box: 0, correct: 1, wrong: 6, age: '-5 days' },
    { char: '树', pinyin: 'shù', type: 'sound', section: 'dan_yin_jie', cat: 'retroflex', box: 0, correct: 0, wrong: 4, age: '-4 days' },
    { char: '声', pinyin: 'shēng', type: 'sound', section: 'dan_yin_jie', cat: 'retroflex', box: 1, correct: 2, wrong: 5, age: '-6 days' },
    { char: '吹', pinyin: 'chuī', type: 'sound', section: 'dan_yin_jie', cat: 'retroflex', box: 0, correct: 0, wrong: 3, age: '-3 days' },
    { char: '住', pinyin: 'zhù', type: 'sound', section: 'dan_yin_jie', cat: 'retroflex', box: 1, correct: 1, wrong: 4, age: '-5 days' },
    { char: '日', pinyin: 'rì', type: 'sound', section: 'dan_yin_jie', cat: 'retroflex', box: 0, correct: 0, wrong: 5, age: '-6 days' },
    { char: '热情', pinyin: 'rèqíng', type: 'sound', section: 'duo_yin_jie', cat: 'retroflex', box: 1, correct: 2, wrong: 3, age: '-4 days' },
    { char: '知识', pinyin: 'zhīshi', type: 'sound', section: 'duo_yin_jie', cat: 'retroflex', box: 0, correct: 1, wrong: 5, age: '-5 days' },
    { char: '认真', pinyin: 'rènzhēn', type: 'sound', section: 'duo_yin_jie', cat: 'retroflex', box: 1, correct: 3, wrong: 4, age: '-6 days' },

    // Tone errors — boxes 0-2
    { char: '小', pinyin: 'xiǎo', type: 'tone', section: 'dan_yin_jie', cat: 'tone3_sandhi', box: 0, correct: 1, wrong: 4, age: '-4 days' },
    { char: '好', pinyin: 'hǎo', type: 'tone', section: 'dan_yin_jie', cat: 'tone3_sandhi', box: 1, correct: 2, wrong: 3, age: '-5 days' },
    { char: '也', pinyin: 'yě', type: 'tone', section: 'dan_yin_jie', cat: 'tone3_sandhi', box: 2, correct: 4, wrong: 3, age: '-6 days' },
    { char: '路', pinyin: 'lù', type: 'tone', section: 'dan_yin_jie', cat: 'tone_pair', box: 0, correct: 0, wrong: 3, age: '-3 days' },
    { char: '此', pinyin: 'cǐ', type: 'tone', section: 'dan_yin_jie', cat: 'tone3_sandhi', box: 1, correct: 1, wrong: 2, age: '-4 days' },
    { char: '美好', pinyin: 'měihǎo', type: 'tone', section: 'duo_yin_jie', cat: 'tone3_sandhi', box: 0, correct: 0, wrong: 3, age: '-3 days' },
    { char: '语言', pinyin: 'yǔyán', type: 'tone', section: 'duo_yin_jie', cat: 'tone3_sandhi', box: 2, correct: 3, wrong: 2, age: '-5 days' },
    { char: '以后', pinyin: 'yǐhòu', type: 'tone', section: 'duo_yin_jie', cat: 'tone3_sandhi', box: 1, correct: 2, wrong: 3, age: '-4 days' },

    // Nasal final errors — boxes 1-2
    { char: '林', pinyin: 'lín', type: 'sound', section: 'dan_yin_jie', cat: 'nasal_final', box: 1, correct: 2, wrong: 3, age: '-5 days' },
    { char: '清', pinyin: 'qīng', type: 'sound', section: 'dan_yin_jie', cat: 'nasal_final', box: 2, correct: 3, wrong: 2, age: '-6 days' },
    { char: '景', pinyin: 'jǐng', type: 'sound', section: 'dan_yin_jie', cat: 'nasal_final', box: 1, correct: 1, wrong: 3, age: '-4 days' },
    { char: '心情', pinyin: 'xīnqíng', type: 'sound', section: 'duo_yin_jie', cat: 'nasal_final', box: 2, correct: 4, wrong: 2, age: '-5 days' },
    { char: '风景', pinyin: 'fēngjǐng', type: 'sound', section: 'duo_yin_jie', cat: 'nasal_final', box: 1, correct: 2, wrong: 3, age: '-4 days' },

    // L/N confusion — box 1
    { char: '女', pinyin: 'nǚ', type: 'sound', section: 'dan_yin_jie', cat: 'ln_confusion', box: 1, correct: 2, wrong: 3, age: '-5 days' },
    { char: '旅', pinyin: 'lǚ', type: 'sound', section: 'dan_yin_jie', cat: 'ln_confusion', box: 1, correct: 1, wrong: 2, age: '-4 days' },
    { char: '绿色', pinyin: 'lǜsè', type: 'sound', section: 'duo_yin_jie', cat: 'ln_confusion', box: 1, correct: 2, wrong: 3, age: '-5 days' },
    { char: '努力', pinyin: 'nǔlì', type: 'sound', section: 'duo_yin_jie', cat: 'ln_confusion', box: 1, correct: 3, wrong: 2, age: '-4 days' },

    // Mastered cards — boxes 3-4
    { char: '大', pinyin: 'dà', type: 'tone', section: 'dan_yin_jie', cat: 'tone_pair', box: 4, correct: 8, wrong: 1, age: '-7 days' },
    { char: '人', pinyin: 'rén', type: 'sound', section: 'dan_yin_jie', cat: 'retroflex', box: 3, correct: 6, wrong: 2, age: '-7 days' },
    { char: '天', pinyin: 'tiān', type: 'tone', section: 'dan_yin_jie', cat: 'tone_pair', box: 4, correct: 7, wrong: 1, age: '-7 days' },
    { char: '中国', pinyin: 'zhōngguó', type: 'sound', section: 'duo_yin_jie', cat: 'retroflex', box: 3, correct: 5, wrong: 2, age: '-6 days' },
    { char: '学习', pinyin: 'xuéxí', type: 'tone', section: 'duo_yin_jie', cat: 'tone_pair', box: 4, correct: 9, wrong: 1, age: '-7 days' },
    { char: '朋友', pinyin: 'péngyou', type: 'tone', section: 'duo_yin_jie', cat: 'nasal_final', box: 3, correct: 6, wrong: 2, age: '-6 days' },
    { char: '工作', pinyin: 'gōngzuò', type: 'tone', section: 'duo_yin_jie', cat: 'tone_pair', box: 4, correct: 8, wrong: 0, age: '-7 days' },
    { char: '老师', pinyin: 'lǎoshī', type: 'tone', section: 'duo_yin_jie', cat: 'tone3_sandhi', box: 3, correct: 5, wrong: 2, age: '-6 days' },
];

const BOX_INTERVALS = ['0 seconds', '1 hours', '8 hours', '1 days', '3 days'];

const insertMany = db.transaction(() => {
    for (const c of cards) {
        const reviewOffset = BOX_INTERVALS[c.box] || '0 seconds';
        insertCard.run(c.char, c.pinyin, c.type, c.section, c.cat, c.box, `-${reviewOffset}`, c.correct, c.wrong, c.age);
    }
});
insertMany();

console.log(`Seeded ${cards.length} flashcards`);

// ─── Seed Review History ────────────────────────────────────────────────
const insertReview = db.prepare(`
    INSERT INTO review_history (flashcard_id, score, was_correct, box_before, box_after, reviewed_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', ?))
`);

const allCards = db.prepare('SELECT id, box FROM flashcards').all();

const seedReviews = db.transaction(() => {
    let count = 0;
    for (let day = -7; day <= 0; day++) {
        // 5-10 reviews per day
        const reviewsPerDay = 5 + Math.floor(Math.random() * 6);
        for (let r = 0; r < reviewsPerDay; r++) {
            const card = allCards[Math.floor(Math.random() * allCards.length)];
            const score = 40 + Math.random() * 55; // 40-95 range
            const wasCorrect = score >= 70 ? 1 : 0;
            const boxBefore = Math.max(0, card.box - (wasCorrect ? 1 : -1));
            const hourOffset = Math.floor(Math.random() * 12);
            insertReview.run(card.id, score.toFixed(1), wasCorrect, boxBefore, card.box, `${day} days ${hourOffset} hours`);
            count++;
        }
    }
    console.log(`Seeded ${count} review history entries`);
});
seedReviews();

// ─── Seed Error Patterns ────────────────────────────────────────────────
const insertPattern = db.prepare(`
    INSERT INTO error_patterns (pattern_name, pattern_type, description, affected_cards, severity, genai_diagnosis)
    VALUES (?, ?, ?, ?, ?, ?)
`);

const retroflexCards = db.prepare("SELECT id FROM flashcards WHERE phonetic_category = 'retroflex'").all();
const nasalCards = db.prepare("SELECT id FROM flashcards WHERE phonetic_category = 'nasal_final'").all();
const tone3Cards = db.prepare("SELECT id FROM flashcards WHERE phonetic_category = 'tone3_sandhi'").all();
const lnCards = db.prepare("SELECT id FROM flashcards WHERE phonetic_category = 'ln_confusion'").all();

const seedPatterns = db.transaction(() => {
    insertPattern.run(
        'Retroflex Initials (zh/ch/sh/r)',
        'cantonese_interference',
        'Cantonese lacks retroflex consonants. Speakers substitute flat z/c/s for zh/ch/sh.',
        JSON.stringify(retroflexCards.map(c => c.id)),
        0.85,
        'Cantonese does not have retroflex initials (zh, ch, sh, r). As a result, you tend to pronounce these as flat alveolar sounds (z, c, s). To fix this:\n\n1. **Tongue position**: Curl the tip of your tongue upward and back, touching the hard palate\n2. **Practice pair**: Say "zhi" vs "zi" slowly — feel the tongue curl back for "zhi"\n3. **Key difference**: Retroflex sounds have a "thicker" quality; flat sounds are "thinner"\n4. **Daily drill**: Read "吃饭 chīfàn" and "知道 zhīdào" 10 times each, exaggerating the curl'
    );

    insertPattern.run(
        'Nasal Finals (-in/-ing, -an/-ang)',
        'cantonese_interference',
        'Cantonese merges front and back nasal endings. Speakers confuse -in/-ing and -an/-ang.',
        JSON.stringify(nasalCards.map(c => c.id)),
        0.55,
        'In Cantonese, the distinction between front nasals (-n) and back nasals (-ng) is weakening, especially in younger speakers. This causes confusion in Mandarin:\n\n1. **-in vs -ing**: For -in, tongue tip touches upper teeth ridge. For -ing, back of tongue rises to soft palate\n2. **Feel the difference**: Say "pin" (front of mouth) vs "ping" (resonates in nose/throat)\n3. **Practice pairs**: 林 lín vs 灵 líng, 心 xīn vs 星 xīng\n4. **Trick**: Place finger on throat — -ng endings cause more vibration'
    );

    insertPattern.run(
        'Tone 3 Sandhi',
        'tone_pattern',
        'Two consecutive Tone 3 syllables require the first to change to Tone 2. Cantonese speakers often miss this rule.',
        JSON.stringify(tone3Cards.map(c => c.id)),
        0.65,
        'Mandarin Tone 3 sandhi rule: when two Tone 3 syllables appear together, the first changes to Tone 2. Cantonese has no equivalent rule, so this feels unnatural:\n\n1. **Rule**: 你好 nǐhǎo → actually pronounced ní hǎo (first tone rises)\n2. **Common mistakes**: 美好 měihǎo, 以后 yǐhòu — first syllable must rise\n3. **Practice**: Read slowly, deliberately raising pitch on the first of any Tone 3 pair\n4. **Listen and mimic**: Use the TTS to hear the correct sandhi pattern, then record yourself'
    );

    insertPattern.run(
        'L/N Initial Confusion',
        'cantonese_interference',
        'Some Cantonese dialects merge l and n initials. Speakers may swap 女 nǚ and 旅 lǚ.',
        JSON.stringify(lnCards.map(c => c.id)),
        0.40,
        'In many Cantonese varieties, l and n are interchangeable (e.g., 你 is pronounced "lei" not "nei"). This transfers to Mandarin:\n\n1. **N sound**: Tongue tip presses firmly against upper teeth ridge, air flows through nose\n2. **L sound**: Tongue tip touches teeth ridge lightly, air flows around sides of tongue\n3. **Test**: Hold your nose — you can still say "la" but NOT "na"\n4. **Practice pairs**: 女 nǚ vs 旅 lǚ, 南 nán vs 蓝 lán'
    );
});
seedPatterns();

console.log('Seeded 4 error patterns');
console.log('Database seed complete!');

db.close();
