"""Banda sonora de «¿Quién sale antes?»: partitura de concurso sintetizada + foley + público + voces, todo leído de
events.json (la imagen manda). 120 BPM, compás 0 en 1,0 s, progresión I–vi–IV–V en Re mayor (un acorde por compás);
cada prueba tiene su sabor (funk, concurso, electro, tensión, sueño, premio) y el final sube un tono.
Dos silencios: medio tiempo antes de la campana y el compás de la noche. La música se agacha bajo la voz.
Escribe out/mix.wav (48 kHz, estéreo). El −14 LUFS lo hace mux_local.sh.
Uso: python mix.py"""
import json
import os

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, lfilter, fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 48000
E = json.load(open(os.path.join(HERE, "events.json")))
DUR = E["dur"]; N = int((DUR + .5) * SR)
EV = E["ev"]; META = next(e for e in EV if e["type"] == "meta")
rng = np.random.default_rng(11)
MUS, SFX, VOX, CRW = (np.zeros((2, N)) for _ in range(4))
WET = np.zeros((2, N)); SEND = [0.0]   # lo que cada efecto manda a la sala del plató (ver «la sala»)


def ar(n): return np.arange(n) / SR
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def lp(x, f, o=2): return sosfilt(butter(o, min(f, SR / 2 - 100), "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], "band", fs=SR, output="sos"), x)
def nz(d): return rng.standard_normal(int(d * SR))


def put(buf, x, t0, g=1.0, pan=0.0):
    i = int(round(t0 * SR))
    if i < 0: x = x[-i:]; i = 0
    j = min(N, i + len(x))
    if j <= i: return
    x = x[: j - i] * g
    buf[0, i:j] += x * np.sqrt(.5 * (1 - pan)); buf[1, i:j] += x * np.sqrt(.5 * (1 + pan))
    if buf is SFX and SEND[0] > 0:
        WET[0, i:j] += x * SEND[0] * np.sqrt(.5 * (1 - pan)); WET[1, i:j] += x * SEND[0] * np.sqrt(.5 * (1 + pan))


# ——— instrumentos ———
def kick(g=1.0):
    n = int(.34 * SR); t = ar(n); f = 46 + 120 * np.exp(-t * 30)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8.5) + .2 * np.exp(-t * 300) * rng.standard_normal(n)
    return np.tanh(s * 1.7) * g
def snare(g=1.0):
    n = int(.22 * SR); t = ar(n)
    return (bp(rng.standard_normal(n), 1500, 8000) * np.exp(-t * 17) * .75 + np.sin(2 * np.pi * 185 * t) * np.exp(-t * 28) * .5) * g
def clap():
    n = int(.26 * SR); out = np.zeros(n)
    for k, off in enumerate([0, .011, .023]):
        i = int(off * SR); m = n - i; t = ar(m); out[i:] += bp(rng.standard_normal(m), 900, 5200) * np.exp(-t * (62 if k < 2 else 15))
    return out * .62
def hat(open_=False):
    n = int((.2 if open_ else .05) * SR); t = ar(n)
    return hp(rng.standard_normal(n), 7200) * np.exp(-t * (16 if open_ else 95)) * .33
def tom(m=45):
    n = int(.3 * SR); t = ar(n); f = mtof(m) * (1 + .5 * np.exp(-t * 25))
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 1.4) * .7
def crash(d=1.6):
    n = int(d * SR); t = ar(n); return hp(rng.standard_normal(n), 3800) * np.exp(-t * 2.6) * .32
def slap(m, d=.2):
    n = int(d * SR); t = ar(n); f = mtof(m); ph = 2 * np.pi * f * t
    s = np.sin(ph) + .5 * np.sin(2 * ph) * np.exp(-t * 30) + .3 * (2 * ((f * t) % 1) - 1) * np.exp(-t * 20)
    return lp(s, 1700) * np.minimum(1, t / .003) * np.exp(-t * 7) * .72
def bass(m, d=.24):
    n = int(d * SR); t = ar(n); ph = 2 * np.pi * mtof(m) * t
    return lp(np.sin(ph) + .25 * np.sign(np.sin(ph)), 900) * np.minimum(1, t / .004) * np.clip((d - t) / .04, 0, 1) * .8
