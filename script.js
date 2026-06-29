/* ================================================================
   슬라임 키우기 — 메인 스크립트
   구조:
     1. 캔버스 & 게임 상수
     2. 슬라임 상태 객체
     3. 먹이 / 이펙트 상수 & 배열
     4. 애니메이션 정의
     5. 자산 로드
     6. 행동 AI
     7. 먹이 시스템 (spawnFood / updateFoods / eatFood / levelUp)
     8. 이펙트 시스템
     9. 업데이트 (물리 & AI)
    10. 렌더링
    11. 게임 루프
    12. 이벤트 & UI
   ================================================================ */

// ── 1. 캔버스 & 게임 상수 ────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');

const CANVAS_W    = 1536;
const CANVAS_H    = 1024;
const GROUND_Y    = 870;
const LEFT_BOUND  = 90;
const RIGHT_BOUND = 1446;
const GRAVITY     = 950;
const JUMP_VY     = -620;
const BASE_WALK_SPEED = 140;

// ── 발판 (배경 이미지 지형에 맞춤, x=left, y=top, w=width) ─────
// fallDir: 낙하 방향 (+1=오른쪽 끝으로, -1=왼쪽 끝으로)
// 왼쪽 절벽은 왼쪽이 막혔으므로 오른쪽으로, 오른쪽 절벽은 오른쪽이 막혔으므로 왼쪽으로
const PLATFORMS = [
  // 왼쪽 절벽 계단 → 오른쪽으로 낙하
  { x:  88, y: 710, w: 175, fallDir:  1 },   // 왼쪽 낮은 바위
  { x:  62, y: 550, w: 275, fallDir:  1 },   // 왼쪽 중간 절벽
  { x:  62, y: 392, w: 308, fallDir:  1 },   // 왼쪽 절벽 상단 (잔디)
  // 오른쪽 절벽 계단 → 왼쪽으로 낙하
  { x:1195, y: 700, w: 160, fallDir: -1 },   // 오른쪽 낮은 바위
  { x:1250, y: 580, w: 200, fallDir: -1 },   // 오른쪽 중간 발판 (낮은 바위→돌기둥 사이)
  { x:1450, y: 488, w:  88, fallDir: -1 },   // 오른쪽 작은 돌기둥
  { x:1108, y: 395, w: 388, fallDir: -1 },   // 오른쪽 절벽 상단 (잔디+버섯)
];

// 먹이 상수
const FOOD_SIZE     = 16;     // 캔버스 표시 크기 (px)
const ITEM_DISPLAY_SIZE = 114; // 아이템 캔버스 표시 크기 (px)
const ITEM_COUNT    = 25;
const FOOD_GRAVITY  = 1600;   // 먹이 중력 (px/s²)
const FOOD_BOUNCE_C = 0.48;   // 튕김 계수
const FOOD_ROLL_FRICTION = 0.92;  // 착지 후 구름 마찰 (프레임당 감속)
const FOOD_EAT_DIST = 80;     // 먹기 발동 수평 거리 (px)
const EXP_PER_FOOD  = 5;
const EAT_DURATION  = 0.55;   // 먹기 이펙트 지속 (s)


// 마우스 홀드 상태
let mouseHeld      = false;
let mousePos       = { x: 0, y: 0 };
let mouseHoldTimer = 0;

// ── 2. 슬라임 상태 객체 ──────────────────────────────────────────
const slime = {
  name:      '이름 없는 슬라임',
  level:     1,
  hp:        10,
  maxHp:     10,
  atk:       2,
  def:       0,
  exp:       0,
  maxExp:    30,             // Lv1 총 경험치 (1→2렙: 30)
  inventory: Array(9).fill(null),

  x:  CANVAS_W / 2,
  y:  GROUND_Y,
  vy: 0,
  isGrounded: true,
  facingDir:  1,

  animation:   'idle',
  frameIndex:  0,
  frameTimer:  0,

  behaviorTimer:    0,
  behaviorDuration: 2000,
  walkTargetX:      null,
  jumpDone:         false,

  walkSpeed: BASE_WALK_SPEED,

  isEating: false,
  eatTimer: 0,
};

// ── 3. 먹이 & 이펙트 배열 ────────────────────────────────────────
const foods   = [];
const effects = [];
const foodImg = new Image();
const itemImgs = Array.from({ length: ITEM_COUNT }, (_, i) => {
  const img = new Image();
  img.src = `assets/item_${i + 1}.png`;
  return img;
});

// ── 4. 애니메이션 정의 ───────────────────────────────────────────
const ANIM_DEF = {
  idle: {
    totalFrames:   4,
    frameDuration: 220,
    displayW: 112,
    displayH:    Math.round(112 * 163 / 256),  // Lv1 (256×163)
    displayHLv2: Math.round(112 * 123 / 256),  // Lv2 (256×123)
    displayHLv4: Math.round(112 * 135 / 271),  // Lv4 (271×135)
    displayHLv6: Math.round(112 * 170 / 266),  // Lv6 (266×170)
    frames:    [],
    framesLv2: [],
    framesLv4: [],
    framesLv6: [],
  },
  walk: {
    totalFrames:   4,
    frameDuration: 100,
    displayW: 112,
    displayH:    Math.round(112 * 123 / 256),  // Lv1 (256×123)
    displayHLv2: Math.round(112 * 111 / 256),  // Lv2 (256×111)
    displayHLv4: Math.round(112 * 123 / 271),  // Lv4 (271×123)
    displayHLv6: Math.round(112 * 162 / 266),  // Lv6 (266×162)
    frames:    [],
    framesLv2: [],
    framesLv4: [],
    framesLv6: [],
  },
  jump: {
    totalFrames:   4,
    frameDuration: 130,
    displayW: 112,
    displayH:    Math.round(112 * 142 / 256),  // Lv1 (256×142)
    displayHLv2: Math.round(112 * 144 / 256),  // Lv2 (256×144)
    displayHLv4: Math.round(112 * 172 / 271),  // Lv4 (271×172)
    displayHLv6: Math.round(112 * 169 / 266),  // Lv6 (266×169)
    frames:    [],
    framesLv2: [],
    framesLv4: [],
    framesLv6: [],
  },
};

