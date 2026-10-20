"""Sonido de «Para el vídeo»: pulso a 120 BPM en mi menor, un tic por tarjeta que sube de tono, y el golpe del logo en sol mayor. Escribe out/mix.wav."""
import json
import os

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve, lfilter, resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
E = json.load(open(os.path.join(HERE, "events.json")))
DUR = E["dur"]; N = int((DUR + 1.0) * SR)
EV = E["ev"]; META = next(e for e in EV if e["type"] == "meta")
BPM, BAR0 = META["bpm"], META["bar0"]; BEAT = 60 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(7)
MUS, SFX = np.zeros((2, N)), np.zeros((2, N))
WET = np.zeros((2, N)); SEND = [0.0]
EVT = {}
for e in EV: EVT.setdefault(e["type"], []).append(e)
T = lambda ty, k=0: EVT[ty][k]["t"]


def ar(n): return np.arange(n) / SR
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def lp(x, f, o=2): return sosfilt(butter(o, min(f, SR / 2 - 200), "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, min(b, SR / 2 - 200)], "band", fs=SR, output="sos"), x)
def nz(d): return rng.standard_normal(int(d * SR))
def env(n, a=.005, r=.1, hold=None):
    t = ar(n); e = np.minimum(1, t / max(a, 1e-4))
    rel = np.exp(-np.maximum(0, t - (hold if hold is not None else a)) / max(r, 1e-4))
    return e * rel


def put(buf, x, t0, g=1.0, pan=0.0):
    x = np.asarray(x, float)
    if x.ndim == 2:   # ya estéreo
        i = int(round(t0 * SR)); j = min(N, i + x.shape[1])
        if j > max(i, 0): buf[:, max(i, 0):j] += x[:, max(0, -i):j - i] * g
        if buf is SFX and SEND[0] > 0 and j > max(i, 0): WET[:, max(i, 0):j] += x[:, max(0, -i):j - i] * g * SEND[0]
        return
    i = int(round(t0 * SR))
    if i < 0: x = x[-i:]; i = 0
    j = min(N, i + len(x))
    if j <= i: return
    x = x[: j - i] * g; L, R = np.sqrt(.5 * (1 - pan)), np.sqrt(.5 * (1 + pan))
    buf[0, i:j] += x * L; buf[1, i:j] += x * R
    if buf is SFX and SEND[0] > 0: WET[0, i:j] += x * L * SEND[0]; WET[1, i:j] += x * R * SEND[0]


# ——— osciladores ———
def saw(f, n, ph=0.0):
    """Diente de sierra con polyBLEP (sin aliasing audible)."""
    dt = f / SR; t = (ph + dt * np.arange(n)) % 1.0
    y = 2 * t - 1
    m1 = t < dt; x = t[m1] / dt; y[m1] -= x + x - x * x - 1
    m2 = t > 1 - dt; x = (t[m2] - 1) / dt; y[m2] -= x * x + x + x + 1
    return y
def sine(f, n, ph=0.0): return np.sin(2 * np.pi * f * np.arange(n) / SR + ph)


# ——— batería ———
def kick(g=1.0):
    n = int(.42 * SR); t = ar(n); f = 46 + 110 * np.exp(-t * 34) + 40 * np.exp(-t * 140)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    s += .35 * bp(rng.standard_normal(n), 2500, 9000) * np.exp(-t * 320)
    return np.tanh(s * 1.9) * .9 * g
def clap(g=1.0):
    n = int(.32 * SR); out = np.zeros(n)
    for k, off in enumerate([0, .009, .019, .031]):
        i = int(off * SR); m = n - i; t = ar(m); out[i:] += bp(rng.standard_normal(m), 900, 6500) * np.exp(-t * (75 if k < 3 else 13))
    return out * .55 * g
def hat(open_=False, g=1.0):
    n = int((.22 if open_ else .045) * SR); t = ar(n)
    return hp(rng.standard_normal(n), 7600, 3) * np.exp(-t * (14 if open_ else 110)) * .3 * g
def snare(g=1.0):
    n = int(.24 * SR); t = ar(n)
    return (bp(rng.standard_normal(n), 1400, 9000) * np.exp(-t * 19) * .7 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * .45) * g


# ——— instrumentos ———
def pad(ms, d, cut=2200, g=1.0, a=.35, r=.6):
    n = int((d + r) * SR); out = np.zeros(n)
    for m in ms:
        for k, det in enumerate((-.11, -.05, 0, .05, .11)):
            out += saw(mtof(m + det), n, ph=rng.random()) * (.6 if k != 2 else 1)
    out = lp(out, cut, 2) / (len(ms) * 3.4)
    return out * env(n, a, r, hold=d) * g
def pluck(m, d=.28, g=1.0, bright=4200):
    n = int(d * SR); t = ar(n); x = saw(mtof(m), n) * .7 + saw(mtof(m + .07), n) * .5
    out = np.zeros(n); seg = 512
    for i in range(0, n, seg):   # el filtro se cierra deprisa: el «pluc»
        fc = 300 + bright * np.exp(-i / SR * 16)
        out[i:i + seg] = lp(x[max(0, i - 2048):i + seg], fc)[-len(x[i:i + seg]):]
    return out * np.exp(-t * 7) * np.minimum(1, t / .002) * .5 * g
def bass(m, d, g=1.0):
    n = int(d * SR); t = ar(n); f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + .25 * np.sin(4 * np.pi * f * t) + .12 * lp(saw(f, n), 900)
    return np.tanh(s * 1.4) * env(n, .006, .05, hold=d - .06) * .55 * g
def bell(m, d=1.6, g=1.0):
    n = int(d * SR); t = ar(n); f = mtof(m); s = np.zeros(n)
    for r, a, dc in ((1, 1, 2.6), (2.76, .5, 4.2), (5.4, .26, 6.5), (8.9, .12, 9)): s += a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * dc)
    return s * np.minimum(1, t / .001) * .3 * g
def glass(m, d=.5, g=1.0):   # campanita de cristal: parciales inarmónicos y un golpe de ruido
    n = int(d * SR); t = ar(n); f = mtof(m)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 7) + .5 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 13) + .25 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 20)
    s += hp(rng.standard_normal(n), 2000) * np.exp(-t * 300) * .3
    return s * .3 * g


