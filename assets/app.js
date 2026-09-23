/* РД 32 ЦВ 169-2017 — технический справочник. Логика интерфейса. */
const D = window.RD_DATA;

const I = window.INSTR_DATA, ilines = I.text.split('\n');
let activeI = 0, bodyMode = null;
const iRange = i => [I.sections[i].line, i + 1 < I.sections.length ? I.sections[i + 1].line : ilines.length];
const iLabel = i => (I.sections[i].num ? I.sections[i].num + '. ' : '') + I.sections[i].title;

const nav = document.getElementById('sectionNav'),
      content = document.getElementById('content'),
      search = document.getElementById('search'),
      sideSearch = document.getElementById('sideSearch'),
      results = document.getElementById('results'),
      crumbs = document.getElementById('crumbs'),
      searchScope = document.getElementById('searchScope');

const lines = D.text.split('\n');
let active = 0, fontScale = parseFloat(localStorage.getItem('rd_font') || '1') || 1, currentView = 'overview';
let openGroups = {};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sectionRange = i => { const a = D.sections[i].line, b = i + 1 < D.sections.length ? D.sections[i + 1].line : lines.length; return [a, b]; };
const mark = (text, q) => { if (!q) return esc(text); const safe = esc(text), re = new RegExp(escapeRegExp(q), 'gi'); return safe.replace(re, m => `<mark>${m}</mark>`); };
function sectionForLine(line) { let idx = 0; for (let i = 0; i < D.sections.length; i++) { if (D.sections[i].line <= line) idx = i; else break; } return idx; }

/* ================================================================
   ХРАНИЛИЩЕ (закладки / заметки / история) — только в этом браузере
   ================================================================ */
