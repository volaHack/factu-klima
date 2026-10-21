"""Comprobación de voz sobre la película terminada: corta cada frase de la mezcla final (con música, público y
efectos) y la transcribe con Whisper small local. Uso: python3 asr_final.py quien-sale-antes.mp4"""
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asr import asr, norm   # noqa: E402  (mismo modelo y misma normalización que la comprobación de las voces)

HERE = os.path.dirname(os.path.abspath(__file__))
film = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "quien-sale-antes.mp4")
pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", film, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
y = np.frombuffer(pcm, np.float32)
lines = {l["id"]: l for l in json.load(open(os.path.join(HERE, "lines.json")))}
dur = json.load(open(os.path.join(HERE, "voices", "dur.json")))
ev = [e for e in json.load(open(os.path.join(HERE, "events.json")))["ev"] if e["type"] == "vo"]
bad = 0
# el recorte de una frase nunca coge la cola de la anterior (de la misma voz o de otra)
ends = sorted((e["t"] + dur[e["id"]], e["t"]) for e in ev)
for e in ev:
    before = max([t1 for t1, t0 in ends if t0 < e["t"]], default=0)
    a, b = max(0, int(max(e["t"] - .08, before + .01) * 16000)), int((e["t"] + dur[e["id"]] + .12) * 16000)
    st = asr.create_stream(); st.accept_waveform(16000, np.concatenate([np.zeros(9600, np.float32), y[a:b], np.zeros(9600, np.float32)])); asr.decode_stream(st)
    got = st.result.text.strip(); want = lines[e["id"]].get("asr", lines[e["id"]]["text"])
    ok = norm(want) == norm(got); bad += not ok
    print("OK  " if ok else "DIFF", f'{e["t"]:6.2f}', e["id"], "|", want, "→", got)
print("no cuadran:", bad)
