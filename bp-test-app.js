const DATA_CANDIDATES = {
  allocations: ['drop_history.csv'],
  shipments: ['ncabc_inventory_report.html', 'stock_shipped.html', 'nc_shipment_radar.csv', 'ncabc_inventory_report.csv', 'stock_shipped.csv']
};

let allocationRows = [];
let shipmentRows = [];
let filteredShipmentRows = [];
let shipmentMeta = { file: null, shippedSince: null, lastUpdated: '', coverageDays: null, isInventoryReport: false };

const $ = (id) => document.getElementById(id);

function normalizeKey(key) { return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }
function uniqueSorted(values) { return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b)); }
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
function fmtDate(date) { return date ? date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) : '—'; }

function scoreKey(key, candidates) {
  const norm = normalizeKey(key); let best = 0;
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
  const rows = []; let row = [], cell = '', inQuotes = false;
  text = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i+1];
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
  return rows.map(values => Object.fromEntries(headers.map((h,i)=>[h || `Column ${i+1}`, (values[i] || '').trim()])));
}

function parseInventoryReportHTML(text, fileName='ncabc_inventory_report.html') {
  const doc = new DOMParser().parseFromString(String(text || ''), 'text/html');
  const brandBlocks = [...doc.querySelectorAll('tbody.brand-block')];
  if (!brandBlocks.length) return null;

  const bodyText = doc.body?.textContent || '';
  const shippedSinceText = bodyText.match(/Allocated brands shipped since:\s*([^\n]+)/i)?.[1]?.trim() || '';
  const lastUpdatedText = bodyText.match(/Last updated on NC ABC:\s*([^\n]+)/i)?.[1]?.trim() || '';
  const coverageDays = Number(bodyText.match(/Coverage window:\s*(\d+)\s*days/i)?.[1] || '') || null;
  const shippedSince = asDate(shippedSinceText);
  shipmentMeta = { file: fileName, shippedSince, lastUpdated: lastUpdatedText, coverageDays, isInventoryReport: true };

  const rows = [];
  brandBlocks.forEach(block => {
    const totalRow = block.querySelector('tr.total');
    if (!totalRow) return;
    const target = totalRow.getAttribute('data-target');
    const product = totalRow.querySelector('td.brand strong')?.textContent?.trim() || totalRow.children[1]?.textContent?.trim() || '';
    const totalBottles = totalRow.querySelector('td.total-bottles strong')?.textContent?.trim() || '';
    const detail = target ? doc.getElementById(target) : block.nextElementSibling;
    const detailRows = detail ? [...detail.querySelectorAll('tr')] : [];
    detailRows.forEach(tr => {
      const board = tr.querySelector('td.board')?.textContent?.trim() || tr.children[1]?.textContent?.trim() || '';
      const qty = tr.querySelector('td.bottles')?.textContent?.trim() || tr.children[2]?.textContent?.trim() || '';
      if (product && board) rows.push({ date: shippedSince, dateRaw: shippedSinceText, product, board, qty, code: '', totalBottles, raw: {} });
    });
  });
  return rows;
}

function parseGenericHTMLTable(text) {
  const doc = new DOMParser().parseFromString(String(text || ''), 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  const trs = [...table.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.textContent.trim())).filter(r => r.some(Boolean));
  if (!trs.length) return [];
  const headers = trs[0].map((h,i)=>h || `Column ${i+1}`);
  return trs.slice(1).map(values => Object.fromEntries(headers.map((h,i)=>[h, values[i] || ''])));
}

function parseDataFile(text, fileName='') {
  if (/\.html?$/i.test(fileName) || /^\s*</.test(String(text || ''))) {
    const inventoryRows = parseInventoryReportHTML(text, fileName);
    if (inventoryRows) return { rows: inventoryRows, alreadyNormalized: true };
    return { rows: parseGenericHTMLTable(text), alreadyNormalized: false };
  }
  shipmentMeta = { file: fileName, shippedSince: null, lastUpdated: '', coverageDays: null, isInventoryReport: false };
  return { rows: parseCSV(text), alreadyNormalized: false };
}

async function loadFirstAvailable(files) {
  for (const file of files) {
    try {
      const response = await fetch(file, { cache: 'no-store' });
      if (response.ok) {
        const parsed = parseDataFile(await response.text(), file);
        return { file, ...parsed };
      }
    } catch (err) {}
  }
  return { file: null, rows: [], alreadyNormalized: false };
}

function normalizedAllocationRows(rows) {
  return rows.map(row => {
    const dateRaw = pick(row, ['date','drop_date','effective_date','seen_date','timestamp']);
    const store = pick(row, ['store','store_name','abc_store','location']);
    const brand = pick(row, ['brand','product','product_name','item','description']);
    const board = pick(row, ['board','county','abc_board']);
    return { dateRaw, date: asDate(dateRaw), store, brand, board, raw: row };
  }).filter(r => r.store || r.brand);
}

