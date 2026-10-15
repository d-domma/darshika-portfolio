const { esc, mount } = window.DD;
const SIZE = 96;

const KERNELS = {
  "Smooth": [1, 2, 1, 2, 4, 2, 1, 2, 1].map((n) => n / 16),
  "Edge X": [-1, 0, 1, -2, 0, 2, -1, 0, 1],
  "Edge Y": [-1, -2, -1, 0, 0, 0, 1, 2, 1],
  "Sharp": [0, -1, 0, -1, 5, -1, 0, -1, 0]
};

let source = null;
let stack = null;

function conv(src, w, h, kernel) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const xx = Math.min(w - 1, Math.max(0, x + kx));
          const yy = Math.min(h - 1, Math.max(0, y + ky));
          sum += src[yy * w + xx] * kernel[(ky + 1) * 3 + (kx + 1)];
        }
      }
      out[y * w + x] = sum;
    }
  }
  return out;
}

function relu(src) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] < 0 ? 0 : src[i];
  return out;
}

function pool(src, w, h) {
  const ow = Math.floor(w / 2);
  const oh = Math.floor(h / 2);
  const out = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const i = (y * 2) * w + x * 2;
      out[y * ow + x] = Math.max(src[i], src[i + 1] || 0, src[i + w] || 0, src[i + w + 1] || 0);
    }
  }
  return { data: out, w: ow, h: oh };
}

function stats(arr) {
  let min = Infinity, max = -Infinity, sum = 0, energy = 0;
  arr.forEach((v) => {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    energy += v * v;
  });
  return { min, max, mean: sum / arr.length, energy };
}

function paint(canvas, data, w, h) {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(w, h);
  let min = Infinity, max = -Infinity;
  data.forEach((v) => { if (v < min) min = v; if (v > max) max = v; });
  const span = max - min || 1;
  for (let i = 0; i < data.length; i++) {
    const g = Math.round(((data[i] - min) / span) * 255);
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = g;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

function runStack() {
  const maps = Object.entries(KERNELS).map(([name, kernel]) => {
    const raw = conv(source.gray, SIZE, SIZE, kernel);
    const activated = relu(raw);
    const pooled = pool(activated, SIZE, SIZE);
    return { name, raw, activated, pooled, stat: stats(activated) };
  });
  const merged = new Float32Array(maps[0].pooled.data.length);
  maps.forEach((map) => {
    map.pooled.data.forEach((v, i) => { merged[i] += v; });
  });
  const second = relu(conv(merged, maps[0].pooled.w, maps[0].pooled.h, KERNELS.Sharp));
  stack = { maps, merged, second, secondStat: stats(second), pooledW: maps[0].pooled.w, pooledH: maps[0].pooled.h };
}

function imageView(root) {
  root.innerHTML = `
    <section class="card">
      <label>Image <input id="file" type="file" accept="image/*"></label>
      <p class="note" id="meta">${source ? esc(source.name) + " · scaled to " + SIZE + "×" + SIZE : "No file yet."}</p>
      <canvas class="block" id="preview" width="${SIZE}" height="${SIZE}"></canvas>
      <button type="button" id="run" ${source ? "" : "disabled"}>Run the stack</button>
    </section>`;
  if (source) paint(root.querySelector("#preview"), source.gray, SIZE, SIZE);
  root.querySelector("#file").addEventListener("change", () => {
    const file = root.querySelector("#file").files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, SIZE, SIZE);
      const scale = Math.min(SIZE / img.width, SIZE / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      const frame = ctx.getImageData(0, 0, SIZE, SIZE);
      const gray = new Float32Array(SIZE * SIZE);
      const bins = new Array(16).fill(0);
      for (let i = 0; i < gray.length; i++) {
        const r = frame.data[i * 4];
        const g = frame.data[i * 4 + 1];
        const b = frame.data[i * 4 + 2];
        const value = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        gray[i] = value;
        bins[Math.min(15, Math.floor(value * 16))] += 1;
      }
      source = { name: file.name, gray, bins, width: img.width, height: img.height };
      stack = null;
      URL.revokeObjectURL(url);
      ui.paint();
    };
    img.src = url;
  });
  const run = root.querySelector("#run");
  if (run) run.addEventListener("click", () => { runStack(); ui.show("maps"); });
}

function histogram(canvas, bins) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const max = Math.max(...bins, 1);
  bins.forEach((count, i) => {
    const bh = (count / max) * (canvas.height - 20);
    ctx.fillStyle = "#1c1c1c";
    ctx.fillRect(12 + i * ((canvas.width - 24) / bins.length), canvas.height - 10 - bh, 14, bh);
  });
}

