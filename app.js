// ── Constants ────────────────────────────────────────────────────────────────
const PROJECTS_KEY = 'studyai_projects';
const STREAK_KEY   = 'studyai_streak';
const STATS_KEY    = 'studyai_global_stats';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  apiKey:       localStorage.getItem('studyai_key') || '',
  file:         null,
  mode:         'flashcards',
  currentProject: null,   // loaded project being viewed
  flashcards:   [],
  fcQueue:      [],
  fcIndex:      0,
  fcCorrect:    0,
  fcFlipped:    false,
  quiz:         [],
  quizIndex:    0,
  quizScore:    0,
  quizAnswered: false,
  deleteTargetId: null,
  filterMode:   'all',
  searchQuery:  '',
};

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Screen Navigation ─────────────────────────────────────────────────────────
const SCREENS = ['dashboard','upload','loading','flashcards','summary','quiz'];

function showScreen(name) {
  SCREENS.forEach(s => {
    const el = $(`screen-${s}`);
    if (el) el.classList.remove('active');
  });
  const target = $(`screen-${name}`);
  if (target) target.classList.add('active');

  // Update nav highlight
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === name);
  });
}

function navTo(screen) {
  if (screen === 'dashboard') renderDashboard();
  showScreen(screen);
}

// Nav buttons
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    if (target === 'dashboard') renderDashboard();
    showScreen(target);
  });
});
$('logo-btn').addEventListener('click', () => navTo('dashboard'));

// Back buttons on result screens
document.querySelectorAll('.btn-back').forEach(btn => {
  btn.addEventListener('click', () => navTo('dashboard'));
});

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success', duration = 3000) {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}

// ── Greeting ──────────────────────────────────────────────────────────────────
function setGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Guten Morgen!' : h < 18 ? 'Guten Tag!' : 'Guten Abend!';
  $('greeting').textContent = greet;
}

// ── Streak Tracking ───────────────────────────────────────────────────────────
function updateStreak() {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"lastDay":"","count":0}');
  if (data.lastDay === today) return;
  data.count = (data.lastDay === yesterday) ? data.count + 1 : 1;
  data.lastDay = today;
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

function getStreak() {
  const data = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"lastDay":"","count":0}');
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (data.lastDay !== today && data.lastDay !== yesterday) return 0;
  return data.count;
}

// ── Global Stats ──────────────────────────────────────────────────────────────
function getGlobalStats() {
  return JSON.parse(localStorage.getItem(STATS_KEY) || '{"cardsLearned":0,"quizzesPlayed":0}');
}

function addStat(key, amount = 1) {
  const s = getGlobalStats();
  s[key] = (s[key] || 0) + amount;
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

// ── Projects ──────────────────────────────────────────────────────────────────
function getProjects() {
  return JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]');
}

