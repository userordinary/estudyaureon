import { useEffect, useRef } from 'react';

export function RainOnGlassCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl = canvas;

    const gl = canvasEl.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) return;
    const glCtx = gl;

    let animId = 0;
    let running = true;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const dropSize = 64;

    function createCanvas(w: number, h: number): HTMLCanvasElement {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }

    function generateDropAlpha(size: number): HTMLCanvasElement {
      const c = createCanvas(size, size);
      const ctx = c.getContext('2d');
      if (!ctx) return c;
      const imgData = ctx.createImageData(size, size);
      const d = imgData.data;
      const cx = size / 2;
      const cy = size / 2;

      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const dx = (px - cx) / cx;
          let dy = (py - cy) / cy;
          dy *= 1.0 + dy * 0.15;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 1.0) continue;

          const alpha = Math.max(0, 1.0 - Math.pow(dist / 0.35, 6)) * 255;
          const idx = (py * size + px) * 4;
          d[idx] = 255;
          d[idx + 1] = 255;
          d[idx + 2] = 255;
          d[idx + 3] = Math.round(Math.min(255, Math.max(0, alpha)));
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return c;
    }

    function generateDropColor(size: number): HTMLCanvasElement {
      const c = createCanvas(size, size);
      const ctx = c.getContext('2d');
      if (!ctx) return c;
      const imgData = ctx.createImageData(size, size);
      const d = imgData.data;
      const cx = size / 2;
      const cy = size / 2;

      for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
          const dx = (px - cx) / cx;
          let dy = (py - cy) / cy;
          dy *= 1.0 + dy * 0.15;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 1.0) continue;

          const nx = dist > 0.001 ? dx / dist : 0;
          const ny = dist > 0.001 ? dy / dist : 0;
          const strength = dist;
          const r = Math.round(ny * 60 * strength + 128);
          const g = Math.round(nx * 60 * strength + 128);
          const depth = Math.sqrt(Math.max(0, 1.0 - dist * dist)) * 255;
          const idx = (py * size + px) * 4;
          d[idx] = Math.max(0, Math.min(255, r));
          d[idx + 1] = Math.max(0, Math.min(255, g));
          d[idx + 2] = Math.round(depth);
          d[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return c;
    }

    const dropAlphaTex = generateDropAlpha(dropSize);
    const dropColorTex = generateDropColor(dropSize);

    let bgSeed = 42;
    function srand(): number {
      bgSeed = (bgSeed * 16807 + 0) % 2147483647;
      return (bgSeed - 1) / 2147483646;
    }

    function generateCityBg(w: number, h: number, blurPx: number): HTMLCanvasElement {
      const c = createCanvas(w, h);
      const ctx = c.getContext('2d');
      if (!ctx) return c;
      bgSeed = 42;

      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#060a16');
      sky.addColorStop(0.3, '#0d152a');
      sky.addColorStop(0.6, '#15223e');
      sky.addColorStop(1, '#1e3052');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createLinearGradient(0, h * 0.4, 0, h);
      glow.addColorStop(0, 'rgba(40, 100, 180, 0)');
      glow.addColorStop(0.5, 'rgba(40, 120, 200, 0.2)');
      glow.addColorStop(1, 'rgba(60, 150, 240, 0.4)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const bColors = ['#04060d', '#070b17', '#0a1020', '#0e162c'];
      for (let b = 0; b < 30; b++) {
        const bx = srand() * w * 1.3 - w * 0.15;
        const bw = w * 0.03 + srand() * w * 0.12;
        const bh = h * 0.2 + srand() * h * 0.55;
        const by = h - bh + srand() * h * 0.05;
        ctx.fillStyle = bColors[b % bColors.length] ?? '#04060d';
        ctx.fillRect(bx, by, bw, bh);

        const wRows = Math.floor(bh / (h * 0.04));
        const wCols = Math.floor(bw / (w * 0.02));
        for (let wr = 0; wr < wRows; wr++) {
          for (let wc = 0; wc < wCols; wc++) {
            if (srand() > 0.48) {
              const wx = bx + w * 0.005 + wc * (w * 0.02);
              const wy = by + h * 0.01 + wr * (h * 0.04);
              ctx.fillStyle =
                srand() > 0.3 ? 'rgba(120, 210, 255, 0.6)' : 'rgba(80, 160, 240, 0.4)';
              ctx.fillRect(wx, wy, w * 0.008, h * 0.02);
            }
          }
        }
      }

      for (let i = 0; i < 60; i++) {
        const bkx = srand() * w;
        const bky = h * 0.2 + srand() * h * 0.75;
        const bkr = w * 0.02 + srand() * w * 0.12;
        const g = ctx.createRadialGradient(bkx, bky, 0, bkx, bky, bkr);
        g.addColorStop(0, 'rgba(100, 200, 255, 0.4)');
        g.addColorStop(0.5, 'rgba(40, 140, 230, 0.15)');
        g.addColorStop(1, 'rgba(20, 80, 180, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bkx, bky, bkr, 0, Math.PI * 2);
        ctx.fill();
      }

      if (blurPx > 0) {
        const tmp = createCanvas(w, h);
        const tctx = tmp.getContext('2d');
        if (tctx) {
          tctx.drawImage(c, 0, 0);
          ctx.clearRect(0, 0, w, h);
          ctx.filter = `blur(${blurPx}px)`;
          ctx.drawImage(tmp, 0, 0);
          ctx.filter = 'none';
        }
      }
      return c;
    }

    const textureFgCanvas = generateCityBg(96, 64, 1);
    const textureBgCanvas = generateCityBg(384, 256, 8);

    let dropsGfx: HTMLCanvasElement[] = [];
    let clearDropletsGfx: HTMLCanvasElement = createCanvas(128, 128);

    function renderDropsGfx() {
      const dropBuffer = createCanvas(dropSize, dropSize);
      const dropBufferCtx = dropBuffer.getContext('2d');
      if (!dropBufferCtx) return;

      dropsGfx = [];
      for (let i = 0; i < 255; i++) {
        const drop = createCanvas(dropSize, dropSize);
        const dropCtx = drop.getContext('2d');
        if (!dropCtx) continue;

        dropBufferCtx.clearRect(0, 0, dropSize, dropSize);
        dropBufferCtx.globalCompositeOperation = 'source-over';
        dropBufferCtx.drawImage(dropColorTex, 0, 0, dropSize, dropSize);
        dropBufferCtx.globalCompositeOperation = 'screen';
        dropBufferCtx.fillStyle = `rgba(0,0,${i},1)`;
        dropBufferCtx.fillRect(0, 0, dropSize, dropSize);

        dropCtx.globalCompositeOperation = 'source-over';
        dropCtx.drawImage(dropAlphaTex, 0, 0, dropSize, dropSize);
        dropCtx.globalCompositeOperation = 'source-in';
        dropCtx.drawImage(dropBuffer, 0, 0, dropSize, dropSize);
        dropsGfx.push(drop);
      }

      clearDropletsGfx = createCanvas(128, 128);
      const clearCtx = clearDropletsGfx.getContext('2d');
      if (clearCtx) {
        clearCtx.fillStyle = '#000';
        clearCtx.beginPath();
        clearCtx.arc(64, 64, 64, 0, Math.PI * 2);
        clearCtx.fill();
      }
    }

    interface DropItem {
      x: number;
      y: number;
      r: number;
      spreadX: number;
      spreadY: number;
      momentum: number;
      momentumX: number;
      lastSpawn: number;
      nextSpawn: number;
      parent: DropItem | null;
      isNew: boolean;
      killed: boolean;
      shrink: number;
    }

    const DROPLET_MIN_SIZE = 2;
    const DROPLET_MAX_SIZE = 5;
    const SPAWN_AREA_MIN = -0.1;
    const SPAWN_AREA_MAX = 0.95;
    const TRAIL_SCALE_MIN = 0.25;
    const TRAIL_SCALE_MAX = 0.35;

    const options = {
      minR: 20,
      maxR: 50,
      maxDrops: 750,
      rainChance: 0.35,
      rainLimit: 6,
      dropletsRate: 100,
      dropletsCleaningRadiusMultiplier: 0.28,
      raining: true,
      globalTimeScale: 1,
      trailRate: 1,
      autoShrink: true,
      collisionRadius: 0.45,
      collisionRadiusIncrease: 0.0002,
      dropFallMultiplier: 1,
      collisionBoostMultiplier: 0.05,
      collisionBoost: 1,
    };

    let rdWidth = 0;
    let rdHeight = 0;
    let rdScale = 1;
    let rdCanvas = createCanvas(1, 1);
    let rdCtx = rdCanvas.getContext('2d');
    let dropletsCanvas = createCanvas(1, 1);
    let dropletsCtx = dropletsCanvas.getContext('2d');
    const dropletsPixelDensity = 1;
    let dropletsCounter = 0;
    let drops: DropItem[] = [];
    let rdLastRender: number | null = null;

    function deltaR() {
      return options.maxR - options.minR;
    }
    function areaMultiplier() {
      return Math.sqrt((rdWidth * rdHeight) / (rdScale * 1024 * 768));
    }

    function drawDrop(ctx: CanvasRenderingContext2D | null, drop: DropItem) {
      if (!ctx || dropsGfx.length <= 0) return;
      const x = drop.x,
        y = drop.y,
        r = drop.r;
      const spreadX = drop.spreadX,
        spreadY = drop.spreadY;
      const scaleX = 1,
        scaleY = 1.5;

      let d = Math.max(0, Math.min(1, ((r - options.minR) / deltaR()) * 0.9));
      d *= 1 / ((spreadX + spreadY) * 0.5 + 1);
      const idx = Math.floor(d * (dropsGfx.length - 1));
      const targetGfx = dropsGfx[idx];
      if (!targetGfx) return;

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(
        targetGfx,
        (x - r * scaleX * (spreadX + 1)) * rdScale,
        (y - r * scaleY * (spreadY + 1)) * rdScale,
        r * 2 * scaleX * (spreadX + 1) * rdScale,
        r * 2 * scaleY * (spreadY + 1) * rdScale,
      );
    }

    function drawDroplet(x: number, y: number, r: number) {
      drawDrop(dropletsCtx, {
        x: x * dropletsPixelDensity,
        y: y * dropletsPixelDensity,
        r: r * dropletsPixelDensity,
        spreadX: 0,
        spreadY: 0,
        momentum: 0,
        momentumX: 0,
        lastSpawn: 0,
        nextSpawn: 0,
        parent: null,
        isNew: true,
        killed: false,
        shrink: 0,
      });
    }

    function clearDroplets(x: number, y: number, r: number) {
      if (!dropletsCtx) return;
      const radius = r || 30;
      dropletsCtx.globalCompositeOperation = 'destination-out';
      dropletsCtx.drawImage(
        clearDropletsGfx,
        (x - radius) * dropletsPixelDensity * rdScale,
        (y - radius) * dropletsPixelDensity * rdScale,
        radius * 2 * dropletsPixelDensity * rdScale,
        radius * 2 * dropletsPixelDensity * rdScale * 1.5,
      );
    }

    function rdCreateDrop(opts: Partial<DropItem>): DropItem | null {
      if (drops.length >= options.maxDrops * areaMultiplier()) return null;
      return {
        x: 0,
        y: 0,
        r: 0,
        spreadX: 0,
        spreadY: 0,
        momentum: 0,
        momentumX: 0,
        lastSpawn: 0,
        nextSpawn: 0,
        parent: null,
        isNew: true,
        killed: false,
        shrink: 0,
        ...opts,
      };
    }

    function updateRain(timeScale: number): DropItem[] {
      const rainDrops: DropItem[] = [];
      if (options.raining) {
        const limit = options.rainLimit * timeScale * areaMultiplier();
        let count = 0;
        while (
          Math.random() <= options.rainChance * timeScale * areaMultiplier() &&
          count < limit
        ) {
          count++;
          const r = options.minR + Math.pow(Math.random(), 3) * deltaR();
          const rd = rdCreateDrop({
            x: Math.random() * (rdWidth / rdScale),
            y:
              (rdHeight / rdScale) * SPAWN_AREA_MIN +
              Math.random() *
                ((rdHeight / rdScale) * SPAWN_AREA_MAX - (rdHeight / rdScale) * SPAWN_AREA_MIN),
            r,
            momentum: 1 + (r - options.minR) * 0.1 + Math.random() * 2,
            spreadX: 1.5,
            spreadY: 1.5,
          });
          if (rd) rainDrops.push(rd);
        }
      }
      return rainDrops;
    }

    function updateDroplets(timeScale: number) {
      if (options.raining) {
        dropletsCounter += options.dropletsRate * timeScale * areaMultiplier();
        let totalToSpawn = Math.floor(dropletsCounter);
        dropletsCounter -= totalToSpawn;

        while (totalToSpawn > 0) {
          if (Math.random() <= 0.8 && totalToSpawn >= 4) {
            const clusterSize = Math.min(totalToSpawn, 4 + Math.floor(Math.random() * 5));
            const cx = Math.random() * (rdWidth / rdScale);
            const cy = Math.random() * (rdHeight / rdScale);
            const clusterSpread = 4 + Math.random() * 8;
            for (let ci = 0; ci < clusterSize; ci++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = Math.random() * clusterSpread;
              const r =
                DROPLET_MIN_SIZE +
                Math.pow(Math.random(), 2) * (DROPLET_MAX_SIZE - DROPLET_MIN_SIZE);
              drawDroplet(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, r);
            }
            totalToSpawn -= clusterSize;
          } else {
            const r =
              DROPLET_MIN_SIZE + Math.pow(Math.random(), 2) * (DROPLET_MAX_SIZE - DROPLET_MIN_SIZE);
            drawDroplet(
              Math.random() * (rdWidth / rdScale),
              Math.random() * (rdHeight / rdScale),
              r,
            );
            totalToSpawn--;
          }
        }
      }
      if (rdCtx) {
        rdCtx.drawImage(dropletsCanvas, 0, 0, rdWidth, rdHeight);
      }
    }

    function updateDrops(timeScale: number) {
      let newDrops: DropItem[] = [];
      updateDroplets(timeScale);
      newDrops = newDrops.concat(updateRain(timeScale));

      drops.sort((a, b) => {
        const va = a.y * (rdWidth / rdScale) + a.x;
        const vb = b.y * (rdWidth / rdScale) + b.x;
        return va > vb ? 1 : va === vb ? 0 : -1;
      });

      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        if (!drop || drop.killed) continue;

        if (
          Math.random() <=
          (drop.r - options.minR * options.dropFallMultiplier) * (0.1 / deltaR()) * timeScale
        ) {
          drop.momentum += (drop.r / options.maxR) * 4 * Math.random();
        }
        if (options.autoShrink && drop.r <= options.minR && Math.random() <= 0.05 * timeScale) {
          drop.shrink += 0.01;
        }
        drop.r -= drop.shrink * timeScale;
        if (drop.r <= 0) {
          drop.killed = true;
          continue;
        }

        if (options.raining) {
          drop.lastSpawn += drop.momentum * timeScale * options.trailRate;
          if (drop.lastSpawn > drop.nextSpawn) {
            const trailDrop = rdCreateDrop({
              x: drop.x + (Math.random() * 2 - 1) * drop.r * 0.1,
              y: drop.y - drop.r * 0.01,
              r: drop.r * (TRAIL_SCALE_MIN + Math.random() * (TRAIL_SCALE_MAX - TRAIL_SCALE_MIN)),
              spreadY: drop.momentum * 0.1,
              parent: drop,
            });
            if (trailDrop) {
              newDrops.push(trailDrop);
              drop.r *= Math.pow(0.97, timeScale);
              drop.lastSpawn = 0;
              drop.nextSpawn =
                options.minR +
                Math.random() * deltaR() -
                drop.momentum * 2 * options.trailRate +
                (options.maxR - drop.r);
            }
          }
        }

        drop.spreadX *= Math.pow(0.4, timeScale);
        drop.spreadY *= Math.pow(0.7, timeScale);

        const moved = drop.momentum > 0;
        if (moved && !drop.killed) {
          drop.y += drop.momentum * options.globalTimeScale;
          drop.x += drop.momentumX * options.globalTimeScale;
          if (drop.y > rdHeight / rdScale + drop.r) drop.killed = true;
        }

        const checkCollision = (moved || drop.isNew) && !drop.killed;
        drop.isNew = false;

        if (checkCollision) {
          const end = Math.min(i + 70, drops.length);
          for (let j = i + 1; j < end; j++) {
            const drop2 = drops[j];
            if (
              !drop2 ||
              drop === drop2 ||
              drop.r <= drop2.r ||
              drop.parent === drop2 ||
              drop2.parent === drop ||
              drop2.killed
            )
              continue;
            const dx = drop2.x - drop.x;
            const dy = drop2.y - drop.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (
              dist <
              (drop.r + drop2.r) *
                (options.collisionRadius +
                  drop.momentum * options.collisionRadiusIncrease * timeScale)
            ) {
              const a1 = Math.PI * drop.r * drop.r;
              const a2 = Math.PI * drop2.r * drop2.r;
              let targetR = Math.sqrt((a1 + a2 * 0.8) / Math.PI);
              if (targetR > options.maxR) targetR = options.maxR;
              drop.r = targetR;
              drop.momentumX += dx * 0.1;
              drop.spreadX = 0;
              drop.spreadY = 0;
              drop2.killed = true;
              drop.momentum = Math.max(
                drop2.momentum,
                Math.min(
                  40,
                  drop.momentum +
                    targetR * options.collisionBoostMultiplier +
                    options.collisionBoost,
                ),
              );
            }
          }
        }

        drop.momentum -= Math.max(1, options.minR * 0.5 - drop.momentum) * 0.1 * timeScale;
        if (drop.momentum < 0) drop.momentum = 0;
        drop.momentumX *= Math.pow(0.7, timeScale);

        if (!drop.killed) {
          newDrops.push(drop);
          if (moved && options.dropletsRate > 0) {
            clearDroplets(drop.x, drop.y, drop.r * options.dropletsCleaningRadiusMultiplier);
          }
          drawDrop(rdCtx, drop);
        }
      }
      drops = newDrops;
    }

    function initRaindrops(w: number, h: number, scale: number) {
      rdWidth = w;
      rdHeight = h;
      rdScale = scale;
      rdCanvas = createCanvas(rdWidth, rdHeight);
      rdCtx = rdCanvas.getContext('2d');
      dropletsCanvas = createCanvas(
        rdWidth * dropletsPixelDensity,
        rdHeight * dropletsPixelDensity,
      );
      dropletsCtx = dropletsCanvas.getContext('2d');
      drops = [];
      dropletsCounter = 0;
      rdLastRender = null;
      renderDropsGfx();
    }

    const vertSrc = `
      precision mediump float;
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragSrc = `
      precision mediump float;
      uniform sampler2D u_waterMap;
      uniform sampler2D u_textureFg;
      uniform sampler2D u_textureBg;
      uniform vec2 u_resolution;
      uniform float u_textureRatio;

      vec4 blend(vec4 bg, vec4 fg) {
        vec3 bgm = bg.rgb * bg.a;
        vec3 fgm = fg.rgb * fg.a;
        float ia = 1.0 - fg.a;
        float a = (fg.a + bg.a * ia);
        vec3 rgb = a != 0.0 ? (fgm + bgm * ia) / a : vec3(0.0);
        return vec4(rgb, a);
      }

      vec2 texCoord() {
        return vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y) / u_resolution;
      }

      vec2 scaledTexCoord() {
        float ratio = u_resolution.x / u_resolution.y;
        vec2 scale = vec2(1.0);
        vec2 offset = vec2(0.0);
        float ratioDelta = ratio - u_textureRatio;
        if (ratioDelta >= 0.0) {
          scale.y = 1.0 + ratioDelta;
          offset.y = ratioDelta / 2.0;
        } else {
          scale.x = 1.0 - ratioDelta;
          offset.x = -ratioDelta / 2.0;
        }
        return (texCoord() + offset) / scale;
      }

      void main() {
        vec4 bg = texture2D(u_textureBg, scaledTexCoord());
        vec4 cur = texture2D(u_waterMap, texCoord());
        float d = cur.b;
        float x = cur.g;
        float y = cur.r;
        float a = clamp(cur.a * 6.0 - 3.0, 0.0, 1.0);

        vec2 refraction = (vec2(x, y) - 0.5) * 2.0;
        vec2 refractionPos = scaledTexCoord() + (refraction * (256.0 + d * 256.0) / u_resolution);
        vec4 tex = texture2D(u_textureFg, refractionPos);
        vec4 fg = vec4(tex.rgb * 1.04, a);

        gl_FragColor = blend(bg, fg);
      }
    `;

    function compileShader(type: number, src: string) {
      const s = glCtx.createShader(type);
      if (!s) return null;
      glCtx.shaderSource(s, src);
      glCtx.compileShader(s);
      return s;
    }

    const vShader = compileShader(glCtx.VERTEX_SHADER, vertSrc);
    const fShader = compileShader(glCtx.FRAGMENT_SHADER, fragSrc);
    if (!vShader || !fShader) return;

    const prog = glCtx.createProgram();
    if (!prog) return;
    glCtx.attachShader(prog, vShader);
    glCtx.attachShader(prog, fShader);
    glCtx.linkProgram(prog);
    glCtx.useProgram(prog);

    const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const posBuffer = glCtx.createBuffer();
    glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBuffer);
    glCtx.bufferData(glCtx.ARRAY_BUFFER, quadVertices, glCtx.STATIC_DRAW);
    const aPos = glCtx.getAttribLocation(prog, 'a_position');
    glCtx.enableVertexAttribArray(aPos);
    glCtx.vertexAttribPointer(aPos, 2, glCtx.FLOAT, false, 0, 0);

    const uResolution = glCtx.getUniformLocation(prog, 'u_resolution');
    const uTextureRatio = glCtx.getUniformLocation(prog, 'u_textureRatio');
    const uWaterMap = glCtx.getUniformLocation(prog, 'u_waterMap');
    const uTextureFg = glCtx.getUniformLocation(prog, 'u_textureFg');
    const uTextureBg = glCtx.getUniformLocation(prog, 'u_textureBg');

    function initTexture(unit: number, source: HTMLCanvasElement | null) {
      const tex = glCtx.createTexture();
      glCtx.activeTexture(glCtx[`TEXTURE${unit}` as 'TEXTURE0']);
      glCtx.bindTexture(glCtx.TEXTURE_2D, tex);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_S, glCtx.CLAMP_TO_EDGE);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_WRAP_T, glCtx.CLAMP_TO_EDGE);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MIN_FILTER, glCtx.LINEAR);
      glCtx.texParameteri(glCtx.TEXTURE_2D, glCtx.TEXTURE_MAG_FILTER, glCtx.LINEAR);
      if (source) {
        glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, glCtx.RGBA, glCtx.UNSIGNED_BYTE, source);
      }
      return tex;
    }

    const waterTex = initTexture(0, null);
    initTexture(1, textureFgCanvas);
    initTexture(2, textureBgCanvas);

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvasEl.width = Math.round(w * dpr);
      canvasEl.height = Math.round(h * dpr);
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
      glCtx.viewport(0, 0, canvasEl.width, canvasEl.height);
      initRaindrops(canvasEl.width, canvasEl.height, dpr);
    }

    function render() {
      if (!running) return;
      animId = requestAnimationFrame(render);
      if (prefersReduced) return;

      const now = Date.now();
      if (rdLastRender === null) rdLastRender = now;
      let timeScale = (now - rdLastRender) / (1000 / 60);
      if (timeScale > 1.1) timeScale = 1.1;
      rdLastRender = now;

      if (rdCtx) {
        rdCtx.clearRect(0, 0, rdWidth, rdHeight);
        updateDrops(timeScale);
      }

      glCtx.activeTexture(glCtx.TEXTURE0);
      glCtx.bindTexture(glCtx.TEXTURE_2D, waterTex);
      glCtx.texImage2D(glCtx.TEXTURE_2D, 0, glCtx.RGBA, glCtx.RGBA, glCtx.UNSIGNED_BYTE, rdCanvas);

      glCtx.useProgram(prog);
      glCtx.uniform2f(uResolution, canvasEl.width, canvasEl.height);
      glCtx.uniform1f(uTextureRatio, textureBgCanvas.width / textureBgCanvas.height);

      glCtx.uniform1i(uWaterMap, 0);
      glCtx.uniform1i(uTextureFg, 1);
      glCtx.uniform1i(uTextureBg, 2);

      glCtx.bindBuffer(glCtx.ARRAY_BUFFER, posBuffer);
      glCtx.drawArrays(glCtx.TRIANGLES, 0, 6);
    }

    function wipeAt(clientX: number, clientY: number) {
      const rect = canvasEl.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * (rdWidth / rdScale);
      const py = ((clientY - rect.top) / rect.height) * (rdHeight / rdScale);
      const wipeR = 60 * rdScale;
      const killR = wipeR * 0.5;
      const pushR = wipeR * 1.5;
      clearDroplets(px, py, wipeR / rdScale);

      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (!d) continue;
        const dx = d.x - px;
        const dy = d.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < killR) {
          drops.splice(i, 1);
        } else if (dist < pushR) {
          const push = (1 - (dist - killR) / (pushR - killR)) * 20;
          d.x += (dx / dist) * push;
          d.y += (dy / dist) * push * 0.6;
        }
      }
    }

    let isPointerDown = false;
    const onDown = (e: MouseEvent | TouchEvent) => {
      isPointerDown = true;
      const pt = 'touches' in e && e.touches[0] ? e.touches[0] : (e as MouseEvent);
      wipeAt(pt.clientX, pt.clientY);
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isPointerDown) return;
      const pt = 'touches' in e && e.touches[0] ? e.touches[0] : (e as MouseEvent);
      wipeAt(pt.clientX, pt.clientY);
    };
    const onUp = () => {
      isPointerDown = false;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);

    const onVisibility = () => {
      running = !document.hidden;
      if (running) {
        rdLastRender = null;
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
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchstart', onDown);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
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
