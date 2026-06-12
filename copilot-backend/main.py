import os
import shutil
import tempfile
from typing import List, Dict
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config
import openai_service
import qdrant_service
import ingest_pipeline

app = FastAPI(
    title="ASTRA AI Engineering Copilot Backend",
    description="Vector Search & LLM Orchestration API for Team ASTRA Solar Electric Vehicle Team",
    version="1.0.0"
)

# Enable CORS for React/Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your actual frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# SYSTEM PROMPT DEFINITION
# ==========================================
ASTRA_SYSTEM_PROMPT_TEMPLATE = """You are ASTRA AI, the official Engineering, Research, Innovation, and Strategy Assistant for Team ASTRA, a Solar Electric Vehicle (SEV) team participating in SEVC competitions.

Primary Mission:
Your purpose is not only to answer questions but to act as a virtual senior engineer, technical reviewer, innovation consultant, research analyst, and knowledge manager for Team ASTRA.

You have access to:
- Previous SEVC reports
- Cost reports
- Innovation reports
- Vehicle telemetry data
- CAD and design documents
- Rulebooks
- Technical documentation
- Research papers
- Team records
- Manufacturing data

Core Responsibilities:
1. Vehicle Design Analysis: Identify weaknesses, suggest improvements, explain trade-offs.
2. Historical Knowledge Expert: Compare previous years, detect design evolution, recommend proven solutions.
3. Research and Technology Discovery: Investigate solar vehicle tech, batteries, lightweight materials.
4. Innovation Generation: Propose practical innovations (safety, telemetry, AI charging).
5. Design Review Agent: Review CAD, reports, PCB layouts, electrical systems.
6. Rulebook Compliance Checker: Verify dimensions, safety regulations, electrical compliance.
7. Telemetry & Predictive Analysis: Analyze CAN, thermal limits, voltage, current.
8. Cost Optimization Advisor: Suggest cost reductions in BOM, ROI analysis.
9. Technical Report Generator: Draft SEVC presentation content and design write-ups.
10. Decision-Making Framework: Explain reasoning, compare alternatives, estimate advantages/disadvantages.

Response Style:
Act as a Senior Vehicle Engineer, Research Scientist, Systems Architect, and Innovation Consultant. Always provide engineering justifications, data-driven reasoning, and practical, detailed recommendations. Do not provide generic answers. 

Prioritize ASTRA knowledge first. Use the provided search results below to base your answers. If the search results do not contain the answer, use general engineering principles and clearly state that it is a general recommendation.

RELEVANT SEARCH RESULTS FROM ASTRA DATABASE:
{context}
"""

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]]
    collection: str = "astra_reports"

# ==========================================
# API ENDPOINTS
# ==========================================

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "database": config.QDRANT_URL,
        "model": config.LLM_MODEL,
        "embedding": config.EMBEDDING_MODEL
    }

@app.post("/api/ingest")
async def ingest_document(file: UploadFile = File(...), collection: str = "astra_reports"):
    """Uploads a PDF report, runs the chunking pipeline, and indexes it into Qdrant."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for ingestion.")
        
    try:
        # Save file to a temporary location safely
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
            
        # Run ingestion
        chunk_count = ingest_pipeline.ingest_pdf(tmp_path, collection_name=collection)
        
        # Clean up temporary file
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            
        return {
            "success": True,
            "filename": file.filename,
            "chunks_indexed": chunk_count,
            "message": f"Successfully indexed '{file.filename}' into collection '{collection}'."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

@app.post("/api/chat")
async def chat_copilot(request: ChatRequest):
    """
    Accepts conversation messages, queries Qdrant for semantic context based on the
    latest user message, inserts the context into the system prompt, and calls the LLM.
    """
    messages = request.messages
    if not messages:
        raise HTTPException(status_code=400, detail="Message history cannot be empty.")
        
    # Get the latest user message
    user_query = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            user_query = msg.get("content", "")
            break
            
    if not user_query:
        raise HTTPException(status_code=400, detail="Could not identify the user's latest query.")
        
    # 1. Semantic Search
    context_str = ""
    try:
        # Generate embedding vector for the user query
        query_vector = openai_service.get_embedding(user_query)
        
        # Search Qdrant for top 5 matches
        search_hits = qdrant_service.search_similar(
            collection_name=request.collection,
            query_vector=query_vector,
            limit=5
        )
        
        # Format the hits into a single readable string
        context_items = []
        for i, hit in enumerate(search_hits):
            source_info = hit["metadata"].get("source", "Unknown Doc")
            context_items.append(f"--- Search Hit {i+1} [Source: {source_info}] ---\n{hit['text']}")
        context_str = "\n\n".join(context_items)
        
    except Exception as e:
        print(f"⚠️ Vector search bypass/failure: {e}. Answering without database context.")
        context_str = "No database search results available for this query."

    # 2. Inject context into System Prompt
    system_prompt = ASTRA_SYSTEM_PROMPT_TEMPLATE.format(context=context_str)
    
    # 3. Rebuild message list with the system prompt at the top
    # Remove any existing system prompts from client to enforce ASTRA guidelines
    clean_messages = [msg for msg in messages if msg.get("role") != "system"]
    final_messages = [{"role": "system", "content": system_prompt}] + clean_messages
    
    # 4. Generate response
    response_text = openai_service.generate_chat_response(final_messages)
    
    return {
        "message": response_text,
        "sources_used": [hit["metadata"].get("source", "Unknown") for hit in search_hits] if 'search_hits' in locals() else []
    }

if __name__ == "__main__":
    import uvicorn
    # Start FastAPI server
    print(f"🚀 Starting ASTRA Copilot Backend on port {config.PORT}...")
    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
