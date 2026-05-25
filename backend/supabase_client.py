import os
from typing import List
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_ANON_KEY", "")

class MissingSupabaseClient:
    def __init__(self, missing: List[str]):
        self.missing = missing

    def _raise(self):
        missing_vars = ", ".join(self.missing)
        raise RuntimeError(
            f"Missing Supabase configuration: {missing_vars}. "
            "Set these environment variables in backend/.env before using database features."
        )

    def table(self, *args, **kwargs):
        self._raise()

    def rpc(self, *args, **kwargs):
        self._raise()


missing_env = []
if not url:
    missing_env.append("SUPABASE_URL")
if not key:
    missing_env.append("SUPABASE_ANON_KEY")

if missing_env:
    print(f"Missing Supabase configuration: {', '.join(missing_env)}")
    supabase = MissingSupabaseClient(missing_env)
else:
    supabase: Client = create_client(url, key)
