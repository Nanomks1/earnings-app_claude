from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, os, random
res = 'android/app/src/main/res'
# لون الأيقونة المقابل لكل لون من ألوان التطبيق (نفس ترتيب PALETTE في app.js)
PALETTE = ['#26a69a', '#4a90d9', '#4caf50', '#7e57c2', '#ff7043', '#ec407a', '#607d8b', '#ffb300', '#ff5a5f', '#29a9e8', '#8bc34a', '#5c6bc0']
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
adaptive = '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@drawable/ic_%s_bg"/>\n    <foreground android:drawable="@drawable/ic_%s_fg"/>\n    <monochrome android:drawable=\"@drawable/ic_mono\"/>\n</adaptive-icon>\n'
# themed-icon layer: single-shape silhouette (the system tints it), same for every colour
def mono_mask(S, B):
    c = S / 2
    px, py, pw, ph = c - B * 0.05, c - B * 0.01, B * 0.50, B * 0.84
    body = lm(S, lambda d: d.rounded_rectangle([px - pw / 2, py - ph / 2, px + pw / 2, py + ph / 2], radius=B * 0.09, fill=255))
    wm = rot(wrench_mask(S, B * 1.05), S, 45)
    whalo = wm.filter(ImageFilter.MaxFilter(int(B * 0.06) // 2 * 2 + 1))
    cx, cy, r = c + B * 0.22, c + B * 0.24, B * 0.20
    ring = lm(S, lambda d: d.ellipse([cx - r - B * 0.03, cy - r - B * 0.03, cx + r + B * 0.03, cy + r + B * 0.03], fill=255))
    coin = lm(S, lambda d: d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255))
    m = ImageChops.subtract(body, ImageChops.lighter(whalo, ring))
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([px - B * 0.06, py - ph / 2 + B * 0.035, px + B * 0.06, py - ph / 2 + B * 0.06], radius=B * 0.012, fill=0)
    m = ImageChops.lighter(ImageChops.lighter(m, wm), coin)
    dh(ImageDraw.Draw(m), cx, cy, B * 0.14, 0, B * 0.03)
    return m

MS = 720
mm = mono_mask(MS, MS * 0.62).resize((331, 331), Image.LANCZOS)
mono_a = Image.new('L', (432, 432), 0)
mono_a.paste(mm, (50, 50))
mono = Image.new('RGBA', (432, 432), (255, 255, 255, 0))
mono.putalpha(mono_a)
mono.save(f'{res}/drawable-nodpi/ic_mono.png')

mask = Image.new('L', (192 * 4, 192 * 4), 0)
ImageDraw.Draw(mask).ellipse([0, 0, 192 * 4 - 1, 192 * 4 - 1], fill=255)
mask = mask.resize((192, 192), Image.LANCZOS)

# ---- الأشكال الثلاثة: a أفق، b وهج، c شرائح (الخلفية والمقدمة ملفان منفصلان) ----
S0, O, W = 720, 180, 1080          # الدائرة الظاهرة 720 داخل لوحة 1080 (108dp)
B0 = S0 * 0.62 * 1.3
c0 = S0 / 2
px, py, pw, ph = c0 - B0 * 0.05, c0 - B0 * 0.01, B0 * 0.50, B0 * 0.84
def M(fn): return lm(S0, fn)
_body = M(lambda d: d.rounded_rectangle([px - pw / 2, py - ph / 2, px + pw / 2, py + ph / 2], radius=B0 * 0.09, fill=255))
_scr = M(lambda d: d.rounded_rectangle([px - pw / 2 + B0 * 0.04, py - ph / 2 + B0 * 0.08, px + pw / 2 - B0 * 0.04, py + ph / 2 - B0 * 0.055], radius=B0 * 0.05, fill=255))
_wm = rot(wrench_mask(S0, B0 * 1.05), S0, 45)
_halo = _wm.filter(ImageFilter.MaxFilter(int(B0 * 0.06) // 2 * 2 + 1))
ccx, ccy, cr = c0 + B0 * 0.22, c0 + B0 * 0.24, B0 * 0.20
_ring = M(lambda d: d.ellipse([ccx - cr - B0 * 0.035, ccy - cr - B0 * 0.035, ccx + cr + B0 * 0.035, ccy + cr + B0 * 0.035], fill=255))
_coin = M(lambda d: d.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=255))
_gap = ImageChops.lighter(_halo, _ring)
_bodyc = ImageChops.subtract(_body, _gap)
_scrc = ImageChops.subtract(_scr, _gap)
_frame = ImageChops.subtract(_bodyc, _scrc)
_dh = M(lambda d: None)
dh(ImageDraw.Draw(_dh), ccx, ccy, B0 * 0.14, 255, B0 * 0.03)
def place(m):
    c = Image.new('L', (W, W), 0)
    c.paste(m, (O, O))
    return c
P = {k: place(v) for k, v in dict(bodyc=_bodyc, scrc=_scrc, frame=_frame, wm=_wm, coin=_coin, dh=_dh).items()}
OW, SL, WH = (238, 242, 245, 255), (74, 90, 100, 255), (255, 255, 255, 255)
def put(img, name, col):
    img.paste(Image.new('RGBA', (W, W), col), (0, 0), P[name])
def rgba(t): return tuple(t) + (255,)

def bg_a(base, i):
    im = Image.new('RGBA', (W, W), rgba(base))
    low = Image.new('L', (W, W), 0)
    ImageDraw.Draw(low).ellipse([O - 0.55 * S0, O + 0.60 * S0, O + 1.55 * S0, O + 2.2 * S0], fill=255)
    im.paste(Image.new('RGBA', (W, W), SL), (0, 0), low)
    return im
def fg_a(base, i):
    g = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    put(g, 'bodyc', OW); put(g, 'scrc', SL); put(g, 'wm', OW); put(g, 'coin', rgba(base)); put(g, 'dh', SL)
    return g
def bg_b(base, i):
    return diag(W, mix(base, WHT, .10), mix(base, BLK, .30))
def fg_b(base, i):
    g = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    put(g, 'frame', WH); put(g, 'wm', WH); put(g, 'coin', WH); put(g, 'dh', rgba(mix(base, BLK, .30)))
    return g
def bg_c(base, i):
    im = Image.new('RGBA', (W, W), rgba(base))
    tr = Image.new('L', (W, W), 0); ImageDraw.Draw(tr).rectangle([O + 0.58 * S0, 0, W, O + 0.55 * S0], fill=255)
    bt = Image.new('L', (W, W), 0); ImageDraw.Draw(bt).rectangle([0, O + 0.55 * S0, W, W], fill=255)
    im.paste(Image.new('RGBA', (W, W), rgba(mix(base, WHT, .16))), (0, 0), tr)
    im.paste(Image.new('RGBA', (W, W), rgba(mix(base, BLK, .22))), (0, 0), bt)
    return im
def fg_c(base, i):
    g = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    wc = WH if i in (4, 7, 10) else (255, 196, 61, 255)   # المفتاح أصفر إلا على الخلفيات الصفراء/البرتقالية
    put(g, 'frame', WH); put(g, 'wm', wc); put(g, 'coin', WH); put(g, 'dh', rgba(mix(base, BLK, .22)))
    return g
STYLES = {'a': (bg_a, fg_a), 'b': (bg_b, fg_b), 'c': (bg_c, fg_c)}

for i, hexc in enumerate(PALETTE):
    base = hx(hexc)
    for style, (fbg, ffg) in STYLES.items():
        key = f'{style}{i}'
        bg, fg = fbg(base, i), ffg(base, i)
        bg.resize((432, 432), Image.LANCZOS).convert('RGB').save(f'{res}/drawable-nodpi/ic_{key}_bg.png')
        fg.resize((432, 432), Image.LANCZOS).save(f'{res}/drawable-nodpi/ic_{key}_fg.png')
        full = bg.copy(); full.alpha_composite(fg)
        leg = Image.new('RGBA', (192, 192), (0, 0, 0, 0))
        leg.paste(full.crop((O, O, O + S0, O + S0)).resize((192, 192), Image.LANCZOS), (0, 0), mask)
        leg.save(f'{res}/mipmap-xxxhdpi/ic_{key}.png')
        open(f'{res}/mipmap-anydpi-v26/ic_{key}.xml', 'w').write(adaptive % (key, key))
        if key == 'a0':
            for dpi, px_ in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
                os.makedirs(f'{res}/mipmap-{dpi}', exist_ok=True)
                small = leg.resize((px_, px_), Image.LANCZOS)
                small.save(f'{res}/mipmap-{dpi}/ic_launcher.png')
                small.save(f'{res}/mipmap-{dpi}/ic_launcher_round.png')
            for n in ('ic_launcher', 'ic_launcher_round'):
                open(f'{res}/mipmap-anydpi-v26/{n}.xml', 'w').write(adaptive % ('a0', 'a0'))

# manifest: launcher entries move from MainActivity to switchable aliases (3 styles x 12 colours)
M = 'android/app/src/main/AndroidManifest.xml'
t = open(M, encoding='utf-8').read()
import re
LAUNCH = re.compile(r'[ \t]*<category android:name="android.intent.category.LAUNCHER"\s*/>[ \t]*\n?')
if not LAUNCH.search(t):
    raise SystemExit('launcher category not found in manifest')
t = LAUNCH.sub('', t, count=1)
al = ''
for style in 'abc':
    for i in range(len(PALETTE)):
        k = f'{style}{i}'
        al += ('    <activity-alias android:name=".Ic_%s" android:targetActivity=".MainActivity" android:enabled="%s" android:exported="true" '
               'android:icon="@mipmap/ic_%s" android:roundIcon="@mipmap/ic_%s" android:label="@string/app_name">\n'
               '        <intent-filter>\n            <action android:name="android.intent.action.MAIN"/>\n'
               '            <category android:name="android.intent.category.LAUNCHER"/>\n        </intent-filter>\n    </activity-alias>\n') % (k, 'true' if k == 'a0' else 'false', k, k)
t = t.replace('</application>', al + '</application>', 1)
open(M, 'w', encoding='utf-8').write(t)
print('icons ok')
