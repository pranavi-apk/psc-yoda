
const socket = io();

// ─── State ────────────────────────────────────────────────────────────────
const STATE = {
    lang: 'hk',
    grade: 1,
    activeSection: null,
    currentText: '',      // clean Mandarin string (no HTML)
    currentChars: [],     // [{c, p}, ...] from last API call
    sessionHistory: [],
    recordingBuffer: [],  // Float32 samples accumulated during recording
    playbackUrl: null,    // Object URL of last recording WAV
    voice: 'cmn-CN-Chirp3-HD-Aoede',  // default: female
    pageNum: 1,            // storybook page counter
    selectedTheme: '',     // Current story theme
    isGenerating: false,   // Lock to prevent glitches
    currentSection3Part: null, // For Section 3 (1, 2, or 3)
    currentOptions: [],        // For Section 3
    correctAnswer: null,      // For Section 3
    selectedOptionIndex: null, // For Section 3
    mockExam: {
        timerId: null,
        data: null,
        currentPartIndex: 0,
        timeLeft: 0,
        isRecording: false,
        sectionResults: [] // [{ sectionId, totalScore, details }]
    },
    mockScores: {}, // { examId: { bestScore, lastResults: [] } }
    flashcard: {
        queue: [],
        currentIndex: 0,
        currentCard: null,
        isFlipped: false,
        sessionCorrect: 0,
        sessionWrong: 0,
        coachingTips: {}
    }
};

// ─── DOM ──────────────────────────────────────────────────────────────────
const screens = {
    onboarding:      document.getElementById('onboarding'),
    dashboard:       document.getElementById('dashboard'),
    themeSelection:  document.getElementById('theme-selection'),
    exercise:        document.getElementById('exercise'),
    report:          document.getElementById('report'),
    flashcardList:   document.getElementById('flashcard-list'),
    flashcardReview: document.getElementById('flashcard-review'),
    masteryDashboard: document.getElementById('mastery-dashboard'),
    mockExamDashboard: document.getElementById('mock-exam-dashboard'),
    mockExamInstructions: document.getElementById('mock-exam-instructions'),
    mockExamSession:   document.getElementById('mock-exam-session'),
    section3Parts:      document.getElementById('section3-parts'),
    'playground-dashboard': document.getElementById('playground-dashboard'),
    'match-game':       document.getElementById('match-game'),
    'tone-game':        document.getElementById('tone-game'),
    'minimal-pairs-game': document.getElementById('minimal-pairs-game')
};


const gradeBtns     = document.querySelectorAll('.grade-btn');
const startJourneyBtn = document.getElementById('start-journey-btn');
const recordBtn     = document.getElementById('record-btn');
const resultArea    = document.getElementById('result-area');
const yodaModal     = document.getElementById('yoda-modal');
const feedbackOverlay = document.getElementById('feedback-overlay');
const targetTextEl  = document.getElementById('target-text');

// ─── Storybook DOM refs ──────────────────────────────────────────────────
const contentArea    = document.getElementById('content-area');
const storybookPanel = document.getElementById('storybook-panel');
const storySpine     = document.getElementById('story-spine');
const storyTitleEl   = document.getElementById('story-title-el');
const storyImage     = document.getElementById('story-image');
const storyPageNum   = document.getElementById('story-page-num');

// ─── Storybook helpers ────────────────────────────────────────────────────
function activateStorybook() {
    contentArea.classList.add('storybook-active');
    storybookPanel.classList.remove('hidden');
    storySpine.classList.remove('hidden');
    storyTitleEl.classList.remove('hidden');
    STATE.pageNum = 1;
    storyPageNum.textContent = '第 1 頁';
}

function deactivateStorybook() {
    contentArea.classList.remove('storybook-active');
    storybookPanel.classList.add('hidden');
    storySpine.classList.add('hidden');
    storyTitleEl.classList.add('hidden');
    storyImage.src = '';
}

// ─── Localization ─────────────────────────────────────────────────────────
// Section titles per language (matching NEW section IDs from server)
const SECTION_TITLES = {
    dan_yin_jie: { en: '单音节字词 — Single Syllable', hk: '單音節字詞 — 單字', cn: '单音节字词' },
    duo_yin_jie: { en: '多音节词语 — Multi-syllable',  hk: '多音節詞語 — 複詞', cn: '多音节词语' },
    lang_du:     { en: '朗读短文 — Read Aloud',         hk: '朗讀短文 — 朗讀', cn: '朗读短文' },
    ming_ti:     { en: '命题说话 — Free Talk',          hk: '命題說話 — 自由講', cn: '命题说话' },
    xuan_ze:     { en: '选择判断 — Word Choice',        hk: '選擇判斷 — 選擇', cn: '选择判断' }
};

const LOCALE = {
    en: {
        welcome: 'Welcome to Yoda',
        subtitle: 'Your AI personal trainer for the Putonghua Proficiency Test (PSC).',
        tips: {
            success: 'Yoda! Native Level Proficiency!',
            good: 'Good effort. Watch the highlighted tones.',
            bad: 'Keep going! Focus on slow, clear pronunciation.'
        }
    },
    cn: {
        welcome: '欢迎来到 Yoda (優答)',
        subtitle: '您的普通话水平测试 AI 专属教练。',
        tips: {
            success: '優答！您已达到母语水平！',
            good: '不错。注意高亮单词的声调。',
            bad: '继续加油。请放慢语速，清晰发音。'
        }
    },
    hk: {
        welcome: '歡迎來到 Yoda (優答)',
        subtitle: '您的普通話水平測試 AI 專屬教練。',
        tips: {
            success: '優答！您已達到母語水平！',
            good: '唔錯。注意高亮字嘅聲調。',
            bad: '繼續努力。試下放慢語速，清晰啲。'
        }
    }
};

// ─── Event Listeners ─────────────────────────────────────────────────────


gradeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        gradeBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        STATE.grade = parseInt(btn.dataset.grade);
        startJourneyBtn.disabled = false;
    });
});

startJourneyBtn.addEventListener('click', () => switchScreen('dashboard'));

recordBtn.addEventListener('click', async () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

// ─── Navigation ───────────────────────────────────────────────────────────

function switchScreen(name) {
    Object.values(screens).forEach(el => el.classList.remove('active'));
    if (screens[name]) screens[name].classList.add('active');
    
    // Global Navbar handling
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        // Hide navbar in Exam Mode, Instructions, and Report
        if (name === 'mockExamSession' || name === 'mockExamInstructions' || name === 'report') {
            navbar.classList.add('hidden');
        } else {
            navbar.classList.remove('hidden');
        }
    }

    // Toggle nav buttons visibility (only hide on onboarding)
    const navBtns = ['nav-mock-btn', 'nav-flashcard-btn', 'nav-mastery-btn', 'nav-report-btn'];
    navBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (name === 'onboarding') btn.classList.add('hidden');
            else btn.classList.remove('hidden');
        }
    });

    if (name === 'dashboard') {
        const gradeLabels = { 1: '一级 Grade 1', 2: '二级 Grade 2', 3: '三级 Grade 3' };
        document.getElementById('current-grade-display').innerText =
            (gradeLabels[STATE.grade] || 'Grade ' + STATE.grade) + ' Target';
    }
}

window.goToDashboard = () => {
    stopRecording();
    STATE.selectedTheme = '';
    STATE.activeSection = null;
    STATE.currentSection3Part = null;
    deactivateStorybook();
    switchScreen('dashboard');
};

window.goToSection3Parts = () => {
    stopRecording();
    switchScreen('section3Parts');
};

// ─── Mock Exam Scoring Persistence ──────────────────────────────────────

