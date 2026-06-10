Bourbon Pourcast Test Site v3
=============================

Open:
  bp-test-index.html

Place these CSV files in the same folder:

Required for Allocation History:
  drop_history.csv

Required for NC Shipment Radar, use any one of these names:
  nc_shipment_radar.csv
  ncabc_inventory_report.csv
  stock_shipped.csv

The site is intentionally standalone so it can sit beside your current frontend without overwriting the live homepage.

Included sections:
  - Home dashboard
  - Allocation History
  - NC Shipment Radar
  - Alerts placeholder

Allocation History supports:
  - Last 30 days default
  - Store filter
  - Brand/Product filter
  - Store + Brand combined filter
  - 60/90/365/all date windows

Shipment Radar supports:
  - Recently shipped product hero table
  - Boards receiving badges
  - Product filter
  - Board filter
  - Date windows
  - Detailed shipment report
  - Download filtered CSV

Expected flexible CSV columns:

Allocation History can read columns similar to:
  date, drop_date, effective_date, store, store_name, brand, product, product_name, board, county

Shipment Radar can read columns similar to:
  date, ship_date, shipment_date, product, brand, product_name, item, description, board, county, abc_board, qty, quantity, cases, bottles, code, item_code
