import { useEffect, useRef } from 'react';

const LINE_VERTEX = `#version 300 es
precision highp float;
in vec2 aPoint;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uFrame;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;
uniform float uCount;
uniform float uThickness;
uniform float uSoftness;
uniform float uWaves;
uniform float uSplit;
uniform float uFray;
uniform float uSeed;
uniform vec2 uTurn;
uniform vec4 uPart;
uniform float uTaper;
out float vEdge;
out float vBand;
out float vDraw;
out float vAlpha;
out float vIndex;

float Perlin2D(vec2 P) {
  vec2 Pi = floor(P);
  vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
  vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
  Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
  Pt += vec2(26.0, 161.0).xyxy;
  Pt *= Pt;
  Pt = Pt.xzxz * Pt.yyww;
  vec4 hash_x = fract(Pt * (1.0 / 951.135664));
  vec4 hash_y = fract(Pt * (1.0 / 642.949883));
  vec4 grad_x = hash_x - 0.49999;
  vec4 grad_y = hash_y - 0.49999;
  vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y) * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
  grad_results *= 1.4142135623730950;
  vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
  vec4 blend2 = vec4(blend, vec2(1.0 - blend));
  return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

void main() {
  float perc = float(gl_InstanceID) / uCount;
  float x = aPoint.x;
  float pixel = 1.0 / max(uResolution.x, uResolution.y);
  float splitPoint = uSplit + perc * uFray;
  float amplitudeNormal = smoothstep(splitPoint, max(0.7, splitPoint + 0.2), x);
  float finalAmplitude = amplitudeNormal * 0.5 * uAmplitude * (1.0 + (uMouse.y - 0.5) * 0.2);
  float timeScaled = uTime / 10.0 + (uMouse.x - 0.5);
  float blur = smoothstep(splitPoint, splitPoint + 0.05, x) * perc;
  float xnoise = mix(
    Perlin2D(vec2(timeScaled * 2.5 + uSeed, (x * uWaves + perc) * 2.5)),
    Perlin2D(vec2(timeScaled * 3.5 + uSeed, (x * uWaves + timeScaled) * 3.5)) / 1.5,
    x * 0.3
  );
  float y = 0.5 + (perc - 0.5) * uDistance + xnoise / 2.0 * finalAmplitude;
  vec2 local = vec2((x - 0.5) * uFrame.x, (y - 0.5) * uFrame.y);
  if (uPart.z > 0.0) {
    vec2 delta = local - uPart.xy;
    float reach = uPart.w;
    float pull = exp(-dot(delta, delta) / (reach * reach));
    local.y += delta.y * pull * uPart.z;
  }
  float width = 7.0 * uThickness * pixel * (1.0 - perc);
  float band = (width / 2.0 + 10.0 * uSoftness * pixel * blur) * uFrame.y;
  float draw = max(band, 1.0);
  local.y += aPoint.y * draw;
  vec2 turned = vec2(local.x * uTurn.x - local.y * uTurn.y, local.x * uTurn.y + local.y * uTurn.x);
  gl_Position = vec4(turned / (uResolution * 0.5), 0.0, 1.0);
  vEdge = aPoint.y * draw;
  vBand = band;
  vDraw = draw;
  vAlpha = 1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3)) * uTaper;
  vIndex = perc;
}`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in float vEdge;
in float vBand;
in float vDraw;
in float vAlpha;
in float vIndex;
uniform vec3 uColor;
uniform vec3 uAccent;
out vec4 outColor;
void main() {
  float coverage = (1.0 - smoothstep(0.0, vDraw, abs(vEdge))) * (vBand / vDraw) * vAlpha;
  outColor = vec4(mix(uColor, uAccent, vIndex) * coverage, coverage);
}`;

const SCREEN_VERTEX = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const SCREEN_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uLines;
uniform vec2 uResolution;
uniform float uFade;
uniform float uOpacity;
uniform float uCurve;
out vec4 outColor;

float smootherstep(float edge, float x) {
  float t = clamp(x / edge, 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

void main() {
  vec4 lines = texture(uLines, vUv);
  float alpha = lines.a;
  vec3 color = alpha > 0.0001 ? lines.rgb / alpha : vec3(0.0);
  float mask = uOpacity;
  if (uFade > 0.0) {
    vec2 px = vUv * uResolution;
    float edge = uFade * min(uResolution.x, uResolution.y) * 0.5;
    mask *= smootherstep(edge, px.x) * smootherstep(edge, uResolution.x - px.x);
    mask *= smootherstep(edge, px.y) * smootherstep(edge, uResolution.y - px.y);
  }
  outColor = vec4(color * pow(alpha, uCurve), alpha) * mask;
}`;

