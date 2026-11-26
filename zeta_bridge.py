"""
Zeta AI Virtual Idol Studio - Orchestrator Bridge
Connects:
1. LM Studio (Qwen 2.5 7B) -> Brain (Generates Japanese idol dialogue)
2. VOICEVOX -> Voice Engine (Synthesizes Japanese anime voice)
3. Warudo -> 3D Studio (Speaks audio & drives character mouth)
"""

import json
import os
import sys
import tempfile
import urllib.parse
import urllib.request
import winsound

# Configuration
LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
VOICEVOX_URL = "http://localhost:50021"
MODEL_ID = "qwen2.5-7b-instruct-1m"

# Speaker ID in VOICEVOX:
# 8: Kasukabe Tsumugi (春日部つむぎ - Normal) - Energetic, gyaru/idol
# 2: Shikoku Metan (四国めたん - Normal) - Sweet, clear heroine
# 3: Zundamon (ずんだもん - Normal) - Mascot/cute
DEFAULT_SPEAKER_ID = 8

ZETA_SYSTEM_PROMPT = """You are Zeta, a cheerful, energetic, and playful Japanese virtual idol.
Always respond in natural, enthusiastic, and cute Japanese.
Keep responses concise (1 to 2 sentences) so they sound natural when spoken aloud.
Use idol energy, expressive phrases, and light kaomoji (e.g. ✨, (*^▽^*)).
Do not use stage directions like *smiles* in brackets, just speak directly."""

def ask_zeta_brain(user_message: str) -> str:
    """Sends user message to LM Studio and gets Japanese dialogue."""
    payload = {
        "model": MODEL_ID,
        "messages": [
            {"role": "system", "content": ZETA_SYSTEM_PROMPT},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.8,
        "max_tokens": 150
    }
    
    req = urllib.request.Request(
        LM_STUDIO_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[!] Error calling LM Studio (Make sure Local Server is started on :1234): {e}")
        return None

def synthesize_voicevox(text: str, speaker_id: int = DEFAULT_SPEAKER_ID) -> str:
    """Calls VOICEVOX API to generate a .wav file for the text."""
    # Step 1: Create audio query
    query_params = urllib.parse.urlencode({"text": text, "speaker": speaker_id})
    query_url = f"{VOICEVOX_URL}/audio_query?{query_params}"
    
    req_query = urllib.request.Request(query_url, method="POST")
    try:
        with urllib.request.urlopen(req_query, timeout=15) as resp:
            query_json = resp.read()
    except Exception as e:
        print(f"[!] Error connecting to VOICEVOX (Make sure VOICEVOX is running on :50021): {e}")
        return None

    # Step 2: Synthesize speech from query
    synthesis_url = f"{VOICEVOX_URL}/synthesis?speaker={speaker_id}"
    req_synth = urllib.request.Request(
        synthesis_url,
        data=query_json,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req_synth, timeout=30) as resp:
            wav_bytes = resp.read()
            
        temp_wav = os.path.join(tempfile.gettempdir(), "zeta_speech.wav")
        with open(temp_wav, "wb") as f:
            f.write(wav_bytes)
        return temp_wav
    except Exception as e:
        print(f"[!] Error synthesizing audio: {e}")
        return None

def speak(wav_path: str):
    """Plays the audio file out loud (and into Warudo via Virtual Cable)."""
    if wav_path and os.path.exists(wav_path):
        winsound.PlaySound(wav_path, winsound.SND_FILENAME)

def main():
    print("=" * 60)
    print("       ⭐ ZETA 3D AI VIRTUAL IDOL STUDIO BRIDGE ⭐")
    print("=" * 60)
    print(f"[*] Brain: LM Studio ({LM_STUDIO_URL})")
    print(f"[*] Voice: VOICEVOX ({VOICEVOX_URL})")
    print("[*] Type 'exit' or 'quit' to stop.")
    print("=" * 60 + "\n")

    while True:
        try:
            user_input = input("You: ").strip()
            if not user_input:
                continue
            if user_input.lower() in ("exit", "quit"):
                print("Bye bye! ✨")
                break

            print("\n[Thinking...]")
            reply = ask_zeta_brain(user_input)
            if not reply:
                continue

            print(f"Zeta: {reply}\n")
            print("[Speaking...]")
            wav_file = synthesize_voicevox(reply)
            if wav_file:
                speak(wav_file)
            print("-" * 40)
        except KeyboardInterrupt:
            print("\nExiting...")
            break

if __name__ == "__main__":
    main()
