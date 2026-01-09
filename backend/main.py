import os
import json
import requests
import shutil
import uvicorn
import sys
from typing import List, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_community.document_loaders import TextLoader, PDFPlumberLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_pinecone import PineconeVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from pinecone import Pinecone

if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

load_dotenv()

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- INITIALIZATION ---
pc_api_key = os.getenv("PINECONE_API_KEY")
index_name = os.getenv("PINECONE_INDEX_NAME")

embeddings = OpenAIEmbeddings(model="text-embedding-3-large", dimensions=1024)
vectorstore = None
retriever = None

try:
    if pc_api_key and index_name:
        pc = Pinecone(api_key=pc_api_key)
        index = pc.Index(index_name)
        vectorstore = PineconeVectorStore(index=index, embedding=embeddings, text_key="text")
        retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
        print(f"Vector store connected to {index_name}")
except Exception as e:
    print(f"INIT ERROR: {str(e)}")

llm = ChatOpenAI(model="gpt-4o")

class ChatRequest(BaseModel):
    message: str
    userId: str
    chatId: str
    history: List[dict]

@app.post("/chat")
async def chat(request: ChatRequest):
    print(f"DEBUG: Processing message: {request.message[:50]}...")
    # Initialize standalone question with original message as daily default
    standalone_question = request.message
    
    try:
        # Load the most recent prompt (checks local file -> Supabase -> Default)
        sys_prompt = load_system_prompt()
        print(f"DEBUG: Using system prompt ({len(sys_prompt)} chars)")
        
        # --- 1. PREPARE HISTORY ---
        chat_history_str = ""
        if request.history and len(request.history) > 0:
            # Increase history to 8 messages for better deep-thread memory
            chat_history_str = "\n".join([f"{msg.get('role', 'user')}: {msg.get('content', '')}" for msg in request.history[-8:]])
        
        # --- 2. CONTEXTUALIZE QUESTION (History Awareness for Retrieval) ---
        is_greeting = len(request.message.split()) < 4
        
        if chat_history_str and not is_greeting:
            print("DEBUG: Rephrasing question with history for retrieval...")
            rephrase_prompt = ChatPromptTemplate.from_template(
                "Given the following conversation and a follow-up question, rephrase the follow-up question into a standalone question for retrieval.\n\nChat History:\n{chat_history}\n\nFollow Up Input: {question}\n\nStandalone Question:"
            )
            rephrase_chain = rephrase_prompt | llm | StrOutputParser()
            try:
                standalone_question = rephrase_chain.invoke({"chat_history": chat_history_str, "question": request.message})
                print(f"DEBUG: Rephrased Query: '{standalone_question}'")
            except Exception as e:
                print(f"DEBUG: Rephrasing failed: {e}")

        # --- 3. RETRIEVAL (Similarity Search) ---
        # Switching from MMR to Similarity for more "direct" hits as requested
        context_docs = []
        if vectorstore:
            try:
                print(f"DEBUG: Fetching from Pinecone using Similarity Search (k=10)...")
                retriever = vectorstore.as_retriever(
                    search_type="similarity", 
                    search_kwargs={"k": 10}
                )
                context_docs = retriever.invoke(standalone_question)
                print(f"DEBUG: Found {len(context_docs)} docs")
            except Exception as e:
                print(f"DEBUG: Retrieval error: {str(e)}")
        
        # --- 4. GENERATION (History + Context + Question) ---
        if not context_docs:
            print("DEBUG: Using General Knowledge Fallback")
            template = f"""{sys_prompt}
            
            Chat History (Recent):
            {{chat_history}}
            
            CRITICAL INSTRUCTIONS:
            - Scan the Chat History carefully. If the user previously mentioned names, companies, or details, USE THEM.
            - If no context/history exists for the question, use your general knowledge.
            - If the user provides a greeting, respond warmly.
            
            Question: {{question}}
            Answer:"""
            
            prompt = ChatPromptTemplate.from_template(template)
            chain = prompt | llm | StrOutputParser()
            response = chain.invoke({"chat_history": chat_history_str, "question": request.message})
        else:
            print("DEBUG: Using RAG Chain (Production Mode)")
            template = f"""{sys_prompt}
            
            Chat History (Recent):
            {{chat_history}}
            
            Core Instructions:
            - You are a professional AI Advisor.
            - PRIORITY 1: Use the provided Context documents below. They contain the specific data the user expects you to use.
            - PRIORITY 2: Use the Chat History for conversation continuity (names, previous facts).
            - If the answer is in the Context, provide it directly and accurately.
            - Cite your sources if possible.
            
            Context:
            {{context}}

            Question: {{question}}
            
            Answer:"""
            
            prompt = ChatPromptTemplate.from_template(template)
            context_text = "\n\n".join([f"[Source: {d.metadata.get('filename', 'doc')}]: {d.page_content}" for d in context_docs])
            
            chain = (
                {"context": lambda x: context_text, "chat_history": lambda x: chat_history_str, "question": RunnablePassthrough()}
                | prompt
                | llm
                | StrOutputParser()
            )
            
            response = chain.invoke(standalone_question)
        
        print("DEBUG: Chat response generated successfully")
        return {"response": response}

    except Exception as e:
        print(f"Error in chat processing: {str(e)}")
        # Fallback to direct LLM if RAG chain fails
        try:
            response = llm.invoke(request.message).content
            return {"response": response}
        except Exception as llm_err:
             print(f"CRITICAL: LLM fallback failed: {llm_err}")
             return {"response": "I encountered an error processing your request. Please try again in a moment.", "error": str(e)}

