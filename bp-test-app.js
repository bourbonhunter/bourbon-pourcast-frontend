const CSV_CANDIDATES = {
  allocations: ['drop_history.csv'],
  shipments: [
    'nc_shipment_radar.csv',
    'ncabc_inventory_report.csv',
    'stock_shipped.csv',
    'ncabc_stock_shipped.csv',
    'shipment_report.csv',
    'ncabc_inventory_report.html',
    'stock_shipped.html'
  ]
};

let allocationRows = [];
let shipmentRows = [];
let filteredShipmentRows = [];
let debugInfo = { shipmentFile: null, shipmentRaw: 0, shipmentNormalized: 0, shipmentHeaders: [] };

const $ = (id) => document.getElementById(id);

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function scoreKey(key, candidates) {
  const norm = normalizeKey(key);
  let best = 0;
  for (const candidate of candidates) {
    const target = normalizeKey(candidate);
    if (!target) continue;
    if (norm === target) best = Math.max(best, 100);
    else if (norm.startsWith(target)) best = Math.max(best, 80);
    else if (norm.includes(target)) best = Math.max(best, 60);
    else if (target.includes(norm) && norm.length > 3) best = Math.max(best, 45);
  }
  return best;
}

function pick(row, candidates) {
  const keys = Object.keys(row || {});
  let best = null;
  for (const key of keys) {
    const value = String(row[key] ?? '').trim();
    if (!value) continue;
    const score = scoreKey(key, candidates);
    if (score && (!best || score > best.score)) best = { key, value, score };
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
      if (row.some(v => String(v).trim() !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(v => String(v).trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  debugInfo.shipmentHeaders = headers;
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h || `Column ${i + 1}`, (values[i] || '').trim()])));
}

