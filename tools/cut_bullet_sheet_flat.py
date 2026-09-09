#!/usr/bin/env python3
"""Компонентная нарезка чистого листа 2D-иконок на белом: каждая иконка — отдельный блоб.
Прозрачный фон (feather по белому), нутро иконки цельное (fill holes покомпонентно),
номера/подписи отсекаем по размеру. Не требует знания сетки. Тень добавляется CSS'ом (pm-img)."""
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert('RGB')
W, H = im.size
arr = np.asarray(im).astype(np.float32)
bg = np.median(np.concatenate([arr[:40, :40].reshape(-1, 3), arr[:40, -40:].reshape(-1, 3),
                               arr[-40:, :40].reshape(-1, 3), arr[-40:, -40:].reshape(-1, 3)]), axis=0)
dist = np.sqrt(((arr - bg) ** 2).sum(2))
# компоненты не-фона (иконки хорошо разделены на белом)
core = dist > 55
core = ndimage.binary_closing(core, np.ones((7, 7)))
lab, n = ndimage.label(core, np.ones((3, 3)))
objs = []
for i in range(1, n + 1):
    ys, xs = np.where(lab == i); area = len(xs)
    if area < 2600:
        continue
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    if bw < 42 or bh < 42:
        continue
    ext = area / (bw * bh)
    if ext < 0.06:            # тонкие текст-строки
        continue
    if bw > W * 0.45 or bh > H * 0.4:  # склейка/заголовок
        continue
    objs.append((i, xs.min(), ys.min(), bw, bh, int(xs.mean()), int(ys.mean())))
# порядок row-major (кластеризуем по y ~ряды)
objs.sort(key=lambda o: (round(o[6] / 90), o[5]))
print('icons:', len(objs))
saved = 0
for k, (ci, x0, y0, bw, bh, cx, cy) in enumerate(objs):
    pad = 10
    xa, ya = max(0, x0 - pad), max(0, y0 - pad)
    xb, yb = min(W, x0 + bw + pad), min(H, y0 + bh + pad)
    sub = arr[ya:yb, xa:xb]
    d = np.sqrt(((sub - bg) ** 2).sum(2))
    # мягкая альфа: прозрачный белый, цельная иконка
    alpha = np.clip((d - 12) / 22, 0, 1)
    # нутро (внутренний белый, окружённый иконкой) — заполняем ПОКОМПОНЕНТНО, чтобы не дырявить
    solid = ndimage.binary_fill_holes(alpha > 0.5)
    alpha = np.maximum(alpha, solid.astype(np.float32) * 1.0)
    # уберём мелкие ошмётки вне главного компонента этого кропа
    m = alpha > 0.4
    cl, cn = ndimage.label(m, np.ones((3, 3)))
    if cn > 1:
        sizes = ndimage.sum(np.ones_like(cl), cl, range(1, cn + 1))
        keepid = int(np.argmax(sizes)) + 1
        # оставляем главный + всё в его bbox
        yy, xx = np.where(cl == keepid)
        bx0, bx1, by0, by1 = xx.min(), xx.max(), yy.min(), yy.max()
        drop = np.ones(cn + 1, bool); drop[keepid] = False
        for cid in range(1, cn + 1):
            if cid == keepid:
                continue
            yy2, xx2 = np.where(cl == cid)
            if xx2.min() >= bx0 and xx2.max() <= bx1 and yy2.min() >= by0 and yy2.max() <= by1:
                drop[cid] = False
        rem = np.isin(cl, np.where(drop)[0]); alpha[rem] = 0
    a8 = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    ys_, xs_ = np.where(a8 > 18)
    if not len(xs_):
        continue
    p = 4
    tx0, tx1 = max(0, xs_.min() - p), min(sub.shape[1], xs_.max() + 1 + p)
    ty0, ty1 = max(0, ys_.min() - p), min(sub.shape[0], ys_.max() + 1 + p)
    rgba = np.dstack([sub.astype(np.uint8), a8])[ty0:ty1, tx0:tx1]
    Image.fromarray(rgba).save(os.path.join(OUT, f'{k+1:02d}.png'))
    saved += 1
print('saved', saved)