// 레벨에 맞는 프레임 배열 반환 (Lv6 → Lv4 → Lv2 → Lv1 순으로 폴백)
function getFrames(animName, level = slime.level) {
  const def = ANIM_DEF[animName];
  if (level >= 6 && def.framesLv6.length > 0
      && def.framesLv6[0].complete && def.framesLv6[0].naturalWidth > 0) {
    return def.framesLv6;
  }
  if (level >= 4 && def.framesLv4.length > 0
      && def.framesLv4[0].complete && def.framesLv4[0].naturalWidth > 0) {
    return def.framesLv4;
  }
  if (level >= 2 && def.framesLv2.length > 0
      && def.framesLv2[0].complete && def.framesLv2[0].naturalWidth > 0) {
    return def.framesLv2;
  }
  return def.frames;
}

// ── 5. 배경 이미지 & 자산 로드 ───────────────────────────────────
const bgImage = new Image();

function loadAssets() {
  const promises = [];

  promises.push(new Promise(res => {
    bgImage.onload  = res;
    bgImage.onerror = () => { console.warn('배경 이미지 로드 실패'); res(); };
    bgImage.src = 'assets/배경_슬라임키우기.png';
  }));

  promises.push(new Promise(res => {
    foodImg.onload  = res;
    foodImg.onerror = () => { console.warn('먹이 이미지 없음, 폴백 사용'); res(); };
    foodImg.src = 'assets/food_coin.png';
  }));

  ['idle', 'walk', 'jump'].forEach(anim => {
    const def = ANIM_DEF[anim];
    for (let i = 1; i <= def.totalFrames; i++) {
      // Lv1 프레임
      const img1 = new Image();
      promises.push(new Promise(res => {
        img1.onload  = res;
        img1.onerror = () => { console.warn(`프레임 없음: slime_${anim}_${i}.png`); res(); };
        img1.src = `assets/slime_${anim}_${i}.png`;
      }));
      def.frames.push(img1);

      // Lv2 프레임 (없어도 무시 — Lv1 폴백)
      const img2 = new Image();
      img2.onload  = () => {};
      img2.onerror = () => {};
      img2.src = `assets/slime_lv2_${anim}_${i}.png`;
      def.framesLv2.push(img2);

      // Lv4 프레임 (없어도 무시 — Lv2 폴백)
      const img4 = new Image();
      img4.onload  = () => {};
      img4.onerror = () => {};
      img4.src = `assets/slime_lv4_${anim}_${i}.png`;
      def.framesLv4.push(img4);

      // Lv6 프레임 (없어도 무시 — Lv4 폴백)
      const img6 = new Image();
      img6.onload  = () => {};
      img6.onerror = () => {};
      img6.src = `assets/slime_lv6_${anim}_${i}.png`;
      def.framesLv6.push(img6);
    }
  });

  return Promise.all(promises);
}

// ── 6. 행동 AI ───────────────────────────────────────────────────
const BEHAVIOR_WEIGHTS = {
  idle: { idle: 10, walk: 60, jump: 30 },
  walk: { idle: 15, walk: 50, jump: 35 },
  jump: { idle: 30, walk: 55, jump: 15 },
};

function pickNextBehavior(current) {
  const w = BEHAVIOR_WEIGHTS[current];
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [name, weight] of Object.entries(w)) {
    r -= weight;
    if (r <= 0) return name;
  }
  return 'idle';
}

function startBehavior(name) {
  slime.animation      = name;
  slime.frameIndex     = 0;
  slime.frameTimer     = 0;
  slime.behaviorTimer  = 0;
  slime.jumpDone       = false;

  if (name === 'idle') {
    slime.behaviorDuration = 400 + Math.random() * 700;
    slime.walkTargetX = null;

  } else if (name === 'walk') {
    const dir  = Math.random() < 0.5 ? -1 : 1;
    const dist = 80 + Math.random() * 400;
    slime.walkTargetX      = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND,
                               slime.x + dir * dist));
    slime.facingDir        = dir;
    slime.behaviorDuration = 800 + Math.random() * 1800;

  } else if (name === 'jump') {
    slime.behaviorDuration = 900 + Math.random() * 600;
    if (Math.random() < 0.5) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      slime.walkTargetX = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND,
                            slime.x + dir * 180));
      slime.facingDir = dir;
    } else {
      slime.walkTargetX = null;
    }
  }
}

// ── 7. 먹이 시스템 ───────────────────────────────────────────────
function landFood(f, floorY) {
  f.y = floorY;
  f.bounces--;
  if (f.bounces <= 0) {
    f.phase = 'settled';
    f.vy    = 0;
  } else {
    const coef = FOOD_BOUNCE_C - (3 - f.bounces) * 0.1;
    f.vy      *= -Math.max(0.15, coef);
    f.vx      *= 0.62;
    f.rotSpeed *= 0.55;
  }
}

function spawnFood(cx, cy) {
  const spawnY = Math.min(cy, GROUND_Y - FOOD_SIZE * 1.5);
  const itemId = Math.random() < 0.03
    ? Math.ceil(Math.random() * ITEM_COUNT) : null;
  foods.push({
    x:        Math.max(LEFT_BOUND + FOOD_SIZE, Math.min(RIGHT_BOUND - FOOD_SIZE, cx)),
    y:        spawnY,
    vy:       0,
    vx:       (Math.random() - 0.5) * 60,
    rot:      Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() < 0.5 ? 1 : -1) * (5 + Math.random() * 5),
    bounces:  3,
    phase:    'falling',
    itemId,
  });
}

