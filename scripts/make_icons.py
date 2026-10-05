# 주루윷놀이 앱 아이콘: 밤 남색 배경 + 핑크 네온 고리 + 주황 빛을 받는 윷가락 4개
# python3 scripts/make_icons.py  →  public/icons/*.png 덮어씀
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

S = 2048  # 크게 그린 뒤 줄여서 계단 현상 없앰
OUT = 'public/icons/'


def radial_bg(size):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    cx, cy = size * 0.5, size * 0.42
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (size * 0.75)
    d = np.clip(d, 0, 1)[..., None]
    inner = np.array([40, 34, 82], np.float32)
    outer = np.array([10, 11, 24], np.float32)
    rgb = inner * (1 - d) + outer * d
    # 아래쪽 주황 간판 불빛
    d2 = np.sqrt((x - size * 0.5) ** 2 + (y - size * 1.05) ** 2) / (size * 0.6)
    glow = np.clip(1 - d2, 0, 1)[..., None] ** 2
    rgb = rgb + glow * np.array([120, 50, 0], np.float32)
    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    a = np.full((size, size, 1), 255, np.uint8)
    return Image.fromarray(np.concatenate([rgb, a], axis=2), 'RGBA')


def neon_ring(size, r, w, color, blur):
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = size / 2
    d.ellipse([c - r, c - r, c + r, c + r], outline=color + (255,), width=w)
    glow = layer.filter(ImageFilter.GaussianBlur(blur))
    core = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(core).ellipse([c - r, c - r, c + r, c + r], outline=(255, 214, 230, 255), width=max(2, w // 3))
    out = Image.alpha_composite(glow, glow)
    out = Image.alpha_composite(out, layer)
    return Image.alpha_composite(out, core)


def stick(w, h, flat):
    """윷가락 한 개 (세로). flat=True 면 배(X 무늬), False 면 등(둥근 면)"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    # 가로 방향 그라데이션으로 입체감
    xs = np.linspace(-1, 1, w, dtype=np.float32)
    if flat:
        base = np.array([246, 227, 189], np.float32)
        edge = np.array([226, 194, 140], np.float32)
        t = np.abs(xs) ** 2.2
    else:
        base = np.array([196, 138, 80], np.float32)
        edge = np.array([118, 70, 28], np.float32)
        t = np.abs(xs) ** 1.4
    col = base * (1 - t[:, None]) + edge * t[:, None]
    grad = np.repeat(col[None, :, :], h, axis=0).astype(np.uint8)
    a = np.full((h, w, 1), 255, np.uint8)
    tex = Image.fromarray(np.concatenate([grad, a], axis=2), 'RGBA')
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=w // 2, fill=255)
    im.paste(tex, (0, 0), mask)
    d = ImageDraw.Draw(im)
    outline = (150, 100, 50, 255) if flat else (84, 48, 16, 255)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=w // 2, outline=outline, width=max(4, w // 22))
    if flat:
        # X 무늬 3개
        m = int(w * 0.24)
        lw = max(6, w // 12)
        for k in range(3):
            cy = int(h * (0.25 + 0.25 * k))
            half = int(w * 0.22)
            cx = w // 2
            d.line([cx - half, cy - half, cx + half, cy + half], fill=(59, 36, 16, 255), width=lw)
            d.line([cx - half, cy + half, cx + half, cy - half], fill=(59, 36, 16, 255), width=lw)
    else:
        # 등 쪽 하이라이트
        hl = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(hl).rounded_rectangle([int(w * 0.28), int(h * 0.06), int(w * 0.42), int(h * 0.94)], radius=w // 8, fill=(255, 225, 180, 70))
        im = Image.alpha_composite(im, hl.filter(ImageFilter.GaussianBlur(w // 20)))
    return im


def draw_icon(scale=1.0, ring=True, ss=0.84):
    img = radial_bg(S)
    if ring:
        img = Image.alpha_composite(img, neon_ring(S, int(760 * scale), int(34 * scale), (255, 77, 141), int(46 * scale)))
    sw, sh = int(200 * scale * ss), int(1000 * scale * ss)
    gap = int(40 * scale * ss)
    flats = [True, False, True, True]  # 걸 모양
    angles = [-11, -3.8, 3.8, 11]
    total = 4 * sw + 3 * gap
    x0 = (S - total) // 2
    top = (S - sh) // 2 + int(10 * scale)
    pivot = (S // 2, top + int(sh * 1.45))
    sticks_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    for i in range(4):
        st = stick(sw, sh, flats[i])
        layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        layer.paste(st, (x0 + i * (sw + gap), top), st)
        layer = layer.rotate(-angles[i], resample=Image.BICUBIC, center=pivot)
        sticks_layer = Image.alpha_composite(sticks_layer, layer)
    # 주황 네온 빛 (윷가락 뒤)
    alpha = sticks_layer.split()[3]
    glow = Image.new('RGBA', (S, S), (255, 122, 26, 0))
    glow.putalpha(alpha.filter(ImageFilter.GaussianBlur(int(70 * scale))).point(lambda v: min(255, int(v * 1.25))))
    img = Image.alpha_composite(img, glow)
    # 그림자
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    shadow.putalpha(alpha.filter(ImageFilter.GaussianBlur(int(18 * scale))).point(lambda v: int(v * 0.6)))
    img = Image.alpha_composite(img, shadow.transform(shadow.size, Image.AFFINE, (1, 0, 0, 0, 1, -int(24 * scale))))
    img = Image.alpha_composite(img, sticks_layer)
    return img


big = draw_icon(1.0, ring=True)
big.convert('RGB').resize((512, 512), Image.LANCZOS).save(OUT + 'icon-512.png', optimize=True)
big.convert('RGB').resize((192, 192), Image.LANCZOS).save(OUT + 'icon-192.png', optimize=True)
big.convert('RGB').resize((180, 180), Image.LANCZOS).save(OUT + 'apple-touch-icon.png', optimize=True)
# 마스커블: 안전 영역(가운데 80%) 안으로 조금 작게
mask = draw_icon(0.82, ring=True)
mask.convert('RGB').resize((512, 512), Image.LANCZOS).save(OUT + 'maskable-512.png', optimize=True)
# 파비콘: 둥근 사각형 배경
fav = draw_icon(1.0, ring=False).resize((256, 256), Image.LANCZOS)
m = Image.new('L', (256, 256), 0)
ImageDraw.Draw(m).rounded_rectangle([0, 0, 255, 255], radius=56, fill=255)
fav.putalpha(m)
fav.resize((64, 64), Image.LANCZOS).save(OUT + 'favicon-64.png', optimize=True)
print('icons written')
