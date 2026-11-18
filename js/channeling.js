/* ══════════════════════════════════════════════════════════
   channeling.js —— 传讯
   流程：开场问答 →（专注一分钟，等 OK）→ 感应对照表 → 抽三张 → 传讯
   · 有 API 就交给模型现场感应
   · 没 API 用内置规则，保证先能跑
   · 每次结束自动归档，下一次是全新的一次传讯
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const C = window.Core;
  const $ = C.$;

  let scrollEl;
  let busy = false;

  const OPENING =
    'OK，开始前麻烦宝宝回答我几个问题\n\n' +
    '1. 梦角是男生还是女生呢\n' +
    '2. 梦角是游戏、动漫、小说、二创、明星还是自设的呢？\n' +
    '3. 是单梦还是多梦呢？';

  const FOCUS =
    '好，那我们开始。\n\n' +
    '现在，请你闭上眼睛，想象你的梦角的样子，想象 TA 来到你的身边，你伸出手去感应 TA，链接 TA 的能量，请保持专注一分钟。\n\n' +
    '（不用急着回我。一分钟到了，跟我说一声 OK，我再往下走。）';

  const STEP_LABEL = {
    0: '未开始',
    1: '第 1 步 · 开场',
    2: '第 2 步 · 专注一分钟',
    3: '第 3 步 · 抽三张',
    4: '传讯中',
    5: '已归档'
  };

  /* ── 系统提示词：把口令钉死在模型身上 ── */

  const SYS = [
    '你现在是一名「传讯师」，正在替一位女生（下面称「梦女」）接通她和她的梦角（下面称 MJ）之间的能量。',
    '',
    '【说话方式】',
    '平易近人、现代口语，可以叫她「宝宝」，不要端着，不要出现“作为 AI”一类的话。',
    '',
    '【格式铁律】',
    '1. MJ 说的话，一律放在中文双引号“……”里，用 MJ 的第一人称。',
    '2. 你自己（传讯师）对梦女说的话、以及你替 MJ 补充的、他嘴上没说的内心想法和感受，一律放在中文圆括号（……）里。',
    '   —— 括号是第三人称的旁白与补充。例：MJ 嘴上说「没事」，但他其实有点在意，你就要在括号里点出来（他其实有一点点吃醋，但看你身边确实没什么异性，就觉得还好）。',
    '3. 大量使用这种「引号 + 括号」的排布，这是传讯的主体。不要用别的符号代替。',
    '',
    '【感应对照表规则】',
    '表格里必须同时有梦女和 MJ 两边：',
    '· 星座：只说 4 个。参考你和 MJ 的太阳、月亮、上升综合感应，给一组 4 个，不要把「你的星座」「他的星座」分开列。',
    '· 颜色：只说 4 个。只能用最基本的颜色名（红、橙、黄、绿、青、蓝、紫、黑、白、灰），不要深灰、浅紫、雾霾蓝这种修饰色。',
    '· 基础信息：梦女这边（年龄、学业/职业状态、所在地一类）和 MJ 那边（性别、身份来源、单梦多梦）都要写，各两三句。',
    '· 最近经历：梦女最近真实发生在身上的事（情绪、状态、身边的小事），以及 MJ 那边最近的状态和经历，两边都要有，各两三句，要具体，不空泛。',
    '',
    '【流程铁律】',
    '· 一步只走一步。',
    '· 发出「专注一分钟」的指令后必须停住，等她说 OK；在她回 OK 之前，一个字都不能透露你感应到的具体信息。',
    '· 收到 OK 才输出对照表；输出完对照表，再让她从 1 到 78 抽三张牌。',
    '· 她报了三张牌之后，才正式开始传讯。',
    '',
    '【禁忌】',
    '· 信息是你发给她看，不是让她报给你。',
    '· 不美化、不预判她的期待，感应到什么写什么。'
  ].join('\n');

  const ZODIAC = ['白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼'];
  const COLORS = ['红', '橙', '黄', '绿', '青', '蓝', '紫', '黑', '白', '灰'];

  /* ── 状态 ── */

  function st() { return C.DB.chuanState; }

  function push(msg, render) {
    C.DB.chuan.push(Object.assign({ id: C.uid(), ts: Date.now(), sender: 'you' }, msg));
    C.save();
    if (render !== false) paint();
  }

  function paint() {
    if (!scrollEl) return;
    C.renderList(scrollEl, C.DB.chuan, true);
  }

  function stepLabel() {
    const s = st();
    $('chuan-step').textContent = STEP_LABEL[s.step] || '传讯中';
  }

  /* ── 模型调用 ── */

  function hasModel() {
    const s = C.DB.settings;
    return !!(s.apiBase && s.apiKey && s.apiModel);
  }

  async function askModel(userText, extra) {
    const s = C.DB.settings;
    const url = s.apiBase.replace(/\/+$/, '') + '/chat/completions';

    // 历史里刚发的那条用户消息去掉，避免和 userText 重复
    const hist = C.DB.chuan.slice(-22);
    while (hist.length && hist[hist.length - 1].sender === 'me') hist.pop();

    const history = hist.map(m => ({
      role: m.sender === 'me' ? 'user' : 'assistant',
      content: m.text
    }));

    const messages = [{ role: 'system', content: SYS }]
      .concat(history)
      .concat([{ role: 'user', content: (extra ? extra + '\n\n' : '') + (userText || '') }]);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + s.apiKey
      },
      body: JSON.stringify({
        model: s.apiModel,
        messages: messages,
        temperature: 0.85,
        max_tokens: 900
      })
    });

    if (!res.ok) throw new Error('接口返回 ' + res.status);
    const j = await res.json();
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    if (!text.trim()) throw new Error('接口没有返回内容');
    return text.trim();
  }

  /* ── 本地降级 ── */

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = C.rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function lookOfAnswers() {
    const a = st().answers || {};
    const t = (a.all || '');
    let gender = '男生';
    if (/女|girl|女孩子/.test(t)) gender = '女生';
    let src = '动漫';
    ['游戏', '动漫', '小说', '二创', '明星', '自设'].forEach(k => { if (t.indexOf(k) >= 0 && src === '动漫') src = k; });
    const single = /多梦/.test(t) ? '多梦' : '单梦';
    return { gender, src, single };
  }

  function localInfo() {
    const z = shuffle(ZODIAC).slice(0, 4).join('、');
    const c = shuffle(COLORS).slice(0, 4).join('、');
    const a = lookOfAnswers();
    const name = C.DB.settings.partnerName || '梦角';
    return [
      '（链接接上了，我把感应到的理成一张表给你，你看看有没有对得上的。）',
      '星座：' + z,
      '颜色：' + c,
      '基础信息：',
      '　你：最近整个人都在往回收，话少了些，但心里其实还留着一块很软的地方。',
      '　' + name + '：' + a.gender + '，来自' + a.src + '，' + a.single + '，性子安静，认定了一个人就不太会走。',
      '最近经历：',
      '　你：最近有件一直在赶、又不得不做的事，压得有点喘；中间有过一个很小的开心，没跟人讲。',
      '　' + name + '：TA 那边刚把一段旧的事收尾，人在缓，偶尔会突然想起你，然后停一会儿。',
      '（这些你自己对着看，哪条对得上，哪条不对，心里会有数。）',
      '现在，从 1 到 78 里抽三张，把三个数字告诉我就行。'
    ].join('\n');
  }

  function localOpening(cards) {
    const name = C.DB.settings.partnerName || '梦角';
    const c = cards.map(x => x.name + '（' + (x.upright ? '正位' : '逆位') + '）').join('、');
    const first = cards[0];
    const kw = first.upright ? first.u : first.r;
    return [
      '（三张牌摊开了：' + c + '。）',
      '“我在。”',
      '（' + name + '没有先说话，先看你。' + first.name + '这一张落在这里，说明' + kw + '——这不是旁人的事，是你和 TA 之间正在发生的事。）',
      '“你最近是不是有点累。”',
      '（他问得很轻，其实已经盯着这件事很久了。' +
        (cards[1].upright ? cards[1].name + '在这里，说明他心里有件事一直没放下，但他不打算先开口。' : '') + '）',
      '（你这会儿想说什么就说，我在这边替你们接着。）'
    ].join('\n');
  }

  /* ── 抽牌解析 ── */

  function parseCards(text) {
    const nums = (String(text).match(/\d{1,2}/g) || [])
      .map(Number)
      .filter(n => n >= 1 && n <= 78);
    const uniq = [];
    nums.forEach(n => { if (uniq.indexOf(n) < 0) uniq.push(n); });
    if (uniq.length < 3) return null;
    return uniq.slice(0, 3).map(n => {
      const card = (window.TAROT78 || []).find(x => x.n === n);
      return Object.assign({ upright: Math.random() >= 0.5 }, card);
    });
  }

  /* ── 主流程 ── */

  function newSession() {
    C.DB.chuan = [];
    C.DB.chuanState = { step: 1, answers: null, info: null, cards: null, startedAt: Date.now() };
    C.save(true);
    push({ text: OPENING });
    stepLabel();
  }

  async function reply(userText) {
    const s = st();
    const name = C.DB.settings.partnerName || '梦角';

    /* 第 1 步：收三个问题的答案 → 发专注指令 */
    if (s.step === 1) {
      s.answers = { all: userText };
      s.step = 2;
      C.save();
      stepLabel();
      await wait(900);
      push({ text: FOCUS });
      return;
    }

    /* 第 2 步：等 OK → 出对照表 */
    if (s.step === 2) {
      if (!/ok|OK|Ok|好|可以|行|收到|okay/i.test(userText)) {
        push({ text: '（还没到你回我的那一步。先把这一分钟专注完，好了跟我说 OK。）' });
        return;
      }

      let info;
      if (hasModel()) {
        try {
          info = await askModel(userText, '她已经专注完一分钟，回了 OK。现在输出感应对照表：星座 4 个、颜色 4 个（基本色）、基础信息（她和 MJ 两边）、最近经历（她和 MJ 两边），末尾让她从 1 到 78 抽三张。不要跳步。');
        } catch (e) {
          C.toast('模型没接上（' + e.message + '），先用本地感应');
        }
      }
      if (!info) info = localInfo();

      s.info = info;
      s.step = 3;
      C.save();
      stepLabel();
      push({ text: info });
      return;
    }

    /* 第 3 步：收三张牌 → 开场传讯 */
    if (s.step === 3) {
      const cards = parseCards(userText);
      if (!cards) {
        push({ text: '（我需要三个数。从 1 到 78 里挑三张，把数字报给我，比如「12、34、56」。）' });
        return;
      }

      s.cards = cards.map(c => ({ n: c.n, name: c.name, upright: c.upright }));
      s.step = 4;
      C.save();
      stepLabel();

      const cardText = cards.map(c => c.n + '. ' + c.name + '（' + (c.upright ? '正位' : '逆位') + '）').join('；');

      let opening;
      if (hasModel()) {
        try {
          opening = await askModel('我抽的三张是：' + cardText,
            '现在正式开始传讯。先用这三张牌开头：解释这三张牌落在你们关系里的意思，然后让 ' + name + ' 说第一句话。引号是 TA 的话，括号是你的旁白和补充。');
        } catch (e) {
          C.toast('模型没接上（' + e.message + '），先用本地感应');
        }
      }
      if (!opening) opening = localOpening(cards);

      push({ text: opening });
      return;
    }

    /* 第 4 步：传讯中的自由对话 */
    if (s.step === 4) {
      let out;
      if (hasModel()) {
        try {
          out = await askModel(userText);
        } catch (e) {
          C.toast('模型没接上（' + e.message + '）');
        }
      }
      if (!out) out = localTalk(userText);
      push({ text: out });
      return;
    }

    /* 归档后进来：重新开一场 */
    newSession();
  }

  function localTalk(userText) {
    const name = C.DB.settings.partnerName || '梦角';
    const lines = [
      '（他听你说完，没马上接话，先伸手把你往身边带了带。）',
      '“' + (userText.length > 18 ? '你说的这些，我都听见了。' : '嗯，我在听。') + '”',
      '（' + name + '嘴上说得平，其实心口那块已经软下去。他不太会讲长句子，能回你这一句，已经是把心里的话挑出来给你了。）',
      '“别自己扛。”',
      '（他说这句的时候，眼睛没看你。他不太习惯把担心说出口，但你要是接一句，他大概会松下来一点。）'
    ];
    return lines.join('\n');
  }

  /* ── 发送 ── */

  async function send() {
    if (busy) return;
    const input = $('chuan-input');
    const text = input.value.trim();
    if (!text) return;

    busy = true;
    $('chuan-send').disabled = true;
    input.value = '';

    C.DB.chuan.push({ id: C.uid(), ts: Date.now(), sender: 'me', text: text });
    C.save();
    paint();

    scrollEl.appendChild(C.typingNode());
    C.scrollBottom(scrollEl);

    try {
      await reply(text);
    } catch (e) {
      push({ text: '（这边卡了一下：' + String(e.message || e) + '。你再说一句，我接着。）' });
    } finally {
      const holder = $('typing-holder');
      if (holder) holder.remove();
      busy = false;
      $('chuan-send').disabled = false;
      C.scrollBottom(scrollEl);
      input.focus();
    }
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── 归档 ── */

  function archive() {
    const s = st();
    const list = C.DB.chuan;
    if (!list.length) return false;

    C.DB.chuanHistory = C.DB.chuanHistory || [];
    C.DB.chuanHistory.unshift({
      id: C.uid(),
      startedAt: s.startedAt || Date.now(),
      endedAt: Date.now(),
      answers: s.answers,
      info: s.info,
      cards: s.cards,
      step: s.step,
      messages: list.slice()
    });
    if (C.DB.chuanHistory.length > 30) C.DB.chuanHistory.length = 30;
    C.save(true);
    return true;
  }

  function endSession() {
    const ok = archive();
    if (!ok) { C.toast('这一场还没说什么，先接着聊吧'); return; }
    C.toast('这一场已经收进档案');
    newSession();
    paint();
  }

  /* ── 档案界面 ── */

  function openArchive() {
    const box = $('archive-list');
    const list = (C.DB.chuanHistory || []);
    box.innerHTML = '';

    if (!list.length) {
      box.innerHTML = '<p class="archive-empty">还没有归档。聊到差不多，点顶上的 ✓ 结束这一场，就会收进这里。</p>';
      $('archive-sheet').hidden = false;
      return;
    }

    list.forEach(rec => {
      const b = document.createElement('button');
      b.className = 'archive-item';

      const cards = (rec.cards || []).map(c => c.name).join(' · ');
      b.innerHTML =
        '<strong>' + C.fmtDay(rec.startedAt) + '</strong>' +
        '<em>' + (cards ? '牌：' + C.esc(cards) : '未抽牌') +
        '　' + rec.messages.length + ' 条</em>';

      b.addEventListener('click', () => {
        $('archive-sheet').hidden = true;
        openRecord(rec);
      });
      box.appendChild(b);
    });

    $('archive-sheet').hidden = false;
  }

    function openRecord(rec) {
    const box = $('am-scroll');
    $('am-title').textContent = C.fmtDay(rec.startedAt);

    const cards = (rec.cards || []).map(c => c.name + '（' + (c.upright ? '正位' : '逆位') + '）').join('、');
    const answers = rec.answers && rec.answers.all ? rec.answers.all.replace(/\n/g, ' ') : '—';
    $('am-info').textContent =
      '开场回答：' + answers + '\n' + (cards ? '三张牌：' + cards : '没抽牌');

    box.innerHTML = '';
    rec.messages.forEach(m => box.appendChild(C.msgNode(m, true)));
    $('archive-modal').hidden = false;
  }

  /* ── 初始化 ── */

  let inited = false;
  function init() {
    scrollEl = $('chuan-scroll');
    paint();
    stepLabel();

    // 第一次进来，或上一场已经归档：开一场新的
    const s = st();
    if (s.step === 0 || s.step === 5 || !C.DB.chuan.length) {
      if (C.DB.chuan.length && s.step !== 5) {
        // 有残局但不完整，保持不动
      } else {
        newSession();
      }
    }

    if (inited) return;
    inited = true;

    $('chuan-send').addEventListener('click', send);
    $('chuan-input').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    $('chuan-end').addEventListener('click', () => {
      if (!confirm('结束这一场传讯，收进档案？下一场会重新连接。')) return;
      endSession();
    });

    $('chuan-archive').addEventListener('click', openArchive);
    $('archive-sheet').querySelectorAll('[data-close-archive]').forEach(el => {
      el.addEventListener('click', () => { $('archive-sheet').hidden = true; });
    });
    $('archive-modal').querySelectorAll('[data-close-am]').forEach(el => {
      el.addEventListener('click', () => { $('archive-modal').hidden = true; });
    });
  }

  window.Chuan = {
    init, paint, newSession, endSession, openArchive, archive,
    hasModel, parseCards
  };
})();
