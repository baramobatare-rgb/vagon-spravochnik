/* Справочник осмотрщика вагонов — логика интерфейса */
const I = window.INSTR_DATA, P = window.PAMYATKA_DATA, ilines = I.text.split('\n');
const nav = document.getElementById('sectionNav'), content = document.getElementById('content'),
      search = document.getElementById('search'), sideSearch = document.getElementById('sideSearch'),
      results = document.getElementById('results'), crumbs = document.getElementById('crumbs'),
      searchScope = document.getElementById('searchScope');
let activeI = 0, currentView = 'overview', fontScale = parseFloat(localStorage.getItem('rd_font') || '1') || 1, openGroups = {};
let searchHits = [];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '\u0026amp;',
    '<': '\u0026lt;',
    '>': '\u0026gt;',
    '"': '\u0026quot;',
    "'": '\u0026#39;'
  }[c]));
}
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mark = (text, q) => { const safe = esc(text); return q ? safe.replace(new RegExp(escapeRegExp(q), 'gi'), m => `<mark>${m}</mark>`) : safe; };
const iRange = i => [I.sections[i].line, i + 1 < I.sections.length ? I.sections[i + 1].line : ilines.length];
const iLabel = i => (I.sections[i].num ? I.sections[i].num + '. ' : '') + I.sections[i].title;

/* Заголовок пункта инструкции: 1.1 … 3.10.3, с прописной.
   Отсекает даты (24.05.96), номера чертежей (447.07.000) и ссылки («3.2 настоящей Инструкции»). */
function parseHeading(t) {
  const m = String(t).match(/^([1-3](?:\.\d{1,2}){1,3})\s+(\S.{2,})$/);
  if (!m || !/^[A-ZА-ЯЁ]/.test(m[2])) return null;
  return { n: m[1], title: m[2] };
}

