const drops = window.BP_TEST_DATA.drops;
const shipments = window.BP_TEST_DATA.shipments;
const durhamDrops = window.BP_TEST_DATA.durhamDrops;

const search = document.getElementById("globalSearch");
const clearBtn = document.getElementById("clearSearch");
const cityFilter = document.getElementById("cityFilter");
const brandFilter = document.getElementById("brandFilter");
const storeFilter = document.getElementById("storeFilter");
const results = document.getElementById("results");
const resultCount = document.getElementById("resultCount");

function unique(values) {
  return [...new Set(values)].sort((a,b) => a.localeCompare(b));
}

function fillSelect(select, values) {
  values.forEach(value => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  });
}

fillSelect(cityFilter, unique(drops.map(d => d.city)));
fillSelect(brandFilter, unique(drops.map(d => d.brand)));
fillSelect(storeFilter, unique(drops.map(d => d.store)));

function matches(drop) {
  const q = search.value.trim().toLowerCase();
  const blob = `${drop.date} ${drop.brand} ${drop.store} ${drop.city} ${drop.qty}`.toLowerCase();

  return (!q || blob.includes(q))
    && (!cityFilter.value || drop.city === cityFilter.value)
    && (!brandFilter.value || drop.brand === brandFilter.value)
    && (!storeFilter.value || drop.store === storeFilter.value);
}

function renderResults() {
  const filtered = drops.filter(matches);
  resultCount.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
  results.innerHTML = filtered.length ? "" : `<div class="result-card"><h3>No matching drops</h3><p class="muted">Try a broader store, city, or brand search.</p></div>`;

  filtered.forEach(drop => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `
      <h3>${drop.brand}</h3>
      <div class="meta">
        <span>${drop.date}</span>
        <span>${drop.qty} bottles</span>
        <span>${drop.city}</span>
      </div>
      <p class="muted" style="margin:10px 0 0">${drop.store}</p>
    `;
    results.appendChild(card);
  });
}

function renderBrandSummary() {
  const byBrand = new Map();
  drops.forEach(drop => {
    if (!byBrand.has(drop.brand) || drop.date > byBrand.get(drop.brand).date) {
      byBrand.set(drop.brand, drop);
    }
  });

  document.getElementById("brandSummary").innerHTML = [...byBrand.entries()]
    .sort((a,b) => b[1].date.localeCompare(a[1].date))
    .slice(0, 7)
    .map(([brand, drop]) => `
      <div class="summary-item">
        <strong>${brand}</strong>
        <span>${drop.date} · ${drop.city} · ${drop.qty} bottles</span>
      </div>
    `).join("");
}

function renderSimpleList(id, rows) {
  document.getElementById(id).innerHTML = rows.map(row => `
    <div class="summary-item">
      <strong>${row.board || row.title}</strong>
      <span>${row.note || row.detail}</span>
    </div>
  `).join("");
}

["input", "change"].forEach(evt => {
  search.addEventListener(evt, renderResults);
  cityFilter.addEventListener(evt, renderResults);
  brandFilter.addEventListener(evt, renderResults);
  storeFilter.addEventListener(evt, renderResults);
});

clearBtn.addEventListener("click", () => {
  search.value = "";
  cityFilter.value = "";
  brandFilter.value = "";
  storeFilter.value = "";
  renderResults();
});

document.getElementById("alertForm").addEventListener("submit", (event) => {
  event.preventDefault();
  document.getElementById("formMessage").textContent = "Signup preview captured locally. Backend not connected yet.";
});

renderResults();
renderBrandSummary();
renderSimpleList("shipmentRadar", shipments);
renderSimpleList("durhamDrops", durhamDrops);
