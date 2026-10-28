/* ──────────────────────────────────────────────────────────────────────────
   Lumen — заземление ИИ на РЕАЛЬНОМ инвентаре агентства (доменный moat).
   Зачем: конкурент (Soul AI) гоняет ОБЩИЙ ИИ. Наш ИИ видит фактическое наличие
   агентства под запрос лида → говорит предметно и ПРАВДИВО (а не «у нас всё есть»),
   и ЧЕСТНО признаёт, когда совпадения нет — не выдумывает объекты.

   Чистые функции (принимают db) → $0 (всё в памяти, без эмбеддингов/API), тестируемо.
   БЕЗОПАСНОСТЬ ИМЁН: при hideNames (дефолт) в промпт уходят ТОЛЬКО факты-атрибуты
   (кол-во, диапазон цен, рынок, рассрочка, сроки, форматы, районы, теги) — НИКАКИХ
   названий проектов/застройщиков, чтобы ИИ не слил их вопреки запрету.
   ────────────────────────────────────────────────────────────────────────── */

/* "350k"/"1.2m"/"$200,000"/"200 000" → число */
function parseBudget(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).toLowerCase().replace(/[\s,]/g, '');
  const m = s.match(/([\d.]+)\s*([kmкм])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]); if (!isFinite(n)) return 0;
  const suf = m[2];
  if (suf === 'k' || suf === 'к') n *= 1e3;
  else if (suf === 'm' || suf === 'м') n *= 1e6;
  else if (n < 10000) n *= 1000;                 /* «190» в контексте недвижимости ≈ 190k */
  return Math.round(n);
}

function leadBudget(lead) {
  const b = (lead && lead.quals && lead.quals.budget) || null;
  if (!b) return 0;
  if (typeof b === 'object') return +b.num || parseBudget(b.value);
  return parseBudget(b);
}

const uniq = (a) => [...new Set(a.filter(x => x != null && String(x).trim() !== ''))];

/* ───────── подобрать реальный инвентарь под лида ───────── */
function matchInventory(db, lead, opts = {}) {
  const geo = lead && lead.geo;
  const props = ((db && db.properties) || []).filter(p => p && (!geo || p.geo === geo));
  const budget = leadBudget(lead);
  const typeHint = ((lead && lead.quals && lead.quals.type && (lead.quals.type.value || lead.quals.type)) || '').toString().toLowerCase();

  /* В бюджете: priceFrom ≤ бюджет×1.1 (входной порог, чуть выше — ок). Если бюджет неизвестен — берём все по гео. */
  const inBudget = budget > 0 ? props.filter(p => +p.priceFrom > 0 && +p.priceFrom <= budget * 1.1) : props.slice();
  const pool = inBudget.length ? inBudget : [];

  /* ранжирование: ближе к бюджету + совпал тип/beds + есть рассрочка */
  const score = (p) => {
    let s = 0;
    if (budget > 0 && +p.priceFrom > 0) s += Math.max(0, 1 - Math.abs(budget - p.priceFrom) / budget);   /* ближе к бюджету — выше */
    if (typeHint && (String(p.type || '').toLowerCase().includes(typeHint) || typeHint.includes(String(p.type || '').toLowerCase()))) s += 0.6;
    if ((p.tags || []).some(t => /рассроч|payment|план/i.test(t)) || /%|рассроч/i.test(p.payment || '')) s += 0.2;
    return s;
  };
  const ranked = pool.slice().sort((a, b) => score(b) - score(a));

  const prices = ranked.map(p => +p.priceFrom).filter(x => x > 0);
  const cur = (ranked[0] && ranked[0].currency) || (props[0] && props[0].currency) || 'USD';
  const byMarket = { offplan: ranked.filter(p => p.market === 'offplan').length, secondary: ranked.filter(p => p.market === 'secondary').length };

  /* down-sell: если ничего в бюджет не влезло — самый дешёвый по гео (чтобы ИИ предложил ближайшее) */
  let downsell = null;
  if (budget > 0 && !inBudget.length && props.length) {
    const cheapest = props.slice().sort((a, b) => (+a.priceFrom || 1e15) - (+b.priceFrom || 1e15))[0];
    if (cheapest && +cheapest.priceFrom > 0) downsell = { from: +cheapest.priceFrom, currency: cheapest.currency || cur, type: cheapest.type, area: cheapest.area };
  }

  const coverage = ranked.length >= 3 ? 'good' : ranked.length >= 1 ? 'thin' : 'none';
  return {
    count: ranked.length,
    coverage,
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
    currency: cur,
    byMarket,
    payments: uniq(ranked.map(p => p.payment)).slice(0, 4),
    handovers: uniq(ranked.map(p => p.handover)).slice(0, 4),
    types: uniq(ranked.map(p => p.type)).slice(0, 6),
    areas: uniq(ranked.map(p => p.area)).slice(0, 6),
    tags: uniq([].concat(...ranked.map(p => p.tags || []))).slice(0, 6),
    downsell,
    budget,
    hasAnyInGeo: props.length > 0,
    /* имена — ТОЛЬКО если агентство разрешило показывать проекты (hideNames===false) */
    named: ranked.slice(0, 5).map(p => ({ name: p.name, developer: p.developer, area: p.area, type: p.type, priceFrom: +p.priceFrom, payment: p.payment, handover: p.handover, market: p.market })),
  };
}

