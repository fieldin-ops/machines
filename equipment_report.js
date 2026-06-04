const DEFAULT_API_BASE = 'http://127.0.0.1:5555';
const API_STORAGE_KEY = 'equipment_report_api_base';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseIsoDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDisplayDate(d) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRangeDisplay(from, to) {
  if (!from || !to) return '';
  return formatDisplayDate(from) + ' – ' + formatDisplayDate(to);
}

/** Vanilla JS calendar range picker — no external deps */
const DateRangePicker = {
  start: null,
  end: null,
  hover: null,
  pendingStart: null,
  viewMonth: null,
  open: false,

  init() {
    this.wrap = document.getElementById('date-range-picker');
    this.display = document.getElementById('date-range-display');
    this.popup = document.getElementById('date-range-popup');
    this.inputFrom = document.getElementById('date-from');
    this.inputTo = document.getElementById('date-to');
    this.calLeft = document.getElementById('dr-cal-left');
    this.calRight = document.getElementById('dr-cal-right');
    this.titleLeft = document.getElementById('dr-title-left');
    this.titleRight = document.getElementById('dr-title-right');
    this.hint = document.getElementById('dr-hint');

    const today = startOfDay(new Date());
    this.viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const openFromField = e => {
      e.stopPropagation();
      this.togglePopup(!this.open);
    };
    this.display.addEventListener('click', openFromField);
    this.display.addEventListener('focus', () => {
      if (!this.open) this.togglePopup(true);
    });
    document.getElementById('dr-prev').addEventListener('click', e => {
      e.stopPropagation();
      this.shiftView(-1);
    });
    document.getElementById('dr-next').addEventListener('click', e => {
      e.stopPropagation();
      this.shiftView(1);
    });
    document.addEventListener('click', e => {
      if (!this.wrap.contains(e.target)) this.togglePopup(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.togglePopup(false);
    });
  },

  setRange(fromDate, toDate) {
    this.start = fromDate ? startOfDay(fromDate) : null;
    this.end = toDate ? startOfDay(toDate) : null;
    this.pendingStart = null;
    this.syncInputs();
    this.render();
  },

  syncInputs() {
    const fromIso = this.start ? toIsoDate(this.start) : '';
    const toIso = this.end ? toIsoDate(this.end) : '';
    this.inputFrom.value = fromIso;
    this.inputTo.value = toIso;
    this.display.value = formatRangeDisplay(this.start, this.end);
  },

  togglePopup(show) {
    const next = show !== undefined ? show : !this.open;
    this.open = next;
    this.popup.classList.toggle('open', next);
    this.wrap.classList.toggle('dr-open', next);
    const panel = document.getElementById('filter-panel');
    if (panel) panel.classList.toggle('dr-picker-open', next);
    this.display.setAttribute('aria-expanded', String(next));
    if (next) {
      if (this.end) {
        this.viewMonth = new Date(this.end.getFullYear(), this.end.getMonth(), 1);
        this.viewMonth.setMonth(this.viewMonth.getMonth() - 1);
      }
      this.pendingStart = null;
      this.updateHint();
      this.render();
    }
  },

  shiftView(delta) {
    this.viewMonth.setMonth(this.viewMonth.getMonth() + delta);
    this.render();
  },

  updateHint() {
    if (this.pendingStart) {
      this.hint.textContent = 'Now click an end date (or click again to change start)';
    } else if (this.start && this.end) {
      this.hint.textContent = formatRangeDisplay(this.start, this.end) + ' · Click dates to change';
    } else {
      this.hint.textContent = 'Click a start date, then an end date';
    }
  },

  onDayClick(date) {
    const day = startOfDay(date);
    if (!this.pendingStart) {
      this.pendingStart = day;
      this.start = day;
      this.end = null;
      this.hover = null;
      this.updateHint();
      this.render();
      return;
    }
    let a = this.pendingStart;
    let b = day;
    if (b < a) [a, b] = [b, a];
    this.start = a;
    this.end = b;
    this.pendingStart = null;
    this.hover = null;
    this.syncInputs();
    this.updateHint();
    this.render();
    this.togglePopup(false);
  },

  onDayHover(date) {
    if (!this.pendingStart) return;
    this.hover = startOfDay(date);
    this.render();
  },

  dayClass(date, inMonth) {
    const classes = ['dr-day'];
    if (!inMonth) classes.push('other-month');
    const today = startOfDay(new Date());
    if (sameDay(date, today)) classes.push('today');

    const rangeStart = this.pendingStart || this.start;
    const rangeEnd = this.pendingStart ? (this.hover || this.pendingStart) : this.end;
    if (!rangeStart) return classes.join(' ');

    let a = rangeStart;
    let b = rangeEnd || rangeStart;
    if (b < a) [a, b] = [b, a];
    const t = date.getTime();
    const ta = a.getTime();
    const tb = b.getTime();
    if (t >= ta && t <= tb) classes.push('in-range');
    if (sameDay(date, a)) classes.push('range-start');
    if (sameDay(date, b)) classes.push('range-end');
    return classes.join(' ');
  },

  buildMonthGrid(year, month) {
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const cells = [];

    for (let i = startPad - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      cells.push({ date: new Date(year, month - 1, d), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    let next = 1;
    while (cells.length < 42) {
      cells.push({ date: new Date(year, month + 1, next++), inMonth: false });
    }
    return cells;
  },

  renderMonth(container, year, month) {
    const weekdays = '<div class="dr-weekdays">' +
      WEEKDAY_LABELS.map(w => '<span class="dr-weekday">' + w + '</span>').join('') +
      '</div>';
    const cells = this.buildMonthGrid(year, month);
    const days = cells.map(({ date, inMonth }) => {
      const label = date.getDate();
      const cls = this.dayClass(date, inMonth);
      return '<button type="button" class="' + cls + '" data-iso="' + toIsoDate(date) + '">' + label + '</button>';
    }).join('');
    container.innerHTML = weekdays + '<div class="dr-days">' + days + '</div>';
    container.querySelectorAll('.dr-day').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.onDayClick(parseIsoDate(btn.dataset.iso));
      });
      btn.addEventListener('mouseenter', () => {
        this.onDayHover(parseIsoDate(btn.dataset.iso));
      });
    });
  },

  render() {
    const left = new Date(this.viewMonth);
    const right = new Date(this.viewMonth.getFullYear(), this.viewMonth.getMonth() + 1, 1);
    this.titleLeft.textContent = MONTH_NAMES[left.getMonth()] + ' ' + left.getFullYear();
    this.titleRight.textContent = MONTH_NAMES[right.getMonth()] + ' ' + right.getFullYear();
    this.renderMonth(this.calLeft, left.getFullYear(), left.getMonth());
    this.renderMonth(this.calRight, right.getFullYear(), right.getMonth());
  }
};

