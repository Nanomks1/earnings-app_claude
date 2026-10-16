from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, os, random
res = 'android/app/src/main/res'
PALETTE = ['#2c6e69', '#3d6a8f', '#4a7c59', '#6b5b95', '#a0623a', '#a14d63', '#4b5563', '#7a6a3a']
BLK, WHT = (0, 0, 0), (255, 255, 255)

def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def kit(base):
    b = hx(base)
    return dict(bgA=mix(b, BLK, .62), bgB=mix(b, WHT, .14), glowc=mix(b, WHT, .55), trace=mix(b, WHT, .8),
                bodyb=mix(b, WHT, .82), scr1=mix(b, BLK, .4), scr2=mix(b, BLK, .72), halo=mix(b, BLK, .5),
                shadow=mix(b, BLK, .85), wb=mix(b, WHT, .85), w1=mix(b, WHT, .55), w2=mix(b, WHT, .3),
                w3=mix(b, BLK, .15), w4=mix(b, BLK, .6), wA=mix(b, BLK, .7))

def diag(S, a, b):
    im = Image.new('RGBA', (S, S))
    d = ImageDraw.Draw(im)
    for i in range(2 * S):
        t = i / (2 * S)
        d.line([(i, 0), (0, i)], fill=tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3)) + (255,), width=4)
    return im

def glow(S, cx, cy, r, col, alpha):
    L = Image.radial_gradient('L').resize((int(2 * r), int(2 * r)))
    L = L.point(lambda v: int(max(0, 255 - v * 1.3) * alpha))
    layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    layer.paste(Image.new('RGBA', L.size, col), (int(cx - r), int(cy - r)), L)
    return layer

def lm(S, fn):
    L = Image.new('L', (S, S), 0)
    fn(ImageDraw.Draw(L))
    return L

def fillg(S, mask, a, b):
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(diag(S, a, b), (0, 0), mask)
    return out

def tint(S, mask, col):
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(Image.new('RGBA', (S, S), col), (0, 0), mask)
    return out

def rot(layer, S, ang):
    c = S / 2
    return layer.rotate(ang, resample=Image.BICUBIC, center=(c, c))

def wrench_mask(S, B):
    L = Image.new('L', (S, S), 0)
    wd = ImageDraw.Draw(L)
    c = S / 2
    hh = B * 0.05
    wd.rounded_rectangle([c - B * 0.44, c - hh, c + B * 0.10, c + hh], radius=hh, fill=255)
    hx_, hr = c + B * 0.16, B * 0.15
    wd.ellipse([hx_ - hr, c - hr, hx_ + hr, c + hr], fill=255)
    wd.rectangle([hx_ + B * 0.01, c - B * 0.065, hx_ + hr + 6, c + B * 0.065], fill=0)
    return L

