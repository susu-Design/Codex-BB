const app = document.querySelector('#app');
const modal = document.querySelector('#modal');

const desires = {
  understood: ['被理解', '希望对方先听懂我的感受'],
  apology: ['一句道歉', '希望对方承认这件事让我受伤'],
  agreement: ['一个约定', '希望这次能形成具体做法'],
  release: ['痛快说完', '今天不求答案，只想把不满说出来']
};

const cardDefs = [
  { id: 'speak', icon: '…', title: '我还没说完', sub: '把请求贴到自己的画面', limit: Infinity, heat: 6, effect: 'speech' },
  { id: 'hehe', icon: '呵', title: '呵呵', sub: '释放一枚冷笑贴纸', limit: 3, heat: 10, effect: 'hehe' },
  { id: 'question', icon: '?', title: '问号雨', sub: '让疑惑从天而降', limit: 3, heat: 12, effect: 'question' },
  { id: 'applause', icon: '啪', title: '掌声送给你', sub: '播放夸张的无声掌声', limit: 2, heat: 15, effect: 'applause' },
  { id: 'past', icon: '↶', title: '旧账登场', sub: '提交一条历史证据', limit: 2, heat: 18, effect: 'receipt' },
  { id: 'mark', icon: '✳', title: '这句记住', sub: '标记此刻，稍后复盘', limit: 2, heat: 8, effect: 'mark' },
  { id: 'pause', icon: 'Ⅱ', title: '中场休息', sub: '随时暂停，没有惩罚', limit: Infinity, heat: -16, effect: 'pause' }
];

const state = {
  page: 'home', topic: '为什么又不回消息？', name: '我', style: 'comic', ai: true,
  desire: 'understood', cam: false, voiceOn: false, muted: false, effects: true, paused: false,
  elapsed: 0, heat: 24, sparks: 0, events: [], cooldowns: {}, stageEffect: '',
  uses: {}, achievements: [], feedback: '', premiseFeedback: '', reviewed: false, deleted: false, started: false,
  sessionMode: 'demo', role: '', roomCode: '', connectionStatus: 'idle', partnerName: '伴侣', partnerCam: true, partnerMuted: false
};

let videoStream = null;
let audioStream = null;
let callStream = null;
let remoteStream = null;
let peer = null;
let dataConnection = null;
let mediaConnection = null;
let audioContext = null;
let analyser = null;
let voiceUsesCallStream = false;
let voiceFrame = null;
let loudSince = 0;
let lastAutoEffect = 0;
let clockTimer = null;
let countTimer = null;
let toastTimer = null;

const invitedRoom = new URLSearchParams(window.location.search).get('room');
if (/^[a-f0-9]{16}$/i.test(invitedRoom || '')) {
  state.page = 'setup';
  state.sessionMode = 'real';
  state.role = 'guest';
  state.roomCode = invitedRoom.toLowerCase();
}

const esc = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function person(other = false) {
  return `<svg class="person" viewBox="0 0 280 300" aria-label="${other ? '模拟伴侣' : '本人占位'}插画" role="img">
    <ellipse cx="140" cy="310" rx="120" ry="115" fill="${other ? '#657b68' : '#ee583e'}"/>
    <path d="M119 183h43v56q-22 18-43 0" fill="#d6a17e"/><ellipse cx="140" cy="130" rx="57" ry="76" fill="#e9bb94"/>
    ${other ? '<path d="M84 144Q47 38 134 34q86-3 63 126l-18-64q-64 8-82-24l-2 76" fill="#30372c"/><path d="M84 120q-30 70 3 104l22-13-9-72M189 114q37 86 2 112l-25-15 15-65" fill="#30372c"/>' : '<path d="M84 125Q51 46 108 44q35-39 77 5 36 8 17 78l-23-45q-46 20-75-4l-9 47" fill="#33372c"/>'}
    <path d="M107 127l16-3m34 0 16 4" stroke="#3d4031" stroke-width="3" fill="none"/><circle cx="116" cy="138" r="3" fill="#33372c"/><circle cx="164" cy="138" r="3" fill="#33372c"/><path d="m139 139-4 18h9m-18 16q15 ${other ? '10' : '-6'} 29 0" stroke="#9c624d" stroke-width="2.5" fill="none"/><path d="m114 225 26 28 28-28" stroke="#f4ebd7" stroke-width="3" fill="none"/>
  </svg>`;
}

function toast(message) {
  const target = document.querySelector('#toast');
  target.textContent = message;
  target.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => target.classList.remove('show'), 2600);
}