# ——— materiales de efectos ———
def air(d, f0, f1, q=.35, g=1.0):   # aire: ruido por un paso de banda que se desliza de f0 a f1
    n = int(d * SR); t = ar(n); x = rng.standard_normal(n); out = np.zeros(n); seg = 1024
    for i in range(0, n, seg):
        p = i / n; fc = f0 * (f1 / f0) ** p
        out[i:i + seg] = bp(x[max(0, i - 2048):i + seg], fc * (1 - q), fc * (1 + q))[-len(x[i:i + seg]):]
    return lp(out, 5500) * np.sin(np.pi * t / d) ** 1.6 * 1.6 * g
def sub(f=52, d=.7, g=1.0):
    n = int(d * SR); t = ar(n); fr = f * (1 + 1.4 * np.exp(-t * 22))
    return np.tanh(np.sin(2 * np.pi * np.cumsum(fr) / SR) * 1.6) * np.exp(-t * 4.2) * np.minimum(1, t / .003) * g
def wood(f=900, d=.09, g=1.0):
    n = int(d * SR); t = ar(n); fr = f * (1 + .6 * np.exp(-t * 60))
    return (np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 55) + bp(rng.standard_normal(n), 2600, 5200) * np.exp(-t * 240) * .6) * .5 * g
def click(f=3400, d=.025, g=1.0): n = int(d * SR); t = ar(n); return bp(rng.standard_normal(n), f * .6, f * 1.6) * np.exp(-t * 180) * g
def bubble(f=500, d=.12, g=1.0):
    n = int(d * SR); t = ar(n); fr = f * (1 + 1.8 * t / d)
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.sin(np.pi * t / d) * .5 * g
def paper(d=.4, g=1.0):
    n = int(d * SR); t = ar(n); am = np.abs(np.sin(2 * np.pi * (11 + 5 * rng.random()) * t)) ** 2.5
    return bp(rng.standard_normal(n), 1600, 7500) * am * np.exp(-t * 4) * .45 * g
def riser(d, f0=300, f1=4000, g=1.0):
    n = int(d * SR); t = ar(n); u = t / d
    s = air(d, f0, f1, .3) * u ** 1.6 + .25 * np.sin(2 * np.pi * np.cumsum(180 * 4 ** u) / SR) * u ** 2
    return s * g