function loadMockScores() {
    try {
        const saved = localStorage.getItem('yoda_mock_scores');
        if (saved) {
            STATE.mockScores = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load mock scores:', e);
    }
}

function saveMockScore(examId, scoreData) {
    // scoreData: { totalScore, sectionResults }
    const current = STATE.mockScores[examId] || { bestScore: 0 };
    if (scoreData.totalScore > current.bestScore) {
        STATE.mockScores[examId] = {
            bestScore: scoreData.totalScore,
            lastResults: scoreData.sectionResults,
            date: new Date().toISOString()
        };
    } else {
        // Just update last results but keep best score
        STATE.mockScores[examId].lastResults = scoreData.sectionResults;
        STATE.mockScores[examId].lastDate = new Date().toISOString();
    }
    
    localStorage.setItem('yoda_mock_scores', JSON.stringify(STATE.mockScores));
}

loadMockScores(); // Initial load

window.showMockScoreDetails = (examId, isFromExam = false) => {
    const data = STATE.mockScores[examId];
    if (!data) return;

    const modal = document.getElementById('mock-result-modal');
    const content = document.getElementById('modal-body-content');
    
    const closeCall = isFromExam ? 'closeModal(); goToMockExamDashboard();' : 'closeModal();';
    const score = Math.round(data.bestScore);
    const pscLevel = getPscLevel(score);

    if (data.genAiReport) {
        // Render the premium GenAI report content
        content.innerHTML = `
            <div style="margin-bottom:20px; text-align:center;">
                <h2 style="font-size:1.6rem; color:#1a1a1a; margin-bottom:5px;">PSC Mock Exam Report Card</h2>
                <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
                    <div style="font-size:3.5rem; font-weight:900; color:var(--primary-color); line-height:1;">${score}<span style="font-size:1.2rem; opacity:0.4; font-weight:400;"> / 100</span></div>
                    <div class="level-badge ${pscLevel.class}">${pscLevel.name}</div>
                </div>
            </div>
            <div class="rich-report-container" style="color:#333; font-size:0.95rem;">
                ${data.genAiReport}
            </div>
            <button class="card-btn" onclick="${closeCall}" style="margin-top:25px; width:100%; background:#1a1a1a; color:white; border:none; padding:18px; border-radius:15px; font-weight:700; font-size:1.1rem; cursor:pointer;">Continue</button>
        `;
        return;
    }

    // Fallback basic view if GenAI report isn't available
    let rowsHtml = '';
    const sectionNames = ["Section 1: Single Characters", "Section 2: Multi-syllable Words", "Section 3: Selective Judgment", "Section 4: Reading Passage", "Section 5: Free Talk"];
    
    data.lastResults.forEach((res, i) => {
        if (!res) return;
        const name = sectionNames[i] || `Section ${i+1}`;
        rowsHtml += `
            <div style="padding:12px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:600; font-size:0.95rem; color:#1a1a1a;">${name}</div>
                    <div style="font-size:0.8rem; opacity:0.6;">Weight: ${res.sectionId === 'section_3' ? 10 : (res.sectionId === 'section_4' || res.sectionId === 'section_5' ? 30 : (res.sectionId === 'section_1' ? 10 : 20))} pts</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.1rem; font-weight:700; color:var(--primary-color);">${res.totalScore.toFixed(1)}</div>
                    <div style="font-size:0.75rem; color:#27ae60;">${Math.round(res.percent)}% Accuracy</div>
                </div>
            </div>
        `;
    });

    content.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <h2 style="font-size:1.5rem; margin-bottom:5px; color:#1a1a1a;">${isFromExam ? 'Exam Complete! 🎉' : 'Mock Exam Report'}</h2>
            <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                <div style="font-size:3rem; font-weight:800; color:var(--primary-color); line-height:1;">${score}<span style="font-size:1rem; opacity:0.5; font-weight:400;"> / 100</span></div>
                <div class="level-badge ${pscLevel.class}">${pscLevel.name}</div>
            </div>
            <p style="opacity:0.6; font-size:0.85rem; margin-top:10px;">Last attempt on ${new Date(data.date).toLocaleDateString()}</p>
        </div>
        <div style="background:#f9f9f9; border-radius:12px; overflow:hidden; border:1px solid #eee;">
            ${rowsHtml}
        </div>
        <button class="card-btn" onclick="${closeCall}" style="margin-top:20px; width:100%; background:#1a1a1a; color:white; border:none; padding:15px; border-radius:12px; font-weight:700; font-size:1rem;">Continue</button>
    `;
    
    modal.classList.add('show');
};

function getPscLevel(score) {
    if (score >= 97) return { name: "Level 1-A (一级甲等)", class: "lvl-1a" };
    if (score >= 92) return { name: "Level 1-B (一级乙等)", class: "lvl-1b" };
    if (score >= 87) return { name: "Level 2-A (二级甲等)", class: "lvl-2a" };
    if (score >= 80) return { name: "Level 2-B (二级乙等)", class: "lvl-2b" };
    if (score >= 70) return { name: "Level 3-A (三级甲等)", class: "lvl-3a" };
    if (score >= 60) return { name: "Level 3-B (三级乙等)", class: "lvl-3b" };
    return { name: "Not enough to pass (不合格)", class: "lvl-fail" };
}

window.closeModal = () => {
    const modal = document.getElementById('mock-result-modal');
    if (modal) {
        modal.classList.remove('show');
    }
    // Also handle generic yoda-modal just in case
    const yodaModal = document.getElementById('yoda-modal');
    if (yodaModal) yodaModal.classList.remove('show');
};

window.handleBackFromExercise = () => {
    stopRecording();
    deactivateStorybook();
    
    // If we came from Section 3 parts selection, go back there
    if (STATE.activeSection === 'xuan_ze' || STATE.currentSection3Part) {
        STATE.currentSection3Part = null;
        switchScreen('section3Parts');
        return;
    }
    
    // If we came from Section 4 theme selection
    if (STATE.activeSection === 'lang_du' && STATE.selectedTheme) {
        // Only go back to theme selection if it wasn't a "CLASSIC" story (which has no theme selection but reuse the screen)
        // Wait, Section 4 always goes through theme selection unless it's a direct start.
        // For now, let's just handle Section 3 as requested, and optionally Section 4.
        switchScreen('themeSelection');
        return;
    }

    // Default: Go to dashboard
    window.goToDashboard();
};

function updateUIText() {
    document.getElementById('welcome-title').innerText  = LOCALE[STATE.lang].welcome;
    document.getElementById('welcome-subtitle').innerText = LOCALE[STATE.lang].subtitle;
    if (STATE.activeSection) {
        const titles = SECTION_TITLES[STATE.activeSection] || {};
        document.getElementById('exercise-title').innerText = titles[STATE.lang] || STATE.activeSection;
    }
}

// ─── Exercise Start ───────────────────────────────────────────────────────

window.startExercise = async (section, part = null) => {
    STATE.activeSection = section;
    STATE.currentSection3Part = part;

    // ── For "lang_du" (Story), show theme selection first ──
    if (section === 'lang_du') {
        switchScreen('themeSelection');
        return;
    }

    switchScreen('exercise');
    deactivateStorybook();

    // Reset UI
    resultArea.classList.add('hidden');
    feedbackOverlay.style.display = 'none';
    feedbackOverlay.innerHTML = '';
    targetTextEl.style.display = 'flex';
    recordBtn.classList.remove('recording');
    document.getElementById('record-text').innerText = 'Start Recording';
    isRecording = false;

    const titles = SECTION_TITLES[section] || {};
    document.getElementById('exercise-title').innerText = titles[STATE.lang] || section;

    await generateNextContent(section);
};

window.selectTheme = async (theme) => {
    STATE.selectedTheme = theme;
    switchScreen('exercise');
    activateStorybook();

    // Reset UI
    resultArea.classList.add('hidden');
    feedbackOverlay.style.display = 'none';
    feedbackOverlay.innerHTML = '';
    targetTextEl.style.display = 'flex';
    recordBtn.classList.remove('recording');
    document.getElementById('record-text').innerText = 'Start Recording';
    isRecording = false;

    // Reset diagnostics
    document.getElementById('mentor-diagnostic').classList.add('hidden');
    document.getElementById('mentor-tip').style.display = 'block';
    document.getElementById('tip-text').innerText = 'Nice work!';

    const titles = SECTION_TITLES['lang_du'] || {};
    document.getElementById('exercise-title').innerText = titles[STATE.lang] || '朗读短文';

    await generateNextContent('lang_du');
};

// ─── GenAI Content Fetch ──────────────────────────────────────────────────

async function generateNextContent(section, previousText) {
    if (STATE.isGenerating) return;
    STATE.isGenerating = true;

    const sec = section || STATE.activeSection;
    // Show loading state
    targetTextEl.innerHTML = '<span class="generating-label">\u23f3 Generating\u2026</span>';
    targetTextEl.style.display = 'flex';
    feedbackOverlay.style.display = 'none';
    feedbackOverlay.innerHTML = '';
    if (sec === 'lang_du') storyTitleEl.textContent = '\u2026';

    try {
        const res = await fetch('/api/generate-content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                section: sec,
                grade: STATE.grade,
                previousText: previousText || '',
                theme: STATE.selectedTheme,
                part: STATE.currentSection3Part
            })
        });
        const data = await res.json();
        if (data.text) {
            STATE.currentText  = data.text;
            STATE.currentChars = data.chars || [];
            STATE.currentOptions = data.options || [];
            STATE.correctAnswer = data.correct || null;
            STATE.selectedOptionIndex = null;

            // ── Storybook: title + Pixabay image ──
            if (sec === 'lang_du') {
                storyTitleEl.textContent = data.title || '朗读故事';
                if (data.keyword) {
                    fetch(`/api/pixabay?q=${encodeURIComponent(data.keyword)}`)
                        .then(r => r.json())
                        .then(img => {
                            if (img.imageUrl) {
                                storyImage.style.opacity = '0';
                                storyImage.onload = () => { storyImage.style.opacity = '1'; };
                                storyImage.src = img.imageUrl;
                            }
                        })
                        .catch(() => {});
                }
            }

            renderPromptWithPinyin(STATE.currentChars, STATE.currentText);
        }
    } catch (e) {
        console.error('Content gen failed:', e);
        STATE.currentText = '今天天气很好。';
        STATE.currentChars = [];
        targetTextEl.innerText = STATE.currentText;
    } finally {
        STATE.isGenerating = false;
    }
}

// ─── Render Prompt With Pinyin ────────────────────────────────────────────
// Groups consecutive non-punctuation chars into "word blocks" so pinyin
// appears as a phrase under the word, not split per character.

function renderPromptWithPinyin(chars, plainText) {
    const displayEl = document.getElementById('target-text');
    const choiceArea = document.getElementById('selective-choice-area');
    
    // Reset Visibility
    displayEl.classList.remove('hidden');
    choiceArea.classList.add('hidden');
    recordBtn.classList.remove('hidden');
    recordBtn.style.opacity = '1';
    recordBtn.style.pointerEvents = 'auto';

    if (STATE.activeSection === 'xuan_ze' && STATE.currentOptions.length > 0) {
        renderSection3Choice();
        return;
    }

    displayEl.innerHTML = '';
    const showPinyin = STATE.lang !== 'cn';

    if (!chars || chars.length === 0 || !showPinyin) {
        targetTextEl.innerText = plainText;
        return;
    }

    // Group chars into word-blocks: split on punctuation (p === "")
    const groups = [];
    let current = [];
    chars.forEach(item => {
        if (!item.p) {
            if (current.length) { groups.push({ type: 'word', items: current }); current = []; }
            groups.push({ type: 'punct', char: item.c });
        } else {
            current.push(item);
        }
    });
    if (current.length) groups.push({ type: 'word', items: current });

    targetTextEl.innerHTML = groups.map(g => {
        if (g.type === 'punct') {
            return `<div class="char-block punct-block"><span class="char-text">${g.char}</span></div>`;
        }
        // Whole word: join chars, join pinyins with space
        const hanzi  = g.items.map(i => i.c).join('');
        const pinyin = g.items.map(i => i.p).join(' ');
        return `<div class="char-block word-block" onclick="playPronunciation('${hanzi}', 0.85, STATE.voice)" title="Click to hear">
                    <span class="char-text">${hanzi}</span>
                    <span class="pinyin-text">${pinyin}</span>
                </div>`;
    }).join('');
}

// ─── Next Sentence ────────────────────────────────────────────────────────

window.nextSentence = async () => {
    resultArea.classList.add('hidden');
    feedbackOverlay.style.display = 'none';
    feedbackOverlay.innerHTML = '';
    targetTextEl.style.display = 'flex';
    document.getElementById('record-text').innerText = 'Start Recording';
    recordBtn.classList.remove('recording');
    isRecording = false;

    // Reset diagnostics
    document.getElementById('mentor-diagnostic').classList.add('hidden');
    document.getElementById('mentor-tip').style.display = 'block';

    // ── Page flip animation for storybook ──
    if (STATE.activeSection === 'lang_du') {
        STATE.pageNum++;
        storyPageNum.textContent = `第 ${STATE.pageNum} 頁`;
        storybookPanel.classList.add('flip-out');
        setTimeout(() => {
            storybookPanel.classList.remove('flip-out');
            storybookPanel.classList.add('flip-in');
            setTimeout(() => storybookPanel.classList.remove('flip-in'), 350);
        }, 290);
    }

    await generateNextContent(STATE.activeSection, STATE.currentText);
};

// ─── Complete Session → Report ────────────────────────────────────────────

window.completeSession = async () => {
    if (STATE.sessionHistory.length === 0) {
        alert('Complete at least one attempt first!');
        return;
    }
    switchScreen('report');
    document.getElementById('report-content').innerHTML = '<p>⏳ Generating your report card…</p>';
    try {
        const res = await fetch('/api/generate-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: STATE.sessionHistory, lang: STATE.lang })
        });
        const data = await res.json();
        if (data.report) {
            document.getElementById('report-content').innerHTML = data.report;
        }
    } catch (e) {
        document.getElementById('report-content').innerHTML = '<p>Failed to generate report. Please try again.</p>';
    }
};

// ─── Voice map ───────────────────────────────────────────────────────────────
const VOICE_MAP = {
    female: 'cmn-CN-Chirp3-HD-Aoede',
    male:   'cmn-CN-Chirp3-HD-Charon'
};

// ─── Full Sentence TTS ───────────────────────────────────────────────────────
window.listenFullSentence = (gender = 'female') => {
    const voiceName = VOICE_MAP[gender] || VOICE_MAP.female;
    STATE.voice = voiceName;
    playPronunciation(STATE.currentText, 0.75, voiceName);
};

// ── Yoda Reaction Popup ───────────────────────────────────
function showYodaPopup(imgFile, message, score) {
    // Remove any existing popup
    const old = document.getElementById('yoda-popup');
    if (old) old.remove();

    const popup = document.createElement('div');
    popup.id = 'yoda-popup';
    popup.className = 'yoda-popup';

    const lines = message.split('\n');
    popup.innerHTML = `
        <img class="popup-img" src="assets/${imgFile}" alt="Yoda Reaction"
             onerror="this.src='assets/Yoda.png'">
        <div class="popup-msg">
            <span>${lines[0]}</span><br>
            <span style="opacity:0.7;font-size:0.8rem">${lines[1] || ''}</span>
        </div>
    `;

    document.body.appendChild(popup);
    // Trigger animation on next frame
    requestAnimationFrame(() => popup.classList.add('show'));

    // Remove from DOM after animation completes (2s total)
    setTimeout(() => popup.remove(), 2000);
}

// Play back the user's own recorded voice
window.playMyRecording = () => {
    if (!STATE.playbackUrl) {
        alert('No recording yet — record yourself first!');
        return;
    }
    const audio = new Audio(STATE.playbackUrl);
    audio.play();
};

// ─── Google Cloud TTS (via server proxy) ─────────────────────────────────────
const ttsCache = {};
let currentTTSAudio = null;

window.playPronunciation = async (text, rate = 0.85, voice = STATE.voice) => {
    if (!text) return;

    // Stop any currently playing TTS
    if (currentTTSAudio) {
        currentTTSAudio.pause();
        currentTTSAudio = null;
    }

    const cacheKey = `${text}|${rate}|${voice}`;

    try {
        let audioB64;
        if (ttsCache[cacheKey]) {
            audioB64 = ttsCache[cacheKey];
        } else {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, rate, voice })
            });
            const data = await res.json();
            if (!data.audioContent) throw new Error('No audio content returned');
            ttsCache[cacheKey] = data.audioContent;
            audioB64 = data.audioContent;
        }

        // Decode base64 MP3 and play
        const binary = atob(audioB64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        currentTTSAudio = new Audio(url);
        currentTTSAudio.onended = () => URL.revokeObjectURL(url);
        currentTTSAudio.play();
    } catch (e) {
        console.error('Google TTS failed:', e);
    }
};

// ─── WAV Encoder ──────────────────────────────────────────────────────────
function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view   = new DataView(buffer);
    const writeStr = (off, str) => { for (let i=0; i<str.length; i++) view.setUint8(off+i, str.charCodeAt(i)); };
    writeStr(0,  'RIFF');
    view.setUint32(4,  36 + samples.length * 2, true);
    writeStr(8,  'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);        // chunk size
    view.setUint16(20, 1,  true);        // PCM
    view.setUint16(22, 1,  true);        // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2,  true);        // block align
    view.setUint16(34, 16, true);        // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
}

// ─── Audio Recording ──────────────────────────────────────────────────────

let isRecording = false;
let audioContext, processor, input, stream;

async function startRecording() {
    try {
        const isExam = STATE.activeSection === 'mock';
        const isFC = STATE.activeSection === 'flashcard_review';
        const txtEl = isExam ? document.getElementById('exam-record-text') : document.getElementById('record-text');
        const bEl = isExam ? document.getElementById('exam-record-btn') : recordBtn;

        txtEl.innerText = 'Processing…';

        // ── Reset result display (only for practice) ──
        if (!isExam && !isFC) {
            resultArea.classList.add('hidden');
            document.querySelector('.circle').style.strokeDasharray = '0, 100';
            document.querySelector('.percentage').textContent = '…';
            document.getElementById('score-tone').innerText      = '-';
            document.getElementById('score-fluency').innerText   = '-';
            document.getElementById('score-phone').innerText     = '-';
            document.getElementById('score-integrity').innerText = '-';
            document.getElementById('tip-text').innerText        = '';
        }

        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        const sampleRate = audioContext.sampleRate;
        input = audioContext.createMediaStreamSource(stream);

        try {
            await audioContext.audioWorklet.addModule('/audio-processor.js');
        } catch (e) {
            console.error("Failed to load audio worklet", e);
        }

        processor = new AudioWorkletNode(audioContext, 'audio-recorder-worklet');
        input.connect(processor);
        processor.connect(audioContext.destination);

        // Reset local capture buffer
        STATE.recordingBuffer = [];
        if (STATE.playbackUrl) { URL.revokeObjectURL(STATE.playbackUrl); STATE.playbackUrl = null; }

        const isMingTi = STATE.activeSection === 'ming_ti';

        if (!isMingTi) {
            socket.emit('start-evaluation', {
                language: 'cn_vip',
                text: STATE.currentText || '今天天气很好。'
            });
        }

        processor.port.onmessage = (e) => {
            if (!isRecording) return;
            const inputData = e.data;
            STATE.recordingBuffer.push(new Float32Array(inputData));
            if (!isMingTi) {
                const down = downsampleBuffer(inputData, sampleRate, 16000);
                socket.emit('audio-data', floatTo16BitPCM(down));
            }
        };

        isRecording = true;
        bEl.classList.add('recording');
        txtEl.innerText = 'Stop';

        if (!isExam && !isFC) {
            feedbackOverlay.style.display = 'none';
            targetTextEl.style.display = 'flex';
        }

    } catch (err) {
        console.error(err);
        alert('Microphone Error: ' + err.message);
    }
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;

    const isExam = STATE.activeSection === 'mock';
    const isFC = STATE.activeSection === 'flashcard_review';
    const bEl = isExam ? document.getElementById('exam-record-btn') : recordBtn;
    const txtEl = isExam ? document.getElementById('exam-record-text') : document.getElementById('record-text');

    bEl.classList.remove('recording');
    txtEl.innerText = isExam ? 'Start Recording' : 'Start Recording';

    let mergedFloat;
    if (STATE.recordingBuffer.length > 0 && audioContext) {
        const sr = audioContext.sampleRate;
        const totalLen = STATE.recordingBuffer.reduce((s, b) => s + b.length, 0);
        mergedFloat = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of STATE.recordingBuffer) { mergedFloat.set(chunk, offset); offset += chunk.length; }
        const wavBlob = encodeWAV(mergedFloat, sr);
        STATE.playbackUrl = URL.createObjectURL(wavBlob);
    }

    if (processor) { processor.disconnect(); input.disconnect(); }
    if (stream)    { stream.getTracks().forEach(t => t.stop()); }
    if (audioContext) audioContext.close();

    const isMingTi = STATE.activeSection === 'ming_ti';
    if (!isMingTi) {
        socket.emit('stop-evaluation');
    } else if (mergedFloat) {
        submitFreeTalk(mergedFloat, audioContext ? audioContext.sampleRate : 48000);
    }
}

// ─── ISE Result Handling ──────────────────────────────────────────────────

socket.on('ise-result', (data) => renderResult(data.xml));
socket.on('ise-error',  (msg)  => console.error('ISE error:', msg));

function renderResult(xmlStr) {
    // Reset standard labels in case we just came from Free Talk
    const labels = document.querySelectorAll('.metrics .metric .label');
    if (labels && labels.length === 4) {
        labels[0].innerText = 'Tone 声调';
        labels[1].innerText = 'Fluency 流利';
        labels[2].innerText = 'Phone 发音';
        labels[3].innerText = 'Integrity 完整';
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');

    let metricsNode = xmlDoc.getElementsByTagName('read_chapter')[0];
    let isMandarin  = false;

    if (!metricsNode) {
        const recPaper = xmlDoc.getElementsByTagName('rec_paper')[0];
        if (recPaper) {
            // Try different nodes in order of complexity
            metricsNode = recPaper.getElementsByTagName('read_sentence')[0] || 
                          recPaper.getElementsByTagName('read_word')[0] || 
                          recPaper.getElementsByTagName('read_syllable')[0];
            isMandarin  = true;
        }
    }
    if (!metricsNode) { 
        // fallback to first child of rec_paper if any
        const recPaper = xmlDoc.getElementsByTagName('rec_paper')[0];
        if (recPaper && recPaper.firstElementChild) {
            metricsNode = recPaper.firstElementChild;
            isMandarin = true;
        }
    }
    if (!metricsNode) { console.error('No metrics in XML'); return; }

    const totalScore = parseFloat(metricsNode.getAttribute('total_score') || 0);
    const integrity  = parseFloat(metricsNode.getAttribute('integrity_score') || 0);
    const fluency    = parseFloat(metricsNode.getAttribute('fluency_score')   || 0);
    const phone      = parseFloat(metricsNode.getAttribute('phone_score')     || 0);
    const tone       = parseFloat(metricsNode.getAttribute('tone_score')      || 0);

    const pct = isMandarin ? totalScore : (totalScore / 5) * 100;

    // ── Show Yoda reaction popup ──
    const reactionMessages = {
        'Try_Again_Yoda.png': '再试一次！\nKeep going!',
        'right_yoda.png':     '还不错！\nNot bad!',
        'good_yoda.png':      '做得好！\nGreat job!',
        'Yoda.png':           '優答！\nNative Level! 🏆'
    };
    const reactionImg = pct < 30 ? 'Try_Again_Yoda.png' : (pct < 70 ? 'right_yoda.png' : (pct < 95 ? 'good_yoda.png' : 'Yoda.png'));
    
    // Suppress Yoda popup in mock mode
    if (STATE.activeSection !== 'mock') {
        showYodaPopup(reactionImg, reactionMessages[reactionImg], Math.round(pct));
    }

    // Delay showing the scorecard and detailed feedback
    setTimeout(() => {
        // Update chart
        document.querySelector('.circle').style.strokeDasharray = `${pct}, 100`;
        document.querySelector('.percentage').textContent = Math.round(pct);

        document.getElementById('score-tone').innerText      = isMandarin ? Math.round(tone)      : 'N/A';
        document.getElementById('score-fluency').innerText   = Math.round(fluency);
        document.getElementById('score-phone').innerText     = Math.round(phone);
        document.getElementById('score-integrity').innerText = Math.round(integrity);

        resultArea.classList.remove('hidden');

        // Capture mock exam result if active
        if (STATE.activeSection === 'mock' && STATE.mockExam.data) {
            const currentPart = STATE.mockExam.currentPartIndex;
            const section = STATE.mockExam.data.sections[currentPart];
            const maxScore = section.score || 100;
            const absoluteScore = (pct / 100) * maxScore;
            
            STATE.mockExam.sectionResults[currentPart] = {
                sectionId: section.id,
                title: section.title,
                text: STATE.currentText,
                totalScore: absoluteScore,
                percent: pct,
                tone: tone,
                fluency: fluency,
                integrity: integrity,
                phone: phone,
                errors: detailedErrors,
                errorStats: statsForHistory
            };
        }

        // ── Feedback overlay: horizontal, word-grouped ──
        if (isMandarin) {
            const wordNodes = metricsNode.getElementsByTagName('word');
            let html = '';
            let errorChars = [];
            
            let stats = { skipped: 0, tone: 0, sound: 0, extra: 0, total: 0 };

            for (let i = 0; i < wordNodes.length; i++) {
                const content = wordNodes[i].getAttribute('content');
                const syllNodes = wordNodes[i].getElementsByTagName('syll');
                
                let wordErrorType = null; // null, 'skipped', 'tone', 'sound', 'extra'
                
                for (let s = 0; s < syllNodes.length; s++) {
                    const dpMsg = parseInt(syllNodes[s].getAttribute('dp_message') || '0');
                    if (dpMsg === 16) { wordErrorType = 'skipped'; break; }
                    if (dpMsg === 32) { wordErrorType = 'extra'; break; }
                    
                    const phoneNodes = syllNodes[s].getElementsByTagName('phone');
                    for (let p = 0; p < phoneNodes.length; p++) {
                        const isYun = parseInt(phoneNodes[p].getAttribute('is_yun') || '0');
                        const perrMsg = parseInt(phoneNodes[p].getAttribute('perr_msg') || '0');
                        
                        if (isYun === 1 && perrMsg === 2) {
                            if (!wordErrorType || wordErrorType === 'tone') wordErrorType = 'tone';
                        } else if (perrMsg !== 0) {
                            wordErrorType = 'sound';
                        }
                    }
                    if (wordErrorType === 'sound') break;
                }

                if (wordErrorType) stats[wordErrorType]++;
                stats.total++;

                const cls = !wordErrorType ? 'score-high' : 
                            wordErrorType === 'skipped' ? 'skipped' :
                            wordErrorType === 'tone'    ? 'tone-error' :
                            wordErrorType === 'extra'   ? 'extra-word' : 'sound-error';
                
                const title = !wordErrorType ? 'Correct' :
                              wordErrorType === 'skipped' ? 'Skipped word' :
                              wordErrorType === 'tone'    ? 'Tone error (声调错误)' :
                              wordErrorType === 'extra'   ? 'Extra word added' : 'Sound error (发音不准)';

                if (wordErrorType) errorChars.push(content);
                html += `<span class="char-score ${cls}" onclick="playPronunciation('${content}')" title="${title}">${content}</span>`;
            }

            if (html) {
                targetTextEl.style.display = 'none';
                feedbackOverlay.innerHTML  = html;
                feedbackOverlay.style.display = 'flex';
            }

            // ── Construct dynamic mentor feedback ──
            let diagnosticHtml = '<h4><span class="mic-icon">🧐</span> Live Diagnostic</h4>';
            let constructivePoints = [];
            let generalTips = [];
            
            // Collect up to 4 specific word-level errors for "what exactly could be better"
            let detailedErrorItems = [];
            for (let i = 0; i < wordNodes.length; i++) {
                const content = wordNodes[i].getAttribute('content');
                
                // Find pinyin for this character from STATE.currentChars
                const charData = STATE.currentChars.find(c => c.c === content);
                const pinyin = charData ? charData.p.toLowerCase() : '';

                const syllNodes = wordNodes[i].getElementsByTagName('syll');
                for (let s = 0; s < syllNodes.length; s++) {
                    const phoneNodes = syllNodes[s].getElementsByTagName('phone');
                    for (let p = 0; p < phoneNodes.length; p++) {
                        const isYun = parseInt(phoneNodes[p].getAttribute('is_yun') || '0');
                        const perrMsg = parseInt(phoneNodes[p].getAttribute('perr_msg') || '0');
                        const dpMsg = parseInt(syllNodes[s].getAttribute('dp_message') || '0');
                        
                        if (dpMsg === 16) {
                            detailedErrorItems.push(`The word <strong>"${content}"</strong> was skipped. Try to read every character.`);
                            break;
                        } else if (isYun === 1 && perrMsg === 2) {
                            let toneAdvice = `The <strong>tone</strong> of <strong>"${content}"</strong> was off. Focus on the pitch rise/fall.`;
                            if (pinyin.endsWith('3')) {
                                toneAdvice = `The <strong>Tone 3</strong> on <strong>"${content}"</strong> needs to be lower and deeper. Don't let it slide into Tone 2.`;
                            }
                            detailedErrorItems.push(toneAdvice);
                        } else if (perrMsg !== 0) {
                            const part = isYun === 0 ? "initial sound" : "final sound";
                            let specificAdvice = `The <strong>${part}</strong> of <strong>"${content}"</strong> was unclear. Tap the word to hear the standard.`;
                            
                            // ── Cantonese-Specific Diagnostic Alerts ──
                            if (isYun === 0) {
                                if (pinyin.startsWith('zh') || pinyin.startsWith('ch') || pinyin.startsWith('sh') || pinyin.startsWith('r')) {
                                    specificAdvice = `<strong>"${content}"</strong> has a <strong>retroflex initial (${pinyin.substring(0,2)})</strong>. Avoid the Cantonese habit of flat 'z/c/s' sounds; curl your tongue back!`;
                                } else if (pinyin.startsWith('j') || pinyin.startsWith('q') || pinyin.startsWith('x')) {
                                    specificAdvice = `Watch the <strong>j/q/x</strong> initial on <strong>"${content}"</strong>. Keep the tongue tip down and front.`;
                                }
                            } else {
                                if (pinyin.includes('u:') || pinyin.includes('v') || pinyin.includes('ü')) {
                                    specificAdvice = `The <strong>"ü" sound</strong> in <strong>"${content}"</strong> was missed. Round your lips tightly, like whistling!`;
                                } else if (pinyin.endsWith('in') || pinyin.endsWith('ing')) {
                                    specificAdvice = `Check the <strong>nasal ending (-in/-ing)</strong> on <strong>"${content}"</strong>. Cantonese speakers often swap these; feel the resonance in your nose.`;
                                }
                            }
                            
                            detailedErrorItems.push(specificAdvice);
                        }
                    }
                    if (detailedErrorItems.length >= 4) break;
                }
                if (detailedErrorItems.length >= 4) break;
            }

            if (detailedErrorItems.length > 0) {
                constructivePoints = detailedErrorItems;
            }

            if (fluency < 70) generalTips.push("Your reading pace is a bit uneven. Try reading more smoothly.");
            if (integrity < 80 && stats.skipped > 0) generalTips.push("You missed several characters. Ensure you follow the text closely.");
            
            if (constructivePoints.length === 0) {
                if (pct >= 95) {
                    constructivePoints.push("Excellent work! Your pronunciation and tones are very natural.");
                } else if (pct >= 80) {
                    constructivePoints.push("Good effort. There are no major sound errors, just focus on refined clarity.");
                } else {
                    constructivePoints.push("The AI had some trouble clearly identifying your words. Try speaking a bit slower and louder.");
                }
            }

            diagnosticHtml += constructivePoints.map(t => `<div class="diagnostic-item"><div class="diagnostic-bullet"></div><div>${t}</div></div>`).join('');
            if (generalTips.length > 0) {
                diagnosticHtml += `<div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); font-style:italic; opacity:0.8;">${generalTips.join(' ')}</div>`;
            }
            
            const diagEl = document.getElementById('mentor-diagnostic');
            diagEl.innerHTML = diagnosticHtml;
            diagEl.classList.remove('hidden');
            document.getElementById('mentor-tip').style.display = 'none'; // Hide generic tip
        }
    }, 800);

    // ── Calculate detailed error stats for history ──
    let detailedErrors = [];
    let statsForHistory = { skipped: 0, tone: 0, sound: 0, extra: 0 };
    if (isMandarin) {
        const wordNodes = metricsNode.getElementsByTagName('word');
        for (let i = 0; i < wordNodes.length; i++) {
            const content = wordNodes[i].getAttribute('content');
            const syllNodes = wordNodes[i].getElementsByTagName('syll');
            let type = null;
            for (let s = 0; s < syllNodes.length; s++) {
                const dp = parseInt(syllNodes[s].getAttribute('dp_message') || '0');
                if (dp === 16) { type = 'skipped'; break; }
                if (dp === 32) { type = 'extra'; break; }
                const phones = syllNodes[s].getElementsByTagName('phone');
                for (let p = 0; p < phones.length; p++) {
                    const isYun = parseInt(phones[p].getAttribute('is_yun') || '0');
                    const err = parseInt(phones[p].getAttribute('perr_msg') || '0');
                    if (isYun === 1 && err === 2) { if (!type || type === 'tone') type = 'tone'; }
                    else if (err !== 0) { type = 'sound'; }
                }
                if (type === 'sound') break;
            }
            if (type) {
                statsForHistory[type]++;
                detailedErrors.push(`${content} (${type})`);
            }
        }
    }

    STATE.sessionHistory.push({
        section:      STATE.activeSection,
        text:         STATE.currentText,
        totalScore, tone, fluency, phone, integrity,
        errors:       detailedErrors,
        errorStats:   statsForHistory
    });

    // ── Auto-collect errors into flashcard deck ──
    if (detailedErrors.length > 0 && isMandarin) {
        const wordNodes2 = metricsNode.getElementsByTagName('word');
        const errorPayload = [];
        for (let i = 0; i < wordNodes2.length; i++) {
            const content = wordNodes2[i].getAttribute('content');
            const syllNodes = wordNodes2[i].getElementsByTagName('syll');
            let type = null;
            for (let s = 0; s < syllNodes.length; s++) {
                const dp = parseInt(syllNodes[s].getAttribute('dp_message') || '0');
                if (dp === 16) { type = 'skipped'; break; }
                if (dp === 32) { type = 'extra'; break; }
                const phones = syllNodes[s].getElementsByTagName('phone');
                for (let p = 0; p < phones.length; p++) {
                    const isYun = parseInt(phones[p].getAttribute('is_yun') || '0');
                    const err = parseInt(phones[p].getAttribute('perr_msg') || '0');
                    if (isYun === 1 && err === 2) { if (!type || type === 'tone') type = 'tone'; }
                    else if (err !== 0) { type = 'sound'; }
                }
                if (type === 'sound') break;
            }
            if (type && type !== 'extra') {
                // Build pinyin: try exact match, then per-char lookup, then ISE syll content
                let pinyin = '';
                const exactMatch = STATE.currentChars.find(c => c.c === content);
                if (exactMatch && exactMatch.p) {
                    pinyin = exactMatch.p;
                } else {
                    // Per-character lookup (handles words split into individual chars)
                    const perChar = content.split('').map(ch => {
                        const cd = STATE.currentChars.find(c => c.c === ch);
                        return cd ? cd.p : '';
                    }).filter(Boolean);
                    if (perChar.length > 0) {
                        pinyin = perChar.join('');
                    } else {
                        // Last resort: ISE syll content (no tone marks but better than nothing)
                        const syllPinyins = [];
                        for (let s = 0; s < syllNodes.length; s++) {
                            const sc = syllNodes[s].getAttribute('content') || '';
                            if (sc) syllPinyins.push(sc);
                        }
                        pinyin = syllPinyins.join('');
                    }
                }
                errorPayload.push({
                    character: content,
                    pinyin,
                    error_type: type,
                    section: STATE.activeSection
                });
            }
        }
        console.log('[FC Collect] errorPayload:', JSON.stringify(errorPayload));
        if (errorPayload.length > 0 && pct < 50) {
            fetch('/api/flashcards/collect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ errors: errorPayload })
            }).catch(e => console.warn('Flashcard auto-collect failed:', e));
        }
    }

    // Append manual flashcard buttons after the main diagnostic UI renders
    if (isMandarin && STATE.currentChars && STATE.currentChars.length > 0) {
        setTimeout(() => {
            const diagEl = document.getElementById('mentor-diagnostic');
            if (diagEl) {
                const practiceChars = STATE.currentChars.filter(c => c.p);
                if (practiceChars.length > 0) {
                    const manualAddHtml = `<div class="manual-fc-section" style="margin-top:15px; padding-top:15px; border-top:1px solid rgba(255,255,255,0.1);">
                        <p style="font-size:0.9rem; margin-bottom:10px; opacity:0.8; color:var(--text-color);">Manually add to Flashcards:</p>
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            ${practiceChars.map(c => `<button class="manual-fc-btn" style="background:rgba(255,255,255,0.1); border:none; padding:6px 12px; border-radius:12px; color:var(--text-color); cursor:pointer; list-style:none;" onclick="manualAddFlashcard('${c.c}', 'manual', '${c.p}', this)">+ ${c.c}</button>`).join('')}
                        </div>
                    </div>`;
                    diagEl.insertAdjacentHTML('beforeend', manualAddHtml);
                }
            }
        }, 850);
    }

    // Tip / Yoda modal
    if (pct >= 90) {
        document.getElementById('tip-text').innerText = LOCALE[STATE.lang].tips.success;
    } else {
        document.getElementById('tip-text').innerText =
            pct > 60 ? LOCALE[STATE.lang].tips.good : LOCALE[STATE.lang].tips.bad;
    }
}

