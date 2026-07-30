let DB={boards:[]};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function qs(){return new URLSearchParams(location.search)}
function render(){
 const id=document.getElementById("board").value,b=DB.boards.find(x=>x.board_id===id); if(!b)return;
 const q=document.getElementById("q").value.toLowerCase();
 const stores=b.stores.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
 const ships=b.latest_shipments.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
 const acts=b.recent_activity.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
 const inv=b.inventory_capability?'<span class="status blue"> + BLUE inventory capability</span>':'';
 document.getElementById("view").innerHTML=`<div class="card"><h2>${esc(b.board_name)}</h2>
 <div><b>AIM Status:</b> <span class="status ${esc(b.activity_status)}">${esc(b.activity_label)}</span>${inv}</div>
 <div class="grid"><div class="sub"><b>Allocation mechanism</b><p>${esc(b.allocation_mechanism)}</p><span class="note">Policy status: ${esc(b.policy_status)}</span></div>
 <div class="sub"><b>Board Overview</b><p>${b.contact.website?`<a class="official-link" href="${esc(b.contact.website)}" target="_blank" rel="noopener">Website →</a>`:"Official website not currently available."}</p><span class="note">${esc(b.public_notes)}</span></div></div></div>
 <div class="grid"><div class="card"><h3>Official Retail Stores (${stores.length})</h3>${stores.length?`<table>${stores.map(s=>`<tr><td>${esc(s.address)}</td><td>${esc(s.city)}</td></tr>`).join("")}</table>`:'<p class="empty">No matching stores.</p>'}</div>
 <div class="card"><h3>Recent Allocation Activity</h3>${acts.length?`<table><tr><th>Date</th><th>Store</th><th>Product</th></tr>${acts.map(x=>`<tr><td>${esc(x.effective_date)}</td><td>${esc(x.store)}</td><td>${esc(x.product)}</td></tr>`).join("")}</table>`:'<p class="empty">No recent store-level allocation evidence in AIM.</p>'}</div></div>
 <div class="card"><h3>Latest NC ABC Shipment Intelligence</h3>${ships.length?`<table><tr><th>Shipment date</th><th>Product</th><th>Cases</th></tr>${ships.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.product)}</td><td>${esc(x.cases)}</td></tr>`).join("")}</table>`:'<p class="empty">No matched shipment intelligence currently available.</p>'}</div>`;
}
fetch("public_aim_county_intelligence.json",{cache:"no-store"}).then(r=>r.json()).then(x=>{
 DB=x; const sel=document.getElementById("board");
 DB.boards.sort((a,b)=>a.board_name.localeCompare(b.board_name)).forEach(b=>sel.add(new Option(`${b.board_name} — ${b.activity_label}`,b.board_id)));
 const requested=qs().get("board"); if(requested&&DB.boards.some(b=>b.board_id===requested))sel.value=requested;
 sel.onchange=render; document.getElementById("q").oninput=render; render();
});