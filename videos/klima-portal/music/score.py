"""Partitura sintetizada de «El portal del martes» (sin muestras): sale de la misma línea de tiempo que la imagen.
A  0–15,75 s   el bar: theremin en la menor, bajo analógico, arpegio de onda cuadrada y caja de ritmos, 132 BPM.
B  16,15–19,5  el trimestre: trémolo de cuerdas de pánico y arpegio medio tono arriba; corte seco con su cola.
   19,5–23,4   silencio (solo el ambiente del mix).
C  23,4–34,15  el mundo normal: bossa de ascensor, 104 BPM, guitarra de nailon Karplus–Strong y vibráfono.
D  34,15–36,7  el técnico: tuba de umpa y silbato de émbolo; corte antes de «Ya no».
E  38,45–46    el cartel: el tema del theremin en re mayor y acorde final.
Uso: python music/score.py  →  music/score.wav (48 kHz, estéreo)"""
import json
import os

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
EV = json.load(open(os.path.join(HERE, "..", "events.json")))
DUR = EV["dur"]
META = next(e for e in EV["ev"] if e["type"] == "meta")
OFF, FZ = META["off"], META["fz"]
SHIFT = OFF          # todo lo de la historia se escribe en tiempo de historia y suena desplazado por el gancho
N = int(DUR * SR) + SR
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(11)


def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(d): return np.arange(int(d * SR)) / SR
def lp(x, f, o=2): return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], "band", fs=SR, output="sos"), x)


def add(x, t0, g=1.0, pan=0.0, t1=None):
    t0 += SHIFT
    if t1 is not None: t1 += SHIFT
    i = int(t0 * SR)
    if t1 is not None: x = x[: max(0, int((t1 - t0) * SR))]
    j = min(N, i + len(x))
    if j <= i: return
    x = x[: j - i] * g
    L[i:j] += x * np.sqrt(.5 * (1 - pan)); R[i:j] += x * np.sqrt(.5 * (1 + pan))


def env(n, a=.005, r=.08):
    e = np.ones(n); ia = max(1, int(a * SR)); ir = max(1, min(n, int(r * SR)))
    e[:ia] = np.linspace(0, 1, ia); e[-ir:] *= np.linspace(1, 0, ir); return e


# —— instrumentos ——
def theremin(notes, t0, step, g=.11, pan=0.0, t1=None):
    """notes: lista de (midi|None, duración en pasos). Legato con portamento de 70 ms y vibrato que entra a los 150 ms."""
    seq, t = [], 0.0
    for m, d in notes: seq.append((t, m, d * step)); t += d * step
    n = int(t * SR) + int(.3 * SR); f = np.zeros(n); a = np.zeros(n); since = np.zeros(n)
    prev = None
    for (s, m, d) in seq:
        i, j = int(s * SR), int((s + d) * SR)
        if m is None: prev = None; continue
        f0 = hz(m); fp = hz(prev) if prev else f0
        k = np.arange(j - i) / SR
        f[i:j] = f0 + (fp - f0) * np.exp(-k / .025)
        a[i:j] = 1; since[i:j] = k; prev = m
    a = lp(a, 18)
    vib = 1 + .012 * np.sin(2 * np.pi * 5.6 * np.arange(n) / SR) * np.clip((since - .15) / .25, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    x = (np.sin(ph) + .18 * np.sin(2 * ph) + .08 * np.sin(3 * ph)) * a
    # reverb de muelle sencilla
    out = x.copy()
    for dly, gg in ((.031, .35), (.047, .28), (.073, .2), (.11, .14)): d_ = int(dly * SR); out[d_:] += x[:-d_] * gg
    add(out, t0, g, pan, t1)


def bass(m, t0, d, g=.2, t1=None):
    x = tt(d); f = hz(m); ph = 2 * np.pi * f * x
    s = (2 * ((f * x) % 1) - 1) * .5 + np.sin(ph) + .35 * np.sin(2 * ph) + .2 * np.sin(3 * ph)
    add(lp(s, 900) * env(len(x), .004, .06) * np.exp(-x * 1.4), t0, g, 0, t1)


def sq(m, t0, d, g=.035, pan=0.0, t1=None):
    x = tt(d); s = np.sign(np.sin(2 * np.pi * hz(m) * x))
    add(lp(s, 3500) * env(len(x), .002, .03) * np.exp(-x * 9), t0, g, pan, t1)


def kick(t0, g=.5, t1=None):
    x = tt(.4); f = 45 + 90 * np.exp(-x * 30)
    add(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 9), t0, g, 0, t1)


