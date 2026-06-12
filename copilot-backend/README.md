# 🏎️ ASTRA AI Engineering Copilot Backend

This directory contains the complete backend codebase to run a highly capable **Retrieval-Augmented Generation (RAG)** assistant for Team ASTRA. 

Instead of embedding reports directly in static client prompts—which bloats size, hits rate limits, and burns API tokens—this backend handles reports by splitting them, generating vector embeddings, indexing them in the **Qdrant Vector Database**, and fetching only the most relevant paragraphs dynamically during chat.

---

## 🛠️ Tech Stack & Architecture

- **Web Server**: FastAPI (Python)
- **Vector Database**: Qdrant (Local Docker or Qdrant Cloud Cluster)
- **AI Integrations**: OpenAI API (standard), Groq Cloud API, or local Ollama (Llama 3.1 / 3.3 models)
- **Document Processing**: LangChain text splitters & PyPDF reader

---

## 📁 Project Structure

```
copilot-backend/
├── requirements.txt      # Python dependencies
├── .env.example          # Environment template
├── config.py             # Config loader
├── qdrant_service.py     # Qdrant client connection & vector searches
├── openai_service.py     # OpenAI/Groq API client integrations
├── ingest_pipeline.py    # Document parsing & chunking engine
├── main.py               # FastAPI server and routing endpoints
└── README.md             # This guide
```

---

## ⚡ Setup Instructions

### 1. Prerequisites
Ensure you have **Python 3.10+** and **pip** installed.

### 2. Install Dependencies
Run these commands to set up a virtual environment and install dependencies:
```bash
# Navigate to the backend directory
cd copilot-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows)
venv\Scripts\activate

# Activate virtual environment (Mac/Linux)
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 3. Setup Qdrant Database
You need a running Qdrant instance. Choose **Option A (Local)** or **Option B (Cloud)**:

* **Option A: Run Locally (Requires Docker)**
  If you have Docker installed, run:
  ```bash
  docker run -d -p 6333:6333 -p 6334:6334 -v qdrant_storage:/qdrant/storage qdrant/qdrant
  ```
  Your local DB will be ready at `http://localhost:6333`.

* **Option B: Free Qdrant Cloud (Recommended)**
  1. Go to [Qdrant Cloud Console](https://cloud.qdrant.io/) and sign up.
  2. Create a free-tier cluster.
  3. Copy your **Cluster URL** (e.g. `https://xxxxxxx.aws.qdrant.io:6333`) and generate an **API Key**.

### 4. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```
Open `.env` in an editor:
* Add your `OPENAI_API_KEY` (or your Groq/Ollama API Key).
* If using **Groq**, uncomment `OPENAI_BASE_URL=https://api.groq.com/openai/v1` and set `LLM_MODEL=llama-3.3-70b-specdec`.
* Set `QDRANT_URL` to your cluster URL and paste your `QDRANT_API_KEY`.

### 5. Launch the Server
```bash
python main.py
```
The FastAPI server will start on `http://localhost:8000`. You can access interactive documentation at `http://localhost:8000/docs`.

---

## 📤 How to Ingest PDF Reports

To upload and index a PDF report (e.g. a previous year's Design Report, Cost Report, or Rulebook), send a POST request to `/api/ingest`:

```bash
# Using cURL to upload 'design_report_2026.pdf'
curl -X POST -F "file=@path/to/design_report_2026.pdf" http://localhost:8000/api/ingest
```

This parses the PDF, splits it into semantic chunks, generates vectors, and uploads them to the `astra_reports` collection.

---

## 💬 How to Chat with the Copilot

Send your message history to `/api/chat`. The server will dynamically perform semantic searches on Qdrant, retrieve the most relevant paragraphs from the reports, inject them into the system prompt, and respond.

### Example Chat Request:
```bash
curl -X POST -H "Content-Type: application/json" -d '{
  "messages": [
    {
      "role": "user",
      "content": "Compare our 2026 vehicle brakes design and stopping distance with our 2025 calculations."
    }
  ]
}' http://localhost:8000/api/chat
```

### Response Format:
```json
{
  "message": "Based on the 2026 Design Report, the stopping distance is 3.6m using an X-split system. In comparison, the 2025 report...",
  "sources_used": [
    "26002_TEAMASTRA_DESIGNREPORT.pdf",
    "25007_Team Astra_ProjectReport.pdf"
  ]
}
```
