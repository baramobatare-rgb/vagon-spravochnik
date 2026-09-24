/* Справка ВУ-45: порядок заполнения и калькулятор (по Приложению К Инструкции по ТО вагонов в эксплуатации) */
const VU_PRESS = [1.25, 3, 3.5, 4.5, 5, 5.5, 6, 6.5, 7, 8, 8.5, 9, 10, 11, 11.5, 12, 12.5, 13, 14, 15, 16, 18, 19, 20, 21];
const VU_SLOPES = [['0', 0.4], ['0,002', 0.4], ['0,004', 0.4], ['0,006', 0.4], ['0,008', 0.6], ['0,010', 0.8], ['0,012', 1.0], ['0,014', 1.2], ['0,016', 1.4], ['0,018', 1.6], ['0,020', 1.8]];
const vuNum = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const vuFmt = (n, d = 1) => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d });
const vuKey = p => String(p).replace('.', '_');
const vuPad = n => String(n).padStart(2, '0');
function vuFresh() {
  const d = new Date();
  return { station: '', date: `${d.getFullYear()}-${vuPad(d.getMonth() + 1)}-${vuPad(d.getDate())}`, time: `${vuPad(d.getHours())}:${vuPad(d.getMinutes())}`, loco: '', train: '', weight: '', mode: '33', norm: '33', axesNat: '', slope: '0,010', handNorm: '0,8', handFact: '', list: [{ p: '', n: '' }], comp: '', rod: '', tight: '', feed: '', tail: '', tailCar: '', fio: '' };
}
let vu;
try { vu = Object.assign(vuFresh(), JSON.parse(localStorage.getItem('vu45_state') || '{}')); const f = vuFresh(); vu.date = f.date; vu.time = f.time; if (!Array.isArray(vu.list) || !vu.list.length) vu.list = [{ p: '', n: '' }]; } catch (e) { vu = vuFresh(); }
const vuSave = () => { try { localStorage.setItem('vu45_state', JSON.stringify(vu)); } catch (e) { /* ignore */ } };
const vuRows = () => vu.list.map(r => ({ p: vuNum(r.p), n: Math.floor(vuNum(r.n)) })).filter(r => r.p > 0 && r.n > 0);