function normalizedShipmentRows(rows, alreadyNormalized=false) {
  if (alreadyNormalized) return rows.filter(r => r.product && r.board);
  return rows.map(row => {
    const dateRaw = pick(row, ['date','shipdate','shipmentdate','reportdate','lastupdated','lastseen','timestamp']);
    const product = pick(row, ['product','productname','brand','itemname','item','description','productdescription']);
    const board = pick(row, ['board','abcboard','boardname','county','countyname','shipto','localboard','destination']);
    const qty = pick(row, ['qty','quantity','bottles','cases','units','shipped','stock','onhand']);
    const code = pick(row, ['code','itemcode','productcode','nccode','sku']);
    return { dateRaw, date: asDate(dateRaw), product, board, qty, code, raw: row };
  }).filter(r => r.product && r.board);
}

function fillSelect(select, values, allLabel) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (values.includes(current)) select.value = current;
}

function withinDays(rowDate, days) {
  if (days === 'all' || days === 'report') return true;
  if (!rowDate) return true;
  const cutoff = new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate() - Number(days));
  return rowDate >= cutoff;
}

function shipmentInWindow(row, days) {
  if (days === 'report' || days === 'all') return true;
  if (shipmentMeta.isInventoryReport && shipmentMeta.coverageDays) return shipmentMeta.coverageDays <= Number(days);
  return withinDays(row.date, days);
}