function saveProjectToStorage(project) {
  const projects = getProjects();
  const existingIdx = projects.findIndex(p => p.id === project.id);
  if (existingIdx >= 0) {
    projects[existingIdx] = project;
  } else {
    projects.unshift(project);
  }
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function deleteProject(id) {
  const projects = getProjects().filter(p => p.id !== id);
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

function createProject(name, fileName, mode, data) {
  const modeLabels = { flashcards:'Karteikarten', summary:'Lernzettel', quiz:'Quiz' };
  const preview = mode === 'flashcards'
    ? data[0]?.front || ''
    : mode === 'quiz'
    ? data[0]?.question || ''
    : data.slice(0, 80).replace(/[#*>\-]/g, '').trim();

  return {
    id: Date.now().toString(),
    name: name || fileName.replace(/\.[^.]+$/, ''),
    fileName,
    mode,
    data,
    preview,
    createdAt: new Date().toISOString(),
    stats: { cardsLearned: 0, quizPlays: 0, bestScore: null },
  };
}

// ── Dashboard Render ──────────────────────────────────────────────────────────
function renderDashboard() {
  setGreeting();
  updateStreak();
  const projects = getProjects();
  const globalStats = getGlobalStats();

  // Stats
  animateNum($('stat-projects'), projects.length);
  animateNum($('stat-cards'),    globalStats.cardsLearned || 0);
  animateNum($('stat-quizzes'),  globalStats.quizzesPlayed || 0);
  animateNum($('stat-streak'),   getStreak());

  renderProjectGrid(projects);
}

function animateNum(el, target) {
  if (!el) return;
  let start = 0;
  const step = Math.ceil(target / 30);
  const interval = setInterval(() => {
    start = Math.min(start + step, target);
    el.textContent = start;
    if (start >= target) clearInterval(interval);
  }, 20);
}

function renderProjectGrid(projects) {
  const grid       = $('project-grid');
  const emptyState = $('empty-state');
  const query      = state.searchQuery.toLowerCase();
  const filter     = state.filterMode;

  let filtered = projects.filter(p => {
    const matchFilter = filter === 'all' || p.mode === filter;
    const matchSearch = !query || p.name.toLowerCase().includes(query) || p.fileName.toLowerCase().includes(query);
    return matchFilter && matchSearch;
  });

  if (filtered.length === 0) {
    grid.style.display = 'none';
    emptyState.style.display = '';
    emptyState.querySelector('h3').textContent = projects.length === 0
      ? 'Noch keine Projekte'
      : 'Keine Projekte gefunden';
    emptyState.querySelector('p').textContent = projects.length === 0
      ? 'Lade deine erste Datei hoch und die KI erstellt sofort Lernmaterial.'
      : 'Versuche eine andere Suche oder einen anderen Filter.';
    return;
  }

  grid.style.display = '';
  emptyState.style.display = 'none';

  const modeLabel = { flashcards:'🗂️ Karteikarten', summary:'📝 Lernzettel', quiz:'🎯 Quiz' };
  const modeIcon  = { flashcards:'🗂️', summary:'📝', quiz:'🎯' };

  grid.innerHTML = filtered.map(p => {
    const date = new Date(p.createdAt).toLocaleDateString('de-DE', { day:'2-digit', month:'short', year:'numeric' });
    const statsHtml = p.mode === 'flashcards'
      ? `<span class="project-stat">🗂️ ${Array.isArray(p.data) ? p.data.length : 0} Karten</span>`
      : p.mode === 'quiz'
      ? `<span class="project-stat">🎯 ${Array.isArray(p.data) ? p.data.length : 0} Fragen${p.stats.bestScore !== null ? ` · Beste: ${p.stats.bestScore}%` : ''}</span>`
      : `<span class="project-stat">📝 Zusammenfassung</span>`;

    return `
      <div class="project-card" data-mode="${p.mode}" data-id="${p.id}">
        <div class="project-card-header">
          <span class="project-mode-badge">${modeLabel[p.mode]}</span>
        </div>
        <div class="project-name">${escHtml(p.name)}</div>
        <div class="project-file">📄 ${escHtml(p.fileName)}</div>
        ${p.preview ? `<div class="project-preview">${escHtml(p.preview)}</div>` : ''}
        <div class="project-stats-row">${statsHtml}</div>
        <div class="project-footer">
          <div class="project-date">${date}</div>
          <div class="project-actions">
            <button class="btn-open" onclick="openProject('${p.id}')">Öffnen →</button>
            <button class="btn-delete-sm" onclick="confirmDelete('${p.id}')" title="Löschen">🗑</button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Stagger animation
  grid.querySelectorAll('.project-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(12px)';
    setTimeout(() => {
      card.style.transition = 'opacity .3s, transform .3s';
      card.style.opacity = '1';
      card.style.transform = '';
    }, i * 60);
  });
}

// Search & Filter
$('search-input').addEventListener('input', e => {
  state.searchQuery = e.target.value;
  renderProjectGrid(getProjects());
});

document.querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filterMode = btn.dataset.filter;
    renderProjectGrid(getProjects());
  });
});

// ── Open Project ──────────────────────────────────────────────────────────────
function openProject(id) {
  const project = getProjects().find(p => p.id === id);
  if (!project) return;
  state.currentProject = project;
  state.mode = project.mode;

  if (project.mode === 'flashcards') {
    state.flashcards = project.data;
    initFlashcards();
    showScreen('flashcards');
  } else if (project.mode === 'summary') {
    showSummary(project.data);
    showScreen('summary');
  } else if (project.mode === 'quiz') {
    state.quiz = project.data;
    initQuiz();
    showScreen('quiz');
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
function confirmDelete(id) {
  state.deleteTargetId = id;
  $('delete-backdrop').classList.add('open');
}

$('delete-cancel').addEventListener('click', () => {
  $('delete-backdrop').classList.remove('open');
  state.deleteTargetId = null;
});

$('delete-confirm').addEventListener('click', () => {
  if (state.deleteTargetId) {
    deleteProject(state.deleteTargetId);
    $('delete-backdrop').classList.remove('open');
    state.deleteTargetId = null;
    renderDashboard();
    toast('Projekt gelöscht', 'info');
  }
});

// ── API Key Modal ─────────────────────────────────────────────────────────────
$('api-key-btn').addEventListener('click', () => {
  $('api-key-input').value = state.apiKey;
  $('modal-backdrop').classList.add('open');
});
$('modal-cancel').addEventListener('click', () => $('modal-backdrop').classList.remove('open'));
$('modal-backdrop').addEventListener('click', e => {
  if (e.target === $('modal-backdrop')) $('modal-backdrop').classList.remove('open');
});
$('modal-save').addEventListener('click', () => {
  const key = $('api-key-input').value.trim();
  if (!key.startsWith('sk-ant-')) {
    toast('Ungültiger Key — muss mit sk-ant- beginnen', 'error');
    return;
  }
  state.apiKey = key;
  localStorage.setItem('studyai_key', key);
  $('modal-backdrop').classList.remove('open');
  updateApiBtn();
  toast('API Key gespeichert ✓');
});

function updateApiBtn() {
  const btn = $('api-key-btn');
  if (state.apiKey) {
    btn.textContent = '✓ API Key';
    btn.classList.add('active');
  } else {
    btn.textContent = '🔑 API Key';
    btn.classList.remove('active');
  }
}
updateApiBtn();

// ── File Upload ───────────────────────────────────────────────────────────────
const uploadZone = $('upload-zone');
const fileInput  = $('file-input');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  const allowed = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','image/jpeg','image/png','image/gif','image/webp'
  ];
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
    <button class="btn-remove" title="Entfernen">✕</button>`;
  $('file-preview').style.display = 'flex';
  uploadZone.style.display = 'none';

  // Pre-fill project name
  const nameInput = $('project-name-input');
  nameInput.value = file.name.replace(/\.[^.]+$/, '');
  $('project-name-wrap').style.display = '';

  $('file-preview').querySelector('.btn-remove').addEventListener('click', clearFile);
  updateAnalyzeBtn();
}

function clearFile() {
  state.file = null;
  $('file-preview').style.display = 'none';
  $('project-name-wrap').style.display = 'none';
  uploadZone.style.display = '';
  fileInput.value = '';
  updateAnalyzeBtn();
}

// ── Mode Selection ────────────────────────────────────────────────────────────
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

// ── Analyze ───────────────────────────────────────────────────────────────────
$('analyze-btn').addEventListener('click', async () => {
  if (!state.file) return;
  if (!state.apiKey) {
    toast('Bitte zuerst den API Key eingeben', 'error');
    $('api-key-btn').click();
    return;
  }
  updateStreak();
  await analyzeFile();
});

async function analyzeFile() {
  showScreen('loading');
  animateLoadingSteps();

  try {
    const content = await buildMessageContent(state.file);
    const prompt  = buildPrompt(state.mode);
    const result  = await callClaude(content, prompt);
    parseAndShow(result, state.mode);
  } catch (err) {
    showScreen('upload');
    toast(err.message || 'Fehler beim Analysieren', 'error', 5000);
    console.error(err);
  }
}

function animateLoadingSteps() {
  const steps = ['step-1','step-2','step-3'];
  steps.forEach(id => {
    const el = $(id);
    if (el) { el.classList.remove('active','done'); }
  });
  let i = 0;
  const tick = () => {
    if (i >= steps.length) return;
    if (i > 0) $(steps[i-1]).classList.replace('active','done');
    $(steps[i]).classList.add('active');
    i++;
    if (i < steps.length) setTimeout(tick, 1800);
  };
  setTimeout(tick, 300);
}

// ── File → API Content ────────────────────────────────────────────────────────
async function buildMessageContent(file) {
  if (file.type.startsWith('image/')) {
    const b64 = await fileToBase64(file);
    return [
      { type: 'image', source: { type: 'base64', media_type: file.type, data: b64 } },
      { type: 'text', text: 'Analysiere den Inhalt dieses Bildes/Dokuments.' }
    ];
  }
  if (file.type === 'application/pdf') {
    const b64 = await fileToBase64(file);
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
      { type: 'text', text: 'Analysiere den Inhalt dieses Dokuments.' }
    ];
  }
  const text = await fileToText(file);
  return [{ type: 'text', text: `Dokumentinhalt:\n\n${text}` }];
}

const fileToBase64 = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload  = () => res(r.result.split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(file);
});

const fileToText = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload  = () => res(r.result);
  r.onerror = rej;
  r.readAsText(file, 'utf-8');
});

// ── Prompts ───────────────────────────────────────────────────────────────────
function buildPrompt(mode) {
  if (mode === 'flashcards') return `
Erstelle aus dem Dokumentinhalt 10–15 Lern-Karteikarten.
Antworte NUR mit einem validen JSON-Array, kein anderer Text:
[{"front":"Begriff oder Frage","back":"Erklärung oder Antwort"},...]
Decke die wichtigsten Konzepte und Fakten ab. Antworte auf Deutsch wenn das Dokument auf Deutsch ist.`;

  if (mode === 'summary') return `
Erstelle eine strukturierte Lernzusammenfassung des Dokuments mit Markdown.
Nutze ## und ### Überschriften, - Aufzählungen und **fett** für Schlüsselbegriffe.
Gliedere klar, extrahiere Schlüsselpunkte, sei vollständig aber prägnant.
Antworte auf Deutsch wenn das Dokument auf Deutsch ist.`;

  if (mode === 'quiz') return `
Erstelle 8–10 Multiple-Choice Quizfragen aus dem Dokument.
Antworte NUR mit einem validen JSON-Array, kein anderer Text:
[{"question":"Frage?","options":["A","B","C","D"],"correct":0,"explanation":"Kurze Begründung."},...]
"correct" ist der 0-basierte Index der richtigen Antwort.
Antworte auf Deutsch wenn das Dokument auf Deutsch ist.`;
}

// ── Claude API ────────────────────────────────────────────────────────────────
async function callClaude(contentArr, systemPrompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: contentArr }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg = err.error?.message || `API Fehler ${resp.status}`;
    if (resp.status === 401) throw new Error('Ungültiger API Key.');
    if (resp.status === 429) throw new Error('API Limit erreicht – kurz warten.');
    throw new Error(msg);
  }
  return (await resp.json()).content[0].text;
}

