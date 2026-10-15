const { esc, load, save, mount } = window.DD;
const KEY = "dd-infra-v2";

const CLIMATE = {
  Cumming: { band: "hot-humid", cooling: 1.15, storm: 1.2 },
  Atlanta: { band: "hot-humid", cooling: 1.12, storm: 1.15 },
  NYC: { band: "mixed-humid", cooling: 0.85, storm: 1.05 },
  Chicago: { band: "cold", cooling: 0.7, storm: 0.95 }
};

const TYPES = {
  House: { setback: 8, floors: 3, coverage: 0.5, far: 1.0, height: 35 },
  Apartment: { setback: 10, floors: 6, coverage: 0.6, far: 2.4, height: 75 },
  School: { setback: 15, floors: 4, coverage: 0.45, far: 1.4, height: 55 },
  Clinic: { setback: 10, floors: 5, coverage: 0.55, far: 2.0, height: 70 }
};

const MATERIALS = {
  Timber: 0.22,
  Steel: 0.48,
  Concrete: 0.42
};

let saved = load(KEY, () => []);
let current = null;

function num(form, name) { return Number(form.get(name)); }

function evaluate(input) {
  const rule = TYPES[input.type];
  const climate = CLIMATE[input.city];
  const lot = input.width * input.depth;
  const buildW = input.width - rule.setback * 2;
  const buildD = input.depth - rule.setback * 2;
  const box = Math.max(0, buildW) * Math.max(0, buildD);
  const foot = Math.min(box, lot * rule.coverage);
  const coverage = lot ? foot / lot : 1;
  const far = lot ? (foot * input.floors) / lot : 99;
  const height = input.floors * 12;
  const green = input.green === "yes";
  const open = 1 - coverage + (green ? 0.08 : 0);
  const driveway = foot * 0.12;
  const impervious = (green ? foot * 0.55 : foot) + driveway;
  const stormRatio = lot ? (impervious / lot) * climate.storm : 9;
  const volumeM3 = foot * input.floors * 3.2 * 0.0929;
  const carbon = volumeM3 * MATERIALS[input.material];
  const twin = volumeM3 * MATERIALS.Concrete * 1.15;
  const energy = foot * input.floors * climate.cooling * (green ? 0.9 : 1) * (input.pv === "yes" ? 0.75 : 1);

  const checks = [
    { name: "Buildable box", pass: buildW > 12 && buildD > 12, detail: `${Math.max(0, buildW).toFixed(0)} × ${Math.max(0, buildD).toFixed(0)} ft after ${rule.setback} ft setbacks` },
    { name: "Floors", pass: input.floors <= rule.floors && input.floors >= 1, detail: `${input.floors} floors, limit ${rule.floors}` },
    { name: "Height", pass: height <= rule.height, detail: `${height} ft, limit ${rule.height} ft` },
    { name: "Coverage", pass: coverage <= rule.coverage + 0.001, detail: `${Math.round(coverage * 100)}% of lot, limit ${Math.round(rule.coverage * 100)}%` },
    { name: "Floor-area ratio", pass: far <= rule.far + 0.001, detail: `${far.toFixed(2)}, limit ${rule.far.toFixed(2)}` },
    { name: "Open space", pass: open >= 0.3, detail: `${Math.round(open * 100)}% counted${green ? ", including a green-roof credit" : ""}` },
    { name: "Stormwater", pass: stormRatio <= 0.62, detail: `Adjusted impervious ratio ${stormRatio.toFixed(2)} for a ${climate.band} band` }
  ];

  return {
    input,
    checks,
    pass: checks.every((c) => c.pass),
    foot,
    coverage,
    far,
    height,
    carbon,
    twin,
    energy,
    buildW: Math.max(0, buildW),
    buildD: Math.max(0, buildD),
    climate
  };
}

function drawMassing(canvas, result) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#e7f1f8";
  ctx.fillRect(0, 0, w, h);
  const input = result.input;
  const scale = Math.min(260 / input.width, 260 / input.depth);
  const ox = 30;
  const oy = 30;
  ctx.strokeStyle = "#1d4e89";
  ctx.strokeRect(ox, oy, input.width * scale, input.depth * scale);
  const sb = TYPES[input.type].setback * scale;
  ctx.strokeStyle = "#8eabc4";
  ctx.strokeRect(ox + sb, oy + sb, Math.max(0, input.width * scale - sb * 2), Math.max(0, input.depth * scale - sb * 2));
  if (result.foot > 0 && result.buildW > 0) {
    const fw = Math.sqrt(result.foot * (result.buildW / result.buildD)) * scale;
    const fd = result.foot / Math.sqrt(result.foot * (result.buildW / result.buildD)) * scale;
    ctx.fillStyle = result.pass ? "#1d4e89" : "#c45c26";
    ctx.fillRect(ox + (input.width * scale - fw) / 2, oy + (input.depth * scale - fd) / 2, fw, fd);
  }
  const baseX = 340;
  const baseY = 280;
  const floorH = Math.min(28, 180 / input.floors);
  for (let i = 0; i < input.floors; i++) {
    ctx.strokeStyle = "#1d4e89";
    ctx.strokeRect(baseX, baseY - (i + 1) * floorH, 90, floorH);
  }
  ctx.fillStyle = "#16324a";
  ctx.font = "13px Segoe UI, sans-serif";
  ctx.fillText("Plan", ox, 18);
  ctx.fillText("Section", baseX, 18);
}