def snare(t0, g=.18, t1=None):
    x = tt(.2); s = bp(rng.standard_normal(len(x)), 1500, 7000) * np.exp(-x * 22) + np.sin(2 * np.pi * 185 * x) * np.exp(-x * 30) * .5
    add(s, t0, g, 0, t1)


def hat(t0, g=.05, pan=.2, t1=None):
    x = tt(.05); s = bp(rng.standard_normal(len(x)), 7000, 12000) + .3 * np.sin(2 * np.pi * 9100 * x + 3 * np.sin(2 * np.pi * 2300 * x))
    add(s * np.exp(-x * 80), t0, g, pan, t1)


def strings(ms, t0, d, g=.06, t1=None):
    x = tt(d); s = np.zeros(len(x))
    for m in ms:
        for det in (-.004, 0, .005): s += 2 * ((hz(m) * (1 + det) * x) % 1) - 1
    trem = .55 + .45 * np.sin(2 * np.pi * 9 * x)
    add(lp(s, 3000) * trem * env(len(x), .05, .1) / len(ms), t0, g, 0, t1)


def nylon(m, t0, g=.12, pan=0.0, d=1.2, t1=None):
    """Karplus–Strong: cuerda pulsada de nailon."""
    f = hz(m); n = int(d * SR); p = max(2, int(SR / f)); buf = rng.uniform(-1, 1, p); out = np.zeros(n)
    buf = lp(buf, 3000) if p > 20 else buf
    for i in range(n):
        out[i] = buf[i % p]; buf[i % p] = .4985 * (buf[i % p] + buf[(i + 1) % p])
    add(lp(out, 4000) * env(n, .001, .1), t0, g, pan, t1)


def vibes(m, t0, d=1.0, g=.06, pan=0.0, t1=None):
    x = tt(d); f = hz(m)
    s = (np.sin(2 * np.pi * f * x) + .25 * np.sin(2 * np.pi * f * 4 * x) * np.exp(-x * 8)) * np.exp(-x * 2.2) * (1 + .25 * np.sin(2 * np.pi * 6 * x))
    add(s * env(len(x), .002, .1), t0, g, pan, t1)


def tuba(m, t0, d, g=.16, t1=None):
    x = tt(d); f = hz(m); s = 2 * ((f * x) % 1) - 1
    add(lp(s, 600) * env(len(x), .02, .06) * (1 - .3 * x / d), t0, g, 0, t1)


def slide_whistle(t0, d=.6, up=True, g=.06):
    x = tt(d); f = np.linspace(700, 1800, len(x)) if up else np.linspace(1800, 700, len(x))
    add(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), .02, .1), t0, g, .2)


# —— A: el bar (132 BPM, la menor) ——
B = 60 / 132; A_END = 15.75
prog = [45, 45, 41, 41, 43, 43, 40, 40]          # La, La, Fa, Fa, Sol, Sol, Mi, Mi (graves)
arp = {45: [57, 60, 64, 69], 41: [53, 57, 60, 65], 43: [55, 59, 62, 67], 40: [52, 56, 59, 64]}
t = 0.0; bar = 0
while t < A_END - .01:
    root = prog[bar % 8]
    for k in range(4):
        tb = t + k * B
        if tb >= A_END: break
        bass(root, tb, B * .9, .2, A_END);
        if k in (0, 2): kick(tb, .42, A_END)
        if k in (1, 3): snare(tb, .14, A_END)
        hat(tb + B / 2, .04, .25, A_END)
        for j in range(4): sq(arp[root][(k * 4 + j) % 4] + 12, tb + j * B / 4, B / 4, .022, -.3 if j % 2 else .3, A_END)
    t += 4 * B; bar += 1
# tema del theremin (entra cuando Paco tira de la palanca: el portal tiene voz)
temaA = [(76, 2), (77, 1), (76, 1), (75, 2), (76, 2), (71, 2), (72, 2), (69, 4), (None, 2),
         (76, 2), (77, 1), (79, 1), (77, 2), (76, 2), (74, 2), (72, 2), (71, 4), (None, 2),
         (69, 2), (72, 2), (76, 2), (75, 2), (74, 2), (72, 1), (71, 1), (69, 6)]
theremin(temaA, 5.75, B / 2, .1, -.1, A_END)

# —— B: el trimestre (pánico) ——
B2_0, B2_1 = 16.15, 19.5
strings([58, 61, 65], B2_0, B2_1 - B2_0 + .1, .07, B2_1)
t = B2_0
while t < B2_1 - .01:
    kick(t, .38, B2_1); hat(t + B / 4, .05, .2, B2_1); hat(t + 3 * B / 4, .05, -.2, B2_1)
    for j in range(4): sq([70, 73, 77, 82][j], t + j * B / 4, B / 4, .024, .3 if j % 2 else -.3, B2_1)
    bass(46, t, B * .9, .2, B2_1)
    t += B