def brass(ms, d=.16, bright=4200):
    n = int(d * SR); t = ar(n); s = np.zeros(n)
    for m in ms:
        for det in (-.09, .09):
            ph = np.cumsum(np.full(n, mtof(m) * (1 + det / 100))) / SR; s += 2 * (ph % 1) - 1
    s /= len(ms) * 2; k = np.exp(-t * 22)
    return (lp(s, bright) * k + lp(s, 1000) * (1 - k)) * np.minimum(1, t / .004) * np.clip((d - t) / .04, 0, 1) * .8
def lead(m, d=.22, vib=.005):
    n = int(d * SR); t = ar(n); f = mtof(m) * (1 + vib * np.sin(2 * np.pi * 6 * t) * np.minimum(1, t / .15))
    ph = np.cumsum(f) / SR; s = np.sign(np.sin(2 * np.pi * ph)) * .45 + .55 * np.sin(2 * np.pi * ph)
    return lp(s, 3600) * np.minimum(1, t / .006) * np.clip((d - t) / .04, 0, 1) * .42
def pluck(m, d=.35):
    n = int(d * SR); t = ar(n); f = mtof(m)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t * 7) + .35 * np.sin(2 * np.pi * f * 3.99 * t) * np.exp(-t * 30) + .12 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 12)
    return s * np.minimum(1, t / .002)
def bell(m, d=1.4):
    n = int(d * SR); t = ar(n); f = mtof(m)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.6) + .4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + .2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 11)) * np.minimum(1, t / .001)
def arp(m, d=.11):
    n = int(d * SR); t = ar(n); return lp(np.sign(np.sin(2 * np.pi * mtof(m) * t)), 5200) * np.exp(-t * 26) * .28
def pad(ms, d):
    n = int(d * SR); t = ar(n); s = np.zeros(n)
    for m in ms:
        for det in (-.12, .12): s += 2 / np.pi * np.arcsin(np.sin(2 * np.pi * mtof(m) * (1 + det / 100) * t))
    return lp(s / (len(ms) * 2), 2200) * np.minimum(1, t / .1) * np.clip((d - t) / .2, 0, 1)
def cowbell():
    n = int(.25 * SR); t = ar(n); s = np.sign(np.sin(2 * np.pi * 560 * t)) + np.sign(np.sin(2 * np.pi * 845 * t))
    return bp(s, 500, 3000) * np.exp(-t * 14) * .26

# ——— la partitura sobre la rejilla ———
BAR0, BEAT = META["bar0"], .5
SECT = META["sections"]; SIL = META["silence"]; KEYUP = META["keyUp"]
#            raíz    triada (Re mayor: I–vi–IV–V)
PROG = [(38, [62, 66, 69]), (35, [59, 62, 66]), (31, [59, 62, 67]), (33, [57, 61, 64])]
THEME = [  # (tiempo del compás, nota, duración en tiempos) — el tema del programa, cuatro compases
    [(0, 74, 1), (1, 73, .5), (1.5, 74, .5), (2, 78, 1), (3, 76, 1)],
    [(0, 74, 1), (1, 71, 1), (2, 66, 1), (3, 69, 1)],
    [(0, 71, 1), (1, 74, .5), (1.5, 79, 1.5), (3, 78, 1)],
    [(0, 76, 1), (1, 73, .5), (1.5, 69, .5), (2, 71, 1), (3, 73, 1)],
]


def mode_at(t):
    for a, b, m in SECT:
        if a <= t < b: return m
    return None


def in_sil(t): return any(a <= t < b for a, b in SIL)


