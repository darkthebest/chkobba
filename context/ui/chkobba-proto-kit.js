/*
 * Shared plumbing for the direction 6+ prototypes. Load after chkobba-decks.js and chkobba-decks-2.js.
 * A direction page supplies only its look: ProtoKit.init({ defaultDeck, oc, home, table, summary, desk }).
 *
 * Page contract (same frames as direction 5):
 *   #deck select, #f-home #f-turn #f-chk #f-sum #f-desk frames, #b-reset #c-replay #d-round #d-game buttons.
 *   Each phone screen should contain one `.toast` element.
 * Interactions handled here: tap a hand card ([data-hand]) to open the capture choice, tap an option
 * ([data-opt]) to preview, tap again to confirm; [data-close] cancels; [data-emote] pops a bubble;
 * [data-act="deck"] on the home screen opens the in-app deck picker sheet; [data-act] anything else toasts.
 */
(function () {
  'use strict';
  var Decks = window.ChkobbaDecks;
  var K = window.ProtoKit = {};

  K.VAL = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, Q: 8, J: 9, K: 10 };
  K.SYM = { d: '♦', h: '♥', s: '♠', c: '♣' };
  K.C = function (id) { return { id: id, r: id.slice(0, -1), s: id.slice(-1) }; };
  K.lab = function (id) { var c = K.C(id); return c.r + K.SYM[c.s]; };
  K.glyph = function (s) {
    return s.replace(/[♦♥]/g, function (m) { return '<span class="gl r">' + m + '</span>'; })
      .replace(/[♠♣]/g, function (m) { return '<span class="gl k">' + m + '</span>'; });
  };
  K.P = {
    you: { n: 'You', team: 'us', role: 'You', i: 'Y' },
    amira: { n: 'Amira', team: 'us', role: 'Partner', i: 'A' },
    hedi: { n: 'Hédi', team: 'them', role: 'Rival', i: 'H' },
    karim: { n: 'Karim', team: 'them', role: 'Rival', i: 'K' },
  };
  K.OC = ['#F2B134', '#3FB58A', '#8E6CF0'];
  K.owned = { classic: 1, jumbo: 1, khatt: 1, fouta: 1 };

  var deckSel = 'default', theme = null;
  K.DK = function () { return deckSel === 'default' ? theme.defaultDeck : deckSel; };
  K.deckMeta = function () {
    var id = K.DK(), m = Decks.list.filter(function (d) { return d.id === id; })[0];
    return { meta: m, label: deckSel === 'default' ? m.name + ' (theme default)' : m.name };
  };

  K.optionsFor = function (card, tableIds) {
    var t = tableIds.map(K.C), same = t.filter(function (x) { return x.r === card.r; });
    if (same.length) return same.map(function (x) { return [x.id]; });
    var v = K.VAL[card.r], res = [];
    for (var m = 1; m < (1 << t.length); m++) {
      var sum = 0, ids = [];
      for (var i = 0; i < t.length; i++) if (m & (1 << i)) { sum += K.VAL[t[i].r]; ids.push(t[i].id); }
      if (sum === v) res.push(ids);
    }
    return res.sort(function (a, b) { return b.length - a.length; });
  };
  K.sumOf = function (o) { return o.reduce(function (a, id) { return a + K.VAL[K.C(id).r]; }, 0); };

  K.cardHTML = function (id, w, o) {
    o = o || {};
    var c = K.C(id), h = Decks.height(w);
    var cls = ['cw', o.hl && 'hl', o.dim && 'dim', o.pv && 'pv', o.sel && 'sel', o.fan && 'fan', o.extra].filter(Boolean).join(' ');
    var st = ['width:' + w + 'px', 'height:' + h + 'px', 'border-radius:' + Math.round(w * .1) + 'px', o.oc ? '--oc:' + o.oc : '',
      o.fan ? '--r:' + o.fan.r + 'deg;--y:' + o.fan.y + 'px' : ''].filter(Boolean).join(';');
    var badges = (o.badges || []).map(function (n) { return '<span class="badge" style="--oc:' + K.OC[n - 1] + '">' + n + '</span>'; }).join('');
    var face = Decks.face({ rank: c.r, suit: c.s.toUpperCase() }, K.DK(), w);
    return '<div class="' + cls + '" style="' + st + '" ' + (o.hand ? 'data-hand="' + id + '" role="button" tabindex="0"' : 'role="img"') +
      ' aria-label="' + c.r + ' of ' + K.SYM[c.s] + '">' + face + badges + (o.last ? '<span class="last">' + o.last + '</span>' : '') + '</div>';
  };
  K.backHTML = function (w) { return '<span class="bw">' + Decks.back(K.DK(), w) + '</span>'; };
  K.backs = function (n, w) { var s = ''; for (var i = 0; i < n; i++) s += K.backHTML(w || 20); return '<div class="bks">' + s + '</div>'; };

  var FAN3 = [{ r: -9, y: 14 }, { r: 0, y: 0 }, { r: 9, y: 14 }], FAN2 = [{ r: -5, y: 6 }, { r: 5, y: 6 }];
  K.handHTML = function (hand, me, sel, w) {
    var f = hand.length === 3 ? FAN3 : hand.length === 2 ? FAN2 : [{ r: 0, y: 0 }];
    return hand.map(function (id, i) { return K.cardHTML(id, w || 78, { fan: f[i], hand: me, sel: me && id === sel }); }).join('');
  };

  // Everything a table needs to draw the capture state for one config.
  K.tableData = function (cfg, w) {
    var sel = cfg.sel ? K.C(cfg.sel) : null, dockOpen = !!(cfg.myTurn && sel);
    var opts = dockOpen ? K.optionsFor(sel, cfg.table) : [];
    var badgeMap = {};
    opts.forEach(function (o, i) { o.forEach(function (id) { (badgeMap[id] = badgeMap[id] || []).push(i + 1); }); });
    var pv = cfg.preview != null && opts[cfg.preview] ? opts[cfg.preview] : null;
    var hl = {}; opts.forEach(function (o) { o.forEach(function (id) { hl[id] = 1; }); });
    var any = opts.length > 0;
    var cards = cfg.table.map(function (id) {
      return K.cardHTML(id, w || 46, {
        hl: hl[id] && !pv, pv: pv && pv.indexOf(id) >= 0,
        oc: pv ? K.OC[cfg.preview] : (badgeMap[id] ? K.OC[badgeMap[id][0] - 1] : null),
        dim: (any && !hl[id]) || (pv && pv.indexOf(id) < 0),
        badges: badgeMap[id] && (!pv || pv.indexOf(id) >= 0) ? badgeMap[id] : null,
        last: id === cfg.lastId ? cfg.lastBy : null,
      });
    }).join('');
    return { sel: sel, dockOpen: dockOpen, opts: opts, placeOnly: dockOpen && !opts.length, cards: cards };
  };

  // ---------- sample game (same state as directions 1-5) ----------
  K.TABLE = ['Ah', '3s', '5c', '4s', '7d', 'Kc', 'Kh'];
  K.turnCfg = function () {
    return { key: 'b', myTurn: true, turn: 'me', sel: 'Js', preview: null, anim: false, table: K.TABLE, hand: ['Js', '6c', '2h'], lastId: 'Kh', lastBy: 'Karim',
      counts: { top: 3, left: 3, right: 3 }, score: { us: 9, them: 6, chkUs: 0, chkThem: 1, pileUs: 14, pileThem: 11, round: 3, stock: 16 },
      log: { who: K.P.karim, prev: 'Hédi placed 3♠', text: 'Karim placed K♥' } };
  };
  K.chkCfg = function () {
    return { key: 'c', myTurn: false, turn: 'top', table: [], hand: ['6c', '2h'], chkobba: true, sweeper: 'Karim', sweepTeam: 'them', swept: ['4d', '5h', 'Js'],
      counts: { top: 2, left: 3, right: 2 }, score: { us: 9, them: 6, chkUs: 0, chkThem: 2, pileUs: 14, pileThem: 14, round: 3, stock: 16 }, waitText: 'Waiting for Amira',
      log: { who: K.P.karim, prev: 'Hédi placed 5♥', text: 'Karim took 4♦ + 5♥ with J♠' } };
  };
  K.sumCfg = function () {
    return { key: 'd', myTurn: false, turn: 'none', table: ['Ah', '5c'], hand: [], counts: { top: 0, left: 0, right: 0 },
      score: { us: 9, them: 6, chkUs: 1, chkThem: 1, pileUs: 22, pileThem: 18, round: 3, stock: 0 }, waitText: '',
      log: { who: K.P.hedi, prev: 'Last cards dealt', text: 'Hédi took 3♠ + 4♦ with 7♣' } };
  };
  K.deskCfg = function () {
    return { key: 'e', myTurn: true, turn: 'me', sel: 'Js', preview: null, table: K.TABLE, hand: ['Js', '6c', '2h'], lastId: 'Kh', lastBy: 'Karim',
      counts: { top: 3, left: 3, right: 3 }, score: { us: 9, them: 6, chkUs: 0, chkThem: 1, pileUs: 14, pileThem: 11, round: 3, stock: 16 },
      log: { who: K.P.karim, prev: 'Hédi placed 3♠', text: 'Karim placed K♥' } };
  };
  // [label, arabic, us detail, us pts, them detail, them pts]
  K.SUMMARY = [
    ['Carta', 'كارطة', '22 cards', 1, '18 cards', 0],
    ['Dineri', 'ديناري', '4 ♦', 0, '6 ♦', 1],
    ['Bermila', 'برميلة', '3×7 · 1×6', 1, '1×7 · 3×6', 0],
    ['Sabaa el Haya', 'سبعة الحيّة', '7♦', 1, 'no 7♦', 0],
    ['Chkobbas', 'شكبّة', '1 sweep', 1, '1 sweep', 1],
  ];
  K.totals = function (over) { return { roundUs: 4, roundThem: 2, us: over ? 22 : 13, them: over ? 15 : 8 }; };

  // ---------- in-app deck picker (home screen) ----------
  K.deckSheetHTML = function () {
    var tiles = Decks.list.map(function (d) {
      var on = d.id === K.DK(), owned = !d.premium || K.owned[d.id];
      var tag = on ? '<em class="eq">In use</em>' : owned ? '<em>' + (d.premium ? 'Owned' : 'Free') + '</em>' : '<em class="lock">◆ ' + d.price + '</em>';
      return '<button class="dtile' + (on ? ' on' : '') + '" data-deck="' + d.id + '" aria-pressed="' + on + '"><span class="dpair">' +
        Decks.back(d.id, 34) + Decks.face({ rank: '7', suit: 'D' }, d.id, 34) + '</span><b>' + d.name + '</b>' + tag + '</button>';
    }).join('');
    return '<div class="dscrim" data-sheet-close></div><div class="dsheet" role="dialog" aria-label="Choose your deck"><div class="dgrab"></div>' +
      '<div class="dhead"><b>Choose your deck</b><button data-sheet-close aria-label="Close">✕</button></div>' +
      '<p class="dsub">Decks are separate from the table theme. Locked decks preview free; credits are cosmetic only.</p>' +
      '<div class="dgrid">' + tiles + '</div></div>';
  };

  // ---------- mounting and events ----------
  var $ = function (id) { return document.getElementById(id); };
  var T, over = false;
  function mountHome() { $('f-home').innerHTML = theme.home(); }
  function mountTurn() { $('f-turn').innerHTML = theme.table(T); T.anim = false; }
  function mountChk() { $('f-chk').innerHTML = theme.table(K.chkCfg()); }
  function mountSum() {
    $('f-sum').innerHTML = theme.table(K.sumCfg());
    $('f-sum').querySelector('.screen').insertAdjacentHTML('beforeend', theme.summary(over));
    $('d-round').classList.toggle('on', !over); $('d-game').classList.toggle('on', over);
  }
  function mountDesk() { $('f-desk').innerHTML = theme.desk(K.deskCfg()); }
  function mountAll() { mountHome(); mountTurn(); mountChk(); mountSum(); mountDesk(); }
  K.toast = function (frame, msg) {
    var t = $(frame) && $(frame).querySelector('.toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 1700);
  };

  K.init = function (th) {
    theme = th;
    if (th.oc) K.OC = th.oc;
    T = K.turnCfg();

    $('f-turn').addEventListener('click', function (e) {
      if (e.target.closest('[data-emote]')) return;
      if (e.target.closest('[data-close]')) { T.sel = null; T.preview = null; mountTurn(); return; }
      var h = e.target.closest('[data-hand]'), o = e.target.closest('[data-opt]');
      if (h) { var opening = !T.sel; T.sel = h.dataset.hand; T.preview = null; T.anim = opening; mountTurn(); return; }
      if (!o) return;
      var v = o.dataset.opt;
      if (v === 'place') {
        T.sel = null; mountTurn(); K.toast('f-turn', 'Placed on the table');
        setTimeout(function () { T = K.turnCfg(); mountTurn(); }, 1500); return;
      }
      var i = +v;
      if (T.preview === i) {
        var names = K.optionsFor(K.C(T.sel), T.table)[i].map(K.lab).join(' + ');
        T.sel = null; T.preview = null; mountTurn(); K.toast('f-turn', 'Took ' + names);
        setTimeout(function () { T = K.turnCfg(); mountTurn(); }, 1700);
      } else { T.preview = i; mountTurn(); }
    });
    $('f-home').addEventListener('click', function (e) {
      var tile = e.target.closest('[data-deck]');
      if (tile) {
        var d = Decks.list.filter(function (x) { return x.id === tile.dataset.deck; })[0];
        deckSel = d.id; $('deck').value = d.id; mountAll();
        $('f-home').querySelector('.screen').insertAdjacentHTML('beforeend', K.deckSheetHTML());
        K.toast('f-home', d.premium && !K.owned[d.id] ? 'Previewing ' + d.name + ' · unlock for ◆ ' + d.price : d.name + ' equipped');
        return;
      }
      if (e.target.closest('[data-sheet-close]')) { mountHome(); return; }
      var a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.dataset.act === 'deck') $('f-home').querySelector('.screen').insertAdjacentHTML('beforeend', K.deckSheetHTML());
      else K.toast('f-home', a.dataset.act + '… (prototype)');
    });
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-hand],[data-act]')) { e.preventDefault(); e.target.click(); }
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-emote]');
      if (!b) return;
      var ph = b.closest('.phone,.desk');
      var p = document.createElement('div');
      p.className = 'pop'; p.innerHTML = b.dataset.emote + '<small>YOU</small>';
      ph.appendChild(p); setTimeout(function () { p.remove(); }, 1800);
    });
    $('b-reset').onclick = function () { T = K.turnCfg(); mountTurn(); };
    $('c-replay').onclick = mountChk;
    $('d-round').onclick = function () { over = false; mountSum(); };
    $('d-game').onclick = function () { over = true; mountSum(); };

    var sel = $('deck');
    var def = Decks.list.filter(function (d) { return d.id === th.defaultDeck; })[0];
    sel.innerHTML = '<option value="default">Theme default (' + def.name + ')</option>' +
      Decks.list.map(function (d) { return '<option value="' + d.id + '">' + d.name + (d.premium ? ' (premium)' : '') + '</option>'; }).join('');
    sel.onchange = function () { deckSel = sel.value; mountAll(); };
    mountAll();
  };

  // Card wrapper styles shared by every direction; themes restyle through the variables.
  var css = [
    '.cw{position:relative;flex:none;transition:transform .15s,opacity .15s,box-shadow .15s}',
    '.cw>.cdk{display:block;box-shadow:var(--card-shadow,0 2px 4px rgba(0,0,0,.25))}',
    '.cw.hl{box-shadow:0 0 0 2px var(--oc),0 0 12px 1px color-mix(in srgb,var(--oc) 55%,transparent)}',
    '.cw.pv{box-shadow:0 0 0 3px var(--oc),0 0 20px 3px color-mix(in srgb,var(--oc) 65%,transparent);transform:translateY(-4px)}',
    '.cw.dim{opacity:.35}',
    '.cw.fan{--r:0deg;--y:0px;transform:translateY(var(--y)) rotate(var(--r));transform-origin:50% 160%;cursor:pointer}',
    '.cw.fan:hover{transform:translateY(calc(var(--y) - 12px)) rotate(var(--r))}',
    '.cw.fan.sel{transform:translateY(calc(var(--y) - 22px)) rotate(var(--r));box-shadow:0 0 0 3px var(--sel,#F2B134);z-index:2}',
    '.cw .badge{position:absolute;top:-9px;right:-8px;min-width:22px;height:22px;border-radius:50%;background:var(--oc);color:var(--badge-ink,#111);font:800 12px/1 Inter,sans-serif;display:flex;align-items:center;justify-content:center;z-index:3;box-shadow:0 1px 3px rgba(0,0,0,.35)}',
    '.cw .badge+.badge{right:14px}',
    '.cw .last{position:absolute;left:-10px;right:-10px;bottom:-15px;text-align:center;font:700 9px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;color:var(--last,inherit)}',
    '.bks{display:flex;align-items:center}.bks .bw+.bw{margin-left:-12px}.bks .bw,.bks .bw>.cdk{display:block}',
    '.toast{position:absolute;left:50%;bottom:110px;transform:translate(-50%,20px);opacity:0;pointer-events:none;transition:.25s;z-index:80;white-space:nowrap;padding:9px 16px;border-radius:999px;font:600 13px Inter,sans-serif;background:rgba(0,0,0,.85);color:#fff}',
    '.toast.show{opacity:1;transform:translate(-50%,0)}',
    '.pop{position:absolute;left:50%;bottom:200px;transform:translateX(-50%);z-index:90;font:800 22px Inter,sans-serif;background:#fff;color:#111;padding:8px 14px;border-radius:16px;box-shadow:0 8px 20px rgba(0,0,0,.3);animation:pk-pop 1.8s ease forwards;text-align:center}',
    '.pop small{display:block;font-size:9px;letter-spacing:.12em;opacity:.6}',
    '@keyframes pk-pop{0%{opacity:0;transform:translate(-50%,10px) scale(.8)}12%{opacity:1;transform:translate(-50%,0) scale(1.05)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-30px)}}',
    '.dscrim{position:absolute;inset:0;background:rgba(0,0,0,.45);z-index:60}',
    '.dsheet{position:absolute;left:0;right:0;bottom:0;max-height:78%;overflow:auto;z-index:61;padding:8px 18px 26px;border-radius:24px 24px 0 0;background:var(--sheet-bg,#fff);color:var(--sheet-ink,#111);animation:pk-up .3s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes pk-up{from{transform:translateY(40%);opacity:0}}',
    '.dgrab{width:40px;height:4px;border-radius:2px;background:currentColor;opacity:.25;margin:0 auto 10px}',
    '.dhead{display:flex;align-items:center;justify-content:space-between}.dhead b{font-size:18px}',
    '.dhead button{border:0;background:none;color:inherit;font-size:16px;cursor:pointer;padding:6px}',
    '.dsub{font-size:12px;opacity:.7;margin:2px 0 12px}',
    '.dgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
    '.dtile{border:2px solid transparent;background:var(--tile-bg,rgba(0,0,0,.05));color:inherit;border-radius:14px;padding:10px 4px 8px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font:inherit}',
    '.dtile.on{border-color:var(--tile-on,#F2B134)}',
    '.dpair{display:flex;gap:3px;margin-bottom:2px}.dpair .cdk{box-shadow:0 1px 3px rgba(0,0,0,.25)}',
    '.dtile b{font-size:11px;line-height:1.2;text-align:center}',
    '.dtile em{font-style:normal;font-size:10px;font-weight:700;opacity:.7}.dtile em.eq{opacity:1;color:var(--tile-on,#F2B134)}.dtile em.lock{opacity:1}',
    '@media (prefers-reduced-motion:reduce){.cw,.dsheet,.pop,.toast{animation:none!important;transition:none!important}}',
  ].join('\n');
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
})();
