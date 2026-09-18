"""Encode generated 4x2 sprite sheets as transparent reaction GIFs."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/Users/susu/.codex/generated_images/019e6784-bc0b-7450-9e04-12ea7ab55622')
SHEETS = {
    'hehe': 'exec-9a24e24f-72bb-477d-997a-7d419940addf.png',
    'question': 'exec-5e757671-2438-4185-a0e8-71eadfa5c38b.png',
    'applause': 'exec-780e69a2-4cbe-460f-92ee-b4aa314a0294.png',
}
output = ROOT / 'assets/reactions'
output.mkdir(parents=True, exist_ok=True)
for name, source in SHEETS.items():
    sheet = Image.open(SOURCE / source).convert('RGBA')
    assert sheet.getchannel('A').getextrema()[0] == 0, 'Source must have true alpha'
    frames = []
    for i in range(8):
        x, y = i % 4, i // 4
        frame = sheet.crop((round(x * sheet.width / 4), round(y * sheet.height / 2),
                            round((x + 1) * sheet.width / 4), round((y + 1) * sheet.height / 2)))
        frame = frame.resize((256, 256), Image.Resampling.LANCZOS)
        # GIF has binary alpha; reserve index 255 for transparent pixels.
        indexed = frame.convert('RGB').quantize(colors=255, method=Image.Quantize.MEDIANCUT)
        indexed.paste(255, mask=frame.getchannel('A').point(lambda a: 255 if a < 128 else 0))
        indexed.info['transparency'] = 255
        frames.append(indexed)
    frames[0].save(output / f'{name}.gif', save_all=True, append_images=frames[1:],
                   duration=[200, 160, 200, 320, 320, 120, 160, 320],
                   loop=0, transparency=255, disposal=2, optimize=False)
    with Image.open(output / f'{name}.gif') as result:
        duration = 0
        for i in range(result.n_frames):
            result.seek(i)
            duration += result.info['duration']
        assert duration == 1800 and result.n_frames == 8
        print(name, result.size, result.n_frames, duration, 'ms')
