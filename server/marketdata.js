/* Lumen CRM — справочники рынка: застройщики, районы, планы оплаты,
   форматы, удобства, теги. Дубай — полноценно, остальные гео — базово.
   Используются деталкой объекта: селекты/чипы вместо ручного текста. */
const MARKET = {
  dubai: {
    developers: ['Emaar', 'Damac', 'Sobha', 'Nakheel', 'Meraas', 'Aldar', 'Binghatti', 'Danube', 'Azizi', 'Ellington', 'Samana', 'Tiger Properties', 'Select Group', 'Object 1', 'Prescott', 'Imtiaz', 'Mag', 'Nshama', 'Omniyat', 'Palma Holding', 'Riviera Group', 'Vincitore'],
    areas: ['JVC', 'JVT', 'Business Bay', 'Dubai Marina', 'Downtown', 'Dubailand', 'Dubai Islands', 'Expo City', 'Creek Harbour', 'Arjan', 'Dubai Sports City', 'Dubai Studio City', 'MBR City', 'Palm Jumeirah', 'DAMAC Hills 2', 'Al Furjan', 'JLT', 'Dubai South', 'Meydan', 'Town Square', 'Motor City', 'Dubai Hills'],
    payments: [
      { label: '60/40 · до сдачи', rows: [{ pct: '60%', label: 'До сдачи (помесячно)' }, { pct: '40%', label: 'При получении ключей' }] },
      { label: '70/30', rows: [{ pct: '20%', label: 'Первоначальный взнос' }, { pct: '50%', label: 'Во время строительства' }, { pct: '30%', label: 'При получении ключей' }] },
      { label: '80/20', rows: [{ pct: '20%', label: 'Первоначальный взнос' }, { pct: '60%', label: 'Во время строительства' }, { pct: '20%', label: 'При получении ключей' }] },
      { label: '1% в месяц', rows: [{ pct: '20%', label: 'Первоначальный взнос' }, { pct: '1%/мес', label: 'До сдачи' }, { pct: 'Остаток', label: 'При ключах' }] },
      { label: 'Post-handover 2-3 года', rows: [{ pct: '20%', label: 'Первоначальный взнос' }, { pct: '40%', label: 'До сдачи' }, { pct: '40%', label: '2-3 года после ключей' }] },
      { label: '100% (готово/вторичка)', rows: [{ pct: '100%', label: 'Оплата / ипотека' }] },
    ],
  },
  bali: {
    developers: ['Nuanu', 'Bukit Vista', 'Kedungu Dev', 'BREIH', 'Palm Group', 'Magnum Estate'],
    areas: ['Чангу', 'Берава', 'Умалас', 'Улувату', 'Букит', 'Убуд', 'Санур', 'Кедунгу'],
    payments: [
      { label: '50/50', rows: [{ pct: '50%', label: 'Первоначальный взнос' }, { pct: '50%', label: 'К завершению' }] },
      { label: '30/40/30', rows: [{ pct: '30%', label: 'Бронь + контракт' }, { pct: '40%', label: 'Стройка' }, { pct: '30%', label: 'Сдача' }] },
      { label: '100% (готово)', rows: [{ pct: '100%', label: 'Оплата' }] },
    ],
  },
  phuket: {
    developers: ['Laguna (Banyan)', 'Botanica', 'Layan Green Park', 'VIP Karon', 'Utopia'],
    areas: ['Банг Тао', 'Лаян', 'Камала', 'Найтон', 'Раваи', 'Ката', 'Карон', 'Найхарн'],
    payments: [
      { label: '30/70', rows: [{ pct: '30%', label: 'Контракт' }, { pct: '70%', label: 'К сдаче (этапами)' }] },
      { label: '100% (готово)', rows: [{ pct: '100%', label: 'Оплата' }] },
    ],
  },
  spain: {
    developers: ['Taylor Wimpey', 'Metrovacesa', 'Aedas Homes', 'Via Célere', 'Habitat'],
    areas: ['Коста-Бланка', 'Коста-дель-Соль', 'Аликанте', 'Марбелья', 'Валенсия', 'Торревьеха', 'Эстепона'],
    payments: [
      { label: '20/80 + ипотека', rows: [{ pct: '20%', label: 'Резерв + контракт' }, { pct: '80%', label: 'Ипотека/оплата при эскритуре' }] },
      { label: '100%', rows: [{ pct: '100%', label: 'Оплата' }] },
    ],
  },
  common: {
    types: ['Studio', '1BR', '2BR', '3BR', 'Villa 2BR', 'Villa 3BR+', 'Townhouse', 'Penthouse', 'Duplex'],
    handover: ['готово', 'Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027', 'Q1 2028', 'Q2 2028', 'Q3 2028', 'Q4 2028', 'Q1 2029', 'Q2 2029', 'Q4 2029'],
    amenities: ['Бассейн', 'Infinity-бассейн', 'Фитнес-центр', 'Сауна', 'SPA', 'Йога-зона', 'Коворкинг', 'Кидс-клуб', 'BBQ-зона', 'Паркинг', 'Лобби', 'Консьерж', 'Ретейл', 'Padel-корт', 'Кинотеатр', 'Беговые дорожки', 'Пляжный клуб'],
    tags: ['рассрочка', 'высокий ROI', 'под сдачу', 'готово', 'вид на море', 'вид на скайлайн', 'брендированный', 'у метро', 'первая линия', 'предстарт', 'эксклюзив', 'под ВНЖ/визу'],
  },
};
module.exports = { MARKET };
