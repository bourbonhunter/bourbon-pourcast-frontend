/****************************************************************
  BOURBON POURCAST COUNTY STATUS — STATEWIDE AIM FEED
  ---------------------------------------------------
  Every official NC ABC Board is loaded from
  public_aim_county_intelligence.json.

  Activity hierarchy:
  - Green / Yellow from AIM or an approved public Board override
  - Gray by default when no current signal exists
  - Blue remains an independent capability signal
****************************************************************/
let countySignals = [];

async function loadAimCountySignals() {
  try {
    const response = await fetch('public_aim_county_intelligence.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const boards = Array.isArray(payload?.boards) ? payload.boards : [];

    countySignals = [];
    for (const board of boards) {
      const boardName = String(board.board_name || '').trim();
      if (!boardName) continue;

      countySignals.push({
        board_id: board.board_id || '',
        board_name: boardName,
        county: String(board.county || '').trim(),
        status: String(board.activity_status || 'gray').toLowerCase(),
        headline: board.activity_label || 'No Current Signal',
        updated: board.updated || payload.generated_on || ''
      });

      if (board.inventory_capability) {
        countySignals.push({
          board_id: board.board_id || '',
          board_name: boardName,
          county: String(board.county || '').trim(),
          status: 'blue',
          headline: 'Retail Store-Level Inventory Available Online',
          updated: board.updated || payload.generated_on || ''
        });
      }
    }
  } catch (err) {
    console.warn('Statewide AIM Board feed unavailable.', err);
    countySignals = [
      { board_id:'wake', board_name:'Wake County ABC Board', county:'Wake', status:'gray', headline:'Status temporarily unavailable' },
      { board_id:'durham', board_name:'Durham County ABC Board', county:'Durham', status:'gray', headline:'Status temporarily unavailable' }
    ];
  }
}
