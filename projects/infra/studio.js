const API = "http://127.0.0.1:8000";
const home = document.getElementById("home");
const design = document.getElementById("design");
const results = document.getElementById("results");
const stepsEl = document.getElementById("steps");
const form = document.getElementById("wizard");
const back = document.getElementById("back");
const next = document.getElementById("next");
const go = document.getElementById("go");
const busy = document.getElementById("busy");
const errorBox = document.getElementById("error");
const gsp = document.getElementById("gsp");
const gspN = document.getElementById("gsp-n");

const STEPS = [
  { n: 1, title: "Location", hint: "Address — zoning is looked up for that city" },
  { n: 2, title: "Program", hint: "Type, height, materials, and budget cap" },
  { n: 3, title: "Ecology", hint: "Energy, water, and landscape" }
];

let step = 0;

function money(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function num(n, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(n) || 0);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function label(value) {
  return String(value || "").replaceAll("_", " ");
}

function show(name) {
  home.hidden = name !== "home";
  design.hidden = name !== "design";
  results.hidden = name !== "results";
  window.scrollTo(0, 0);
}

function paintSteps() {
  stepsEl.innerHTML = STEPS.map((s, i) => `
    <div class="d-flex gap-3 align-items-start">
      <div class="step-dot text-white" style="background:${step >= i ? "var(--moss)" : "#c9c3b5"}">${s.n}</div>
      <div>
        <div class="fw-semibold">${s.title}</div>
        <div class="small" style="color:#66705f">${s.hint}</div>
      </div>
    </div>`).join("");
  form.querySelectorAll("[data-step]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.step) !== step;
  });
  back.disabled = step === 0 || go.disabled;
  next.hidden = step === 2;
  go.hidden = step !== 2;
}

function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/results")) {
    const id = hash.split("/")[2];
    show("results");
    loadResult(id);
    return;
  }
  if (hash.startsWith("#/design")) {
    show("design");
    paintSteps();
    return;
  }
  show("home");
}

function payload() {
  const data = new FormData(form);
  return {
    address: String(data.get("address") || "").trim(),
    lot_width_m: Number(data.get("lot_width_m")),
    lot_depth_m: Number(data.get("lot_depth_m")),
    building_type: data.get("building_type"),
    stories: Number(data.get("stories")),
    units: Number(data.get("units")),
    bedrooms: Number(data.get("bedrooms")),
    roof_type: data.get("roof_type"),
    primary_material: data.get("primary_material"),
    solar_panels: form.solar_panels.checked,
    rainwater_harvesting: form.rainwater_harvesting.checked,
    native_landscaping: form.native_landscaping.checked,
    ev_charging: form.ev_charging.checked,
    parking_spaces: Number(data.get("parking_spaces")),
    green_space_priority: Number(data.get("green_space_priority")),
    budget_tier: data.get("budget_tier")
  };
}

function fileUrl(id, name) {
  return `${API}/api/designs/${id}/files/${name}`;
}

