# 🧙 Yoda 優答 — Project Proposal
> *您的普通話水平測試 AI 專屬教練*
> Your AI-powered Personal Coach for the Putonghua Proficiency Test (PSC)

---

## 1. Problem Statement

### The Mandarin Proficiency Gap

Millions of learners across Hong Kong, Macau, and the Chinese diaspora aspire to pass the **PSC (普通話水平測試)** — yet the path to certified proficiency is filled with systemic barriers that traditional methods cannot solve.

| Evidence | Data |
|---|---|
| PSC first-time pass rate for Grade 2 or above | ~30% *(HKEAA, 2023)* |
| Average monthly cost of private Putonghua tutoring in HK | HK$3,000–5,000 |
| Actual speaking practice time per student in a group class | < 15 minutes per lesson |
| PSC-aligned digital tools currently available | **Zero** |

The PSC tests **five distinct skills** — single-syllable pronunciation, multi-syllable tone sandhi, passage reading aloud, impromptu free talk, and word-choice judgement. Each requires targeted, repeated practice with **immediate corrective feedback**. No existing tool provides all five.

> *"Students can recognise correct Mandarin passively, but they have no affordable way to practise speaking daily and know instantly whether they sounded correct."*
> — Common observation from PSC tutors in HK

**Existing solutions and their failings:**

- 📚 **Textbooks / Audio CDs** — static, no spoken feedback, not personalised
- 📱 **Generic apps (Duolingo, HelloChinese)** — not PSC-aligned, gamified rather than diagnostic
- 👩‍🏫 **Private tutors** — expensive, time-limited, subjective, not available 24/7

**The core problem:** There is no affordable, always-available, scientifically-scored platform aligned to the official PSC curriculum that gives learners real spoken feedback.

---

## 2. Solution Description

### Introducing Yoda 優答 🧙

Yoda 優答 is a full-stack, real-time Putonghua coaching web application that listens to your voice, scores it against the official PSC rubric, and gives you instant personalised feedback — powered by Azure OpenAI and the iFLYTEK ISE engine.

> *Screenshots of the Yoda 優答 application:*

![Onboarding Hero Screen](public/assets/screenshot_onboarding.png)
*Fig 1 — Onboarding screen with Yoda mascot, grade selector, and starfield background*

![Dashboard](public/assets/screenshot_dashboard.png)
*Fig 2 — Practice dashboard with PSC section cards*

![Exercise Screen](public/assets/screenshot_exercise.png)
*Fig 3 — Live exercise screen with Mandarin text, pinyin, and mic button*

### Development Tools & Technologies

| Layer | Technology |
|---|---|
| Backend | Node.js, Express.js, Socket.IO |
| AI Content Generation | Azure OpenAI (GPT-4o) |
| Pronunciation Scoring | iFLYTEK ISE API (`cn_vip` engine) |
| Audio Capture | Web Audio API, PCM → 16kHz downsampling |
| Audio Playback | SpeechSynthesis API + client-side WAV encoding |
| Frontend | Vanilla JS, HTML5, CSS3 (glassmorphism design system) |
| Real-time Comms | WebSocket (Socket.IO) |

### Key Features

| # | Feature | Description |
|---|---|---|
| 1 | **Official PSC Sections** | 5 practice modes mirror the real exam: 单音节字词, 多音节词语, 选择判断, 朗读短文, 命题说话 |
| 2 | **AI Sentence Pool** | Azure OpenAI pre-generates 50 sentences per section/grade at startup; refills silently in background |
| 3 | **Real-Time Scoring** | iFLYTEK ISE scores every recording across Tone (声调), Fluency (流利), Phonetics (发音), Integrity (完整) |
| 4 | **Native vs. My Voice** | Compare TTS native pronunciation with your own recorded playback side-by-side |
| 5 | **Word-Grouped Pinyin** | Pinyin shown under whole words as a phrase — not per-character — for natural reading |
| 6 | **Horizontal Feedback Overlay** | Mispronounced characters highlighted in red, correct in green, with click-to-hear |
| 7 | **AI Report Card** | Azure OpenAI generates a full HTML table of session scores, errors, and improvement tips |
| 8 | **Mascot Reaction Cards** | Yoda popup card springs in for 3 seconds after each attempt with a score-reactive image |
| 9 | **Unlimited Practice** | No attempt cap — practise any sentence as many times as needed |
| 10 | **3-Grade Difficulty** | Grade 1 (broadcaster), Grade 2 (professional), Grade 3 (baseline) — each with tailored prompts |

### Benefits & Advantages

- ✅ **Accessible** — runs in any browser, no installation required
- ✅ **Affordable** — fraction of private tutor cost
- ✅ **Objective** — machine-scored, consistent rubric every time
- ✅ **Engaging** — mascot Yoda (優答) provides emotional motivation through score-reactive feedback
- ✅ **Curriculum-accurate** — the only tool built around the official 5-section PSC structure
- ✅ **Endless content** — AI regenerates fresh sentences continuously, no repetition

---

## 3. Implementation Plan

### Timeline Overview

```
Week 1–2   →  Research & Architecture
Week 3–5   →  Core Backend & AI Integration
Week 6–8   →  Frontend Polish & Mobile PWA
Week 9–10  →  User Testing & Iteration
Week 11–12 →  Deployment & Beta Launch
```

### Detailed Milestones

| Phase | Timeline | Deliverables |
|---|---|---|
| 🔬 **Research & Architecture** | Week 1–2 | Cloud architecture, data schema, PSC curriculum map signed off |
| ⚙️ **Backend & AI Pipeline** | Week 3–5 | Auth system, persistent sessions, adaptive generation for all 5 PSC sections |
| 🎨 **Frontend & PWA** | Week 6–8 | Progressive Web App, offline support, streak system, mobile layout |
| 🧪 **User Testing** | Week 9–10 | 20 PSC candidates tested; A/B feedback on scoring UI; iteration |
| 🚀 **Launch** | Week 11–12 | Deployed to Azure; 50+ beta users onboarded; analytics live |

### Resources Required

| Category | Resource | Purpose | Est. Monthly Cost |
|---|---|---|---|
| AI | Azure OpenAI (GPT-4o) | Content & report generation | ~$50–100 |
| API | iFLYTEK ISE | Pronunciation scoring | ~$30–80 |
| Hosting | Azure App Service | Node.js + WebSocket server | ~$60 |
| Database | MongoDB Atlas | Sessions, history, user data | ~$57 |
| Manpower | Full-Stack Developer (×1) | Backend, frontend, AI prompts | Primary |
| Manpower | UX / Graphic Designer (×1) | Mascot art, UI polish | Part-time |
| Manpower | PSC Tutor Consultant (×1) | Curriculum validation | Ad-hoc |

### Key Checkpoints

- [ ] **Checkpoint 1** (Wk 2) — Architecture & curriculum map approved
- [ ] **Checkpoint 2** (Wk 5) — AI pipeline live; ≥90% JSON parse success rate
- [ ] **Checkpoint 3** (Wk 8) — PWA installable on iOS & Android; Lighthouse score ≥ 85
- [ ] **Checkpoint 4** (Wk 10) — ≥15 user test sessions completed; key pain points resolved
- [ ] **Checkpoint 5** (Wk 12) — Beta live; error rate < 1%; 50+ users onboarded

---

## Vision

> *Every learner deserves a patient, intelligent, always-available coach.*
>
> Yoda 優答 makes world-class Putonghua preparation accessible to **everyone** — not just those who can afford a private tutor. With AI as the engine and Yoda 🧙 as the heart, we're building the future of PSC preparation.

---
*Yoda 優答 — 以練代測，優答每道題。*