nb = int(np.ceil((DUR - 0) / BEAT)) + 4
for bi in range(-2, nb):
    tb = BAR0 + bi * BEAT
    if tb < 0 or tb >= DUR: continue
    m = mode_at(tb)
    if m is None or in_sil(tb): continue
    bar, k = bi // 4, bi % 4
    tr = 2 if tb >= KEYUP else 0
    root, tri = PROG[bar % 4]; root += tr; tri = [x + tr for x in tri]
    # ——— batería ———
    if m == 'pickup': continue   # bajo «¡Dos autónomos!» solo la voz: la banda entra con el corte
    if m in ('hook', 'pop', 'popBig', 'jackpot', 'electro', 'heavy'):
        put(MUS, kick(), tb, .9)
        if k in (1, 3): put(MUS, clap(), tb, .55, .1); put(MUS, snare(.6), tb, .35)
        put(MUS, hat(True), tb + .25, .55, .35)
        for h in (0, 1): put(MUS, hat(), tb + h * .25 + (.012 if h else 0), .5, -.3)
        if m in ('electro', 'jackpot'):
            for h in (1, 3): put(MUS, hat(), tb + h * .125, .35, .3)
    elif m in ('funk', 'quiz'):
        if k in (0, 2): put(MUS, kick(), tb, .9)
        if m == 'funk' and k == 2: put(MUS, kick(.7), tb + .25, .5)
        if k in (1, 3): put(MUS, clap(), tb, .55, .1); put(MUS, snare(.6), tb, .4)
        for h in range(4): put(MUS, hat(), tb + h * .125 + (.01 if h % 2 else 0), .45 if h % 2 == 0 else .28, -.3)
    elif m == 'dream':
        if k == 0: put(MUS, kick(.8), tb, .7)
        if k == 2: put(MUS, snare(.4), tb, .3); put(MUS, clap(), tb, .25)
        put(MUS, hat(), tb + .25, .25, .3)
    # ——— bajo ———
    if m in ('hook', 'pop', 'popBig', 'heavy', 'jackpot'):
        for h, o in ((0, 0), (.25, 12)): put(MUS, bass(root + o, .2), tb + h, .55)
    elif m == 'funk' and k == 0:
        for off, o in [(0, 0), (.375, 12), (.75, 0), (1, 7), (1.25, 12), (1.625, 0), (1.75, 10)]: put(MUS, slap(root + 12 + o), tb + off, .55)
    elif m == 'quiz': put(MUS, slap(root + 12 + [0, 7, 9, 7][k], .3), tb, .5)
    elif m == 'electro':
        for h, o in ((0, 0), (.25, 12)): put(MUS, bass(root + o, .18), tb + h, .5)
    elif m == 'dream' and k in (0, 2): put(MUS, bass(root, .9), tb, .4)
    # ——— armonía y melodía ———
    if m in ('hook', 'pop', 'popBig'):
        if k == 0: put(MUS, brass(tri, .2), tb, .45, -.15)
        if k == 3: put(MUS, brass(tri, .12), tb + .25, .35, .15)
    if m == 'funk' and k in (1, 3): put(MUS, brass(tri, .11), tb + .25, .42, .15)
    if m == 'quiz':
        cyc = [tri[0], tri[1], tri[2], tri[0] + 12]
        for h in (0, 1): put(MUS, pluck(cyc[(k * 2 + h) % 4] + 12, .3), tb + h * .25, .3, .25)
    if m in ('electro', 'jackpot'):
        cyc = [tri[0], tri[1], tri[2], tri[0] + 12, tri[2] + 12, tri[1] + 12, tri[0] + 12, tri[2]]
        for s16 in range(4): put(MUS, arp(cyc[(k * 4 + s16) % 8] + 12, .1), tb + s16 * .125, .45, -.2)
        if m == 'jackpot' and k % 2 == 1: put(MUS, cowbell(), tb + .25, .5, .3)
        if m == 'jackpot' and k == 0: put(MUS, brass(tri, .18), tb, .4)
    if m == 'heavy':
        put(MUS, brass([root + 12, root + 19], .16, 2500), tb, .5)
        if k == 3 and bar % 2 == 1:
            for i, tm in enumerate([50, 47, 43, 40]): put(MUS, tom(tm), tb + i * .125, .6)
    if m == 'dream':
        if k == 0: put(MUS, pad(tri, 2.0), tb, .35)
        for h in (0, 1): put(MUS, bell([tri[0], tri[1], tri[2], tri[0] + 12][(k * 2 + h) % 4] + 12, .9), tb + h * .25, .14, .3)
    if m in ('pop', 'popBig') and k == 0:
        for off, note, d in THEME[bar % 4]:
            put(MUS, lead(note + tr, d * BEAT * .92), tb + off * BEAT, .5 if m == 'popBig' else .38, -.1)
            if m == 'popBig': put(MUS, brass([note + tr - 12], d * BEAT * .9, 3000), tb + off * BEAT, .22, .2)

