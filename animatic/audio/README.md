# 配音 / BGM / 音效

## 流程（只调用 1 次 TTS）

1. **生成配音**（在有 `GEMINI_API_KEY` 的机器上跑，只依赖 Python 标准库）：
   ```bash
   cd animatic/audio
   python3 tts_batch.py --voice <与「游戏设计手记」相同的音色名> [--model <同款模型>] --dry-run   # 先看要发的文本
   python3 tts_batch.py --voice <音色名> [--model <模型>]                                        # 真正请求 1 次
   ```
   整篇 26 句台词拼成一个请求，输出 `voice_raw.wav`。文件已存在时会拒绝重复请求（避免浪费 RPD），重来需加 `--force`。
2. **提交 `voice_raw.wav`**，然后在仓库根目录跑 `animatic/build.sh`：
   - `align.py`：按停顿把整条配音切成 26 句，重新拼接成画面节奏（句间 0.12s、换场 0.35s），总长超 89.5s 时整体轻微提速（最多 ×1.12），并打印每句体检结果；
   - `gen_audio.py`：按真实配音时间轴重新生成 BGM 和音效；
   - 渲染 1080×1920 画面，配音压 BGM（sidechain ducking）后混音，输出 `deepinfer_final.mp4`。

## 文件

| 文件 | 说明 |
|---|---|
| `tts_batch.py` | 一次请求生成全片配音 |
| `align.py` | 切句、对齐、导出 `voice_timing.js` / `timeline_vo.json` |
| `gen_audio.py` | 程序化合成 BGM 与音效（无版权素材），按时间轴卡点 |
| `bgm.wav` / `sfx.wav` | 按估算时间轴生成的版本，用于无配音预览 |
