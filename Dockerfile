# Étape 1 : compilation de l'interface (Node n'est utilisé qu'ici).
FROM node:24-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Étape 2 : serveur Python (API + interface compilée).
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH=/app/.venv/bin:$PATH
# Dépendances d'abord, pour profiter du cache Docker.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev
COPY --from=web /web/dist ./web/dist
COPY channels.toml ./

ENV TVFEED_DATA=/data
VOLUME /data
EXPOSE 8080
CMD ["tvfeed", "serve", "--host", "0.0.0.0", "--port", "8080"]