// ── Parse & Display ───────────────────────────────────────────────────────────
function parseAndShow(raw, mode) {
  const projectName = $('project-name-input').value.trim() || state.file?.name.replace(/\.[^.]+$/,'') || 'Projekt';
  const fileName    = state.file?.name || 'unbekannt';

  if (mode === 'flashcards') {
    try {
      state.flashcards = JSON.parse(extractJson(raw));
      if (!state.flashcards.length) throw new Error();
      const project = createProject(projectName, fileName, 'flashcards', state.flashcards);
      saveProjectToStorage(project);
      state.currentProject = project;
      initFlashcards();
      showScreen('flashcards');
      toast('Karteikarten erstellt & gespeichert ✓');
    } catch { toast('Fehler beim Lesen der Karteikarten', 'error'); showScreen('upload'); }

  } else if (mode === 'summary') {
    const project = createProject(projectName, fileName, 'summary', raw);
    saveProjectToStorage(project);
    state.currentProject = project;
    showSummary(raw);
    showScreen('summary');
    toast('Lernzettel erstellt & gespeichert ✓');

  } else if (mode === 'quiz') {
    try {
      state.quiz = JSON.parse(extractJson(raw));
      if (!state.quiz.length) throw new Error();
      const project = createProject(projectName, fileName, 'quiz', state.quiz);
      saveProjectToStorage(project);
      state.currentProject = project;
      initQuiz();
      showScreen('quiz');
      toast('Quiz erstellt & gespeichert ✓');
    } catch { toast('Fehler beim Lesen des Quiz', 'error'); showScreen('upload'); }
  }
}

