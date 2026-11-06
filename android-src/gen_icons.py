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

def diag(S, a, b):
    im = Image.new('RGBA', (S, S))
    d = ImageDraw.Draw(im)
    for i in range(2 * S):
        t = i / (2 * S)
        d.line([(i, 0), (0, i)], fill=tuple(int(a[k] + (b[k] - a[k]) * t) for k in range(3)) + (255,), width=4)
    return im

def lm(S, fn):
    L = Image.new('L', (S, S), 0)
    fn(ImageDraw.Draw(L))
    return L

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
        if key == 'b0':   # الأيقونة الافتراضية (المثبّت، نافذة البصمة، معلومات التطبيق) = شكل «وهج»
            for dpi, px_ in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
                os.makedirs(f'{res}/mipmap-{dpi}', exist_ok=True)
                small = leg.resize((px_, px_), Image.LANCZOS)
                small.save(f'{res}/mipmap-{dpi}/ic_launcher.png')
                small.save(f'{res}/mipmap-{dpi}/ic_launcher_round.png')
            for n in ('ic_launcher', 'ic_launcher_round'):
                open(f'{res}/mipmap-anydpi-v26/{n}.xml', 'w').write(adaptive % ('b0', 'b0'))

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
