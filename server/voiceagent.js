/* ──────────────────────────────────────────────────────────────────────────
   Lumen — ГОЛОСОВОЙ ИИ-АГЕНТ (разговорный обзвон спящей базы — реанимация).
   Соберён из уже имеющихся кусков: телефония Telnyx (Call Control), Whisper STT
   (транскрипция Telnyx в реальном времени), ElevenLabs/Telnyx TTS, диалоговый
   «мозг» llm.voiceTurn, скоринг llm.reviewCall, сегментация wakeScore.

   Этот модуль — ЧИСТАЯ логика (Telnyx и LLM инъектятся как deps) → полностью
   юнит-тестируем без реальных звонков. index.js исполняет actions через telnyxApi.

   Поток звонка (стейт-машина advance):
     answered  → [record, transcribe, speak(опенер)]  phase=speaking
     speakEnded→ phase=listening (ждём клиента)  |  если pendingHangup → [hangup]
     utterance → добавить реплику клиента; опт-аут → мягкий выход+hangup;
                 иначе llm.voiceTurn → [speak(реплика)] (или done → прощание+hangup)
     hangup    → [finalize] (транскрипт + скоринг + JTBD → карточка лида)
   Состояние звонка хранится в lead.voiceCall._live (переживает stateless-вебхуки).
   ────────────────────────────────────────────────────────────────────────── */

const DAY = 86400e3;

/* клиент просит больше не звонить — немедленный мягкий выход + voiceOptOut */
const OPTOUT_RE = /(не\s*звони|не\s*беспокой|больше\s*не\s*звон|удал[ии]те?\s*(мой\s*)?номер|отпиш|unsubscrib|stop\s*call|don'?t\s*call|remove\s*my\s*number|take\s*me\s*off)/i;

/* первая реплика — персонализирована, мгновенна (без ожидания LLM на ответе) */
function openingLine(lead, cfg) {
  cfg = cfg || {};
  if (cfg.opener) return cfg.opener;
  const name = String((lead && lead.name) || '').trim().split(/\s+/)[0];
  const ag = cfg.agency || 'агентство недвижимости';
  const hi = name ? `Здравствуйте, ${name}!` : 'Здравствуйте!';
  return `${hi} Это ${ag}. Вы оставляли у нас заявку по недвижимости — решил узнать, актуален ли ещё вопрос. Удобно буквально пару минут поговорить?`;
}

function optoutLine(cfg) { return (cfg && cfg.optoutLine) || 'Понял вас, больше не побеспокою. Хорошего дня!'; }
function wrapLine(cfg) { return (cfg && cfg.wrapLine) || 'Спасибо за разговор! Я передам детали вашему менеджеру, он с вами свяжется. Всего доброго!'; }

/* плоский транскрипт для скоринга/карточки */
function transcriptText(state) {
  return ((state && state.history) || []).map(h => (h.who === 'client' ? 'Клиент' : 'Агент') + ': ' + h.text).join('\n');
}

function clientTurns(state) { return ((state && state.history) || []).filter(h => h.who === 'client').length; }

/* ───────── ГЛАВНАЯ СТЕЙТ-МАШИНА ─────────
   (state, event, deps) → { state, actions }.  Чистая (кроме deps.turn — async LLM).
   deps: { turn(history,{wrap}) → {say,done,reason,extracted}, maxTurns, cfg, lead } */
async function advance(state, event, deps) {
  deps = deps || {};
  const cfg = deps.cfg || {};
  const maxTurns = deps.maxTurns || 14;
  const now = (event && event.at) || Date.now();
  const acts = [];
  state = state || {};
  state.history = state.history || [];

  if (!event || !event.type) return { state, actions: acts };

  if (event.type === 'answered') {
    state.phase = 'speaking'; state.turns = 0; state.startedAt = now; state.extracted = state.extracted || {};
    const open = (deps.openingLine ? deps.openingLine() : openingLine(deps.lead || {}, cfg));
    state.history.push({ who: 'agent', text: open, at: now });
    acts.push({ type: 'record' }, { type: 'transcribe' }, { type: 'speak', text: open });
    return { state, actions: acts };
  }

  if (event.type === 'speakEnded') {
    if (state.pendingHangup) { state.phase = 'ending'; acts.push({ type: 'hangup' }); return { state, actions: acts }; }
    state.phase = 'listening';
    return { state, actions: acts };
  }

  if (event.type === 'utterance') {
    const text = String(event.text || '').trim();
    if (!text) return { state, actions: acts };                       /* пустое — игнор */
    if (state.pendingHangup || state.phase === 'ending' || state.phase === 'done') return { state, actions: acts };
    state.history.push({ who: 'client', text, at: now });
    state.lastClientAt = now;

    /* опт-аут → мягкий выход */
    if (OPTOUT_RE.test(text)) {
      const bye = optoutLine(cfg);
      state.history.push({ who: 'agent', text: bye, at: now });
      state.optout = true; state.endReason = 'optout'; state.phase = 'speaking'; state.pendingHangup = true;
      acts.push({ type: 'optout' }, { type: 'speak', text: bye });
      return { state, actions: acts };
    }

    state.turns = (state.turns || 0) + 1;
    const wrap = state.turns >= maxTurns;                             /* потолок ходов → завершаем */
    let t = { say: '', done: false };
    try { if (deps.turn) t = await deps.turn(state.history, { wrap }); } catch (e) { t = { say: '', done: false, error: e.message }; }
    const say = String((t && t.say) || '').trim();
    const done = !!(t && t.done) || wrap;
    if (t && t.extracted && typeof t.extracted === 'object') {
      state.extracted = Object.assign({}, state.extracted);
      for (const k of ['budget', 'timeline', 'type', 'region']) { const v = String((t.extracted[k] || '')).trim(); if (v) state.extracted[k] = v; }
    }

    if (done) {
      const line = say || wrapLine(cfg);
      state.history.push({ who: 'agent', text: line, at: now });
      state.endReason = state.endReason || (wrap ? 'maxturns' : ((t && t.reason) || 'done'));   /* потолок ходов помечаем явно */
      state.phase = 'speaking'; state.pendingHangup = true;
      acts.push({ type: 'speak', text: line });
      return { state, actions: acts };
    }
    if (say) { state.history.push({ who: 'agent', text: say, at: now }); state.phase = 'speaking'; acts.push({ type: 'speak', text: say }); }
    else { state.phase = 'listening'; }                                /* LLM молчит — просто слушаем дальше */
    return { state, actions: acts };
  }

  if (event.type === 'hangup') {
    state.phase = 'done'; state.endedAt = now; state.endReason = state.endReason || event.cause || 'hangup';
    acts.push({ type: 'finalize' });
    return { state, actions: acts };
  }

  return { state, actions: acts };
}

/* ───────── ФИНАЛИЗАЦИЯ: транскрипт + скоринг + JTBD → карточка лида ─────────
   deps: { scoreCall(transcript, ctx) → {overall,scores,dims,verdict,mistakes,nextScripts} } */
async function finalize(db, lead, state, deps) {
  deps = deps || {};
  state = state || {};
  const transcript = transcriptText(state);
  const hadConvo = clientTurns(state) > 0;
  const rec = {
    at: state.startedAt || Date.now(),
    endedAt: state.endedAt || Date.now(),
    durSec: state.startedAt && state.endedAt ? Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000)) : 0,
    clientTurns: clientTurns(state),
    endReason: state.endReason || 'hangup',
    answered: hadConvo || state.phase !== 'done' || !!state.startedAt,
    reached: hadConvo,                                   /* был ли ЖИВОЙ разговор (не автоответчик/сброс) */
    optout: !!state.optout,
    extracted: state.extracted || {},
    transcript: transcript.slice(0, 20000),
  };
  if (state.optout) lead.voiceOptOut = true;

  /* скоринг по методологии (reviewCall) — только если реально поговорили */
  if (hadConvo && transcript && deps.scoreCall) {
    try {
      const sc = await deps.scoreCall(transcript, { lead: (lead && lead.name) || '', geo: (lead && lead.geo) || '' });
      if (sc) rec.score = { overall: sc.overall, scores: sc.scores, dims: sc.dims, verdict: sc.verdict, mistakes: sc.mistakes, nextScripts: sc.nextScripts };
    } catch (e) { rec.scoreError = e.message; }
  }

  lead.voiceCall = rec;
  lead.voiceCalls = lead.voiceCalls || [];
  lead.voiceCalls.unshift({ at: rec.at, durSec: rec.durSec, endReason: rec.endReason, reached: rec.reached, overall: rec.score ? rec.score.overall : null, optout: rec.optout });
  if (lead.voiceCalls.length > 20) lead.voiceCalls.length = 20;
  return rec;
}

