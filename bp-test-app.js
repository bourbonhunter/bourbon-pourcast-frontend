const DATA_CANDIDATES = {
  dropTracker: ['drop_tracker.csv'],
  shipments: ['ncabc_inventory_report.html']
};

let dropTrackerRows = [];
let shipmentRows = [];
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
  return String(value ?? '').replace(/[&<>\"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

function normalizeKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

function fmtDate(date) {
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function fmtShortDate(date) {
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
}

function withinWindow(row, windowValue) {
  if (windowValue === 'all') return true;
  const trackerDate = atMidnight(row.expectedDate || row.announcedDate || row.confirmedDate);
  if (!trackerDate) return false;

  const today = atMidnight(new Date());
  if (windowValue === 'next7') {
    const end = addDays(today, 7);
    return trackerDate >= today && trackerDate <= end;
  }

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - Number(windowValue));
  return trackerDate >= cutoff && trackerDate <= today;
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

function normalizedDropTrackerRows(rows) {
  return rows.map(row => {
    const expectedRaw = pick(row, ['expecteddate', 'expected_date', 'drop_expected', 'expected']);
    const announcedRaw = pick(row, ['announceddate', 'announced_date', 'drop_announced', 'announced']);
    const confirmedRaw = pick(row, ['confirmeddate', 'verifieddate', 'confirmed_date', 'verified_date', 'drop_confirmed', 'drop_verified']);
    const store = pick(row, ['store', 'storeaddress', 'store_name', 'abc_store', 'location']);
    const brand = pick(row, ['brand', 'product', 'product_name', 'item', 'description']);
    const board = pick(row, ['board', 'county', 'abc_board']);
    const statusRaw = pick(row, ['status']);
    const daysSinceLastRaw = pick(row, ['dayssincelast', 'days_since_last']);
    const source = pick(row, ['source']);
    const expectedDate = asDate(expectedRaw);
    const announcedDate = asDate(announcedRaw);
    const confirmedDate = asDate(confirmedRaw);
    const status = normalizeStatus(statusRaw || (confirmedDate ? 'confirmed' : announcedDate ? 'announced' : 'expected'));
    const daysSinceLast = Number(daysSinceLastRaw || 0) || null;
    return { expectedRaw, announcedRaw, confirmedRaw, expectedDate, announcedDate, confirmedDate, store, brand, board, status, daysSinceLast, source, raw: row };
  }).filter(r => r.store || r.brand || r.expectedDate || r.announcedDate || r.confirmedDate);
}

function normalizeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'verified') return 'confirmed';
  if (v === 'confirm' || v === 'confirmed') return 'confirmed';
  if (v === 'announce' || v === 'announced') return 'announced';
  if (v === 'expected' || v === 'watch') return 'expected';
  return v || 'announced';
}

function statusLabel(status) {
  if (status === 'expected') return 'Expected';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'announced') return 'Announced';
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Announced';
}

function statusIcon(status) {
  if (status === 'expected') return '🟡';
  if (status === 'confirmed') return '🟢';
  if (status === 'announced') return '🔵';
  return '⚪';
}

function statusClass(status) {
  if (status === 'expected') return 'status-expected';
  if (status === 'confirmed') return 'status-confirmed';
  if (status === 'announced') return 'status-announced';
  return 'status-neutral';
}

function statusPill(status) {
  return `<span class="status-pill ${statusClass(status)}"><span>${statusIcon(status)}</span>${escapeHtml(statusLabel(status))}</span>`;
}

