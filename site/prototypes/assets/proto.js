/* Shared helpers for the Kiteline homepage prototypes: language toggle, prototype switcher,
   text and scroll reveals, pointer tilt, painted clouds, scripted terminal playback. No dependencies. */
(function () {
  "use strict";
  var KL = (window.KL = {});
  var root = document.documentElement;

  /* ---------- small utilities ---------- */
  KL.sleep = function (ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  };
  KL.clamp = function (v, a, b) {
    return v < a ? a : v > b ? b : v;
  };
  KL.lerp = function (a, b, t) {
    return a + (b - a) * t;
  };
  KL.smooth = function (t) {
    t = KL.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  KL.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  KL.touch = window.matchMedia("(hover: none)").matches;
  KL.esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };

  /* ---------- language ---------- */
  function readLang() {
    try {
      var saved = localStorage.getItem("kiteline.proto.lang");
      if (saved === "zh" || saved === "en") return saved;
    } catch (e) {}
    return "zh";
  }
  KL.lang = readLang();
  KL.setLang = function (lang) {
    KL.lang = lang;
    root.setAttribute("data-lang", lang);
    root.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
    var nodes = document.querySelectorAll("[data-en]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute("data-zh") === null) el.setAttribute("data-zh", el.innerHTML);
      el.innerHTML = el.getAttribute(lang === "zh" ? "data-zh" : "data-en");
      el.removeAttribute("data-split");
    }
    /* screenshots follow the language: <img src="…-zh.webp" data-src-en="…-en.webp"> */
    var images = document.querySelectorAll("img[data-src-en]");
    for (var m = 0; m < images.length; m++) {
      var img = images[m];
      if (!img.getAttribute("data-src-zh")) {
        img.setAttribute("data-src-zh", img.getAttribute("src"));
        img.setAttribute("data-alt-zh", img.getAttribute("alt") || "");
      }
      var src = img.getAttribute(lang === "zh" ? "data-src-zh" : "data-src-en");
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      var alt = img.getAttribute(lang === "zh" ? "data-alt-zh" : "data-alt-en");
      if (alt !== null) img.setAttribute("alt", alt);
    }
    KL.splitAll();
    try {
      localStorage.setItem("kiteline.proto.lang", lang);
    } catch (e) {}
    document.dispatchEvent(new CustomEvent("kl:lang", { detail: lang }));
  };
  KL.t = function (zh, en) {
    return KL.lang === "zh" ? zh : en;
  };

  /* ---------- variants of one page ---------- */
  /* A page lists its variants in <body data-variants="b b1 b2">. The choice comes from the URL hash,
     then the last choice, then the first entry; switching keeps the scroll position. */
  var variants = (document.body.getAttribute("data-variants") || "").split(" ").filter(Boolean);
  function readVariant() {
    var fromHash = location.hash.replace("#", "");
    if (variants.indexOf(fromHash) >= 0) return fromHash;
    try {
      var saved = localStorage.getItem("kiteline.proto.variant");
      if (variants.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    return variants[0] || "";
  }
  KL.variant = readVariant();
  if (KL.variant) document.body.setAttribute("data-variant", KL.variant);
  KL.setVariant = function (name) {
    if (variants.indexOf(name) < 0 || name === KL.variant) return;
    KL.variant = name;
    document.body.setAttribute("data-variant", name);
    try {
      localStorage.setItem("kiteline.proto.variant", name);
      history.replaceState(null, "", "#" + name);
    } catch (e) {}
    document.dispatchEvent(new CustomEvent("kl:variant", { detail: name }));
  };
  window.addEventListener("hashchange", function () {
    KL.setVariant(location.hash.replace("#", ""));
  });

  /* ---------- text reveal ---------- */
  /* Wraps each Latin word and each CJK character (with its trailing punctuation, so a line never
     starts with a comma) in a clipping span; CSS slides the inner span up when .split-in is set. */
  var UNIT = /[㐀-鿿][　-〿＀-￯]*|[^\s㐀-鿿]+|\s+/g;
  var CJK = /[\u3400-\u9FFF]/;
  var PUNCT = /^[\u3000-\u303F\uFF00-\uFFEF.,;:!?]+$/;
  var segmenter = null;
  try {
    segmenter = new Intl.Segmenter("zh", { granularity: "word" });
  } catch (e) {}
  /* Chinese is grouped into words where the browser can segment it, so lines break between words. */
  function units(text) {
    if (!segmenter || !CJK.test(text)) return text.match(UNIT) || [];
    var out = [];
    var segments = Array.from(segmenter.segment(text));
    for (var i = 0; i < segments.length; i++) {
      var piece = segments[i].segment;
      var last = out.length ? out[out.length - 1] : "";
      if (PUNCT.test(piece) && last && !/^\s+$/.test(last)) out[out.length - 1] += piece;
      else out.push(piece);
    }
    return out;
  }
  KL.split = function (el) {
    if (el.getAttribute("data-split") === "done") return;
    var byChar = el.hasAttribute("data-chars");
    var index = 0;
    (function walk(node) {
      var kids = [].slice.call(node.childNodes);
      for (var k = 0; k < kids.length; k++) {
        var kid = kids[k];
        if (kid.nodeType === 1) {
          walk(kid);
          continue;
        }
        if (kid.nodeType !== 3) continue;
        var parts = byChar ? kid.textContent.split("") : units(kid.textContent);
        var frag = document.createDocumentFragment();
        for (var p = 0; p < parts.length; p++) {
          if (/^\s+$/.test(parts[p])) {
            frag.appendChild(document.createTextNode(" "));
            continue;
          }
          var outer = document.createElement("span");
          outer.className = "sw";
          var inner = document.createElement("span");
          inner.textContent = parts[p];
          inner.style.setProperty("--i", index++);
          outer.appendChild(inner);
          frag.appendChild(outer);
        }
        node.replaceChild(frag, kid);
      }
    })(el);
    el.setAttribute("data-split", "done");
  };
  KL.splitAll = function () {
    var nodes = document.querySelectorAll(".sp");
    for (var i = 0; i < nodes.length; i++) KL.split(nodes[i]);
  };

  /* ---------- scroll reveal ---------- */
  KL.observe = function (elements, className, margin, onEnter) {
    var list = [].slice.call(elements);
    function enter(el) {
      el.classList.add(className);
      if (onEnter) onEnter(el);
    }
    if (!("IntersectionObserver" in window) || KL.reduced) {
      list.forEach(enter);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            io.unobserve(entries[i].target);
            enter(entries[i].target);
          }
        }
      },
      { rootMargin: margin || "0px 0px -10% 0px" },
    );
    list.forEach(function (el) {
      io.observe(el);
    });
  };
  /* Resolves once the element is on screen, so scripted demos do not run unseen. */
  KL.visible = function (el) {
    return new Promise(function (resolve) {
      if (!("IntersectionObserver" in window)) return resolve();
      var io = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              io.disconnect();
              resolve();
              return;
            }
          }
        },
        { threshold: 0.25 },
      );
      io.observe(el);
    });
  };

  /* ---------- pointer tilt ---------- */
  KL.tilt = function (el, maxDegrees) {
    if (KL.reduced || KL.touch) return;
    var max = maxDegrees || 3;
    var rx = 0,
      ry = 0,
      tx = 0,
      ty = 0,
      raf = 0;
    function frame() {
      rx += (tx - rx) * 0.1;
      ry += (ty - ry) * 0.1;
      el.style.transform =
        "perspective(1600px) rotateX(" + rx.toFixed(3) + "deg) rotateY(" + ry.toFixed(3) + "deg)";
      raf = Math.abs(tx - rx) + Math.abs(ty - ry) > 0.004 ? requestAnimationFrame(frame) : 0;
    }
    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    el.addEventListener("pointermove", function (event) {
      var r = el.getBoundingClientRect();
      ty = ((event.clientX - r.left) / r.width - 0.5) * 2 * max;
      tx = -((event.clientY - r.top) / r.height - 0.5) * 2 * max;
      kick();
    });
    el.addEventListener("pointerleave", function () {
      tx = ty = 0;
      kick();
    });
  };

  /* ---------- painted clouds ---------- */
  /* Value-noise clouds drawn on a low-resolution transparent canvas and scaled up soft, over a CSS
     sky gradient. getState(seconds) returns { lit, low, shade, cover, alpha, drift }: lit and low are
     the sunlit colours at the top and near the horizon, shade is the underside. */
  var PERM = new Uint8Array(512);
  (function () {
    var p = [];
    for (var i = 0; i < 256; i++) p.push(i);
    var seed = 20261111;
    for (var j = 255; j > 0; j--) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      var k = seed % (j + 1);
      var tmp = p[j];
      p[j] = p[k];
      p[k] = tmp;
    }
    for (var n = 0; n < 512; n++) PERM[n] = p[n & 255];
  })();
  function vnoise(x, y) {
    var xi = Math.floor(x),
      yi = Math.floor(y);
    var xf = x - xi,
      yf = y - yi;
    var u = xf * xf * (3 - 2 * xf),
      v = yf * yf * (3 - 2 * yf);
    xi &= 255;
    yi &= 255;
    var a = PERM[PERM[xi] + yi],
      b = PERM[PERM[xi + 1] + yi],
      c = PERM[PERM[xi] + yi + 1],
      d = PERM[PERM[xi + 1] + yi + 1];
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) / 255;
  }
  function fbm(x, y) {
    return (
      vnoise(x, y) * 0.5 +
      vnoise(x * 2.03 + 7.1, y * 2.03 + 3.7) * 0.26 +
      vnoise(x * 4.1 + 1.3, y * 4.1 + 9.2) * 0.15 +
      vnoise(x * 8.3 + 5.9, y * 8.3 + 2.4) * 0.09
    );
  }
  KL.clouds = function (canvas, getState, options) {
    var ctx = canvas.getContext("2d");
    var opts = options || {};
    var w, h, image;
    var visible = true;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      var scale = Math.max(3, rect.width / (opts.resolution || 440));
      w = canvas.width = Math.max(60, Math.round(rect.width / scale));
      h = canvas.height = Math.max(40, Math.round(rect.height / scale));
      image = ctx.createImageData(w, h);
    }
    function draw(time) {
      var st = getState(time / 1000);
      /* a layer the caller knows to be covered is left as it is */
      if (st.pause) return;
      var data = image.data;
      /* optional per-layer shape: feature size, and where the bank of cloud sits */
      var f = (st.freq || 2.3) / h;
      var base = st.base === undefined ? 0.4 : st.base;
      var gain = st.gain === undefined ? 0.3 : st.gain;
      var from = st.from === undefined ? 0.4 : st.from;
      if (st.alpha <= 0.004) {
        ctx.clearRect(0, 0, w, h);
        return;
      }
      for (var y = 0; y < h; y++) {
        var v = y / (h - 1);
        /* more cloud toward the horizon, wisps above */
        var bank = base + st.cover + gain * KL.smooth((v - from) / 0.5) - 0.1 * (1 - v);
        var warm = KL.smooth((v - 0.5) / 0.5);
        var lr = st.lit[0] + (st.low[0] - st.lit[0]) * warm,
          lg = st.lit[1] + (st.low[1] - st.lit[1]) * warm,
          lb = st.lit[2] + (st.low[2] - st.lit[2]) * warm;
        var ny = y * f * 1.75;
        for (var x = 0; x < w; x++) {
          var nx = x * f + st.drift;
          var n = fbm(nx, ny);
          var d = KL.smooth((n - (1 - bank)) / 0.13);
          var o = (y * w + x) * 4;
          if (d <= 0.002) {
            data[o + 3] = 0;
            continue;
          }
          /* light from the upper left: compare with the density a step toward the light */
          var lit = KL.clamp((n - fbm(nx - 0.07, ny - 0.11)) * 9 + 0.55, 0, 1);
          data[o] = st.shade[0] + (lr - st.shade[0]) * lit;
          data[o + 1] = st.shade[1] + (lg - st.shade[1]) * lit;
          data[o + 2] = st.shade[2] + (lb - st.shade[2]) * lit;
          data[o + 3] = d * st.alpha * 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    }
    var last = -1e9;
    function loop(time) {
      if (visible && time - last > (opts.interval || 66)) {
        last = time;
        draw(time);
      }
      requestAnimationFrame(loop);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }).observe(canvas);
    }
    window.addEventListener("resize", function () {
      resize();
      draw(performance.now());
    });
    resize();
    draw(0);
    if (!KL.reduced) requestAnimationFrame(loop);
    return { draw: draw };
  };

  /* ---------- star field ---------- */
  /* getAlpha() lets the caller fade the field in and out; nothing is drawn while it is zero. */
  KL.stars = function (canvas, getAlpha, density) {
    var ctx = canvas.getContext("2d");
    var stars = [];
    var w, h, dpr;
    var visible = true;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      stars = [];
      var count = Math.round((w * h) / (density || 5200));
      for (var i = 0; i < count; i++) {
        stars.push([
          Math.random() * w,
          Math.random() * h,
          0.4 + Math.random() * 1.1,
          Math.random() * 6.28,
          0.5 + Math.random(),
        ]);
      }
    }
    function draw(time) {
      var alpha = getAlpha();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (alpha <= 0.01) return;
      ctx.fillStyle = "#eaf4ff";
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var twinkle = KL.reduced
          ? 0.8
          : 0.35 + 0.65 * Math.abs(Math.sin((time / 1400) * s[4] + s[3]));
        ctx.globalAlpha = alpha * twinkle;
        ctx.beginPath();
        ctx.arc(s[0], s[1], s[2], 0, 6.28);
        ctx.fill();
      }
    }
    function loop(time) {
      if (visible) draw(time);
      requestAnimationFrame(loop);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
      }).observe(canvas);
    }
    window.addEventListener("resize", function () {
      resize();
      draw(0);
    });
    resize();
    draw(0);
    if (!KL.reduced) requestAnimationFrame(loop);
    return {
      resize: function () {
        resize();
        draw(0);
      },
      draw: draw,
    };
  };

  /* ---------- scripted terminal ---------- */
  /* targets: one <pre> or several (mirrored surfaces showing the same session). */
  KL.term = function (targets, options) {
    var els = [].concat(targets);
    var opts = options || {};
    var max = opts.max || 14;
    var lines = [];
    var pending = false;
    function render() {
      for (var i = 0; i < els.length; i++) {
        var limit = +els[i].getAttribute("data-rows") || max;
        els[i].innerHTML = lines.slice(-limit).join("\n");
      }
    }
    var api = {
      clear: function () {
        lines = [];
        pending = false;
        render();
      },
      prompt: function (html) {
        lines.push(html + '<i class="cur"></i>');
        pending = true;
        render();
      },
      type: async function (promptHtml, text, speed) {
        if (pending) lines.pop();
        pending = false;
        lines.push(promptHtml);
        var index = lines.length - 1;
        var step = KL.reduced ? text.length : 1;
        for (var k = step; k <= text.length; k += step) {
          lines[index] = promptHtml + KL.esc(text.slice(0, k)) + '<i class="cur"></i>';
          render();
          await KL.sleep((speed || 34) * (0.5 + Math.random()));
        }
        lines[index] = promptHtml + KL.esc(text);
        render();
      },
      out: async function (htmlLines, gap) {
        if (pending) lines.pop();
        pending = false;
        for (var i = 0; i < htmlLines.length; i++) {
          lines.push(htmlLines[i]);
          render();
          await KL.sleep(gap === undefined ? 60 : gap);
        }
      },
    };
    return api;
  };

  /* ---------- copy buttons ---------- */
  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-copy]");
    if (!button) return;
    var source = document.querySelector(button.getAttribute("data-copy"));
    if (!source) return;
    var text = source.textContent.replace(/^\n+|\n+$/g, "");
    var done = function () {
      var label = button.querySelector("[data-copy-label]") || button;
      var before = label.textContent;
      label.textContent = KL.t("已复制", "Copied");
      setTimeout(function () {
        label.textContent = before;
      }, 1400);
    };
    var fallback = function () {
      var range = document.createRange();
      range.selectNodeContents(source);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  });

  /* ---------- prototype switcher ---------- */
  /* On the page under development the bar switches variants in place; archived pages only link back. */
  var VARIANT_NAMES = {
    b: ["B 基准", "B Base"],
    b1: ["B1 贯线", "B1 Line"],
    b1s: ["B1 宋体标题", "B1 Serif"],
    b2: ["B2 暮色", "B2 Dusk"],
  };
  var ARCHIVED = {
    a: ["A 夜航 · 已归档", "A Night · archived"],
    c: ["C 昼夜 · 已归档", "C Day · archived"],
    b2: ["B2 暮色 · 已归档", "B2 Dusk · archived"],
  };
  function buildSwitcher() {
    var current = document.body.getAttribute("data-proto");
    if (!current) return;
    var bar = document.createElement("div");
    bar.className = "kl-switch";
    var html = '<a class="kl-switch-home" href="index.html" data-en="◂ Overview">◂ 总览</a>';
    if (ARCHIVED[current]) {
      html +=
        '<span class="kl-switch-note" data-en="' +
        ARCHIVED[current][1] +
        '">' +
        ARCHIVED[current][0] +
        "</span>";
    } else if (variants.length) {
      for (var i = 0; i < variants.length; i++) {
        var names = VARIANT_NAMES[variants[i]] || [variants[i], variants[i]];
        html +=
          '<button type="button" data-variant-pick="' +
          variants[i] +
          '" data-en="' +
          names[1] +
          '">' +
          names[0] +
          "</button>";
      }
    }
    html += '<button type="button" id="kl-lang" aria-label="Switch language">EN</button>';
    bar.innerHTML = html;
    document.body.appendChild(bar);
    var picks = [].slice.call(bar.querySelectorAll("[data-variant-pick]"));
    function mark() {
      picks.forEach(function (pick) {
        var on = pick.getAttribute("data-variant-pick") === KL.variant;
        pick.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    picks.forEach(function (pick) {
      pick.addEventListener("click", function () {
        KL.setVariant(pick.getAttribute("data-variant-pick"));
      });
    });
    document.addEventListener("kl:variant", mark);
    mark();
    var button = bar.querySelector("#kl-lang");
    button.addEventListener("click", function () {
      KL.setLang(KL.lang === "zh" ? "en" : "zh");
    });
    document.addEventListener("kl:lang", function () {
      button.textContent = KL.lang === "zh" ? "EN" : "中";
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildSwitcher();
    KL.setLang(KL.lang);
  });
})();
