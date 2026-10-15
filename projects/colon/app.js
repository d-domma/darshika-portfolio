const { N, CLASSES, forward } = window.ColonEngine;

let weights = null;

function readImage(img) {
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, N, N);
  const frame = ctx.getImageData(0, 0, N, N);
  const rgb = new Float32Array(N * N * 3);
  for (let i = 0; i < N * N; i++) {
    rgb[i * 3] = frame.data[i * 4] / 255;
    rgb[i * 3 + 1] = frame.data[i * 4 + 1] / 255;
    rgb[i * 3 + 2] = frame.data[i * 4 + 2] / 255;
  }
  return rgb;
}

function show(name, out) {
  const tissue = CLASSES[out.pred];
  document.getElementById("call").textContent = tissue.call + " — " + tissue.name;
  document.getElementById("detail").textContent = name + " · " + (out.probs[out.pred] * 100).toFixed(1) + "%";
  document.getElementById("scores").innerHTML = CLASSES.map((item, i) =>
    "<li>" + item.name + ": " + (out.probs[i] * 100).toFixed(1) + "%</li>"
  ).join("");
}

function build() {
  const host = document.getElementById("samples");
  host.innerHTML = "";
  CLASSES.forEach((item) => {
    const img = document.createElement("img");
    img.alt = item.name;
    img.src = "tiles/" + item.id + ".jpg?v=1";
    img.width = 120;
    img.style.margin = "6px";
    img.style.cursor = "pointer";
    img.addEventListener("click", () => {
      if (!weights) return;
      show(item.name, forward(readImage(img), weights, false));
    });
    host.appendChild(img);
  });
}

fetch("weights.json")
  .then((res) => res.json())
  .then((data) => {
    weights = {
      conv: data.conv.map((arr) => Float32Array.from(arr)),
      bias: data.bias.map((arr) => Float32Array.from(arr)),
      dense: Float32Array.from(data.dense),
      denseBias: Float32Array.from(data.denseBias)
    };
    build();
  })
  .catch(() => {
    document.getElementById("call").textContent = "The network weights did not load.";
  });
