
import os
import requests
from dotenv import load_dotenv

# Load from backend/.env where we have the working keys
load_dotenv("backend/.env")

url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url:
    # Fallback if load_dotenv failed or keys are named differently
    print("Trying alternative key loading...")
    with open("backend/.env", "r") as f:
        env_lines = f.readlines()
    for line in env_lines:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            os.environ[k] = v
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Create a clean frontend/.env.local
with open("frontend/.env.local", "w", encoding="utf-8") as f:
    f.write(f"NEXT_PUBLIC_SUPABASE_URL={url}\n")
    f.write(f"NEXT_PUBLIC_SUPABASE_ANON_KEY={anon_key}\n")
    f.write(f"SUPABASE_SERVICE_ROLE_KEY={service_key}\n")
    f.write(f"PYTHON_BACKEND_URL=http://localhost:8099/upload\n")

print("✅ Successfully wrote clean frontend/.env.local")

# Check admin status of the user
headers = {
    "apikey": service_key,
    "Authorization": f"Bearer {service_key}"
}
try:
    target = f"{url}/rest/v1/profiles?select=email,role&email=eq.syedayan6464@gmail.com"
    res = requests.get(target, headers=headers)
    print(f"Admin Check for syedayan6464@gmail.com: {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        print(f"Profile data: {data}")
    else:
        print(f"Error checking profile: {res.text}")
except Exception as e:
    print(f"Exception: {e}")
