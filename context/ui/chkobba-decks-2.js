/*
 * Chkobba deck prototypes, second set. Load after chkobba-decks.js:
 *   <script src="chkobba-decks.js"></script><script src="chkobba-decks-2.js"></script>
 * Each deck registers into ChkobbaDecks, so every page that lists ChkobbaDecks.list picks them up.
 * Same rules as the first set: everything in em (font-size = card width), suit read from the
 * corner index at 46px, and the 7 of diamonds (sabaa el haya) gets its own mark.
 */
(function () {
  'use strict';
  var D = window.ChkobbaDecks;
  if (!D || !D.register) return;
  var K = D.kit, svg = K.svg, path = K.path, circ = K.circ, SUIT = K.SUIT;

  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function emblem(c, col, accent, tx, ty, s) {
    return '<g transform="translate(' + tx + ' ' + ty + ') scale(' + s + ')">' + K.EMBLEM[c.rank](col, accent) + '</g>';
  }
  function burst(n, ro, ri, fill, stroke) {
    var pts = [];
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? ri : ro, t = i / (n * 2) * Math.PI * 2 - Math.PI / 2;
      pts.push((50 + r * Math.cos(t)).toFixed(1) + ' ' + (50 + r * Math.sin(t)).toFixed(1));
    }
    return '<path d="M' + pts.join('L') + 'z" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="3" stroke-linejoin="round"' : '') + '/>';
  }
  function triRow(color, w, h, flip) {
    var out = '';
    for (var x = 0; x < 100; x += w) out += path(flip ? 'M' + x + ' ' + h + 'h' + w + 'l-' + w / 2 + '-' + h + 'z' : 'M' + x + ' 0h' + w + 'l-' + w / 2 + ' ' + h + 'z', color);
    return out;
  }

  // ---------- Sejnane: Berber pottery from the north-west, UNESCO-listed ----------
  var SJ = { clay: '#E3A774', red: '#8E2B1C', dark: '#2B1A12', cream: '#F6E3C6' };
  function sjBand(cls) {
    return '<span class="cdk-sj-band ' + cls + '">' + svg('<rect width="100" height="1.6" fill="' + SJ.dark + '"/>' + triRow(SJ.dark, 8, 6) + '<rect y="7.4" width="100" height="1" fill="' + SJ.red + '"/>', '0 0 100 9', ' preserveAspectRatio="none"') + '</span>';
  }
  function doll(body, dots) {
    return circ(50, 17, 11, body) + path('M50 30 80 92H20z', body) + path('M16 22 50 40 84 22 84 30 50 48 16 30z', body) +
      circ(42, 62, 3, dots) + circ(58, 62, 3, dots) + circ(50, 76, 3, dots);
  }
  D.register({
    meta: {
      id: 'sejnane', name: 'Sejnane', ar: 'سجنان', premium: true, price: 450,
      tagline: 'Hand-painted Berber clay from Sejnane; the 7 of diamonds is a little clay doll.',
      notes: {
        good: ['Deeply Tunisian and rarely seen outside the country', 'Dark-on-clay contrast survives 46 px well', 'Zigzag bands make the deck recognisable from a thumbnail'],
        bad: ['Red vs dark brown is a softer split than red vs black', 'The doll figure needs a cultural review with Sejnane potters'],
        rn: ['Low: paths and one band SVG'],
      },
    },
    fonts: 'https://fonts.googleapis.com/css2?family=Bangers&family=Bricolage+Grotesque:opsz,wght@12..96,800&family=DM+Serif+Display&family=Lalezar&family=Marcellus&display=swap',
    face: function (c) {
      var col = K.isRed(c.suit) ? SJ.red : SJ.dark;
      var pip = svg(path(SUIT[c.suit], col) + path('M50 36l10 12-10 12-10-12z', SJ.cream));
      var body = K.isCourt(c)
        ? '<span class="cdk-sj-court">' + svg(path('M50 3 97 50 50 97 3 50z', 'none', ' stroke="' + SJ.dark + '" stroke-width="3"') +
            path('M50 13 87 50 50 87 13 50z', 'none', ' stroke="' + SJ.red + '" stroke-width="1.6" stroke-dasharray="3 3"') + emblem(c, col, SJ.cream, 25, 25, .5)) + '</span>'
        : K.pipGrid(c, pip);
      return sjBand('cdk-sj-top') + sjBand('cdk-sj-bot') + body + K.corner(c.rank, K.suitSvg(c.suit, col), 'cdk-sj-idx') +
        (K.isHaya(c) ? K.haya(doll(SJ.red, SJ.cream)) : '');
    },
    back: function () {
      var out = '<rect width="100" height="143" fill="' + SJ.clay + '"/>';
      for (var y = 0; y < 143; y += 26) out += '<g transform="translate(0 ' + y + ')">' + triRow(SJ.dark, 10, 7) + '<rect y="9" width="100" height="1.4" fill="' + SJ.red + '"/></g>';
      for (var row = 0; row < 5; row++) for (var x = 5; x < 100; x += 18) out += path('M' + (x + (row % 2) * 9) + ' ' + (17 + row * 26) + 'l5 5-5 5-5-5z', SJ.dark);
      out += '<rect x="28" y="42" width="44" height="58" rx="4" fill="' + SJ.cream + '" stroke="' + SJ.dark + '" stroke-width="2"/>';
      out += '<g transform="translate(32 47) scale(.36 .48)">' + doll(SJ.red, SJ.cream) + '</g>';
      return '<span class="cdk-b-full">' + svg(out, '0 0 100 143', ' preserveAspectRatio="none"') + '</span>';
    },
    css: [
      '.cdk-sejnane{background:radial-gradient(120% 90% at 30% 20%,#EDBB8C,' + SJ.clay + ' 60%,#D2925E);border:.012em solid #B9764A;font-family:Lalezar,sans-serif;color:' + SJ.dark + '}',
      '.cdk-sj-band{position:absolute;left:0;right:0;height:.09em}.cdk-sj-top{top:0}.cdk-sj-bot{bottom:0;transform:rotate(180deg)}',
      '.cdk-sejnane .cdk-idx{top:.1em}.cdk-sejnane .cdk-idx-br{top:auto;bottom:.1em}',
      '.cdk-sejnane .cdk-idx b{font-size:.27em;font-weight:400}',
      '.cdk-sejnane .cdk-pips{top:.26em;bottom:.26em}',
      '.cdk-sj-court{position:absolute;left:50%;top:50%;width:.66em;height:.66em;transform:translate(-50%,-50%)}',
      '.cdk-sejnane .cdk-haya{top:.11em;width:.2em;height:.2em}',
    ].join('\n'),
  });

  // ---------- Fouta: hammam and beach towel stripes ----------
  var FO = { coral: '#E5484D', navy: '#1F3A5F', sea: '#2BA3A8', sand: '#FBF5EA', sun: '#F2B134' };
  function sun(fill, core) {
    var rays = '';
    for (var i = 0; i < 12; i++) rays += '<rect x="47" y="2" width="6" height="18" rx="3" fill="' + fill + '" transform="rotate(' + i * 30 + ' 50 50)"/>';
    return rays + circ(50, 50, 24, fill) + (core ? circ(50, 50, 14, core) : '');
  }
  D.register({
    meta: {
      id: 'fouta', name: 'Fouta', ar: 'فوطة', premium: false, price: 0,
      tagline: 'Striped like a hammam towel, fringe and all. A sunny free deck for summer events.',
      notes: {
        good: ['Instantly reads as Tunisian summer', 'Plain cream field keeps pips very legible', 'Cheap seasonal variants: swap the stripe colours'],
        bad: ['Stripes compete with the table at 46 px; keep them thin', 'Navy instead of black: check colour-blind contrast'],
        rn: ['Very low: View stripes + existing pip layout'],
      },
    },
    face: function (c) {
      var col = K.isRed(c.suit) ? FO.coral : FO.navy, s = K.suitSvg(c.suit, col);
      var body = K.isCourt(c)
        ? '<span class="cdk-fo-court">' + svg(sun(FO.sun) + circ(50, 50, 30, FO.sand) + emblem(c, col, FO.sea, 28, 28, .44)) + '</span>'
        : K.pipGrid(c, s);
      return '<span class="cdk-fo-stripes"></span><span class="cdk-fo-fringe"></span>' + body + K.corner(c.rank, s, 'cdk-fo-idx') +
        (K.isHaya(c) ? K.haya(sun(FO.sun, FO.coral)) : '');
    },
    back: function () {
      return '<span class="cdk-fo-full"></span><span class="cdk-fo-fringe"></span><span class="cdk-fo-fringe cdk-fo-ftop"></span>' +
        '<span class="cdk-b-medal" style="width:.4em;height:.4em">' + svg(sun(FO.sun, FO.sand) + '<g transform="translate(38 38) scale(.24)">' + path(SUIT.D, FO.coral) + '</g>') + '</span>';
    },
    css: [
      '.cdk-fouta{background:' + FO.sand + ';border:.012em solid #E3D6BF;font-family:"DM Serif Display",Georgia,serif;color:' + FO.navy + '}',
      '.cdk-fo-stripes{position:absolute;left:0;right:0;top:0;height:.1em;background:linear-gradient(' + FO.coral + ' 0 30%,' + FO.sand + ' 0 42%,' + FO.navy + ' 0 62%,' + FO.sand + ' 0 74%,' + FO.sea + ' 0)}',
      '.cdk-fo-fringe{position:absolute;left:0;right:0;bottom:0;height:.05em;background:repeating-linear-gradient(90deg,#D8CBB2 0 .012em,transparent .012em .03em)}',
      '.cdk-fo-ftop{top:0;bottom:auto}',
      '.cdk-fouta .cdk-idx{top:.12em}.cdk-fouta .cdk-idx-br{top:auto;bottom:.07em}',
      '.cdk-fouta .cdk-idx b{font-size:.27em;font-weight:400}',
      '.cdk-fouta .cdk-pips{top:.28em;bottom:.22em}',
      '.cdk-fo-court{position:absolute;left:50%;top:53%;width:.62em;height:.62em;transform:translate(-50%,-50%)}',
      '.cdk-fouta .cdk-haya{top:.13em}',
      '.cdk-back.cdk-fouta .cdk-fo-full{position:absolute;inset:.05em 0;background:repeating-linear-gradient(' + FO.coral + ' 0 .1em,' + FO.sand + ' .1em .13em,' + FO.navy + ' .13em .2em,' + FO.sand + ' .2em .23em,' + FO.sea + ' .23em .29em,' + FO.sand + ' .29em .32em)}',
    ].join('\n'),
  });

  // ---------- Riso: risograph zine, overprinted inks ----------
  var RI = { pink: '#FF48B0', blue: '#0078BF', yellow: '#FFE800', paper: '#F6F1E7' };
  D.register({
    meta: {
      id: 'riso', name: 'Riso Zine', ar: '', premium: true, price: 350,
      tagline: 'Oversized numbers in overprinted pink, blue and yellow ink, slightly off-register on purpose.',
      notes: {
        good: ['The giant rank is the most readable index of any deck', 'Court cards print their capture value (= 8, 9, 10)', 'Feels like a design object; good for social sharing'],
        bad: ['Pink and blue replace red and black: needs a colour-blind pass', 'mix-blend-mode is web only; native needs pre-baked colours'],
        rn: ['Low: pre-compute the overprint colours, no blending'],
      },
    },
    face: function (c) {
      var col = K.isRed(c.suit) ? RI.pink : RI.blue;
      var mark = K.isCourt(c)
        ? svg(K.EMBLEM[c.rank](col, RI.yellow))
        : svg(path(SUIT[c.suit], col));
      var tag = K.isCourt(c) ? '<span class="cdk-ri-val" style="color:' + col + '">= ' + K.value(c) + '</span>' : '';
      return '<span class="cdk-ri-dots"></span><b class="cdk-ri-big">' + c.rank + '</b>' +
        '<span class="cdk-ri-mark cdk-ri-mis">' + (K.isCourt(c) ? svg(K.EMBLEM[c.rank](RI.yellow, RI.yellow)) : svg(path(SUIT[c.suit], RI.yellow))) + '</span>' +
        '<span class="cdk-ri-mark">' + mark + '</span>' + tag +
        K.corner(c.rank, K.suitSvg(c.suit, col), 'cdk-ri-idx') +
        (K.isHaya(c) ? K.haya(path('M50 4 61 38 97 38 68 59 79 94 50 72 21 94 32 59 3 38 39 38z', RI.yellow, ' stroke="' + RI.pink + '" stroke-width="5"')) : '');
    },
    back: function () {
      return '<span class="cdk-ri-dots cdk-ri-dots-b"></span><span class="cdk-b-medal cdk-ri-bm">' +
        svg('<g style="mix-blend-mode:multiply">' + circ(40, 44, 34, RI.pink) + circ(60, 56, 34, RI.blue) + '</g>' +
          '<g transform="translate(30 30) scale(.4)">' + K.khatam(RI.yellow) + '</g>') + '</span>';
    },
    css: [
      '.cdk-riso{background:' + RI.paper + ';border:.012em solid #DED6C6;font-family:"Bricolage Grotesque",Inter,sans-serif;font-weight:800}',
      '.cdk-ri-dots{position:absolute;inset:0;background:radial-gradient(' + RI.yellow + ' 32%,transparent 36%) 0 0/.06em .06em;-webkit-mask:linear-gradient(160deg,transparent 45%,#000);mask:linear-gradient(160deg,transparent 45%,#000);opacity:.8}',
      '.cdk-ri-big{position:absolute;left:0;right:0;top:50%;transform:translateY(-52%);font-size:.95em;line-height:1;color:' + RI.yellow + ';mix-blend-mode:multiply;letter-spacing:-.06em}',
      '.cdk-ri-mark{position:absolute;left:50%;top:50%;width:.46em;height:.46em;transform:translate(-50%,-50%);mix-blend-mode:multiply}',
      '.cdk-ri-mis{transform:translate(-44%,-44%)}',
      '.cdk-ri-val{position:absolute;left:0;right:0;bottom:.2em;font-size:.15em}',
      '.cdk-riso .cdk-idx b{font-size:.26em;letter-spacing:-.04em}',
      '.cdk-back.cdk-riso{background:' + RI.paper + '}',
      '.cdk-ri-dots-b{background:radial-gradient(' + RI.pink + ' 30%,transparent 34%) 0 0/.05em .05em;-webkit-mask:none;mask:none;opacity:.35}',
      '.cdk-ri-bm{width:.7em;height:.7em}',
    ].join('\n'),
  });

  // ---------- Sahara Night: constellations over the dunes ----------
  var SA = { night: '#141A3A', dusk: '#2B2658', sand: '#D9A066', warm: '#FFB45C', cool: '#E8EEFF', gold: '#F4C95D' };
  var SPARK = 'M50 0C54 36 64 46 100 50 64 54 54 64 50 100 46 64 36 54 0 50 36 46 46 36 50 0z';
  function crescent(fill, bg) { return circ(50, 50, 40, fill) + circ(66, 40, 34, bg); }
  D.register({
    meta: {
      id: 'sahara', name: 'Sahara Night', ar: 'ليل الصحراء', premium: true, price: 550,
      tagline: 'Pips become stars joined into constellations above a dune; a crescent moon marks the 7 of diamonds.',
      notes: {
        good: ['Calm, beautiful dark deck that suits OLED', 'The constellation lines make the count readable as a shape', 'Pairs with the Sahara Night table theme'],
        bad: ['Pips are not suit-shaped: the suit lives only in the corners', 'Warm vs cool star colour is a subtle red/black cue'],
        rn: ['Low to medium: Svg lines + paths'],
      },
    },
    face: function (c) {
      var col = K.isRed(c.suit) ? SA.warm : SA.cool;
      var body;
      if (K.isCourt(c)) {
        body = '<span class="cdk-sa-court">' + svg(circ(50, 50, 44, 'none') + '<circle cx="50" cy="50" r="44" fill="none" stroke="' + SA.gold + '" stroke-width="1.5" stroke-dasharray="1 5" stroke-linecap="round"/>' +
          '<g stroke="' + col + '" stroke-width="3.5" stroke-linejoin="round">' + emblem(c, 'none', 'none', 24, 24, .52) + '</g>') + '</span>';
      } else {
        var pts = K.PIPS[c.rank];
        var line = pts.length > 1 ? '<span class="cdk-sa-lines">' + svg('<polyline points="' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="none" stroke="' + col + '" stroke-opacity=".45" stroke-width="1" vector-effect="non-scaling-stroke"/>', null, ' preserveAspectRatio="none"') + '</span>' : '';
        body = line + K.pipGrid(c, svg(path(SPARK, col)));
      }
      return '<span class="cdk-sa-dune"></span>' + body + K.corner(c.rank, K.suitSvg(c.suit, col), 'cdk-sa-idx') +
        (K.isHaya(c) ? K.haya(crescent(SA.gold, SA.night)) : '');
    },
    back: function () {
      var r = rng(7), stars = '';
      for (var i = 0; i < 46; i++) stars += circ((r() * 100).toFixed(1), (r() * 100).toFixed(1), (.4 + r() * 1.1).toFixed(2), '#fff');
      return '<span class="cdk-b-full">' + svg(stars + '<path d="M0 108Q30 92 55 104T100 98V143H0z" fill="' + SA.sand + '"/><path d="M0 122Q40 108 100 120V143H0z" fill="#B97E45"/>' +
        '<g transform="translate(30 26) scale(.4)">' + crescent(SA.gold, SA.dusk) + '</g>', '0 0 100 143', ' preserveAspectRatio="none"') + '</span>';
    },
    css: [
      '.cdk-sahara{background:linear-gradient(' + SA.night + ' 55%,' + SA.dusk + ');border:.012em solid rgba(244,201,93,.35);font-family:Marcellus,Georgia,serif;color:' + SA.cool + '}',
      '.cdk-sa-dune{position:absolute;left:-.1em;right:-.1em;bottom:-.12em;height:.3em;border-radius:50% 50% 0 0;background:linear-gradient(#E0AC70,#B97E45);opacity:.9}',
      '.cdk-sa-lines{position:absolute;left:.24em;right:.24em;top:.22em;bottom:.22em}',
      '.cdk-sahara .cdk-pip{width:.15em;height:.15em;filter:drop-shadow(0 0 .02em rgba(255,255,255,.7))}',
      '.cdk-sahara .cdk-pip.cdk-ace{width:.4em;height:.4em}',
      '.cdk-sahara .cdk-idx b{font-size:.25em;color:#fff}',
      '.cdk-sa-court{position:absolute;left:50%;top:46%;width:.66em;height:.66em;transform:translate(-50%,-50%)}',
      '.cdk-back.cdk-sahara{background:linear-gradient(#0B1030,' + SA.dusk + ')}',
    ].join('\n'),
  });

  // ---------- Harissa Pop: comic-book pop art ----------
  var HP = { red: '#E63228', ink: '#111111', cream: '#FFF6E0', yellow: '#FFD400', green: '#2E8B3A' };
  function chili() {
    return path('M24 30C32 62 60 84 94 86 74 98 30 92 16 62 10 46 13 34 24 30z', HP.red, ' stroke="' + HP.ink + '" stroke-width="4" stroke-linejoin="round"') +
      '<path d="M22 32C16 22 20 12 32 8" fill="none" stroke="' + HP.green + '" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M30 44Q42 66 66 76" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>';
  }
  D.register({
    meta: {
      id: 'harissa', name: 'Harissa Pop', ar: 'هريسة', premium: true, price: 400,
      tagline: 'Comic-book suits with thick ink lines and Ben-Day dots; a harissa chili shouts POW on the 7 of diamonds.',
      notes: {
        good: ['Loud, fun and great on a stream thumbnail', 'Thick outlines keep pips crisp at 46 px', 'Pairs with emote and celebration packs'],
        bad: ['Busy next to a busy table theme', 'Comic tone may not suit the café crowd'],
        rn: ['Low: stroked SVG paths; dots as a pattern'],
      },
    },
    face: function (c) {
      var col = K.isRed(c.suit) ? HP.red : HP.ink;
      var pip = svg('<g transform="translate(5 5)">' + path(SUIT[c.suit], HP.ink) + '</g>' + path(SUIT[c.suit], K.isRed(c.suit) ? HP.red : HP.yellow, ' stroke="' + HP.ink + '" stroke-width="6" stroke-linejoin="round"'));
      var body = K.isCourt(c)
        ? '<span class="cdk-hp-court">' + svg(burst(14, 48, 36, HP.yellow, HP.ink) + emblem(c, col, HP.cream, 27, 27, .46)) + '</span>'
        : K.pipGrid(c, pip);
      return '<span class="cdk-hp-dots"></span>' + body + K.corner(c.rank, K.suitSvg(c.suit, col), 'cdk-hp-idx') +
        (K.isHaya(c) ? '<span class="cdk-hp-pow">' + svg(burst(10, 50, 30, HP.yellow, HP.ink) + '<g transform="translate(20 18) scale(.6)">' + chili() + '</g>') + '</span>' : '');
    },
    back: function () {
      return '<span class="cdk-hp-dots cdk-hp-dots-b"></span><span class="cdk-b-medal" style="width:.66em;height:.66em">' +
        svg(burst(16, 48, 34, HP.yellow, HP.ink) + '<g transform="translate(20 20) scale(.6)">' + chili() + '</g>') + '</span>';
    },
    css: [
      '.cdk-harissa{background:' + HP.cream + ';border:.025em solid ' + HP.ink + ';font-family:Bangers,Impact,sans-serif;color:' + HP.ink + '}',
      '.cdk-hp-dots{position:absolute;inset:0;background:radial-gradient(rgba(230,50,40,.22) 30%,transparent 34%) 0 0/.07em .07em}',
      '.cdk-harissa .cdk-idx b{font-size:.3em;font-weight:400;letter-spacing:.01em}',
      '.cdk-harissa .cdk-pip{width:.19em;height:.19em}',
      '.cdk-harissa .cdk-pip.cdk-ace{width:.46em;height:.46em}',
      '.cdk-hp-court{position:absolute;left:50%;top:50%;width:.74em;height:.74em;transform:translate(-50%,-50%)}',
      '.cdk-hp-pow{position:absolute;right:-.02em;top:-.02em;width:.3em;height:.3em;z-index:3}',
      '.cdk-back.cdk-harissa{background:' + HP.red + '}',
      '.cdk-hp-dots-b{background:radial-gradient(rgba(0,0,0,.25) 30%,transparent 34%) 0 0/.06em .06em}',
    ].join('\n'),
  });
})();