function vuCalc() {
  const w = vuNum(vu.weight), norm = vuNum(vu.norm), rows = vuRows();
  const axes = rows.reduce((a, r) => a + r.n, 0), fact = rows.reduce((a, r) => a + r.n * r.p, 0);
  const req = w * norm / 100, handReq = w * vuNum(vu.handNorm) / 100, handFact = vuNum(vu.handFact);
  return { w, norm, rows, axes, fact, req, unit: w > 0 ? fact * 100 / w : 0, diff: fact - req, ok: w > 0 && fact >= req, handReq, handFact, natAxes: Math.floor(vuNum(vu.axesNat)) };
}
function vuDir() { const t = String(vu.train).trim(); return /\d$/.test(t) ? (+t.slice(-1) % 2 === 0 ? 'чётное направление' : 'нечётное направление') : ''; }
function vuOutHtml() {
  const c = vuCalc(), dir = vuDir(), st = [];
  if (c.w <= 0) st.push(`<div class="vu-status">Введите вес поезда и добавьте оси — расчёт появится здесь.</div>`);
  else if (c.ok) st.push(`<div class="vu-status ok">✔ Нажатие обеспечено: запас ${vuFmt(c.diff)} тс.</div>`);
  else st.push(`<div class="vu-status bad">✖ Не хватает ${vuFmt(-c.diff)} тс. Проверьте режимы тормозов и число включённых осей.</div>`);
  if (c.w > 0 && c.handReq > 0) st.push(`<div class="vu-status ${c.handFact >= c.handReq ? 'ok' : 'bad'}">Ручные тормоза: нужно ${vuFmt(c.handReq)} осей, ${c.handFact ? 'указано ' + vuFmt(c.handFact) : 'число не указано'}${c.handFact >= c.handReq ? ' ✔' : ' — мало'}.</div>`);
  if (c.natAxes > 0 && c.natAxes !== c.axes) st.push(`<div class="vu-status bad">⚠ Осей в таблице ${c.axes}, по натурному листу ${c.natAxes}.</div>`);
  const pct = c.req > 0 ? Math.min(100, Math.round(c.fact / c.req * 100)) : 0;
  return `<div class="vu-kpis"><div><span>Требуется</span><b>${vuFmt(c.req)}</b><small>тс</small></div><div><span>Фактически</span><b>${vuFmt(c.fact)}</b><small>тс</small></div><div><span>На 100 т веса</span><b>${c.w > 0 ? vuFmt(c.unit) : '—'}</b><small>тс</small></div><div><span>Всего осей</span><b>${c.axes}</b><small>${dir ? esc(dir) : '&nbsp;'}</small></div></div><div class="vu-bar"><i class="${c.ok ? 'ok' : ''}" style="width:${pct}%"></i></div>${st.join('')}`;
}
function vuUpdate() {
  const out = document.getElementById('vuOut'); if (!out) return;
  out.innerHTML = vuOutHtml(); const c = vuCalc();
  vu.list.forEach((r, i) => { const el = document.getElementById('vur_' + i), p = vuNum(r.p), n = Math.floor(vuNum(r.n)); if (el) el.textContent = p > 0 && n > 0 ? vuFmt(p * n) + ' тс' : '—'; });
  document.getElementById('vuTot').textContent = `${c.axes} осей · ${vuFmt(c.fact)} тс`;
}
function vuListHtml() {
  return vu.list.map((r, i) => `<div class="vu-row"><label><span>Нажатие на ось, тс</span><input data-i="${i}" data-f="p" list="vuPress" inputmode="decimal" value="${esc(r.p)}" placeholder="7,0"></label><label><span>Осей</span><input data-i="${i}" data-f="n" inputmode="numeric" value="${esc(r.n)}" placeholder="0"></label><output id="vur_${i}">—</output><button class="vu-del" onclick="vuDel(${i})" title="Удалить строку" aria-label="Удалить строку">×</button></div>`).join('');
}
function vuRedrawList() { document.getElementById('vuList').innerHTML = vuListHtml(); vuSave(); vuUpdate(); }
function vuAdd(p = '') { const last = vu.list[vu.list.length - 1]; if (last && !last.p && !last.n && p) { last.p = String(p).replace('.', ','); } else vu.list.push({ p: p ? String(p).replace('.', ',') : '', n: '' }); vuRedrawList(); const n = document.querySelectorAll('#vuList input[data-f="n"]'); if (p && n.length) n[n.length - 1].focus(); }
function vuDel(i) { vu.list.splice(i, 1); if (!vu.list.length) vu.list.push({ p: '', n: '' }); vuRedrawList(); }
function vuInput(e) {
  const t = e.target, k = t.dataset.k, q = s => document.querySelector(s);
  if (k) vu[k] = t.value; else if (t.dataset.i !== undefined) vu.list[+t.dataset.i][t.dataset.f] = t.value; else return;
  if (k === 'mode' && t.value !== 'custom') { vu.norm = t.value; q('[data-k="norm"]').value = vu.norm; }
  if (k === 'norm') { vu.mode = ['33', '55'].includes(t.value.trim()) ? t.value.trim() : 'custom'; q('[data-k="mode"]').value = vu.mode; }
  if (k === 'slope') { const s = VU_SLOPES.find(x => x[0] === t.value); if (s) { vu.handNorm = String(s[1]).replace('.', ','); q('[data-k="handNorm"]').value = vu.handNorm; } }
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
  return `<div class="vu-sheet"><div class="vu-sheet-h"><span>Форма ВУ-45</span><span>Штемпель станции: ${x(vu.station)}</span><span>Время выдачи ${x(vu.time)}</span></div><h2>СПРАВКА<br><small>об обеспечении поезда тормозами и исправном их действии</small></h2>
  <p>Локомотив серия, № <b>${x(vu.loco)}</b> &nbsp; Дата <b>${x(d)}</b></p><p>Поезд № <b>${x(vu.train)}</b> весом <b>${c.w ? vuFmt(c.w) : '____'}</b> тс. Всего осей <b>${c.axes || '____'}</b></p>
  <p>Требуемое нажатие колодок: <b>${c.w ? vuFmt(c.req) : '____'}</b> тс &nbsp; Ручных тормозов в осях: <b>${x(vu.handFact)}</b> (требуется ${c.w ? vuFmt(c.handReq) : '____'})</p>
  <table><thead><tr><th>Тормозное нажатие на ось, тс</th><th>Количество осей</th><th>Нажатие колодок, тс</th></tr></thead><tbody>${rows || '<tr><td colspan="3">&nbsp;</td></tr>'}<tr><th>Всего</th><th>${c.axes}</th><th>${vuFmt(c.fact)}</th></tr></tbody></table>
  <p>Другие данные: композиционных колодок ${x(vu.comp)} %; выход штока ТЦ хвостового вагона ${x(vu.rod)} мм</p><p>Плотность тормозной сети (II/IV положения крана): ${x(vu.tight)} &nbsp; Плотность питательной сети: ${x(vu.feed)} &nbsp; Давление в хвосте поезда: ${x(vu.tail)}</p>
  <p>Хвостовой вагон № ${x(vu.tailCar)} &nbsp; Подпись ________ &nbsp; Фамилия ${x(vu.fio)}</p></div>`;
}
function vuPrint() {
  let r = document.getElementById('vuPrintRoot'); if (!r) { r = document.createElement('div'); r.id = 'vuPrintRoot'; document.body.appendChild(r); }
  r.innerHTML = vuPrintHtml(); document.body.classList.add('print-vu');
  const done = () => document.body.classList.remove('print-vu');
  window.addEventListener('afterprint', done, { once: true }); document.addEventListener('click', done, { once: true });
  window.print(); setTimeout(done, 1500);
}
function renderVu45() {
  const f = (label, k, attrs = '') => `<label class="vu-field"><span>${label}</span><input data-k="${k}" value="${esc(vu[k])}" ${attrs}></label>`;
  const slopeOpts = VU_SLOPES.map(s => `<option value="${s[0]}" ${vu.slope === s[0] ? 'selected' : ''}>${s[0]}</option>`).join('') + `<option value="x" ${vu.slope === 'x' ? 'selected' : ''}>круче 0,020 — норму задаёт руководитель</option>`;
  const chips = [3.5, 5, 7, 10].map(p => `<button type="button" class="vu-chip" onclick="vuAdd(${p})">+ ${vuFmt(p, 2)} тс</button>`).join('');
  content.innerHTML = `<div class="vu-head"><div><div class="eyebrow">КАЛЬКУЛЯТОР</div><h2>Справка ВУ-45</h2><p>Справка об обеспечении поезда тормозами и исправном их действии</p></div><div class="vu-actions"><button class="mini-btn" onclick="vuExample()">Пример</button><button class="mini-btn" onclick="vuPrint()">🖶 Печать</button><button class="mini-btn" onclick="vuReset()">Очистить</button></div></div>` +
    `<details class="vu-steps"><summary>Порядок заполнения справки (Приложение К)</summary><ol>
      <li>После полного опробования тормозов (или сокращённого, если ранее на станции выполнено полное) справку составляют под копирку в двух экземплярах.</li>
      <li>Вносят: штемпель станции, время вручения и номер вагона встречи осмотрщиков, дату, серию и номер локомотива, номер поезда (последняя цифра чётная — чётное направление), вес поезда (грузового — без локомотива), число вагонов и осей.</li>
      <li>Требуемое нажатие = вес × наименьшее нажатие на 100 т ÷ 100 (в Инструкции: 33 тс груженый, 55 тс порожний поезд). Пример: 4000 × 33 ÷ 100 = 1320 тс.</li>
      <li>В таблице: нажатие на ось, число осей и их произведение; внизу суммы. В графе «другие данные» — тип колодок, ВО и др.</li>
      <li>Ручные тормоза: потребность на 100 т берут по таблице К.1 в зависимости от уклона (при 0,010 — 0,8 оси на 100 т; для 4000 т это 32 оси).</li>
      <li>Подлинник вручают машинисту, копия хранится в книжке справок 7 суток. При смене бригад без отцепки локомотива — сокращённое опробование с отметкой времени на обороте; при изменении длины состава — отметка с номером хвостового вагона.</li></ol></details>` +
    `<div class="vu-layout"><div class="vu-main">
      <section class="vu-card"><h3><i>1</i>Поезд</h3><div class="vu-grid">${f('Штемпель станции', 'station')}${f('Дата', 'date', 'type="date"')}${f('Время выдачи', 'time', 'type="time"')}${f('Локомотив: серия, №', 'loco')}${f('Номер поезда', 'train', 'inputmode="numeric"')}${f('Вес без локомотива, тс', 'weight', 'inputmode="decimal"')}${f('Осей по натурному листу', 'axesNat', 'inputmode="numeric" placeholder="для проверки"')}</div></section>
      <section class="vu-card"><h3><i>2</i>Тормозное нажатие колодок</h3><div class="vu-grid vu-grid2"><label class="vu-field"><span>Режим поезда</span><select data-k="mode"><option value="33" ${vu.mode === '33' ? 'selected' : ''}>Груженый — 33 тс на 100 т</option><option value="55" ${vu.mode === '55' ? 'selected' : ''}>Порожний — 55 тс на 100 т</option><option value="custom" ${vu.mode === 'custom' ? 'selected' : ''}>Своё значение</option></select></label>${f('Наименьшее нажатие на 100 т, тс', 'norm', 'inputmode="decimal"')}</div>
        <div id="vuList" class="vu-list">${vuListHtml()}</div><datalist id="vuPress">${VU_PRESS.map(p => `<option value="${String(p).replace('.', ',')}">`).join('')}</datalist>
        <div class="vu-addbar"><button type="button" class="mini-btn" onclick="vuAdd()">+ Добавить строку</button><span class="vu-hint">быстро:</span>${chips}<b id="vuTot" class="vu-tot"></b></div></section>
      <section class="vu-card"><h3><i>3</i>Ручные тормоза</h3><div class="vu-grid"><label class="vu-field"><span>Уклон (таблица К.1)</span><select data-k="slope">${slopeOpts}</select></label>${f('Осей на 100 т (норма)', 'handNorm', 'inputmode="decimal"')}${f('Осей фактически', 'handFact', 'inputmode="numeric"')}</div></section>
      <details class="vu-card vu-more"><summary><h3><i>4</i>Дополнительные данные</h3></summary><div class="vu-grid">${f('Композиционных колодок, %', 'comp')}${f('Выход штока ТЦ хвост. вагона, мм', 'rod')}${f('Плотность тормозной сети (II/IV)', 'tight')}${f('Плотность питательной сети', 'feed')}${f('Давление в хвосте поезда', 'tail')}${f('Хвостовой вагон №', 'tailCar')}${f('Фамилия осмотрщика', 'fio')}</div></details>
    </div><aside class="vu-side"><div class="vu-sticky"><h3>Результат</h3><div id="vuOut"></div></div></aside></div>` +
    `<div class="vu-note"><b>Важно.</b> Калькулятор — вспомогательный инструмент. Нормы (33/55 тс на 100 т, таблица К.1) взяты из Приложения К Инструкции 2009 года, значения таблицы К.1 извлечены автоматически. Действующие нормативы могут отличаться — сверяйтесь с правилами вашей дороги. Данные хранятся только в этом браузере.</div>`;
  content.oninput = vuInput; vuUpdate();
}
