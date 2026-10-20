"""把一整条配音切成逐句片段，按画面节奏重新拼接，并导出时间轴。

用法: python3 align.py
输入: voice_raw.wav, script.json（tts_batch.py 生成）
输出: voice.wav, voice_timing.js（画面读取）, timeline_vo.json（gen_audio.py 读取）
"""
import json, os, re, subprocess, sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
SR = 44100
LEAD, GAP_LINE, GAP_SCENE, TAIL = .1, .12, .35, 1.2
MAX_TOTAL = 89.5


def silences(path, db=-38, d=.18):
    log = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', f'silencedetect=noise={db}dB:d={d}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
    en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    return list(zip(st, en))


def main():
    lines = json.load(open(os.path.join(HERE, 'script.json'), encoding='utf-8'))
    raw = os.path.join(HERE, 'voice_raw.wav')
    sr, x = wavfile.read(raw)
    x = x.astype(np.float32) / 32768
    if x.ndim > 1: x = x.mean(1)
    total = len(x) / sr
    sil = silences(raw)
    # 去掉首尾静音，在中间的停顿里挑最长的 N-1 个作为句界
    head = sil[0][1] if sil and sil[0][0] < .05 else 0
    tail = sil[-1][0] if sil and sil[-1][1] > total - .05 else total
    inner = [s for s in sil if s[0] > head and s[1] < tail]
    need = len(lines) - 1
    if len(inner) < need:
        sys.exit(f'只检测到 {len(inner)} 个停顿，少于 {need} 个句界；可调低 silencedetect 的 d 或检查音频')
    cuts = sorted(sorted(inner, key=lambda s: s[1] - s[0], reverse=True)[:need])
    bounds = [head] + [c for s in cuts for c in s] + [tail]
    segs = [(bounds[2 * i], bounds[2 * i + 1]) for i in range(len(lines))]

    # 体检：每句时长/字数比，偏离中位数太多说明切错了
    rate = [(e - s) / max(1, len(l['text'])) for (s, e), l in zip(segs, lines)]
    med = float(np.median(rate))
    for i, ((s, e), l, r) in enumerate(zip(segs, lines, rate)):
        flag = '  <-- 可疑' if r < med * .5 or r > med * 1.8 else ''
        print(f'{i:2d} {s:6.2f}-{e:6.2f} ({e - s:4.2f}s) {l["text"][:22]}{flag}')

    # 重新拼接：句间/场景间的停顿由我们控制
    clips = [x[int(s * sr):int(e * sr)] for s, e in segs]
    gaps = [GAP_SCENE if i + 1 < len(lines) and lines[i + 1]['id'] != lines[i]['id'] else GAP_LINE for i in range(len(lines))]
    speech = sum(len(c) for c in clips) / sr
    tempo = 1.0
    if LEAD + speech + sum(gaps[:-1]) + TAIL > MAX_TOTAL:
        tempo = min(1.12, (speech) / (MAX_TOTAL - LEAD - sum(gaps[:-1]) - TAIL))
        print(f'总长超出，配音整体加速 ×{tempo:.3f}')
    out, tl, t = [], [], LEAD
    out.append(np.zeros(int(LEAD * SR)))
    for i, (c, l) in enumerate(zip(clips, lines)):
        c = resample_poly(c, SR, sr).astype(np.float32)
        if tempo != 1.0:
            tmp_in, tmp_out = os.path.join(HERE, '_in.wav'), os.path.join(HERE, '_out.wav')
            wavfile.write(tmp_in, SR, c)
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp_in, '-af', f'atempo={tempo:.4f}', tmp_out], check=True)
            c = wavfile.read(tmp_out)[1].astype(np.float32)
            os.remove(tmp_in); os.remove(tmp_out)
        d = len(c) / SR
        tl.append({'id': l['id'], 't': round(t, 3), 'd': round(d + gaps[i], 3), 'text': l['text']})
        out += [c, np.zeros(int(gaps[i] * SR))]
        t += d + gaps[i]
    T = t + TAIL
    out.append(np.zeros(int(TAIL * SR)))
    v = np.concatenate(out)
    v = v / (np.abs(v).max() or 1) * .9
    wavfile.write(os.path.join(HERE, 'voice.wav'), SR, (v * 32767).astype(np.int16))
    json.dump({'T': T, 'tl': tl}, open(os.path.join(HERE, 'timeline_vo.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(os.path.join(HERE, 'voice_timing.js'), 'w', encoding='utf-8').write(
        'window.VO=' + json.dumps({'T': round(T, 3), 'lines': [{'t': x['t'], 'd': x['d']} for x in tl]}) + ';\n')
    print(f'完成：{len(lines)} 句，总长 {T:.1f}s')


if __name__ == '__main__':
    main()