function time(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function header(step, title, desc, right = '') {
  return `<div class="section-head"><div><div class="step">${step}</div><h2>${title}</h2><p>${desc}</p></div>${right}</div>`;
}

function stopTracks(stream) {
  if (stream) stream.getTracks().forEach(track => track.stop());
}

function closeConnections() {
  const currentData = dataConnection;
  const currentCall = mediaConnection;
  const currentPeer = peer;
  dataConnection = null;
  mediaConnection = null;
  peer = null;
  if (currentData) currentData.close();
  if (currentCall) currentCall.close();
  if (currentPeer && !currentPeer.destroyed) currentPeer.destroy();
}

function stopMedia() {
  [...new Set([videoStream, audioStream, callStream])].forEach(stopTracks);
  stopTracks(remoteStream);
  if (audioContext) audioContext.close();
  cancelAnimationFrame(voiceFrame);
  closeConnections();
  videoStream = null;
  audioStream = null;
  callStream = null;
  remoteStream = null;
  audioContext = null;
  analyser = null;
  state.voiceOn = false;
  state.cam = false;
  state.muted = false;
  state.connectionStatus = 'idle';
}

function stopClock() {
  clearInterval(clockTimer);
  clearInterval(countTimer);
  clockTimer = null;
  countTimer = null;
}

function go(page) {
  if (state.page === 'room' && page !== 'room') stopClock();
  if ((state.page === 'room' || state.page === 'setup') && !['room', 'setup'].includes(page)) stopMedia();
  state.page = page;
  render();
  window.scrollTo(0, 0);
}

function render() {
  document.body.classList.toggle('cold', state.style === 'cold');
  app.innerHTML = ({ home, setup, room, report }[state.page] || home)();
  attachVideo();
  updateCooldowns();
}

function home() {
  return `<section class="hero"><div><div class="eyebrow">A LITTLE CONFLICT. A LOT OF LOVE.</div>
    <h1>与伴侣来一场<br><em>激情对骂。</em></h1>
    <p class="intro">有些话，值得大声说。<br>带上你的不满，进入双人专属吵架房间。<br>正常视频对话，随时释放一点戏剧效果。</p>
    <div class="actions"><button class="primary" data-go="setup">发起一场吵架 <span>↗</span></button><button class="secondary" data-action="quick">一键进入示范局 ↗</button></div>
    <div class="micro">双人视频 × 鼠标道具 × 声控特效 × AI 战报<br>真实通话 Beta · 音视频和互动通过 WebRTC 连接</div></div>
    <div class="hero-art"><span class="art-label">ONE ROOM. MANY WAYS TO REACT.</span><div class="bubble one">我还没说完！</div><div class="portrait a">${person()}<span class="portrait-label">PLAYER 01 / 有话要说</span></div><div class="portrait b">${person(true)}<span class="portrait-label">PLAYER 02 / 我也是</span></div><span class="versus">VS</span><span class="spark">✳</span><div class="bubble two">好，那我们展开说说。</div></div></section>
    <section class="feature-grid"><div class="feature"><span class="feature-num">01 /</span><div><h3>像普通会议一样进入</h3><p>两个人持续对话，不排队、不分回合。</p></div></div><div class="feature"><span class="feature-num">02 /</span><div><h3>鼠标出招，声音施法</h3><p>点击释放卡牌；声音强弱自动触发舞台反馈。</p></div></div><div class="feature"><span class="feature-num">03 /</span><div><h3>AI 记录重点，帮助复盘</h3><p>整理诉求和待办，找出隐形对抗，给出更清楚的说法。</p></div></div></section>`;
}

function setup() {
  const desireButtons = Object.entries(desires).map(([id, value]) => `<button class="desire ${state.desire === id ? 'selected' : ''}" data-desire="${id}"><strong>${value[0]}</strong><small>${value[1]}</small></button>`).join('');
  const joining = state.sessionMode === 'real' && state.role === 'guest';
  const callButton = joining
    ? '<button class="primary wide" data-action="join-real">接受邀请，进入真实通话 ↗</button>'
    : '<button class="primary wide" data-action="create-room">创建房间并生成邀请链接 ↗</button>';
  const roomNotice = joining
    ? `<div class="call-invite"><span>INVITATION RECEIVED</span><strong>你收到了一场吵架邀请</strong><small>房间 ${esc(state.roomCode.toUpperCase())} · 点击加入后才会申请摄像头和麦克风权限。</small></div>`
    : '<div class="notice">创建后会得到一条专属邀请链接。伴侣打开链接并同意设备权限后，即可真实通话。</div>';
  return `${header('01 / BEFORE THE ARGUMENT', joining ? '有人等你加入。' : '带着一个诉求上场。', joining ? '确认自己的称呼和诉求，再进入双人房间。' : '它会在会后公开。届时再看看，你真正争取到的是什么。')}
    <div class="setup"><section class="panel"><h3>本场战书 <span class="report-label">THE INVITATION</span></h3>
      ${roomNotice}
      <label class="field" for="name">怎么称呼你</label><input id="name" type="text" maxlength="20" value="${esc(state.name)}">
      <label class="field" for="topic">今天，想把哪件事说清楚？</label><input id="topic" type="text" maxlength="80" value="${esc(state.topic)}">
      <div class="chips">${['为什么又不回消息？', '周末到底听谁的？', '家务不是自动完成的。'].map(value => `<button class="chip" data-topic="${value}">${value}</button>`).join('')}</div>
      <label class="field">你的秘密诉求</label><div class="desire-grid">${desireButtons}</div>
      <label class="field">选择画风</label><div class="chips"><button class="chip ${state.style === 'comic' ? 'selected' : ''}" data-style="comic">✳ 漫画对线</button><button class="chip ${state.style === 'cold' ? 'selected' : ''}" data-style="cold">▤ 冷面会议</button></div>
      <label class="check"><input id="ai" type="checkbox" ${state.ai ? 'checked' : ''}><span>体验 AI 书记员<br><small>仅生成演示战报，不录音、不转写、不调用 AI。真实版需双方授权。</small></span></label>
      ${callButton}<button class="secondary wide" data-action="start-demo">单人示范局</button>
    </section><section class="panel"><h3>你的备战室</h3><div class="preview">${state.cam ? '<video class="local-video" autoplay muted playsinline></video>' : person()}<span class="preview-tag">${state.cam ? '本地摄像头预览' : '插画占位 · 摄像头未开启'}</span></div>
      <button class="secondary wide" data-action="camera">${state.cam ? '关闭本地摄像头' : '开启本地摄像头预览'}</button>
      <div class="secret-card"><span>仅你可见，直到战报公开</span><strong>${desires[state.desire][0]}</strong><p>${desires[state.desire][1]}</p></div>
      <div class="notice">真实通话会使用摄像头和麦克风。声音特效仍只读取你本地的音量，不识别说话内容。</div><p class="micro">推荐双方佩戴耳机。请只把邀请链接发给你的伴侣。</p></section></div>`;
}

function signal() {
  return '<span class="signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
}

function heatMeter() {
  const label = state.heat < 30 ? '低温陈述' : state.heat < 60 ? '观点升温' : state.heat < 85 ? '激情对线' : '已经很响了';
  return `<div class="heat-box"><div class="heat-copy"><span>舞台热度 · ${label}</span><b>${state.heat}</b></div><div class="heat-track"><i style="width:${state.heat}%"></i></div><small>只控制视觉强度，不代表愤怒、对错或关系质量。</small></div>`;
}

function effectMarkup() {
  const effects = {
    speech: '<div class="fx-sticker fx-speech">我还没说完</div>',
    hehe: '<div class="fx-sticker fx-hehe">呵呵</div>',
    question: '<div class="fx-rain">? ? ? ? ? ?</div>',
    applause: '<div class="fx-sticker fx-applause">掌声送给你</div>',
    receipt: '<div class="fx-receipt">旧账已送达<br><small>RECEIPT FOUND</small></div>',
    mark: '<div class="fx-sticker fx-mark">这句记住了</div>',
    voice: '<div class="fx-voice">正在输出</div>',
    impact: '<div class="fx-impact">!</div>',
    blast: '<div class="fx-blast">砰</div>'
  };
  return effects[state.stageEffect] || '';
}

function remaining(card) {
  if (card.limit === Infinity) return '不限次数';
  return `剩余 ${Math.max(0, card.limit - (state.uses[card.id] || 0))} 张`;
}

function eventHTML() {
  if (!state.events.length) return '<p>出牌后，双方行动会留在这里。</p>';
  return state.events.slice(-7).reverse().map(event => `<div class="event ${event.actor !== state.name ? 'partner-event' : ''}"><time>${time(event.at)}</time><b>${event.actor}</b> ${esc(event.text)}</div>`).join('');
}

function connectionCopy() {
  if (state.sessionMode !== 'real') return ['演示模式', 'SIMULATED'];
  const statuses = {
    opening: ['正在打开房间', 'CONNECTING'],
    waiting: ['等待伴侣加入', 'WAITING'],
    connecting: ['正在连接伴侣', 'CONNECTING'],
    connected: ['真实通话中', 'LIVE'],
    disconnected: ['伴侣已离开', 'DISCONNECTED'],
    error: ['连接失败', 'ERROR']
  };
  return statuses[state.connectionStatus] || ['准备连接', 'READY'];
}

function room() {
  const cardButtons = cardDefs.map(card => {
    const exhausted = card.limit !== Infinity && (state.uses[card.id] || 0) >= card.limit;
    return `<button class="game-card" data-card="${card.id}" ${exhausted ? 'disabled' : ''}><span class="card-icon">${card.icon}</span><strong>${card.title}</strong><small>${exhausted ? '本场已用完' : `${card.sub} · ${remaining(card)}`}</small></button>`;
  }).join('');
  const [connectionLabel, connectionCode] = connectionCopy();
  const realCall = state.sessionMode === 'real';
  const localVideo = state.cam ? '<video class="local-video" autoplay muted playsinline></video>' : person();
  const remoteVideo = remoteStream && state.partnerCam ? '<video class="remote-video" autoplay playsinline></video>' : person(true);
  const roomTools = realCall ? `<button class="secondary compact" data-action="copy-invite">复制邀请链接</button><span class="demo" id="clock">${time(state.elapsed)}</span>` : `<span class="demo" id="clock">${time(state.elapsed)}</span>`;
  return `${header('02 / THE ROOM IS YOURS', esc(state.topic), realCall ? `房间 ${esc(state.roomCode.toUpperCase())} · ${connectionLabel}` : '单人示范会议 · 随时说话，随时出招', roomTools)}
    <div class="room-layout"><section><div class="voice-reactor"><div><span>VOICE REACTOR / 声音反应器</span><strong>${state.voiceOn ? '正在听取本地音量' : '尚未启用'}</strong><small>${state.voiceOn ? '普通说话产生波纹，突然升高触发冲击线，持续高声触发爆炸。' : '点击开启后只检测声音强弱，不录音、不上传。'}</small></div><button class="secondary" data-action="voice">${state.voiceOn ? '关闭声音检测' : '开启声音检测'}</button><div class="voice-level"><i id="voice-level"></i></div></div>
    <div class="stage ${!state.effects || state.paused ? 'still' : ''} ${state.stageEffect ? `fx-${state.stageEffect}` : ''}" style="--heat:${state.heat}">
      <div class="video-tile">${state.paused ? person() : localVideo}<span class="tile-name">${esc(state.name)} · ${state.cam ? '本人' : '镜头已关'}</span><span class="tile-state">${state.muted ? '已静音' : realCall ? 'MIC ON' : '模拟音频'}</span>${signal()}</div>
      <div class="video-tile">${remoteVideo}<span class="tile-name">${esc(state.partnerName)} · ${remoteStream ? state.partnerCam ? '远程画面' : '镜头已关' : connectionLabel}</span><span class="tile-state ${state.connectionStatus === 'connected' ? 'live' : ''}">${state.partnerMuted && state.connectionStatus === 'connected' ? 'MUTED' : connectionCode}</span>${signal()}</div><span class="stage-vs">${state.style === 'cold' ? '讨论中' : 'VS'}</span><div class="stage-burst" aria-hidden="true">${'✦'.repeat(Math.ceil(state.heat / 20))}</div><div class="fx-layer" aria-live="polite">${effectMarkup()}</div></div>
      <div class="ribbon" id="ribbon">${realCall ? `${connectionLabel} · 卡牌与特效会同步给双方` : '模拟声音舞台 · 出牌会改变视觉热度'}</div>${heatMeter()}
      <div class="control-bar"><button class="control ${state.muted ? 'active' : ''}" data-action="mute">${state.muted ? '取消静音' : '通话静音'}${realCall ? '' : ' · 模拟'}</button><button class="control" data-action="camera">${state.cam ? '关闭镜头' : '开启镜头'}</button><button class="control" data-action="effects">特效 ${state.effects ? '开' : '关'}</button><button class="control" data-action="toggleAI">AI ${state.ai ? '示例已启用' : '已关闭'}</button><button class="control end" data-action="end">结束并复盘 ↗</button></div>
      <div class="cards-head"><h3>你的吵架卡组</h3><span>卡牌改变叙事，不决定输赢</span></div><div class="cards game-six">${cardButtons}</div>
    </section><aside class="side"><div class="report-label">ROOM NOTES / 本场动态</div><h3 style="margin-top:22px">AI 书记员，${state.ai ? '正在记录重点。' : '已关闭。'}</h3><p>秘密诉求：<b>${desires[state.desire][0]}</b><br>将在战报中公开。</p><div class="spark-count"><span>互动次数</span><b>${state.sparks}</b><small>卡牌与声控效果</small></div><div class="status-line">● ${realCall ? `${connectionLabel} · WebRTC` : '单机示范，不发送数据'}</div><div id="events">${eventHTML()}</div></aside></div>`;
}

function sessionMetrics() {
  const cardEvents = state.events.filter(event => cardDefs.some(card => card.id === event.type)).length;
  const marks = state.events.filter(event => event.type === 'mark').length;
  const pauses = state.events.filter(event => event.type === 'pause').length;
  return `<div class="metric-grid"><div><span>使用互动道具</span><b>${cardEvents} 次</b><i style="width:${Math.min(100, cardEvents * 18)}%"></i></div><div><span>标记重要片段</span><b>${marks} 次</b><i style="width:${Math.min(100, marks * 45)}%"></i></div><div><span>主动暂停</span><b>${pauses} 次</b><i style="width:${Math.min(100, pauses * 60)}%"></i></div></div><p class="micro">这里只汇总发生过的互动，不评价谁表现更好。</p>${marks || pauses ? '<div class="stamp">已记录复盘动作</div>' : '<div class="stamp">等待标记重点</div>'}`;
}

function achievements() {
  const earned = [];
  if (state.events.some(event => event.type === 'mark')) earned.push(['重点捕手', '至少标记了一句重要的话']);
  if (state.events.some(event => event.type === 'past')) earned.push(['档案管理员', '让一笔旧账正式登场']);
  if (state.events.some(event => event.type === 'hehe')) earned.push(['冷笑投放员', '精准释放了一枚呵呵']);
  if (state.events.some(event => event.type === 'question')) earned.push(['问号天气制造者', '让疑惑覆盖了整个会议室']);
  if (state.events.some(event => event.type === 'applause')) earned.push(['气氛组组长', '为对方送上了意味深长的掌声']);
  if (state.events.some(event => event.type === 'auto-blast')) earned.push(['声控施法者', '用声音亲自触发了漫画爆炸']);
  if (state.events.some(event => event.type === 'pause')) earned.push(['体面离场权', '使用暂停保护了选择权']);
  if (!earned.length) earned.push(['纯粹表达者', '没有使用任何特殊卡牌']);
  return earned.map(item => `<div class="badge"><span>✳</span><strong>${item[0]}</strong><small>${item[1]}</small></div>`).join('');
}

function conflictLens() {
  const topic = state.topic;
  if (topic.includes('回消息')) return {
    quote: '你怎么又不回消息？',
    pattern: '预设式责问',
    premises: ['你已经看到了消息', '你选择不回应', '这种情况反复发生'],
    need: '我等待回复时感到不安，希望知道你是否方便回应。',
    rewrite: '我等回复时有些不安。你当时方便看消息吗？以后忙的时候，能不能简单告诉我一声？'
  };
  if (topic.includes('周末')) return {
    quote: '周末为什么又得听你的？',
    pattern: '累积式归责',
    premises: ['过去一直由你决定', '我的偏好没有被考虑', '这次你也不会协商'],
    need: '我希望自己的周末安排也被纳入决定。',
    rewrite: '我也有想做的事。我们能不能先把两个人的安排都列出来，再一起决定？'
  };
  if (topic.includes('家务')) return {
    quote: '家务难道会自己做完吗？',
    pattern: '反问式指责',
    premises: ['你看见了家务却没有行动', '你默认我会承担', '提醒本身不应由我负责'],
    need: '我不想独自承担家务和提醒工作，希望分工更明确。',
    rewrite: '这周的家务主要落在我这里，我有些累。我们现在把各自负责的部分定下来好吗？'
  };
  return {
    quote: '你怎么不早说？',
    pattern: '预设式责问',
    premises: ['你早就知道这件事', '你有机会提前通知', '你没有通知是可避免的'],
    need: '我的安排受到了影响，希望以后能更早知道变化。',
    rewrite: '你是什么时候知道的？如果下次能提前告诉我，我就不会一直等着安排。'
  };
}

function conflictLensPanel() {
  const insight = conflictLens();
  const options = ['确有对抗', '只是询问', '缺少上下文'];
  return `<section class="panel conflict-lens"><span class="report-label">02 / HIDDEN CONFRONTATION</span><h3>隐形对抗提取 <small class="micro">模拟 AI · 候选</small></h3>
    <blockquote>“${esc(insight.quote)}”</blockquote>
    <div class="lens-status"><span>${insight.pattern}</span><small>不是意图判决，需要结合前后文与本人确认</small></div>
    <h4>这句话可能预设了</h4><div class="premise-list">${insight.premises.map((item, index) => `<div><b>0${index + 1}</b><span>${esc(item)}</span></div>`).join('')}</div>
    <div class="lens-row"><b>未明说的需求</b><span>${esc(insight.need)}</span></div>
    <div class="rewrite"><span>把判定改成可回答的问题</span><p>${esc(insight.rewrite)}</p></div>
    <p class="micro">固定演示文本，根据本场议题生成，不来自录音。实际识别需要结合前后文，并允许用户纠正结果。</p>
    <div class="chips">${options.map(value => `<button class="chip ${state.premiseFeedback === value ? 'selected' : ''}" data-premise-feedback="${value}">${value}</button>`).join('')}</div>
    ${state.premiseFeedback ? `<div class="feedback">当事人反馈：${esc(state.premiseFeedback)}。该反馈与模型解释并列保留。</div>` : ''}</section>`;
}

function report() {
  if (state.deleted) return `<section class="empty"><div class="step">RECORD DELETED</div><h2>本场记录，已清空。</h2><p>演示数据已从当前页面状态移除。</p><button class="primary" data-go="home">回到首页 ↗</button></section>`;
  const desire = desires[state.desire];
  const ownInputs = state.events.filter(event => event.actor === state.name && event.detail).map(event => esc(event.detail)).slice(0, 3);
  return `${header('03 / THE AFTERMATH', '本场结束，秘密诉求公开。', 'AI 已整理本场重点，你可以核对或修改结果。', `<button class="secondary" data-go="setup">另开一场 ↗</button>`)}
    <div class="reveal"><span>你带进房间的秘密诉求</span><strong>${desire[0]}</strong><p>${desire[1]}</p><small>对方的模拟诉求：希望自己的处境也被看见。</small></div>
    <div class="notice">${state.ai ? '当前 AI 内容与声音曲线由演示规则生成，不来自录音或真实模型。' : '本场未启用 AI，只显示互动记录与本场概览。'} 本场议题和卡牌记录来自你的选择。</div>
    <div class="report-grid"><div><section class="panel"><span class="report-label">01 / MEETING MINUTES</span><h3>本场纪要 ${state.ai ? '· 模拟 AI' : ''}</h3>
      <div class="summary-row"><b>争议事项</b><span>${esc(state.topic)}</span></div>
      <div class="summary-row"><b>${esc(state.name)} 的诉求</b><span>${desire[1]}${ownInputs.length ? `<br><em>本场提交：</em>${ownInputs.join('；')}` : ''}</span></div>
      <div class="summary-row"><b>对方的表达</b><span>希望自己的处境被看见，也不愿让沉默自动成为证据。<button class="quote" data-quote="partner">查看模拟原话 ↗</button></span></div>
      <div class="summary-row"><b>未决事项</b><span>${state.events.some(event => event.type === 'mark') ? '重要片段已经标记，但双方尚未确认具体做法。' : '双方仍在使用各自的解释，尚未形成共同版本。'}</span></div>
      <button class="secondary" data-action="review">${state.reviewed ? '已核对自己的摘要' : '核对自己的摘要'}</button>${state.reviewed ? '<div class="stamp">本人已阅</div>' : ''}</section>
      ${state.ai ? conflictLensPanel() : ''}
      <section class="panel"><span class="report-label">03 / CARD HISTORY</span><h3>那些被你标记的时刻</h3>${eventHTML()}</section>
      <section class="panel"><span class="report-label">04 / ACHIEVEMENTS</span><h3>本场趣味成就</h3><div class="badge-grid">${achievements()}</div></section></div>
      <div><section class="panel"><span class="report-label">05 / SESSION SUMMARY</span><h3>本场互动概览</h3>${sessionMetrics()}</section>
      ${state.ai ? `<section class="panel"><span class="report-label">06 / VOICE WEATHER</span><h3>声音天气图 <small class="micro">模拟曲线</small></h3><svg class="weather" viewBox="0 0 400 110" role="img" aria-label="模拟声音变化曲线"><path d="M0 25H400M0 55H400M0 85H400" stroke="#dedfd3" fill="none"/><path d="M0 80Q30 90 50 64T95 72 145 30 190 50 245 32 290 68 340 65 400 78" stroke="#ee5038" fill="none" stroke-width="3"/><path d="M0 90Q35 58 65 78T120 62 175 68 220 40 270 62 330 47 400 82" stroke="#7c8965" fill="none" stroke-width="2" stroke-dasharray="5 4"/></svg><div class="feedback"><strong>AI 推测 · 示例</strong><br>表达强度出现起伏，可能存在急切或激动。<br><span class="micro">声音不能确定一个人的真实感受。</span></div><p class="micro">你如何回应这个判断？</p><div class="chips">${['符合', '不符合', '不确定'].map(value => `<button class="chip ${state.feedback === value ? 'selected' : ''}" data-feedback="${value}">${value}</button>`).join('')}</div>${state.feedback ? `<div class="feedback">本人反馈：${esc(state.feedback)}。模型解释保留，你的异议也保留。</div>` : ''}</section>` : ''}
      <section class="panel"><h3>还有分歧，也可以结束。</h3><p class="micro">没有赢家。复盘也不是义务。</p><div class="report-actions"><button class="secondary" data-go="home">回到首页</button><button class="secondary" data-action="delete">删除本场记录</button></div></section></div></div>`;
}

function attachVideo() {
  const localVideo = app.querySelector('.local-video');
  const remoteVideo = app.querySelector('.remote-video');
  if (localVideo && (callStream || videoStream)) localVideo.srcObject = callStream || videoStream;
  if (remoteVideo && remoteStream) remoteVideo.srcObject = remoteStream;
}

function roomPeerId(code) {
  return `bb-couple-${code}`;
}

function generateRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function inviteUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', state.roomCode);
  return url.toString();
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteUrl());
    toast('邀请链接已复制，发给伴侣即可加入。');
  } catch (error) {
    modal.innerHTML = `<h2>邀请伴侣加入</h2><p>复制下面的链接发给伴侣：</p><input class="invite-input" value="${esc(inviteUrl())}" readonly><button class="secondary wide" data-action="close">关闭</button>`;
    modal.showModal();
  }
}

async function ensureCallMedia() {
  if (callStream && callStream.active) return callStream;
  stopTracks(videoStream);
  videoStream = null;
  try {
    callStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (videoError) {
    callStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    toast('摄像头不可用，已改为语音通话。');
  }
  videoStream = callStream;
  state.cam = callStream.getVideoTracks().length > 0;
  state.muted = false;
  return callStream;
}

function sendPeer(message) {
  if (dataConnection && dataConnection.open) dataConnection.send(message);
}

function sendSessionState() {
  sendPeer({ type: 'session', topic: state.topic, style: state.style, ai: state.ai, hostName: state.name });
}

function setTrackState() {
  if (!callStream) return;
  callStream.getAudioTracks().forEach(track => { track.enabled = !state.muted && !state.paused; });
  callStream.getVideoTracks().forEach(track => { track.enabled = state.cam && !state.paused; });
}

function applyPause(fromPartner = false) {
  state.paused = true;
  setTrackState();
  render();
  if (modal.open) modal.close();
  modal.innerHTML = `<div class="step">INTERMISSION</div><h2>${fromPartner ? `${esc(state.partnerName)}发起了中场休息。` : '先停一下，也没关系。'}</h2><p>双方的计时、镜头和麦克风已经暂停。暂停不扣分，也不需要提供理由。</p><button class="primary wide" data-action="resume">继续通话 ↗</button><button class="secondary wide" data-action="end">结束本场</button>`;
  modal.showModal();
}

function handlePeerData(message) {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'hello') {
    state.partnerName = String(message.name || '伴侣').slice(0, 20);
    if (state.role === 'host') sendSessionState();
    if (state.page === 'room') render();
    return;
  }
  if (message.type === 'session' && state.role === 'guest') {
    state.topic = String(message.topic || state.topic).slice(0, 80);
    state.style = message.style === 'cold' ? 'cold' : 'comic';
    state.ai = Boolean(message.ai);
    state.partnerName = String(message.hostName || state.partnerName).slice(0, 20);
    render();
    return;
  }
  if (message.type === 'card') {
    const text = String(message.text || '释放了一个互动').slice(0, 220);
    const cardType = String(message.cardType || 'remote');
    state.events.push({ text, type: cardType, actor: state.partnerName, detail: String(message.detail || '').slice(0, 160), at: Number(message.at) || state.elapsed });
    state.heat = Math.max(8, Math.min(96, Number(message.heat) || state.heat));
    state.sparks += 1;
    render();
    if (message.effect) triggerEffect(String(message.effect));
    if (cardType === 'pause') applyPause(true);
    return;
  }
  if (message.type === 'effect') {
    state.sparks += 1;
    if (message.text) addEvent(String(message.text).slice(0, 220), String(message.effectType || 'remote-effect'), state.partnerName);
    triggerEffect(String(message.effect || 'voice'));
    return;
  }
  if (message.type === 'control' && message.action === 'resume') {
    state.paused = false;
    setTrackState();
    if (modal.open) modal.close();
    render();
    toast(`${state.partnerName}恢复了通话。`);
    return;
  }
  if (message.type === 'control' && message.action === 'camera') {
    state.partnerCam = Boolean(message.enabled);
    render();
    return;
  }
  if (message.type === 'control' && message.action === 'mute') {
    state.partnerMuted = Boolean(message.muted);
    render();
    return;
  }
  if (message.type === 'control' && message.action === 'end') {
    toast(`${state.partnerName}结束了本场通话。`);
    stopClock();
    go('report');
  }
}

