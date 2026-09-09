#!/usr/bin/env python3
"""Нарезка листа буллет-иконок в отдельные die-cut PNG.
⭐ Ключевой фикс (#8): удаляем ТОЛЬКО фон, СВЯЗАННЫЙ С ВНЕШНЕЙ ГРАНИЦЕЙ ячейки
(border flood-fill), а не все near-bg пиксели. Внутренняя структура стикера
(белая галка внутри круга, блик и т.п.) остаётся ЦЕЛЬНОЙ — не пикселит."""
import sys, os, numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1]
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert('RGB')
W, H = im.size
arr = np.asarray(im).astype(np.int16)

# фон = медиана угловых зон (лист имеет ровный светлый фон)
corners = np.concatenate([
    arr[0:40, 0:40].reshape(-1, 3), arr[0:40, W-40:W].reshape(-1, 3),
    arr[H-40:H, 0:40].reshape(-1, 3), arr[H-40:H, W-40:W].reshape(-1, 3)])
bg = np.median(corners, axis=0)

# сетка 7 колонок × 4 ряда; центры иконок (замерено по листу 1536×1024)
xs = [137 + round(i * (1385 - 137) / 6) for i in range(7)]
ys = [238, 435, 626, 812]
HALF_X, TOP, BOT = 96, 96, 60   # окно вокруг иконки (номер/подпись снизу — вне окна)

labels = [
 'Чек стандартный','Чек успех','Чек акцент','Чек контур','Чек премиум','Искра','Стрелка вправо',
 'Точка','Точка минимал','Фокус','Активный','Неактивный','Плюс','Стрелка',
 'Прогресс','Рост график','Лист природа','Огонь энергия','Сердце забота','Бриллиант ценность','Корона статус',
 'Локация','Время','Документ','Щит надёжность','Команда люди','Образование','Ракета старт']

T = 22      # порог «это фон» по евклид. расстоянию к bg
FEATHER = 16
saved = []
for r in range(4):
    for c in range(7):
        n = r * 7 + c
        xc, yc = xs[c], ys[r]
        x0, x1 = max(0, xc - HALF_X), min(W, xc + HALF_X)
        y0, y1 = max(0, yc - TOP), min(H, yc + BOT)
        cell = arr[y0:y1, x0:x1]
        ch, cw = cell.shape[:2]
        dist = np.sqrt(((cell - bg) ** 2).sum(axis=2))
        # мягкая серая падающая тень плашки = near-bg по цвету, низкая насыщенность, чуть темнее фона.
        # душим её (иначе у светлых плашек висит «полумесяц» тени), НЕ трогая тёмные/цветные иконки.
        mx = cell.max(axis=2); mn = cell.min(axis=2)
        sat = (mx - mn) / np.maximum(mx, 1)
        lum = cell.mean(axis=2)
        bg_lum = float(bg.mean())
        shadow = (sat < 0.12) & (lum < bg_lum - 4) & (lum > bg_lum - 60)
        near_bg = (dist < T) | shadow
        # ── border flood-fill: помечаем как ФОН только near_bg, связанные с краем окна ──
        lbl, num = ndimage.label(near_bg, structure=np.ones((3, 3)))
        border_ids = set(np.unique(np.concatenate([lbl[0, :], lbl[-1, :], lbl[:, 0], lbl[:, -1]])))
        border_ids.discard(0)
        outer_bg = np.isin(lbl, list(border_ids))   # только внешний фон; ВНУТРЕННИЙ near_bg сохраняем
        # мягкая альфа: 0 на внешнем фоне, ramp по расстоянию у кромки, 255 внутри объекта
        # ⭐ border flood-fill + ЖЁСТКАЯ кромка: икона (всё, что НЕ внешний фон) = непрозрачна,
        # нутро/плашка ЦЕЛЫЕ (не трогаем), тень/внешний фон = 0, без feather-ореола. 0.6px — только AA.
        alpha = (~outer_bg).astype(np.float32)
        alpha = ndimage.gaussian_filter(alpha, 0.6)
        a8 = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
        # выкидываем мелкие ошмётки (остатки цифры/подписи, блик-искры), оставляем крупные компоненты
        sol = a8 > 40
        cl, cn = ndimage.label(sol, structure=np.ones((3, 3)))
        if cn:
            sizes = ndimage.sum(np.ones_like(cl), cl, range(1, cn + 1))
            big = max(sizes)
            keep = {i + 1 for i, s in enumerate(sizes) if s >= max(400, big * 0.14)}
            a8[~np.isin(cl, list(keep))] = 0
        ys_, xs_ = np.where(a8 > 18)
        if len(xs_) == 0:
            continue
        pad = 8
        bx0, bx1 = max(0, xs_.min() - pad), min(cw, xs_.max() + 1 + pad)
        by0, by1 = max(0, ys_.min() - pad), min(ch, ys_.max() + 1 + pad)
        rgba = np.dstack([cell.astype(np.uint8), a8])[by0:by1, bx0:bx1]
        Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, f'{n+1:02d}.png'))
        saved.append((n + 1, labels[n], bx1 - bx0, by1 - by0))

print(f'saved {len(saved)} / 28')
for s in saved[:6]:
    print(' ', s)
