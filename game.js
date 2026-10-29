(() => {
  const C = CONFIG;
  const SAVE_KEY = 'tycoonDemo.v1';
  const SYMBOLS = ['💰', '💎', '🐻', '✈️', '🛡️', '⚡'];
  const FAC = Object.fromEntries(C.facilities.map(f => [f.id, f]));
  const $ = sel => document.querySelector(sel);

  let S = load() || newState();
  const ui = { spinning: false, moveFrom: null, arrivals: [] };

  // ---------- 状态 ----------
  function newState() {
    const cells = Array(C.grid.cols * C.grid.rows).fill(null);
    cells[7] = makeCell('icecream');
    return {
      coins: C.startCoins,
      spins: C.spins.start,
      regenAcc: 0,
      shields: 0,
      betIndex: 0,
      cells,
      arrivalAcc: 0,
      dayTimer: 0,
      day: 1,
      mixIndex: 0,
      nextMixIndex: randomOtherIndex(0, C.dayPresets.length),
      rivals: C.rivals.map(r => ({ ...r, shield: Math.random() < C.attack.rivalShieldChance, hitYou: false })),
      rivalTimer: randInt(C.rivalAttack.minSeconds, C.rivalAttack.maxSeconds),
      revenge: null,
      toggles: { strategy: true, social: true },
      stats: {
        startedAt: new Date().toISOString(), playSeconds: 0, spins: 0, builds: 0, upgrades: 0,
        moves: 0, demolishes: 0, servedVisitors: 0, mismatchedVisitors: 0, lostVisitors: 0,
        slotCoins: 0, parkCoins: 0, attackedTimes: 0, blockedTimes: 0, coinsLost: 0,
        repairs: 0, revenges: 0,
      },
      log: [],
    };
  }

  function makeCell(id) {
    return { id, level: 1, queue: 0, mis: 0, damaged: false, lastIncome: 0 };
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      const fresh = newState();
      return { ...fresh, ...saved, stats: { ...fresh.stats, ...saved.stats }, toggles: { ...fresh.toggles, ...saved.toggles } };
    } catch {
      return null;
    }
  }

  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  }

  // ---------- 工具 ----------
  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randomOtherIndex(current, length) {
    let i = current;
    while (i === current) i = Math.floor(Math.random() * length);
    return i;
  }
  function weighted(items, weightOf) {
    const total = items.reduce((s, it) => s + weightOf(it), 0);
    let r = Math.random() * total;
    for (const it of items) {
      r -= weightOf(it);
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }
  function addLog(text) {
    const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    S.log.unshift(`[${t}] ${text}`);
    S.log.length = Math.min(S.log.length, 60);
  }
  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  // ---------- 设施数值 ----------
  const capOf = cell => FAC[cell.id].cap + (cell.level - 1) * C.upgrade.capPerLevel;
  const priceOf = cell => FAC[cell.id].price * Math.pow(C.upgrade.priceGrowth, cell.level - 1);
  const upgradeCostOf = cell => Math.round(FAC[cell.id].cost * Math.pow(C.upgrade.costGrowth, cell.level));
  const repairCostOf = cell => Math.round(FAC[cell.id].cost * C.repairRatio);
  const builtCount = () => S.cells.filter(Boolean).length;
  const baseUnit = () => C.baseUnit.base + C.baseUnit.perBuilding * builtCount();
  const currentBet = () => C.bets[S.betIndex];

  function neighbors(i) {
    const { cols, rows } = C.grid;
    const r = Math.floor(i / cols), c = i % cols;
    const out = [];
    if (r > 0) out.push(i - cols);
    if (r < rows - 1) out.push(i + cols);
    if (c > 0) out.push(i - 1);
    if (c < cols - 1) out.push(i + 1);
    return out;
  }

  function sameThemeNeighbors(i) {
    const theme = FAC[S.cells[i].id].theme;
    return neighbors(i).filter(n => S.cells[n] && FAC[S.cells[n].id].theme === theme).length;
  }

  function incomeMultiplier(i) {
    return S.toggles.strategy ? 1 + sameThemeNeighbors(i) * C.adjacencyBonus : 1;
  }

  function adjacencyLinks() {
    return S.cells.reduce((s, c, i) => s + (c ? sameThemeNeighbors(i) : 0), 0) / 2;
  }

  function layoutArrivalBonus() {
    return S.toggles.strategy ? adjacencyLinks() * C.arrival.perAdjacencyLink : 0;
  }

  function arrivalRate() {
    const levels = S.cells.reduce((s, c) => s + (c && !c.damaged ? c.level : 0), 0);
    return C.arrival.base + C.arrival.perLevel * levels + layoutArrivalBonus();
  }

  function dominantTheme() {
    const mix = C.dayPresets[S.mixIndex].mix;
    return Object.keys(mix).reduce((a, b) => (mix[b] > mix[a] ? b : a));
  }

  // ---------- 经营模拟（每秒一次） ----------
  function spawnVisitor() {
    const working = S.cells.map((c, i) => ({ c, i })).filter(x => x.c && !x.c.damaged);
    if (!working.length) { S.stats.lostVisitors++; return; }

    let candidates = working;
    let mismatch = false;
    let type = null;
    if (S.toggles.strategy) {
      const mix = C.dayPresets[S.mixIndex].mix;
      type = weighted(Object.keys(mix), k => mix[k]);
      const preferred = working.filter(x => FAC[x.c.id].theme === type);
      if (preferred.length) candidates = preferred;
      else mismatch = true;
    }

    // 游客更愿意去成片的主题街区：排队压力按收入加成折算
    const score = x => x.c.queue / capOf(x.c) / incomeMultiplier(x.i);
    const target = candidates.reduce((a, b) => (score(b) < score(a) ? b : a));
    if (target.c.queue >= C.queueMax) {
      S.stats.lostVisitors++;
      ui.arrivals.push({ i: target.i, type, lost: true });
      return;
    }
    target.c.queue++;
    if (mismatch) target.c.mis++;
    ui.arrivals.push({ i: target.i, type, mismatch });
  }

  function tick() {
    S.stats.playSeconds++;

    if (S.spins < C.spins.max) {
      S.regenAcc++;
      if (S.regenAcc >= C.spins.regenSeconds) { S.spins++; S.regenAcc = 0; }
    } else {
      S.regenAcc = 0;
    }

    S.dayTimer++;
    if (S.dayTimer >= C.dayLengthSeconds) {
      S.dayTimer = 0;
      S.day++;
      S.mixIndex = S.nextMixIndex;
      S.nextMixIndex = randomOtherIndex(S.mixIndex, C.dayPresets.length);
      if (S.toggles.strategy) {
        addLog(`第 ${S.day} 天开始：${C.dayPresets[S.mixIndex].name}`);
        toast(`新的一天：${C.dayPresets[S.mixIndex].name}`);
      }
    }

    S.arrivalAcc += arrivalRate();
    while (S.arrivalAcc >= 1) { S.arrivalAcc--; spawnVisitor(); }

    S.cells.forEach((cell, i) => {
      if (!cell) return;
      if (cell.damaged) { cell.lastIncome = 0; return; }
      const served = Math.min(cell.queue, capOf(cell));
      const misServed = cell.queue ? Math.min(cell.mis, Math.round(served * cell.mis / cell.queue)) : 0;
      const price = priceOf(cell) * incomeMultiplier(i);
      const income = (served - misServed) * price + misServed * price * C.noPreferencePriceRatio;
      cell.queue -= served;
      cell.mis -= misServed;
      cell.lastIncome = income;
      S.coins += income;
      S.stats.parkCoins += income;
      S.stats.servedVisitors += served;
      S.stats.mismatchedVisitors += misServed;
    });

    S.rivals.forEach(r => { r.coins += r.rate; });

    const busy = ui.spinning || ui.moveFrom !== null || !$('#modal').classList.contains('hidden');
    if (!busy) S.rivalTimer--;
    if (S.rivalTimer <= 0) {
      S.rivalTimer = randInt(C.rivalAttack.minSeconds, C.rivalAttack.maxSeconds);
      rivalAttack();
    }

    if (S.stats.playSeconds % 5 === 0) save();
    render();
    spawnWalkers();
    if (S.stats.playSeconds % C.fx.incomePopupSeconds === 0) popIncome();
  }

  // ---------- 机器人来袭 ----------
  function rivalAttack() {
    const ri = Math.floor(Math.random() * S.rivals.length);
    const r = S.rivals[ri];
    const working = S.cells.map((c, i) => ({ c, i })).filter(x => x.c && !x.c.damaged);
    const isSteal = Math.random() < C.rivalAttack.stealChance || !working.length;
    S.stats.attackedTimes++;

    if (S.shields > 0) {
      S.shields--;
      S.stats.blockedTimes++;
      addLog(`${r.avatar}${r.name} 想${isSteal ? '偷你' : '炸你'}，被护盾挡住了`);
      toast('🛡️ 护盾挡住了一次袭击');
      return;
    }

    r.hitYou = true;
    let body;
    if (isSteal) {
      const rate = S.toggles.social ? C.loss.capped : C.loss.uncapped;
      const amount = Math.floor(S.coins * rate);
      S.coins -= amount;
      S.stats.coinsLost += amount;
      addLog(`${r.avatar}${r.name} 偷走了你 ${fmt(amount)} 金币`);
      body = `<div class="big-emoji">${r.avatar}💸</div><p><b>${r.name}</b> 溜进你的乐园，偷走了 <b>${fmt(amount)}</b> 金币（当前金币的 ${Math.round(rate * 100)}%）。</p>`;
    } else {
      const target = pick(working);
      target.c.damaged = true;
      target.c.queue = 0;
      target.c.mis = 0;
      const f = FAC[target.c.id];
      addLog(`${r.avatar}${r.name} 炸坏了你的${f.name}`);
      body = `<div class="big-emoji">${r.avatar}💥${f.icon}</div><p><b>${r.name}</b> 炸坏了你的 <b>${f.name}</b>，修好之前它不会接待游客。修复需要 ${fmt(repairCostOf(target.c))} 金币。</p>`;
    }

    if (S.toggles.social) {
      S.revenge = { rival: ri };
      body += `<p>🎯 你获得了一张<b>复仇券</b>：下一次转盘必定对 ${r.name} 复仇，并且无视护盾。</p>`;
    } else {
      body += `<p>${r.name} 已加入你的复仇列表。转出 🐻 或 ✈️ 时，有机会碰到它。</p>`;
    }
    showModal('你的乐园遭到袭击！', body, [{ text: '去转盘', action: closeModal }]);
  }

  // ---------- 转盘 ----------
  function spin() {
    if (ui.spinning) return;
    const bet = currentBet();
    if (S.spins < bet) { toast('转盘次数不够了，等等恢复或降低押注'); return; }

    S.spins -= bet;
    S.stats.spins++;

    let outcome, targetIndex = null, isRevenge = false;
    if (S.revenge) {
      outcome = C.outcomes.find(o => o.id === (Math.random() < 0.5 ? 'steal' : 'attack'));
      targetIndex = S.revenge.rival;
      isRevenge = true;
      S.revenge = null;
      S.stats.revenges++;
    } else {
      outcome = weighted(C.outcomes, o => o.weight);
    }

    let final;
    if (outcome.id === 'small') {
      do { final = [pick(SYMBOLS), pick(SYMBOLS), pick(SYMBOLS)]; }
      while (final[0] === final[1] && final[1] === final[2]);
    } else {
      final = [outcome.symbol, outcome.symbol, outcome.symbol];
    }

    animateReels(final, () => resolveSpin(outcome, final, bet, targetIndex, isRevenge));
    render();
  }

  function animateReels(final, done) {
    ui.spinning = true;
    const reels = [...document.querySelectorAll('.reel')];
    reels.forEach(r => r.classList.remove('win'));
    const timers = reels.map(r => setInterval(() => { r.textContent = pick(SYMBOLS); }, 60));
    reels.forEach((r, i) => {
      setTimeout(() => {
        clearInterval(timers[i]);
        r.textContent = final[i];
        if (i === reels.length - 1) {
          ui.spinning = false;
          done();
        }
      }, 450 + i * 380);
    });
  }

  function resolveSpin(outcome, final, bet, targetIndex, isRevenge) {
    const unit = baseUnit() * bet;
    let text = '';
    let gained = 0;

    const gain = amount => {
      amount = Math.round(amount);
      S.coins += amount;
      S.stats.slotCoins += amount;
      gained += amount;
      return amount;
    };

    switch (outcome.id) {
      case 'small': {
        const coinCount = final.filter(s => s === '💰').length;
        text = `获得 ${fmt(gain(unit * (1 + coinCount)))} 金币`;
        break;
      }
      case 'coin3':
        text = `三个金币！获得 ${fmt(gain(unit * outcome.mult))} 金币`;
        break;
      case 'jackpot':
        text = `💎 大奖！获得 ${fmt(gain(unit * outcome.mult))} 金币`;
        toast('💎 JACKPOT!');
        break;
      case 'shield':
        if (S.shields < C.shieldMax) { S.shields++; text = `获得一面护盾（${S.shields}/${C.shieldMax}）`; }
        else text = `护盾已满，转换为 ${fmt(gain(unit * C.shieldFullRewardUnits))} 金币`;
        break;
      case 'energy': {
        const n = outcome.spins * bet;
        S.spins += n;
        text = `获得 ${n} 次转盘`;
        break;
      }
      case 'steal': {
        const ri = targetIndex ?? Math.floor(Math.random() * S.rivals.length);
        const r = S.rivals[ri];
        const amount = Math.min(r.coins, unit * C.steal.minUnits + Math.floor(r.coins * C.steal.rivalStashRate));
        r.coins -= amount;
        gain(amount);
        if (isRevenge) r.hitYou = false;
        text = `${isRevenge ? '🎯 复仇成功！' : ''}🐻 偷走了 ${r.name} ${fmt(amount)} 金币`;
        addLog(text);
        break;
      }
      case 'attack': {
        const ri = targetIndex ?? Math.floor(Math.random() * S.rivals.length);
        const r = S.rivals[ri];
        let amount;
        if (r.shield && !isRevenge) {
          r.shield = false;
          amount = gain(unit * C.attack.rewardUnits * C.attack.blockedRatio);
          text = `✈️ ${r.name} 的护盾挡住了攻击，只拿到 ${fmt(amount)} 金币`;
        } else {
          r.shield = Math.random() < C.attack.rivalShieldChance;
          amount = gain(unit * C.attack.rewardUnits);
          text = `${isRevenge ? '🎯 复仇成功！' : ''}✈️ 炸了 ${r.name} 的乐园，获得 ${fmt(amount)} 金币`;
        }
        if (isRevenge) r.hitYou = false;
        addLog(text);
        break;
      }
    }

    if (outcome.id !== 'small') document.querySelectorAll('.reel').forEach(r => r.classList.add('win'));
    $('#slotResult').textContent = text;
    render();

    const reels = $('.reels');
    if (gained) {
      flyCoins(reels, C.fx.coinCount[outcome.id]);
      floatText(reels, `+${fmt(gained)}`);
    }
    if (outcome.id === 'energy') floatText(reels, `+${outcome.spins * bet} ⚡`, '#ffee58');
    if (outcome.id === 'shield') floatText(reels, '+1 🛡️', '#90caf9');
  }

  // ---------- 建造与设施操作 ----------
  function onCellClick(i) {
    if (ui.moveFrom !== null) { finishMove(i); return; }
    if (S.cells[i]) openFacilityMenu(i);
    else openBuildMenu(i);
  }

  function openBuildMenu(i) {
    let body = '';
    for (const [key, theme] of Object.entries(C.themes)) {
      body += `<div class="theme-head" style="color:${theme.color}">■ ${theme.name}类</div><div class="fac-list">`;
      C.facilities.filter(f => f.theme === key).forEach(f => {
        body += `<button class="fac-option" data-build="${f.id}" ${S.coins < f.cost ? 'disabled' : ''}>
          <span class="fac-icon">${f.icon}</span><b>${f.name}</b>
          <span>💰 ${fmt(f.cost)}</span><span>接待 ${f.cap}/秒 · 票价 ${f.price}</span></button>`;
      });
      body += '</div>';
    }
    showModal('建造新设施', body, [{ text: '取消', cls: 'secondary', action: closeModal }]);
    document.querySelectorAll('[data-build]').forEach(btn => {
      btn.onclick = () => build(i, btn.dataset.build);
    });
  }

  function build(i, id) {
    const f = FAC[id];
    if (S.coins < f.cost) return;
    const linksBefore = adjacencyLinks();
    S.coins -= f.cost;
    S.cells[i] = makeCell(id);
    S.stats.builds++;
    addLog(`建造了${f.name}`);
    closeModal();
    render();
    sparkle(i);
    afterLayoutChange(i, linksBefore);
  }

  function openFacilityMenu(i) {
    const cell = S.cells[i];
    const f = FAC[cell.id];
    const maxed = cell.level >= C.upgrade.maxLevel;
    const adj = sameThemeNeighbors(i);
    let body = `<div class="big-emoji">${f.icon}</div>
      <p>${C.themes[f.theme].name}类 · Lv${cell.level} · 接待 ${capOf(cell)}/秒 · 票价 ${priceOf(cell).toFixed(1)}</p>`;
    if (S.toggles.strategy) body += `<p>同主题邻居 ${adj} 个，收入 ×${incomeMultiplier(i).toFixed(1)}</p>`;
    if (cell.damaged) body += `<p>🔥 已被炸坏，修复后才能营业。</p>`;

    const buttons = [];
    if (cell.damaged) {
      const cost = repairCostOf(cell);
      buttons.push({ text: `修复 💰${fmt(cost)}`, disabled: S.coins < cost, action: () => repair(i) });
    } else if (!maxed) {
      const cost = upgradeCostOf(cell);
      buttons.push({ text: `升级 💰${fmt(cost)}`, disabled: S.coins < cost, action: () => upgrade(i) });
    }
    buttons.push({ text: '移动', action: () => startMove(i) });
    buttons.push({ text: `拆除（返还 ${fmt(f.cost * C.demolishRefund)}）`, cls: 'danger', action: () => demolish(i) });
    buttons.push({ text: '关闭', cls: 'secondary', action: closeModal });
    showModal(f.name, body, buttons);
  }

  function upgrade(i) {
    const cell = S.cells[i];
    const cost = upgradeCostOf(cell);
    if (S.coins < cost || cell.level >= C.upgrade.maxLevel) return;
    S.coins -= cost;
    cell.level++;
    S.stats.upgrades++;
    addLog(`${FAC[cell.id].name} 升到了 Lv${cell.level}`);
    closeModal();
    render();
  }

  function repair(i) {
    const cell = S.cells[i];
    const cost = repairCostOf(cell);
    if (S.coins < cost) return;
    S.coins -= cost;
    cell.damaged = false;
    S.stats.repairs++;
    addLog(`修好了${FAC[cell.id].name}`);
    closeModal();
    render();
  }

  function demolish(i) {
    const f = FAC[S.cells[i].id];
    S.coins += f.cost * C.demolishRefund;
    S.cells[i] = null;
    S.stats.demolishes++;
    addLog(`拆除了${f.name}`);
    closeModal();
    render();
  }

  function startMove(i) {
    ui.moveFrom = i;
    closeModal();
    render();
  }

  function finishMove(i) {
    const from = ui.moveFrom;
    ui.moveFrom = null;
    const linksBefore = adjacencyLinks();
    if (i !== from) {
      [S.cells[from], S.cells[i]] = [S.cells[i], S.cells[from]];
      S.stats.moves++;
    }
    render();
    if (i !== from) afterLayoutChange(i, linksBefore);
  }

  function afterLayoutChange(i, linksBefore) {
    if (!S.toggles.strategy || !S.cells[i]) return;
    const gainedLinks = adjacencyLinks() - linksBefore;
    if (gainedLinks > 0) celebrate(i, gainedLinks);
  }

  // ---------- 弹窗 ----------
  function showModal(title, body, buttons) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    const box = $('#modalButtons');
    box.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.textContent = b.text;
      if (b.cls) btn.className = b.cls;
      if (b.disabled) btn.disabled = true;
      btn.onclick = b.action;
      box.appendChild(btn);
    });
    $('#modal').classList.remove('hidden');
  }

  function closeModal() {
    $('#modal').classList.add('hidden');
  }

  // ---------- 渲染 ----------
  function moodOf(cell) {
    const cap = capOf(cell);
    if (cell.queue <= cap) return '😊';
    if (cell.queue <= cap * 2) return '😐';
    return '😠';
  }

  // 格子元素常驻、只替换内部内容：整体重建会让跨越刷新的点击丢失
  function renderGrid() {
    const grid = $('#grid');
    grid.style.gridTemplateColumns = `repeat(${C.grid.cols}, 1fr)`;
    while (grid.children.length < S.cells.length) {
      const el = document.createElement('div');
      el.dataset.i = grid.children.length;
      grid.appendChild(el);
    }

    S.cells.forEach((cell, i) => {
      const el = grid.children[i];
      const moving = ui.moveFrom !== null;
      const moveCls = moving ? (i === ui.moveFrom ? ' move-from' : ' move-target') : '';
      let cls, bg = '', html;

      if (!cell) {
        cls = `cell empty${moveCls}`;
        html = '＋ 建造';
      } else {
        const f = FAC[cell.id];
        const theme = C.themes[f.theme];
        const visitorIcon = S.toggles.strategy ? theme.visitor : '🙂';
        const shown = Math.min(cell.queue, 4);
        const queueText = cell.queue ? visitorIcon.repeat(shown) + (cell.queue > shown ? `+${cell.queue - shown}` : '') + ' ' + moodOf(cell) : '';
        const adj = S.toggles.strategy ? sameThemeNeighbors(i) : 0;
        const hot = adj > 0 && !cell.damaged && f.theme === dominantTheme();
        cls = `cell${cell.damaged ? ' damaged' : ''}${hot ? ' hot' : ''}${moveCls}`;
        bg = `${theme.color}66`;
        html = `${S.toggles.strategy ? `<span class="theme-tag" style="background:${theme.color}">${theme.name}</span>` : ''}
          ${adj ? `<span class="adj">+${Math.round(adj * C.adjacencyBonus * 100)}%</span>` : ''}
          <div class="fac-icon">${f.icon}</div>
          <div class="fac-name">${f.name} Lv${cell.level}</div>
          <div class="queue">${queueText}</div>
          <div class="income">${cell.damaged ? '停业' : `+${cell.lastIncome.toFixed(0)}/秒`}</div>
          ${hot ? '<span class="hot-tag">🔥热门</span>' : ''}
          ${cell.damaged ? '<span class="fire">🔥</span>' : ''}`;
      }

      if (el.classList.contains('sparkle')) cls += ' sparkle';
      if (el.className !== cls) el.className = cls;
      el.style.background = bg;
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
    });
  }

  function renderDay() {
    if (!S.toggles.strategy) { $('#dayInfo').innerHTML = ''; return; }
    const now = C.dayPresets[S.mixIndex];
    const next = C.dayPresets[S.nextMixIndex];
    const mixText = mix => Object.entries(mix).map(([k, v]) => `${C.themes[k].visitor}${Math.round(v * 100)}%`).join(' ');
    const pct = (S.dayTimer / C.dayLengthSeconds) * 100;
    $('#dayInfo').innerHTML = `第 ${S.day} 天 · <b>${now.name}</b> ${mixText(now.mix)}<br>
      <small>明日预告：${next.name} ${mixText(next.mix)}</small>
      <div class="daybar"><div style="width:${pct}%"></div></div>`;
  }

  function render() {
    $('#coins').textContent = fmt(S.coins);
    $('#spins').textContent = `${S.spins}/${C.spins.max}`;
    $('#regen').textContent = S.spins < C.spins.max ? `+1 于 ${C.spins.regenSeconds - S.regenAcc}s` : '已满';
    $('#shields').textContent = `${S.shields}/${C.shieldMax}`;
    $('#parkIncome').textContent = fmt(S.cells.reduce((s, c) => s + (c ? c.lastIncome : 0), 0));
    $('#lost').textContent = fmt(S.stats.lostVisitors);
    $('#arrivalRate').textContent = arrivalRate().toFixed(1);
    const bonus = layoutArrivalBonus();
    $('#layoutBonus').textContent = bonus ? `（排布 +${bonus.toFixed(1)}）` : '';
    $('#betBtn').textContent = `押注 ×${currentBet()}`;
    $('#spinBtn').disabled = ui.spinning;
    $('#moveHint').classList.toggle('hidden', ui.moveFrom === null);
    $('#strategyTip').classList.toggle('hidden', !S.toggles.strategy);
    $('#tglStrategy').checked = S.toggles.strategy;
    $('#tglSocial').checked = S.toggles.social;

    const rev = $('#revenge');
    if (S.revenge) {
      rev.textContent = `🎯 复仇券：下一次转盘必定对 ${S.rivals[S.revenge.rival].name} 复仇`;
      rev.classList.remove('hidden');
    } else {
      rev.classList.add('hidden');
    }

    $('#rivals').innerHTML = S.rivals.map(r => `<li>
      <span>${r.avatar} ${r.name}${r.hitYou ? '<span class="tag">袭击过你</span>' : ''}</span>
      <span>💰${fmt(r.coins)} ${r.shield ? '🛡️' : ''}</span></li>`).join('');
    $('#log').innerHTML = S.log.map(l => `<li>${l}</li>`).join('');

    renderGrid();
    renderDay();
  }

  // ---------- 视觉效果 ----------
  const fxOn = () => !document.hidden;

  function centerOf(el, relTo) {
    const r = el.getBoundingClientRect();
    const base = relTo ? relTo.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: r.left - base.left + r.width / 2, y: r.top - base.top + r.height / 2 };
  }

  function restartClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function flyCoins(fromEl, count) {
    if (!count || !fxOn()) return;
    const from = centerOf(fromEl);
    const counter = $('#coins').parentElement;
    const to = centerOf(counter);
    for (let k = 0; k < count; k++) {
      const coin = document.createElement('div');
      coin.className = 'fly-coin';
      coin.textContent = '🪙';
      $('#fx').appendChild(coin);
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 80;
      const mid = { x: from.x + Math.cos(angle) * dist, y: from.y + Math.sin(angle) * dist };
      const anim = coin.animate([
        { transform: `translate(${from.x}px, ${from.y}px) scale(.4)`, opacity: 0 },
        { transform: `translate(${mid.x}px, ${mid.y}px) scale(1.15)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(.6)`, opacity: 0.9 },
      ], { duration: 750 + Math.random() * 300, delay: k * 35, easing: 'cubic-bezier(.45,0,.6,1)', fill: 'backwards' });
      anim.onfinish = () => { coin.remove(); restartClass(counter, 'bump'); };
    }
  }

  function floatText(el, text, color, small = false) {
    if (!fxOn()) return;
    const p = centerOf(el);
    const t = document.createElement('div');
    t.className = 'float-text' + (small ? ' small' : '');
    t.textContent = text;
    if (color) t.style.color = color;
    $('#fx').appendChild(t);
    t.animate([
      { transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
      { transform: `translate(${p.x}px, ${p.y - 20}px) translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${p.x}px, ${p.y - 64}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
    ], { duration: 1300, easing: 'ease-out' }).onfinish = () => t.remove();
  }

  function popIncome() {
    if (!fxOn()) return;
    const cellEls = $('#grid').children;
    S.cells.forEach((cell, i) => {
      if (cell && cell.lastIncome > 0) {
        floatText(cellEls[i], `+${fmt(cell.lastIncome * C.fx.incomePopupSeconds)}`, '#2e7d32', true);
      }
    });
  }

  function spawnWalkers() {
    const events = ui.arrivals;
    ui.arrivals = [];
    if (!fxOn() || !events.length) return;
    // 优先画流失的游客，让“排布不合理”被看见
    events.sort((a, b) => (b.lost ? 1 : 0) - (a.lost ? 1 : 0) || Math.random() - 0.5);
    events.slice(0, C.fx.maxWalkersPerTick).forEach((ev, k) => setTimeout(() => walk(ev), k * 180));
  }

  function walk(ev, vip = false) {
    const layer = $('#walkers');
    const cellEl = $('#grid').children[ev.i];
    if (!cellEl || layer.childElementCount >= C.fx.maxWalkers) return;
    const area = $('#parkArea');
    const start = centerOf($('#gate'), area);
    const end = centerOf(cellEl, area);
    start.x += (Math.random() - 0.5) * 80;
    end.x += (Math.random() - 0.5) * 50;
    end.y += 22 + (Math.random() - 0.5) * 16;

    const icon = ev.type ? C.themes[ev.type].visitor : '🙂';
    const w = document.createElement('div');
    w.className = 'walker' + (ev.mismatch ? ' unhappy' : '') + (vip ? ' vip' : '');
    w.innerHTML = `<span class="body">${icon}</span>${ev.mismatch ? '<span class="bubble">😕</span>' : ''}`;
    layer.appendChild(w);

    const go = w.animate([
      { transform: `translate(${start.x}px, ${start.y}px)`, opacity: 0 },
      { transform: `translate(${start.x}px, ${start.y}px)`, opacity: 1, offset: 0.05 },
      { transform: `translate(${end.x}px, ${end.y}px)`, opacity: 1 },
    ], { duration: (vip ? 800 : 1100) + Math.random() * 500, easing: 'ease-in-out', fill: 'forwards' });

    go.onfinish = () => {
      if (ev.lost) {
        w.innerHTML = `<span class="body">${icon}</span><span class="bubble">😠</span>`;
        w.animate([
          { transform: `translate(${end.x}px, ${end.y}px)`, opacity: 1 },
          { transform: `translate(${start.x}px, ${start.y + 30}px)`, opacity: 0 },
        ], { duration: 1300, easing: 'ease-in', fill: 'forwards' }).onfinish = () => w.remove();
      } else {
        w.animate([
          { transform: `translate(${end.x}px, ${end.y}px) scale(1)`, opacity: 1 },
          { transform: `translate(${end.x}px, ${end.y - 12}px) scale(.3)`, opacity: 0 },
        ], { duration: 350, fill: 'forwards' }).onfinish = () => w.remove();
      }
    };
  }

  function sparkle(i) {
    const el = $('#grid').children[i];
    if (el) restartClass(el, 'sparkle');
  }

  function celebrate(i, gainedLinks) {
    const theme = FAC[S.cells[i].id].theme;
    const extra = gainedLinks * C.arrival.perAdjacencyLink;
    toast(`✨ ${C.themes[theme].name}主题街区成形！客流 +${extra.toFixed(1)}/秒`);
    const cluster = [i, ...neighbors(i).filter(n => S.cells[n] && FAC[S.cells[n].id].theme === theme)];
    cluster.forEach(sparkle);
    if (!fxOn()) return;
    for (let k = 0; k < C.fx.celebrateWalkers; k++) {
      setTimeout(() => walk({ i: pick(cluster), type: theme }, true), k * 110);
    }
  }

  // ---------- 试玩数据 ----------
  function exportData() {
    const built = S.cells.map((c, i) => ({ c, i })).filter(x => x.c);
    const avgAdj = built.length ? built.reduce((s, x) => s + sameThemeNeighbors(x.i), 0) / built.length : 0;
    const data = {
      exportedAt: new Date().toISOString(),
      toggles: S.toggles,
      day: S.day,
      coins: Math.floor(S.coins),
      buildings: built.map(x => ({ slot: x.i, id: x.c.id, level: x.c.level })),
      avgSameThemeNeighbors: +avgAdj.toFixed(2),
      stats: { ...S.stats, slotCoins: Math.floor(S.stats.slotCoins), parkCoins: Math.floor(S.stats.parkCoins) },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tycoon-playtest-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- 事件绑定 ----------
  $('#grid').addEventListener('click', e => {
    const el = e.target.closest('[data-i]');
    if (el) onCellClick(+el.dataset.i);
  });
  $('#spinBtn').onclick = spin;
  $('#betBtn').onclick = () => { S.betIndex = (S.betIndex + 1) % C.bets.length; render(); };
  $('#cancelMove').onclick = () => { ui.moveFrom = null; render(); };
  $('#tglStrategy').onchange = e => { S.toggles.strategy = e.target.checked; addLog(`经营轻策略：${e.target.checked ? '开' : '关'}`); render(); };
  $('#tglSocial').onchange = e => { S.toggles.social = e.target.checked; if (!e.target.checked) S.revenge = null; addLog(`社交保底：${e.target.checked ? '开' : '关'}`); render(); };
  $('#exportBtn').onclick = exportData;
  $('#resetBtn').onclick = () => {
    if (!confirm('确定清空进度重新开始？')) return;
    localStorage.removeItem(SAVE_KEY);
    S = newState();
    ui.moveFrom = null;
    render();
  };
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && $('#modal').classList.contains('hidden')) { e.preventDefault(); spin(); }
    if (e.key === 'Escape') { closeModal(); ui.moveFrom = null; render(); }
  });
  window.addEventListener('beforeunload', save);

  if (location.hash === '#debug') window.game = { get state() { return S; }, rivalAttack, render, flyCoins, floatText, celebrate };

  render();
  setInterval(tick, 1000);
})();