# remates y sintonías
def jingle(t0):
    put(MUS, crash(2.0), t0, .9)
    for i, mm in enumerate([62, 66, 69, 74]): put(MUS, brass([mm, mm + 4], .12), t0 + i * .0625, .5)
    put(MUS, brass([62, 66, 69, 74], .9), t0 + .25, .55); put(MUS, kick(), t0, 1)
for e in EV:
    if e["type"] == "jingle": jingle(e["t"])
for t0 in META["judges"]:   # «ta-chán» de veredicto: V → I
    put(MUS, brass([57, 61, 64, 69], .1), t0 - .125, .45); put(MUS, brass([62, 66, 69, 74], .45), t0, .6); put(MUS, crash(1.8), t0, .8)
for t0 in (17.0, 27.5): put(MUS, crash(1.4), t0, .6)
put(MUS, crash(2.2), 1.0, .5); put(MUS, crash(2.4), 32.0, .9)
# el regreso tras la noche: golpe de toda la banda un tono más arriba
put(MUS, brass([64, 68, 71, 76], .6), KEYUP, .7); put(MUS, crash(2.6), KEYUP, 1.0); put(MUS, kick(1.2), KEYUP, 1.0)
# botón final
put(MUS, brass([64, 68, 71, 76, 80], .8), 52.0, .85); put(MUS, kick(1.2), 52.0, 1.0); put(MUS, crash(2.8), 52.0, .9)
for i, mm in enumerate([76, 80, 83, 88]): put(MUS, bell(mm, 1.2), 52.0 + i * .06, .18, .3)

# silencios: puerta de la música (rampas de 15 ms)
gate = np.ones(N); tt = ar(N)
for a, b in SIL: gate[(tt >= a) & (tt < b)] = 0
gate = np.convolve(gate, np.ones(int(.015 * SR)) / int(.015 * SR), "same")
MUS *= gate

# ——— foley ———
def tone(f, d, dec=10, kind='sin'):
    n = int(d * SR); t = ar(n); ph = 2 * np.pi * f * t
    s = np.sin(ph) if kind == 'sin' else np.sign(np.sin(ph))
    return s * np.exp(-t * dec) * np.minimum(1, t / .002)
def sweep(f0, f1, d, kind='sin'):
    f = np.geomspace(f0, f1, int(d * SR)); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) if kind == 'sin' else np.sign(np.sin(ph))
def whoosh(d=.45, up=True):
    n = int(d * SR); t = ar(n); x = rng.standard_normal(n); out = np.zeros(n); seg = 1024
    for i in range(0, n, seg):
        p = i / n; fc = 500 + 3800 * (p if up else 1 - p)
        out[i:i + seg] = bp(x[max(0, i - 2048):i + seg], fc * .7, min(fc * 1.3, 20000))[-len(x[i:i + seg]):]
    return out * np.sin(np.pi * t / d) ** 2 * 1.1
def airwhip(d=.38):   # barrido de cámara: aire grave, sin agudos que tapen las eses de la voz
    return lp(whoosh(d), 1100, 4) * 1.8
def thump(f=70, d=.35, g=1.0):
    n = int(d * SR); t = ar(n); fr = f * (1 + 1.5 * np.exp(-t * 30))
    return (np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 11) + lp(rng.standard_normal(n), 400) * np.exp(-t * 30) * .5) * g
def paper(d=.8):
    n = int(d * SR); t = ar(n); am = np.abs(np.sin(2 * np.pi * (9 + 6 * rng.random()) * t)) ** 3
    return bp(rng.standard_normal(n), 1800, 7000) * am * np.exp(-t * 3) * .5
def card(big=False):   # una pieza de papel que aterriza sobre papel: chasquido seco y un golpe blando debajo
    n = int(.16 * SR); t = ar(n); f = (140 if big else 190) * (1 + .8 * np.exp(-t * 40))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26)
    return bp(rng.standard_normal(n), 900, 5200) * np.exp(-t * 70) * .7 + body * (.6 if big else .35)
def slide(d=.24):      # papel que se arrastra sobre papel
    n = int(d * SR); t = ar(n)
    return bp(rng.standard_normal(n), 1500, 6000) * np.sin(np.pi * t / d) ** 1.5 * (1 + .3 * np.sin(2 * np.pi * 31 * t)) * .45
