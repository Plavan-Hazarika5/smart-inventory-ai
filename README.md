# Low-Stock Auto Reorder Assistant

A full-stack internal operations tool for inventory health monitoring, reorder planning, supplier draft generation, and guardrail-based approvals.

## Live Demo

- Frontend: [smart-inventory-ai-plavan.netlify.app](https://smart-inventory-ai-plavan.netlify.app/)
- API: `<add-your-render-api-url>`

## Tech Stack

- Frontend: React + Vite + Tailwind CSS + React Query
- Backend: Node.js + Express + Zod
- Database: PostgreSQL + Prisma
- Monorepo: npm workspaces (`client`, `server`)

## Features Implemented

- Inventory status classification (`ok`, `low`, `critical`)
- Sales velocity and days-of-stock-left analytics
- Reorder recommendation engine with confidence levels
- Supplier grouped CSV + email draft exports
- Priority dashboard with KPI cards and flagged SKU table
- Guardrails:
  - Over-order protection (8-week demand cap warning)
  - Inline manual quantity overrides
  - Approval/rejection audit trail
- Day 7 polish:
  - 20 SKUs, 5 suppliers, 90-day seasonal sales seed
  - Loading skeletons, empty states, toast-style feedback
  - Responsive tablet + desktop layout

## Project Structure

```text
Smart Inventory Ai/
  client/
  server/
  DEMO.md
```

## Run Locally

1. Configure database URL in `server/.env`
2. Install dependencies:
   - `npm install`
3. Run migrations:
   - `npm run prisma:migrate --workspace server`
4. Seed data:
   - `npm run seed --workspace server`
5. Start backend:
   - `npm run dev --workspace server`
6. Start frontend:
   - `npm run dev --workspace client`

App: [http://localhost:5173](http://localhost:5173)

## Portfolio-ready Summary

Built a 7-day, feature-complete inventory operations system with forecasting and approval guardrails. The platform reduces stockout risk, prevents over-ordering, and creates auditable supplier workflows from a single dashboard.

## Demo

See `DEMO.md` for the full stakeholder walkthrough script.
