# Trailmate container: used for the free public demo on Render, and works for
# any host that runs Docker. Data lives inside the container: with DEMO_MODE=1
# the sample trip is recreated on every start.
FROM node:22-slim

# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# The database URL is only needed at runtime; the build just needs a value.
RUN DATABASE_URL="file:./build.db" npx prisma generate \
  && DATABASE_URL="file:./build.db" npm run build \
  && rm -f prisma/build.db

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "scripts/docker-start.sh"]
