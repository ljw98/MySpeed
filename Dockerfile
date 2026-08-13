# MySpeed — multi-stage Docker build
# Frontend: Vite + TypeScript → dist/
# Backend: Go + embed static/ → single binary
# Runtime: scratch (zero base image)

# MySpeed — multi-stage Docker build
# Frontend: Vite + TypeScript → dist/
# Backend: Go + embed static/ → single binary (cross-compile ready)
# Runtime: scratch (zero base image)

# Stage 1: Build frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY frontend/ .
RUN pnpm build

# Stage 2: Build backend (Go)
# TARGETOS/TARGETARCH are auto-set by docker buildx when --platform is used
FROM golang:1.22-alpine AS backend
ARG TARGETOS
ARG TARGETARCH
WORKDIR /app
COPY backend-go/ .
COPY --from=frontend /app/dist/ ./static/
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -ldflags="-s -w" -o /myspeed .

# Stage 3: Runtime
FROM scratch
COPY --from=backend /myspeed /myspeed
EXPOSE 8090
ENTRYPOINT ["/myspeed"]