# worker/Dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install latest yt-dlp (force no cache to always get newest)
RUN pip install --no-cache-dir --upgrade yt-dlp

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY app.py .

# Print yt-dlp version for debugging
RUN yt-dlp --version

# Expose port
EXPOSE 10000

# Run with gunicorn
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000", "--timeout", "600", "--workers", "2"]
