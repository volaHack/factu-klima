"""Sonido de «La cadena»: pista electrónica sintetizada (120 BPM, re menor que acaba en fa mayor) y efectos propios de
pocos materiales (aire, madera, cristal, golpe grave, papel, tinta, cinta), todos en la misma sala. Los efectos se
colocan desde events.json (la imagen manda): si un golpe se mueve de sitio, su sonido se va con él.
Menos sonidos que golpes: la impresora es una ráfaga, no un clic por carácter; las 64 fichas, un solo traqueteo.
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


# ——— la partitura ———
bt = lambda bar, beat=0: BAR0 + bar * BAR + beat * BEAT     # compás (desde 0 en 0,5 s) y tiempo dentro del compás
DM, BB, FF, CC, GM = [62, 65, 69], [58, 62, 65], [57, 60, 65], [55, 60, 64], [55, 58, 62]
ROOT = {id(DM): 38, id(BB): 34, id(FF): 41, id(CC): 36, id(GM): 43}
# un acorde por compás: re menor hasta la rotura; fa mayor desde Verifactu; cadencia final
PROG = [DM, BB, DM, DM, BB, FF, FF, FF, CC, DM, BB, FF, CC, FF, BB, FF]
KICKS = []


def bar_chord(b): return PROG[b] if b < len(PROG) else FF


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
                put(MUS, pad([m + 12 for m in ch], .16, 3800, .5 * lvl, a=.004, r=.12), bt(b, k), 1, -.15)
        if plucks:
            motif = [ch[2] + 12, ch[1] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[2] + 12, ch[1] + 24]
            for k, m in enumerate(motif): put(MUS, pluck(m, .26, .55 * lvl), bt(b, k / 2), 1, -.3 if k % 2 else .3)


# anacrusa: subida hacia el golpe
put(MUS, riser(BAR0, 200, 3500, .8), 0)
# compases 0–1: el gancho, a medio tiempo y con el filtro cerrado; redoble al final del 1 hacia el sello
groove(0, 2, four=False, clapon=False, openh=False, stabs=False, padg=.55, cut=1200, lvl=.8)
for k in range(8): put(MUS, snare(.15 + .5 * k / 8), bt(1, 2 + k * .25))
# compás 2: tensión (el céntimo): solo pad, bajo sostenido y semicorcheas de charles que se aceleran; silencio antes del golpe
put(MUS, pad(DM, BAR, 900, .6, a=.2), bt(2)); put(MUS, bass(38, BAR - .25, .7), bt(2))
for k in range(16):
    if bt(2, k / 4) < T('tick') - .02: put(MUS, hat(False, .25 + .3 * k / 16), bt(2, k / 4), 1, .3 if k % 2 else -.3)
put(MUS, riser(1.2, 400, 6000, .7), bt(2, 1.2))
# compases 3–4: el golpe (la avalancha) y la cadena
groove(3, 5, stabs=True, padg=.8, cut=3200)
# compás 5: la rotura: ataques de bajo distorsionado con cada eslabón roto, parada de cinta y silencio
for e in EVT["snap"]:
    s = np.tanh(bass(38, .32, 1.0) * 3) * .8; put(MUS, s, e["t"]); put(MUS, kick(.9), e["t"])
put(MUS, pad([62, 63, 69], 2 * BEAT * 1.4, 1400, .45, a=.02), bt(5))
# compás 6: Verifactu (fa mayor, campana) y la pausa casi en silencio
put(MUS, pad(FF, 2.0, 2400, .55, a=.01, r=1.2), bt(6)); put(MUS, bell(77, 2.4, .9), bt(6), 1, .2); put(MUS, bass(41, 1.2, .8), bt(6))
put(MUS, pad([53, 57, 60, 65], 1.6, 700, .22, a=.4, r=.8), bt(6, 1))
# compases 7–10: las funciones, en mayor y más ligero
groove(7, 12, stabs=False, padg=.6, cut=3000, lvl=.9)
# compás 12: respiro y subida hacia el logo
put(MUS, pad(CC, BAR, 600, .25, a=.05), bt(12))
for k in range(12): put(MUS, snare(.1 + .7 * (k / 12) ** 2), bt(12, 1 + k * (3 / 12)), 1, (-1) ** k * .1)
put(MUS, riser(1.5, 250, 7000, .9), bt(12, 1))
# compases 13–14: el logo y el cierre; cadencia si♭ – fa y un acorde final que se queda
groove(13, 14, stabs=True, padg=.85, cut=3600)
put(MUS, bell(77, 2.6, 1.0), bt(13), 1, -.2); put(MUS, bell(84, 2.6, .6), bt(13), 1, .2)
groove(14, 15, stabs=False, padg=.7, cut=3000, lvl=.85, openh=False)
put(MUS, pad([53, 57, 60, 65, 69], 3.2, 2800, .9, a=.01, r=1.6), bt(15)); put(MUS, bass(41, 1.4, .9), bt(15)); put(MUS, kick(1.0), bt(15)); KICKS.append(bt(15))
put(MUS, bell(81, 3.0, .7), bt(15), 1, .25)

# silencios de la partitura: antes del golpe del céntimo, la parada de cinta y el rebobinado, la pausa de Verifactu
# (queda un pad muy bajo) y el respiro antes del logo
gate = np.ones(N); tt = ar(N)
def quiet(a, b, lvl=0.0, ramp=.03):
    m = (tt >= a) & (tt < b); gate[m] = np.minimum(gate[m], lvl)
quiet(T('tick') + .04, bt(3) - .01)
quiet(T('stop'), T('check', 0) - .02, 0)
quiet(bt(6, 1.6), bt(7) - .02, .35)
quiet(T('breath'), T('swell') + .05, .12)
gate = np.convolve(gate, np.ones(int(.02 * SR)) / int(.02 * SR), "same")
# parada de cinta: lo que suena justo antes de la rotura se ralentiza hasta pararse
i0 = int((T('stop') - .32) * SR); seg_ = MUS[:, i0:i0 + int(.32 * SR)].copy()
idx = np.cumsum(np.linspace(1, 0, seg_.shape[1]) ** 1.5) - 1   # la velocidad cae de 1 a 0: se lee cada vez más despacio
MUS[:, i0:i0 + seg_.shape[1]] = np.stack([np.interp(idx, np.arange(seg_.shape[1]), seg_[c]) for c in range(2)]) * np.linspace(1, .3, seg_.shape[1])
MUS *= gate
# bombeo del pad y el bajo con el bombo
pump = np.ones(N)
for k in KICKS:
    i = int(k * SR); m = min(N - i, int(.35 * SR)); pump[i:i + m] = np.minimum(pump[i:i + m], 1 - .45 * np.exp(-ar(m) / .09))
MUS *= pump


# ——— efectos, desde los eventos ———
SENDS = {'hit': .3, 'stamp': .32, 'whoosh': .4, 'lift': .35, 'link': .45, 'check': .45, 'snap': .3, 'crack': .25, 'glitch': .15,
         'tap': .12, 'coin': .4, 'flip': .3, 'row': .15, 'snapok': .3, 'odo': .15, 'logo': .35, 'comet': .35, 'feed': .15, 'buzz': .1}
for e in EV:
    ty, t0 = e["type"], e["t"]; SEND[0] = SENDS.get(ty, .2); pan = e.get("pan", 0)
    if ty == 'comet': put(SFX, air(.55, 500, 4200, .4, .5), t0, 1, .45)
    elif ty == 'hit': put(SFX, impact(1.0, True), t0, .7); put(SFX, wood(700, .12, 1.2), t0, .5); put(SFX, paper(.5, 1.2), t0 + .02, .6, -.15)
    elif ty == 'feed':   # el papel saliendo del cabezal: motor y papel
        d = e["t1"] - t0; n = int(d * SR); tm = ar(n)
        motor = (np.sin(2 * np.pi * 185 * tm) * .3 + bp(rng.standard_normal(n), 900, 3200) * (.5 + .5 * np.sin(2 * np.pi * 62 * tm))) * np.exp(-tm * 2.2) * np.minimum(1, tm / .02)
        put(SFX, motor * .45, t0, 1, .05)
    elif ty == 'buzz':   # la huella imprimiéndose: una ráfaga térmica, no un clic por carácter
        d = e["t1"] - t0; n = int(d * SR); tm = ar(n)
        z = bp(rng.standard_normal(n), 2200, 7000) * (.55 + .45 * np.sign(np.sin(2 * np.pi * 46 * tm))) * np.minimum(1, tm / .04) * np.minimum(1, (d - tm) / .06)
        put(SFX, bp(z, 3000, 6500) * .09, t0, 1, .1)
    elif ty == 'stamp':
        big = e.get("big", 1)
        put(SFX, impact(1.0 if big == 2 else .8, big == 2), t0, .7 if big == 2 else .55); put(SFX, wood(420, .16, 1.4), t0, .7); put(SFX, paper(.35), t0 + .01, .5)
        if big == 2: put(SFX, glass(86, 1.4, 1.0), t0 + .02, .6, .2)
    elif ty == 'whoosh':
        d = max(.22, e["d"]) + .1; f0, f1 = (400, 3800) if e.get("up") else (3000, 380)
        put(SFX, air(d, f0, f1, .4, 1.0), t0 - .04, .5 if e.get("big") else .32, pan)
    elif ty == 'lift': put(SFX, air(.5, 1200, 6000, .3, .6), t0, .4 if not e.get("soft") else .25, .1)
    elif ty == 'tick': put(SFX, wood(2400, .05, 1.0), t0, .7, .3); put(SFX, click(5200, .02), t0, .4, .3)
    elif ty == 'drop': put(SFX, impact(.9, True), t0, .5)
    elif ty == 'flaps':   # el traqueteo de las 64 fichas: una sola textura de clacs
        d = e["t1"] - t0; n = int(d * SR); x = np.zeros((2, n))
        for k in range(150):
            i = int(rng.random() ** 1.4 * (n - 1200)); c = click(rng.uniform(2200, 5200), .02, rng.uniform(.3, 1)) ; m = min(len(c), n - i)
            p = rng.uniform(-.8, .8); x[0, i:i + m] += c[:m] * np.sqrt(.5 * (1 - p)); x[1, i:i + m] += c[:m] * np.sqrt(.5 * (1 + p))
        put(SFX, x * np.linspace(1, .3, n), t0, .3)
    elif ty == 'link': put(SFX, glass([74, 77, 81, 86][e["n"]], .6), t0, .55, -.3 + .2 * e["n"])
    elif ty == 'pluck': put(SFX, bubble(420, .14, 1.0), t0, .7, .2); put(SFX, wood(1400, .05), t0, .4, .2)
    elif ty == 'glitch':
        n = int(.3 * SR); tm = ar(n); z = np.round(rng.standard_normal(n) * 3) / 3 * (np.sign(np.sin(2 * np.pi * 37 * tm)) > 0)
        z += .4 * np.sign(np.sin(2 * np.pi * 880 * tm)) * (np.sin(2 * np.pi * 23 * tm) > .3)
        put(SFX, bp(z, 400, 8000) * .35 * np.minimum(1, (.3 - tm) / .05), t0, 1, .2)
    elif ty == 'crack':
        n = int(.45 * SR); x = np.zeros(n)
        for k in range(40):
            i = int((k / 40) ** 1.6 * n * .8); c = hp(rng.standard_normal(200), 3500) * np.exp(-ar(200) * 900); x[i:i + 200] += c * rng.uniform(.3, 1)
        put(SFX, x * .6, t0, 1, .15); put(SFX, sub(70, .4, .5), t0, .4)
    elif ty == 'snap': put(SFX, glass(55 + e["n"] * 2, .3, 1.0), t0, .45, -.2); put(SFX, click(2600, .03, 1.5), t0, .7); put(SFX, sub(60, .4, .8), t0, .45)
    elif ty == 'stop':
        n = int(.35 * SR); tm = ar(n); f = 160 * np.linspace(1, .2, n); put(SFX, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.linspace(.5, 0, n) * .4, t0, 1)
    elif ty == 'rewind':
        d = e["t1"] - t0; n = int(d * SR); tm = ar(n); f = 900 + 2400 * (tm / d) ** 1.5 + 300 * np.sin(2 * np.pi * 9 * tm)
        sq = np.sin(2 * np.pi * np.cumsum(f) / SR) * .25 + bp(rng.standard_normal(n), 1500, 6000) * .5
        put(SFX, sq * np.sin(np.pi * tm / d) ** .8 * .5, t0, 1, -.1)
    elif ty == 'check': put(SFX, glass([77, 81, 84, 89, 93][e["n"]], .55), t0, .5, -.3 + .15 * e["n"])
    elif ty == 'implode': put(SFX, air(.25, 3000, 300, .4)[::-1], t0 - .05, .4)
    elif ty == 'tap': put(SFX, wood(1100 if e.get("soft") else 950, .07), t0, .55 if not e.get("soft") else .4, .1); put(SFX, click(4200, .015), t0, .3, .1)
    elif ty == 'sheet': put(SFX, air(.32, 700, 2400, .4), t0, .25, .05); put(SFX, air(.25, 2400, 600, .4), T('coin') - .1, .2, .05)
    elif ty == 'coin':   # el aviso de pago: dos notas de campana y un brillo de moneda
        put(SFX, bell(84, 1.2, .9), t0, .55, .15); put(SFX, bell(89, 1.4, .9), t0 + .12, .55, .2)
        put(SFX, hp(rng.standard_normal(int(.25 * SR)), 6000) * np.exp(-ar(int(.25 * SR)) * 16) * .25, t0 + .01, 1, .2)
    elif ty == 'flip': put(SFX, paper(.18), t0, .5, .1); put(SFX, glass(84, .4), t0 + .03, .35, .1)
    elif ty == 'chip': put(SFX, air(.3, 900, 4000, .35), t0, .3, .3); put(SFX, bubble(700, .1), t0 + .28, .35, .2)
    elif ty == 'row': put(SFX, wood(1600 + 200 * e["n"], .05), t0, .35, .2); put(SFX, click(3800, .02), t0, .25, .2)
    elif ty == 'snapok': put(SFX, wood(800, .1, 1.4), t0, .6); put(SFX, wood(1200, .08), t0 + .07, .45); put(SFX, glass(81, .7), t0 + .02, .45, .1)
    elif ty == 'drop2': put(SFX, bubble(380, .14), t0, .5, .1)
    elif ty == 'odo':
        d = e["t1"] - t0; k, tt0 = 0, t0
        while tt0 < t0 + d: put(SFX, click(3000, .018, .7), tt0, .45, .15); u = (tt0 - t0) / d; tt0 += .025 + .08 * u ** 2; k += 1
    elif ty == 'swell':
        d = e["t1"] - t0; put(SFX, air(d, 300, 6000, .35, .9) * np.linspace(.2, 1, int(d * SR)) ** 2, t0, .45)
    elif ty == 'logo':
        put(SFX, impact(1.1, True), t0, .75); put(SFX, glass(89, 1.6, 1.0), t0 + .01, .5, .2); put(SFX, glass(93, 1.6, .8), t0 + .03, .4, -.2)
        put(SFX, air(.6, 5000, 800, .4), t0, .3)
    elif ty == 'word': put(SFX, air(.4, 600, 2600, .4), t0 - .05, .18)
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
