"""Sonido de «¿Cuántas te pasan?»: pista electrónica sintetizada (120 BPM, mi menor que acaba en sol mayor) y efectos
propios de pocos materiales (papel, madera, cristal, golpe grave, aire), todos en la misma sala. Cada capítulo es una
vuelta de acordes (mi menor, do, sol, re) y las cinco tarjetas que giran tocan un arpegio que sube: es el sonido de
«resuelto». Los efectos se colocan desde events.json (la imagen manda): si un golpe se mueve, su sonido se va con él.
Escribe out/mix.wav (48 kHz, estéreo); el −14 LUFS lo hace mux_local.sh.
Uso: python mix.py"""
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


# ——— materiales propios de este vídeo ———
def rip(d=.55, g=1.0):   # papel que se rasga: crepitar irregular que se acelera, sobre un cuerpo de ruido que se apaga
    n = int(d * SR); t = ar(n); x = np.zeros(n); tt = 0.0
    while tt < d * .8:
        i = int(tt * SR); m = min(int(.012 * SR), n - i)
        x[i:i + m] += bp(rng.standard_normal(m), 1500, 9000) * np.exp(-ar(m) * 300) * rng.uniform(.4, 1)
        tt += .003 + .011 * rng.random() * (1 + tt / d)
    body = bp(rng.standard_normal(n), 700, 6000) * np.exp(-t * 5) * .5
    return (x + body) * np.minimum(1, t / .01) * .7 * g
def shutter(g=1.0):   # obturador: dos clics mecánicos y un roce
    n = int(.16 * SR); x = bp(rng.standard_normal(n), 1200, 5000) * np.exp(-ar(n) * 40) * .25
    c = click(2800, .02, 1.6); x[:len(c)] += c
    c = click(2200, .025, 1.3); i = int(.07 * SR); x[i:i + len(c)] += c
    return x * g
def beep(f=2850, d=.13, g=1.0):   # el pitido del lector del TPV
    n = int(d * SR); t = ar(n)
    return np.sin(2 * np.pi * f * t) * np.minimum(1, t / .004) * np.minimum(1, (d - t) / .01) * .35 * g
def clack(g=1.0):   # una ficha del contador que cae: clac seco y un rebote
    y = np.zeros(int(.06 * SR)); c = click(3200, .02, 1.3); y[:len(c)] += c; c = click(2400, .015, .5); i = int(.028 * SR); y[i:i + len(c)] += c
    return y * g
def sweep(d, f0, f1, g=1.0):   # barrido electrónico: un seno que sube con un zumbido debajo
    n = int(d * SR); t = ar(n); f = f0 * (f1 / f0) ** (t / d)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * .5 + .25 * np.sin(2 * np.pi * 110 * t) * np.sign(np.sin(2 * np.pi * 55 * t))
    return lp(s, 6000) * np.sin(np.pi * t / d) ** .7 * .3 * g


# ——— la partitura ———
bt = lambda bar, beat=0: BAR0 + bar * BAR + beat * BEAT     # compás (desde 0 en 0,5 s) y tiempo dentro del compás
EM, CM, GM, DM = [64, 67, 71], [64, 67, 72], [62, 67, 71], [62, 66, 69]
ROOT = {id(EM): 40, id(CM): 36, id(GM): 43, id(DM): 38}
CYCLE = [EM, CM, GM, DM]          # cada capítulo es una vuelta: empieza en mi menor cuando llega la cámara
FINAL = 26                        # compás 26: el tablero entero, quieto
KICKS = []


def bar_chord(b): return CYCLE[(b - 2) % 4] if b < FINAL else GM


def groove(b0, b1, *, four=True, clapon=True, hats=True, openh=True, bassline=True, stabs=False, plucks=True, padg=.7, cut=2600, lvl=1.0):
    for b in range(b0, b1):
        ch = bar_chord(b); root = ROOT[id(ch)]
        for k in range(4):
            if four or k in (0, 2): put(MUS, kick(lvl), bt(b, k)); KICKS.append(bt(b, k))
            if clapon and k in (1, 3): put(MUS, clap(.8 * lvl), bt(b, k), 1, .05)
        if hats:
            for k in range(8): put(MUS, hat(False, (.55 if k % 2 else .3) * lvl), bt(b, k / 2), 1, .25 if k % 2 else -.2)
        if openh:
            for k in range(4): put(MUS, hat(True, .4 * lvl), bt(b, k + .5), 1, .2)
        if bassline:
            for k in range(8):
                if k % 2 == 1 or k == 0: put(MUS, bass(root + (12 if k in (3, 7) else 0), BEAT / 2 * .95, .8 * lvl), bt(b, k / 2))
        put(MUS, pad(ch, BAR, cut, padg * lvl), bt(b), 1, 0)
        if stabs:
            for k in (0, 1.5, 3):
                put(MUS, pad([m + 12 for m in ch], .16, 3800, .45 * lvl, a=.004, r=.12), bt(b, k), 1, -.15)
        if plucks:
            motif = [ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12]
            for k, m in enumerate(motif):
                if k in (0, 3, 5, 6): put(MUS, pluck(m, .24, .45 * lvl), bt(b, k / 2), 1, -.3 if k % 2 else .3)