function updateFoods(dt) {
  const groundFloorY = GROUND_Y - FOOD_SIZE * 0.38;

  for (const f of foods) {
    // 착지 후 구름 (마찰 감속)
    if (f.phase === 'settled') {
      if (Math.abs(f.vx) > 0.5) {
        const friction = Math.pow(FOOD_ROLL_FRICTION, dt * 60);
        f.vx      *= friction;
        f.rotSpeed *= friction;
        f.x       += f.vx * dt;
        f.x = Math.max(LEFT_BOUND + FOOD_SIZE * 0.5,
                       Math.min(RIGHT_BOUND - FOOD_SIZE * 0.5, f.x));
        f.rot += f.rotSpeed * dt;

        // 발판 끝 벗어나면 낙하 시작
        if (f.y < groundFloorY - 5) {
          let onPlat = false;
          for (const p of PLATFORMS) {
            if (f.x > p.x - FOOD_SIZE * 0.5 && f.x < p.x + p.w + FOOD_SIZE * 0.5) {
              onPlat = true; break;
            }
          }
          if (!onPlat) { f.phase = 'falling'; f.vy = 0; f.bounces = 1; }
        }
      } else {
        f.vx = 0; f.rotSpeed = 0;
      }
      continue;
    }

    const prevY = f.y;
    f.vy  += FOOD_GRAVITY * dt;
    f.y   += f.vy * dt;
    f.x   += f.vx * dt;
    f.rot += f.rotSpeed * dt;

    f.x = Math.max(LEFT_BOUND + FOOD_SIZE * 0.5,
                   Math.min(RIGHT_BOUND - FOOD_SIZE * 0.5, f.x));

    // 발판 착지 (하강 중에만 교차 체크)
    if (f.vy > 0) {
      let hit = false;
      for (const p of PLATFORMS) {
        const pFloorY = p.y - FOOD_SIZE * 0.38;
        if (f.x > p.x - FOOD_SIZE * 0.5 && f.x < p.x + p.w + FOOD_SIZE * 0.5 &&
            prevY <= pFloorY && f.y >= pFloorY) {
          landFood(f, pFloorY); hit = true; break;
        }
      }
      if (!hit && f.y >= groundFloorY) landFood(f, groundFloorY);
    } else if (f.y >= groundFloorY) {
      landFood(f, groundFloorY);
    }
  }
}

// 특정 엔티티 기준 가장 가까운 착지 먹이 (발판 높이 무관)
function nearestSettledFoodFor(entity) {
  let best = null, bestDist = Infinity;
  for (const f of foods) {
    if (f.phase !== 'settled') continue;
    const d = Math.abs(f.x - entity.x);
    if (d < bestDist) { bestDist = d; best = f; }
  }
  return best;
}

function nearestSettledFood() {
  return nearestSettledFoodFor(slime);
}

// 먹이를 향한 실제 이동 목표 x
// 먹이가 아래에 있을 때: 발판의 fallDir로 낙하 방향 결정 → 끝으로 유도해 낙하
function foodMoveTargetX(entity, food) {
  const dy = food.y - entity.y;
  if (dy > 80) {
    for (const p of PLATFORMS) {
      if (entity.x > p.x - 10 && entity.x < p.x + p.w + 10 &&
          Math.abs(entity.y - p.y) < 4) {
        return p.fallDir > 0 ? p.x + p.w + 60 : p.x - 60;
      }
    }
  }
  // 같은 발판 위에 있을 때 목표 x를 발판 안쪽으로 클램프 (끝부분 진동 방지)
  for (const p of PLATFORMS) {
    if (entity.x > p.x - 10 && entity.x < p.x + p.w + 10 &&
        Math.abs(entity.y - p.y) < 4) {
      return Math.max(p.x + 20, Math.min(p.x + p.w - 20, food.x));
    }
  }
  return food.x;
}

// 다음에 올라가야 할 발판 탐색 (높이 + 먹이 x 방향 모두 고려)
function nextPlatformToward(entity, food) {
  let best = null, bestScore = Infinity;
  for (const p of PLATFORMS) {
    const heightAbove = entity.y - p.y;   // 양수 = 발판이 위에 있음
    if (heightAbove <= 50) continue;       // 발판이 위에 없으면 제외
    if (p.y < food.y - 10) continue;      // 먹이보다 높은 발판은 제외
    // 높이 차 + 발판 중심과 먹이 x 거리의 가중 합으로 점수 계산
    const platCenter = p.x + p.w / 2;
    const score = heightAbove + Math.abs(platCenter - food.x) * 0.3;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

function eatFood(food) {
  const idx = foods.indexOf(food);
  if (idx !== -1) foods.splice(idx, 1);

  effects.push({ type: 'flash', x: food.x, y: food.y, timer: 0, duration: 0.3 });
  const def = ANIM_DEF[slime.animation];

  if (food.itemId) {
    const existing = slime.inventory.find(s => s && s.itemId === food.itemId);
    if (existing) {
      existing.count++;
    } else {
      const emptyIdx = slime.inventory.indexOf(null);
      if (emptyIdx !== -1) slime.inventory[emptyIdx] = { itemId: food.itemId, count: 1 };
    }
    effects.push({ type: 'floatText',
      text: '아이템 획득!',
      x: slime.x, y: slime.y - def.displayH - 20,
      timer: 0, duration: 1.3 });
    updateInventoryUI();
  } else {
    effects.push({ type: 'floatText',
      text: `+${EXP_PER_FOOD} EXP`,
      x: slime.x, y: slime.y - def.displayH - 20,
      timer: 0, duration: 1.3 });
    slime.exp += EXP_PER_FOOD;
    if (slime.exp >= slime.maxExp) levelUp(food.x, food.y);
  }

  slime.isEating = true;
  slime.eatTimer = 0;
  startBehavior('idle');
}

function levelUp(fx, fy) {
  slime.exp      -= slime.maxExp;
  slime.level++;
  slime.maxExp    = slime.level <= 2 ? 30 : 50;
  slime.maxHp    += 5;
  slime.hp        = slime.maxHp;
  slime.atk      += 1;
  slime.walkSpeed = Math.round(slime.walkSpeed * 1.05);

  effects.push({ type: 'levelUp',
    x: fx, y: fy - 60, timer: 0, duration: 2.2 });

  // 레벨2/4: 스프라이트 전환 알림
  if (slime.level === 2) {
    const lv2ready = ANIM_DEF.idle.framesLv2[0]?.complete
                     && ANIM_DEF.idle.framesLv2[0]?.naturalWidth > 0;
    if (lv2ready) {
      effects.push({ type: 'floatText', text: '모습이 변했다!',
        x: fx, y: fy - 120, timer: 0, duration: 1.8 });
    }
  }
  if (slime.level === 4) {
    const lv4ready = ANIM_DEF.idle.framesLv4[0]?.complete
                     && ANIM_DEF.idle.framesLv4[0]?.naturalWidth > 0;
    if (lv4ready) {
      effects.push({ type: 'floatText', text: '모습이 변했다!',
        x: fx, y: fy - 120, timer: 0, duration: 1.8 });
    }
  }
  if (slime.level === 6) {
    const lv6ready = ANIM_DEF.idle.framesLv6[0]?.complete
                     && ANIM_DEF.idle.framesLv6[0]?.naturalWidth > 0;
    if (lv6ready) {
      effects.push({ type: 'floatText', text: '모습이 변했다!',
        x: fx, y: fy - 120, timer: 0, duration: 1.8 });
    }
  }

  // 레벨 2 오를때마다 동료 슬라임 추가 (Lv3, 5, 7...)
  if (slime.level >= 3 && slime.level % 2 === 1) {
    spawnCompanion();
    effects.push({ type: 'floatText', text: '동료가 나타났다!',
      x: slime.x, y: slime.y - 160, timer: 0, duration: 2.2 });
  }
}

// ── 8. 이펙트 시스템 ─────────────────────────────────────────────
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].timer += dt;
    if (effects[i].timer >= effects[i].duration) effects.splice(i, 1);
  }
}