function wireDataConnection(connection) {
  if (dataConnection && dataConnection !== connection) dataConnection.close();
  dataConnection = connection;
  connection.on('open', () => {
    sendPeer({ type: 'hello', name: state.name });
    if (state.role === 'host') sendSessionState();
  });
  connection.on('data', handlePeerData);
  connection.on('close', () => {
    if (dataConnection !== connection) return;
    dataConnection = null;
    if (state.page === 'room' && state.sessionMode === 'real') {
      state.connectionStatus = 'disconnected';
      render();
    }
  });
  connection.on('error', () => toast('互动同步出现问题，音视频可能仍然可用。'));
}

function wireMediaConnection(connection) {
  if (mediaConnection && mediaConnection !== connection) mediaConnection.close();
  mediaConnection = connection;
  connection.on('stream', stream => {
    remoteStream = stream;
    state.connectionStatus = 'connected';
    render();
    toast(`${state.partnerName}已进入真实通话。`);
  });
  connection.on('close', () => {
    if (mediaConnection !== connection) return;
    mediaConnection = null;
    remoteStream = null;
    if (state.page === 'room' && state.sessionMode === 'real') {
      state.connectionStatus = 'disconnected';
      render();
    }
  });
  connection.on('error', () => {
    state.connectionStatus = 'error';
    render();
    toast('音视频连接失败，请重新打开邀请链接。');
  });
}