# anacrusa: subida hacia el golpe
put(MUS, riser(BAR0, 200, 3500, .8), 0)
# compases 0–1: el gancho, a medio tiempo y con el filtro cerrado (sol – re, que empuja hacia el mi menor del capítulo 1)
groove(0, 2, four=False, clapon=False, openh=False, plucks=False, padg=.6, cut=1300, lvl=.85)
for b in (0, 1): put(MUS, snare(.55), bt(b, 2), 1, .05)
for k in range(6): put(MUS, snare(.18 + .55 * k / 6), bt(1, 2.5 + k * .25), 1, (-1) ** k * .1)
# capítulos: cada uno añade algo; Errores entra con la música rota y Día a día sube hasta el tablero
groove(2, 6, plucks=False, padg=.7, cut=2400)                        # Cobrar
groove(6, 10, plucks=True, padg=.7, cut=2700)                        # Hacienda
groove(10, 14, plucks=True, stabs=True, padg=.7, cut=2900)           # Papeleo
groove(14, 18, plucks=True, padg=.75, cut=3000)                      # Errores
groove(18, 22, plucks=True, stabs=True, padg=.75, cut=3200)          # Gestoría
for b in range(18, 22):   # una segunda voz de campana en Gestoría
    for k, m in enumerate([bar_chord(b)[2] + 24, bar_chord(b)[1] + 24]): put(MUS, bell(m, 1.0, .35), bt(b, 1 + 2 * k), 1, .35)
groove(22, 25, plucks=True, stabs=True, padg=.8, cut=3400)           # Día a día
groove(25, 26, plucks=False, stabs=False, openh=False, padg=.6, cut=1800, lvl=.9)
for k in range(16): put(MUS, snare(.1 + .65 * (k / 16) ** 1.5), bt(25, k / 4), 1, (-1) ** k * .1)
put(MUS, riser(1.9, 250, 7000, .8), bt(25, .2))
# compás 26: el tablero entero, quieto: casi nada (un pad grave)
put(MUS, pad([52, 59, 64], BAR, 700, .3, a=.3, r=.8), bt(26), 1, 0)
# compás 27: el enjambre: la tensión sube (do – re) con un redoble
put(MUS, pad(CM, BAR / 2, 1600, .5, a=.08), bt(27)); put(MUS, pad(DM, BAR / 2, 2200, .6, a=.05), bt(27, 2))
put(MUS, bass(36, BAR / 2 - .05, .7), bt(27)); put(MUS, bass(38, BAR / 2 - .1, .8), bt(27, 2))
for k in range(16): put(MUS, snare(.12 + .6 * (k / 16) ** 1.3), bt(27, k / 4), 1, (-1) ** k * .12)
# compás 28: el logo: sol mayor, por fin; campanas
groove(28, 29, stabs=True, plucks=True, padg=.9, cut=3600)
put(MUS, bell(79, 2.6, 1.0), bt(28), 1, -.2); put(MUS, bell(83, 2.6, .7), bt(28), 1, .2); put(MUS, bell(86, 2.6, .5), bt(28, .02), 1, 0)
groove(29, 30, stabs=False, plucks=True, padg=.75, cut=3000, lvl=.8, openh=False)
put(MUS, pad([55, 62, 67, 71, 74], 3.0, 2600, .9, a=.01, r=1.6), bt(30)); put(MUS, bass(43, 1.4, .9), bt(30)); put(MUS, kick(1.0), bt(30)); KICKS.append(bt(30))
put(MUS, bell(91, 3.0, .6), bt(30), 1, .25)

