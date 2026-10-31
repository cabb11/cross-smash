(() => {
  const BOOK = 'https://book.insta-courts.com/venues/cross-smash';
  const RECLUB = 'https://reclub.co/clubs/@cross-smash-pickleball';
  const $ = id => document.getElementById(id);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const peso = n => '₱' + n.toLocaleString('en-PH');
  const store = {
    get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private window */ } }
  };

  /* ---------- Court geometry: both sports share the same 20 x 44 ft footprint ---------- */
  const X = ft => 60 + ft * 20;
  const Y = ft => 60 + ft * 20;
  const NS = 'http://www.w3.org/2000/svg';

  // [x1, y1, x2, y2, opacity] in feet
  const LINES = {
    pickleball: {
      top: [0, 0, 44, 0, 1], bottom: [0, 20, 44, 20, 1], left: [0, 0, 0, 20, 1], right: [44, 0, 44, 20, 1],
      nearFront: [15, 0, 15, 20, 1], farFront: [29, 0, 29, 20, 1],
      nearMid: [0, 10, 15, 10, 1], farMid: [29, 10, 44, 10, 1],
      nearBack: [0, 0, 0, 20, 0], farBack: [44, 0, 44, 20, 0],
      sideA: [0, 0, 44, 0, 0], sideB: [0, 20, 44, 20, 0]
    },
    badminton: {
      top: [0, 0, 44, 0, 1], bottom: [0, 20, 44, 20, 1], left: [0, 0, 0, 20, 1], right: [44, 0, 44, 20, 1],
      nearFront: [15.5, 0, 15.5, 20, 1], farFront: [28.5, 0, 28.5, 20, 1],
      nearMid: [0, 10, 15.5, 10, 1], farMid: [28.5, 10, 44, 10, 1],
      nearBack: [2.5, 0, 2.5, 20, 1], farBack: [41.5, 0, 41.5, 20, 1],
      sideA: [0, 1.5, 44, 1.5, 1], sideB: [0, 18.5, 44, 18.5, 1]
    }
  };

  const lineEls = {};
  const lineNow = {};
  Object.entries(LINES.pickleball).forEach(([key, v]) => {
    const el = document.createElementNS(NS, 'line');
    $('courtLines').append(el);
    lineEls[key] = el;
    lineNow[key] = v.slice();
  });
  let kitchenNow = 1;

  function paintLines() {
    Object.entries(lineNow).forEach(([key, [x1, y1, x2, y2, o]]) => {
      const el = lineEls[key];
      el.setAttribute('x1', X(x1)); el.setAttribute('y1', Y(y1));
      el.setAttribute('x2', X(x2)); el.setAttribute('y2', Y(y2));
      el.setAttribute('opacity', o);
    });
    $('kitchen').setAttribute('opacity', kitchenNow);
  }

  let lineAnim = 0;
  function morphLines(next) {
    cancelAnimationFrame(lineAnim);
    const from = JSON.parse(JSON.stringify(lineNow));
    const kFrom = kitchenNow;
    const kTo = next === 'pickleball' ? 1 : 0;
    const start = performance.now();
    const dur = calm ? 0 : 500;
    const step = time => {
      const t = dur ? Math.min(1, (time - start) / dur) : 1;
      const e = 1 - Math.pow(1 - t, 3);
      Object.keys(lineNow).forEach(key => {
        lineNow[key] = from[key].map((v, i) => v + (LINES[next][key][i] - v) * e);
      });
      kitchenNow = kFrom + (kTo - kFrom) * e;
      paintLines();
      if (t < 1) lineAnim = requestAnimationFrame(step);
    };
    lineAnim = requestAnimationFrame(step);
  }

  // Each zone also carries its rectangles [x, y, w, h] in feet for the hover highlight.
  function zoneAt(x, y, game) {
    const over = Math.max(-x, x - 44, -y, y - 20);
    if (over > 0) return { name: 'Out', text: 'That shot landed ' + over.toFixed(1) + ' ft past the line.', rects: [] };
    const fromNet = Math.abs(x - 22);
    if (game === 'pickleball') {
      if (fromNet < 7) return { name: 'Kitchen', text: 'The non-volley zone runs 7 ft from the net on each side. Let the ball bounce before you play it from here.', rects: [[15, 0, 14, 20]] };
      if (fromNet > 19) return { name: 'Baseline', text: 'A deep shot here keeps your opponents back and away from the kitchen.', rects: [[0, 0, 3, 20], [41, 0, 3, 20]] };
      return { name: 'Service court', text: 'Serves land here, diagonal from the server. The return has to bounce before anyone can volley.', rects: [[3, 0, 12, 20], [29, 0, 12, 20]] };
    }
    if (y < 1.5 || y > 18.5) return { name: 'Side alley', text: 'This 1.5 ft strip is in for doubles and out for singles.', rects: [[0, 0, 44, 1.5], [0, 18.5, 44, 1.5]] };
    if (fromNet < 6.5) return { name: 'Front court', text: 'A serve has to reach the short service line, 6.5 ft from the net. A serve landing here is a fault.', rects: [[15.5, 1.5, 13, 17]] };
    if (fromNet > 19.5) return { name: 'Back alley', text: 'In during a rally. In doubles, a serve landing here is long.', rects: [[0, 1.5, 2.5, 17], [41.5, 1.5, 2.5, 17]] };
    return { name: 'Service court', text: 'Serves land here, diagonal from the server and past the short service line.', rects: [[2.5, 1.5, 13, 17], [28.5, 1.5, 13, 17]] };
  }

  function showZone(z) {
    $('zoneName').textContent = z.name;
    $('zoneText').textContent = z.text;
    $('highlight').replaceChildren(...z.rects.map(([x, y, w, h]) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', X(x)); r.setAttribute('y', Y(y));
      r.setAttribute('width', w * 20); r.setAttribute('height', h * 20);
      return r;
    }));
  }

  /* ---------- Shots ---------- */
  // A shuttle reads differently from a ball, so the shot marker is swapped with the sport.
  const shuttle = document.createElementNS(NS, 'path');
  shuttle.setAttribute('d', 'M-6 -6 L-6 6 L16 15 L16 -15 Z');
  shuttle.setAttribute('fill', '#fff');
  shuttle.style.display = 'none';
  $('shot').append(shuttle);

  const ball = { x: 18.5, y: 6 };
  let sport = 'pickleball';
  let shotAnim = 0;

  function placeShot(x, y, lift, angle) {
    $('shadow').setAttribute('cx', X(x));
    $('shadow').setAttribute('cy', Y(y));
    $('shot').setAttribute('transform', `translate(${X(x)} ${Y(y) - lift}) rotate(${angle})`);
    $('ball').setAttribute('r', 14 + lift * .05);
  }

  function ripple(x, y) {
    if (calm) return;
    const el = $('ripple');
    el.setAttribute('cx', X(x));
    el.setAttribute('cy', Y(y));
    el.animate([{ r: '10px', opacity: .9 }, { r: '46px', opacity: 0 }], { duration: 420, easing: 'ease-out' });
  }

  function shoot(x, y, dur = 560) {
    cancelAnimationFrame(shotAnim);
    const from = { ...ball };
    ball.x = x; ball.y = y;
    const angle = Math.atan2(y - from.y, x - from.x) * 180 / Math.PI;
    if (calm) { placeShot(x, y, 0, angle); return; }
    const start = performance.now();
    const height = dur < 300 ? 40 : 84;
    const step = time => {
      const t = Math.min(1, (time - start) / dur);
      placeShot(from.x + (x - from.x) * t, from.y + (y - from.y) * t, Math.sin(Math.PI * t) * height, angle);
      if (t < 1) shotAnim = requestAnimationFrame(step);
      else ripple(x, y);
    };
    shotAnim = requestAnimationFrame(step);
  }

  function randomSpot() {
    const leftSide = ball.x > 22;
    return { x: leftSide ? 1 + Math.random() * 19 : 24 + Math.random() * 19, y: 1 + Math.random() * 18 };
  }

  /* ---------- Sound: a short synthesized "pock", off until the visitor turns it on ---------- */
  let soundOn = store.get('cs-sound', 'off') === 'on';
  let audio = null;
  function pock(pitch = 1) {
    if (!soundOn) return;
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const now = audio.currentTime;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(170 * pitch, now + .09);
    gain.gain.setValueAtTime(.35, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .11);
    osc.connect(gain).connect(audio.destination);
    osc.start(now);
    osc.stop(now + .12);
  }
  function drawSound() {
    $('soundBtn').textContent = soundOn ? 'Sound on' : 'Sound off';
    $('soundBtn').setAttribute('aria-pressed', soundOn);
  }
  $('soundBtn').addEventListener('click', () => {
    soundOn = !soundOn;
    store.set('cs-sound', soundOn ? 'on' : 'off');
    drawSound();
    pock();
  });
  drawSound();

  /* ---------- Smash Challenge ---------- */
  const GAME_MS = 20000;
  const game = { on: false, score: 0, combo: 0, end: 0, best: Number(store.get('cs-best', 0)) || 0, t: null };
  let gameFrame = 0;

  function floatText(x, y, text) {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('x', Math.min(900, Math.max(100, X(x))));
    el.setAttribute('y', Math.max(120, Y(y) - 24));
    el.textContent = text;
    $('floats').append(el);
    if (calm) { setTimeout(() => el.remove(), 500); return; }
    el.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-50px)', opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => el.remove();
  }

  function spawnTarget() {
    const r = Math.max(1.5, 2.8 - game.combo * .12);
    const ttl = Math.max(950, 1800 - game.combo * 70);
    let x;
    do { x = 2 + Math.random() * 40; } while (Math.abs(x - 22) < 3);
    const y = 2.5 + Math.random() * 15;
    game.t = { x, y, r, expires: performance.now() + ttl };
    $('target').setAttribute('transform', `translate(${X(x)} ${Y(y)})`);
    $('targetOuter').setAttribute('r', r * 20);
    $('targetInner').setAttribute('r', r * 8);
  }

  function drawHud(left) {
    $('hudTime').textContent = (left / 1000).toFixed(1);
    $('hudScore').textContent = game.score;
    $('hudCombo').textContent = game.combo;
    $('hudBest').textContent = game.best;
  }

  function gameLoop(now) {
    if (!game.on) return;
    const left = game.end - now;
    if (left <= 0) { endGame(); return; }
    if (now > game.t.expires) {
      game.combo = 0;
      floatText(game.t.x, game.t.y, 'Too slow');
      spawnTarget();
    }
    drawHud(left);
    gameFrame = requestAnimationFrame(gameLoop);
  }

  function startGame() {
    touched = true;
    $('hud').hidden = false;
    $('court').scrollIntoView({ block: 'center', behavior: 'instant' });
    Object.assign(game, { on: true, score: 0, combo: 0, end: performance.now() + GAME_MS });
    $('target').removeAttribute('hidden');
    $('randomShot').hidden = true;
    $('gameBtn').textContent = 'Stop';
    $('highlight').replaceChildren();
    $('zoneName').textContent = 'Smash Challenge';
    $('zoneText').textContent = 'Tap the targets before they vanish. Dead center scores double, and every 3 hits in a row raises your multiplier.';
    spawnTarget();
    gameFrame = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    game.on = false;
    cancelAnimationFrame(gameFrame);
    const record = game.score > game.best;
    if (record) { game.best = game.score; store.set('cs-best', game.best); }
    drawHud(0);
    $('target').setAttribute('hidden', '');
    $('randomShot').hidden = false;
    $('gameBtn').textContent = 'Play again';
    $('zoneName').textContent = `${game.score} points`;
    $('zoneText').textContent = record ? 'New personal best. Now try it on a real court.' : `Your best is ${game.best}. One more round?`;
  }

  function gameTap(x, y) {
    const t = game.t;
    const dist = Math.hypot(x - t.x, y - t.y);
    shoot(x, y, 200);
    if (dist > t.r) {
      game.combo = 0;
      floatText(x, y, 'Miss');
      pock(.6);
      return;
    }
    const points = (dist < t.r * .4 ? 100 : 50) * (1 + Math.floor(game.combo / 3));
    game.score += points;
    game.combo += 1;
    floatText(t.x, t.y, '+' + points);
    pock(1 + Math.min(game.combo, 10) * .08);
    spawnTarget();
  }

  $('gameBtn').addEventListener('click', () => (game.on ? endGame() : startGame()));

  /* ---------- Court input ---------- */
  let touched = false;
  const toFeet = e => {
    const box = $('court').getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width * 1000 - 60) / 20,
      y: ((e.clientY - box.top) / box.height * 520 - 60) / 20
    };
  };
  $('court').addEventListener('click', e => {
    const { x, y } = toFeet(e);
    touched = true;
    if (game.on) { gameTap(x, y); return; }
    shoot(x, y);
    pock();
    showZone(zoneAt(x, y, sport));
  });
  let hoverName = '';
  $('court').addEventListener('pointermove', e => {
    if (game.on || e.pointerType !== 'mouse') return;
    const { x, y } = toFeet(e);
    const z = zoneAt(x, y, sport);
    if (z.name === hoverName) return;
    hoverName = z.name;
    showZone(z.name === 'Out' ? { ...z, text: 'Outside the lines. Anything landing here is out.' } : z);
  });
  $('randomShot').addEventListener('click', () => {
    touched = true;
    const s = randomSpot();
    shoot(s.x, s.y);
    pock();
    showZone(zoneAt(s.x, s.y, sport));
  });

  // Idle rally until the visitor takes over.
  let courtOnScreen = false;
  new IntersectionObserver(([entry]) => { courtOnScreen = entry.isIntersecting; }).observe($('court'));
  if (!calm) {
    setInterval(() => {
      if (touched || document.hidden || !courtOnScreen) return;
      const s = randomSpot();
      shoot(s.x, s.y);
    }, 2400);
  }

  function setSport(next) {
    sport = next;
    document.documentElement.dataset.sport = next;
    document.querySelectorAll('[data-sport][aria-pressed]').forEach(b => b.setAttribute('aria-pressed', b.dataset.sport === next));
    $('ball').style.display = next === 'pickleball' ? '' : 'none';
    shuttle.style.display = next === 'pickleball' ? 'none' : '';
    morphLines(next);
    hoverName = '';
    if (!game.on) showZone(zoneAt(ball.x, ball.y, next));
    plan.courts = plan.courts.filter(n => n <= COURTS[next]);
    if (!plan.courts.length) plan.courts = [1];
    drawPlanner();
  }
  document.querySelectorAll('.panel, .lab-controls .switch button').forEach(b => b.addEventListener('click', () => setSport(b.dataset.sport)));

  /* ---------- Manila calendar: same schedule wherever the visitor opens the page ---------- */
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_MS = 86400000;
  const manilaNow = () => new Date(Date.now() + 8 * 3600000);
  const dayStart = d => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const today = () => dayStart(manilaNow());
  const hourNow = () => { const d = manilaNow(); return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600; };
  const dayName = ms => { const d = new Date(ms); return `${WEEK[d.getUTCDay()]}, ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`; };

  const clock = h => {
    const hour = h % 24;
    const label = hour % 12 || 12;
    return `${label} ${hour < 12 ? 'AM' : 'PM'}`;
  };

  // Late night has only appeared on weekend listings, and ball machine drills on Tuesdays.
  function sessionsOn(ms) {
    const day = new Date(ms).getUTCDay();
    const list = [
      { id: 'morning', name: 'Morning', start: 8, end: 13, price: 120 },
      { id: 'afternoon', name: 'Afternoon', start: 13, end: 18, price: 150 },
      { id: 'evening', name: 'Evening', start: 18, end: 23, price: 250 }
    ];
    if (day === 2) list.splice(1, 0, { id: 'drills', name: 'Ball machine drills', start: 8, end: 13, price: 300 });
    if (day === 6 || day === 0) list.push({ id: 'late', name: 'Late night', start: 23, end: 27, price: 200 });
    return list;
  }
  const sessionTime = s => `${clock(s.start)} to ${clock(s.end)}`;

  let openDay = today();

  function drawDays() {
    const base = today();
    $('days').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const ms = base + i * DAY_MS;
      const d = new Date(ms);
      return `<button type="button" id="day-${i}" data-ms="${ms}" aria-pressed="${ms === openDay}">${i ? WEEK[d.getUTCDay()] : 'Today'}<b>${d.getUTCDate()}</b></button>`;
    }).join('');
  }

  function drawSessions() {
    $('sessions').innerHTML = sessionsOn(openDay).map(s => `
      <article class="session" data-id="${s.id}">
        <span class="fill"></span>
        <h3>${s.name}</h3>
        <span class="time">${sessionTime(s)}</span>
        <span class="price">${peso(s.price)}</span>
        <span class="flag"></span>
        <button type="button" class="btn ghost" id="join-${s.id}" data-join="${s.id}">Plan this session</button>
      </article>`).join('');
    tick();
  }

  $('days').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    openDay = Number(b.dataset.ms);
    drawDays();
    drawSessions();
  });
  $('sessions').addEventListener('click', e => {
    const b = e.target.closest('[data-join]');
    if (!b) return;
    Object.assign(plan, { mode: 'open', date: openDay, session: b.dataset.join });
    drawPlanner();
    $('book').scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
  });

  const hms = hours => {
    const total = Math.max(0, Math.floor(hours * 3600));
    const pad = n => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  };

  // Hours count from the Manila midnight of "day", so 26 means 2 AM the next morning.
  function liveState() {
    const base = today();
    const h = hourNow();
    const pool = [-1, 0, 1, 2].flatMap(offset => sessionsOn(base + offset * DAY_MS)
      .filter(s => s.id !== 'drills')
      .map(s => ({ ...s, day: base + offset * DAY_MS, from: offset * 24 + s.start, to: offset * 24 + s.end })));
    const on = pool.find(s => h >= s.from && h < s.to);
    const next = pool.filter(s => s.from > h).sort((a, b) => a.from - b.from)[0];
    return { h, on, next };
  }

  function tick() {
    const { h, on, next } = liveState();
    if (on) {
      $('liveName').textContent = `${on.name} open play`;
      $('liveDetail').textContent = 'is the usual session right now. Time left:';
      $('liveClock').textContent = hms(on.to - h);
    } else {
      $('liveName').textContent = `${next.name} open play`;
      $('liveDetail').textContent = 'is the next usual session. Starts in:';
      $('liveClock').textContent = hms(next.from - h);
    }
    document.querySelectorAll('.session').forEach(card => {
      const live = on && on.id === card.dataset.id && on.day === openDay;
      card.querySelector('.fill').style.width = live ? ((h - on.from) / (on.to - on.from) * 100) + '%' : '0';
      card.querySelector('.flag').textContent = live ? 'Usual session right now' : '';
    });
    const scrolled = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    $('progress').style.transform = `scaleX(${scrolled})`;
  }
  setInterval(tick, 1000);
  addEventListener('scroll', () => {
    const scrolled = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
    $('progress').style.transform = `scaleX(${scrolled})`;
  }, { passive: true });

  /* ---------- Planner ---------- */
  const COURTS = { pickleball: 6, badminton: 7 };
  const PRICE = { pickleball: 500, badminton: 250 };
  const plan = {
    mode: 'court', date: today() + DAY_MS, start: 18, hours: 2, courts: [1], players: 4,
    gear: 0, machine: 0, session: 'evening', openPlayers: 1, openGear: 0
  };

  function stepper(key, label, hint, min, max) {
    return `<div class="field">
      <span class="label">${label}${hint ? `<small>${hint}</small>` : ''}</span>
      <span class="stepper">
        <button type="button" id="${key}-less" data-key="${key}" data-by="-1" aria-label="Fewer: ${label}" ${plan[key] <= min ? 'disabled' : ''}>−</button>
        <output id="${key}-value">${plan[key]}</output>
        <button type="button" id="${key}-more" data-key="${key}" data-by="1" aria-label="More: ${label}" ${plan[key] >= max ? 'disabled' : ''}>+</button>
      </span>
    </div>`;
  }

  function limits() {
    return {
      hours: [1, 8],
      players: [1, 24],
      gear: [0, plan.players],
      machine: [0, plan.hours],
      openPlayers: [1, 12],
      openGear: [0, plan.openPlayers]
    };
  }

  function dateChips() {
    const base = today();
    return Array.from({ length: 14 }, (_, i) => {
      const ms = base + i * DAY_MS;
      const d = new Date(ms);
      return `<button type="button" id="date-${i}" data-date="${ms}" aria-pressed="${ms === plan.date}">${i ? `${WEEK[d.getUTCDay()]} ${d.getUTCDate()}` : 'Today'}</button>`;
    }).join('');
  }

  function fieldsHtml() {
    const l = limits();
    const dateStep = `<div class="step"><h3><span>1</span> Choose a date</h3><div class="chips">${dateChips()}</div></div>`;
    if (plan.mode === 'open') {
      const chips = sessionsOn(plan.date).map(s =>
        `<button type="button" id="pick-${s.id}" data-session="${s.id}" aria-pressed="${plan.session === s.id}">${s.name}, ${peso(s.price)}</button>`).join('');
      return dateStep
        + `<div class="step"><h3><span>2</span> Pick a session</h3><div class="chips">${chips}</div></div>`
        + `<div class="step"><h3><span>3</span> Who's coming</h3>`
        + stepper('openPlayers', 'Players', '', ...l.openPlayers)
        + stepper('openGear', 'Paddles to rent', '₱100 each', ...l.openGear)
        + '</div>';
    }
    const isP = sport === 'pickleball';
    const hourNowValue = plan.date === today() ? hourNow() : -1;
    const times = Array.from({ length: 15 }, (_, i) => i + 8).map(h =>
      `<button type="button" id="time-${h}" data-time="${h}" aria-pressed="${plan.start === h}" ${h <= hourNowValue ? 'disabled' : ''}>${clock(h)}</button>`).join('');
    const courtChips = Array.from({ length: COURTS[sport] }, (_, i) => i + 1).map(n =>
      `<button type="button" id="court-${n}" data-court="${n}" aria-pressed="${plan.courts.includes(n)}">Court ${n}${isP && n <= 5 ? '<small>Instant Replay</small>' : ''}</button>`).join('');
    return `<div class="step"><h3><span>1</span> Pick a sport</h3><div class="chips">
        <button type="button" id="pick-pickleball" data-pick="pickleball" aria-pressed="${isP}">Pickleball, ₱500/hr</button>
        <button type="button" id="pick-badminton" data-pick="badminton" aria-pressed="${!isP}">Badminton, ₱250/hr</button>
      </div></div>`
      + dateStep.replace('<span>1</span>', '<span>2</span>')
      + `<div class="step"><h3><span>3</span> Set your start time</h3><div class="chips">${times}</div>`
      + stepper('hours', 'Hours', '', ...l.hours) + '</div>'
      + `<div class="step"><h3><span>4</span> Choose your courts</h3><div class="chips courts-pick">${courtChips}</div></div>`
      + `<div class="step"><h3><span>5</span> Add your group and rentals</h3>`
      + stepper('players', 'Players sharing the cost', '', ...l.players)
      + stepper('gear', isP ? 'Paddles to rent' : 'Rackets to rent', isP ? '₱100 each' : '₱50 each', ...l.gear)
      + (isP ? stepper('machine', 'Ball machine hours', '₱500 an hour', ...l.machine) : '')
      + '</div>';
  }

  function bill() {
    if (plan.mode === 'open') {
      const s = sessionsOn(plan.date).find(x => x.id === plan.session);
      const rows = [[`${plan.openPlayers} × ${s.name.toLowerCase()} session`, plan.openPlayers * s.price]];
      if (plan.openGear) rows.push([`${plan.openGear} × paddle`, plan.openGear * 100]);
      const when = `${dayName(plan.date)}, ${sessionTime(s)}`;
      return { title: `${s.name} open play`, when, rows, split: plan.openPlayers, start: s.start, end: s.end, summary: `${s.name} open play at Cross Smash, ${when}` };
    }
    const isP = sport === 'pickleball';
    const label = isP ? 'Pickleball' : 'Badminton';
    const n = plan.courts.length;
    const nums = [...plan.courts].sort((a, b) => a - b).join(', ');
    const courtWord = n > 1 ? 'Courts' : 'Court';
    const rows = [[`${n} ${n > 1 ? 'courts' : 'court'} × ${plan.hours} hr`, n * plan.hours * PRICE[sport]]];
    if (plan.gear) rows.push([`${plan.gear} × ${isP ? 'paddle' : 'racket'}`, plan.gear * (isP ? 100 : 50)]);
    if (isP && plan.machine) rows.push([`Ball machine × ${plan.machine} hr`, plan.machine * 500]);
    const end = plan.start + plan.hours;
    const when = `${dayName(plan.date)}, ${clock(plan.start)} to ${clock(end)}`;
    return { title: `${label}, ${courtWord} ${nums}`, when, rows, split: plan.players, start: plan.start, end, summary: `${label} at Cross Smash, ${courtWord} ${nums}, ${when}` };
  }

  let shownTotal = 0;
  let totalAnim = 0;
  function showTotal(to) {
    cancelAnimationFrame(totalAnim);
    const from = shownTotal;
    shownTotal = to;
    if (calm) { $('total').textContent = $('dockTotal').textContent = peso(to); return; }
    const start = performance.now();
    const step = time => {
      const t = Math.min(1, (time - start) / 260);
      const text = peso(Math.round(from + (to - from) * t));
      $('total').textContent = text;
      $('dockTotal').textContent = text;
      if (t < 1) totalAnim = requestAnimationFrame(step);
    };
    totalAnim = requestAnimationFrame(step);
  }

  let current = null;
  function drawPlanner() {
    const focusId = document.activeElement && document.activeElement.closest('#fields') ? document.activeElement.id : '';
    const l = limits();
    Object.keys(l).forEach(k => { plan[k] = Math.min(Math.max(plan[k], l[k][0]), l[k][1]); });
    if (sport === 'badminton') plan.machine = 0;
    const list = sessionsOn(plan.date);
    if (!list.some(s => s.id === plan.session)) plan.session = list[0].id;
    if (plan.date === today() && plan.start <= hourNow()) plan.start = Math.min(22, Math.ceil(hourNow()) + 1);

    $('fields').innerHTML = fieldsHtml();
    if (focusId && $(focusId)) $(focusId).focus();

    current = bill();
    current.total = current.rows.reduce((sum, r) => sum + r[1], 0);
    current.each = Math.ceil(current.total / current.split);
    $('sheetTitle').textContent = current.title;
    $('sheetWhen').textContent = current.when;
    $('lines').innerHTML = current.rows.map(r => `<li><span>${r[0]}</span><span>${peso(r[1])}</span></li>`).join('');
    showTotal(current.total);
    $('each').textContent = current.split > 1 ? `${peso(current.each)} each for ${current.split} players` : '';
    const open = plan.mode === 'open';
    $('sheetBook').href = open ? RECLUB : BOOK;
    $('sheetBook').textContent = open ? 'Register on Reclub' : 'Book on InstaCourts';
    document.querySelectorAll('.mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === plan.mode));
    $('copyPlan').textContent = 'Copy for group chat';
    $('addCal').textContent = 'Add to calendar';
    $('copyFallback').hidden = true;
  }

  $('fields').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.key) plan[d.key] += Number(d.by);
    else if (d.pick) { setSport(d.pick); return; }
    else if (d.session) plan.session = d.session;
    else if (d.date) plan.date = Number(d.date);
    else if (d.time) plan.start = Number(d.time);
    else if (d.court) {
      const n = Number(d.court);
      if (!plan.courts.includes(n)) plan.courts.push(n);
      else if (plan.courts.length > 1) plan.courts = plan.courts.filter(c => c !== n);
    }
    drawPlanner();
  });
  document.querySelectorAll('.mode button').forEach(b => b.addEventListener('click', () => {
    plan.mode = b.dataset.mode;
    drawPlanner();
  }));

  $('copyPlan').addEventListener('click', () => {
    const open = plan.mode === 'open';
    const text = `${current.summary}. Estimated total ${peso(current.total)}` +
      (current.split > 1 ? `, ${peso(current.each)} each` : '') +
      `. ${open ? 'Register' : 'Book'} here: ${open ? RECLUB : BOOK}`;
    const fallback = () => {
      $('copyFallback').value = text;
      $('copyFallback').hidden = false;
      $('copyFallback').select();
      $('copyPlan').textContent = 'Select and copy below';
    };
    if (!navigator.clipboard) { fallback(); return; }
    navigator.clipboard.writeText(text).then(() => { $('copyPlan').textContent = 'Copied'; }, fallback);
  });

  $('addCal').addEventListener('click', () => {
    const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const utc = hour => plan.date + (hour - 8) * 3600000;
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cross Smash//Game Plan//EN', 'BEGIN:VEVENT',
      `UID:${Date.now()}@cross-smash`, `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(utc(current.start))}`, `DTEND:${stamp(utc(current.end))}`,
      `SUMMARY:${current.title}`,
      'LOCATION:Warehouse 9 & 10\\, Denson Realty Corp\\, Parian\\, Calamba City\\, Laguna',
      `DESCRIPTION:Estimated total ${peso(current.total)}. Confirm your slot on the booking page.`,
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cross-smash-game.ics';
    link.click();
    URL.revokeObjectURL(url);
    $('addCal').textContent = 'Calendar file saved';
  });

  /* ---------- Gallery viewer ---------- */
  const shots = [...document.querySelectorAll('.shot')];
  let viewing = 0;
  function showPhoto(i) {
    viewing = (i + shots.length) % shots.length;
    const img = shots[viewing].querySelector('img');
    $('viewImg').src = img.getAttribute('src');
    $('viewImg').alt = img.alt;
    $('viewCap').textContent = shots[viewing].querySelector('span').textContent;
  }
  shots.forEach(s => s.addEventListener('click', () => {
    showPhoto(Number(s.dataset.index));
    $('viewer').showModal();
  }));
  $('viewClose').addEventListener('click', () => $('viewer').close());
  $('viewPrev').addEventListener('click', () => showPhoto(viewing - 1));
  $('viewNext').addEventListener('click', () => showPhoto(viewing + 1));
  $('viewer').addEventListener('click', e => { if (e.target === $('viewer')) $('viewer').close(); });
  $('viewer').addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') showPhoto(viewing - 1);
    if (e.key === 'ArrowRight') showPhoto(viewing + 1);
  });

  /* ---------- FAQ search ---------- */
  $('faqSearch').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    let found = 0;
    document.querySelectorAll('#faqList details').forEach(d => {
      const hit = d.textContent.toLowerCase().includes(q);
      d.hidden = !hit;
      if (hit) found += 1;
      if (q) d.open = hit;
    });
    $('faqEmpty').hidden = found > 0;
  });

  /* ---------- Active nav link ---------- */
  const navLinks = [...document.querySelectorAll('.top nav a')];
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(a => a.classList.toggle('on', a.hash === '#' + entry.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['court-lab', 'open-play', 'book', 'inside', 'visit', 'faq'].forEach(id => spy.observe($(id)));

  /* ---------- First frame ---------- */
  paintLines();
  placeShot(ball.x, ball.y, 0, 0);
  showZone(zoneAt(ball.x, ball.y, sport));
  drawDays();
  drawSessions();
  drawPlanner();
})();
