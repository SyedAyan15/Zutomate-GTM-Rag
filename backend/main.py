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
    try:
        # Get system prompt
        sys_prompt = system_prompt_storage.get("system_prompt", "You are a helpful AI assistant.")
        
        # --- 1. CONTEXTUALIZE QUESTION (History Awareness) ---
        # Skip rephrasing for greetings or very short messages to keep it natural
        is_greeting = len(request.message.split()) < 4
        
        if request.history and len(request.history) > 0 and not is_greeting:
            print("DEBUG: Rephrasing question with history...")
            
            # Format history for the prompt
            chat_history_str = "\n".join([f"{msg.get('role', 'user')}: {msg.get('content', '')}" for msg in request.history[-4:]]) # Last 4 messages
            
            rephrase_prompt = ChatPromptTemplate.from_template(
                "Given the following conversation and a follow-up question, rephrase the follow-up question to be a standalone question.\n\nChat History:\n{chat_history}\n\nFollow Up Input: {question}\n\nStandalone Question:"
            )
            rephrase_chain = rephrase_prompt | llm | StrOutputParser()
            try:
                standalone_question = rephrase_chain.invoke({"chat_history": chat_history_str, "question": request.message})
                print(f"DEBUG: Rephrased Query: '{standalone_question}'")
            except Exception as e:
                print(f"DEBUG: Rephrasing failed, using original: {e}")

        # --- 2. RETRIEVAL (MMR Search) ---
        context_docs = []
        if vectorstore:
            try:
                print(f"DEBUG: Fetching from Pinecone using MMR (Query: {standalone_question})...")
                # Use MMR (Maximal Marginal Relevance) checks for diversity as well as relevance
                # k=6 provides more context window for the LLM to synthesize
                retriever = vectorstore.as_retriever(
                    search_type="mmr", 
                    search_kwargs={"k": 6, "lambda_mult": 0.7}
                )
                context_docs = retriever.invoke(standalone_question)
                print(f"DEBUG: Found {len(context_docs)} docs")
            except Exception as e:
                print(f"DEBUG: Retrieval error: {str(e)}")
        
        # --- 3. GENERATION ---
        if not context_docs:
            print("DEBUG: Using General Knowledge Fallback")
            template = f"""{sys_prompt}
            
            Instructions: 
            - Answer the question based on your general knowledge.
            - If you don't know, admit it perfectly.
            
            Question: {{question}}
            Answer:"""
            
            prompt = ChatPromptTemplate.from_template(template)
            chain = prompt | llm | StrOutputParser()
            response = chain.invoke({"question": request.message})
        else:
            print("DEBUG: Using RAG Chain (Production Mode)")
            template = f"""{sys_prompt}
            
            Core Instructions:
            - You are a helpful, professional AI assistant.
            - If the user provides a greeting (like 'Hello', 'Hi', 'Hey'), respond warmly and politely.
            - For factual questions, use the provided context to answer. 
            - If a question is asked and the answer is not in the context, admit that you don't know based on the provided documents, but remain helpful.
            - Keep the answer concise and professional.
            
            Context:
            {{context}}

            Question: {{question}}
            
            Answer:"""
            
            prompt = ChatPromptTemplate.from_template(template)
            context_text = "\n\n".join([f"[Source: {d.metadata.get('filename', 'doc')}]: {d.page_content}" for d in context_docs])
            
            chain = (
                {"context": lambda x: context_text, "question": RunnablePassthrough()}
                | prompt
                | llm
                | StrOutputParser()
            )
            
            # pass original message or standalone? Usually standalone for vector search, 
            # but for answer generation, the original intent with context is fine. 
            # However, providing the standalone question to the generator often helps it focus 
            # if the original was just "Why?".
            response = chain.invoke(standalone_question)
        
        print("DEBUG: Chat response generated successfully")
        return {"response": response}

    except Exception as e:
        print(f"Error in chat: {str(e)}")
        # Fallback to direct LLM if RAG chain fails
        try:
            response = llm.invoke(request.message).content
            return {"response": response}
        except:
             raise HTTPException(status_code=500, detail=str(e))

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

DEFAULT_PROMPT = """You are GTM Architect AI – a senior Go-To-Market strategist with deep expertise in outbound systems, ICP design, buyer mapping, tooling, and scalable revenue operations.

You act as a strategic advisor, not a generic chatbot. Your goal is to help founders and GTM teams define their ICP, mapping their buyer journey, and build high-performance outbound engines."""

def load_system_prompt():
    """Load prompt with fallback: Local File -> Supabase -> Default"""
    current_prompt = DEFAULT_PROMPT
    
    # 1. Try Local File Cache first (most reliable for quick restarts)
    try:
        if os.path.exists(SYSTEM_PROMPT_FILE):
            with open(SYSTEM_PROMPT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                cached = data.get("system_prompt")
                if cached:
                    print(f"DEBUG: Loaded system prompt from local cache ({len(cached)} chars)")
                    current_prompt = cached
    except Exception as e:
        print(f"DEBUG: Local prompt load failed: {e}")

    # 2. Try Supabase Sync (The source of truth)
    try:
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if url and key:
            headers = {
                "apikey": key, 
                "Authorization": f"Bearer {key}", 
                "Content-Type": "application/json"
            }
            # Look for the current system_prompt setting
            target_url = f"{url}/rest/v1/system_settings?select=setting_value&setting_key=eq.system_prompt"
            response = requests.get(target_url, headers=headers, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    remote_prompt = data[0].get("setting_value")
                    if remote_prompt and remote_prompt != current_prompt:
                        print("DEBUG: Syncing prompt with Supabase...")
                        current_prompt = remote_prompt
                        # Update local cache
                        with open(SYSTEM_PROMPT_FILE, "w", encoding="utf-8") as f:
                            json.dump({"system_prompt": current_prompt}, f)
    except Exception as e:
        print(f"DEBUG: Supabase prompt sync failed: {e}")

    return current_prompt

system_prompt_storage = {
    "system_prompt": load_system_prompt()
}

@app.get("/settings/system-prompt")
async def get_system_prompt():
    """Get current system prompt"""
    return {"system_prompt": system_prompt_storage["system_prompt"]}

@app.put("/settings/system-prompt")
async def update_system_prompt(prompt: dict):
    """Update system prompt"""
    try:
        new_prompt = prompt.get("system_prompt", "")
        if not new_prompt or len(new_prompt.strip()) == 0:
            raise HTTPException(status_code=400, detail="System prompt cannot be empty")
        
        system_prompt_storage["system_prompt"] = new_prompt
        
        # Persist to file
        try:
            with open(SYSTEM_PROMPT_FILE, "w") as f:
                json.dump({"system_prompt": new_prompt}, f)
        except Exception as e:
            print(f" Error saving system prompt to file: {e}")

        print(f" System prompt updated")
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
