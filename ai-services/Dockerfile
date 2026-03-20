FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Train models at build time
RUN python -c "from premium_service.model.train import main; main()" 2>/dev/null || true
RUN python -c "from fraud_service.model.train import main; main()" 2>/dev/null || true

ENV PYTHONUNBUFFERED=1

EXPOSE 8001 8002

CMD ["uvicorn", "premium_service.main:app", "--host", "0.0.0.0", "--port", "8001"]