// ─── Audio Helpers ────────────────────────────────────────────────────────

window.manualAddFlashcard = (character, error_type, pinyin, btn) => {
    fetch('/api/flashcards/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errors: [{ character, error_type, pinyin, section: STATE.activeSection }] })
    }).then(() => {
        btn.textContent = '✓ Added';
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.background = 'var(--primary)';
    }).catch(e => console.error(e));
};

function downsampleBuffer(buffer, sampleRate, outSampleRate) {
    if (outSampleRate === sampleRate) return buffer;
    const ratio     = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result    = new Float32Array(newLength);
    let resIdx = 0, bufIdx = 0;
    while (resIdx < result.length) {
        const next = Math.round((resIdx + 1) * ratio);
        let accum = 0, count = 0;
        for (let i = bufIdx; i < next && i < buffer.length; i++) { accum += buffer[i]; count++; }
        result[resIdx] = accum / count;
        resIdx++;
        bufIdx = next;
    }
    return result;
}

// ─── Free Talk Pipeline ──────────────────────────────────────────────────
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

async function submitFreeTalk(mergedFloat, sampleRate) {
    const txtEl = STATE.activeSection === 'mock' ? document.getElementById('exam-record-text') : document.getElementById('record-text');
    txtEl.innerText = 'Analyzing Free Talk...';
    
    try {
        const downsampled = downsampleBuffer(mergedFloat, sampleRate, 16000);
        const pcmBuffer = floatTo16BitPCM(downsampled);
        const base64Audio = arrayBufferToBase64(pcmBuffer);
        
        const topicMatch = STATE.currentText || 'Free Talk Topic';
        
        const res = await fetch('/api/freetalk/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                topic: topicMatch,
                audioBase64: base64Audio
            })
        });
        
        if (!res.ok) throw new Error('Grading failed on server');
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        renderFreeTalkResult(data);
    } catch (e) {
        console.error('Free Talk submission error:', e);
        alert('Failed to grade Free Talk: ' + e.message);
        txtEl.innerText = STATE.activeSection === 'mock' ? 'Start Recording' : 'Start Recording';
    }
}

