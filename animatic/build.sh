#!/usr/bin/env bash
# 一键出片：配音切句对齐 → 生成 BGM/音效 → 渲染画面 → 混音
# 前置：audio/voice_raw.wav（由 audio/tts_batch.py 生成）
set -euo pipefail
cd "$(dirname "$0")"
OUT=${OUT:-deepinfer_final.mp4}
python3 audio/align.py
python3 audio/gen_audio.py audio/timeline_vo.json audio
T=$(python3 -c "import json;print(json.load(open('audio/timeline_vo.json'))['T'])")
FR=$(mktemp -d)
node tools/render.mjs "file://$PWD/v3.html" "$FR" video 24 "$T"
ffmpeg -hide_banner -loglevel error -y -framerate 24 -i "$FR/f%05d.jpg" -vf scale=1080:1920 -c:v libx264 -pix_fmt yuv420p -crf 18 _video.mp4
rm -rf "$FR"
ffmpeg -hide_banner -loglevel error -y -i _video.mp4 -i audio/voice.wav -i audio/bgm.wav -i audio/sfx.wav -filter_complex \
 "[1]asplit=2[v][key];[2]volume=0.42[b];[b][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350[bd];[3]volume=0.75[s];[v][bd][s]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]" \
 -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 44100 -shortest -movflags +faststart "$OUT"
rm -f _video.mp4
echo "done: $OUT"