function renderResult(result) {
  const files = result.files || {};
  const downloads = [
    ["model.blend", "Download Blender file", "btn-moss"],
    ["model.stl", "STL for 3D print", "btn-outline-secondary"],
    ["model.glb", "GLB preview", "btn-outline-secondary"],
    ["preview.png", "Exterior still", "btn-outline-secondary"],
    ["interior.png", "Interior still", "btn-outline-secondary"],
    ["cutaway.png", "Cutaway still", "btn-outline-secondary"]
  ].filter(([name]) => files[name]).map(([name, text, cls]) =>
    `<a class="btn ${cls} rounded-pill" href="${fileUrl(result.id, name)}">${text}</a>`
  ).join("");

  const viewer = files["model.glb"]
    ? `<model-viewer src="${fileUrl(result.id, "model.glb")}" camera-controls touch-action="pan-y" shadow-intensity="1" alt="Blender massing"></model-viewer>`
    : (files["preview.png"]
      ? `<img class="still" alt="Exterior still" src="${fileUrl(result.id, "preview.png")}">`
      : `<div class="card-quiet p-4">The 3D file is not ready yet.</div>`);

  const zoning = result.zoning ? `
    <p class="small mb-2" style="color:#66705f">${esc(result.zoning.source)}</p>
    <div class="row g-2 small mb-2">
      <div class="col-6">FAR ≤ ${esc(result.zoning.far)}</div>
      <div class="col-6">Height ≤ ${esc(result.zoning.height_m)} m</div>
      <div class="col-6">Coverage ≤ ${num(result.zoning.coverage * 100)}%</div>
      <div class="col-6">Open space ≥ ${num(result.zoning.green * 100)}%</div>
      <div class="col-6">Front ${esc(result.zoning.front_m)} m</div>
      <div class="col-6">Side ${esc(result.zoning.side_m)} m / rear ${esc(result.zoning.rear_m)} m</div>
    </div>` : "";

  const cost = result.cost ? `
    <div class="d-flex justify-content-between align-items-baseline">
      <div>
        <div class="small text-uppercase">Screening cost</div>
        <div class="fs-4">$${money(result.cost.estimate_usd)}</div>
      </div>
      <div class="text-end">
        <div class="small text-uppercase">${esc(result.cost.tier)} cap</div>
        <div class="fs-5">$${money(result.cost.cap_usd)}</div>
        <strong class="${result.cost.within_budget ? "pass" : "fail"}">${result.cost.within_budget ? "Within budget" : "Over cap"}</strong>
      </div>
    </div>
    <p class="small mt-2 mb-0" style="color:#66705f">${esc(result.cost.basis)}</p>` : "";

  const checks = (result.compliance?.checks || []).map((c) => `
    <tr>
      <td><div class="fw-semibold">${esc(c.title)}</div><div class="small" style="color:#66705f">${esc(c.guidance)}</div></td>
      <td class="text-nowrap small">${esc(c.actual)}</td>
      <td class="text-end ${c.passed ? "pass" : "fail"}">${c.passed ? "Pass" : "Fail"}</td>
    </tr>`).join("");

  const search = result.search ? `
    <div class="card-quiet p-4 mb-4">
      <h2 class="h5">AI search under this area's rules</h2>
      <p class="mb-3">${esc(result.search.selected_reason)}</p>
      <div class="row g-3">
        <div class="col-md-3 metric"><div class="small text-uppercase">Variants tested</div><div class="fs-4">${esc(result.search.n_sampled)}</div><div class="small">${esc(result.search.n_legal)} legal and in budget</div></div>
        <div class="col-md-3 metric"><div class="small text-uppercase">KNN predicted EUI</div><div class="fs-4">${esc(result.search.knn_eui_kbtu_ft2 ?? result.search.proposed_eui_kbtu_ft2)}</div><div class="small">kBtu/ft² from ${esc(result.search.knn_n || 0)} LL84 peers</div></div>
        <div class="col-md-3 metric"><div class="small text-uppercase">Screening ops EUI</div><div class="fs-4">${esc(result.search.proposed_eui_kbtu_ft2)}</div><div class="small">kBtu/ft² from the kg CO₂e table</div></div>
        <div class="col-md-3 metric"><div class="small text-uppercase">Peer median EUI</div><div class="fs-4">${esc(result.search.peers?.median_eui_kbtu_ft2 ?? "—")}</div><div class="small">${esc(result.search.budget_rejected || 0)} over budget</div></div>
      </div>
      <p class="small mt-3 mb-2" style="color:#66705f">${esc(result.search.ai_method || result.search.peers?.source || "")}</p>
      ${(result.search.runners_up || []).length ? `<div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th>Other legal options</th><th>Stories</th><th>Embodied kg</th><th>Net annual kg</th></tr></thead><tbody>
        ${result.search.runners_up.map((r) => `<tr><td>${esc(label(r.material))} · ${esc(label(r.roof_type))}</td><td>${esc(r.stories)}</td><td>${money(r.embodied_kg_co2e)}</td><td>${money(r.net_annual_kg_co2e)}</td></tr>`).join("")}
      </tbody></table></div>` : ""}
    </div>` : "";

  const env = result.environment;
  const zoneLine = result.zoning
    ? ` · ${esc(result.zoning.city)}${result.zoning.district ? " " + esc(result.zoning.district) : ""}`
    : "";

  results.innerHTML = `
    <div class="d-flex flex-wrap justify-content-between gap-3 mb-4">
      <div>
        <p class="small text-uppercase fw-semibold mb-1" style="color:var(--leaf)">Design ${esc(result.id)}</p>
        <h1 class="h2 mb-1">${esc(env.location.name)}</h1>
        <p class="mb-0" style="color:#4a5446">${esc(env.climate_zone)}${zoneLine} · ${esc(result.compliance.zone)}</p>
      </div>
      <a href="#/design" class="btn btn-outline-secondary rounded-pill align-self-start">New design</a>
    </div>
    <p class="fs-5 mb-4" style="max-width:52rem">${esc(result.summary)}</p>
    <div class="row g-4 mb-4">
      <div class="col-lg-7">
        <div class="card-quiet p-2">${viewer}</div>
        <p class="small mt-2 mb-2" style="color:#66705f">Drag to orbit, scroll to zoom. The file is the Blender massing when generation finishes.</p>
        <div class="d-flex flex-wrap gap-2 mt-2">${downloads}</div>
        ${result.blender_ready ? "" : `<div class="alert alert-warning mt-3">Blender did not finish this model. ${esc(result.blender_error || "")}</div>`}
      </div>
      <div class="col-lg-5">
        <div class="card-quiet p-4 mb-3">
          <h2 class="h5">Proposed vs conventional</h2>
          <div class="row g-3 mt-1">
            <div class="col-6 metric"><div class="small text-uppercase">Embodied CO₂e</div><div class="fs-4">${money(result.proposed_impact.embodied_kg_co2e)}</div><div class="small">vs ${money(result.conventional_impact.embodied_kg_co2e)} kg conventional</div></div>
            <div class="col-6 metric"><div class="small text-uppercase">Net annual CO₂e</div><div class="fs-4">${money(result.proposed_impact.net_annual_kg_co2e)}</div><div class="small">vs ${money(result.conventional_impact.net_annual_kg_co2e)} kg</div></div>
            <div class="col-6 metric"><div class="small text-uppercase">Green space</div><div class="fs-4">${esc(result.proposed_impact.green_space_pct)}%</div><div class="small">vs ${esc(result.conventional_impact.green_space_pct)}%</div></div>
            <div class="col-6 metric"><div class="small text-uppercase">Stormwater kept</div><div class="fs-4">${esc(result.proposed_impact.stormwater_retained_m3)} m³</div><div class="small">on-site retention estimate</div></div>
          </div>
        </div>
        ${(zoning || cost) ? `<div class="card-quiet p-4 mb-3"><h2 class="h5">Area rules &amp; budget</h2>${zoning}${cost}</div>` : ""}
        <div class="card-quiet p-4">
          <div class="d-flex justify-content-between"><h2 class="h5 mb-0">Code check</h2><strong class="${result.compliance.passed ? "pass" : "fail"}">${result.compliance.passed ? "Required checks passed" : "Review required"} · ${esc(result.compliance.score)}</strong></div>
          <p class="small mt-2" style="color:#66705f">${esc(result.compliance.jurisdiction)}</p>
          <div class="table-responsive"><table class="table table-sm align-middle mb-0"><tbody>${checks}</tbody></table></div>
        </div>
      </div>
    </div>
    ${search}
    <div class="row g-4">
      <div class="col-md-6"><div class="card-quiet p-4 h-100"><h2 class="h5">Environmental snapshot</h2><ul class="list-unstyled mb-0">
        <li>Mean temperature: ${esc(env.mean_temp_c)} °C</li>
        <li>Annual precipitation: ${num(env.annual_precip_mm)} mm</li>
        <li>Solar resource: ${num(env.annual_solar_kwh_m2)} kWh/m²</li>
        <li>Nearby green space: ${num(env.nearby_green_m2)} m² (${esc(env.nearby_park_count)} parks)</li>
        <li>Tree-cover score: ${esc(env.tree_cover_score)}</li>
        <li>Sensitivity: ${esc(env.ecological_sensitivity)}</li>
      </ul></div></div>
      <div class="col-md-6"><div class="card-quiet p-4 h-100"><h2 class="h5">Recommendations</h2><ul class="mb-0">${(result.recommendations || []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div></div>
    </div>`;
}