function renderAllocation() {
  const store = $('storeFilter').value, brand = $('brandFilter').value, days = $('allocationDays').value;
  const rows = allocationRows.filter(r => (!store || r.store === store) && (!brand || r.brand === brand) && withinDays(r.date, days))
    .sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0));
  $('allocationCount').textContent = `${rows.length} result${rows.length === 1 ? '' : 's'}`;
  $('statStores').textContent = uniqueSorted(rows.map(r => r.store)).length;
  $('statBrands').textContent = uniqueSorted(rows.map(r => r.brand)).length;
  $('statLatest').textContent = fmtDate(rows[0]?.date);
  $('allocationTable').innerHTML = rows.length ? `<table><thead><tr><th>Date</th><th>Store</th><th>Brand / Product</th><th>Board</th></tr></thead><tbody>${rows.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.store||'—')}</td><td>${escapeHtml(r.brand||'—')}</td><td>${escapeHtml(r.board||'—')}</td></tr>`).join('')}</tbody></table>` : `<div class="empty">No allocation records found for the selected filters.</div>`;
}

function groupedShipments(rows) {
  const groups = new Map();
  rows.forEach(r => {
    if (!groups.has(r.product)) groups.set(r.product, { product: r.product, boards: new Map(), count: 0, totalQty: 0, latest: null });
    const g = groups.get(r.product);
    const boardQty = Number(String(r.qty || '').replace(/[^0-9.-]/g,'')) || 0;
    g.boards.set(r.board, (g.boards.get(r.board) || 0) + boardQty);
    g.totalQty += boardQty;
    g.count++;
    if (r.date && (!g.latest || r.date > g.latest)) g.latest = r.date;
  });
  return [...groups.values()].sort((a,b)=>(b.totalQty-a.totalQty) || a.product.localeCompare(b.product));
}

function shipmentSinceText() {
  if (shipmentMeta.shippedSince) return `Shipped since ${fmtDate(shipmentMeta.shippedSince)}`;
  if (shipmentMeta.coverageDays) return `Current report window: ${shipmentMeta.coverageDays} days`;
  return 'Current shipment report window';
}

function renderShipmentHint(days) {
  const hint = $('shipmentWindowHint'); if (!hint) return;
  if (!shipmentRows.length) { hint.textContent = ''; return; }
  if (shipmentMeta.isInventoryReport) {
    const parts = [shipmentSinceText()];
    if (shipmentMeta.coverageDays) parts.push(`${shipmentMeta.coverageDays}-day coverage window`);
    if (shipmentMeta.lastUpdated) parts.push(`NC ABC updated ${shipmentMeta.lastUpdated}`);
    if (days !== 'report' && shipmentMeta.coverageDays && Number(days) < shipmentMeta.coverageDays) {
      parts.push(`This report was generated for a ${shipmentMeta.coverageDays}-day window; generate a shorter report to isolate only ${days} days.`);
    }
    hint.textContent = parts.join(' • ');
  } else {
    hint.textContent = 'Showing shipment rows from the selected date window.';
  }
}

function renderShipments() {
  const product = $('shipmentProductFilter').value, board = $('shipmentBoardFilter').value, days = $('shipmentDays').value;
  renderShipmentHint(days);
  filteredShipmentRows = shipmentRows.filter(r => (!product || r.product === product) && (!board || r.board === board) && shipmentInWindow(r, days));
  const groups = groupedShipments(filteredShipmentRows);
  $('shipmentCount').textContent = `${groups.length} product${groups.length === 1 ? '' : 's'}`;
  if (!shipmentRows.length) {
    $('shipmentHeroTable').innerHTML = `<div class="empty">No shipment records loaded yet. Use a local web server, or choose your ncabc_inventory_report.html above.</div>`;
    return;
  }
  if (!groups.length) {
    $('shipmentHeroTable').innerHTML = `<div class="empty">No products match the selected shipment filters.</div>`;
    return;
  }
  $('shipmentHeroTable').innerHTML = `<table><thead><tr><th>Product</th><th>Shipped Since</th><th>Boards Receiving</th><th>Total Bottles</th></tr></thead><tbody>${groups.slice(0,50).map(g => `<tr><td><strong>${escapeHtml(g.product)}</strong><br><small>${g.boards.size} board${g.boards.size===1?'':'s'}</small></td><td>${escapeHtml(shipmentSinceText())}</td><td>${[...g.boards.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(0,18).map(([b,q])=>`<span class="badge">${escapeHtml(b)}${q ? ` · ${q}` : ''}</span>`).join('')}${g.boards.size>18 ? `<span class="badge">+${g.boards.size-18} more</span>` : ''}</td><td>${g.totalQty || '—'}</td></tr>`).join('')}</tbody></table>`;
}

function renderHome() {
  const recent = allocationRows.filter(r => withinDays(r.date, 30)).sort((a,b)=>(b.date?.getTime()||0)-(a.date?.getTime()||0)).slice(0,6);
  $('homeRecentAllocations').innerHTML = recent.length ? recent.map(r => `<div class="compact-item"><div><strong>${escapeHtml(r.brand || 'Unknown Brand')}</strong><small>${escapeHtml(r.store || 'Unknown Store')}</small></div><span>${fmtDate(r.date)}</span></div>`).join('') : `<div class="empty">Allocation history data is not loaded yet.</div>`;
  const since = $('homeShipmentSince');
  if (since) since.textContent = shipmentRows.length ? shipmentSinceText() : '';
  const shipmentGroups = groupedShipments(shipmentRows).slice(0,6);
  $('homeShipmentPreview').innerHTML = shipmentGroups.length ? shipmentGroups.map(g => `<div class="compact-item"><div><strong>${escapeHtml(g.product)}</strong><small>${escapeHtml(shipmentSinceText())}<br>${[...g.boards.keys()].sort().slice(0,4).join(', ') || 'Board unknown'}</small></div><span>${g.totalQty || '—'} bottles</span></div>`).join('') : `<div class="empty">Shipment Radar data is not loaded yet.</div>`;
}

function updateDataStatus(allocLoad, shipLoad) {
  const parts = [];
  if (allocationRows.length) parts.push(`Allocation History loaded`);
  if (shipmentRows.length) parts.push(`Shipment Radar loaded: ${shipmentRows.length} board rows`);
  $('dataStatus').textContent = parts.length ? parts.join(' • ') : 'Local data not loaded yet';
}

function wireNav() {
  document.querySelectorAll('[data-section], [data-section-jump]').forEach(btn => btn.addEventListener('click', () => {
    const section = btn.dataset.section || btn.dataset.sectionJump;
    document.querySelectorAll('.page-section').forEach(s => s.classList.toggle('active', s.id === section));
    document.querySelectorAll('.nav-btn').forEach(n => n.classList.toggle('active', n.dataset.section === section));
    window.scrollTo({ top:0, behavior:'smooth' });
  }));
}
function refreshShipmentControls() {
  fillSelect($('shipmentProductFilter'), uniqueSorted(shipmentRows.map(r=>r.product)), 'All products');
  fillSelect($('shipmentBoardFilter'), uniqueSorted(shipmentRows.map(r=>r.board)), 'All boards');
  renderShipments(); renderHome();
}
function wireFileLoaders() {
  const input = $('shipmentFileInput'), card = $('shipmentLoadCard'); if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    const parsed = parseDataFile(await file.text(), file.name);
    shipmentRows = normalizedShipmentRows(parsed.rows, parsed.alreadyNormalized);
    if (card && shipmentRows.length) card.style.display = 'none';
    refreshShipmentControls();
    $('dataStatus').textContent = `Shipment Radar loaded: ${shipmentRows.length} board rows`;
  });
}

async function init() {
  wireNav(); wireFileLoaders();
  const [allocLoad, shipLoad] = await Promise.all([loadFirstAvailable(DATA_CANDIDATES.allocations), loadFirstAvailable(DATA_CANDIDATES.shipments)]);
  allocationRows = normalizedAllocationRows(allocLoad.rows);
  shipmentRows = normalizedShipmentRows(shipLoad.rows, shipLoad.alreadyNormalized);
  fillSelect($('storeFilter'), uniqueSorted(allocationRows.map(r=>r.store)), 'All stores');
  fillSelect($('brandFilter'), uniqueSorted(allocationRows.map(r=>r.brand)), 'All brands');
  refreshShipmentControls();
  ['storeFilter','brandFilter','allocationDays'].forEach(id => $(id)?.addEventListener('change', renderAllocation));
  ['shipmentProductFilter','shipmentBoardFilter','shipmentDays'].forEach(id => $(id)?.addEventListener('change', renderShipments));
  renderAllocation(); renderShipments(); renderHome(); updateDataStatus(allocLoad, shipLoad);
  const loadCard = $('shipmentLoadCard'); if (loadCard && !shipmentRows.length) loadCard.style.display = 'block';
}
init();
