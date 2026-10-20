"""程序化生成 BGM 与音效，按画面时间轴卡点。

用法: python3 gen_audio.py timeline.json out_dir
timeline.json 由 tl.mjs 导出: {"T": 总时长, "tl": [{"id": 场景, "t": 句子开始, "d": 时长, ...}]}
输出: bgm.wav, sfx.wav (44.1kHz 立体声)
"""
import json, sys
import numpy as np
from scipy.signal import butter, sosfilt, sawtooth, square
from scipy.io import wavfile

SR = 44100
rng = np.random.default_rng(7)


def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], 'band', fs=SR, output='sos'), x)
def t_(d): return np.arange(int(d * SR)) / SR
def mf(m): return 440 * 2 ** ((m - 69) / 12)
def env(n, a, r):
    e = np.ones(n); A = max(1, int(a * SR)); R = max(1, int(r * SR))
    e[:A] = np.linspace(0, 1, A)[:n]; e[-R:] *= np.linspace(1, 0, min(R, n)); return e


def put(buf, x, at, g=1.0, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[0] or i + len(x) <= 0: return
    if i < 0: x = x[-i:]; i = 0
    x = x[:buf.shape[0] - i]
    buf[i:i + len(x), 0] += x * g * (1 - max(pan, 0))
    buf[i:i + len(x), 1] += x * g * (1 + min(pan, 0))

# ---------------- instruments ----------------
def kick():
    t = t_(.45); f = 45 + 80 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
def hat(d=.05):
    t = t_(d); return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t * 90)
def clap():
    t = t_(.25); n = bp(rng.standard_normal(len(t)), 900, 3000)
    e = np.exp(-t * 18); e[:int(.01 * SR)] *= 1.6
    return n * e * .8
def pad(notes, d):
    t = t_(d); x = sum(sawtooth(2 * np.pi * mf(m) * (1 + dt) * t) for m in notes for dt in (-.003, .003))
    return lp(x / (2 * len(notes)), 1100) * env(len(t), .6, .9)
def pluck(m, d=.3):
    t = t_(d); return lp(sawtooth(2 * np.pi * mf(m) * t, .5), 2600) * np.exp(-t * 14)
def bass(m, d):
    t = t_(d); x = np.sin(2 * np.pi * mf(m) * t) + .25 * np.sin(4 * np.pi * mf(m) * t)
    return np.tanh(1.5 * x) * env(len(t), .005, .05)

# ---------------- sfx ----------------
def boom():
    t = t_(1.6); f = 32 + 70 * np.exp(-t * 9)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.4)
    n = lp(rng.standard_normal(len(t)), 1800) * np.exp(-t * 9) * .6
    return np.tanh(1.4 * (s + n))
def slam():
    t = t_(.5); f = 50 + 120 * np.exp(-t * 30)
    return np.tanh(2 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)) + hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 40) * .3
def stamp():
    t = t_(.9); c = clap() * 1.2
    sh = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in ((1568, 5), (2093, 6), (3136, 8))) * .25
    sh[:len(c)] += c; return sh
def riser(d):
    t = t_(d); f = 200 * (12 ** (t / d))
    x = sawtooth(2 * np.pi * np.cumsum(f) / SR) * .25 + bp(rng.standard_normal(len(t)), 500, 6000) * .5
    return lp(x, 5000) * (t / d) ** 2
def whoosh(d=.5, lo=500, hi=4500):
    t = t_(d); n = bp(rng.standard_normal(len(t)), lo, hi)
    return n * np.sin(np.pi * t / d) ** 2
def tick(f=2200, d=.03):
    t = t_(d); return np.sin(2 * np.pi * f * t) * np.exp(-t * 160)
def key_click():
    t = t_(.02); return hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 300) * rng.uniform(.5, 1)
def blip(f=1200):
    t = t_(.07); return np.sin(2 * np.pi * f * t) * np.exp(-t * 55)
def ding(m=84):
    t = t_(.7); return (np.sin(2 * np.pi * mf(m) * t) + .35 * np.sin(4 * np.pi * mf(m) * t)) * np.exp(-t * 6)
