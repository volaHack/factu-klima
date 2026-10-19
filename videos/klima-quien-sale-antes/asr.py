"""Comprobación de voz línea a línea con Whisper small (sherpa-onnx, local).
Cada voices/<id>.wav se rellena con 0,6 s de silencio a cada lado y se transcribe; se compara palabra a
palabra con el campo "asr" (o "text") sin tildes, mayúsculas ni puntuación. Sale con 1 si alguna no cuadra.
Uso: python asr.py [modelo_dir]"""
import json
import os
import re
import sys
import unicodedata

import numpy as np
import sherpa_onnx
import soundfile as sf


HERE = os.path.dirname(os.path.abspath(__file__))
W = (sys.argv[1] if len(sys.argv) > 1 and os.path.isdir(sys.argv[1]) else
     "/tmp/claude-0/-home-user-factu-klima/d92d6228-a2b9-5b10-b4fd-4ff3257463a2/scratchpad/tts/sherpa-onnx-whisper-small") + "/small-"
asr = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=W + "encoder.int8.onnx", decoder=W + "decoder.int8.onnx",
                                                 tokens=W + "tokens.txt", language="es", task="transcribe", num_threads=4)
NUM = {"20": "veinte", "5": "cinco", "0": "cero"}


def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    for k, v in NUM.items(): s = re.sub(rf"\b{k}\b", v, s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = " ".join(s.split())
    s = s.replace("visum", "bizum").replace("atiempo", "a tiempo").replace("salantes", "sal antes").replace("qr", "cu erre").replace("veri factu", "verifactu").replace("tpv", "tepeuve").replace("te pe uve", "tepeuve").replace("klima facturas", "klimafacturas").replace("clima facturas", "klimafacturas")
    s = s.replace("climafacturas", "klimafacturas").replace("click", "clic").replace("klimafacturas com", "klimafacturas punto com")
    return re.sub(r"[^a-z0-9 ]", " ", s).split()


if __name__ == "__main__":
    bad = 0
    for l in json.load(open(os.path.join(HERE, "lines.json"))):
        if l["who"] == "PUBLICO": continue
        y, sr = sf.read(os.path.join(HERE, "voices", l["id"] + ".wav"))
        y = np.interp(np.arange(0, len(y), sr / 16000), np.arange(len(y)), y).astype(np.float32)
        pad = np.zeros(int(.6 * 16000), np.float32)
        st = asr.create_stream(); st.accept_waveform(16000, np.concatenate([pad, y, pad])); asr.decode_stream(st)
        got = st.result.text.strip()
        want = l.get("asr", l["text"])
        ok = norm(want) == norm(got)
        bad += not ok
        print("OK  " if ok else "DIFF", l["id"], "|", want, "→", got)
    print("no cuadran:", bad)
    sys.exit(1 if bad else 0)
