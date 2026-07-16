/****************************************************************
  BOURBON POURCAST COUNTY STATUS EDITOR
  ---------------------------------------------------------------
  This is the ONLY file/section you normally need to edit.

  To update a county, change ONE WORD in the status field:

    blue   = Store-Level Inventory Available
    green  = Allocation Activity Underway
    yellow = Allocation Activity Expected Soon
    gray   = No Current Allocation Signal

    When changing a county:

1. Change the status.
2. Change the headline.
3. Update the date.

Example:

{
  county:"Durham",
  status:"green",
  headline:"Allocation Activity Underway",
  updated:"2026-06-30"
}

  The page automatically updates:
    - Latest County Board Signals / Hot Now panel
    - Scrolling county ticker
    - Status cards

  Hot Now rule:
    - Shows only green and yellow counties.
    - Blue and gray counties stay in the main board but do not appear in Hot Now.

  Optional fields:
    headline = short wording shown for that county
    updated  = YYYY-MM-DD date used to sort Hot Now items newest first
****************************************************************/
const countySignals = [
  { county:"Wake", status:"blue", headline:"Retail Store-Level Inventory Available Online", updated:"2026-06-30" },
  { county:"Wake", status:"yellow", headline:"Allocation activity expected soon", updated:"2026-07-01" },
  { county:"Durham", status:"blue", headline:"Retail Store-Level Inventory Available Online", updated:"2026-07-16" },
  { county:"Durham", status:"yellow", headline:"Drop500 Program Ongoing", updated:"2026-06-30" },
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
