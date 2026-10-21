"""Revisão da aula pronta: um quadro no meio de cada legenda (out/qa-<aula>.jpg). Uso: python3 qa.py <aula> [...]"""
import sys, re, subprocess
from PIL import Image, ImageDraw
for name in sys.argv[1:]:
    vtt = open(f'out/final/{name}.vtt', encoding='utf-8').read()
    cues = re.findall(r'(\d\d):(\d\d):(\d\d\.\d+) --> (\d\d):(\d\d):(\d\d\.\d+)\n(.+)', vtt)
    ims = []
    for c in cues:
        a = int(c[0]) * 3600 + int(c[1]) * 60 + float(c[2]); b = int(c[3]) * 3600 + int(c[4]) * 60 + float(c[5])
        t = a + (b - a) * 0.6
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{t:.2f}', '-i', f'out/final/{name}.mp4', '-frames:v', '1', '-vf', 'scale=480:-1', 'out/qa_f.png'], check=True)
        im = Image.open('out/qa_f.png').convert('RGB'); ImageDraw.Draw(im).text((6, 4), f'{t:.0f}s', fill='red'); ims.append(im)
    w, h = ims[0].size; C = 4; R = (len(ims) + C - 1) // C
    s = Image.new('RGB', (w * C, h * R), 'white')
    for i, im in enumerate(ims): s.paste(im, ((i % C) * w, (i // C) * h))
    s.save(f'out/qa-{name}.jpg', quality=70); print(f'out/qa-{name}.jpg', len(ims))
