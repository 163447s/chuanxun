/* ══════════════════════════════════════════════════════════
   core.js —— 数据层 / 工具 / 气泡渲染
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const KEY = 'chuanxun_v1';

  // 默认字卡：想改可以直接在抽屉里加/清空
  const DEFAULT_CARDS = [
    '想你了', '晚安', '过来', '别走', '在吗', '困了', '抱一下',
    '吃饭了吗', '冷不冷', '我等你', '别生气', '哈哈', '好', '嗯',
    '没事', '我陪你', '今天有点累', '看你一眼就走'
  ];

  const DEFAULT = {
    settings: {
      partnerName: '梦角',
      partnerAvatar: '梦',
      autoReply: true,
      replyDelayMin: 3,
      replyDelayMax: 8,
      apiBase: '',
      apiKey: '',
      apiModel: 'gpt-4o-mini'
    },
    cards: DEFAULT_CARDS.slice(),
    kana: [],
    chuan: [],
    chuanState: { step: 0, answers: null, info: null, cards: null, startedAt: 0 },
    chuanHistory: []
  };

  let DB = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
      const d = JSON.parse(raw);
      return Object.assign(JSON.parse(JSON.stringify(DEFAULT)), d, {
        settings: Object.assign({}, DEFAULT.settings, d.settings || {}),
        chuanState: Object.assign({}, DEFAULT.chuanState, d.chuanState || {})
      });
    } catch (e) {
      return JSON.parse(JSON.stringify(DEFAULT));
    }
  }

  let saveTimer = null;
  function save(now) {
    const write = () => { try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {} };
    if (now) { clearTimeout(saveTimer); write(); return; }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 400);
  }

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function fmtTime(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function fmtDay(ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + fmtTime(ts);
  }

  let toastTimer = null;
  function toast(msg, ms) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms || 2200);
  }

  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }

  /** 括号（中英文）染成传讯师旁白的淡紫色 */
  function decorate(text) {
    let s = esc(text);
    s = s.replace(/（[^）]*）|\([^)]*\)/g, m => '<span class="tone-aside">' + m + '</span>');
    return s;
  }

  function msgNode(m, isChuan) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (m.sender === 'me' ? 'me' : 'you') + (isChuan ? ' chuan' : '');
    wrap.dataset.id = m.id;

    const row = document.createElement('div');
    row.className = 'msg-row';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (m.kind === 'card') {
      bubble.innerHTML = '<span class="card-tag">字卡</span>' + decorate(m.text);
    } else {
      bubble.innerHTML = decorate(m.text);
    }
    row.appendChild(bubble);

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = fmtTime(m.ts);

    wrap.appendChild(row);
    wrap.appendChild(time);
    return wrap;
  }

  function renderList(container, list, isChuan) {
    container.innerHTML = '';
    list.forEach(m => container.appendChild(msgNode(m, isChuan)));
    container.scrollTop = container.scrollHeight;
  }

  function scrollBottom(container) {
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
  }

  function typingNode() {
    const d = document.createElement('div');
    d.className = 'msg you';
    d.id = 'typing-holder';
    d.innerHTML = '<div class="typing"><i></i><i></i><i></i></div>';
    return d;
  }

  window.Core = {
    get DB() { return DB; },
    save, $, esc, uid, fmtTime, fmtDay, toast, rand, pick,
    decorate, msgNode, renderList, scrollBottom, typingNode
  };
})();