function renderFreeTalkResult(data) {
    const isExam = STATE.activeSection === 'mock';
    const txtEl = isExam ? document.getElementById('exam-record-text') : document.getElementById('record-text');
    txtEl.innerText = isExam ? 'Start Recording' : 'Start Recording';
    
    // Switch to result UI
    resultArea.classList.remove('hidden');

    // Capture mock exam result if active
    if (STATE.activeSection === 'mock' && STATE.mockExam.data) {
        const currentPart = STATE.mockExam.currentPartIndex;
        const section = STATE.mockExam.data.sections[currentPart];
        const maxScore = section.score || 100;
        const absoluteScore = (data.totalScore / 100) * maxScore;
        
        STATE.mockExam.sectionResults[currentPart] = {
            sectionId: section.id,
            title: section.title,
            text: STATE.currentText || "Free Talk Content",
            totalScore: absoluteScore,
            percent: data.totalScore,
            vocabulary: data.vocabularyScore,
            grammar: data.grammarScore,
            relevance: data.relevanceScore,
            fluency: data.fluencyScore,
            tone: data.vocabularyScore, // Map Free Talk metrics to report keys
            phone: data.grammarScore,
            integrity: data.relevanceScore,
            errors: [], // AI diagnostic is usually in feedback, not precise char errors for free talk
            errorStats: { skipped: 0, tone: 0, sound: 0, extra: 0 } 
        };
    }
    
    // Circle chart override
    document.querySelector('.circle').style.strokeDasharray = `${data.totalScore}, 100`;
    document.querySelector('.percentage').textContent = Math.round(data.totalScore);
    
    // Override metric labels
    const labels = document.querySelectorAll('.metrics .metric .label');
    if (labels && labels.length === 4) {
        labels[0].innerText = 'Vocabulary 词汇';
        labels[1].innerText = 'Grammar 语法';
        labels[2].innerText = 'Relevance 扣题';
        labels[3].innerText = 'Fluency 流利';
    }

    document.getElementById('score-tone').innerText      = data.vocabularyScore;
    document.getElementById('score-fluency').innerText   = data.grammarScore;
    document.getElementById('score-phone').innerText     = data.relevanceScore;
    document.getElementById('score-integrity').innerText = data.fluencyScore;
    
    // Display Mentor diagnostic
    const diagEl = document.getElementById('mentor-diagnostic');
    diagEl.innerHTML = `<h4><span class="mic-icon">🧐</span> AI Examiner Feedback</h4>
        <div style="margin-top:10px; opacity:0.9;"><strong>Transcript:</strong> "${data.transcript}"</div>
        <div style="margin-top:15px; color:var(--text-color);">${data.feedback}</div>
        <div style="margin-top:15px; font-size:0.85em; opacity:0.6;">Est. Duration: ${data.duration}s</div>`;
    diagEl.classList.remove('hidden');
    document.getElementById('mentor-tip').style.display = 'none';
    
    // Yoda Popup for Free Talk Result
    let reactionImg;
    if (data.totalScore < 30) reactionImg = 'Try_Again_Yoda.png';
    else if (data.totalScore < 70) reactionImg = 'right_yoda.png';
    else if (data.totalScore < 95) reactionImg = 'good_yoda.png';
    else reactionImg = 'Yoda.png';
    
    showYodaPopup(reactionImg, 'Free Talk Graded!', Math.round(data.totalScore));
    
    // Save to session history so Report Card can parse it
    STATE.sessionHistory.push({
        section:      'ming_ti',
        text:         STATE.currentText,
        totalScore:   data.totalScore,
        tone: data.vocabularyScore, fluency: data.fluencyScore,
        phone: data.grammarScore, integrity: data.relevanceScore,
        errors:       [],
        errorStats:   { skipped: 0, tone: 0, sound: 0, extra: 0 }
    });
}

