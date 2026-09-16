'use strict';
/* Генерация PDF счёт-фактуры (международный B2B формат). Кириллица — через встроенный DejaVuSans.
   Возвращает Promise<Buffer>. Используется при оплате КАРТОЙ (крипта инвойсов не даёт). */
const PDFDocument = require('pdfkit');
const path = require('path');

const FONT_R = path.join(__dirname, 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_B = path.join(__dirname, 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

/* реквизиты продавца (платформы) — оператор задаёт в registry.platformInvoice; дефолты-плейсхолдеры */
function seller(reg) {
  const p = (reg && reg.platformInvoice) || {};
  return {
    name: p.name || 'TargetPoint AY',
    owner: p.owner || 'Aleksei Yazeuski',
    line1: p.line1 || p.address || 'Via Montello 7/A, 31100 Treviso (TV)',
    line2: p.line2 || 'Italia',
    cf: p.cf || 'YZSLKS01E01Z139W',
    vat: p.vat || '04986270231',
    email: p.email || 'billing@lumen247.com',
    iban: p.iban || '',
    bic: p.bic || '',
    bankName: p.bankName || '',
    note: p.note || '',
    accent: p.accent || '#c8a86a',
  };
}

function money(n, cur) { return (cur || 'USD') + ' ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(ms) { const d = new Date(ms || Date.now()); const p = (x) => String(x).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`; }

/* opts: { inv, company, reg, lines:[{desc,qty,unit,amount}], currency } */
function buildInvoicePdf(opts) {
  return new Promise((resolve, reject) => {
    try {
      const o = opts || {};
      const inv = o.inv || {};
      const co = o.company || inv.company || {};
      const S = seller(o.reg);
      const cur = o.currency || inv.currency || 'USD';
      const accent = S.accent;
      const ink = '#1a1815', mut = '#6b6a66', line = '#e7e4dd';

      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.registerFont('R', FONT_R);
      doc.registerFont('B', FONT_B);

      const W = doc.page.width, M = 48, right = W - M;
      let y = M;

      /* ── Шапка: продавец слева, «СЧЁТ-ФАКТУРА / INVOICE» справа ── */
      doc.font('B').fontSize(20).fillColor(ink).text(S.name, M, y);
      doc.font('R').fontSize(9).fillColor(mut);
      let sy = y + 26;
      [S.owner, S.line1, S.line2, S.cf ? 'C.F.: ' + S.cf : '', S.vat ? 'P.IVA / VAT: ' + S.vat : '', S.email].filter(Boolean).forEach(l => { doc.text(l, M, sy); sy += 13; });

      doc.font('B').fontSize(22).fillColor(accent).text('СЧЁТ-ФАКТУРА', M, y, { width: right - M, align: 'right' });
      doc.font('R').fontSize(9).fillColor(mut).text('INVOICE', M, y + 26, { width: right - M, align: 'right' });
      doc.font('B').fontSize(11).fillColor(ink).text('№ ' + (inv.id || '—'), M, y + 42, { width: right - M, align: 'right' });
      doc.font('R').fontSize(9).fillColor(mut).text('Дата / Date: ' + fmtDate(inv.at), M, y + 58, { width: right - M, align: 'right' });

      y = Math.max(sy, y + 74) + 14;
      doc.moveTo(M, y).lineTo(right, y).strokeColor(line).lineWidth(1).stroke();
      y += 18;

      /* ── Плательщик ── */
      doc.font('B').fontSize(10).fillColor(mut).text('ПЛАТЕЛЬЩИК / BILL TO', M, y); y += 15;
      doc.font('B').fontSize(12).fillColor(ink).text(co.legalName || co.name || '—', M, y); y += 16;
      doc.font('R').fontSize(9.5).fillColor(mut);
      [co.address || '', co.vat ? 'VAT/ИНН: ' + co.vat : '', co.email || ''].filter(Boolean).forEach(l => { doc.text(l, M, y); y += 13; });
      y += 12;

      /* ── Таблица позиций ── */
      const cX = { desc: M, qty: right - 220, unit: right - 165, amt: right - 100 };
      const wQty = 45, wUnit = 60, wAmt = 100;
      const num = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      doc.font('B').fontSize(9).fillColor(mut);
      doc.text('ОПИСАНИЕ / DESCRIPTION', cX.desc, y);
      doc.text('Кол-во', cX.qty, y, { width: wQty, align: 'right' });
      doc.text('Цена', cX.unit, y, { width: wUnit, align: 'right' });
      doc.text('Сумма', cX.amt, y, { width: wAmt, align: 'right' });
      y += 14;
      doc.moveTo(M, y).lineTo(right, y).strokeColor(line).lineWidth(1).stroke(); y += 8;

      const lines = (o.lines && o.lines.length) ? o.lines
        : (inv.lines && inv.lines.length) ? inv.lines
        : [{ desc: inv.planName || 'Подписка', qty: 1, unit: inv.amount, amount: inv.amount }];
      doc.font('R').fontSize(10).fillColor(ink);
      lines.forEach(ln => {
        const h = Math.max(16, doc.heightOfString(ln.desc || '', { width: cX.qty - M - 12 }));
        doc.font('R').fontSize(10).fillColor(ink).text(ln.desc || '', cX.desc, y, { width: cX.qty - M - 12 });
        doc.text(String(ln.qty != null ? ln.qty : 1), cX.qty, y, { width: wQty, align: 'right' });
        doc.text(num(ln.unit != null ? ln.unit : ln.amount), cX.unit, y, { width: wUnit, align: 'right' });
        doc.text(money(ln.amount, cur), cX.amt, y, { width: wAmt, align: 'right' });
        y += h + 8;
      });
      doc.moveTo(M, y).lineTo(right, y).strokeColor(line).lineWidth(1).stroke(); y += 12;

      /* ── Итого ── */
      const subtotal = lines.reduce((s, l) => s + (+l.amount || 0), 0);
      const total = inv.amount != null ? +inv.amount : subtotal;
      const rowT = (label, val, bold) => {
        doc.font(bold ? 'B' : 'R').fontSize(bold ? 12 : 10).fillColor(bold ? ink : mut);
        doc.text(label, right - 260, y, { width: 150, align: 'right' });
        doc.text(val, right - 100, y, { width: 100, align: 'right' });
        y += bold ? 20 : 15;
      };
      rowT('Подытог / Subtotal', money(subtotal, cur));
      rowT('НДС / VAT', o.vatNote || '—');
      y += 2; doc.moveTo(right - 260, y).lineTo(right, y).strokeColor(line).stroke(); y += 8;
      rowT('ИТОГО / TOTAL', money(total, cur), true);
      y += 10;

      /* ── Оплата ── */
      const paid = inv.status === 'paid';
      doc.font('B').fontSize(10).fillColor(mut).text('ОПЛАТА / PAYMENT', M, y); y += 15;
      doc.font('R').fontSize(9.5).fillColor(ink);
      doc.text('Способ / Method: ' + (inv.method === 'stripe' ? 'Карта (Stripe)' : 'Банковский перевод'), M, y); y += 13;
      doc.fillColor(paid ? '#2e7d4f' : '#b8860b').font('B').text('Статус / Status: ' + (paid ? 'ОПЛАЧЕНО / PAID' : 'К ОПЛАТЕ / DUE'), M, y); y += 16;
      doc.font('R').fontSize(9.5).fillColor(mut);
      if (!paid && (S.iban || S.bankName)) {
        [S.bankName ? 'Банк / Bank: ' + S.bankName : '', S.iban ? 'IBAN: ' + S.iban : '', S.bic ? 'BIC/SWIFT: ' + S.bic : ''].filter(Boolean).forEach(l => { doc.text(l, M, y); y += 13; });
      }
      y += 8;
      if (S.note) { doc.font('R').fontSize(8.5).fillColor(mut).text(S.note, M, y, { width: right - M }); y += 24; }

      /* ── Футер ── */
      const fy = doc.page.height - 60;
      doc.font('R').fontSize(8).fillColor(mut).text('Счёт сгенерирован автоматически в Lumen · ' + fmtDate(inv.at) + ' · ' + (S.email || ''), M, fy, { width: right - M, align: 'center' });

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildInvoicePdf };
