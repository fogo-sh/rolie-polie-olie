FROM oven/bun:1 AS base
WORKDIR /app

# Install backend dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Install UI dependencies
COPY ui/package.json ui/bun.lock* ./ui/
RUN cd ui && bun install --frozen-lockfile

# Copy source. The UI build type-checks against ../src/api.ts (for the Hono
# RPC AppType), so the backend source must be present before building the UI.
COPY src ./src
COPY tsconfig.json ./
COPY ui ./ui

# Build UI
RUN cd ui && bun run build

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