function floatTo16BitPCM(input) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out.buffer;
}

// ─── Mock Exam Control ──────────────────────────────────
if (document.getElementById('exam-record-btn')) {
    document.getElementById('exam-record-btn').addEventListener('click', () => {
        if (!isRecording) startRecording();
        else stopRecording();
    });
}

// ─── Mock Exam Logic ──────────────────────────────────────────────────────

window.goToMockExamDashboard = async () => {
    stopRecording();
    clearInterval(STATE.mockExam.timerId);
    switchScreen('mockExamDashboard');

    // Fetch list of exams
    try {
        const res = await fetch('/api/mock-exams');
        const examIds = await res.json();
        const listEl = document.getElementById('mock-exam-list');
        listEl.innerHTML = ''; // Clear

        examIds.forEach(id => {
            const scoreData = STATE.mockScores[id];
            const card = document.createElement('div');
            card.className = 'bento-card dash-card special';
            card.setAttribute('data-section', 'mock');
            
            let scoreHtml = '';
            if (scoreData) {
                scoreHtml = `
                    <div class="card-actions">
                        <button class="card-btn retry-btn" onclick="event.stopPropagation(); startMockExam('${id}')" title="Retake Exam">🔄 Retry</button>
                        <button class="card-btn view-btn" onclick="event.stopPropagation(); showMockScoreDetails('${id}')">📊 View Report</button>
                    </div>
                `;
            } else {
                card.onclick = () => startMockExam(id);
            }

            card.innerHTML = `
                <div class="dash-card-top">
                    <div class="card-icon">📝</div>
                    <span class="section-num">${id.padStart(2,'0')}</span>
                </div>
                <h3>PSC Mock Exam ${id.padStart(2, '0')}</h3>
                <p>5-section timed simulation based on the PSC format.</p>
                <div class="psc-badge">PSC-Based</div>
                ${scoreHtml}
            `;
            listEl.appendChild(card);
        });
    } catch (e) {
        console.error('Failed to list exams:', e);
    }
};

window.startMockExam = async (examId) => {
    try {
        const res = await fetch(`/api/mock-exam/${examId}`);
        const examData = await res.json();
        
        STATE.mockExam.data = examData;
        STATE.mockExam.id = examId;
        STATE.mockExam.currentPartIndex = 0;
        STATE.mockExam.sectionResults = [null, null, null, null, null];
        STATE.mockExam.userChoices = {}; // { spIdx: { itemIdx: selectedOptIdx } }
        STATE.activeSection = 'mock'; 

        // Populate instruction screen
        document.getElementById('ins-exam-title').innerText = examData.title;
        document.getElementById('ins-exam-desc').innerText = examData.description || "5-section timed practice test based on the PSC format.";
        document.getElementById('ins-exam-time').innerText = Math.floor((examData.totalTime || 900) / 60) + " mins";
        document.getElementById('ins-exam-score').innerText = (examData.totalScore || 100) + " pts";
        
        switchScreen('mockExamInstructions');
    } catch (e) {
        console.error(e);
        alert('Failed to load mock exam.');
    }
};

window.beginMockExam = () => {
    loadMockExamPart(0);
    switchScreen('mockExamSession');
};


function loadMockExamPart(index) {
    const part = STATE.mockExam.data.sections[index];
    document.getElementById('exam-session-title').innerText = STATE.mockExam.data.title;
    document.getElementById('exam-total-secs').innerText = STATE.mockExam.data.sections.length;
    document.getElementById('exam-current-sec').innerText = index + 1;
    document.getElementById('exam-part-title').innerText = part.title;
    document.getElementById('exam-part-subtitle').innerText = part.subtitle || '';
    document.getElementById('exam-instructions').innerText = part.instructions || '';
    
    const textEl = document.getElementById('exam-text-area');
    textEl.innerHTML = ''; // Clear previous

    if (part.subParts) {
        // Multi-part content (Section 3) - INTERACTIVE version
        part.subParts.forEach((sp, spIdx) => {
            const wrap = document.createElement('div');
            wrap.className = 'mock-part-wrap';
            
            const items = sp.items || sp.examples || [];
            const itemsHtml = items.map((it, itemIdx) => {
                let options = [];
                let labelText = it;

                // Simple parser for standard formats:
                // format 1: (1) 地铁 / 港铁
                // format 2: 一(棵/株)树
                if (it.includes(' / ')) {
                    options = it.split('/').map(o => o.replace(/\(\d+\)\s*/, '').trim());
                    labelText = `Item ${itemIdx + 1}`;
                } else if (it.includes('(') && it.includes(')')) {
                    const match = it.match(/(.*)\((.*)\)(.*)/);
                    if (match) {
                        const pre = match[1], opts = match[2], post = match[3];
                        options = opts.split('/').map(o => o.trim());
                        labelText = `${pre}( ? )${post}`;
                    }
                }

                if (options.length === 0) return `<div class="mock-item-row"><span>${it}</span></div>`;

                const optionBtns = options.map((opt, optIdx) => {
                    const isSelected = STATE.mockExam.userChoices[spIdx]?.[itemIdx] === optIdx;
                    return `<button class="mock-choice-btn ${isSelected ? 'selected' : ''}" 
                                   onclick="selectMockChoice(${spIdx}, ${itemIdx}, ${optIdx}, this)">
                                ${opt}
                            </button>`;
                }).join('');

                return `
                    <div class="mock-item-row">
                        <span class="mock-item-label">${labelText}</span>
                        <div class="mock-choices-group">${optionBtns}</div>
                    </div>
                `;
            }).join('');

            wrap.innerHTML = `
                <div class="mock-sp-header">
                    <span class="mock-sp-badge">${spIdx+1}</span>
                    <span class="mock-sp-type">${sp.type}</span>
                </div>
                <p class="mock-sp-instruction">${sp.instruction}</p>
                <div class="mock-items-list">${itemsHtml}</div>
            `;
            textEl.appendChild(wrap);
        });
        STATE.currentText = part.instructions; 
    } else if (part.topics) {
        // Topics (Section 5)
        part.topics.forEach(t => {
            const wrap = document.createElement('div');
            wrap.style.marginBottom = '20px';
            wrap.style.textAlign = 'left';
            wrap.innerHTML = `<h3 style="color:#2c3e50; margin-bottom:5px;">${t.title}</h3>
                              <p style="color:var(--gold); margin-bottom:5px;">${t.pinyin}</p>
                              <div style="font-size:0.9rem; opacity:0.6;">Keywords: ${t.keywords.join(', ')}</div>`;
            textEl.appendChild(wrap);
        });
        STATE.currentText = "命题说话内容由用户自由发挥"; // Fallback
    } else {
        textEl.innerText = part.content;
        STATE.currentText = part.content;
    }
    
    STATE.mockExam.timeLeft = part.timeLimit;
    updateExamTimerDisplay();
    startExamTimer();

    // Update button text if it's the final section
    const nextBtn = document.getElementById('exam-next-btn');
    if (nextBtn) {
        if (index === STATE.mockExam.data.sections.length - 1) {
            nextBtn.innerText = 'Finish Exam 🏁';
            nextBtn.style.background = 'var(--primary-color)';
            nextBtn.style.color = '#1a1a1a';
        } else {
            nextBtn.innerText = 'Next Section →';
            nextBtn.style.background = '';
            nextBtn.style.color = '';
        }
    }
}

function startExamTimer() {
    clearInterval(STATE.mockExam.timerId);
    STATE.mockExam.timerId = setInterval(() => {
        STATE.mockExam.timeLeft--;
        updateExamTimerDisplay();
        if (STATE.mockExam.timeLeft <= 0) {
            clearInterval(STATE.mockExam.timerId);
            // Optionally auto-advance
        }
    }, 1000);
}

function updateExamTimerDisplay() {
    const mins = Math.floor(STATE.mockExam.timeLeft / 60);
    const secs = STATE.mockExam.timeLeft % 60;
    const timerEl = document.getElementById('exam-timer');
    if (!timerEl) return;

    timerEl.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    // Warning at 30 seconds
    if (STATE.mockExam.timeLeft <= 30) {
        timerEl.style.color = '#ff5f56';
        timerEl.style.boxShadow = '0 0 15px rgba(255, 95, 86, 0.4)';
    } else {
        timerEl.style.color = '#ffd700';
        timerEl.style.boxShadow = 'none';
    }
}

window.nextExamPart = () => {
    if (isRecording) stopRecording();
    
    // Ensure current section has at least a fallback score if recorded but not graded
    const currentPart = STATE.mockExam.currentPartIndex;
    if (!STATE.mockExam.sectionResults[currentPart]) {
        const section = STATE.mockExam.data.sections[currentPart];
        // Calculate Section 3 score based on user choices
        if (section.id === 'section_3') {
            let correctCount = 0;
            let totalItems = 0;
            section.subParts.forEach((sp, spIdx) => {
                const items = sp.items || sp.examples || [];
                items.forEach((it, itemIdx) => {
                    const selected = STATE.mockExam.userChoices[spIdx]?.[itemIdx];
                    if (selected === 0) correctCount++; // Assume first option is always the correct PSC standard
                    totalItems++;
                });
            });
            const pct = (correctCount / totalItems) * 100;
            STATE.mockExam.sectionResults[currentPart] = {
                sectionId: section.id,
                title: section.title,
                text: "Selective Judgment Selections",
                totalScore: (pct / 100) * section.score,
                percent: pct,
                tone: pct, fluency: 100, phone: 100, integrity: 100,
                errors: [], errorStats: { skipped: 0, tone: 0, sound: 0, extra: 0 }
            };
        }
    }

    STATE.mockExam.currentPartIndex++;
    if (STATE.mockExam.currentPartIndex < STATE.mockExam.data.sections.length) {
        loadMockExamPart(STATE.mockExam.currentPartIndex);
    } else {
        clearInterval(STATE.mockExam.timerId);
        
        // Final score calculation
        const total = STATE.mockExam.sectionResults.reduce((sum, res) => sum + (res ? res.totalScore : 0), 0);
        
        // Start generating the rich report immediately
        document.getElementById('mock-result-modal').classList.add('show');
        document.getElementById('modal-body-content').innerHTML = `
            <div style="text-align:center; padding:40px;">
                <div class="loading-spinner" style="margin: 0 auto 20px;"></div>
                <h3>Calculating Official Score...</h3>
                <p style="opacity:0.6;">Analyzing your pronunciation patterns & generating feedback.</p>
            </div>
        `;

        fetch('/api/generate-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                history: STATE.mockExam.sectionResults.map(r => ({
                    section: r.title || r.sectionId,
                    text: r.text,
                    totalScore: r.totalScore,
                    tone: r.tone,
                    fluency: r.fluency,
                    errors: r.errors,
                    errorStats: r.errorStats
                })),
                lang: STATE.lang 
            })
        }).then(res => res.json()).then(data => {
            saveMockScore(STATE.mockExam.id, {
                totalScore: total,
                sectionResults: [...STATE.mockExam.sectionResults],
                genAiReport: data.report
            });
            // Show the modal with the rich data
            showMockScoreDetails(STATE.mockExam.id, true);
        }).catch(err => {
            console.error('Report generation failed:', err);
            saveMockScore(STATE.mockExam.id, {
                totalScore: total,
                sectionResults: [...STATE.mockExam.sectionResults]
            });
            showMockScoreDetails(STATE.mockExam.id, true);
        });
    }
};

window.exitExam = () => {
    if (confirm('Are you sure you want to exit the exam? All progress will be lost.')) {
        clearInterval(STATE.mockExam.timerId);
        stopRecording();
        goToMockExamDashboard();
    }
}

// ─── Section 3 Specialized Logic ──────────────────────────────────────────

