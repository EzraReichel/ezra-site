/* main.js: chapter reveals, nav state, the motion switch. */
(function () {
  'use strict';

  // ── reveals ─────────────────────────────────────────────────────────
  var chaps = Array.prototype.slice.call(document.querySelectorAll('.chap'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    chaps.forEach(function (c) { io.observe(c); });
  } else { chaps.forEach(function (c) { c.classList.add('in'); }); }
  // the hero is on screen already
  var hero = document.getElementById('hero'); if (hero) setTimeout(function () { hero.classList.add('in'); }, 80);

  // ── nav state ───────────────────────────────────────────────────────
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a'));
  if (links.length && 'IntersectionObserver' in window) {
    var current = null;
    var nio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        links.forEach(function (a) { a.removeAttribute('aria-current'); if (a.getAttribute('href') === '#' + id) { a.setAttribute('aria-current', 'true'); current = id; } });
      });
    }, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });
    chaps.forEach(function (c) { nio.observe(c); });
  }

  // ── the motion switch ───────────────────────────────────────────────
  var toggle = document.getElementById('motion-toggle');
  if (toggle) {
    var KEY = 'ezra-ink';
    var still = false;
    try { still = localStorage.getItem(KEY) === 'still'; } catch (e) {}
    var apply = function () {
      if (!window.Ink) return;
      if (still) { window.Ink.stop(); toggle.textContent = 'Let the ink move'; toggle.setAttribute('aria-pressed', 'true'); }
      else { window.Ink.start(); toggle.textContent = 'Still the ink'; toggle.setAttribute('aria-pressed', 'false'); }
    };
    if (!window.Ink || !window.Ink.supported) { toggle.hidden = true; }
    else { apply(); }
    toggle.addEventListener('click', function () {
      still = !still;
      try { localStorage.setItem(KEY, still ? 'still' : 'move'); } catch (e) {}
      apply();
    });
  }
})();
