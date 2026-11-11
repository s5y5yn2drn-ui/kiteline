/* Shared helpers for the Kiteline homepage prototypes: language toggle, prototype switcher,
   scripted terminal playback, copy buttons. No dependencies. */
(function () {
  "use strict";
  var KL = (window.KL = {});
  var root = document.documentElement;

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
    }
    try {
      localStorage.setItem("kiteline.proto.lang", lang);
    } catch (e) {}
    document.dispatchEvent(new CustomEvent("kl:lang", { detail: lang }));
  };
  KL.t = function (zh, en) {
    return KL.lang === "zh" ? zh : en;
  };

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
  KL.esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  /* Wait until an element is on screen, so scripted demos do not run unseen. */
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
        { threshold: 0.2 },
      );
      io.observe(el);
    });
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
          if (opts.onKey) opts.onKey();
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
    var text = source.innerText;
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
  var PAGES = [
    { id: "a", file: "a-night.html", zh: "A 夜航", en: "A Night" },
    { id: "b", file: "b-sky.html", zh: "B 晴空", en: "B Sky" },
    { id: "c", file: "c-day.html", zh: "C 昼夜", en: "C Day" },
  ];
  function buildSwitcher() {
    var current = document.body.getAttribute("data-proto");
    if (!current) return;
    var bar = document.createElement("div");
    bar.className = "kl-switch";
    var html = '<a class="kl-switch-home" href="index.html" title="Overview">◂</a>';
    for (var i = 0; i < PAGES.length; i++) {
      var p = PAGES[i];
      html +=
        '<a href="' +
        p.file +
        '"' +
        (p.id === current ? ' aria-current="page"' : "") +
        ' data-en="' +
        p.en +
        '">' +
        p.zh +
        "</a>";
    }
    html += '<button type="button" id="kl-lang" aria-label="Switch language">EN</button>';
    bar.innerHTML = html;
    document.body.appendChild(bar);
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
