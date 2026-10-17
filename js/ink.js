/* ink.js: wet ink on paper.
   A stable-fluids simulation (advect, project, advect) in WebGL2, rendered
   as sumi-e ink: granulation from a paper fibre field, a darker rim where the
   ink dries at its edge. The pointer is a brush. Scrolling drags the sheet.
   On load, one horizontal stroke: 一, the first chapter.
   If WebGL2 or float render targets are missing, the body gets .no-ink and
   the CSS paper takes over. */
(function () {
  'use strict';

  var canvas = document.getElementById('ink');
  if (!canvas) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  var ext = gl && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  if (!gl || !ext || reduce) { document.body.classList.add('no-ink'); window.Ink = { supported: !!(gl && ext), start: function () {}, stop: function () {} }; return; }

  var isTouch = window.matchMedia('(hover: none)').matches;
  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  // ── shaders ──────────────────────────────────────────────────────────
  var VERT = '#version 300 es\n' +
    'precision highp float;\n' +
    'in vec2 aPos; out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;\n' +
    'uniform vec2 uTexel;\n' +
    'void main(){ vUv = aPos*0.5+0.5; vL = vUv - vec2(uTexel.x,0.); vR = vUv + vec2(uTexel.x,0.);\n' +
    '  vT = vUv + vec2(0.,uTexel.y); vB = vUv - vec2(0.,uTexel.y); gl_Position = vec4(aPos,0.,1.); }';

  var HEAD = '#version 300 es\nprecision highp float; precision highp sampler2D;\n' +
    'in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB; out vec4 o;\n';

  var FRAG = {
    splat: HEAD +
      'uniform sampler2D uTarget; uniform float uAspect; uniform vec2 uPoint; uniform vec3 uColor; uniform float uRadius;\n' +
      'void main(){ vec2 p = vUv - uPoint; p.x *= uAspect; float s = exp(-dot(p,p)/uRadius);\n' +
      '  o = vec4(texture(uTarget, vUv).xyz + uColor * s, 1.0); }',

    advect: HEAD +
      'uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 uTexel; uniform float uDt; uniform float uDissipation; uniform vec2 uForce;\n' +
      'void main(){ vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;\n' +
      '  vec4 r = texture(uSource, coord); o = vec4(r.xyz * uDissipation + vec3(uForce, 0.0), 1.0); }',

    divergence: HEAD +
      'uniform sampler2D uVelocity;\n' +
      'void main(){ float L = texture(uVelocity, vL).x; float R = texture(uVelocity, vR).x;\n' +
      '  float T = texture(uVelocity, vT).y; float B = texture(uVelocity, vB).y; vec2 C = texture(uVelocity, vUv).xy;\n' +
      '  if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x; if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;\n' +
      '  o = vec4(0.5 * (R - L + T - B), 0., 0., 1.); }',

    pressure: HEAD +
      'uniform sampler2D uPressure; uniform sampler2D uDivergence;\n' +
      'void main(){ float L = texture(uPressure, vL).x; float R = texture(uPressure, vR).x; float T = texture(uPressure, vT).x; float B = texture(uPressure, vB).x;\n' +
      '  float d = texture(uDivergence, vUv).x; o = vec4((L + R + B + T - d) * 0.25, 0., 0., 1.); }',

    gradient: HEAD +
      'uniform sampler2D uPressure; uniform sampler2D uVelocity;\n' +
      'void main(){ float L = texture(uPressure, vL).x; float R = texture(uPressure, vR).x; float T = texture(uPressure, vT).x; float B = texture(uPressure, vB).x;\n' +
      '  vec2 v = texture(uVelocity, vUv).xy; v -= vec2(R - L, T - B); o = vec4(v, 0., 1.); }',

    display: HEAD +
      'uniform sampler2D uDye; uniform vec2 uRes; uniform vec3 uPaper; uniform vec3 uInk;\n' +
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }\n' +
      'float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);\n' +
      '  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }\n' +
      'void main(){\n' +
      '  vec2 px = vUv * uRes;\n' +
      '  float fibre = noise(px * 0.9) * 0.55 + noise(px * 0.23) * 0.3 + noise(px * 0.06) * 0.15;\n' +
      '  float d = max(texture(uDye, vUv).x, 0.0);\n' +
      '  float ink = 1.0 - exp(-d * 1.7);\n' +
      '  ink *= 0.82 + 0.36 * (fibre - 0.5);\n' +
      '  float rim = smoothstep(0.0, 0.10, d) * (1.0 - smoothstep(0.10, 0.55, d));\n' +
      '  ink += rim * 0.22 * (0.6 + 0.8 * fibre);\n' +
      '  ink = clamp(ink, 0.0, 1.0) * 0.52;\n' +
      '  vec3 paper = uPaper + (fibre - 0.5) * 0.028;\n' +
      '  o = vec4(mix(paper, uInk, ink), 1.0); }'
  };

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  var vert = compile(gl.VERTEX_SHADER, VERT);
  function program(fs) {
    var f = compile(gl.FRAGMENT_SHADER, fs); if (!f || !vert) return null;
    var p = gl.createProgram(); gl.attachShader(p, vert); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p: p, u: u };
  }
  var P = {};
  for (var k in FRAG) { P[k] = program(FRAG[k]); if (!P[k]) { document.body.classList.add('no-ink'); return; } }

  // fullscreen quad
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // ── targets ──────────────────────────────────────────────────────────
  function target(w, h, internal, format) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.HALF_FLOAT, null);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { t: t, fb: fb, w: w, h: h, texel: [1 / w, 1 / h], bind: function (unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); return unit; } };
  }
  function pair(w, h, internal, format) {
    var a = target(w, h, internal, format), b = target(w, h, internal, format);
    return { get r() { return a; }, get w() { return b; }, swap: function () { var t = a; a = b; b = t; }, texel: a.texel, width: w, height: h };
  }

  var vel, dye, div, pre, W, H;
  function size() {
    W = Math.max(1, Math.floor(canvas.clientWidth * DPR));
    H = Math.max(1, Math.floor(canvas.clientHeight * DPR));
    canvas.width = W; canvas.height = H;
    var aspect = W / H;
    var simLong = isTouch ? 128 : 176, dyeLong = isTouch ? 512 : 800;
    var sw = aspect >= 1 ? simLong : Math.round(simLong * aspect), sh = aspect >= 1 ? Math.round(simLong / aspect) : simLong;
    var dw = aspect >= 1 ? dyeLong : Math.round(dyeLong * aspect), dh = aspect >= 1 ? Math.round(dyeLong / aspect) : dyeLong;
    vel = pair(sw, sh, gl.RG16F, gl.RG);
    div = target(sw, sh, gl.R16F, gl.RED);
    pre = pair(sw, sh, gl.R16F, gl.RED);
    dye = pair(dw, dh, gl.R16F, gl.RED);
  }
  size();

  function draw(prog, dst) {
    gl.useProgram(prog.p);
    if (dst) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h); gl.uniform2f(prog.u.uTexel, dst.texel[0], dst.texel[1]); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.uniform2f(prog.u.uTexel, 1 / W, 1 / H); }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ── brush ────────────────────────────────────────────────────────────
  var aspect = function () { return W / H; };
  function splat(x, y, dx, dy, amount, radius) {
    // x,y in 0..1 (y up); dx,dy in sim texels/s; amount is ink
    var p = P.splat;
    gl.useProgram(p.p);
    gl.uniform1f(p.u.uAspect, aspect());
    gl.uniform2f(p.u.uPoint, x, y);
    gl.uniform1i(p.u.uTarget, vel.r.bind(0));
    gl.uniform3f(p.u.uColor, dx, dy, 0);
    gl.uniform1f(p.u.uRadius, radius * 1.6);
    draw(p, vel.w); vel.swap();
    gl.uniform1i(p.u.uTarget, dye.r.bind(0));
    gl.uniform3f(p.u.uColor, amount, 0, 0);
    gl.uniform1f(p.u.uRadius, radius);
    draw(p, dye.w); dye.swap();
  }

  var scrollForce = 0, lastScroll = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY; scrollForce += (y - lastScroll); lastScroll = y;
  }, { passive: true });

  var pointer = { x: 0, y: 0, px: 0, py: 0, down: false, moved: false, t: 0 };
  function onMove(e) {
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
    if (!pointer.moved) { pointer.px = x; pointer.py = y; pointer.moved = true; }
    pointer.x = x; pointer.y = y; pointer.t = performance.now();
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', function (e) { pointer.down = true; onMove(e); pointer.px = pointer.x; pointer.py = pointer.y; }, { passive: true });
  window.addEventListener('pointerup', function () { pointer.down = false; }, { passive: true });

  // ── the first stroke: 一 ─────────────────────────────────────────────
  var stroke = { t0: 0, dur: 1500, done: false, last: 0 };
  function strokeAt(u) {
    // a horizontal stroke with a pressed start, a thin belly and a pressed finish
    var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    var x = 0.26 + 0.60 * e;
    var y = 0.60 - 0.03 * e + 0.006 * Math.sin(u * 9.0);
    var press = 1.0 + 0.45 * Math.exp(-Math.pow((u - 0.05) / 0.09, 2)) + 0.4 * Math.exp(-Math.pow((u - 0.96) / 0.07, 2)) - 0.3 * Math.exp(-Math.pow((u - 0.55) / 0.25, 2));
    return { x: x, y: y, press: press };
  }

  // ── loop ─────────────────────────────────────────────────────────────
  var running = true, last = performance.now(), frame = 0;
  function step(now) {
    if (!running) return;
    requestAnimationFrame(step);
    if (document.hidden) return;
    frame++;
    if (isTouch && frame % 2) return;
    var dt = Math.min((now - last) / 1000, 1 / 30); last = now;

    // brush from the pointer
    if (pointer.moved) {
      var dx = pointer.x - pointer.px, dy = pointer.y - pointer.py;
      var speed = Math.hypot(dx * aspect(), dy);
      if (speed > 0.0004) {
        var amt = Math.min(speed * 26, 0.9) * (pointer.down ? 1.6 : 1.0);
        splat(pointer.x, pointer.y, dx * 5200, dy * 5200, amt, 0.0022 + Math.min(speed, 0.03) * 0.03);
      }
      pointer.px = pointer.x; pointer.py = pointer.y;
    }

    // the opening stroke
    if (!stroke.done) {
      if (!stroke.t0) stroke.t0 = now + 350;
      var u = (now - stroke.t0) / stroke.dur;
      if (u >= 1) stroke.done = true;
      else if (u >= 0) {
        var n = Math.max(1, Math.ceil((u - stroke.last) * 60));
        for (var i = 1; i <= n; i++) {
          var uu = stroke.last + (u - stroke.last) * (i / n);
          var s = strokeAt(uu), s2 = strokeAt(Math.min(uu + 0.01, 1));
          splat(s.x, s.y, (s2.x - s.x) * 260, (s2.y - s.y) * 260, 1.1 * s.press, 0.00075 * s.press * s.press);
        }
        stroke.last = u;
      }
    }

    // scroll drags the sheet
    var force = 0;
    if (Math.abs(scrollForce) > 0.5) { force = Math.max(-90, Math.min(90, scrollForce * 0.55)); scrollForce *= 0.35; }

    // advect velocity (+ scroll force), project, advect dye
    var a = P.advect;
    gl.useProgram(a.p);
    gl.uniform1f(a.u.uDt, dt);
    gl.uniform1i(a.u.uVelocity, vel.r.bind(0));
    gl.uniform1i(a.u.uSource, vel.r.bind(0));
    gl.uniform1f(a.u.uDissipation, 0.985);
    gl.uniform2f(a.u.uForce, 0, force);
    draw(a, vel.w); vel.swap();

    var d = P.divergence; gl.useProgram(d.p); gl.uniform1i(d.u.uVelocity, vel.r.bind(0)); draw(d, div);
    var pr = P.pressure; gl.useProgram(pr.p); gl.uniform1i(pr.u.uDivergence, div.bind(1));
    for (var j = 0; j < 16; j++) { gl.uniform1i(pr.u.uPressure, pre.r.bind(0)); draw(pr, pre.w); pre.swap(); }
    var g = P.gradient; gl.useProgram(g.p); gl.uniform1i(g.u.uPressure, pre.r.bind(0)); gl.uniform1i(g.u.uVelocity, vel.r.bind(1)); draw(g, vel.w); vel.swap();

    gl.useProgram(a.p);
    gl.uniform1i(a.u.uVelocity, vel.r.bind(0));
    gl.uniform1i(a.u.uSource, dye.r.bind(1));
    gl.uniform1f(a.u.uDissipation, 0.989);
    gl.uniform2f(a.u.uForce, 0, 0);
    draw(a, dye.w); dye.swap();

    // paint
    var ds = P.display; gl.useProgram(ds.p);
    gl.uniform1i(ds.u.uDye, dye.r.bind(0));
    gl.uniform2f(ds.u.uRes, W, H);
    gl.uniform3f(ds.u.uPaper, 0.925, 0.929, 0.914);
    gl.uniform3f(ds.u.uInk, 0.071, 0.078, 0.094);
    draw(ds, null);
  }
  requestAnimationFrame(step);

  var resizeT;
  window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(size, 120); });

  window.Ink = {
    supported: true,
    stop: function () { running = false; document.body.classList.add('no-ink'); },
    start: function () { if (running) return; running = true; last = performance.now(); document.body.classList.remove('no-ink'); requestAnimationFrame(step); }
  };
})();
