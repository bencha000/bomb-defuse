(() => {
  'use strict';

  const CFG = window.GAME_CONFIG;
  if (!CFG) {
    document.body.textContent = 'config.js 未加载';
    return;
  }

  // ---------------------------------------------------------------- canvas
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- utils
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const approach = (v, target, delta) => {
    if (v < target) return Math.min(v + delta, target);
    if (v > target) return Math.max(v - delta, target);
    return v;
  };
  const deg2rad = (d) => (d * Math.PI) / 180;

  // ---------------------------------------------------------------- world
  const WORLD = { w: 45, h: 35 };

  const WALLS = [
    // 边界
    { x: -1, y: -1, w: WORLD.w + 2, h: 1 },
    { x: -1, y: WORLD.h, w: WORLD.w + 2, h: 1 },
    { x: -1, y: -1, w: 1, h: WORLD.h + 2 },
    { x: WORLD.w, y: -1, w: 1, h: WORLD.h + 2 },
    // 相邻双包点之间的隔墙，中间留 3.5m 通道
    { x: 21.75, y: 4.0, w: 0.5, h: 5.25 },
    { x: 21.75, y: 12.75, w: 0.5, h: 7.25 },
    // 掩体
    { x: 9.0, y: 18.0, w: 2.0, h: 2.0 },
    { x: 14.0, y: 23.0, w: 3.0, h: 1.2 },
    { x: 24.0, y: 22.0, w: 1.5, h: 1.5 },
    { x: 33.0, y: 16.0, w: 2.5, h: 1.0 },
    { x: 30.0, y: 26.0, w: 2.0, h: 2.0 },
    { x: 11.0, y: 7.0, w: 1.5, h: 1.5 },
    { x: 36.0, y: 6.0, w: 1.2, h: 3.0 }
  ];

  const SITES = [
    { name: 'A', x: 16, y: 11, r: 3.5 },
    { name: 'B', x: 28, y: 11, r: 3.5 }
  ];

  // ---------------------------------------------------------------- player
  const player = {
    x: 7,
    y: 28,
    r: 0.45,
    vx: 0,
    vy: 0,
    speed: 0,
    aim: 0,
    shotIndex: 0,
    lastShotAt: -1e9,
    recoveryAcc: 0,
    nextFireAt: 0,
    reloading: false,
    reloadEnd: 0,
    reloadShell: -1,
    muzzleFlash: 0
  };

  let weaponIndex = 0;
  const ammoState = CFG.weapons.map((w) => ({ ammo: w.mag, reserve: w.reserve }));
  const weapon = () => CFG.weapons[weaponIndex];

  // 每把枪的统计：总击杀 / 总伤害 / 总命中 / 总发射
  const weaponStats = CFG.weapons.map((w) => ({ kills: 0, damage: 0, hits: 0, shots: 0, lastTTK: null }));

  // ---------------------------------------------------------------- targets
  const targets = [
    { x: 16, y: 11, r: 0.55, hp: 100, dead: false, respawnAt: 0, firstHitAt: 0, lastHitAt: -1e9 },
    { x: 28, y: 11, r: 0.55, hp: 100, dead: false, respawnAt: 0, firstHitAt: 0, lastHitAt: -1e9 },
    { x: 22, y: 25, r: 0.55, hp: 100, dead: false, respawnAt: 0, firstHitAt: 0, lastHitAt: -1e9 },
    { x: 38, y: 8, r: 0.55, hp: 100, dead: false, respawnAt: 0, firstHitAt: 0, lastHitAt: -1e9 }
  ];
  const MAX_HP = 100;

  const tracers = [];
  const floats = [];

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const mouse = { x: viewW / 2, y: viewH / 2, held: false, clicked: false };

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyR') startReload(performance.now());
    if (/^Digit[1-5]$/.test(e.code)) {
      const idx = Number(e.code.slice(5)) - 1;
      if (idx < CFG.weapons.length) switchWeapon(idx);
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouse.held = true;
    mouse.clicked = true;
    e.preventDefault();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.held = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- state
  function getState() {
    // 原型用 C 代替 Ctrl：浏览器会拦截 Ctrl+W
    const crouch = keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight');
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const moving = keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD');
    if (crouch) return 'crouch';
    if (!moving) return 'idle';
    if (shift) return 'walk';
    return 'sprint';
  }

  function switchWeapon(idx) {
    weaponIndex = idx;
    player.reloading = false;
    player.nextFireAt = 0;
    player.shotIndex = 0;
  }

  function startReload(now) {
    const w = weapon();
    const st = ammoState[weaponIndex];
    if (player.reloading || st.ammo >= w.mag || st.reserve <= 0) return;
    player.reloading = true;
    // 散弹枪：逐发装填；其他武器：整体 reloadSec
    if (w.reloadPerShellSec && st.ammo < w.mag) {
      player.reloadEnd = now + w.reloadPerShellSec * 1000;
      player.reloadShell = st.ammo; // 当前装填进度（弹匣已有）
    } else {
      player.reloadEnd = now + w.reloadSec * 1000;
      player.reloadShell = -1;
    }
  }

  // ---------------------------------------------------------------- movement
  function moveWithCollision(p, dx, dy) {
    p.x += dx;
    resolveCollision(p);
    p.y += dy;
    resolveCollision(p);
    p.x = clamp(p.x, p.r, WORLD.w - p.r);
    p.y = clamp(p.y, p.r, WORLD.h - p.r);
  }

  function resolveCollision(p) {
    for (const w of WALLS) {
      const cx = clamp(p.x, w.x, w.x + w.w);
      const cy = clamp(p.y, w.y, w.y + w.h);
      let ddx = p.x - cx;
      let ddy = p.y - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 >= p.r * p.r) continue;

      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        const push = p.r - d;
        p.x += (ddx / d) * push;
        p.y += (ddy / d) * push;
      } else {
        // 圆心在矩形内：沿最小穿透轴推出
        const left = p.x - w.x;
        const right = w.x + w.w - p.x;
        const top = p.y - w.y;
        const bottom = w.y + w.h - p.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) p.x = w.x - p.r;
        else if (m === right) p.x = w.x + w.w + p.r;
        else if (m === top) p.y = w.y - p.r;
        else p.y = w.y + w.h + p.r;
      }
    }
  }

  function updateMovement(dt) {
    const state = getState();
    const speed = CFG.movement.modes[state].speedMps;

    let dx = 0;
    let dy = 0;
    if (keys.has('KeyW')) dy -= 1;
    if (keys.has('KeyS')) dy += 1;
    if (keys.has('KeyA')) dx -= 1;
    if (keys.has('KeyD')) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }

    const accel = 60;
    player.vx = approach(player.vx, dx * speed, accel * dt);
    player.vy = approach(player.vy, dy * speed, accel * dt);
    moveWithCollision(player, player.vx * dt, player.vy * dt);
    player.speed = Math.hypot(player.vx, player.vy);
  }

  // ---------------------------------------------------------------- camera
  const cam = { cx: WORLD.w / 2, cy: WORLD.h / 2, scale: 32 };

  function updateCamera() {
    cam.scale = clamp(viewW / 32, 24, 48);
    const halfW = viewW / (2 * cam.scale);
    const halfH = viewH / (2 * cam.scale);
    cam.cx = WORLD.w <= halfW * 2 ? WORLD.w / 2 : clamp(player.x, halfW, WORLD.w - halfW);
    cam.cy = WORLD.h <= halfH * 2 ? WORLD.h / 2 : clamp(player.y, halfH, WORLD.h - halfH);
  }

  const worldToScreen = (x, y) => ({
    x: (x - cam.cx) * cam.scale + viewW / 2,
    y: (y - cam.cy) * cam.scale + viewH / 2
  });

  const screenToWorld = (x, y) => ({
    x: (x - viewW / 2) / cam.scale + cam.cx,
    y: (y - viewH / 2) / cam.scale + cam.cy
  });

  // ---------------------------------------------------------------- shooting
  function shotLevel(state) {
    const w = weapon();
    const profile = CFG.accuracy.stateProfiles[state][w.class];
    return profile[Math.min(player.shotIndex, profile.length - 1)];
  }

  function spreadDegFor(state) {
    const w = weapon();
    if (w.class === 'shotgun') {
      return CFG.accuracy.shotgun.spreadDeg * CFG.accuracy.shotgun.stateMultiplier[state];
    }
    return CFG.accuracy.levelToSpreadDeg[String(shotLevel(state))];
  }

  function fireOnce(now) {
    const w = weapon();
    const st = ammoState[weaponIndex];

    if (player.reloading) return;
    if (now < player.nextFireAt) return;
    if (st.ammo <= 0) {
      startReload(now);
      return;
    }

    const state = getState();
    st.ammo -= 1;
    player.nextFireAt = now + 60000 / w.rpm;
    player.lastShotAt = now;
    player.recoveryAcc = 0;
    player.muzzleFlash = 0.06;
    weaponStats[weaponIndex].shots += 1;

    if (w.class === 'shotgun') {
      const spread = CFG.accuracy.shotgun.spreadDeg * CFG.accuracy.shotgun.stateMultiplier[state];
      for (let i = 0; i < CFG.accuracy.shotgun.pellets; i += 1) {
        castAndHit(player.aim + (Math.random() * 2 - 1) * deg2rad(spread), w.damagePerPellet);
      }
    } else {
      const spread = CFG.accuracy.levelToSpreadDeg[String(shotLevel(state))];
      castAndHit(player.aim + (Math.random() * 2 - 1) * deg2rad(spread), w.damage);
      player.shotIndex = Math.min(player.shotIndex + 1, 3);
    }

    if (st.ammo === 0) startReload(now);
  }

  function rayCircle(ox, oy, dx, dy, cx, cy, r) {
    const ex = ox - cx;
    const ey = oy - cy;
    const b = ex * dx + ey * dy;
    const c = ex * ex + ey * ey - r * r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t = -b - sq;
    if (t < 0) t = -b + sq;
    return t >= 0 ? t : null;
  }

  function rayAabb(ox, oy, dx, dy, box) {
    let tmin = -Infinity;
    let tmax = Infinity;

    if (Math.abs(dx) < 1e-9) {
      if (ox < box.x || ox > box.x + box.w) return null;
    } else {
      let t1 = (box.x - ox) / dx;
      let t2 = (box.x + box.w - ox) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }

    if (Math.abs(dy) < 1e-9) {
      if (oy < box.y || oy > box.y + box.h) return null;
    } else {
      let t1 = (box.y - oy) / dy;
      let t2 = (box.y + box.h - oy) / dy;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
    }

    if (tmax < 0 || tmin > tmax) return null;
    return tmin >= 0 ? tmin : tmax;
  }

  // 距离衰减：fullM 内满伤，minM 外 minRatio，中间线性插值
  function computeDamage(baseDamage, distance, falloff) {
    if (!falloff) return baseDamage;
    if (distance <= falloff.fullM) return baseDamage;
    if (distance >= falloff.minM) return baseDamage * falloff.minRatio;
    const t = (distance - falloff.fullM) / (falloff.minM - falloff.fullM);
    return baseDamage * (1 - t * (1 - falloff.minRatio));
  }

  function castAndHit(angle, baseDamage) {
    const ox = player.x;
    const oy = player.y;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const maxDist = 60;

    let bestT = maxDist;
    let hitTarget = null;

    for (const t of targets) {
      if (t.dead) continue;
      const tt = rayCircle(ox, oy, dx, dy, t.x, t.y, t.r);
      if (tt !== null && tt < bestT) {
        bestT = tt;
        hitTarget = t;
      }
    }

    for (const w of WALLS) {
      const tt = rayAabb(ox, oy, dx, dy, w);
      if (tt !== null && tt < bestT) {
        bestT = tt;
        hitTarget = null;
      }
    }

    const ex = ox + dx * bestT;
    const ey = oy + dy * bestT;
    const hitDistance = bestT;
    tracers.push({ x1: ox, y1: oy, x2: ex, y2: ey, life: 0.07, max: 0.07 });

    if (hitTarget) {
      const w = weapon();
      const effectiveDamage = computeDamage(baseDamage, hitDistance, w.distanceFalloff);
      if (effectiveDamage > 0.01) damageTarget(hitTarget, effectiveDamage, ex, ey);
    }
  }

  function damageTarget(t, damage, x, y) {
    const now = performance.now();
    if (now - t.lastHitAt > 800) t.firstHitAt = now;
    t.lastHitAt = now;

    const s = weaponStats[weaponIndex];
    s.hits += 1;
    s.damage += damage;

    t.hp -= damage;
    floats.push({ x, y, text: String(Math.round(damage)), life: 0.7, max: 0.7 });

    if (t.hp <= 0) {
      const ttk = Math.round(now - t.firstHitAt);
      t.dead = true;
      t.respawnAt = now + 1500;
      s.kills += 1;
      s.lastTTK = ttk;
      setTTK(ttk);
      floats.push({ x: t.x, y: t.y - 0.8, text: `TTK ${ttk}ms`, life: 1.2, max: 1.2, big: true });
    }
  }

  function respawnTargets(now) {
    for (const t of targets) {
      if (t.dead && now >= t.respawnAt) {
        t.dead = false;
        t.hp = MAX_HP;
        t.firstHitAt = 0;
        t.lastHitAt = -1e9;
      }
    }
  }

  // ---------------------------------------------------------------- render
  function drawGrid() {
    const step = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WORLD.w; x += step) {
      const a = worldToScreen(x, 0);
      const b = worldToScreen(x, WORLD.h);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    for (let y = 0; y <= WORLD.h; y += step) {
      const a = worldToScreen(0, y);
      const b = worldToScreen(WORLD.w, y);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  function drawSites() {
    for (const s of SITES) {
      const p = worldToScreen(s.x, s.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.r * cam.scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(50, 240, 140, 0.055)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(50, 240, 140, 0.28)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(50, 240, 140, 0.55)';
      ctx.font = '600 22px "Cascadia Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.name, p.x, p.y - s.r * cam.scale + 16);
    }
  }

  function drawWalls() {
    for (const w of WALLS) {
      const p = worldToScreen(w.x, w.y);
      ctx.fillStyle = '#252833';
      ctx.strokeStyle = '#3a3f52';
      ctx.lineWidth = 1;
      ctx.fillRect(p.x, p.y, w.w * cam.scale, w.h * cam.scale);
      ctx.strokeRect(p.x, p.y, w.w * cam.scale, w.h * cam.scale);
    }
  }

  function drawTargets(now) {
    for (const t of targets) {
      if (t.dead) continue;
      const p = worldToScreen(t.x, t.y);
      const r = t.r * cam.scale;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 70, 58, 0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const barW = 34;
      const ratio = Math.max(0, t.hp / MAX_HP);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.x - barW / 2, p.y - r - 12, barW, 4);
      ctx.fillStyle = ratio > 0.5 ? '#32f08c' : ratio > 0.25 ? '#efaa17' : '#e8463a';
      ctx.fillRect(p.x - barW / 2, p.y - r - 12, barW * ratio, 4);
    }
  }

  function drawPlayer() {
    const p = worldToScreen(player.x, player.y);
    const r = player.r * cam.scale;

    // 散布锥
    const state = getState();
    const spread = deg2rad(spreadDegFor(state));
    const len = 9 * cam.scale;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.arc(p.x, p.y, len, player.aim - spread, player.aim + spread);
    ctx.closePath();
    ctx.fillStyle = 'rgba(50, 240, 140, 0.07)';
    ctx.fill();

    // 本体
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#32f08c';
    ctx.fill();

    // 朝向
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(player.aim) * r * 2.2, p.y + Math.sin(player.aim) * r * 2.2);
    ctx.strokeStyle = '#0a3a22';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 枪口火光
    if (player.muzzleFlash > 0) {
      const mx = p.x + Math.cos(player.aim) * r * 2.4;
      const my = p.y + Math.sin(player.aim) * r * 2.4;
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 220, 140, 0.9)';
      ctx.fill();
    }
  }

  function drawTracers(dt) {
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const tr = tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        tracers.splice(i, 1);
        continue;
      }
      const a = worldToScreen(tr.x1, tr.y1);
      const b = worldToScreen(tr.x2, tr.y2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = `rgba(255, 240, 200, ${0.55 * (tr.life / tr.max)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      const f = floats[i];
      f.life -= dt;
      if (f.life <= 0) {
        floats.splice(i, 1);
        continue;
      }
      const k = 1 - f.life / f.max;
      const p = worldToScreen(f.x, f.y - k * 0.9);
      const alpha = 1 - k;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.big ? '#32f08c' : '#ffffff';
      ctx.font = f.big ? '600 13px "Cascadia Mono", monospace' : '600 12px "Cascadia Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawCrosshair() {
    const state = getState();
    const spread = deg2rad(spreadDegFor(state));
    const radius = Math.tan(spread) * 9 * cam.scale;

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, Math.max(2, radius), 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(mouse.x - 8, mouse.y);
    ctx.lineTo(mouse.x - 3, mouse.y);
    ctx.moveTo(mouse.x + 3, mouse.y);
    ctx.lineTo(mouse.x + 8, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 8);
    ctx.lineTo(mouse.x, mouse.y - 3);
    ctx.moveTo(mouse.x, mouse.y + 3);
    ctx.lineTo(mouse.x, mouse.y + 8);
    ctx.stroke();
  }

  // ---------------------------------------------------------------- hud
  const el = {
    weapon: document.getElementById('hud-weapon'),
    state: document.getElementById('hud-state'),
    speed: document.getElementById('hud-speed'),
    level: document.getElementById('hud-level'),
    spread: document.getElementById('hud-spread'),
    ammo: document.getElementById('hud-ammo'),
    rpm: document.getElementById('hud-rpm'),
    fps: document.getElementById('hud-fps'),
    ttk: document.getElementById('ttk-value')
  };

  function setTTK(ms) {
    el.ttk.textContent = `${ms} ms`;
  }

  function updateHud(fps) {
    const w = weapon();
    const st = ammoState[weaponIndex];
    const stats = weaponStats[weaponIndex];
    const state = getState();
    const level = w.class === 'shotgun' ? '固定锥' : String(shotLevel(state));
    const spread = spreadDegFor(state).toFixed(2);
    const accuracy = stats.shots > 0 ? (stats.hits / stats.shots * 100).toFixed(0) : '—';

    el.weapon.textContent = `${w.name}  ·  ${weaponIndex + 1}/${CFG.weapons.length}`;
    el.state.textContent = state.toUpperCase();
    el.speed.textContent = `${player.speed.toFixed(2)} m/s`;
    el.level.textContent = player.reloading ? '换弹中' : level;
    el.spread.textContent = `±${spread}°`;
    el.ammo.textContent = player.reloading
      ? (w.reloadPerShellSec && player.reloadShell >= 0
          ? `装填 ${player.reloadShell}/${w.mag}`
          : 'RELOAD')
      : `${st.ammo} / ${st.reserve}`;
    el.rpm.textContent = `${w.rpm} RPM`;
    el.fps.textContent = String(Math.round(fps));
    // 统计
    el.ttk.textContent =
      `击杀 ${stats.kills} · 伤害 ${Math.round(stats.damage)} · 命中 ${accuracy}%` +
      (stats.lastTTK ? `\nTTK ${stats.lastTTK}ms` : '\nTTK --');
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let fps = 60;

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    fps += (1 / Math.max(dt, 1e-4) - fps) * 0.08;

    // 鼠标世界坐标
    const mw = screenToWorld(mouse.x, mouse.y);
    player.aim = Math.atan2(mw.y - player.y, mw.x - player.x);

    updateMovement(dt);
    updateCamera();

    // 精度恢复：停火 0.4s 后每 0.1s 回一挡
    if (now - player.lastShotAt > CFG.accuracy.recoveryDelaySec * 1000) {
      player.recoveryAcc += dt;
      const step = 1 / CFG.accuracy.recoveryLevelsPerSec;
      while (player.recoveryAcc >= step && player.shotIndex > 0) {
        player.shotIndex -= 1;
        player.recoveryAcc -= step;
      }
    } else {
      player.recoveryAcc = 0;
    }

    // 换弹：散弹逐发，其他整体
    if (player.reloading && now >= player.reloadEnd) {
      const w = weapon();
      const st = ammoState[weaponIndex];
      if (w.reloadPerShellSec && player.reloadShell >= 0) {
        // 散弹逐发装填
        player.reloadShell += 1;
        st.ammo += 1;
        st.reserve -= 1;
        if (player.reloadShell >= w.mag || st.reserve <= 0) {
          player.reloading = false;
        } else {
          player.reloadEnd = now + w.reloadPerShellSec * 1000;
        }
      } else {
        // 其他武器整体装填
        const need = w.mag - st.ammo;
        const take = Math.min(need, st.reserve);
        st.ammo += take;
        st.reserve -= take;
        player.reloading = false;
      }
    }

    // 开火
    const w = weapon();
    if (mouse.clicked) {
      mouse.clicked = false;
      if (w.class !== 'auto') fireOnce(now);
    }
    if (mouse.held && w.class === 'auto') fireOnce(now);

    if (player.muzzleFlash > 0) player.muzzleFlash -= dt;
    respawnTargets(now);

    // 绘制
    ctx.fillStyle = '#12131a';
    ctx.fillRect(0, 0, viewW, viewH);

    drawGrid();
    drawSites();
    drawWalls();
    drawTargets(now);
    drawTracers(dt);
    drawPlayer();
    drawFloats(dt);
    drawCrosshair();

    updateHud(fps);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
