# Chamba Backend (NestJS)

Backend scaffold ready for feature development.

## Stack

- NestJS + TypeScript
- TypeORM + PostgreSQL (PostGIS-ready)
- Redis (cache + session store)
- Socket.io gateway (`/realtime`)
- Cloudflare R2 (S3 compatible)
- Firebase FCM wiring (push notifications)

## Setup

```bash
cp .env.example .env
npm install
npm run start:dev
```

Base API URL: `http://localhost:3000/api`

## Environment variables

All credentials/config come from `.env` (no hardcoded secrets).

- PostgreSQL: `DATABASE_*`
- Redis: `REDIS_*`
- Sessions: `SESSION_*`
- Cloudflare R2: `R2_*`
- Firebase FCM: `FIREBASE_*`

See `.env.example` for full list.

## Project structure

- `src/config`: environment validation
- `src/infrastructure/database`: TypeORM connection module
- `src/infrastructure/redis`: Redis client + cache service
- `src/infrastructure/storage`: Cloudflare R2 service
- `src/modules/users`: example feature module
- `src/modules/realtime`: Socket.io gateway
- `src/modules/notifications`: push notifications (FCM)
- `src/modules/placeholders`: future API placeholders
- `src/modules/health`: health check endpoint
