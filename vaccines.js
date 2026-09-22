// 国家免疫规划疫苗程序（参考中国疾控中心发布的儿童免疫规划疫苗程序）
// 每个疫苗根据接种月龄自动推算预约时间
window.VACCINE_SCHEDULE = [
  // 出生时
  {
    id: 'bcg',
    name: '卡介苗',
    shortName: 'BCG',
    dose: '第1剂',
    monthsFromBirth: 0,
    description: '预防结核病。出生时接种1剂。',
    category: 'national'
  },
  {
    id: 'hepb-birth',
    name: '乙肝疫苗',
    shortName: 'HepB',
    dose: '第1剂',
    monthsFromBirth: 0,
    description: '预防乙型肝炎。出生24小时内接种第1剂。',
    category: 'national'
  },
  // 1月龄
  {
    id: 'hepb-1',
    name: '乙肝疫苗',
    shortName: 'HepB',
    dose: '第2剂',
    monthsFromBirth: 1,
    description: '预防乙型肝炎。第1剂后1个月接种。',
    category: 'national'
  },
  // 2月龄
  {
    id: 'ipv-1',
    name: '脊灰灭活疫苗',
    shortName: 'IPV',
    dose: '第1剂',
    monthsFromBirth: 2,
    description: '预防脊髓灰质炎。可使用五联疫苗替代。',
    category: 'national'
  },
  // 3月龄
  {
    id: 'opv-1',
    name: '脊灰减毒活疫苗',
    shortName: 'OPV',
    dose: '第1剂',
    monthsFromBirth: 3,
    description: '预防脊髓灰质炎（口服）。',
    category: 'national'
  },
  {
    id: 'dtap-1',
    name: '百白破疫苗',
    shortName: 'DTaP',
    dose: '第1剂',
    monthsFromBirth: 3,
    description: '预防百日咳、白喉、破伤风。可使用五联/四联疫苗替代。',
    category: 'national'
  },
  // 4月龄
  {
    id: 'ipv-2',
    name: '脊灰灭活疫苗',
    shortName: 'IPV',
    dose: '第2剂',
    monthsFromBirth: 4,
    description: '预防脊髓灰质炎。',
    category: 'national'
  },
  {
    id: 'dtap-2',
    name: '百白破疫苗',
    shortName: 'DTaP',
    dose: '第2剂',
    monthsFromBirth: 4,
    description: '预防百日咳、白喉、破伤风。',
    category: 'national'
  },
  // 5月龄
  {
    id: 'dtap-3',
    name: '百白破疫苗',
    shortName: 'DTaP',
    dose: '第3剂',
    monthsFromBirth: 5,
    description: '预防百日咳、白喉、破伤风。',
    category: 'national'
  },
  // 6月龄
  {
    id: 'hepb-2',
    name: '乙肝疫苗',
    shortName: 'HepB',
    dose: '第3剂',
    monthsFromBirth: 6,
    description: '预防乙型肝炎。完成全程免疫。',
    category: 'national'
  },
  {
    id: 'menA-1',
    name: 'A群流脑多糖疫苗',
    shortName: 'MenA',
    dose: '第1剂',
    monthsFromBirth: 6,
    description: '预防A群脑膜炎球菌引起的流行性脑脊髓膜炎。',
    category: 'national'
  },
  // 8月龄
  {
    id: 'mr-1',
    name: '麻腮风疫苗',
    shortName: 'MMR',
    dose: '第1剂（麻风/麻腮风）',
    monthsFromBirth: 8,
    description: '预防麻疹、风疹、流行性腮腺炎。',
    category: 'national'
  },
  {
    id: 'je-1',
    name: '乙脑减毒活疫苗',
    shortName: 'JE-L',
    dose: '第1剂',
    monthsFromBirth: 8,
    description: '预防流行性乙型脑炎。',
    category: 'national'
  },
  // 9月龄
  {
    id: 'menA-2',
    name: 'A群流脑多糖疫苗',
    shortName: 'MenA',
    dose: '第2剂',
    monthsFromBirth: 9,
    description: '预防A群脑膜炎球菌引起的流行性脑脊髓膜炎。',
    category: 'national'
  },
  // 18月龄
  {
    id: 'dtap-booster',
    name: '百白破疫苗',
    shortName: 'DTaP',
    dose: '加强免疫',
    monthsFromBirth: 18,
    description: '百白破疫苗加强免疫。',
    category: 'national'
  },
  {
    id: 'mr-2',
    name: '麻腮风疫苗',
    shortName: 'MMR',
    dose: '第2剂',
    monthsFromBirth: 18,
    description: '预防麻疹、风疹、流行性腮腺炎加强免疫。',
    category: 'national'
  },
  {
    id: 'hepa',
    name: '甲肝减毒活疫苗',
    shortName: 'HepA',
    dose: '第1剂',
    monthsFromBirth: 18,
    description: '预防甲型肝炎。',
    category: 'national'
  },
  // 2岁
  {
    id: 'je-2',
    name: '乙脑减毒活疫苗',
    shortName: 'JE-L',
    dose: '第2剂',
    monthsFromBirth: 24,
    description: '乙脑疫苗加强免疫。',
    category: 'national'
  },
  // 3岁
  {
    id: 'menAC-1',
    name: 'A+C群流脑多糖疫苗',
    shortName: 'MenAC',
    dose: '第1剂',
    monthsFromBirth: 36,
    description: '预防A群和C群脑膜炎球菌引起的流行性脑脊髓膜炎。',
    category: 'national'
  },
  // 4岁
  {
    id: 'opv-booster',
    name: '脊灰减毒活疫苗',
    shortName: 'OPV',
    dose: '加强免疫',
    monthsFromBirth: 48,
    description: '脊灰疫苗加强免疫。',
    category: 'national'
  },
  // 6岁
  {
    id: 'dt-booster',
    name: '白破疫苗',
    shortName: 'DT',
    dose: '加强免疫',
    monthsFromBirth: 72,
    description: '白破疫苗加强免疫。',
    category: 'national'
  },
  {
    id: 'menAC-2',
    name: 'A+C群流脑多糖疫苗',
    shortName: 'MenAC',
    dose: '第2剂',
    monthsFromBirth: 72,
    description: 'A+C群流脑疫苗加强免疫。',
    category: 'national'
  },
  // 非免疫规划（推荐自费）
  {
    id: 'pcv13-1',
    name: '13价肺炎球菌多糖结合疫苗',
    shortName: 'PCV13',
    dose: '第1剂',
    monthsFromBirth: 2,
    description: '预防13种肺炎球菌血清型引起的侵袭性疾病。自愿自费。',
    category: 'optional'
  },
  {
    id: 'pcv13-2',
    name: '13价肺炎球菌多糖结合疫苗',
    shortName: 'PCV13',
    dose: '第2剂',
    monthsFromBirth: 4,
    description: '13价肺炎球菌结合疫苗第2剂。',
    category: 'optional'
  },
  {
    id: 'pcv13-3',
    name: '13价肺炎球菌多糖结合疫苗',
    shortName: 'PCV13',
    dose: '第3剂',
    monthsFromBirth: 6,
    description: '13价肺炎球菌结合疫苗第3剂。',
    category: 'optional'
  },
  {
    id: 'pcv13-booster',
    name: '13价肺炎球菌多糖结合疫苗',
    shortName: 'PCV13',
    dose: '加强免疫（12-15月龄）',
    monthsFromBirth: 12,
    description: '13价肺炎球菌结合疫苗加强免疫。',
    category: 'optional'
  },
  {
    id: 'hib-1',
    name: 'b型流感嗜血杆菌疫苗',
    shortName: 'Hib',
    dose: '第1剂',
    monthsFromBirth: 2,
    description: '预防b型流感嗜血杆菌感染。自愿自费。',
    category: 'optional'
  },
  {
    id: 'rota-1',
    name: '口服轮状病毒疫苗',
    shortName: 'Rota',
    dose: '第1剂',
    monthsFromBirth: 2,
    description: '预防轮状病毒引起的婴幼儿腹泻。自愿自费。',
    category: 'optional'
  },
  {
    id: 'varicella',
    name: '水痘疫苗',
    shortName: 'Var',
    dose: '第1剂',
    monthsFromBirth: 12,
    description: '预防水痘。1岁后接种，自愿自费。',
    category: 'optional'
  },
  {
    id: 'flu-annual',
    name: '流感疫苗',
    shortName: 'Flu',
    dose: '每年接种',
    monthsFromBirth: 6,
    description: '6月龄以上可接种，每年秋冬季接种1剂。自愿自费。',
    category: 'optional',
    recurring: true
  }
];