function extractJson(text) {
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('No JSON');
  return text.slice(s, e + 1);
}

// ── Flashcards ────────────────────────────────────────────────────────────────
function initFlashcards() {
  state.fcQueue   = [...state.flashcards.keys()];
  state.fcIndex   = 0;
  state.fcCorrect = 0;
  state.fcFlipped = false;
  renderFlashcard();
}

// Shuffle button
$('fc-shuffle-btn').addEventListener('click', () => {
  state.fcQueue = state.fcQueue.sort(() => Math.random() - .5);
  state.fcIndex = 0;
  toast('Karten gemischt 🔀', 'info');
  renderFlashcard();
});

function renderFlashcard() {
  const container = $('fc-container');
  if (!container) return;

  if (state.fcIndex >= state.fcQueue.length) {
    const total = state.flashcards.length;
    const pct   = Math.round((state.fcCorrect / total) * 100);

    // Save stats
    addStat('cardsLearned', state.fcCorrect);
    if (state.currentProject) {
      state.currentProject.stats.cardsLearned += state.fcCorrect;
      saveProjectToStorage(state.currentProject);
    }

    const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '👍' : '💪';
    container.innerHTML = `
      <div class="fc-result">
        <div class="score-ring">${pct}%</div>
        <h2>${emoji} Runde abgeschlossen!</h2>
        <p>${state.fcCorrect} von ${total} Karten gewusst.</p>
        <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;margin-top:.5rem">
          <button class="btn-secondary" onclick="initFlashcards()">🔄 Nochmal</button>
          <button class="btn-primary" onclick="navTo('dashboard')">🏠 Übersicht</button>
        </div>
      </div>`;
    return;
  }

  const card = state.flashcards[state.fcQueue[state.fcIndex]];
  const done = state.fcIndex;
  const total = state.flashcards.length;
  const pct  = (done / total) * 100;
  state.fcFlipped = false;

  container.innerHTML = `
    <div class="flashcard-progress">
      <span>${done + 1} / ${total}</span>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span style="color:var(--success)">${state.fcCorrect} ✓</span>
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

    <div id="fc-actions" style="display:none" class="flashcard-actions">
      <button class="btn-wrong"    onclick="fcAnswer(false)">✗ Nochmal</button>
      <button class="btn-secondary" onclick="fcFlip()">↩ Zurück</button>
      <button class="btn-correct"  onclick="fcAnswer(true)">✓ Gewusst</button>
    </div>
    <div id="fc-flip-hint">
      <button class="btn-primary" onclick="fcFlip()">Karte umdrehen</button>
    </div>`;

  $('fc-scene').addEventListener('click', fcFlip);
}