def click(f=3000, d=.03): n = int(d * SR); t = ar(n); return bp(rng.standard_normal(n), f * .6, min(f * 1.6, 20000)) * np.exp(-t * 160)
def metal_bell(f0=1180, d=1.6):
    n = int(d * SR); t = ar(n); s = np.zeros(n)
    for r, a, dc in ((1, 1, 2.2), (2.42, .6, 3.5), (3.9, .4, 5), (5.4, .25, 7)): s += a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t * dc)
    return s * np.minimum(1, t / .001) * .3

# cuánto manda cada efecto a la sala: lo grande y lo lejano, más; lo pequeño y pegado al micro, poco
SENDS = {'whip': .45, 'whoosh': .4, 'slam': .3, 'boom': .35, 'crash': .35, 'thud': .25, 'stamp': .25, 'card': .22, 'slide': .3,
         'bell': .35, 'ding': .3, 'land': .3, 'step': .2, 'door': .25, 'key': .1, 'tap': .1, 'tick': .12, 'clock': .15, 'shutter': .1}
for e in EV:
    ty, t0 = e["type"], e["t"]
    SEND[0] = SENDS.get(ty, .2)
    if ty == 'mic': put(SFX, thump(60, .3, .8), t0, .5)
    elif ty == 'slam':
        put(SFX, thump(55, .45, 1.0), t0, .8 if e.get("big") else .55); put(SFX, hp(nz(.12), 2000) * np.exp(-ar(int(.12 * SR)) * 30), t0, .25)
    elif ty == 'pip': f = e.get("f", 880); put(SFX, sweep(f * 1.9, f, .09) * np.exp(-ar(int(.09 * SR)) * 25), t0, .3, rng.uniform(-.3, .3))
    elif ty == 'swish': put(SFX, whoosh(.3), t0 - .05, .35, -.2)
    elif ty == 'whoosh': put(SFX, whoosh(.5), t0, .4, .1)
    elif ty == 'whip': put(SFX, lp(airwhip(.38), 600) if e.get("soft") else airwhip(.28 if e.get("short") else .38), t0 - .04, .14 if e.get("soft") else .24 if e.get("short") else .32, e.get("pan", 0))
    elif ty == 'roll':
        t = t0
        while t < e["t1"]:
            p = (t - t0) / (e["t1"] - t0); put(SFX, snare(.3 + .7 * p), t, .25 + .35 * p, rng.uniform(-.2, .2)); t += .09 * (1 - p) + .035 * p
    elif ty == 'bell': put(SFX, metal_bell(1180, 1.8), t0, .85); put(SFX, metal_bell(1180, 1.5), t0 + .16, .6)
    elif ty == 'key': put(SFX, click(3500), t0, .45); put(SFX, tone(2400, .05, 60), t0, .08)
    elif ty == 'err': put(SFX, tone(330, .12, 4, 'sq') * .3, t0, .25); put(SFX, tone(330, .12, 4, 'sq') * .3, t0 + .16, .25)
    elif ty == 'tap': put(SFX, click(2600, .025), t0, .6); put(SFX, tone(1600, .04, 50), t0, .1)
    elif ty == 'pop': f = e.get("f", 900); put(SFX, sweep(f * 2.2, f, .1) * np.exp(-ar(int(.1 * SR)) * 30), t0, .4)
    elif ty == 'stamp': put(SFX, thump(48, .5, 1.2), t0, .65 if e.get("big") else .5); put(SFX, lp(nz(.06), 3000) * np.exp(-ar(int(.06 * SR)) * 60), t0, .4)
    elif ty == 'thud': put(SFX, thump(65, .4, .9), t0, .45 if e.get("small") else .8)
    elif ty == 'paper': put(SFX, paper(.9), t0, .7, -.2); put(SFX, paper(.7), t0 + .1, .5, .25)
    elif ty == 'card': put(SFX, card(e.get("big")), t0, .55 if e.get("big") else .4, e.get("pan", 0))
    elif ty == 'slide': put(SFX, slide(), t0, .35, e.get("pan", 0))
    elif ty == 'buzz':
        n = int(.5 * SR); t = ar(n); s = lp(np.sign(np.sin(2 * np.pi * 110 * t)) + np.sign(np.sin(2 * np.pi * 117 * t)), 1500) * np.clip((.5 - t) / .05, 0, 1) * .3
        put(SFX, s, t0, .5)
    elif ty == 'muffle':   # el cliente al teléfono: «bla, bla» sin palabras, filtrado
        n = int(.45 * SR); t = ar(n); f = 180 + 50 * np.sin(2 * np.pi * 7 * t); ph = 2 * np.pi * np.cumsum(f) / SR
        s = sum(np.sin(ph * h) / h for h in range(1, 12)) * (.5 + .5 * np.sin(2 * np.pi * 9 * t)) ** 2
        put(SFX, bp(s, 400, 2200) * .5, t0, .5, .35)
    elif ty == 'busy':
        for i in range(3): put(SFX, tone(425, .19, 0) * np.minimum(1, (.19 - ar(int(.19 * SR))) / .01), t0 + i * .4, .18, .3)
    elif ty == 'chime': put(SFX, bell(88, .35), t0, .22, .2); put(SFX, bell(95, .4), t0 + .1, .2, .2)
    elif ty == 'kaching': put(SFX, metal_bell(2200, .4) * np.linspace(1, 0, int(.4 * SR)), t0, .4); put(SFX, bp(nz(.18), 3000, 9000) * np.exp(-ar(int(.18 * SR)) * 18), t0 - .05, .3)
    elif ty == 'hangup': put(SFX, thump(140, .2, .8), t0, .5); put(SFX, click(1800, .04), t0, .4)
    elif ty == 'rattle': put(SFX, bp(nz(.06), 900, 3500) * np.exp(-ar(int(.06 * SR)) * 50), t0, .5, rng.uniform(-.2, .2))
    elif ty == 'shutter': put(SFX, click(3000, .03), t0, .7); put(SFX, click(2500, .03), t0 + .06, .6)
    elif ty == 'tick': put(SFX, tone(e.get("f", 1300), .06, 40), t0, .18)
    elif ty == 'boom': put(SFX, thump(45, .6, 1.3), t0, .8); put(SFX, hp(nz(.25), 1500) * np.exp(-ar(int(.25 * SR)) * 12), t0, .35)
    elif ty == 'growl':
        n = int(.45 * SR); t = ar(n); f = 70 + 15 * np.sin(2 * np.pi * 11 * t); s = lp(2 * ((np.cumsum(f) / SR) % 1) - 1, 900) * np.minimum(1, t / .05) * np.clip((.45 - t) / .1, 0, 1)
        put(SFX, s, t0, .55)
    elif ty == 'chomp':
        for i in range(2): put(SFX, click(1400, .05) * 2, t0 + i * .09, .6); put(SFX, thump(120, .15, .7), t0 + i * .09, .3)
    elif ty == 'yelp': put(SFX, sweep(500, 1500, .25) * np.sin(np.pi * ar(int(.25 * SR)) / .25) * .4, t0, .35)
    elif ty == 'creak':
        n = int(.35 * SR); t = ar(n); f = 160 + 60 * np.sin(2 * np.pi * 3 * t); s = bp(2 * ((np.cumsum(f) / SR) % 1) - 1, 600, 2500) * np.sin(np.pi * t / .35)
        put(SFX, s, t0, .35)
    elif ty == 'crash':
        if e.get("cym"): put(SFX, crash(2.2), t0, .7)
        else:
            for i in range(7): put(SFX, thump(70 + 30 * rng.random(), .25, .9), t0 + i * .04 + rng.random() * .02, .45, rng.uniform(-.5, .5))
    elif ty == 'land':
        f = e.get("f", 600); put(SFX, sweep(f * 2, f, .08) * np.exp(-ar(int(.08 * SR)) * 25), t0, .35); put(SFX, bell(int(round(69 + 12 * np.log2(f / 440))) + 12, .9), t0, .16)
    elif ty == 'ding': put(SFX, bell(93, 1.1), t0, .2, .3)
    elif ty == 'step': put(SFX, thump(150 if e.get("soft") else 110, .12, .6), t0, .2 if e.get("soft") else .32, .2)
    elif ty == 'door':
        if e.get("open"):
            n = int(.4 * SR); t = ar(n); f = 220 + 140 * t / .4; s = bp(2 * ((np.cumsum(f) / SR) % 1) - 1, 500, 2600) * np.sin(np.pi * t / .4)
            put(SFX, s, t0, .3)
        else: put(SFX, thump(70, .4, 1.0), t0, .6)
    elif ty == 'clock': put(SFX, tone(1900 if not e.get("tock") else 1450, .05, 70), t0, .3, -.1 if not e.get("tock") else .1); put(SFX, click(4000, .02), t0, .3)
