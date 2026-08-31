/*
 * sound.js — звук целиком синтезируется WebAudio, ни одного файла.
 * Контекст создаётся только после первого касания (политика автоплея),
 * и обязательно замолкает при сворачивании вкладки и на время рекламы.
 */
(function (root) {
  'use strict';

  var SE = (root.SE = root.SE || {});

  var ctx = null;
  var master = null;
  var muted = false;
  var suspended = false;
  var lastPlayAt = 0;

  function ensure() {
    if (ctx) return ctx;
    var Ctor = root.AudioContext || root.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function blip(opts) {
    if (muted || suspended) return;
    var c = ensure();
    if (!c) return;
    if (c.state === 'suspended' && c.resume) c.resume();

    /* защита от звуковой каши при быстрых тапах */
    var now = c.currentTime;
    if (now - lastPlayAt < 0.02) return;
    lastPlayAt = now;

    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'triangle';
    osc.frequency.setValueAtTime(opts.from, now);
    if (opts.to && opts.to !== opts.from) {
      osc.frequency.exponentialRampToValueAtTime(opts.to, now + opts.dur);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(opts.vol || 0.5, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + opts.dur + 0.02);
  }

  var API = {
    /* первое касание — разблокируем аудио */
    unlock: function () {
      var c = ensure();
      if (c && c.state === 'suspended' && c.resume) c.resume();
    },
    tap: function () { blip({ from: 420, to: 620, dur: 0.07, vol: 0.35 }); },
    coin: function () { blip({ from: 880, to: 1320, dur: 0.09, vol: 0.4 }); },
    buy: function () { blip({ from: 520, to: 780, dur: 0.13, vol: 0.5, type: 'square' }); },
    denied: function () { blip({ from: 220, to: 150, dur: 0.12, vol: 0.35, type: 'sawtooth' }); },
    unlockBiz: function () {
      blip({ from: 520, to: 1040, dur: 0.22, vol: 0.5 });
      root.setTimeout(function () { blip({ from: 780, to: 1560, dur: 0.25, vol: 0.45 }); }, 110);
    },
    prestige: function () {
      [0, 120, 240, 380].forEach(function (d, i) {
        root.setTimeout(function () {
          blip({ from: 523 * (1 + i * 0.25), to: 1046 * (1 + i * 0.25), dur: 0.3, vol: 0.45 });
        }, d);
      });
    },
    reward: function () {
      blip({ from: 660, to: 1320, dur: 0.18, vol: 0.5 });
      root.setTimeout(function () { blip({ from: 990, to: 1980, dur: 0.2, vol: 0.4 }); }, 130);
    },

    setMuted: function (v) {
      muted = !!v;
      if (muted && ctx && ctx.suspend) ctx.suspend();
      else if (!muted && !suspended && ctx && ctx.resume) ctx.resume();
    },
    isMuted: function () { return muted; },

    /* вкладку свернули или показывается реклама */
    suspend: function () {
      suspended = true;
      if (ctx && ctx.suspend) { try { ctx.suspend(); } catch (e) { /* ignore */ } }
    },
    resume: function () {
      suspended = false;
      if (!muted && ctx && ctx.resume) { try { ctx.resume(); } catch (e) { /* ignore */ } }
    }
  };

  SE.Sound = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
