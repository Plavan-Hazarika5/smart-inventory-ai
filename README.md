# Smart Inventory AI

A full-stack internal operations tool for inventory health monitoring, reorder planning, supplier draft generation, and guardrail-based approvals.

## Live Demo

- Frontend: [smart-inventory-ai-plavan.netlify.app](https://smart-inventory-ai-plavan.netlify.app/)
- API: [smart-inventory-ai-l5z2.onrender.com](https://smart-inventory-ai-l5z2.onrender.com)

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

## Deployment

### Frontend (Netlify)

- Base directory: `client`
- Build command: `npm run build`
- Publish directory: `dist`
- Env var:
  - `VITE_API_BASE_URL=https://smart-inventory-ai-l5z2.onrender.com`

### Backend (Render)

- Root directory: `server`
- Build command: `npm install && npx prisma migrate deploy && npm run prisma:generate && npm run build`
- Start command: `npm start`
- Env vars:
  - `DATABASE_URL=<your-postgres-url>`
  - `PORT=10000`
  - `CORS_ORIGINS=https://smart-inventory-ai-plavan.netlify.app`

### Database

- PostgreSQL (Neon/Supabase/Render Postgres compatible)
- Seed command (one-time): `npm run seed --workspace server`

## Resume-ready Impact

- Built a full-stack inventory decisioning system that converts stock and sales telemetry into reorder recommendations with confidence scoring.
- Implemented over-order guardrails, inline override approvals, and persistent audit logging to improve operational control and traceability.
- Delivered supplier-ready outputs (CSV and email drafts) and a KPI dashboard that accelerates procurement workflows end-to-end.

## Portfolio-ready Summary

Built a 7-day, feature-complete inventory operations system with forecasting and approval guardrails. The platform reduces stockout risk, prevents over-ordering, and creates auditable supplier workflows from a single dashboard.

## Demo

See `DEMO.md` for the full stakeholder walkthrough script.