function fillSelect(select, values, allLabel) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${allLabel}</option>` + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (values.includes(current)) select.value = current;
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
  const store = $('storeFilter').value;
  const brand = $('brandFilter').value;
  const status = $('trackerStatusFilter').value;
  const days = $('allocationDays').value;

  const rows = dropTrackerRows
    .filter(r => (!store || r.store === store) && (!brand || r.brand === brand) && (!status || r.status === status) && withinWindow(r, days))
    .sort((a, b) => {
      const aDate = a.expectedDate || a.announcedDate || a.confirmedDate;
      const bDate = b.expectedDate || b.announcedDate || b.confirmedDate;
      if (days === 'next7') return (aDate?.getTime() || 0) - (bDate?.getTime() || 0) || String(a.store).localeCompare(String(b.store));
      return (bDate?.getTime() || 0) - (aDate?.getTime() || 0) || String(a.store).localeCompare(String(b.store));
    });

  const expectedNext7 = dropTrackerRows.filter(r => r.status === 'expected' && withinWindow(r, 'next7')).length;
  const visibleBrands = uniqueSorted(rows.map(r => r.brand));
  const latestAnnounced = dropTrackerRows
    .filter(r => r.status === 'announced' && r.announcedDate)
    .sort((a, b) => b.announcedDate - a.announcedDate)[0];

  $('allocationCount').textContent = `${rows.length} result${rows.length === 1 ? '' : 's'}`;
  $('statExpectedTomorrow').textContent = expectedNext7;
  $('statStores').textContent = uniqueSorted(rows.map(r => r.store)).length;
  $('statBrands').textContent = visibleBrands.length;
  $('statLatest').textContent = fmtDate(latestAnnounced?.announcedDate);

  if (!dropTrackerRows.length) {
    $('allocationTable').innerHTML = `<div class="empty">Drop Tracker data is not loaded yet. Add <strong>drop_tracker.csv</strong> beside this file.</div>`;
    return;
  }

  if (!rows.length) {
    $('allocationTable').innerHTML = `<div class="empty">No Drop Tracker records match the selected filters.</div>`;
    return;
  }

  $('allocationTable').innerHTML = `<table><thead><tr><th>Expected</th><th>Announced</th><th>Store</th><th>Brand / Product</th><th>Board</th><th>Status</th></tr></thead><tbody>${rows.map(r => `
    <tr>
      <td>${fmtDate(r.expectedDate)}</td>
      <td>${fmtDate(r.announcedDate)}</td>
      <td>${escapeHtml(r.store || '—')}</td>
      <td>${escapeHtml(r.brand || '—')}</td>
      <td>${escapeHtml(r.board || '—')}</td>
      <td>${statusPill(r.status)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function shipmentSinceText() {
  return shipmentMeta.shippedSince ? `Shipped Since: ${fmtDate(shipmentMeta.shippedSince)}` : 'Shipped Since: Report window unavailable';
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
  const recentAnnounced = dropTrackerRows
    .filter(r => r.status === 'announced' && r.announcedDate)
    .sort((a, b) => (b.announcedDate?.getTime() || 0) - (a.announcedDate?.getTime() || 0))
    .slice(0, 5);

  $('homeRecentAllocations').innerHTML = recentAnnounced.length
    ? recentAnnounced.map(r => `<div class="compact-item"><div><strong>${escapeHtml(r.brand || 'Unknown Brand')}</strong><small>${escapeHtml(r.store || 'Unknown Store')}</small></div><span>${fmtShortDate(r.announcedDate)}</span></div>`).join('')
    : `<div class="empty">No announced drops loaded yet.</div>`;

  const watch = dropTrackerRows
    .filter(r => r.status === 'expected' && withinWindow(r, 'next7'))
    .sort((a, b) => (a.expectedDate?.getTime() || 0) - (b.expectedDate?.getTime() || 0) || String(a.store).localeCompare(String(b.store)));
  $('homeWatchListTitle').textContent = `${watch.length} Store${watch.length === 1 ? '' : 's'} Expected Soon`;
  $('homeWatchList').innerHTML = watch.length
    ? watch.slice(0, 5).map(r => `<div class="compact-item"><div><strong>${escapeHtml(r.store || 'Unknown Store')}</strong><small>${r.daysSinceLast ? `${r.daysSinceLast} days since last logged drop` : 'No recent logged drop'}</small></div><span>${fmtShortDate(r.expectedDate)}</span></div>`).join('') + (watch.length > 5 ? `<div class="compact-item"><div><strong>+${watch.length - 5} more</strong><small>Open Drop Tracker for full list</small></div><span>Next 7</span></div>` : '')
    : `<div class="empty">No stores currently meet the Next 7 Days Watch List rule.</div>`;

  $('homeShipmentSince').textContent = shipmentRows.length ? shipmentSinceText() : '';
  const groups = groupedShipments(shipmentRows);
  const boardsReceiving = uniqueSorted(shipmentRows.filter(r => Number(r.qty) > 0).map(r => r.board)).length;
  $('homeShipmentStats').textContent = shipmentRows.length ? `Boards Receiving Allocated Products: ${boardsReceiving} · Products Tracked: ${groups.length}` : '';
  $('homeShipmentPreview').innerHTML = groups.length
    ? groups.slice(0, 5).map((g, i) => `<div class="compact-item ranked-item"><div><strong>${i + 1}. ${escapeHtml(g.product)}</strong><small>${g.boards.size} board${g.boards.size === 1 ? '' : 's'} receiving</small></div><span>${g.totalQty.toLocaleString()} bottles</span></div>`).join('')
    : `<div class="empty">Shipment Radar data is not loaded yet.</div>`;
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
      const targetSection = btn.dataset.section || btn.dataset.sectionJump;
      if (btn.dataset.statusFilter && $('trackerStatusFilter')) $('trackerStatusFilter').value = btn.dataset.statusFilter;
      if (btn.dataset.dateFilter && $('allocationDays')) $('allocationDays').value = btn.dataset.dateFilter;
      if (targetSection === 'allocation') setTimeout(renderAllocation, 0);
      setSection(targetSection, btn.dataset.scrollTarget || null);
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
    $('shipmentLoadCard').style.display = shipmentRows.length ? 'none' : 'block';
  });
}

async function init() {
  wireNav();
  wireFileLoader();

  const [trackerLoad, shipLoad] = await Promise.all([
    loadFirstAvailable(DATA_CANDIDATES.dropTracker, parseCSV),
    loadFirstAvailable(DATA_CANDIDATES.shipments, parseInventoryReportHTML)
  ]);

  dropTrackerRows = normalizedDropTrackerRows(trackerLoad.rows);
  shipmentRows = shipLoad.rows;
  if (!shipmentRows.length) $('shipmentLoadCard').style.display = 'block';

  fillSelect($('storeFilter'), uniqueSorted(dropTrackerRows.map(r => r.store)), 'All stores');
  fillSelect($('brandFilter'), uniqueSorted(dropTrackerRows.map(r => r.brand)), 'All brands');
  fillSelect($('shipmentProductFilter'), uniqueSorted(shipmentRows.map(r => r.product)), 'All products');
  fillSelect($('shipmentBoardFilter'), uniqueSorted(shipmentRows.map(r => r.board)), 'All boards');

  ['storeFilter', 'brandFilter', 'allocationDays', 'trackerStatusFilter'].forEach(id => $(id)?.addEventListener('change', renderAllocation));
  ['shipmentProductFilter', 'shipmentBoardFilter'].forEach(id => $(id)?.addEventListener('change', renderShipments));

  renderAllocation();
  renderShipments();
  renderHome();
}

init();

// ==========================================
// Bourbon Pourcast Alert Registration
// ==========================================

const SUPABASE_URL = 'https://akitjakjvaupljhvsgnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_JTOyuIOQyFadm01Iv9EPyg_lsPIHC83';

async function registerAlertSubscriber(email) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/register_email_subscriber`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
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
  const form = document.getElementById('alertSignupForm');
  const emailInput = document.getElementById('alertEmail');
  const message = document.getElementById('alertSignupMessage');

  if (!form || !emailInput || !message) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim().toLowerCase();
    if (!email) return;

    message.textContent = 'Registering...';

    try {
      const result = await registerAlertSubscriber(email);

      if (result === 'already_registered') {
        message.textContent = "✅ You're already registered. No action required.";
        if (window.plausible) plausible('Already Registered');
      } else {
        message.textContent = "✅ Thanks for registering! You'll receive free Bourbon Pourcast updates and be notified when new alert features become available.";
        if (window.plausible) plausible('Registration');
      }

      emailInput.value = '';
    } catch (err) {
      console.error(err);
      message.textContent = 'Sorry, registration failed. Please try again.';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireAlertSignup);
} else {
  wireAlertSignup();
}
