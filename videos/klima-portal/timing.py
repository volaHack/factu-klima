"""Comprueba que las frases no se pisan: lee VO/HVO de main.js y voices/dur.json.
Por cada frase imprime inicio, fin y holgura hasta la siguiente (mín. 0,15 s). Sale con 1 si alguna se pisa.
Uso: python3 timing.py"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "main.js")).read()
D = json.load(open(os.path.join(HERE, "voices/dur.json")))


def table(name):
    body = re.search(r"const " + name + r" = \{([^}]*)\}", src).group(1)
    return {k: float(v) for k, v in re.findall(r"(\w+):\s*([\d.]+)", body)}


off = float(re.search(r"const OFF = ([\d.]+)", src).group(1))
dur_story = float(re.search(r"export const DUR = ([\d.]+)", src).group(1))
rows = sorted([(t, k) for k, t in table("HVO").items()] + [(t + off, k) for k, t in table("VO").items()])
bad = 0
for i, (t0, k) in enumerate(rows):
    t1 = t0 + D[k]
    nxt = rows[i + 1][0] if i + 1 < len(rows) else off + dur_story
    gap = nxt - t1
    flag = "  << SE PISA" if gap < .15 else ""
    bad += gap < .15
    print(f"{k:3s} {t0:6.2f} → {t1:6.2f}  dur {D[k]:5.2f}  holgura {gap:5.2f}{flag}")
sys.exit(1 if bad else 0)
