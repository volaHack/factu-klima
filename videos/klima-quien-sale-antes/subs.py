"""Subtítulos .srt de cada frase dicha, sacados de los eventos «sub» de la página (events.json): cada cue dura
≥ 1,8 s y ≥ frase + 0,6 s, recortado por el siguiente. Uso: python subs.py"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get("LIB", "/home/user/lemomo-ai/lemo-opuscar")
ev = json.load(open(os.path.join(HERE, "events.json")))["ev"]
cues = []
for e in ev:   # una frase que no llega a 1,8 s en pantalla se une a la siguiente en el mismo subtítulo
    if e["type"] != "sub": continue
    if cues and cues[-1]["t1"] - cues[-1]["t0"] < 1.8: cues[-1]["text"] += "\n" + e["text"]; cues[-1]["t1"] = e["t1"]
    else: cues.append({"t0": e["t"], "t1": e["t1"], "text": e["text"]})
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
json.dump(cues, open(os.path.join(HERE, "out", "cues.json"), "w"), ensure_ascii=False, indent=1)
subprocess.run([sys.executable, os.path.join(LIB, "core/render/srt.py"), os.path.join(HERE, "out", "cues.json"), os.path.join(HERE, "quien-sale-antes.srt")], check=True)
print(len(cues), "cues")