// ── 9. 업데이트 (물리 & AI) ──────────────────────────────────────
let lastTime = null;

function update(dt) {
  const dtMs = dt * 1000;

  // 먹이 & 이펙트 업데이트 (항상)
  updateFoods(dt);
  updateEffects(dt);

  // ── 먹기 중 → AI/물리 정지, 애니만 계속 ──
  if (slime.isEating) {
    slime.eatTimer += dt;
    if (slime.eatTimer >= EAT_DURATION) {
      slime.isEating = false;
      startBehavior('idle');
    }
    const def = ANIM_DEF[slime.animation];
    slime.frameTimer += dtMs;
    if (slime.frameTimer >= def.frameDuration) {
      slime.frameTimer -= def.frameDuration;
      slime.frameIndex  = (slime.frameIndex + 1) % def.totalFrames;
    }
    return;
  }

  // ── 물리: 중력 & 착지 (발판 포함) ──
  if (!slime.isGrounded) {
    const prevY = slime.y;
    slime.vy += GRAVITY * dt;
    slime.y  += slime.vy * dt;
    if (slime.y >= GROUND_Y) {
      slime.y = GROUND_Y; slime.vy = 0; slime.isGrounded = true;
    } else if (slime.vy >= 0) {
      for (const p of PLATFORMS) {
        if (slime.x > p.x - 30 && slime.x < p.x + p.w + 30 &&
            prevY <= p.y && slime.y >= p.y) {
          slime.y = p.y; slime.vy = 0; slime.isGrounded = true; break;
        }
      }
    }
  } else {
    // 발판 끝 감지 → 낙하
    let onSurface = slime.y >= GROUND_Y - 2;
    if (!onSurface) {
      for (const p of PLATFORMS) {
        if (slime.x > p.x - 10 && slime.x < p.x + p.w + 10 &&
            Math.abs(slime.y - p.y) < 4) { onSurface = true; break; }
      }
    }
    if (!onSurface) {
      slime.isGrounded = false;
      // 착지 감지(±30)보다 끝 감지(±10)가 좁아 다음 프레임에 재착지되는 현상 방지:
      // y를 발판 아래로 살짝 밀어 prevY > p.y 를 만족시킴
      slime.y += 5;
    }
  }

  // ── 먹이 추적 (발판 높이 무관) ──
  const target = nearestSettledFood();

  if (target) {
    const dx = target.x - slime.x;
    const dy = target.y - slime.y;  // 양수 = 먹이가 아래, 음수 = 먹이가 위
    if (Math.abs(dx) < FOOD_EAT_DIST && Math.abs(dy) < 80) {
      eatFood(target);
      return;
    }
    slime.facingDir    = Math.sign(dx) || slime.facingDir;
    slime.behaviorTimer = 0;
    // 이동 목표·행동 전환은 착지 상태에서만 결정
    if (slime.isGrounded) {
      if (dy < -100) {
        // 먹이가 위쪽 → 다음 발판 탐색 후 가까워지면 점프
        const nextPlat = nextPlatformToward(slime, target);
        if (nextPlat) {
          const platCenter = nextPlat.x + nextPlat.w / 2;
          slime.walkTargetX = platCenter;
          const reachable = Math.abs(platCenter - slime.x) <= nextPlat.w / 2 + 130;
          if (reachable && (slime.animation !== 'jump' || slime.jumpDone)) {
            slime.animation  = 'jump';
            slime.jumpDone   = false;
            slime.frameIndex = 0;
            slime.frameTimer = 0;
          } else if (!reachable) {
            slime.animation = 'walk';   // 발판 근처까지 먼저 걷기
          }
        } else {
          slime.walkTargetX = foodMoveTargetX(slime, target);
          slime.animation   = 'walk';
        }
      } else {
        slime.walkTargetX = foodMoveTargetX(slime, target);
        slime.animation   = 'walk';
      }
    }
  }

  // ── 행동별 처리 ──
  if (slime.animation === 'walk' && slime.walkTargetX !== null) {
    const dx   = slime.walkTargetX - slime.x;
    const step = slime.walkSpeed * dt;
    if (Math.abs(dx) <= step) {
      slime.x = slime.walkTargetX;
      if (!target) slime.behaviorTimer = slime.behaviorDuration;
    } else {
      slime.x += Math.sign(dx) * step;
      slime.facingDir = Math.sign(dx);
    }
  }

  if (slime.animation === 'jump') {
    if (!slime.jumpDone && slime.isGrounded) {
      slime.vy         = JUMP_VY;
      slime.isGrounded = false;
      slime.jumpDone   = true;
    }
    if (slime.walkTargetX !== null && !slime.isGrounded) {
      const dx = slime.walkTargetX - slime.x;
      slime.x += Math.sign(dx) * slime.walkSpeed * 0.75 * dt;
      slime.x  = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, slime.x));
    }
  }

  // ── x 경계 클램프 ──
  slime.x = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, slime.x));

  // ── 프레임 애니메이션 ──
  const def = ANIM_DEF[slime.animation];
  if (slime.animation === 'jump') {
    if (!slime.jumpDone) {
      // 준비 단계: 프레임 0↔1 순환
      slime.frameTimer += dtMs;
      if (slime.frameTimer >= def.frameDuration) {
        slime.frameTimer -= def.frameDuration;
        slime.frameIndex = slime.frameIndex === 0 ? 1 : 0;
      }
    } else if (!slime.isGrounded) {
      // 공중: 프레임 2 고정
      slime.frameIndex = 2;
      slime.frameTimer = 0;
    } else {
      // 착지: 프레임 3을 frameDuration만큼 유지
      if (slime.frameIndex !== 3) {
        slime.frameIndex = 3;
        slime.frameTimer = 0;
      } else {
        slime.frameTimer += dtMs;
      }
    }
  } else {
    slime.frameTimer += dtMs;
    if (slime.frameTimer >= def.frameDuration) {
      slime.frameTimer -= def.frameDuration;
      slime.frameIndex  = (slime.frameIndex + 1) % def.totalFrames;
    }
  }

  // ── 행동 전환 (먹이 추적 중 동결) ──
  if (!target) {
    const jumpEnded = slime.animation === 'jump' && slime.jumpDone && slime.isGrounded
                      && slime.frameIndex === 3 && slime.frameTimer >= def.frameDuration;
    slime.behaviorTimer += dtMs;
    if (slime.behaviorTimer >= slime.behaviorDuration || jumpEnded) {
      startBehavior(pickNextBehavior(slime.animation));
    }
  }
}