let toastTimer;
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
function setCrumbs(...parts) { crumbs.innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<strong>${esc(p)}</strong>` : `<span>${esc(p)}</span><i>/</i>`).join(''); }
function viewTitle(eyebrow, title, desc) { return `<div class="view-title"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div></div>`; }

/* ---------------- меню ---------------- */
const QUICK = [
  { view: 'vu45', label: 'Справка ВУ-45 · калькулятор', icon: '∑' },
  { view: 'pamyatka', label: 'Памятка осмотрщика', icon: '✓' },
  { view: 'marks', label: 'Закладки и недавние', icon: '★' }
];
const SHIFT = [
  { view: 'norms', label: 'Частые нормы', icon: '⌖' },
  { view: 'check', label: 'Чеклист смены', icon: '☐' },
  { view: 'timer', label: 'Секундомер', icon: '⏱' },
  { view: 'glossary', label: 'Словарь сокращений', icon: 'А' }
];
const navButton = (label, view, icon) => `<button class="side-nav ${currentView === view ? 'active' : ''}" data-view="${view}"><span class="side-icon">${icon}</span><span>${esc(label)}</span></button>`;
function scrollNavActive() {
  const active = nav.querySelector('.nav-btn.active');
  if (!active || typeof sidebar === 'undefined' || !sidebar) return;
  const cr = sidebar.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  if (ar.top < cr.top + 48) sidebar.scrollTop -= cr.top + 48 - ar.top;
  else if (ar.bottom > cr.bottom - 12) sidebar.scrollTop += ar.bottom - (cr.bottom - 12);
}
function renderNav() {
  let html = navButton('Главная', 'overview', '⌂') + `<div class="nav-group">На смене</div>` + SHIFT.map(v => navButton(v.label, v.view, v.icon)).join('') + `<div class="nav-group">Быстрый доступ</div>` + QUICK.map(v => navButton(v.label, v.view, v.icon)).join('') + `<div class="nav-group">Инструкция по ТО вагонов</div>`;
  I.groups.forEach((g, gi) => {
    const key = 'g' + gi, isOpen = !!openGroups[key], has = currentView === 'instr' && activeI >= g.range[0] && activeI < g.range[1];
    html += `<button class="nav-toggle ${isOpen ? 'open' : ''}" data-group="${key}"><span class="side-icon">${has ? '●' : '○'}</span><span>${esc(g.label)}</span><span class="chev">▸</span></button><div class="nav-sub ${isOpen ? 'open' : ''}">`;
    for (let i = g.range[0]; i < g.range[1]; i++) html += `<button class="nav-btn ${currentView === 'instr' && activeI === i ? 'active' : ''}" data-ii="${i}"><span class="nav-num">${esc(I.sections[i].num || '•')}</span><span>${esc(I.sections[i].title)}</span></button>`;
    html += `</div>`;
  });
  document.querySelector('.hero').classList.toggle('hidden', currentView !== 'overview');
  nav.innerHTML = html;
  nav.querySelectorAll('.side-nav').forEach(b => b.onclick = () => showView(b.dataset.view));
  nav.querySelectorAll('.nav-btn[data-ii]').forEach(b => b.onclick = () => showInstr(+b.dataset.ii));
  nav.querySelectorAll('.nav-toggle').forEach(b => b.onclick = () => { openGroups[b.dataset.group] = !openGroups[b.dataset.group]; renderNav(); });
  scrollNavActive();
  document.querySelectorAll('#dock [data-dock]').forEach(b => b.classList.toggle('on', b.dataset.dock === currentView));
}

/* ---------------- текст раздела ---------------- */
function renderBody(arr) {
  let html = '', para = [], pre = [], list = [];
  const flushPara = () => { if (para.length) { const t = para.join(' ').replace(/\s+/g, ' ').trim(); if (t) html += `<p>${esc(t)}</p>`; para = []; } };
  const flushPre = () => { if (pre.length) { html += `<pre class="source-table">${esc(pre.join('\n'))}</pre>`; pre = []; } };
  const flushList = () => { if (list.length) { html += `<div class="src-list">${list.map(x => `<div class="src-line">${esc(x)}</div>`).join('')}</div>`; list = []; } };
  const flushAll = () => { flushPre(); flushList(); flushPara(); };
  for (const raw of arr) {
    const line = raw.replace(/\f/g, '').replace(/\s+$/, ''), t = line.trim();
    if (!t) { flushAll(); continue; }
    const sub = parseHeading(t);
    if (sub) { flushAll(); html += `<h3 id="i-${sub.n.replace(/\./g, '-')}"><span>${esc(sub.n)}</span> ${esc(sub.title)}</h3>`; continue; }
    if (/^(Таблица|Приложение|Рисунок)\s+/i.test(t)) { flushAll(); html += `<div class="document-label">${esc(t)}</div>`; continue; }
    if (/\s{3,}/.test(line)) { flushList(); flushPara(); pre.push(line); continue; }
    if (/^(?:\d+[.)]?|[—–-])\s+\S/.test(t)) { flushPre(); flushPara(); list.push(t); continue; }
    flushPre(); flushList();
    para.push(t);
  }
  flushAll();
  return html || '<p class="empty">Содержимое раздела отсутствует в текстовом представлении.</p>';
}
const subsectionIndex = arr => arr.map(x => parseHeading(x.trim())).filter(Boolean).slice(0, 100);
function printSection() { window.print(); }

function loadStore(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; }
}
function saveStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ } }
let marks = loadStore('rd_marks', {});
let recent = loadStore('rd_recent', []);
function marked(i) { return Object.prototype.hasOwnProperty.call(marks, String(i)); }
function remember(i) {
  recent = [i, ...recent.filter(n => n !== i)].slice(0, 8);
  saveStore('rd_recent', recent);
}
function toggleMark(i) {
  const k = String(i);
  if (marked(i)) { delete marks[k]; showToast('Закладка снята'); }
  else { marks[k] = ''; showToast('Добавлено в закладки'); }
  saveStore('rd_marks', marks);
  syncMarkUi();
  if (currentView === 'marks') renderMarks();
}
function copySectionLink(i) {
  const url = location.href.split('#')[0] + '#/instr/' + i;
  const done = () => showToast('Ссылка скопирована');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done).catch(() => showToast(url));
  else showToast(url);
}
function syncMarkUi() {
  const btn = document.getElementById('markBtn');
  if (!btn) return;
  const on = marked(activeI);
  btn.classList.toggle('on', on);
  btn.textContent = on ? 'В закладках' : 'Закладка';
}
function bindSectionTools() {
  const markBtn = document.getElementById('markBtn');
  const noteBtn = document.getElementById('noteBtn');
  const linkBtn = document.getElementById('linkBtn');
  const box = document.getElementById('noteBox');
  const text = document.getElementById('noteText');
  if (markBtn) markBtn.onclick = () => toggleMark(activeI);
  if (linkBtn) linkBtn.onclick = () => copySectionLink(activeI);
  if (noteBtn) noteBtn.onclick = () => { box.classList.toggle('hidden'); if (!box.classList.contains('hidden')) text.focus(); };
  document.getElementById('noteClose').onclick = () => box.classList.add('hidden');
  text.oninput = () => {
    const k = String(activeI);
    if (!marked(activeI)) marks[k] = '';
    marks[k] = text.value;
    saveStore('rd_marks', marks);
    syncMarkUi();
  };
  syncMarkUi();
}
function favCard(i, note, quiet) {
  const sec = I.sections[i];
  return `<div class="fav-card"><button type="button" class="fav-main" data-open="${i}"><b>${esc(iLabel(i))}</b><small>${esc(sec.num || 'раздел')} · стр. ${sec.page}</small>${note ? `<p>${esc(note)}</p>` : ''}</button>${quiet ? '' : `<button type="button" class="fav-remove" data-unmark="${i}" aria-label="Убрать закладку">×</button>`}</div>`;
}
function renderMarks() {
  const ids = Object.keys(marks).map(Number).filter(i => I.sections[i]);
  const rec = recent.filter(i => I.sections[i]);
  content.innerHTML = viewTitle('НА ЭТОМ УСТРОЙСТВЕ', 'Закладки', 'Отмеченные разделы, последние открытые и файл для переноса на другой телефон.') +
    backupBar() +
    `<div class="home-h"><b>Закладки</b><span>${ids.length}</span></div>` +
    (ids.length ? ids.map(i => favCard(i, marks[String(i)] || '')).join('') : `<div class="empty-state">Пока нет закладок. Откройте раздел и нажмите «Закладка».</div>`) +
    `<div class="home-h"><b>Недавние</b></div>` +
    (rec.length ? rec.map(i => favCard(i, '', true)).join('') : `<div class="empty-state">История появится после открытия раздела инструкции.</div>`);
  content.querySelectorAll('[data-open]').forEach(b => b.onclick = () => showInstr(+b.dataset.open));
  content.querySelectorAll('[data-unmark]').forEach(b => b.onclick = () => { delete marks[b.dataset.unmark]; saveStore('rd_marks', marks); renderMarks(); showToast('Закладка снята'); });
  bindBackup();
}
const CRUMBS = { overview: 'Главная', pamyatka: 'Памятка осмотрщика', vu45: 'Справка ВУ-45', marks: 'Закладки', norms: 'Частые нормы', check: 'Чеклист смены', glossary: 'Словарь', timer: 'Секундомер' };
const VIEWS = ['overview', 'pamyatka', 'vu45', 'marks', 'norms', 'check', 'glossary', 'timer'];
function tidy(s) { return String(s || '').replace(/\s+/g, ' ').replace(/н е /g, 'не ').trim(); }
function findPam(colName, needle, under) {
  const i = P.columns.findIndex(c => c.name === colName);
  if (i < 0) return null;
  let heading = '';
  for (const it of P.columns[i].items) {
    if (it.t === 'h') heading = it.a || '';
    const blob = ((it.a || '') + ' ' + (it.b || '')).toLowerCase();
    if (!blob.includes(needle.toLowerCase())) continue;
    if (under && !heading.toLowerCase().includes(under.toLowerCase())) continue;
    return { i, heading, a: it.a || '', b: it.b || '' };
  }
  return null;
}
const QUICK_NORMS = [
  { title: 'Толщина гребня', col: 'Колёсные пары', needle: 'в эксплуатации при скоростях до 120' },
  { title: 'Равномерный прокат', col: 'Колёсные пары', needle: 'грузовые вагоны в эксплуатации' },
  { title: 'Толщина обода', col: 'Колёсные пары', needle: 'Толщина обода колеса' },
  { title: 'Ползун 1–2 мм', col: 'Колёсные пары', needle: 'от 1 до 2 мм' },
  { title: 'Колодка чугунная', col: 'Автотормозное устройство', needle: 'чугунные', under: 'Толщина тормозных колодок' },
  { title: 'Колодка со спинкой', col: 'Автотормозное устройство', needle: 'с металлической спинкой', under: 'Толщина тормозных колодок' },
  { title: 'Зазор колодка — колесо', col: 'Автотормозное устройство', needle: 'зазор между колодкой и колесом' },
  { title: 'Шток, чугун, полное', col: 'Автотормозное устройство', needle: 'при полном служебном торможении', under: 'чугунн' },
  { title: 'Шток, композиция, полное', col: 'Автотормозное устройство', needle: 'при полном служебном торможении', under: 'композицион' },
  { title: 'Автосцепка, порожний', col: 'Автосцепное устройство', needle: 'у порожних вагонов всех типов' },
  { title: 'Автосцепка, грузовой порожний', col: 'Автосцепное устройство', needle: 'у грузовых порожних' },
  { title: 'Скользуны, 4 оси', col: 'Тележки грузовых вагонов', needle: 'основные типы 4-х осных' }
];
function renderNorms() {
  const cards = QUICK_NORMS.map(item => {
    const hit = findPam(item.col, item.needle, item.under);
    if (!hit) return '';
    const value = tidy(hit.b || hit.a);
    const hint = tidy(hit.b ? (hit.heading ? hit.heading + ' · ' + hit.a : hit.a) : hit.heading);
    return `<button type="button" class="norm-card" data-pam="${hit.i}"><span>${esc(item.title)}</span><b>${esc(value)}</b><small>${esc(hint)}</small></button>`;
  }).join('');
  content.innerHTML = viewTitle('ИЗ ПАМЯТКИ ОСМОТРЩИКА', 'Частые нормы', 'Короткая карточка для смены. Цифры взяты из памятки, не заменяют инструкцию и оригинал.') +
    `<div class="norm-grid">${cards}</div>` +
    `<div class="notice"><p>Нажатие открывает соответствующий раздел памятки. Для ответственного решения сверьтесь с документом.</p></div>`;
  content.querySelectorAll('[data-pam]').forEach(b => b.onclick = () => openPam(+b.dataset.pam));
}
function openPam(i) {
  showView('pamyatka', { noScroll: true });
  document.getElementById('pam-c' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const GLOSSARY = [
  { t: 'ТЦ', d: 'Тормозной цилиндр.', q: 'тормозн цилиндр' },
  { t: 'ТМ', d: 'Тормозная магистраль.', q: 'тормозн магистрал' },
  { t: 'ДПВ', d: 'В справке ВУ-45 — давление в тормозной магистрали хвостового вагона.', q: 'хвостового' },
  { t: 'ЭПТ', d: 'Электропневматический тормоз. В справке указывают напряжение в хвосте поезда.', q: 'ЭПТ' },
  { t: 'ВР', d: 'Воздухораспределитель. Режимы в памятке: порожний, средний, гружёный.', q: 'воздухораспределител' },
  { t: 'ТРП', d: 'Тормозная рычажная передача.', q: 'рычажн' },
  { t: 'РТРП', d: 'Регулятор тормозной рычажной передачи (авторегулятор).', q: 'авторегулятор' },
  { t: 'ПТО', d: 'Пункт технического обслуживания вагонов.', q: 'ПТО' },
  { t: 'СА-3', d: 'Автосцепка СА-3.', q: 'автосцеп' },
  { t: 'К.1', d: 'Таблица Приложения К: ручные тормоза и тормозные башмаки на 100 т веса.', q: '' }
];
function renderGlossary() {
  content.innerHTML = viewTitle('СОКРАЩЕНИЯ', 'Словарь', 'Короткие расшифровки для справки и памятки. Кнопка ищет формулировку в справочнике.') +
    GLOSSARY.map(g => `<article class="glossary-item"><b>${esc(g.t)}</b><p>${esc(g.d)}</p><button type="button" class="mini-btn" data-gloss="${esc(g.t)}">${g.t === 'К.1' ? 'Открыть калькулятор' : 'Найти в справочнике'}</button></article>`).join('');
  content.querySelectorAll('[data-gloss]').forEach(b => b.onclick = () => {
    const g = GLOSSARY.find(x => x.t === b.dataset.gloss);
    if (!g) return;
    if (g.t === 'К.1') { showView('vu45'); return; }
    search.value = g.q;
    allSearch(g.q);
  });
}
const CHECK_SEED = [
  'Автосцепка: высота и разница по составу',
  'Колёсные пары: гребень, прокат, ползун',
  'Колодки и выход штока',
  'Концевые краны и утечки',
  'Справка ВУ-45',
  'Хвостовой вагон'
];
let checks = loadStore('rd_check', null);
if (!Array.isArray(checks) || !checks.length) checks = CHECK_SEED.map((text, n) => ({ id: 's' + n, text, done: false, custom: false }));
function saveChecks() { saveStore('rd_check', checks); }
function renderCheck() {
  const done = checks.filter(x => x.done).length;
  content.innerHTML = viewTitle('ТОЛЬКО НА ЭТОМ ТЕЛЕФОНЕ', 'Чеклист смены', 'Свой список перед отправлением. Это не официальный порядок осмотра.') +
    `<div class="home-h"><b>Отмечено</b><span>${done} из ${checks.length}</span></div>` +
    `<ul class="check-list">${checks.map(x => `<li><label><input type="checkbox" data-check="${esc(x.id)}" ${x.done ? 'checked' : ''}><span>${esc(x.text)}</span></label>${x.custom ? `<button type="button" class="fav-remove" data-check-del="${esc(x.id)}" aria-label="Удалить пункт">×</button>` : ''}</li>`).join('')}</ul>` +
    `<div class="check-add"><input id="checkNew" maxlength="80" placeholder="Свой пункт"><button type="button" class="mini-btn" id="checkAdd">Добавить</button><button type="button" class="mini-btn" id="checkReset">Новая смена</button></div>`;
  content.querySelectorAll('[data-check]').forEach(el => el.onchange = () => {
    const row = checks.find(x => x.id === el.dataset.check);
    if (row) row.done = el.checked;
    saveChecks();
    const cap = content.querySelector('.home-h span');
    if (cap) cap.textContent = `${checks.filter(x => x.done).length} из ${checks.length}`;
  });
  content.querySelectorAll('[data-check-del]').forEach(b => b.onclick = () => { checks = checks.filter(x => x.id !== b.dataset.checkDel); saveChecks(); renderCheck(); });
  document.getElementById('checkAdd').onclick = () => {
    const text = document.getElementById('checkNew').value.trim();
    if (!text) return;
    checks.push({ id: 'c' + Date.now().toString(36), text, done: false, custom: true });
    saveChecks();
    renderCheck();
  };
  document.getElementById('checkReset').onclick = () => { checks.forEach(x => { x.done = false; }); saveChecks(); renderCheck(); showToast('Отметки сняты'); };
}
function backupPayload() {
  return { app: 'vagon-spravochnik', exported: new Date().toISOString().slice(0, 10), marks, recent, checks, vuDrafts: typeof vuExportState === 'function' ? vuExportState() : null };
}
function exportBackup() {
  const blob = new Blob([JSON.stringify(backupPayload(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'spravochnik-dannye.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('Файл сохранён');
}
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result || ''));
      if (!data || data.app !== 'vagon-spravochnik') throw new Error('format');
      if (data.marks && typeof data.marks === 'object') { marks = data.marks; saveStore('rd_marks', marks); }
      if (Array.isArray(data.recent)) { recent = data.recent.filter(n => I.sections[n]).slice(0, 8); saveStore('rd_recent', recent); }
      if (Array.isArray(data.checks) && data.checks.length) { checks = data.checks; saveChecks(); }
      if (data.vuDrafts && typeof vuImportState === 'function') vuImportState(data.vuDrafts);
      showToast('Данные загружены');
      if (currentView === 'marks') renderMarks();
      else if (currentView === 'check') renderCheck();
      else if (currentView === 'vu45') renderVu45();
    } catch (e) { showToast('Файл не подошёл'); }
  };
  reader.readAsText(file);
}
function bindBackup() {
  const exp = document.getElementById('exportBtn');
  const imp = document.getElementById('importBtn');
  const file = document.getElementById('importFile');
  if (exp) exp.onclick = exportBackup;
  if (imp && file) imp.onclick = () => file.click();
  if (file) file.onchange = () => { if (file.files && file.files[0]) importBackup(file.files[0]); file.value = ''; };
}
function backupBar() {
  return `<div class="backup-row"><button type="button" class="mini-btn" id="exportBtn">Выгрузить данные</button><button type="button" class="mini-btn" id="importBtn">Загрузить</button><input id="importFile" type="file" accept="application/json,.json" class="hidden"></div>`;
}
function paintWords(el, phrase) {
  const q = String(phrase || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  if (!el || q.length < 3) return;
  const nodes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  const re = new RegExp(escapeRegExp(q), 'i');
  nodes.forEach(node => {
    if (node.parentElement && node.parentElement.closest('mark')) return;
    const value = node.nodeValue || '';
    const m = value.match(re);
    if (!m) return;
    const markEl = document.createElement('mark');
    markEl.textContent = value.slice(m.index, m.index + m[0].length);
    const rest = node.splitText(m.index);
    rest.nodeValue = rest.nodeValue.slice(m[0].length);
    node.parentNode.insertBefore(markEl, rest);
  });
}
function highlightJump(text) {
  const needle = String(text || '').replace(/\s+/g, ' ').trim();
  if (needle.length < 4) return false;
  const nodes = content.querySelectorAll('h2, h3, p, pre, .document-label, .src-line, .pam-row, .pam-note, .pam-sub');
  const shorts = [needle.slice(0, 72), needle.slice(0, 28)].filter((s, i, a) => s.length >= 4 && a.indexOf(s) === i);
  for (const short of shorts) {
    for (const el of nodes) {
      if (el.textContent.replace(/\s+/g, ' ').includes(short)) {
        el.classList.add('jump-hit');
        paintWords(el, short);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
      }
    }
  }
  return false;
}

function showInstr(i, opts = {}) {
  if (!I.sections[i]) return;
  content.oninput = null;
  content.onclick = null;
  currentView = 'instr'; activeI = i;
  const gi = I.groups.findIndex(g => i >= g.range[0] && i < g.range[1]); if (gi >= 0) openGroups['g' + gi] = true;
  renderNav();
  const [a, b] = iRange(i), arr = ilines.slice(a, b), sec = I.sections[i];
  const words = arr.join(' ').split(/\s+/).filter(Boolean).length, readMin = Math.max(1, Math.round(words / 180)), subs = subsectionIndex(arr);
  const outline = subs.length ? `<div class="outline"><div class="outline-title">Пункты раздела</div>${subs.map(s => `<button type="button" data-anchor="i-${s.n.replace(/\./g, '-')}"><b>${esc(s.n)}</b> ${esc(s.title)}</button>`).join('')}</div>` : '';
  setCrumbs('Инструкция по ТО вагонов', iLabel(i));
  const pv = i > 0 ? i - 1 : null, nx = i < I.sections.length - 1 ? i + 1 : null;
  const pager = `<div class="section-pager"><button class="pager-btn prev ${pv == null ? 'disabled' : ''}" ${pv != null ? `onclick="showInstr(${pv})"` : ''}><span class="pager-label">← Предыдущий</span>${pv != null ? `<b>${esc(iLabel(pv))}</b>` : ''}</button><button class="pager-btn next ${nx == null ? 'disabled' : ''}" ${nx != null ? `onclick="showInstr(${nx})"` : ''}><span class="pager-label">Следующий →</span>${nx != null ? `<b>${esc(iLabel(nx))}</b>` : ''}</button></div>`;
  content.innerHTML = `<div class="view-title"><div><div class="eyebrow">ИНСТРУКЦИЯ ПО ТО ВАГОНОВ В ЭКСПЛУАТАЦИИ</div><h2>${esc(sec.title)}</h2><p>стр. ${sec.page} оригинала · ${b - a} строк</p></div><button class="back-btn" onclick="showView('overview')">← Главная</button></div>` +
    `<article class="section-card"><div class="section-head"><span class="num">${esc(sec.num || '—')}</span><div><div class="section-kicker">Инструкция осмотрщику вагонов</div><h3>${esc(sec.title)}</h3></div></div>` +
    `<div class="section-actions"><span class="readtime">≈ ${readMin} мин чтения · ${words} слов</span><button type="button" class="mini-btn" id="markBtn">Закладка</button><button type="button" class="mini-btn" id="noteBtn">Заметка</button><button type="button" class="mini-btn" id="linkBtn">Ссылка</button><button class="mini-btn" onclick="printSection()">Печать</button>${/ВУ-45/.test(sec.title) ? `<button class="mini-btn" onclick="showView('vu45')">Калькулятор ВУ-45</button>` : ''}</div>` +
    `<div class="note-box ${marked(i) && marks[String(i)] ? '' : 'hidden'}" id="noteBox"><div class="note-label">Заметка <span class="note-close" id="noteClose">скрыть</span></div><textarea id="noteText">${esc(marks[String(i)] || '')}</textarea></div>` +
    `${outline}<div class="rich-text">${renderBody(arr)}</div></article>` + pager;
  content.querySelectorAll('[data-anchor]').forEach(btn => btn.onclick = () => document.getElementById(btn.dataset.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  bindSectionTools();
  remember(i);
  results.classList.add('hidden'); content.classList.remove('hidden');
  if (opts.jump) highlightJump(opts.jump);
  else if (!opts.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebarMobile();
  setHash('instr/' + i);
}

/* ---------------- прочие экраны ---------------- */
function showView(view, opts = {}) {
  if (!VIEWS.includes(view)) view = 'overview';
  content.oninput = null;
  content.onclick = null;
  currentView = view; renderNav();
  results.classList.add('hidden'); content.classList.remove('hidden');
  setCrumbs('Справочник', CRUMBS[view]);
  ({ overview: renderOverview, pamyatka: renderPamyatka, vu45: renderVu45, marks: renderMarks, norms: renderNorms, check: renderCheck, glossary: renderGlossary, timer: renderTimer })[view]();
  if (!opts.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebarMobile(); setHash('view/' + view);
}
function renderOverview() {
  const card = (go, icon, t, d, primary) => `<button class="dash-card${primary ? ' primary' : ''}" onclick="${go}"><span>${icon}</span><b>${t}</b><small>${d}</small></button>`;
  content.innerHTML = `<div class="home-h"><b>На смене</b></div><div class="dashboard-grid">` +
    card("showView('vu45')", '∑', 'Справка ВУ-45', 'Калькулятор нажатия и черновики по поездам.', true) +
    card("showView('norms')", '⌖', 'Частые нормы', 'Гребень, прокат, колодки, шток и автосцепка.') +
    card("showView('check')", '☐', 'Чеклист смены', 'Свой список перед отправлением.') +
    card("showView('timer')", '⏱', 'Секундомер', 'Сколько длится опробование. Без нормы минут.') +
    `</div><div class="home-h"><b>Справочник</b></div><div class="dashboard-grid">` +
    card('showInstr(0)', '⚙', 'Инструкция', `Полный текст: ${I.sections.length} разделов.`) +
    card("showView('pamyatka')", '✓', 'Памятка', 'Краткие нормы по узлам вагона.') +
    card("showView('glossary')", 'А', 'Словарь', 'ТЦ, ТМ, ДПВ, ЭПТ и другие сокращения.') +
    card("showView('marks')", '★', 'Закладки', 'Заметки и перенос данных файлом.') + `</div>` +
    I.groups.map(g => `<div class="home-h"><b>${esc(g.label)}</b><span>${g.range[1] - g.range[0]} разд.</span></div><div class="idx-grid">` +
      Array.from({ length: g.range[1] - g.range[0] }, (_, k) => { const i = g.range[0] + k; return `<button class="section-index" onclick="showInstr(${i})"><span>${esc(I.sections[i].num || '•')}</span><div><b>${esc(I.sections[i].title)}</b></div><i>→</i></button>`; }).join('') + `</div>`).join('') +
    `<div class="notice"><p><b>Поиск:</b> введите запрос в строке сверху (Ctrl+K), он работает по Инструкции и памятке. Данные извлечены из документов автоматически — для ответственных решений сверяйтесь с оригиналами.</p></div>`;
}
function pamGroups(items) {
  const groups = []; let g = { h: '', rows: [] };
  items.forEach(x => { if (x.t === 'h') { if (g.h || g.rows.length) groups.push(g); g = { h: x.a, rows: [] }; } else g.rows.push(x); });
  if (g.h || g.rows.length) groups.push(g); return groups;
}
function renderPamyatka() {
  const total = P.columns.reduce((n, c) => n + c.items.length, 0);
  content.innerHTML = viewTitle('ДОПОЛНИТЕЛЬНЫЙ ИСТОЧНИК', P.title, `Краткие нормы по узлам вагона. Каждый параметр и его значение показаны в отдельных колонках. Всего ${total} строк.`) +
    `<div class="pam-jump">${P.columns.map((c, i) => `<button type="button" data-pamjump="pam-c${i}">${esc(c.name)}</button>`).join('')}</div>` +
    `<div class="notice source-note"><p>Памятка не заменяет Инструкцию по ТО вагонов в эксплуатации. ${esc(P.source)}</p></div>` +
    P.columns.map((c, i) => `<section class="pamyatka-category" id="pam-c${i}"><div class="category-head"><div><b>${esc(c.name)}</b><small>${c.items.length} строк</small></div></div>` +
      pamGroups(c.items).map(g => (g.h ? `<h4 class="pam-sub">${esc(g.h)}</h4>` : '') + `<div class="pamyatka-items">${g.rows.map(x => x.t === 'r' ? `<div class="pam-row"><p>${esc(x.a)}</p><b>${esc(x.b)}</b></div>` : `<div class="pam-note ${x.s ? 'strong' : ''}">${esc(x.a)}</div>`).join('')}</div>`).join('') + `</section>`).join('');
  content.querySelectorAll('[data-pamjump]').forEach(btn => btn.onclick = () => document.getElementById(btn.dataset.pamjump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/* ---------------- поиск ---------------- */
function restoreAfterSearch() {
  results.classList.add('hidden');
  content.classList.remove('hidden');
  if (currentView === 'instr') setCrumbs('Инструкция по ТО вагонов', iLabel(activeI));
  else setCrumbs('Справочник', CRUMBS[currentView] || 'Главная');
}
function fold(s) {
  return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/й/g, 'и').replace(/[ьъ]/g, '');
}
function editCount(a, b) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 2) return 3;
  let prev = Array.from({ length: la + 1 }, (_, i) => i);
  for (let j = 1; j <= lb; j++) {
    const cur = [j];
    let best = j;
    for (let i = 1; i <= la; i++) {
      cur[i] = Math.min(prev[i] + 1, cur[i - 1] + 1, prev[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[i] < best) best = cur[i];
    }
    if (best > 2) return 3;
    prev = cur;
  }
  return prev[la];
}
function closeWord(w, token) {
  if (w === token || w[0] !== token[0] || Math.abs(w.length - token.length) > 2) return false;
  const d = editCount(w, token);
  if (d <= 1) return true;
  return d === 2 && w.length >= 5 && token.length >= 5 && w.slice(0, 4) === token.slice(0, 4);
}
let searchPack = null;
function ensureSearch() {
  if (searchPack) return searchPack;
  const docs = [], vocab = new Set();
  const add = (text, meta) => {
    const raw = String(text || '').trim();
    if (raw.length < 2) return;
    const folded = fold(raw);
    (folded.match(/[a-zа-я0-9]{4,}/g) || []).forEach(w => vocab.add(w));
    docs.push({ text: raw, folded, meta });
  };
  I.sections.forEach((s, i) => {
    const title = iLabel(i);
    const [a, b] = iRange(i);
    const first = ilines[a] || '';
    if (!fold(first).includes(fold(title))) add(title, { ii: i, needle: s.title });
    for (let j = a; j < b; j++) add(ilines[j], { ii: i, j: j - a, needle: String(ilines[j] || '').trim() });
  });
  P.columns.forEach((c, ci) => c.items.forEach(x => {
    const t = x.t === 'r' ? x.a + ' — ' + x.b : x.a;
    add(c.name + ' · ' + t, { pam: true, col: ci, needle: x.a });
  }));
  searchPack = { docs, vocab: [...vocab] };
  return searchPack;
}
function fuzzyAlts(token) {
  const { vocab } = ensureSearch();
  const out = [];
  for (const w of vocab) {
    if (w === token || w[0] !== token[0] || Math.abs(w.length - token.length) > 1) continue;
    if (closeWord(w, token)) out.push(w);
  }
  return out.slice(0, 8);
}
function lineMarks(line, tokens, alts) {
  const want = new Set(alts);
  const found = [];
  const re = /[A-Za-zА-Яа-яЁё0-9]+/g;
  let m;
  while ((m = re.exec(line))) {
    const f = fold(m[0]);
    if (want.has(f) || tokens.some(t => t.length >= 3 && (f === t || f.includes(t)))) found.push(m[0]);
  }
  return [...new Set(found)];
}
function markAny(text, parts) {
  let safe = esc(text);
  (parts || []).filter(p => p && p.length >= 3).sort((a, b) => b.length - a.length).forEach(p => {
    safe = safe.replace(new RegExp(escapeRegExp(p), 'gi'), m => `<mark>${m}</mark>`);
  });
  return safe;
}
let timerOn = false, timerAcc = 0, timerT0 = 0, timerTick = 0;
function timerNow() { return timerOn ? timerAcc + (Date.now() - timerT0) : timerAcc; }
function formatTimer(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(m)}:${pad(s % 60)}.${Math.floor((ms % 1000) / 100)}`;
}
function paintTimer() {
  const text = formatTimer(timerNow());
  const face = document.getElementById('timerFace');
  const btn = document.getElementById('timerToggle');
  const chip = document.getElementById('timerChip');
  if (face) face.textContent = text;
  if (btn) btn.textContent = timerOn ? 'Пауза' : (timerAcc ? 'Дальше' : 'Старт');
  if (chip) {
    chip.classList.toggle('hidden', !(timerOn || timerAcc));
    chip.textContent = text;
  }
  if (!timerOn && timerTick) { clearInterval(timerTick); timerTick = 0; }
}
function timerRun(on) {
  if (on && !timerOn) { timerOn = true; timerT0 = Date.now(); if (!timerTick) timerTick = setInterval(paintTimer, 100); }
  else if (!on && timerOn) { timerAcc += Date.now() - timerT0; timerOn = false; }
  paintTimer();
}
function renderTimer() {
  content.innerHTML = viewTitle('БЕЗ НОРМЫ ВРЕМЕНИ', 'Секундомер', 'Считает, сколько длится опробование. Сколько минут положено — не подсказывает.') +
    `<div class="timer-box"><b id="timerFace">00:00.0</b><div class="timer-actions"><button type="button" class="mini-btn" id="timerToggle">Старт</button><button type="button" class="mini-btn" id="timerReset">Сброс</button></div><p>Время идёт и на других экранах. Сброс обнуляет счёт.</p></div>`;
  paintTimer();
  document.getElementById('timerToggle').onclick = () => timerRun(!timerOn);
  document.getElementById('timerReset').onclick = () => { timerOn = false; timerAcc = 0; paintTimer(); };
}
function paintNet() {
  const el = document.getElementById('netBadge');
  if (!el) return;
  const off = !navigator.onLine;
  el.classList.toggle('off', off);
  el.textContent = off ? 'Без сети' : 'В памяти';
  el.title = off ? 'Сети нет. Справочник открыт из памяти телефона.' : 'Справочник сохранён на этом телефоне и откроется без сети.';
}
function allSearch(raw) {
  raw = String(raw ?? '');
  const q = raw.trim();
  if (document.activeElement !== search) search.value = raw;
  if (document.activeElement !== sideSearch) sideSearch.value = raw;
  const scope = searchScope.value;
  if (!q) { searchHits = []; restoreAfterSearch(); return; }
  const qFold = fold(q);
  const tokens = qFold.match(/[a-zа-я0-9]+/g) || [];
  const plan = tokens.map(t => ({ t, alts: t.length >= 4 ? fuzzyAlts(t) : [] }));
  const { docs } = ensureSearch();
  const hits = [];
  let fuzzyUsed = false;
  for (const doc of docs) {
    if (hits.length >= 200) break;
    if (scope === 'instr' && doc.meta.pam) continue;
    if (scope === 'pamyatka' && !doc.meta.pam) continue;
    const markWords = [];
    let ok = true, fuzzy = false;
    if (!plan.length) ok = doc.folded.includes(qFold);
    for (const p of plan) {
      if (doc.folded.includes(p.t)) continue;
      const alt = p.alts.find(w => doc.folded.includes(w));
      if (!alt) { ok = false; break; }
      fuzzy = true;
      markWords.push(alt);
    }
    if (!ok) continue;
    if (fuzzy) fuzzyUsed = true;
    const parts = lineMarks(doc.text, tokens, markWords);
    hits.push({ ...doc.meta, line: doc.text, parts });
  }
  searchHits = hits;
  setCrumbs('Справочник', 'Поиск', `«${q}»`);
  results.innerHTML = `<div class="search-head"><div><div class="eyebrow">${fuzzyUsed ? 'НАЙДЕНО С ОПЕЧАТКОЙ' : 'ПОИСК'}</div><h2>Результаты по «${esc(q)}»</h2></div><span>${hits.length}${hits.length >= 200 ? '+' : ''}</span></div>` +
    (hits.length ? hits.map((h, idx) => `<button class="result" data-hit="${idx}"><div><b>${h.pam ? 'ПАМЯТКА ОСМОТРЩИКА' : esc(iLabel(h.ii))}</b><small>${h.pam ? 'дополнительный источник' : (h.j != null ? 'строка ' + (h.j + 1) : 'раздел')}</small></div><p>${markAny(h.line, h.parts)}</p></button>`).join('') : '<div class="empty-result">Ничего не найдено</div>');
  results.classList.remove('hidden'); content.classList.add('hidden');
}
results.addEventListener('click', e => {
  const b = e.target.closest('.result'); if (!b) return;
  const h = searchHits[+b.dataset.hit]; if (!h) return;
  search.value = ''; sideSearch.value = '';
  if (h.pam) {
    showView('pamyatka', { noScroll: true });
    const col = document.getElementById('pam-c' + h.col);
    const nodes = col ? col.querySelectorAll('.pam-row, .pam-note, .pam-sub') : [];
    let target = col;
    const needle = String(h.needle || '').slice(0, 40);
    for (const el of nodes) if (needle && el.textContent.includes(needle)) { target = el; break; }
    target?.classList.add('jump-hit');
    paintWords(target, needle);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else showInstr(h.ii, { jump: h.needle || h.line });
});

/* ---------------- ссылки (#/instr/N, #/view/имя) ---------------- */
function setHash(h) { try { history.replaceState(null, '', '#/' + h); } catch (e) { /* ignore */ } }
function applyHash() {
  const h = location.hash.replace(/^#\/?/, ''); if (!h) return false;
  const [type, val = ''] = h.split('/');
  if (type === 'instr' && /^\d+$/.test(val) && I.sections[+val]) { showInstr(+val); return true; }
  if (type === 'view' && val) { showView(val); return true; }
  return false;
}
window.addEventListener('hashchange', () => applyHash());

/* ---------------- окно справки, клавиши, прокрутка, тема ---------------- */
const helpOverlay = document.getElementById('helpOverlay');
document.getElementById('helpBtn').onclick = () => helpOverlay.classList.remove('hidden');
document.getElementById('closeHelp').onclick = () => helpOverlay.classList.add('hidden');
helpOverlay.addEventListener('click', e => { if (e.target === helpOverlay) helpOverlay.classList.add('hidden'); });
document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select';
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) { e.preventDefault(); search.focus(); search.select(); return; }
  if ((e.key === '?') && !typing) { e.preventDefault(); helpOverlay.classList.remove('hidden'); return; }
  if (e.key === 'Escape') {
    if (typeof closeThemeMenu === 'function' && !document.getElementById('themeMenu').classList.contains('hidden')) { closeThemeMenu(); return; }
    if (!helpOverlay.classList.contains('hidden')) { helpOverlay.classList.add('hidden'); return; }
    if (sidebar.classList.contains('open')) { sidebar.classList.remove('open'); backdrop.classList.remove('show'); return; }
    if (!results.classList.contains('hidden') || e.target === search || e.target === sideSearch) {
      search.value = ''; sideSearch.value = '';
      if (document.activeElement === search || document.activeElement === sideSearch) search.blur();
      allSearch('');
      return;
    }
    if (typing) e.target.blur();
    return;
  }
  if (!typing && currentView === 'instr' && results.classList.contains('hidden') && helpOverlay.classList.contains('hidden') && !e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.key === 'ArrowLeft' && activeI > 0) { e.preventDefault(); showInstr(activeI - 1); }
    if (e.key === 'ArrowRight' && activeI < I.sections.length - 1) { e.preventDefault(); showInstr(activeI + 1); }
  }
});
const progressFill = document.getElementById('progressFill'), toTopBtn = document.getElementById('toTopBtn');
window.addEventListener('scroll', () => { const d = document.documentElement, h = d.scrollHeight - d.clientHeight; progressFill.style.width = (h > 0 ? d.scrollTop / h * 100 : 0) + '%'; toTopBtn.classList.toggle('hidden', d.scrollTop < 400); }, { passive: true });
toTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
(function initTheme() {
  const THEMES = ['night', 'rail', 'field', 'paper', 'day'];
  const legacy = { dark: 'night', light: 'paper' };
  const menu = document.getElementById('themeMenu');
  const btn = document.getElementById('themeBtn');
  const meta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(id, persist) {
    const theme = THEMES.includes(id) ? id : 'night';
    const same = document.body.dataset.theme === theme;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const paint = () => {
      document.body.dataset.theme = theme;
      if (meta) meta.content = getComputedStyle(document.body).getPropertyValue('--theme-bar').trim();
      menu.querySelectorAll('button').forEach(el => {
        const on = el.dataset.theme === theme;
        el.classList.toggle('on', on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      if (persist) {
        menu.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
      }
    };
    if (persist && !same && !reduce && document.startViewTransition) {
      const r = btn.getBoundingClientRect();
      document.documentElement.style.setProperty('--theme-x', (r.left + r.width / 2) + 'px');
      document.documentElement.style.setProperty('--theme-y', (r.top + r.height / 2) + 'px');
      document.startViewTransition(paint);
    } else {
      if (persist && !same && !reduce) document.documentElement.classList.add('theme-anim');
      paint();
      if (persist && !same && !reduce) setTimeout(() => document.documentElement.classList.remove('theme-anim'), 480);
    }
    if (persist) localStorage.setItem('rd_theme', theme);
  }
  const stored = legacy[localStorage.getItem('rd_theme')] || localStorage.getItem('rd_theme');
  if (THEMES.includes(stored)) applyTheme(stored, false);
  else {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    applyTheme(mq.matches ? 'paper' : 'night', false);
    mq.addEventListener?.('change', ev => { if (!localStorage.getItem('rd_theme')) applyTheme(ev.matches ? 'paper' : 'night', false); });
  }
  btn.onclick = (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  };
  menu.onclick = (e) => {
    const pick = e.target.closest('button[data-theme]');
    if (!pick) return;
    applyTheme(pick.dataset.theme, true);
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-wrap')) { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); }
  });
  window.closeThemeMenu = () => { menu.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); };
})();
function setFont(delta) { fontScale = Math.round(Math.min(1.45, Math.max(.9, fontScale + delta)) * 100) / 100; document.documentElement.style.setProperty('--font-scale', fontScale); localStorage.setItem('rd_font', String(fontScale)); }
document.getElementById('fontPlus').onclick = () => setFont(.1);
document.getElementById('fontMinus').onclick = () => setFont(-.1);

/* ---------------- запуск ---------------- */
const sidebar = document.getElementById('sidebar'), backdrop = document.getElementById('sidebarBackdrop');
document.getElementById('tocBtn').onclick = () => { sidebar.classList.toggle('open'); backdrop.classList.toggle('show'); };
document.getElementById('dock').onclick = (e) => {
  const b = e.target.closest('[data-dock]');
  if (!b) return;
  if (b.dataset.dock === 'menu') { sidebar.classList.toggle('open'); backdrop.classList.toggle('show'); return; }
  if (b.dataset.dock === 'search') {
    sidebar.classList.remove('open'); backdrop.classList.remove('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    search.focus();
    return;
  }
  showView(b.dataset.dock);
};
backdrop.onclick = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };
function closeSidebarMobile() { if (innerWidth < 900) { sidebar.classList.remove('open'); backdrop.classList.remove('show'); } }
document.getElementById('heroMeta').innerHTML = '<span>Полный текст</span><span>Единый поиск</span><span>Калькулятор ВУ-45</span>';
document.documentElement.style.setProperty('--font-scale', fontScale);
document.getElementById('timerChip').onclick = () => showView('timer');
paintNet();
window.addEventListener('online', paintNet);
window.addEventListener('offline', paintNet);
renderNav();
if (!applyHash()) renderOverview();
let searchTimer;
function queueSearch(value) { clearTimeout(searchTimer); searchTimer = setTimeout(() => allSearch(value), 120); }
search.oninput = () => queueSearch(search.value);
sideSearch.oninput = () => queueSearch(sideSearch.value);
searchScope.onchange = () => { if (search.value.trim()) allSearch(search.value); };
document.getElementById('resetBtn').onclick = () => { search.value = ''; sideSearch.value = ''; showView('overview'); };
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
  window.addEventListener('load', () => {
    const dropOld = navigator.serviceWorker.getRegistrations().then(regs => Promise.all(regs.filter(r => /\/assets\/sw\.js(?:\?|$)/.test((r.active || r.waiting || r.installing)?.scriptURL || '')).map(r => r.unregister()))).catch(() => {});
    dropOld.finally(() => { navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}); });
  });
}
