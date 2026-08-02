SPRINT 7.6 BUILD 1 — AIM PRODUCT INTELLIGENCE FRONTEND

New visible feature
- Searchable Brands Tracked by AIM page: brands_tracked.html
- Deep-linkable Product Details modal shared by the Brands page and AIM Details dashboard.
- Product links in Recent Allocation Activity and Latest NC ABC Shipment Intelligence.
- Direct URL example: aim_dashboard.html?product=heaven_hill_grain_to_glass_bourbon

Deploy
Extract this delta at the root of the PUBLIC bourbon-pourcast-frontend repo, preserving paths.
Commit and push. Render/static hosting should deploy from the frontend repo as usual.

Test
1. Open brands_tracked.html.
2. Search for Heaven Hill Grain to Glass.
3. Click the product name and confirm the modal shows:
   - Tracked by AIM
   - NC ABC Price
   - Proof
   - Bottle Size
   - Classification
   - Supplier
4. Copy the URL while the modal is open; open it in a new tab and confirm the modal opens.
5. Close the modal and confirm the product query parameter is removed.
6. Open aim_dashboard.html, select Wake, and click a matched product in Recent Activity
   or Shipment Intelligence.
7. Check mobile layout.

Notes
- Bottle images are intentionally deferred.
- Public feed contains only sanitized product fields; review notes, match scores,
  provenance internals, and inference logic are not exposed.