def buzz():
    t = t_(.28); return lp(square(2 * np.pi * 98 * t), 900) * env(len(t), .005, .08) * .6
def thud():
    t = t_(.35); f = 70 + 60 * np.exp(-t * 25)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12)
def sweep(d=.8):
    t = t_(d); f = 500 * (6 ** (t / d))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * .4 + bp(rng.standard_normal(len(t)), 1500, 7000) * .5) * np.sin(np.pi * t / d)
def shimmer():
    out = np.zeros(int(1.2 * SR))
    for k, m in enumerate((79, 83, 86, 91, 95)):
        x = ding(m) * .5; i = int(k * .06 * SR); out[i:i + len(x)] += x[:len(out) - i]
    return out
def alarm():
    t = t_(.8); return np.sin(2 * np.pi * 220 * t) * (np.sin(2 * np.pi * 6 * t) > 0) * env(len(t), .01, .1) * .35


def main(tl_path, out):
    D = json.load(open(tl_path)); T = D['T']
    L = {}
    for x in D['tl']: L.setdefault(x['id'], []).append(x['t'])
    S = {k: v[0] - .2 for k, v in L.items()}
    def l(sc, i): v = L[sc]; return v[i] if i < len(v) else v[-1]
    dur = T + 2.0
    n = int(dur * SR)

    # ======== BGM ========
    bgm = np.zeros((n, 2))
    bpm = 112; beat = 60 / bpm; bar = 4 * beat
    prog = [(53, [65, 69, 72, 76]), (55, [67, 71, 74, 79]), (52, [64, 67, 71, 74]), (57, [69, 72, 76, 81])]  # Fmaj7 G Em7 Am7
    groove_on = l('s1', 1)                # 鼓组在第二句进
    arp_on = S['s2']
    brk0, brk1 = S['s9'], S['s10']        # "没开源什么"段抽掉鼓
    end = T + .3
    # hook: riser -> 发动机 boom
    put(bgm, riser(1.3) * .35, l('s1', 0) - .05)
    t0 = groove_on - 2 * bar  # 对齐小节，让第二句落在小节线上
    k = 0; tb = t0
    while tb < end:
        root, ch = prog[k % 4]
        if tb + bar > 0:
            put(bgm, pad([m - 12 for m in ch], bar + .8) * .22, tb, pan=-.1)
            put(bgm, pad([m for m in ch[1:]], bar + .8) * .1, tb, pan=.15)
        for b in range(8):  # 八分音符
            tt = tb + b * beat / 2
            if tt < 0 or tt > end: continue
            drums = groove_on - .01 <= tt and not (brk0 <= tt < brk1)
            if drums:
                put(bgm, bass(root - 12, beat / 2 * .9) * .33, tt)
                if b % 4 == 0: put(bgm, kick() * .9, tt)
                if b % 4 == 2: put(bgm, clap() * .28, tt, pan=.05)
                put(bgm, hat() * (.16 if b % 2 else .09), tt + (beat / 2 if b % 2 == 0 else 0) * 0, pan=.3)
            elif tt < groove_on and tt > l('s1', 0) + 1.25:  # 钩子后段：16 分 hat 制造紧张
                put(bgm, hat(.03) * .12, tt, pan=.3); put(bgm, hat(.03) * .08, tt + beat / 4, pan=-.3)
            if tt >= arp_on and not (brk0 <= tt < brk1):
                for s16 in range(2):
                    m = ch[(b * 2 + s16) % 4] + 12
                    put(bgm, pluck(m) * .09, tt + s16 * beat / 4, pan=(.4 if s16 else -.4))
        tb += bar; k += 1
    put(bgm, boom() * .9, l('s1', 0) + 1.25)
    put(bgm, boom() * .6, S['s10'] + .1)           # 结尾回归
    fade = np.ones(n); fs = int((end - 1.8) * SR); fe = int((end + 1.2) * SR)
    fade[fs:fe] = np.linspace(1, 0, fe - fs)[:len(fade[fs:fe])]; fade[fe:] = 0
    bgm *= fade[:, None]

    # ======== SFX ========
    sfx = np.zeros((n, 2))
    a = l('s1', 0)
    put(sfx, lp(rng.standard_normal(int(1.3 * SR)), 2500) * .05, a)        # 数据流底噪
    put(sfx, slam() * .55, a + .05)
    put(sfx, tick(1800) * .25, a + .6)
    put(sfx, boom() * .55, a + 1.25)
    put(sfx, stamp() * .6, a + 2.15)
    b1 = l('s1', 1)
    for i in range(30): put(sfx, key_click() * .35, b1 + .1 + i * .036 + rng.uniform(0, .01), pan=rng.uniform(-.3, .3))
    put(sfx, whoosh(.5) * .25, b1 + .45)
    for sc in ('s2', 's4', 's5', 's7', 's8', 's9', 's10'):
        put(sfx, whoosh(.45, 300, 3000) * .22, S[sc] - .1)
    # S2
    for i in range(12): put(sfx, blip(900 + i * 60) * .18, l('s2', 2) + .4 + i * .1 + .5, pan=-.6 + i * .1)
    put(sfx, shimmer() * .3, l('s2', 3) + .3)
    put(sfx, whoosh(.7, 200, 1500) * .3, l('s2', 4) + .3)
    # S4
    for i in range(5):
        put(sfx, tick(1500) * .2, l('s4', 1) + .4 + i); put(sfx, blip(1000) * .2, l('s4', 1) + .75 + i)
    for i in range(5): put(sfx, blip(1300 + i * 80) * .18, l('s4', 2) + .3 + i * .12)
    put(sfx, sweep(.8) * .3, l('s4', 2) + 1.9)
    for i, m in enumerate((79, 81, 83, 84)): put(sfx, ding(m) * .25, l('s4', 3) + i * .15)
    put(sfx, buzz() * .35, l('s4', 3) + .75)
    put(sfx, ding(88) * .3, l('s4', 3) + 1.1)
    put(sfx, shimmer() * .25, l('s4', 4))
    # S5
    for i in range(6): put(sfx, whoosh(.25, 1500, 6000) * .1, l('s5', 1) + .5 + i * .12, pan=-.5 + i * .2)
    put(sfx, alarm(), l('s5', 1) + 1.2)
    put(sfx, whoosh(.6, 150, 1200) * .3, l('s5', 2))
    for k_, o in enumerate((.3, .65)): put(sfx, whoosh(.8, 600, 5000) * .25, l('s5', 3) + o, pan=(-.5, .5)[k_])
    put(sfx, shimmer() * .3, l('s5', 4) + .1)
    # S7
    for o in (.4, 1.0, 1.6): put(sfx, tick(1700) * .25, l('s7', 1) + o)
    for i in range(3): put(sfx, thud() * .3, l('s7', 2) + 2.6 + i * .05)
    put(sfx, ding(86) * .3, l('s7', 2) + 3.1)
    for i in range(3): put(sfx, key_click() * .4, l('s7', 2) + 3.5 + i * .1)
    # S8
    put(sfx, slam() * .3, S['s8'] + .2)
    put(sfx, blip(1100) * .25, l('s8', 0) + .8); put(sfx, blip(1500) * .25, l('s8', 0) + 1.0)
    # S9
    for o in (.3, .6): put(sfx, tick(1400) * .25, l('s9', 0) + o)
    for o in (.2, .7, 1.2): put(sfx, thud() * .4, l('s9', 1) + o)
    # S10
    put(sfx, sweep(1.6)[::-1] * .2, S['s10'] + .5)
    put(sfx, stamp() * .35, l('s10', 1))

    for name, buf in (('bgm', bgm), ('sfx', sfx)):
        pk = np.abs(buf).max() or 1
        wavfile.write(f'{out}/{name}.wav', SR, (buf / pk * .89 * 32767).astype(np.int16))
    print('ok', round(dur, 1))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