# Errores: la música llega rota (troceada y con menos bits) mientras dura el fallo de señal
ge = EVT["glitch"][0]; i0, i1 = int(ge["t"] * SR), int(ge["t1"] * SR); tm = ar(i1 - i0)
chop = (np.sin(2 * np.pi * 16 * tm) > -.2).astype(float)
MUS[:, i0:i1] = np.round(MUS[:, i0:i1] * 12) / 12 * chop
# silencios: el tablero quieto (queda el pad muy bajo) y un hueco justo antes del logo
gate = np.ones(N); tt = ar(N)
def quiet(a, b, lvl=0.0):
    m = (tt >= a) & (tt < b); gate[m] = np.minimum(gate[m], lvl)
quiet(bt(26) + .05, bt(27) - .02, .55)
quiet(T('logo') - .14, T('logo') - .01, .05)
gate = np.convolve(gate, np.ones(int(.02 * SR)) / int(.02 * SR), "same")
MUS *= gate
# bombeo del pad y el bajo con el bombo
pump = np.ones(N)
for k in KICKS:
    i = int(k * SR); m = min(N - i, int(.35 * SR)); pump[i:i + m] = np.minimum(pump[i:i + m], 1 - .45 * np.exp(-ar(m) / .09))
MUS *= pump


# ——— efectos, desde los eventos ———
NOTE = [71, 72, 76, 79, 84]   # el arpegio de «resuelto»: si, do, mi, sol, do
SENDS = {'hit': .3, 'stamp': .32, 'seal': .35, 'whoosh': .4, 'flip': .35, 'snap': .2, 'count': .1, 'land': .2, 'tear': .3,
         'thirty': .45, 'tile': .25, 'close': .3, 'logo': .35, 'snapok': .3, 'pop': .4, 'sheet': .3, 'shutter': .2, 'beep': .25}
