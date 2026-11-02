/*
 * Chkobba deck prototypes. Shared by chkobba-decks.html and the UI direction prototypes,
 * so any table theme can be shown with any deck (deck and theme are separate cosmetic slots).
 *
 *   ChkobbaDecks.list                            -> [{ id, name, ar, tagline, premium, price }]
 *   ChkobbaDecks.face(card, deckId, width)      -> HTML string; card = { rank, suit }
 *        rank: 'A','2'..'7','Q','J','K'   suit: 'D' (dineri), 'H', 'S', 'C'
 *        Court values are fixed: Q = 8, J = 9, K = 10.
 *   ChkobbaDecks.back(deckId, width)             -> HTML string
 *   ChkobbaDecks.cards()                         -> all 40 cards
 *   ChkobbaDecks.height(width)                   -> card height (the app's 46:66 ratio)
 *
 * Everything inside a card is sized in em with font-size = card width, so one renderer
 * covers table size (46px), hand size (78px) and gallery sizes.
 */
(function () {
  'use strict';

  var RATIO = 66 / 46;
  var SUITS = ['D', 'H', 'S', 'C'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', 'Q', 'J', 'K'];
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  var LIST = [
    { id: 'classic', name: 'Café Classic', ar: '', tagline: 'Pips and court emblems, like the deck on every café table.', premium: false, price: 0 },
    { id: 'jumbo', name: 'Jumbo Four-Colour', ar: '', tagline: 'Giant indices, four suit colours, face values printed. The accessibility deck.', premium: false, price: 0 },
    { id: 'khatt', name: 'Khatt', ar: 'خطّ', tagline: 'Arabic-Indic numerals under a Tunisian door arch; court cards show their capture value.', premium: false, price: 0 },
    { id: 'mosaic', name: 'Bardo Mosaic', ar: 'فسيفساء', tagline: 'Roman tesserae from Carthage; the 7 of diamonds is laid in gold.', premium: true, price: 400 },
    { id: 'kilim', name: 'Mergoum', ar: 'مرقوم', tagline: 'Woven-rug geometry in madder red, indigo and saffron.', premium: true, price: 400 },
    { id: 'nabeul', name: 'Nabeul Ceramic', ar: 'نابل', tagline: 'Hand-painted cobalt and ochre glaze; a lucky fish marks the 7 of diamonds.', premium: true, price: 500 },
    { id: 'neon', name: 'Neon Souk', ar: '', tagline: 'Glowing outline suits on midnight cards, made for dark mode.', premium: true, price: 600 },
    { id: 'pixel', name: 'Arcade 8-bit', ar: '', tagline: 'Chunky pixel suits and a blinking golden 7.', premium: true, price: 300 },
  ];

  // ---------- card helpers ----------

  function isRed(s) { return s === 'D' || s === 'H'; }
  function isHaya(c) { return c.rank === '7' && c.suit === 'D'; }
  function isCourt(c) { return c.rank === 'Q' || c.rank === 'J' || c.rank === 'K'; }
  function value(c) {
    if (c.rank === 'A') return 1;
    if (c.rank === 'K') return 10;
    if (c.rank === 'Q') return 8;
    if (c.rank === 'J') return 9;
    return +c.rank;
  }
  function arabic(n) { return String(n).replace(/\d/g, function (d) { return AR_DIGITS[+d]; }); }

  // ---------- svg primitives (100 x 100 viewBox unless noted) ----------

  function svg(inner, vb, extra) {
    return '<svg viewBox="' + (vb || '0 0 100 100') + '" aria-hidden="true"' + (extra || '') + '>' + inner + '</svg>';
  }
  function path(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function circ(cx, cy, r, fill) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>'; }

  var SUIT = {
    H: 'M50 90C22 68 6 50 6 31 6 16 17 6 30 6c9 0 16 5 20 13 4-8 11-13 20-13 13 0 24 10 24 25 0 19-16 37-44 59z',
    D: 'M50 4 88 50 50 96 12 50z',
    S: 'M50 5C24 28 6 44 6 61c0 13 10 22 22 22 9 0 16-5 19-11-1 10-5 18-13 24h32c-8-6-12-14-13-24 3 6 10 11 19 11 12 0 22-9 22-22C94 44 76 28 50 5z',
    C: 'M50 6c-12 0-21 9-21 21 0 5 2 10 5 14-3-2-7-3-11-3C11 38 3 47 3 58s8 21 20 21c10 0 17-6 20-12-1 11-5 20-13 27h40c-8-7-12-16-13-27 3 6 10 12 20 12 12 0 20-10 20-21s-8-20-20-20c-4 0-8 1-11 3 3-4 5-9 5-14 0-12-9-21-21-21z',
  };
  // Woven (stepped, straight-edged) suits for Mergoum, with the centre of each "eye" motif.
  var ANGULAR = {
    H: 'M50 92 8 50V26L24 10h18l8 12 8-12h18l16 16v24z',
    D: 'M50 4 90 50 50 96 10 50z',
    S: 'M50 6 92 48v20L78 80H60l4 14H36l4-14H22L8 68V48z',
    C: 'M50 4l18 18-18 18-18-18zM26 34l18 18-18 18L8 52zM74 34l18 18-18 18-18-18zM44 50h12l6 44H38z',
  };
  var EYE = { H: [50, 42], D: [50, 50], S: [50, 52], C: [50, 22] };

  function suitSvg(s, color) { return svg(path(SUIT[s], color)); }
  function eye(s, color, size) {
    var p = EYE[s], k = size || 9;
    return path('M' + p[0] + ' ' + (p[1] - k) + 'l' + k + ' ' + k + '-' + k + ' ' + k + '-' + k + '-' + k + 'z', color);
  }

  // Court emblems: Ray (K) crown, Q jasmine, J chechia. `a` is the accent; 'none' gives an outline-only emblem.
  var EMBLEM = {
    K: function (c, a) {
      return path('M14 72V34l18 18 18-28 18 28 18-18v38z', c) +
        '<rect x="14" y="76" width="72" height="10" rx="2" fill="' + c + '"/>' +
        circ(14, 28, 6, a) + circ(50, 17, 6, a) + circ(86, 28, 6, a);
    },
    Q: function (c, a) {
      var out = '';
      for (var i = 0; i < 5; i++) out += '<ellipse cx="50" cy="29" rx="12" ry="21" fill="' + c + '" transform="rotate(' + i * 72 + ' 50 50)"/>';
      return out + circ(50, 50, 9, a);
    },
    J: function (c, a) {
      var stroke = a === 'none' ? '' : ' stroke="' + a + '"';
      return path('M27 36h46l9 48H18z', c) +
        '<ellipse cx="50" cy="36" rx="23" ry="6" fill="' + a + '"/>' +
        '<path d="M50 32Q72 26 80 56" fill="none" stroke-width="4" stroke-linecap="round"' + stroke + '/>' +
        path('M76 54h9l-1.5 16h-6z', a);
    },
  };

  // Eight-point star (khatam), two overlapping squares.
  function khatam(fill, hole) {
    return '<rect x="21" y="21" width="58" height="58" fill="' + fill + '"/>' +
      '<rect x="21" y="21" width="58" height="58" fill="' + fill + '" transform="rotate(45 50 50)"/>' +
      (hole ? circ(50, 50, 13, hole) : '');
  }
  function fish(body, eyeColor) {
    return path('M8 50Q38 18 72 50Q38 82 8 50z', body) + path('M70 50 92 32 87 50 92 68z', body) + circ(26, 46, 4, eyeColor);
  }
  function haya(inner) { return '<span class="cdk-haya">' + svg(inner) + '</span>'; }

  // Pixel bitmaps for the 8-bit deck.
  var BITMAP = {
    H: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    D: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    S: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.XX.XX.', '...X...', '..XXX..'],
    C: ['..XXX..', '.XXXXX.', '..XXX..', 'XX.X.XX', 'XXXXXXX', 'XX.X.XX', '...X...', '..XXX..'],
    K: ['X..X..X', 'XX.X.XX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.......', 'XXXXXXX'],
    Q: ['..X.X..', '.XXXXX.', 'XXX.XXX', '.XXXXX.', '..X.X..', '...X...', '..XXX..'],
    J: ['......X', '..XXX.X', '.XXXXX.', '.XXXXX.', '.XXXXX.', 'XXXXXXX', 'XXXXXXX'],
  };
  function bitmap(rows, color) {
    var out = '';
    rows.forEach(function (r, y) {
      for (var x = 0; x < r.length; x++) if (r[x] === 'X') out += '<rect x="' + x + '" y="' + y + '" width="1.04" height="1.04" fill="' + color + '"/>';
    });
    return svg(out, '0 0 ' + rows[0].length + ' ' + rows.length, ' shape-rendering="crispEdges"');
  }

  // Classic pip layouts (percent of the pip area), same as the app's Café face.
  var PIPS = {
    A: [[50, 50]],
    '2': [[50, 18], [50, 82]],
    '3': [[50, 18], [50, 50], [50, 82]],
    '4': [[28, 18], [72, 18], [28, 82], [72, 82]],
    '5': [[28, 18], [72, 18], [50, 50], [28, 82], [72, 82]],
    '6': [[28, 18], [72, 18], [28, 50], [72, 50], [28, 82], [72, 82]],
    '7': [[28, 18], [72, 18], [50, 34], [28, 50], [72, 50], [28, 82], [72, 82]],
  };
  function pipGrid(c, pip) {
    var out = '';
    PIPS[c.rank].forEach(function (p) {
      out += '<span class="cdk-pip' + (c.rank === 'A' ? ' cdk-ace' : '') + '" style="left:' + p[0] + '%;top:' + p[1] + '%' +
        (p[1] > 50 ? ';transform:translate(-50%,-50%) rotate(180deg)' : '') + '">' + pip + '</span>';
    });
    return '<div class="cdk-pips">' + out + '</div>';
  }
  function corner(label, mark, cls) {
    var inner = '<b>' + label + '</b>' + mark;
    return '<div class="cdk-idx ' + (cls || '') + '">' + inner + '</div><div class="cdk-idx cdk-idx-br ' + (cls || '') + '">' + inner + '</div>';
  }

  // ---------- decks ----------

  var C = {
    classic: { red: '#B3261E', black: '#1E1A16', gold: '#C9A227', bg: '#FBF3DF' },
    jumbo: { H: '#D7263D', D: '#1F6FEB', S: '#14161A', C: '#138A4B' },
    mosaic: { red: '#B4442A', black: '#2F3A3F', gold: '#C99A2E', cream: '#EDE3D1' },
    kilim: { red: '#B5232F', indigo: '#1F2A5A', saffron: '#E8A33D', wool: '#F4E6CF' },
    nabeul: { cobalt: '#1E4FA3', ochre: '#C8542B', yellow: '#E9B32A', glaze: '#FBF7EE' },
    neon: { pink: '#FF3D8B', cyan: '#2DE2E6', gold: '#FFD23F' },
    pixel: { red: '#D62839', black: '#1A1A1A', gold: '#FFD23F' },
    khatt: { red: '#A3242B', black: '#1D3B34', gold: '#B8913A' },
  };

  var FACES = {
    classic: function (c) {
      var k = C.classic, col = isRed(c.suit) ? k.red : k.black, s = suitSvg(c.suit, col);
      var body = isCourt(c)
        ? '<div class="cdk-court"><span>' + svg(EMBLEM[c.rank](col, k.gold)) + '</span><span class="cdk-flip">' + svg(EMBLEM[c.rank](col, k.gold)) + '</span></div>'
        : pipGrid(c, s);
      return body + corner(c.rank, s) + (isHaya(c) ? haya(khatam(k.gold, k.bg)) : '');
    },

    jumbo: function (c, o) {
      var col = C.jumbo[c.suit], s = suitSvg(c.suit, col);
      return '<b class="cdk-j-rank" style="color:' + col + '">' + c.rank + '</b>' +
        '<span class="cdk-j-suit">' + s + '</span>' +
        (isCourt(c)
          ? '<span class="cdk-j-art">' + svg(EMBLEM[c.rank](col, '#F2C230')) + '</span><span class="cdk-j-val" style="background:' + col + '">' + value(c) + '</span>'
          : '<span class="cdk-j-art cdk-j-wm">' + s + '</span>') +
        (isHaya(c) ? haya(khatam('#F2B705', '#fff')) : '');
    },

    khatt: function (c, o) {
      var k = C.khatt, col = isRed(c.suit) ? k.red : k.black;
      var inner = isCourt(c)
        ? '<g transform="translate(22 50) scale(.56)">' + EMBLEM[c.rank](col, k.gold) + '</g>'
        : '<g transform="translate(27 52) scale(.46)">' + path(SUIT[c.suit], col) + '</g>';
      var arch = 'M14 132V62C14 34 30 16 50 8c20 8 36 26 36 54v70z';
      var center = svg(path(arch, isHaya(c) ? '#EBD08A' : 'none', ' stroke="' + k.gold + '" stroke-width="3"') +
        path('M22 124V64c0-22 12-37 28-44 16 7 28 22 28 44v60z', 'none', ' stroke="' + k.gold + '" stroke-width="1.2" stroke-dasharray="3 3"') + inner, '0 0 100 140');
      var idx = '<b>' + arabic(value(c)) + '</b><small>' + c.rank + '</small>';
      return '<span class="cdk-x-arch">' + center + '</span>' +
        '<div class="cdk-idx cdk-x-idx" style="color:' + col + '">' + idx + '</div>' +
        '<div class="cdk-idx cdk-idx-br cdk-x-idx cdk-x-upright" style="color:' + col + '">' + idx + '</div>';
    },

    mosaic: function (c) {
      var k = C.mosaic, tone = isHaya(c) ? 'gold' : isRed(c.suit) ? 'red' : 'black';
      var fill = 'url(#cdk-tess-' + tone + ')';
      var center = isCourt(c)
        ? svg(laurel(k.gold) + '<g transform="translate(24 24) scale(.52)">' + EMBLEM[c.rank](fill, k[tone === 'gold' ? 'gold' : tone]) + '</g>')
        : svg(path(SUIT[c.suit], fill));
      return '<div class="cdk-m-frame"></div><span class="cdk-m-center">' + center + '</span>' +
        corner(c.rank, suitSvg(c.suit, k[tone]), 'cdk-m-idx') + (isHaya(c) ? haya(khatam(k.gold, k.cream)) : '');
    },

    kilim: function (c) {
      var k = C.kilim, col = isRed(c.suit) ? k.red : k.indigo;
      var pip = svg(path(ANGULAR[c.suit], col) + eye(c.suit, k.saffron));
      var body = isCourt(c)
        ? '<span class="cdk-k-court">' + svg(path('M50 2 98 50 50 98 2 50z', 'none', ' stroke="' + k.saffron + '" stroke-width="4"') + '<g transform="translate(20 20) scale(.6)">' + EMBLEM[c.rank](col, k.saffron) + '</g>') + '</span>'
        : pipGrid(c, pip);
      return band('cdk-k-top') + band('cdk-k-bot') + body +
        corner(c.rank, svg(path(ANGULAR[c.suit], col)), 'cdk-k-idx') + (isHaya(c) ? haya(khatam(k.red, k.saffron)) : '');
    },

    nabeul: function (c) {
      var k = C.nabeul, col = isRed(c.suit) ? k.ochre : k.cobalt, s = suitSvg(c.suit, col);
      var body = isCourt(c)
        ? '<span class="cdk-n-plate">' + svg(dotRing(44, 14, 3, k.yellow) + '<circle cx="50" cy="50" r="36" fill="none" stroke="' + k.cobalt + '" stroke-width="2.5"/>' + '<g transform="translate(22 22) scale(.56)">' + EMBLEM[c.rank](col, k.yellow) + '</g>') + '</span>'
        : pipGrid(c, s);
      return '<div class="cdk-n-ring"></div>' + body + corner(c.rank, s) + (isHaya(c) ? haya(fish(k.cobalt, k.yellow)) : '');
    },

    neon: function (c) {
      var k = C.neon, col = isHaya(c) ? k.gold : isRed(c.suit) ? k.pink : k.cyan;
      var center = isCourt(c)
        ? svg('<g stroke="' + col + '" stroke-width="4" stroke-linejoin="round">' + EMBLEM[c.rank]('none', 'none') + '</g>')
        : svg(path(SUIT[c.suit], 'none', ' stroke="' + col + '" stroke-width="5" stroke-linejoin="round"'));
      var dots = '';
      if (!isCourt(c)) for (var i = 0; i < value(c); i++) dots += '<i></i>';
      return '<span class="cdk-ne-center">' + center + '</span>' + (dots ? '<span class="cdk-ne-dots">' + dots + '</span>' : '') +
        corner(c.rank, svg(path(SUIT[c.suit], col))) + (isHaya(c) ? haya(khatam(k.gold)) : '');
    },

    pixel: function (c) {
      var k = C.pixel, col = isRed(c.suit) ? k.red : k.black;
      return '<span class="cdk-p-center">' + bitmap(BITMAP[isCourt(c) ? c.rank : c.suit], col) + '</span>' +
        corner(c.rank, bitmap(BITMAP[c.suit], col)) + (isHaya(c) ? haya(khatam(k.red, k.gold)) : '');
    },
  };

  function laurel(color) {
    var out = '';
    for (var a = 105; a <= 255; a += 25) {
      [a, 180 - a].forEach(function (deg) {
        var r = deg * Math.PI / 180, x = 50 + 42 * Math.cos(r), y = 52 + 42 * Math.sin(r);
        out += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="4" ry="9" fill="' + color + '" transform="rotate(' + deg + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
      });
    }
    return out;
  }
  function dotRing(r, n, size, color) {
    var out = '';
    for (var i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2;
      out += circ((50 + r * Math.cos(t)).toFixed(1), (50 + r * Math.sin(t)).toFixed(1), size, color);
    }
    return out;
  }
  function band(cls) {
    var k = C.kilim, tri = '';
    for (var x = 0; x < 100; x += 10) tri += path('M' + x + ' 2h10l-5 5z', k.indigo);
    return '<span class="cdk-k-band ' + cls + '">' + svg('<rect width="100" height="2" fill="' + k.red + '"/>' + tri, '0 0 100 7', ' preserveAspectRatio="none"') + '</span>';
  }

  // ---------- backs ----------

  var BACKS = {
    classic: function () {
      return '<div class="cdk-b-frame"><span class="cdk-b-medal">' + svg(circ(50, 50, 46, '#7A1F2B') + khatam('#F3E2B3', '#7A1F2B')) + '</span></div>';
    },
    jumbo: function () {
      var j = C.jumbo, q = '';
      [['H', 26, 26], ['D', 74, 26], ['S', 26, 74], ['C', 74, 74]].forEach(function (p) {
        q += circ(p[1], p[2], 21, '#fff') + '<g transform="translate(' + (p[1] - 12) + ' ' + (p[2] - 12) + ') scale(.24)">' + path(SUIT[p[0]], j[p[0]]) + '</g>';
      });
      return '<div class="cdk-b-frame"><span class="cdk-b-medal">' + svg(q) + '</span></div>';
    },
    khatt: function () {
      var k = C.khatt;
      return '<div class="cdk-b-frame"></div><span class="cdk-b-full">' +
        svg(path('M18 128V62C18 36 32 19 50 11c18 8 32 25 32 51v66z', 'none', ' stroke="' + k.gold + '" stroke-width="2.5"') +
          '<g transform="translate(30 46) scale(.4)">' + khatam(k.gold, '#1D3B34') + '</g>', '0 0 100 140') + '</span>';
    },
    mosaic: function () {
      var k = C.mosaic, tones = [k.red, k.cream, k.black], out = '<rect width="80" height="115" fill="#B9AC96"/>';
      for (var y = 0; y < 11; y++) for (var x = 0; x < 8; x++) {
        var d = Math.floor(Math.abs(x - 3.5) + Math.abs(y - 5));
        var fill = d === 0 ? k.gold : tones[d % 3];
        out += '<rect x="' + (x * 10 + .8) + '" y="' + (y * 10.45 + .8) + '" width="8.4" height="8.8" rx="1" fill="' + fill + '"/>';
      }
      return '<span class="cdk-b-full">' + svg(out, '0 0 80 115', ' preserveAspectRatio="none"') + '</span>';
    },
    kilim: function () {
      var k = C.kilim, out = '<rect width="100" height="143" fill="' + k.red + '"/>';
      for (var x = 0; x < 100; x += 10) out += path('M' + x + ' 0h10l-5 9z', k.indigo) + path('M' + x + ' 143h10l-5-9z', k.indigo);
      for (var y = 12; y < 136; y += 9) out += path('M0 ' + y + 'l7 4.5L0 ' + (y + 9) + 'z', k.saffron) + path('M100 ' + y + 'l-7 4.5 7 4.5z', k.saffron);
      for (var i = 0; i < 5; i++) {
        var cy = 27 + i * 22.5;
        out += path('M50 ' + (cy - 11) + 'l26 11-26 11-26-11z', k.indigo) + path('M50 ' + (cy - 6) + 'l13 6-13 6-13-6z', k.saffron) + circ(50, cy, 2.5, k.red);
      }
      return '<span class="cdk-b-full">' + svg(out, '0 0 100 143', ' preserveAspectRatio="none"') + '</span>';
    },
    nabeul: function () {
      var k = C.nabeul;
      return '<div class="cdk-n-ring"></div><span class="cdk-b-medal">' +
        svg(dotRing(46, 18, 2.6, k.yellow) + '<circle cx="50" cy="50" r="38" fill="none" stroke="' + k.cobalt + '" stroke-width="3"/>' + dotRing(30, 10, 2, k.cobalt) +
          '<g transform="translate(22 26) scale(.56)">' + fish(k.cobalt, k.yellow) + '</g>') + '</span>';
    },
    neon: function () {
      var k = C.neon;
      return '<span class="cdk-ne-grid"></span><span class="cdk-b-medal cdk-ne-glow" style="color:' + k.pink + '">' +
        svg('<g fill="none" stroke="' + k.pink + '" stroke-width="3">' + khatam('none') + '</g>' + '<g transform="translate(35 35) scale(.3)">' + path(SUIT.D, 'none', ' stroke="' + k.cyan + '" stroke-width="8"') + '</g>') + '</span>';
    },
    pixel: function () {
      var q = '';
      ['H', 'D', 'S', 'C'].forEach(function (s) { q += '<span>' + bitmap(BITMAP[s], isRed(s) ? '#FF5C7A' : '#fff') + '</span>'; });
      return '<span class="cdk-p-quad">' + q + '</span>';
    },
  };

  // ---------- styles and shared svg defs (injected once) ----------

  var FONTS = 'https://fonts.googleapis.com/css2?family=Amiri:wght@700&family=Chakra+Petch:wght@700&family=Cinzel:wght@700&family=Fredoka:wght@600&family=Inter:wght@900&family=Playfair+Display:wght@800&family=Press+Start+2P&family=Rubik:wght@800&display=swap';

  var CSS = [
    '.cdk{position:relative;overflow:hidden;box-sizing:border-box;flex:none;border-radius:.09em;user-select:none;line-height:1;text-align:center}',
    '.cdk *{box-sizing:border-box}',
    '.cdk svg{display:block;width:100%;height:100%;overflow:visible}',
    '.cdk-idx{position:absolute;left:.06em;top:.05em;display:flex;flex-direction:column;align-items:center;z-index:2}',
    '.cdk-idx b{font-size:.25em;font-weight:inherit;line-height:.95}',
    '.cdk-idx>svg{width:.15em;height:.15em;margin-top:.02em}',
    '.cdk-idx-br{left:auto;top:auto;right:.06em;bottom:.05em;transform:rotate(180deg)}',
    '.cdk-pips{position:absolute;left:.24em;right:.24em;top:.22em;bottom:.22em}',
    '.cdk-pip{position:absolute;width:.17em;height:.17em;transform:translate(-50%,-50%)}',
    '.cdk-pip.cdk-ace{width:.42em;height:.42em}',
    '.cdk-haya{position:absolute;right:.05em;top:.05em;width:.19em;height:.19em;z-index:3}',
    '.cdk-b-frame{position:absolute;inset:.07em;border-radius:.05em}',
    '.cdk-b-medal{position:absolute;left:50%;top:50%;width:.56em;height:.56em;transform:translate(-50%,-50%)}',
    '.cdk-b-full{position:absolute;inset:0}',
    // classic
    '.cdk-classic{background:#FBF3DF;border:.02em solid #C9A96A;font-family:"Playfair Display",Georgia,serif;font-weight:800}',
    '.cdk-classic .cdk-court{position:absolute;left:.23em;right:.23em;top:.14em;bottom:.14em;border:.012em solid #C9A96A;border-radius:.03em;background:linear-gradient(#F3E2B3,#EAD39A);display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:.03em 0}',
    '.cdk-classic .cdk-court span{width:.34em;height:.34em}.cdk-flip{transform:rotate(180deg)}',
    '.cdk-classic[data-card="7D"]{box-shadow:inset 0 0 0 .035em #C9A227}',
    '.cdk-back.cdk-classic{background:#7A1F2B;border-color:#5A1420}',
    '.cdk-back.cdk-classic .cdk-b-frame{border:.015em solid #F3E2B3;background:repeating-linear-gradient(45deg,transparent 0 .05em,rgba(243,226,179,.22) .05em .06em),repeating-linear-gradient(-45deg,transparent 0 .05em,rgba(243,226,179,.22) .05em .06em)}',
    // jumbo
    '.cdk-jumbo{background:#fff;border:.015em solid #D5D9E0;font-family:Inter,system-ui,sans-serif;font-weight:900;border-radius:.1em}',
    '.cdk-j-rank{position:absolute;left:.07em;top:.02em;font-size:.6em;letter-spacing:-.05em;line-height:1}',
    '.cdk-j-suit{position:absolute;left:.08em;top:.64em;width:.3em;height:.3em}',
    '.cdk-j-art{position:absolute;right:.07em;bottom:.07em;width:.5em;height:.5em}',
    '.cdk-j-wm{opacity:.16}',
    '.cdk-j-val{position:absolute;right:.07em;top:.08em;font-size:.15em;color:#fff;min-width:1.6em;padding:.18em .3em;border-radius:1em;line-height:1}',
    '.cdk-jumbo[data-card="7D"]{background:linear-gradient(160deg,#fff 55%,#FFF2C2)}',
    '.cdk-back.cdk-jumbo{background:#1F2A44;border-color:#1F2A44}',
    '.cdk-back.cdk-jumbo .cdk-b-frame{border:.012em solid rgba(255,255,255,.25)}',
    // khatt
    '.cdk-khatt{background:#F6EEDC;border:.02em solid #B8913A;font-family:Amiri,serif;font-weight:700}',
    '.cdk-x-arch{position:absolute;left:.2em;right:.2em;top:.16em;bottom:.12em}',
    '.cdk-x-idx b{font-size:.3em;line-height:.9}',
    '.cdk-x-upright{transform:none}',
    '.cdk-x-idx small{font-family:Inter,sans-serif;font-weight:900;font-size:.1em;opacity:.7;margin-top:.1em}',
    '.cdk-back.cdk-khatt{background:#1D3B34;border-color:#B8913A}',
    '.cdk-back.cdk-khatt .cdk-b-frame{border:.012em solid #B8913A;outline:.008em solid rgba(184,145,58,.5);outline-offset:.025em;background:radial-gradient(circle,rgba(184,145,58,.18) .012em,transparent .014em) 0 0/.08em .08em}',
    // mosaic
    '.cdk-mosaic{background-color:#EDE3D1;background-image:linear-gradient(rgba(120,90,60,.13) .01em,transparent .01em),linear-gradient(90deg,rgba(120,90,60,.13) .01em,transparent .01em);background-size:.1em .1em;border:.015em solid #A0522D;font-family:Cinzel,serif;font-weight:700}',
    '.cdk-m-frame{position:absolute;inset:.03em;border:.028em dashed #A0522D;border-radius:.04em}',
    '.cdk-m-center{position:absolute;left:50%;top:50%;width:.6em;height:.6em;transform:translate(-50%,-50%)}',
    '.cdk-mosaic .cdk-idx{left:.09em;top:.08em}.cdk-mosaic .cdk-idx-br{left:auto;top:auto;right:.09em;bottom:.08em}',
    '.cdk-mosaic[data-card="7D"] .cdk-m-frame{border-color:#C99A2E}',
    '.cdk-back.cdk-mosaic{border-color:#7A6A55}',
    // kilim
    '.cdk-kilim{background:#F4E6CF;border:.015em solid #1F2A5A;font-family:Rubik,sans-serif;font-weight:800;border-radius:.05em}',
    '.cdk-k-band{position:absolute;left:0;right:0;height:.07em}.cdk-k-top{top:0}.cdk-k-bot{bottom:0;transform:rotate(180deg)}',
    '.cdk-kilim .cdk-idx{top:.1em}.cdk-kilim .cdk-idx-br{top:auto;bottom:.1em}',
    '.cdk-kilim .cdk-pips{top:.3em;bottom:.3em}',
    '.cdk-k-court{position:absolute;left:50%;top:50%;width:.56em;height:.56em;transform:translate(-50%,-50%)}',
    '.cdk-kilim .cdk-haya{top:.1em}',
    '.cdk-kilim[data-card="7D"]{background:#F6D48E}',
    '.cdk-back.cdk-kilim{border-color:#1F2A5A}',
    // nabeul
    '.cdk-nabeul{background:radial-gradient(120% 80% at 30% 20%,#fff,#FBF7EE 60%,#F1E9D6);border:.012em solid #D9CFB8;font-family:Fredoka,sans-serif;font-weight:600;border-radius:.12em}',
    '.cdk-n-ring{position:absolute;inset:.045em;border:.022em solid #1E4FA3;border-radius:14% 11% 13% 10% / 9% 12% 8% 11%}',
    '.cdk-nabeul .cdk-idx{left:.09em;top:.08em}.cdk-nabeul .cdk-idx-br{left:auto;top:auto;right:.09em;bottom:.08em}',
    '.cdk-nabeul .cdk-haya{width:.24em;height:.24em;top:.07em;right:.07em}',
    '.cdk-n-plate{position:absolute;left:50%;top:50%;width:.66em;height:.66em;transform:translate(-50%,-50%)}',
    '.cdk-nabeul .cdk-pip{transform:translate(-50%,-50%) rotate(-4deg)}',
    '.cdk-back.cdk-nabeul .cdk-b-medal{width:.8em;height:.8em}',
    // neon
    '.cdk-neon{background:radial-gradient(90% 70% at 50% 40%,#1D1640,#0E0B1F);border:.012em solid rgba(255,255,255,.14);font-family:"Chakra Petch",sans-serif;font-weight:700;color:#fff}',
    '.cdk-neon svg{filter:drop-shadow(0 0 .025em currentColor) drop-shadow(0 0 .06em currentColor)}',
    '.cdk-neon .cdk-idx b{text-shadow:0 0 .2em currentColor}',
    '.cdk-ne-center{position:absolute;left:50%;top:46%;width:.5em;height:.5em;transform:translate(-50%,-50%)}',
    '.cdk-ne-dots{position:absolute;left:0;right:0;bottom:.17em;display:flex;justify-content:center;gap:.03em;color:#fff}',
    '.cdk-ne-dots i{width:.055em;height:.055em;border-radius:50%;background:currentColor;box-shadow:0 0 .04em currentColor}',
    '.cdk-neon[data-card="7D"]{border-color:#FFD23F;box-shadow:0 0 .08em rgba(255,210,63,.6)}',
    '.cdk-ne-grid{position:absolute;inset:0;background:linear-gradient(transparent 55%,rgba(255,61,139,.25)),repeating-linear-gradient(90deg,rgba(45,226,230,.22) 0 .008em,transparent .008em .1em),repeating-linear-gradient(rgba(45,226,230,.22) 0 .008em,transparent .008em .1em)}',
    '.cdk-ne-glow svg{filter:drop-shadow(0 0 .03em #FF3D8B) drop-shadow(0 0 .08em #FF3D8B)}',
    // pixel
    '.cdk-pixel{background:#F2E9D8;border:.03em solid #1A1A1A;border-radius:0;box-shadow:inset -.03em -.03em 0 #CDBFA4;font-family:"Press Start 2P",monospace}',
    '.cdk-pixel .cdk-idx b{font-size:.17em;line-height:1.2}.cdk-pixel .cdk-idx>svg{width:.13em;height:.13em}',
    '.cdk-p-center{position:absolute;left:50%;top:50%;width:.44em;height:.44em;transform:translate(-50%,-50%)}',
    '.cdk-pixel[data-card="7D"]{animation:cdk-blink 1s steps(2) infinite}',
    '@keyframes cdk-blink{0%{background:#F2E9D8}50%{background:#FFE79A}}',
    '.cdk-back.cdk-pixel{background-color:#3B2F8F;background-image:conic-gradient(#4A3DB0 25%,transparent 0 50%,#4A3DB0 0 75%,transparent 0);background-size:.14em .14em;box-shadow:none}',
    '.cdk-p-quad{position:absolute;left:50%;top:50%;width:.56em;height:.56em;transform:translate(-50%,-50%);display:grid;grid-template-columns:1fr 1fr;gap:.06em;padding:.07em;background:#1A1A1A}',
    '@media (prefers-reduced-motion:reduce){.cdk-pixel[data-card="7D"]{animation:none;background:#FFE79A}}',
  ].join('\n');

  function tessPattern(id, shades) {
    var t = '';
    for (var y = 0; y < 3; y++) for (var x = 0; x < 3; x++) {
      t += '<rect x="' + (x * 10 + .9) + '" y="' + (y * 10 + .9) + '" width="8.2" height="8.2" rx=".8" fill="' + shades[(x * 2 + y) % shades.length] + '"/>';
    }
    return '<pattern id="' + id + '" width="30" height="30" patternUnits="userSpaceOnUse">' + t + '</pattern>';
  }

  var ready = false;
  function ensure() {
    if (ready || typeof document === 'undefined') return;
    ready = true;
    var host = document.head || document.documentElement;
    if (!document.querySelector('link[data-cdk-fonts]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = FONTS; link.setAttribute('data-cdk-fonts', '');
      host.appendChild(link);
    }
    var style = document.createElement('style');
    style.textContent = CSS;
    host.appendChild(style);
    var defs = document.createElement('div');
    defs.setAttribute('aria-hidden', 'true');
    defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    defs.innerHTML = '<svg width="0" height="0"><defs>' +
      tessPattern('cdk-tess-red', ['#B4442A', '#C2573A', '#A23B23']) +
      tessPattern('cdk-tess-black', ['#2F3A3F', '#3D4A50', '#252E33']) +
      tessPattern('cdk-tess-gold', ['#C99A2E', '#DDB24A', '#B5862A']) +
      '</defs></svg>';
    (document.body || document.documentElement).appendChild(defs);
  }

  function shell(deckId, w, inner, card, extraCls) {
    return '<div class="cdk cdk-' + deckId + (extraCls ? ' ' + extraCls : '') + '"' +
      (card ? ' data-card="' + card.rank + card.suit + '"' : '') +
      ' style="width:' + w + 'px;height:' + Math.round(w * RATIO) + 'px;font-size:' + w + 'px">' + inner + '</div>';
  }

  window.ChkobbaDecks = {
    list: LIST,
    height: function (w) { return Math.round(w * RATIO); },
    cards: function () {
      var out = [];
      SUITS.forEach(function (s) { RANKS.forEach(function (r) { out.push({ rank: r, suit: s }); }); });
      return out;
    },
    face: function (card, deckId, w, opts) {
      ensure();
      var id = FACES[deckId] ? deckId : 'classic';
      return shell(id, w, FACES[id](card, opts || {}), card);
    },
    back: function (deckId, w) {
      ensure();
      var id = BACKS[deckId] ? deckId : 'classic';
      return shell(id, w, BACKS[id](), null, 'cdk-back');
    },
    // Add-on decks (chkobba-decks-2.js): { meta, face(card, opts), back(), css, fonts }.
    register: function (def) {
      LIST.push(def.meta);
      FACES[def.meta.id] = def.face;
      BACKS[def.meta.id] = def.back;
      if (typeof document === 'undefined') return;
      var host = document.head || document.documentElement;
      if (def.fonts) {
        var link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = def.fonts;
        host.appendChild(link);
      }
      if (def.css) {
        var style = document.createElement('style');
        style.textContent = def.css;
        host.appendChild(style);
      }
    },
    kit: {
      svg: svg, path: path, circ: circ, SUIT: SUIT, suitSvg: suitSvg, EMBLEM: EMBLEM, PIPS: PIPS,
      pipGrid: pipGrid, corner: corner, khatam: khatam, haya: haya, dotRing: dotRing,
      isRed: isRed, isHaya: isHaya, isCourt: isCourt, value: value, arabic: arabic,
    },
  };
})();