const MAX_RENDER_DIM = 1920;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
};

const link = (gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
};

export interface ThreadsCanvasProps {
  color?: string | number[];
  accentColor?: string | number[];
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
  lineCount?: number;
  thickness?: number;
  softness?: number;
  speed?: number;
  waves?: number;
  split?: number;
  fray?: number;
  angle?: number;
  seed?: number;
  parting?: number;
  taper?: number;
  brightness?: number;
  fade?: number;
  opacity?: number;
  paused?: boolean;
}

export function ThreadsCanvas({
  color = '#cf3d3d',
  accentColor,
  amplitude = 1.4,
  distance = 0.8,
  enableMouseInteraction = true,
  lineCount = 69,
  thickness = 0.7,
  softness = 0.7,
  speed = 0.6,
  waves = 1.05,
  split = 0.04,
  fray = 0.5,
  angle = -22,
  seed = 4,
  parting = 0.15,
  taper = 0.85,
  brightness = 1.4,
  fade = 0,
  opacity = 1,
  paused = false,
}: ThreadsCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wakeRef = useRef<(() => void) | null>(null);

  const colorKey = `${Array.isArray(color) ? color.join(',') : String(color)}|${
    Array.isArray(accentColor) ? accentColor.join(',') : String(accentColor ?? '')
  }`;

  const settings = {
    color,
    accentColor,
    colorKey,
    amplitude,
    distance,
    enableMouseInteraction,
    lineCount: clamp(Math.round(lineCount), 1, 400),
    thickness: Math.max(0, thickness),
    softness: Math.max(0, softness),
    speed,
    waves: Math.max(0, waves),
    split: clamp(split, 0, 1),
    fray: clamp(fray, 0, 1),
    angle,
    seed,
    parting: clamp(parting, 0, 1),
    taper: clamp(taper, 0, 1),
    brightness: clamp(brightness, 0.25, 2),
    fade: clamp(fade, 0, 1),
    opacity: clamp(opacity, 0, 1),
    paused,
  };

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    wakeRef.current?.();
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return undefined;

    const lineProgram = link(gl, LINE_VERTEX, LINE_FRAGMENT);
    const screenProgram = link(gl, SCREEN_VERTEX, SCREEN_FRAGMENT);
    if (!lineProgram || !screenProgram) return undefined;

    const u = (prog: WebGLProgram, name: string) => gl.getUniformLocation(prog, name);

    const lineU = {
      uTime: u(lineProgram, 'uTime'),
      uResolution: u(lineProgram, 'uResolution'),
      uFrame: u(lineProgram, 'uFrame'),
      uAmplitude: u(lineProgram, 'uAmplitude'),
      uDistance: u(lineProgram, 'uDistance'),
      uMouse: u(lineProgram, 'uMouse'),
      uCount: u(lineProgram, 'uCount'),
      uThickness: u(lineProgram, 'uThickness'),
      uSoftness: u(lineProgram, 'uSoftness'),
      uWaves: u(lineProgram, 'uWaves'),
      uSplit: u(lineProgram, 'uSplit'),
      uFray: u(lineProgram, 'uFray'),
      uSeed: u(lineProgram, 'uSeed'),
      uTurn: u(lineProgram, 'uTurn'),
      uPart: u(lineProgram, 'uPart'),
      uTaper: u(lineProgram, 'uTaper'),
      uColor: u(lineProgram, 'uColor'),
      uAccent: u(lineProgram, 'uAccent'),
    };

    const screenU = {
      uLines: u(screenProgram, 'uLines'),
      uResolution: u(screenProgram, 'uResolution'),
      uFade: u(screenProgram, 'uFade'),
      uOpacity: u(screenProgram, 'uOpacity'),
      uCurve: u(screenProgram, 'uCurve'),
    };

    const lineVao = gl.createVertexArray();
    const lineBuffer = gl.createBuffer();
    gl.bindVertexArray(lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    const pointLocation = gl.getAttribLocation(lineProgram, 'aPoint');
    gl.enableVertexAttribArray(pointLocation);
    gl.vertexAttribPointer(pointLocation, 2, gl.FLOAT, false, 0, 0);

    const screenVao = gl.createVertexArray();
    const screenBuffer = gl.createBuffer();
    gl.bindVertexArray(screenVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, screenBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(screenProgram, 'aPosition');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const target = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const probeContext = probe.getContext('2d', { willReadFrequently: true });
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const state = {
      time: 0,
      width: 1,
      height: 1,
      segments: 0,
      colorKey: '',
      color: [0.81, 0.24, 0.24] as [number, number, number],
      accent: [0.81, 0.24, 0.24] as [number, number, number],
      mouse: [0.5, 0.5] as [number, number],
      targetMouse: [0.5, 0.5] as [number, number],
      pointer: [0, 0] as [number, number],
      targetPointer: [0, 0] as [number, number],
      presence: 0,
      inside: false,
    };
    let raf = 0,
      last = 0,
      visible = true,
      alive = true;

    const toRgb = (value: string | number[] | undefined): [number, number, number] => {
      if (Array.isArray(value)) {
        return [
          clamp(Number(value[0] ?? 1), 0, 1),
          clamp(Number(value[1] ?? 1), 0, 1),
          clamp(Number(value[2] ?? 1), 0, 1),
        ];
      }
      if (!probeContext) return [0.81, 0.24, 0.24];
      probeContext.clearRect(0, 0, 1, 1);
      probeContext.fillStyle = '#ffffff';
      probeContext.fillStyle = String(value);
      probeContext.fillRect(0, 0, 1, 1);
      const img = probeContext.getImageData(0, 0, 1, 1).data;
      const r = img[0] ?? 255;
      const g = img[1] ?? 255;
      const b = img[2] ?? 255;
      return [r / 255, g / 255, b / 255];
    };

    const resolveColors = (s: typeof settings) => {
      if (s.colorKey === state.colorKey) return;
      state.colorKey = s.colorKey;
      state.color = toRgb(s.color);
      state.accent =
        s.accentColor === undefined || s.accentColor === null ? state.color : toRgb(s.accentColor);
    };

    const buildStrip = (segments: number) => {
      if (segments === state.segments) return;
      state.segments = segments;
      const points = new Float32Array((segments + 1) * 4);
      for (let i = 0; i <= segments; i++) {
        const uVal = i / segments;
        points.set([uVal, -1, uVal, 1], i * 4);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    };

    const resize = () => {
      const width = Math.max(1, container.clientWidth || window.innerWidth);
      const height = Math.max(1, container.clientHeight || window.innerHeight);
      const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
      const longest = Math.max(width, height) * baseDpr;
      const dpr = longest > MAX_RENDER_DIM ? (baseDpr * MAX_RENDER_DIM) / longest : baseDpr;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      state.width = width;
      state.height = height;
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        canvas.width,
        canvas.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      buildStrip(clamp(Math.round(width / 3), 96, 640));
      render();
    };

    const render = () => {
      const s = settingsRef.current;
      resolveColors(s);
      const w = canvas.width,
        h = canvas.height;
      const radians = (s.angle * Math.PI) / 180;
      const cos = Math.cos(radians),
        sin = Math.sin(radians);
      const length = Math.abs(w * cos) + Math.abs(h * sin);
      const across = Math.abs(w * sin) + Math.abs(h * cos);
      const scale = w / state.width;
      const mouse = s.enableMouseInteraction ? state.mouse : [0.5, 0.5];
      const strength = s.parting * state.presence * 2;
      const px = state.pointer[0] * scale,
        py = state.pointer[1] * scale;
      const local = [px * cos + py * sin, -px * sin + py * cos];

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(lineProgram);
      gl.uniform1f(lineU.uTime, state.time);
      gl.uniform2f(lineU.uResolution, w, h);
      gl.uniform2f(lineU.uFrame, length, across);
      gl.uniform1f(lineU.uAmplitude, s.amplitude);
      gl.uniform1f(lineU.uDistance, s.distance);
      gl.uniform2f(lineU.uMouse, mouse[0] ?? 0.5, mouse[1] ?? 0.5);
      gl.uniform1f(lineU.uCount, s.lineCount);
      gl.uniform1f(lineU.uThickness, s.thickness);
      gl.uniform1f(lineU.uSoftness, s.softness);
      gl.uniform1f(lineU.uWaves, s.waves);
      gl.uniform1f(lineU.uSplit, s.split);
      gl.uniform1f(lineU.uFray, s.fray);
      gl.uniform1f(lineU.uSeed, s.seed * 13.37);
      gl.uniform2f(lineU.uTurn, cos, sin);
      gl.uniform4f(lineU.uPart, local[0] ?? 0, local[1] ?? 0, strength, Math.min(w, h) * 0.16);
      gl.uniform1f(lineU.uTaper, s.taper);
      gl.uniform3f(lineU.uColor, state.color[0], state.color[1], state.color[2]);
      gl.uniform3f(lineU.uAccent, state.accent[0], state.accent[1], state.accent[2]);
      gl.bindVertexArray(lineVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, (state.segments + 1) * 2, s.lineCount);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(screenProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.uniform1i(screenU.uLines, 0);
      gl.uniform2f(screenU.uResolution, w, h);
      gl.uniform1f(screenU.uFade, s.fade);
      gl.uniform1f(screenU.uOpacity, s.opacity);
      gl.uniform1f(screenU.uCurve, 2 / s.brightness);
      gl.bindVertexArray(screenVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      const s = settingsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const moving = !s.paused && !reduce;
      if (moving) state.time += dt * s.speed;
      const follow = 1 - Math.exp(-dt * 3);
      state.mouse[0] += ((state.targetMouse[0] ?? 0.5) - (state.mouse[0] ?? 0.5)) * follow;
      state.mouse[1] += ((state.targetMouse[1] ?? 0.5) - (state.mouse[1] ?? 0.5)) * follow;
      const glide = 1 - Math.exp(-dt * 10);
      state.pointer[0] += ((state.targetPointer[0] ?? 0) - (state.pointer[0] ?? 0)) * glide;
      state.pointer[1] += ((state.targetPointer[1] ?? 0) - (state.pointer[1] ?? 0)) * glide;
      state.presence +=
        ((state.inside && s.parting > 0 ? 1 : 0) - state.presence) * (1 - Math.exp(-dt * 4));
      render();
      const settling =
        Math.abs((state.targetMouse[0] ?? 0) - (state.mouse[0] ?? 0)) > 0.0005 ||
        Math.abs((state.targetMouse[1] ?? 0) - (state.mouse[1] ?? 0)) > 0.0005 ||
        Math.abs((state.targetPointer[0] ?? 0) - (state.pointer[0] ?? 0)) > 0.05 ||
        Math.abs((state.targetPointer[1] ?? 0) - (state.pointer[1] ?? 0)) > 0.05 ||
        Math.abs((state.inside && s.parting > 0 ? 1 : 0) - state.presence) > 0.002;
      if (moving || settling) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (!raf && alive && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (event.clientX - rect.left) / Math.max(1, rect.width);
      const y = (event.clientY - rect.top) / Math.max(1, rect.height);
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (inside) {
        state.targetMouse = [x, 1 - y];
        state.targetPointer = [
          event.clientX - rect.left - rect.width / 2,
          rect.height / 2 - (event.clientY - rect.top),
        ];
        if (!state.inside && state.presence < 0.01)
          state.pointer = [state.targetPointer[0], state.targetPointer[1]];
      } else if (state.inside) {
        state.targetMouse = [0.5, 0.5];
      }
      state.inside = inside;
      wake();
    };

    const onPointerLeave = () => {
      state.inside = false;
      state.targetMouse = [0.5, 0.5];
      wake();
    };

    const onVisibility = () => {
      last = 0;
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) {
        last = 0;
        wake();
      }
    });
    intersection.observe(container);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    resize();

    wakeRef.current = () => {
      if (!raf) render();
      wake();
    };

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(target);
      gl.deleteBuffer(lineBuffer);
      gl.deleteBuffer(screenBuffer);
      gl.deleteVertexArray(lineVao);
      gl.deleteVertexArray(screenVao);
      gl.deleteProgram(lineProgram);
      gl.deleteProgram(screenProgram);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 h-full w-full overflow-hidden"
      style={{ pointerEvents: 'auto' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
    </div>
  );
}
