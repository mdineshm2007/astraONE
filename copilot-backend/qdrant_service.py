import uuid
from typing import List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import config

# Initialize Qdrant Client
# Works with both local Docker instance and Qdrant Cloud (if api_key is provided)
qdrant_client = QdrantClient(
    url=config.QDRANT_URL,
    api_key=config.QDRANT_API_KEY if config.QDRANT_API_KEY else None
)

def ensure_collection(collection_name: str, vector_size: int):
    """Checks if the Qdrant collection exists; creates it if not."""
    try:
        collections = qdrant_client.get_collections().collections
        exists = any(c.name == collection_name for c in collections)
        
        if not exists:
            print(f"📦 Creating Qdrant collection: '{collection_name}' (dim={vector_size})...")
            qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=vector_size, 
                    distance=Distance.COSINE
                )
            )
            print(f"✅ Collection '{collection_name}' created successfully.")
        else:
            print(f"📦 Collection '{collection_name}' already exists.")
    except Exception as e:
        print(f"❌ Error verifying/creating Qdrant collection: {e}")
        raise e

def upsert_chunks(collection_name: str, chunks: List[Dict[str, Any]], vectors: List[List[float]]):
    """
    Upserts document chunks and their vector embeddings into the specified collection.
    
    chunks: list of dicts with {"text": str, "metadata": dict}
    vectors: list of float lists (embeddings) matching chunk indices
    """
    if len(chunks) != len(vectors):
        raise ValueError("The number of text chunks must match the number of embeddings.")
        
    # Get vector size from first embedding to ensure collection exists
    if vectors:
        ensure_collection(collection_name, len(vectors[0]))
        
    points = []
    for idx, (chunk, vector) in enumerate(zip(chunks, vectors)):
        # Generate a stable UUID based on text chunk to prevent duplicate indexing
        point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk["text"][:100] + str(idx)))
        
        points.append(PointStruct(
            id=point_id,
            vector=vector,
            payload={
                "text": chunk["text"],
                "metadata": chunk.get("metadata", {})
            }
        ))
        
    try:
        print(f"📤 Uploading {len(points)} points to collection '{collection_name}'...")
        qdrant_client.upsert(
            collection_name=collection_name,
            points=points
        )
        print("✅ Upsert complete.")
    except Exception as e:
        print(f"❌ Upsert failed: {e}")
        raise e

def search_similar(collection_name: str, query_vector: List[float], limit: int = 5) -> List[Dict[str, Any]]:
    """
    Performs vector similarity search against Qdrant collection.
    Returns payload of the top matching documents.
    """
    try:
        results = qdrant_client.search(
            collection_name=collection_name,
            query_vector=query_vector,
            limit=limit
        )
        
        documents = []
        for hit in results:
            documents.append({
                "score": hit.score,
                "text": hit.payload.get("text", ""),
                "metadata": hit.payload.get("metadata", {})
            })
        return documents
    except Exception as e:
        print(f"❌ Semantic search failed: {e}")
        return []