function lsGet(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
const getBookmarks = () => lsGet('rd_bookmarks', {});
const setBookmarks = v => lsSet('rd_bookmarks', v);
const getNotes = () => lsGet('rd_notes', {});
const setNotes = v => lsSet('rd_notes', v);
const getHistory = () => lsGet('rd_history', []);
const setHistory = v => lsSet('rd_history', v);

function pushHistory(i) {
  let h = getHistory().filter(x => x.section !== i);
  h.unshift({ section: i, num: D.sections[i].num, title: D.sections[i].title, ts: Date.now() });
  if (h.length > 40) h = h.slice(0, 40);
  setHistory(h);
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ================================================================
   ПЕРЕКРЁСТНЫЕ ССЫЛКИ В ТЕКСТЕ (ГОСТ/РД/ТК/формы/модели/разделы/пункты)
   ================================================================ */
const SECTION_BY_NUM = {};
D.sections.forEach((s, i) => { if (s.num) SECTION_BY_NUM[s.num] = i; });
const APPENDIX_BY_LETTER = {};
D.sections.forEach((s, i) => { const m = s.title.match(/^Приложение\s+([А-ЯЁ])/i); if (m) APPENDIX_BY_LETTER[m[1].toUpperCase()] = i; });

const CODE_MAP = {}; // code -> {line}
const CODE_LIKE = /^[A-ZА-ЯЁ0-9\s\-.\/№]{3,25}$/; // отсекает мусор, случайно попавший в поле кода
const CODE_EXCLUDE = new Set(['РД 32', 'РД', 'ЦВ', 'ГОСТ', 'ТУ', 'ТК']); // самоссылки/обрезки, не настоящие коды
[D.norms, D.forms, D.models].forEach(list => {
  list.forEach(x => {
    const code = (x.code || '').trim();
    if (code.length >= 5 && CODE_LIKE.test(code) && !CODE_EXCLUDE.has(code) && !(code in CODE_MAP)) CODE_MAP[code] = { line: x.line };
  });
});

let CHANGE_LOG_START = lines.findIndex(l => /ЛИСТ РЕГИСТРАЦИИ ИЗМЕНЕНИЙ/i.test(l));
if (CHANGE_LOG_START < 0) CHANGE_LOG_START = lines.length;

const POINT_LINE_MAP = {}; // "7.4.2" -> 0-based line index of its heading
lines.forEach((raw, i) => {
  const t = raw.trim();
  const m = t.match(/^(\d{1,2}(?:\.\d+){1,4})\s+(.{3,})$/);
  if (m && !(m[1] in POINT_LINE_MAP)) POINT_LINE_MAP[m[1]] = i;
});

let XREF_REGEX = null;
try {
  const codeAlt = Object.keys(CODE_MAP).map(escapeRegExp).sort((a, b) => b.length - a.length).join('|');
  const boundary = '[\\wа-яёА-ЯЁ]';
  const parts = [];
  if (codeAlt) parts.push(`(?<!${boundary})(?<code>${codeAlt})(?!${boundary})`);
  parts.push('(?<section>раздел[а-яё]*\\s+№?\\s?\\d{1,2}(?!\\.\\d))');
  parts.push('(?<appendix>приложени[а-яё]*\\s+№?\\s?[А-ЯЁ](?![а-яёА-ЯЁ\\w]))');
  parts.push('(?<point>п\\.?\\s?\\d{1,2}(?:\\.\\d+){1,4})');
  XREF_REGEX = new RegExp(parts.join('|'), 'gi');
} catch (e) { XREF_REGEX = null; }

function linkify(html) {
  if (!XREF_REGEX) return html;
  try {
    return html.replace(XREF_REGEX, (match, ...rest) => {
      const groups = rest[rest.length - 1] || {};
      if (groups.code && CODE_MAP[groups.code]) return `<a class="xref xref-norm" data-line="${CODE_MAP[groups.code].line}">${match}</a>`;
      if (groups.section) {
        const num = (match.match(/\d{1,2}/) || [])[0];
        const idx = num != null ? SECTION_BY_NUM[num] : undefined;
        if (idx != null) return `<a class="xref" data-section="${idx}">${match}</a>`;
      }
      if (groups.appendix) {
        const letter = (match.match(/[А-ЯЁ]$/i) || [])[0];
        const idx = letter != null ? APPENDIX_BY_LETTER[letter.toUpperCase()] : undefined;
        if (idx != null) return `<a class="xref" data-section="${idx}">${match}</a>`;
      }
      if (groups.point) {
        const num = (match.match(/\d{1,2}(?:\.\d+){1,4}/) || [])[0];
        const ln = num ? POINT_LINE_MAP[num] : undefined;
        if (ln != null) return `<a class="xref" data-line="${ln + 1}">${match}</a>`;
      }
      return match;
    });
  } catch (e) { return html; }
}

/* ================================================================
   НАВИГАЦИЯ (боковое меню)
   ================================================================ */
const RD_GROUPS = [
  { key: 'sub0', label: 'Общие положения', range: [0, 4] },
  { key: 'sub1', label: 'Ремонт узлов и систем', range: [4, 9] },
  { key: 'sub2', label: 'Ремонт по типам вагонов', range: [9, 15] },
  { key: 'sub3', label: 'Приёмка и документооборот', range: [15, 18] },
  { key: 'sub4', label: 'Приложения', range: [18, D.sections.length] },
];
const DOC_EXTRA_VIEWS = [
  { view: 'glossary', label: 'Глоссарий сокращений', icon: 'AB' },
];
const PERSONAL_VIEWS = [
  { view: 'favorites', label: 'Избранное', icon: '★' },
  { view: 'notes', label: 'Мои заметки', icon: '✎' },
];

function navButton(label, view, icon = '') {
  return `<button class="side-nav ${currentView === view ? 'active' : ''}" data-view="${view}"><span class="side-icon">${icon}</span><span>${esc(label)}</span></button>`;
}
function renderNav() {
  let html = '';
  html += navButton('Главная', 'overview', '⌂');
  html += `<div class="nav-group">Быстрый доступ</div>`;
  html += navButton('Памятка осмотрщика', 'pamyatka', '✓') + DOC_EXTRA_VIEWS.map(v => navButton(v.label, v.view, v.icon)).join('') + navButton('Рисунки и схемы', 'figures', '▧');
  html += `<div class="nav-group">РД 32 ЦВ 169-2017 · ремонт</div>`;
  RD_GROUPS.forEach(g => {
    const isOpen = !!openGroups[g.key];
    const containsActive = currentView === 'section' && active >= g.range[0] && active < g.range[1];
    html += `<button class="nav-toggle ${isOpen ? 'open' : ''}" data-group="${g.key}"><span class="side-icon">${containsActive ? '●' : '○'}</span><span>${esc(g.label)}</span><span class="chev">▸</span></button>`;
    html += `<div class="nav-sub ${isOpen ? 'open' : ''}" data-sub="${g.key}">`;
    for (let i = g.range[0]; i < g.range[1]; i++) {
      const s = D.sections[i];
      html += `<button class="nav-btn ${currentView === 'section' && active === i ? 'active' : ''}" data-i="${i}"><span class="nav-num">${esc(s.num || '•')}</span><span>${esc(s.title)}</span></button>`;
    }
    html += `</div>`;
  });

  html += `<div class="nav-group">Инструкция по ТО вагонов</div>`;
  I.groups.forEach((g, gi) => {
    const key = 'isub' + gi, isOpen = !!openGroups[key], has = currentView === 'instr' && activeI >= g.range[0] && activeI < g.range[1];
    html += `<button class="nav-toggle ${isOpen ? 'open' : ''}" data-group="${key}"><span class="side-icon">${has ? '●' : '○'}</span><span>${esc(g.label)}</span><span class="chev">▸</span></button><div class="nav-sub ${isOpen ? 'open' : ''}" data-sub="${key}">`;
    for (let i = g.range[0]; i < g.range[1]; i++) html += `<button class="nav-btn ${currentView === 'instr' && activeI === i ? 'active' : ''}" data-ii="${i}"><span class="nav-num">${esc(I.sections[i].num || '•')}</span><span>${esc(I.sections[i].title)}</span></button>`;
    html += `</div>`;
  });

  html += `<div class="nav-group">Моё</div>` + navButton('Избранное', 'favorites', '★') + navButton('Мои заметки', 'notes', '✎');
  document.querySelector('.hero').classList.toggle('hidden', currentView !== 'overview');
  nav.innerHTML = html;
  nav.querySelectorAll('.nav-btn[data-ii]').forEach(b => b.onclick = () => showInstr(+b.dataset.ii));
  nav.querySelectorAll('.side-nav').forEach(b => b.onclick = () => showView(b.dataset.view));
  nav.querySelectorAll('.nav-btn[data-i]').forEach(b => b.onclick = () => showSection(+b.dataset.i));
  nav.querySelectorAll('.nav-toggle').forEach(b => b.onclick = () => { openGroups[b.dataset.group] = !openGroups[b.dataset.group]; renderNav(); });
}

/* ================================================================
   РЕНДЕР ТЕКСТА РАЗДЕЛА
   ================================================================ */
function noteBoxHtml(anchorId) {
  const n = getNotes()[anchorId];
  if (!n) return '';
  return `<div class="note-box" data-anchor="${anchorId}"><div class="note-label">Моя заметка <span class="note-close" title="Скрыть">✕</span></div><textarea class="note-text" data-anchor="${anchorId}" placeholder="Заметка...">${esc(n.text)}</textarea></div>`;
}

function renderBody(arr) {
  let html = '', para = [], pre = [];
  const bookmarks = getBookmarks();
  const flushPara = () => { if (para.length) { const t = para.join(' ').replace(/\s+/g, ' ').trim(); if (t) html += `<p>${esc(t)}</p>`; para = []; } };
  const flushPre = () => { if (pre.length) { html += `<pre class="source-table">${esc(pre.join('\n'))}</pre>`; pre = []; } };
  for (const raw of arr) {
    let line = raw.replace(/\f/g, '').replace(/\s+$/, ''); const t = line.trim();
    if (!t || /e-ecolog\.ru\/docs/i.test(t)) { flushPre(); flushPara(); continue; }
    const sub = t.match(/^(\d+(?:\.\d+){1,4})\s+(.{3,})$/), table = t.match(/^Таблица\s+([\dА-ЯЁA-Z.\-]+)/i), app = t.match(/^Приложение\s+[А-ЯЁA-Z]+/i), fig = t.match(/^Рисунок\s+/i);
    if (sub && !/^\d+\s/.test(t)) {
      flushPre(); flushPara();
      const anchorId = (bodyMode === 'instr' ? 'i-' : 'p-') + sub[1].replace(/\./g, '-');
      const bmOn = bookmarks[anchorId] ? 'on' : '';
      html += `<h3 id="${anchorId}"><span>${esc(sub[1])}</span> ${esc(sub[2])}${bodyMode === 'instr' ? '' : '<span class="h3-tools">'}` +
        `<button class="h3-tool bookmark-btn ${bmOn}" data-anchor="${anchorId}" title="В избранное">★</button>` +
        `<button class="h3-tool note-btn" data-anchor="${anchorId}" title="Добавить заметку">✎</button>` +
        `<button class="h3-tool link-btn" data-point="${esc(sub[1])}" title="Скопировать ссылку на пункт">🔗</button>` +
        `${bodyMode === 'instr' ? '' : '</span>'}</h3>`;
      continue;
    }
    if (table || app || fig) { flushPre(); flushPara(); html += `<div class="document-label ${app ? 'appendix-title' : ''}">${esc(t)}</div>`; continue; }
    const looksTable = /\s{3,}/.test(line) || /^\s*\d+[.)]?\s+/.test(line) || /^\s*[—–-]\s+/.test(line);
    if (looksTable) { flushPara(); pre.push(line); continue; }
    if (pre.length) flushPre();
    para.push(t);
  }
  flushPre(); flushPara();
  if (!html) return '<p class="empty">Содержимое раздела отсутствует в текстовом представлении.</p>';
  if (bodyMode !== 'instr') html = linkify(html); // безопасно: заметок(textarea) в html ещё нет
  if (bodyMode !== 'instr') html = html.replace(/(<h3 id="([^"]+)">[\s\S]*?<\/h3>)/g, (m, full, anchorId) => full + noteBoxHtml(anchorId));
  return html;
}
function subsectionIndex(arr) { return arr.map((x, i) => { const t = x.trim(), m = t.match(/^(\d+(?:\.\d+){1,4})\s+(.{3,})$/); return m ? { n: m[1], title: m[2], line: i } : null; }).filter(Boolean).filter(x => x.n.split('.').length >= 2).slice(0, 100); }

function setCrumbs(...parts) {
  crumbs.innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<strong>${esc(p)}</strong>` : `<span>${esc(p)}</span><i>/</i>`).join('');
}

/* ================================================================
   ПРОСМОТР РАЗДЕЛА (текст + пейджер + доп. действия)
   ================================================================ */
function showSection(i, opts = {}) {
  currentView = 'section'; active = i;
  const g = RD_GROUPS.find(g => i >= g.range[0] && i < g.range[1]);
  if (g) openGroups[g.key] = true;
  renderNav();
  const [a, b] = sectionRange(i), arr = lines.slice(a, b), subs = subsectionIndex(arr);
  const wordCount = arr.join(' ').split(/\s+/).filter(Boolean).length;
  const readMin = Math.max(1, Math.round(wordCount / 180));
  const outline = subs.length ? `<div class="outline"><div class="outline-title">Пункты раздела</div>${subs.map(s => `<button onclick="document.getElementById('p-${s.n.replace(/\./g, '-')}')?.scrollIntoView({behavior:'smooth',block:'start'})"><b>${esc(s.n)}</b> ${esc(s.title)}</button>`).join('')}</div>` : '';
  setCrumbs('РД 32 ЦВ 169-2017', 'Разделы', D.sections[i].num ? `${D.sections[i].num}. ${D.sections[i].title}` : D.sections[i].title);

  const prevIdx = i > 0 ? i - 1 : null, nextIdx = i < D.sections.length - 1 ? i + 1 : null;
  const pagerLabel = idx => esc((D.sections[idx].num ? D.sections[idx].num + '. ' : '') + D.sections[idx].title);
  const pagerHtml = `<div class="section-pager">
    <button class="pager-btn prev ${prevIdx == null ? 'disabled' : ''}" ${prevIdx != null ? `onclick="showSection(${prevIdx})"` : ''}><span class="pager-label">← Предыдущий</span>${prevIdx != null ? `<b>${pagerLabel(prevIdx)}</b>` : ''}</button>
    <button class="pager-btn next ${nextIdx == null ? 'disabled' : ''}" ${nextIdx != null ? `onclick="showSection(${nextIdx})"` : ''}><span class="pager-label">Следующий →</span>${nextIdx != null ? `<b>${pagerLabel(nextIdx)}</b>` : ''}</button>
  </div>`;

  content.innerHTML = `<div class="view-title"><div><div class="eyebrow">РАЗДЕЛ ДОКУМЕНТА</div><h2>${esc(D.sections[i].title)}</h2><p>${b - a} строк исходного текста · строка начала ${a + 1}</p></div><button class="back-btn" onclick="showView('overview')">← Главная</button></div>` +
    `<article class="section-card"><div class="section-head"><span class="num">${esc(D.sections[i].num || '—')}</span><div><div class="section-kicker">РД 32 ЦВ 169-2017</div><h3>${esc(D.sections[i].title)}</h3></div><span class="section-size">${b - a} строк</span></div>` +
    `<div class="section-actions"><span class="readtime">≈ ${readMin} мин чтения · ${wordCount} слов</span><button class="mini-btn" onclick="printSection()">🖶 Печать</button><button class="mini-btn" onclick="exportSectionTxt(${i})">⬇ Экспорт .txt</button></div>` +
    `${outline}<div class="rich-text">${renderBody(arr)}</div><details class="raw"><summary>Показать исходное форматирование</summary><pre>${esc(arr.join('\n'))}</pre></details></article>` +
    pagerHtml;

  results.classList.add('hidden'); content.classList.remove('hidden');
  if (!opts.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebarMobile();
  if (!opts.noHash) setHash('section/' + i);
}

function showInstr(i, opts = {}) {
  currentView = 'instr'; activeI = i;
  const gi = I.groups.findIndex(g => i >= g.range[0] && i < g.range[1]); if (gi >= 0) openGroups['isub' + gi] = true;
  renderNav();
  const [a, b] = iRange(i), arr = ilines.slice(a, b), sec = I.sections[i];
  const words = arr.join(' ').split(/\s+/).filter(Boolean).length, readMin = Math.max(1, Math.round(words / 180));
  const subs = subsectionIndex(arr);
  const outline = subs.length ? `<div class="outline"><div class="outline-title">Пункты раздела</div>${subs.map(s => `<button onclick="document.getElementById('i-${s.n.replace(/\./g, '-')}')?.scrollIntoView({behavior:'smooth',block:'start'})"><b>${esc(s.n)}</b> ${esc(s.title)}</button>`).join('')}</div>` : '';
  setCrumbs('Инструкция по ТО вагонов', iLabel(i));
  const pv = i > 0 ? i - 1 : null, nx = i < I.sections.length - 1 ? i + 1 : null;
  const pager = `<div class="section-pager"><button class="pager-btn prev ${pv == null ? 'disabled' : ''}" ${pv != null ? `onclick="showInstr(${pv})"` : ''}><span class="pager-label">← Предыдущий</span>${pv != null ? `<b>${esc(iLabel(pv))}</b>` : ''}</button><button class="pager-btn next ${nx == null ? 'disabled' : ''}" ${nx != null ? `onclick="showInstr(${nx})"` : ''}><span class="pager-label">Следующий →</span>${nx != null ? `<b>${esc(iLabel(nx))}</b>` : ''}</button></div>`;
  bodyMode = 'instr'; const body = renderBody(arr); bodyMode = null;
  content.innerHTML = `<div class="view-title"><div><div class="eyebrow">ИНСТРУКЦИЯ ПО ТО ВАГОНОВ В ЭКСПЛУАТАЦИИ</div><h2>${esc(sec.title)}</h2><p>стр. ${sec.page} оригинала · ${b - a} строк исходного текста</p></div><button class="back-btn" onclick="showView('overview')">← Главная</button></div>` +
    `<article class="section-card"><div class="section-head"><span class="num">${esc(sec.num || '—')}</span><div><div class="section-kicker">Инструкция осмотрщику вагонов</div><h3>${esc(sec.title)}</h3></div><span class="section-size">${b - a} строк</span></div>` +
    `<div class="section-actions"><span class="readtime">≈ ${readMin} мин чтения · ${words} слов</span><button class="mini-btn" onclick="printSection()">🖶 Печать</button></div>` +
    `${outline}<div class="rich-text">${body}</div></article>` + pager;
  results.classList.add('hidden'); content.classList.remove('hidden');
  if (!opts.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebarMobile();
  if (!opts.noHash) setHash('instr/' + i);
}

function showView(view) {
  currentView = view; renderNav();
  results.classList.add('hidden'); content.classList.remove('hidden');
  const titles = { overview: 'Главная', pamyatka: 'Памятка осмотрщика', glossary: 'Глоссарий сокращений', figures: 'Рисунки и схемы', favorites: 'Избранное', notes: 'Мои заметки' };
  setCrumbs('Справочник', titles[view] || 'Главная');
  (({ overview: renderOverview, pamyatka: renderPamyatka, glossary: renderGlossary, figures: renderFigures, favorites: renderFavorites, notes: renderNotesView })[view] || renderOverview)();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebarMobile();
  setHash('view/' + view);
}

function renderOverview() {
  setCrumbs('Справочник', 'Главная');
  const card = (go, icon, t, d) => `<button class="dash-card" onclick="${go}"><span>${icon}</span><b>${t}</b><small>${d}</small></button>`;
  content.innerHTML = `<div class="category-head" style="margin:6px 0 10px"><b>Документы</b><small>откройте нужный и листайте по разделам</small></div><div class="dashboard-grid">` +
    card('showSection(0)', '▤', 'РД 32 ЦВ 169-2017', 'Руководство по деповскому ремонту грузовых вагонов: 18 разделов и 6 приложений.') +
    card('showInstr(0)', '⚙', 'Инструкция по ТО вагонов', 'Инструкция осмотрщику: техобслуживание в эксплуатации, требования к узлам, 10 приложений.') +
    card("showView('pamyatka')", '✓', 'Памятка осмотрщика', 'Краткие нормы по узлам, собранные по рабочим категориям.') + `</div>` +
    `<div class="category-head" style="margin:22px 0 10px"><b>Быстрый доступ</b></div><div class="dashboard-grid">` +
    card("showView('glossary')", 'AB', 'Глоссарий сокращений', 'Расшифровка ВУ, ГУ, ЦМГВ, ПКБ ЦВ и других обозначений.') +
    card("showView('figures')", '▧', 'Рисунки и схемы', 'Страницы РД с рисунками, открываются крупно.') +
    card("showView('favorites')", '★', 'Избранное и заметки', 'Ваши закладки (★) и заметки (✎) из РД. Хранятся только в этом браузере.') + `</div>` +
    `<div class="notice"><b>Как искать</b><p>Начните вводить запрос в строке поиска сверху (Ctrl+K) — поиск идёт по обоим документам и памятке. Сузить область можно списком рядом со строкой поиска. Данные извлечены из документов автоматически: для ответственных решений сверяйтесь с оригиналами.</p></div>`;
}

function viewTitle(eyebrow, title, desc) { return `<div class="view-title"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div></div>`; }

/* ================================================================
   ОСНОВНЫЕ ПРЕДСТАВЛЕНИЯ (как в предыдущей версии)
   ================================================================ */
function cardHeader(code, title, meta = '') { return `<div class="card-top"><div><b>${esc(code)}</b><span>${esc(title || '')}</span></div>${meta ? `<small>${esc(meta)}</small>` : ''}</div>`; }

function renderPamyatka() {
  const P = window.PAMYATKA_DATA;
  const total = P.lines.length;
  content.innerHTML = viewTitle('ДОПОЛНИТЕЛЬНЫЙ ИСТОЧНИК', 'Памятка осмотрщику грузовых вагонов', `Отдельный PDF-источник, разложенный по рабочим категориям. Всего ${total} текстовых фрагментов. Формулировки сохранены по источнику.`) +
    `<div class="notice source-note"><b>Дополнительный источник</b><p>Эта памятка не заменяет РД 32 ЦВ 169-2017. Карточки ниже — тематическое представление содержимого памятки; для проверки исходной формулировки сверяйте с оригиналом памятки.</p></div>` +
    `<div class="stats-grid"><div><b>${total}</b><span>фрагментов</span></div><div><b>${P.categories.length}</b><span>категорий</span></div><div><b>1</b><span>страница PDF</span></div></div>` +
    P.categories.map(c => `<section class="pamyatka-category"><div class="category-head"><div><b>${esc(c.category)}</b><small>${c.items.length} фрагментов</small></div></div><div class="pamyatka-items">${c.items.map(x => `<button type="button"><span>${x.n}</span><p>${esc(x.text)}</p></button>`).join('')}</div></section>`).join('');
}
function renderFigures() {
  content.innerHTML = viewTitle('ГРАФИЧЕСКИЙ УКАЗАТЕЛЬ', 'Рисунки и схемы', 'Страницы РД с рисунками и схемами. Нажмите на страницу, чтобы открыть её крупно.') +
    `<div class="figure-grid">${D.figures.map(f => `<button class="figure-card" onclick="window.open('${esc(f.image)}','_blank')"><img src="${esc(f.image)}" loading="lazy" alt="Страница ${f.page}" onerror="this.style.display='none'"><div><b>${esc(f.title)}</b><span>Страница PDF: ${f.page}</span></div></button>`).join('')}</div>`;
}

/* ---------------- История изменений документа ---------------- */
const GLOSSARY = [
  { a: 'РД', d: 'Руководящий документ — отраслевой нормативный акт, устанавливающий обязательные требования к ремонту или эксплуатации техники.' },
  { a: 'ЦВ', d: 'Вагонное хозяйство («Центр вагонный») — служба, в чьём ведении находятся грузовые вагоны; часть обозначения серии документов.' },
  { a: 'ГОСТ', d: 'Межгосударственный стандарт, устанавливающий требования к материалам, деталям или процессам.' },
  { a: 'ТУ', d: 'Технические условия — документ с требованиями к конкретному изделию или материалу, когда нет отдельного ГОСТ.' },
  { a: 'ТК', d: 'Типовой технологический процесс (технологическая карта) — описание порядка выполнения конкретной ремонтной операции.' },
  { a: 'ПКБ ЦВ', d: 'Проектно-конструкторское бюро вагонного хозяйства — разработчик проектов и чертежей, упоминаемых в тексте.' },
  { a: 'НК', d: 'Неразрушающий контроль — проверка деталей (например, дефектоскопия) без их повреждения.' },
  { a: 'ОТК', d: 'Отдел технического контроля предприятия.' },
  { a: 'ВУ-23М', d: 'Форма уведомления о направлении вагона в ремонт.' },
  { a: 'ВУ-36М', d: 'Форма уведомления о приёмке вагона из ремонта.' },
  { a: 'ВУ-41М', d: 'Форма акта-рекламации на узлы и детали, не выдержавшие гарантийного срока.' },
  { a: 'ВУ-22М', d: 'Форма дефектной ведомости на ремонт вагона.' },
  { a: 'ВУ-25 / ВУ-25М', d: 'Форма акта о повреждении вагона или несанкционированной замене комплектующих.' },
  { a: 'ВУ-19', d: 'Форма акта о пропарке, промывке и дегазации котла цистерны.' },
  { a: 'ГУ-23', d: 'Форма акта об очистке, обмывке и обработке вагона грузоотправителем.' },
  { a: 'ЦМГВ', d: 'Цельнометаллический грузовой вагон.' },
  { a: 'АБД ПВ', d: 'Автоматизированный банк данных парка грузовых вагонов.' },
  { a: 'ИВЦ ЖА', d: 'Информационно-вычислительный центр железнодорожной администрации.' },
  { a: 'СМГС', d: 'Соглашение о международном железнодорожном грузовом сообщении.' },
  { a: 'ПОТ РО', d: 'Правила по охране труда отраслевые.' },
  { a: 'ОСТ', d: 'Отраслевой стандарт.' },
  { a: 'б/н', d: 'Отметка «без номера» — у документа-источника отсутствует регистрационный номер.' },
  { a: 'думпкар', d: 'Вагон-самосвал с механизмом опрокидывания кузова для саморазгрузки сыпучих грузов.' },
  { a: 'хоппер', d: 'Вагон бункерного типа с наклонными стенками и разгрузочными люками снизу для сыпучих грузов.' },
  { a: 'КВЗ-1М / УВЗ-9М', d: 'Обозначения типов трёхосных тележек грузовых вагонов, упоминаемых в разделе о тележках.' },
];

function renderGlossary() {
  content.innerHTML = viewTitle('СПРАВОЧНАЯ ИНФОРМАЦИЯ', 'Глоссарий сокращений', 'Краткая расшифровка обозначений, форм и терминов, часто встречающихся в тексте документа.') +
    `<div class="index-tools"><input id="localFilter" placeholder="Например: ВУ, ЦМГВ, хоппер..."><span>${GLOSSARY.length} терминов</span></div>` +
    `<div id="indexList" class="index-list">${GLOSSARY.map(g => `<div class="glossary-item" data-filter="${esc((g.a + ' ' + g.d).toLowerCase())}"><b>${esc(g.a)}</b><p>${esc(g.d)}</p></div>`).join('')}</div>`;
  bindFilter();
}

/* ---------------- Избранное / Заметки / История просмотров ---------------- */
function renderFavorites() {
  const entries = Object.entries(getBookmarks()).sort((a, b) => b[1].ts - a[1].ts);
  content.innerHTML = viewTitle('ЛИЧНОЕ', 'Избранное', 'Пункты документа, отмеченные звёздочкой ★. Хранится только в этом браузере.') +
    `<div class="backup-row"><button class="mini-btn" data-action="export-backup" data-kind="bookmarks">⬇ Экспорт в файл</button><button class="mini-btn" data-action="import-backup" data-kind="bookmarks">⬆ Импорт из файла</button></div>` +
    (entries.length ? entries.map(([anchor, b]) => `<button class="fav-card" data-anchor="${anchor}" data-section="${b.section}"><div class="fav-main"><b>${esc(b.num)} ${esc(b.title)}</b><small>${esc(D.sections[b.section] ? D.sections[b.section].title : '')}</small></div><span class="fav-remove" data-remove-bookmark="${anchor}" title="Удалить">✕</span></button>`).join('')
      : `<div class="empty-state">Пока нет закладок.<br><small>Нажмите ★ рядом с любым пунктом раздела, чтобы добавить его сюда.</small></div>`);
}
function renderNotesView() {
  const entries = Object.entries(getNotes()).sort((a, b) => b[1].ts - a[1].ts);
  content.innerHTML = viewTitle('ЛИЧНОЕ', 'Мои заметки', 'Заметки, добавленные к пунктам документа. Хранятся только в этом браузере.') +
    `<div class="backup-row"><button class="mini-btn" data-action="export-backup" data-kind="notes">⬇ Экспорт в файл</button><button class="mini-btn" data-action="import-backup" data-kind="notes">⬆ Импорт из файла</button></div>` +
    (entries.length ? entries.map(([anchor, n]) => `<button class="fav-card" data-anchor="${anchor}" data-section="${n.section}"><div class="fav-main"><b>${esc(n.num)} ${esc(n.title)}</b><small>${esc(D.sections[n.section] ? D.sections[n.section].title : '')} · ${new Date(n.ts).toLocaleDateString('ru-RU')}</small><p>${esc(n.text)}</p></div><span class="fav-remove" data-remove-note="${anchor}" title="Удалить">✕</span></button>`).join('')
      : `<div class="empty-state">Заметок пока нет.<br><small>Нажмите ✎ рядом с любым пунктом раздела, чтобы добавить заметку.</small></div>`);
}
function bindFilter() {
  const f = document.getElementById('localFilter'), list = document.getElementById('indexList');
  f.oninput = () => { const q = f.value.toLowerCase().trim(); list.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('filtered-out', q && !x.dataset.filter.includes(q))); };
}
function jumpLine(line) {
  const i = sectionForLine(line);
  showSection(i, { noHash: true });
  setTimeout(() => {
    const richText = content.querySelector('.rich-text');
    if (!richText) return;
    const needle = (lines[line] || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const blocks = Array.from(richText.querySelectorAll('p, pre, h3, .document-label'));
    let best = needle ? blocks.find(el => el.textContent.replace(/\s+/g, ' ').includes(needle)) : null;
    if (!best) best = blocks[0];
    if (best) best.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // ближайший предшествующий пункт — для уточнения ссылки в адресной строке
    let lastHeading = null;
    for (const el of blocks) { if (el.tagName === 'H3') lastHeading = el; if (el === best) break; }
    if (lastHeading && lastHeading.id) setHash('point/' + lastHeading.id.replace(/^p-/, '').replace(/-/g, '.'));
    else setHash('section/' + i);
  }, 120);
}

/* ================================================================
   ЗАКЛАДКИ / ЗАМЕТКИ / ССЫЛКА НА ПУНКТ — действия
   ================================================================ */
function toggleBookmark(anchorId, btn) {
  const bookmarks = getBookmarks();
  if (bookmarks[anchorId]) {
    delete bookmarks[anchorId];
    btn.classList.remove('on');
    showToast('Удалено из избранного');
  } else {
    const h3 = document.getElementById(anchorId);
    const num = anchorId.replace(/^p-/, '').replace(/-/g, '.');
    const titleText = h3 ? h3.textContent.replace(/[★✎🔗✕]/g, '').trim() : num;
    bookmarks[anchorId] = { section: active, num, title: titleText, ts: Date.now() };
    btn.classList.add('on');
    showToast('Добавлено в избранное');
  }
  setBookmarks(bookmarks);
}
function removeBookmark(anchor) { const b = getBookmarks(); delete b[anchor]; setBookmarks(b); renderFavorites(); showToast('Удалено из избранного'); }
function removeNote(anchor) { const n = getNotes(); delete n[anchor]; setNotes(n); renderNotesView(); showToast('Заметка удалена'); }

function toggleNoteBox(anchorId) {
  const h3 = document.getElementById(anchorId);
  if (!h3) return;
  const existingBox = h3.nextElementSibling;
  if (existingBox && existingBox.classList && existingBox.classList.contains('note-box') && existingBox.dataset.anchor === anchorId) {
    existingBox.querySelector('textarea')?.focus();
    return;
  }
  const box = document.createElement('div');
  box.className = 'note-box'; box.dataset.anchor = anchorId;
  box.innerHTML = `<div class="note-label">Моя заметка <span class="note-close" title="Скрыть">✕</span></div><textarea class="note-text" placeholder="Добавьте заметку к этому пункту..."></textarea>`;
  h3.after(box);
  box.querySelector('textarea').focus();
}
function saveNote(anchorId, text) {
  const notes = getNotes();
  const num = anchorId.replace(/^p-/, '').replace(/-/g, '.');
  if (text.trim()) {
    const h3 = document.getElementById(anchorId);
    const titleText = h3 ? h3.textContent.replace(/[★✎🔗✕]/g, '').trim() : num;
    notes[anchorId] = { text, section: active, num, title: titleText, ts: Date.now() };
    setNotes(notes);
    showToast('Заметка сохранена');
  } else if (notes[anchorId]) {
    delete notes[anchorId]; setNotes(notes);
  }
}
function copyPointLink(num) {
  const url = location.origin + location.pathname + '#/point/' + num;
  fallbackCopy(url, true);
}
function fallbackCopy(text, useClipboardApi) {
  if (useClipboardApi && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast('Ссылка скопирована')).catch(() => legacyCopy(text));
  } else legacyCopy(text);
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); showToast('Ссылка скопирована'); } catch (e) { showToast('Не удалось скопировать'); }
  ta.remove();
}
function jumpToAnchor(anchorId, sectionIdx) {
  showSection(sectionIdx);
  setTimeout(() => { document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 150);
}

/* ---------------- Резервное копирование избранного / заметок ---------------- */
function exportBackup(kind) {
  const data = kind === 'bookmarks' ? getBookmarks() : getNotes();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `RD_32_CV_169-2017_${kind}_backup.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast('Резервная копия сохранена');
}
function triggerImport(kind) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.onchange = () => {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (kind === 'bookmarks') { setBookmarks({ ...getBookmarks(), ...data }); renderFavorites(); }
        else { setNotes({ ...getNotes(), ...data }); renderNotesView(); }
        showToast('Данные импортированы');
      } catch (e) { showToast('Не удалось прочитать файл'); }
    };
    reader.readAsText(file, 'utf-8');
  };
  input.click();
}

