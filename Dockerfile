# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app/frontend

# Receive the public Supabase values whose names match .env / HF Spaces Repository Secrets exactly.
# SUPABASE_URL and SUPABASE_ANON_KEY are shared with the Vite frontend build.
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim

# Expose runtime config to the Python backend. Provide secrets at *runtime* (docker run),
# not at build time, to avoid baking them into image layers.
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV SUPABASE_URL=$SUPABASE_URL \
    SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    libpoppler-cpp-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/ ./backend/
COPY config/ ./config/
COPY assets/ ./assets/
COPY data/ ./data/

COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p out

EXPOSE 7860

CMD ["sh", "-c", "uvicorn backend.app_server:app --host 0.0.0.0 --port ${PORT:-7860}"]
