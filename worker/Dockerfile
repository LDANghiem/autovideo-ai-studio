FROM python:3.11-slim

# Install system dependencies including Node.js for yt-dlp JS challenge
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install LATEST yt-dlp from GitHub (nightly) + EJS plugin for JS challenge
RUN pip install --no-cache-dir --force-reinstall \
    "yt-dlp @ https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz" \
    yt-dlp-ejs==0.5.0 \
    && yt-dlp --version \
    && node --version

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY app.py .

# Expose port
EXPOSE 10000

# Run with gunicorn — 1 worker to stay within 512MB memory limit
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000", "--timeout", "600", "--workers", "1"]
        
