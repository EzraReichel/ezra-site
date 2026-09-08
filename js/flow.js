/* flow.js — the iridescent surface everything else refracts.
   A full-screen fragment shader: domain-warped flow, thin-film colour,
   and a pointer that pushes the liquid around. Degrades to CSS if WebGL is out. */
(function () {
  'use strict';

  var canvas = document.getElementById('flow');
  if (!canvas) return;

  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
        || canvas.getContext('experimental-webgl', { antialias: false, alpha: false });

  if (!gl) { document.body.classList.add('no-gl'); return; }

  var VERT = [
    'attribute vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2  uRes;',
    'uniform float uTime;',
    'uniform vec3  uPointer;',      // xy in pixels, z = presence 0..1
    'uniform vec2  uVel;',          // smoothed pointer velocity
    'uniform vec4  uRipple[3];',    // xy pos, z age (s), w strength
    'uniform float uScroll;',
    'uniform float uIntro;',

    // -- value noise ------------------------------------------------------
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
    'float noise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x),',
    '             mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);',
    '}',
    'const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);',
    'float fbm3(vec2 p){',
    '  float v = 0.0, a = 0.5;',
    '  for (int i = 0; i < 3; i++) { v += a * noise(p); p = ROT * p * 2.04; a *= 0.5; }',
    '  return v;',
    '}',
    'float fbm4(vec2 p){',
    '  float v = 0.0, a = 0.5;',
    '  for (int i = 0; i < 4; i++) { v += a * noise(p); p = ROT * p * 2.02; a *= 0.5; }',
    '  return v;',
    '}',

    // -- palette ----------------------------------------------------------
    // Pale gold, sea glass, dusk violet, blush. Held near the top of the
    // value range so the page stays porcelain rather than painted.
    'vec3 palette(float t, float sheen){',
    '  vec3 aurum = vec3(0.937, 0.851, 0.639);',
    '  vec3 verre = vec3(0.545, 0.816, 0.804);',
    '  vec3 dusk  = vec3(0.616, 0.573, 0.925);',
    '  vec3 rose  = vec3(0.965, 0.686, 0.729);',
    '  vec3 c = mix(aurum, verre, smoothstep(0.02, 0.46, t));',
    '  c = mix(c, dusk, smoothstep(0.38, 0.80, t));',
    '  c = mix(c, rose, smoothstep(0.68, 1.0, t) * 0.85);',
    // thin-film interference riding the gradient
    '  vec3 film = 0.5 + 0.5 * cos(6.28318 * (vec3(0.00, 0.33, 0.67) + sheen * 0.45));',
    '  c = mix(c, film, 0.11);',
    '  float lum = dot(c, vec3(0.299, 0.587, 0.114));',
    '  return clamp(mix(vec3(lum), c, 1.30), 0.0, 1.0);',
    '}',

    'void main(){',
    '  vec2 frag = gl_FragCoord.xy;',
    '  vec2 uv = frag / uRes;',
    '  float aspect = uRes.x / uRes.y;',
    '  vec2 p = vec2(uv.x * aspect, uv.y);',
    '  float t = uTime * 0.045;',

    // pointer lens: the liquid bulges away from the cursor and drags behind it
    '  vec2 pp = vec2(uPointer.x / uRes.y, uPointer.y / uRes.y);',
    '  vec2 d = p - pp;',
    '  float dist = length(d);',
    '  float lens = exp(-dist * dist * 11.0) * uPointer.z;',
    '  p += normalize(d + 1e-5) * lens * 0.085;',
    '  p -= uVel * lens * 0.6;',

    // ripples shed as the pointer travels
    '  for (int i = 0; i < 3; i++) {',
    '    vec4 r = uRipple[i];',
    '    if (r.w > 0.001) {',
    '      vec2 rp = vec2(r.x / uRes.y, r.y / uRes.y);',
    '      float rd = length(p - rp);',
    '      float ring = sin(rd * 30.0 - r.z * 5.6) * exp(-rd * 6.0) * exp(-r.z * 1.6);',
    '      p += normalize(p - rp + 1e-5) * ring * 0.034 * r.w;',
    '    }',
    '  }',

    '  p += vec2(0.0, uScroll * 0.11);',

    // domain warp — two passes, so the flow folds over itself
    '  vec2 q = vec2(fbm3(p * 1.8 + vec2(0.0, t)), fbm3(p * 1.8 + vec2(5.2, 1.3 - t)));',
    '  vec2 r2 = vec2(fbm3(p * 2.1 + q * 1.8 + vec2(1.7, 9.2) + t * 1.25),',
    '                 fbm3(p * 2.1 + q * 1.8 + vec2(8.3, 2.8) - t * 0.95));',
    '  float f = fbm4(p * 2.2 + r2 * 1.6);',

    // caustics — thin bright veins where the flow field folds
    '  float vein = 1.0 - abs(2.0 * fbm3(p * 3.5 + r2 * 2.2 + t * 0.6) - 1.0);',
    '  vein = pow(clamp(vein, 0.0, 1.0), 9.0);',

    // where colour is allowed to gather at all — keeps large porcelain rests
    '  float mask = smoothstep(0.24, 0.78, fbm3(p * 0.85 + vec2(t * 0.7, -t * 0.45)));',

    '  float sheen = f * 0.55 + length(r2 - 0.5) * 0.7 + lens * 0.35;',
    '  float tone = clamp((f - 0.42) * 2.55 + 0.36, 0.0, 1.0);',
    '  vec3 col = palette(tone, sheen);',

    // a surface normal inferred from the flow, lit from upper left
    '  vec2 g = (r2 - vec2(0.5)) * 2.2;',
    '  vec3 n = normalize(vec3(-g.x, -g.y, 0.85));',
    '  vec3 L = normalize(vec3(-0.45, 0.62, 0.65));',
    '  float diff = 0.86 + 0.20 * dot(n, L);',
    '  float spec = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 16.0);',

    // lift toward porcelain — colour is a suggestion, not a wash
    '  vec3 ground = vec3(0.957, 0.961, 0.973);',
    '  float presence = (0.20 + 0.52 * smoothstep(0.14, 0.96, f)) * (0.42 + 0.72 * mask);',
    '  col = mix(ground, col * diff, clamp(presence, 0.0, 0.90) * uIntro);',

    '  col += vec3(1.0) * vein * 0.085 * (0.35 + mask);',
    '  col += vec3(1.0, 0.99, 0.96) * spec * 0.13;',
    '  col += vec3(1.0) * lens * 0.09;',

    // gentle top-light so the head of the page stays airy
    '  col += (1.0 - uv.y) * 0.014;',

    // dither to kill banding across wide flats
    '  float dith = (hash(frag + fract(uTime)) - 0.5) / 220.0;',
    '  gl_FragColor = vec4(clamp(col + dith, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('flow: shader failed —', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { document.body.classList.add('no-gl'); return; }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { document.body.classList.add('no-gl'); return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var U = {
    res:     gl.getUniformLocation(prog, 'uRes'),
    time:    gl.getUniformLocation(prog, 'uTime'),
    pointer: gl.getUniformLocation(prog, 'uPointer'),
    vel:     gl.getUniformLocation(prog, 'uVel'),
    ripple:  gl.getUniformLocation(prog, 'uRipple'),
    scroll:  gl.getUniformLocation(prog, 'uScroll'),
    intro:   gl.getUniformLocation(prog, 'uIntro')
  };

  // ---- state -----------------------------------------------------------
  var dpr = 1, W = 0, H = 0;
  var target = { x: 0, y: 0 }, cursor = { x: 0, y: 0 }, prev = { x: 0, y: 0 };
  var vel = { x: 0, y: 0 };
  var presence = 0, wanted = 0;
  var ripples = [ {x:0,y:0,t:-9,s:0}, {x:0,y:0,t:-9,s:0}, {x:0,y:0,t:-9,s:0} ];
  var rIndex = 0, lastShed = 0;
  var scroll = 0, intro = 0, start = performance.now(), clock = 0, last = start;
  var running = true;
  var still = /[?&]still=1/.test(location.search);
  var stillFrames = 0;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var paused = reduced.matches;

  function resize() {
    var maxDpr = window.innerWidth > 1600 ? 1.25 : 1.5;
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    W = Math.floor(window.innerWidth * dpr);
    H = Math.floor(window.innerHeight * dpr);
    canvas.width = W; canvas.height = H;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    gl.viewport(0, 0, W, H);
    if (!target.x && !target.y) {
      target.x = cursor.x = prev.x = W * 0.5;
      target.y = cursor.y = prev.y = H * 0.62;
    }
  }

  function pointerAt(clientX, clientY) {
    target.x = clientX * dpr;
    target.y = (window.innerHeight - clientY) * dpr;
    wanted = 1;
    var now = performance.now();
    if (now - lastShed > 150) {
      lastShed = now;
      var r = ripples[rIndex];
      r.x = target.x; r.y = target.y; r.t = clock; r.s = 1;
      rIndex = (rIndex + 1) % ripples.length;
    }
  }

  window.addEventListener('pointermove', function (e) { pointerAt(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('pointerdown', function (e) {
    pointerAt(e.clientX, e.clientY);
    lastShed = 0;
    pointerAt(e.clientX, e.clientY);
  }, { passive: true });
  window.addEventListener('pointerleave', function () { wanted = 0; }, { passive: true });
  window.addEventListener('blur', function () { wanted = 0; });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', function () {
    scroll = window.scrollY / Math.max(1, window.innerHeight);
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) clock += dt;
    intro += (1 - intro) * dt * 1.1;

    cursor.x += (target.x - cursor.x) * 0.10;
    cursor.y += (target.y - cursor.y) * 0.10;
    vel.x = (cursor.x - prev.x) / Math.max(1, H);
    vel.y = (cursor.y - prev.y) / Math.max(1, H);
    prev.x = cursor.x; prev.y = cursor.y;
    presence += (wanted - presence) * 0.06;

    gl.uniform2f(U.res, W, H);
    gl.uniform1f(U.time, clock);
    gl.uniform3f(U.pointer, cursor.x, cursor.y, presence);
    gl.uniform2f(U.vel, vel.x * 6.0, vel.y * 6.0);
    gl.uniform1f(U.scroll, scroll);
    gl.uniform1f(U.intro, Math.min(1, intro * 1.2));

    var flat = new Float32Array(12);
    for (var i = 0; i < 3; i++) {
      var r = ripples[i];
      var age = clock - r.t;
      var alive = age < 4 ? r.s : 0;
      flat[i*4] = r.x; flat[i*4+1] = r.y; flat[i*4+2] = age; flat[i*4+3] = alive;
    }
    gl.uniform4fv(U.ripple, flat);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (still && ++stillFrames > 200) return;
    requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);

  // Motion control, shared with the footer toggle in main.js
  window.__flow = {
    setPaused: function (v) { paused = !!v; },
    isPaused: function () { return paused; }
  };
  if (reduced.addEventListener) {
    reduced.addEventListener('change', function (e) { paused = e.matches; });
  }
})();
