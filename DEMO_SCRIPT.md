# Yoda 優答 — Structured 5-Minute Demo Script

> **Total Time:** ~5 minutes
> **Goal:** Take judges through a logical, structured journey of the application and its features. 
> **Setup Before Demo:** Run `npm start`, open `http://localhost:3000`. Have your volume up and microphone ready.

---

### Part 1: Introduction & About the App (0:00 - 1:00)
**[Visual: Start on the Home/Onboarding Screen with the hero image]**

**You:** 
"Hello everyone! Today I’m excited to present **Yoda 優答**, your AI-powered personal trainer for the Putonghua Proficiency Test (PSC). 

The PSC is the official Mandarin test required for teachers and broadcasters in Greater China. For native Cantonese speakers, mastering Mandarin tones and tricky sounds is notoriously difficult. Yoda solves this by providing real-time, official-level scoring and tailored practice."

**[Visual: Click 'About' in the navigation bar or the "About PSC" button]**

**You:** 
"Before we jump in, let's briefly look at the structure of our application. The PSC test relies on five core sections—ranging from reading single syllables to a 3-minute spontaneous free talk. Our app is structured to mirror this perfectly. We have **Core Sections** for targeted exam practice, a **Training Playground** to unlearn Cantonese accents, **Mock Exams** for test readiness, and heavily rely on generative AI to personalize the journey."

---

### Part 2: Level Selection & The Dashboard (1:00 - 1:15)
**[Visual: Click 'Home' to return to the Onboarding Screen]**

**You:** 
"Let's dive in. Back on the home screen, the first thing a student does is select their target grade. Whether you want Grade 1 for broadcasting or Grade 3 for a basic pass, Yoda dynamically scales the difficulty of the AI-generated phrases we’ll see later. Let's select [Choose Grade 2] and jump into our training journey!"

*(Action: Click 'Start Training Journey')*

---

### Part 3: Section-by-Section Demo (1:15 - 2:30)
**[Visual: The main Sections Dashboard]**

**You:**
"Here on the Sections Dashboard, students can tackle any part of the exam. A major differentiator for Yoda is our **AI Sentence Pool**. We use Azure OpenAI to endlessly generate fresh practice content, meaning you never run out of material. 

Let's briefly walk through the sections:"

- *(Action: Click Section 1 - 单音节字词)*
**You:** "Section 1 tests **Single Syllables**. Notice our **Word-Grouped Pinyin**. Most tools show Pinyin character-by-character, resulting in robotic reading. Yoda groups the Pinyin by natural boundaries to build a native speaking rhythm."

- *(Action: Stop audio and go back. Click Section 2 - 多音节词语)*
**You:** "Section 2 expands this to **Multi-syllables**, focusing on tone sandhi and complex pronunciations."

- *(Action: Stop audio and go back. Click Section 3 - 选择判断)*
**You:** "Section 3 tests **Word Choice**. We designed specific parts focusing on vocabulary, measure words, and grammar that trip up Cantonese speakers."

- *(Action: Stop audio and go back. Click Section 4 - 朗读短文)*
**You:** "Section 4 is reading passages aloud. Here, you get a flowing text tailored to your selected grade."

**[Visual: In Section 4 (or Section 1), record your voice]**
**You:** "When I practice, my audio is securely sent to the enterprise-grade **iFLYTEK ISE engine**—the same technology often used in the actual exams. I get an instant score reflecting my tone, fluency, and phonetics. 
*(Action: Speak, stop recording, show the score.)*
"Notice our mascot reacts dynamically! If I score above 80, Yoda is happy. Above 95 gets confetti! Low scores tell me to try again. I can also play my voice back to compare it against the native speaker."

---

### Part 4: The Training Playground (2:30 - 3:15)
**[Visual: Navigate to the 'Playground' tab in the top navbar]**

**You:**
"Testing isn't enough; we need to *train*. This brings us to the **Training Playground**, filled with targeted games."

- *(Action: Click Interactive Pinyin Chart)*
**You:** "First, our **Interactive Pinyin Chart**. You can click any syllable to instantly hear the exact native pronunciation across all 4 tones."
- *(Action: Go back, click Flashcards)*
**You:** "We have **Flashcards** explicitly generated for common Cantonese blindspots."
- *(Action: Go back, highlight the games)*
**You:** "We also built specialized games. The **Tone Identification Challenge** trains your ear to guess the correct tone. The **Minimal Pairs Battle** isolates tricky consonants like 's' versus 'sh', or 'z' versus 'zh' through gamification."

---

### Part 5: Mastery Dashboard (3:15 - 3:45)
**[Visual: Navigate to the 'Dashboard' / 'Mastery' tab in the top navbar]**

**You:**
"As students use the app, we track everything. On the **Mastery Dashboard**, students can see a bird’s-eye view of their progress. They can track their average scores across all five sections, visualize their improvement over time with charts, and see exactly which phonetic rules they are mastering and which ones need more work."

---

### Part 6: Mock Exams (3:45 - 4:15)
**[Visual: Navigate to the 'Mock Exam' tab in the top navbar]**

**You:**
"When a student feels ready, they enter the **Mock Exam** section. This is crucial because it simulates the intense environment of the real PSC. 
The system stitches together dynamically generated content from all 5 sections into one timed, continuous session with no do-overs. This ensures students are fully psychologically prepared for the pacing of the actual test."

---

### Part 7: AI Report Card & Outro (4:15 - 5:00)
**[Visual: Submit a mock exam or click to generate an AI report card on the Mastery screen]**

**You:**
"Finally, the crown jewel: **The AI Report Card**. 

Yoda uses GPT-4o to analyze all of your recorded sessions and mock exam attempts. It gives you a full, personalized diagnostic breakdown. It points out exactly which initials or tones you struggled with the most today, and provides highly specific, actionable tips to unlearn your Cantonese accent.

**To wrap up:** Yoda 優答 is a complete, real-time coaching ecosystem. With endless AI-generated content, official-level grading, targeted linguistic games, realistic mock exams, and comprehensive AI diagnostics, it is the ultimate tool to ace the Putonghua Proficiency Test.

Thank you! I'd be happy to answer any questions."
