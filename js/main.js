/* main.js: reveals, the specular highlight on every glass pane,
   nav state, and the motion switch. */
(function () {
  'use strict';

  var still = /[?&]still=1/.test(location.search);
  if (still) {
    document.documentElement.style.scrollBehavior = 'auto';
    var kill = document.createElement('style');
    kill.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
    document.head.appendChild(kill);
    var sm = /[?&]scroll=(\d+)/.exec(location.search);
    if (sm) {
      var main = document.getElementById('main');
      if (main) main.style.marginTop = '-' + parseInt(sm[1], 10) + 'px';
    }
  }
  var reduced = still || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── reveal on entry ─────────────────────────────────────── */
  var reveals = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
    // The hero should already be settling as the page paints.
    requestAnimationFrame(function () {
      document.querySelectorAll('.hero .reveal').forEach(function (el) { el.classList.add('in'); });
    });
  }

  /* ── specular highlight: light source is the cursor ──────── */
  var panes = document.querySelectorAll('.glass');
  if (!reduced) {
    document.addEventListener('pointermove', function (e) {
      for (var i = 0; i < panes.length; i++) {
        var el = panes[i];
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) continue;
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }
    }, { passive: true });
  }

  /* ── nav: mark the section you're reading ────────────────── */
  var railLinks = document.querySelectorAll('.rail a[href^="#"]');
  var sections = [];
  Array.prototype.forEach.call(railLinks, function (a) {
    var s = document.querySelector(a.getAttribute('href'));
    if (s) sections.push({ link: a, el: s });
  });

  if (sections.length && 'IntersectionObserver' in window) {
    var navIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var match = sections.filter(function (s) { return s.el === e.target; })[0];
        if (!match) return;
        if (e.isIntersecting) {
          sections.forEach(function (s) { s.link.classList.remove('is-current'); });
          match.link.classList.add('is-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { navIo.observe(s.el); });
  }

  /* ── motion switch ───────────────────────────────────────── */
  var toggle = document.getElementById('motionToggle');
  var label = document.getElementById('motionLabel');
  if (toggle) {
    var setState = function (paused) {
      toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
      label.textContent = paused ? 'Motion off' : 'Motion on';
      if (window.__flow) window.__flow.setPaused(paused);
      document.body.classList.toggle('motion-paused', paused);
    };
    setState(reduced);
    toggle.addEventListener('click', function () {
      setState(toggle.getAttribute('aria-pressed') !== 'true');
    });
  }
})();
