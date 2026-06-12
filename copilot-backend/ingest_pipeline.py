from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import openai_service
import qdrant_service

def ingest_pdf(file_path: str, collection_name: str = "astra_reports") -> int:
    """
    Parses a PDF file, splits it into semantic chunks, generates vector embeddings,
    and uploads the chunks to the Qdrant Vector Database.
    
    Returns: Number of chunks uploaded.
    """
    print(f"📖 Reading PDF from: {file_path}")
    reader = PdfReader(file_path)
    text = ""
    for idx, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
            
    if not text.strip():
        raise ValueError("The uploaded PDF is empty or text extraction failed.")
        
    # Split text into overlapping segments to preserve details across boundaries
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,      # Semantic character chunk size
        chunk_overlap=150,   # Keep overlapping lines to prevent loss of context
        length_function=len
    )
    chunks_text = text_splitter.split_text(text)
    
    file_name = file_path.replace("\\", "/").split("/")[-1]
    
    chunks = []
    for chunk in chunks_text:
        chunks.append({
            "text": chunk,
            "metadata": {
                "source": file_name
            }
        })
        
    # Generate embeddings sequentially
    print(f"🧠 Generating embeddings for {len(chunks)} chunks using model: '{openai_service.config.EMBEDDING_MODEL}'...")
    vectors = []
    for idx, chunk in enumerate(chunks):
        if idx > 0 and idx % 20 == 0:
            print(f"  Processed {idx}/{len(chunks)} chunks...")
        vector = openai_service.get_embedding(chunk["text"])
        vectors.append(vector)
        
    # Upsert into Qdrant Vector DB
    qdrant_service.upsert_chunks(collection_name, chunks, vectors)
    print(f"🚀 Ingestion pipeline complete. Indexed {len(chunks)} chunks from '{file_name}'.")
    return len(chunks)
