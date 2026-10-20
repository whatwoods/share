"""一次请求生成全片配音（Gemini TTS）。只用 Python 标准库，可直接在本机运行。

用法:
  export GEMINI_API_KEY=...
  python3 tts_batch.py --voice <音色名> [--model <模型>] [--dry-run]

- 从 ../v3.html 的 SCRIPT 里读台词，整篇拼成一个请求，只调用 1 次 API。
- 已经生成过 voice_raw.wav 时直接退出，避免误耗 RPD；要重来加 --force。
- --dry-run 只打印要发送的文本，不请求。
"""
import argparse, base64, json, os, re, sys, urllib.request, wave

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, '..', 'v3.html')
OUT = os.path.join(HERE, 'voice_raw.wav')

STYLE = (
    "请朗读下面这段科技短视频的中文口播。\n"
    "风格：像跟懂行的朋友聊天，轻松自然、带一点兴奋，语速偏快但吐字清楚，句尾不要拖长音。\n"
    "第一行要干脆有冲击力：「发动机」重读，「开源了」短促收住。\n"
    "每一行是一句独立的口播，行与行之间停顿大约半秒；同一行里的逗号只做很短的气口。\n"
    "只读台词本身，不要读出这些说明。\n\n"
)


def load_lines():
    s = open(HTML, encoding='utf-8').read()
    body = re.search(r'const SCRIPT=\{(.*?)\n\};', s, re.S).group(1)
    out = []
    for sid, arr in re.findall(r'(\w+):\[(.*?)\](?=,?\n)', body + '\n', re.S):
        for ln in re.findall(r'"(.*?)"', arr):
            out.append({'id': sid, 'text': re.sub(r'\[\[|\]\]', '', ln.lstrip('!'))})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', required=True, help='Gemini 预置音色名，与「游戏设计手记」保持一致')
    ap.add_argument('--model', default='gemini-2.5-flash-preview-tts')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    lines = load_lines()
    json.dump(lines, open(os.path.join(HERE, 'script.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    text = STYLE + '\n'.join(l['text'] for l in lines)
    if a.dry_run:
        print(text); print(f'\n共 {len(lines)} 行，{len(text)} 字'); return
    if os.path.exists(OUT) and not a.force:
        sys.exit(f'{OUT} 已存在，为避免重复请求已跳过（确需重来请加 --force）')
    key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not key:
        sys.exit('缺少 GEMINI_API_KEY 环境变量')

    body = {
        'contents': [{'parts': [{'text': text}]}],
        'generationConfig': {
            'responseModalities': ['AUDIO'],
            'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': a.voice}}},
        },
    }
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{a.model}:generateContent'
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': key})
    print(f'请求 1 次：{a.model} / {a.voice} / {len(lines)} 行 ...')
    with urllib.request.urlopen(req, timeout=600) as r:
        resp = json.load(r)
    part = resp['candidates'][0]['content']['parts'][0]['inlineData']
    pcm = base64.b64decode(part['data'])
    rate = int(re.search(r'rate=(\d+)', part.get('mimeType', '')).group(1)) if 'rate=' in part.get('mimeType', '') else 24000
    with wave.open(OUT, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    print(f'已保存 {OUT}（{len(pcm) / 2 / rate:.1f} 秒）')


if __name__ == '__main__':
    main()