function prepView(root) {
  if (!source) {
    root.innerHTML = "<section class='card'><p>Load an image first.</p></section>";
    return;
  }
  root.innerHTML = `
    <section class="card">
      <h2>Preprocess</h2>
      <p class="note">${esc(source.name)} was ${source.width}×${source.height}, letterboxed to ${SIZE}×${SIZE}, then turned into grayscale in 0–1. The bars are a 16-bin histogram of that gray image.</p>
      <canvas class="block" id="hist" width="640" height="160"></canvas>
    </section>`;
  histogram(root.querySelector("#hist"), source.bins);
}

function mapsView(root) {
  if (!stack) {
    root.innerHTML = "<section class='card'><p>Run the stack from the Image tab.</p></section>";
    return;
  }
  root.innerHTML = `
    <section class="card">
      <h2>Layer 1 · convolution, ReLU, pool</h2>
      <div class="maps" id="layer1"></div>
    </section>
    <section class="card">
      <h2>Layer 2 · sum of pooled maps, then sharp + ReLU</h2>
      <div class="maps">
        <div><p class="note">Summed pool</p><canvas id="merged"></canvas></div>
        <div><p class="note">Second layer</p><canvas id="second"></canvas></div>
      </div>
      <table>
        <thead><tr><th>Map</th><th>Mean after ReLU</th><th>Max</th><th>Energy</th></tr></thead>
        <tbody>
          ${stack.maps.map((map) => `<tr><td>${esc(map.name)}</td><td>${map.stat.mean.toFixed(3)}</td><td>${map.stat.max.toFixed(3)}</td><td>${map.stat.energy.toFixed(1)}</td></tr>`).join("")}
          <tr><td>Second layer</td><td>${stack.secondStat.mean.toFixed(3)}</td><td>${stack.secondStat.max.toFixed(3)}</td><td>${stack.secondStat.energy.toFixed(1)}</td></tr>
        </tbody>
      </table>
      <button type="button" id="json">Download stats</button>
    </section>`;
  const host = root.querySelector("#layer1");
  stack.maps.forEach((map, index) => {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<p class="note">${esc(map.name)} · pooled</p><canvas id="m${index}"></canvas>`;
    host.appendChild(wrap);
    paint(wrap.querySelector("canvas"), map.pooled.data, map.pooled.w, map.pooled.h);
  });
  paint(root.querySelector("#merged"), stack.merged, stack.pooledW, stack.pooledH);
  paint(root.querySelector("#second"), stack.second, stack.pooledW, stack.pooledH);
  root.querySelector("#json").addEventListener("click", () => {
    const payload = {
      file: source.name,
      note: "Activation stats only. No class was assigned.",
      maps: stack.maps.map((map) => ({ name: map.name, ...map.stat })),
      second: stack.secondStat
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cnn-stats.json";
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

const ui = mount([
  { id: "image", label: "Image" },
  { id: "prep", label: "Preprocess" },
  { id: "maps", label: "Feature maps" }
], (id, root) => {
  if (id === "image") imageView(root);
  if (id === "prep") prepView(root);
  if (id === "maps") mapsView(root);
});
ui.paint();
