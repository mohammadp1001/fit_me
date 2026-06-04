# FitMe — Personal Workout Tracker

A bilingual (Persian / English) progressive web app for logging gym workouts, tracking body weight, and visualising exercise progress over time. Designed for personal use: single account, YAML-driven programs, no ads, no subscriptions.

**Live:** [fit-me.vercel.app](https://fit-me.vercel.app) &nbsp;|&nbsp; **Stack:** Next.js 16 · PostgreSQL (Neon) · Prisma · Tailwind · Recharts

---

## Features

| | |
|---|---|
| 📋 **YAML programs** | Upload a `.yaml` file once — the app parses it into a full workout plan with days, exercises, sets, reps, and supersets |
| 🌐 **Bilingual** | Full Persian (RTL) and English (LTR) UI; switch at any time from Profile |
| 📱 **PWA / offline** | Add to home screen on Android or iOS and use it like a native app |
| 🔐 **Single passphrase auth** | No email, no sign-up — one shared passphrase protects the whole app |
| 💪 **Per-set logging** | Log weight + actual reps for every set; planned reps pre-filled as placeholder |
| 📈 **Progress charts** | Body weight over time + best-set weight per exercise (Recharts line charts) |
| 🔁 **Multiple programs** | Upload as many YAML files as you like; switch between them from Profile without losing any logs |
| ⚡ **Superset support** | Exercises linked with `superset_with` are visually grouped with an amber accent |

---

## How the App Works

### 1 — First launch: onboarding

On first visit the app redirects to `/onboarding`. Enter:
- **Your name, weight (kg) and height (cm)**
- **Your workout YAML file** (see format below)

The app parses the YAML, creates your profile, and builds the full program in the database. You're then taken straight to the main app.

---

### 2 — Program tab (برنامه)

The main view. Day tabs run across the top, colour-coded:

| Day | Colour |
|-----|--------|
| 1 | 🟠 Orange-red |
| 2 | 🔵 Blue |
| 3 | 🟢 Green |
| 4 | 🟣 Purple |
| 5 | 🩵 Cyan |
| 6 | 🟡 Amber |
| 7 | 🩷 Pink |

Each exercise card shows the exercise name, planned sets × reps, and target muscles. **Superset pairs** are marked with an ⚡ amber banner and a matching left border so they're instantly recognisable.

Tap any exercise card to open the **Exercise Detail** view.

---

### 3 — Exercise Detail

Three tabs:

- **اطلاعات / Info** — description, tips, common mistakes, muscle diagram, Wikipedia link
- **ویدیو / Video** — embedded demonstration video
- **لاگ / Log** — today's logging panel

The **Log panel** shows one row per set. Each row has:
- A weight input (kg) — persists across the session
- A reps input — planned reps pre-filled as placeholder; overwrite with actual reps
- A ✓ button to mark the set done

Logs are saved instantly (no Save button needed). When you re-open an exercise on the same day, your previous entries are restored.

---

### 4 — Log tab (لاگ وزنه)

A date-based history view. Browse past workout sessions by date and see which sets were logged, with weight and reps recorded.

---

### 5 — Progress tab (پیشرفت)

Two charts:

- **وزن بدن / Body Weight** — enter today's weight and tap ثبت; a line chart plots your weight history over time
- **پیشرفت حرکات / Exercise Progress** — choose any exercise from the dropdown; the chart shows your best-set weight per session over time

---

### 6 — Profile tab (پروفایل)

- **Edit** name, weight, height
- **Program switcher** — dropdown listing every YAML you've uploaded; tap a different one to switch the active program (all tabs update instantly, old logs are preserved)
- **Upload new program** — add another YAML file to the list
- **Language** — toggle between فارسی and English
- **Logout**

---

## YAML Program Format

```yaml
program:
  name: "نام برنامه به فارسی"
  name_en: "Program Name in English"
  days:
    - name: "روز اول — سینه و جلو بازو"
      name_en: "Day 1 — Chest & Biceps"
      exercises:
        - name: "پرس سینه دستگاه"        # must match exercise library (Persian)
          muscles: ["سینه بزرگ", "سه سر بازو"]
          sets: 4
          reps: [12, 10, 8, 6]           # array = different reps per set

        - name: "پرس زیر سینه سیم‌کش"
          muscles: ["سینه پایینی"]
          sets: 3
          reps: 12                        # single number = same reps every set
          superset_with: "دیپ پارالل"   # links two exercises as a superset

        - name: "دیپ پارالل"
          muscles: ["سینه پایینی", "سه سر بازو"]
          sets: 3
          reps: 12
          superset_with: "پرس زیر سینه سیم‌کش"
```

**Rules:**
- `name` must be in Persian — it's matched against the exercise library
- If a name doesn't exist in the library, the app auto-creates it (you can fill in details later)
- `reps` can be an integer or an array; the array length doesn't have to equal `sets`
- `superset_with` is optional; pair both exercises with each other's name
- `name_en`, `muscles`, `superset_with` are all optional

Two ready-made programs are in `examples/`:
| File | Description |
|------|-------------|
| `examples/workout.yaml` | 3-day strength program (29 exercises) |
| `examples/corrective.yaml` | 3-day corrective / mobility program |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, server components) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL via [Neon](https://neon.tech) (free tier) |
| ORM | Prisma v6 |
| Auth | iron-session v8 (passphrase cookie) |
| i18n | next-intl v4 (`[locale]` routing, RTL support) |
| Charts | Recharts |
| YAML parsing | js-yaml + Zod validation |
| PWA | next-pwa v5 |
| Hosting | [Vercel](https://vercel.com) (free tier) |

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

Open [http://localhost:3000](http://localhost:3000) — it will redirect to `/fa/onboarding`.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Pooled connection string (Neon: enable "Pooled connection") |
| `DIRECT_URL` | Direct connection string (for Prisma schema operations) |
| `SESSION_SECRET` | Random string, **minimum 32 characters** |
| `PASSPHRASE` | The login passphrase for the app |

### Useful Scripts

```bash
npm run dev          # development server
npm run build        # production build
npm run db:push      # sync Prisma schema → database (no migration files)
npm run db:seed      # seed 29 exercises into the library
npm run db:studio    # open Prisma Studio (visual DB browser)
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
5. Deploy — tables are created and exercises seeded automatically on every deploy

> **Note:** Use the **pooled** Neon connection string for `DATABASE_URL` and the **direct** string for `DIRECT_URL`. The pooled URL goes through Neon's always-on proxy, which prevents connection errors when the compute is sleeping.

---

## Database Schema

```
User           — profile (name, weight, height)
Program        — uploaded YAML programs (one active at a time)
ProgramDay     — days within a program
ProgramExercise — exercises within a day (sets, reps, superset group)
Exercise       — library of exercises (bilingual, seeded + auto-created)
WorkoutLog     — per-session set logs (weight + reps, keyed by date)
BodyWeight     — daily body weight entries
```

---

## License

MIT
