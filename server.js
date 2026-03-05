
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const CryptoJS = require('crypto-js');
const WebSocket = require('ws');
const path = require('path');
const https = require('https');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Pixabay Config ──────────────────────────────────────────────────────────
const PIXABAY_KEY = '54890520-5361b01bd79c68d8fb64b86d5'; // pixabay.com/api

// ─── Google Cloud TTS Config ─────────────────────────────────────────────────
const GOOGLE_TTS_KEY = 'AIzaSyBcJPu6AfeVPwdnWBwuDW9Wl-pBtITYQM0';

// ─── Azure OpenAI Config ───────────────────────────────────────────────────
const AZURE_CONFIG = {
    endpoint: 'https://innochat-eus2.openai.azure.com/',
    apiKey: '6036acce36954f1aa7923996e0278538',
    apiVersion: '2025-01-01-preview',
    deployment: 'gpt-5-chat-2'
};

async function callAzureOpenAI(messages, maxTokens = 600) {
    const url = `${AZURE_CONFIG.endpoint}openai/deployments/${AZURE_CONFIG.deployment}/chat/completions?api-version=${AZURE_CONFIG.apiVersion}`;
    const body = JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.85 });
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-key': AZURE_CONFIG.apiKey }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data).choices[0].message.content); }
                catch (e) { reject(new Error('Parse error: ' + data)); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ─── Official PSC Sections ────────────────────────────────────────────────
// Keyed by the same IDs used in the frontend
const PSC_SECTIONS = {
    dan_yin_jie:    { zh: '单音节字词', desc: 'A single Chinese character (one syllable). Focus on initials and finals.' },
    duo_yin_jie:    { zh: '多音节词语', desc: 'A two-to-three syllable Mandarin word or compound. Focus on tone sandhi.' },
    lang_du:        { zh: '朗读短文',   desc: 'A vivid, creative short story in Mandarin (4-6 sentences) for PSC reading practice. Make it imaginative and engaging like a storybook entry with a clear visual scene. Also return "title" (4-8 Chinese character story title) and "keyword" (2-4 English words for an artistic illustration search, e.g. "whimsical forest house" or "watercolor mountain landscape"). Story must flow naturally for reading aloud.' },
    ming_ti:        { zh: '命题说话',   desc: 'A free-talk prompt question for 3-minute speech (命题说话). E.g. 请谈谈你最难忘的一次旅行' },
    xuan_ze:        { zh: '选择判断',   desc: 'A short sentence containing a common Cantonese-influenced Mandarin error (选择判断). The sentence should sound plausible but contain a word usage mistake.' }
};

const GRADE_DESC = {
    1: 'Grade 1 (一级) — broadcaster/native level: use advanced formal vocabulary, complex sentence structures',
    2: 'Grade 2 (二级) — professional level: clear everyday Mandarin, moderate complexity',
    3: 'Grade 3 (三级) — baseline level: simple everyday conversational sentences'
};

// ─── Sentence Pool ────────────────────────────────────────────────────────
// Map: `${section}_${grade}` -> array of {text, chars}
const sentencePool = {};
const POOL_TARGET = 50; // Target pool size per section+grade
const POOL_MIN    = 5;  // Start serving once we have this many

async function generateOneSentence(section, grade, theme = '') {
    const secInfo = PSC_SECTIONS[section];
    if (!secInfo) return null;
    
    let themeInstruction = '';
    if (section === 'lang_du' && theme) {
        themeInstruction = ` The story theme is: ${theme}. Make sure the title, story content, and image keyword all revolve around this specific theme.`;
    }

    const messages = [
        {
            role: 'system',
            content: `You are a PSC (普通话水平测试) exam coach. Respond with ONLY valid JSON, no markdown, no extra text.
For lang_du (story) use: {"text":"full text","title":"Chinese title","keyword":"English photo keywords","chars":[{"c":"字","p":"pīnyīn"},{"c":"，","p":""},...]}
For all other sections use: {"text":"full text","chars":[{"c":"字","p":"pīnyīn"},{"c":"，","p":""},...]}
Rules: "text" = full Simplified Chinese. "chars" = every char/punctuation with tone-marked pinyin, punctuation gets p="". "title" = 4-8 Chinese chars. "keyword" = 2-4 English words for Pixabay illustration search. Use artistic, whimsical keywords.

Target Audience: Cantonese speakers learning Mandarin. 
Priority Targets:
1. Retroflex initials (zh, ch, sh, r): e.g., 石 (shí), 阶 (jiē), 树 (shù), 声 (shēng), 吹 (chuī).
2. j/q/x initials: e.g., 清 (qīng), 气 (qì), 景 (jǐng), 渐 (jiàn).
3. The "ü" sound: e.g., 绿 (lǜ), 去 (qù), 语 (yǔ).
4. Tone 3 sandhi and tone pairs: e.g., 小 (xiǎo), 路 (lù), 也 (yě), 此 (cǐ), 好 (hǎo).
5. -in/-ing distinctions: e.g., 林 (lín), 尽 (jìn), 清 (qīng), 景 (jǐng).
Incorporate these specific sounds frequently into the generated content.`
        },
        {
            role: 'user',
            content: `Generate one practice item for PSC section: ${secInfo.zh}. Task: ${secInfo.desc}.${themeInstruction} Level: ${GRADE_DESC[grade] || GRADE_DESC[3]}.`
        }
    ];
    const isLongSection = section === 'lang_du';
    const tokenLimit = isLongSection ? 1200 : 450;

    try {
        const raw = await callAzureOpenAI(messages, tokenLimit);
        // Strip markdown code fences if model wraps in ```json
        let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        // Attempt to repair truncated JSON (add closing brackets if missing)
        if (!cleaned.endsWith('}')) {
            // Find the last complete char entry and close
            const lastComma = cleaned.lastIndexOf('{"c"');
            if (lastComma > -1) {
                // Remove incomplete last item and close the array+object
                cleaned = cleaned.substring(0, cleaned.lastIndexOf(',', lastComma)).trimEnd() + ']}';
            } else {
                cleaned += ']}'; // best-effort
            }
        }
        const parsed = JSON.parse(cleaned);
        if (parsed.text && Array.isArray(parsed.chars)) {
            // Keep the theme metadata if it was a themed generation
            if (theme) {
                const simplifiedTheme = theme.split(' ')[0].toLowerCase();
                parsed.theme = simplifiedTheme.charAt(0).toUpperCase() + simplifiedTheme.slice(1);
            }
            return parsed;
        }
    } catch (e) {
        console.warn(`Pool gen failed (${section}_${grade}):`, e.message);
    }
    return null;
}

function poolKey(section, grade) { return `${section}_${grade}`; }

async function fillPool(section, grade, count = 5) {
    const key = poolKey(section, grade);
    if (!sentencePool[key]) sentencePool[key] = [];
    const promises = Array.from({ length: count }, () =>
        generateOneSentence(section, grade).then(s => { if (s) sentencePool[key].push(s); })
    );
    await Promise.allSettled(promises);
    shuffle(sentencePool[key]);
    console.log(`Pool [${key}]: ${sentencePool[key].length} AI items ready`);
}

function shuffle(array) {
    if (!array) return [];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ─── Static Question Database ─────────────────────────────────────────────
const staticQuestions = {}; // key: "grade_section" -> array
const QUESTIONS_DIR = path.join(__dirname, 'questions');

const SECTION_MAP = {
    '1': 'dan_yin_jie',
    '2': 'duo_yin_jie',
    '3': 'xuan_ze',
    '4': 'lang_du',
    '5': 'ming_ti'
};

function loadStaticQuestions() {
    if (!fs.existsSync(QUESTIONS_DIR)) return;
    try {
        const files = fs.readdirSync(QUESTIONS_DIR);
        files.forEach(file => {
            if (!file.endsWith('.json')) return;
            
            const lMatch = file.match(/l(\d)_s(\d)/);
            const sMatch = file.match(/^s(\d)\.json$/);

            if (lMatch) {
                const grade = lMatch[1];
                const sectionIdx = lMatch[2];
                const sectionKey = SECTION_MAP[sectionIdx];
                if (sectionKey) {
                    try {
                        const filePath = path.join(QUESTIONS_DIR, file);
                        const content = fs.readFileSync(filePath, 'utf-8');
                        if (!content || content === '[]') return;
                        const data = JSON.parse(content);
                        if (!Array.isArray(data)) return;
                        
                        const key = poolKey(sectionKey, grade);
                        if (!staticQuestions[key]) staticQuestions[key] = [];
                        staticQuestions[key] = staticQuestions[key].concat(data);
                        shuffle(staticQuestions[key]);
                    } catch (e) {
                        console.warn(`Failed to parse static file ${file}:`, e.message);
                    }
                }
            } else if (sMatch) {
                const sectionIdx = sMatch[1];
                const sectionKey = SECTION_MAP[sectionIdx];
                if (sectionKey) {
                    try {
                        const filePath = path.join(QUESTIONS_DIR, file);
                        const content = fs.readFileSync(filePath, 'utf-8');
                        if (!content || content === '[]') return;
                        const data = JSON.parse(content);
                        if (!Array.isArray(data)) return;
                        
                        // Apply universal file to all grades
                        for (let g = 1; g <= 3; g++) {
                            const key = poolKey(sectionKey, g);
                            if (!staticQuestions[key]) staticQuestions[key] = [];
                            staticQuestions[key] = staticQuestions[key].concat(data);
                            shuffle(staticQuestions[key]);
                        }
                    } catch (e) {
                        console.warn(`Failed to parse universal static file ${file}:`, e.message);
                    }
                }
            }
        });
        console.log('Static database loaded:', Object.keys(staticQuestions).length, 'categories');
    } catch (err) {
        console.error('Error reading questions directory:', err.message);
    }
}
loadStaticQuestions();

// Pre-warm pool with a few AI candidates as fallback
(async () => {
    const sections = ['dan_yin_jie', 'duo_yin_jie', 'xuan_ze', 'lang_du', 'ming_ti'];
    for (const g of [1, 2, 3]) {
        for (const s of sections) {
            maintainPool(s, g);
        }
    }
})();

function maintainPool(section, grade) {
    const key = poolKey(section, grade);
    const current = (sentencePool[key] || []).length;
    if (current < POOL_TARGET) {
        const needed = Math.min(10, POOL_TARGET - current);
        fillPool(section, grade, needed).catch(() => {});
    }
}

// ─── REST: Get Next Sentence ──────────────────────────────────────────────
app.post('/api/generate-content', async (req, res) => {
    const { section, grade, previousText, theme } = req.body;
    
    // 1. DATABASE FIRST: Aggregate all matching static content from disk
    try {
        const sectionIdx = section === 'lang_du' ? 4 : (section === 'dan_yin_jie' ? 1 : (section === 'duo_yin_jie' ? 2 : (section === 'xuan_ze' ? 3 : 5)));
        let allStaticItems = [];
        if (fs.existsSync(QUESTIONS_DIR)) {
            const files = fs.readdirSync(QUESTIONS_DIR).filter(f => 
                f.endsWith('.json') && (f.startsWith(`l${grade}_s${sectionIdx}`) || f === `s${sectionIdx}.json`)
            );
            files.forEach(f => {
                try {
                    const content = fs.readFileSync(path.join(QUESTIONS_DIR, f), 'utf-8');
                    const data = JSON.parse(content);
                    if (Array.isArray(data)) allStaticItems = allStaticItems.concat(data);
                } catch (e) { /* ignore parse errors */ }
            });
        }

        // Apply theme filter if requested (for Section 4)
        let availableStatic = allStaticItems;
        if (section === 'lang_du' && theme && theme !== 'CLASSIC') {
            const simplifiedTheme = theme.split(' ')[0].toLowerCase();
            availableStatic = allStaticItems.filter(s => s.theme && s.theme.toLowerCase().includes(simplifiedTheme));
        }

        // Filter out previous text
        availableStatic = availableStatic.filter(s => s.text !== previousText);

        if (availableStatic.length > 0) {
            const idx = Math.floor(Math.random() * availableStatic.length);
            const result = availableStatic[idx];
            
            // Decorate Section 4
            if (section === 'lang_du' && !result.title) {
                result.title = result.title || '\u81ea\u9009\u77ed\u6587';
                result.keyword = result.keyword || 'chinese landscape heritage';
            }
            
            console.log(`[DB] Serving static: ${result.title || result.text.substring(0,10)} (${availableStatic.length} left)`);
            return res.json(result);
        }
    } catch (e) {
        console.warn('Static check failed:', e.message);
    }

    // 2. LLM POOL FALLBACK: If database is empty or exhausted
    const key = poolKey(section, grade);
    if (!sentencePool[key]) sentencePool[key] = [];
    const pool = sentencePool[key];

    let availablePool = pool;
    if (section === 'lang_du' && theme && theme !== 'CLASSIC') {
        const simplifiedTheme = theme.split(' ')[0].toLowerCase();
        availablePool = pool.filter(s => s.theme && s.theme.toLowerCase().includes(simplifiedTheme));
    }
    
    availablePool = availablePool.filter(s => s.text !== previousText);

    if (availablePool.length > 0) {
        const idx = Math.floor(Math.random() * availablePool.length);
        const sentence = availablePool[idx];
        // Remove so we don't repeat AI entries
        const globalIdx = pool.indexOf(sentence);
        if (globalIdx !== -1) pool.splice(globalIdx, 1);
        
        console.log(`[LLM-POOL] Serving: ${sentence.title || sentence.text.substring(0,10)}`);
        // Only refill in background if we used an AI item
        maintainPool(section, grade); 
        return res.json(sentence);
    }

    // 3. ON-DEMAND GENERATION: Final fallback
    console.log(`[ON-DEMAND] Generating for ${key}...`);
    const sentence = await generateOneSentence(section, grade, theme);
    if (sentence) {
        return res.json(sentence);
    }
    res.status(500).json({ error: 'Failed to generate content' });
});

// ─── REST: Google Cloud TTS Proxy ───────────────────────────────────────────
// ─── REST: Pixabay Image Search ──────────────────────────────────────────────
app.get('/api/pixabay', (req, res) => {
    const q = req.query.q || 'nature';
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(q)}&image_type=illustration&orientation=horizontal&min_width=800&per_page=10&safesearch=true&order=popular`;
    https.get(url, (pixRes) => {
        let data = '';
        pixRes.on('data', chunk => data += chunk);
        pixRes.on('end', () => {
            try {
                const parsed = JSON.parse(data);
                if (parsed.hits && parsed.hits.length > 0) {
                    const idx = Math.floor(Math.random() * Math.min(5, parsed.hits.length));
                    res.json({ imageUrl: parsed.hits[idx].webformatURL });
                } else {
                    res.json({ imageUrl: null });
                }
            } catch (e) { res.status(500).json({ error: 'Pixabay parse error' }); }
        });
    }).on('error', (e) => res.status(500).json({ error: e.message }));
});


app.post('/api/tts', async (req, res) => {
    const { text, rate = 0.85, voice = 'cmn-CN-Chirp3-HD-Aoede' } = req.body;
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`;
    const body = JSON.stringify({
        input: { text },
        voice: { languageCode: 'cmn-CN', name: voice },
        audioConfig: { audioEncoding: 'MP3', speakingRate: rate }
    });

    return new Promise((resolve) => {
        const reqTTS = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (ttsRes) => {
            let data = '';
            ttsRes.on('data', chunk => data += chunk);
            ttsRes.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.audioContent) {
                        res.json({ audioContent: parsed.audioContent });
                    } else {
                        console.error('TTS error:', data);
                        res.status(500).json({ error: 'TTS failed', detail: parsed });
                    }
                } catch (e) {
                    res.status(500).json({ error: 'TTS parse error' });
                }
                resolve();
            });
        });
        reqTTS.on('error', (e) => { res.status(500).json({ error: e.message }); resolve(); });
        reqTTS.write(body);
        reqTTS.end();
    });
});

