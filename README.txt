Bourbon Pourcast – Drop Tracker Data Freshness UI Update

Deploy these three files to the ROOT of the frontend repo:
- index.html
- bp-test-app.js
- bp-test-styles.css

Behavior:
- Displays "AIM™ Data Current As Of" beside the Drop Tracker result count.
- Uses the actual HTTP Last-Modified timestamp of drop_tracker.csv.
- Formats the timestamp in America/New_York time.
- Updates automatically whenever the public Drop Tracker CSV is synchronized.
- Includes responsive desktop/mobile styling.
