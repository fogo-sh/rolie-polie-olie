FROM oven/bun:1 AS base
WORKDIR /app

# Install backend dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Build UI
COPY ui/package.json ui/bun.lockb* ./ui/
RUN cd ui && bun install --frozen-lockfile
COPY ui ./ui
RUN cd ui && bun run build

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
