# worker/Dockerfile
# Use this if Render's native Python runtime doesn't have ffmpeg

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp binary
RUN pip install --no-cache-dir yt-dlp

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY app.py .

# Expose port
EXPOSE 10000

# Run with gunicorn (600s timeout for long video processing)
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000", "--timeout", "600", "--workers", "2"]