let DATA = [];
let sortKey = 'created_at';
let sortDir = -1;
let filterText = '';

function normalizeApiBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function getApiBase() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('api');
  if (fromQuery) {
    const base = normalizeApiBase(fromQuery);
    try {
      localStorage.setItem(API_STORAGE_KEY, base);
    } catch (_) { /* private mode */ }
    return base;
  }
  try {
    const stored = localStorage.getItem(API_STORAGE_KEY);
    if (stored) return normalizeApiBase(stored);
  } catch (_) { /* private mode */ }
  return DEFAULT_API_BASE;
}

function filterParams() {
  const company = document.getElementById('filter-company').value.trim();
  const creator = document.getElementById('filter-creator').value.trim();
  const partName = document.getElementById('filter-part-name').value.trim();
  const pairedBy = document.getElementById('filter-paired-by').value.trim();
  const params = new URLSearchParams();
  if (company) params.set('company', company);
  if (creator) params.set('creator', creator);
  if (partName) params.set('part_name', partName);
  if (pairedBy) params.set('paired_by', pairedBy);
  return params;
}

function equipmentApiUrl(from, to) {
  const base = getApiBase();
  const params = new URLSearchParams({ from, to });
  const filters = filterParams();
  filters.forEach((v, k) => params.set(k, v));
  return base + '/api/equipment?' + params.toString();
}

function filterOptionsUrl() {
  return getApiBase() + '/api/filter-options';
}

function clearDatalist(id) {
  const el = document.getElementById(id);
  while (el.firstChild) el.removeChild(el.firstChild);
}

function fillDatalist(id, values) {
  const el = document.getElementById(id);
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    el.appendChild(opt);
  }
}

function fillPersonDatalist(id, people) {
  const el = document.getElementById(id);
  for (const p of people) {
    const opt = document.createElement('option');
    opt.value = p.email;
    opt.label = p.name;
    el.appendChild(opt);
  }
}

