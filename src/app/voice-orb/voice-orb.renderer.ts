/**
 * Sunmarke audio-reactive circular orbit. Canvas-only visual feedback.
 * It does not capture a microphone, send audio, recognise speech or modify a transcript.
 * Uses colours from the supplied Sunmarke School logo.
 */
export const SCHOOL_ORBIT_COLORS = [
  '#ec2e93', '#f58a24', '#ffe829', '#a8ce2e', '#12a9d7', '#2d48a0', '#eb2b91',
] as const;

export function microphoneRms(samples: Uint8Array): number {
  if (!samples.length) return 0;
  let power = 0;
  for (const sample of samples) {
    const v = (sample - 128) / 128;
    power += v * v;
  }
  return Math.sqrt(power / samples.length);
}

export function noiseGatedLevel(rms: number): number {
  // The gate avoids a distracting pulsing ring when the classroom is quiet.
  return rms > 0.018 ? Math.min(1, Math.max(0, (rms - 0.018) * 14)) : 0;
}

export function smoothLevel(previous: number, incoming: number): number {
  const speed = incoming > previous ? 0.36 : 0.15;
  const next = previous + (incoming - previous) * speed;
  return next < 0.008 ? 0 : next;
}

export function drawVoiceOrbit(
  canvas: HTMLCanvasElement,
  level = 0,
  frequency?: Uint8Array,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const size = 256;
  const pixels = Math.round(size * dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const radius = 71.5;
  const amplitude = Math.min(1, Math.max(0, level));

  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(38,62,126,.11)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  const segments = 144;
  const point = (index: number): [number, number] => {
    const angle = index * Math.PI * 2 / segments - Math.PI / 2;
    const binIndex = frequency?.length
      ? Math.min(frequency.length - 1,
        3 + Math.floor((index % segments) / segments * frequency.length * 0.65))
      : 0;
    const spectral = frequency?.length ? frequency[binIndex] / 255 : 0;
    const texture = 0.68 + 0.32 * Math.sin(index * 0.21) ** 2;
    // Every wave deformation multiplies the actual microphone amplitude.
    const r = radius + 1.5 + amplitude * (11 + 20 * texture + 8 * spectral);
    return [c + Math.cos(angle) * r, c + Math.sin(angle) * r];
  };
  const trace = (): void => {
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const [x, y] = point(i % segments);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const gradient: CanvasGradient = ctx.createConicGradient
    ? ctx.createConicGradient(-Math.PI / 2, c, c)
    : ctx.createLinearGradient(24, 24, 210, 195);
  SCHOOL_ORBIT_COLORS.forEach((colour, index) => {
    gradient.addColorStop(index / (SCHOOL_ORBIT_COLORS.length - 1), colour);
  });

  if (amplitude > 0.015) {
    ctx.save();
    trace();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 8 + 9 * amplitude;
    ctx.globalAlpha = 0.18 + 0.27 * amplitude;
    ctx.shadowColor = '#e83597';
    ctx.shadowBlur = 20 + 18 * amplitude;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  trace();
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3.1 + 5.5 * amplitude;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = amplitude > 0.015 ? 1 : 0.82;
  ctx.stroke();
  ctx.restore();

  if (amplitude <= 0.06) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < 56; i++) {
    const theta = i / 56 * Math.PI * 2 - Math.PI / 2;
    const binIndex = frequency?.length
      ? Math.min(frequency.length - 1,
        Math.floor(i / 56 * frequency.length * 0.58)) : 0;
    const spectral = frequency?.length ? frequency[binIndex] / 255 : 0.42;
    const ray = amplitude * (3 + 8 * (0.4 + 0.6 * spectral));
    const r = radius + 4;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(theta) * r, c + Math.sin(theta) * r);
    ctx.lineTo(c + Math.cos(theta) * (r + ray), c + Math.sin(theta) * (r + ray));
    ctx.strokeStyle = SCHOOL_ORBIT_COLORS[
      Math.floor(i / 56 * (SCHOOL_ORBIT_COLORS.length - 1))
    ];
    ctx.globalAlpha = 0.23 + 0.4 * amplitude;
    ctx.lineWidth = 2.1;
    ctx.stroke();
  }
  ctx.restore();
}