/* ───────── блок для промпта ИИ (hideNames-safe) ───────── */
function inventoryBlock(db, lead) {
  if (!db || !((db.properties || []).length)) return '';                 /* нет базы объектов — блок не нужен */
  const hideNames = (((db.settings && db.settings.ai && db.settings.ai.training) || {}).hideNames) !== false;
  const inv = matchInventory(db, lead);
  const geoName = (db.settings && db.settings.geoNames && db.settings.geoNames[lead.geo]) || lead.geo || 'это направление';
  const money = (n) => `${inv.currency === 'USD' ? '$' : ''}${Number(n).toLocaleString('en-US')}${inv.currency !== 'USD' ? ' ' + inv.currency : ''}`;
  const budgetTxt = inv.budget ? ` в бюджете ~${money(inv.budget)}` : '';

  if (inv.coverage === 'none') {
    let line = `НАШ ИНВЕНТАРЬ ПОД ЗАПРОС: прямого совпадения под «${geoName}»${budgetTxt} в базе сейчас НЕТ. НЕ выдумывай конкретное наличие и НЕ обещай «есть вариант». Честно: «подберу точечно под ваш запрос и вернусь» — и веди к созвону, где разберём задачу.`;
    if (inv.downsell) line += ` Ближайшее по бюджету начинается от ${money(inv.downsell.from)} (${inv.downsell.type || ''}${inv.downsell.area ? ', ' + inv.downsell.area : ''}) — можешь мягко предложить как down-sell.`;
    return line + '\n';
  }

  const markets = [];
  if (inv.byMarket.offplan) markets.push(`offplan (${inv.byMarket.offplan})`);
  if (inv.byMarket.secondary) markets.push(`вторичка (${inv.byMarket.secondary})`);
  const facts = [
    `${inv.count} ${plural(inv.count, 'подходящий вариант', 'подходящих варианта', 'подходящих вариантов')}${inv.priceMin ? `, от ${money(inv.priceMin)}` : ''}`,
    inv.types.length ? `форматы: ${inv.types.join(', ')}` : '',
    markets.length ? `рынок: ${markets.join(', ')}` : '',
    inv.payments.length ? `рассрочка/оплата: ${inv.payments.join('; ')}` : '',
    inv.handovers.length ? `сроки: ${inv.handovers.join(', ')}` : '',
    inv.areas.length ? `районы: ${inv.areas.join(', ')}` : '',
    inv.tags.length ? `особенности: ${inv.tags.join(', ')}` : '',
  ].filter(Boolean);

  let head = `НАШ ИНВЕНТАРЬ ПОД ЗАПРОС (РЕАЛЬНОЕ наличие под «${geoName}»${budgetTxt} — говори предметно и уверенно, что подходящее есть, ориентируй по рассрочке/срокам/формату`;
  head += hideNames ? `, но БЕЗ названий проектов/застройщиков — их раскрываешь на созвоне):` : `):`;
  let body = facts.map(f => '- ' + f).join('\n');
  if (!hideNames && inv.named.length) {
    body += '\n- Конкретные (можешь называть): ' + inv.named.map(n => `${n.name}${n.area ? ' (' + n.area + ')' : ''} от ${money(n.priceFrom)}${n.payment ? ', ' + n.payment : ''}`).join('; ');
  }
  const tail = inv.coverage === 'thin'
    ? '\n- Вариантов немного — не распыляйся, веди к созвону, где покажешь предметно.'
    : '';
  return `${head}\n${body}${tail}\n`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

module.exports = { matchInventory, inventoryBlock, parseBudget, leadBudget };
