// ── Config ───────────────────────────────────────────────────────────────────
const OPENROUTER_KEY = ["sk-or-v1-7be6f709e94af585","fffc1913ddc1120fbdf93e1add4793e4","648184c8ccbab685"].join("");
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  file: null,
  fileText: '',
  mode: 'flashcards',
  flashcards: [],
  fcQueue: [],
  fcIndex: 0,
  fcCorrect: 0,
  fcFlipped: false,
  quiz: [],
  quizIndex: 0,
  quizScore: 0,
  quizAnswered: false,
};

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  upload:     $('screen-upload'),
  loading:    $('screen-loading'),
  flashcards: $('screen-flashcards'),
  summary:    $('screen-summary'),
  quiz:       $('screen-quiz'),
};

// ── Navigation ──────────────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ── Toast ───────────────────────────────────────────────────────────────────
function toast(msg, type = 'success', duration = 3000) {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), duration);
}

// ── File Upload ──────────────────────────────────────────────────────────────
const uploadZone = $('upload-zone');
const fileInput  = $('file-input');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const allowed = ['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                   'text/plain','image/jpeg','image/png','image/gif','image/webp'];
  if (!allowed.includes(file.type) && !file.name.endsWith('.txt')) {
    toast('Nicht unterstützter Dateityp', 'error');
    return;
  }
  state.file = file;
  showFilePreview(file);
}

function showFilePreview(file) {
  const icons = {
    'application/pdf': '📄',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
    'text/plain': '📃',
  };
  const icon = file.type.startsWith('image/') ? '🖼️' : (icons[file.type] || '📄');
  const size = file.size < 1024*1024
    ? `${(file.size/1024).toFixed(1)} KB`
    : `${(file.size/1024/1024).toFixed(1)} MB`;

  $('file-preview').innerHTML = `
    <span class="file-icon">${icon}</span>
    <div class="file-info">
      <div class="file-name">${file.name}</div>
      <div class="file-size">${size}</div>
    </div>
    <button class="btn-remove" title="Entfernen">✕</button>
  `;
  $('file-preview').style.display = 'flex';
  uploadZone.style.display = 'none';

  $('file-preview').querySelector('.btn-remove').addEventListener('click', clearFile);
  updateAnalyzeBtn();
}

function clearFile() {
  state.file = null;
  $('file-preview').style.display = 'none';
  uploadZone.style.display = '';
  fileInput.value = '';
  updateAnalyzeBtn();
}

// ── Mode Selection ───────────────────────────────────────────────────────────
document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    state.mode = card.dataset.mode;
  });
});

function updateAnalyzeBtn() {
  $('analyze-btn').disabled = !state.file;
}

// ── Analyze ──────────────────────────────────────────────────────────────────
$('analyze-btn').addEventListener('click', async () => {
  if (!state.file) return;
  await analyzeFile();
});

async function analyzeFile() {
  showScreen('loading');
  try {
    const text = await extractText(state.file);
    const prompt = buildPrompt(state.mode, text);
    const result = await callOpenRouter(prompt);
    parseAndShow(result, state.mode);
  } catch (err) {
    showScreen('upload');
    toast(err.message || 'Fehler beim Analysieren', 'error', 5000);
    console.error(err);
  }
}

// ── Text Extraction ───────────────────────────────────────────────────────────
async function extractText(file) {
  if (file.type === 'application/pdf') {
    return await extractPdfText(file);
  }
  if (file.type.startsWith('image/')) {
    // For images, return a note — Llama free tier doesn't support vision
    return '[Bild hochgeladen — bitte nur Text-Dokumente verwenden für beste Resultate]';
  }
  return await fileToText(file);
}

async function extractPdfText(file) {
  try {
    // Load PDF.js from CDN
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text.trim() || 'Kein Text im PDF gefunden.';
  } catch (e) {
    // Fallback: read as text
    return await fileToText(file);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file, 'utf-8');
  });
}

