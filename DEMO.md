# Low-Stock Auto Reorder Assistant Demo Script

## 1) Startup

1. Start PostgreSQL and ensure `DATABASE_URL` is configured in `server/.env`.
2. Run:
   - `npm install`
   - `npm run prisma:migrate --workspace server`
   - `npm run seed --workspace server`
   - `npm run dev --workspace server`
   - `npm run dev --workspace client`
3. Open `http://localhost:5173`.

## 2) Inventory Health (Day 1 + Day 2)

1. Open the `Inventory` tab.
2. Point out status badges:
   - green = ok
   - yellow = low
   - red = critical
3. Sort by `Days left` to show urgency ordering.
4. Show one SKU with `No velocity data`.

## 3) Recommendation Engine (Day 3)

1. Open the `Recommendations` tab.
2. Filter by supplier and category.
3. Explain confidence levels:
   - high, medium, low
4. Open a card and review recommendation reason text.

## 4) Export Workflows (Day 4)

1. In `Recommendations`, click `Export`.
2. Choose `Download CSV` and confirm file includes:
   - supplier_name, sku, product_name, reorder_qty, unit_cost, total_cost
3. Reopen `Export` and select `Preview email drafts`.
4. Show generated supplier-specific email drafts and copy one to clipboard.

## 5) Priority Dashboard (Day 5)

1. Open `Dashboard`.
2. Walk through summary cards:
   - Critical today
   - At risk this week
   - Pending reorders
   - Top 5 urgent SKUs
3. Use supplier/category/status filters and sort controls in flagged table.

## 6) Validation and Guardrails (Day 6)

1. In `Recommendations`, modify a reorder quantity inline.
2. Set a large value to trigger over-order warning (8+ weeks of demand).
3. Confirm intent and approve.
4. Expand the card's `Show audit trail` panel.
5. Approve/reject another recommendation and show updated audit entries.

## 7) Polish and Reliability (Day 7)

1. Reload page and show loading skeletons.
2. Demonstrate empty states by filtering to no results.
3. Demonstrate responsive layout at tablet width (~768px).
4. Mention seed realism:
   - 20 SKUs
   - 5 suppliers (2-14 day lead times)
   - 90 days sales history with seasonality
   - 3 critical, 5 low, 2 zero-velocity items.