function renderSection3Choice() {
    const displayEl    = document.getElementById('target-text');
    const choiceArea   = document.getElementById('selective-choice-area');
    const qEl          = document.getElementById('choice-question');
    const optContainer = document.getElementById('options-container');
    const feedbackEl   = document.getElementById('choice-feedback');
    const revealBtn    = document.getElementById('reveal-btn');

    displayEl.classList.add('hidden');
    choiceArea.classList.remove('hidden');

    // Lock record button until student reveals the answer
    recordBtn.style.opacity = '0.3';
    recordBtn.style.pointerEvents = 'none';

    const partLabel = STATE.currentSection3Part
        ? `Part ${STATE.currentSection3Part} — Which is correct?`
        : 'Which is correct?';
    qEl.innerText = partLabel;

    optContainer.innerHTML = '';
    feedbackEl.classList.add('hidden');
    feedbackEl.className = 'choice-result hidden';
    revealBtn.classList.add('hidden');

    STATE.currentOptions.forEach((opt, idx) => {
        const div = document.createElement('div');
        div.className = 'option-item';
        div.innerText = opt;
        div.onclick = () => window.handleOptionSelect(idx);
        optContainer.appendChild(div);
    });
}

window.handleOptionSelect = (idx) => {
    STATE.selectedOptionIndex = idx;
    document.querySelectorAll('.option-item').forEach((it, i) => {
        it.classList.toggle('selected', i === idx);
    });
    document.getElementById('reveal-btn').classList.remove('hidden');
};

window.revealAnswer = () => {
    const items        = document.querySelectorAll('.option-item');
    const feedbackEl   = document.getElementById('choice-feedback');
    const revealBtn    = document.getElementById('reveal-btn');
    const selectedText = STATE.currentOptions[STATE.selectedOptionIndex];
    const isCorrect    = selectedText === STATE.correctAnswer;

    items.forEach(it => {
        if (it.innerText === STATE.correctAnswer) {
            it.classList.add('correct');
        } else if (it.classList.contains('selected') && !isCorrect) {
            it.classList.add('incorrect');
        }
        it.style.pointerEvents = 'none';
    });

    feedbackEl.classList.remove('hidden');
    if (isCorrect) {
        feedbackEl.innerText = '✨ Correct! Now say it aloud.';
        feedbackEl.className = 'choice-result success';
    } else {
        feedbackEl.innerText = `Incorrect. The right answer is「${STATE.correctAnswer}」. Now practice saying it.`;
        feedbackEl.className = 'choice-result error';
    }
    revealBtn.classList.add('hidden');

    // Unlock the record button
    recordBtn.style.opacity = '1';
    recordBtn.style.pointerEvents = 'auto';

    // Update target text so speech evaluation scores the CORRECT answer
    STATE.currentText  = STATE.correctAnswer;
    STATE.currentChars = STATE.correctAnswer.split('').map(c => ({ c, p: '' }));
};

/* ==========================================================================
   PLAYGROUND EXPERIENCES (Duolingo-style)
   ========================================================================== */

window.goToPlaygroundDashboard = () => {
    stopRecording();
    STATE.activeSection = null;
    deactivateStorybook();
    switchScreen('playground-dashboard');
};

/* ==========================================================================
   MATCH GAME — Retroflex Match-Up
   Left col: shuffled pinyin.  Right col: shuffled characters.
   Tap left, then tap right to pair them.
   ========================================================================== */

// Static retroflex pair bank (zh/ch/sh vs z/c/s pairs + others)
const MATCH_PAIRS = [
    { pinyin: 'zhī', char: '知' }, { pinyin: 'zhū', char: '猪' },
    { pinyin: 'zhǎng', char: '长' }, { pinyin: 'zhèng', char: '正' },
    { pinyin: 'chī', char: '吃' }, { pinyin: 'chū', char: '出' },
    { pinyin: 'chéng', char: '城' }, { pinyin: 'chūn', char: '春' },
    { pinyin: 'shū', char: '书' }, { pinyin: 'shān', char: '山' },
    { pinyin: 'shēng', char: '生' }, { pinyin: 'shí', char: '时' },
    { pinyin: 'zī', char: '资' }, { pinyin: 'zú', char: '足' },
    { pinyin: 'zǔ', char: '祖' }, { pinyin: 'zǎo', char: '早' },
    { pinyin: 'cū', char: '粗' }, { pinyin: 'cōng', char: '聪' },
    { pinyin: 'sī', char: '思' }, { pinyin: 'sān', char: '三' },
    { pinyin: 'rén', char: '人' }, { pinyin: 'rì', char: '日' },
];

const matchState = { selected: null, matched: 0, total: 0, pairs: [] };

window.startMatchGame = () => {
    switchScreen('match-game');
    document.getElementById('match-feedback').classList.add('hidden');
    matchState.selected = null;
    matchState.matched = 0;

    // Pick 4 random pairs
    const shuffled = [...MATCH_PAIRS].sort(() => 0.5 - Math.random()).slice(0, 4);
    matchState.pairs = shuffled;
    matchState.total = shuffled.length;

    const leftPinyin = [...shuffled].sort(() => 0.5 - Math.random());
    const rightChars  = [...shuffled].sort(() => 0.5 - Math.random());

    const leftCol  = document.getElementById('match-left-col');
    const rightCol = document.getElementById('match-right-col');
    leftCol.innerHTML = '';
    rightCol.innerHTML = '';

    leftPinyin.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'match-btn';
        btn.dataset.pinyin = p.pinyin;
        btn.dataset.char   = p.char;
        btn.dataset.side   = 'left';
        btn.innerHTML = `<span class="match-pinyin">${p.pinyin}</span>`;
        btn.onclick = () => handleMatchSelect(btn);
        leftCol.appendChild(btn);
    });

    rightChars.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'match-btn';
        btn.dataset.pinyin = p.pinyin;
        btn.dataset.char   = p.char;
        btn.dataset.side   = 'right';
        btn.textContent = p.char;
        btn.onclick = () => handleMatchSelect(btn);
        rightCol.appendChild(btn);
    });

    updateMatchScore();
};

function updateMatchScore() {
    document.getElementById('match-score-display').textContent = `${matchState.matched} / ${matchState.total} matched`;
}

function handleMatchSelect(btn) {
    if (btn.classList.contains('matched')) return;

    // Play audio when clicking the left (pinyin) side
    if (btn.dataset.side === 'left') {
        playPronunciation(btn.dataset.char, 0.75, 'cmn-CN-Chirp3-HD-Aoede');
    }

    if (!matchState.selected) {
        // First selection — just mark as selected regardless of side
        matchState.selected = btn;
        btn.classList.add('selected');
        return;
    }

    const prev = matchState.selected;

    // Deselect if same button tapped again
    if (prev === btn) {
        prev.classList.remove('selected');
        matchState.selected = null;
        return;
    }

    // Must be from opposite sides
    if (prev.dataset.side === btn.dataset.side) {
        prev.classList.remove('selected');
        matchState.selected = btn;
        btn.classList.add('selected');
        return;
    }

    // Check if pinyin matches char
    const isMatch = prev.dataset.pinyin === btn.dataset.pinyin && prev.dataset.char === btn.dataset.char;

    if (isMatch) {
        prev.classList.remove('selected');
        prev.classList.add('matched');
        btn.classList.add('matched');
        matchState.matched++;
        updateMatchScore();

        // Log to session history
        STATE.sessionHistory.push({ section: 'dan_yin_jie', type: 'match_game', text: btn.dataset.char, isCorrect: true });

        if (matchState.matched === matchState.total) {
            setTimeout(() => {
                const fb = document.getElementById('match-feedback');
                fb.classList.remove('hidden');
                document.getElementById('match-feedback-icon').textContent = '🏆';
                document.getElementById('match-feedback-text').textContent = 'All matched! Great work!';
            }, 400);
        }
    } else {
        prev.classList.remove('selected');
        prev.classList.add('wrong');
        btn.classList.add('wrong');
        STATE.sessionHistory.push({ section: 'dan_yin_jie', type: 'match_game', text: btn.dataset.char, isCorrect: false });
        setTimeout(() => {
            prev.classList.remove('wrong');
            btn.classList.remove('wrong');
        }, 600);
    }

    matchState.selected = null;
}

/* ==========================================================================
   TONE GAME — Tone Identification Challenge
   ========================================================================== */

// Bank of common words with their tone numbers
const TONE_BANK = [
    { text: '妈', tone: 1 }, { text: '麻', tone: 2 }, { text: '马', tone: 3 }, { text: '骂', tone: 4 },
    { text: '书', tone: 1 }, { text: '熟', tone: 2 }, { text: '鼠', tone: 3 }, { text: '树', tone: 4 },
    { text: '飞', tone: 1 }, { text: '肥', tone: 2 }, { text: '匪', tone: 3 }, { text: '废', tone: 4 },
    { text: '天', tone: 1 }, { text: '田', tone: 2 }, { text: '舔', tone: 3 }, { text: '店', tone: 4 },
    { text: '汤', tone: 1 }, { text: '唐', tone: 2 }, { text: '躺', tone: 3 }, { text: '烫', tone: 4 },
    { text: '花', tone: 1 }, { text: '华', tone: 2 }, { text: '化', tone: 4 },
    { text: '猫', tone: 1 }, { text: '没', tone: 2 }, { text: '买', tone: 3 }, { text: '卖', tone: 4 },
    { text: '吗', tone: 0 }, { text: '了', tone: 0 }, { text: '呢', tone: 0 }, { text: '嘛', tone: 0 },
];

const toneState = { current: null, answered: false };

window.startToneGame = () => {
    switchScreen('tone-game');
    nextToneTurn();
};

window.nextToneTurn = () => {
    document.getElementById('tone-feedback').classList.add('hidden');
    document.getElementById('tone-play-btn').classList.remove('playing');
    toneState.answered = false;
    // Reset button states
    document.querySelectorAll('.tone-choice-btn').forEach(b => {
        b.classList.remove('correct', 'wrong');
        b.disabled = false;
    });
    // Pick random word
    const pick = TONE_BANK[Math.floor(Math.random() * TONE_BANK.length)];
    toneState.current = pick;
    setTimeout(() => playToneAudio(), 400);
};

window.playToneAudio = () => {
    if (!toneState.current) return;
    const btn = document.getElementById('tone-play-btn');
    btn.classList.add('playing');
    playPronunciation(toneState.current.text, 0.75, 'cmn-CN-Chirp3-HD-Aoede');
    setTimeout(() => btn.classList.remove('playing'), 1500);
};

window.handleToneGuess = (tone) => {
    if (toneState.answered) return;
    toneState.answered = true;

    const correct = toneState.current.tone === 0 ? 5 : toneState.current.tone;
    const isCorrect = tone === correct;

    document.querySelectorAll('.tone-choice-btn').forEach(b => b.disabled = true);

    const btns = document.querySelectorAll('.tone-choice-btn');
    // btn index 0→1, 1→2, 2→3, 3→4, 4→neutral(5)
    [1,2,3,4,5].forEach((t, i) => {
        if (t === tone) btns[i].classList.add(isCorrect ? 'correct' : 'wrong');
        if (!isCorrect && t === correct) btns[i].classList.add('correct');
    });

    const fb = document.getElementById('tone-feedback');
    fb.classList.remove('hidden');
    document.getElementById('tone-feedback-icon').textContent = isCorrect ? '✅' : '❌';

    const TONE_NAMES = { 1:'1st (ā)', 2:'2nd (á)', 3:'3rd (ǎ)', 4:'4th (à)', 5:'Neutral' };
    document.getElementById('tone-feedback-text').textContent = isCorrect
        ? `Correct! "${toneState.current.text}" is ${TONE_NAMES[correct]} tone.`
        : `That's ${TONE_NAMES[correct]} tone. Keep training!`;

    STATE.sessionHistory.push({ section: 'dan_yin_jie', type: 'tone_game', text: toneState.current.text, isCorrect });
};

/* ==========================================================================
   MINIMAL PAIRS GAME — Two similar sounds, pick which was heard
   ========================================================================== */

const MINIMAL_PAIRS_BANK = [
    [{ char: '知', pinyin: 'zhī' }, { char: '资', pinyin: 'zī' }],
    [{ char: '吃', pinyin: 'chī' }, { char: '词', pinyin: 'cí' }],
    [{ char: '书', pinyin: 'shū' }, { char: '苏', pinyin: 'sū' }],
    [{ char: '日', pinyin: 'rì' },  { char: '力', pinyin: 'lì' }],
    [{ char: '正', pinyin: 'zhèng' }, { char: '争', pinyin: 'zhēng' }],
    [{ char: '年', pinyin: 'nián' }, { char: '连', pinyin: 'lián' }],
    [{ char: '恩', pinyin: 'ēn' },  { char: '英', pinyin: 'yīng' }],
    [{ char: '这', pinyin: 'zhè' }, { char: '则', pinyin: 'zé' }],
    [{ char: '人', pinyin: 'rén' }, { char: '嫩', pinyin: 'nèn' }],
    [{ char: '春', pinyin: 'chūn' }, { char: '村', pinyin: 'cūn' }],
    [{ char: '声', pinyin: 'shēng' }, { char: '僧', pinyin: 'sēng' }],
];