function designForm(root) {
  root.innerHTML = `
    <form id="design" class="card">
      <div class="grid-2">
        <label>City band
          <select name="city">${Object.keys(CLIMATE).map((c) => `<option>${c}</option>`).join("")}</select>
        </label>
        <label>Place name
          <input name="place" required value="Lot A">
        </label>
        <label>Lot width (ft)
          <input name="width" type="number" min="20" max="600" value="90" required>
        </label>
        <label>Lot depth (ft)
          <input name="depth" type="number" min="20" max="600" value="140" required>
        </label>
        <label>Building
          <select name="type">${Object.keys(TYPES).map((t) => `<option>${t}</option>`).join("")}</select>
        </label>
        <label>Floors
          <input name="floors" type="number" min="1" max="12" value="2" required>
        </label>
        <label>Structure
          <select name="material">${Object.keys(MATERIALS).map((m) => `<option>${m}</option>`).join("")}</select>
        </label>
        <label>Green roof
          <select name="green"><option value="no">No</option><option value="yes">Yes</option></select>
        </label>
        <label>Roof PV
          <select name="pv"><option value="no">No</option><option value="yes">Yes</option></select>
        </label>
      </div>
      <button type="submit">Run checks</button>
    </form>
    <div id="result"></div>`;
  root.querySelector("#design").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    current = evaluate({
      city: form.get("city"),
      place: String(form.get("place")),
      width: num(form, "width"),
      depth: num(form, "depth"),
      type: form.get("type"),
      floors: num(form, "floors"),
      material: form.get("material"),
      green: form.get("green"),
      pv: form.get("pv")
    });
    const box = root.querySelector("#result");
    const r = current;
    box.innerHTML = `
      <section class="card">
        <h2>${esc(r.input.place)} · ${r.pass ? "Passes" : "Does not pass"}</h2>
        <p class="note">${esc(r.input.city)} is stored as a ${esc(r.climate.band)} band. Relative energy index ${r.energy.toFixed(0)}. Embodied index ${r.carbon.toFixed(1)} versus a concrete twin at ${r.twin.toFixed(1)}.</p>
        <table>
          <tbody>${r.checks.map((c) => `<tr><td class="${c.pass ? "pass" : "fail"}">${c.pass ? "Pass" : "Fail"}</td><td>${esc(c.name)}</td><td>${esc(c.detail)}</td></tr>`).join("")}</tbody>
        </table>
        <canvas class="block" id="massing" width="520" height="320"></canvas>
        <button type="button" id="keep">Save this design</button>
      </section>`;
    drawMassing(box.querySelector("#massing"), r);
    box.querySelector("#keep").addEventListener("click", () => {
      saved.unshift({ id: Date.now(), at: new Date().toLocaleString(), result: r });
      saved = saved.slice(0, 12);
      save(KEY, saved);
      box.querySelector("#keep").textContent = "Saved";
    });
  });
}

function savedView(root) {
  root.innerHTML = `
    <section class="card">
      <h2>Saved designs</h2>
      ${saved.length ? `<table>
        <thead><tr><th>When</th><th>Design</th><th>Result</th><th>Carbon index</th><th></th></tr></thead>
        <tbody>
          ${saved.map((item) => `<tr>
            <td>${esc(item.at)}</td>
            <td>${esc(item.result.input.place)} · ${esc(item.result.input.type)} · ${item.result.input.floors} fl</td>
            <td class="${item.result.pass ? "pass" : "fail"}">${item.result.pass ? "Pass" : "Fail"}</td>
            <td>${item.result.carbon.toFixed(1)}</td>
            <td><button type="button" class="small" data-open="${item.id}">Open</button> <button type="button" class="small" data-drop="${item.id}">Remove</button></td>
          </tr>`).join("")}
        </tbody>
      </table>` : "<p>No saved designs yet.</p>"}
      <div id="opened"></div>
    </section>`;
  root.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = saved.find((row) => String(row.id) === button.dataset.open);
      current = item.result;
      const host = root.querySelector("#opened");
      host.innerHTML = `<h2>${esc(item.result.input.place)}</h2><canvas class="block" id="again" width="520" height="320"></canvas>`;
      drawMassing(host.querySelector("#again"), item.result);
    });
  });
  root.querySelectorAll("[data-drop]").forEach((button) => {
    button.addEventListener("click", () => {
      saved = saved.filter((row) => String(row.id) !== button.dataset.drop);
      save(KEY, saved);
      ui.paint();
    });
  });
}

function rulesView(root) {
  root.innerHTML = `
    <section class="card">
      <h2>Rule table</h2>
      <table>
        <thead><tr><th>Type</th><th>Setback</th><th>Floors</th><th>Coverage</th><th>FAR</th><th>Height</th></tr></thead>
        <tbody>
          ${Object.entries(TYPES).map(([name, rule]) => `<tr>
            <td>${name}</td><td>${rule.setback} ft</td><td>${rule.floors}</td><td>${Math.round(rule.coverage * 100)}%</td><td>${rule.far}</td><td>${rule.height} ft</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <p class="note">Open space must stay at or above 30%. A green roof adds 8 points. Stormwater uses impervious area times the city band's storm factor, and fails above 0.62. Carbon is volume times a material factor, compared with a heavier concrete twin. These are studio rules, not a permit.</p>
    </section>`;
}

const ui = mount([
  { id: "design", label: "Design" },
  { id: "rules", label: "Rules" },
  { id: "saved", label: "Saved" }
], (id, root) => {
  if (id === "design") designForm(root);
  if (id === "rules") rulesView(root);
  if (id === "saved") savedView(root);
});
ui.paint();
