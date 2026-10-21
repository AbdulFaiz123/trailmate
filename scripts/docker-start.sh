#!/bin/sh
# Container start: bring the database up to date, add the sample trip in
# demo mode, then start Next.js on the port the host gives us.
set -e
: "${DATABASE_URL:=file:./demo.db}"
export DATABASE_URL

npx prisma migrate deploy
if [ "$DEMO_MODE" = "1" ]; then
  echo "Demo mode: loading the sample trip"
  npx tsx prisma/seed.ts
fi
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
