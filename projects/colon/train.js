const fs = require("fs");
const path = require("path");
const { N, FILTERS, makePatch, forward } = require("./engine");

function he(size, fanIn, rand) {
  const scale = Math.sqrt(2 / fanIn);
  const data = new Float32Array(size);
  for (let i = 0; i < size; i++) data[i] = (rand() * 2 - 1) * scale;
  return data;
}

function rand() {
  return Math.random();
}

function init() {
  const conv = [];
  const bias = [];
  let cin = 3;
  FILTERS.forEach((cout) => {
    conv.push(he(cout * cin * 9, cin * 9, rand));
    const b = new Float32Array(cout);
    for (let i = 0; i < cout; i++) b[i] = 0.05;
    bias.push(b);
    cin = cout;
  });
  const dense = he(8 * FILTERS[3], FILTERS[3], rand);
  const denseBias = new Float32Array(8);
  return { conv, bias, dense, denseBias };
}

function zerosLike(list) {
  return list.map((arr) => new Float32Array(arr.length));
}

function convBack(x, gradY, w, h, cin, weight, cout) {
  const gradX = new Float32Array(x.length);
  const gradW = new Float32Array(weight.length);
  const gradB = new Float32Array(cout);
  for (let oc = 0; oc < cout; oc++) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const g = gradY[(yy * w + xx) * cout + oc];
        gradB[oc] += g;
        for (let ic = 0; ic < cin; ic++) {
          const base = (oc * cin + ic) * 9;
          for (let ky = 0; ky < 3; ky++) {
            const iy = yy + ky - 1;
            if (iy < 0 || iy >= h) continue;
            for (let kx = 0; kx < 3; kx++) {
              const ix = xx + kx - 1;
              if (ix < 0 || ix >= w) continue;
              const xi = (iy * w + ix) * cin + ic;
              gradW[base + ky * 3 + kx] += x[xi] * g;
              gradX[xi] += weight[base + ky * 3 + kx] * g;
            }
          }
        }
      }
    }
  }
  return { gradX, gradW, gradB };
}

function trainStep(weights, velocity, image, label, lr) {
  const out = forward(image, weights, true);
  const dLogit = Float32Array.from(out.probs);
  dLogit[label] -= 1;
  const c = out.flat.length;
  const gradDense = new Float32Array(weights.dense.length);
  const gradDenseBias = new Float32Array(8);
  const gradFlat = new Float32Array(c);
  for (let oc = 0; oc < 8; oc++) {
    gradDenseBias[oc] = dLogit[oc];
    for (let i = 0; i < c; i++) {
      gradDense[oc * c + i] = dLogit[oc] * out.flat[i];
      gradFlat[i] += dLogit[oc] * weights.dense[oc * c + i];
    }
  }
  const area = out.lastW * out.lastH;
  let grad = new Float32Array(out.last.length);
  for (let i = 0; i < out.last.length; i++) grad[i] = gradFlat[i % c] / area;

  const gradConv = [];
  const gradBias = [];
  for (let li = 3; li >= 0; li--) {
    const layer = out.layers[li];
    if (li < 3) {
      const up = new Float32Array(layer.act.length);
      for (let i = 0; i < grad.length; i++) up[layer.pooled.index[i]] += grad[i];
      grad = up;
    }
    for (let i = 0; i < grad.length; i++) if (layer.pre[i] <= 0) grad[i] *= 0.1;
    const back = convBack(layer.x, grad, layer.w, layer.h, layer.c, weights.conv[li], layer.cout);
    const spatial = layer.w * layer.h;
    for (let i = 0; i < back.gradW.length; i++) back.gradW[i] /= spatial;
    for (let i = 0; i < back.gradB.length; i++) back.gradB[i] /= spatial;
    gradConv[li] = back.gradW;
    gradBias[li] = back.gradB;
    grad = back.gradX;
  }

  const packs = [
    [weights.dense, gradDense, velocity.dense],
    [weights.denseBias, gradDenseBias, velocity.denseBias]
  ];
  weights.conv.forEach((arr, i) => packs.push([arr, gradConv[i], velocity.conv[i]]));
  weights.bias.forEach((arr, i) => packs.push([arr, gradBias[i], velocity.bias[i]]));
  packs.forEach(([arr, g, v]) => {
    for (let i = 0; i < arr.length; i++) {
      v[i] = 0.9 * v[i] + g[i];
      arr[i] -= lr * v[i];
    }
  });
  let loss = 0;
  for (let i = 0; i < 8; i++) loss -= (i === label ? 1 : 0) * Math.log(out.probs[i] + 1e-8);
  return loss;
}

function accuracy(weights, seeds) {
  let hit = 0;
  seeds.forEach(([cls, seed]) => {
    const pred = forward(makePatch(cls, seed), weights, false).pred;
    if (pred === cls) hit += 1;
  });
  return hit / seeds.length;
}

const weights = init();
const velocity = {
  conv: zerosLike(weights.conv),
  bias: zerosLike(weights.bias),
  dense: new Float32Array(weights.dense.length),
  denseBias: new Float32Array(8)
};

function loadSplit(file) {
  return fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [y, rawPath] = line.split("\t");
    return { y: Number(y), rgb: new Float32Array(fs.readFileSync(rawPath)).map((v) => v / 255) };
  });
}

const train = loadSplit(path.join(__dirname, "train.txt"));
const hold = loadSplit(path.join(__dirname, "hold.txt"));

let lr = 0.05;
for (let epoch = 1; epoch <= 24; epoch++) {
  for (let i = train.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = train[i];
    train[i] = train[j];
    train[j] = tmp;
  }
  let loss = 0;
  train.forEach((row) => {
    loss += trainStep(weights, velocity, row.rgb, row.y, lr);
  });
  if (epoch === 10 || epoch === 18) lr *= 0.5;
  let hit = 0;
  hold.forEach((row) => {
    if (forward(row.rgb, weights, false).pred === row.y) hit += 1;
  });
  console.log("epoch " + epoch + " loss " + (loss / train.length).toFixed(3) + " holdout " + (hit / hold.length * 100).toFixed(1) + "%");
}

const dump = {
  n: N,
  filters: FILTERS,
  conv: weights.conv.map((arr) => Array.from(arr)),
  bias: weights.bias.map((arr) => Array.from(arr)),
  dense: Array.from(weights.dense),
  denseBias: Array.from(weights.denseBias)
};
fs.writeFileSync(path.join(__dirname, "weights.json"), JSON.stringify(dump));
console.log("wrote weights.json");
