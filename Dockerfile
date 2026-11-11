# ==============================================================================
# MS2 (jira-sprints-nestjs) Multi-Stage Dockerfile
# Stage 1: Build TypeScript NestJS Application
# Stage 2: Minimal, Non-Root Node.js Production Runtime
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /workspace

# Copy contracts and service code
COPY jira-contracts /workspace/jira-contracts
COPY jira-sprints-nestjs /workspace/jira-sprints-nestjs

# Build contracts first so TypeScript definitions and stubs exist
WORKDIR /workspace/jira-contracts
RUN npm ci && npm run build

# Install dependencies and compile NestJS
WORKDIR /workspace/jira-sprints-nestjs
RUN npm ci
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=50052 \
    GRPC_PORT=50052 \
    DB_HOST=postgres-sprints \
    DB_PORT=5432 \
    DB_USER=postgres \
    DB_PASSWORD=postgres \
    DB_NAME=sprints_db \
    KAFKA_BROKERS=kafka:9092 \
    MS1_GRPC_URL=jira-issues-go:50051 \
    MIGRATIONS_DIR=/app/db/migrations \
    PROTO_PATH=/app/protos/sprints.proto

# Install ca-certificates and tzdata
RUN apk add --no-cache ca-certificates tzdata

# Copy package descriptors and contracts for npm production install
COPY --from=builder /workspace/jira-sprints-nestjs/package*.json /app/
COPY --from=builder /workspace/jira-contracts /jira-contracts

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled JavaScript output
COPY --from=builder /workspace/jira-sprints-nestjs/dist /app/dist
COPY --from=builder /workspace/jira-sprints-nestjs/db/migrations /app/db/migrations

# Copy Proto files to /app/protos so gRPC proto-loader can load them at runtime
COPY --from=builder /workspace/jira-contracts/protos /app/protos

# Set file ownership to built-in non-root node user
RUN chown -R node:node /app /jira-contracts

# Switch to non-root user
USER node

EXPOSE 50052

ENTRYPOINT ["node", "dist/main.js"]
