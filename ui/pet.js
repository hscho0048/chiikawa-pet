/* Chiikawa desktop pet — behaviour engine shared by the Tauri app and the browser preview.
 * A pet lives in a BOX x BOX square whose bottom-centre is its feet. In the app that square is the
 * native window (moved around the screen); in the preview it is a div moved around a fake desktop. */
(() => {
  'use strict';

  const BOX = 240;
  const GRAVITY = 2200;
  const MARGIN = 45;

  // h: on-screen height so the body looks the same size across clips
  const SPRITES = {
    walk_lollipop: { h: 128 }, walk_bounce: { h: 112 }, run_torch: { h: 190 },
    spin: { h: 116 }, spin_peek: { h: 112 }, dance_heart: { h: 118 },
    wiggle_doll: { h: 110 }, flowers: { h: 150 }, cheer: { h: 124 },
    party: { h: 165 }, hat_toss: { h: 126 }, sleepy: { h: 124 },
    squish: { h: 100 }, blush_clover: { h: 92 }, bounce_head: { h: 104 },
    sit_wiggle: { h: 112 }, eat_cookie: { h: 118 },
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const now = () => performance.now();

  function weighted(table) {
    let total = 0;
    for (const k in table) total += Math.max(0, table[k]);
    let r = Math.random() * total;
    for (const k in table) if ((r -= Math.max(0, table[k])) <= 0) return k;
    return Object.keys(table)[0];
  }

  // ---------------------------------------------------------------- click reactions
  const REACTIONS = {
    jumpJoy:     { spr: 'cheer', dur: 1.6, jump: -620, bubble: '야!', fx: ['✦', 4] },
    blush:       { spr: 'blush_clover', dur: 2.2, bubble: '///', fx: ['♥', 6] },
    spinAround:  { spr: 'spin', dur: 2.3 },
    flowerBurst: { spr: 'flowers', dur: 2.8, fx: ['✿', 10] },
    surprised:   { spr: 'spin_peek', dur: 1.2, jump: -380, shake: 0.5, bubble: '!' },
    party:       { spr: 'party', dur: 2.4, fx: ['✧', 10], bubble: '♪' },
    heartDance:  { spr: 'dance_heart', dur: 2.8, fx: ['♥', 7] },
    hatToss:     { spr: 'hat_toss', dur: 2.1, bubble: '후와~' },
    wiggle:      { spr: 'wiggle_doll', dur: 2.6, bubble: '♪', fx: ['♪', 4] },
    bounce:      { spr: 'bounce_head', dur: 1.5, jump: -300, bubble: '?' },
    rollAway:    { then: 'rollAway' },
    flip:        { then: 'leap' },
  };

  const FX_COLORS = { '♥': '#ff7aa8', '✿': '#ffb3c7', '♪': '#7aa8ff', '✦': '#ffcc33', '✧': '#9be37a', z: '#8aa0c8', '·': '#b07a4a' };

  // ---------------------------------------------------------------- behaviours
  // enter(p, a) once; update(p, a, dt) every frame -> true when finished; land(p, a, impact) -> true to keep going
  const ACTS = {
    idle: {
      enter(p, a) { p.setSprite(a.spr || pick(['wiggle_doll', 'blush_clover', 'sit_wiggle', 'bounce_head', 'dance_heart', 'sit_wiggle'])); a.dur ??= rand(2.5, 6); },
      update(p, a) {
        const c = p.stage.cursor();
        if (c && Math.abs(c.x - p.x) < 300 && Math.abs(c.x - p.x) > 20) p.face(Math.sign(c.x - p.x));
        return a.t > a.dur;
      },
    },
    walk: {
      enter(p, a) {
        const b = p.stage.bounds();
        a.spr ||= pick(['walk_lollipop', 'walk_lollipop', 'walk_bounce']);
        p.setSprite(a.spr);
        a.speed ??= (a.spr === 'walk_bounce' ? 85 : 62) * rand(0.85, 1.2);
        if (a.tx == null) {
          const dist = rand(120, 520) * (Math.random() < 0.5 ? -1 : 1);
          a.tx = clamp(p.x + dist, b.left + MARGIN, b.right - MARGIN);
          if (Math.abs(a.tx - p.x) < 60) a.tx = clamp(p.x - dist, b.left + MARGIN, b.right - MARGIN);
        }
        a.v = 0;
        a.hopAt = Math.random() < 0.22 ? rand(0.7, 2.2) : Infinity;
        a.pauseAt = !a.noPause && Math.random() < 0.18 ? rand(1.2, 3) : Infinity;
        p.offscreen = !!a.offscreen;
      },
      update(p, a, dt) {
        const d = a.tx - p.x;
        if (Math.abs(d) < 3) return true;
        const dir = Math.sign(d);
        if (dir !== p.facing) { p.face(dir); a.v = 0; }
        const want = a.speed * Math.min(1, Math.abs(d) / 50 + 0.2);
        a.v += (want - a.v) * Math.min(1, dt * 3.5);
        p.x += dir * a.v * dt;
        if (a.t > a.hopAt && !p.air) { a.hopAt = Infinity; p.jump(-430); }
        if (a.t > a.pauseAt) { // stop, look around, then carry on to the same spot
          p.queue.unshift(['look', { dur: rand(1.2, 2.2) }], ['walk', { tx: a.tx, spr: a.spr, speed: a.speed, noPause: true }]);
          return true;
        }
        return false;
      },
      land(p) { p.squash(0.12); return true; },
    },
    look: {
      enter(p, a) { p.setSprite('spin_peek'); a.dur ??= 2.2; if (Math.random() < 0.3) p.bubble(pick(['?', '…', '흠'])); },
      update: (p, a) => a.t > a.dur,
    },
    spin: { enter(p, a) { p.setSprite('spin'); a.dur ??= 2.3; }, update: (p, a) => a.t > a.dur },
    eat: {
      enter(p, a) { p.setSprite('eat_cookie'); a.dur ??= rand(4, 7); a.fxT = 0; p.bubble('냠'); },
      update(p, a, dt) {
        if ((a.fxT -= dt) < 0) { a.fxT = 0.45; p.particles('·', 2, { spread: 30, rise: -10, fall: true }); }
        if (a.t > a.dur) { p.queue.unshift(['idle', { spr: 'blush_clover', dur: 1.5 }]); p.bubble('맛있다'); return true; }
      },
    },
    play: {
      enter(p, a) { a.spr ||= pick(['hat_toss', 'hat_toss', 'run_torch']); p.setSprite(a.spr); a.dur ??= a.spr === 'run_torch' ? 2.76 : rand(3, 5); },
      update: (p, a) => a.t > a.dur,
    },
    dance: {
      enter(p, a) { p.setSprite(a.spr || pick(['party', 'cheer', 'dance_heart', 'wiggle_doll'])); a.dur ??= rand(3, 5.5); a.fxT = 0; },
      update(p, a, dt) {
        if ((a.fxT -= dt) < 0) { a.fxT = 0.5; p.particles('♪', 1, { spread: 60 }); }
        return a.t > a.dur;
      },
    },
    sleep: {
      enter(p, a) { p.setSprite('sleepy'); a.dur ??= rand(10, 22); a.fxT = 1; p.asleep = true; p.bubble('하암…'); },
      update(p, a, dt) {
        if ((a.fxT -= dt) < 0) { a.fxT = 1.3; p.particles('z', 1, { spread: 10, size: rand(14, 22), drift: 30 }); }
        if (p.hoverT > 0.6) { p.queue.unshift(['wake', {}], ['pet', {}]); return true; } // stroking wakes it gently
        if (a.t > a.dur) { p.queue.unshift(['wake', {}]); return true; }
      },
      exit(p) { p.asleep = false; p.wokeAt = now(); },
    },
    wake: {
      enter(p, a) { p.setSprite('spin_peek'); a.dur = 1.6; p.bubble(a.startled ? '!?' : '…?'); if (a.startled) { p.jump(-420); p.shake(0.4); } },
      update: (p, a) => a.t > a.dur,
    },
    peek: { // sneak to a screen edge, half hide, peek out, come back
      enter(p) {
        const b = p.stage.bounds();
        const side = p.x < (b.left + b.right) / 2 ? -1 : 1;
        const edge = side < 0 ? b.left - 30 : b.right + 30;
        p.queue.unshift(
          ['walk', { tx: edge, offscreen: true, noPause: true }],
          ['look', { dur: rand(2, 3.5) }],
          ['walk', { tx: edge - side * rand(160, 320), offscreen: true, noPause: true }],
        );
      },
      update: () => true,
    },
    follow: {
      enter(p, a) {
        const c = p.stage.cursor(), b = p.stage.bounds();
        if (!c) { a.skip = true; return; }
        const tx = clamp(c.x, b.left + MARGIN, b.right - MARGIN);
        p.queue.unshift(['walk', { tx, spr: 'walk_bounce', speed: 120, noPause: true }], ['idle', { spr: 'dance_heart', dur: 2.2 }]);
        p.bubble(pick(['어디가~', '기다려!', '♥']));
      },
      update: () => true,
    },
    hopAround: {
      enter(p, a) { p.setSprite('cheer'); a.left = Math.floor(rand(2, 5)); a.dir = Math.random() < 0.5 ? -1 : 1; a.wait = 0; },
      update(p, a, dt) {
        if (p.air) return false;
        if ((a.wait -= dt) > 0) return false;
        if (a.left-- <= 0) return true;
        const b = p.stage.bounds();
        if (p.x + a.dir * 120 > b.right - MARGIN || p.x + a.dir * 120 < b.left + MARGIN) a.dir *= -1;
        p.face(a.dir);
        p.jump(-rand(380, 520), a.dir * rand(90, 160));
        a.wait = 0.15;
      },
      land(p) { p.squash(0.2); return true; },
    },
    leap: { // big jump with a somersault
      enter(p, a) {
        const b = p.stage.bounds();
        p.setSprite('squish');
        let dir = Math.random() < 0.5 ? -1 : 1;
        if (p.x + dir * 250 > b.right - MARGIN || p.x + dir * 250 < b.left + MARGIN) dir *= -1;
        a.vy = -rand(720, 880);
        a.air = (2 * -a.vy) / GRAVITY;
        p.face(dir);
        p.jump(a.vy, a.inPlace ? 0 : dir * rand(120, 260));
        p.bubble(pick(['야하!', '훗!', '우랴!']));
      },
      update(p, a) { p.rot = p.facing * 360 * clamp(a.t / a.air, 0, 1); return false; },
      land(p, a) { p.rot = 0; p.squash(0.3); p.particles('✦', 5, { spread: 70, rise: 10 }); p.queue.unshift(['idle', { spr: 'cheer', dur: 1.2 }]); return false; },
    },
    roll: {
      enter(p, a) {
        const b = p.stage.bounds();
        p.setSprite('squish');
        a.dir ??= Math.random() < 0.5 ? -1 : 1;
        a.tx = clamp(p.x + a.dir * rand(220, 450), b.left + MARGIN, b.right - MARGIN);
        a.v = 0;
      },
      update(p, a, dt) {
        const d = a.tx - p.x;
        if (Math.abs(d) < 4) {
          p.rot = 0;
          if (Math.random() < 0.6) p.queue.unshift(['dizzy', {}]);
          return true;
        }
        const dir = Math.sign(d);
        a.v += (Math.min(280, Math.abs(d) * 2 + 40) - a.v) * Math.min(1, dt * 4);
        p.x += dir * a.v * dt;
        p.rot += dir * (a.v * dt) / 50 * 57.3; // rolling without slipping, radius ~50px
        return false;
      },
      exit(p) { p.rot = 0; },
    },
    rollAway: {
      enter(p) {
        const c = p.stage.cursor();
        const dir = c ? (c.x > p.x ? -1 : 1) : pick([-1, 1]);
        p.bubble('으앗');
        p.queue.unshift(['roll', { dir }]);
      },
      update: () => true,
    },
    dizzy: {
      enter(p, a) { p.setSprite('squish'); a.dur ??= 2; a.fxT = 0; p.bubble('@_@'); },
      update(p, a, dt) {
        p.rot = Math.sin(a.t * 9) * 10 * (1 - a.t / a.dur);
        if ((a.fxT -= dt) < 0) { a.fxT = 0.35; p.orbitStar(); }
        return a.t > a.dur;
      },
      exit(p) { p.rot = 0; },
    },
    scared: {
      enter(p) {
        const c = p.stage.cursor();
        const dir = c ? (c.x > p.x ? -1 : 1) : pick([-1, 1]);
        const b = p.stage.bounds();
        p.setSprite('spin_peek');
        p.bubble('히익!');
        p.shake(0.4);
        p.jump(-520);
        p.queue.unshift(['walk', { tx: clamp(p.x + dir * rand(200, 350), b.left + MARGIN, b.right - MARGIN), spr: 'walk_bounce', speed: 210, noPause: true }]);
      },
      update: (p) => !p.air,
    },
    annoyed: {
      enter(p, a) { p.setSprite('squish'); a.dur = 1.3; p.shake(1.2); p.bubble('💢'); },
      update(p, a) {
        if (a.t > a.dur) { p.queue.unshift(['scared', {}]); return true; }
      },
    },
    react: {
      enter(p, a) {
        let kind = a.kind;
        if (!kind) {
          const keys = Object.keys(REACTIONS).filter((k) => k !== p.lastReact);
          kind = pick(keys);
        }
        p.lastReact = kind;
        const r = REACTIONS[kind];
        if (r.then) { p.queue.unshift([r.then, {}]); a.dur = 0; return; }
        p.setSprite(r.spr);
        a.dur = r.dur;
        if (r.jump) p.jump(r.jump);
        if (r.shake) p.shake(r.shake);
        if (r.bubble) p.bubble(r.bubble);
        if (r.fx) p.particles(r.fx[0], r.fx[1], { spread: 90, burst: true });
      },
      update: (p, a) => a.t > a.dur && !p.air,
      land(p) { p.squash(0.22); return true; },
    },
    pet: { // cursor resting on the pet
      enter(p, a) { p.setSprite(pick(['blush_clover', 'wiggle_doll'])); a.fxT = 0; a.away = 0; p.bubble(pick(['헤헤', '♥', '///'])); },
      update(p, a, dt) {
        if ((a.fxT -= dt) < 0) { a.fxT = 0.55; p.particles('♥', 1, { spread: 50 }); }
        a.away = p.hovered ? 0 : a.away + dt;
        return a.away > 0.8 || a.t > 8;
      },
    },
    held: {
      enter(p) { p.setSprite('squish'); if (Math.random() < 0.5) p.bubble(pick(['으앗', '와앗', '?!'])); },
      update() { return false; },
    },
    fall: {
      enter(p) { p.setSprite('squish'); },
      update() { return false; },
      land(p, a, impact) {
        p.squash(clamp(impact / 2600, 0.1, 0.4));
        if (impact > 1500) p.queue.unshift(['dizzy', {}]);
        else p.queue.unshift(['idle', { spr: 'bounce_head', dur: 1.2 }]);
        return false;
      },
    },
  };

  // ---------------------------------------------------------------- pet
  class Pet {
    constructor(stage, opts = {}) {
      this.stage = stage;
      this.el = buildDom();
      stage.mount(this.el);
      this.imgs = [...this.el.querySelectorAll('img')];
      this.front = 0;
      this.rig = this.el.querySelector('.rig');
      this.body = this.el.querySelector('.body');
      this.fx = this.el.querySelector('.fx');
      this.bubbleEl = this.el.querySelector('.bubble');
      this.menuEl = this.el.querySelector('.menu');

      const b = stage.bounds();
      this.x = opts.x ?? rand(b.left + 200, b.right - 200);
      this.y = opts.y ?? b.top - 40;
      this.vx = 0; this.vy = 0; this.air = true;
      this.facing = Math.random() < 0.5 ? 1 : -1;
      this.flip = this.facing;
      this.sx = 1; this.sy = 1; this.svx = 0; this.svy = 0;
      this.rot = 0; this.swing = 0; this.swingV = 0;
      this.shakeT = 0; this.offscreen = false; this.asleep = false;
      this.queue = []; this.clicks = []; this.lastReact = null;
      this.lastInteract = now(); this.hoverT = 0; this.hovered = false;
      this.prevCursor = null; this.scaredAt = 0; this.wokeAt = 0;
      this.sprite = null;
      this.onAct = opts.onAct || (() => {});
      this.bindInput();
      this.start('fall');
    }

    // ---- actions
    start(name, data = {}) {
      if (this.act && ACTS[this.act.name].exit) ACTS[this.act.name].exit(this, this.act);
      this.offscreen = false;
      this.act = { name, t: 0, ...data };
      this.onAct(name);
      ACTS[name].enter(this, this.act);
    }

    next() {
      if (this.queue.length) { const [n, d] = this.queue.shift(); return this.start(n, d); }
      const idleMin = (now() - this.lastInteract) / 60000;
      const h = new Date().getHours();
      const prev = this.act && this.act.name;
      const w = {
        walk: 30, idle: 18, look: 6, spin: 3, eat: 5, play: 5, dance: 5,
        sleep: now() - this.wokeAt < 120000 ? 0 : 1 + Math.min(idleMin, 10) * 0.6 + (h >= 23 || h < 6 ? 6 : 0),
        peek: 4, follow: this.stage.cursor() ? 4 : 0, roll: 3, leap: 3, hopAround: 4,
      };
      if (prev === 'walk') w.walk *= 0.4;
      if (prev && w[prev] != null && prev !== 'walk') w[prev] *= 0.2;
      this.start(weighted(w));
    }

    force(name, data) { this.queue = []; this.air = this.air && name !== 'held'; this.start(name, data); }

    // ---- physical helpers
    jump(vy, vx = 0) { this.air = true; this.vy = vy; this.vx = vx; this.sy = 1.18; this.sx = 0.88; }
    squash(k) { this.sy = 1 - k; this.sx = 1 + k * 0.8; }
    shake(sec) { this.shakeT = Math.max(this.shakeT, sec); }
    face(dir) { if (dir) this.facing = dir; }

    setSprite(name) {
      if (this.sprite === name) return;
      this.sprite = name;
      const back = this.imgs[1 - this.front], front = this.imgs[this.front];
      back.src = `sprites/${name}.webp`;
      back.style.height = SPRITES[name].h + 'px';
      back.style.opacity = '1';
      front.style.opacity = '0';
      this.front = 1 - this.front;
      this.rig.style.height = SPRITES[name].h + 'px';
    }

    get h() { return SPRITES[this.sprite]?.h ?? 110; }

    hitRect() { // stage coords of the visible body
      const img = this.imgs[this.front];
      const w = (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1) * this.h;
      return { l: this.x - w * 0.4, r: this.x + w * 0.4, t: this.y - this.h * 0.92, b: this.y };
    }

    // ---- effects
    bubble(text) {
      const el = this.bubbleEl;
      el.textContent = text;
      el.style.bottom = this.h + 8 + 'px';
      el.getAnimations().forEach((an) => an.cancel());
      el.animate(
        [{ opacity: 0, transform: 'translateX(-50%) scale(.4)' }, { opacity: 1, transform: 'translateX(-50%) scale(1.08)', offset: 0.12 },
          { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.2 }, { opacity: 1, offset: 0.85 }, { opacity: 0, transform: 'translateX(-50%) translateY(-6px)' }],
        { duration: 1700, easing: 'ease-out', fill: 'forwards' },
      );
    }

    particles(ch, n, o = {}) {
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = 'p';
        s.textContent = ch;
        s.style.color = FX_COLORS[ch] || '#ff9ab8';
        s.style.fontSize = (o.size || rand(14, 22)) + 'px';
        const x0 = BOX / 2 + rand(-(o.spread || 40) / 2, (o.spread || 40) / 2);
        const y0 = BOX - this.h * (o.fall ? 0.35 : 0.85);
        s.style.left = x0 + 'px';
        s.style.top = y0 + 'px';
        this.fx.appendChild(s);
        const ang = rand(-Math.PI, 0);
        const dx = o.burst ? Math.cos(ang) * rand(40, 90) : rand(-15, 15) + (o.drift || 0) * this.facing;
        const dy = o.fall ? rand(30, 60) : o.burst ? Math.sin(ang) * rand(40, 80) : -rand(40, 70) - (o.rise || 0);
        s.animate(
          [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.15 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.9) rotate(${rand(-30, 30)}deg)`, opacity: 0 }],
          { duration: rand(900, 1500), easing: 'cubic-bezier(.2,.7,.4,1)' },
        ).onfinish = () => s.remove();
      }
    }

    orbitStar() {
      const s = document.createElement('span');
      s.className = 'p';
      s.textContent = '✦';
      s.style.color = FX_COLORS['✦'];
      s.style.fontSize = '14px';
      s.style.left = BOX / 2 + 'px';
      s.style.top = BOX - this.h * 0.95 + 'px';
      this.fx.appendChild(s);
      const frames = [];
      const a0 = rand(0, Math.PI * 2);
      for (let i = 0; i <= 12; i++) {
        const a = a0 + (i / 12) * Math.PI * 2;
        frames.push({ transform: `translate(calc(-50% + ${Math.cos(a) * 34}px), calc(-50% + ${Math.sin(a) * 9}px))`, opacity: i === 12 ? 0 : 1 });
      }
      s.animate(frames, { duration: 900 }).onfinish = () => s.remove();
    }

    // ---- input
    bindInput() {
      const el = this.el;
      let down = null, clickTimer = null;

      el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openMenu(e); });
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !e.target.closest('.rig')) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const pt = this.stage.pointer(e);
        down = { x: pt.x, y: pt.y, t: now(), ox: this.x - pt.x, oy: this.y - pt.y, moved: false, vx: 0, vy: 0, lx: pt.x, ly: pt.y, lt: now() };
        this.lastInteract = now();
      });
      el.addEventListener('pointermove', (e) => {
        if (!down) return;
        const pt = this.stage.pointer(e);
        if (!down.moved && Math.hypot(pt.x - down.x, pt.y - down.y) > 5) {
          down.moved = true;
          this.queue = [];
          this.air = false;
          this.start('held');
          this.dragging = true;
        }
        if (!down.moved) return;
        const t = now(), dt = Math.max(1, t - down.lt) / 1000;
        down.vx = down.vx * 0.6 + ((pt.x - down.lx) / dt) * 0.4;
        down.vy = down.vy * 0.6 + ((pt.y - down.ly) / dt) * 0.4;
        down.lx = pt.x; down.ly = pt.y; down.lt = t;
        this.x = pt.x + down.ox;
        this.y = pt.y + down.oy;
      });
      const up = (e) => {
        if (!down) return;
        const d = down;
        down = null;
        this.dragging = false;
        if (d.moved) {
          this.vx = clamp(d.vx, -1800, 1800);
          this.vy = clamp(d.vy, -1800, 1800);
          this.air = true;
          this.start('fall');
          this.squash(-0.1);
          return;
        }
        if (e.type === 'pointercancel') return;
        this.clicks = this.clicks.filter((t) => now() - t < 2000);
        this.clicks.push(now());
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; this.onDoubleClick(); return; }
        clickTimer = setTimeout(() => { clickTimer = null; this.onClick(); }, 240);
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    }

    onClick() {
      if (this.act.name === 'held' || this.act.name === 'fall') return;
      if (this.asleep) { this.queue = []; return this.start('wake', { startled: true }); }
      if (this.clicks.length >= 4) { this.clicks = []; this.queue = []; return this.start('annoyed'); }
      this.queue = [];
      this.start('react');
    }

    onDoubleClick() {
      if (this.asleep) { this.queue = []; return this.start('wake', { startled: true }); }
      this.queue = [];
      this.start('leap', { inPlace: Math.random() < 0.5 });
    }

    openMenu(e) {
      const items = [
        ['🍪 간식 주기', () => this.force('eat')],
        ['🎵 춤추기', () => this.force('dance')],
        ['🌀 굴러가기', () => this.force('roll')],
        ['🤸 공중제비', () => this.force('leap')],
        ['💤 재우기', () => this.force('sleep')],
        ...(this.stage.quit ? [['👋 종료', () => this.stage.quit()]] : []),
      ];
      const m = this.menuEl;
      m.innerHTML = '';
      for (const [label, fn] of items) {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', (ev) => { ev.stopPropagation(); this.closeMenu(); fn(); });
        m.appendChild(b);
      }
      m.classList.add('open');
      this.menuOpen = true;
      this.menuAt = now();
      const r = this.el.getBoundingClientRect();
      m.style.left = clamp(e.clientX - r.left, 0, BOX - 130) + 'px';
      m.style.top = clamp(e.clientY - r.top - 20, 0, BOX - items.length * 28 - 10) + 'px';
      this.lastInteract = now();
      const close = (ev) => { if (!m.contains(ev.target)) { this.closeMenu(); document.removeEventListener('pointerdown', close, true); } };
      setTimeout(() => document.addEventListener('pointerdown', close, true));
    }

    closeMenu() { this.menuEl.classList.remove('open'); this.menuOpen = false; }

    // ---- per frame
    tick(dt) {
      const b = this.stage.bounds();
      const c = this.stage.cursor();
      const a = this.act;
      a.t += dt;

      // cursor awareness: hover = petting, fast swipe nearby = startled
      const r = this.hitRect();
      this.hovered = !!c && c.x > r.l && c.x < r.r && c.y > r.t && c.y < r.b;
      if (this.menuOpen && !this.hovered && now() - this.menuAt > 4000) this.closeMenu();
      if (c && this.prevCursor) {
        const sp = Math.hypot(c.x - this.prevCursor.x, c.y - this.prevCursor.y) / Math.max(dt, 1e-3);
        const near = Math.hypot(c.x - this.x, c.y - (this.y - this.h / 2)) < 140;
        if (sp > 3500 && near && !this.hovered && !this.air && !this.asleep && !this.dragging &&
            now() - this.scaredAt > 15000 && ['idle', 'walk', 'look', 'eat', 'dance'].includes(a.name)) {
          this.scaredAt = now(); this.lastInteract = now(); this.queue = [];
          this.start('scared');
        }
      }
      this.prevCursor = c ? { x: c.x, y: c.y } : null;
      if (this.hovered) {
        this.lastInteract = now();
        this.hoverT += dt;
        if (this.hoverT > 0.9 && !this.air && !this.dragging && ['idle', 'walk', 'look', 'dance', 'play', 'spin'].includes(a.name)) {
          this.queue = [];
          this.start('pet');
        }
      } else this.hoverT = 0;

      if (ACTS[a.name].update(this, a, dt) === true && this.act === a) this.next();

      // physics
      if (this.dragging) {
        const target = clamp(-(this.x - (this.lastX ?? this.x)) / Math.max(dt, 1e-3) * 0.03, -40, 40);
        this.swingV += ((target - this.swing) * 120 - this.swingV * 9) * dt;
        this.swing += this.swingV * dt;
      } else {
        this.swingV += (-this.swing * 120 - this.swingV * 7) * dt;
        this.swing += this.swingV * dt;
      }
      this.lastX = this.x;

      if (this.air && !this.dragging) {
        this.vy += GRAVITY * dt;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        const half = 40;
        if (this.x < b.left + half) { this.x = b.left + half; this.vx = Math.abs(this.vx) * 0.5; this.squash(-0.08); }
        if (this.x > b.right - half) { this.x = b.right - half; this.vx = -Math.abs(this.vx) * 0.5; this.squash(-0.08); }
        if (this.y - this.h < b.top) { this.y = b.top + this.h; this.vy = Math.abs(this.vy) * 0.3; }
        if (this.vy > 0 && this.y >= b.bottom) {
          const impact = this.vy;
          this.y = b.bottom;
          if (impact > 900 && this.act.name === 'fall') { // bounce
            this.vy = -impact * 0.35;
            this.vx *= 0.6;
            this.squash(clamp(impact / 3000, 0.1, 0.35));
          } else {
            this.air = false;
            this.vy = 0; this.vx = 0;
            const cur = this.act;
            const keep = ACTS[cur.name].land ? ACTS[cur.name].land(this, cur, impact) : false;
            if (!ACTS[cur.name].land) this.squash(clamp(impact / 2600, 0.08, 0.3));
            if (!keep && this.act === cur) this.next();
          }
        }
      } else if (!this.dragging) {
        this.y = b.bottom;
      }
      if (!this.dragging) {
        const lo = this.offscreen ? b.left - 60 : b.left + MARGIN;
        const hi = this.offscreen ? b.right + 60 : b.right - MARGIN;
        this.x = clamp(this.x, lo, hi);
      }

      // squash & stretch springs, turning
      if (this.air && !this.dragging) { const st = clamp(Math.abs(this.vy) / 4000, 0, 0.15); this.sy += (1 + st - this.sy) * 0.3; this.sx += (1 - st * 0.7 - this.sx) * 0.3; }
      this.svy += ((1 - this.sy) * 260 - this.svy * 12) * dt; this.sy += this.svy * dt;
      this.svx += ((1 - this.sx) * 260 - this.svx * 12) * dt; this.sx += this.svx * dt;
      const fs = 1 / 0.16;
      if (this.flip !== this.facing) this.flip = clamp(this.flip + Math.sign(this.facing - this.flip) * fs * dt * 2, -1, 1);
      this.shakeT = Math.max(0, this.shakeT - dt);

      this.render();
    }

    render() {
      const shake = this.shakeT > 0 ? Math.sin(now() / 18) * 3 : 0;
      this.stage.place(this, this.x + shake, this.y);
      const fx = Math.abs(this.flip) < 0.08 ? 0.08 * Math.sign(this.flip || 1) : this.flip;
      this.body.style.transform = `scale(${(fx * this.sx).toFixed(3)}, ${this.sy.toFixed(3)})`;
      this.rig.style.transform = `rotate(${(this.rot + this.swing).toFixed(1)}deg)`;
      this.rig.style.transformOrigin = this.dragging ? '50% 0%' : '50% 50%';
    }
  }

  function buildDom() {
    const el = document.createElement('div');
    el.className = 'pet-box';
    el.style.width = el.style.height = BOX + 'px';
    el.innerHTML = '<div class="body"><div class="rig"><img alt="" draggable="false"><img alt="" draggable="false"></div></div>' +
      '<div class="fx"></div><div class="bubble"></div><div class="menu"></div>';
    return el;
  }

  function preload() {
    return Promise.all(Object.keys(SPRITES).map((n) => new Promise((res) => {
      const i = new Image(); i.onload = i.onerror = res; i.src = `sprites/${n}.webp`;
    })));
  }

  function run(stage, opts) {
    const pets = [];
    let last = now(), rafAt = 0;
    const step = () => {
      const t = now();
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      stage.beforeFrame?.(pets);
      for (const p of pets) p.tick(dt);
      stage.afterFrame?.(pets);
    };
    const loop = () => { rafAt = now(); step(); requestAnimationFrame(loop); };
    return preload().then(() => {
      pets.push(new Pet(stage, opts));
      requestAnimationFrame(loop);
      // the webview may stop animation frames for a window it thinks is hidden; keep ticking anyway
      setInterval(() => { if (now() - rafAt > 120) step(); }, 33);
      return { pets, add: (o) => { const p = new Pet(stage, o); pets.push(p); return p; } };
    });
  }

  window.ChiikawaPet = { run, BOX, ACTS, REACTIONS };
})();