// ── 10. 동료 슬라임 (레벨 2 오를때마다 추가, 독립 AI + 레벨업) ─
const companions = [];

const MAX_SLIMES = 20;   // 주인공 1 + 동료 최대 19 = 총 20마리

function spawnCompanion(fromX = slime.x) {
  if (1 + companions.length >= MAX_SLIMES) return;  // 상한 초과 시 소환 안 함
  const sx = fromX + (Math.random() < 0.5 ? -220 : 220);
  companions.push({
    x: Math.max(LEFT_BOUND + 60, Math.min(RIGHT_BOUND - 60, sx)),
    y: GROUND_Y, vy: 0,
    isGrounded: true, facingDir: -1,
    animation: 'idle', frameIndex: 0, frameTimer: 0,
    behaviorTimer: 0, behaviorDuration: 600,
    walkTargetX: null, jumpDone: false,
    level: 1, exp: 0, maxExp: 30,
    walkSpeed: BASE_WALK_SPEED,
    isEating: false, eatTimer: 0,
    atk: 1, def: 0, hp: 8, maxHp: 8,
  });
}

function eatFoodCompanion(comp, food) {
  const idx = foods.indexOf(food);
  if (idx !== -1) foods.splice(idx, 1);

  effects.push({ type: 'flash', x: food.x, y: food.y, timer: 0, duration: 0.3 });
  const def = ANIM_DEF[comp.animation];
  const usingLv6c = comp.level >= 6 && def.framesLv6.length > 0
                    && def.framesLv6[0].complete && def.framesLv6[0].naturalWidth > 0;
  const usingLv4c = !usingLv6c && comp.level >= 4 && def.framesLv4.length > 0
                    && def.framesLv4[0].complete && def.framesLv4[0].naturalWidth > 0;
  const usingLv2c = !usingLv6c && !usingLv4c && comp.level >= 2 && def.framesLv2.length > 0
                    && def.framesLv2[0].complete && def.framesLv2[0].naturalWidth > 0;
  const compDh = usingLv6c ? (def.displayHLv6 ?? def.displayH)
               : usingLv4c ? (def.displayHLv4 ?? def.displayH)
               : (usingLv2c && def.displayHLv2) ? def.displayHLv2 : def.displayH;
  if (food.itemId) {
    const existing = slime.inventory.find(s => s && s.itemId === food.itemId);
    if (existing) {
      existing.count++;
    } else {
      const emptyIdx = slime.inventory.indexOf(null);
      if (emptyIdx !== -1) slime.inventory[emptyIdx] = { itemId: food.itemId, count: 1 };
    }
    effects.push({ type: 'floatText',
      text: '아이템 획득!',
      x: comp.x, y: comp.y - compDh - 20,
      timer: 0, duration: 1.3 });
    updateInventoryUI();
  } else {
    effects.push({ type: 'floatText',
      text: `+${EXP_PER_FOOD} EXP`,
      x: comp.x, y: comp.y - compDh - 20,
      timer: 0, duration: 1.3 });
    comp.exp += EXP_PER_FOOD;
    if (comp.exp >= comp.maxExp) levelUpCompanion(comp);
  }

  comp.isEating  = true;
  comp.eatTimer  = 0;
  comp.animation = 'idle';
  comp.frameIndex = 0;
  comp.frameTimer = 0;
}

function levelUpCompanion(comp) {
  comp.exp      -= comp.maxExp;
  comp.level++;
  comp.maxExp    = comp.level <= 2 ? 30 : 50;
  comp.maxHp    += 5;
  comp.hp        = comp.maxHp;
  comp.atk      += 1;
  comp.walkSpeed = Math.round(comp.walkSpeed * 1.05);

  effects.push({ type: 'levelUp',
    x: comp.x, y: comp.y - 60, timer: 0, duration: 2.2 });

  // Lv2/4 모습 변경 알림
  if (comp.level === 2) {
    const lv2ready = ANIM_DEF.idle.framesLv2[0]?.complete
                     && ANIM_DEF.idle.framesLv2[0]?.naturalWidth > 0;
    if (lv2ready) {
      effects.push({ type: 'floatText', text: '모습이 변했다!',
        x: comp.x, y: comp.y - 120, timer: 0, duration: 1.8 });
    }
  }
  if (comp.level === 4) {
    const lv4ready = ANIM_DEF.idle.framesLv4[0]?.complete
                     && ANIM_DEF.idle.framesLv4[0]?.naturalWidth > 0;
    if (lv4ready) {
      effects.push({ type: 'floatText', text: '모습이 변했다!',
        x: comp.x, y: comp.y - 120, timer: 0, duration: 1.8 });
    }
  }
  if (comp.level === 6) {
    const lv6ready = ANIM_DEF.idle.framesLv6[0]?.complete
                     && ANIM_DEF.idle.framesLv6[0]?.naturalWidth > 0;
    if (lv6ready) {
      effects.push({ type: 'floatText', text: '모습이 변했다!',
        x: comp.x, y: comp.y - 120, timer: 0, duration: 1.8 });
    }
  }

  // 레벨 2 오를때마다 새 동료 소환 (Lv3, 5, 7...)
  if (comp.level >= 3 && comp.level % 2 === 1) {
    spawnCompanion(comp.x);
    effects.push({ type: 'floatText', text: '동료가 나타났다!',
      x: comp.x, y: comp.y - 160, timer: 0, duration: 2.2 });
  }
}

function updateCompanions(dt) {
  for (const comp of companions) updateSingleCompanion(comp, dt);
}