/* ───────── ВЫБОР ЦЕЛЕЙ КАМПАНИИ ─────────
   Переиспользует wakeScore (инъектится) для приоритизации спящей базы.
   filters: { stages, geo, olderDays, limit }. */
function pickTargets(db, filters, deps) {
  filters = filters || {};
  deps = deps || {};
  const score = deps.wakeScore || (() => 0);
  const now = (deps.now || Date.now());
  const dorm = (l) => now - (l.lastMsgAt || l.createdAt || now);
  const stages = filters.stages && filters.stages.length ? filters.stages : ['sleeping'];
  return (db.leads || [])
    .filter(l => l && !l.marketingOptOut && !l.voiceOptOut)            /* отписавшихся не звоним */
    .filter(l => !(l.tags || []).includes('opt-out'))
    .filter(l => stages.includes(l.stage))
    .filter(l => l.phone && String(l.phone).replace(/\D/g, '').length >= 7)
    .filter(l => !filters.geo || l.geo === filters.geo)
    .filter(l => !filters.olderDays || dorm(l) >= filters.olderDays * DAY)
    .filter(l => !(l.voiceCall && l.voiceCall.at && (now - l.voiceCall.at) < (filters.cooldownDays || 14) * DAY))  /* недавно звонили — пропускаем */
    .map(l => ({ lead: l, s: (function () { try { return score(db, l); } catch (_) { return 0; } })() }))
    .sort((a, b) => b.s - a.s)
    .slice(0, Math.max(1, Math.min(500, filters.limit || 50)))
    .map(x => x.lead);
}

module.exports = { advance, finalize, pickTargets, openingLine, optoutLine, wrapLine, transcriptText, clientTurns, OPTOUT_RE };