/* ---------------- Печать / экспорт текста раздела ---------------- */
function printSection() { window.print(); }
function exportSectionTxt(i) {
  const [a, b] = sectionRange(i);
  const text = lines.slice(a, b).join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a_ = document.createElement('a');
  const safeName = (D.sections[i].num ? 'razdel_' + D.sections[i].num : 'prilozhenie_' + (i + 1)).replace(/\./g, '_');
  a_.href = url; a_.download = `RD_32_CV_169-2017_${safeName}.txt`;
  document.body.appendChild(a_); a_.click(); a_.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast('Файл сохранён');
}

/* ================================================================
   ДЕЛЕГИРОВАННЫЕ КЛИКИ ВНУТРИ #content
   ================================================================ */
content.addEventListener('click', e => {
  const bm = e.target.closest('.bookmark-btn'); if (bm) { toggleBookmark(bm.dataset.anchor, bm); return; }
  const nb = e.target.closest('.note-btn'); if (nb) { toggleNoteBox(nb.dataset.anchor); return; }
  const ncl = e.target.closest('.note-close'); if (ncl) { ncl.closest('.note-box')?.remove(); return; }
  const lb = e.target.closest('.link-btn'); if (lb) { copyPointLink(lb.dataset.point); return; }
  const xr = e.target.closest('a.xref'); if (xr) { e.preventDefault(); if (xr.dataset.line) jumpLine(+xr.dataset.line - 1); else if (xr.dataset.section) showSection(+xr.dataset.section); return; }
  const rmB = e.target.closest('[data-remove-bookmark]'); if (rmB) { removeBookmark(rmB.dataset.removeBookmark); return; }
  const rmN = e.target.closest('[data-remove-note]'); if (rmN) { removeNote(rmN.dataset.removeNote); return; }
  const ca = e.target.closest('[data-action="clear-history"]'); if (ca) { setHistory([]); renderHistory(); return; }
  const eb = e.target.closest('[data-action="export-backup"]'); if (eb) { exportBackup(eb.dataset.kind); return; }
  const ib = e.target.closest('[data-action="import-backup"]'); if (ib) { triggerImport(ib.dataset.kind); return; }
  const fav = e.target.closest('.fav-card'); if (fav) { if (fav.dataset.anchor) jumpToAnchor(fav.dataset.anchor, +fav.dataset.section); else showSection(+fav.dataset.section); return; }
});
// Сохранение заметок: делегирование работает и для уже показанных, и для только что созданных полей.
content.addEventListener('input', e => {
  const ta = e.target.closest('.note-text'); if (!ta) return;
  const anchorId = ta.closest('.note-box')?.dataset.anchor; if (!anchorId) return;
  clearTimeout(ta._saveTimer);
  ta._saveTimer = setTimeout(() => saveNote(anchorId, ta.value), 500);
});
content.addEventListener('focusout', e => {
  const ta = e.target.closest('.note-text'); if (!ta) return;
  const anchorId = ta.closest('.note-box')?.dataset.anchor; if (!anchorId) return;
  saveNote(anchorId, ta.value);
});

