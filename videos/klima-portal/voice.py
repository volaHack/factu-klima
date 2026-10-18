"""Voces: out/raw/<id>.wav (Kokoro, 24 kHz) → voices/<id>.wav (48 kHz, procesada por personaje)
+ voices/dur.json (duración) + voices/lips.json (boca: apertura «o» y brillo «b» cada 1/24 s).
- "pitch": semitonos (rubberband de ffmpeg, conserva el tempo). Paco −2, el bicho +7.
- PACO: saturación ligera + subida en 180 Hz = voz grave y cascada; NURIA: algo más de presencia.
Uso: python voice.py"""
import json
import os
import subprocess
import tempfile

import numpy as np
import soundfile as sf
import soxr
from scipy.signal import lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
L = json.load(open(os.path.join(HERE, "lines.json")))
os.makedirs(os.path.join(HERE, "voices"), exist_ok=True)


def peq(x, f, gain_db, q=1.0):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def pitch(y, semis):
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        sf.write(a, y, SR)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a, "-af", f"rubberband=pitch={2 ** (semis / 12):.5f}:formant=preserved", b], check=True)
        return sf.read(b)[0]


dur, lips = {}, {}
for l in L:
    y, sr = sf.read(os.path.join(HERE, "out/raw", l["id"] + ".wav"))
    if y.ndim > 1: y = y.mean(1)
    y = soxr.resample(y, sr, SR)
    if l.get("pitch"): y = pitch(y, l["pitch"])
    y = y / (np.abs(y).max() + 1e-9) * .9
    if l["who"] == "PACO":
        sat = np.tanh(y * 2.4) / np.tanh(2.4); y = .7 * y + .3 * sat
        y = peq(y, 180, 3.0, .8); y = peq(y, 2800, -1.5, 1.0)
    elif l["who"] == "NURIA":
        y = peq(y, 3200, 2.0, .9)
    elif l["who"] == "TÉCNICO":
        y = peq(y, 1200, 3.0, .7); y = peq(y, 150, -4, .7)
    y = y / (np.abs(y).max() + 1e-9) * .9
    sf.write(os.path.join(HERE, "voices", l["id"] + ".wav"), y.astype(np.float32), SR)
    dur[l["id"]] = round(len(y) / SR, 3)
    # boca: RMS en ventanas de 50 ms (normalizado al percentil 95 de la frase) + centroide espectral
    hop, win = SR // 24, int(.05 * SR); o, b = [], []
    n = int(np.ceil(len(y) / hop)) + 1
    pad = np.concatenate([np.zeros(win), y, np.zeros(win)])
    rms, cen = np.zeros(n), np.zeros(n)
    fr = np.fft.rfftfreq(win, 1 / SR); hann = np.hanning(win)
    for i in range(n):
        seg = pad[i * hop + win // 2: i * hop + win // 2 + win]
        if len(seg) < win: seg = np.pad(seg, (0, win - len(seg)))
        S = np.abs(np.fft.rfft(seg * hann))
        rms[i] = np.sqrt((seg ** 2).mean()); cen[i] = (S * fr).sum() / (S.sum() + 1e-9)
    p = np.percentile(rms, 95) + 1e-9
    o = [round(float(np.clip((r / p - .1) / .8, 0, 1)), 2) for r in rms]
    b = [round(float(np.clip((c - 1200) / 2600, 0, 1)), 2) for c in cen]
    lips[l["id"]] = {"o": o, "b": b}
    print(l["id"], dur[l["id"]])
json.dump(dur, open(os.path.join(HERE, "voices/dur.json"), "w"), indent=0)
json.dump(lips, open(os.path.join(HERE, "voices/lips.json"), "w"))