function openPeer(id) {
  return new Promise((resolve, reject) => {
    if (typeof window.Peer !== 'function') {
      reject(new Error('PeerJS unavailable'));
      return;
    }
    const nextPeer = id ? new window.Peer(id) : new window.Peer();
    peer = nextPeer;
    let opened = false;
    nextPeer.on('open', peerId => {
      opened = true;
      resolve(peerId);
    });
    nextPeer.on('connection', connection => wireDataConnection(connection));
    nextPeer.on('call', connection => {
      if (connection.metadata?.name) state.partnerName = String(connection.metadata.name).slice(0, 20);
      connection.answer(callStream);
      wireMediaConnection(connection);
    });
    nextPeer.on('disconnected', () => {
      if (state.page === 'room' && state.sessionMode === 'real' && !remoteStream) {
        state.connectionStatus = 'disconnected';
        render();
      }
    });
    nextPeer.on('error', error => {
      if (!opened) reject(error);
      state.connectionStatus = 'error';
      if (state.page === 'room') render();
      const unavailable = error?.type === 'peer-unavailable';
      toast(unavailable ? '房间暂时找不到，请确认发起者仍停留在房间中。' : '连接服务暂时不可用，请稍后重试。');
    });
  });
}

async function createRealRoom() {
  saveSetup();
  resetRoom();
  state.sessionMode = 'real';
  state.role = 'host';
  state.roomCode = generateRoomCode();
  state.connectionStatus = 'opening';
  try {
    await ensureCallMedia();
    state.page = 'room';
    render();
    await openPeer(roomPeerId(state.roomCode));
    state.connectionStatus = 'waiting';
    render();
    begin();
    modal.innerHTML = `<div class="step">ROOM READY</div><h2>房间已经打开。</h2><p>把邀请链接发给伴侣，并保持这个页面开启。对方进入后会自动出现在右侧。</p><input class="invite-input" value="${esc(inviteUrl())}" readonly><button class="primary wide" data-action="copy-invite">复制邀请链接 ↗</button><button class="secondary wide" data-action="close">留在房间等待</button>`;
    modal.showModal();
  } catch (error) {
    stopMedia();
    state.page = 'setup';
    state.connectionStatus = 'error';
    render();
    toast(error?.name === 'NotAllowedError' ? '需要摄像头或麦克风权限才能开始真实通话。' : '真实房间暂时无法创建，请检查网络后重试。');
  }
}