function fillPartSelect(names) {
  const sel = document.getElementById('filter-part-name');
  sel.innerHTML = '<option value="">All</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
}

function setFiltersEnabled(enabled) {
  ['filter-company', 'filter-creator', 'filter-part-name', 'filter-paired-by'].forEach(id => {
    document.getElementById(id).disabled = !enabled;
  });
}

async function loadFilterOptions() {
  const status = document.getElementById('filters-status');
  setFiltersEnabled(false);
  status.textContent = 'Loading filter options…';
  try {
    const resp = await fetch(filterOptionsUrl());
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error || resp.statusText);
    clearDatalist('company-list');
    clearDatalist('creator-list');
    clearDatalist('paired-by-list');
    fillDatalist('company-list', body.companies || []);
    fillPersonDatalist('creator-list', body.creators || []);
    fillPartSelect(body.part_names || []);
    fillPersonDatalist('paired-by-list', body.paired_by || []);
    const nCo = (body.companies || []).length;
    const nCr = (body.creators || []).length;
    const nPn = (body.part_names || []).length;
    const nPb = (body.paired_by || []).length;
    status.textContent =
      nCo + ' companies · ' + nCr + ' creators · ' + nPn + ' part names · ' + nPb + ' paired-by users';
    setFiltersEnabled(true);
    return body;
  } catch (err) {
    status.textContent = 'Filter options unavailable: ' + apiUnreachableMessage(err);
    setFiltersEnabled(true);
    return null;
  }
}

function apiUnreachableMessage(err) {
  const base = getApiBase();
  const hint =
    'Start the local API server (from the machines repo): python3 equipment_server.py. ' +
    'Override API URL with ?api=http://127.0.0.1:5555';
  if (!err) return 'Cannot reach API at ' + base + '. ' + hint;
  const msg = String(err.message || err);
  if (msg === 'Failed to fetch' || err.name === 'TypeError') {
    return 'Cannot reach API at ' + base + '. ' + hint;
  }
  return msg;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function compare(a, b, key, type) {
  let va = a[key] ?? '';
  let vb = b[key] ?? '';
  if (type === 'date') {
    const tsKey = key === 'paired_at' ? 'paired_at_ts' : 'created_at_ts';
    va = a[tsKey] || a[key] || '';
    vb = b[tsKey] || b[key] || '';
    return va.localeCompare(vb);
  }
  if (type === 'num') {
    const na = parseFloat(String(va).replace(/[^0-9.-]/g, '')) || 0;
    const nb = parseFloat(String(vb).replace(/[^0-9.-]/g, '')) || 0;
    return na - nb;
  }
  return String(va).toLowerCase().localeCompare(String(vb).toLowerCase());
}

function rowMatches(row, q) {
  if (!q) return true;
  const searchKeys = [
    'equipment_id', 'alias', 'type', 'classification', 'company_name', 'ownership',
    'manufacturer', 'model', 'serial_number', 'created_at',
    'creator_name', 'creator_email', 'last_paired_device', 'part_name',
    'paired_by_name', 'paired_by_email', 'paired_at'
  ];
  return searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(q));
}

function personCell(nameKey, emailKey) {
  return function (row) {
    const name = row[nameKey];
    const email = row[emailKey];
    if (name === '—' && email === '—') {
      return '<span class="pairer empty">—</span>';
    }
    let html = '<div class="pairer">';
    if (name !== '—') html += '<span class="name">' + esc(name) + '</span>';
    if (email !== '—') html += '<span class="email">' + esc(email) + '</span>';
    html += '</div>';
    return html;
  };
}

const creatorCell = function(row) {
  const name = row.creator_name;
  if (!name || name === '—') return '<span class="pairer empty">—</span>';
  return '<span class="pairer">' + esc(name) + '</span>';
};
const pairedByCell = personCell('paired_by_name', 'paired_by_email');

