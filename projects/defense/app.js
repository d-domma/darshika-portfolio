const { esc, load, save } = window.DD;
const KEY = "dd-defense-v3";

const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1z"/>',
  map: '<path d="M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
  plane: '<path d="M3 11.5 21 4l-7.2 16-2.2-6.2z"/>',
  heart: '<path d="M12 19s-7-4.4-7-8.2A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 7 2.8C19 14.6 12 19 12 19z"/>',
  gear: '<path d="M19.4 13.5a7.4 7.4 0 0 0 .1-1.5 7.4 7.4 0 0 0-.1-1.5l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7.3 7.3 0 0 0-2.6-1.5l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7.3 7.3 0 0 0-2.6 1.5l-2.4-1a.5.5 0 0 0-.6.2L2.5 8.3a.5.5 0 0 0 .1.6l2 1.6a7.4 7.4 0 0 0 0 3l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3a.5.5 0 0 0 .6.2l2.4-1a7.3 7.3 0 0 0 2.6 1.5l.4 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.5a7.3 7.3 0 0 0 2.6-1.5l2.4 1a.5.5 0 0 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z"/>',
  phone: '<path d="M7 3.8h3.2l1.2 3-2 1.2a12 12 0 0 0 5.6 5.6l1.2-2 3 1.2V16a2 2 0 0 1-2.2 2A14.2 14.2 0 0 1 5 6a2 2 0 0 1 2-2.2z"/>',
  alert: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4M12 16h.01"/>',
  pin: '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="1.6"/>',
  shield: '<path d="M12 3.5 19 6.5v5.2c0 4.2-2.8 7.2-7 8.8-4.2-1.6-7-4.6-7-8.8V6.5z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4"/>',
  person: '<circle cx="12" cy="8" r="3"/><path d="M6.5 19c1.2-2.6 3-3.8 5.5-3.8S16.3 16.4 17.5 19"/>',
  trash: '<path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12"/>',
  nav: '<path d="M12 2.5 20 20.5 12 16.5 4 20.5z"/>'
};

function svg(name, fill) {
  const solid = fill || name === "gear" || name === "nav";
  const attrs = solid
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" ${attrs} aria-hidden="true">${ICONS[name]}</svg>`;
}

const TABS = [
  { id: "home", label: "Home", icon: "home" },
  { id: "map", label: "Map", icon: "map" },
  { id: "path", label: "SafePath", icon: "plane" },
  { id: "check", label: "Check-In", icon: "heart" },
  { id: "settings", label: "Settings", icon: "gear" }
];

const MARKERS = [
  { kind: "high", x: 22, y: 24 },
  { kind: "amber", x: 46, y: 30 },
  { kind: "low", x: 68, y: 28 },
  { kind: "high", x: 82, y: 48 },
  { kind: "med", x: 30, y: 68 },
  { kind: "amber", x: 58, y: 74 },
  { kind: "med", x: 72, y: 64 }
];

let book = load(KEY, () => ({
  contacts: [
    { id: "mom", name: "Mom", phone: "+1 (555) 123-4567" },
    { id: "friend", name: "Best Friend", phone: "+1 (555) 987-6543" },
    { id: "partner", name: "Partner", phone: "+1 (555) 246-8135" }
  ],
  dark: false
}));
if (!book.contacts) book.contacts = [];

let current = "home";
let filter = "all";
let altRoute = false;
let zoomed = false;
let meeting = "";
let going = "";
let checkin = null;
let ticker = null;
let holdTimer = null;
let adding = false;
let scanText = "";
let scanResult = "";

function persist() { save(KEY, book); }

