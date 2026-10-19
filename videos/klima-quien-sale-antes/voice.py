"""Voces: out/raw/<id>.wav (Kokoro, 24 kHz) → voices/<id>.wav (48 kHz, procesada por personaje)
+ voices/dur.json (duración) + voices/lips.json (boca: apertura «o» y brillo «b» cada 1/24 s).
- "pitch": semitonos (rubberband de ffmpeg, conserva el tempo y los formantes).
- HOST: locutor de plató: sin graves de sobra, presencia en 3 kHz, saturación y compresión rápida.
- JAVIER: +2 semitonos y algo más fino. LUCIA: +1 semitono, presencia y aire.
- PUBLICO: crudo; mix.py lo apila con varias afinaciones.
Uso: python voice.py"""
import json
import os
import subprocess
import tempfile

import numpy as np
import soundfile as sf
import soxr
from scipy.signal import butter, lfilter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
L = json.load(open(os.path.join(HERE, "lines.json")))
os.makedirs(os.path.join(HERE, "voices"), exist_ok=True)


def peq(x, f, gain_db, q=1.0):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f / SR; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


def hp(x, f): return sosfilt(butter(2, f, "high", fs=SR, output="sos"), x)


def comp(x, thr=.25, ratio=4.0, att=.002, rel=.06):
    """Compresor de pico con detector suavizado (ataque y relevo en segundos)."""
    a, r = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR))
    env = np.zeros_like(x); e = 0.0
    ax = np.abs(x)
    for i in range(len(x)):
        c = a if ax[i] > e else r
        e = c * e + (1 - c) * ax[i]; env[i] = e
    g = np.ones_like(x); over = env > thr
    g[over] = (thr + (env[over] - thr) / ratio) / env[over]
    return x * g


def pitch(y, semis):
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        sf.write(a, y, SR)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a, "-af",
                        f"rubberband=pitch={2 ** (semis / 12):.5f}:formant=preserved", b], check=True)
        return sf.read(b)[0]


dur, lips = {}, {}
for l in L:
    y, sr = sf.read(os.path.join(HERE, "out/raw", l["id"] + ".wav"))
    if y.ndim > 1: y = y.mean(1)
    y = soxr.resample(y, sr, SR)
    if l.get("pitch"): y = pitch(y, l["pitch"])
    y = y / (np.abs(y).max() + 1e-9) * .9
    who = l["who"]
    if who == "HOST":
        y = hp(y, 90); y = peq(y, 220, -1.5, .9); y = peq(y, 3000, 3.5, .8); y = peq(y, 7500, 1.5, .7)
        sat = np.tanh(y * 2.2) / np.tanh(2.2); y = .75 * y + .25 * sat
        y = comp(y / (np.abs(y).max() + 1e-9) * .9, thr=.3, ratio=3.5)
    elif who == "JAVIER":
        y = hp(y, 120); y = peq(y, 160, -2.0, .8); y = peq(y, 2600, 1.5, .9)
        y = comp(y / (np.abs(y).max() + 1e-9) * .9, thr=.35, ratio=3.0)
    elif who == "LUCIA":
        y = hp(y, 110); y = peq(y, 3200, 2.0, .9); y = peq(y, 8500, 1.5, .7)
        y = comp(y / (np.abs(y).max() + 1e-9) * .9, thr=.35, ratio=3.0)
    y = y / (np.abs(y).max() + 1e-9) * .9
    sf.write(os.path.join(HERE, "voices", l["id"] + ".wav"), y.astype(np.float32), SR)
    dur[l["id"]] = round(len(y) / SR, 3)
    # boca: RMS en ventanas de 50 ms (normalizado al percentil 95 de la frase) + centroide espectral
    hop, win = SR // 24, int(.05 * SR)
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
    lips[l["id"]] = {"o": [round(float(np.clip((r / p - .1) / .8, 0, 1)), 2) for r in rms],
                     "b": [round(float(np.clip((c - 1200) / 2600, 0, 1)), 2) for c in cen]}
    print(l["id"], dur[l["id"]])
json.dump(dur, open(os.path.join(HERE, "voices/dur.json"), "w"), indent=0)
json.dump(lips, open(os.path.join(HERE, "voices/lips.json"), "w"))
