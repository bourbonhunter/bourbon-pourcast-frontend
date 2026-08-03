Sprint 7.6 Build 1 — Recent Allocation Product Modal Link Fix

Cause:
Recent Allocation Activity emits product names from allocation history. OLD FORESTER SINGLE BARREL (BTE) was not present in the Product Master alias feed, so product_details.js could not resolve it. The unresolved anchor retained href="#", which jumped within AIM Details rather than opening the modal.

Backend delta:
- Adds OLD FORESTER SINGLE BARREL (BTE) as an exact alias for old_forester_single_barrel.
- Includes regenerated public_aim_products.json for immediate verification.

Frontend delta:
- Includes the regenerated public_aim_products.json.
- Makes unresolved product names non-clickable instead of leaving a misleading href="#" link.

Deploy backend and frontend deltas preserving paths.
Run Actions > Validate Product Master, then Actions > Build Public AIM Products.
Expected validator counts: 55 Product Master records, 72 aliases, 54 tracked, 0 needs review.
Then confirm OLD FORESTER SINGLE BARREL (BTE) opens the Old Forester Single Barrel modal from AIM Details.