function rowHtml(row) {
  const deviceCell = row.last_paired_device === '—'
    ? '<span class="device-id empty">—</span>'
    : '<span class="device-id">' + esc(row.last_paired_device) + '</span>';
  const partName = row.part_name === '—'
    ? '<span class="empty">—</span>'
    : esc(row.part_name);
  return (
    '<tr data-id="' + esc(row.equipment_id) + '">' +
    '<td class="num">' + esc(row.equipment_id) + '</td>' +
    '<td>' + esc(row.alias) + '</td>' +
    '<td><span class="type-badge">' + esc(row.type) + '</span></td>' +
    '<td>' + esc(row.classification) + '</td>' +
    '<td>' + esc(row.company_name) + '</td>' +
    '<td>' + esc(row.ownership) + '</td>' +
    '<td>' + esc(row.manufacturer) + '</td>' +
    '<td>' + esc(row.model) + '</td>' +
    '<td>' + esc(row.serial_number) + '</td>' +
    '<td class="num">' + esc(row.created_at) + '</td>' +
    '<td>' + creatorCell(row) + '</td>' +
    '<td>' + deviceCell + '</td>' +
    '<td>' + partName + '</td>' +
    '<td>' + pairedByCell(row) + '</td>' +
    '<td class="num">' + esc(row.paired_at) + '</td>' +
    '</tr>'
  );
}

function render() {
  const q = filterText.trim().toLowerCase();
  const th = document.querySelector('th[data-key="' + sortKey + '"]');
  const type = th ? th.dataset.type || 'text' : 'text';
  const sorted = [...DATA].sort((a, b) => sortDir * compare(a, b, sortKey, type));
  const tbody = document.getElementById('tbody');
  let visible = 0;
  let html = '';
  for (const row of sorted) {
    if (!rowMatches(row, q)) continue;
    visible++;
    html += rowHtml(row);
  }
  tbody.innerHTML = html || '<tr><td colspan="16" class="loading-overlay">No equipment in this date range.</td></tr>';
  document.getElementById('visible-count').textContent = visible + ' shown' + (q ? ' (filtered)' : '');
  document.querySelectorAll('thead th').forEach(h => {
    h.classList.toggle('sorted', h.dataset.key === sortKey);
    const icon = h.querySelector('.sort-icon');
    if (h.dataset.key === sortKey) {
      icon.textContent = sortDir > 0 ? '↑' : '↓';
    } else {
      icon.textContent = '↕';
    }
  });
}

function updateMeta(from, to, count) {
  document.getElementById('page-title').textContent =
    'Equipment created (' + from + ' to ' + to + ')';
  document.getElementById('meta-line').innerHTML =
    '<strong>' + count + '</strong> records · Live from read replica · Last pairing from equipment_installations · Part info from devices_new / parts_inventory';
}

async function fetchData() {
  const from = document.getElementById('date-from').value;
  const to = document.getElementById('date-to').value;
  const btn = document.getElementById('fetch-btn');
  const status = document.getElementById('status-msg');
  if (!from || !to) {
    status.textContent = 'Select both dates.';
    status.className = 'status-msg error';
    return;
  }
  if (from > to) {
    status.textContent = '"From" must be on or before "To".';
    status.className = 'status-msg error';
    return;
  }
  btn.disabled = true;
  status.textContent = 'Loading…';
  status.className = 'status-msg';
  document.getElementById('tbody').innerHTML =
    '<tr><td colspan="16" class="loading-overlay">Fetching from database…</td></tr>';
  try {
    const url = equipmentApiUrl(from, to);
    const resp = await fetch(url);
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error || resp.statusText);
    DATA = body.rows || [];
    updateMeta(body.from, body.to, body.count);
    status.textContent = 'Updated ' + new Date().toLocaleTimeString() + ' · API ' + getApiBase();
    status.className = 'status-msg';
    render();
  } catch (err) {
    status.textContent = apiUnreachableMessage(err);
    status.className = 'status-msg error';
    document.getElementById('tbody').innerHTML =
      '<tr><td colspan="16" class="loading-overlay">Failed to load data. ' +
      esc(apiUnreachableMessage(err)) + '</td></tr>';
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('search').addEventListener('input', e => {
  filterText = e.target.value;
  render();
});

document.querySelectorAll('thead th').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = 1; }
    if (key === 'created_at' || key === 'paired_at') sortDir = -1;
    render();
  });
});

document.getElementById('fetch-btn').addEventListener('click', fetchData);

function setDefaultDates() {
  const to = startOfDay(new Date());
  const from = new Date(to);
  from.setDate(from.getDate() - 3);
  DateRangePicker.init();
  DateRangePicker.setRange(from, to);
}

(async function init() {
  setDefaultDates();
  await loadFilterOptions();
  fetchData();
})();