// 里程碑参考数据
window.MILESTONE_PRESETS = [
  { icon: '😊', title: '第一次微笑', ageMonths: 2, category: 'social' },
  { icon: '🙆', title: '会抬头', ageMonths: 3, category: 'motor' },
  { icon: '🌀', title: '会翻身', ageMonths: 4, category: 'motor' },
  { icon: '🍽️', title: '添加辅食', ageMonths: 6, category: 'feeding' },
  { icon: '🪑', title: '会坐', ageMonths: 7, category: 'motor' },
  { icon: '🦷', title: '出第一颗乳牙', ageMonths: 6, category: 'physical' },
  { icon: '🧗', title: '会爬', ageMonths: 8, category: 'motor' },
  { icon: '👋', title: '会挥手再见', ageMonths: 9, category: 'social' },
  { icon: '🗣️', title: '叫"爸爸/妈妈"', ageMonths: 10, category: 'language' },
  { icon: '🚶', title: '会扶站', ageMonths: 10, category: 'motor' },
  { icon: '👶', title: '会走', ageMonths: 12, category: 'motor' },
  { icon: '🥄', title: '会用勺子', ageMonths: 12, category: 'feeding' },
  { icon: '🗨️', title: '会说单词', ageMonths: 14, category: 'language' },
  { icon: '🏃', title: '会跑', ageMonths: 18, category: 'motor' },
  { icon: '📚', title: '会说短句', ageMonths: 24, category: 'language' },
  { icon: '🚽', title: '如厕训练', ageMonths: 24, category: 'selfcare' }
];