function parseHTMLTable(text) {
  const doc = new DOMParser().parseFromString(String(text || ''), 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  const trs = [...table.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
  const usable = trs.filter(r => r.some(Boolean));
  if (!usable.length) return [];
  let headers = usable[0];
  let body = usable.slice(1);
  if (!headers.some(h => /date|product|brand|item|board|county|qty|quantity|case|code/i.test(h))) {
    headers = usable[0].map((_, i) => `Column ${i + 1}`);
    body = usable;
  }
  debugInfo.shipmentHeaders = headers;
  return body.map(values => Object.fromEntries(headers.map((h, i) => [h || `Column ${i + 1}`, (values[i] || '').trim()])));
}

function parseDataFile(text, fileName='') {
  if (/\.html?$/i.test(fileName) || /^\s*</.test(String(text || ''))) return parseHTMLTable(text);
  return parseCSV(text);
}

async function loadFirstAvailable(files) {
  for (const file of files) {
    try {
      const response = await fetch(file, { cache: 'no-store' });
      if (response.ok) return { file, rows: parseDataFile(await response.text(), file) };
    } catch (err) {}
  }
  return { file: null, rows: [] };
}

function asDate(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  const iso = cleaned.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const us = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const year = Number(us[3].length === 2 ? '20' + us[3] : us[3]);
    return new Date(year, Number(us[1]) - 1, Number(us[2]));
  }
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function fmtDate(date) {
  if (!date) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function uniqueSorted(values) {
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function withinDays(rowDate, days) {
  if (days === 'all') return true;
  if (!rowDate) return true;
  const cutoff = new Date();
  cutoff.setHours(0,0,0,0);
  cutoff.setDate(cutoff.getDate() - Number(days));
  return rowDate >= cutoff;
}

function normalizedAllocationRows(rows) {
  return rows.map(row => {
    const dateRaw = pick(row, ['date', 'drop_date', 'effective_date', 'seen_date', 'timestamp']);
    const store = pick(row, ['store', 'store_name', 'abc_store', 'location']);
    const brand = pick(row, ['brand', 'product', 'product_name', 'item', 'description']);
    const board = pick(row, ['board', 'county', 'abc_board']);
    const date = asDate(dateRaw);
    return { dateRaw, date, store, brand, board, raw: row };
  }).filter(r => r.store || r.brand);
}

function firstNonDateText(row) {
  for (const [k, v] of Object.entries(row || {})) {
    const value = String(v || '').trim();
    if (value && !asDate(value) && !/^\d+$/.test(value)) return value;
  }
  return '';
}

function normalizedShipmentRows(rows) {
  debugInfo.shipmentRaw = rows.length;
  const normalized = rows.map(row => {
    const dateRaw = pick(row, ['date', 'shipdate', 'shipmentdate', 'shippingdate', 'reportdate', 'rundate', 'createdat', 'timestamp', 'lastseen', 'lastshipped']);
    let product = pick(row, ['product', 'productname', 'itemname', 'brand', 'item', 'description', 'desc', 'spiritname', 'liquordescription', 'liquor', 'name', 'productdescription']);
    let board = pick(row, ['board', 'abcboard', 'boardname', 'county', 'countyname', 'recipient', 'destination', 'location', 'agency', 'customer', 'shipto', 'localboard']);
    const qty = pick(row, ['qty', 'quantity', 'caseqty', 'cases', 'bottles', 'units', 'shipped', 'amount', 'onhand', 'stock']);
    const code = pick(row, ['code', 'itemcode', 'productcode', 'nccode', 'bailmentcode', 'sku']);
    const date = asDate(dateRaw);

    // Fallback for simple reports where headers are generic columns.
    if (!product) product = firstNonDateText(row);
    if (!board) {
      const vals = Object.values(row).map(v => String(v || '').trim()).filter(Boolean);
      board = vals.find(v => /county|abc|wake|durham|orange|johnston|cumberland|mecklenburg|forsyth|guilford|new hanover/i.test(v)) || '';
    }
    return { dateRaw, date, product, board, qty, code, raw: row };
  }).filter(r => r.product || r.board);
  debugInfo.shipmentNormalized = normalized.length;
  return normalized;
}

function fillSelect(select, values, allLabel) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (values.includes(current)) select.value = current;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

function renderAllocation() {
  const store = $('storeFilter').value;
  const brand = $('brandFilter').value;
  const days = $('allocationDays').value;
  const rows = allocationRows
    .filter(r => (!store || r.store === store) && (!brand || r.brand === brand) && withinDays(r.date, days))
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

  $('allocationCount').textContent = `${rows.length} result${rows.length === 1 ? '' : 's'}`;
  $('statStores').textContent = uniqueSorted(rows.map(r => r.store)).length;
  $('statBrands').textContent = uniqueSorted(rows.map(r => r.brand)).length;
  $('statLatest').textContent = fmtDate(rows[0]?.date);

  if (!rows.length) {
    $('allocationTable').innerHTML = `<div class="empty">No allocation records found. Add drop_history.csv beside this file or adjust the filters.</div>`;
    return;
  }
  $('allocationTable').innerHTML = `<table><thead><tr><th>Date</th><th>Store</th><th>Brand / Product</th><th>Board</th></tr></thead><tbody>${rows.map(r => `
    <tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.store || '—')}</td><td>${escapeHtml(r.brand || '—')}</td><td>${escapeHtml(r.board || '—')}</td></tr>`).join('')}</tbody></table>`;
}

function groupedShipments(rows) {
  const groups = new Map();
  rows.forEach(r => {
    const product = r.product || 'Unknown Product';
    if (!groups.has(product)) groups.set(product, { product, boards: new Set(), latest: null, count: 0 });
    const g = groups.get(product);
    if (r.board) g.boards.add(r.board);
    if (r.date && (!g.latest || r.date > g.latest)) g.latest = r.date;
    g.count++;
  });
  return [...groups.values()].sort((a, b) => (b.latest?.getTime() || 0) - (a.latest?.getTime() || 0) || a.product.localeCompare(b.product));
}

function renderShipments() {
  const product = $('shipmentProductFilter').value;
  const board = $('shipmentBoardFilter').value;
  const days = $('shipmentDays').value;
  filteredShipmentRows = shipmentRows
    .filter(r => (!product || r.product === product) && (!board || r.board === board) && withinDays(r.date, days))
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0) || String(a.product).localeCompare(String(b.product)));
  const groups = groupedShipments(filteredShipmentRows);
  $('shipmentCount').textContent = `${groups.length} product${groups.length === 1 ? '' : 's'}`;

  if (!shipmentRows.length) {
    $('shipmentHeroTable').innerHTML = `<div class="empty">No shipment records loaded yet. Use a local web server, or choose your shipment CSV/HTML report in the loader above.</div>`;
    $('shipmentDetailTable').innerHTML = `<div class="empty">No detailed shipment rows available.</div>`;
    return;
  }
  if (!groups.length) {
    $('shipmentHeroTable').innerHTML = `<div class="empty">No shipment records match the selected filters.</div>`;
    $('shipmentDetailTable').innerHTML = `<div class="empty">No detailed shipment rows match the selected filters.</div>`;
    return;
  }

  $('shipmentHeroTable').innerHTML = `<table><thead><tr><th>Product</th><th>Boards Receiving</th><th>Latest Seen</th></tr></thead><tbody>${groups.slice(0, 40).map(g => `
    <tr><td><strong>${escapeHtml(g.product)}</strong><br><small>${g.count} shipment row${g.count === 1 ? '' : 's'}</small></td><td>${[...g.boards].sort().map(b => `<span class="badge">${escapeHtml(b)}</span>`).join('') || '—'}</td><td>${fmtDate(g.latest)}</td></tr>`).join('')}</tbody></table>`;

  $('shipmentDetailTable').innerHTML = `<table><thead><tr><th>Date</th><th>Product</th><th>Board</th><th>Qty</th><th>Code</th></tr></thead><tbody>${filteredShipmentRows.map(r => `
    <tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.product || '—')}</td><td>${escapeHtml(r.board || '—')}</td><td>${escapeHtml(r.qty || '—')}</td><td>${escapeHtml(r.code || '—')}</td></tr>`).join('')}</tbody></table>`;
}

