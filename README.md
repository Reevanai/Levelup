# LevelUp

**Money moves. You level up.**

A gamified money app for India's teens and young adults: a wallet, a virtual card, savings vaults, an XP-and-missions rewards engine, a rules-based money coach, and a separate parent dashboard.

> **This is a prototype. All money is simulated.** LevelUp is not a bank. It does not issue cards, hold deposits, process UPI payments or perform KYC. Balances are demo credits, the card number is non-issuable, and identity verification is a walkthrough that collects nothing.

## Run it

Requires Node 22.13 or newer (the database uses Node's built-in SQLite).

```bash
npm install
npm run dev        # API on :8787, web app on http://localhost:5173
```

Production-style, single process:

```bash
npm run build
npm start          # serves the built app and API on http://localhost:8787
```

The database is created and seeded on first start at `data/levelup.db`.

| Command | What it does |
|---|---|
| `npm test` | End-to-end API tests against an in-memory database |
| `npm run typecheck` | TypeScript check for client and server |
| `npm run db:reset` | Wipe the database and rebuild the demo data |

### Demo accounts

| Role | Email | Password | PIN |
|---|---|---|---|
| Teen (Aarav) | `aarav@levelup.demo` | `demo1234` | `1234` |
| Parent (Priya) | `priya@levelup.demo` | `demo1234` | n/a |

The landing and sign-in pages have one-tap buttons for both. The teen account comes with six months of history, four vaults, a 6-day streak one check-in away from a bonus, and requests waiting on the parent. New accounts start empty.

## What's in it

**Teen app** (Home, Wallet, Cards, Rewards, Profile)

- **Home**: balance, month spent and received, 7-day spending chart, recent activity, missions, vault progress, XP and level, financial health score.
- **Wallet**: add, send, request and pay flows; searchable, filterable history; category breakdown; receipts you can share or print.
- **Card**: a fanned card stack with six designs (one unlocked through rewards), freeze, PIN-gated reveal that hides itself after 30 seconds, online / in-store / international toggles, per-payment, daily and monthly limits, and a test checkout to see the controls work.
- **Rewards**: XP and levels, daily check-in streaks, weekly and monthly missions, savings challenges, badges, a league table, and a coin store.
- **Vaults**: goals with a target, date, progress ring, a weekly plan to hit the date, and deposit history.
- **Money coach**: spending insights, things worth cutting, a suggested savings target, monthly report cards, a question box, and financial-literacy quizzes.
- Onboarding, demo identity verification, notifications, settings and security (password, PIN, hide balances, signed-in devices).

**Parent dashboard**

- Child's balance, spending chart, categories, savings progress and recent activity.
- Scheduled allowance and one-off top-ups.
- Controls: lock the card, set limits, block categories, require approval above an amount.
- Approval queue for money requests, large purchases and limit increases.

## How it's built

```
shared/      constants used by both sides (categories, card designs, level curve)
server/
  db.ts          SQLite schema and transaction helper
  providers.ts   seams for regulated services, backed by mocks
  services.ts    simulation ledger, card rules, approvals, allowances, vaults
  game.ts        XP, streaks, missions, badges, league, reward store
  insights.ts    health score, insights, reports, coach answers, quizzes
  http.ts        sessions, CSRF guard, role guards, PIN verification
  routes/        auth + account, teen, parent
  seed.ts        demo family
  tests/         API tests
src/         React app (pages, UI kit, charts, sheets, contexts)
```

- **Frontend**: React, TypeScript, Vite, React Router, TanStack Query. Hand-written CSS design system (flat black, lowercase labels, pill counters, fanned card stack, round outlined actions) and SVG charts, no UI framework.
- **Backend**: Express, Zod validation, SQLite. All amounts are integer paise.
- **Auth**: scrypt-hashed passwords; random session tokens stored hashed, sent as an `HttpOnly`, `SameSite=Lax` cookie; a custom-header check on every write; login rate limiting.
- **Roles**: `teen` and `parent`. Guards are enforced in the API, and every parent route checks the child is linked to that parent.
- **Payments PIN**: 4 digits, scrypt-hashed, needed to send, pay and reveal card details. Five wrong tries locks payments for five minutes.

### Going live later

Nothing in the routes or UI touches money directly. Every regulated action goes through an interface in `server/providers.ts`:

| Interface | Prototype | Would be replaced by |
|---|---|---|
| `FundingProvider` | credits the demo ledger | a payment aggregator / bank collection |
| `TransferProvider` | debits the demo ledger | a licensed PPI or banking partner's payout rails |
| `CardProvider` | makes up a non-issuable number | a licensed card issuer and processor |
| `KycProvider` | always returns "demo verified" | a regulated KYC provider |

`postTxn` in `server/services.ts` is the only code that changes a balance, so it is the one place to swap a local ledger for a partner's.

## Things to know

- The money coach is rules-based, not a language model. Its answers come from fixed rules over the user's own ledger, and the app says so.
- The league table's other players are scripted.
- Notification preferences are saved but only in-app alerts exist; no email or push is sent.
- "Biometric unlock" is a saved preference only.
- Rate limiting is in memory, so it resets on restart and would not work across multiple servers.
- Before any real deployment this would need, at minimum: a production database, HTTPS, proper secrets handling, an audit trail, and legal and compliance review. Features for under-18s also need a verified-consent flow for parents, which the family-code link here does not provide.