def impact(g=1.0, big=False):
    n = int(1.4 * SR); t = ar(n)
    s = sub(44 if big else 52, 1.4) * 1.0
    s[:int(.3 * SR)] += bp(rng.standard_normal(int(.3 * SR)), 900, 7000) * np.exp(-ar(int(.3 * SR)) * 22) * .55
    s[:int(.02 * SR)] += hp(rng.standard_normal(int(.02 * SR)), 3000) * .6
    return s * g


# ——— la sala del plató: una respuesta al impulso para todos los efectos ———
def room_ir(t60=1.0):
    n = int(t60 * 1.3 * SR); t = ar(n); r = np.random.default_rng(3); pre = int(.014 * SR)
    ir = np.stack([lp(hp(r.standard_normal(n), 180), 7000) * np.exp(-t * 6.91 / t60) for _ in range(2)])
    ir = np.concatenate([np.zeros((2, pre)), ir[:, :n - pre]], 1)
    for dt, a, p in ((.019, .5, .35), (.031, .38, -.4), (.047, .26, .15), (.063, .18, -.1)):
        k = int(dt * SR); ir[0, k] += a * np.sqrt(.5 * (1 - p)); ir[1, k] += a * np.sqrt(.5 * (1 + p))
    return ir / np.sqrt((ir ** 2).sum() / 2)

bt = lambda b, k=0: b * BAR + k * BEAT
EM, CM, GM, DM = [64, 67, 71], [64, 67, 72], [62, 67, 71], [62, 66, 69]
ROOT = {id(EM): 40, id(CM): 36, id(GM): 43, id(DM): 38}
KICKS = []
END = T('logo')
nb = int(END // BAR) + 1
for b in range(nb):
    ch = [EM, CM, GM, DM][b % 4]; r = ROOT[id(ch)]
    for k in range(4):
        if bt(b, k) < END - .05: put(MUS, kick(1.0), bt(b, k)); KICKS.append(bt(b, k))
        if k in (1, 3) and bt(b, k) < END: put(MUS, clap(.8), bt(b, k), 1, .05)
    for k in range(8):
        if bt(b, k / 2) < END: put(MUS, hat(False, .5 if k % 2 else .3), bt(b, k / 2), 1, .2)
        if (k % 2 or k == 0) and bt(b, k / 2) < END: put(MUS, bass(r + (12 if k in (3, 7) else 0), BEAT / 2 * .95, .8), bt(b, k / 2))
    put(MUS, pad(ch, min(BAR, max(.1, END - bt(b))), 2600, .7), bt(b))
# el cierre: sol mayor, campanas, y el pulso vuelve al final para el bucle
put(MUS, pad([55, 62, 67, 71, 74], 2.6, 2800, .9, a=.01, r=1.2), END); put(MUS, bass(43, 1.2, .9), END); put(MUS, kick(1.1), END); KICKS.append(END)
put(MUS, bell(79, 2.4, .9), END, 1, -.2); put(MUS, bell(83, 2.4, .6), END + .02, 1, .2)
put(MUS, riser(DUR - T('loop'), 300, 3000, .5), T('loop'))
pump = np.ones(N)
for k in KICKS:
    i = int(k * SR); m = min(N - i, int(.35 * SR)); pump[i:i + m] = np.minimum(pump[i:i + m], 1 - .45 * np.exp(-ar(m) / .09))
MUS *= pump
SCALE = [64, 67, 69, 71, 74, 76, 79, 81, 83, 86]
for e in EV:
    if e['type'] == 'tick':
        k = e['k']; m = SCALE[k % 10] + 12 * (k // 10 > 1)
        put(SFX, click(3600, .02, 1.0), e['t'], .35, .1); put(SFX, pluck(m, .2, .6, 5200), e['t'], .35, -.1 + .2 * (k % 2))
    elif e['type'] == 'logo': put(SFX, impact(1.0, True), e['t'], .7); put(SFX, glass(91, 1.4), e['t'] + .02, .45, .2)
SFX += .25 * np.stack([fftconvolve(SFX[c], room_ir(.8)[c])[:N] for c in range(2)])
# ——— mezcla ———
def loud(x):
    import re, subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        sf.write(f.name, x.T.astype(np.float32), SR)
        o = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", f.name, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", o)[-1]), float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", o)[-1])
