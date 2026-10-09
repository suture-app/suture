// Suture scan orb: the status light on the Smart Scan card. No libraries, no network, no keys.
// States: idle (slow breathing) -> working (the sphere fills with light as the scan really progresses) -> done / error
// (particles gather into the result for a few seconds; the result also stays as plain text next to the orb).
// WebGL points, all motion on the GPU; a 2D canvas with the same maths and fewer particles when WebGL is missing or lost.
// Cheap by design: low-power GPU hint, 24 fps idle / 60 fps scanning, adaptive particle count, stops when the tab is hidden,
// scrolled out of view or the card is gone, one static picture under prefers-reduced-motion. Off with  "orb": false  in config.json.
(function () {
  'use strict';
  const HOLD = 4500;                                   // ms the particles hold the result text
  const FPS_IDLE = 24, FPS_BUSY = 60;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const norm = document.createElement('canvas').getContext('2d');   // turns any CSS colour into #rrggbb
  const rgb = s => { norm.fillStyle = '#000'; norm.fillStyle = String(s || '').trim() || '#000'; const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(norm.fillStyle); return m ? [1, 2, 3].map(i => parseInt(m[i], 16) / 255) : null; };
  const txt = document.createElement('canvas');        // reused for the result text
  const R_ = { c1: [.2, .84, .71], c2: [.49, .77, 1], bad: [1, .42, .42] };

  let cv, box, gl, ctx, seedBuf, big = false, N = 0, nMax = 0, q = 1, seed, prog, loc, tgtBuf, spr = [], tgt = null;
  let W = 0, H = 0, R = 0, dpr = 1, dark = true, enabled, visible = true, lost = false, lostTimer = 0, ro, io;
  let state = 'idle', pg = 0, pgTarget = 0, label = '', result = null, textOk = false, said = '';
  let w = 0, lw = 0, b = 0, bTarget = 0, tint = 0, pulse = 0, doneAt = 0, raf = 0, last = 0, slow = 0, cost = 0;
  const t0 = performance.now();

  // ---------- colours ----------
  function colours() {
    if (!cv) return;
    const c = getComputedStyle(document.documentElement), th = document.documentElement.dataset.theme;
    dark = th ? th === 'dark' : scheme.matches;
    R_.c1 = rgb(c.getPropertyValue('--accent')) || R_.c1; R_.c2 = rgb(c.getPropertyValue('--accent-2')) || R_.c2; R_.bad = rgb(c.getPropertyValue('--warn')) || R_.bad;
    spr = [];   // 2D sprites are rebuilt on demand
    if (reduce.matches) still();
  }
  const mix = (a, b2, t) => a.map((v, i) => v + (b2[i] - v) * t);

  // ---------- result text -> target points ----------
  function textPoints(ls, n) {
    const S = 2; txt.width = W * S; txt.height = H * S; const c = txt.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, txt.width, txt.height); c.fillStyle = '#000'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const fam = getComputedStyle(document.body).getPropertyValue('--display') || 'Segoe UI, sans-serif';
    const size = ls.map((s, i) => { let f = Math.round(H * (i ? .125 : .21)); c.font = `700 ${f * S}px ${fam}`; while (c.measureText(s).width > (W - 16) * S && f > 10) c.font = `700 ${--f * S}px ${fam}`; return f; });
    const gap = 8, total = size.reduce((a, f) => a + f, 0) + gap * (ls.length - 1); let y = (H - total) / 2;
    ls.forEach((s, i) => { c.font = `700 ${size[i] * S}px ${fam}`; c.fillText(s, W * S / 2, (y + size[i] / 2) * S); y += size[i] + gap; });
    const d = c.getImageData(0, 0, txt.width, txt.height).data, pts = [];
    for (let i = 3; i < d.length; i += 4) if (d[i] > 120) { const p = (i - 3) / 4; pts.push([(p % txt.width) / S - W / 2, H / 2 - Math.floor(p / txt.width) / S]); }
    const out = new Float32Array(n * 2); if (!pts.length) return out;
    for (let i = 0; i < n; i++) { const p = pts[(i * 7919) % pts.length]; out[i * 2] = p[0] + (Math.random() - .5) * .6; out[i * 2 + 1] = p[1] + (Math.random() - .5) * .6; }
    return out;
  }
  function setTargets() {
    if (!result || !N) return;
    tgt = textPoints(result, N);
    if (gl && !lost) { gl.bindBuffer(gl.ARRAY_BUFFER, tgtBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, tgt); }
  }

  // ---------- WebGL ----------
  const VS = `attribute vec4 s; attribute vec2 g; uniform float t,w,lw,b,dpr,R,p; uniform vec2 res; varying float a; varying float k; varying float mm;
void main(){ float th=s.x,ph=s.y,r1=s.z,r2=s.w;
 th+=t*(.075+.55*w)*(.6+.8*r2)+w*.35*sin(t*2.+ph*3.+r1*6.);
 float rad=R*(1.+.035*sin(t*1.6)*(1.+2.*w))*(.9+.1*r1)*(1.+w*.08*sin(t*3.+r2*20.));
 vec3 q=vec3(sin(ph)*cos(th),cos(ph),sin(ph)*sin(th))*rad;
 q.yz=vec2(q.y*.94-q.z*.34,q.y*.34+q.z*.94);
 vec2 o=q.xy/(1.-q.z/(R*4.));
 float m=clamp((b-r1*.35)/.65,0.,1.); m=m*m*(3.-2.*m);
 vec2 pos=mix(o,g,m)+normalize(o+.001)*sin(3.14159*m)*R*.6*r2;
 gl_Position=vec4(pos/(res*.5),0.,1.);
 float d=.5+.5*q.z/R;
 float h=.5+.5*q.y/R;
 float lit=mix(1.,.2+.8*smoothstep(p+.05,p-.05,h),lw);
 gl_PointSize=max(1.5,dpr*mix((1.2+2.4*d)*(.75+.5*lit),1.9,m));
 a=mix((.2+.7*d)*lit,.95,m); k=r2; mm=m; }`;
  const FS = `precision mediump float; uniform vec3 c1,c2; varying float a; varying float k; varying float mm;
void main(){ float d=length(gl_PointCoord-.5)*2.; if(d>1.) discard;
 float f=smoothstep(1.,mix(.1,.55,mm),d); gl_FragColor=vec4(mix(c1,c2,k*.7)*a*f,a*f); }`;

  function initGL() {
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    loc = {}; ['t', 'w', 'lw', 'b', 'dpr', 'R', 'p', 'res', 'c1', 'c2'].forEach(n => (loc[n] = gl.getUniformLocation(prog, n)));
    seedBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf); gl.bufferData(gl.ARRAY_BUFFER, seed, gl.STATIC_DRAW);
    const as = gl.getAttribLocation(prog, 's'); gl.enableVertexAttribArray(as); gl.vertexAttribPointer(as, 4, gl.FLOAT, false, 0, 0);
    tgtBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tgtBuf); gl.bufferData(gl.ARRAY_BUFFER, tgt || new Float32Array(nMax * 2), gl.DYNAMIC_DRAW);
    const ag = gl.getAttribLocation(prog, 'g'); gl.enableVertexAttribArray(ag); gl.vertexAttribPointer(ag, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); applySize(); return true;
  }
  function applySize() {
    if (gl) { gl.viewport(0, 0, cv.width, cv.height); gl.uniform1f(loc.dpr, dpr); gl.uniform1f(loc.R, R); gl.uniform2f(loc.res, W, H); }
    else if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Reads the layout size and device pixel ratio; returns false while the canvas has no size (card hidden).
  function measure() {
    const nd = Math.min(devicePixelRatio || 1, 3), nw = Math.round(cv.clientWidth), nh = Math.round(cv.clientHeight);
    if (nw < 8 || nh < 8) return false;
    if (nw === W && nh === H && nd === dpr && cv.width) return true;
    W = nw; H = nh; dpr = nd; R = Math.min(H * .33, W * .36);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);   // crisp on high-DPI screens
    textOk = W >= 180 && H >= 150;
    if (seed && (W >= 180) !== big) reseed();   // the window was resized across the compact / full-size breakpoint: more (or fewer) particles
    applySize(); if (result && bTarget && textOk) setTargets();
    if (reduce.matches) still();
    return true;
  }

  function seedParticles(count) {
    nMax = N = count; seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { seed[i * 4] = Math.random() * 6.2832; seed[i * 4 + 1] = Math.acos(2 * Math.random() - 1); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random(); }
  }
  function reseed() {
    big = W >= 180; q = 1; tgt = null; seedParticles(gl ? (big ? 9000 : 3500) : (big ? 1400 : 700));
    if (gl && !lost) { gl.deleteBuffer(seedBuf); gl.deleteBuffer(tgtBuf); gl.deleteProgram(prog); if (!initGL()) fallback(); }
  }
  function build(force2d) {
    W = H = 0; q = 1; tgt = null;
    big = cv.clientWidth >= 180;
    gl = force2d ? null : cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
    seedParticles(gl ? (big ? 9000 : 3500) : (big ? 1400 : 700));
    if (gl) { if (!initGL()) { fallback(); return; } }
    else { ctx = cv.getContext('2d'); if (!ctx) return; }
    measure();
  }
  // A canvas keeps the kind of context it first made, so going to 2D means a fresh canvas element.
  function fallback() {
    stop(); clearTimeout(lostTimer); lost = false;
    if (gl) { const e = gl.getExtension('WEBGL_lose_context'); if (e) { try { e.loseContext(); } catch {} } }
    const c2 = cv.cloneNode(false); cv.replaceWith(c2); cv = c2; gl = null; if (ro) ro.disconnect(); if (io) io.disconnect(); watch(); build(true); go();
  }
  function onLost(e) { e.preventDefault(); lost = true; stop(); clearTimeout(lostTimer); lostTimer = setTimeout(() => { if (lost) fallback(); }, 2000); }   // not restored in 2 s: 2D
  function onRestored() { lost = false; clearTimeout(lostTimer); if (gl && initGL()) { if (result && bTarget) setTargets(); go(); } else fallback(); }

  // ---------- drawing ----------
  function draw(t) {
    const p = Math.min(1, pg), cnt = Math.max(60, Math.round(N * q));
    const g = dark ? .55 + .45 * b : 1;   // additive glow on dark: keep the sphere from burning out to white, full strength for the text
    const c1 = mix(R_.c1, R_.bad, tint).map(v => v * g), c2 = mix(R_.c2, R_.bad, tint).map(v => v * g);
    if (gl) {
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendFunc(gl.ONE, dark ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);   // glow on dark, plain ink on light
      gl.uniform1f(loc.t, t); gl.uniform1f(loc.w, w); gl.uniform1f(loc.lw, lw); gl.uniform1f(loc.b, b); gl.uniform1f(loc.p, p);
      gl.uniform3fv(loc.c1, c1); gl.uniform3fv(loc.c2, c2);
      gl.drawArrays(gl.POINTS, 0, cnt); return;
    }
    // 2D fallback: the vertex shader's maths on a few hundred particles, drawn as soft sprites
    ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    const sp = [R_.c1, R_.c2].map((c0, j) => { const c = mix(c0, R_.bad, tint); return spr[j + (tint > .5 ? 2 : 0)] || (spr[j + (tint > .5 ? 2 : 0)] = sprite(c)); });
    for (let i = 0; i < cnt; i++) {
      const th0 = seed[i * 4], ph = seed[i * 4 + 1], r1 = seed[i * 4 + 2], r2 = seed[i * 4 + 3];
      const th = th0 + t * (.075 + .55 * w) * (.6 + .8 * r2) + w * .35 * Math.sin(t * 2 + ph * 3 + r1 * 6);
      const rad = R * (1 + .035 * Math.sin(t * 1.6) * (1 + 2 * w)) * (.9 + .1 * r1) * (1 + w * .08 * Math.sin(t * 3 + r2 * 20));
      const x = Math.sin(ph) * Math.cos(th) * rad, y0 = Math.cos(ph) * rad, z0 = Math.sin(ph) * Math.sin(th) * rad;
      const y = y0 * .94 - z0 * .34, z = y0 * .34 + z0 * .94;
      const f = 1 / (1 - z / (R * 4)), ox = x * f, oy = y * f;
      let m = Math.min(1, Math.max(0, (b - r1 * .35) / .65)); m = m * m * (3 - 2 * m);
      let px = ox, py = oy;
      if (m > 0 && tgt) { const l = Math.hypot(ox, oy) || 1, s = Math.sin(Math.PI * m) * R * .6 * r2; px = ox + (tgt[i * 2] - ox) * m + ox / l * s; py = oy + (tgt[i * 2 + 1] - oy) * m + oy / l * s; }
      const d = .5 + .5 * z / R, h = .5 + .5 * y / R;
      const e = Math.min(1, Math.max(0, (p + .05 - h) / .1)), lit = 1 + (.2 + .8 * (e * e * (3 - 2 * e)) - 1) * lw;
      const a = ((.2 + .7 * d) * lit) * (1 - m) + .95 * m, sz = Math.max(1.5, ((1.2 + 2.4 * d) * (.75 + .5 * lit)) * (1 - m) + 1.9 * m) * 1.6;
      ctx.globalAlpha = Math.min(1, a * g); ctx.drawImage(sp[r2 > .5 ? 1 : 0], W / 2 + px - sz / 2, H / 2 - py - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
  function sprite(c) {
    const s = document.createElement('canvas'); s.width = s.height = 32; const g = s.getContext('2d');
    const r = c.map(v => Math.round(v * 255)).join(','), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, `rgba(${r},1)`); gr.addColorStop(.45, `rgba(${r},.55)`); gr.addColorStop(1, `rgba(${r},0)`); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return s;
  }

  // ---------- loop ----------
  function frame(now) {
    raf = 0;
    if (!cv || !cv.isConnected) return release();
    if (document.hidden || !visible || lost) return;   // visibility, intersection and restore events restart it
    const busy = state === 'working' || b > 0 && b < 1 || bTarget !== (b > .5 ? 1 : 0) || pulse > 0 || Math.abs(tint - (state === 'error' ? 1 : 0)) > .01 || Math.abs(lw - (state === 'working' ? 1 : 0)) > .01 || Math.abs(pg - pgTarget) > .002;
    const dtms = now - last;
    if (dtms < 1000 / (busy ? FPS_BUSY : FPS_IDLE) - 3) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(.1, (last ? dtms : 16) / 1000); last = now;
    w += (((state === 'working' ? 1 : 0) || Math.min(1, pulse)) - w) * Math.min(1, dt * 3);
    lw += ((state === 'working' ? 1 : 0) - lw) * Math.min(1, dt * 4);
    tint += ((state === 'error' ? 1 : 0) - tint) * Math.min(1, dt * 4);
    pg += (pgTarget - pg) * Math.min(1, dt * 5);
    if (pulse > 0) pulse = Math.max(0, pulse - dt / 1.2);
    if (bTarget && now - doneAt > HOLD) bTarget = 0;
    b += Math.max(-dt / 1.1, Math.min(dt / 1.1, bTarget - b));
    const c0 = performance.now(); draw((now - t0) / 1000); cost += ((performance.now() - c0) - cost) * .1;
    // frame budget: if a scanning frame keeps missing 30 fps, or one draw call eats 6 ms of the main thread, thin the particles
    if (busy && (dtms > 34 || cost > 6)) { if (++slow > 20 && q > .35) { q = Math.max(.35, q * .7); slow = 0; } } else slow = Math.max(0, slow - 1);
    raf = requestAnimationFrame(frame);
  }
  function go() { if (!raf && cv && cv.isConnected && !document.hidden && visible && !lost && enabled && !reduce.matches && W) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  // Gives the GPU context back (the canvas is gone or the page changed).
  function release() {
    stop(); clearTimeout(lostTimer); lost = false;
    if (ro) ro.disconnect(); if (io) io.disconnect(); ro = io = null;
    if (gl) { const e = gl.getExtension('WEBGL_lose_context'); if (e) { try { e.loseContext(); } catch {} } }
    gl = ctx = null; if (cv) { cv.removeEventListener('webglcontextlost', onLost); cv.removeEventListener('webglcontextrestored', onRestored); } cv = box = null; W = H = 0;
  }
  function still() {   // reduced motion: one static picture per state
    if (!cv || !cv.isConnected || lost || !W) return;
    w = 0; b = 0; lw = state === 'working' ? 1 : 0; tint = state === 'error' ? 1 : 0; pg = pgTarget; draw(1.3);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : (reduce.matches ? still() : go())));
  addEventListener('resize', () => { if (cv && measure()) { reduce.matches ? still() : go(); } });
  const reTheme = () => { colours(); };
  scheme.addEventListener('change', reTheme);
  new MutationObserver(reTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  reduce.addEventListener('change', () => { if (!cv) return; if (reduce.matches) { stop(); bTarget = 0; pulse = 0; still(); } else go(); });

  function watch() {
    cv.addEventListener('webglcontextlost', onLost); cv.addEventListener('webglcontextrestored', onRestored);
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (cv && measure()) (reduce.matches ? still() : go()); }); ro.observe(cv); }
    if (window.IntersectionObserver) { io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; visible ? (reduce.matches ? still() : go()) : stop(); }); io.observe(cv); }
  }

  // ---------- the plain-text twin of the orb: always visible, announced to screen readers ----------
  function caption() {
    if (!box) return;
    const t = box.querySelector('[data-t]'), s = box.querySelector('[data-s]'), live = box.querySelector('[data-live]');
    if (!t || !s) return;
    let a, c = '';
    if (state === 'working') { a = `Scanning… ${Math.round(Math.min(1, pgTarget) * 100)}%`; c = label; }
    else if (result) { a = result[0]; c = result.slice(1).join(' · '); }
    else { a = 'Ready'; c = 'No scan yet'; }
    t.textContent = a; s.textContent = c; box.dataset.state = state; box.dataset.empty = state !== 'working' && !result ? '1' : '0';
    if (live && said !== state + (result || '')) { said = state + (result || ''); live.textContent = state === 'working' ? 'Scan started' : result ? result.join('. ') : ''; }
  }

  // ---------- public API ----------
  // set('working') | set('done', [line1, line2]) | set('error', [line1, line2]) | set('idle'); progress(0..1, currentStepName)
  function set(s, res) {
    state = s;
    if (s === 'working') { result = null; pgTarget = pg = 0; bTarget = 0; label = res || ''; }
    if ((s === 'done' || s === 'error') && res) {
      result = res; pgTarget = 1;
      if (textOk && !reduce.matches && cv) { doneAt = performance.now(); setTargets(); bTarget = 1; } else pulse = 1;
    }
    caption();
    if (!cv) return;
    colours();
    reduce.matches ? still() : go();
  }
  function progress(p, l) { pgTarget = Math.max(0, Math.min(1, p)); label = l || ''; caption(); if (cv && reduce.matches) still(); }

  // Called by the Overview after it draws the card. The canvas is new each time, so everything is rebuilt and the old context is released.
  async function mount(el) {
    if (!el) return;
    if (enabled === undefined) { try { enabled = (await api('/api/ui')).orb !== false; } catch { enabled = true; } }
    if (!el.isConnected) return;   // the page changed while we waited
    release(); cv = el; box = el.closest('.orbbox');
    caption();
    if (!enabled) { if (box) box.classList.add('no-orb'); cv.hidden = true; cv = null; return; }
    visible = true; watch(); build(); colours();
    if (!cv) return;
    if (state !== 'working') pg = pgTarget;
    reduce.matches ? still() : go();
  }
  window.SutureOrb = { mount, set, progress, release, shows: () => !!result || state === 'working' };   // shows(): the caption already tells the truth (UI-13)
})();
