// 原型只加载 weapons / movement / accuracy 三组，数值与 bomb_defuse_config.json 保持一致。
window.GAME_CONFIG = {
  movement: {
    speedPerLevelMps: 0.6,
    jumpEnabled: false,
    crouchOverridesWalk: true,
    modes: {
      idle:    { key: "none",    speedLevel: 0,  speedMps: 0,   footstepRadiusM: 0 },
      sprint:  { key: "default", speedLevel: 10, speedMps: 6.0, footstepRadiusM: 18 },
      walk:    { key: "Shift",   speedLevel: 4,  speedMps: 2.4, footstepRadiusM: 0, silent: true },
      crouch:  { key: "Ctrl",    speedLevel: 2,  speedMps: 1.2, footstepRadiusM: 0, silent: true,
                 recoilMultiplier: 0.7, hitboxScale: 0.7 }
    }
  },

  accuracy: {
    levelToSpreadDeg: {
      "10": 0.1, "9": 0.4, "8": 0.7, "7": 1.2, "6": 1.8,
      "5": 2.6, "4": 3.5, "3": 4.6, "2": 6.0, "1": 8.0
    },
    sequenceNote: "数组为 [首发, 第2发, 第3发, 稳态]",
    stateProfiles: {
      idle:   { semi: [10, 9, 8, 7], auto: [10, 9, 8, 7] },
      crouch: { semi: [10, 9, 8, 8], auto: [10, 9, 8, 8] },
      walk:   { semi: [10, 9, 9, 8], auto: [10, 8, 6, 5] },
      sprint: { semi: [1, 1, 1, 1],  auto: [1, 1, 1, 1] }
    },
    recoveryDelaySec: 0.4,
    recoveryLevelsPerSec: 10,
    shotgun: {
      pellets: 8,
      spreadDeg: 10,
      ignoresAccuracyLevels: true,
      stateMultiplier: { idle: 1.0, crouch: 0.8, walk: 1.4, sprint: 2.2 }
    }
  },

  weapons: [
    { id: "pistol",          class: "semi",    name: "手枪",     price: 700,  damage: 32, rpm: 300, mag: 12, reserve: 36, reloadSec: 2.0, killReward: 300,
      distanceFalloff: { fullM: 8, minM: 20, minRatio: 0.6 } },
    { id: "precision_rifle", class: "semi",    name: "精准步枪", price: 2700, damage: 52, rpm: 240, mag: 10, reserve: 30, reloadSec: 2.6, killReward: 300,
      distanceFalloff: { fullM: 20, minM: 40, minRatio: 0.6 } },
    { id: "smg",             class: "auto",    name: "冲锋枪",   price: 1250, damage: 18, rpm: 900, mag: 25, reserve: 75, reloadSec: 1.8, killReward: 300,
      distanceFalloff: { fullM: 5, minM: 15, minRatio: 0.5 } },
    { id: "rifle",           class: "auto",    name: "步枪",     price: 2900, damage: 26, rpm: 600, mag: 30, reserve: 90, reloadSec: 2.4, killReward: 300,
      distanceFalloff: { fullM: 15, minM: 30, minRatio: 0.7 } },
    { id: "shotgun",         class: "shotgun", name: "散弹枪",   price: 1100, damagePerPellet: 14, pellets: 8, rpm: 70, mag: 6, reserve: 18, reloadSec: 3.0, reloadPerShellSec: 0.5, killReward: 600,
      distanceFalloff: { fullM: 4, minM: 10, minRatio: 0.0 } }
  ]
};
