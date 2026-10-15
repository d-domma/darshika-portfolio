const { esc, load, save, mount } = window.DD;
const KEY = "dd-defense-v2";

const PLACES = [
  { id: "square", name: "Cumming Square", x: 90, y: 200 },
  { id: "library", name: "County Library", x: 170, y: 120 },
  { id: "admin", name: "County Admin", x: 230, y: 190 },
  { id: "hospital", name: "Northside Hospital", x: 330, y: 70 },
  { id: "sawnee", name: "Sawnee Mountain", x: 60, y: 50 },
  { id: "park", name: "Sharon Springs Park", x: 360, y: 210 },
  { id: "school", name: "School", x: 250, y: 300 },
  { id: "exit", name: "GA-400 Exit 14", x: 150, y: 310 }
];

const LINKS = [
  ["square", "library", 0],
  ["square", "admin", 1],
  ["square", "exit", 0],
  ["library", "sawnee", 0],
  ["library", "admin", 0],
  ["library", "hospital", 2],
  ["admin", "hospital", 1],
  ["admin", "park", 2],
  ["admin", "school", 1],
  ["hospital", "park", 0],
  ["park", "school", 0],
  ["school", "exit", 1],
  ["sawnee", "hospital", 2]
];

function place(id) { return PLACES.find((p) => p.id === id); }

function edgeLength(edge) {
  const a = place(edge[0]);
  const b = place(edge[1]);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function route(start, end, safer) {
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const used = new Set();
  const ids = PLACES.map((p) => p.id);
  while (used.size < ids.length) {
    let best = null;
    let bestDist = Infinity;
    ids.forEach((id) => {
      if (used.has(id) || !dist.has(id)) return;
      if (dist.get(id) < bestDist) { bestDist = dist.get(id); best = id; }
    });
    if (!best) break;
    used.add(best);
    if (best === end) break;
    LINKS.forEach((edge) => {
      const other = edge[0] === best ? edge[1] : edge[1] === best ? edge[0] : null;
      if (!other || used.has(other)) return;
      const length = edgeLength(edge);
      const weight = safer ? length * (1 + edge[2]) : length;
      const next = dist.get(best) + weight;
      if (next < (dist.get(other) ?? Infinity)) {
        dist.set(other, next);
        prev.set(other, best);
      }
    });
  }
  if (!prev.has(end) && start !== end) return null;
  const path = [end];
  let cursor = end;
  while (cursor !== start) {
    cursor = prev.get(cursor);
    if (!cursor) return null;
    path.push(cursor);
  }
  path.reverse();
  let miles = 0;
  let danger = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = LINKS.find((link) =>
      (link[0] === path[i] && link[1] === path[i + 1]) || (link[1] === path[i] && link[0] === path[i + 1])
    );
    miles += edgeLength(edge);
    danger += edge[2];
  }
  return { path, miles: miles / 80, danger };
}

function draw(canvas, paths) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f6f1ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  LINKS.forEach((edge) => {
    const a = place(edge[0]);
    const b = place(edge[1]);
    ctx.strokeStyle = edge[2] ? "#c4b2a2" : "#eadfd4";
    ctx.lineWidth = 1 + edge[2];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });
  paths.forEach((item) => {
    if (!item.route) return;
    ctx.strokeStyle = "#9f1d1d";
    ctx.lineWidth = item.dash ? 1.5 : 3;
    ctx.setLineDash(item.dash ? [5, 4] : []);
    ctx.beginPath();
    item.route.path.forEach((id, index) => {
      const p = place(id);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });
  PLACES.forEach((p) => {
    ctx.fillStyle = "#1c140f";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "12px Segoe UI, sans-serif";
    ctx.fillText(p.name, p.x + 6, p.y - 6);
  });
}

let book = load(KEY, () => ({ contacts: [], trips: [] }));
let checkin = null;
let ticker = null;

function persist() { save(KEY, book); }

function nowView(root) {
  const primary = book.contacts[0];
  root.innerHTML = `
    <section class="card">
      <h2>Right now</h2>
      <a class="btn" href="tel:911">Call 911</a>
      <p class="note">${primary ? `First saved contact: ${esc(primary.name)}.` : "Add a parent on the Contacts tab before texting."}</p>
      <form id="ping">
        <label>Message
          <textarea name="message">I need you. This is my safety text. Please call me.</textarea>
        </label>
        <button type="submit" ${primary ? "" : "disabled"}>Text ${primary ? esc(primary.name) : "parent"}</button>
      </form>
    </section>
    <section class="card">
      <h2>Check-in</h2>
      <p class="note">If the timer ends, the page readies the same text. It does not send by itself.</p>
      <form id="check" class="row">
        <label>Minutes <input name="mins" type="number" min="1" max="180" value="20"></label>
        <button type="submit">Start</button>
        <button type="button" class="ghost" id="cancel">Cancel</button>
      </form>
      <p id="check-status">${checkin ? "Check-in running." : "No check-in."}</p>
    </section>`;
  root.querySelector("#ping").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!primary) return;
    const body = encodeURIComponent(new FormData(event.target).get("message").toString());
    const phone = primary.phone.replace(/[^\d+]/g, "");
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    window.location.href = `sms:${phone}${ios ? "&" : "?"}body=${body}`;
  });
  root.querySelector("#check").addEventListener("submit", (event) => {
    event.preventDefault();
    const mins = Number(new FormData(event.target).get("mins"));
    checkin = Date.now() + mins * 60000;
    if (ticker) clearInterval(ticker);
    ticker = setInterval(tick, 500);
    tick();
  });
  root.querySelector("#cancel").addEventListener("click", () => {
    checkin = null;
    if (ticker) clearInterval(ticker);
    root.querySelector("#check-status").textContent = "Check-in canceled.";
  });
  function tick() {
    const el = root.querySelector("#check-status");
    if (!el) return;
    if (!checkin) { el.textContent = "No check-in."; return; }
    const left = checkin - Date.now();
    if (left <= 0) {
      checkin = null;
      el.textContent = "Check-in missed. The text above is ready to send. Nothing was sent automatically.";
      return;
    }
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    el.textContent = `Time left ${m}:${String(s).padStart(2, "0")}.`;
  }
  if (checkin) {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(tick, 500);
    tick();
  }
}

