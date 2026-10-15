# ResultRipple API. One Uvicorn worker: the workspace mutation lock is
# in-process, so a second worker would need real coordination first.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY data ./data

# Generated state lives on a named volume mounted here. Creating the directory
# owned by the service user means a fresh volume starts with that ownership.
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin rr \
    && mkdir -p /data/runtime/artifacts \
    && chown -R rr:rr /data/runtime
USER rr

ENV ARTIFACT_ROOT=/data/runtime/artifacts
EXPOSE 8000

# Liveness only; readiness, which needs FalkorDB, is /ready.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
