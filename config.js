// 数值配置表：调平衡只需要改这里
const CONFIG = {
  startCoins: 1500,

  // Demo 为了便于试玩，恢复速度比正式产品快很多
  spins: { start: 30, max: 50, regenSeconds: 20 },
  bets: [1, 2, 3, 5],

  // 单次奖励基数 = base + perBuilding × 已建设施数，模拟“园区等级越高单次产出越大”
  baseUnit: { base: 60, perBuilding: 20 },

  outcomes: [
    { id: 'small',   weight: 46 },
    { id: 'coin3',   weight: 14, symbol: '💰', mult: 6 },
    { id: 'jackpot', weight: 2,  symbol: '💎', mult: 25 },
    { id: 'steal',   weight: 10, symbol: '🐻' },
    { id: 'attack',  weight: 10, symbol: '✈️' },
    { id: 'shield',  weight: 9,  symbol: '🛡️' },
    { id: 'energy',  weight: 9,  symbol: '⚡', spins: 3 },
  ],

  steal: { minUnits: 3, rivalStashRate: 0.1 },
  attack: { rewardUnits: 4, blockedRatio: 0.3, rivalShieldChance: 0.3 },
  shieldMax: 3,
  shieldFullRewardUnits: 2,

  grid: { cols: 5, rows: 4 },
  queueMax: 8,
  // perAdjacencyLink：每一对相邻的同主题设施额外吸引的客流（仅“经营轻策略”开启时）
  arrival: { base: 1, perLevel: 1.2, perAdjacencyLink: 0.5 },
  noPreferencePriceRatio: 0.5,
  adjacencyBonus: 0.2,
  upgrade: { maxLevel: 3, costGrowth: 1.8, capPerLevel: 1, priceGrowth: 1.3 },
  repairRatio: 0.25,
  demolishRefund: 0.5,

  dayLengthSeconds: 120,
  dayPresets: [
    { name: '均衡日',   mix: { thrill: 0.34, family: 0.33, food: 0.33 } },
    { name: '家庭日',   mix: { thrill: 0.15, family: 0.6,  food: 0.25 } },
    { name: '刺激周末', mix: { thrill: 0.6,  family: 0.15, food: 0.25 } },
    { name: '美食节',   mix: { thrill: 0.2,  family: 0.2,  food: 0.6 } },
  ],

  themes: {
    thrill: { name: '刺激', visitor: '🧑‍🎤', color: '#ff8a65' },
    family: { name: '亲子', visitor: '👨‍👩‍👧', color: '#64b5f6' },
    food:   { name: '美食', visitor: '🧑‍🍳', color: '#ffd54f' },
  },

  // cost 建造价，cap 每秒接待人数，price 每位游客付费
  facilities: [
    { id: 'pirate',   name: '海盗船',   icon: '⛵', theme: 'thrill', cost: 800,  cap: 2, price: 5 },
    { id: 'drop',     name: '跳楼机',   icon: '🗼', theme: 'thrill', cost: 1600, cap: 2, price: 8 },
    { id: 'coaster',  name: '过山车',   icon: '🎢', theme: 'thrill', cost: 3000, cap: 3, price: 9 },
    { id: 'carousel', name: '旋转木马', icon: '🎠', theme: 'family', cost: 500,  cap: 3, price: 3 },
    { id: 'bumper',   name: '碰碰车',   icon: '🚗', theme: 'family', cost: 1100, cap: 3, price: 5 },
    { id: 'wheel',    name: '摩天轮',   icon: '🎡', theme: 'family', cost: 2400, cap: 4, price: 6 },
    { id: 'icecream', name: '冰淇淋',   icon: '🍦', theme: 'food',   cost: 300,  cap: 2, price: 3 },
    { id: 'popcorn',  name: '爆米花',   icon: '🍿', theme: 'food',   cost: 700,  cap: 3, price: 3 },
    { id: 'burger',   name: '汉堡站',   icon: '🍔', theme: 'food',   cost: 1500, cap: 3, price: 6 },
  ],

  rivals: [
    { name: '小熊乐园', avatar: '🐻', coins: 6000, rate: 5 },
    { name: '海盗湾',   avatar: '🏴‍☠️', coins: 8000, rate: 6 },
    { name: '糖果镇',   avatar: '🍭', coins: 4000, rate: 4 },
  ],
  rivalAttack: { minSeconds: 60, maxSeconds: 120, stealChance: 0.5 },

  // 表现层参数：每次转盘飞出的金币数量、每秒最多绘制的游客数等
  fx: {
    coinCount: { small: 4, coin3: 12, jackpot: 28, steal: 10, attack: 8, shield: 0, energy: 0 },
    maxWalkersPerTick: 5,
    maxWalkers: 40,
    celebrateWalkers: 10,
    incomePopupSeconds: 3,
  },

  // 被偷时损失当前金币的比例：开启“社交保底”用 capped，关闭用 uncapped
  loss: { capped: 0.15, uncapped: 0.3 },
};