function contactsView(root) {
  root.innerHTML = `
    <form id="add" class="card">
      <div class="grid-2">
        <label>Name <input name="name" required></label>
        <label>Phone <input name="phone" required placeholder="7705550100"></label>
      </div>
      <button type="submit">Save contact</button>
    </form>
    <section class="card">
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th></th></tr></thead>
        <tbody>
          ${book.contacts.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td><button type="button" class="small" data-up="${c.id}">First</button> <button type="button" class="small" data-del="${c.id}">Remove</button></td></tr>`).join("") || "<tr><td colspan='3'>No contacts yet.</td></tr>"}
        </tbody>
      </table>
    </section>`;
  root.querySelector("#add").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    book.contacts.push({ id: String(Date.now()), name: String(form.get("name")).slice(0, 40), phone: String(form.get("phone")).slice(0, 20) });
    persist();
    ui.paint();
  });
  root.querySelectorAll("[data-del]").forEach((button) => {
    button.addEventListener("click", () => {
      book.contacts = book.contacts.filter((c) => c.id !== button.dataset.del);
      persist();
      ui.paint();
    });
  });
  root.querySelectorAll("[data-up]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = book.contacts.findIndex((c) => c.id === button.dataset.up);
      const [row] = book.contacts.splice(index, 1);
      book.contacts.unshift(row);
      persist();
      ui.paint();
    });
  });
}

function routeView(root) {
  const options = PLACES.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  root.innerHTML = `
    <section class="card">
      <div class="grid-2">
        <label>From <select id="from">${options}</select></label>
        <label>To <select id="to">${options}</select></label>
      </div>
      <button type="button" id="go">Compare routes</button>
      <canvas class="block" id="map" width="460" height="360"></canvas>
      <div id="compare"></div>
    </section>`;
  const to = root.querySelector("#to");
  to.value = "hospital";
  root.querySelector("#go").addEventListener("click", () => {
    const start = root.querySelector("#from").value;
    const end = to.value;
    const host = root.querySelector("#compare");
    if (start === end) {
      host.innerHTML = "<p>Pick two different places.</p>";
      draw(root.querySelector("#map"), []);
      return;
    }
    const shortest = route(start, end, false);
    const safer = route(start, end, true);
    draw(root.querySelector("#map"), [
      { route: shortest, dash: false },
      { route: safer, dash: true }
    ]);
    const line = (label, found) => found
      ? `<tr><td>${label}</td><td>${found.path.map((id) => esc(place(id).name)).join(" → ")}</td><td>${found.miles.toFixed(2)}</td><td>${found.danger}</td></tr>`
      : `<tr><td>${label}</td><td colspan="3">No path</td></tr>`;
    host.innerHTML = `
      <table>
        <thead><tr><th>Route</th><th>Stops</th><th>Relative length</th><th>Sample weight</th></tr></thead>
        <tbody>${line("Shortest", shortest)}${line("Lower weight", safer)}</tbody>
      </table>
      <p class="note">Solid line is shortest. Dashed line prefers edges with a lower sample weight. Gray links are the higher-weight edges.</p>
      <button type="button" id="keep">Save trip</button>`;
    host.querySelector("#keep").addEventListener("click", () => {
      book.trips.unshift({
        id: String(Date.now()),
        when: new Date().toLocaleString(),
        from: place(start).name,
        to: place(end).name,
        short: shortest ? shortest.miles.toFixed(2) : "—",
        safe: safer ? safer.danger : "—"
      });
      book.trips = book.trips.slice(0, 20);
      persist();
      host.querySelector("#keep").textContent = "Saved";
    });
  });
  draw(root.querySelector("#map"), []);
}

function tripsView(root) {
  root.innerHTML = `
    <section class="card">
      <h2>Saved trips</h2>
      <table>
        <thead><tr><th>When</th><th>From</th><th>To</th><th>Short length</th><th>Safe weight</th></tr></thead>
        <tbody>
          ${book.trips.map((t) => `<tr><td>${esc(t.when)}</td><td>${esc(t.from)}</td><td>${esc(t.to)}</td><td>${esc(t.short)}</td><td>${esc(t.safe)}</td></tr>`).join("") || "<tr><td colspan='5'>No trips yet.</td></tr>"}
        </tbody>
      </table>
    </section>`;
}

const ui = mount([
  { id: "now", label: "Now" },
  { id: "contacts", label: "Contacts" },
  { id: "route", label: "Routes" },
  { id: "trips", label: "Trips" }
], (id, root) => {
  if (id === "now") nowView(root);
  if (id === "contacts") contactsView(root);
  if (id === "route") routeView(root);
  if (id === "trips") tripsView(root);
});
ui.paint();
