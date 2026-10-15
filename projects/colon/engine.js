const N = 24;
const FILTERS = [8, 16, 24, 24];

const CLASSES = [
  { id: "TUMOR", name: "Tumor", call: "Malignant" },
  { id: "STROMA", name: "Stroma", call: "Benign" },
  { id: "COMPLEX", name: "Complex stroma", call: "Benign" },
  { id: "LYMPHO", name: "Lymphocytes", call: "Benign" },
  { id: "DEBRIS", name: "Debris", call: "Benign" },
  { id: "MUCOSA", name: "Mucosa", call: "Benign" },
  { id: "ADIPOSE", name: "Adipose", call: "Benign" },
  { id: "EMPTY", name: "Empty", call: "Benign" }
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(img, x, y, r, g, b, rad) {
  const r2 = rad * rad;
  for (let yy = Math.max(0, Math.floor(y - rad)); yy <= Math.min(N - 1, Math.ceil(y + rad)); yy++) {
    for (let xx = Math.max(0, Math.floor(x - rad)); xx <= Math.min(N - 1, Math.ceil(x + rad)); xx++) {
      const d = (xx - x) * (xx - x) + (yy - y) * (yy - y);
      if (d > r2) continue;
      const i = (yy * N + xx) * 3;
      const mix = 1 - d / (r2 + 0.001);
      img[i] = img[i] * (1 - mix) + r * mix;
      img[i + 1] = img[i + 1] * (1 - mix) + g * mix;
      img[i + 2] = img[i + 2] * (1 - mix) + b * mix;
    }
  }
}

function wash(img, r, g, b, rand, amount) {
  for (let i = 0; i < img.length; i += 3) {
    const n = (rand() - 0.5) * amount;
    img[i] = Math.min(1, Math.max(0, r + n));
    img[i + 1] = Math.min(1, Math.max(0, g + n * 0.8));
    img[i + 2] = Math.min(1, Math.max(0, b + n * 0.6));
  }
}

function makePatch(classIndex, seed) {
  const rand = mulberry32(seed);
  const img = new Float32Array(N * N * 3);
  if (classIndex === 0) {
    wash(img, 0.55, 0.22, 0.62, rand, 0.08);
    const count = 28 + Math.floor(rand() * 18);
    for (let i = 0; i < count; i++) paint(img, rand() * N, rand() * N, 0.18, 0.05, 0.32, 0.7 + rand() * 1.3);
  } else if (classIndex === 1) {
    wash(img, 0.92, 0.62, 0.68, rand, 0.05);
    for (let y = 0; y < N; y += 2) {
      for (let x = 0; x < N; x++) {
        const wave = Math.sin(x / 2.2 + y) > 0 ? 0.08 : -0.04;
        const i = (y * N + x) * 3;
        img[i] = Math.min(1, img[i] + wave);
        img[i + 1] = Math.min(1, img[i + 1] + wave * 0.4);
      }
    }
  } else if (classIndex === 2) {
    wash(img, 0.78, 0.4, 0.55, rand, 0.06);
    for (let i = 0; i < 8; i++) paint(img, rand() * N, rand() * N, 0.85, 0.45, 0.55, 2 + rand() * 3);
    for (let i = 0; i < 14; i++) paint(img, rand() * N, rand() * N, 0.25, 0.08, 0.4, 1 + rand());
  } else if (classIndex === 3) {
    wash(img, 0.28, 0.16, 0.58, rand, 0.04);
    for (let i = 0; i < 70; i++) paint(img, rand() * N, rand() * N, 0.08, 0.05, 0.28, 0.6);
  } else if (classIndex === 4) {
    wash(img, 0.42, 0.32, 0.22, rand, 0.08);
    for (let i = 0; i < 7; i++) paint(img, rand() * N, rand() * N, 0.28 + rand() * 0.2, 0.22, 0.14, 2 + rand() * 3);
  } else if (classIndex === 5) {
    wash(img, 0.72, 0.9, 0.92, rand, 0.04);
    for (let i = 0; i < 3; i++) paint(img, rand() * N, rand() * N, 0.85, 0.95, 0.96, 4 + rand() * 3);
  } else if (classIndex === 6) {
    wash(img, 0.9, 0.58, 0.64, rand, 0.04);
    const spots = [[6, 6], [6, 17], [17, 6], [17, 17]];
    spots.forEach(([x, y]) => {
      paint(img, x, y, 0.96, 0.9, 0.9, 3.2);
      paint(img, x, y, 0.98, 0.97, 0.96, 1.6);
    });
  } else {
    wash(img, 0.93, 0.78, 0.8, rand, 0.03);
    for (let i = 0; i < 6; i++) paint(img, 3 + rand() * 18, 3 + rand() * 18, 0.99, 0.99, 0.97, 3.4 + rand() * 1.5);
  }
  return img;
}

function conv(x, w, h, cin, weight, bias, cout) {
  const y = new Float32Array(w * h * cout);
  for (let oc = 0; oc < cout; oc++) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        let sum = bias[oc];
        for (let ic = 0; ic < cin; ic++) {
          const base = (oc * cin + ic) * 9;
          for (let ky = 0; ky < 3; ky++) {
            const iy = yy + ky - 1;
            if (iy < 0 || iy >= h) continue;
            for (let kx = 0; kx < 3; kx++) {
              const ix = xx + kx - 1;
              if (ix < 0 || ix >= w) continue;
              sum += x[(iy * w + ix) * cin + ic] * weight[base + ky * 3 + kx];
            }
          }
        }
        y[(yy * w + xx) * cout + oc] = sum;
      }
    }
  }
  return y;
}

