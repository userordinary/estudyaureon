import { useEffect, useRef } from 'react';

export function MoonlitRippleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl = canvas;

    const gl = canvasEl.getContext('webgl', {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return;
    const glCtx = gl;

    let animId = 0;
    let running = true;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const vertSrc = `
      attribute vec2 a_pos;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fragSrc = `
      precision highp float;
      uniform float u_time;
      uniform vec2 u_res;
      uniform float u_rippleSpeed;
      uniform float u_moonGlow;
      uniform vec2 u_mouse;
      uniform float u_tilt;
      uniform float u_waves;

      #define PI 3.14159265359
      #define WAVE_LAYERS 7

      vec4 sea(vec2 p, float t) {
        float h = 0.0;
        vec2 dh = vec2(0.0);
        float freq = 1.0;
        float baseAmp = 0.22 * u_waves;
        float decay = mix(0.55, 0.38, clamp(u_waves / 3.0, 0.0, 1.0));
        float amp = baseAmp;
        float angle = 0.0;
        for (int i = 0; i < WAVE_LAYERS; i++) {
          float c = cos(angle);
          float s = sin(angle);
          vec2 pp = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
          float fi = float(i);
          float spd = sqrt(freq) * 0.85;
          float phase = (pp.y + fi) * freq - t * spd;
          float sn = sin(phase);
          float cn = cos(phase);
          h += sn * amp;
          float dy = freq * amp * cn;
          dh += vec2(-s * dy, c * dy);
          angle += fi + 1.2;
          freq *= 1.3;
          amp *= decay;
        }
        vec3 N = normalize(vec3(-dh.x, 1.0, -dh.y));
        return vec4(h, N);
      }

      vec3 moonDir() {
        return normalize(vec3(0.15, 0.40, 1.0));
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      vec3 skyColor(vec3 rd) {
        vec3 md = moonDir();
        vec3 skyDark = vec3(0.02, 0.04, 0.09);
        vec3 skyHoriz = vec3(0.05, 0.09, 0.18);
        vec3 sky = mix(skyHoriz, skyDark, max(rd.y, 0.0));
        vec3 moonCol = vec3(0.90, 0.95, 1.0);
        float moonDot = max(dot(rd, md), 0.0);
        float moonAngle = acos(clamp(moonDot, 0.0, 1.0));
        float moonRadius = 0.045;
        float disc = smoothstep(moonRadius, moonRadius * 0.7, moonAngle);

        if (disc > 0.0) {
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 right = normalize(cross(up, md));
          vec3 mup = cross(md, right);
          vec2 muv = vec2(dot(rd - md, right), dot(rd - md, mup)) * 25.0;
          float crater = hash(floor(muv * 2.0)) * 0.25;
          crater += hash(floor(muv * 4.0)) * 0.15;
          float darkening = 1.0 - crater * smoothstep(moonRadius * 0.9, moonRadius * 0.4, moonAngle);
          float limb = smoothstep(0.0, moonRadius, moonAngle);
          darkening *= mix(1.0, 0.7, limb * limb);
          sky += moonCol * disc * 0.95 * darkening;
        }

        sky += moonCol * 0.35 * pow(moonDot, 35.0) * u_moonGlow;
        sky += moonCol * 1.5 * pow(moonDot, 380.0) * u_moonGlow;
        return sky;
      }

      void main() {
        float aspect = u_res.x / max(u_res.y, 1.0);
        vec2 uv = -1.0 + 2.0 * gl_FragCoord.xy / u_res;
        uv.x *= aspect;
        float t = u_time * u_rippleSpeed;

        float tiltRad = u_tilt * 0.75;
        vec3 ro = vec3(0.0, 8.0, 0.0);
        vec3 ww = normalize(vec3(0.0, -sin(tiltRad), cos(tiltRad)));
        vec3 uu = normalize(cross(vec3(0.0, 1.0, 0.0), ww));
        vec3 vv = normalize(cross(ww, uu));
        vec3 rd = normalize(uv.x * uu + uv.y * vv + 2.5 * ww);

        vec3 md = moonDir();
        vec3 moonCol = vec3(0.88, 0.95, 1.0);
        vec3 sky = skyColor(rd);
        vec3 col = sky;

        float dsea = -ro.y / rd.y;
        if (dsea > 0.0) {
          vec3 wp = ro + dsea * rd;
          vec4 s = sea(wp.xz, t);
          float h = s.x;
          vec3 nor = s.yzw;

          if (u_mouse.x > 0.0) {
            vec2 mUV = -1.0 + 2.0 * u_mouse / u_res;
            mUV.x *= aspect;
            vec3 mrd = normalize(mUV.x * uu + mUV.y * vv + 2.5 * ww);
            float mdsea = -ro.y / mrd.y;
            if (mdsea > 0.0) {
              vec3 mwp = ro + mdsea * mrd;
              vec2 mdelta = wp.xz - mwp.xz;
              float md2 = length(mdelta);
              float mfreq = 4.2;
              float mphase = md2 * mfreq - t * 5.2;
              float mamp = exp(-md2 * 0.14) * 0.45 * u_waves;
              h += sin(mphase) * mamp;
              float mcos = cos(mphase) * mamp * mfreq;
              vec2 mgrad = md2 > 0.01 ? (mdelta / md2) * mcos : vec2(0.0);
              nor = normalize(nor + vec3(-mgrad.x, 0.0, -mgrad.y) * 2.2);
            }
          }
          nor = mix(nor, vec3(0.0, 1.0, 0.0), smoothstep(0.0, 300.0, dsea));

          float fre = clamp(1.0 - dot(-nor, rd), 0.0, 1.0);
          fre = pow(fre, 3.0);
          float dif = mix(0.25, 1.0, max(dot(nor, md), 0.0));

          vec3 refl = skyColor(reflect(rd, nor));
          vec3 seaCol1 = vec3(0.015, 0.04, 0.10);
          vec3 seaCol2 = vec3(0.06, 0.14, 0.26);
          vec3 refr = seaCol1 + dif * moonCol * seaCol2 * 0.35 * u_moonGlow;

          col = mix(refr, 0.95 * refl, fre);
          float atten = max(1.0 - dsea * dsea * 0.0005, 0.0);
          col += seaCol2 * (wp.y - h) * 2.4 * atten;
          col = mix(col, sky, 1.0 - exp(-0.007 * dsea));
        }

        col = pow(max(col, vec3(0.0)), vec3(0.85));
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compile(type: number, src: string) {
      const s = glCtx.createShader(type);
      if (!s) return null;
      glCtx.shaderSource(s, src);
      glCtx.compileShader(s);
      return s;
    }

    const vShader = compile(glCtx.VERTEX_SHADER, vertSrc);
    const fShader = compile(glCtx.FRAGMENT_SHADER, fragSrc);
    if (!vShader || !fShader) return;

    const prog = glCtx.createProgram();
    if (!prog) return;
    glCtx.attachShader(prog, vShader);
    glCtx.attachShader(prog, fShader);
    glCtx.linkProgram(prog);
    glCtx.useProgram(prog);

    const buf = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, buf);
    glCtx.bufferData(
      glCtx.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      glCtx.STATIC_DRAW,
    );
    const aPos = glCtx.getAttribLocation(prog, 'a_pos');
    glCtx.enableVertexAttribArray(aPos);
    glCtx.vertexAttribPointer(aPos, 2, glCtx.FLOAT, false, 0, 0);

    const uTime = glCtx.getUniformLocation(prog, 'u_time');
    const uRes = glCtx.getUniformLocation(prog, 'u_res');
    const uRippleSpeed = glCtx.getUniformLocation(prog, 'u_rippleSpeed');
    const uMoonGlow = glCtx.getUniformLocation(prog, 'u_moonGlow');
    const uMouse = glCtx.getUniformLocation(prog, 'u_mouse');
    const uTilt = glCtx.getUniformLocation(prog, 'u_tilt');
    const uWaves = glCtx.getUniformLocation(prog, 'u_waves');

    const rippleSpeedVal = 0.55;
    const moonGlowVal = 1.2;
    const tiltVal = 0.35; // Ángulo óptimo para que las olas del mar cubran la vista
    const wavesVal = 1.1;
    let mouseX = -1.0;
    let mouseY = -1.0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const w = Math.max(1, Math.round((canvasEl.clientWidth || window.innerWidth) * dpr));
      const h = Math.max(1, Math.round((canvasEl.clientHeight || window.innerHeight) * dpr));
      if (canvasEl.width !== w || canvasEl.height !== h) {
        canvasEl.width = w;
        canvasEl.height = h;
        glCtx.viewport(0, 0, w, h);
      }
    }

    function render(now: number) {
      if (!running) return;
      resize();
      glCtx.viewport(0, 0, canvasEl.width, canvasEl.height);
      glCtx.uniform2f(uRes, canvasEl.width, canvasEl.height);
      glCtx.uniform1f(uTime, prefersReduced ? 0.0 : now * 0.001);
      glCtx.uniform1f(uRippleSpeed, rippleSpeedVal);
      glCtx.uniform1f(uMoonGlow, moonGlowVal);
      glCtx.uniform1f(uTilt, tiltVal);
      glCtx.uniform1f(uWaves, wavesVal);
      glCtx.uniform2f(uMouse, mouseX, mouseY);
      glCtx.drawArrays(glCtx.TRIANGLES, 0, 3);
      animId = requestAnimationFrame(render);
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvasEl.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * dpr;
      mouseY = (rect.height - (e.clientY - rect.top)) * dpr;
    };
    const onMouseLeave = () => {
      mouseX = -1.0;
      mouseY = -1.0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        const rect = canvasEl.getBoundingClientRect();
        mouseX = (touch.clientX - rect.left) * dpr;
        mouseY = (rect.height - (touch.clientY - rect.top)) * dpr;
      }
    };
    const onTouchEnd = () => {
      mouseX = -1.0;
      mouseY = -1.0;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    const onVisibility = () => {
      running = !document.hidden;
      if (running) {
        animId = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    animId = requestAnimationFrame(render);

    return () => {
      running = false;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full block"
      style={{ pointerEvents: 'auto' }}
    />
  );
}
