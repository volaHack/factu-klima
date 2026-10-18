"""Mezcla final: voces + foley sintetizado en los tiempos de window.EV + ambiente + música con ducking.
Lee events.json (core/render/events.mjs), voices/*.wav (voice.py) y music/score.wav (music/score.py).
Escribe out/mix.wav (48 kHz, estéreo). El −14 LUFS lo deja mux.sh.
Uso: python mix.py"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.environ.get("LIB", "/home/user/lemomo-ai/lemo-opuscar")
sys.path.insert(0, os.path.join(LIB, "core/audio"))
import sfx  # noqa: E402  (herramientas de la librería: compress, limit, whoosh, thump…)

SR = 48000
EV = json.load(open(os.path.join(HERE, "events.json")))
DUR = EV["dur"]; N = int(DUR * SR)
rng = np.random.default_rng(5)
FX = np.zeros((2, N)); VOX = np.zeros((2, N)); AMB = np.zeros((2, N))


def tt(d): return np.arange(int(d * SR)) / SR
def lp(x, f, o=2): return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], "band", fs=SR, output="sos"), x)
def nz(d): return rng.standard_normal(int(d * SR))
def ex(d, tau): return np.exp(-tt(d) / tau)


def put(buf, x, t0, g=1.0, pan=0.0):
    i = int(t0 * SR); j = min(N, i + len(x))
    if j <= i or i < 0: return
    x = x[: j - i] * g
    buf[0, i:j] += x * np.sqrt(.5 * (1 - pan)); buf[1, i:j] += x * np.sqrt(.5 * (1 + pan))


def sumpad(*xs):
    n = max(len(x) for x in xs); return sum(np.pad(x, (0, n - len(x))) for x in xs)


def sweep(f0, f1, d, shape="sin"):
    f = np.geomspace(f0, f1, int(d * SR)); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) if shape == "sin" else np.sign(np.sin(ph))


# —— foley ——
def alarm(d):
    x = np.zeros(int(d * SR)); b = .07
    for k in range(int(d / .5)):
        for j in (0, 1):
            i = int((k * .5 + j * .12) * SR); s = np.sign(np.sin(2 * np.pi * 2100 * tt(b))) * ex(b, .05)
            x[i:i + len(s)] += lp(s, 5000)[: len(x) - i]
    return x * .5
def crackle(d):
    x = np.zeros(int(d * SR))
    for k in range(int(d * 14)):
        i = int(rng.uniform(0, d - .03) * SR); s = hp(nz(.02), 2000) * ex(.02, .003); x[i:i + len(s)] += s * rng.uniform(.3, 1)
    return x * .5
def printer(d):
    x = tt(d); tren = (np.sin(2 * np.pi * 38 * x) > .1).astype(float)
    return (bp(rng.standard_normal(len(x)), 1200, 5000) * tren * .5 + np.sin(2 * np.pi * 110 * x) * tren * .15)
def cloth(): return bp(nz(.25), 300, 2500) * np.sin(np.linspace(0, np.pi, int(.25 * SR))) * .5
def lever():
    return sumpad(sfx.thump(.8, 90), bp(nz(.18), 400, 1800) * ex(.18, .05) * .6)
def portal_open():
    d = 1.4; x = tt(d)
    sub = np.sin(2 * np.pi * np.cumsum(40 + 50 * np.exp(-x * 6)) / SR) * np.exp(-x * 2.2)
    dn = bp(nz(d), 300, 3000) * np.exp(-x * 3) * .5
    swirl = sweep(300, 1400, d) * np.sin(np.pi * x / d) * .2
    return sub + dn + swirl
def portal_hum(d):
    x = tt(d); w = .5 + .5 * np.sin(2 * np.pi * .7 * x)
    return (np.sin(2 * np.pi * 55 * x) * .5 + np.sin(2 * np.pi * 110.5 * x) * .3 + np.sin(2 * np.pi * 880 * x + 3 * np.sin(2 * np.pi * 3 * x)) * .05 * w) * np.minimum(1, x / .3) * np.minimum(1, (d - x) / .2)
def boing(v=1): x = tt(.5); return np.sin(2 * np.pi * np.cumsum(180 + 120 * np.sin(2 * np.pi * 14 * x) * np.exp(-x * 5)) / SR) * np.exp(-x * 5) * .6 * v
def slam(): return sumpad(sfx.thump(1, 60), bp(nz(.3), 2000, 9000) * ex(.3, .08) * .4)
def slap(): return bp(nz(.12), 900, 5000) * ex(.12, .02) * 1.2
def rumble(d): return lp(nz(d), 120) * 2.5 * np.sin(np.linspace(0, np.pi, int(d * SR)))
def paper_storm(d):
    x = np.zeros(int(d * SR))
    for k in range(int(d * 40)):
        i = int(rng.uniform(0, d - .15) * SR); l = rng.uniform(.05, .15); s = bp(nz(l), rng.uniform(800, 2500), 7000) * np.sin(np.linspace(0, np.pi, int(l * SR))) ** 2
        x[i:i + len(s)] += s * rng.uniform(.2, .6)
    return x * np.minimum(1, (d - tt(d)) / .6)
def glorp(): x = tt(.45); return np.sin(2 * np.pi * np.cumsum(90 + 140 * np.exp(-x * 9) + 30 * np.sin(2 * np.pi * 22 * x)) / SR) * np.exp(-x * 6) * .8
def squish(): x = tt(.3); return (lp(nz(.3), 900) * .6 + np.sin(2 * np.pi * np.cumsum(260 - 200 * x / .3) / SR) * .5) * np.exp(-x * 10)
def paper_burp(): return sumpad(bp(nz(.18), 1500, 6000) * ex(.18, .06) * .5, np.sin(2 * np.pi * np.cumsum(np.linspace(140, 90, int(.3 * SR))) / SR) * ex(.3, .1) * .6)
def ding(): x = tt(1.2); return (np.sin(2 * np.pi * 1318.5 * x) * np.exp(-x * 4) + .6 * np.sin(2 * np.pi * 1760 * x) * np.exp(-np.maximum(0, x - .09) * 4) * (x > .09)) * .45
def suck(d): x = tt(d); return (sweep(1600, 250, d) * .25 + bp(nz(d), 400, 4000) * .4) * np.sin(np.pi * x / d) ** .5
def swirl(): return sfx.whoosh(.5, 1.0)
def tap(): return sfx.click(1.4, .5)
def kaching():
    x = tt(1.0); bell = (np.sin(2 * np.pi * 2093 * x) + .5 * np.sin(2 * np.pi * 3136 * x)) * np.exp(-x * 5)
    return sumpad(bell * .35, bp(nz(.15), 300, 2500) * ex(.15, .04) * .5)
def notif(): x = tt(.6); return (np.sin(2 * np.pi * 1568 * x) * (x < .12) + np.sin(2 * np.pi * 2093 * x) * (x >= .12)) * np.exp(-np.maximum(0, x - .12) * 6) * .3
def gulp(): x = tt(.3); return np.sin(2 * np.pi * np.cumsum(220 - 120 * x / .3) / SR) * np.sin(np.pi * x / .3) * .5
def coins():
    out = np.zeros(int(.9 * SR))
    for k in range(6):
        i = int(k * .09 * SR); x = tt(.3); s = (np.sin(2 * np.pi * rng.uniform(3500, 5200) * x) + .5 * np.sin(2 * np.pi * rng.uniform(6000, 8000) * x)) * np.exp(-x * 18)
        out[i:i + len(s)] += s * .3
    return out
def paper_suck(d):
    a = paper_storm(d); return sumpad(a * np.linspace(.4, 1.2, len(a)), sweep(300, 1200, d) * .08)
def fold(): return sumpad(bp(nz(.15), 1500, 6000) * ex(.15, .03), sfx.thump(.4, 120))
def pop(): return sfx.pop(1.0)
def horn():
    x = tt(.5); f = 520 + 140 * np.sin(np.pi * x / .5)
    return lp(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)), 2500) * np.sin(np.pi * x / .5) * .35
def fwump(): x = tt(.6); return np.sin(2 * np.pi * np.cumsum(70 + 80 * np.exp(-x * 12)) / SR) * np.exp(-x * 7) + lp(nz(.6), 400) * np.exp(-x * 9) * .6
def blip(): x = tt(.12); return np.sin(2 * np.pi * 1200 * x) * np.exp(-x * 30) * .4
def scratch():
    """disco rayado: barrido de tono del vinilo frenando + ruido de aguja"""
    x = tt(.45); f = 900 * np.exp(-x * 7) + 120 + 400 * np.sin(2 * np.pi * 9 * x) * np.exp(-x * 6)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * .6 + bp(nz(.45), 1500, 6000) * .4) * np.exp(-x * 5)
def rewind(d):
    """cinta rebobinando: chirridos agudos que suben + zumbido de motor"""
    x = tt(d); f = 600 + 2600 * (x / d) ** 1.5 + 300 * np.sin(2 * np.pi * 23 * x)
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * .25 + bp(nz(d), 2000, 8000) * .25 + np.sin(2 * np.pi * 95 * x) * .15) * np.minimum(1, (d - x) / .08)
def typing(d):
    out = np.zeros(int(d * SR) + int(.05 * SR))
    for k in range(int(d / .05)): i = int(k * .05 * SR); s = sfx.click(1.8, .4); out[i:i + len(s)] += s[: len(out) - i]
    return out
def impact(): return sumpad(sfx.thump(1, 50), bp(nz(.25), 3000, 10000) * ex(.25, .04) * .6)
def punch(): x = tt(.12); return lp(nz(.12), 300) * np.exp(-x * 30) * .8

FOLEY = {
    "alarm": (lambda e: alarm(e["d"]), .5, .1), "crackle": (lambda e: crackle(e["d"]), .5, .2), "printer": (lambda e: printer(e["d"]), .35, .1),
    "cloth": (lambda e: cloth(), .4, -.2), "lever": (lambda e: lever(), .8, .2), "portalOpen": (lambda e: portal_open(), .9, 0),
    "portalHum": (lambda e: portal_hum(e["d"]), .3, 0), "boing": (lambda e: boing(), .5, -.3), "slam": (lambda e: slam(), .7, 0),
    "whoosh": (lambda e: sfx.whoosh(.35, 1.0), .5, .2), "slap": (lambda e: slap(), .8, .3), "thump": (lambda e: sfx.thump(1, 70), .6, 0),
    "rumble": (lambda e: rumble(e["d"]), .6, 0), "whooshBig": (lambda e: sfx.whoosh(.5, 1.0), .9, 0), "paperStorm": (lambda e: paper_storm(e["d"]), .7, 0),
    "glorp": (lambda e: glorp(), .8, 0), "squish": (lambda e: squish(), .8, .1), "paperBurp": (lambda e: paper_burp(), .7, .1), "blip": (lambda e: blip(), .5, .3),
    "ding": (lambda e: ding(), .9, -.1), "suck": (lambda e: suck(e["d"]), .7, -.1), "swirl": (lambda e: swirl(), .8, 0), "tap": (lambda e: tap(), .6, -.1),
    "kaching": (lambda e: kaching(), .7, -.1), "notif": (lambda e: notif(), .7, .2), "gulp": (lambda e: gulp(), .7, .2), "coins": (lambda e: coins(), .7, .4),
    "paperSuck": (lambda e: paper_suck(e["d"]), .6, 0), "fold": (lambda e: fold(), .7, .2), "pop": (lambda e: pop(), .7, 0), "horn": (lambda e: horn(), .6, 0),
    "fwump": (lambda e: fwump(), .9, 0), "scratch": (lambda e: scratch(), 1.0, 0), "rewind": (lambda e: rewind(e["d"]), .8, 0),
    "typing": (lambda e: typing(e["d"]), .4, -.3), "impact": (lambda e: impact(), .9, 0), "punch": (lambda e: punch(), .5, 0),
}
for e in EV["ev"]:
    if e["type"] in FOLEY:
        f, g, pan = FOLEY[e["type"]]
        put(FX, f(e), e["t"], g * e.get("v", 1), pan)

# —— ambiente ——
def murmur(d, g):
    x = tt(d); m = bp(rng.standard_normal(len(x)), 180, 1400)
    am = 1 + .3 * np.sin(2 * np.pi * .6 * x) + .2 * np.sin(2 * np.pi * 1.7 * x + 1)
    out = m * am * g
    for k in range(int(d * 1.2)):                                       # vasos
        i = int(rng.uniform(0, d - .4) * SR); s = np.sin(2 * np.pi * rng.uniform(2600, 4200) * tt(.4)) * np.exp(-tt(.4) * 14) * .25
        out[i:i + len(s)] += s * g * 4
    return out
for e in EV["ev"]:
    if e["type"] != "amb": continue
    d = e["d"]
    if e["w"] == "bar": x = murmur(d, .09)
    elif e["w"] == "fluor": x = (np.sin(2 * np.pi * 100 * tt(d)) * .02 + np.sin(2 * np.pi * 120 * tt(d)) * .015 + hp(rng.standard_normal(int(d * SR)), 6000) * .004)
    else: x = murmur(d, .035)
    n = len(x); fade = int(.25 * SR); x[:fade] *= np.linspace(0, 1, fade); x[-fade:] *= np.linspace(1, 0, fade)
    put(AMB, x, e["t"], 1.0, 0)

# —— voces: comprimidas y a la misma altura, con primeras reflexiones de la sala ——
LINES = {l["id"]: l for l in json.load(open(os.path.join(HERE, "lines.json")))}
PAN = {"PACO": .18, "NURIA": -.18, "TÉCNICO": 0}
for e in EV["ev"]:
    if e["type"] != "vo": continue
    y, sr = sf.read(os.path.join(HERE, "voices", e["id"] + ".wav"))
    y = sfx.compress(y.astype(np.float64), .25, 3.5)
    y = y / (np.sqrt((y ** 2).mean()) + 1e-9) * .12
    room = y.copy()
    for dly, gg in ((.011, .18), (.019, .12), (.029, .08)): d_ = int(dly * SR); room[d_:] += y[:-d_] * gg
    put(VOX, room, e["t"], 1.0, PAN.get(LINES[e["id"]]["who"], 0))

# —— música con ducking bajo la voz (−7 dB) ——
mus, msr = sf.read(os.path.join(HERE, "music/score.wav")); mus = mus.T[:, :N]
if mus.shape[1] < N: mus = np.pad(mus, ((0, 0), (0, N - mus.shape[1])))
venv = np.abs(VOX).max(0); k = int(.02 * SR)
venv = np.convolve(venv, np.ones(k) / k, "same"); venv = (venv > .01).astype(float)
venv = np.convolve(venv, np.ones(int(.25 * SR)) / int(.25 * SR), "same")
duck = 1 - (1 - 10 ** (-7 / 20)) * np.clip(venv, 0, 1)
vrms = np.sqrt((VOX ** 2).mean()) + 1e-9; mrms = np.sqrt((mus ** 2).mean()) + 1e-9
mus = mus * (vrms / mrms) * 10 ** (-4 / 20) * duck                  # la voz ~10 dB por encima de la música
mix = VOX + mus + FX * .22 + AMB * .9
mix[0] = sfx.limit(mix[0], .95); mix[1] = sfx.limit(mix[1], .95)
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
raw = os.path.join(HERE, "out/mix_raw.wav"); sf.write(raw, mix.T.astype(np.float32), SR)
# el ffmpeg estático de este equipo no acepta una disposición de canales «desconocida»: se marca estéreo
import subprocess  # noqa: E402
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-af", "aformat=channel_layouts=stereo", "-c:a", "pcm_s24le", os.path.join(HERE, "out/mix.wav")], check=True)
for name, b in (("voz", VOX), ("música", mus), ("foley", FX * .22), ("ambiente", AMB * .9)):
    print(f"{name:9s} rms {20 * np.log10(np.sqrt((b ** 2).mean()) + 1e-9):6.1f} dBFS")
print("mix ok", DUR)