function fcFlip() {
  const card = $('fc-card');
  if (!card) return;
  state.fcFlipped = !state.fcFlipped;
  card.classList.toggle('flipped', state.fcFlipped);
  $('fc-actions').style.display  = state.fcFlipped ? 'flex' : 'none';
  $('fc-flip-hint').style.display = state.fcFlipped ? 'none' : '';
}

function fcAnswer(correct) {
  if (correct) {
    state.fcCorrect++;
    state.fcIndex++;
  } else {
    state.fcQueue.push(state.fcQueue[state.fcIndex]);
    state.fcIndex++;
  }
  renderFlashcard();
}

// ── Summary ───────────────────────────────────────────────────────────────────
function showSummary(markdown) {
  $('summary-content').innerHTML = marked.parse(markdown);
}
$('summary-export').addEventListener('click', () => window.print());

// ── Quiz ──────────────────────────────────────────────────────────────────────
function initQuiz() {
  state.quizIndex   = 0;
  state.quizScore   = 0;
  state.quizAnswered = false;
  if ($('quiz-score-hdr')) $('quiz-score-hdr').textContent = '0';
  renderQuestion();
}

function renderQuestion() {
  const body = $('quiz-body');
  if (!body) return;

  if (state.quizIndex >= state.quiz.length) {
    const total = state.quiz.length;
    const pct   = Math.round((state.quizScore / total) * 100);

    // Save stats
    addStat('quizzesPlayed');
    if (state.currentProject) {
      state.currentProject.stats.quizPlays++;
      const prev = state.currentProject.stats.bestScore;
      if (prev === null || pct > prev) state.currentProject.stats.bestScore = pct;
      saveProjectToStorage(state.currentProject);
    }

    body.innerHTML = `
      <div class="quiz-result">
        <div class="score-display">${state.quizScore}/${total}</div>
        <div class="score-label">${pct}% richtig · ${scoreMsg(pct)}</div>
        <div class="score-bar-wrap" style="margin:.75rem auto">
          <div class="score-bar-fill" style="width:0%" id="score-bar"></div>
        </div>
        <div style="display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;margin-top:1rem">
          <button class="btn-secondary" onclick="initQuiz()">🔄 Wiederholen</button>
          <button class="btn-primary" onclick="navTo('dashboard')">🏠 Übersicht</button>
        </div>
      </div>`;
    setTimeout(() => {
      const bar = $('score-bar');
      if (bar) bar.style.width = pct + '%';
    }, 100);
    return;
  }

  const q = state.quiz[state.quizIndex];
  const letters = ['A','B','C','D'];
  state.quizAnswered = false;

  body.innerHTML = `
    <div class="quiz-question-card">
      <div class="quiz-q-number">Frage ${state.quizIndex + 1} von ${state.quiz.length}</div>
      <div class="quiz-q-text">${escHtml(q.question)}</div>
      <div class="quiz-options">
        ${q.options.map((opt,i) => `
          <button class="quiz-option" onclick="quizAnswer(${i})" id="opt-${i}">
            <span class="option-letter">${letters[i]}</span>
            ${escHtml(opt)}
          </button>`).join('')}
      </div>
      <div id="quiz-feedback"></div>
    </div>
    <div class="quiz-nav">
      <span style="color:var(--text-muted);font-size:.875rem">Punkte: <strong>${state.quizScore}</strong></span>
    </div>`;
}

