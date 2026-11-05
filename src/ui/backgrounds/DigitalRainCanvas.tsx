import { useEffect, useRef } from 'react';

export function DigitalRainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let running = true;
    let lastTime = 0;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const FALL_SPEED = 1.0;
    const COLUMN_DENSITY = 0.7;

    const katakana =
      'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const numbers = '0123456789';
    const mathSymbols = '×÷∆ΣΠ√∞≈≠≤≥∫∂αβγθφψω';
    const allChars = katakana + numbers + mathSymbols;

    function randomChar() {
      return allChars[Math.floor(Math.random() * allChars.length)] ?? '0';
    }

    const FONT_SIZE = 15;
    let waterSurface = height * 0.78;

    interface CharItem {
      char: string;
      cycleTimer: number;
      cycleRate: number;
    }

    interface Column {
      x: number;
      y: number;
      speed: number;
      length: number;
      chars: CharItem[];
      active: boolean;
      restartDelay: number;
      opacity: number;
      hitWater: boolean;
    }

    let columns: Column[] = [];

    interface Ripple {
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      speed: number;
      life: number;
      decay: number;
    }

    const ripples: Ripple[] = [];
    const MAX_RIPPLES = 40;

    interface WavePoint {
      y: number;
      vy: number;
    }

    let wavePoints: WavePoint[] = [];
    const WAVE_RESOLUTION = 4;

    function createColumn(index: number, scatter: boolean): Column {
      const trailLen = 12 + Math.floor(Math.random() * 20);
      const maxChars = trailLen + 5;
      const chars: CharItem[] = [];
      for (let j = 0; j < maxChars; j++) {
        chars.push({
          char: randomChar(),
          cycleTimer: Math.random() * 3,
          cycleRate: 0.5 + Math.random() * 2,
        });
      }

      let startY: number;
      if (scatter) {
        if (Math.random() < COLUMN_DENSITY) {
          startY =
            Math.random() * (waterSurface + trailLen * FONT_SIZE) - trailLen * FONT_SIZE * 0.3;
        } else {
          startY = -trailLen * FONT_SIZE - Math.random() * height * 0.5;
        }
      } else {
        startY = -trailLen * FONT_SIZE * Math.random() * 0.3;
      }

      return {
        x: index * FONT_SIZE,
        y: startY,
        speed: 1.2 + Math.random() * 2.5,
        length: trailLen,
        chars,
        active: scatter ? Math.random() < COLUMN_DENSITY + 0.2 : Math.random() < COLUMN_DENSITY,
        restartDelay: 0,
        opacity: 0.6 + Math.random() * 0.4,
        hitWater: false,
      };
    }

    function spawnRipple(x: number, y: number) {
      if (ripples.length >= MAX_RIPPLES) {
        ripples.shift();
      }
      ripples.push({
        x,
        y,
        radius: 0,
        maxRadius: 30 + Math.random() * 50,
        speed: 20 + Math.random() * 30,
        life: 1.0,
        decay: 0.3 + Math.random() * 0.2,
      });
    }

    function disturbWave(x: number, force: number) {
      const idx = Math.floor(x / WAVE_RESOLUTION);
      const spread = 3;
      for (let i = -spread; i <= spread; i++) {
        const wi = idx + i;
        if (wi >= 0 && wi < wavePoints.length && wavePoints[wi]) {
          const influence = 1 - Math.abs(i) / (spread + 1);
          wavePoints[wi].vy += force * influence;
        }
      }
    }

    function initColumns() {
      waterSurface = height * 0.78;
      const colWidth = FONT_SIZE;
      const colCount = Math.floor(width / colWidth);
      const newColumns: Column[] = [];

      for (let i = 0; i < colCount; i++) {
        const existing = columns[i];
        if (existing) {
          existing.x = i * colWidth;
          newColumns.push(existing);
        } else {
          newColumns.push(createColumn(i, true));
        }
      }
      columns = newColumns;

      const waveCount = Math.ceil(width / WAVE_RESOLUTION) + 1;
      const newWave: WavePoint[] = [];
      for (let w = 0; w < waveCount; w++) {
        newWave.push({ y: 0, vy: 0 });
      }
      wavePoints = newWave;
    }

    function resize() {
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initColumns();
    }

    function updateColumns(dt: number) {
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (!col) continue;

        if (!col.active) {
          col.restartDelay -= dt;
          if (col.restartDelay <= 0) {
            if (Math.random() < COLUMN_DENSITY) {
              col.active = true;
              col.y = -col.length * FONT_SIZE * Math.random() * 0.3;
              col.speed = 1.2 + Math.random() * 2.5;
              col.length = 12 + Math.floor(Math.random() * 20);
              col.opacity = 0.6 + Math.random() * 0.4;
              col.hitWater = false;
              for (let c = 0; c < col.chars.length; c++) {
                const ch = col.chars[c];
                if (ch) ch.char = randomChar();
              }
            } else {
              col.restartDelay = 0.3 + Math.random() * 1.5;
            }
          }
          continue;
        }

        const prevY = col.y;
        col.y += col.speed * FALL_SPEED * dt * 60;

        for (let j = 0; j < col.chars.length; j++) {
          const ch = col.chars[j];
          if (!ch) continue;
          ch.cycleTimer -= dt;
          if (ch.cycleTimer <= 0) {
            ch.char = randomChar();
            ch.cycleTimer = ch.cycleRate;
          }
        }

        if (!col.hitWater && col.y >= waterSurface && prevY < waterSurface) {
          col.hitWater = true;
          spawnRipple(col.x + FONT_SIZE * 0.5, waterSurface);
          disturbWave(col.x + FONT_SIZE * 0.5, -2 - Math.random() * 3);
        }

        const tailY = col.y - col.length * FONT_SIZE;
        if (tailY > waterSurface + 30) {
          col.active = false;
          col.restartDelay = 0.2 + Math.random() * 2;
        }
      }
    }

    function drawColumns() {
      if (!ctx) return;
      ctx.font = `${FONT_SIZE}px "SF Mono", "Fira Code", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (!col || !col.active) continue;

        for (let j = 0; j < col.length; j++) {
          const charY = col.y - j * FONT_SIZE;
          if (charY > waterSurface) continue;
          if (charY < -FONT_SIZE) continue;

          const charIndex = j % col.chars.length;
          const trailFraction = j / col.length;
          let brightness: number;

          if (j === 0) {
            brightness = 1.0;
          } else if (j === 1) {
            brightness = 0.9;
          } else if (j < 4) {
            brightness = 0.75 - (j - 2) * 0.08;
          } else {
            brightness = Math.max(0, 0.6 * (1 - trailFraction));
          }

          const distToWater = waterSurface - charY;
          if (distToWater < FONT_SIZE * 3) {
            brightness *= Math.max(0, distToWater / (FONT_SIZE * 3));
          }

          brightness *= col.opacity;
          if (brightness < 0.02) continue;

          let r: number, g: number, b: number;
          if (j === 0) {
            r = 230;
            g = 255;
            b = 255;
          } else if (j < 3) {
            r = 120;
            g = 220;
            b = 255;
          } else {
            r = 40;
            g = 160;
            b = 220;
          }

          ctx.fillStyle = `rgba(${r},${g},${b},${brightness})`;

          if (j === 0) {
            ctx.shadowColor = 'rgba(120, 230, 255, 0.7)';
            ctx.shadowBlur = 8;
          }

          const cItem = col.chars[charIndex];
          if (cItem) {
            ctx.fillText(cItem.char, col.x + FONT_SIZE * 0.5, charY);
          }

          if (j === 0) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
          }
        }
      }
    }

    function drawReflections() {
      if (!ctx) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, waterSurface, width, height - waterSurface);
      ctx.clip();

      ctx.font = `${FONT_SIZE}px "SF Mono", "Fira Code", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (!col || !col.active) continue;

        for (let j = 0; j < Math.min(col.length, 8); j++) {
          const charY = col.y - j * FONT_SIZE;
          if (charY > waterSurface || charY < waterSurface - FONT_SIZE * 8) continue;

          const charIndex = j % col.chars.length;
          const reflectY = waterSurface + (waterSurface - charY);
          const depthBelow = reflectY - waterSurface;
          const reflectAlpha = Math.max(0, 0.12 * (1 - depthBelow / (height * 0.2)));

          const waveIdx = Math.floor(col.x / WAVE_RESOLUTION);
          let waveOffset = 0;
          if (waveIdx >= 0 && waveIdx < wavePoints.length && wavePoints[waveIdx]) {
            waveOffset = wavePoints[waveIdx].y * 2;
          }

          if (reflectAlpha < 0.01) continue;

          ctx.fillStyle = `rgba(80, 180, 230, ${reflectAlpha})`;
          const cItem = col.chars[charIndex];
          if (cItem) {
            ctx.fillText(
              cItem.char,
              col.x + FONT_SIZE * 0.5 + Math.sin(depthBelow * 0.05) * 3,
              reflectY + waveOffset,
            );
          }
        }
      }
      ctx.restore();
    }

    function updateRipples(dt: number) {
      let i = ripples.length;
      while (i--) {
        const r = ripples[i];
        if (!r) continue;
        r.radius += r.speed * dt;
        r.life -= r.decay * dt;
        if (r.life <= 0 || r.radius > r.maxRadius) {
          ripples.splice(i, 1);
        }
      }
    }

    function drawRipples() {
      if (!ctx) return;
      for (let i = 0; i < ripples.length; i++) {
        const r = ripples[i];
        if (!r) continue;
        const alpha = r.life * 0.3;

        for (let ring = 0; ring < 3; ring++) {
          const ringRadius = r.radius - ring * 8;
          if (ringRadius <= 0) continue;
          const ringAlpha = alpha * (1 - ring * 0.3);

          ctx.beginPath();
          ctx.ellipse(r.x, r.y + ring * 2, ringRadius, ringRadius * 0.3, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(100, 200, 240, ${ringAlpha})`;
          ctx.lineWidth = 1 - ring * 0.2;
          ctx.stroke();
        }
      }
    }

    function updateWaves() {
      const damping = 0.97;
      const tension = 0.03;
      const spread = 0.25;

      for (let i = 0; i < wavePoints.length; i++) {
        const p = wavePoints[i];
        if (!p) continue;
        p.vy += -tension * p.y;
        p.vy *= damping;
        p.y += p.vy;
      }

      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < wavePoints.length; i++) {
          const cur = wavePoints[i];
          const prev = wavePoints[i - 1];
          const next = wavePoints[i + 1];
          if (prev && cur) cur.vy += spread * (prev.y - cur.y);
          if (next && cur) cur.vy += spread * (next.y - cur.y);
        }
      }
    }

    function drawWaterSurface(time: number) {
      if (!ctx) return;
      const waterGrad = ctx.createLinearGradient(0, waterSurface, 0, height);
      waterGrad.addColorStop(0, 'rgba(8, 14, 24, 0.65)');
      waterGrad.addColorStop(0.3, 'rgba(5, 10, 18, 0.88)');
      waterGrad.addColorStop(1, 'rgba(3, 6, 12, 0.96)');
      ctx.fillStyle = waterGrad;
      ctx.fillRect(0, waterSurface - 2, width, height - waterSurface + 2);

      ctx.beginPath();
      for (let x = 0; x <= width; x += WAVE_RESOLUTION) {
        const idx = Math.floor(x / WAVE_RESOLUTION);
        const wp = wavePoints[idx];
        const waveY = wp ? wp.y : 0;
        const ambient =
          Math.sin(x * 0.01 + time * 0.8) * 1.5 +
          Math.sin(x * 0.023 + time * 0.5) * 1.0 +
          Math.sin(x * 0.007 + time * 0.3) * 2.0;
        const py = waterSurface + waveY + ambient;
        if (x === 0) ctx.moveTo(x, py);
        else ctx.lineTo(x, py);
      }
      ctx.strokeStyle = 'rgba(80, 190, 240, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const surfGlow = ctx.createLinearGradient(0, waterSurface - 10, 0, waterSurface + 20);
      surfGlow.addColorStop(0, 'rgba(60, 180, 240, 0)');
      surfGlow.addColorStop(0.4, 'rgba(60, 180, 240, 0.06)');
      surfGlow.addColorStop(0.6, 'rgba(60, 180, 240, 0.04)');
      surfGlow.addColorStop(1, 'rgba(60, 180, 240, 0)');
      ctx.fillStyle = surfGlow;
      ctx.fillRect(0, waterSurface - 10, width, 30);
    }

    function drawVignette() {
      if (!ctx) return;
      const cx = width / 2;
      const cy = height / 2;
      const maxDim = Math.max(width, height);
      const vignette = ctx.createRadialGradient(cx, cy, maxDim * 0.25, cx, cy, maxDim * 0.85);
      vignette.addColorStop(0, 'rgba(4, 7, 14, 0)');
      vignette.addColorStop(1, 'rgba(4, 7, 14, 0.55)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    }

    function render(timestamp: number) {
      if (!running) return;
      if (!lastTime) lastTime = timestamp;
      let dt = Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;

      if (prefersReduced) dt = 0;
      const time = timestamp / 1000;

      ctx?.clearRect(0, 0, width, height);
      if (ctx) {
        ctx.fillStyle = '#060a12';
        ctx.fillRect(0, 0, width, height);
      }

      updateColumns(dt);
      updateRipples(dt);
      updateWaves();

      drawColumns();
      drawWaterSurface(time);
      drawReflections();
      drawRipples();
      drawVignette();

      animId = requestAnimationFrame(render);
    }

    const handleClick = (e: MouseEvent) => {
      disturbWave(e.clientX, -4 - Math.random() * 3);
      spawnRipple(e.clientX, waterSurface);
      const colIdx = Math.floor(e.clientX / FONT_SIZE);
      for (let di = -1; di <= 1; di++) {
        const ci = colIdx + di;
        const targetCol = columns[ci];
        if (targetCol) {
          targetCol.active = true;
          targetCol.y = e.clientY;
          targetCol.speed = 2.5 + Math.random() * 2;
          targetCol.opacity = 0.8 + Math.random() * 0.2;
          targetCol.hitWater = false;
        }
      }
    };

    window.addEventListener('resize', resize);
    window.addEventListener('click', handleClick);

    const onVisibility = () => {
      running = !document.hidden;
      if (running) {
        lastTime = 0;
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
      window.removeEventListener('click', handleClick);
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
