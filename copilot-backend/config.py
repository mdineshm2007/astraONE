import os
from dotenv import load_dotenv

# Load environmental variables from .env file
load_dotenv()

PORT = int(os.getenv("PORT", 8000))

# LLM Config
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", None)
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

# Vector DB Config
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")

# Validation warning
if not OPENAI_API_KEY:
    print("⚠️  [Copilot] Warning: OPENAI_API_KEY is not set. LLM requests will fail unless using a free local server.")