function updateSingleCompanion(comp, dt) {
  const dtMs = dt * 1000;

  // 먹기 중 → AI 정지, 애니만 계속
  if (comp.isEating) {
    comp.eatTimer += dt;
    if (comp.eatTimer >= EAT_DURATION) {
      comp.isEating  = false;
      comp.animation = 'idle';
      comp.frameIndex = 0;
    }
    const def = ANIM_DEF[comp.animation];
    comp.frameTimer += dtMs;
    if (comp.frameTimer >= def.frameDuration) {
      comp.frameTimer -= def.frameDuration;
      comp.frameIndex  = (comp.frameIndex + 1) % def.totalFrames;
    }
    return;
  }

  // 물리 (발판 포함)
  if (!comp.isGrounded) {
    const prevY = comp.y;
    comp.vy += GRAVITY * dt;
    comp.y  += comp.vy * dt;
    if (comp.y >= GROUND_Y) {
      comp.y = GROUND_Y; comp.vy = 0; comp.isGrounded = true;
    } else if (comp.vy >= 0) {
      for (const p of PLATFORMS) {
        if (comp.x > p.x - 30 && comp.x < p.x + p.w + 30 &&
            prevY <= p.y && comp.y >= p.y) {
          comp.y = p.y; comp.vy = 0; comp.isGrounded = true; break;
        }
      }
    }
  } else {
    let on = comp.y >= GROUND_Y - 2;
    if (!on) for (const p of PLATFORMS) {
      if (comp.x > p.x - 10 && comp.x < p.x + p.w + 10 &&
          Math.abs(comp.y - p.y) < 4) { on = true; break; }
    }
    if (!on) {
      comp.isGrounded = false;
      comp.y += 5;
    }
  }

  // 먹이 추적 (발판 높이 무관)
  const target = nearestSettledFoodFor(comp);
  if (target) {
    const dx = target.x - comp.x;
    const dy = target.y - comp.y;
    if (Math.abs(dx) < FOOD_EAT_DIST && Math.abs(dy) < 80) {
      eatFoodCompanion(comp, target);
      return;
    }
    comp.facingDir    = Math.sign(dx) || comp.facingDir;
    comp.behaviorTimer = 0;
    // 이동 목표·행동 전환은 착지 상태에서만 결정
    if (comp.isGrounded) {
      if (dy < -100) {
        const nextPlat = nextPlatformToward(comp, target);
        if (nextPlat) {
          const platCenter = nextPlat.x + nextPlat.w / 2;
          comp.walkTargetX = platCenter;
          const reachable = Math.abs(platCenter - comp.x) <= nextPlat.w / 2 + 130;
          if (reachable && (comp.animation !== 'jump' || comp.jumpDone)) {
            comp.animation  = 'jump';
            comp.jumpDone   = false;
            comp.frameIndex = 0;
            comp.frameTimer = 0;
          } else if (!reachable) {
            comp.animation = 'walk';
          }
        } else {
          comp.walkTargetX = foodMoveTargetX(comp, target);
          comp.animation   = 'walk';
        }
      } else {
        comp.walkTargetX = foodMoveTargetX(comp, target);
        comp.animation   = 'walk';
      }
    }
  }

  // 걷기
  if (comp.animation === 'walk' && comp.walkTargetX !== null) {
    const dx = comp.walkTargetX - comp.x;
    const step = comp.walkSpeed * dt;
    if (Math.abs(dx) <= step) {
      comp.x = comp.walkTargetX;
      if (!target) comp.behaviorTimer = comp.behaviorDuration;
    } else {
      comp.x += Math.sign(dx) * step;
      comp.facingDir = Math.sign(dx);
    }
  }

  // 점프
  if (comp.animation === 'jump') {
    if (!comp.jumpDone && comp.isGrounded) {
      comp.vy = JUMP_VY; comp.isGrounded = false; comp.jumpDone = true;
    }
    if (comp.walkTargetX !== null && !comp.isGrounded) {
      comp.x += Math.sign(comp.walkTargetX - comp.x) * comp.walkSpeed * 0.75 * dt;
    }
  }

  comp.x = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND, comp.x));

  // 애니메이션
  const def = ANIM_DEF[comp.animation];
  if (comp.animation === 'jump') {
    if (!comp.jumpDone) {
      // 준비: 프레임 0↔1 순환
      comp.frameTimer += dtMs;
      if (comp.frameTimer >= def.frameDuration) {
        comp.frameTimer -= def.frameDuration;
        comp.frameIndex = comp.frameIndex === 0 ? 1 : 0;
      }
    } else if (!comp.isGrounded) {
      // 공중: 프레임 2 고정
      comp.frameIndex = 2;
      comp.frameTimer = 0;
    } else {
      // 착지: 프레임 3을 frameDuration만큼 유지
      if (comp.frameIndex !== 3) {
        comp.frameIndex = 3;
        comp.frameTimer = 0;
      } else {
        comp.frameTimer += dtMs;
      }
    }
  } else {
    comp.frameTimer += dtMs;
    if (comp.frameTimer >= def.frameDuration) {
      comp.frameTimer -= def.frameDuration;
      comp.frameIndex  = (comp.frameIndex + 1) % def.totalFrames;
    }
  }

  // 행동 AI
  if (!target) {
    const jumpEnded = comp.animation === 'jump' && comp.jumpDone && comp.isGrounded
                      && comp.frameIndex === 3 && comp.frameTimer >= def.frameDuration;
    comp.behaviorTimer += dtMs;
    if (comp.behaviorTimer >= comp.behaviorDuration || jumpEnded) {
      const next = pickNextBehavior(comp.animation);
      comp.animation     = next;
      comp.frameIndex    = 0;
      comp.frameTimer    = 0;
      comp.behaviorTimer = 0;
      comp.jumpDone      = false;
      if (next === 'idle') {
        comp.behaviorDuration = 400 + Math.random() * 700;
        comp.walkTargetX = null;
      } else if (next === 'walk') {
        const dir = Math.random() < 0.5 ? -1 : 1;
        comp.walkTargetX = Math.max(LEFT_BOUND, Math.min(RIGHT_BOUND,
          comp.x + dir * (80 + Math.random() * 350)));
        comp.facingDir = dir;
        comp.behaviorDuration = 800 + Math.random() * 1800;
      } else {
        comp.behaviorDuration = 900 + Math.random() * 600;
        comp.walkTargetX = null;
      }
    }
  }
}

