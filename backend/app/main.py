import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# --- SlowAPI Imports ---
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# Import the optimized documents router
from app.routers import ai_content, documents, users
from app.config import settings
import sentry_sdk
from app.db import supabase

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=1.0,
    )

# Force Python to read your .env file locally (Render will use its own environment variables)
load_dotenv()

if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_KEY"):
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY are required environment variables")

def get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host or "unknown"

limiter = Limiter(key_func=get_real_ip)

app = FastAPI(
    title="Academic Portal API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration: Allow frontend to communicate with backend
origins=settings.CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    # PUT is here for the AI-content draft endpoint; every other write is POST or PATCH.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Mount the routers
app.include_router(documents.router, prefix="/api/v1/documents", tags=["Documents"])
# Shares the documents prefix but stays a separate module to keep documents.py
# from growing further. Included *after* it so FastAPI still resolves the
# existing /bulk-status and /{document_id}/status routes first.
app.include_router(ai_content.router, prefix="/api/v1/documents", tags=["AI Content"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])

@app.get("/ping", tags=["Health"])
@app.get("/api/v1/ping", tags=["Health"])
@limiter.limit("120/minute")
async def ping(request: Request):
    """Ultra-fast keep-alive and pre-warm probe without database roundtrip."""
    return {"status": "awake", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
@limiter.limit("20/minute")
async def health_check(request: Request):
    try:
        supabase.table("subjects").select("id", count="exact").limit(1).execute()
        db_status = "ok"
    except Exception as e:
        db_status = "error"
        import traceback
        traceback.print_exc()

    return {
        "status": "healthy" if db_status == "ok" else "unhealthy", 
        "version": "1.0.0", 
        "database": db_status
    }