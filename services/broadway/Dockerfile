FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev && uv run playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*
COPY app ./app
RUN useradd --create-home --uid 10001 runner && chown -R runner:runner /app && mv /root/.cache/ms-playwright /opt/playwright && chmod -R a+rX /opt/playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright PYTHONUNBUFFERED=1 PORT=8080
USER runner
EXPOSE 8080
CMD ["/app/.venv/bin/uvicorn", "app.api:application", "--factory", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
