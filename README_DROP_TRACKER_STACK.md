# Bourbon Pourcast Drop Tracker Stack v1

This build moves the new Drop Tracker to a cleaner architecture:

```text
drop_table.csv
      +
drop_history.csv
      +
optional drop_confirmations.csv
      ↓
build_drop_tracker.py
      ↓
drop_tracker.csv
      ↓
BourbonPourcast.com Drop Tracker
```

## Files in this package

- `index.html` — updated public homepage / app shell.
- `bp-test-app.js` — updated frontend logic. It reads `drop_tracker.csv` for Drop Tracker.
- `bp-test-styles.css` — current styles plus status-pill styling.
- `build_drop_tracker.py` — new private-repo builder that creates `drop_tracker.csv`.
- `drop_confirmations_template.csv` — optional manual confirmation template.

No `logo.png` or `ncabc_inventory_report.html` is included because those already exist in your frontend/data workflows and are not part of this new stack.

## New public data file

The frontend now expects this file beside `index.html`:

```text
drop_tracker.csv
```

Columns:

```text
ExpectedDate,AnnouncedDate,ConfirmedDate,Store,Brand,Board,Status,DaysSinceLast,Source
```

Status values:

- `expected` → yellow pill, store-level watch-list row
- `announced` → blue pill, Wake ABC delta/history row
- `confirmed` → green pill, manual/independent confirmation row

## How to wire into the private workflow

In `WakeABC Delta Report v1.11`, add this step after:

```yaml
- name: Run Delta (updates drop_history.csv)
```

Add:

```yaml
- name: Build Drop Tracker CSV
  run: python build_drop_tracker.py
```

In the private commit step, add:

```bash
git add drop_tracker.csv || true
```

In the public sync copy step, add:

```bash
# Drop Tracker CSV for the new public Drop Tracker page
if [ -f drop_tracker.csv ]; then
  echo "Copying drop_tracker.csv → public-repo/"
  cp drop_tracker.csv public-repo/
else
  echo "WARNING: drop_tracker.csv not found in private repo"
fi
```

In the public repo commit step, add:

```bash
git add drop_tracker.csv || true
```

## Optional confirmations

To track confirmed drops behind the scenes, create this file in the private repo:

```text
drop_confirmations.csv
```

Use the template included here. The public site will show confirmed rows if they are included in `drop_tracker.csv`; if you are not ready to show them, do not add confirmation rows yet, or adjust the builder later to exclude confirmed rows from public output.

## Expected-date logic

For announced rows:

- `AnnouncedDate` comes from `drop_history.csv`.
- `ExpectedDate` is the store's known drop weekday on or immediately before the announced date.
- This helps expose Wake reporting lag when inventory changes are published late.

For expected rows:

- The store's known drop day must occur in the next 7 days.
- The store must have no logged activity in at least 27 days.
- Brand is intentionally blank because this is a store-level watch-list signal, not a bottle prediction.
