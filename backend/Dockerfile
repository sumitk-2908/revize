# Render's native Python runtime cannot install the Tesseract binary. Its
# preinstalled toolchain includes imagemagick and ghostscript but no OCR
# engine, and Render's docs point to Docker as the only supported way to add
# OS packages — so the backend ships as an image purely to get `tesseract`
# onto the box. Without it, uploads still succeed; scans just aren't indexed.
#
# Render service settings to match this file:
#   Runtime         Docker
#   Root Directory  backend
#   Dockerfile Path backend/Dockerfile   (relative to the repo root)
#   Build Command   (leave empty — the image build replaces it)
#   Start Command   (leave empty — CMD below replaces it)
FROM python:3.12-slim

# tesseract-ocr-eng is named explicitly: --no-install-recommends keeps the
# image small but skips the language data, and every OCR call would then fail
# with "Failed loading language 'eng'" on a box that looks correctly set up.
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        tesseract-ocr \
        tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copied first so the dependency layer is cached across code-only deploys.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Fail the build rather than the first upload if OCR support is incomplete.
RUN tesseract --list-langs

# Render injects PORT; the default matches its convention for local runs.
ENV PORT=10000
ENV PYTHONUNBUFFERED=1
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
