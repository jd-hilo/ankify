import os
import csv
import uuid
import hashlib
import argparse
from supabase import create_client, Client
from typing import List, Dict

# Configuration - Replace these with values from your .env.local
SUPABASE_URL = "https://wmdqbnujveupmlprgeuk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZHFibnVqdmV1cG1scHJnZXVrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTAzMjkxMywiZXhwIjoyMDg0NjA4OTEzfQ.MMzLJOwjje85B2ydtf6R9nJi4JSX3BOKx8RGXqBL228" # Use Service Role key for bypass RLS if needed
USER_ID = "eadfba54-9392-4623-9684-61dbdbb5d1d1" # Your user ID from Supabase Auth

def get_file_hash(file_path: str) -> str:
    hash_sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest()[:16]

def clean_text(text: str) -> str:
    if not text: return ""
    # Simple HTML cleaning
    import re
    text = re.sub('<[^>]*>', ' ', text)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return ' '.join(text.split())

def upload_deck(file_path: str, deck_name: str):
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print(f"Reading file: {file_path}")
    
    # 1. Create the Deck record
    version_hash = get_file_hash(file_path)
    deck_data = {
        "user_id": USER_ID,
        "name": deck_name,
        "file_type": "csv",
        "version_hash": version_hash,
        "processing_status": "processing"
    }
    
    deck_res = supabase.table("decks").insert(deck_data).execute()
    if not deck_res.data:
        print("Error creating deck record")
        return
    
    deck_id = deck_res.data[0]["id"]
    print(f"Created deck: {deck_name} (ID: {deck_id})")

    # 2. Parse and Upload Cards in Batches
    cards_dict = {}  # Use dict to deduplicate by card_id
    batch_size = 500
    total_count = 0
    
    # Detect separator (tab or comma)
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        first_line = f.readline()
        dialect = 'excel-tab' if '\t' in first_line else 'excel'
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        # Skip Anki header lines if they exist
        lines = f.readlines()
        data_lines = [l for l in lines if not l.startswith('#')]
        
        reader = csv.reader(data_lines, dialect=dialect)
        
        for row in reader:
            if len(row) < 2: continue
            
            # Anki export usually: GUID, Type, Deck, Front, Back, ... Tags is often last
            # We'll try to guess: Front is usually index 3 or 0, Back is 4 or 1
            if dialect == 'excel-tab':
                # Typical Anki Notes export: 0:GUID, 1:NoteType, 2:Deck, 3:Front, 4:Back ... 14:Tags
                card_id = row[0]
                front = clean_text(row[3] if len(row) > 3 else row[0])
                back = clean_text(row[4] if len(row) > 4 else row[1])
                tags = row[14].strip('"').split() if len(row) > 14 else []
            else:
                # Basic CSV
                front = clean_text(row[0])
                back = clean_text(row[1])
                card_id = hashlib.md5(f"{front}{back}".encode()).hexdigest()[:12]
                tags = row[2].split() if len(row) > 2 else []

            # Store in dict to deduplicate (last occurrence wins)
            cards_dict[card_id] = {
                "deck_id": deck_id,
                "card_id": card_id,
                "front": front,
                "back": back,
                "tags": tags if tags else None
            }
            
            if len(cards_dict) >= batch_size:
                cards_to_insert = list(cards_dict.values())
                supabase.table("raw_cards").upsert(cards_to_insert, on_conflict="deck_id,card_id").execute()
                total_count += len(cards_to_insert)
                print(f"Uploaded {total_count} cards...")
                cards_dict = {}

        # Final batch
        if cards_dict:
            cards_to_insert = list(cards_dict.values())
            supabase.table("raw_cards").upsert(cards_to_insert, on_conflict="deck_id,card_id").execute()
            total_count += len(cards_to_insert)
            print(f"Uploaded {total_count} cards...")

    # 3. Update Deck status
    supabase.table("decks").update({
        "processing_status": "completed",
        "card_count": total_count
    }).eq("id", deck_id).execute()
    
    print(f"Successfully finished! Total cards: {total_count}")

if __name__ == "__main__":
    # Path to your Cards file
    CARDS_FILE = "/Users/parlessgolf/Documents/ankify/Carddss.txt"
    
    parser = argparse.ArgumentParser(description="Upload Anki deck to Supabase")
    parser.add_argument("--file", help="Path to the exported .txt or .csv file", default=CARDS_FILE)
    parser.add_argument("--name", help="Name of the deck", default="AnKing Deck")
    
    args = parser.parse_args()
    upload_deck(args.file, args.name)
