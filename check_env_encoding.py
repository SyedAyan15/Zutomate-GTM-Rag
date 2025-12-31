
import os

filepath = "frontend/.env.local"
if os.path.exists(filepath):
    with open(filepath, "rb") as f:
        content = f.read()
    
    print(f"File size: {len(content)} bytes")
    print(f"First 50 bytes (hex): {content[:50].hex()}")
    
    try:
        # Try decoding as utf-8
        text = content.decode("utf-8")
        print("✅ Successfully decoded as UTF-8")
        print("--- CONTENT ---")
        print(text)
    except UnicodeDecodeError:
        print("❌ Failed to decode as UTF-8. Trying UTF-16...")
        try:
            text = content.decode("utf-16")
            print("✅ Successfully decoded as UTF-16")
            print("--- CONTENT ---")
            print(text)
        except UnicodeDecodeError:
            print("❌ Failed to decode as UTF-16")
else:
    print(f"File {filepath} not found")
