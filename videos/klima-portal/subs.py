"""Subtítulos: los cues salen de events.json (window.EV, tipo «sub») → cues.json → klima-portal.srt con core/render/srt.py."""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); LIB = os.environ.get("LIB", "/home/user/lemomo-ai/lemo-opuscar")
ev = json.load(open(os.path.join(HERE, "events.json")))["ev"]
cues = [{"t0": e["t"], "t1": e["t1"], "text": e["text"]} for e in ev if e["type"] == "sub"]
json.dump(cues, open(os.path.join(HERE, "out/cues.json"), "w"), ensure_ascii=False, indent=1)
subprocess.run([sys.executable, os.path.join(LIB, "core/render/srt.py"), os.path.join(HERE, "out/cues.json"), os.path.join(HERE, "klima-portal.srt")], check=True)
