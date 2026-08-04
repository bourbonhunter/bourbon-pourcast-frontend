Sprint 7.6 Expected Drop UI Hotfix

Changes:
- Expected tracker rows with no known product now display "Expected Drop".
- Removed the technical watch-snapshot explanation from the public tracker interface.
- Kept Expected / Drop Date / Dropped terminology unchanged.
- Bumped bp-test-app.js cache version to 3.20.

Deployment:
Extract at the root of the frontend repository, preserving paths, commit, and allow Render to redeploy.

Verification:
1. Open Allocation Activity Tracker.
2. Select Next 7 days or All statuses.
3. Expected rows should show "Expected Drop" in Brand / Product.
4. The technical explanatory paragraph above the summary cards should be absent.
