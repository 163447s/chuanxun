/* ══════════════════════════════════════════════════════════
   chat.js —— 字卡聊天
   · 挑一张字卡递过去
   · 对方延时回 1–2 条（从字卡库里随机）
   · 全部落 localStorage
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const C = window.Core;
  const $ = C.$;

  let scrollEl, emptyEl;
  let replyTimer = null;

  function list() { return C.DB.kana; }

  function paint() {
    const l = list();
    emptyEl.style.display = l.length ? 'none' : 'flex';
    C.renderList(scrollEl, l, false);
  }

  function add(msg) {
    C.DB.kana.push(Object.assign({ id: C.uid(), ts: Date.now() }, msg));
    C.save();
    paint();
  }

  /* ── 对方回字卡 ── */

  function partnerReply(count) {
    const cards = C.DB.cards.filter(c => String(c || '').trim());
    if (!cards.length) { C.toast('字卡库是空的，先去加几张'); return; }

    const n = count || (Math.random() < 0.45 ? 2 : 1);
    let delay = 0;

    scrollEl.appendChild(C.typingNode());
    C.scrollBottom(scrollEl);

    for (let i = 0; i < n; i++) {
      const s = C.DB.settings;
      const d = (s.replyDelayMin + Math.random() * Math.max(0.5, s.replyDelayMax - s.replyDelayMin)) * 1000;
      delay += d;
      setTimeout(() => {
        if (i === n - 1) {
          const holder = $('typing-holder');
          if (holder) holder.remove();
        }
        add({ sender: 'you', text: C.pick(cards), kind: 'card' });
      }, delay);
    }
  }

  /* ── 发消息 ── */

  function send(cardText) {
    const input = $('kana-input');
    const isCard = typeof cardText === 'string';
    const text = isCard ? cardText : input.value.trim();
    if (!text) return;

    add({ sender: 'me', text: text, kind: isCard ? 'card' : 'text' });
    if (!isCard) input.value = '';
    input.focus();

    if (C.DB.settings.autoReply) {
      clearTimeout(replyTimer);
      replyTimer = setTimeout(() => partnerReply(), 2600 + Math.random() * 2200);
    }
  }

  /* ── 字卡抽屉 ── */

  function paintCards() {
    const box = $('card-list');
    const cards = C.DB.cards.filter(c => String(c || '').trim());
    box.innerHTML = '';
    if (!cards.length) {
      box.innerHTML = '<p style="font-size:12px;color:#8a8178;margin:6px 2px">还没有字卡，点下面「加一张」。</p>';
      return;
    }
    cards.forEach(c => {
      const b = document.createElement('button');
      b.className = 'card-chip';
      b.textContent = c;
      b.addEventListener('click', () => {
        closeSheet();
        send(c);
      });
      box.appendChild(b);
    });
  }

  function openSheet() { $('card-sheet').hidden = false; paintCards(); }
  function closeSheet() { $('card-sheet').hidden = true; }

  /* ── 初始化 ── */

  let inited = false;
  function init() {
    scrollEl = $('kana-scroll');
    emptyEl = $('kana-empty');
    paint();
    refreshIdentity();
    if (inited) return;
    inited = true;

    $('kana-send').addEventListener('click', () => send());
    $('kana-input').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    $('kana-pick').addEventListener('click', openSheet);
    $('kana-cards-btn').addEventListener('click', openSheet);

    $('card-sheet').querySelectorAll('[data-close-sheet]').forEach(el => {
      el.addEventListener('click', closeSheet);
    });
    $('card-add').addEventListener('click', () => {
      const v = prompt('写一张新的字卡');
      if (!v || !v.trim()) return;
      C.DB.cards.push(v.trim());
      C.save();
      paintCards();
    });
    $('card-clear').addEventListener('click', () => {
      if (!confirm('把字卡库全部清空？')) return;
      C.DB.cards = [];
      C.save();
      paintCards();
    });
  }

  function refreshIdentity() {
    const s = C.DB.settings;
    $('kana-partner-name').textContent = s.partnerName || '梦角';
    $('kana-avatar').textContent = s.partnerAvatar || '梦';
  }

  window.Chat = { init, paint, refreshIdentity, add, partnerReply };
})();
