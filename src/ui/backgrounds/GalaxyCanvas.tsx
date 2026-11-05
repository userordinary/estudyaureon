import { useEffect, useRef } from 'react';

const MAX_LAYERS = 6;
const MAX_COLORS = 4;
const INTRO_SECONDS = 1.8;

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uFocal;
uniform vec2 uRotation;
uniform float uGloss;
uniform float uDepth;
uniform float uDensity;
uniform float uHueShift;
uniform float uSpeed;
uniform vec2 uMouse;
uniform float uStarGlow;
uniform float uFlareGain;
uniform float uSquash;
uniform float uSaturation;
uniform float uMouseRepulsion;
uniform float uTwinkleIntensity;
uniform float uRotationAngle;
uniform float uRepulsionStrength;
uniform float uMouseActiveFactor;
uniform int uLayers;
uniform vec3 uColors[${MAX_COLORS}];
uniform int uColorCount;
uniform float uWarp;
uniform float uReveal;
uniform float uOpacity;
out vec4 outColor;

#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
#define PERIOD 3.0

float Hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tri(float x) { return abs(fract(x) * 2.0 - 1.0); }
float tris(float x) {
  float t = fract(x);
  return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0));
}
float trisn(float x) {
  float t = fract(x);
  return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0;
}

float Star(vec2 uv, float flare, vec2 radial, float invReach) {
  float along = dot(uv, radial);
  float d = sqrt(max(dot(uv, uv) - uSquash * along * along, 0.0));
  float m = uStarGlow / max(d, 0.0001);
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * uFlareGain;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * uFlareGain;
  m *= smoothstep(1.0, 0.2, d * invReach);
  m *= mix(1.0, smoothstep(1.0, 0.55, length(uv) * invReach), min(uWarp * 4.0, 1.0));
  return m;
}

vec3 StarLayer(vec2 uv, vec2 radial, vec2 repelAt, float pushCells, float spread) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + offset;
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float glossLocal = tri(uGloss / (PERIOD * seed + 1.0));
      float flareSize = smoothstep(0.9, 1.0, size) * glossLocal;

      float pick = Hash21(si + 7.0) * float(uColorCount);
      vec3 base = uColors[int(min(floor(pick), float(uColorCount - 1)))];

      vec2 pad = vec2(tris(seed * 34.0 + uTime * uSpeed / 10.0), tris(seed * 38.0 + uTime * uSpeed / 30.0)) - 0.5;
      vec2 shift = vec2(0.0);
      float invReach = 1.0;

      vec2 away = si + 0.5 + pad - repelAt;
      float dist = length(away);
      float q = dist * spread;
      float cells = pushCells * exp(-q * q);
      float moved = cells * inversesqrt(1.0 + cells * cells * 2.78);
      shift = away * (moved / max(dist, 0.0001));
      invReach = 1.0 / (1.0 - moved);

      float star = Star(gv - offset - pad - shift, flareSize, radial, invReach);
      float twinkle = trisn(uTime * uSpeed + seed * 6.2831) * 0.5 + 1.0;
      twinkle = mix(1.0, twinkle, uTwinkleIntensity);
      col += star * twinkle * size * base;
    }
  }
  return col;
}

