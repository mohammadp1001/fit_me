# FitMe — Personal Workout Tracker

A bilingual (Persian / English) progressive web app for logging gym workouts, tracking body weight, and visualising exercise progress over time. Designed for personal use: single account, YAML-driven programs, no ads, no subscriptions.

**Live:** [fit-me.vercel.app](https://fit-me.vercel.app) &nbsp;|&nbsp; **Stack:** Next.js 16 · PostgreSQL (Neon) · Prisma · Tailwind · Recharts

---

## Features

| | |
|---|---|
| 📋 **YAML programs** | Upload a `.yaml` file once — the app parses it into a full workout plan with days, exercises, sets, reps, and supersets |
| 🌐 **Bilingual** | Full Persian (RTL) and English (LTR) UI; switch at any time from the Profile tab |
| 📱 **PWA / offline** | Add to home screen on Android or iOS and use it like a native app |
| 🔐 **Single passphrase auth** | No email, no sign-up — one shared passphrase protects the whole app |
| 💪 **Per-set logging** | Log weight + actual reps for every set; planned reps pre-filled as placeholder |
| 📈 **Progress charts** | Body weight over time + best-set weight per exercise (line charts) |
| 🔁 **Multiple programs** | Upload as many YAML files as you like; switch between them from the Profile tab without losing any logs |
| ⚡ **Superset support** | Paired exercises are visually grouped with an amber accent bar |

---

## How the App Works

### 1 — Onboarding

On first visit the app redirects to the onboarding screen. Enter your name, weight, height, and upload your workout YAML file. The app parses the file, creates your profile, and builds the full program in the database.

---

### 2 — Program Tab

The main view. Day tabs run across the top, each with its own colour. Each exercise card shows the name, planned sets and reps, and target muscles. Superset pairs are marked with an amber banner so they stand out from the day colour.

Tap any exercise card to open the Exercise Detail view.

---

### 3 — Exercise Detail

Three tabs:

- **Info** — description, tips, common mistakes, Wikipedia link
- **Video** — embedded demonstration video
- **Log** — today's logging panel

The Log panel shows one row per set with a weight input and a reps input (planned reps pre-filled as placeholder). Logs are saved instantly. Re-opening the same exercise on the same day restores your previous entries.

---

### 4 — Log Tab

A date-based history view. Browse past workout sessions by date and review which exercises were logged with weight and reps recorded.

---

### 5 — Progress Tab

Two charts:

- **Body Weight** — log today's weight with one tap; a line chart plots your history over time
- **Exercise Progress** — choose any exercise from the dropdown to see your best-set weight per session over time

---

### 6 — Profile Tab

- Edit name, weight, and height
- **Program switcher** — dropdown listing every YAML uploaded; selecting a different one switches the active program across all tabs instantly, with old logs preserved
- Upload a new YAML program
- Toggle language between Persian and English
- Logout

---


## Local Development

### Prerequisites

- Node.js 20+
- A PostgreSQL database (local or [Neon](https://neon.tech) free tier)

### Setup

```bash
# 1. Clone
git clone https://github.com/mohammadp1001/fit_me.git
cd fit_me

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env.local
# Fill in DATABASE_URL, DIRECT_URL, SESSION_SECRET, PASSPHRASE

# 4. Push schema and seed exercise library
npm run db:push
npm run db:seed

# 5. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it will redirect to the onboarding screen.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Pooled connection string (Neon: enable "Pooled connection") |
| `DIRECT_URL` | Direct connection string (for Prisma schema operations) |
| `SESSION_SECRET` | Random string, **minimum 32 characters** |
| `PASSPHRASE` | The login passphrase for the app |

### Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run db:push      # sync Prisma schema to the database
npm run db:seed      # seed the exercise library
npm run db:studio    # open Prisma Studio (visual database browser)
```

---

## Deployment (Vercel + Neon)

1. Fork / push to GitHub
2. Create a new project on [Vercel](https://vercel.com) and import the repo
3. Add environment variables in **Settings → Environment Variables**
4. Set the **Build Command** to:
   ```
   npx prisma db push && npx prisma db seed && next build
   ```
5. Deploy — tables are created and the exercise library is seeded automatically

> **Note:** Use the **pooled** Neon connection string for `DATABASE_URL` and the **direct** string for `DIRECT_URL`. The pooled URL goes through Neon's always-on proxy, preventing connection errors when the compute is sleeping.

---

## Database Schema

```
User             — profile (name, weight, height)
Program          — uploaded YAML programs (one active at a time)
ProgramDay       — days within a program
ProgramExercise  — exercises within a day (sets, reps, superset group)
Exercise         — bilingual exercise library (seeded + auto-created)
WorkoutLog       — per-session set logs (weight + reps, keyed by date)
BodyWeight       — daily body weight entries
```

---

## License

MIT