SEND[0] = 0.0

# ——— la sala: todos los efectos suenan en el mismo plató ———
# una sola respuesta al impulso para todos (T60 ≈ 0,9 s, 12 ms de predelay, tres primeras reflexiones, estéreo
# decorrelado): es lo que hace que sonidos tan distintos parezcan de la misma película
def plato_ir(t60=.9):
    n = int(t60 * 1.2 * SR); t = ar(n); r = np.random.default_rng(5); pre = int(.012 * SR)
    ir = np.stack([lp(hp(r.standard_normal(n), 150), 6000) * np.exp(-t * 6.91 / t60) for _ in range(2)])
    ir = np.concatenate([np.zeros((2, pre)), ir[:, :n - pre]], 1)
    for dt, a, p in ((.017, .55, .3), (.029, .4, -.4), (.043, .3, .1)):
        k = int(dt * SR); ir[0, k] += a * np.sqrt(.5 * (1 - p)); ir[1, k] += a * np.sqrt(.5 * (1 + p))
    return ir / np.sqrt((ir ** 2).sum() / 2)
IR = plato_ir()
SFX += np.stack([fftconvolve(WET[c], IR[c])[:N] for c in range(2)])

# ——— público ———
def load(id_):
    y, sr = sf.read(os.path.join(HERE, "voices", id_ + ".wav"))
    if y.ndim > 1: y = y.mean(1)
    return y if sr == SR else np.interp(np.arange(int(len(y) * SR / sr)) * sr / SR, np.arange(len(y)), y)
