/* Players directory + player profile prototype.
   Zero dependencies, no build step, no network. Loaded by chkobba-users.html. */
(function () {
  'use strict';

  /* ---------------- icons ---------------- */
  var ICON = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    slash: '<circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/>',
    unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    userMinus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 12 0M17 11h5"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c5 0 9 4 9 6a12 12 0 0 1-3 3.4M6.3 6.4C3.9 8 2 10 2 12c0 2.4 4.6 6 10 6 1.4 0 2.7-.3 3.9-.7"/>',
    medal: '<circle cx="12" cy="14" r="5"/><path d="M8 3l2.5 5M16 3l-2.5 5"/>',
    cards: '<rect x="4" y="6" width="10" height="14" rx="2"/><path d="M9 4h9a2 2 0 0 1 2 2v11"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v2a3 3 0 0 0 4 3M16 6h4v2a3 3 0 0 1-4 3M12 13v4M8 21h8"/>',
    star: '<path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.9 6.6 19.8l1-6.1L3.2 9.4l6.1-.9z"/>',
    flame: '<path d="M12 3c4 5 6 7 6 10a6 6 0 0 1-12 0c0-2 1-3.5 3-5.5 0 2 1 3 2 3 0-3 1-5 1-7.5z"/>',
    table: '<rect x="3" y="9" width="18" height="9" rx="2"/><path d="M6 9V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>'
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || '') + '</svg>';
  }

  /* ---------------- strings ---------------- */
  var STR = {
    en: {
      back: 'Back', title: 'Players', ranking: 'Ranking', profile: 'Profile',
      search: 'Search players by name', unique: 'Every display name is unique.',
      searchHint: 'Type at least 2 characters.', searching: 'Searching…', results: 'results',
      recent: 'Recent players', recentSub: 'People you played at online tables',
      noResults: 'No player named {name}', nextStep: 'Check the spelling, or add them from a table you played at.',
      clear: 'Clear search', clearBtn: 'Search recent players',
      add: 'Add friend', request: 'Request sent', friends: 'Friends', blocked: 'Blocked',
      online: 'Online', room: 'In a room', playing: 'In a game', offline: 'Offline',
      unlisted: 'You are not listed in Players. Choose a name so you can be found.',
      chooseName: 'Choose a name', chooseNameToast: 'Name picker (prototype)',
      friendSince: 'Friends since', metAt: 'Met at a table',
      relRequest: 'Request sent', relFriend: 'You are friends', relBlocked: 'You blocked this player',
      met3: '3 days ago', metYesterday: 'yesterday', metWeek: 'last week', metMonth: 'last month',
      sinceSep: 'September 2026', sinceMar: 'March 2026',
      stats: 'Stats', sample: 'Sample stats', games: 'Games played', wins: 'Wins', chkobbas: 'Chkobba sweeps', streak: 'Best streak',
      invite: 'Invite to table', inviteOffline: 'Offline — can’t invite', cancelReq: 'Cancel request',
      remove: 'Remove friend', unblock: 'Unblock', block: 'Block', cancel: 'Cancel', close: 'Close', more: 'More options',
      blockTitle: 'Block {name}?', blockBody: 'They can’t send you friend requests. They’re removed from your friends and recent players, and their emotes are muted at the table.',
      removeTitle: 'Remove friend', removeBody: 'Remove {name} from your friends?', removeConfirm: 'Remove',
      inviteSent: 'Invite sent to', requestSent: 'Request sent to', accepted: 'They accepted (prototype)',
      reqCancelled: 'Request cancelled',
      removed: 'Removed from friends', unblocked: 'Unblocked', blockedToast: 'Blocked',
      findPlayers: 'Find players', findSub: 'Search by name. Names are unique.', newTag: 'New',
      friendsTitle: 'Friends', unchanged: 'The lists below are unchanged.',
      selectPlayer: 'Select a player', selectSub: 'Choose someone to see their profile and stats.',
      rowOpen: 'Open profile', openDir: 'Opens the Players directory', testBack: 'Back to lobby (prototype)',
      backProto: 'Back to the directory (prototype)', soon: 'Coming soon', soonBody: 'Players ranked by wins and chkobbas.'
    },
    aeb: {
      back: 'ارجع', title: 'اللاعبين', ranking: 'الترتيب', profile: 'البروفيل',
      search: 'قلّب على لاعب بالاسم', unique: 'كل اسم عندو لاعب واحد.',
      searchHint: 'اكتب زوز حروف على الأقل.', searching: 'قاعدين نقلّبو…', results: 'نتائج',
      recent: 'اللي لعبت معاهم', recentSub: 'لاعبين تلقيتهم في الطاولات على الإنترنت',
      noResults: 'ما فمّاش لاعب بالاسم هاذا', nextStep: 'شوف الكتابة، ولا زيدو من طاولة لعبت فيها.',
      clear: 'نحّي البحث', clearBtn: 'قلّب في اللي لعبت معاهم',
      add: 'زيدو صاحب', request: 'الطلب تبعث', friends: 'صحاب', blocked: 'مبلوكي',
      online: 'متّصل', room: 'في طاولة', playing: 'قاعد يلعب', offline: 'موش متّصل',
      unlisted: 'إنتي موش مسجّل في اللاعبين. اختار اسم باش يلقاوك.',
      chooseName: 'اختار اسم', chooseNameToast: 'اختيار الاسم (بروتوتايب)',
      friendSince: 'صحاب من', metAt: 'تعرّفتو في طاولة',
      relRequest: 'الطلب تبعث', relFriend: 'إنتوما صحاب', relBlocked: 'إنتي بلوكيت اللاعب هذا',
      met3: 'منذ 3 أيام', metYesterday: 'البارح', metWeek: 'الأسبوع اللي فات', metMonth: 'الشهر اللي فات',
      sinceSep: 'سبتمبر 2026', sinceMar: 'مارس 2026',
      stats: 'الأرقام', sample: 'أرقام تجريبية', games: 'مباريات', wins: 'ربحات', chkobbas: 'شكوبات', streak: 'أحسن سلسلة',
      invite: 'دعوة لطاولة', inviteOffline: 'موش متّصل — ما تنجمش تعيّطو', cancelReq: 'بطّل الطلب',
      remove: 'نحّي', unblock: 'نحّي البلوك', block: 'بلوكي', cancel: 'بطّل', close: 'سكّر', more: 'خيارات',
      blockTitle: 'تبلوكي {name}؟', blockBody: 'ما عادش ينجم يبعثلك طلبات صحبة. يتنحّى من صحابك ومن اللي لعبت معاهم، والإيموجي متاعو يتسكّت على الطاولة.',
      removeTitle: 'نحّي صاحب', removeBody: 'تحب تنحّي {name} من صحابك؟', removeConfirm: 'نحّي',
      inviteSent: 'الدعوة تبعثت لـ', requestSent: 'الطلب تبعث لـ', accepted: 'قبل الطلب (بروتوتايب)',
      reqCancelled: 'الطلب تبطّل',
      removed: 'تنحّى من صحابك', unblocked: 'تنحّى البلوك', blockedToast: 'تبلوكى',
      findPlayers: 'قلّب على لاعبين', findSub: 'قلّب بالاسم. كل اسم عندو لاعب واحد.', newTag: 'جديد',
      friendsTitle: 'الصحاب', unchanged: 'باقي القوايم كيف ما هوما.',
      selectPlayer: 'اختار لاعب', selectSub: 'اختار حد باش تشوف بروفيلو وأرقامو.',
      rowOpen: 'افتح البروفيل', openDir: 'افتح صفحة اللاعبين', testBack: 'ارجع للوبي (بروتوتايب)',
      backProto: 'ارجع للّيستة (بروتوتايب)', soon: 'قريب', soonBody: 'الترتيب بالربحات والشكوبات.'
    }
  };

  /* ---------------- sample data ---------------- */
  var PLAYERS = [
    { id: 'amira', name: 'Amira', avail: 'online', tint: 'teal', recent: true, met: 'met3', since: 'sinceSep' },
    { id: 'karim', name: 'Karim_7', avail: 'playing', tint: 'burgundy', recent: true, met: 'metYesterday', since: 'sinceSep' },
    { id: 'hedi', name: 'Hédi', avail: 'room', tint: 'ink', recent: true, met: 'met3', since: 'sinceSep' },
    { id: 'sami', name: 'Sami', avail: 'offline', tint: 'teal', recent: true, met: 'metWeek', since: 'sinceSep' },
    { id: 'youssef', name: 'Youssef', avail: 'online', tint: 'teal', recent: true, met: 'metMonth', since: 'sinceSep' },
    { id: 'nour', name: 'Nour', avail: 'offline', tint: 'burgundy', recent: false, met: 'metWeek', since: 'sinceMar' },
    { id: 'leila', name: 'Leïla', avail: 'online', tint: 'ink', recent: false, met: 'metWeek', since: 'sinceSep' },
    { id: 'ines', name: 'Ines', avail: 'room', tint: 'burgundy', recent: false, met: 'metMonth', since: 'sinceSep' },
    { id: 'mehdi', name: 'Mehdi', avail: 'offline', tint: 'ink', recent: true, met: 'metWeek', since: 'sinceMar' },
    { id: 'rania', name: 'Rania', avail: 'online', tint: 'teal', recent: true, met: 'met3', since: 'sinceSep' }
  ];
  var BY_ID = {};
  PLAYERS.forEach(function (p) { BY_ID[p.id] = p; });

  var state = {
    lang: 'en', tab: 'players', q: '', loading: false,
    phoneView: 'directory', profileId: null,
    rel: { amira: 'friend', karim: 'none', hedi: 'request', sami: 'none', nour: 'friend', leila: 'blocked', youssef: 'request', ines: 'none', mehdi: 'friend', rania: 'none' },
    unlisted: true, bOffline: false, menu: null, sheet: null, deskSelected: 'amira'
  };
  var loadTimer = null;
  var composing = false;

  /* ---------------- helpers ---------------- */
  function tr(key) {
    var v = STR[state.lang] && STR[state.lang][key];
    return v !== undefined ? v : (STR.en[key] !== undefined ? STR.en[key] : key);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nm(name) { return '<bdi dir="auto">' + esc(name) + '</bdi>'; }
  function fold(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function dirAttr() { return state.lang === 'aeb' ? 'rtl' : 'ltr'; }
  function langAttr() { return state.lang === 'aeb' ? 'aeb' : 'en'; }
  function initial(name) {
    var first = Array.from(String(name).trim())[0];
    return first === undefined ? '?' : first.toUpperCase();
  }
  function plain(html) { return String(html).replace(/<[^>]+>/g, ''); }
  function planksHTML(desk) {
    var xs = desk ? [10, 24, 38, 52, 66, 80, 92] : [70, 140, 210, 290, 350];
    return xs.map(function (x) { return '<div class="plank" style="inset-inline-start:' + x + (desk ? '%' : 'px') + '"></div>'; }).join('');
  }
  function statusbar() { return '<div class="statusbar"><span>9:41</span><i></i></div>'; }
  function homebar() { return '<div class="homebar"><b></b></div>'; }
  function toast(frame, msg) {
    var root = document.getElementById('f-' + frame);
    if (!root) return;
    var el = root.querySelector('.toast');
    if (!el) return;
    el.innerHTML = msg;
    el.classList.add('show');
    clearTimeout(el._h);
    el._h = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }

  function availHTML(p, override) {
    var a = override || p.avail;
    return '<span class="avail"><i class="dot ' + a + '"></i>' + tr(a) + '</span>';
  }
  function relLine(p, rel) {
    if (rel === 'friend') return tr('friendSince') + ' ' + tr(p.since);
    if (rel === 'request') return tr('relRequest');
    if (rel === 'blocked') return tr('relBlocked');
    return tr('metAt') + ' · ' + tr(p.met);
  }
  function chipHTML(p) {
    var rel = state.rel[p.id];
    if (rel === 'none') {
      return '<button type="button" class="chip add" data-add-rel="' + p.id + '" aria-label="' + esc(tr('add') + ': ' + p.name) + '">' + icon('plus') + tr('add') + '</button>';
    }
    if (rel === 'request') {
      return '<button type="button" class="chip req" data-accept-sim="' + p.id + '" title="' + esc(tr('accepted')) + '" aria-label="' + esc(tr('relRequest') + ': ' + p.name) + '">' + icon('clock') + tr('relRequest') + '</button>';
    }
    if (rel === 'friend') {
      return '<span class="chip fr">' + icon('check') + tr('friends') + '</span>';
    }
    return '<span class="chip blocked">' + icon('slash') + tr('blocked') + '</span>';
  }
  function rowHTML(p, opts) {
    opts = opts || {};
    if (opts.inert) {
      return '<div class="prow inert"><span class="medal t-' + p.tint + '"><span class="in">' + esc(initial(p.name)) + '</span></span>' +
        '<div class="pinfo"><span class="pname">' + nm(p.name) + '</span>' + availHTML(p) + '</div>' +
        '<span class="chip fr">' + icon('check') + tr('friends') + '</span></div>';
    }
    return '<div class="prow' + (opts.selected ? ' sel' : '') + '" role="button" tabindex="0" data-open-profile="' + p.id + '" aria-label="' + esc(tr('rowOpen') + ': ' + p.name) + '">' +
      '<span class="medal t-' + p.tint + '"><span class="in">' + esc(initial(p.name)) + '</span></span>' +
      '<div class="pinfo"><span class="pname">' + nm(p.name) + '</span>' + availHTML(p) + '</div>' +
      chipHTML(p) + '</div>';
  }

  /* ---------------- search ---------------- */
  function matches(q) {
    var nq = fold(q);
    return PLAYERS.filter(function (p) { return fold(p.name).indexOf(nq) === 0; }).slice(0, 8);
  }
  function recentPlayers() {
    return PLAYERS.filter(function (p) { return p.recent; }).slice(0, 5);
  }
  function listPanel(rows) { return '<div class="panel" style="margin:0 14px">' + rows + '</div>'; }
  function skeletonRows() {
    var row = '<div class="skelrow" aria-hidden="true"><span class="skel av"></span><span class="skel-lines"><span class="skel l1"></span><span class="skel l2"></span></span><span class="skel bt"></span></div>';
    return row + row + row;
  }
  function emptyInner(kind, q, side) {
    if (kind === 'short') {
      return '<span class="ic">' + icon('search') + '</span><h3>' + tr('searchHint') + '</h3><p>' + tr('unique') + '</p>';
    }
    var heading = tr('noResults');
    var named = heading.indexOf('{name}') !== -1;
    if (named) heading = heading.split('{name}').join(nm(q));
    return '<span class="ic">' + icon('search') + '</span><h3>' + heading + '</h3>' +
      (named ? '' : '<span class="q"><bdi dir="auto">' + esc(q) + '</bdi></span>') +
      '<p>' + tr('nextStep') + '</p>' +
      '<button type="button" class="btn ghost sm" data-clear="' + side + '">' + tr('clearBtn') + '</button>';
  }
  function phoneEmpty(kind, q) { return '<div class="panel state"><div class="empty">' + emptyInner(kind, q, 'phone') + '</div></div>'; }
  function soonPanel() {
    return '<div class="panel" style="margin:12px 14px 0"><div class="soon">' +
      '<span class="medalicon">' + icon('medal') + '</span><span class="badge">' + tr('soon') + '</span>' +
      '<h3>' + tr('ranking') + '</h3><p>' + tr('soonBody') + '</p></div></div>';
  }
  function phoneSearchBody() {
    var q = state.q.trim();
    if (state.tab === 'ranking') return soonPanel();
    if (q.length === 0) {
      var rec = recentPlayers();
      return '<div class="sect"><h2>' + tr('recent') + '</h2><small>' + tr('recentSub') + '</small></div>' +
        listPanel(rec.map(function (p) { return rowHTML(p); }).join(''));
    }
    if (q.length === 1) return phoneEmpty('short', q);
    if (state.loading) return '<div class="panel" style="margin:6px 14px 0">' + skeletonRows() + '</div><span class="sr-only" role="status">' + tr('searching') + '</span>';
    var m = matches(q);
    if (!m.length) return phoneEmpty('none', q);
    return '<div class="sect"><h2>' + tr('title') + '</h2><small>' + m.length + ' ' + tr('results') + '</small></div>' +
      listPanel(m.map(function (p) { return rowHTML(p); }).join(''));
  }
  function deskSearchBody() {
    var q = state.q.trim();
    if (q.length === 0) return recentPlayers().map(function (p) { return rowHTML(p, { selected: state.deskSelected === p.id }); }).join('');
    if (q.length === 1) return '<div class="empty">' + emptyInner('short', q, 'desk') + '</div>';
    if (state.loading) return skeletonRows() + '<span class="sr-only" role="status">' + tr('searching') + '</span>';
    var m = matches(q);
    if (!m.length) return '<div class="empty">' + emptyInner('none', q, 'desk') + '</div>';
    return m.map(function (p) { return rowHTML(p, { selected: state.deskSelected === p.id }); }).join('');
  }
  function deskHead() {
    var q = state.q.trim();
    if (state.tab === 'ranking') return '<h2>' + tr('ranking') + '</h2><small>' + tr('soon') + '</small>';
    if (q.length === 0) return '<h2>' + tr('recent') + '</h2><small>' + tr('recentSub') + '</small><span class="count">' + recentPlayers().length + '</span>';
    if (state.loading) return '<h2>' + tr('title') + '</h2><small>' + tr('searching') + '</small>';
    if (q.length === 1) return '<h2>' + tr('title') + '</h2><small>' + tr('searchHint') + '</small>';
    var n = matches(q).length;
    return '<h2>' + tr('title') + '</h2><small>' + n + ' ' + tr('results') + '</small><span class="count">' + n + '</span>';
  }

  /* ---------------- shared fragments ---------------- */
  function searchField(side) {
    return '<div class="search">' + icon('search', 'mag') +
      '<input data-input="' + side + '" value="' + esc(state.q) + '" placeholder="' + esc(tr('search')) + '" aria-label="' + esc(tr('search')) + '" dir="auto" autocomplete="off" spellcheck="false" />' +
      (state.q ? '<button type="button" class="clr" data-clear="' + side + '" aria-label="' + esc(tr('clear')) + '">' + icon('x') + '</button>' : '') +
      '</div>';
  }
  function tabsHTML() {
    var mk = function (v, label) {
      return '<button type="button" role="tab" aria-selected="' + (state.tab === v) + '" class="' + (state.tab === v ? 'on' : '') + '" data-tab="' + v + '">' + label + '</button>';
    };
    return '<div class="tabs" role="tablist" aria-label="' + esc(tr('title') + ' / ' + tr('ranking')) + '">' + mk('players', tr('title')) + mk('ranking', tr('ranking')) + '</div>';
  }
  function calloutHTML(extraStyle) {
    return '<div class="callout"' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' +
      '<span class="ci">' + icon('eyeOff') + '</span><p>' + tr('unlisted') + '</p>' +
      '<button type="button" class="act" data-choose-name>' + tr('chooseName') + '</button></div>';
  }

  function statsHTML() {
    var cells = [
      ['cards', 'games', 128],
      ['trophy', 'wins', 73],
      ['star', 'chkobbas', 41],
      ['flame', 'streak', 9]
    ];
    return '<div class="panel stats"><div class="stats-head"><h3>' + tr('stats') + '</h3><span class="sample">' + tr('sample') + '</span></div><div class="stat-grid">' +
      cells.map(function (c) {
        return '<div class="stat"><div class="v" dir="ltr">' + c[2] + '</div><div class="l">' + icon(c[0]) + tr(c[1]) + '</div></div>';
      }).join('') + '</div></div>';
  }
  function relPill(rel) {
    if (rel === 'friend') return '<span class="relpill">' + icon('check') + tr('relFriend') + '</span>';
    if (rel === 'blocked') return '<span class="relpill">' + icon('slash') + tr('relBlocked') + '</span>';
    return '';
  }
  function actionsHTML(p, rel, avail) {
    if (rel === 'none') {
      return '<div class="pactions"><button type="button" class="btn pri" data-add-profile="' + p.id + '">' + icon('plus') + tr('add') + '</button></div>';
    }
    if (rel === 'request') {
      return '<div class="pactions"><button type="button" class="btn stat" data-accept-sim="' + p.id + '" title="' + esc(tr('accepted')) + '">' + icon('clock') + tr('relRequest') + '</button>' +
        '<button type="button" class="btn ghost sm" data-cancel-request="' + p.id + '">' + tr('cancelReq') + '</button></div>';
    }
    if (rel === 'friend') {
      var online = avail === 'online';
      return '<div class="pactions"><button type="button" class="btn pri" data-invite="' + p.id + '"' + (online ? '' : ' disabled') + '>' + icon('table') + (online ? tr('invite') : tr('inviteOffline')) + '</button></div>';
    }
    return '<div class="pactions"><button type="button" class="btn pri" data-unblock="' + p.id + '">' + icon('unlock') + tr('unblock') + '</button></div>';
  }

  function menuHTML(p) {
    var items = '';
    if (state.rel[p.id] === 'friend') items += '<button type="button" data-menu-remove="' + p.id + '">' + icon('userMinus') + tr('remove') + '</button>';
    items += '<button type="button" class="danger" data-menu-block="' + p.id + '">' + icon('slash') + tr('block') + '</button>';
    return '<div class="menu-scrim" data-close-menu></div><div class="menu" role="menu" aria-label="' + esc(tr('more')) + '">' +
      '<div class="who">' + nm(p.name) + '</div>' + items + '</div>';
  }
  function sheetHTML(frame) {
    if (!state.sheet || state.sheet.frame !== frame) return '';
    var p = BY_ID[state.sheet.id];
    var type = state.sheet.type;
    var title = (type === 'block' ? tr('blockTitle') : tr('removeTitle')).split('{name}').join(nm(p.name));
    var body = (type === 'block' ? tr('blockBody') : tr('removeBody')).split('{name}').join(nm(p.name));
    return '<div class="sheetwrap" role="dialog" aria-modal="true" aria-label="' + esc(plain(title)) + '">' +
      '<div class="scrim" data-close-sheet></div><div class="sheet">' +
      '<button type="button" class="closex" data-close-sheet aria-label="' + esc(tr('close')) + '">' + icon('x') + '</button>' +
      '<h3>' + title + '</h3><p>' + body + '</p><div class="btns">' +
      '<button type="button" class="btn ghost" data-close-sheet>' + tr('cancel') + '</button>' +
      '<button type="button" class="btn danger" data-confirm-sheet>' + (type === 'block' ? tr('block') : tr('removeConfirm')) + '</button>' +
      '</div></div></div>';
  }

  /* ---------------- screens ---------------- */
  function directoryScreen() {
    var showSearch = state.tab === 'players';
    return '<div class="screen" dir="' + dirAttr() + '" lang="' + langAttr() + '">' + planksHTML(false) + statusbar() +
      '<div class="appbar"><button type="button" class="back" data-back-lobby aria-label="' + esc(tr('back')) + '">' + icon('back') + tr('back') + '</button>' +
      '<h1>' + tr('title') + '</h1></div>' +
      tabsHTML() +
      (state.unlisted && showSearch ? calloutHTML('') : '') +
      (showSearch ? '<div class="searchwrap">' + searchField('phone') + '</div>' +
        '<div class="hintline"><span>' + tr('unique') + '</span><span>' +
        (state.q.trim().length >= 2 && !state.loading ? matches(state.q.trim()).length + ' ' + tr('results') : '') + '</span></div>' : '') +
      '<div class="scroll">' + phoneSearchBody() + '</div>' +
      homebar() + '<div class="toast"></div></div>';
  }

  function profileScreen(frame, id) {
    var p = BY_ID[id];
    var rel = state.rel[id];
    var avail = frame === 'profile' && state.bOffline ? 'offline' : p.avail;
    var menu = state.menu === frame && rel !== 'blocked' ? menuHTML(p) : '';
    return '<div class="screen" dir="' + dirAttr() + '" lang="' + langAttr() + '">' + planksHTML(false) + statusbar() +
      '<div class="appbar"><button type="button" class="back" data-profile-back aria-label="' + esc(tr('back')) + '">' + icon('back') + tr('back') + '</button>' +
      '<h1>' + tr('profile') + '</h1>' +
      (rel !== 'blocked' ? '<button type="button" class="iconbtn" data-menu-open aria-label="' + esc(tr('more')) + '" aria-haspopup="menu">' + icon('dots') + '</button>' : '') +
      '</div>' +
      '<div class="scroll"><div class="phero">' +
      '<span class="medal xl t-' + p.tint + '"><span class="in">' + esc(initial(p.name)) + '</span></span>' +
      '<h2>' + nm(p.name) + '</h2>' + availHTML(p, avail) +
      '<div class="rel">' + relLine(p, rel) + '</div></div>' +
      relPill(rel) + statsHTML() + actionsHTML(p, rel, avail) +
      '<div class="profilefoot">' + tr('unique') + '</div></div>' +
      homebar() + '<div class="toast"></div>' + menu + sheetHTML(frame) + '</div>';
  }

  function friendsScreen() {
    var friends = [BY_ID.amira, BY_ID.nour, BY_ID.mehdi];
    var onlineCount = friends.filter(function (p) { return p.avail === 'online'; }).length;
    return '<div class="screen" dir="' + dirAttr() + '" lang="' + langAttr() + '">' + planksHTML(false) + statusbar() +
      '<div class="appbar"><button type="button" class="back" data-back-lobby aria-label="' + esc(tr('back')) + '">' + icon('back') + tr('back') + '</button>' +
      '<h1>' + tr('friendsTitle') + '</h1></div>' +
      '<div class="scroll">' +
      '<div class="entrycard" role="button" tabindex="0" data-find aria-label="' + esc(tr('findPlayers') + '. ' + tr('findSub')) + '">' +
      '<span class="eic">' + icon('search') + '</span><span class="et"><b>' + tr('findPlayers') + '</b><span>' + tr('findSub') + '</span></span>' +
      '<span class="tag">' + tr('newTag') + '</span>' + icon('chevron', 'chev') + '</div>' +
      '<div class="sect"><h2>' + tr('friends') + '</h2><small>' + friends.length + ' · ' + onlineCount + ' ' + tr('online') + '</small></div>' +
      '<div class="panel" style="margin:0 14px">' + friends.map(function (p) { return rowHTML(p, { inert: true }); }).join('') + '</div>' +
      '<div class="unchanged">' + tr('unchanged') + '</div></div>' +
      '<div class="cropfade"></div>' + homebar() + '<div class="toast"></div></div>';
  }

  function detailHTML() {
    var id = state.deskSelected;
    if (!id) {
      return '<div class="detail-empty"><span class="ic">' + icon('user') + '</span>' +
        '<h3>' + tr('selectPlayer') + '</h3><p>' + tr('selectSub') + '</p></div>';
    }
    var p = BY_ID[id];
    var rel = state.rel[id];
    return '<div class="dhero"><span class="medal xl t-' + p.tint + '"><span class="in">' + esc(initial(p.name)) + '</span></span>' +
      '<div class="dh"><h2>' + nm(p.name) + '</h2>' + availHTML(p) + '<div class="rel">' + relLine(p, rel) + '</div></div></div>' +
      relPill(rel) + statsHTML() + actionsHTML(p, rel, p.avail) +
      (rel !== 'blocked' ? '<button type="button" class="iconbtn" data-menu-open aria-label="' + esc(tr('more')) + '" aria-haspopup="menu">' + icon('dots') + '</button>' : '');
  }

  function deskScreen() {
    var solo = state.tab === 'ranking';
    var menu = state.menu === 'desk' && state.deskSelected && state.rel[state.deskSelected] !== 'blocked' ? menuHTML(BY_ID[state.deskSelected]) : '';
    return '<div class="desk-app" dir="' + dirAttr() + '" lang="' + langAttr() + '">' + planksHTML(true) +
      '<div class="desk-inner"><div class="desk-head">' +
      '<button type="button" class="back" data-back-lobby aria-label="' + esc(tr('back')) + '">' + icon('back') + tr('back') + '</button>' +
      '<h1>' + tr('title') + '</h1>' + tabsHTML() + '</div>' +
      (state.unlisted && !solo ? calloutHTML('max-width:720px;margin:14px 0 0') : '') +
      (!solo ? '<div class="desk-searchbox"><div class="searchwrap">' + searchField('desk') + '</div>' +
        '<div class="hintline"><span>' + tr('unique') + '</span><span>' +
        (state.q.trim().length >= 2 && !state.loading ? matches(state.q.trim()).length + ' ' + tr('results') : '') + '</span></div></div>' : '') +
      '<div class="desk-cols"' + (solo ? ' style="grid-template-columns:1fr"' : '') + '>' +
      (solo
        ? '<section class="panel"><div class="soon" style="padding-top:90px"><span class="medalicon">' + icon('medal') + '</span><span class="badge">' + tr('soon') + '</span><h3>' + tr('ranking') + '</h3><p>' + tr('soonBody') + '</p></div></section>'
        : '<section class="panel list-panel"><div class="list-head">' + deskHead() + '</div><div class="list-body">' + deskSearchBody() + '</div></section>' +
          '<section class="panel detail-panel">' + detailHTML() + '</section>') +
      '</div></div><div class="toast"></div>' + menu + sheetHTML('desk') + '</div>';
  }

  /* ---------------- mount ---------------- */
  function renderTools() {
    var rel = state.rel.amira;
    var on = function (v) { return rel === v ? ' class="on"' : ''; };
    document.getElementById('dir-tools').innerHTML =
      '<button type="button" data-tool="unlisted" class="' + (state.unlisted ? 'on' : '') + '">Unlisted callout: ' + (state.unlisted ? 'on' : 'off') + '</button>' +
      '<button type="button" data-tool="reset">Reset directory</button>';
    document.getElementById('profile-tools').innerHTML =
      '<button type="button" data-tool="rel" data-v="none"' + on('none') + '>Add friend</button>' +
      '<button type="button" data-tool="rel" data-v="request"' + on('request') + '>Request</button>' +
      '<button type="button" data-tool="rel" data-v="friend"' + on('friend') + '>Friends</button>' +
      '<button type="button" data-tool="rel" data-v="blocked"' + on('blocked') + '>Blocked</button>' +
      '<button type="button" data-tool="offline" class="' + (state.bOffline ? 'on' : '') + '">Offline: ' + (state.bOffline ? 'on' : 'off') + '</button>' +
      '<button type="button" data-tool="menu">Overflow menu</button>' +
      '<button type="button" data-tool="sheet" data-v="block">Block sheet</button>' +
      '<button type="button" data-tool="sheet" data-v="remove">Remove sheet</button>';
    document.getElementById('desk-tools').innerHTML =
      '<button type="button" data-tool="unlisted" class="' + (state.unlisted ? 'on' : '') + '">Unlisted callout: ' + (state.unlisted ? 'on' : 'off') + '</button>' +
      '<button type="button" data-tool="clear-selected">Clear selection</button>' +
      '<button type="button" data-tool="desk-reset">Reset</button>';
  }

  function mount() {
    var active = document.activeElement;
    var focusKey = active && active.matches && active.matches('[data-input]') ? active.dataset.input : null;
    var caret = focusKey && typeof active.selectionStart === 'number' ? active.selectionStart : null;

    var dir = document.getElementById('f-dir');
    if (state.phoneView === 'profile' && state.profileId) {
      dir.innerHTML = profileScreen('dir', state.profileId);
    } else {
      dir.innerHTML = directoryScreen();
    }
    document.getElementById('f-profile').innerHTML = profileScreen('profile', 'amira');
    document.getElementById('f-friends').innerHTML = friendsScreen();
    document.getElementById('f-desk').innerHTML = deskScreen();
    renderTools();

    if (focusKey) {
      var input = document.querySelector('[data-input="' + focusKey + '"]');
      if (input) {
        input.focus();
        try { input.setSelectionRange(caret, caret); } catch (e) { /* not all inputs support it */ }
      }
    }
  }

  function setQuery(value) {
    state.q = value;
    clearTimeout(loadTimer);
    if (value.trim().length >= 2) {
      state.loading = true;
      loadTimer = setTimeout(function () { state.loading = false; mount(); }, 480);
    } else {
      state.loading = false;
    }
    mount();
  }
  function resetDirectory() {
    state.q = '';
    state.loading = false;
    state.tab = 'players';
    state.phoneView = 'directory';
    state.profileId = null;
    state.menu = null;
    state.sheet = null;
    clearTimeout(loadTimer);
  }

  /* ---------------- events ---------------- */
  document.getElementById('lang').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    state.lang = b.dataset.v;
    Array.prototype.forEach.call(document.querySelectorAll('#lang button'), function (x) { x.classList.toggle('on', x === b); });
    mount();
  });
  document.getElementById('width').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    document.body.dataset.width = b.dataset.v;
    Array.prototype.forEach.call(document.querySelectorAll('#width button'), function (x) { x.classList.toggle('on', x === b); });
  });

  // Re-rendering on every keystroke must not break an IME composition (Arabic input).
  document.addEventListener('compositionstart', function () { composing = true; });
  document.addEventListener('compositionend', function (e) {
    composing = false;
    var input = e.target.closest && e.target.closest('[data-input]');
    if (input) setQuery(input.value);
  });
  document.addEventListener('input', function (e) {
    if (composing) return;
    var input = e.target.closest('[data-input]');
    if (input) setQuery(input.value);
  });

  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-open-profile],[data-find]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  document.addEventListener('click', function (e) {
    var tool = e.target.closest('[data-tool]');
    if (tool) {
      var kind = tool.dataset.tool;
      if (kind === 'unlisted') { state.unlisted = !state.unlisted; mount(); }
      else if (kind === 'reset') { resetDirectory(); mount(); }
      else if (kind === 'rel') { state.rel.amira = tool.dataset.v; state.menu = null; state.sheet = null; mount(); }
      else if (kind === 'offline') { state.bOffline = !state.bOffline; mount(); }
      else if (kind === 'menu') { state.menu = state.menu === 'profile' ? null : 'profile'; mount(); }
      else if (kind === 'sheet') { state.sheet = { type: tool.dataset.v, id: 'amira', frame: 'profile' }; state.menu = null; mount(); }
      else if (kind === 'clear-selected') { state.deskSelected = null; state.menu = null; mount(); }
      else if (kind === 'desk-reset') { state.deskSelected = 'amira'; state.q = ''; state.loading = false; clearTimeout(loadTimer); mount(); }
      return;
    }

    var host = e.target.closest('.phone, .desk');
    if (!host) return;
    var frame = host.id.slice(2);
    var t = e.target;

    var tab = t.closest('[data-tab]');
    if (tab) {
      state.tab = tab.dataset.tab;
      state.menu = null;
      state.sheet = null;
      mount();
      return;
    }
    var clear = t.closest('[data-clear]');
    if (clear) {
      var side = clear.dataset.clear;
      state.q = '';
      state.loading = false;
      clearTimeout(loadTimer);
      mount();
      var inp = document.querySelector('[data-input="' + side + '"]');
      if (inp) inp.focus();
      return;
    }
    if (t.closest('[data-back-lobby]')) {
      mount();
      toast(frame, tr('testBack'));
      return;
    }
    if (t.closest('[data-profile-back]')) {
      state.menu = null;
      state.sheet = null;
      if (frame === 'dir') {
        state.phoneView = 'directory';
        state.profileId = null;
        mount();
      } else {
        mount();
        toast(frame, tr('backProto'));
      }
      return;
    }
    var addRel = t.closest('[data-add-rel]');
    if (addRel) {
      var aid = addRel.dataset.addRel;
      state.rel[aid] = 'request';
      mount();
      toast(frame, tr('requestSent') + ' ' + nm(BY_ID[aid].name));
      return;
    }
    var accept = t.closest('[data-accept-sim]');
    if (accept) {
      var sid = accept.dataset.acceptSim;
      state.rel[sid] = 'friend';
      mount();
      toast(frame, tr('accepted'));
      return;
    }
    var open = t.closest('[data-open-profile]');
    if (open) {
      var oid = open.dataset.openProfile;
      if (frame === 'desk') state.deskSelected = oid;
      else { state.phoneView = 'profile'; state.profileId = oid; }
      state.menu = null;
      state.sheet = null;
      mount();
      return;
    }
    var addProfile = t.closest('[data-add-profile]');
    if (addProfile) {
      var pid = addProfile.dataset.addProfile;
      state.rel[pid] = 'request';
      mount();
      toast(frame, tr('requestSent') + ' ' + nm(BY_ID[pid].name));
      return;
    }
    var cancelReq = t.closest('[data-cancel-request]');
    if (cancelReq) {
      state.rel[cancelReq.dataset.cancelRequest] = 'none';
      mount();
      toast(frame, tr('reqCancelled'));
      return;
    }
    var invite = t.closest('[data-invite]');
    if (invite) {
      mount();
      toast(frame, tr('inviteSent') + ' ' + nm(BY_ID[invite.dataset.invite].name));
      return;
    }
    var unblock = t.closest('[data-unblock]');
    if (unblock) {
      state.rel[unblock.dataset.unblock] = 'none';
      mount();
      toast(frame, tr('unblocked'));
      return;
    }
    if (t.closest('[data-menu-open]')) {
      state.menu = frame;
      state.sheet = null;
      mount();
      return;
    }
    if (t.closest('[data-close-menu]')) {
      state.menu = null;
      mount();
      return;
    }
    var menuBlock = t.closest('[data-menu-block]');
    if (menuBlock) {
      state.sheet = { type: 'block', id: menuBlock.dataset.menuBlock, frame: frame };
      state.menu = null;
      mount();
      return;
    }
    var menuRemove = t.closest('[data-menu-remove]');
    if (menuRemove) {
      state.sheet = { type: 'remove', id: menuRemove.dataset.menuRemove, frame: frame };
      state.menu = null;
      mount();
      return;
    }
    if (t.closest('[data-close-sheet]')) {
      state.sheet = null;
      mount();
      return;
    }
    if (t.closest('[data-confirm-sheet]')) {
      var sheet = state.sheet;
      if (!sheet) return;
      state.rel[sheet.id] = sheet.type === 'block' ? 'blocked' : 'none';
      state.sheet = null;
      mount();
      toast(sheet.frame, sheet.type === 'block' ? tr('blockedToast') : tr('removed'));
      return;
    }
    if (t.closest('[data-choose-name]')) {
      toast(frame, tr('chooseNameToast'));
      return;
    }
    if (t.closest('[data-find]')) {
      var destination = document.getElementById('f-dir');
      if (destination) {
        destination.scrollIntoView({ behavior: 'smooth', block: 'center' });
        destination.style.outline = '3px solid #F0C14D';
        destination.style.outlineOffset = '6px';
        setTimeout(function () { destination.style.outline = ''; destination.style.outlineOffset = ''; }, 1400);
      }
      toast(frame, tr('openDir'));
    }
  });

  mount();
})();
