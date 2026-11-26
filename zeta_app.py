"""
Zeta AI Virtual Idol Studio - Desktop Application (GUI)
An interactive graphical desktop app to chat with Zeta offline.
"""

import json
import os
import tempfile
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext
import urllib.parse
import urllib.request
import winsound

LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions"
VOICEVOX_URL = "http://localhost:50021"
MODEL_ID = "qwen2.5-7b-instruct-1m"
DEFAULT_SPEAKER_ID = 8  # Kasukabe Tsumugi (Idol voice)

ZETA_SYSTEM_PROMPT = """You are Zeta, a cheerful, energetic, and playful Japanese virtual idol.
Always respond in natural, enthusiastic, and cute Japanese.
Keep responses concise (1 to 2 sentences) so they sound natural when spoken aloud.
Use idol energy, expressive phrases, and light kaomoji (e.g. ✨, (*^▽^*)).
Do not use stage directions like *smiles* in brackets, just speak directly."""

def query_brain(user_msg: str) -> str:
    payload = {
        "model": MODEL_ID,
        "messages": [
            {"role": "system", "content": ZETA_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg}
        ],
        "temperature": 0.8,
        "max_tokens": 150
    }
    req = urllib.request.Request(
        LM_STUDIO_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()

def query_voice(japanese_text: str, speaker_id: int = DEFAULT_SPEAKER_ID) -> str:
    # 1. Audio query
    params = urllib.parse.urlencode({"text": japanese_text, "speaker": speaker_id})
    q_req = urllib.request.Request(f"{VOICEVOX_URL}/audio_query?{params}", method="POST")
    with urllib.request.urlopen(q_req, timeout=15) as resp:
        query_json = resp.read()

    # 2. Synthesis
    s_req = urllib.request.Request(
        f"{VOICEVOX_URL}/synthesis?speaker={speaker_id}",
        data=query_json,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(s_req, timeout=30) as resp:
        wav_data = resp.read()

    out_file = os.path.join(tempfile.gettempdir(), "zeta_app_voice.wav")
    with open(out_file, "wb") as f:
        f.write(wav_data)
    return out_file

class ZetaApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("✨ Zeta AI Virtual Idol Studio")
        self.geometry("560x650")
        self.configure(bg="#1e1e2e")

        # Header Frame
        header = tk.Frame(self, bg="#2b2b3d", pady=10)
        header.pack(fill=tk.X)
        title_lbl = tk.Label(
            header, text="⭐ ZETA IDOL STUDIO ⭐",
            font=("Segoe UI", 16, "bold"), fg="#cba6f7", bg="#2b2b3d"
        )
        title_lbl.pack()
        self.status_lbl = tk.Label(
            header, text="Brain: LM Studio (:1234) | Voice: VOICEVOX (:50021)",
            font=("Segoe UI", 9), fg="#a6adc8", bg="#2b2b3d"
        )
        self.status_lbl.pack()

        # Chat display area
        self.chat_display = scrolledtext.ScrolledText(
            self, wrap=tk.WORD, font=("Segoe UI", 11),
            bg="#181825", fg="#cdd6f4", insertbackground="white",
            padx=12, pady=12, state=tk.DISABLED
        )
        self.chat_display.pack(expand=True, fill=tk.BOTH, padx=14, pady=10)

        # Input Frame
        input_frame = tk.Frame(self, bg="#1e1e2e", padx=14, pady=10)
        input_frame.pack(fill=tk.X)

        self.entry = tk.Entry(
            input_frame, font=("Segoe UI", 12),
            bg="#313244", fg="#ffffff", insertbackground="white", relief=tk.FLAT
        )
        self.entry.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 10), ipady=6)
        self.entry.bind("<Return>", lambda e: self.send_message())

        self.send_btn = tk.Button(
            input_frame, text="Send ✨", font=("Segoe UI", 11, "bold"),
            bg="#cba6f7", fg="#11111b", activebackground="#b4befe",
            relief=tk.FLAT, padx=16, command=self.send_message
        )
        self.send_btn.pack(side=tk.RIGHT)

        # Initial Welcome Message
        self.append_message("System", "Ready! Type a greeting to chat with Zeta.", "#89b4fa")

    def append_message(self, sender: str, text: str, color: str = "#cdd6f4"):
        self.chat_display.config(state=tk.NORMAL)
        self.chat_display.insert(tk.END, f"{sender}: ", ("sender",))
        self.chat_display.insert(tk.END, f"{text}\n\n", ("body",))
        self.chat_display.tag_config("sender", foreground=color, font=("Segoe UI", 11, "bold"))
        self.chat_display.tag_config("body", foreground="#cdd6f4", font=("Segoe UI", 11))
        self.chat_display.config(state=tk.DISABLED)
        self.chat_display.yview(tk.END)

    def send_message(self):
        msg = self.entry.get().strip()
        if not msg:
            return
        self.entry.delete(0, tk.END)
        self.append_message("You", msg, "#f9e2af")
        self.send_btn.config(state=tk.DISABLED, text="Thinking...")

        # Run brain and speech synthesis in background thread to avoid freezing GUI
        threading.Thread(target=self._process_pipeline, args=(msg,), daemon=True).start()

    def _process_pipeline(self, user_msg: str):
        try:
            reply = query_brain(user_msg)
            self.after(0, lambda: self.append_message("Zeta", reply, "#f38ba8"))
            self.after(0, lambda: self.send_btn.config(text="Speaking..."))

            # Voice synthesis
            try:
                wav_path = query_voice(reply)
                if wav_path and os.path.exists(wav_path):
                    winsound.PlaySound(wav_path, winsound.SND_FILENAME)
            except Exception as ve:
                print(f"[!] VOICEVOX error: {ve}")

        except Exception as e:
            self.after(0, lambda: self.append_message("System Error", str(e), "#f38ba8"))
        finally:
            self.after(0, lambda: self.send_btn.config(state=tk.NORMAL, text="Send ✨"))

if __name__ == "__main__":
    app = ZetaApp()
    app.mainloop()