def resamp(y, r): return np.interp(np.arange(0, len(y) - 1, r), np.arange(len(y)), y)
OOH = [load(i) for i in ('coa', 'cos', 'cod')]; BIEN = [load(i) for i in ('cba', 'cbs', 'cbd')]
def crowd_shout(lines, t0, g=1.0):
    for i, y in enumerate(lines):
        for j, r in enumerate((.88, 1.0, 1.12)):
            put(CRW, lp(resamp(y, r), 5000), t0 + (i * 3 + j) * .007 + rng.random() * .02, g * .28, -.7 + .7 * j)
def applause(t0, d=1.4, g=1.0):
    n = int(d * SR); env = np.minimum(1, ar(n) / .06) * np.clip((d - ar(n)) / .6, 0, 1); s = np.zeros(n)
    for k in range(int(d * 90)):
        i = int(rng.random() * (n - 2000)); m = 1500; s[i:i + m] += bp(rng.standard_normal(m), 800, 6000) * np.exp(-ar(m) * 70) * rng.uniform(.3, 1)
    put(CRW, s * env * .35 * g, t0, 1, rng.uniform(-.2, .2))
for e in EV:
    if e["type"] == 'ooh': crowd_shout(OOH, e["t"], 1.0); applause(e["t"], 1.0, .4)
    if e["type"] == 'cheer': crowd_shout(BIEN, e["t"] + .05, .9); applause(e["t"], 1.0, 1.0)
# murmullo del plató, salvo en los silencios y en los planos del móvil
mur = lp(hp(rng.standard_normal(N), 250), 1800) * .05
xs = np.arange(0, DUR + 1, .25); mod = np.interp(ar(N), xs, .6 + .4 * rng.random(len(xs)))
lvl = np.zeros(N)
for a, b, k in META["shots"]:
    lvl[int(a * SR):int(b * SR)] = {'wide': 1, 'hostcu': .8, 'card': .7, 'bonus': .6, 'jav': .4, 'phone': .25, 'javwin': .5, 'merge': .4, 'end': .35, 'night': 0}.get(k, .3)
lvl = np.convolve(lvl, np.ones(int(.08 * SR)) / int(.08 * SR), "same") * gate
CRW[0] += mur * mod * lvl; CRW[1] += np.roll(mur, 517) * mod * lvl