// ─── REST: Generate Tabular Report ───────────────────────────────────────
app.post('/api/generate-report', async (req, res) => {
    const { history, lang } = req.body;
    const langName = lang === 'en' ? 'English'
                   : lang === 'hk' ? 'Traditional Chinese (Cantonese users)'
                   : 'Simplified Chinese';

    const historyStr = history.map((h, i) =>
        `Row ${i+1}: Section="${h.section}" | Text="${h.text}" | Score=${(h.totalScore||0).toFixed(1)} | Tone=${(h.tone||0).toFixed(1)} | Fluency=${(h.fluency||0).toFixed(1)} | Errors=[${h.errors.join(', ') || 'none'}]`
    ).join('\n');

    const messages = [
        {
            role: 'system',
            content: `You are a PSC (普通话水平测试) coach writing a report card in ${langName}. 
Return ONLY an HTML string (no markdown, no code fences) containing:
1. A <table> with columns: # | 练习内容 | 得分 | 声调 | 流利度 | 错误字 | 改进建议
2. A short <div class="report-summary"> paragraph with top-3 tips.
Use inline styles for the table: border-collapse:collapse, td padding 8px 12px, alternating row background rgba(255,255,255,0.05).
Color scores: green if >=80, orange if >=60, red if <60.`
        },
        {
            role: 'user',
            content: `Generate the report card HTML for this session:\n${historyStr}`
        }
    ];

    try {
        const report = await callAzureOpenAI(messages, 1200);
        const cleaned = report.trim().replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
        res.json({ report: cleaned });
    } catch (e) {
        console.error('Report error:', e);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ─── ISE Audio Proxy (unchanged) ─────────────────────────────────────────
const config = {
    hostUrl: "ws://ise-api-sg.xf-yun.com/v2/ise",
    host: "ise-api-sg.xf-yun.com",
    appid: "ga8f3190",
    apiSecret: "cfe3bd189aa401d2f18c6bf9ce3acce4",
    apiKey: "d0e596d68d3bd4c89ec10293ceb68509",
    uri: "/v2/ise",
};

function getAuthStr(date) {
    let signatureOrigin = `host: ${config.host}\ndate: ${date}\nGET ${config.uri} HTTP/1.1`;
    let signatureSha = CryptoJS.HmacSHA256(signatureOrigin, config.apiSecret);
    let signature = CryptoJS.enc.Base64.stringify(signatureSha);
    let authorizationOrigin = `api_key="${config.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(authorizationOrigin));
}

const FRAME = { STATUS_FIRST_FRAME: 0, STATUS_CONTINUE_FRAME: 1, STATUS_LAST_FRAME: 2 };

io.on('connection', (socket) => {
    console.log('New client connected');
    let ws = null;

    socket.on('start-evaluation', (data) => {
        // ── Kill any existing ISE connection so stale results never overwrite a new attempt ──
        if (ws) {
            ws.removeAllListeners();           // detach handlers first
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            ws = null;
        }

        const { language, text } = data;
        let date = new Date().toUTCString();
        let wssUrl = config.hostUrl + "?authorization=" + getAuthStr(date) + "&date=" + date + "&host=" + config.host;
        ws = new WebSocket(wssUrl);

        ws.on('open', () => {
            let frame = {
                "common": { app_id: config.appid },
                "business": {
                    "sub": "ise", "ent": language, "category": "read_sentence",
                    "text": '\uFEFF' + text, "tte": "utf-8", "rstcd": "utf8",
                    "ttp_skip": true, "cmd": "ssb", "aue": "raw", "auf": "audio/L16;rate=16000"
                },
                "data": { "status": 0 }
            };
            ws.send(JSON.stringify(frame));
            socket.emit('ise-status', 'Connected');
        });

        ws.on('message', (message) => {
            try {
                let res = JSON.parse(message);
                if (res.code != 0) { socket.emit('ise-error', `Error ${res.code}: ${res.message}`); return; }
                if (res.data && res.data.data) {
                    let b = Buffer.from(res.data.data, 'base64');
                    socket.emit('ise-result', { status: res.data.status, xml: b.toString(), raw: res.data });
                }
            } catch (e) { console.error('Error parsing ISE response', e); }
        });

        ws.on('close', () => socket.emit('ise-status', 'Connection Closed'));
        ws.on('error', (err) => socket.emit('ise-error', 'WebSocket Error'));
    });

    socket.on('audio-data', (pcmData) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
            "common": { "app_id": config.appid },
            "business": { "aus": 2, "cmd": "auw", "aue": "raw" },
            "data": { "status": 1, "data": Buffer.from(pcmData).toString('base64') }
        }));
    });

    socket.on('stop-evaluation', () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
            "common": { "app_id": config.appid },
            "business": { "aus": 4, "cmd": "auw", "aue": "raw" },
            "data": { "status": 2, "data": "" }
        }));
    });

    socket.on('disconnect', () => { if (ws) ws.close(); console.log('Client disconnected'); });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
