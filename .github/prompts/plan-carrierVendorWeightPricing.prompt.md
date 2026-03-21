## Plan: Implement Weight‑Tiered Vendor Pricing (Carrier → Vendor → Weight)

**Goal:** Ensure that label pricing uses per-user/vendor weight-based tiers (`UserVendorAccess.rateTiers`) instead of always using `vendor.rate`, and provide UI for admins to configure these tiers.

---

## ✅ Key Changes Required

### 1) Backend: Enforce per-user/vendor access + tiered pricing

- **Update label generation (`server/routes/labels.js`)** to:
  - Load `UserVendorAccess` for `req.user._id` and selected vendor.
  - Enforce `isAllowed === true` (return 403 if not allowed).
  - Determine effective rate for a label:
    - If `rateTiers` exist: use `getRateForWeight(weight)`.
    - If no matching tier or no tiers: fall back to `vendor.rate`.
  - Deduct balance based on that computed rate (per label or per row in bulk).

- **Update bulk label generation** to compute per-row cost based on row weight.
  - Optionally reject rows that don't match a tier (depending on policy).
  - Deduct the sum of actual applied rates for successful rows.

- **Add API endpoint for current user access** (e.g. `GET /api/access/me`) so the frontend can fetch user-specific allowed vendors + tiers.

---

### 2) Frontend: Show correct tiered prices & allow admin configuration

#### A) Label generation UI (`LabelGenerator.tsx`, `BulkLabelGenerator.tsx`)
- Fetch the current user’s access list (`/api/access/me`).
- When vendor is selected + weight entered:
  - Compute effective rate client-side using the same tier lookup logic.
  - Display computed cost (per label) and total cost for bulk.
- For bulk mode, show errors for rows where the vendor isn't allowed or where weight doesn’t match any tier (depending on desired enforcement behavior).

#### B) Admin UI: Configure per-user/vendor rate tiers
- Extend `UserManagement.tsx` (or add a new page) to:
  - Display vendor list for a given user.
  - Allow toggling `isAllowed` per vendor.
  - Manage `rateTiers`: add/edit/remove weight tiers (minLbs, maxLbs, rate).
  - Save changes via `PUT /api/access/:userId/:vendorId` (or bulk save endpoint).

---

## ✅ Verification Steps (Manual)

1. Create a `UserVendorAccess` record with specific tiers.
2. Generate a single label with weight inside a tier; verify balance deduction matches tier rate.
3. Generate a single label with weight outside tiers; verify fallback to `vendor.rate` (or failure if policy chosen).
4. Generate bulk labels with mixed weights; verify per-row pricing and correct balance deduction.
5. As admin, update a user’s access/tiers, then confirm label generation uses updated rates.

---

## Notes

- `UserVendorAccess.getRateForWeight(weight)` already exists in the model; the main task is wiring it into label generation and exposing it in the UI.
- The current UI shows `vendor.rate` only, so the update needs both frontend and backend modifications.
