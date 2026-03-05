
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
    mockExam: {
        timerId: null,
        data: null,
        currentPartIndex: 0,
        timeLeft: 0,
        isRecording: false
    }
};

// ─── DOM ──────────────────────────────────────────────────────────────────
const screens = {
    onboarding:      document.getElementById('onboarding'),
    dashboard:       document.getElementById('dashboard'),
    themeSelection:  document.getElementById('theme-selection'),
    exercise:        document.getElementById('exercise'),
    report:          document.getElementById('report'),
    mockExamDashboard: document.getElementById('mock-exam-dashboard'),
    mockExamInstructions: document.getElementById('mock-exam-instructions'),
    mockExamSession:   document.getElementById('mock-exam-session')
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

    // Toggle Mock Exam button in Navbar visibility (only hide on onboarding)
    const navMockBtn = document.getElementById('nav-mock-btn');
    if (navMockBtn) {
        if (name === 'onboarding') navMockBtn.classList.add('hidden');
        else navMockBtn.classList.remove('hidden');
    }

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
    deactivateStorybook();
    switchScreen('dashboard');
};

window.closeModal = () => yodaModal.classList.remove('show');

function updateUIText() {
    document.getElementById('welcome-title').innerText  = LOCALE[STATE.lang].welcome;
    document.getElementById('welcome-subtitle').innerText = LOCALE[STATE.lang].subtitle;
    if (STATE.activeSection) {
        const titles = SECTION_TITLES[STATE.activeSection] || {};
        document.getElementById('exercise-title').innerText = titles[STATE.lang] || STATE.activeSection;
    }
}

// ─── Exercise Start ───────────────────────────────────────────────────────

window.startExercise = async (section) => {
    STATE.activeSection = section;

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
                theme: STATE.selectedTheme // Pass the theme if set
            })
        });
        const data = await res.json();
        if (data.text) {
            STATE.currentText  = data.text;
            STATE.currentChars = data.chars || [];

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
        const txtEl = isExam ? document.getElementById('exam-record-text') : document.getElementById('record-text');
        const bEl = isExam ? document.getElementById('exam-record-btn') : recordBtn;

        txtEl.innerText = 'Processing…';

        // ── Reset result display (only for practice) ──
        if (!isExam) {
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
        const sampleRate = audioContext.sampleRate;
        input     = audioContext.createMediaStreamSource(stream);
        processor = audioContext.createScriptProcessor(4096, 1, 1);
        input.connect(processor);
        processor.connect(audioContext.destination);

        // Reset local capture buffer
        STATE.recordingBuffer = [];
        if (STATE.playbackUrl) { URL.revokeObjectURL(STATE.playbackUrl); STATE.playbackUrl = null; }

        socket.emit('start-evaluation', {
            language: 'cn_vip',
            text: STATE.currentText || '今天天气很好。'
        });

        processor.onaudioprocess = (e) => {
            if (!isRecording) return;
            const inputData = e.inputBuffer.getChannelData(0);
            STATE.recordingBuffer.push(new Float32Array(inputData));
            const down = downsampleBuffer(inputData, sampleRate, 16000);
            socket.emit('audio-data', floatTo16BitPCM(down));
        };

        isRecording = true;
        bEl.classList.add('recording');
        txtEl.innerText = 'Stop';

        if (!isExam) {
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
    const bEl = isExam ? document.getElementById('exam-record-btn') : recordBtn;
    const txtEl = isExam ? document.getElementById('exam-record-text') : document.getElementById('record-text');

    bEl.classList.remove('recording');
    txtEl.innerText = isExam ? 'Start Recording' : 'Start Recording';

    if (STATE.recordingBuffer.length > 0 && audioContext) {
        const sr = audioContext.sampleRate;
        const totalLen = STATE.recordingBuffer.reduce((s, b) => s + b.length, 0);
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of STATE.recordingBuffer) { merged.set(chunk, offset); offset += chunk.length; }
        const wavBlob = encodeWAV(merged, sr);
        STATE.playbackUrl = URL.createObjectURL(wavBlob);
    }

    if (processor) { processor.disconnect(); input.disconnect(); }
    if (stream)    { stream.getTracks().forEach(t => t.stop()); }
    if (audioContext) audioContext.close();
    socket.emit('stop-evaluation');
}

// ─── ISE Result Handling ──────────────────────────────────────────────────

socket.on('ise-result', (data) => renderResult(data.xml));
socket.on('ise-error',  (msg)  => console.error('ISE error:', msg));

function renderResult(xmlStr) {
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
    let reactionImg;
    if      (pct < 30)              reactionImg = 'Try_Again_Yoda.png';
    else if (pct >= 50 && pct < 70) reactionImg = 'right_yoda.png';
    else if (pct >= 70 && pct < 95) reactionImg = 'good_yoda.png';
    else if (pct >= 95)             reactionImg = 'Yoda.png';
    else                            reactionImg = 'Try_Again_Yoda.png';
    showYodaPopup(reactionImg, reactionMessages[reactionImg], Math.round(pct));

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

    // Tip / Yoda modal
    if (pct >= 90) {
        document.getElementById('tip-text').innerText = LOCALE[STATE.lang].tips.success;
    } else {
        document.getElementById('tip-text').innerText =
            pct > 60 ? LOCALE[STATE.lang].tips.good : LOCALE[STATE.lang].tips.bad;
    }
}

// ─── Audio Helpers ────────────────────────────────────────────────────────

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

window.goToMockExamDashboard = () => {
    stopRecording();
    clearInterval(STATE.mockExam.timerId);
    switchScreen('mockExamDashboard');
};

window.startMockExam = async (examId) => {
    try {
        const res = await fetch(`/api/mock-exam/${examId}`);
        const examData = await res.json();
        
        STATE.mockExam.data = examData;
        STATE.mockExam.currentPartIndex = 0;
        STATE.activeSection = 'mock'; 

        // Populate instruction screen
        document.getElementById('ins-exam-title').innerText = examData.title;
        document.getElementById('ins-exam-desc').innerText = examData.description || "Official Putonghua Proficiency Test simulation.";
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
        // Multi-part content (Section 3)
        part.subParts.forEach(sp => {
            const wrap = document.createElement('div');
            wrap.style.marginBottom = '20px';
            wrap.style.textAlign = 'left';
            wrap.innerHTML = `<h4 style="font-size:1.1rem; color:#6c5ce7; margin-bottom:10px;">${sp.type}</h4>
                              <p style="font-size:1rem; opacity:0.8; margin-bottom:10px;">${sp.instruction}</p>
                              <div style="font-size:1.2rem; background:#f8f9fa; padding:15px; border-radius:10px;">${sp.examples.join(' | ')}</div>`;
            textEl.appendChild(wrap);
        });
        STATE.currentText = part.instructions; // Fallback for eval
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
    STATE.mockExam.currentPartIndex++;
    if (STATE.mockExam.currentPartIndex < STATE.mockExam.data.sections.length) {
        loadMockExamPart(STATE.mockExam.currentPartIndex);
    } else {
        clearInterval(STATE.mockExam.timerId);
        alert('Exam Complete! Well done.');
        goToMockExamDashboard();
    }
};

window.exitExam = () => {
    if (confirm('Are you sure you want to exit the exam? All progress will be lost.')) {
        clearInterval(STATE.mockExam.timerId);
        stopRecording();
        goToMockExamDashboard();
    }
}