function quizAnswer(chosen) {
  if (state.quizAnswered) return;
  state.quizAnswered = true;
  const q = state.quiz[state.quizIndex];

  document.querySelectorAll('.quiz-option').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correct) btn.classList.add('correct');
    else if (i === chosen) btn.classList.add('wrong');
  });

  const fb = $('quiz-feedback');
  if (chosen === q.correct) {
    state.quizScore++;
    fb.innerHTML = `<div class="quiz-feedback correct">✓ Richtig! ${escHtml(q.explanation || '')}</div>`;
  } else {
    fb.innerHTML = `<div class="quiz-feedback wrong">✗ Falsch. Richtig: <strong>${escHtml(q.options[q.correct])}</strong>. ${escHtml(q.explanation || '')}</div>`;
  }

  if ($('quiz-score-hdr')) $('quiz-score-hdr').textContent = state.quizScore;

  const nav = document.querySelector('.quiz-nav');
  const isLast = state.quizIndex === state.quiz.length - 1;
  nav.innerHTML += `<button class="btn-primary" onclick="quizNext()">${isLast ? 'Ergebnis ansehen' : 'Nächste Frage'} →</button>`;
}

function quizNext() {
  state.quizIndex++;
  renderQuestion();
}

function scoreMsg(pct) {
  if (pct >= 90) return 'Ausgezeichnet! 🌟';
  if (pct >= 70) return 'Gut gemacht! 👍';
  if (pct >= 50) return 'Fast da! 💪';
  return 'Weitermachen! 📚';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
renderDashboard();
showScreen('dashboard');
