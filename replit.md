# 3 Batti Color & Number Game Platform

## Overview
A full-stack real-money gaming platform with color and number betting, multi-UPI payment system, real-time WebSocket updates, and a comprehensive admin panel.

## Tech Stack
- **Frontend:** React Native / Expo (mobile app)
- **Backend:** Node.js + Express (TypeScript via tsx)
- **Database:** PostgreSQL via Neon DB (Drizzle ORM)
- **Real-time:** WebSocket (ws library, path: /ws)
- **Auth:** Express sessions

## Architecture
```
client/         React Native / Expo mobile app
server/         Express backend
  index.ts      Server entry, CORS, body parsing
  routes.ts     All API endpoints + WebSocket server
  storage.ts    Database abstraction layer
  game-engine.ts  Game loop (4 daily scheduled rounds)
  db.ts         Drizzle DB connection
  templates/    Admin panel HTML
shared/
  schema.ts     Drizzle schema + Zod validators
```

## Key Features
- **Game:** 4 daily rounds (9am, 1pm, 5pm, 9pm IST). Color (x2) and number (x9) betting with 18% GST
- **Multi-UPI:** Automatic rotation of active UPI accounts per deposit request
- **Referral:** L1 (5%) and L2 (2.5%) commissions on bet amounts; signup bonus
- **Admin Panel:** `/admin` — Dashboard, Live Bets, Game Control, Profit Analysis, Deposits, Withdrawals, Users, UPI Mgmt, Settings, Admin Logs
- **Real-time:** WebSocket broadcasts game state every 2s and new bets instantly

## Database Tables
- `users` — balance, bonus_balance, is_banned, referral_code, bank details
- `upi_accounts` — multi-UPI with rotation, status, total_received
- `game_rounds` — historical results
- `bets` — user bets per round
- `transactions` — deposit/withdraw/win/commission tracking
- `game_state` — current phase, countdown, scheduled times
- `settings` — key-value config (min/max bet, multipliers, commissions)
- `admin_logs` — all admin actions tracked

## Environment Variables
- `NEON_DATABASE_URL` — Neon PostgreSQL connection string
- `DATABASE_URL` — Replit PostgreSQL (fallback)
- `ADMIN_PHONE` — Admin login phone (default: 9999999999)
- `ADMIN_PASSWORD` — Admin login password (default: admin123)
- `SESSION_SECRET` — Express session secret

## Development
- Server runs on port 5000
- Workflow: `npm run server:dev` (tsx server/index.ts)
- DB push: `npm run db:push`