# ——— voces ———
def room(x, wet=.12):
    n = int(.28 * SR); ir = rng.standard_normal(n) * np.exp(-ar(n) * 16); ir = lp(ir, 5000); ir[0] = 0
    return x + wet * np.convolve(x, ir / np.abs(ir).sum() * 30, "full")[:len(x)]
for e in EV:
    if e["type"] != 'vo': continue
    y = load(e["id"]); who = e["who"]
    if who == 'host': y = room(y, .10)
    put(VOX, y, e["t"], 1.0, {'host': 0, 'javier': -.12, 'lucia': .12}[who])

# ——— mezcla ———
OUT = os.path.join(HERE, "out", "mix.wav")
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)


def loud(x):
    """(LUFS integrada, pico verdadero dBTP) medidos por ffmpeg ebur128."""
    import re, subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav") as f:
        sf.write(f.name, x.T.astype(np.float32), SR)
        o = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", f.name, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", o)[-1]), float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", o)[-1])


def limit(x, red_db):
    """Limitador con anticipación de 6 ms: baja los picos `red_db` dB y deja el resto igual."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    a = np.abs(x).max(0) + 1e-9; ceil = a.max() * 10 ** (-red_db / 20)
    g0 = np.minimum(1, ceil / a)
    g = uniform_filter1d(minimum_filter1d(g0, size=int(.012 * SR)), size=int(.006 * SR))
    return x * np.minimum(g, minimum_filter1d(g0, size=3))


def rms_db(x, mask=None):
    y = x[:, mask] if mask is not None else x
    return 10 * np.log10((y ** 2).mean() + 1e-12)


# cada bus con su propio limitador (los golpes y los platillos son agujas) y su nivel medio fijado respecto a la
# voz ANTES de agacharlo: música −4 dB, efectos −6 dB, público −10 dB. Bajo la voz, la música baja 11 dB más,
# los efectos 5 dB y el público 10 dB: la voz de Kokoro necesita sitio.
talk = np.abs(VOX).max(0) > 1e-3
v = rms_db(VOX, talk)
def at(x, target):
    on = np.abs(x).max(0) > 1e-3
    return x * 10 ** ((target - rms_db(x, on)) / 20)
venv = np.abs(VOX).max(0); w = int(.03 * SR); venv = np.convolve(venv, np.ones(w) / w, "same")
from scipy.ndimage import maximum_filter1d, uniform_filter1d
k = np.clip(venv / .06, 0, 1)
# ventana [t − 0,20 s, t + 0,15 s]: se agacha 150 ms antes de la palabra (una nota que suena justo antes no se
# come la primera consonante) y no vuelve a subir entre palabras
k = uniform_filter1d(maximum_filter1d(k, size=int(.35 * SR), origin=int(.025 * SR)), size=int(.06 * SR))
def ducked(x, db): return x * (1 - (1 - 10 ** (-db / 20)) * np.clip(k, 0, 1))
S = ducked(at(limit(SFX, 9), v - 6), 5); C = ducked(at(limit(CRW, 6), v - 10), 10); M = ducked(at(limit(MUS, 6), v - 4), 11)
mix = VOX + S + C + M
if os.environ.get("MIX_STEMS"):   # para depurar: cada bus por separado, ya agachado
    for name, x in (("voz", VOX), ("efectos", S), ("publico", C), ("musica", M)): sf.write(os.path.join(HERE, "out", f"stem_{name}.wav"), x[:, :int(DUR * SR)].T.astype(np.float32), SR)
mix = mix[:, :int(DUR * SR)]
mix = mix / np.abs(mix).max() * .95
# relación pico/sonoridad ≤ 12,3 dB: así, a −14 LUFS, el pico verdadero queda por debajo de −1,7 dBTP
red = 0.0
for it in range(6):
    y = limit(mix, red) if red > 0 else mix
    y = y / np.abs(y).max() * .89
    I, TP = loud(y)
    print(f"  pasada {it}: reducción {red:.1f} dB → I {I:.1f} LUFS, pico {TP:.1f} dBTP, PLR {TP - I:.1f} dB")
    if TP - I <= 12.3: break
    red += (TP - I) - 12.0
sf.write(OUT, y.T.astype(np.float32), SR)
print("mix", DUR, "s")
