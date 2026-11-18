/* ══════════════════════════════════════════════════════════
   boot.js —— 视图切换、设置读写、启动
   ══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const C = window.Core;
  const $ = C.$;

  const VIEWS = ['home', 'kana', 'chuan'];

  function show(name) {
    VIEWS.forEach(v => { $('view-' + v).hidden = (v !== name); });
    document.body.style.overflow = 'hidden';

    if (name === 'kana' && window.Chat) window.Chat.init();
    if (name === 'chuan' && window.Chuan) window.Chuan.init();
  }

  /* ── 设置 ── */

  function bindSettings() {
    const s = C.DB.settings;

    $('set-name').value = s.partnerName || '';
    $('set-avatar').value = s.partnerAvatar || '';
    $('set-auto').checked = !!s.autoReply;
    $('set-api-base').value = s.apiBase || '';
    $('set-api-key').value = s.apiKey || '';
    $('set-api-model').value = s.apiModel || '';

    const saveSettings = () => {
      const s2 = C.DB.settings;
      s2.partnerName = ($('set-name').value || '').trim() || '梦角';
      s2.partnerAvatar = ($('set-avatar').value || '').trim().slice(0, 2) || '梦';
      s2.autoReply = $('set-auto').checked;
      s2.apiBase = ($('set-api-base').value || '').trim();
      s2.apiKey = ($('set-api-key').value || '').trim();
      s2.apiModel = ($('set-api-model').value || '').trim() || 'gpt-4o-mini';
      C.save(true);
      if (window.Chat) window.Chat.refreshIdentity();
    };

    ['set-name', 'set-avatar', 'set-auto', 'set-api-base', 'set-api-key', 'set-api-model'].forEach(id => {
      const el = $(id);
      el.addEventListener('input', saveSettings);
      el.addEventListener('change', saveSettings);
    });

    $('set-clear-chuan').addEventListener('click', () => {
      if (!confirm('把所有传讯档案删掉？这一场的对话也会一起清掉。')) return;
      C.DB.chuanHistory = [];
      C.DB.chuan = [];
      C.DB.chuanState = { step: 0, answers: null, info: null, cards: null, startedAt: 0 };
      C.save(true);
      if (window.Chuan) { window.Chuan.newSession(); window.Chuan.paint(); }
      C.toast('档案已清空');
    });
  }

  /* ── 启动 ── */

  function boot() {
    // 首页入口
    document.querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => show(btn.dataset.go));
    });

    // 返回
    document.querySelectorAll('[data-back]').forEach(btn => {
      btn.addEventListener('click', () => show(btn.dataset.back));
    });

    // 设置弹窗
    const modal = $('settings-modal');
    $('open-settings').addEventListener('click', () => { modal.hidden = false; });
    modal.querySelectorAll('[data-close-modal]').forEach(el => {
      el.addEventListener('click', () => { modal.hidden = true; });
    });

    bindSettings();
    show('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
