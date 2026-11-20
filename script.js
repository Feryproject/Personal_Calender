/* =========================================================
   Kalender Pribadi – Reza Alfiandy
   JavaScript Vanilla + LocalStorage
   ========================================================= */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     1. Konstanta & state
     --------------------------------------------------------- */
  const STORAGE_KEY = 'rezaAlfiandy.kalenderPribadi.v1';
  const MAX_PILLS = 3;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  const CATEGORIES = [
    { id: 'pribadi',    name: 'Pribadi',    rgb: '167,139,250' },
    { id: 'pekerjaan',  name: 'Pekerjaan',  rgb: '96,165,250'  },
    { id: 'pendidikan', name: 'Pendidikan', rgb: '74,222,128'  },
    { id: 'pertemuan',  name: 'Pertemuan',  rgb: '251,146,60'  },
    { id: 'lainnya',    name: 'Lainnya',    rgb: '244,114,182' }
  ];

  const ICONS = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 21h16"/>',
    upload: '<path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M4 21h16"/>'
  };

  const state = {
    events: [],
    view: { year: new Date().getFullYear(), month: new Date().getMonth() },
    selectedDate: '',
    calFilter: 'semua',
    editingId: null,
    dayKey: '',
    todayKey: '',
    storageOk: true
  };

  /* ---------------------------------------------------------
     2. Utilitas
     --------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name, size = 18) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach((node) => {
      node.innerHTML = icon(node.dataset.icon, Number(node.dataset.size) || 18);
    });
  }

  const pad = (n) => String(n).padStart(2, '0');
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => toKey(new Date());
  const formatDMY = (k) => { const [y, m, d] = k.split('-'); return `${d}/${m}/${y}`; };
  const dayName = (d) => DAYS[(d.getDay() + 6) % 7];
  const formatLong = (k) => { const d = parseKey(k); return `${dayName(d)}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
  const dayDiff = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

  function isValidDateKey(k) {
    if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
    const d = parseKey(k);
    return toKey(d) === k && d.getFullYear() >= 1900 && d.getFullYear() <= 2100;
  }

  const isValidTime = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

  function normalizeTime(value) {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
    if (!digits) return '';
    let hh, mm;
    if (digits.length <= 2) { hh = digits.padStart(2, '0'); mm = '00'; }
    else if (digits.length === 3) { hh = '0' + digits[0]; mm = digits.slice(1); }
    else { hh = digits.slice(0, 2); mm = digits.slice(2); }
    return `${hh}:${mm}`;
  }

  const byTime = (a, b) =>
    a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title, 'id');

  const getCat = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  const findEvent = (id) => state.events.find((e) => e.id === id);
  const timeRange = (ev) => (ev.end ? `${ev.start} – ${ev.end}` : ev.start);

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------------------------------------------------
     3. LocalStorage
     --------------------------------------------------------- */
  function normalizeEvent(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 100) : '';
    const date = typeof raw.date === 'string' ? raw.date : '';
    const start = typeof raw.start === 'string' ? raw.start : '';
    let end = typeof raw.end === 'string' ? raw.end : '';
    if (!title || !isValidDateKey(date) || !isValidTime(start)) return null;
    if (end && (!isValidTime(end) || end <= start)) end = '';
    return {
      id: typeof raw.id === 'string' && raw.id && raw.id.length <= 64 ? raw.id : generateId(),
      title,
      date,
      start,
      end,
      category: CATEGORIES.some((c) => c.id === raw.category) ? raw.category : 'lainnya',
      description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : '',
      done: raw.done === true,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
    };
  }

  function checkStorage() {
    try {
      const k = STORAGE_KEY + '.uji';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (err) {
      return false;
    }
  }

  function loadEvents() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.map(normalizeEvent).filter(Boolean);
    } catch (err) {
      console.error('Gagal membaca data:', err);
      try { if (raw) localStorage.setItem(STORAGE_KEY + '.rusak', raw); } catch (e) { /* abaikan */ }
      setTimeout(() => toast('Data tersimpan tidak dapat dibaca. Salinan data lama disimpan terpisah.', 'error'), 300);
      return [];
    }
  }

  function saveEvents() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events));
      return true;
    } catch (err) {
      console.error('Gagal menyimpan data:', err);
      toast('Gagal menyimpan data ke penyimpanan peramban.', 'error');
      return false;
    }
  }

  /* ---------------------------------------------------------
     4. Notifikasi (toast), modal, dialog konfirmasi
     --------------------------------------------------------- */
  function toast(message, type = 'success') {
    const t = el('div', `toast toast-${type}`, message);
    $('#toasts').append(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 260);
    }, 3200);
  }

  const modalStack = [];
  const lastFocus = new Map();

  function openModal(id, focusSelector) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (!modalStack.includes(id)) {
      modalStack.push(id);
      lastFocus.set(id, document.activeElement);
    }
    modal.hidden = false;
    document.body.classList.add('modal-open');
    const target = (focusSelector && $(focusSelector, modal)) || $('.modal', modal);
    requestAnimationFrame(() => { if (target && target.focus) target.focus(); });
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    const i = modalStack.indexOf(id);
    if (i > -1) modalStack.splice(i, 1);
    if (!modalStack.length) document.body.classList.remove('modal-open');
    const prev = lastFocus.get(id);
    lastFocus.delete(id);
    if (prev && document.contains(prev) && typeof prev.focus === 'function') prev.focus();
  }

  let confirmResolver = null;

  function finishConfirm(value) {
    const resolve = confirmResolver;
    confirmResolver = null;
    closeModal('modalConfirm');
    if (resolve) resolve(value);
  }

  function askChoice({ title, message, buttons }) {
    return new Promise((resolve) => {
      if (confirmResolver) finishConfirm(null);
      $('#cTitle').textContent = title;
      $('#cMessage').textContent = message;
      const box = $('#cButtons');
      box.replaceChildren();
      buttons.forEach((b) => {
        const btn = el('button', `btn btn-${b.variant || 'ghost'}`, b.label);
        btn.type = 'button';
        btn.addEventListener('click', () => finishConfirm(b.value));
        box.append(btn);
      });
      confirmResolver = resolve;
      openModal('modalConfirm', '#cButtons .btn:last-child');
    });
  }

  /* ---------------------------------------------------------
     5. Komponen daftar catatan
     --------------------------------------------------------- */
  function actionButton(action, id, label, iconName, extraClass) {
    const b = el('button', `btn btn-sm ${extraClass}`);
    b.type = 'button';
    b.dataset.action = action;
    b.dataset.id = id;
    b.innerHTML = icon(iconName, 14);
    b.append(el('span', '', label));
    return b;
  }

  function buildEventItem(ev, opts = {}) {
    const cat = getCat(ev.category);
    const item = el('article', 'event-item' + (ev.done ? ' is-done' : ''));
    item.style.setProperty('--rgb', cat.rgb);
    item.dataset.id = ev.id;

    const check = el('button', 'check-btn');
    const checkLabel = ev.done ? 'Tandai belum selesai' : 'Tandai selesai';
    check.type = 'button';
    check.dataset.action = 'toggle';
    check.dataset.id = ev.id;
    check.title = checkLabel;
    check.setAttribute('aria-label', `${checkLabel}: ${ev.title}`);
    check.setAttribute('aria-pressed', String(ev.done));
    check.innerHTML = icon('check', 14);

    const body = el('div', 'event-body');
    body.append(el('h3', 'event-title', ev.title));

    const meta = el('div', 'event-meta');
    if (opts.showDate) meta.append(el('span', '', formatDMY(ev.date)));
    meta.append(el('span', '', timeRange(ev)));
    meta.append(el('span', 'badge', cat.name));
    meta.append(el('span', 'status ' + (ev.done ? 'status-done' : 'status-pending'), ev.done ? 'Selesai' : 'Belum Selesai'));
    body.append(meta);
    if (ev.description) body.append(el('p', 'event-desc', ev.description));

    const actions = el('div', 'event-actions');
    actions.append(
      actionButton('edit', ev.id, 'Ubah', 'edit', 'btn-ghost'),
      actionButton('delete', ev.id, 'Hapus', 'trash', 'btn-ghost-danger')
    );

    item.append(check, body, actions);
    return item;
  }

  function fillList(container, list, emptyText, opts) {
    container.replaceChildren();
    if (!list.length) {
      container.append(el('div', 'empty', emptyText));
      return;
    }
    const frag = document.createDocumentFragment();
    list.forEach((ev) => frag.append(buildEventItem(ev, opts)));
    container.append(frag);
  }

  /* ---------------------------------------------------------
     6. Halaman Beranda
     --------------------------------------------------------- */
  function greeting(hour) {
    if (hour < 11) return 'pagi';
    if (hour < 15) return 'siang';
    if (hour < 18) return 'sore';
    return 'malam';
  }

  function renderHome() {
    const now = new Date();
    const today = toKey(now);
    const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    $('#homeGreeting').textContent = `Selamat ${greeting(now.getHours())}, Reza. Hari ini ${formatLong(today)}.`;

    const todays = state.events.filter((e) => e.date === today).sort(byTime);
    const done = todays.filter((e) => e.done).length;
    $('#statTotal').textContent = todays.length;
    $('#statDone').textContent = done;
    $('#statPending').textContent = todays.length - done;

    // Catatan berikutnya
    const box = $('#nextEvent');
    box.replaceChildren();
    const next = state.events
      .filter((e) => !e.done && (e.date > today || (e.date === today && e.start >= nowTime)))
      .sort(byTime)[0];

    if (!next) {
      box.append(el('div', 'empty', 'Tidak ada catatan berikutnya.'));
    } else {
      let label;
      const diff = dayDiff(today, next.date);
      if (diff === 0) {
        const [h, m] = next.start.split(':').map(Number);
        const minutes = h * 60 + m - (now.getHours() * 60 + now.getMinutes());
        if (minutes <= 0) label = 'Sekarang';
        else if (minutes < 60) label = `Dimulai ${minutes} menit lagi`;
        else label = `Dimulai ${Math.floor(minutes / 60)} jam${minutes % 60 ? ' ' + (minutes % 60) + ' menit' : ''} lagi`;
      } else if (diff === 1) {
        label = `Besok, ${next.start}`;
      } else {
        label = `${diff} hari lagi`;
      }
      box.append(el('span', 'next-when', label));
      box.append(buildEventItem(next, { showDate: true }));
    }

    const empty = el('div', 'empty', 'Belum ada catatan hari ini.');
    fillList($('#todayList'), todays, 'Belum ada catatan hari ini.', {});
    void empty;
  }

  /* ---------------------------------------------------------
     7. Halaman Kalender
     --------------------------------------------------------- */
  function buildTabs() {
    const tabs = $('#calTabs');
    tabs.replaceChildren();
    const items = [{ id: 'semua', name: 'Semua Catatan' }, ...CATEGORIES];
    items.forEach((c) => {
      const b = el('button', 'tab');
      b.type = 'button';
      b.dataset.filter = c.id;
      b.setAttribute('role', 'tab');
      if (c.rgb) {
        const dot = el('i', 'dot');
        dot.style.setProperty('--rgb', c.rgb);
        b.append(dot);
      }
      b.append(document.createTextNode(c.name));
      tabs.append(b);
    });
    updateTabs();
  }

  function updateTabs() {
    $$('#calTabs .tab').forEach((b) => {
      const on = b.dataset.filter === state.calFilter;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  function renderCalendar() {
    const { year, month } = state.view;
    const today = todayKey();
    const now = new Date();

    $('#calTitle').textContent = `${MONTHS[month]} ${year}`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    $('#calRange').textContent = `${formatDMY(toKey(new Date(year, month, 1)))} – ${formatDMY(toKey(new Date(year, month, lastDay)))}`;
    $('#badgeMonth').textContent = MONTHS[now.getMonth()].slice(0, 3).toUpperCase();
    $('#badgeDay').textContent = now.getDate();

    // Kelompokkan catatan per tanggal (sesuai filter kategori)
    const map = new Map();
    state.events.forEach((ev) => {
      if (state.calFilter !== 'semua' && ev.category !== state.calFilter) return;
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date).push(ev);
    });
    map.forEach((list) => list.sort(byTime));

    const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Senin = 0
    const rows = Math.ceil((offset + lastDay) / 7);
    const frag = document.createDocumentFragment();

    for (let i = 0; i < rows * 7; i++) {
      const d = new Date(year, month, 1 - offset + i);
      const key = toKey(d);
      const outside = d.getMonth() !== month;
      const list = map.get(key) || [];

      const cell = el('div', 'cell' + (outside ? ' is-outside' : '') + (key === today ? ' is-today' : '') + (key === state.selectedDate ? ' is-selected' : ''));
      cell.dataset.action = 'open-day';
      cell.dataset.date = key;
      cell.tabIndex = 0;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `${formatLong(key)}${key === today ? ' (hari ini)' : ''}, ${list.length} catatan`);

      const numText = outside && d.getDate() === 1 ? `1 ${MONTHS[d.getMonth()].slice(0, 3)}` : String(d.getDate());
      cell.append(el('span', 'cell-num', numText));

      // Tampilan desktop: kotak catatan
      list.slice(0, MAX_PILLS).forEach((ev) => {
        const pill = el('div', 'pill' + (ev.done ? ' is-done' : ''));
        pill.style.setProperty('--rgb', getCat(ev.category).rgb);
        pill.title = `${ev.title} (${timeRange(ev)})`;
        pill.append(el('span', 'pill-title', ev.title), el('span', 'pill-time', ev.start));
        cell.append(pill);
      });
      if (list.length > MAX_PILLS) {
        cell.append(el('div', 'cell-more', `${list.length - MAX_PILLS} lainnya…`));
      }

      // Tampilan HP: indikator titik
      if (list.length) {
        const dots = el('div', 'dots');
        list.slice(0, 4).forEach((ev) => {
          const dot = el('i', 'dot' + (ev.done ? ' is-done' : ''));
          dot.style.setProperty('--rgb', getCat(ev.category).rgb);
          dots.append(dot);
        });
        if (list.length > 4) dots.append(el('span', 'dots-count', `+${list.length - 4}`));
        cell.append(dots);
      }

      frag.append(cell);
    }
    $('#calGrid').replaceChildren(frag);
  }

  function shiftMonth(delta) {
    const d = new Date(state.view.year, state.view.month + delta, 1);
    state.view = { year: d.getFullYear(), month: d.getMonth() };
    renderCalendar();
  }

  function goToday() {
    const now = new Date();
    state.view = { year: now.getFullYear(), month: now.getMonth() };
    state.selectedDate = toKey(now);
    renderCalendar();
  }

  /* ---------------------------------------------------------
     8. Modal catatan pada tanggal
     --------------------------------------------------------- */
  function renderDay() {
    const key = state.dayKey;
    if (!key) return;
    const list = state.events.filter((e) => e.date === key).sort(byTime);
    const done = list.filter((e) => e.done).length;
    $('#dayTitle').textContent = formatLong(key);
    $('#daySub').textContent = list.length
      ? `${formatDMY(key)} · ${list.length} catatan · ${done} selesai`
      : `${formatDMY(key)} · Belum ada catatan`;
    fillList($('#dayList'), list, 'Belum ada catatan pada tanggal ini.', {});
  }

  function openDay(key) {
    state.selectedDate = key;
    state.dayKey = key;
    renderDay();
    renderCalendar();
    openModal('modalDay');
  }

  /* ---------------------------------------------------------
     9. Pencarian & filter
     --------------------------------------------------------- */
  function searchEvents() {
    const q = $('#sQuery').value.trim().toLowerCase();
    const cat = $('#sCategory').value;
    const date = $('#sDate').value;
    const status = $('#sStatus').value;
    return state.events
      .filter((ev) =>
        (!q || ev.title.toLowerCase().includes(q)) &&
        (!cat || ev.category === cat) &&
        (!date || ev.date === date) &&
        (!status || (status === 'selesai' ? ev.done : !ev.done)))
      .sort(byTime);
  }

  function renderSearch() {
    const results = searchEvents();
    const filtering = $('#sQuery').value.trim() || $('#sCategory').value || $('#sDate').value || $('#sStatus').value;
    $('#sCount').textContent = results.length
      ? `${results.length} catatan ditemukan`
      : (filtering ? 'Tidak ada catatan yang cocok.' : 'Belum ada catatan tersimpan.');
    fillList($('#sResults'), results, filtering ? 'Tidak ada catatan yang cocok dengan pencarian Anda.' : 'Belum ada catatan tersimpan.', { showDate: true });
  }

  function openSearch() {
    renderSearch();
    openModal('modalSearch', '#sQuery');
  }

  function resetSearch() {
    $('#sQuery').value = '';
    $('#sCategory').value = '';
    $('#sDate').value = '';
    $('#sStatus').value = '';
    renderSearch();
    $('#sQuery').focus();
  }

  /* ---------------------------------------------------------
     10. Formulir tambah / ubah catatan
     --------------------------------------------------------- */
  const FIELD_IDS = { title: 'fTitle', date: 'fDate', start: 'fStart', end: 'fEnd', desc: 'fDesc' };

  function buildCategoryUI() {
    const group = $('#fCategory');
    group.replaceChildren();
    CATEGORIES.forEach((c, i) => {
      const label = el('label', 'chip');
      label.style.setProperty('--rgb', c.rgb);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'category';
      input.value = c.id;
      if (i === 0) input.checked = true;
      const face = el('span', 'chip-face');
      const dot = el('i', 'dot');
      face.append(dot, document.createTextNode(c.name));
      label.append(input, face);
      group.append(label);
    });

    const select = $('#sCategory');
    CATEGORIES.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.append(opt);
    });
  }

  function clearErrors() {
    Object.keys(FIELD_IDS).forEach((k) => {
      $('#' + FIELD_IDS[k]).classList.remove('is-invalid');
      $('#err-' + k).textContent = '';
    });
  }

  function showErrors(errors) {
    clearErrors();
    Object.keys(errors).forEach((k) => {
      $('#' + FIELD_IDS[k]).classList.add('is-invalid');
      $('#err-' + k).textContent = errors[k];
    });
    const first = Object.keys(FIELD_IDS).find((k) => errors[k]);
    if (first) $('#' + FIELD_IDS[first]).focus();
  }

  function readForm() {
    const checked = $('input[name="category"]:checked', $('#eventForm'));
    return {
      title: $('#fTitle').value.trim(),
      date: $('#fDate').value,
      start: normalizeTime($('#fStart').value),
      end: normalizeTime($('#fEnd').value),
      category: checked ? checked.value : CATEGORIES[0].id,
      description: $('#fDesc').value.trim()
    };
  }

  function validateForm(data) {
    const errors = {};
    const timeHint = 'Gunakan format 24 jam HH:MM (contoh: 08:30).';

    if (!data.title) errors.title = 'Nama catatan wajib diisi.';
    else if (data.title.length > 100) errors.title = 'Nama catatan maksimal 100 karakter.';

    if (!data.date) errors.date = 'Tanggal catatan wajib diisi.';
    else if (!isValidDateKey(data.date)) errors.date = 'Tanggal tidak valid (tahun 1900–2100).';

    if (!data.start) errors.start = 'Jam mulai wajib diisi.';
    else if (!isValidTime(data.start)) errors.start = timeHint;

    if (data.end) {
      if (!isValidTime(data.end)) errors.end = timeHint;
      else if (isValidTime(data.start) && data.end <= data.start) errors.end = 'Jam selesai harus setelah jam mulai.';
    }

    if (data.description.length > 500) errors.desc = 'Deskripsi maksimal 500 karakter.';
    return errors;
  }

  function openForm(opts = {}) {
    clearErrors();
    const ev = opts.id ? findEvent(opts.id) : null;
    state.editingId = ev ? ev.id : null;

    $('#formTitle').textContent = ev ? 'Ubah Catatan' : 'Tambah Catatan';
    $('#fTitle').value = ev ? ev.title : '';
    $('#fDate').value = ev ? ev.date : (isValidDateKey(opts.date) ? opts.date : todayKey());
    $('#fStart').value = ev ? ev.start : '';
    $('#fEnd').value = ev ? ev.end : '';
    $('#fDesc').value = ev ? ev.description : '';

    const catId = ev ? ev.category : CATEGORIES[0].id;
    $$('input[name="category"]', $('#eventForm')).forEach((r) => { r.checked = r.value === catId; });

    openModal('modalForm', '#fTitle');
  }

  function handleSubmit(e) {
    e.preventDefault();
    const data = readForm();
    const errors = validateForm(data);
    if (Object.keys(errors).length) { showErrors(errors); return; }
    clearErrors();

    // Tampilkan hasil normalisasi jam pada kolom
    $('#fStart').value = data.start;
    $('#fEnd').value = data.end;

    let message;
    if (state.editingId) {
      const ev = findEvent(state.editingId);
      if (ev) Object.assign(ev, data);
      message = 'Catatan berhasil diperbarui.';
    } else {
      state.events.push({ id: generateId(), ...data, done: false, createdAt: Date.now() });
      message = 'Catatan berhasil disimpan.';
    }

    saveEvents();
    state.selectedDate = data.date;
    const d = parseKey(data.date);
    state.view = { year: d.getFullYear(), month: d.getMonth() };
    state.editingId = null;
    closeModal('modalForm');
    renderAll();
    toast(message);
  }

  /* ---------------------------------------------------------
     11. Aksi catatan (ubah status, hapus)
     --------------------------------------------------------- */
  function toggleDone(id) {
    const ev = findEvent(id);
    if (!ev) return;
    ev.done = !ev.done;
    saveEvents();
    renderAll();
    toast(ev.done ? 'Catatan ditandai selesai.' : 'Catatan ditandai belum selesai.', 'info');
  }

  async function deleteEvent(id) {
    const ev = findEvent(id);
    if (!ev) return;
    const choice = await askChoice({
      title: 'Hapus catatan?',
      message: `Catatan "${ev.title}" pada ${formatDMY(ev.date)} akan dihapus secara permanen.`,
      buttons: [
        { label: 'Batal', value: null, variant: 'ghost' },
        { label: 'Hapus', value: 'hapus', variant: 'danger' }
      ]
    });
    if (choice !== 'hapus') return;
    state.events = state.events.filter((e) => e.id !== id);
    saveEvents();
    renderAll();
    toast('Catatan berhasil dihapus.');
  }

  /* ---------------------------------------------------------
     12. Pengaturan: cadangkan & pulihkan
     --------------------------------------------------------- */
  function renderSettings() {
    const total = state.events.length;
    const done = state.events.filter((e) => e.done).length;
    $('#setTotal').textContent = total;
    $('#setDone').textContent = done;
    $('#setPending').textContent = total - done;
  }

  function backupData() {
    if (!state.events.length) {
      toast('Belum ada catatan untuk dicadangkan.', 'info');
      return;
    }
    const payload = {
      aplikasi: 'Kalender Pribadi',
      pengguna: 'Reza Alfiandy',
      versi: 1,
      diekspor: new Date().toISOString(),
      catatan: state.events
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kalender-reza-alfiandy-${todayKey()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(`Cadangan diunduh (${state.events.length} catatan).`);
  }

  async function restoreData(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { toast('Ukuran file terlalu besar (maksimal 5 MB).', 'error'); return; }
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
      toast('File harus berformat JSON.', 'error');
      return;
    }

    let json;
    try {
      json = JSON.parse(await file.text());
    } catch (err) {
      toast('File tidak dapat dibaca atau bukan JSON yang valid.', 'error');
      return;
    }

    const list = Array.isArray(json) ? json : (json && Array.isArray(json.catatan) ? json.catatan : (json && Array.isArray(json.kegiatan) ? json.kegiatan : null));
    if (!list) { toast('Struktur file tidak sesuai. Gunakan file cadangan dari aplikasi ini.', 'error'); return; }

    const valid = [];
    let skipped = 0;
    const seen = new Set();
    list.forEach((item) => {
      const ev = normalizeEvent(item);
      if (!ev || seen.has(ev.id)) { skipped++; return; }
      seen.add(ev.id);
      valid.push(ev);
    });
    if (!valid.length) { toast('Tidak ada catatan yang valid di dalam file.', 'error'); return; }

    const choice = await askChoice({
      title: 'Pulihkan data catatan?',
      message: `File berisi ${valid.length} catatan valid${skipped ? ` (${skipped} data dilewati karena tidak valid)` : ''}. Saat ini tersimpan ${state.events.length} catatan. "Gabungkan" menambahkan ke data yang ada, sedangkan "Ganti Semua" menimpa seluruh data saat ini.`,
      buttons: [
        { label: 'Batal', value: null, variant: 'ghost' },
        { label: 'Gabungkan', value: 'gabung', variant: 'primary' },
        { label: 'Ganti Semua', value: 'ganti', variant: 'danger' }
      ]
    });
    if (!choice) return;

    if (choice === 'ganti') {
      state.events = valid;
      toast(`Data diganti dengan ${valid.length} catatan dari file.`);
    } else {
      let added = 0, updated = 0;
      valid.forEach((ev) => {
        const i = state.events.findIndex((e) => e.id === ev.id);
        if (i > -1) { state.events[i] = ev; updated++; } else { state.events.push(ev); added++; }
      });
      toast(`Pemulihan selesai: ${added} ditambahkan, ${updated} diperbarui.`);
    }
    saveEvents();
    renderAll();
  }

  async function clearAll() {
    if (!state.events.length) { toast('Tidak ada data untuk dihapus.', 'info'); return; }
    const choice = await askChoice({
      title: 'Hapus semua data?',
      message: `Seluruh ${state.events.length} catatan akan dihapus permanen dari peramban ini dan tidak dapat dikembalikan, kecuali Anda punya file cadangan.`,
      buttons: [
        { label: 'Batal', value: null, variant: 'ghost' },
        { label: 'Hapus Semua', value: 'hapus', variant: 'danger' }
      ]
    });
    if (choice !== 'hapus') return;
    state.events = [];
    saveEvents();
    renderAll();
    toast('Seluruh data catatan telah dihapus.');
  }

  /* ---------------------------------------------------------
     13. Navigasi halaman
     --------------------------------------------------------- */
  const PAGES = ['beranda', 'kalender', 'pengaturan'];

  function showPage(page) {
    if (!PAGES.includes(page)) page = 'beranda';
    $$('.page').forEach((s) => s.classList.toggle('is-active', s.id === 'page-' + page));
    $$('.nav-link').forEach((a) => {
      const on = a.dataset.page === page;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  const pageFromHash = () => location.hash.replace('#', '');

  /* ---------------------------------------------------------
     14. Render keseluruhan
     --------------------------------------------------------- */
  function renderAll() {
    state.todayKey = todayKey();
    renderHome();
    renderCalendar();
    renderSettings();
    if (!$('#modalDay').hidden) renderDay();
    if (!$('#modalSearch').hidden) renderSearch();
  }

  /* ---------------------------------------------------------
     15. Event listener
     --------------------------------------------------------- */
  function bindEvents() {
    // Delegasi klik untuk seluruh aksi
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const id = t.dataset.id;
      switch (t.dataset.action) {
        case 'toggle': toggleDone(id); break;
        case 'edit': openForm({ id }); break;
        case 'delete': deleteEvent(id); break;
        case 'add':
          openForm({ date: t.dataset.date === 'today' ? todayKey() : (t.dataset.date || state.selectedDate) });
          break;
        case 'open-day': openDay(t.dataset.date); break;
        case 'open-search': openSearch(); break;
        default: break;
      }
    });

    // Tutup modal (tombol X / Batal / klik latar)
    document.addEventListener('click', (e) => {
      const closer = e.target.closest('[data-close]');
      if (closer) {
        const backdrop = closer.closest('.modal-backdrop');
        if (backdrop) closeModal(backdrop.id);
        return;
      }
      if (e.target.classList.contains('modal-backdrop')) {
        if (e.target.id === 'modalConfirm') finishConfirm(null);
        else if (e.target.id !== 'modalForm') closeModal(e.target.id);
      }
    });

    // Keyboard: Escape & perangkap fokus pada modal
    document.addEventListener('keydown', (e) => {
      if (!modalStack.length) return;
      const topId = modalStack[modalStack.length - 1];
      const modal = document.getElementById(topId);
      if (e.key === 'Escape') {
        e.preventDefault();
        if (topId === 'modalConfirm') finishConfirm(null); else closeModal(topId);
        return;
      }
      if (e.key === 'Tab' && modal) {
        const focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
          .filter((n) => !n.disabled && n.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const box = $('.modal', modal);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });

    // Kalender: navigasi
    $('#btnPrev').addEventListener('click', () => shiftMonth(-1));
    $('#btnNext').addEventListener('click', () => shiftMonth(1));
    $('#btnToday').addEventListener('click', goToday);
    $('#calGrid').addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('cell')) {
        e.preventDefault();
        openDay(e.target.dataset.date);
      }
    });
    $('#calTabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      state.calFilter = b.dataset.filter;
      updateTabs();
      renderCalendar();
    });

    // Modal tanggal
    $('#btnDayAdd').addEventListener('click', () => openForm({ date: state.dayKey }));

    // Formulir
    $('#eventForm').addEventListener('submit', handleSubmit);
    ['fStart', 'fEnd'].forEach((id) => {
      const input = $('#' + id);
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '').slice(0, 4);
        input.value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
      });
      input.addEventListener('blur', () => {
        if (input.value) input.value = normalizeTime(input.value);
      });
    });
    Object.keys(FIELD_IDS).forEach((k) => {
      $('#' + FIELD_IDS[k]).addEventListener('input', () => {
        $('#' + FIELD_IDS[k]).classList.remove('is-invalid');
        $('#err-' + k).textContent = '';
      });
    });

    // Pencarian
    ['sQuery', 'sCategory', 'sDate', 'sStatus'].forEach((id) => {
      $('#' + id).addEventListener('input', renderSearch);
      $('#' + id).addEventListener('change', renderSearch);
    });
    $('#sReset').addEventListener('click', resetSearch);

    // Pengaturan
    $('#btnBackup').addEventListener('click', backupData);
    $('#btnRestore').addEventListener('click', () => $('#fileRestore').click());
    $('#fileRestore').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      restoreData(file).finally(() => { e.target.value = ''; });
    });
    $('#btnClearAll').addEventListener('click', clearAll);

    // Navigasi
    window.addEventListener('hashchange', () => showPage(pageFromHash()));

    // Perbarui tampilan jika hari berganti atau tab kembali aktif
    const refresh = () => {
      if (todayKey() !== state.todayKey) renderAll(); else renderHome();
    };
    setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

    // Sinkron antar tab peramban
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) { state.events = loadEvents(); renderAll(); }
    });
  }

  /* ---------------------------------------------------------
     16. Inisialisasi
     --------------------------------------------------------- */
  function init() {
    hydrateIcons();
    buildCategoryUI();
    buildTabs();
    state.storageOk = checkStorage();
    state.events = state.storageOk ? loadEvents() : [];
    state.selectedDate = todayKey();
    bindEvents();
    showPage(pageFromHash());
    renderAll();
    if (!state.storageOk) {
      toast('Penyimpanan peramban tidak tersedia. Data tidak akan tersimpan.', 'error');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();