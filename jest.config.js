const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  // DB-touching suites (prisma/, app/api/cron/) share a singleton `User` row
  // (id=1) against a real Postgres instance and race on create/cleanup if
  // run concurrently across worker processes - force serial execution.
  maxWorkers: 1,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  // `.claude/worktrees/` holds full checkouts of the repo made by agent
  // worktrees. Without this, their (possibly stale) copies of every suite get
  // collected alongside the real ones and fail against the current schema.
  testPathIgnorePatterns: ['/node_modules/', '/.claude/', '/.next/'],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'app/api/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/*.test.{ts,tsx}',
  ],
}

module.exports = createJestConfig(config)