// ── Prompts ───────────────────────────────────────────────────────────────────
function buildPrompt(mode, text) {
  const truncated = text.slice(0, 12000); // Stay within token limits

  if (mode === 'flashcards') {
    return `Hier ist ein Dokument:

${truncated}

Erstelle 10–15 Karteikarten zum Lernen aus diesem Inhalt.
Antworte NUR mit einem gültigen JSON-Array (kein Markdown, kein Text davor/danach):
[
  {"front": "Begriff oder Frage", "back": "Erklärung oder Antwort"},
  ...
]
Die Karten sollen die wichtigsten Konzepte, Begriffe und Fakten abdecken.
Antworte auf Deutsch falls das Dokument auf Deutsch ist.`;
  }

  if (mode === 'summary') {
    return `Hier ist ein Dokument:

${truncated}

Erstelle eine strukturierte Lernzusammenfassung aus diesem Inhalt.
Verwende Markdown-Formatierung mit Überschriften (##, ###), Stichpunkten und **fett** für Schlüsselbegriffe.
Gliedere klar nach Themen. Extrahiere die wichtigsten Punkte.
Sei vollständig aber prägnant. Antworte auf Deutsch falls das Dokument auf Deutsch ist.`;
  }

  if (mode === 'quiz') {
    return `Hier ist ein Dokument:

${truncated}

Erstelle 8–10 Multiple-Choice-Quizfragen aus diesem Inhalt.
Antworte NUR mit einem gültigen JSON-Array (kein Markdown, kein Text davor/danach):
[
  {
    "question": "Frage?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Kurze Erklärung warum diese Antwort richtig ist."
  }
]
"correct" ist der Index (0–3) der richtigen Antwort.
Antworte auf Deutsch falls das Dokument auf Deutsch ist.`;
  }
}

// ── OpenRouter API Call ───────────────────────────────────────────────────────
async function callOpenRouter(prompt) {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://liamnoelstrub.github.io/studyai',
      'X-Title': 'StudyAI',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err.error?.message || `API Fehler ${resp.status}`;
    if (resp.status === 401) throw new Error('API Key ungültig.');
    if (resp.status === 429) throw new Error('Zu viele Anfragen. Bitte warte kurz.');
    throw new Error(msg);
  }

  const data = await resp.json();
  return data.choices[0].message.content;
}

// ── Parse & Show Results ──────────────────────────────────────────────────────
function parseAndShow(raw, mode) {
  if (mode === 'flashcards') {
    try {
      const json = extractJson(raw);
      state.flashcards = JSON.parse(json);
      if (!state.flashcards.length) throw new Error('Keine Karten');
      initFlashcards();
      showScreen('flashcards');
    } catch {
      toast('Konnte Karteikarten nicht lesen — bitte erneut versuchen', 'error');
      showScreen('upload');
    }
  } else if (mode === 'summary') {
    showSummary(raw);
    showScreen('summary');
  } else if (mode === 'quiz') {
    try {
      const json = extractJson(raw);
      state.quiz = JSON.parse(json);
      if (!state.quiz.length) throw new Error('Kein Quiz');
      initQuiz();
      showScreen('quiz');
    } catch {
      toast('Konnte Quiz nicht lesen — bitte erneut versuchen', 'error');
      showScreen('upload');
    }
  }
}

function extractJson(text) {
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON');
  return text.slice(start, end + 1);
}

// ── Flashcards ────────────────────────────────────────────────────────────────
function initFlashcards() {
  state.fcQueue   = [...state.flashcards.keys()];
  state.fcIndex   = 0;
  state.fcCorrect = 0;
  state.fcFlipped = false;
  renderFlashcard();
}

function renderFlashcard() {
  const container = $('fc-container');

  if (state.fcIndex >= state.fcQueue.length) {
    const pct = Math.round((state.fcCorrect / state.flashcards.length) * 100);
    container.innerHTML = `
      <div class="fc-result">
        <div class="score-ring">${pct}%</div>
        <h2>Runde abgeschlossen!</h2>
        <p>Du hast ${state.fcCorrect} von ${state.flashcards.length} Karten richtig beantwortet.</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
          <button class="btn-secondary" onclick="initFlashcards()">Neu starten</button>
          <button class="btn-primary" onclick="showScreen('upload')">Neue Datei</button>
        </div>
      </div>`;
    return;
  }

  const card  = state.flashcards[state.fcQueue[state.fcIndex]];
  const total = state.flashcards.length;
  const done  = state.fcIndex;
  const pct   = total > 0 ? (done / total) * 100 : 0;
  state.fcFlipped = false;

  container.innerHTML = `
    <div class="flashcard-progress">
      <span>${done + 1} / ${total}</span>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span>${state.fcCorrect} ✓</span>
    </div>

    <div class="flashcard-scene" id="fc-scene">
      <div class="flashcard" id="fc-card">
        <div class="flashcard-face front">
          <div class="card-label">Begriff</div>
          <div class="card-text">${escHtml(card.front)}</div>
          <div class="card-hint">Tippe zum Umdrehen</div>
        </div>
        <div class="flashcard-face back">
          <div class="card-label">Erklärung</div>
          <div class="card-text">${escHtml(card.back)}</div>
        </div>
      </div>
    </div>

    <div class="flashcard-actions" id="fc-actions" style="display:none">
      <button class="btn-wrong" onclick="fcAnswer(false)">✗ Nochmal</button>
      <button class="btn-secondary" onclick="fcFlip()">Zurückdrehen</button>
      <button class="btn-correct" onclick="fcAnswer(true)">✓ Gewusst</button>
    </div>
    <div id="fc-flip-hint">
      <button class="btn-primary" onclick="fcFlip()">Karte umdrehen</button>
    </div>
  `;

  $('fc-scene').addEventListener('click', fcFlip);
}