def dh(d, cx, cy, h, col, sw):
    wD, wH, gap = h * 0.66, h * 0.62, h * 0.22
    x0 = cx - (wD + gap + wH) / 2
    top, bot = cy - h / 2, cy + h / 2
    sw = int(sw)
    n = 20
    xl, xa, xr = x0 + sw / 2, x0 + wD * 0.42, x0 + wD - sw / 2
    rx, ry = xr - xa, h / 2 - sw / 2
    P = [(xl, top + sw / 2), (xa, top + sw / 2)]
    for i in range(1, n):
        a = -math.pi / 2 + math.pi * i / n
        P.append((xa + rx * math.cos(a), cy + ry * math.sin(a)))
    P += [(xa, bot - sw / 2), (xl, bot - sw / 2), (xl, top + sw / 2)]
    d.line(P, fill=col, width=sw, joint='curve')
    for q in P[::n // 2]:
        d.ellipse([q[0] - sw / 2, q[1] - sw / 2, q[0] + sw / 2, q[1] + sw / 2], fill=col)
    h0 = x0 + wD + gap
    d.line([h0 + sw / 2, top + sw / 2, h0 + sw / 2, bot - sw / 2], fill=col, width=sw)
    d.line([h0 + wH - sw / 2, top + sw / 2, h0 + wH - sw / 2, bot - sw / 2], fill=col, width=sw)
    d.line([h0 + sw / 2, cy, h0 + wH - sw / 2, cy], fill=col, width=sw)

def glyph(S, B, K):
    c = S / 2
    px, py, pw, ph = c - B * 0.05, c - B * 0.01, B * 0.50, B * 0.84
    body = lm(S, lambda d: d.rounded_rectangle([px - pw / 2, py - ph / 2, px + pw / 2, py + ph / 2], radius=B * 0.09, fill=255))
    m = B * 0.035
    sb = [px - pw / 2 + m, py - ph / 2 + B * 0.07, px + pw / 2 - m, py + ph / 2 - B * 0.07]
    scr = lm(S, lambda d: d.rounded_rectangle(sb, radius=B * 0.05, fill=255))
    wm = rot(wrench_mask(S, B * 1.05), S, 45)
    whalo = wm.filter(ImageFilter.MaxFilter(int(B * 0.06) // 2 * 2 + 1))
    cx, cy, r = c + B * 0.22, c + B * 0.24, B * 0.20
    ring = lm(S, lambda d: d.ellipse([cx - r - B * 0.03, cy - r - B * 0.03, cx + r + B * 0.03, cy + r + B * 0.03], fill=255))
    coin = lm(S, lambda d: d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255))
    sil = ImageChops.lighter(ImageChops.lighter(body, whalo), ring)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.alpha_composite(tint(S, sil.filter(ImageFilter.GaussianBlur(B * 0.07)).point(lambda v: int(v * 0.55)), K['glowc'] + (255,)))
    sh = sil.transform(sil.size, Image.AFFINE, (1, 0, -B * 0.02, 0, 1, -B * 0.035)).filter(ImageFilter.GaussianBlur(B * 0.035))
    out.alpha_composite(tint(S, sh.point(lambda v: int(v * 0.65)), K['shadow'] + (255,)))
    out.alpha_composite(fillg(S, body, WHT, K['bodyb']))
    out.alpha_composite(fillg(S, scr, K['scr1'], K['scr2']))
    d = ImageDraw.Draw(out, 'RGBA')
    d.line([px - B * 0.05, py - ph / 2 + B * 0.038, px + B * 0.05, py - ph / 2 + B * 0.038], fill=K['scr2'] + (255,), width=max(2, int(B * 0.014)))
    gl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gl).polygon([(sb[0], sb[1]), (sb[0] + (sb[2] - sb[0]) * 0.62, sb[1]), (sb[0], sb[1] + (sb[3] - sb[1]) * 0.42)], fill=(255, 255, 255, 34))
    gl.putalpha(ImageChops.multiply(gl.split()[3], scr))
    out.alpha_composite(gl)
    out.alpha_composite(tint(S, whalo, K['halo'] + (255,)))
    out.alpha_composite(fillg(S, wm, WHT, K['wb']))
    out.alpha_composite(tint(S, ring, K['halo'] + (255,)))
    out.alpha_composite(fillg(S, coin, (255, 236, 150), (238, 160, 40)))
    d = ImageDraw.Draw(out, 'RGBA')
    d.ellipse([cx - r * 0.86, cy - r * 0.86, cx + r * 0.86, cy + r * 0.86], outline=(255, 250, 220, 150), width=max(2, int(B * 0.008)))
    dh(d, cx, cy, B * 0.14, (110, 60, 10, 255), B * 0.03)
    return out, (px, py, pw, ph)

def circuit(S, B, box, K):
    px, py, pw, ph = box
    im = diag(S, K['bgA'], K['bgB'])
    c = S / 2
    im.alpha_composite(glow(S, c, c, S * 0.62, K['glowc'] + (255,), 0.5))
    tr = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(tr)
    rnd = random.Random(11)
    w = max(3, int(S * 0.005))
    col = K['trace'] + (255,)
    u = S / 24

    def trace(pts):
        d.line(pts, fill=col, width=w, joint='curve')
        r = S * 0.011
        e = pts[-1]
        d.ellipse([e[0] - r, e[1] - r, e[0] + r, e[1] + r], outline=col, width=w)

    L, R = px - pw / 2, px + pw / 2
    for i, fy in enumerate([-0.30, -0.14, 0.04, 0.2, 0.34]):
        y = py + ph * fy * 0.55
        for side in (-1, 1):
            x0 = L if side < 0 else R
            x1 = x0 + side * B * (0.10 + 0.06 * (i % 3))
            dy = B * (0.08 + 0.03 * i) * (1 if i % 2 else -1)
            x2 = x1 + side * abs(dy)
            x3 = x2 + side * B * (0.12 + 0.05 * ((i + 1) % 3))
            trace([(x0, y), (x1, y), (x2, y + dy), (x3, y + dy)])
    for _ in range(14):
        x, y = rnd.randrange(24) * u, rnd.randrange(24) * u
        pts = [(x, y)]
        for _ in range(3):
            dx, dy = rnd.choice([(1, 0), (0, 1), (1, 1), (-1, 0), (0, -1), (-1, -1), (1, -1), (-1, 1)])
            n = rnd.randint(2, 4)
            x += dx * n * u
            y += dy * n * u
            pts.append((x, y))
        trace(pts)
    fade = Image.radial_gradient('L').resize((S, S)).point(lambda v: int(max(0, 255 - v * 0.9)))
    tr.putalpha(ImageChops.multiply(tr.split()[3], fade.point(lambda v: int(40 + v * 0.8))))
    im.alpha_composite(tr.filter(ImageFilter.GaussianBlur(S * 0.006)).point(lambda v: min(255, int(v * 1.6))))
    im.alpha_composite(tr)
    return im

def waves(S, B, box, K):
    px, py, pw, ph = box
    im = diag(S, K['wA'], K['bgB'])
    c = S / 2
    im.alpha_composite(glow(S, S * 0.5, S * 0.55, S * 0.7, K['glowc'] + (255,), 0.55))
    cols = [K['w1'] + (70,), K['w2'] + (80,), (255, 255, 255, 40), K['w3'] + (95,), K['w4'] + (120,)]
    for i, cc in enumerate(cols):
        lay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(lay)
        y0, amp, p = S * (0.42 + 0.11 * i), S * (0.06 + 0.01 * i), i * 1.3
        step = max(4, S // 150)
        pts = [(x, y0 + amp * math.sin(x / S * 2 * math.pi * 1.2 + p) + amp * 0.4 * math.sin(x / S * 2 * math.pi * 2.5 + p * 2)) for x in range(0, S + step, step)]
        d.polygon(pts + [(S, S), (0, S)], fill=cc)
        d.line(pts, fill=(255, 255, 255, 110), width=max(3, int(S * 0.005)))
        im.alpha_composite(lay)
    im.alpha_composite(glow(S, px + B * 0.1, py + ph / 2 + B * 0.02, B * 0.55, K['glowc'] + (255,), 0.55))
    ell = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ell).ellipse([c - B * 0.34, py + ph / 2 - B * 0.01, c + B * 0.5, py + ph / 2 + B * 0.07], fill=K['shadow'] + (110,))
    im.alpha_composite(ell.filter(ImageFilter.GaussianBlur(B * 0.03)))
    return im

def art(style, base, S=720):
    K = kit(base)
    g, box = glyph(S, S * 0.62, K)
    bg = (circuit if style == 'a' else waves)(S, S * 0.62, box, K)
    bg.alpha_composite(g)
    return bg

os.makedirs(f'{res}/drawable-nodpi', exist_ok=True)
os.makedirs(f'{res}/mipmap-anydpi-v26', exist_ok=True)
os.makedirs(f'{res}/mipmap-xxxhdpi', exist_ok=True)
os.makedirs(f'{res}/values', exist_ok=True)
colors = ['<?xml version="1.0" encoding="utf-8"?>', '<resources>']
adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/work_ic_bg_%s"/>\n    <foreground android:drawable="@drawable/ic_%s_fg"/>\n</adaptive-icon>\n'
mask = Image.new('L', (192 * 4, 192 * 4), 0)
ImageDraw.Draw(mask).ellipse([0, 0, 192 * 4 - 1, 192 * 4 - 1], fill=255)
mask = mask.resize((192, 192), Image.LANCZOS)
for i, base in enumerate(PALETTE):
    colors.append('    <color name="work_ic_bg_%d">#%02x%02x%02x</color>' % ((i,) + kit(base)['bgA']))
    for style in 'ab':
        key = f'{style}{i}'
        A = art(style, base)
        fg = Image.new('RGBA', (432, 432))
        fg.paste(A.resize((432, 432), Image.LANCZOS).filter(ImageFilter.GaussianBlur(14)), (0, 0))
        fg.paste(A.resize((288, 288), Image.LANCZOS), (72, 72))
        fg.save(f'{res}/drawable-nodpi/ic_{key}_fg.png')
        leg = Image.new('RGBA', (192, 192), (0, 0, 0, 0))
        leg.paste(A.resize((192, 192), Image.LANCZOS), (0, 0), mask)
        leg.save(f'{res}/mipmap-xxxhdpi/ic_{key}.png')
        open(f'{res}/mipmap-anydpi-v26/ic_{key}.xml', 'w').write(adaptive % (i, key))
        if key == 'a0':
            for dpi, px_ in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
                os.makedirs(f'{res}/mipmap-{dpi}', exist_ok=True)
                small = leg.resize((px_, px_), Image.LANCZOS)
                small.save(f'{res}/mipmap-{dpi}/ic_launcher.png')
                small.save(f'{res}/mipmap-{dpi}/ic_launcher_round.png')
            for n in ('ic_launcher', 'ic_launcher_round'):
                open(f'{res}/mipmap-anydpi-v26/{n}.xml', 'w').write(adaptive % (0, 'a0'))
colors.append('</resources>')
open(f'{res}/values/work_icon_colors.xml', 'w').write('\n'.join(colors) + '\n')

# manifest: launcher entries move from MainActivity to 16 switchable aliases
M = 'android/app/src/main/AndroidManifest.xml'
t = open(M, encoding='utf-8').read()
import re
LAUNCH = re.compile(r'[ \t]*<category android:name="android.intent.category.LAUNCHER"\s*/>[ \t]*\n?')
if not LAUNCH.search(t):
    raise SystemExit('launcher category not found in manifest')
t = LAUNCH.sub('', t, count=1)
al = ''
for style in 'ab':
    for i in range(8):
        k = f'{style}{i}'
        al += ('    <activity-alias android:name=".Ic_%s" android:targetActivity=".MainActivity" android:enabled="%s" android:exported="true" '
               'android:icon="@mipmap/ic_%s" android:roundIcon="@mipmap/ic_%s" android:label="@string/app_name">\n'
               '        <intent-filter>\n            <action android:name="android.intent.action.MAIN"/>\n'
               '            <category android:name="android.intent.category.LAUNCHER"/>\n        </intent-filter>\n    </activity-alias>\n') % (k, 'true' if k == 'a0' else 'false', k, k)
t = t.replace('</application>', al + '</application>', 1)
open(M, 'w', encoding='utf-8').write(t)
print('icons ok')