/* ================================================================
   ГЛУБОКИЕ ССЫЛКИ (#/section/N, #/point/X.Y, #/view/name)
   ================================================================ */
function setHash(h) { try { history.replaceState(null, '', '#/' + h); } catch (e) { /* ignore */ } }
function applyHash() {
  const h = location.hash.replace(/^#\/?/, '');
  if (!h) return false;
  const slash = h.indexOf('/');
  const type = slash === -1 ? h : h.slice(0, slash);
  const val = slash === -1 ? '' : h.slice(slash + 1);
  if (type === 'point' && POINT_LINE_MAP[val] != null) { jumpLine(POINT_LINE_MAP[val]); return true; }
  if (type === 'section' && D.sections[+val]) { showSection(+val); return true; }
  if (type === 'instr' && I.sections[+val]) { showInstr(+val); return true; }
  if (type === 'view' && val) { showView(val); return true; }
  return false;
}
window.addEventListener('hashchange', () => applyHash());

/* ================================================================
   ПОИСК (с фильтром по области)
   ================================================================ */
function allSearch(q) {
  q = q.trim();
  const scope = searchScope ? searchScope.value : 'all';
  if (!q) { showView(['section', 'instr'].includes(currentView) ? 'overview' : currentView); return; }
  const low = q.toLowerCase(), hits = [];
  if (scope === 'all' || scope === 'text') {
    D.sections.forEach((s, i) => { const [a, b] = sectionRange(i); for (let j = a; j < b && hits.length < 160; j++) { if (lines[j].toLowerCase().includes(low)) hits.push({ i, j, line: lines[j].trim() }); } });
  }
  if ((scope === 'all' || scope === 'pamyatka') && window.PAMYATKA_DATA) {
    window.PAMYATKA_DATA.categories.forEach(c => c.items.forEach(x => { if (hits.length < 160 && x.text.toLowerCase().includes(low)) hits.push({ i: 0, j: -1, line: 'ПАМЯТКА · ' + c.category + ' · ' + x.text, pamyatka: true }); }));
  }
  if (scope === 'all' || scope === 'instr') {
    I.sections.forEach((s, i) => { const [a, b] = iRange(i); for (let j = a; j < b && hits.length < 240; j++) { if (ilines[j].toLowerCase().includes(low)) hits.push({ i: 0, instr: true, ii: i, j: j - a, line: ilines[j].trim() }); } });
  }
  if (scope === 'all' || scope === 'notes') {
    Object.entries(getNotes()).forEach(([anchor, n]) => { if (hits.length < 160 && n.text.toLowerCase().includes(low)) hits.push({ i: n.section, j: -1, line: 'ЗАМЕТКА · ' + (n.num || '') + ' · ' + n.text, noteAnchor: anchor }); });
  }
  setCrumbs('Справочник', 'Поиск', `«${q}»`);
  results.innerHTML = `<div class="search-head"><div><div class="eyebrow">ПОИСК</div><h2>Результаты по «${esc(q)}»</h2></div><span>${hits.length}${hits.length >= 160 ? '+' : ''}</span></div>` +
    (hits.length ? hits.map(h => `<button class="result" data-section="${h.i}" ${h.pamyatka ? 'data-pamyatka="1"' : ''} ${h.instr ? `data-instr="${h.ii}"` : ''} ${h.noteAnchor ? `data-note-anchor="${h.noteAnchor}"` : ''}><div><b>${h.pamyatka ? 'ПАМЯТКА ОСМОТРЩИКА' : h.instr ? 'ИНСТРУКЦИЯ ПО ТО · ' + esc(iLabel(h.ii)) : esc(D.sections[h.i].num || '') + ' ' + esc(D.sections[h.i].title)}</b><small>${h.pamyatka ? 'дополнительный источник' : h.noteAnchor ? 'моя заметка' : 'строка ' + (h.j + 1)}</small></div><p>${mark(h.line || '...', q)}</p></button>`).join('') : '<div class="empty-result">Ничего не найдено</div>');
  results.classList.remove('hidden'); content.classList.add('hidden');
}
results.addEventListener('click', e => {
  const btn = e.target.closest('.result'); if (!btn) return;
  if (btn.dataset.instr) { showInstr(+btn.dataset.instr); return; }
  if (btn.dataset.pamyatka) { showView('pamyatka'); return; }
  if (btn.dataset.noteAnchor) { jumpToAnchor(btn.dataset.noteAnchor, +btn.dataset.section); return; }
  showSection(+btn.dataset.section);
});


/* ================================================================
   ОКНО СПРАВКИ / ГОРЯЧИЕ КЛАВИШИ
   ================================================================ */
const helpOverlay = document.getElementById('helpOverlay');
document.getElementById('helpBtn').onclick = () => helpOverlay.classList.remove('hidden');
document.getElementById('closeHelp').onclick = () => helpOverlay.classList.add('hidden');
helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) helpOverlay.classList.add('hidden'); });

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.focus(); return; }
  if (e.key === '?' && !typing) { helpOverlay.classList.remove('hidden'); return; }
  if (e.key === 'Escape') {
    if (!helpOverlay.classList.contains('hidden')) { helpOverlay.classList.add('hidden'); return; }
    if (e.target === search || e.target === sideSearch) {
      search.value = ''; sideSearch.value = ''; search.blur();
      showView(['section', 'instr'].includes(currentView) ? 'overview' : currentView);
      return;
    }
    if (typing) { e.target.blur(); }
    return;
  }
  if (!typing && currentView === 'section') {
    if (e.key === 'ArrowLeft' && active > 0) showSection(active - 1);
    if (e.key === 'ArrowRight' && active < D.sections.length - 1) showSection(active + 1);
  }
});

