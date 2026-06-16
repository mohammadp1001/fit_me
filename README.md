# FitMe

A personal workout tracker. Define your training program in a YAML file, log every set at the gym, and watch your progress over time. Bilingual (Persian / English), installable as a phone app.

**Live:** [fit-me.vercel.app](https://fit-me.vercel.app)

## What it does

- **Programs from YAML** — describe your days, exercises, sets, reps, and supersets in one file and upload it
- **Set logging** — record weight and reps for each set; history is kept per exercise
- **Progress charts** — body weight over time and best-set weight per exercise
- **Multiple programs** — keep several programs and switch between them without losing logs
- **Bilingual & RTL** — full Persian and English, switchable anytime
- **Installable** — add to your home screen and use it offline like a native app

## Running locally

Requires Node.js 20+ and a PostgreSQL database.

```bash
git clone https://github.com/mohammadp1001/fit_me.git
cd fit_me
npm install

cp .env.example .env.local   # then fill in the values below

npm run db:push              # create tables
npm run db:seed              # seed the exercise library
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (pooled) |
| `DIRECT_URL` | Direct connection string (for schema changes) |
| `SESSION_SECRET` | Random string, at least 32 characters |
| `PASSPHRASE` | The login passphrase |

Built with Next.js, PostgreSQL, and Prisma. Deployed on Vercel + Neon.