const mpState = { pair: null, correctIdx: null, answered: false };

window.startMinimalPairsGame = () => {
    switchScreen('minimal-pairs-game');
    nextMinimalPairTurn();
};

window.nextMinimalPairTurn = () => {
    mpState.answered = false;
    document.getElementById('mp-feedback').classList.add('hidden');
    document.getElementById('mp-play-btn').classList.remove('playing');

    const pair = MINIMAL_PAIRS_BANK[Math.floor(Math.random() * MINIMAL_PAIRS_BANK.length)];
    const correctIdx = Math.round(Math.random()); // 0 or 1
    mpState.pair = pair;
    mpState.correctIdx = correctIdx;

    const container = document.getElementById('mp-options');
    container.innerHTML = '';
    pair.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'mp-choice-btn';
        btn.innerHTML = `<span class="mp-char">${opt.char}</span><span class="mp-pinyin">${opt.pinyin}</span>`;
        btn.onclick = () => handleMinimalPairGuess(i, btn);
        container.appendChild(btn);
    });

    setTimeout(() => playMinimalPairAudio(), 400);
};

window.playMinimalPairAudio = () => {
    if (mpState.pair === null) return;
    const btn = document.getElementById('mp-play-btn');
    btn.classList.add('playing');
    playPronunciation(mpState.pair[mpState.correctIdx].char, 0.75, 'cmn-CN-Chirp3-HD-Aoede');
    setTimeout(() => btn.classList.remove('playing'), 1500);
};

window.handleMinimalPairGuess = (idx, btnEl) => {
    if (mpState.answered) return;
    mpState.answered = true;

    const isCorrect = idx === mpState.correctIdx;
    const allBtns = document.querySelectorAll('.mp-choice-btn');
    allBtns.forEach(b => b.disabled = true);

    btnEl.classList.add(isCorrect ? 'correct' : 'wrong');
    if (!isCorrect) allBtns[mpState.correctIdx].classList.add('correct');

    const fb = document.getElementById('mp-feedback');
    fb.classList.remove('hidden');
    document.getElementById('mp-feedback-icon').textContent = isCorrect ? '✅' : '❌';
    document.getElementById('mp-feedback-text').textContent = isCorrect
        ? 'Correct! Your ears are sharp!'
        : `It was "${mpState.pair[mpState.correctIdx].char}" (${mpState.pair[mpState.correctIdx].pinyin})`;

    STATE.sessionHistory.push({
        section: 'dan_yin_jie', type: 'minimal_pairs',
        text: mpState.pair[mpState.correctIdx].char, isCorrect
    });
};

// ════════════════════════════════════════════════════════
//   FLASHCARD LIST (Dictionary)
// ════════════════════════════════════════════════════════

let fcAllCards = [];
let fcCurrentFilter = 'all';

window.goToFlashcardList = async () => {
    stopRecording();
    switchScreen('flashcardList');
    document.getElementById('fc-list-container').innerHTML = '<p style="color:var(--muted); text-align:center; padding:2rem">Loading...</p>';

    try {
        const res = await fetch('/api/flashcards/all');
        fcAllCards = await res.json();
        const dueCount = fcAllCards.filter(c => c.is_due).length;
        document.getElementById('fc-list-due-badge').textContent = `${dueCount} due`;
        fcCurrentFilter = 'all';
        document.querySelectorAll('.fc-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
        renderFCList(fcAllCards);
    } catch (e) {
        document.getElementById('fc-list-container').innerHTML = '<p style="color:var(--red); text-align:center; padding:2rem">Failed to load cards</p>';
    }
};

window.filterFCList = (filter) => {
    fcCurrentFilter = filter;
    document.querySelectorAll('.fc-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === String(filter)));
    let filtered = fcAllCards;
    if (filter === 'due') filtered = fcAllCards.filter(c => c.is_due);
    else if (typeof filter === 'number') filtered = fcAllCards.filter(c => c.box === filter);
    renderFCList(filtered);
};

function renderFCList(cards) {
    const container = document.getElementById('fc-list-container');
    if (cards.length === 0) {
        container.innerHTML = '<p style="color:var(--muted); text-align:center; padding:2rem">No cards found. Practice sections to collect error cards.</p>';
        return;
    }
    const boxColors = ['#ff5f56', '#f39c12', '#f1c40f', '#2ecc71', '#E5BD4E'];
    const boxNames = ['New', 'Learning', 'Reviewing', 'Familiar', 'Mastered'];
    container.innerHTML =
        '<div class="fc-list-header"><span>Char</span><span>Pinyin</span><span>Level</span><span>Play</span></div>' +
        cards.map(c => {
            const dueClass = c.is_due ? 'is-due' : '';
            return `<div class="fc-list-item ${dueClass}">
                <span class="fc-list-char">${c.character}</span>
                <div class="fc-list-info">
                    <span class="fc-list-pinyin">${c.pinyin || ''}</span>
                    <span class="fc-list-meta">${c.times_wrong}x wrong · ${c.times_correct}x correct</span>
                </div>
                <span class="fc-list-box box-${c.box}" style="color:${boxColors[c.box]}">${boxNames[c.box]}</span>
                <div class="fc-list-tts">
                    <button onclick="playPronunciation('${c.character.replace(/'/g, "\\'")}')">🔊</button>
                </div>
            </div>`;
        }).join('');
}

// ════════════════════════════════════════════════════════
//   FLASHCARD REVIEW
// ════════════════════════════════════════════════════════

window.goToFlashcardReview = async () => {
    stopRecording();
    switchScreen('flashcardReview');

    STATE.flashcard.queue = [];
    STATE.flashcard.currentIndex = 0;
    STATE.flashcard.isFlipped = false;
    STATE.flashcard.iseProcessing = false;
    STATE.flashcard.sessionCorrect = 0;
    STATE.flashcard.sessionWrong = 0;
    STATE.flashcard.coachingTips = {};

    document.getElementById('fc-summary').classList.add('hidden');
    document.getElementById('fc-empty').classList.add('hidden');
    document.getElementById('fc-card-wrapper').style.display = '';

    try {
        const res = await fetch('/api/flashcards/due?limit=20');
        const cards = await res.json();
        STATE.flashcard.queue = cards;

        if (cards.length === 0) {
            document.getElementById('fc-card-wrapper').style.display = 'none';
            document.getElementById('fc-empty').classList.remove('hidden');
            return;
        }

        showFlashcard(0);
    } catch (e) {
        console.error('Failed to load flashcards:', e);
    }
};

function showFlashcard(index) {
    const queue = STATE.flashcard.queue;
    if (index >= queue.length) {
        showFlashcardSummary();
        return;
    }

    const card = queue[index];
    STATE.flashcard.currentCard = card;
    STATE.flashcard.currentIndex = index;
    STATE.flashcard.isFlipped = false;
    STATE.flashcard.isRetry = false;
    STATE.flashcard.iseProcessing = false;

    document.getElementById('fc-progress').textContent = `${index + 1}/${queue.length}`;

    // Show/hide prev button
    const prevBtn = document.getElementById('fc-prev-btn');
    if (prevBtn) prevBtn.classList.toggle('hidden', index === 0);

    // Reset card and play entrance animation
    const cardEl = document.getElementById('fc-card');
    cardEl.classList.remove('flipped', 'slide-right', 'slide-left', 'slide-in');
    // Force reflow so slide-in re-triggers
    void cardEl.offsetWidth;
    cardEl.classList.add('slide-in');

    // Front — human-friendly box label
    const boxClass = `box-${card.box}`;
    const boxLabels = ['New', 'Learning', 'Reviewing', 'Familiar', 'Mastered'];
    document.getElementById('fc-box-indicator').className = `fc-box-indicator ${boxClass}`;
    document.getElementById('fc-box-indicator').textContent = boxLabels[card.box];
    document.getElementById('fc-character').textContent = card.character;

    // Reset score display
    const scoreDisp = document.getElementById('fc-score-display');
    scoreDisp.classList.add('hidden');
    scoreDisp.textContent = '';
    scoreDisp.className = 'fc-score-display hidden';

    // Reset record button
    const recBtn = document.querySelector('.fc-record-btn');
    if (recBtn) { recBtn.textContent = '🎤 Record'; recBtn.style.background = ''; }

    // Back
    document.getElementById('fc-back-char').textContent = card.character;
    document.getElementById('fc-back-pinyin').textContent = card.pinyin || '';

    STATE.currentText = card.character;
}

// Flip = didn't know it = demote card
window.flipFlashcard = () => {
    if (STATE.flashcard.isFlipped) return;
    STATE.flashcard.isFlipped = true;
    STATE.flashcard.sessionWrong++;
    document.getElementById('fc-card').classList.add('flipped');

    // Demote card (score < 70 = wrong)
    const card = STATE.flashcard.currentCard;
    if (card) {
        fetch('/api/flashcards/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flashcard_id: card.id, score: 40, error_detail: null })
        }).catch(() => {});
    }
};

// Next from back side — just advance, card already demoted on flip
window.fcNextFromBack = () => {
    STATE.flashcard.currentCard = null;
    const cardEl = document.getElementById('fc-card');
    cardEl.classList.add('slide-right');
    setTimeout(() => showFlashcard(STATE.flashcard.currentIndex + 1), 420);
};

// "Test Again" from back — flip back to front for recording, no box change (practice only)
window.fcRetryFromBack = () => {
    const card = STATE.flashcard.currentCard;
    if (!card) return;
    STATE.flashcard.isFlipped = false;
    STATE.flashcard.isRetry = true; // Mark as retry — pass won't auto-advance
    STATE.flashcard.iseProcessing = false;
    document.getElementById('fc-card').classList.remove('flipped');
    // Reset score display
    const scoreDisp = document.getElementById('fc-score-display');
    scoreDisp.classList.add('hidden');
    scoreDisp.textContent = '';
    scoreDisp.className = 'fc-score-display hidden';
    // Reset record button
    const recBtn = document.querySelector('.fc-record-btn');
    if (recBtn) { recBtn.textContent = '🎤 Record'; recBtn.style.background = ''; }
};

// "I know this" — self-grade pass, skip forward
window.fcSkipKnown = () => {
    const card = STATE.flashcard.currentCard;
    if (!card) return;
    STATE.flashcard.sessionCorrect++;

    fetch('/api/flashcards/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flashcard_id: card.id, score: 85, error_detail: null })
    }).catch(() => {});

    STATE.flashcard.currentCard = null;
    const cardEl = document.getElementById('fc-card');
    cardEl.classList.add('slide-right');
    setTimeout(() => showFlashcard(STATE.flashcard.currentIndex + 1), 420);
};

window.fcPlayTTS = () => {
    const card = STATE.flashcard.currentCard;
    if (card) playPronunciation(card.character, 0.75, VOICE_MAP.female);
};

window.fcPrevCard = () => {
    if (STATE.flashcard.currentIndex <= 0) return;
    const cardEl = document.getElementById('fc-card');
    cardEl.classList.add('slide-left');
    setTimeout(() => showFlashcard(STATE.flashcard.currentIndex - 1), 420);
};

// ── ISE recording on flashcard front ──
window.fcStartRecording = () => {
    const card = STATE.flashcard.currentCard;
    if (!card || STATE.flashcard.iseProcessing) return;
    STATE.flashcard.iseProcessing = true;
    STATE.currentText = card.character;
    STATE.activeSection = 'flashcard_review';

    const recBtn = document.querySelector('.fc-record-btn');
    if (recBtn) { recBtn.textContent = '🔴 Recording...'; recBtn.style.background = 'rgba(255,95,86,0.25)'; }

    startRecording();

    const duration = card.character.length <= 2 ? 3000 : 5000;
    setTimeout(() => { if (isRecording) stopRecording(); }, duration);
};