/* ================================================================
   ПРОКРУТКА: полоса прогресса чтения + кнопка «наверх»
   ================================================================ */
const progressFill = document.getElementById('progressFill'), toTopBtn = document.getElementById('toTopBtn');
window.addEventListener('scroll', () => {
  const doc = document.documentElement;
  const height = doc.scrollHeight - doc.clientHeight;
  const pct = height > 0 ? (doc.scrollTop / height * 100) : 0;
  progressFill.style.width = pct + '%';
  toTopBtn.classList.toggle('hidden', doc.scrollTop < 400);
}, { passive: true });
toTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

/* ================================================================
   ТЕМА: авто по системе, пока пользователь не выберет вручную
   ================================================================ */
(function initTheme() {
  const stored = localStorage.getItem('rd_theme');
  if (stored) { document.body.classList.toggle('light', stored === 'light'); return; }
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  document.body.classList.toggle('light', mq.matches);
  mq.addEventListener?.('change', ev => { if (!localStorage.getItem('rd_theme')) document.body.classList.toggle('light', ev.matches); });
})();
document.getElementById('themeBtn').onclick = () => {
  const nowLight = document.body.classList.toggle('light');
  localStorage.setItem('rd_theme', nowLight ? 'light' : 'dark');
};

/* ================================================================
   ИНИЦИАЛИЗАЦИЯ
   ================================================================ */