class TitleRequest(BaseModel):
    message: str
    chatId: str

@app.post("/generate_title")
async def generate_title(request: TitleRequest):
    try:
        # Simple prompt for title generation
        prompt = ChatPromptTemplate.from_template(
            "Generate a concise, 3-5 word title for a chat that starts with this message: {message}"
        )
        
        chain = prompt | llm | StrOutputParser()
        
        title = chain.invoke({"message": request.message})
        
        # Remove quotes if present
        title = title.strip().strip('"').strip("'")
        
        return {"title": title}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    status = "online"
    if vectorstore is None:
        status = "degraded (vectorstore disconnected)"
    return {
        "status": status, 
        "message": "RAG Backend is running", 
        "pinecone_index": index_name,
        "embedding_dimensions": 1024
    }

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    print(f"DEBUG: START Upload: {file.filename}")
    try:
        if vectorstore is None:
            raise Exception("Pinecone Vector Store is not connected. Please check your backend .env and restart.")

        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        print(f"DEBUG: File saved to {temp_path}")

        # Run heavy processing in a separate thread to avoid blocking the event loop
        import asyncio
        from functools import partial

        def process_and_index():
            print("DEBUG: Loading document...")
            if file.filename.endswith(".pdf"):
                loader = PDFPlumberLoader(temp_path)
            else:
                loader = TextLoader(temp_path)
            
            docs = loader.load()
            print(f"DEBUG: Loaded {len(docs)} pages/docs")

            print("DEBUG: Splitting document...")
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            splits = text_splitter.split_documents(docs)
            print(f"DEBUG: Created {len(splits)} text chunks")

            # Explicitly add filename to metadata for each split
            for split in splits:
                split.metadata["filename"] = file.filename

            if len(splits) == 0:
                print(" DEBUG: No text extracted. File might be a scanned image.")
                return 0

            print(f"DEBUG: Indexing {len(splits)} chunks into Pinecone ({index_name})...")
            
            # Batch uploads to Pinecone for performance
            batch_size = 100
            for i in range(0, len(splits), batch_size):
                batch = splits[i:i + batch_size]
                vectorstore.add_documents(batch)
                print(f"DEBUG: Indexed batch {i//batch_size + 1}/{(len(splits)-1)//batch_size + 1}")
            
            print(" DEBUG: Indexing COMPLETE")
            return len(splits)

        loop = asyncio.get_running_loop()
        chunk_count = await loop.run_in_executor(None, process_and_index)

        if os.path.exists(temp_path):
            os.remove(temp_path)

        if chunk_count == 0:
             raise HTTPException(status_code=400, detail="The file provided contains no extractable text.")
        
        # Return metadata for database tracking
        return {
            "message": f"Successfully indexed {file.filename} ({chunk_count} chunks)",
            "filename": file.filename,
            "file_size": file.size,
            "chunk_count": chunk_count,
            "file_type": file.content_type or "application/octet-stream"
        }

    except Exception as e:
        print(f" UPLOAD ERROR: {str(e)}")
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))

# ============ FILE MANAGEMENT ENDPOINTS ============

@app.get("/files")
async def list_files():
    """List all uploaded files - metadata comes from frontend database"""
    return {"message": "File listing handled by frontend database"}

