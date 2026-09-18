// Game intensity only, not an estimate of a person's emotional state.
const rage = {
  self: 0, partner: 0, cards: { self: 0, partner: 0 }, peaks: 0,
  armed: true, lowSince: 0, highSince: 0, lastPeak: 0,
  burstUntil: { self: 0, partner: 0 }, vfxStyle: { self: 'purple', partner: 'purple' },
  seen: new Set(), revision: 0, remoteRevision: -1
};
const rageStyles = new Set(['purple', 'green']);
const rageCards = new Set(['hehe', 'question', 'applause']);
let ragePainters = [];
let headTrackers = [];
function stopRagePainters() {
  headTrackers.forEach(tracker => tracker.destroy());
  headTrackers = [];
  ragePainters.forEach(painter => painter.destroy());
  ragePainters = [];
}
function resetRage() {
  Object.assign(rage, { self: 0, partner: 0, cards: { self: 0, partner: 0 }, peaks: 0,
    armed: true, lowSince: 0, highSince: 0, lastPeak: 0,
    burstUntil: { self: 0, partner: 0 }, vfxStyle: { self: 'purple', partner: 'purple' },
    seen: new Set(), revision: 0, remoteRevision: -1 });
}
function rageTier(side) { return rage[side] >= 100 ? 3 : rage[side] >= 50 ? 2 : rage[side] >= 25 ? 1 : 0; }
function syncRage() {
  if (state.sessionMode === 'real') sendPeer({ type: 'rage', value: rage.self,
    style: rage.vfxStyle.self, revision: ++rage.revision });
}
function addRage(side, reason) {
  if (state.paused || state.page !== 'room') return;
  const previous = rage[side];
  rage[side] = Math.min(100, previous + 25);
  if (rage[side] === 100 && previous < 100) rage.burstUntil[side] = Date.now() + 1800;
  addEvent(`${reason} · 游戏怒气 ${rage[side]}/100`, 'rage', side === 'self' ? state.name : state.partnerName);
  updateRage();
  if (side === 'self') syncRage();
}
function receiveRage(message) {
  if (!Number.isInteger(message.revision) || message.revision <= rage.remoteRevision ||
      !Number.isFinite(message.value) || message.value < 0 || message.value > 100) return;
  rage.remoteRevision = message.revision;
  if (rageStyles.has(message.style)) rage.vfxStyle.partner = message.style;
  if (message.value === 100 && rage.partner < 100) rage.burstUntil.partner = Date.now() + 1800;
  rage.partner = message.value;
  updateRage();
}
function setRageStyle(style) {
  if (!rageStyles.has(style)) return;
  rage.vfxStyle.self = style;
  updateRage();
  if (state.sessionMode === 'real') sendPeer({ type: 'rage-style', style });
}
function receiveRageStyle(message) {
  if (!rageStyles.has(message.style)) return;
  rage.vfxStyle.partner = message.style;
  updateRage();
}
function countRageCard(side, card) {
  if (!rageCards.has(card) || state.paused) return;
  rage.cards[side] += 1;
  if (rage.cards[side] % 2 === 0) addRage(side, '收到两张嘲讽卡');
  updateRage();
}
function ragePeak() {
  if (state.paused || state.page !== 'room') return;
  rage.peaks += 1;
  if (rage.peaks % 2 === 0) addRage('self', '两次独立声音骤升');
  // Even a first peak gets a short smoke cue; higher tiers intensify it.
  rage.burstUntil.self = Date.now() + 1800;
  updateRage();
  if (state.sessionMode === 'real') sendPeer({type:'rage-pulse'});
}
function sampleRageVoice(rms, now = Date.now()) {
  if (rms < 0.065) {
    rage.highSince = 0;
    if (!rage.lowSince) rage.lowSince = now;
    if (now - rage.lowSince >= 500) rage.armed = true;
  } else {
    rage.lowSince = 0;
    if (rms > 0.14 && rage.armed) {
      if (!rage.highSince) rage.highSince = now;
      if (now - rage.highSince >= 100 && now - rage.lastPeak >= 1500) {
        rage.armed = false; rage.highSince = 0; rage.lastPeak = now; ragePeak();
      }
    } else rage.highSince = 0;
  }
}
function rageOverlay(side) {
  return `<canvas class="rage-vfx rage-canvas" data-rage-side="${side}" aria-hidden="true"></canvas>`;
}
function rageGauge(side, name) {
  return `<section class="rage-gauge" data-gauge="${side}"><div class="rage-name"><strong>${esc(name)}</strong><span data-rage-label></span></div><div class="rage-track" role="meter" aria-label="${esc(name)}的游戏怒气" aria-valuemin="0" aria-valuemax="100"><div class="rage-fill"></div><div class="rage-segments"></div></div><div class="rage-meta"><span data-rage-count></span><b data-rage-value></b></div></section>`;
}
function mountRage() {
  stopRagePainters();
  if (state.page !== 'room') return;
  const stage = document.querySelector('.stage');
  stage.insertAdjacentHTML('beforebegin', `<div class="rage-hud">${rageGauge('self',state.name)}<div class="rage-versus">VS<small>LIVE</small></div>${rageGauge('partner',state.partnerName)}</div>`);
  stage.querySelectorAll('.video-tile').forEach((tile,i)=>tile.insertAdjacentHTML('beforeend',rageOverlay(i ? 'partner' : 'self')));
  stage.querySelectorAll('.rage-canvas').forEach(canvas => {
    const side = canvas.dataset.rageSide;
    const tile = canvas.closest('.video-tile');
    const video = tile.querySelector('video');
    let tracker;
    if (video) {
      const label = document.createElement('span');
      label.className = 'head-tracking-status';
      tile.append(label);
      tracker = new HeadTracker(video, label, () => state.effects && !state.paused && state.page === 'room');
      headTrackers.push(tracker);
    }
    ragePainters.push(new RagePainter(canvas, () => ({
      tier: Math.max(rageTier(side), Date.now() < rage.burstUntil[side] ? 1 : 0),
      burst: Date.now() < rage.burstUntil[side],
      enabled: state.effects && !state.paused && state.page === 'room',
      style: rage.vfxStyle[side],
      anchor: tracker ? tracker.anchor(canvas.clientWidth, canvas.clientHeight) : undefined
    })));
  });
  stage.insertAdjacentHTML('beforebegin', `<div class="vfx-style-picker" role="group" aria-label="选择自己的怒气特效"><span>我的气场</span><button type="button" data-vfx-style="purple">紫焰</button><button type="button" data-vfx-style="green">绿焰 · 高密度</button></div>`);
  document.querySelectorAll('[data-vfx-style]').forEach(button => button.onclick = () => setRageStyle(button.dataset.vfxStyle));
  if (state.sessionMode === 'demo') {
    stage.insertAdjacentHTML('beforebegin', '<div class="vfx-audition"><span>特效试映 · 仅示范局</span><button data-vfx-level="0">平静</button><button data-vfx-level="25">气场初现</button><button data-vfx-level="50">气焰增强</button><button data-vfx-level="100">满格爆气</button></div>');
    document.querySelectorAll('[data-vfx-level]').forEach(button => button.onclick = () => {
      if (state.paused) return;
      rage.self = rage.partner = Number(button.dataset.vfxLevel);
      rage.burstUntil.self = rage.burstUntil.partner = Date.now() + 1800;
      if (rage.self === 0) rage.burstUntil.self = rage.burstUntil.partner = 0;
      updateRage();
    });
  }
  stage.insertAdjacentHTML('afterend', `<details class="rage-lab"><summary>怒气规则与特效试验</summary><p>每两张嘲讽卡增加接收者 25 点；每两次独立声峰增加说话者 25 点。怒气控制 Unity 紫焰或绿色高密度气场的强度；满格爆气 1.8 秒。数值仅用于游戏，不代表真实情绪。</p><p>开启镜头后自动在本机检测头部，特效随位置、大小和倾斜变化；未找到人脸时淡出。未开镜头时为固定插画演示。不是全身分割。语言 AI 尚未接入，下方仅为手动文本规则试验，不监听或上传语音。</p>${state.sessionMode === 'demo' ? '<button type="button" data-rage-test="peak">模拟一次声音骤升</button><button type="button" data-rage-test="card">模拟收到一张嘲讽卡</button><button type="button" data-rage-test="reset">重置演示怒气</button>' : ''}<form id="rage-language"><label>手动测试疑似对抗表达<input name="utterance" maxlength="240" placeholder="例如：你从来都不听我说话" required></label><button>测试本地规则</button><output aria-live="polite"></output></form></details>`);
  document.querySelectorAll('[data-rage-test]').forEach(button=>button.onclick=()=>{
    if (state.paused) return;
    if (button.dataset.rageTest === 'peak') ragePeak();
    if (button.dataset.rageTest === 'card') countRageCard('self','hehe');
    if (button.dataset.rageTest === 'reset') { resetRage(); updateRage(); }
  });
  document.querySelector('#rage-language').onsubmit=event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const text=new FormData(form).get('utterance').trim();
    const key=text.replace(/[\s，。！？!?、]/g,'');
    const match=/你(总是|从来|永远)|都是你的错|你有病|你根本不在乎|这点事都做不好/.test(text);
    const output=form.querySelector('output');
    if (state.paused) { output.textContent='暂停中，不计入。'; return; }
    if (!state.ai) { output.textContent='AI 开关已关闭，不计入语言事件。'; return; }
    if (!match) { output.textContent='规则未命中；不代表这句话一定没有对抗性。'; return; }
    if (rage.seen.has(key)) { output.textContent='相同文本已测试，不重复累积。'; return; }
    rage.seen.add(key); addRage('self','手动规则试验命中（非 AI）');
    output.textContent='命中疑似绝对化或指责表达，演示怒气 +25。规则可能误判，非 AI 结论。';
  };
  updateRage();
}
function updateRage() {
  for (const side of ['self','partner']) {
    const tier=rageTier(side), active=Date.now()<rage.burstUntil[side];
    const gauge=document.querySelector(`[data-gauge="${side}"]`);
    if (gauge) {
      gauge.dataset.tier=tier;
      gauge.dataset.style=rage.vfxStyle[side];
      gauge.querySelector('[data-rage-label]').textContent=['平静','气场初现','气焰增强','MAX'][tier];
      gauge.querySelector('[data-rage-value]').textContent=`${rage[side]} / 100`;
      gauge.querySelector('[data-rage-count]').textContent=`收牌 ${rage.cards[side] % 2}/2${side==='self' ? ` · 声峰 ${rage.peaks % 2}/2` : ''}`;
      gauge.querySelector('.rage-fill').style.width=`${rage[side]}%`;
      gauge.querySelector('.rage-track').setAttribute('aria-valuenow',rage[side]);
    }
    const fx=document.querySelector(`[data-rage-side="${side}"]`);
    if(fx) { fx.dataset.tier=Math.max(tier,active ? 1 : 0); fx.dataset.style=rage.vfxStyle[side]; fx.classList.toggle('rage-burst',active&&tier===3); fx.hidden=!state.effects||state.paused; }
  }
  document.querySelectorAll('[data-vfx-style]').forEach(button => {
    const selected=button.dataset.vfxStyle===rage.vfxStyle.self;
    button.classList.toggle('active',selected); button.setAttribute('aria-pressed',selected);
  });
}
setInterval(()=>{ if(typeof state!=='undefined'&&state.page==='room') updateRage(); },150);