function renderHome() {
  const recent = allocationRows
    .filter(r => withinDays(r.date, 30))
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
    .slice(0, 6);
  $('homeRecentAllocations').innerHTML = recent.length ? recent.map(r => `<div class="compact-item"><div><strong>${escapeHtml(r.brand || 'Unknown Brand')}</strong><small>${escapeHtml(r.store || 'Unknown Store')}</small></div><span>${fmtDate(r.date)}</span></div>`).join('') : `<div class="empty">Add drop_history.csv to populate recent allocation history.</div>`;

  const shipmentGroups = groupedShipments(shipmentRows.filter(r => withinDays(r.date, 30))).slice(0, 6);
  $('homeShipmentPreview').innerHTML = shipmentGroups.length ? shipmentGroups.map(g => `<div class="compact-item"><div><strong>${escapeHtml(g.product)}</strong><small>${[...g.boards].sort().slice(0, 4).join(', ') || 'Board unknown'}</small></div><span>${fmtDate(g.latest)}</span></div>`).join('') : `<div class="empty">Add shipment CSV to populate Shipment Radar.</div>`;
}

function updateDataStatus(allocLoad, shipLoad) {
  const loaded = [];
  loaded.push(allocLoad.file ? `Allocation History: ${allocLoad.file}` : 'Allocation History: missing drop_history.csv');
  loaded.push(shipLoad.file ? `Shipment Radar: ${shipLoad.file} (${debugInfo.shipmentNormalized} rows)` : 'Shipment Radar: choose shipment file or run from local server');
  $('dataStatus').textContent = loaded.join(' • ');
}

function wireNav() {
  document.querySelectorAll('[data-section], [data-section-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section || btn.dataset.sectionJump;
      document.querySelectorAll('.page-section').forEach(s => s.classList.toggle('active', s.id === section));
      document.querySelectorAll('.nav-btn').forEach(n => n.classList.toggle('active', n.dataset.section === section));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function refreshShipmentControls() {
  fillSelect($('shipmentProductFilter'), uniqueSorted(shipmentRows.map(r => r.product)), 'All products');
  fillSelect($('shipmentBoardFilter'), uniqueSorted(shipmentRows.map(r => r.board)), 'All boards');
  renderShipments();
  renderHome();
}

function wireFileLoaders() {
  const input = $('shipmentFileInput');
  const card = $('shipmentLoadCard');
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const raw = parseDataFile(text, file.name);
    debugInfo.shipmentFile = file.name;
    shipmentRows = normalizedShipmentRows(raw);
    if (card) card.style.display = 'none';
    refreshShipmentControls();
    $('dataStatus').textContent = `Shipment Radar: ${file.name} (${shipmentRows.length} rows loaded)`;
  });
}

async function init() {
  wireNav();
  wireFileLoaders();
  const [allocLoad, shipLoad] = await Promise.all([
    loadFirstAvailable(CSV_CANDIDATES.allocations),
    loadFirstAvailable(CSV_CANDIDATES.shipments)
  ]);
  allocationRows = normalizedAllocationRows(allocLoad.rows);
  shipmentRows = normalizedShipmentRows(shipLoad.rows);

  fillSelect($('storeFilter'), uniqueSorted(allocationRows.map(r => r.store)), 'All stores');
  fillSelect($('brandFilter'), uniqueSorted(allocationRows.map(r => r.brand)), 'All brands');
  refreshShipmentControls();

  ['storeFilter', 'brandFilter', 'allocationDays'].forEach(id => $(id)?.addEventListener('change', renderAllocation));
  ['shipmentProductFilter', 'shipmentBoardFilter', 'shipmentDays'].forEach(id => $(id)?.addEventListener('change', renderShipments));

  renderAllocation();
  renderShipments();
  renderHome();
  updateDataStatus(allocLoad, shipLoad);

  const loadCard = $('shipmentLoadCard');
  if (loadCard && (!shipLoad.file || !shipmentRows.length)) loadCard.style.display = 'block';
}

init();
