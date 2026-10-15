const { esc, load, save, mount } = window.DD;
const KEY = "dd-voc-v2";
const MARKERS = ["hexanal", "ethylbenzene", "isoprene", "acetone", "octane", "nonanal", "decane"];

let history = load(KEY, () => []);
let latest = null;
let phase = "Ready.";
let busy = false;
let settings = { temp: 25, humidity: 50, seed: 7 };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function engineer(raw, temp, humidity) {
  const ak = (raw.hexanal + raw.nonanal) / (raw.acetone + 0.001);
  const ia = raw.isoprene / (raw.acetone + 0.001);
  const load = MARKERS.reduce((sum, name) => sum + raw[name], 0);
  const tcor = temp / 25;
  const hcor = humidity / 50;
  const logisticZ = -1.4 + 0.35 * ak + 0.28 * ia + 0.04 * load - 0.15 * Math.abs(tcor - 1) - 0.1 * Math.abs(hcor - 1);
  const logistic = 100 / (1 + Math.exp(-logisticZ));
  const votes = [
    raw.hexanal > 1.8,
    raw.ethylbenzene > 1.2,
    raw.isoprene > 1.5,
    ak > 1.1,
    ia > 0.8,
    load > 10,
    Math.abs(tcor - 1) < 0.25
  ];
  const forest = (votes.filter(Boolean).length / votes.length) * 100;
  const stumps = [
    { name: "aldehydes / ketones", vote: ak > 1.2 ? 18 : -6 },
    { name: "isoprene / acetone", vote: ia > 0.9 ? 14 : -4 },
    { name: "total load", vote: load > 12 ? 16 : load > 8 ? 4 : -8 },
    { name: "temperature correction", vote: Math.abs(tcor - 1) < 0.2 ? 6 : -5 },
    { name: "humidity correction", vote: Math.abs(hcor - 1) < 0.3 ? 5 : -5 }
  ];
  const boost = Math.max(0, Math.min(100, 40 + stumps.reduce((sum, stump) => sum + stump.vote, 0)));
  return { ak, ia, load, tcor, hcor, logistic, forest, boost, votes, stumps };
}

function sampleView(root) {
  root.innerHTML = `
    <section class="card">
      <div class="grid-2">
        <label>Temperature °C <input id="temp" type="number" min="10" max="40" value="${settings.temp}"></label>
        <label>Humidity % <input id="hum" type="number" min="10" max="90" value="${settings.humidity}"></label>
        <label>Sample seed <input id="seed" type="number" min="1" max="9999" value="${settings.seed}"></label>
      </div>
      <p id="phase">${esc(phase)}</p>
      <button type="button" id="start" ${busy ? "disabled" : ""}>Start sample</button>
      <p class="note">Same seed and conditions produce the same markers. Extreme temperature or humidity lowers the correction terms.</p>
    </section>`;
  root.querySelector("#start").addEventListener("click", () => {
    if (busy) return;
    settings.temp = Number(root.querySelector("#temp").value);
    settings.humidity = Number(root.querySelector("#hum").value);
    settings.seed = Number(root.querySelector("#seed").value);
    busy = true;
    phase = "Preparing…";
    ui.paint();
    setTimeout(() => {
      phase = "Sampling…";
      ui.paint();
      setTimeout(() => {
        const random = rng(settings.seed);
        const raw = {};
        MARKERS.forEach((name) => { raw[name] = Math.round((0.3 + random() * 3.2) * 100) / 100; });
        const features = engineer(raw, settings.temp, settings.humidity);
        latest = { raw, features, settings: { ...settings }, when: new Date().toLocaleString() };
        history.unshift(latest);
        history = history.slice(0, 12);
        save(KEY, history);
        phase = "Done.";
        busy = false;
        ui.show("features");
      }, 800);
    }, 500);
  });
}

function featureTable(record) {
  const f = record.features;
  return `
    <table>
      <thead><tr><th>Marker</th><th>Value</th></tr></thead>
      <tbody>${MARKERS.map((name) => `<tr><td>${name}</td><td>${record.raw[name].toFixed(2)}</td></tr>`).join("")}</tbody>
    </table>
    <table>
      <tbody>
        <tr><td>Aldehydes / ketones</td><td>${f.ak.toFixed(3)}</td></tr>
        <tr><td>Isoprene / acetone</td><td>${f.ia.toFixed(3)}</td></tr>
        <tr><td>Total load</td><td>${f.load.toFixed(3)}</td></tr>
        <tr><td>Temperature / 25°C</td><td>${f.tcor.toFixed(3)}</td></tr>
        <tr><td>Humidity / 50%</td><td>${f.hcor.toFixed(3)}</td></tr>
      </tbody>
    </table>`;
}

function featuresView(root) {
  if (!latest) {
    root.innerHTML = "<section class='card'><p>Run a sample first.</p></section>";
    return;
  }
  root.innerHTML = `<section class="card"><h2>${esc(latest.when)}</h2>${featureTable(latest)}</section>`;
}

function modelsView(root) {
  if (!latest) {
    root.innerHTML = "<section class='card'><p>Run a sample first.</p></section>";
    return;
  }
  const f = latest.features;
  root.innerHTML = `
    <div class="stats">
      <div class="stat"><span>Logistic-style</span><b>${f.logistic.toFixed(1)}</b></div>
      <div class="stat"><span>Vote count</span><b>${f.forest.toFixed(1)}</b></div>
      <div class="stat"><span>Stumps</span><b>${f.boost.toFixed(1)}</b></div>
    </div>
    <section class="card">
      <h2>Votes</h2>
      <table><tbody>
        ${["hexanal > 1.8", "ethylbenzene > 1.2", "isoprene > 1.5", "ratio ak > 1.1", "ratio ia > 0.8", "load > 10", "temperature near 25°C"].map((label, i) =>
          `<tr><td>${label}</td><td>${f.votes[i] ? "yes" : "no"}</td></tr>`).join("")}
      </tbody></table>
    </section>
    <section class="card">
      <h2>Stump votes</h2>
      <p class="note">Each row adds or subtracts from a base of 40, then the total is clamped to 0–100.</p>
      <table><tbody>
        ${f.stumps.map((stump) => `<tr><td>${esc(stump.name)}</td><td>${stump.vote > 0 ? "+" : ""}${stump.vote}</td></tr>`).join("")}
      </tbody></table>
    </section>`;
}

function historyView(root) {
  root.innerHTML = `
    <section class="card">
      <button type="button" id="clear" class="ghost">Clear history</button>
      <table>
        <thead><tr><th>When</th><th>Seed</th><th>Logistic</th><th>Votes</th><th>Stumps</th></tr></thead>
        <tbody>
          ${history.map((row) => `<tr><td>${esc(row.when)}</td><td>${row.settings.seed}</td><td>${row.features.logistic.toFixed(1)}</td><td>${row.features.forest.toFixed(1)}</td><td>${row.features.boost.toFixed(1)}</td></tr>`).join("") || "<tr><td colspan='5'>No samples yet.</td></tr>"}
        </tbody>
      </table>
    </section>`;
  root.querySelector("#clear").addEventListener("click", () => {
    history = [];
    latest = null;
    save(KEY, history);
    ui.paint();
  });
}

const ui = mount([
  { id: "sample", label: "Sample" },
  { id: "features", label: "Features" },
  { id: "models", label: "Scores" },
  { id: "history", label: "History" }
], (id, root) => {
  if (id === "sample") sampleView(root);
  if (id === "features") featuresView(root);
  if (id === "models") modelsView(root);
  if (id === "history") historyView(root);
});
ui.paint();