function relu(x) {
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] > 0 ? x[i] : 0.1 * x[i];
  return y;
}

function pool(x, w, h, c) {
  const ow = Math.floor(w / 2);
  const oh = Math.floor(h / 2);
  const y = new Float32Array(ow * oh * c);
  const index = new Int32Array(ow * oh * c);
  for (let yy = 0; yy < oh; yy++) {
    for (let xx = 0; xx < ow; xx++) {
      for (let ic = 0; ic < c; ic++) {
        let best = -Infinity;
        let at = 0;
        for (let ky = 0; ky < 2; ky++) {
          for (let kx = 0; kx < 2; kx++) {
            const sx = xx * 2 + kx;
            const sy = yy * 2 + ky;
            const i = (sy * w + sx) * c + ic;
            if (x[i] > best) { best = x[i]; at = i; }
          }
        }
        const o = (yy * ow + xx) * c + ic;
        y[o] = best;
        index[o] = at;
      }
    }
  }
  return { data: y, index, w: ow, h: oh };
}

function gap(x, w, h, c) {
  const y = new Float32Array(c);
  const area = w * h;
  for (let i = 0; i < x.length; i++) y[i % c] += x[i];
  for (let i = 0; i < c; i++) y[i] /= area;
  return y;
}

function softmax(logits) {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
  const out = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) { out[i] = Math.exp(logits[i] - max); sum += out[i]; }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

function forward(rgb, weights, keep) {
  let x = rgb;
  let w = N;
  let h = N;
  let c = 3;
  const layers = [];
  for (let li = 0; li < 4; li++) {
    const cout = FILTERS[li];
    const pre = conv(x, w, h, c, weights.conv[li], weights.bias[li], cout);
    const act = relu(pre);
    let pooled = null;
    let next = act;
    let nw = w;
    let nh = h;
    if (li < 3) {
      pooled = pool(act, w, h, cout);
      next = pooled.data;
      nw = pooled.w;
      nh = pooled.h;
    }
    if (keep) layers.push({ x, pre, act, pooled, w, h, c, cout });
    x = next;
    w = nw;
    h = nh;
    c = cout;
  }
  const flat = gap(x, w, h, c);
  const logits = new Float32Array(8);
  for (let oc = 0; oc < 8; oc++) {
    let sum = weights.denseBias[oc];
    for (let i = 0; i < flat.length; i++) sum += flat[i] * weights.dense[oc * flat.length + i];
    logits[oc] = sum;
  }
  const probs = softmax(logits);
  let pred = 0;
  for (let i = 1; i < 8; i++) if (probs[i] > probs[pred]) pred = i;
  return { probs, pred, logits, flat, layers, last: x, lastW: w, lastH: h, lastC: c };
}

const engine = { N, FILTERS, CLASSES, makePatch, conv, relu, pool, gap, softmax, forward };
if (typeof module !== "undefined") module.exports = engine;
if (typeof window !== "undefined") window.ColonEngine = engine;