async function loadResult(id) {
  const cached = sessionStorage.getItem("eco-infra-result");
  if (cached) {
    const parsed = JSON.parse(cached);
    if (!id || parsed.id === id) {
      renderResult(parsed);
      if (!id) history.replaceState(null, "", `#/results/${parsed.id}`);
      return;
    }
  }
  if (!id) {
    results.innerHTML = `<p>No design yet. <a href="#/design">Start a design</a>.</p>`;
    return;
  }
  results.innerHTML = `<p>Loading design…</p>`;
  try {
    const response = await fetch(`${API}/api/designs/${id}`);
    if (!response.ok) throw new Error("Design not found");
    const result = await response.json();
    sessionStorage.setItem("eco-infra-result", JSON.stringify(result));
    renderResult(result);
  } catch (err) {
    results.innerHTML = `<p>That design is not on this machine. <a href="#/design">Start a design</a>.</p>`;
  }
}

gsp.addEventListener("input", () => { gspN.textContent = gsp.value; });
back.addEventListener("click", () => { step = Math.max(0, step - 1); paintSteps(); });
next.addEventListener("click", () => { step = Math.min(2, step + 1); paintSteps(); });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  go.disabled = true;
  back.disabled = true;
  go.textContent = "Building in Blender…";
  busy.hidden = false;
  try {
    const response = await fetch(`${API}/api/designs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload())
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.detail || "Generation failed.");
    sessionStorage.setItem("eco-infra-result", JSON.stringify(body));
    location.hash = `#/results/${body.id}`;
  } catch (err) {
    errorBox.hidden = false;
    errorBox.textContent = err.message === "Failed to fetch"
      ? "The Eco Infra Studio API is not running. Start it from the eco-infra-studio project, then try again."
      : err.message;
  } finally {
    go.disabled = false;
    back.disabled = false;
    go.textContent = "Analyze & generate 3D";
    busy.hidden = true;
    paintSteps();
  }
});

window.addEventListener("hashchange", route);
paintSteps();
route();
