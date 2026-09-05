# ------------------------------------------------------------------------------
# Stage 1: Build & Compile TypeScript
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies based on package-lock.json
COPY package*.json ./
RUN npm ci

# Copy source code and migrations
COPY tsconfig.json ./
COPY src ./src
COPY drizzle ./drizzle

# Build TypeScript to dist/
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Copy drizzle migration SQL and meta files
COPY --from=builder /app/drizzle ./drizzle

# Use non-root node user for security
USER node

EXPOSE 3000

CMD ["node", "dist/index.js"]
