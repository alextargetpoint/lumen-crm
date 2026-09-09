#!/usr/bin/env python3
"""Нарезка 8×4 листа буллетов с СОХРАНЕНИЕМ подсветок/теней (soft alpha ramp).
Отличие от clean-режима: НЕ душим тени/глоу, а мягко феатерим их в альфу —
объект остаётся с ореолом/контактной тенью, эстетично на любом фоне.
Border flood-fill убирает только плоский фон, связанный с краем окна;
внутренняя структура (белая галка, центр) — цельная."""
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage

SRC, OUT = sys.argv[1], sys.argv[2]
LO = float(sys.argv[3]) if len(sys.argv) > 3 else 16.0
HI = float(sys.argv[4]) if len(sys.argv) > 4 else 52.0
TOP = int(sys.argv[5]) if len(sys.argv) > 5 else 96
BOT = int(sys.argv[6]) if len(sys.argv) > 6 else 56
NUMBAND = int(sys.argv[7]) if len(sys.argv) > 7 else 0   # обнулить нижние N px окна (убить цифру)
os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert('RGB')
W, H = im.size
arr = np.asarray(im).astype(np.float32)

corners = np.concatenate([arr[0:46, 0:46].reshape(-1, 3), arr[0:46, W-46:W].reshape(-1, 3),
                          arr[H-46:H, 0:46].reshape(-1, 3), arr[H-46:H, W-46:W].reshape(-1, 3)])
bg = np.median(corners, axis=0)

# ⭐ АВТО-детект центров колонок/рядов по центроиду ярких пикселей в бине (устойчиво к смещению
# сетки листа — раньше хардкод давал систематическую обрезку справа).
gdist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
strong = gdist > 55
band = strong.copy(); band[:140] = False; band[int(H * 0.93):] = False
def centroids(mask, n, a0, a1, axis):
    cs = []
    for i in range(n):
        s0 = int(a0 + i * (a1 - a0) / n); s1 = int(a0 + (i + 1) * (a1 - a0) / n)
        sub = mask[:, s0:s1] if axis == 1 else mask[s0:s1, :]
        proj = sub.sum(axis=0) if axis == 1 else sub.sum(axis=1)
        if proj.sum() > 0:
            c = s0 + int((np.arange(len(proj)) * proj).sum() / proj.sum())
        else:
            c = (s0 + s1) // 2
        cs.append(c)
    return cs
xs = centroids(band, 8, 0, W, 1)
ys = centroids(band, 4, 140, int(H * 0.93), 0)
HALF_X = 100
saved = 0
for r in range(4):
    for c in range(8):
        n = r * 8 + c
        xc, yc = xs[c], ys[r]
        x0, x1 = max(0, xc - HALF_X), min(W, xc + HALF_X)
        y0, y1 = max(0, yc - TOP), min(H, yc + BOT)
        cell = arr[y0:y1, x0:x1]
        ch, cw = cell.shape[:2]
        # ⭐ ЛОКАЛЬНЫЙ фон ячейки (медиана рамки окна) — устойчиво к неровному фону листа
        # (диагональный световой блик у края больше НЕ оставляет «коробку»).
        ring = np.concatenate([cell[0:6].reshape(-1, 3), cell[-6:].reshape(-1, 3),
                               cell[:, 0:6].reshape(-1, 3), cell[:, -6:].reshape(-1, 3)])
        lbg = np.median(ring, axis=0)
        dist = np.sqrt(((cell - lbg) ** 2).sum(axis=2))
        alpha = np.clip((dist - LO) / (HI - LO), 0, 1)   # мягкий феатер — глоу/тень сохраняются
        # border flood-fill: зануляем только плоский фон, связанный с краем окна (интерьер цел)
        near_bg = dist < LO
        lbl, num = ndimage.label(near_bg, structure=np.ones((3, 3)))
        bids = set(np.unique(np.concatenate([lbl[0, :], lbl[-1, :], lbl[:, 0], lbl[:, -1]]))); bids.discard(0)
        outer = np.isin(lbl, list(bids))
        alpha[outer] = 0.0
        if NUMBAND > 0:
            alpha[max(0, ch - NUMBAND):, :] = 0.0   # убить полосу с номером внизу окна
        a8 = (alpha * 255).astype(np.uint8)
        # выкидываем мелкие ошмётки (обрезки цифры/подписи), оставляем крупные компоненты (объект+глоу)
        sol = a8 > 30
        cl, cn = ndimage.label(sol, structure=np.ones((3, 3)))
        if cn:
            sizes = ndimage.sum(np.ones_like(cl), cl, range(1, cn + 1))
            big = max(sizes)
            keep = {i + 1 for i, s in enumerate(sizes) if s >= max(160, big * 0.05)}
            a8[~np.isin(cl, list(keep))] = 0
        ys_, xs_ = np.where(a8 > 12)
        if len(xs_) == 0:
            continue
        pad = 10
        bx0, bx1 = max(0, xs_.min() - pad), min(cw, xs_.max() + 1 + pad)
        by0, by1 = max(0, ys_.min() - pad), min(ch, ys_.max() + 1 + pad)
        rgba = np.dstack([cell.astype(np.uint8), a8])[by0:by1, bx0:bx1]
        Image.fromarray(rgba).save(os.path.join(OUT, f'{n+1:02d}.png'))
        saved += 1
print(f'saved {saved}/32')