async function joinRealRoom() {
  saveSetup();
  resetRoom();
  state.sessionMode = 'real';
  state.role = 'guest';
  state.connectionStatus = 'connecting';
  try {
    await ensureCallMedia();
    state.page = 'room';
    render();
    await openPeer();
    const hostId = roomPeerId(state.roomCode);
    wireDataConnection(peer.connect(hostId, { reliable: true, metadata: { name: state.name } }));
    wireMediaConnection(peer.call(hostId, callStream, { metadata: { name: state.name } }));
    begin();
  } catch (error) {
    stopMedia();
    state.page = 'setup';
    state.connectionStatus = 'error';
    render();
    toast(error?.name === 'NotAllowedError' ? '需要摄像头或麦克风权限才能加入真实通话。' : '加入失败，请确认邀请仍然有效。');
  }
}

async function camera() {
  if (state.sessionMode === 'real' && callStream) {
    const videoTracks = callStream.getVideoTracks();
    if (!videoTracks.length) {
      toast('本次通话没有可用的摄像头。');
      return;
    }
    state.cam = !state.cam;
    setTrackState();
    sendPeer({ type: 'control', action: 'camera', enabled: state.cam });
    render();
    toast(state.cam ? '镜头已开启。' : '镜头已关闭。');
    return;
  }
  if (state.cam) {
    if (videoStream) videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
    state.cam = false;
    render();
    return;
  }
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    state.cam = true;
    render();
  } catch (error) {
    toast('无法开启摄像头，可以继续使用插画体验。');
  }
}

function stopVoice() {
  if (audioStream && !voiceUsesCallStream) audioStream.getTracks().forEach(track => track.stop());
  if (audioContext) audioContext.close();
  cancelAnimationFrame(voiceFrame);
  audioStream = null;
  voiceUsesCallStream = false;
  audioContext = null;
  analyser = null;
  state.voiceOn = false;
  loudSince = 0;
}

