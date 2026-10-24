FROM python:3.12-alpine
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY deploy/qr-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
 && addgroup -S qr && adduser -S -G qr qr
COPY deploy/qr-service/app.py ./app.py
USER qr
EXPOSE 8000
CMD ["python", "/app/app.py"]