function renderCompanions() {
  for (const comp of companions) {
    const def    = ANIM_DEF[comp.animation];
    const frames = getFrames(comp.animation, comp.level);
    const frame  = frames[comp.frameIndex];
    const usingLv2 = comp.level >= 2 && def.framesLv2.length > 0
                     && def.framesLv2[0].complete && def.framesLv2[0].naturalWidth > 0;
    const dw = def.displayW;
    const usingLv6 = comp.level >= 6 && def.framesLv6.length > 0
                     && def.framesLv6[0].complete && def.framesLv6[0].naturalWidth > 0;
    const usingLv4 = !usingLv6 && comp.level >= 4 && def.framesLv4.length > 0
                     && def.framesLv4[0].complete && def.framesLv4[0].naturalWidth > 0;
    const fallbackDhC = usingLv6 ? (def.displayHLv6 ?? def.displayH)
                      : usingLv4 ? (def.displayHLv4 ?? def.displayH)
                      : (usingLv2 && def.displayHLv2) ? def.displayHLv2 : def.displayH;
    const dh = (frame && frame.complete && frame.naturalWidth > 0)
      ? Math.round(dw * frame.naturalHeight / frame.naturalWidth)
      : fallbackDhC;
    const dx = comp.x - dw / 2;
    const dy = comp.y - dh;

    ctx.save();
    if (frame && frame.complete && frame.naturalWidth > 0) {
      if (comp.facingDir === -1) {
        ctx.translate(comp.x, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(frame, -dw / 2, dy, dw, dh);
      } else {
        ctx.drawImage(frame, dx, dy, dw, dh);
      }
    } else {
      ctx.fillStyle = '#4aaa4a';
      ctx.beginPath();
      ctx.ellipse(comp.x, comp.y - fallbackDhC * 0.5, dw * 0.45, fallbackDhC * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ── 11. 렌더링 ───────────────────────────────────────────────────
function renderFoods() {
  const loaded       = foodImg.complete && foodImg.naturalWidth > 0;
  const groundFloorY = GROUND_Y - FOOD_SIZE * 0.38;
  const halfS        = FOOD_SIZE / 2;

  for (const f of foods) {
    const hs = f.itemId ? ITEM_DISPLAY_SIZE / 2 : halfS;

    // 그림자
    ctx.save();
    const onPlatform  = f.phase === 'settled' && f.y < groundFloorY - 5;
    const shadowY     = onPlatform ? f.y + hs * 0.4 : GROUND_Y + 4;
    const shadowScale = f.phase === 'settled' ? 1 : Math.max(0.2, 1 - (groundFloorY - f.y) / 600);
    ctx.globalAlpha = 0.22 * shadowScale;
    ctx.fillStyle   = '#000';
    ctx.beginPath();
    ctx.ellipse(f.x, shadowY, hs * 0.75 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 본체
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);

    if (f.itemId) {
      const iimg = itemImgs[f.itemId - 1];
      if (iimg && iimg.complete && iimg.naturalWidth > 0) {
        ctx.drawImage(iimg, -hs, -hs, ITEM_DISPLAY_SIZE, ITEM_DISPLAY_SIZE);
      }
    } else if (loaded) {
      ctx.drawImage(foodImg, -halfS, -halfS, FOOD_SIZE, FOOD_SIZE);
    } else {
      const g = ctx.createRadialGradient(-halfS * 0.3, -halfS * 0.3, 2, 0, 0, halfS);
      g.addColorStop(0, '#fff7a0');
      g.addColorStop(0.35, '#ffd700');
      g.addColorStop(1,  '#b8860b');
      ctx.fillStyle   = g;
      ctx.strokeStyle = '#6b4600';
      ctx.lineWidth   = 4;
      ctx.beginPath();
      ctx.arc(0, 0, halfS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function renderEffects() {
  for (const e of effects) {
    const t = e.timer / e.duration;

    if (e.type === 'flash') {
      const r = 24 + 100 * t;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.85;
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0,   '#ffffff');
      g.addColorStop(0.4, '#ffee88');
      g.addColorStop(1,   'rgba(255,200,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

    } else if (e.type === 'floatText') {
      const floatY = e.y - 90 * t;
      const alpha  = t < 0.65 ? 1 : (1 - t) / 0.35;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font        = 'bold 48px "Press Start 2P", monospace';
      ctx.textAlign   = 'center';
      ctx.strokeStyle = '#4a2800';
      ctx.lineWidth   = 8;
      ctx.strokeText(e.text, e.x, floatY);
      ctx.fillStyle = '#ffd700';
      ctx.fillText(e.text, e.x, floatY);
      ctx.restore();

    } else if (e.type === 'levelUp') {
      const floatY = e.y - 70 * t;
      const alpha  = t < 0.55 ? 1 : (1 - t) / 0.45;
      const hue    = (e.timer * 280) % 360;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font        = 'bold 64px "Press Start 2P", monospace';
      ctx.textAlign   = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth   = 10;
      ctx.strokeText('LEVEL UP!', e.x, floatY);
      ctx.fillStyle = `hsl(${hue},100%,62%)`;
      ctx.fillText('LEVEL UP!', e.x, floatY);
      ctx.restore();
    }
  }
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // 배경
  if (bgImage.complete && bgImage.naturalWidth > 0) {
    ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H);
  } else {
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#2a5a2a';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
  }

  // 먹이 (슬라임 뒤)
  renderFoods();

  // 동료 슬라임 (주인공 뒤)
  renderCompanions();

  // 슬라임
  const def    = ANIM_DEF[slime.animation];
  const frames = getFrames(slime.animation);
  const frame  = frames[slime.frameIndex];
  const dw     = def.displayW;
  const usingLv6s = slime.level >= 6 && def.framesLv6.length > 0
                    && def.framesLv6[0].complete && def.framesLv6[0].naturalWidth > 0;
  const usingLv4s = !usingLv6s && slime.level >= 4 && def.framesLv4.length > 0
                    && def.framesLv4[0].complete && def.framesLv4[0].naturalWidth > 0;
  const usingLv2 = slime.level >= 2 && def.framesLv2.length > 0
                   && def.framesLv2[0].complete && def.framesLv2[0].naturalWidth > 0;
  const fallbackDh = usingLv6s ? (def.displayHLv6 ?? def.displayH)
                   : usingLv4s ? (def.displayHLv4 ?? def.displayH)
                   : (usingLv2 && def.displayHLv2) ? def.displayHLv2 : def.displayH;
  const dh     = (frame && frame.complete && frame.naturalWidth > 0)
    ? Math.round(dw * frame.naturalHeight / frame.naturalWidth)
    : fallbackDh;
  const dx    = slime.x - dw / 2;
  const dy    = slime.y - dh;

  ctx.save();
  if (frame && frame.complete && frame.naturalWidth > 0) {
    if (slime.facingDir === -1) {
      ctx.translate(slime.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, -dw / 2, dy, dw, dh);
    } else {
      ctx.drawImage(frame, dx, dy, dw, dh);
    }
  } else {
    ctx.fillStyle = '#5dbb5d';
    ctx.beginPath();
    ctx.ellipse(slime.x, slime.y - fallbackDh * 0.5, dw * 0.5, fallbackDh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f1c0f';
    ctx.fillRect(slime.x - 10, slime.y - dh * 0.55, 6, 8);
    ctx.fillRect(slime.x + 4,  slime.y - dh * 0.55, 6, 8);
  }
  ctx.restore();

  // 이펙트 (최상단)
  renderEffects();
}

// ── 11. 게임 루프 ────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (lastTime === null) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime  = timestamp;

  if (mouseHeld) {
    mouseHoldTimer += dt;
    while (mouseHoldTimer >= 0.2) {
      mouseHoldTimer -= 0.2;
      spawnFood(mousePos.x, mousePos.y);
    }
  }

  update(dt);
  updateCompanions(dt);
  render();
  requestAnimationFrame(gameLoop);
}

// ── 12. 유틸 ─────────────────────────────────────────────────────
function getSlimeBounds() {
  const def = ANIM_DEF[slime.animation];
  return {
    left:   slime.x - def.displayW / 2,
    top:    slime.y - def.displayH,
    right:  slime.x + def.displayW / 2,
    bottom: slime.y,
  };
}

function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left)  * (CANVAS_W / rect.width),
    y: (e.clientY - rect.top)   * (CANVAS_H / rect.height),
  };
}

// ── 13. 상태창 UI ─────────────────────────────────────────────────
const statusPanel = document.getElementById('status-panel');
const overlay     = document.getElementById('overlay');

function openStatusPanel() {
  document.getElementById('ov-name').textContent    = slime.name;
  document.getElementById('ov-lv').textContent      = slime.level;
  document.getElementById('ov-atk').textContent     = slime.atk;
  document.getElementById('ov-def').textContent     = slime.def;
  document.getElementById('ov-hp-txt').textContent  = `${slime.hp}/${slime.maxHp}`;

  const hpPct  = Math.max(0, (slime.hp  / slime.maxHp)  * 100);
  const expPct = Math.max(0, (slime.exp / slime.maxExp) * 100);
  document.getElementById('hp-fill').style.width  = `${hpPct}%`;
  document.getElementById('exp-fill').style.width = `${expPct}%`;

  // 레벨에 맞는 프로필 이미지 갱신
  const portrait  = document.getElementById('ov-portrait');
  const lv6frames = ANIM_DEF.idle.framesLv6;
  const lv4frames = ANIM_DEF.idle.framesLv4;
  const lv2frames = ANIM_DEF.idle.framesLv2;
  const lv6ready  = slime.level >= 6 && lv6frames.length > 0
                    && lv6frames[0].complete && lv6frames[0].naturalWidth > 0;
  const lv4ready  = slime.level >= 4 && lv4frames.length > 0
                    && lv4frames[0].complete && lv4frames[0].naturalWidth > 0;
  const lv2ready  = slime.level >= 2 && lv2frames.length > 0
                    && lv2frames[0].complete && lv2frames[0].naturalWidth > 0;
  portrait.src = lv6ready ? lv6frames[0].src
               : lv4ready ? lv4frames[0].src
               : lv2ready ? lv2frames[0].src : ANIM_DEF.idle.frames[0].src;

  buildInventoryUI();
  statusPanel.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function closeStatusPanel() {
  statusPanel.classList.add('hidden');
  overlay.classList.add('hidden');
}

function buildInventoryUI() {
  const grid = document.getElementById('ov-inventory');
  grid.innerHTML = '';
  slime.inventory.forEach(item => {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    if (item) {
      const img = document.createElement('img');
      img.src   = `assets/item_${item.itemId}.png`;
      img.alt   = `아이템 ${item.itemId}`;
      slot.appendChild(img);
      if (item.count > 1) {
        const badge = document.createElement('span');
        badge.className   = 'inv-count';
        badge.textContent = item.count;
        slot.appendChild(badge);
      }
    }
    grid.appendChild(slot);
  });
}

function updateInventoryUI() {
  if (!statusPanel.classList.contains('hidden')) buildInventoryUI();
}

// ── 14. 이벤트 등록 ──────────────────────────────────────────────
document.getElementById('status-btn').addEventListener('click', openStatusPanel);
document.getElementById('close-btn').addEventListener('click', closeStatusPanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeStatusPanel(); });

// 캔버스 마우스 홀드 → 먹이 소환 (즉시 1개 + 초당 5개)
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (!statusPanel.classList.contains('hidden')) return;
  const pos = toCanvasCoords(e);
  mousePos  = pos;
  spawnFood(pos.x, pos.y);
  mouseHeld      = true;
  mouseHoldTimer = 0;
});
canvas.addEventListener('mousemove', e => {
  mousePos = toCanvasCoords(e);
});
canvas.addEventListener('mouseup',    () => { mouseHeld = false; });
canvas.addEventListener('mouseleave', () => { mouseHeld = false; });

overlay.addEventListener('click', closeStatusPanel);

// ── 15. 배경음악 ─────────────────────────────────────────────────
const bgm = new Audio('assets/Slime Forest.mp3');
bgm.loop   = true;
bgm.volume = 0.4;

function startBgm() {
  bgm.play().catch(() => {});
  document.removeEventListener('click',   startBgm);
  document.removeEventListener('keydown', startBgm);
}
document.addEventListener('click',   startBgm);
document.addEventListener('keydown', startBgm);

// ── 16. 초기화 ───────────────────────────────────────────────────
loadAssets().then(() => {
  startBehavior('idle');
  requestAnimationFrame(gameLoop);
});