async function toggleVoice() {
  if (state.voiceOn) {
    stopVoice();
    render();
    toast('声音检测已关闭。');
    return;
  }
  try {
    if (state.sessionMode === 'real' && callStream) {
      audioStream = callStream;
      voiceUsesCallStream = true;
    } else {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      voiceUsesCallStream = false;
    }
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    audioContext.createMediaStreamSource(audioStream).connect(analyser);
    state.voiceOn = true;
    render();
    monitorVoice();
    toast('声音检测已开启：只分析本地音量。');
  } catch (error) {
    stopVoice();
    toast('未获得麦克风权限，鼠标卡牌仍可使用。');
  }
}

function triggerEffect(effect, type = '', record = false) {
  if (!state.effects || state.page !== 'room') return;
  state.stageEffect = effect;
  const stage = document.querySelector('.stage');
  if (stage) {
    [...stage.classList].filter(name => name.startsWith('fx-')).forEach(name => stage.classList.remove(name));
    stage.classList.add(`fx-${effect}`);
    const layer = stage.querySelector('.fx-layer');
    if (layer) layer.innerHTML = effectMarkup();
  }
  if (record) {
    const text = type === 'auto-blast' ? '持续高声触发漫画爆炸' : '声音升高触发冲击线';
    addEvent(text, type, state.name);
    if (state.sessionMode === 'real') sendPeer({ type: 'effect', effect, effectType: type, text });
  }
  setTimeout(() => {
    if (state.stageEffect !== effect) return;
    state.stageEffect = '';
    const currentStage = document.querySelector('.stage');
    if (currentStage) {
      currentStage.classList.remove(`fx-${effect}`);
      const layer = currentStage.querySelector('.fx-layer');
      if (layer) layer.innerHTML = '';
    }
  }, effect === 'blast' ? 1200 : 850);
}

function monitorVoice() {
  if (!analyser || !state.voiceOn) return;
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let total = 0;
  for (const value of data) {
    const normalized = (value - 128) / 128;
    total += normalized * normalized;
  }
  const rms = Math.sqrt(total / data.length);
  const level = Math.min(100, Math.round(rms * 420));
  const meter = document.querySelector('#voice-level');
  if (meter) meter.style.width = `${level}%`;
  const stage = document.querySelector('.stage');
  if (stage) stage.style.setProperty('--voice', level / 100);
  const now = Date.now();
  if (rms > 0.1) {
    if (!loudSince) loudSince = now;
    if (now - loudSince > 1500 && now - lastAutoEffect > 3000) {
      lastAutoEffect = now;
      loudSince = 0;
      state.heat = Math.min(96, state.heat + 9);
      state.sparks += 1;
      triggerEffect('blast', 'auto-blast', true);
    }
  } else {
    loudSince = 0;
  }
  if (rms > 0.14 && loudSince && now - loudSince < 350 && now - lastAutoEffect > 2600) {
    lastAutoEffect = now;
    state.heat = Math.min(96, state.heat + 5);
    triggerEffect('impact', 'auto-impact', true);
  } else if (rms > 0.045 && state.stageEffect === '' && now - lastAutoEffect > 850) {
    triggerEffect('voice');
  }
  voiceFrame = requestAnimationFrame(monitorVoice);
}

function saveSetup() {
  state.name = document.querySelector('#name')?.value.trim() || '我';
  state.topic = document.querySelector('#topic')?.value.trim() || '有些话，今天展开说说。';
  state.ai = document.querySelector('#ai')?.checked ?? state.ai;
}

function resetRoom() {
  state.events = [];
  state.uses = {};
  state.cooldowns = {};
  state.achievements = [];
  state.elapsed = 0;
  state.heat = 24;
  state.sparks = 0;
  state.feedback = '';
  state.premiseFeedback = '';
  state.reviewed = false;
  state.deleted = false;
  state.paused = false;
  state.stageEffect = '';
}

function startDemo() {
  saveSetup();
  resetRoom();
  state.sessionMode = 'demo';
  state.role = '';
  state.roomCode = '';
  state.connectionStatus = 'idle';
  state.partnerName = '模拟伴侣';
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('room');
  history.replaceState({}, '', cleanUrl);
  state.page = 'room';
  render();
  modal.innerHTML = '<div class="step">模拟伴侣已接受邀请</div><h2>会议室已经打开。</h2><p>正常对话，随时出牌。进入后可选择开启本地声音检测。</p><div class="count">3</div><button class="primary wide" data-action="skip">立即进入 ↗</button>';
  modal.showModal();
  let count = 3;
  countTimer = setInterval(() => {
    count -= 1;
    const target = modal.querySelector('.count');
    if (target) target.textContent = count;
    if (count <= 0) begin();
  }, 1000);
}

function begin() {
  clearInterval(countTimer);
  countTimer = null;
  if (modal.open) modal.close();
  if (clockTimer) return;
  clockTimer = setInterval(() => {
    if (!state.paused) {
      state.elapsed += 1;
      if (state.heat > 24 && state.elapsed % 4 === 0) state.heat -= 1;
    }
    const clock = document.querySelector('#clock');
    if (clock) clock.textContent = time(state.elapsed);
    updateCooldowns();
  }, 1000);
}

function updateCooldowns() {
  document.querySelectorAll('[data-card]').forEach(button => {
    const definition = cardDefs.find(card => card.id === button.dataset.card);
    const left = Math.ceil(((state.cooldowns[button.dataset.card] || 0) - Date.now()) / 1000);
    const exhausted = definition.limit !== Infinity && (state.uses[definition.id] || 0) >= definition.limit;
    button.disabled = left > 0 || exhausted;
    const small = button.querySelector('small');
    if (small) small.textContent = exhausted ? '本场已用完' : left > 0 ? `${left} 秒后可用` : `${definition.sub} · ${remaining(definition)}`;
  });
}

function addEvent(text, type, actor = state.name, detail = '') {
  state.events.push({ text, type, actor, detail, at: state.elapsed });
  const events = document.querySelector('#events');
  if (events) events.innerHTML = eventHTML();
  const ribbon = document.querySelector('#ribbon');
  if (ribbon) ribbon.textContent = `${actor}：${text}`;
}