for e in EV:
    ty, t0 = e["type"], e["t"]; SEND[0] = SENDS.get(ty, .2); pan = e.get("pan", 0)
    if ty == 'rain':   # las 30 tarjetas cayendo: un revuelo de papel que se espesa hasta el golpe
        d = e["t1"] - t0
        for k in range(46):
            u = rng.random() ** .7; put(SFX, paper(rng.uniform(.08, .2), rng.uniform(.3, .8)), t0 + u * d * .8, .32, rng.uniform(-.8, .8))
        put(SFX, air(.7, 2600, 700, .45, .7), t0, .3)
    elif ty == 'land': put(SFX, paper(.07, 1.0), t0, .3, pan); put(SFX, wood(rng.uniform(520, 760), .05, .8), t0, .22, pan)
    elif ty == 'hit': put(SFX, impact(1.0, True), t0, .7); put(SFX, wood(700, .12, 1.2), t0, .5); put(SFX, paper(.5, 1.2), t0 + .02, .5, -.15)
    elif ty == 'counter': put(SFX, clack(1.0), t0, .5); put(SFX, glass(88, .35), t0 + .02, .3, .1)
    elif ty == 'whoosh':
        d = max(.22, e["d"]) + .1; f0, f1 = (400, 3800) if e.get("up") else (3000, 380)
        put(SFX, air(d, f0, f1, .4, 1.0), t0 - .04, .5 if e.get("big") else .34, pan)
    elif ty == 'snap': put(SFX, wood(900 + 90 * e["i"], .06, .9), t0, .3, pan); put(SFX, paper(.06, .8), t0, .2, pan)
    elif ty == 'flip':   # papel que gira y la nota del arpegio
        put(SFX, paper(.16, 1.0), t0, .42, pan); put(SFX, air(.2, 900, 3200, .4, .6), t0, .18, pan)
        m = NOTE[e["i"]]; put(SFX, bell(m + 12, 1.1, .8), t0 + .1, .5, -.2 + .1 * e["i"]); put(SFX, pluck(m, .3, .7, 5200), t0 + .1, .45, .1)
    elif ty == 'count': put(SFX, clack(.8), t0, .3, .05)
    elif ty == 'stamp': put(SFX, impact(.8), t0, .55); put(SFX, wood(420, .16, 1.4), t0, .7); put(SFX, paper(.35), t0 + .01, .5)
    elif ty == 'seal': put(SFX, impact(.9), t0, .6); put(SFX, wood(300, .2, 1.4), t0, .6); put(SFX, glass(83, 1.2, 1.0), t0 + .02, .5, .2)
    elif ty == 'shutter': put(SFX, shutter(1.0), t0, .8, .1)
    elif ty == 'sheet': put(SFX, air(.42, 700, 2600, .4, .9), t0, .38, [-.6, .6, -.4][e["n"]])
    elif ty == 'pop': put(SFX, bubble(520, .12, 1.0), t0, .5, .2); put(SFX, glass(91, .45), t0 + .02, .35, .2)
    elif ty == 'glitch':
        n = int((e["t1"] - t0) * SR); tm = ar(n); z = np.round(rng.standard_normal(n) * 3) / 3 * (np.sign(np.sin(2 * np.pi * 37 * tm)) > 0)
        z += .4 * np.sign(np.sin(2 * np.pi * 880 * tm)) * (np.sin(2 * np.pi * 23 * tm) > .3)
        put(SFX, bp(z, 400, 8000) * .3 * np.minimum(1, (tm[-1] - tm) / .05), t0, 1, .2)
    elif ty == 'scan': put(SFX, sweep(e["t1"] - t0, 500, 2600), t0, .6, 0); put(SFX, glass(88, .5), e["t1"] - .05, .35, .2)
    elif ty == 'balance': put(SFX, wood(300, .22, 1.2), t0, .45); put(SFX, air(.7, 1000, 600, .35, .6), t0 + .05, .25, -.4); put(SFX, air(.5, 700, 1000, .35, .5), t0 + .45, .2, .4)
    elif ty == 'snapok': put(SFX, wood(800, .1, 1.4), t0, .55); put(SFX, wood(1200, .08), t0 + .07, .4); put(SFX, glass(83, .7), t0 + .02, .45, .1)
    elif ty == 'beep': put(SFX, beep(2850, .13), t0, .55, .15)
    elif ty == 'tear': put(SFX, rip(.6, 1.0), t0 - .03, .75, .1); put(SFX, impact(.6), t0, .4); put(SFX, bell(88, 1.6, .9), t0 + .12, .5, -.1); put(SFX, bell(95, 1.4, .5), t0 + .16, .35, .2)
    elif ty == 'thirty': put(SFX, impact(1.0, True), t0, .6); put(SFX, glass(88, 1.8, 1.0), t0 + .02, .45, -.2); put(SFX, glass(95, 1.6, .8), t0 + .05, .35, .2)
    elif ty == 'swell':
        d = e["t1"] - t0; put(SFX, air(d, 300, 6000, .35, .9) * np.linspace(.2, 1, int(d * SR)) ** 2, t0, .4)
    elif ty == 'tile': put(SFX, click(rng.uniform(2400, 4800), .02, 1.0), t0, .3, rng.uniform(-.6, .6)); put(SFX, wood(rng.uniform(1300, 1900), .03, .7), t0, .16, 0)
    elif ty == 'close': put(SFX, wood(500, .14, 1.5), t0, .5); put(SFX, sub(70, .3, .7), t0, .4)
    elif ty == 'logo':
        put(SFX, impact(1.1, True), t0, .75); put(SFX, glass(91, 1.6, 1.0), t0 + .01, .5, .2); put(SFX, glass(95, 1.6, .8), t0 + .03, .4, -.2)
        put(SFX, air(.6, 5000, 800, .4), t0, .3)
    elif ty == 'word': put(SFX, air(.4, 600, 2600, .4), t0 - .05, .18)
    elif ty == 'tap': put(SFX, wood(1100 if e.get("soft") else 950, .07), t0, .4, .1); put(SFX, click(4200, .015), t0, .3, .1)
SEND[0] = 0.0
IR = room_ir(1.0)
SFX += np.stack([fftconvolve(WET[c], IR[c])[:N] for c in range(2)])
MUS += .18 * np.stack([fftconvolve(MUS[c], IR[c])[:N] for c in range(2)])


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


# la música lleva el ritmo de la lista: queda 1 dB por debajo de los efectos en nivel medio y se aparta 2,5 dB cuando
# suena un efecto (ventana de 0,25 s alrededor de cada uno)
from scipy.ndimage import maximum_filter1d, uniform_filter1d
S = limit(SFX, 6); M = limit(MUS, 4)
M = M * 10 ** ((rms_db(S) - 1 - rms_db(M)) / 20)
k = maximum_filter1d((np.abs(S).max(0) > np.abs(S).max() * .08).astype(float), size=int(.25 * SR))
k = uniform_filter1d(k, size=int(.05 * SR))
M = M * (1 - (1 - 10 ** (-2.5 / 20)) * k)
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