document.getElementById('heroMeta').innerHTML = '<span>2 документа</span><span>Полный текст</span><span>Единый поиск</span>';
document.documentElement.style.setProperty('--font-scale', fontScale);

renderNav();
if (!applyHash()) renderOverview();

let searchTimer;
search.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => allSearch(search.value), 120); };
sideSearch.oninput = () => { search.value = sideSearch.value; allSearch(search.value); };
if (searchScope) searchScope.onchange = () => { if (search.value.trim()) allSearch(search.value); };
document.getElementById('resetBtn').onclick = () => { search.value = ''; sideSearch.value = ''; showView('overview'); };

const sidebar = document.getElementById('sidebar'), backdrop = document.getElementById('sidebarBackdrop');
document.getElementById('tocBtn').onclick = () => { sidebar.classList.toggle('open'); backdrop.classList.toggle('show'); };
backdrop.onclick = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };
function closeSidebarMobile() { if (innerWidth < 900) { sidebar.classList.remove('open'); backdrop.classList.remove('show'); } }

function setFont(delta) {
  fontScale = Math.min(1.45, Math.max(.9, fontScale + delta));
  document.documentElement.style.setProperty('--font-scale', fontScale);
  localStorage.setItem('rd_font', fontScale);
}
document.getElementById('fontPlus').onclick = () => setFont(.1);
document.getElementById('fontMinus').onclick = () => setFont(-.1);

/* ================================================================
   PWA: офлайн-доступ через service worker (работает при запуске
   через start.bat / любой http-сервер; на file:// тихо отключается)
   ================================================================ */
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('assets/sw.js').catch(() => {}); });
}
