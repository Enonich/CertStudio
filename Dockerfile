# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app/template-mapper-app

COPY template-mapper-app/package.json template-mapper-app/package-lock.json ./
RUN npm ci

COPY template-mapper-app/ ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY app_server.py certificate_overlay.py extract_template_coords.py ./
COPY fields.json ./
COPY fields_store ./fields_store
COPY fonts ./fonts
COPY files ./files

COPY --from=frontend-builder /app/template-mapper-app/dist ./template-mapper-app/dist

RUN mkdir -p out

EXPOSE 7860

CMD ["sh", "-c", "uvicorn app_server:app --host 0.0.0.0 --port ${PORT:-7860}"]
