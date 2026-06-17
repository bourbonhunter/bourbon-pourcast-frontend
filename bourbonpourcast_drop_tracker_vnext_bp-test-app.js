const DATA_CANDIDATES = {
  allocations: ['drop_history.csv'],
  shipments: ['ncabc_inventory_report.html'],
  dropTable: ['drop_table.csv']
};

const MIN_DAYS_SINCE_LAST_FOR_EXPECTED = 27;

let allocationRows = [];
let shipmentRows = [];
let dropTableRows = [];
let dropTrackerRows = [];
let watchListRows = [];
let shipmentMeta = {
  file: null,
  shippedSince: null,
  lastUpdated: '',
  generated: '',
  coverageDays: null,
  isInventoryReport: false
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeStore(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqueSorted(values) {
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function asDate(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  const iso = cleaned.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const us = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) return new Date(Number(us[3].length === 2 ? '20' + us[3] : us[3]), Number(us[1]) - 1, Number(us[2]));
  const word = cleaned.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}/i);
  const parsed = new Date(word ? word[0] : cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function atMidnight(date) {
  if (!date) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = atMidnight(date || new Date());
  d.setDate(d.getDate() + Number(days));
  return d;
}

function daysBetween(later, earlier) {
  const a = atMidnight(later);
  const b = atMidnight(earlier);
  if (!a || !b) return null;
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function fmtDate(date) {
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function fmtWeekday(date) {
  return date ? date.toLocaleDateString(undefined, { weekday: 'long' }) : '';
}

function titleWeekday(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days.find(d => d.toLowerCase() === cleaned) || '';
}

function previousOrSameWeekday(date, weekdayName) {
  const target = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(weekdayName);
  if (!date || target < 0) return null;
  const d = atMidnight(date);
  const offset = (d.getDay() - target + 7) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

function shipmentSinceText() {
  return shipmentMeta.shippedSince ? `Shipped Since: ${fmtDate(shipmentMeta.shippedSince)}` : 'Shipped Since: Report window unavailable';
}

function withinDays(rowDate, days) {
  if (days === 'all') return true;
  if (!rowDate) return true;
  const cutoff = atMidnight(new Date());
  cutoff.setDate(cutoff.getDate() - Number(days));
  return atMidnight(rowDate) >= cutoff;
}

function scoreKey(key, candidates) {
  const norm = normalizeKey(key);
  let best = 0;
  for (const candidate of candidates) {
    const target = normalizeKey(candidate);
    if (norm === target) best = Math.max(best, 100);
    else if (norm.startsWith(target)) best = Math.max(best, 80);
    else if (norm.includes(target)) best = Math.max(best, 60);
  }
  return best;
}

function pick(row, candidates) {
  let best = null;
  for (const key of Object.keys(row || {})) {
    const value = String(row[key] ?? '').trim();
    if (!value) continue;
    const score = scoreKey(key, candidates);
    if (score && (!best || score > best.score)) best = { value, score };
  }
  return best ? best.value : '';
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  text = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') { cell += '"'; i++; }
    else if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => String(v).trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(v => String(v).trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h || `Column ${i + 1}`, (values[i] || '').trim()])));
}

function parseInventoryReportHTML(text, fileName = 'ncabc_inventory_report.html') {
  const doc = new DOMParser().parseFromString(String(text || ''), 'text/html');
  const bodyText = doc.body ? doc.body.textContent.replace(/\s+/g, ' ').trim() : '';

  const sinceMatch = bodyText.match(/Allocated brands shipped since:\s*([A-Za-z]+\s+\d{1,2},\s+20\d{2})/i);
  const updatedMatch = bodyText.match(/Last updated on NC ABC:\s*([^\n]+?\d{1,2}:\d{2}\s*[AP]M)/i);
  const generatedMatch = bodyText.match(/Report generated:\s*([^\n]+?\))/i);
  const coverageMatch = bodyText.match(/Coverage window:\s*(\d+)\s*days?/i);

  shipmentMeta = {
    file: fileName,
    shippedSince: sinceMatch ? asDate(sinceMatch[1]) : null,
    lastUpdated: updatedMatch ? updatedMatch[1].trim() : '',
    generated: generatedMatch ? generatedMatch[1].trim() : '',
    coverageDays: coverageMatch ? Number(coverageMatch[1]) : null,
    isInventoryReport: true
  };

  const rows = [];
  const productBlocks = [...doc.querySelectorAll('tbody.brand-block tr.total')];
  productBlocks.forEach((tr, index) => {
    const product = tr.querySelector('.brand strong, .brand')?.textContent.trim() || '';
    const totalQty = Number((tr.querySelector('.total-bottles strong')?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
    const target = tr.getAttribute('data-target') || `d${index + 1}`;
    const detailBody = doc.getElementById(target);
    if (!product || !detailBody) return;

    [...detailBody.querySelectorAll('tr')].forEach(detail => {
      const board = detail.querySelector('.board')?.textContent.trim() || '';
      const qty = Number((detail.querySelector('.bottles')?.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
      if (!board) return;
      rows.push({ product, board, qty, totalQty, shippedSince: shipmentMeta.shippedSince });
    });
  });
  return rows;
}

async function loadFirstAvailable(files, parser) {
  for (const file of files) {
    try {
      const response = await fetch(file, { cache: 'no-store' });
      if (response.ok) return { file, rows: parser(await response.text(), file) };
    } catch (err) {}
  }
  return { file: null, rows: [] };
}

function normalizedAllocationRows(rows) {
  return rows.map(row => {
    const dateRaw = pick(row, ['date', 'drop_date', 'effective_date', 'seen_date', 'timestamp', 'timestampdetected']);
    const store = pick(row, ['store', 'store_name', 'storeaddress', 'abc_store', 'location']);
    const brand = pick(row, ['brand', 'product', 'product_name', 'item', 'description']);
    const board = pick(row, ['board', 'county', 'abc_board']);
    const date = asDate(dateRaw);
    return { dateRaw, date, store, brand, board, raw: row };
  }).filter(r => r.store || r.brand);
}

function normalizedDropTableRows(rows) {
  return rows.map(row => {
    const store = pick(row, ['storeaddress', 'store', 'store_name', 'abc_store', 'location']);
    const dropDay = titleWeekday(pick(row, ['dropday', 'drop_day', 'weekday', 'day']));
    return { store, dropDay, raw: row };
  }).filter(r => r.store && r.dropDay);
}

function fillSelect(select, values, allLabel) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (values.includes(current)) select.value = current;
}

function dropDayByStoreMap() {
  const map = new Map();
  dropTableRows.forEach(r => map.set(normalizeStore(r.store), r.dropDay));
  return map;
}

function latestDropByStoreMap(rows = allocationRows) {
  const latest = new Map();
  rows.forEach(r => {
    if (!r.store || !r.date) return;
    const key = normalizeStore(r.store);
    const current = latest.get(key);
    if (!current || r.date > current.date) latest.set(key, { date: r.date, store: r.store });
  });
  return latest;
}

function previousDropBefore(storeKey, date, rows = allocationRows) {
  let prev = null;
  rows.forEach(r => {
    if (normalizeStore(r.store) !== storeKey || !r.date || !date) return;
    if (r.date < date && (!prev || r.date > prev.date)) prev = r;
  });
  return prev;
}

function buildWatchListRows() {
  const tomorrow = addDays(new Date(), 1);
  const tomorrowWeekday = fmtWeekday(tomorrow);
  const latestByStore = latestDropByStoreMap();

  return dropTableRows
    .filter(r => r.dropDay === tomorrowWeekday)
    .map(r => {
      const key = normalizeStore(r.store);
      const latest = latestByStore.get(key);
      const daysSinceLast = latest ? daysBetween(tomorrow, latest.date) : null;
      return {
        expectedDate: tomorrow,
        announcedDate: null,
        store: r.store,
        brand: '',
        board: 'Wake ABC',
        status: 'expected',
        source: 'watchlist',
        lastDropDate: latest?.date || null,
        daysSinceLast
      };
    })
    .filter(r => r.daysSinceLast !== null && r.daysSinceLast >= MIN_DAYS_SINCE_LAST_FOR_EXPECTED)
    .sort((a, b) => (b.daysSinceLast || 0) - (a.daysSinceLast || 0) || a.store.localeCompare(b.store));
}

function buildDropTrackerRows() {
  const dropDayByStore = dropDayByStoreMap();
  const announcedRows = allocationRows.map(r => {
    const storeKey = normalizeStore(r.store);
    const dropDay = dropDayByStore.get(storeKey) || '';
    const expectedCandidate = dropDay ? previousOrSameWeekday(r.date, dropDay) : null;
    const previous = previousDropBefore(storeKey, r.date);
    const daysSincePrevious = previous && expectedCandidate ? daysBetween(expectedCandidate, previous.date) : null;

    // Drop Expected is only shown when the known drop day/cadence makes the expected date meaningful.
    // Wake can report late, so the expected date may be one or two days before the announced date.
    const expectedDate = expectedCandidate && (!previous || daysSincePrevious >= MIN_DAYS_SINCE_LAST_FOR_EXPECTED)
      ? expectedCandidate
      : null;

    return {
      expectedDate,
      announcedDate: r.date,
      store: r.store,
      brand: r.brand,
      board: r.board || 'Wake ABC',
      status: 'announced',
      source: 'delta',
      lastDropDate: previous?.date || null,
      daysSinceLast: daysSincePrevious
    };
  });

  return [...watchListRows, ...announcedRows];
}

function statusLabel(status) {
  if (status === 'expected') return 'Expected';
  if (status === 'verified') return 'Verified';
  if (status === 'announced') return 'Announced';
  return 'Tracked';
}

function statusBadge(status) {
  const label = statusLabel(status);
  return `<span class="status-badge status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function trackerDisplayDate(row) {
  return row.announcedDate || row.expectedDate || null;
}

function groupedShipments(rows) {
  const groups = new Map();
  rows.forEach(r => {
    const product = r.product || 'Unknown Product';
    if (!groups.has(product)) groups.set(product, { product, boards: new Map(), totalQty: 0 });
    const g = groups.get(product);
    const current = g.boards.get(r.board) || 0;
    g.boards.set(r.board, current + (Number(r.qty) || 0));
  });
  groups.forEach(g => {
    g.totalQty = [...g.boards.values()].reduce((sum, qty) => sum + qty, 0);
  });
  return [...groups.values()].sort((a, b) => (b.totalQty || 0) - (a.totalQty || 0) || a.product.localeCompare(b.product));
}

function renderAllocation() {
  const store = $('storeFilter')?.value || '';
  const brand = $('brandFilter')?.value || '';
  const status = $('trackerStatusFilter')?.value || '';
  const days = $('allocationDays')?.value || '30';
  const rows = dropTrackerRows
    .filter(r => (!store || r.store === store) && (!brand || r.brand === brand) && (!status || r.status === status) && withinDays(trackerDisplayDate(r), days))
    .sort((a, b) => (trackerDisplayDate(b)?.getTime() || 0) - (trackerDisplayDate(a)?.getTime() || 0) || a.store.localeCompare(b.store));

  $('allocationCount').textContent = `${rows.length} result${rows.length === 1 ? '' : 's'}`;
  $('statExpectedTomorrow').textContent = watchListRows.length;
  $('statStores').textContent = uniqueSorted(rows.map(r => r.store)).length;
  $('statBrands').textContent = uniqueSorted(rows.map(r => r.brand)).length;
  const latestAnnounced = rows.find(r => r.status === 'announced')?.announcedDate || allocationRows.sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))[0]?.date;
  $('statLatest').textContent = fmtDate(latestAnnounced);

  if (!rows.length) {
    $('allocationTable').innerHTML = `<div class="empty">Drop Tracker data is not loaded yet, or no records match the selected filters.</div>`;
    return;
  }

  $('allocationTable').innerHTML = `<table><thead><tr><th>Drop Expected</th><th>Drop Announced</th><th>Store</th><th>Brand / Product</th><th>Board</th><th>Status</th></tr></thead><tbody>${rows.map(r => `
    <tr>
      <td>${fmtDate(r.expectedDate)}${r.status === 'expected' && r.daysSinceLast ? `<br><small>${r.daysSinceLast} days since last logged drop</small>` : ''}</td>
      <td>${fmtDate(r.announcedDate)}</td>
      <td>${escapeHtml(r.store || '—')}</td>
      <td>${escapeHtml(r.brand || '—')}</td>
      <td>${escapeHtml(r.board || '—')}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function renderShipments() {
  const product = $('shipmentProductFilter').value;
  const board = $('shipmentBoardFilter').value;
  const rows = shipmentRows.filter(r => (!product || r.product === product) && (!board || r.board === board));
  const productCount = groupedShipments(rows).length;
  const boardCount = uniqueSorted(rows.map(r => r.board)).length;

  $('shipmentCount').textContent = `${productCount} product${productCount === 1 ? '' : 's'}`;
  $('shipmentSinceBanner').textContent = shipmentMeta.shippedSince ? `Allocated Brands Shipped Since: ${fmtDate(shipmentMeta.shippedSince)}` : 'Allocated Brands Shipped Since: Report window unavailable';
  $('shipmentTableSince').textContent = shipmentSinceText();
  $('shipmentWindowHint').textContent = `This Radar uses the reporting window from the NC ABC Inventory Report: ${shipmentSinceText()}.`;

  if (!shipmentRows.length) {
    $('shipmentHeroTable').innerHTML = `<div class="empty">Shipment Radar data is not loaded yet. Use a local web server, or choose your ncabc_inventory_report.html above.</div>`;
    return;
  }

  if (!rows.length) {
    $('shipmentResultsTitle').textContent = 'No Matching Shipment Records';
    $('shipmentHeroTable').innerHTML = `<div class="empty">No products match the selected shipment filters.</div>`;
    return;
  }

  if (product && !board) {
    const boardRows = rows
      .map(r => ({ board: r.board, qty: Number(r.qty) || 0 }))
      .sort((a, b) => (b.qty || 0) - (a.qty || 0) || a.board.localeCompare(b.board));
    const total = boardRows.reduce((sum, r) => sum + r.qty, 0);
    $('shipmentResultsTitle').textContent = `${product} → Boards Receiving`;
    $('shipmentHeroTable').innerHTML = `<div class="result-summary"><strong>${escapeHtml(product)}</strong><span>${boardCount} board${boardCount === 1 ? '' : 's'} receiving · ${total.toLocaleString()} bottles</span></div>
      <table><thead><tr><th>Board</th><th>Bottles</th></tr></thead><tbody>${boardRows.map(r => `<tr><td>${escapeHtml(r.board)}</td><td>${r.qty.toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
    return;
  }

  if (board && !product) {
    const productRows = rows
      .map(r => ({ product: r.product, qty: Number(r.qty) || 0 }))
      .filter(r => r.qty > 0)
      .sort((a, b) => (b.qty || 0) - (a.qty || 0) || a.product.localeCompare(b.product));
    const total = productRows.reduce((sum, r) => sum + r.qty, 0);
    $('shipmentResultsTitle').textContent = `${board} → Products Received`;
    $('shipmentHeroTable').innerHTML = `<div class="result-summary"><strong>${escapeHtml(board)}</strong><span>${productRows.length} product${productRows.length === 1 ? '' : 's'} received · ${total.toLocaleString()} bottles</span></div>
      <table><thead><tr><th>Product</th><th>Bottles</th></tr></thead><tbody>${productRows.map(r => `<tr><td>${escapeHtml(r.product)}</td><td>${r.qty.toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
    return;
  }

  if (product && board) {
    const total = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
    $('shipmentResultsTitle').textContent = `${product} at ${board}`;
    $('shipmentHeroTable').innerHTML = `<div class="result-summary"><strong>${escapeHtml(product)}</strong><span>${escapeHtml(board)} · ${total.toLocaleString()} bottles</span></div>
      <table><thead><tr><th>Product</th><th>Board</th><th>Bottles</th></tr></thead><tbody><tr><td>${escapeHtml(product)}</td><td>${escapeHtml(board)}</td><td>${total.toLocaleString()}</td></tr></tbody></table>`;
    return;
  }

  const groups = groupedShipments(rows);
  $('shipmentResultsTitle').textContent = 'Product → Boards Receiving';
  $('shipmentHeroTable').innerHTML = `<table><thead><tr><th>Product</th><th>Boards Receiving</th><th>Total Bottles</th></tr></thead><tbody>${groups.map(g => `
    <tr><td><strong>${escapeHtml(g.product)}</strong><br><small>${g.boards.size} board${g.boards.size === 1 ? '' : 's'}</small></td><td>${[...g.boards.entries()].filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16).map(([b, q]) => `<span class="badge">${escapeHtml(b)} · ${q.toLocaleString()}</span>`).join('')}${g.boards.size > 16 ? `<span class="badge">+${g.boards.size - 16} more</span>` : ''}</td><td>${g.totalQty.toLocaleString()}</td></tr>`).join('')}</tbody></table>`;
}

function renderHome() {
  const recent = allocationRows
    .filter(r => withinDays(r.date, 30))
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
    .slice(0, 5);
  $('homeRecentAllocations').innerHTML = recent.length
    ? recent.map(r => `<div class="compact-item"><div><strong>${escapeHtml(r.brand || 'Unknown Brand')}</strong><small>${escapeHtml(r.store || 'Unknown Store')}</small></div><span>${fmtDate(r.date)}</span></div>`).join('')
    : `<div class="empty">Drop history data is not loaded yet.</div>`;

  const tomorrow = addDays(new Date(), 1);
  if ($('homeWatchListTitle')) $('homeWatchListTitle').textContent = `${fmtWeekday(tomorrow)} Watch List`;
  if ($('homeWatchListMeta')) $('homeWatchListMeta').textContent = `${watchListRows.length} store${watchListRows.length === 1 ? '' : 's'} with known drop day tomorrow and no logged drop in at least ${MIN_DAYS_SINCE_LAST_FOR_EXPECTED} days.`;
  if ($('homeWatchList')) {
    $('homeWatchList').innerHTML = watchListRows.length
      ? watchListRows.slice(0, 6).map(r => `<div class="compact-item watch-item"><div><strong>${escapeHtml(r.store)}</strong><small>Last logged drop: ${fmtDate(r.lastDropDate)}</small></div><span>${r.daysSinceLast} days</span></div>`).join('')
      : `<div class="empty">No stores meet tomorrow's watch list criteria right now.</div>`;
  }

  $('homeShipmentSince').textContent = shipmentRows.length ? shipmentSinceText() : '';
  const groups = groupedShipments(shipmentRows);
  const boardsReceiving = uniqueSorted(shipmentRows.filter(r => Number(r.qty) > 0).map(r => r.board)).length;
  $('homeShipmentStats').textContent = shipmentRows.length ? `Boards Receiving Allocated Products: ${boardsReceiving} · Products Tracked: ${groups.length}` : '';
  $('homeShipmentPreview').innerHTML = groups.length
    ? groups.slice(0, 5).map((g, i) => `<div class="compact-item ranked-item"><div><strong>${i + 1}. ${escapeHtml(g.product)}</strong><small>${g.boards.size} board${g.boards.size === 1 ? '' : 's'} receiving</small></div><span>${g.totalQty.toLocaleString()} bottles</span></div>`).join('')
    : `<div class="empty">Shipment Radar data is not loaded yet.</div>`;
}

function updateDataStatus() {
  // Status text intentionally hidden for the public build.
}

function setSection(section, scrollTargetId = null) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.toggle('active', s.id === section));
  document.querySelectorAll('.nav-btn').forEach(n => n.classList.toggle('active', n.dataset.section === section));
  const target = scrollTargetId ? $(scrollTargetId) : null;
  setTimeout(() => {
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 30);
}

function wireNav() {
  document.querySelectorAll('[data-section], [data-section-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section || btn.dataset.sectionJump;
      setSection(section, btn.dataset.scrollTarget || null);
      if (btn.dataset.statusFilter && $('trackerStatusFilter')) {
        $('trackerStatusFilter').value = btn.dataset.statusFilter;
        renderAllocation();
      }
    });
  });
}

function wireFileLoader() {
  const input = $('shipmentFileInput');
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const text = await file.text();
    shipmentRows = parseInventoryReportHTML(text, file.name);
    fillSelect($('shipmentProductFilter'), uniqueSorted(shipmentRows.map(r => r.product)), 'All products');
    fillSelect($('shipmentBoardFilter'), uniqueSorted(shipmentRows.map(r => r.board)), 'All boards');
    renderShipments();
    renderHome();
    updateDataStatus();
    $('shipmentLoadCard').style.display = shipmentRows.length ? 'none' : 'block';
  });
}

async function init() {
  wireNav();
  wireFileLoader();

  const [allocLoad, shipLoad, dropTableLoad] = await Promise.all([
    loadFirstAvailable(DATA_CANDIDATES.allocations, parseCSV),
    loadFirstAvailable(DATA_CANDIDATES.shipments, parseInventoryReportHTML),
    loadFirstAvailable(DATA_CANDIDATES.dropTable, parseCSV)
  ]);

  allocationRows = normalizedAllocationRows(allocLoad.rows);
  shipmentRows = shipLoad.rows;
  dropTableRows = normalizedDropTableRows(dropTableLoad.rows);
  watchListRows = buildWatchListRows();
  dropTrackerRows = buildDropTrackerRows();

  if (!shipmentRows.length) $('shipmentLoadCard').style.display = 'block';

  fillSelect($('storeFilter'), uniqueSorted(dropTrackerRows.map(r => r.store)), 'All stores');
  fillSelect($('brandFilter'), uniqueSorted(dropTrackerRows.map(r => r.brand)), 'All brands');
  fillSelect($('shipmentProductFilter'), uniqueSorted(shipmentRows.map(r => r.product)), 'All products');
  fillSelect($('shipmentBoardFilter'), uniqueSorted(shipmentRows.map(r => r.board)), 'All boards');

  ['storeFilter', 'brandFilter', 'allocationDays', 'trackerStatusFilter'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', renderAllocation);
  });
  ['shipmentProductFilter', 'shipmentBoardFilter'].forEach(id => $(id).addEventListener('change', renderShipments));

  renderAllocation();
  renderShipments();
  renderHome();
  updateDataStatus();
}

init();

// ==========================================
// Bourbon Pourcast Alert Registration
// ==========================================

const SUPABASE_URL = "https://akitjakjvaupljhvsgnb.supabase.co";
const SUPABASE_KEY = "sb_publishable_JTOyuIOQyFadm01Iv9EPyg_lsPIHC83";

async function registerAlertSubscriber(email) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/register_email_subscriber`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_email: email })
    }
  );

  if (!response.ok) {
    throw new Error(`Registration failed (${response.status})`);
  }

  return await response.json();
}

function wireAlertSignup() {
  const form = document.getElementById("alertSignupForm");
  const emailInput = document.getElementById("alertEmail");
  const message = document.getElementById("alertSignupMessage");

  if (!form || !emailInput || !message) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim().toLowerCase();
    if (!email) return;

    message.textContent = "Registering...";

    try {
      const result = await registerAlertSubscriber(email);

      if (result === "already_registered") {
        message.textContent = "✅ You're already registered. No action required.";
      } else {
        message.textContent = "✅ Thanks for registering! You're on the list.";
        if (window.plausible) plausible('Registration');
      }

      emailInput.value = "";
    } catch (err) {
      console.error(err);
      message.textContent = "Sorry, registration failed. Please try again.";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireAlertSignup);
} else {
  wireAlertSignup();
}
