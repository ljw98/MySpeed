# MySpeed — multi-stage Docker build
# Frontend: Vite + TypeScript → dist/
# Backend: Go + embed static/ → single binary
# Runtime: scratch (zero base image)

# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

# Stage 2: Build backend (Go)
FROM golang:1.22-alpine AS backend
WORKDIR /app
COPY backend-go/ .
COPY --from=frontend /app/dist/ ./static/
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /myspeed .

# Stage 3: Runtime
FROM scratch
COPY --from=backend /myspeed /myspeed
EXPOSE 8090
ENTRYPOINT ["/myspeed"]