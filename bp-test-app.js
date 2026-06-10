const CSV_CANDIDATES = {
  allocations: ['drop_history.csv'],
  shipments: ['nc_shipment_radar.csv', 'ncabc_inventory_report.csv', 'stock_shipped.csv', 'ncabc_stock_shipped.csv', 'shipment_report.csv']
};

let allocationRows = [];
let shipmentRows = [];
let filteredShipmentRows = [];

const $ = (id) => document.getElementById(id);

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pick(row, candidates) {
  const keys = Object.keys(row || {});
  const normalized = keys.map(k => ({ key: k, norm: normalizeKey(k), value: String(row[k] ?? '').trim() }));
  for (const candidate of candidates) {
    const target = normalizeKey(candidate);
    let match = normalized.find(k => k.norm === target && k.value);
    if (match) return match.value;
    match = normalized.find(k => k.norm.startsWith(target) && k.value);
    if (match) return match.value;
    match = normalized.find(k => k.norm.includes(target) && k.value);
    if (match) return match.value;
  }
  return '';
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
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
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').trim()])));
}

async function loadFirstAvailable(files) {
  for (const file of files) {
    try {
      const response = await fetch(file, { cache: 'no-store' });
      if (response.ok) return { file, rows: parseCSV(await response.text()) };
    } catch (err) {}
  }
  return { file: null, rows: [] };
}

function asDate(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const m = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const year = Number(m[3].length === 2 ? '20' + m[3] : m[3]);
    return new Date(year, Number(m[1]) - 1, Number(m[2]));
  }
  return null;
}

function fmtDate(date) {
  if (!date) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function withinDays(rowDate, days) {
  if (days === 'all') return true;
  if (!rowDate) return true;
  const cutoff = new Date();
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

function normalizedShipmentRows(rows) {
  return rows.map(row => {
    const dateRaw = pick(row, ['date', 'ship_date', 'shipment_date', 'shipping_date', 'report_date', 'run_date', 'created_at', 'timestamp']);
    const product = pick(row, ['product', 'product_name', 'item_name', 'brand', 'item', 'description', 'desc', 'spirit_name', 'liquor_description', 'name']);
    const board = pick(row, ['board', 'abc_board', 'board_name', 'county', 'county_name', 'recipient', 'destination', 'location', 'agency', 'customer', 'ship_to']);
    const qty = pick(row, ['qty', 'quantity', 'case_qty', 'cases', 'bottles', 'units', 'shipped', 'amount']);
    const code = pick(row, ['code', 'item_code', 'product_code', 'nc_code', 'bailment_code', 'sku']);
    const date = asDate(dateRaw);
    return { dateRaw, date, product, board, qty, code, raw: row };
  }).filter(r => r.product || r.board);
}

function fillSelect(select, values, allLabel) {
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
  return [...groups.values()].sort((a, b) => (b.latest?.getTime() || 0) - (a.latest?.getTime() || 0));
}

function renderShipments() {
  const product = $('shipmentProductFilter').value;
  const board = $('shipmentBoardFilter').value;
  const days = $('shipmentDays').value;
  filteredShipmentRows = shipmentRows
    .filter(r => (!product || r.product === product) && (!board || r.board === board) && withinDays(r.date, days))
    .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));
  const groups = groupedShipments(filteredShipmentRows);
  $('shipmentCount').textContent = `${groups.length} product${groups.length === 1 ? '' : 's'}`;

  if (!groups.length) {
    $('shipmentHeroTable').innerHTML = `<div class="empty">No shipment records found. Add a shipment CSV beside this file, or adjust the filters.</div>`;
    $('shipmentDetailTable').innerHTML = `<div class="empty">No detailed shipment rows available.</div>`;
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

async function init() {
  wireNav();
  const [allocLoad, shipLoad] = await Promise.all([
    loadFirstAvailable(CSV_CANDIDATES.allocations),
    loadFirstAvailable(CSV_CANDIDATES.shipments)
  ]);
  allocationRows = normalizedAllocationRows(allocLoad.rows);
  shipmentRows = normalizedShipmentRows(shipLoad.rows);

  fillSelect($('storeFilter'), uniqueSorted(allocationRows.map(r => r.store)), 'All stores');
  fillSelect($('brandFilter'), uniqueSorted(allocationRows.map(r => r.brand)), 'All brands');
  fillSelect($('shipmentProductFilter'), uniqueSorted(shipmentRows.map(r => r.product)), 'All products');
  fillSelect($('shipmentBoardFilter'), uniqueSorted(shipmentRows.map(r => r.board)), 'All boards');

  ['storeFilter', 'brandFilter', 'allocationDays'].forEach(id => $(id).addEventListener('change', renderAllocation));
  ['shipmentProductFilter', 'shipmentBoardFilter', 'shipmentDays'].forEach(id => $(id).addEventListener('change', renderShipments));

  renderAllocation();
  renderShipments();
  renderHome();

  const loaded = [];
  loaded.push(allocLoad.file ? `Allocation History: ${allocLoad.file}` : 'Allocation History: missing drop_history.csv');
  loaded.push(shipLoad.file ? `Shipment Radar: ${shipLoad.file}` : 'Shipment Radar: missing shipment CSV');
  $('dataStatus').textContent = loaded.join(' • ');
}

init();
