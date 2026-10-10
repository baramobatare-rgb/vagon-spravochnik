/* Справка ВУ-45: порядок заполнения и калькулятор (по Приложению К).
   Таблица К.1: оси — как в тексте инструкции; башмаки — парами числитель/знаменатель
   (в текстовом слое PDF дробь была смещена по колонкам). */
const VU_PRESS = [1.25, 3, 3.5, 4.5, 5, 5.5, 6, 6.5, 7, 8, 8.5, 9, 10, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 18, 19, 20, 21];
/* [уклон, ручные оси на 100 т или null, башмаки при оси ≥10 тс, башмаки при оси <10 тс] */
const VU_SLOPES = [
  ['0', 0.4, 0.2, 0.4], ['0,002', 0.4, 0.2, 0.4], ['0,004', 0.4, 0.2, 0.4], ['0,006', 0.4, 0.2, 0.4],
  ['0,008', 0.6, 0.2, 0.6], ['0,010', 0.8, 0.3, 0.8], ['0,012', 1.0, 0.4, 1.0], ['0,014', 1.2, 0.4, 1.2],
  ['0,016', 1.4, 0.5, 1.4], ['0,018', 1.6, 0.6, 1.6], ['0,020', 1.8, 0.6, 1.8], ['0,022', null, 0.7, 2.0],
  ['0,024', null, 0.8, 2.2], ['0,026', null, 0.8, 2.4], ['0,028', null, 0.9, 2.6], ['0,030', null, 1.0, 2.8],
  ['0,032', null, 1.0, 3.0], ['0,034', null, 1.1, 3.2], ['0,036', null, 1.2, 3.4], ['0,038', null, 1.2, 3.6],
  ['0,040', null, 1.3, 3.8]
];
const vuNum = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const vuFmt = (n, d = 1) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d });
const vuKey = p => String(p).replace('.', '_');
const vuPad = n => String(n).padStart(2, '0');
/* Потребность в целых осях/башмаках: вверх, с защитой от двоичной погрешности. */
function vuNeed(per100, weight) {
  if (per100 == null || !(weight > 0)) return null;
  const raw = Math.round(weight * per100 / 100 * 1000) / 1000;
  return Math.ceil(raw - 1e-9);
}
function vuFresh() {
  const d = new Date();
  return { station: '', date: `${d.getFullYear()}-${vuPad(d.getMonth() + 1)}-${vuPad(d.getDate())}`, time: `${vuPad(d.getHours())}:${vuPad(d.getMinutes())}`, loco: '', train: '', weight: '', mode: '33', norm: '33', axesNat: '', slope: '0,010', handNorm: '0,8', handFact: '', list: [{ p: '', n: '' }], comp: '', rod: '', tight: '', feed: '', tail: '', ept: '', tailCar: '', fio: '' };
}
function vuNormalize(raw) {
  const vu = Object.assign(vuFresh(), raw && typeof raw === 'object' ? raw : {});
  if (!Array.isArray(vu.list) || !vu.list.length) vu.list = [{ p: '', n: '' }];
  vu.list = vu.list.map(r => r && typeof r === 'object' ? { p: r.p ?? '', n: r.n ?? '' } : { p: '', n: '' });
  return vu;
}
function vuReadBox() {
  try {
    const box = JSON.parse(localStorage.getItem('vu45_drafts') || 'null');
    if (box && box.items && box.items[box.active]) {
      Object.keys(box.items).forEach(id => { box.items[id].state = vuNormalize(box.items[id].state); box.items[id].name = String(box.items[id].name || 'Справка'); });
      return box;
    }
  } catch (e) { /* новая коробка */ }
  let legacy = {};
  try { legacy = JSON.parse(localStorage.getItem('vu45_state') || '{}'); } catch (e) { legacy = {}; }
  return { active: 'd1', items: { d1: { name: 'Текущая', state: vuNormalize(legacy) } } };
}
let vuBox = vuReadBox();
let vu = vuBox.items[vuBox.active].state;
function vuSave() {
  try {
    vuBox.items[vuBox.active].state = vu;
    localStorage.setItem('vu45_drafts', JSON.stringify(vuBox));
    localStorage.setItem('vu45_state', JSON.stringify(vu));
  } catch (e) { /* ignore */ }
}
function vuExportState() { vuBox.items[vuBox.active].state = vu; return vuBox; }
function vuImportState(box) {
  if (!box || !box.items || !box.items[box.active]) return false;
  vuBox = box;
  Object.keys(vuBox.items).forEach(id => { vuBox.items[id].state = vuNormalize(vuBox.items[id].state); vuBox.items[id].name = String(vuBox.items[id].name || 'Справка'); });
  vu = vuBox.items[vuBox.active].state;
  vuSave();
  return true;
}
function vuSwitch(id) {
  if (!vuBox.items[id] || id === vuBox.active) return;
  vuBox.items[vuBox.active].state = vu;
  vuBox.active = id;
  vu = vuBox.items[id].state;
  vuSave();
  renderVu45();
}
function vuNew() {
  const ids = Object.keys(vuBox.items);
  if (ids.length >= 20) { showToast('Уже 20 справок. Удалите лишнюю.'); return; }
  vuBox.items[vuBox.active].state = vu;
  const id = 'd' + Date.now().toString(36);
  vu = vuFresh();
  vuBox.items[id] = { name: 'Новая справка', state: vu };
  vuBox.active = id;
  vuSave();
  renderVu45();
  showToast('Новая справка');
}
function vuDrop() {
  const ids = Object.keys(vuBox.items);
  if (ids.length < 2) { showToast('Это единственная справка'); return; }
  delete vuBox.items[vuBox.active];
  vuBox.active = Object.keys(vuBox.items)[0];
  vu = vuBox.items[vuBox.active].state;
  vuSave();
  renderVu45();
  showToast('Справка удалена');
}
function vuPlain() {
  const c = vuCalc();
  const d = vu.date ? vu.date.split('-').reverse().join('.') : '';
  const lines = c.rows.map(r => `${vuFmt(r.p, 2)} тс × ${r.n} осей = ${vuFmt(r.n * r.p)} тс`);
  const name = vuBox.items[vuBox.active]?.name || 'Справка';
  return [
    `Справка ВУ-45 · ${name}`,
    `Станция: ${vu.station || '—'}`,
    `Дата ${d || '—'}, время ${vu.time || '—'}`,
    `Локомотив: ${vu.loco || '—'}`,
    `Поезд ${vu.train || '—'}, вес ${c.w ? vuFmt(c.w) : '—'} т, осей ${c.natAxes || c.axes || '—'}`,
    `Требуется ${c.w ? vuFmt(c.req) : '—'} тс, фактически ${vuFmt(c.fact)} тс${c.w ? (c.ok ? ' — хватает' : ' — не хватает') : ''}`,
    lines.join('\n') || 'Таблица нажатия пуста',
    `Ручные тормоза: нужно ${c.handReq || '—'}, указано ${vu.handFact || '—'}`,
    `Башмаки по К.1: ${c.shoeHi ?? '—'} при оси ≥ 10 тс, ${c.shoeLo ?? '—'} при оси < 10 тс`,
    vu.fio ? `Осмотрщик: ${vu.fio}` : ''
  ].filter(Boolean).join('\n');
}
async function vuShare() {
  const text = vuPlain();
  if (navigator.share) {
    try { await navigator.share({ title: 'Справка ВУ-45', text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); showToast('Текст справки скопирован'); }
  catch (e) { showToast('Не удалось скопировать'); }
}
const vuRows = () => vu.list.map(r => ({ p: vuNum(r.p), n: Math.floor(vuNum(r.n)) })).filter(r => r.p > 0 && r.n > 0);
const vuSlope = () => VU_SLOPES.find(x => x[0] === vu.slope) || null;

function vuCalc() {
  const w = vuNum(vu.weight), norm = vuNum(vu.norm), rows = vuRows();
  const axes = rows.reduce((a, r) => a + r.n, 0);
  const fact = rows.reduce((a, r) => a + r.n * r.p, 0);
  const req = w * norm / 100;
  const handPer = vuNum(vu.handNorm);
  const handReq = handPer > 0 ? vuNeed(handPer, w) : 0;
  const handFact = vuNum(vu.handFact);
  const slope = vuSlope();
  return {
    w, norm, rows, axes, fact, req, unit: w > 0 ? fact * 100 / w : 0,
    diff: fact - req, ok: w > 0 && fact + 1e-6 >= req,
    handReq: handReq || 0, handFact, natAxes: Math.floor(vuNum(vu.axesNat)),
    shoeHi: slope ? vuNeed(slope[2], w) : null, shoeLo: slope ? vuNeed(slope[3], w) : null,
    axesMissing: !!(slope && slope[1] == null)
  };
}
function vuDir() { const t = String(vu.train).trim(); return /\d$/.test(t) ? (+t.slice(-1) % 2 === 0 ? 'чётное направление' : 'нечётное направление') : ''; }
function vuOutHtml() {
  const c = vuCalc(), dir = vuDir(), st = [];
  if (c.w <= 0) st.push(`<div class="vu-status">Введите вес поезда и добавьте оси — расчёт появится здесь.</div>`);
  else if (c.ok) st.push(`<div class="vu-status ok">Нажатие обеспечено: запас ${vuFmt(c.diff)} тс.</div>`);
  else st.push(`<div class="vu-status bad">Не хватает ${vuFmt(-c.diff)} тс. Проверьте режимы тормозов и число включённых осей.</div>`);
  if (c.w > 0 && !(vuNum(vu.handNorm) > 0)) st.push(`<div class="vu-status bad">Ручные тормоза: для уклона ${esc(vu.slope)} в таблице К.1 стоит прочерк. Норму осей задаёт руководитель — введите «осей на 100 т».</div>`);
  else if (c.w > 0 && c.handReq > 0 && c.handFact <= 0) st.push(`<div class="vu-status">Ручные тормоза: нужно не менее ${c.handReq} осей. Фактическое число не указано.</div>`);
  else if (c.w > 0 && c.handReq > 0) st.push(`<div class="vu-status ${c.handFact >= c.handReq ? 'ok' : 'bad'}">Ручные тормоза: нужно ${c.handReq} осей, указано ${vuFmt(c.handFact, 0)}${c.handFact >= c.handReq ? ' — хватает' : ' — мало'}.</div>`);
  if (c.w > 0 && c.shoeHi != null) st.push(`<div class="vu-status">Башмаки по табл. К.1: ${c.shoeHi} при нагрузке на ось ≥ 10 тс или ${c.shoeLo} при нагрузке менее 10 тс.</div>`);
  if (c.natAxes > 0 && c.axes > 0 && c.natAxes !== c.axes) st.push(`<div class="vu-status bad">Осей в таблице тормозов ${c.axes}, по натурному листу ${c.natAxes}. В шапке справки — осей поезда, в таблице — включённые.</div>`);
  const pct = c.req > 0 ? Math.min(100, Math.round(c.fact / c.req * 100)) : 0;
  const trainAxes = c.natAxes > 0 ? c.natAxes : c.axes;
  return `<div class="vu-kpis"><div><span>Требуется</span><b>${vuFmt(c.req)}</b><small>тс</small></div><div><span>Фактически</span><b>${vuFmt(c.fact)}</b><small>тс</small></div><div><span>На 100 т веса</span><b>${c.w > 0 ? vuFmt(c.unit) : '—'}</b><small>тс</small></div><div><span>Осей поезда</span><b>${trainAxes || '—'}</b><small>${dir ? esc(dir) : (c.axes ? 'в таблице ' + c.axes : '&nbsp;')}</small></div></div><div class="vu-bar"><i class="${c.ok ? 'ok' : ''}" style="width:${pct}%"></i></div>${st.join('')}`;
}
function vuUpdate() {
  const out = document.getElementById('vuOut'); if (!out) return;
  out.innerHTML = vuOutHtml(); const c = vuCalc();
  vu.list.forEach((r, i) => { const el = document.getElementById('vur_' + i), p = vuNum(r.p), n = Math.floor(vuNum(r.n)); if (el) el.textContent = p > 0 && n > 0 ? vuFmt(p * n) + ' тс' : '—'; });
  const tot = document.getElementById('vuTot'); if (tot) tot.textContent = `${c.axes} осей в таблице · ${vuFmt(c.fact)} тс`;
}
function vuListHtml() {
  return vu.list.map((r, i) => `<div class="vu-row"><label><span>Нажатие на ось, тс</span><input data-i="${i}" data-f="p" list="vuPress" inputmode="decimal" value="${esc(r.p)}" placeholder="7,0"></label><label><span>Осей</span><input data-i="${i}" data-f="n" inputmode="numeric" value="${esc(r.n)}" placeholder="0"></label><output id="vur_${i}">—</output><button type="button" class="vu-del" data-del="${i}" title="Удалить строку" aria-label="Удалить строку">×</button></div>`).join('');
}
function vuRedrawList() { const list = document.getElementById('vuList'); if (list) list.innerHTML = vuListHtml(); vuSave(); vuUpdate(); }
function vuAdd(p = '') { const last = vu.list[vu.list.length - 1]; if (last && !last.p && !last.n && p) { last.p = String(p).replace('.', ','); } else vu.list.push({ p: p ? String(p).replace('.', ',') : '', n: '' }); vuRedrawList(); const n = document.querySelectorAll('#vuList input[data-f="n"]'); if (p && n.length) n[n.length - 1].focus(); }
function vuDel(i) { vu.list.splice(i, 1); if (!vu.list.length) vu.list.push({ p: '', n: '' }); vuRedrawList(); }
function vuInput(e) {
  const t = e.target, k = t && t.dataset && t.dataset.k, q = s => document.querySelector(s);
  if (!t || !t.dataset) return;
  if (t.dataset.draft === 'name') {
    vuBox.items[vuBox.active].name = t.value;
    vuSave();
    return;
  }
  if (k) vu[k] = t.value; else if (t.dataset.i !== undefined && t.dataset.f) vu.list[+t.dataset.i][t.dataset.f] = t.value; else return;
  if (k === 'mode' && t.value !== 'custom') { vu.norm = t.value; const n = q('[data-k="norm"]'); if (n) n.value = vu.norm; }
  if (k === 'norm') { vu.mode = ['33', '55'].includes(String(t.value).trim()) ? String(t.value).trim() : 'custom'; const m = q('[data-k="mode"]'); if (m) m.value = vu.mode; }
  if (k === 'slope') {
    const s = VU_SLOPES.find(x => x[0] === t.value);
    if (s) { vu.handNorm = s[1] == null ? '' : String(s[1]).replace('.', ','); const h = q('[data-k="handNorm"]'); if (h) h.value = vu.handNorm; }
  }
  vuSave(); vuUpdate();
}
function vuReset() { vu = vuFresh(); vuSave(); renderVu45(); showToast('Справка очищена'); }
function vuExample() {
  vu = Object.assign(vuFresh(), { station: 'Пример', loco: 'ВЛ80С-000', train: '2001', weight: '4000', axesNat: '240', slope: '0,010', handNorm: '0,8', handFact: '32', list: [{ p: '3,5', n: '20' }, { p: '5', n: '8' }, { p: '7', n: '200' }, { p: '10', n: '12' }] });
  vuSave(); renderVu45(); showToast('Загружен пример из Приложения К');
}
function vuPrintHtml() {
  const c = vuCalc(), d = vu.date ? vu.date.split('-').reverse().join('.') : '', x = v => esc(v || '____');
  const rows = c.rows.map(r => `<tr><td>${vuFmt(r.p, 2)}</td><td>${r.n}</td><td>${vuFmt(r.n * r.p)}</td></tr>`).join('');
  const trainAxes = c.natAxes > 0 ? c.natAxes : (c.axes || '____');
  return `<div class="vu-sheet"><div class="vu-sheet-h"><span>Форма ВУ-45</span><span>Штемпель станции: ${x(vu.station)}</span><span>Время выдачи ${x(vu.time)}</span></div><h2>СПРАВКА<br><small>об обеспечении поезда тормозами и исправном их действии</small></h2>
  <p>Локомотив серия, № <b>${x(vu.loco)}</b> &nbsp; Дата <b>${x(d)}</b></p><p>Поезд № <b>${x(vu.train)}</b> весом <b>${c.w ? vuFmt(c.w) : '____'}</b> т. Всего осей <b>${trainAxes}</b></p>
  <p>Требуемое нажатие колодок: <b>${c.w ? vuFmt(c.req) : '____'}</b> тс &nbsp; Ручных тормозов в осях: <b>${x(vu.handFact)}</b> (требуется ${c.w && c.handReq ? c.handReq : '____'})</p>
  <table><thead><tr><th>Тормозное нажатие на ось, тс</th><th>Количество осей</th><th>Нажатие колодок, тс</th></tr></thead><tbody>${rows || '<tr><td colspan="3">&nbsp;</td></tr>'}<tr><th>Всего</th><th>${c.axes}</th><th>${vuFmt(c.fact)}</th></tr></tbody></table>
  <p>Другие данные: композиционных колодок ${x(vu.comp)} %; выход штока ТЦ хвостового вагона ${x(vu.rod)} мм</p>
  <p>Плотность тормозной сети (II/IV положения крана): ${x(vu.tight)} &nbsp; Плотность питательной сети: ${x(vu.feed)}</p>
  <p>Давление в ТМ хвостового вагона (ДПВ): ${x(vu.tail)} &nbsp; Напряжение в хвосте поезда: ${x(vu.ept)}</p>
  <p>Хвостовой вагон № ${x(vu.tailCar)} &nbsp; Подпись ________ &nbsp; Фамилия ${x(vu.fio)}</p></div>`;
}
function vuPrint() {
  let r = document.getElementById('vuPrintRoot'); if (!r) { r = document.createElement('div'); r.id = 'vuPrintRoot'; document.body.appendChild(r); }
  r.innerHTML = vuPrintHtml(); document.body.classList.add('print-vu');
  let finished = false;
  const mql = window.matchMedia('print');
  const done = () => {
    if (finished) return; finished = true;
    document.body.classList.remove('print-vu');
    window.removeEventListener('afterprint', done);
    mql.removeEventListener?.('change', onMedia);
  };
  const onMedia = e => { if (!e.matches) done(); };
  window.addEventListener('afterprint', done);
  mql.addEventListener?.('change', onMedia);
  window.print();
  setTimeout(done, 120000);
}
function renderVu45() {
  const f = (label, k, attrs = '') => `<label class="vu-field"><span>${label}</span><input data-k="${k}" value="${esc(vu[k])}" ${attrs}></label>`;
  const known = VU_SLOPES.some(s => s[0] === vu.slope);
  const slopeOpts = (known ? '' : `<option value="${esc(vu.slope)}" selected>${esc(vu.slope)} (сохранённое)</option>`) + VU_SLOPES.map(s => `<option value="${s[0]}" ${vu.slope === s[0] ? 'selected' : ''}>${s[0]}${s[1] == null ? ' — оси задаёт руководитель' : ''}</option>`).join('');
  const chips = [3.5, 5, 7, 10].map(p => `<button type="button" class="vu-chip" data-add="${p}">+ ${vuFmt(p, 2)} тс</button>`).join('');
  const draftOpts = Object.keys(vuBox.items).map(id => `<option value="${esc(id)}" ${id === vuBox.active ? 'selected' : ''}>${esc(vuBox.items[id].name)}</option>`).join('');
  content.innerHTML = `<div class="vu-head"><div><div class="eyebrow">КАЛЬКУЛЯТОР</div><h2>Справка ВУ-45</h2><p>Справка об обеспечении поезда тормозами и исправном их действии</p></div><div class="vu-actions"><button type="button" class="mini-btn" id="vuExampleBtn">Пример</button><button type="button" class="mini-btn" id="vuPrintBtn">Печать</button><button type="button" class="mini-btn" id="vuResetBtn">Очистить</button></div></div>` +
    `<div class="vu-drafts"><label class="vu-field"><span>Черновики</span><select id="vuDraft">${draftOpts}</select></label><label class="vu-field"><span>Название</span><input data-draft="name" value="${esc(vuBox.items[vuBox.active].name)}" maxlength="40"></label><button type="button" class="mini-btn" id="vuNewBtn">Новая</button><button type="button" class="mini-btn" id="vuShareBtn">Отправить</button><button type="button" class="mini-btn" id="vuDropBtn">Удалить</button></div>` +
    `<details class="vu-steps"><summary>Порядок заполнения справки (Приложение К)</summary><ol>
      <li>После полного опробования тормозов (или сокращённого, если ранее на станции выполнено полное) справку составляют под копирку в двух экземплярах.</li>
      <li>Вносят: штемпель станции, время вручения и номер вагона встречи осмотрщиков, дату, серию и номер локомотива, номер поезда (последняя цифра чётная — чётное направление), вес поезда (грузового — без локомотива), число вагонов и осей.</li>
      <li>Требуемое нажатие = вес в тоннах × наименьшее нажатие на 100 т ÷ 100 (в Инструкции: 33 тс гружёный, 55 тс порожний). Пример: 4000 × 33 ÷ 100 = 1320 тс. В бланке вес исторически подписан «тс».</li>
      <li>В таблице: нажатие на ось, число включённых осей и их произведение; внизу суммы. «Всего осей» в шапке — оси поезда по натурному листу, сумма таблицы — только включённые в тормоз.</li>
      <li>Ручные тормоза и башмаки — по таблице К.1 на каждые 100 т. Потребность округляется вверх до целой оси и целого башмака. При уклоне 0,010 это 0,8 оси на 100 т (для 4000 т — 32 оси) и башмаки 0,3 / 0,8. Круче 0,020 число осей задаёт руководитель, башмаки остаются по таблице.</li>
      <li>Подлинник вручают машинисту, копия хранится в книжке справок 7 суток. При смене бригад без отцепки локомотива — сокращённое опробование с отметкой времени на обороте; при изменении длины состава — отметка с номером хвостового вагона.</li></ol></details>` +
    `<div class="vu-layout"><div class="vu-main">
      <section class="vu-card"><h3><i>1</i>Поезд</h3><div class="vu-grid">${f('Штемпель станции', 'station')}${f('Дата', 'date', 'type="date"')}${f('Время выдачи', 'time', 'type="time"')}${f('Локомотив: серия, №', 'loco')}${f('Номер поезда', 'train', 'inputmode="numeric"')}${f('Вес без локомотива, т', 'weight', 'inputmode="decimal"')}${f('Осей поезда по натурному листу', 'axesNat', 'inputmode="numeric" placeholder="шапка справки"')}</div></section>
      <section class="vu-card"><h3><i>2</i>Тормозное нажатие колодок</h3><div class="vu-grid vu-grid2"><label class="vu-field"><span>Режим поезда</span><select data-k="mode"><option value="33" ${vu.mode === '33' ? 'selected' : ''}>Гружёный — 33 тс на 100 т</option><option value="55" ${vu.mode === '55' ? 'selected' : ''}>Порожний — 55 тс на 100 т</option><option value="custom" ${vu.mode === 'custom' ? 'selected' : ''}>Своё значение</option></select></label>${f('Наименьшее нажатие на 100 т, тс', 'norm', 'inputmode="decimal"')}</div>
        <div id="vuList" class="vu-list">${vuListHtml()}</div><datalist id="vuPress">${VU_PRESS.map(p => `<option value="${String(p).replace('.', ',')}">`).join('')}</datalist>
        <div class="vu-addbar"><button type="button" class="mini-btn" id="vuAddBtn">+ Добавить строку</button><span class="vu-hint">быстро:</span>${chips}<b id="vuTot" class="vu-tot"></b></div></section>
      <section class="vu-card"><h3><i>3</i>Ручные тормоза и башмаки</h3><div class="vu-grid"><label class="vu-field"><span>Уклон (таблица К.1)</span><select data-k="slope">${slopeOpts}</select></label>${f('Осей на 100 т (норма)', 'handNorm', 'inputmode="decimal"')}${f('Осей фактически', 'handFact', 'inputmode="numeric"')}</div></section>
      <details class="vu-card vu-more"><summary><h3><i>4</i>Дополнительные данные</h3></summary><div class="vu-grid">${f('Композиционных колодок, %', 'comp')}${f('Выход штока ТЦ хвост. вагона, мм', 'rod')}${f('Плотность тормозной сети (II/IV)', 'tight')}${f('Плотность питательной сети', 'feed')}${f('Давление в ТМ хвоста, ДПВ', 'tail')}${f('Напряжение в хвосте поезда, В', 'ept')}${f('Хвостовой вагон №', 'tailCar')}${f('Фамилия осмотрщика', 'fio')}</div></details>
    </div><aside class="vu-side"><div class="vu-sticky"><h3>Результат</h3><div id="vuOut"></div></div></aside></div>` +
    `<div class="vu-note"><b>Важно.</b> Калькулятор вспомогательный. Нормы 33/55 тс на 100 т и таблица К.1 взяты из Приложения К; пары башмаков сверены с нормативной раскладкой числитель/знаменатель, потому что в текстовом слое PDF они стояли не в своих столбцах. Действующие нормативы вашей дороги могут отличаться. Дата и время справки сохраняются в этом браузере и не сбрасываются при обновлении страницы.</div>`;
  content.oninput = vuInput;
  content.onclick = e => {
    const add = e.target.closest('[data-add]');
    const del = e.target.closest('[data-del]');
    if (add) vuAdd(add.dataset.add);
    else if (del) vuDel(+del.dataset.del);
    else if (e.target.id === 'vuAddBtn') vuAdd();
    else if (e.target.id === 'vuExampleBtn') vuExample();
    else if (e.target.id === 'vuPrintBtn') vuPrint();
    else if (e.target.id === 'vuResetBtn') vuReset();
    else if (e.target.id === 'vuNewBtn') vuNew();
    else if (e.target.id === 'vuShareBtn') vuShare();
    else if (e.target.id === 'vuDropBtn') vuDrop();
  };
  const draftSel = document.getElementById('vuDraft');
  if (draftSel) draftSel.onchange = () => vuSwitch(draftSel.value);
  vuUpdate();
}
