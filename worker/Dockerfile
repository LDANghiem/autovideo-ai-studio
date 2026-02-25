# worker/Dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install LATEST yt-dlp from GitHub (nightly) - force no cache
RUN pip install --no-cache-dir --force-reinstall "yt-dlp @ https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz" \
    && yt-dlp --version

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY app.py .

# Expose port
EXPOSE 10000

# Run with gunicorn
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000", "--timeout", "600", "--workers", "2"]
