/* Справочник осмотрщика вагонов — логика интерфейса */
const I = window.INSTR_DATA, P = window.PAMYATKA_DATA, ilines = I.text.split('\n');
const nav = document.getElementById('sectionNav'), content = document.getElementById('content'),
      search = document.getElementById('search'), sideSearch = document.getElementById('sideSearch'),
      results = document.getElementById('results'), crumbs = document.getElementById('crumbs'),
      searchScope = document.getElementById('searchScope');
let activeI = 0, currentView = 'overview', fontScale = parseFloat(localStorage.getItem('rd_font') || '1') || 1, openGroups = {};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mark = (text, q) => { const safe = esc(text); return q ? safe.replace(new RegExp(escapeRegExp(q), 'gi'), m => `<mark>${m}</mark>`) : safe; };
const iRange = i => [I.sections[i].line, i + 1 < I.sections.length ? I.sections[i + 1].line : ilines.length];
const iLabel = i => (I.sections[i].num ? I.sections[i].num + '. ' : '') + I.sections[i].title;

let toastTimer;
function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }
function setCrumbs(...parts) { crumbs.innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<strong>${esc(p)}</strong>` : `<span>${esc(p)}</span><i>/</i>`).join(''); }
function viewTitle(eyebrow, title, desc) { return `<div class="view-title"><div><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2><p>${esc(desc)}</p></div></div>`; }

/* ---------------- меню ---------------- */
const QUICK = [{ view: 'vu45', label: 'Справка ВУ-45 · калькулятор', icon: '∑' }, { view: 'pamyatka', label: 'Памятка осмотрщика', icon: '✓' }];
const navButton = (label, view, icon) => `<button class="side-nav ${currentView === view ? 'active' : ''}" data-view="${view}"><span class="side-icon">${icon}</span><span>${esc(label)}</span></button>`;
function renderNav() {
  let html = navButton('Главная', 'overview', '⌂') + `<div class="nav-group">Быстрый доступ</div>` + QUICK.map(v => navButton(v.label, v.view, v.icon)).join('') + `<div class="nav-group">Инструкция по ТО вагонов</div>`;
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
}

/* ---------------- текст раздела ---------------- */
function renderBody(arr) {
  let html = '', para = [], pre = [];
  const flushPara = () => { if (para.length) { const t = para.join(' ').replace(/\s+/g, ' ').trim(); if (t) html += `<p>${esc(t)}</p>`; para = []; } };
  const flushPre = () => { if (pre.length) { html += `<pre class="source-table">${esc(pre.join('\n'))}</pre>`; pre = []; } };
  for (const raw of arr) {
    const line = raw.replace(/\f/g, '').replace(/\s+$/, ''), t = line.trim();
    if (!t) { flushPre(); flushPara(); continue; }
    const sub = t.match(/^(\d+(?:\.\d+){1,4})\s+(.{3,})$/), label = /^(Таблица|Приложение|Рисунок)\s+/i.test(t);
    if (sub && !/^\d+\s/.test(t)) { flushPre(); flushPara(); html += `<h3 id="i-${sub[1].replace(/\./g, '-')}"><span>${esc(sub[1])}</span> ${esc(sub[2])}</h3>`; continue; }
    if (label) { flushPre(); flushPara(); html += `<div class="document-label">${esc(t)}</div>`; continue; }
    if (/\s{3,}/.test(line) || /^\s*\d+[.)]?\s+/.test(line) || /^\s*[—–-]\s+/.test(line)) { flushPara(); pre.push(line); continue; }
    if (pre.length) flushPre();
    para.push(t);
  }
  flushPre(); flushPara();
  return html || '<p class="empty">Содержимое раздела отсутствует в текстовом представлении.</p>';
}
const subsectionIndex = arr => arr.map(x => { const m = x.trim().match(/^(\d+(?:\.\d+){1,4})\s+(.{3,})$/); return m && !/^\d+\s/.test(x.trim()) ? { n: m[1], title: m[2] } : null; }).filter(Boolean).slice(0, 100);
function printSection() { window.print(); }

function showInstr(i, opts = {}) {
  currentView = 'instr'; activeI = i;
  const gi = I.groups.findIndex(g => i >= g.range[0] && i < g.range[1]); if (gi >= 0) openGroups['g' + gi] = true;
  renderNav();
  const [a, b] = iRange(i), arr = ilines.slice(a, b), sec = I.sections[i];
  const words = arr.join(' ').split(/\s+/).filter(Boolean).length, readMin = Math.max(1, Math.round(words / 180)), subs = subsectionIndex(arr);
  const outline = subs.length ? `<div class="outline"><div class="outline-title">Пункты раздела</div>${subs.map(s => `<button onclick="document.getElementById('i-${s.n.replace(/\./g, '-')}')?.scrollIntoView({behavior:'smooth',block:'start'})"><b>${esc(s.n)}</b> ${esc(s.title)}</button>`).join('')}</div>` : '';
  setCrumbs('Инструкция по ТО вагонов', iLabel(i));
  const pv = i > 0 ? i - 1 : null, nx = i < I.sections.length - 1 ? i + 1 : null;
  const pager = `<div class="section-pager"><button class="pager-btn prev ${pv == null ? 'disabled' : ''}" ${pv != null ? `onclick="showInstr(${pv})"` : ''}><span class="pager-label">← Предыдущий</span>${pv != null ? `<b>${esc(iLabel(pv))}</b>` : ''}</button><button class="pager-btn next ${nx == null ? 'disabled' : ''}" ${nx != null ? `onclick="showInstr(${nx})"` : ''}><span class="pager-label">Следующий →</span>${nx != null ? `<b>${esc(iLabel(nx))}</b>` : ''}</button></div>`;
  content.innerHTML = `<div class="view-title"><div><div class="eyebrow">ИНСТРУКЦИЯ ПО ТО ВАГОНОВ В ЭКСПЛУАТАЦИИ</div><h2>${esc(sec.title)}</h2><p>стр. ${sec.page} оригинала · ${b - a} строк</p></div><button class="back-btn" onclick="showView('overview')">← Главная</button></div>` +
    `<article class="section-card"><div class="section-head"><span class="num">${esc(sec.num || '—')}</span><div><div class="section-kicker">Инструкция осмотрщику вагонов</div><h3>${esc(sec.title)}</h3></div></div>` +
    `<div class="section-actions"><span class="readtime">≈ ${readMin} мин чтения · ${words} слов</span><button class="mini-btn" onclick="printSection()">🖶 Печать</button>${/ВУ-45/.test(sec.title) ? `<button class="mini-btn" onclick="showView('vu45')">∑ Калькулятор ВУ-45</button>` : ''}</div>` +
    `${outline}<div class="rich-text">${renderBody(arr)}</div></article>` + pager;
  results.classList.add('hidden'); content.classList.remove('hidden');
  if (!opts.noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebarMobile();
  setHash('instr/' + i);
}

/* ---------------- прочие экраны ---------------- */
function showView(view) {
  if (!['overview', 'pamyatka', 'vu45'].includes(view)) view = 'overview';
  currentView = view; renderNav();
  results.classList.add('hidden'); content.classList.remove('hidden');
  setCrumbs('Справочник', { overview: 'Главная', pamyatka: 'Памятка осмотрщика', vu45: 'Справка ВУ-45' }[view]);
  ({ overview: renderOverview, pamyatka: renderPamyatka, vu45: renderVu45 })[view]();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebarMobile(); setHash('view/' + view);
}
function renderOverview() {
  const card = (go, icon, t, d) => `<button class="dash-card" onclick="${go}"><span>${icon}</span><b>${t}</b><small>${d}</small></button>`;
  content.innerHTML = `<div class="dashboard-grid">` +
    card("showView('vu45')", '∑', 'Справка ВУ-45', 'Калькулятор тормозного нажатия и порядок заполнения справки.') +
    card('showInstr(0)', '⚙', 'Инструкция по ТО вагонов', `Полный текст: ${I.sections.length} разделов и приложений.`) +
    card("showView('pamyatka')", '✓', 'Памятка осмотрщика', 'Краткие нормы по узлам, собранные по рабочим категориям.') + `</div>` +
    I.groups.map(g => `<div class="home-h"><b>${esc(g.label)}</b><span>${g.range[1] - g.range[0]} разд.</span></div><div class="idx-grid">` +
      Array.from({ length: g.range[1] - g.range[0] }, (_, k) => { const i = g.range[0] + k; return `<button class="section-index" onclick="showInstr(${i})"><span>${esc(I.sections[i].num || '•')}</span><div><b>${esc(I.sections[i].title)}</b></div><i>→</i></button>`; }).join('') + `</div>`).join('') +
    `<div class="notice"><p><b>Поиск:</b> введите запрос в строке сверху (Ctrl+K), он работает по Инструкции и памятке. Данные извлечены из документов автоматически — для ответственных решений сверяйтесь с оригиналами.</p></div>`;
}
function renderPamyatka() {
  const total = P.lines.length;
  content.innerHTML = viewTitle('ДОПОЛНИТЕЛЬНЫЙ ИСТОЧНИК', 'Памятка осмотрщику грузовых вагонов', `Краткие нормы, разложенные по рабочим категориям. Всего ${total} фрагментов.`) +
    `<div class="notice source-note"><b>Дополнительный источник</b><p>Памятка не заменяет Инструкцию по ТО вагонов в эксплуатации. Для проверки формулировок сверяйтесь с оригиналом памятки.</p></div>` +
    P.categories.map(c => `<section class="pamyatka-category"><div class="category-head"><div><b>${esc(c.category)}</b><small>${c.items.length} фрагментов</small></div></div><div class="pamyatka-items">${c.items.map(x => `<button type="button"><span>${x.n}</span><p>${esc(x.text)}</p></button>`).join('')}</div></section>`).join('');
}

/* ---------------- поиск ---------------- */
function allSearch(q) {
  q = q.trim(); const scope = searchScope.value, low = q.toLowerCase(), hits = [];
  if (!q) { showView(currentView === 'instr' ? 'overview' : currentView); return; }
  if (scope === 'all' || scope === 'instr') I.sections.forEach((s, i) => { const [a, b] = iRange(i); for (let j = a; j < b && hits.length < 200; j++) if (ilines[j].toLowerCase().includes(low)) hits.push({ ii: i, j: j - a, line: ilines[j].trim() }); });
  if (scope === 'all' || scope === 'pamyatka') P.categories.forEach(c => c.items.forEach(x => { if (hits.length < 200 && x.text.toLowerCase().includes(low)) hits.push({ pam: true, line: c.category + ' · ' + x.text }); }));
  setCrumbs('Справочник', 'Поиск', `«${q}»`);
  results.innerHTML = `<div class="search-head"><div><div class="eyebrow">ПОИСК</div><h2>Результаты по «${esc(q)}»</h2></div><span>${hits.length}${hits.length >= 200 ? '+' : ''}</span></div>` +
    (hits.length ? hits.map(h => `<button class="result" ${h.pam ? 'data-pam="1"' : `data-ii="${h.ii}"`}><div><b>${h.pam ? 'ПАМЯТКА ОСМОТРЩИКА' : esc(iLabel(h.ii))}</b><small>${h.pam ? 'дополнительный источник' : 'строка ' + (h.j + 1)}</small></div><p>${mark(h.line, q)}</p></button>`).join('') : '<div class="empty-result">Ничего не найдено</div>');
  results.classList.remove('hidden'); content.classList.add('hidden');
}
results.addEventListener('click', e => { const b = e.target.closest('.result'); if (!b) return; if (b.dataset.pam) showView('pamyatka'); else showInstr(+b.dataset.ii); });

/* ---------------- ссылки (#/instr/N, #/view/имя) ---------------- */
function setHash(h) { try { history.replaceState(null, '', '#/' + h); } catch (e) { /* ignore */ } }
function applyHash() {
  const h = location.hash.replace(/^#\/?/, ''); if (!h) return false;
  const [type, val = ''] = h.split('/');
  if (type === 'instr' && I.sections[+val]) { showInstr(+val); return true; }
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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.focus(); return; }
  if (e.key === '?' && !typing) { helpOverlay.classList.remove('hidden'); return; }
  if (e.key === 'Escape') {
    if (!helpOverlay.classList.contains('hidden')) { helpOverlay.classList.add('hidden'); return; }
    if (e.target === search || e.target === sideSearch) { search.value = ''; sideSearch.value = ''; search.blur(); showView(currentView === 'instr' ? 'overview' : currentView); return; }
    if (typing) e.target.blur(); return;
  }
  if (!typing && currentView === 'instr') { if (e.key === 'ArrowLeft' && activeI > 0) showInstr(activeI - 1); if (e.key === 'ArrowRight' && activeI < I.sections.length - 1) showInstr(activeI + 1); }
});
const progressFill = document.getElementById('progressFill'), toTopBtn = document.getElementById('toTopBtn');
window.addEventListener('scroll', () => { const d = document.documentElement, h = d.scrollHeight - d.clientHeight; progressFill.style.width = (h > 0 ? d.scrollTop / h * 100 : 0) + '%'; toTopBtn.classList.toggle('hidden', d.scrollTop < 400); }, { passive: true });
toTopBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
(function initTheme() {
  const stored = localStorage.getItem('rd_theme');
  if (stored) { document.body.classList.toggle('light', stored === 'light'); return; }
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  document.body.classList.toggle('light', mq.matches);
  mq.addEventListener?.('change', ev => { if (!localStorage.getItem('rd_theme')) document.body.classList.toggle('light', ev.matches); });
})();
document.getElementById('themeBtn').onclick = () => { const l = document.body.classList.toggle('light'); localStorage.setItem('rd_theme', l ? 'light' : 'dark'); };
function setFont(delta) { fontScale = Math.min(1.45, Math.max(.9, fontScale + delta)); document.documentElement.style.setProperty('--font-scale', fontScale); localStorage.setItem('rd_font', fontScale); }
document.getElementById('fontPlus').onclick = () => setFont(.1);
document.getElementById('fontMinus').onclick = () => setFont(-.1);

/* ---------------- запуск ---------------- */
const sidebar = document.getElementById('sidebar'), backdrop = document.getElementById('sidebarBackdrop');
document.getElementById('tocBtn').onclick = () => { sidebar.classList.toggle('open'); backdrop.classList.toggle('show'); };
backdrop.onclick = () => { sidebar.classList.remove('open'); backdrop.classList.remove('show'); };
function closeSidebarMobile() { if (innerWidth < 900) { sidebar.classList.remove('open'); backdrop.classList.remove('show'); } }
document.getElementById('heroMeta').innerHTML = '<span>Полный текст</span><span>Единый поиск</span><span>Калькулятор ВУ-45</span>';
document.documentElement.style.setProperty('--font-scale', fontScale);
renderNav();
if (!applyHash()) renderOverview();
let searchTimer;
search.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => allSearch(search.value), 120); };
sideSearch.oninput = () => { search.value = sideSearch.value; allSearch(search.value); };
searchScope.onchange = () => { if (search.value.trim()) allSearch(search.value); };
document.getElementById('resetBtn').onclick = () => { search.value = ''; sideSearch.value = ''; showView('overview'); };
if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) window.addEventListener('load', () => { navigator.serviceWorker.register('assets/sw.js').catch(() => {}); });
