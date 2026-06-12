from typing import List, Dict
from openai import OpenAI
import config

# Initialize client dynamically
# Supports standard OpenAI, Groq API (https://api.groq.com/openai/v1), and local Ollama (http://localhost:11434/v1)
client = OpenAI(
    api_key=config.OPENAI_API_KEY,
    base_url=config.OPENAI_BASE_URL if config.OPENAI_BASE_URL else None
)

def get_embedding(text: str) -> List[float]:
    """Generates vector embeddings for a given text segment."""
    try:
        # Normalize newline characters
        cleaned_text = text.replace("\n", " ")
        response = client.embeddings.create(
            input=[cleaned_text],
            model=config.EMBEDDING_MODEL
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"❌ Error generating embedding: {e}")
        raise e

def generate_chat_response(messages: List[Dict[str, str]]) -> str:
    """Generates standard chat response for LLM agent."""
    try:
        response = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=messages,
            temperature=0.4, # Lower temperature for analytical and engineering accuracy
            max_tokens=1500
        )
        return response.choices[0].message.content or "No response generated."
    except Exception as e:
        print(f"❌ Error generating LLM response: {e}")
        raise e