void main() {
  vec2 focalPx = uFocal * uResolution;
  vec2 uv = (gl_FragCoord.xy - focalPx) / uResolution.y;

  vec2 repelAt = (uMouse * uResolution - focalPx) / uResolution.y;
  float strength = max(uRepulsionStrength, 0.0);
  float push = strength * 0.05 * uMouseActiveFactor;
  float radius = 0.16 + 0.04 * strength;

  vec2 radial = length(uv) > 0.0001 ? normalize(uv) : vec2(1.0, 0.0);
  float angle = uRotationAngle;
  mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  uv = rot * uv;
  radial = rot * radial;
  repelAt = rot * repelAt;

  vec3 col = vec3(0.0);
  float layers = float(uLayers);
  for (int k = 0; k < ${MAX_LAYERS}; k++) {
    if (k >= uLayers) break;
    float i = float(k) / layers;
    float depth = fract(i + uDepth);
    float scale = mix(20.0 * uDensity, 0.5 * uDensity, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    vec2 offset = vec2(i * 453.32);
    col += StarLayer(uv * scale + offset, radial, repelAt * scale + offset, push * scale, 1.0 / (scale * radius)) * fade;
  }
  col *= uReveal;

  float alpha = min(smoothstep(0.0, 0.3, length(col)), 1.0) * uOpacity;
  outColor = vec4(col * alpha, alpha);
}
`;

export function GalaxyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl = canvas;

    const gl = canvasEl.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return;
    const glCtx = gl;

    const vShader = gl.createShader(gl.VERTEX_SHADER);
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vShader || !fShader) return;

    gl.shaderSource(vShader, VERTEX_SHADER);
    gl.shaderSource(fShader, FRAGMENT_SHADER);
    gl.compileShader(vShader);
    gl.compileShader(fShader);

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const u = {
      uTime: gl.getUniformLocation(program, 'uTime'),
      uResolution: gl.getUniformLocation(program, 'uResolution'),
      uFocal: gl.getUniformLocation(program, 'uFocal'),
      uRotation: gl.getUniformLocation(program, 'uRotation'),
      uGloss: gl.getUniformLocation(program, 'uGloss'),
      uDepth: gl.getUniformLocation(program, 'uDepth'),
      uDensity: gl.getUniformLocation(program, 'uDensity'),
      uHueShift: gl.getUniformLocation(program, 'uHueShift'),
      uSpeed: gl.getUniformLocation(program, 'uSpeed'),
      uMouse: gl.getUniformLocation(program, 'uMouse'),
      uStarGlow: gl.getUniformLocation(program, 'uStarGlow'),
      uFlareGain: gl.getUniformLocation(program, 'uFlareGain'),
      uSquash: gl.getUniformLocation(program, 'uSquash'),
      uSaturation: gl.getUniformLocation(program, 'uSaturation'),
      uMouseRepulsion: gl.getUniformLocation(program, 'uMouseRepulsion'),
      uTwinkleIntensity: gl.getUniformLocation(program, 'uTwinkleIntensity'),
      uRotationAngle: gl.getUniformLocation(program, 'uRotationAngle'),
      uRepulsionStrength: gl.getUniformLocation(program, 'uRepulsionStrength'),
      uMouseActiveFactor: gl.getUniformLocation(program, 'uMouseActiveFactor'),
      uLayers: gl.getUniformLocation(program, 'uLayers'),
      uColors: gl.getUniformLocation(program, 'uColors'),
      uColorCount: gl.getUniformLocation(program, 'uColorCount'),
      uWarp: gl.getUniformLocation(program, 'uWarp'),
      uReveal: gl.getUniformLocation(program, 'uReveal'),
      uOpacity: gl.getUniformLocation(program, 'uOpacity'),
    };

    const colors = new Float32Array([
      0.0,
      0.9,
      1.0, // Cyan
      0.1,
      0.4,
      1.0, // Electric blue
      0.6,
      0.2,
      1.0, // Violet
      0.9,
      0.95,
      1.0, // White starlight
    ]);

    const state = {
      time: 0,
      gloss: 0,
      depth: 0,
      angle: 0,
      mx: 0.5,
      my: 0.5,
      active: 0,
      boost: 0,
      reveal: 0,
    };

    const pointer = { x: 0.5, y: 0.5, inside: false };
    let raf = 0;
    let last = 0;
    let visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvasEl.width = Math.round(w * dpr);
      canvasEl.height = Math.round(h * dpr);
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
      glCtx.viewport(0, 0, canvasEl.width, canvasEl.height);
    }

    function render() {
      glCtx.useProgram(program);
      glCtx.bindVertexArray(vao);
      glCtx.uniform1f(u.uTime, state.time);
      glCtx.uniform2f(u.uResolution, canvasEl.width, canvasEl.height);
      glCtx.uniform2f(u.uFocal, 0.5, 0.5);
      glCtx.uniform2f(u.uRotation, 1.0, 0.0);
      glCtx.uniform1f(u.uGloss, state.gloss);
      glCtx.uniform1f(u.uDepth, state.depth);
      glCtx.uniform1f(u.uDensity, 1.2);
      glCtx.uniform1f(u.uHueShift, 0);
      glCtx.uniform1f(u.uSpeed, 1.0);
      glCtx.uniform2f(u.uMouse, state.mx, state.my);

      const stretch = 1 + state.boost * 5;
      glCtx.uniform1f(u.uStarGlow, (0.05 * 0.4) / Math.pow(stretch, 0.6));
      glCtx.uniform1f(u.uFlareGain, 0.4 * 1.2);
      glCtx.uniform1f(u.uSquash, 1 - 1 / (stretch * stretch));
      glCtx.uniform1f(u.uSaturation, 1.0);
      glCtx.uniform1f(u.uMouseRepulsion, 1);
      glCtx.uniform1f(u.uTwinkleIntensity, 0.35);
      glCtx.uniform1f(u.uRotationAngle, state.angle);
      glCtx.uniform1f(u.uRepulsionStrength, 2.0);
      glCtx.uniform1f(u.uMouseActiveFactor, state.active);
      glCtx.uniform1i(u.uLayers, 4);
      glCtx.uniform3fv(u.uColors, colors);
      glCtx.uniform1i(u.uColorCount, 4);
      glCtx.uniform1f(u.uWarp, state.boost);

      const fade = Math.min(1, state.reveal / 0.35);
      glCtx.uniform1f(u.uReveal, fade * fade * (3 - 2 * fade));
      glCtx.uniform1f(u.uOpacity, 0.85);

      glCtx.drawArrays(glCtx.TRIANGLES, 0, 3);
    }

    function frame(now: number) {
      if (!visible || document.hidden) return;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;

      if (state.reveal < 1) {
        state.reveal = Math.min(1, state.reveal + dt / INTRO_SECONDS);
        state.boost = Math.max(state.boost, Math.pow(1 - state.reveal, 2) * 1.4);
      }

      const flight = 0.5 / 10;
      state.time += dt;
      state.gloss += dt * flight;
      state.depth += dt * flight * (1 + state.boost * 14);
      state.angle += dt * 0.08;
      state.boost *= Math.exp(-dt * 1.3);
      if (state.boost < 0.001) state.boost = 0;

      const follow = 1 - Math.exp(-dt / 0.325);
      if (pointer.inside) {
        state.mx += (pointer.x - state.mx) * follow;
        state.my += (pointer.y - state.my) * follow;
      }
      const target = pointer.inside ? 1 : 0;
      state.active += (target - state.active) * follow;

      render();
      raf = requestAnimationFrame(frame);
    }

    const onPointerMove = (e: PointerEvent) => {
      pointer.inside = true;
      pointer.x = e.clientX / window.innerWidth;
      pointer.y = 1 - e.clientY / window.innerHeight;
    };
    const onPointerDown = () => {
      state.boost = Math.min(1.6, state.boost + 1);
    };
    const onPointerLeave = () => {
      pointer.inside = false;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      if (program) {
        glCtx.deleteProgram(program);
        glCtx.deleteShader(vShader);
        glCtx.deleteShader(fShader);
        glCtx.deleteBuffer(buffer);
      }
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