// Hook ISE result for flashcard review mode
socket.off('ise-result');
socket.on('ise-result', (data) => {
    if (STATE.activeSection === 'flashcard_review') {
        if (data.status !== 2) return;
        if (!STATE.flashcard.iseProcessing) return;
        STATE.flashcard.iseProcessing = false;

        const recBtn = document.querySelector('.fc-record-btn');
        if (recBtn) { recBtn.textContent = '🎤 Record'; recBtn.style.background = ''; }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data.xml, 'text/xml');
        const recPaper = xmlDoc.getElementsByTagName('rec_paper')[0];
        let metricsNode = null;
        if (recPaper) {
            metricsNode = recPaper.getElementsByTagName('read_sentence')[0] ||
                          recPaper.getElementsByTagName('read_word')[0] ||
                          recPaper.getElementsByTagName('read_syllable')[0] ||
                          recPaper.firstElementChild;
        }
        if (!metricsNode) return;

        const totalScore = parseFloat(metricsNode.getAttribute('total_score') || 0);
        const pass = totalScore >= 70;

        // Show score on front
        const scoreDisp = document.getElementById('fc-score-display');
        scoreDisp.textContent = `${Math.round(totalScore)} pts`;
        scoreDisp.className = `fc-score-display ${pass ? 'pass' : 'fail'}`;
        scoreDisp.classList.remove('hidden');

        // Auto-advance if passed (Duolingo style) — but NOT on retry (practice only)
        if (pass && !STATE.flashcard.isRetry) {
            STATE.flashcard.sessionCorrect++;
            const card = STATE.flashcard.currentCard;
            if (card) {
                fetch('/api/flashcards/review', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ flashcard_id: card.id, score: totalScore, error_detail: null })
                }).catch(() => {});
                STATE.flashcard.currentCard = null;
            }
            setTimeout(() => {
                const cardEl = document.getElementById('fc-card');
                cardEl.classList.add('slide-right');
                setTimeout(() => showFlashcard(STATE.flashcard.currentIndex + 1), 420);
            }, 600); // brief pause to see score, then auto-slide
        }
    } else {
        renderResult(data.xml);
    }
});

function showFlashcardSummary() {
    document.getElementById('fc-card-wrapper').style.display = 'none';
    const summary = document.getElementById('fc-summary');
    summary.classList.remove('hidden');

    const total = STATE.flashcard.sessionCorrect + STATE.flashcard.sessionWrong;
    document.getElementById('fc-summary-stats').innerHTML = `
        <div class="fc-stat-item"><div class="fc-stat-val">${total}</div><div class="fc-stat-label">Cards Reviewed</div></div>
        <div class="fc-stat-item"><div class="fc-stat-val" style="color:#2ecc71">${STATE.flashcard.sessionCorrect}</div><div class="fc-stat-label">Correct</div></div>
        <div class="fc-stat-item"><div class="fc-stat-val" style="color:#ff5f56">${STATE.flashcard.sessionWrong}</div><div class="fc-stat-label">Again</div></div>
        <div class="fc-stat-item"><div class="fc-stat-val">${total > 0 ? Math.round(STATE.flashcard.sessionCorrect / total * 100) : 0}%</div><div class="fc-stat-label">Accuracy</div></div>
    `;
}

// ════════════════════════════════════════════════════════
//   MASTERY DASHBOARD
// ════════════════════════════════════════════════════════

window.goToMasteryDashboard = async () => {
    stopRecording();
    switchScreen('masteryDashboard');
    await loadMasteryData();
};

async function loadMasteryData() {
    try {
        const res = await fetch('/api/flashcards/stats');
        const stats = await res.json();
        renderMasteryRing(stats.masteryPercent, stats.total);
        renderMasteryBars(stats.byBox, stats.total);
        renderErrorDonut(stats.byErrorType);
        renderSparkline(stats.recentReviews);
        renderHeatmap(stats.patterns);
        document.getElementById('mastery-total').textContent = `${stats.total} cards total`;
    } catch (e) {
        console.error('Failed to load mastery data:', e);
    }
}

function renderMasteryRing(pct, total) {
    const r = 54, cx = 65, cy = 65, sw = 10;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    document.getElementById('mastery-ring').innerHTML = `
        <svg width="130" height="130" viewBox="0 0 130 130">
            <defs>
                <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#D4AF37"/>
                    <stop offset="100%" style="stop-color:#F5D76E"/>
                </linearGradient>
            </defs>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="${sw}"/>
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#ring-grad)" stroke-width="${sw}"
                stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                transform="rotate(-90 ${cx} ${cy})" style="transition: stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1);
                filter: drop-shadow(0 0 8px rgba(212,175,55,0.5))"/>
            <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="800" font-family="var(--font)">${Math.round(pct)}%</text>
            <text x="${cx}" y="${cy + 20}" text-anchor="middle" fill="var(--muted)" font-size="9" font-weight="600">MASTERY</text>
        </svg>
    `;
}

function renderMasteryBars(byBox, total) {
    const colors = ['#ff5f56', '#f39c12', '#f1c40f', '#2ecc71', '#E5BD4E'];
    const labels = ['Box 0', 'Box 1', 'Box 2', 'Box 3', 'Box 4'];
    const maxCount = Math.max(...byBox, 1);

    document.getElementById('mastery-bars').innerHTML = byBox.map((count, i) => {
        const pct = (count / maxCount) * 100;
        return `<div class="mastery-bar-row">
            <span class="mastery-bar-label" style="color:${colors[i]}">${labels[i]}</span>
            <div class="mastery-bar-track">
                <div class="mastery-bar-fill" style="width:${pct}%; background:${colors[i]}">${count > 0 ? count : ''}</div>
            </div>
            <span class="mastery-bar-count">${count}</span>
        </div>`;
    }).join('');
}

function renderErrorDonut(byErrorType) {
    const types = Object.entries(byErrorType);
    const total = types.reduce((s, [, v]) => s + v, 0);
    if (total === 0) {
        document.getElementById('mastery-donut').innerHTML = '<p style="color:var(--muted)">No data yet</p>';
        return;
    }

    const colors = { tone: '#f39c12', sound: '#ff5f56', skipped: '#95a5a6' };
    let cumAngle = 0;
    const r = 45, cx = 55, cy = 55;
    let paths = '';
    const legend = [];

    types.forEach(([type, count]) => {
        const angle = (count / total) * 360;
        const startRad = (cumAngle - 90) * Math.PI / 180;
        const endRad = (cumAngle + angle - 90) * Math.PI / 180;
        const large = angle > 180 ? 1 : 0;
        const x1 = cx + r * Math.cos(startRad);
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad);
        const y2 = cy + r * Math.sin(endRad);
        const color = colors[type] || '#666';
        paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z" fill="${color}" opacity="0.8"/>`;
        legend.push(`<span><span class="donut-dot" style="background:${color}"></span>${type}: ${count} (${Math.round(count/total*100)}%)</span>`);
        cumAngle += angle;
    });

    document.getElementById('mastery-donut').innerHTML = `
        <svg width="110" height="110" viewBox="0 0 110 110">${paths}
            <circle cx="${cx}" cy="${cy}" r="25" fill="var(--bg)"/>
        </svg>
        <div class="mastery-donut-legend">${legend.join('')}</div>
    `;
}

function renderSparkline(reviews) {
    if (!reviews || reviews.length < 2) {
        document.getElementById('mastery-sparkline').innerHTML = '<p style="color:var(--muted)">Need more reviews for trend data</p>';
        return;
    }

    const scores = reviews.slice(0, 50).reverse().map(r => r.score || 0);
    const w = 600, h = 80, pad = 10;
    const minS = Math.min(...scores), maxS = Math.max(...scores, 1);
    const rangeS = maxS - minS || 1;

    const points = scores.map((s, i) => {
        const x = pad + (i / (scores.length - 1)) * (w - 2 * pad);
        const y = h - pad - ((s - minS) / rangeS) * (h - 2 * pad);
        return `${x},${y}`;
    }).join(' ');

    document.getElementById('mastery-sparkline').innerHTML = `
        <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
            <defs>
                <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style="stop-color:var(--gold); stop-opacity:0.3"/>
                    <stop offset="100%" style="stop-color:var(--gold); stop-opacity:0"/>
                </linearGradient>
            </defs>
            <polygon points="${pad},${h - pad} ${points} ${w - pad},${h - pad}" fill="url(#spark-grad)"/>
            <polyline points="${points}" fill="none" stroke="var(--gold)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="${pad}" y1="${h - pad - (70 - minS) / rangeS * (h - 2 * pad)}" x2="${w - pad}" y2="${h - pad - (70 - minS) / rangeS * (h - 2 * pad)}" stroke="rgba(46,204,113,0.3)" stroke-dasharray="4,4"/>
            <text x="${w - pad}" y="${h - pad - (70 - minS) / rangeS * (h - 2 * pad) - 4}" fill="rgba(46,204,113,0.5)" font-size="10" text-anchor="end">pass=70</text>
        </svg>
    `;
}

function renderHeatmap(patterns) {
    if (!patterns || patterns.length === 0) {
        document.getElementById('mastery-heatmap').innerHTML = '<p style="color:var(--muted)">Run AI Diagnosis to detect interference patterns</p>';
        return;
    }

    document.getElementById('mastery-heatmap').innerHTML = patterns.map((p, i) => {
        const severity = p.severity || 0;
        const color = severity >= 0.7 ? '#ff5f56' : severity >= 0.4 ? '#f39c12' : '#f1c40f';
        const cards = p.affected_cards ? JSON.parse(p.affected_cards) : [];
        return `<div class="heatmap-item" onclick="this.classList.toggle('expanded')">
            <div class="heatmap-header">
                <span class="heatmap-severity" style="background:${color}"></span>
                <span class="heatmap-name">${p.pattern_name}</span>
                <span class="heatmap-meta">${cards.length} cards · ${Math.round(severity * 100)}% severity</span>
            </div>
            <div class="heatmap-detail">${p.description || ''}\n\n${p.genai_diagnosis || ''}</div>
        </div>`;
    }).join('');
}

window.runDiagnosis = async () => {
    const btn = document.querySelector('.mastery-heatmap-card .complete-btn');
    if (btn) btn.textContent = 'Analyzing...';
    try {
        await fetch('/api/flashcards/diagnose', { method: 'POST' });
        await loadMasteryData();
    } catch (e) {
        console.error('Diagnosis failed:', e);
    }
    if (btn) btn.textContent = 'Refresh AI Diagnosis';
};

// ── Smart Practice ──
window.startSmartPractice = async () => {
    const btn = document.getElementById('smart-practice-btn');
    const resultEl = document.getElementById('smart-practice-result');
    btn.textContent = 'Generating...';
    btn.disabled = true;

    try {
        const res = await fetch('/api/flashcards/generate-sentence', { method: 'POST' });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const weakSet = new Set(data.weakChars || []);
        const textHtml = (data.chars || []).map(c => {
            if (!c.p) return c.c;
            return weakSet.has(c.c) ? `<span class="weak-char">${c.c}</span>` : c.c;
        }).join('');
        const pinyinStr = (data.chars || []).filter(c => c.p).map(c => c.p).join(' ');

        resultEl.classList.remove('hidden');
        resultEl.innerHTML = `
            <div class="smart-practice-text">${textHtml}</div>
            <div class="smart-practice-pinyin">${pinyinStr}</div>
            <div class="smart-practice-actions">
                <button class="listen-btn female-btn" onclick="playPronunciation('${data.text.replace(/'/g, "\\'")}', 0.75, VOICE_MAP.female)">♀ Listen</button>
                <button class="listen-btn male-btn" onclick="playPronunciation('${data.text.replace(/'/g, "\\'")}', 0.75, VOICE_MAP.male)">♂ Listen</button>
            </div>
        `;
    } catch (e) {
        resultEl.classList.remove('hidden');
        resultEl.innerHTML = `<p style="color:var(--red)">${e.message || 'Failed to generate'}</p>`;
    }
    btn.textContent = 'Practice Your Weakest Patterns';
    btn.disabled = false;
};

// ── Update dashboard flashcard stats on load ──
async function updateDashboardFCStats() {
    try {
        const [dueRes, statsRes] = await Promise.all([
            fetch('/api/flashcards/due?limit=100'),
            fetch('/api/flashcards/stats')
        ]);
        const due = await dueRes.json();
        const stats = await statsRes.json();
        const dueEl = document.getElementById('fc-due-count');
        const mastEl = document.getElementById('fc-mastery-display');
        if (dueEl) dueEl.textContent = `${due.length} due`;
        if (mastEl) mastEl.textContent = `${Math.round(stats.masteryPercent)}% mastery`;
    } catch (e) { /* silent */ }
}

// Run on page load and when returning to dashboard
const origSwitchScreen = switchScreen;
// We can't reassign switchScreen since it's a function declaration, so we hook via goToDashboard
const origGoToDashboard = window.goToDashboard;
window.goToDashboard = () => {
    origGoToDashboard();
    updateDashboardFCStats();
};

// Initial load
setTimeout(updateDashboardFCStats, 1000);

window.selectMockChoice = (spIdx, itemIdx, optIdx, btn) => {
    if (!STATE.mockExam.userChoices) STATE.mockExam.userChoices = {};
    if (!STATE.mockExam.userChoices[spIdx]) STATE.mockExam.userChoices[spIdx] = {};
    STATE.mockExam.userChoices[spIdx][itemIdx] = optIdx;
    
    // Update UI toggle
    const group = btn.parentElement;
    if (group) {
        group.querySelectorAll('.mock-choice-btn').forEach((b, i) => {
            b.classList.toggle('selected', i === optIdx);
        });
    }
};

