// Bourbon Pourcast Allocation History test.
// Expects drop_history.csv in the same folder as bp-test-index.html.

const CSV_PATH = "drop_history.csv";

const state = {
  rows: [],
  filtered: [],
  latestDate: null
};

const storeFilter = document.getElementById("storeFilter");
const brandFilter = document.getElementById("brandFilter");
const daysFilter = document.getElementById("daysFilter");
const textSearch = document.getElementById("textSearch");
const clearFilters = document.getElementById("clearFilters");
const results = document.getElementById("results");
const resultCount = document.getElementById("resultCount");
const statusMessage = document.getElementById("statusMessage");
const rangeNote = document.getElementById("rangeNote");
const summaryPanel = document.getElementById("summaryPanel");
const brandSummary = document.getElementById("brandSummary");

function clean(value) {
  return String(value || "").trim();
}

function normalizeStore(store) {
  return clean(store).replace(/\s+,/g, ",").replace(/\s+/g, " ");
}

function parseDateFromTimestamp(ts) {
  const value = clean(ts);
  const match = value.match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;

  const date = new Date(`${match[1]}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(v => clean(v))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some(v => clean(v))) rows.push(row);
  }

  return rows;
}

function rowsFromCSV(text) {
  const parsed = parseCSV(text);
  if (parsed.length < 2) return [];

  const header = parsed[0].map(clean);
  const idx = {
    ts: header.indexOf("TimestampDetected"),
    brand: header.indexOf("Brand"),
    store: header.indexOf("StoreAddress"),
    qty: header.indexOf("InventoryQty")
  };

  if (Object.values(idx).some(v => v < 0)) {
    throw new Error("drop_history.csv is missing one or more required columns.");
  }

  return parsed.slice(1).map(cols => {
    const date = parseDateFromTimestamp(cols[idx.ts]);
    return {
      rawTimestamp: clean(cols[idx.ts]),
      date,
      dateText: date ? ymd(date) : "",
      brand: clean(cols[idx.brand]),
      store: normalizeStore(cols[idx.store]),
      qty: Number(clean(cols[idx.qty])) || 0
    };
  }).filter(row => row.date && row.brand && row.store);
}

function populateSelect(select, values, firstLabel) {
  select.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = firstLabel;
  select.appendChild(first);

  values.forEach(value => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  });
}

function enableControls() {
  [storeFilter, brandFilter, daysFilter, textSearch, clearFilters].forEach(el => {
    el.disabled = false;
  });
}

function getCutoffDate() {
  const days = Number(daysFilter.value || 30);
  const cutoff = new Date(state.latestDate);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return cutoff;
}

function applyFilters() {
  const store = storeFilter.value;
  const brand = brandFilter.value;
  const q = clean(textSearch.value).toLowerCase();
  const cutoff = getCutoffDate();

  state.filtered = state.rows.filter(row => {
    const blob = `${row.dateText} ${row.brand} ${row.store} ${row.qty}`.toLowerCase();

    return row.date >= cutoff
      && row.date <= state.latestDate
      && (!store || row.store === store)
      && (!brand || row.brand === brand)
      && (!q || blob.includes(q));
  }).sort((a, b) => b.date - a.date || a.store.localeCompare(b.store) || a.brand.localeCompare(b.brand));

  render();
}

function render() {
  const rows = state.filtered;
  const cutoff = getCutoffDate();

  resultCount.textContent = `${rows.length} result${rows.length === 1 ? "" : "s"}`;
  rangeNote.textContent = `Showing ${ymd(cutoff)} through ${ymd(state.latestDate)} based on the latest date in drop_history.csv.`;

  if (!rows.length) {
    results.innerHTML = `
      <div class="result-card">
        <h3>No matching drops in this window</h3>
        <p class="muted">Try clearing one filter or switching from 7/14 days back to 30 days.</p>
      </div>
    `;
  } else {
    results.innerHTML = rows.map(row => `
      <div class="result-card">
        <h3>${escapeHTML(row.brand)}</h3>
        <div class="meta">
          <span>${row.dateText}</span>
          <span>${row.qty} bottle${row.qty === 1 ? "" : "s"}</span>
        </div>
        <p class="muted" style="margin:10px 0 0">${escapeHTML(row.store)}</p>
      </div>
    `).join("");
  }

  renderSummary(rows);
  renderBrandSummary(rows);
}

function renderSummary(rows) {
  const stores = uniqueSorted(rows.map(r => r.store));
  const brands = uniqueSorted(rows.map(r => r.brand));
  const bottles = rows.reduce((sum, r) => sum + r.qty, 0);

  summaryPanel.innerHTML = `
    <div class="summary-item"><strong>${rows.length}</strong><span>drop rows in current view</span></div>
    <div class="summary-item"><strong>${stores.length}</strong><span>tracked stores represented</span></div>
    <div class="summary-item"><strong>${brands.length}</strong><span>tracked brands represented</span></div>
    <div class="summary-item"><strong>${bottles}</strong><span>total bottles shown</span></div>
  `;
}

function renderBrandSummary(rows) {
  const latestByBrand = new Map();

  rows.forEach(row => {
    const prev = latestByBrand.get(row.brand);
    if (!prev || row.date > prev.date) latestByBrand.set(row.brand, row);
  });

  const items = [...latestByBrand.entries()]
    .sort((a, b) => b[1].date - a[1].date || a[0].localeCompare(b[0]))
    .slice(0, 8);

  brandSummary.innerHTML = items.length ? items.map(([brand, row]) => `
    <div class="summary-item">
      <strong>${escapeHTML(brand)}</strong>
      <span>${row.dateText} · ${escapeHTML(row.store)} · ${row.qty} bottles</span>
    </div>
  `).join("") : `<div class="summary-item"><span>No brands in current view.</span></div>`;
}

function escapeHTML(value) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  try {
    const response = await fetch(CSV_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load ${CSV_PATH}. HTTP ${response.status}`);
    }

    const text = await response.text();
    state.rows = rowsFromCSV(text);

    if (!state.rows.length) {
      throw new Error("Loaded drop_history.csv, but found no usable rows.");
    }

    state.latestDate = new Date(Math.max(...state.rows.map(r => r.date.getTime())));

    populateSelect(storeFilter, uniqueSorted(state.rows.map(r => r.store)), "All tracked stores");
    populateSelect(brandFilter, uniqueSorted(state.rows.map(r => r.brand)), "All tracked brands");

    statusMessage.textContent = `Loaded ${state.rows.length} history rows. Latest history date: ${ymd(state.latestDate)}.`;
    statusMessage.style.color = "var(--good)";

    enableControls();
    applyFilters();
  } catch (err) {
    console.error(err);
    statusMessage.textContent = err.message;
    resultCount.textContent = "Error";
    results.innerHTML = `
      <div class="result-card">
        <h3>CSV not loaded</h3>
        <p class="muted">
          Make sure <code>drop_history.csv</code> is in the same folder as this HTML file.
          If testing locally, use <code>python -m http.server 8000</code>.
        </p>
      </div>
    `;
  }
}

[storeFilter, brandFilter, daysFilter].forEach(el => el.addEventListener("change", applyFilters));
textSearch.addEventListener("input", applyFilters);

clearFilters.addEventListener("click", () => {
  storeFilter.value = "";
  brandFilter.value = "";
  daysFilter.value = "30";
  textSearch.value = "";
  applyFilters();
});

init();
