Bourbon Pourcast Allocation History Test v2

WHAT CHANGED
- Allocation History now loads from drop_history.csv.
- Store dropdown is generated from StoreAddress values in the CSV.
- Brand dropdown is generated from Brand values in the CSV.
- Default results are restricted to the latest 30 days in the CSV.
- Users can combine Store + Brand filters.
- Optional text search is still available.
- Full history is not exposed by default.

FILES
- bp-test-index.html
- bp-test.css
- bp-test.js

REQUIRED
Put your real drop_history.csv in the same folder as these files.

TESTING LOCATION
Place these files in bourbon-pourcast-frontend without overwriting index.html.

Then visit:
https://your-site.com/bp-test-index.html

LOCAL TESTING NOTE
Because browsers often block fetch() from local files, test with a simple server:

python -m http.server 8000

Then open:
http://localhost:8000/bp-test-index.html
