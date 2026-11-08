import os

for key in ("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "CORS_ORIGINS"):
    os.environ.setdefault(key, "test")
