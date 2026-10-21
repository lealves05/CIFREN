"""Folha de contato das capturas do ensaio (out/dry): uma imagem por aula para revisar os passos.
Uso: python3 sheet.py 03-abrir-os-pela-placa [...]  → out/sheet-<aula>.jpg"""
import sys, glob, os
from PIL import Image, ImageDraw
for name in sys.argv[1:]:
    files = sorted(glob.glob(f'out/dry/{name}-*.png'))
    if not files: continue
    W, H, C = 640, 400, 3
    rows = (len(files) + C - 1) // C
    sheet = Image.new('RGB', (W * C, H * rows), 'white')
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB').resize((W, H))
        ImageDraw.Draw(im).text((8, 8), os.path.basename(f)[-6:-4], fill='red')
        sheet.paste(im, ((i % C) * W, (i // C) * H))
    sheet.save(f'out/sheet-{name}.jpg', quality=70)
    print(f'out/sheet-{name}.jpg', len(files))