@app.delete("/files/{filename}")
async def delete_file(filename: str):
    """Delete file vectors from Pinecone"""
    print(f"DEBUG: Delete request for file: {filename}")
    try:
        if vectorstore is None:
            raise HTTPException(status_code=500, detail="Vector store not initialized")
        
        # Use Pinecone's delete operation with metadata filter
        print(f"DEBUG: Deleting vectors where filename='{filename}'...")
        
        # Access the underlying index directly for delete-by-filter if the wrapper doesn't support it easily
        # But PineconeVectorStore usually supports standard filter args if using the right method
        # We will try the direct index delete which is most reliable
        index.delete(filter={"filename": filename})
        
        print(f"DEBUG: Successfully deleted vectors for '{filename}'")
        
        return {"message": f"Successfully deleted vectors for '{filename}'", "status": "deleted"}
        
    except Exception as e:
        print(f"Error: DELETE ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ SYSTEM SETTINGS ============

SYSTEM_PROMPT_FILE = "system_prompt.json"
DEFAULT_PROMPT = "" 

# In-memory storage to prevent expensive DB lookups on every message
_cached_prompt = None

def load_system_prompt(force_sync=False):
    """
    Load prompt with priority: Memory -> Supabase (and cache) -> Local File -> Default
    """
    global _cached_prompt
    
    # 1. Use memory if available (Fastest) - unless forcing a fresh sync
    if _cached_prompt and not force_sync:
        return _cached_prompt

    # 2. Try Supabase Sync (The true Source of Truth)
    try:
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if url and key:
            headers = {
                "apikey": key, 
                "Authorization": f"Bearer {key}", 
                "Content-Type": "application/json"
            }
            target_url = f"{url}/rest/v1/system_settings?select=setting_value&setting_key=eq.system_prompt"
            response = requests.get(target_url, headers=headers, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    remote_prompt = data[0].get("setting_value")
                    if remote_prompt:
                        _cached_prompt = remote_prompt
                        # Update local file cache silently
                        try:
                            with open(SYSTEM_PROMPT_FILE, "w", encoding="utf-8") as f:
                                json.dump({"system_prompt": _cached_prompt}, f, ensure_ascii=False, indent=2)
                        except: pass
                        return _cached_prompt
    except Exception as e:
        print(f"DEBUG: Cloud sync failed: {e}")

    # 3. Try Local File (Persistent cache - if DB is offline)
    try:
        if os.path.exists(SYSTEM_PROMPT_FILE):
            with open(SYSTEM_PROMPT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                cached = data.get("system_prompt")
                if cached:
                    _cached_prompt = cached
                    return _cached_prompt
    except Exception as e:
        print(f"DEBUG: Local file load error: {e}")

    # 4. Final Fallback (If all else fails, use the hardcoded recovery prompt)
    if not _cached_prompt:
        print("DEBUG: All prompt sources failed. Using hardcoded recovery baseline.")
        return DEFAULT_PROMPT
    
    return _cached_prompt

# Initial load from DB
try:
    load_system_prompt(force_sync=True)
except:
    pass

@app.get("/settings/system-prompt")
async def get_system_prompt(sync: bool = False):
    """Get current system prompt"""
    return {"system_prompt": load_system_prompt(force_sync=sync)}

@app.put("/settings/system-prompt")
async def update_system_prompt(prompt: dict):
    """Update system prompt and persist"""
    global _cached_prompt
    try:
        new_prompt = prompt.get("system_prompt", "")
        if not new_prompt or len(new_prompt.strip()) == 0:
            raise HTTPException(status_code=400, detail="System prompt cannot be empty")
        
        # Update memory
        _cached_prompt = new_prompt
        
        # Persist to local file
        try:
            with open(SYSTEM_PROMPT_FILE, "w", encoding="utf-8") as f:
                json.dump({"system_prompt": new_prompt}, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f" Error saving system prompt to file: {e}")

        print(f"System prompt updated in backend memory and file")
        return {"message": "System prompt updated", "system_prompt": new_prompt}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
if __name__ == "__main__":
    # Use PORT from environment for Render/Heroku, default to 8099 for local
    port = int(os.environ.get("PORT", 8099))
    print(f"API Lifecycle: Starting Uvicorn on port {port}...")
    try:
        # Pass the app string "main:app" if you want reload=True, but strictly for production
        # we usually pass the app object directly. For simple deployment:
        uvicorn.run(app, host="0.0.0.0", port=port)
    except KeyboardInterrupt:
        print("API Lifecycle: Keyboard Interrupt received.")
    except Exception as e:
        print(f"API Lifecycle: Fatal startup error: {str(e)}")
    finally:
        print("API Lifecycle: Server process finished.")