function partnerReply(type) {
  const replies = {
    speak: '好，你先把这一段说完。',
    past: '我记得的版本不一样，但我愿意把它留在记录里。',
    mark: '收到，这句话会出现在战报里。',
    hehe: '你这个“呵呵”是什么意思？',
    question: '问题很多，我们先留在屏幕上。',
    applause: '谢谢这阵意味深长的掌声。'
  };
  setTimeout(() => {
    if (state.page !== 'room' || state.paused) return;
    addEvent(replies[type] || '我还在听。', `partner-${type}`, '对方');
    state.sparks += 1;
    render();
  }, 700);
}

function useCard(type, detail = '') {
  const definition = cardDefs.find(card => card.id === type);
  state.uses[type] = (state.uses[type] || 0) + 1;
  state.cooldowns[type] = Date.now() + (type === 'past' ? 12000 : 7000);
  state.heat = Math.max(8, Math.min(96, state.heat + definition.heat));
  state.sparks += 1;
  const messages = {
    speak: '我还没说完 · 请求 20 秒表达空间',
    hehe: '释放「呵呵」冷笑贴纸',
    question: '释放一场问号雨',
    applause: '把无声掌声送给对方',
    past: `旧账登场（本人提出）：${detail}`,
    mark: `这句记住 · 标记 ${time(state.elapsed)}`,
    pause: '中场休息 · 主动暂停本场'
  };
  addEvent(messages[type], type, state.name, detail);
  if (state.sessionMode === 'real') {
    sendPeer({ type: 'card', cardType: type, detail, text: messages[type], effect: definition.effect, heat: state.heat, at: state.elapsed });
  }
  toast(messages[type]);
  render();
  triggerEffect(definition.effect);
  if (state.sessionMode === 'demo' && type !== 'pause') partnerReply(type);
}

function card(type) {
  if (type === 'pause') {
    useCard('pause');
    applyPause(false);
    return;
  }
  if ((state.cooldowns[type] || 0) > Date.now()) return;
  const definition = cardDefs.find(item => item.id === type);
  if (definition.limit !== Infinity && (state.uses[type] || 0) >= definition.limit) return;
  if (type === 'past') {
    modal.innerHTML = `<h2>旧账，也要写清楚。</h2><p>它会标记为“本人提出”，而不是系统认定的事实。</p><textarea id="card-text" maxlength="160" aria-label="卡牌内容" placeholder="例如：上次你也没有提前告诉我。"></textarea><button class="primary wide" data-submit-card="past">召唤这笔旧账 ↗</button><button class="secondary wide" data-action="close">取消</button>`;
    modal.showModal();
    return;
  }
  useCard(type);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button, a.brand');
  if (!button) return;
  if (button.matches('a.brand')) { event.preventDefault(); go('home'); return; }
  if (button.dataset.go) { go(button.dataset.go); return; }
  if (button.dataset.topic) { document.querySelector('#topic').value = button.dataset.topic; return; }
  if (button.dataset.desire) { saveSetup(); state.desire = button.dataset.desire; render(); return; }
  if (button.dataset.style) { saveSetup(); state.style = button.dataset.style; render(); return; }
  if (button.dataset.card) { card(button.dataset.card); return; }
  if (button.dataset.submitCard) {
    const value = document.querySelector('#card-text').value.trim();
    if (!value) { toast('先写下一句话。'); return; }
    modal.close();
    useCard(button.dataset.submitCard, value);
    return;
  }
  if (button.dataset.feedback) { state.feedback = button.dataset.feedback; render(); return; }
  if (button.dataset.premiseFeedback) { state.premiseFeedback = button.dataset.premiseFeedback; render(); return; }
  if (button.dataset.quote) {
    modal.innerHTML = '<h2>模拟原话</h2><p>对方：“我不是故意不回应。我希望忙的时候，可以不用立刻证明我在乎。”</p><p>固定示例，不来自本次体验。</p><button class="secondary wide" data-action="close">关闭</button>';
    modal.showModal();
    return;
  }
  switch (button.dataset.action) {
    case 'quick': state.topic = '为什么又不回消息？'; state.desire = 'understood'; state.sessionMode = 'demo'; state.role = ''; go('setup'); toast('示范会议已准备好。'); break;
    case 'camera': if (state.page === 'setup') saveSetup(); camera(); break;
    case 'voice': toggleVoice(); break;
    case 'create-room': createRealRoom(); break;
    case 'join-real': joinRealRoom(); break;
    case 'start-demo': startDemo(); break;
    case 'copy-invite': copyInvite(); break;
    case 'skip': begin(); break;
    case 'mute': state.muted = !state.muted; setTrackState(); if (state.sessionMode === 'real') sendPeer({ type: 'control', action: 'mute', muted: state.muted }); render(); toast(state.sessionMode === 'real' ? state.muted ? '麦克风已静音。' : '麦克风已恢复。' : '示范局仅切换按钮状态。'); break;
    case 'effects': state.effects = !state.effects; render(); break;
    case 'toggleAI': state.ai = !state.ai; render(); toast(state.ai ? '会后显示模拟 AI 战报' : 'AI 已关闭，只记录游戏事件'); break;
    case 'resume': state.paused = false; setTrackState(); if (state.sessionMode === 'real') sendPeer({ type: 'control', action: 'resume' }); modal.close(); render(); toast('通话已恢复。'); break;
    case 'end': if (modal.open) modal.close(); if (state.sessionMode === 'real') sendPeer({ type: 'control', action: 'end' }); setTimeout(() => { stopClock(); go('report'); }, state.sessionMode === 'real' ? 120 : 0); break;
    case 'close': modal.close(); break;
    case 'review': state.reviewed = true; render(); break;
    case 'delete': modal.innerHTML = '<h2>删除本场记录？</h2><p>会清除当前 Demo 的卡牌记录和反馈。本演示没有服务器数据。</p><button class="primary wide" data-action="confirm-delete">确认删除</button><button class="secondary wide" data-action="close">取消</button>'; modal.showModal(); break;
    case 'confirm-delete': state.events = []; state.feedback = ''; state.premiseFeedback = ''; state.reviewed = false; state.deleted = true; modal.close(); render(); break;
  }
});

modal.addEventListener('cancel', event => {
  if (state.paused) { event.preventDefault(); toast('请选择继续体验或结束本场。'); }
});

window.addEventListener('pagehide', () => { stopClock(); stopMedia(); });
render();