function sms(phone, body) {
  const number = String(phone).replace(/[^\d+]/g, "");
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  window.location.href = `sms:${number}${ios ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

function alertBody() {
  const extra = [meeting && `Meeting: ${meeting}`, going && `Going to: ${going}`].filter(Boolean).join(". ");
  return `Emergency alert from North. I need you. Please call me.${extra ? " " + extra : ""}`;
}

function paint() {
  document.getElementById("phone").classList.toggle("dark", !!book.dark);
  document.getElementById("tabs").innerHTML = TABS.map((tab) =>
    `<button type="button" data-tab="${tab.id}" class="${tab.id === current ? "on" : ""}">${svg(tab.icon)}<span>${tab.label}</span></button>`
  ).join("");
  const root = document.getElementById("app");
  root.innerHTML = views[current]();
  bind(root);
}

const views = {
  home() {
    const n = book.contacts.length;
    return `
      <p class="hero-title">Protected Every Step</p>
      <p class="hero-sub">Your personal safety companion, always by your side</p>
      <section class="alert-card">
        <h2>${svg("alert")} Emergency Alert</h2>
        <p class="hint">Press and hold to send emergency alerts</p>
        <button type="button" class="hold" id="hold" aria-label="Press and hold to alert contacts">${svg("phone")}</button>
        <p class="meta">${n} contact${n === 1 ? "" : "s"} configured</p>
        <p class="meta"><span>${svg("pin")} Location tracking active</span></p>
      </section>
      <a class="call" href="tel:911">${svg("phone")} Call 911 / Police</a>
      <div class="tiles">
        <button type="button" class="tile" data-go="map"><span class="badge">${svg("map")}</span><b>Safety Map</b><small>View alerts nearby</small></button>
        <button type="button" class="tile" data-go="path"><span class="badge deep">${svg("plane")}</span><b>SafePath</b><small>Safe route guide</small></button>
        <button type="button" class="tile" data-go="check"><span class="badge">${svg("heart")}</span><b>Check-In</b><small>Safety timer</small></button>
        <button type="button" class="tile" data-go="scan"><span class="badge deep">${svg("shield")}</span><b>Scam Scan</b><small>AI detector</small></button>
      </div>`;
  },
  map() {
    const shown = MARKERS.filter((m) => filter === "all" || (filter === "offenders" ? m.kind !== "amber" : m.kind === "amber"));
    return `
      <section class="map-head">
        <h2>Predator Map</h2>
        <p>View registered sex offenders and active amber alerts in your vicinity</p>
      </section>
      <div class="filters">
        <button type="button" data-filter="all" class="${filter === "all" ? "on" : ""}">Show All</button>
        <button type="button" data-filter="offenders" class="${filter === "offenders" ? "on" : ""}">Offenders Only</button>
        <button type="button" data-filter="amber" class="${filter === "amber" ? "on" : ""}">Amber Alerts</button>
      </div>
      <div class="board">
        ${shown.map((m) => `<i class="pin ${m.kind}" style="left:${m.x}%;top:${m.y}%"></i>`).join("")}
        <div class="you" style="left:48%;top:46%">${svg("nav", true)}</div>
      </div>
      <section class="panel legend">
        <h3>Legend</h3>
        <ul>
          <li><i class="swatch you"></i> Your Location</li>
          <li><i class="swatch high"></i> High Risk Offender</li>
          <li><i class="swatch med"></i> Medium Risk Offender</li>
          <li><i class="swatch low"></i> Low Risk Offender</li>
          <li><i class="swatch amber"></i> Amber Alert</li>
        </ul>
      </section>`;
  },
  path() {
    const safe = altRoute ? "78% Safe" : "92% Safe";
    const miles = altRoute ? "1.6 miles" : "1.2 miles";
    const mins = altRoute ? "19 min" : "15 min";
    const walked = altRoute ? "0.2 miles traveled" : "0.4 miles traveled";
    const line = altRoute
      ? "M40 150 C70 150 80 120 110 118 C150 114 170 90 210 70"
      : "M48 150 L90 118 L150 132 L188 78";
    return `
      <section class="panel soft">
        <h2>${svg("plane")} SafePath Route Monitor</h2>
        <p>AI-guided safe navigation with real-time alerts</p>
      </section>
      <div class="board tall ${zoomed ? "zoomed" : ""}">
        <svg class="route-svg" viewBox="0 0 320 180">
          <path d="${line}" fill="none" stroke="#e7b4c6" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>
          <circle cx="48" cy="150" r="7" fill="#3b82f6"/>
          <circle cx="110" cy="120" r="8" fill="none" stroke="#e7b4c6" stroke-width="3"/>
          <circle cx="168" cy="132" r="8" fill="none" stroke="#e7b4c6" stroke-width="3"/>
          <circle cx="214" cy="64" r="8" fill="none" stroke="#22c55e" stroke-width="4"/>
          <circle cx="214" cy="64" r="3" fill="#22c55e"/>
        </svg>
        <div class="zoom"><button type="button" id="zin">+</button><button type="button" id="zout">−</button></div>
        <div class="float-legend">
          <div><i class="dot blue"></i> Your Location</div>
          <div><i class="dot pink"></i> Waypoints</div>
          <div><i class="dot green"></i> Destination</div>
        </div>
      </div>
      <section class="panel route-card">
        <div class="top"><h2>${svg("pin")} Current Route</h2><span class="safe-pill">↗ ${safe}</span></div>
        <div class="stat"><span>Destination</span><b>Home</b></div>
        <div class="stat"><span>Distance</span><b>${miles}</b></div>
        <div class="stat"><span>Est. Time</span><b>${svg("clock")} ${mins}</b></div>
        <div class="track ${altRoute ? "alt" : ""}"><span></span></div>
        <p class="traveled">${walked}</p>
      </section>
      <h2 class="section-label">Route Safety Alerts</h2>
      <div class="banner ok">${svg("shield")} Well-lit path ahead</div>
      <div class="banner warn">${svg("alert")} ${altRoute ? "Detour adds 0.4 miles" : "Low traffic area in 0.3 miles"}</div>
      <div class="actions">
        <button type="button" class="fill" id="share">Share Location</button>
        <button type="button" class="line" id="alt">Alternative Route</button>
      </div>
      <section class="panel feature">
        <h2>SafePath Features</h2>
        <ul>
          <li>Routes optimized for lighting and crime rates</li>
          <li>Auto-SOS if you deviate from route significantly</li>
          <li>Live location sharing with trusted contacts</li>
        </ul>
      </section>
      <p class="note" id="path-note"></p>`;
  },
  check() {
    const running = !!checkin;
    const status = running ? "Check-in running" : "No Active Check-In";
    const sub = running ? "Contacts are ready if you miss it" : "Start a timer before going out";
    return `
      <section class="panel soft"><h2>${svg("heart")} Check-In Mode</h2><p>Set a safety timer for outings and meetups</p></section>
      <section class="panel center">
        <div class="clock">${svg("clock")}</div>
        <h2 id="check-title">${status}</h2>
        <p id="check-sub">${sub}</p>
        <button type="button" class="wide ${running ? "stop" : ""}" id="start">${running ? "Cancel Check-In" : "Start 60-Minute Check-In"}</button>
      </section>
      <section class="panel">
        <h2>Before You Go...</h2>
        <label class="field">${svg("person")}<span><b>Who are you meeting?</b><input id="meet" placeholder="Add name or description" value="${esc(meeting)}"></span></label>
        <label class="field">${svg("pin")}<span><b>Where are you going?</b><input id="going" placeholder="Share location details" value="${esc(going)}"></span></label>
      </section>
      <section class="panel">
        <h2>${svg("phone")} Notified Contacts</h2>
        ${book.contacts.map((c) => `<div class="contact"><span class="who">${esc(c.name)}</span><span class="pill">Will be alerted</span></div>`).join("") || "<p class=\"note\">Add a contact in Settings.</p>"}
      </section>
      <section class="panel feature">
        <h2>How Check-In Works</h2>
        <ul>
          <li>Set a timer before meeting someone or going out</li>
          <li>If not confirmed, contacts receive your location + details</li>
          <li>Cancel anytime if everything is safe</li>
        </ul>
      </section>`;
  },
  settings() {
    return `
      <section class="panel soft"><h2>Settings</h2><p>Manage your emergency contacts and preferences</p></section>
      <section class="panel toggle-row">
        <span class="badge">${svg("sun")}</span>
        <span><b>Dark Mode</b><small class="note">${book.dark ? "Dark theme active" : "Light theme active"}</small></span>
        <button type="button" class="switch ${book.dark ? "on" : ""}" id="dark" aria-label="Dark mode"><i></i></button>
      </section>
      <div class="section-label"><span>Emergency Contacts</span><button type="button" class="add" id="add-toggle">+ Add Contact</button></div>
      ${adding ? `<form class="add-form" id="add-form"><input name="name" placeholder="Name" required><input name="phone" placeholder="Phone" required><button type="submit" class="wide">Save contact</button></form>` : ""}
      ${book.contacts.map((c) => `
        <article class="contact">
          <span class="who"><span class="avatar">${svg("person")}</span><span>${esc(c.name)}<small class="note">${esc(c.phone)}</small></span></span>
          <button type="button" class="trash" data-del="${c.id}" aria-label="Remove ${esc(c.name)}">${svg("trash")}</button>
        </article>`).join("")}
      <section class="panel about">
        <h2>About North Star</h2>
        <p>North Star guides you safely with real-time alerts, location awareness, and AI-powered scam detection.</p>
        <p class="version">Version 1.0.0</p>
      </section>`;
  },
  scan() {
    return `
      <section class="panel soft"><h2>${svg("shield")} Scam Scan</h2><p>Paste a message. This checks common scam patterns. It is not a guarantee.</p></section>
      <section class="panel scan">
        <textarea id="scan" placeholder="Paste the text you were sent">${esc(scanText)}</textarea>
        <button type="button" class="wide" id="run-scan">Scan message</button>
        <p class="note" id="scan-out">${esc(scanResult)}</p>
      </section>`;
  }
};

function bind(root) {
  root.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => { current = button.dataset.go; paint(); });
  });
  const hold = root.querySelector("#hold");
  if (hold) {
    const start = (event) => {
      event.preventDefault();
      hold.classList.add("holding");
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        hold.classList.remove("holding");
        const first = book.contacts[0];
        if (!first) { current = "settings"; paint(); return; }
        sms(first.phone, alertBody());
      }, 700);
    };
    const stop = () => { hold.classList.remove("holding"); clearTimeout(holdTimer); };
    hold.addEventListener("pointerdown", start);
    hold.addEventListener("pointerup", stop);
    hold.addEventListener("pointerleave", stop);
    hold.addEventListener("pointercancel", stop);
  }
  root.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => { filter = button.dataset.filter; paint(); });
  });
  const share = root.querySelector("#share");
  if (share) {
    share.addEventListener("click", () => {
      const note = root.querySelector("#path-note");
      const first = book.contacts[0];
      if (!first) { note.textContent = "Add a contact in Settings first."; return; }
      if (!navigator.geolocation) { sms(first.phone, "I am sharing my location from SafePath."); return; }
      note.textContent = "Getting your location…";
      navigator.geolocation.getCurrentPosition((pos) => {
        sms(first.phone, `SafePath location: https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`);
      }, () => { note.textContent = "Location permission is needed to share."; });
    });
  }
  const alt = root.querySelector("#alt");
  if (alt) alt.addEventListener("click", () => { altRoute = !altRoute; paint(); });
  const zin = root.querySelector("#zin");
  const zout = root.querySelector("#zout");
  if (zin) zin.addEventListener("click", () => { zoomed = true; paint(); });
  if (zout) zout.addEventListener("click", () => { zoomed = false; paint(); });
  const start = root.querySelector("#start");
  if (start) {
    start.addEventListener("click", () => {
      if (checkin) { checkin = null; clearInterval(ticker); paint(); return; }
      meeting = root.querySelector("#meet").value.slice(0, 80);
      going = root.querySelector("#going").value.slice(0, 80);
      checkin = Date.now() + 60 * 60000;
      clearInterval(ticker);
      ticker = setInterval(tick, 500);
      paint();
      tick();
    });
    root.querySelector("#meet").addEventListener("input", (event) => { meeting = event.target.value; });
    root.querySelector("#going").addEventListener("input", (event) => { going = event.target.value; });
  }
  const dark = root.querySelector("#dark");
  if (dark) dark.addEventListener("click", () => { book.dark = !book.dark; persist(); paint(); });
  const addToggle = root.querySelector("#add-toggle");
  if (addToggle) addToggle.addEventListener("click", () => { adding = !adding; paint(); });
  const addForm = root.querySelector("#add-form");
  if (addForm) {
    addForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(addForm);
      book.contacts.push({
        id: String(Date.now()),
        name: String(form.get("name")).slice(0, 40),
        phone: String(form.get("phone")).slice(0, 24)
      });
      adding = false;
      persist();
      paint();
    });
  }
  root.querySelectorAll("[data-del]").forEach((button) => {
    button.addEventListener("click", () => {
      book.contacts = book.contacts.filter((c) => c.id !== button.dataset.del);
      persist();
      paint();
    });
  });
  const run = root.querySelector("#run-scan");
  if (run) {
    run.addEventListener("click", () => {
      scanText = root.querySelector("#scan").value;
      const text = scanText.toLowerCase();
      const hits = ["gift card", "wire", "crypto", "password", "social security", "urgent", "you won", "remote access", "verify your account"]
        .filter((phrase) => text.includes(phrase));
      scanResult = !scanText.trim()
        ? "Paste a message first."
        : hits.length
          ? `This looks risky (${hits.join(", ")}). Do not send money or codes. Ask a trusted contact first.`
          : "No common scam phrases found. Still double-check before you reply or pay.";
      paint();
    });
  }
}

function tick() {
  const title = document.getElementById("check-title");
  const sub = document.getElementById("check-sub");
  if (!title || current !== "check") return;
  if (!checkin) { title.textContent = "No Active Check-In"; return; }
  const left = checkin - Date.now();
  if (left <= 0) {
    checkin = null;
    clearInterval(ticker);
    title.textContent = "Check-in missed";
    sub.textContent = "Nothing was sent. Hold the alert on Home to text your first contact.";
    return;
  }
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  title.textContent = `${m}:${String(s).padStart(2, "0")} left`;
  sub.textContent = "Cancel if you are safe. Nothing sends by itself.";
}

document.getElementById("tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;
  current = button.dataset.tab;
  paint();
});

paint();
