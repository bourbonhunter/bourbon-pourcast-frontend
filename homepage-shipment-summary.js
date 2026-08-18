(() => {
  "use strict";

  const SUMMARY_URL = "public_shipment_summary.json";

  const esc = (value) => String(value ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[c]));

  const fmtDate = (ymd) => {
    if (!ymd) return "";
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  };

  const fmtRange = (start, end) => {
    if (!start && !end) return "Latest official NC ABC shipment report";
    if (start === end) return fmtDate(start);
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  };

  function render(summary) {
    const since = document.getElementById("homeShipmentSince");
    const stats = document.getElementById("homeShipmentStats");
    const preview = document.getElementById("homeShipmentPreview");
    if (!since || !stats || !preview) return;

    since.textContent = `Official NC ABC Shipments: ${fmtRange(summary.shipment_start, summary.shipment_end)}`;
    stats.textContent =
      `${Number(summary.board_count || 0).toLocaleString()} ABC Boards • ` +
      `${Number(summary.product_count || 0).toLocaleString()} tracked products • ` +
      `${Number(summary.total_cases || 0).toLocaleString()} cases shipped`;

    const top = Array.isArray(summary.top_products) ? summary.top_products : [];
    preview.innerHTML = top.length
      ? top.map((r, i) => `
          <div class="compact-item ranked-item">
            <div>
              <strong>${i + 1}. ${esc(r.product || "Unknown Product")}</strong>
              <small>${Number(r.boards_receiving || 0).toLocaleString()} board${Number(r.boards_receiving || 0) === 1 ? "" : "s"} receiving</small>
            </div>
            <span>${Number(r.cases || 0).toLocaleString()} cases</span>
          </div>`).join("")
      : `<div class="empty">Latest NC ABC shipment summary is not available yet.</div>`;
  }

  async function load() {
    try {
      const response = await fetch(`${SUMMARY_URL}?v=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      render(await response.json());
    } catch (err) {
      console.warn("Homepage shipment summary unavailable:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }

  // Reapply after the legacy homepage renderer completes so this public summary
  // remains the canonical source for the card.
  window.addEventListener("load", () => {
    window.setTimeout(load, 300);
    window.setTimeout(load, 1200);
  }, { once: true });
})();