# —— C: el mundo normal (bossa, 104 BPM, re mayor) ——
C0, C1 = 23.4, 34.15; BC = 60 / 104
chords = [(50, [62, 66, 69, 73]), (47, [59, 62, 66, 69]), (52, [64, 67, 71, 74]), (45, [61, 64, 67, 69])]   # Dmaj7 Bm7 Em7 A7
t = C0; bar = 0
while t < C1 - .01:
    root, ch = chords[bar % 4]
    for (off, m, gg) in ((0, root, .2), (1.5 * BC, root + 7, .14), (2 * BC, root, .16), (3.5 * BC, root + 7, .12)):
        if t + off < C1: bass(m, t + off, BC * .8, gg, C1)
    for off in (0, .75 * BC, 1.5 * BC, 2.5 * BC, 3.25 * BC):           # rasgueo de bossa
        if t + off < C1:
            for i, m in enumerate(ch): nylon(m, t + off + i * .008, .045, -.2 + i * .1, 1.0, C1)
    for k in range(8): hat(t + k * BC / 2, .022 if k % 2 else .03, .1, C1)
    t += 4 * BC; bar += 1
vib_mel = [(74, 0), (76, .5), (78, 1), (81, 2), (78, 3), (76, 4), (74, 6), (73, 7), (76, 8), (74, 10), (71, 11), (69, 12), (74, 14), (78, 15), (76, 16), (74, 18)]
for m, b in vib_mel:
    tb = C0 + 4 * BC + b * BC
    if tb < C1 - .2: vibes(m, tb, 1.2, .05, .25, C1)

# —— D: el técnico (tuba y silbato), corte en 36,7 ——
D0, D1 = 34.15, 36.7
t = D0; k = 0
while t < D1 - .01:
    tuba([38, 45][k % 2], t, BC * .45, .17, D1)
    for m in (62, 66, 69): nylon(m, t + BC / 2, .03, .2, .5, D1)
    t += BC; k += 1
slide_whistle(34.38, .45, True)

# —— E: el cartel (re mayor) ——
E0 = 38.45; BE = 60 / 104
temaE = [(74, 2), (78, 1), (81, 1), (83, 2), (81, 2), (78, 2), (79, 2), (81, 4), (None, 1),
         (78, 2), (76, 1), (74, 1), (76, 2), (78, 2), (74, 6)]
theremin(temaE, E0 + .1, BE / 2, .1, 0, DUR - OFF)
t = E0; bar = 0
for root, ch in [(50, [62, 66, 69]), (47, [59, 62, 66]), (43, [55, 59, 62]), (45, [57, 61, 64]), (50, [62, 66, 69]), (47, [59, 62, 66]), (43, [55, 59, 62]), (45, [57, 61, 64])]:
    if t > DUR - OFF - 2.2: break
    bass(root, t, 4 * BE * .9, .18)
    for j in range(8): sq(ch[j % 3] + 12, t + j * BE / 2, BE / 2, .018, -.3 if j % 2 else .3)
    kick(t, .32); kick(t + 2 * BE, .28); snare(t + BE, .1); snare(t + 3 * BE, .1)
    t += 4 * BE; bar += 1
# acorde final que se apaga (re mayor; el bajo en Re2, no más grave)
tf = DUR - OFF - 2.3
for m in (50, 62, 66, 69, 74): vibes(m, tf, 2.3, .05)
bass(50, tf, 2.2, .18)

# —— gancho (tiempo de pantalla): el caos a todo volumen y corte seco en el disco rayado ——
SHIFT = 0.0
strings([59, 62, 66], 0, FZ, .08, FZ)
t = 0.0
while t < FZ - .01:
    kick(t, .42, FZ); hat(t + B / 4, .05, .2, FZ); hat(t + 3 * B / 4, .05, -.2, FZ)
    for j in range(4): sq([71, 74, 78, 83][j], t + j * B / 4, B / 4, .026, .3 if j % 2 else -.3, FZ)
    bass(47, t, B * .9, .22, FZ)
    t += B
# bajo de puntillas mientras Paco habla a cámara (sitcom: un pizzicato que se queda)
for k, m in enumerate([57, 60, 64, 63, 62]): nylon(m, FZ + .9 + k * .55, .05, .1, 1.0, 6.4)

mix = np.stack([L, R])[:, : int(DUR * SR)]
mix /= np.abs(mix).max() + 1e-9
sf.write(os.path.join(HERE, "score.wav"), (mix * .9).T.astype(np.float32), SR)
print("score ok", mix.shape[1] / SR)
