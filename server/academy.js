/* Lumen CRM — Академия продаж: методология Ольги Синенко (Dubai RE).
   81 роликов → 536 приёмов. Единый источник знаний для:
   (1) раздела «Академия» (браузинг), (2) «Оценки звонка» (скоринг по методологии),
   (3) подсказок-советов в карточке лида / копилоте продаж.
   Данные — в academy_data.json (курируются из роликов); методология статична, как playbook.js. */

const _d = require('./academy_data.json');
const CARDS = _d.CARDS;
const MODULES = _d.MODULES;
const VTITLES = _d.VTITLES;

const CAT_LABELS = {"cold_call": "Холодные звонки", "discovery": "Квалификация", "conversation_flow": "Схема разговора", "objections": "Возражения", "meetings": "Встречи и Zoom", "closing": "Закрытие и срочность", "followup": "Дожим и пропавшие", "psychology": "Психология и доверие", "mistakes": "Ошибки", "agent_ops": "Организация работы", "dubai_market": "Рынок Дубая"};

function ytUrl(vid){ return 'https://www.youtube.com/watch?v=' + vid; }
function byCategory(cat){ return CARDS.filter(c => c.cat === cat); }

/* Рубрика оценки звонка — дистиллят из разборов звонков Ольги Синенко. */
const RUBRIC = [
  { key:'opening', label:'Открытие звонка', weight:15,
    look_for:'Захватил внимание в первые секунды (pattern interrupt), заявил цель звонка, НЕ начал с «how are you»/дежурной болтовни, держал уверенный тон и статус эксперта (не проситель).',
    anti:'Мямлил, извинялся за звонок, спрашивал «удобно ли говорить», сразу питчил.' },
  { key:'discovery', label:'Квалификация и вопросы', weight:25,
    look_for:'Задавал открытые вопросы, ведущие к сделке: цель (жизнь/инвестиция), бюджет, сроки, мотивация «why now», процесс принятия решения, кто ещё решает. Копал глубже лестницей «почему это важно».',
    anti:'Сразу «что показать / какой бюджет» без раппорта, не выяснил мотивацию, принял первый ответ без углубления.' },
  { key:'objections', label:'Отработка возражений', weight:20,
    look_for:'На возражение сначала соглашался/диффундировал, не спорил, переводил критерий (напр. цена → доходность), при «просто пришлите варианты» — мост к вопросам, флип «я не продаю».',
    anti:'Спорил в лоб, оправдывался, сдавался после первого «нет», отправлял PDF без квалификации.' },
  { key:'urgency_value', label:'Ценность и срочность', weight:15,
    look_for:'Давал ценность до просьбы, создавал внутреннюю срочность через логику клиента (why now, рост цен, дефицит), говорил конкретикой и цифрами.',
    anti:'«Commission breath» — давил ради своей комиссии; пустые «спешите, разберут»; лил воду без фактов.' },
  { key:'next_step', label:'Следующий шаг / закрытие', weight:15,
    look_for:'Закрыл на КОНКРЕТНЫЙ следующий шаг (звонок/Zoom/слот), продал встречу выгодой (что получит за 15 мин), дал выбор из двух времён (two-option close), зафиксировал договорённость.',
    anti:'Закончил на «я пришлю / подумайте / напишите если что» без конкретного шага и времени.' },
  { key:'tone_mistakes', label:'Тон, раппорт, ошибки', weight:10,
    look_for:'Тёплый, но экспертный тон; взрослая позиция (не заискивал, не давил); вёл разговор двусторонне; слушал больше, чем говорил.',
    anti:'Роль «информатора» без закрытия; перебивал; давление; неуверенность; монолог.' },
];

const OBJ_KEYWORDS = {
  wait:['подожд','wait','later','not now','думать','think','подума'],
  price:['дорого','expensive','price','цена','high','budget'],
  send:['пришли','send','options','варианты','information','инфо','pdf'],
  drop:['упад','drop','снизят','ниже','ждать цен','prices down','correction'],
  oversupply:['oversuppl','переизбыт','много строят','supply'],
  news:['news','новост','негатив','war','война','risk','риск'],
  trust:['trust','довер','scam','обман','не верю','honest'],
  ghost:['пропал','ghost','не отвеч','молч','disappear','игнор'],
};
function matchLoose(t, obj){
  const words=(obj||'').toLowerCase().split(/[^a-zа-я]+/).filter(w=>w.length>4);
  let n=0; words.forEach(w=>{ if(t.includes(w)) n++; });
  return n>=2;
}
function forObjection(text){
  const t=(text||'').toLowerCase();
  const hits=CARDS.filter(c => c.cat==='objections' && c.objection && matchLoose(t, c.objection));
  if (hits.length) return hits.slice(0,3);
  for (const k of Object.keys(OBJ_KEYWORDS)){
    const kw=OBJ_KEYWORDS[k];
    if (kw.some(w => t.includes(w))){
      const m=CARDS.filter(c=>c.cat==='objections' && kw.some(w=>((c.objection||'')+(c.title||'')).toLowerCase().includes(w)));
      if (m.length) return m.slice(0,3);
    }
  }
  return [];
}

function methodologyRef(){
  const L=[];
  L.push('РУБРИКА (по чему оцениваем звонок брокера):');
  RUBRIC.forEach(r=>L.push('- '+r.label+' (вес '+r.weight+'): ХОРОШО — '+r.look_for+' ПЛОХО — '+r.anti));
  const q=CARDS.filter(c=>c.cat==='discovery' && c.questions && c.questions.length).flatMap(c=>c.questions).slice(0,16);
  if(q.length){ L.push(''); L.push('ЭТАЛОННЫЕ ВОПРОСЫ КВАЛИФИКАЦИИ (Синенко):'); q.forEach(x=>L.push('• '+x)); }
  const obj=CARDS.filter(c=>c.cat==='objections' && c.response).slice(0,18);
  if(obj.length){ L.push(''); L.push('БАНК ВОЗРАЖЕНИЙ (возражение → как отвечать):'); obj.forEach(c=>L.push('• «'+(c.objection||c.title)+'» → '+c.response)); }
  return L.join('\n');
}

function stats(){
  const by={}; CARDS.forEach(c=>by[c.cat]=(by[c.cat]||0)+1);
  return { cards:CARDS.length, modules:MODULES.length, videos:Object.keys(VTITLES).length, byCat:by };
}

module.exports = { CARDS, MODULES, VTITLES, CAT_LABELS, RUBRIC, byCategory, forObjection, methodologyRef, stats, ytUrl };
