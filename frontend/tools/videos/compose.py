"""Monta as vídeo-aulas: corta a gravação, posiciona cada fala no instante em que a legenda apareceu,
normaliza o áudio e gera .mp4 (H.264 + AAC), .vtt (mesmas falas), capa e miniatura.
Uso: python3 compose.py [--sync] [arquivo ...]   (sem argumentos: todas as gravações em out/raw)
--sync: com a máquina sobrecarregada, o vídeo gravado pode "atrasar" em relação ao relógio; a opção localiza na imagem o
instante em que cada legenda apareceu e posiciona a narração e o .vtt nesse instante (vídeo, voz e legenda juntos)."""
import json, os, subprocess, sys, glob

RAW, TTS, OUT = 'out/raw', 'out/tts', 'out/final'
os.makedirs(OUT, exist_ok=True)
durs = json.load(open(os.path.join(TTS, 'durations.json')))


def ts(s):
    s = max(0.0, s)
    h, r = divmod(s, 3600)
    m, r = divmod(r, 60)
    return f'{int(h):02d}:{int(m):02d}:{r:06.3f}'


def caption_changes(src, fps=10, w=300, h=30):
    """Instantes (s) em que a área central da legenda muda na gravação."""
    import numpy as np
    p = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', src, '-vf', f'fps={fps},crop={w}:{h}:490:737,format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True)
    a = np.frombuffer(p.stdout, dtype=np.uint8).reshape(-1, h, w).astype(np.int16)
    d = np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))
    out = []
    for i, v in enumerate(d):
        t = (i + 1) / fps
        if v > 6 and (not out or t - out[-1] > 0.6):
            out.append(t)
    return out


def sync(tl, src):
    """Troca o instante de relógio de cada fala pelo instante em que a legenda aparece no vídeo."""
    ch = caption_changes(src)
    off, used = 0.0, -1.0
    for c in tl['cues']:
        pred = c['at'] + off
        cand = [t for t in ch if t > used + 0.3 and pred - 0.8 <= t <= pred + 4.0]
        if cand:
            t = min(cand, key=lambda x: abs(x - pred - 0.3))
            off, used = t - c['at'], t
        c['at'] = c['at'] + off
    tl['end'] = tl['end'] + off
    print(f'  sincronia: atraso final do vídeo {off:.1f}s')


def compose(name, do_sync=False):
    tl = json.load(open(os.path.join(RAW, f'{name}.json')))
    src = os.path.join(RAW, f'{name}.webm')
    if do_sync:
        sync(tl, src)
    start, end = tl['start'], tl['end']
    length = end - start
    cues = [c for c in tl['cues'] if c['at'] >= start - 0.5]
    args = ['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{start:.3f}', '-i', src]
    flt = []
    for i, c in enumerate(cues):
        args += ['-i', os.path.join(TTS, f"{c['id']}.wav")]
        d = max(0, int((c['at'] - start) * 1000))
        flt.append(f'[{i + 1}:a]aresample=48000,adelay={d}|{d}[a{i}]')
    flt.append(''.join(f'[a{i}]' for i in range(len(cues))) + f'amix=inputs={len(cues)}:normalize=0:dropout_transition=0,'
               'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]')
    out = os.path.join(OUT, f'{name}.mp4')
    args += ['-filter_complex', ';'.join(flt), '-map', '0:v', '-map', '[aout]', '-r', '25',
             '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
             '-c:a', 'aac', '-b:a', '80k', '-ac', '1', '-t', f'{length:.3f}', '-movflags', '+faststart', out]
    subprocess.run(args, check=True)
    # legendas / transcrição (WebVTT)
    lines = ['WEBVTT', '']
    for i, c in enumerate(cues):
        a = c['at'] - start
        b = a + durs[c['id']] + 0.25
        if i + 1 < len(cues):
            b = min(b, cues[i + 1]['at'] - start - 0.02)
        lines += [str(i + 1), f'{ts(a)} --> {ts(min(b, length))}', c['text'], '']
    open(os.path.join(OUT, f'{name}.vtt'), 'w', encoding='utf-8').write('\n'.join(lines))
    # capa (cartão de abertura) e miniatura (meio da aula)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '1.6', '-i', out, '-frames:v', '1', '-q:v', '4', os.path.join(OUT, f'{name}-capa.jpg')], check=True)
    mid = cues[len(cues) // 2]['at'] - start + 1.0 if len(cues) > 2 else length / 2
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{mid:.2f}', '-i', out, '-frames:v', '1', '-vf', 'scale=320:200', '-q:v', '5', os.path.join(OUT, f'{name}.jpg')], check=True)
    size = os.path.getsize(out) / 1e6
    print(f'{name}: {length:.0f}s, {len(cues)} falas, {size:.1f} MB')


SYNC = '--sync' in sys.argv
names = [a for a in sys.argv[1:] if not a.startswith('--')] or sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(RAW, '*.json')))
for n in names:
    if os.path.exists(os.path.join(RAW, f'{n}.webm')):
        compose(n, SYNC)