def limit(x, red_db):
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    a = np.abs(x).max(0) + 1e-9; ceil = a.max() * 10 ** (-red_db / 20); g0 = np.minimum(1, ceil / a)
    g = uniform_filter1d(minimum_filter1d(g0, size=int(.012 * SR)), size=int(.006 * SR))
    return x * np.minimum(g, minimum_filter1d(g0, size=3))
def tp_limit(x, ceil_db=-1.0, look=.003, rel=.09):
    """Limitador de pico verdadero: trabaja a 4× para ver los picos entre muestras, se adelanta 3 ms al pico y suelta
    despacio (90 ms), así no aplasta los golpes ni deja clics."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    up = resample_poly(x, 4, 1, axis=1); c = 10 ** (ceil_db / 20)
    g0 = np.minimum(1, c / (np.abs(up).max(0) + 1e-12)); L = int(look * SR * 4)
    g1 = minimum_filter1d(g0, size=2 * L + 1)
    a = np.exp(-1 / (rel * SR * 4)); gr = lfilter([1 - a], [1, -a], 1 - g1)
    g = uniform_filter1d(np.minimum(g1, 1 - gr), size=L)
    y = resample_poly(up * np.minimum(g, g1 ** .5 * g ** .5), 1, 4, axis=1)
    return np.tanh(y / c * 1.0) * c   # lo que aún asome se redondea, no se corta
def rms_db(x):
    on = np.abs(x).max(0) > 1e-3; return 10 * np.log10((x[:, on] ** 2).mean() + 1e-12)


# los efectos por delante de la música: la música queda 4 dB por debajo en nivel medio y se aparta 4 dB más cuando
# suena un efecto (ventana de 0,25 s alrededor de cada uno)
from scipy.ndimage import maximum_filter1d, uniform_filter1d
S = limit(SFX, 6); M = limit(MUS, 4)
M = M * 10 ** ((rms_db(S) - 4 - rms_db(M)) / 20)
k = maximum_filter1d((np.abs(S).max(0) > np.abs(S).max() * .08).astype(float), size=int(.25 * SR))
k = uniform_filter1d(k, size=int(.05 * SR))
M = M * (1 - (1 - 10 ** (-3 / 20)) * k)
mix = hp((S + M)[:, :int(DUR * SR)], 28)
if os.environ.get("MIX_DIAG"):   # dónde están los picos y cuánto pesa cada bus
    pk = np.abs(mix).max(0); w = int(.05 * SR); nw = len(pk) // w; P = pk[:nw * w].reshape(nw, w).max(1)
    top = np.argsort(P)[::-1][:12]; print("picos:", ", ".join(f"{i * .05:.2f}s {20 * np.log10(P[i] / P.max()):.1f}" for i in sorted(top)))
    print(f"rms efectos {rms_db(S):.1f} dB, música {rms_db(M):.1f} dB, mezcla {rms_db(mix):.1f} dB, pico {20 * np.log10(np.abs(mix).max()):.1f} dB")
fade = np.ones(mix.shape[1]); n = int(1.2 * SR); fade[-n:] = np.linspace(1, 0, n) ** 2; mix *= fade
mix = mix / np.abs(mix).max() * .95
if os.environ.get("MIX_STEMS"):
    for name, x in (("efectos", S), ("musica", M)): sf.write(os.path.join(HERE, "out", f"stem_{name}.wav"), x[:, :int(DUR * SR)].T.astype(np.float32), SR)
# se empuja contra el limitador hasta que la relación pico/sonoridad baja de 11,3 dB (a −14 LUFS el pico queda por
# debajo de −2,7 dBTP antes de codificar)
drive = 0.0
for it in range(8):
    y = tp_limit(mix * 10 ** (drive / 20))
    I, TP = loud(y)
    print(f"  pasada {it}: empuje {drive:.1f} dB → I {I:.1f} LUFS, pico {TP:.1f} dBTP, PLR {TP - I:.1f} dB")
    if TP - I <= 11.3: break   # un dB más de margen que el habitual: el AAC levanta los transitorios agudos
    drive += max(.5, (TP - I) - 11.0)
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
sf.write(os.path.join(HERE, "out", "mix.wav"), y.T.astype(np.float32), SR)
print("mix", DUR, "s")