function fcFlip() {
  const card = $('fc-card');
  if (!card) return;
  state.fcFlipped = !state.fcFlipped;
  card.classList.toggle('flipped', state.fcFlipped);
  $('fc-actions').style.display = state.fcFlipped ? 'flex' : 'none';
  $('fc-flip-hint').style.display = state.fcFlipped ? 'none' : '';
}

function fcAnswer(correct) {
  if (correct) {
    state.fcCorrect++;
    state.fcIndex++;
  } else {
    const idx = state.fcQueue[state.fcIndex];
    state.fcQueue.push(idx);
    state.fcIndex++;
  }
  renderFlashcard();
}

// ── Summary ───────────────────────────────────────────────────────────────────
function showSummary(markdown) {
  $('summary-content').innerHTML = marked.parse(markdown);
}

$('summary-export').addEventListener('click', () => {
  window.print();
});

// ── Quiz ──────────────────────────────────────────────────────────────────────
function initQuiz() {
  state.quizIndex   = 0;
  state.quizScore   = 0;
  state.quizAnswered = false;
  renderQuestion();
}

function renderQuestion() {
  const body = $('quiz-body');

  if (state.quizIndex >= state.quiz.length) {
    const pct = Math.round((state.quizScore / state.quiz.length) * 100);
    body.innerHTML = `
      <div class="quiz-result">
        <div class="score-display">${state.quizScore}/${state.quiz.length}</div>
        <div class="score-label">${pct}% richtig</div>
        <div class="score-bar-wrap">
          <div class="score-bar-fill" style="width:0%" id="score-bar"></div>
        </div>
        <p style="color:var(--text-muted);margin-bottom:1.5rem">${scoreMsg(pct)}</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
          <button class="btn-secondary" onclick="initQuiz()">Quiz wiederholen</button>
          <button class="btn-primary" onclick="showScreen('upload')">Neue Datei</button>
        </div>
      </div>`;
    setTimeout(() => {
      const bar = $('score-bar');
      if (bar) bar.style.width = pct + '%';
    }, 100);
    return;
  }

  const q    = state.quiz[state.quizIndex];
  const letters = ['A','B','C','D'];
  state.quizAnswered = false;

  body.innerHTML = `
    <div class="quiz-question-card">
      <div class="quiz-q-number">Frage ${state.quizIndex + 1} von ${state.quiz.length}</div>
      <div class="quiz-q-text">${escHtml(q.question)}</div>
      <div class="quiz-options">
        ${q.options.map((opt, i) => `
          <button class="quiz-option" onclick="quizAnswer(${i})" id="opt-${i}">
            <span class="option-letter">${letters[i]}</span>
            ${escHtml(opt)}
          </button>`).join('')}
      </div>
      <div id="quiz-feedback"></div>
    </div>
    <div class="quiz-nav">
      <span style="color:var(--text-muted);font-size:0.9rem">Punkte: ${state.quizScore}</span>
    </div>
  `;
}

function quizAnswer(chosen) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;
  const q = state.quiz[state.quizIndex];
  const correct = q.correct;

  document.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.classList.add('correct');
    else if (i === chosen) btn.classList.add('wrong');
  });

  const fb = $('quiz-feedback');
  if (chosen === correct) {
    state.quizScore++;
    fb.innerHTML = `<div class="quiz-feedback correct">✓ Richtig! ${escHtml(q.explanation || '')}</div>`;
  } else {
    fb.innerHTML = `<div class="quiz-feedback wrong">✗ Falsch. Richtig wäre: <strong>${escHtml(q.options[correct])}</strong>. ${escHtml(q.explanation || '')}</div>`;
  }

  const nav = document.querySelector('.quiz-nav');
  const isLast = state.quizIndex === state.quiz.length - 1;
  nav.innerHTML += `
    <button class="btn-primary" onclick="quizNext()">
      ${isLast ? 'Ergebnis ansehen' : 'Nächste Frage'} →
    </button>`;
}

function quizNext() {
  state.quizIndex++;
  renderQuestion();
}

function scoreMsg(pct) {
  if (pct >= 90) return 'Ausgezeichnet! Du kennst das Thema sehr gut.';
  if (pct >= 70) return 'Gut gemacht! Ein paar Details noch wiederholen.';
  if (pct >= 50) return 'Nicht schlecht, aber noch Luft nach oben.';
  return 'Weitermachen! Noch mehr lernen und wiederholen.';
}

// ── Back Buttons ──────────────────────────────────────────────────────────────
document.querySelectorAll('.btn-back').forEach(btn => {
  btn.addEventListener('click', () => showScreen('upload'));
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
showScreen('upload');
