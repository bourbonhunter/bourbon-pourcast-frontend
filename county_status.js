/****************************************************************
  BOURBON POURCAST COUNTY STATUS — PUBLIC PRESENTATION CONFIG
  ---------------------------------------------------------------
  Wake and Durham are now hydrated from AIM-generated
  public_county_status.json. Other counties remain manually curated here
  until their acquisition/source policy is approved for automated publication.

  Blue is a capability signal and may appear alongside Green/Yellow/Gray.
****************************************************************/
let countySignals = [
  { county:"Wayne", status:"gray", headline:"No current allocation signal" },
  { county:"Johnston", status:"gray", headline:"No current allocation signal" },
  { county:"Orange", status:"gray", headline:"No current allocation signal" },
  { county:"Mecklenburg", status:"gray", headline:"No current allocation signal" },
  { county:"Guilford", status:"gray", headline:"No current allocation signal" },
  { county:"Forsyth", status:"gray", headline:"No current allocation signal" },
  { county:"New Hanover", status:"gray", headline:"No current allocation signal" },
  { county:"Moore", status:"gray", headline:"No current allocation signal" },
  { county:"Chatham", status:"gray", headline:"No current allocation signal" },
  { county:"Lee", status:"gray", headline:"No current allocation signal" },
  { county:"Gastonia", status:"yellow", headline:"Allocation activity expected soon", updated:"2026-06-30" }
];

async function loadAimCountySignals() {
  try {
    const response = await fetch('public_county_status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const boards = Array.isArray(payload?.boards) ? payload.boards : [];

    for (const board of boards) {
      const county = String(board.county || '').trim();
      if (!county) continue;

      // Replace any manual entries for automated Boards.
      countySignals = countySignals.filter(item => item.county !== county);

      // Activity state: exactly one of Green / Yellow / Gray.
      countySignals.push({
        county,
        board_id: board.board_id || '',
        status: String(board.activity_status || 'gray').toLowerCase(),
        headline: board.activity_label || 'No Current Signal',
        updated: board.updated || payload.generated_on || ''
      });

      // Blue capability is independent of the activity state.
      if (board.inventory_capability) {
        countySignals.push({
          county,
          status: 'blue',
          headline: 'Retail Store-Level Inventory Available Online',
          updated: board.updated || payload.generated_on || ''
        });
      }
    }
  } catch (err) {
    console.warn('AIM County Status feed unavailable; retaining manual fallback signals.', err);
    // Conservative fallbacks if the generated feed is temporarily unavailable.
    countySignals.push(
      { county:'Wake', status:'blue', headline:'Retail Store-Level Inventory Available Online' },
      { county:'Durham', board_id:'durham', status:'yellow', headline:'Allocation Activity Expected Soon' }
    );
  }
}
