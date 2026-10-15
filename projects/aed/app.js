const { esc, mount } = window.DD;

const machine = {
  state: "off",
  battery: 88,
  pads: false,
  contact: null,
  poor: false,
  log: [],
  busy: false
};

function stamp() {
  return new Date().toLocaleTimeString();
}

function log(message) {
  machine.log.unshift({ time: stamp(), state: machine.state, message });
  machine.log = machine.log.slice(0, 40);
}

function setState(next, message) {
  machine.state = next;
  log(message);
  ui.paint();
}

const ALLOWED = {
  off: ["Power on"],
  "self-test": ["Wait"],
  ready: ["Connect pads", "Power off"],
  "contact-check": ["Wait"],
  retry: ["Connect pads", "Power off"],
  armed: ["Analyze", "Power off"],
  analyzing: ["Wait"],
  complete: ["Power off", "New session"],
  fault: ["Power off"]
};

function consoleView(root) {
  const buttons = {
    "Power on": machine.state === "off" || machine.state === "fault",
    "Power off": machine.state !== "off",
    "Connect pads": machine.state === "ready" || machine.state === "retry",
    "Analyze": machine.state === "armed" && !machine.busy,
    "New session": machine.state === "complete"
  };
  root.innerHTML = `
    <div class="stats">
      <div class="stat"><span>State</span><b>${esc(machine.state)}</b></div>
      <div class="stat"><span>Battery</span><b>${machine.battery}%</b></div>
      <div class="stat"><span>Pads</span><b>${machine.pads ? "Marked connected" : "Open"}</b></div>
      <div class="stat"><span>Contact</span><b>${machine.contact || "—"}</b></div>
    </div>
    <section class="card">
      <label>Poor pad contact for the next check
        <select id="poor">
          <option value="no" ${machine.poor ? "" : "selected"}>No</option>
          <option value="yes" ${machine.poor ? "selected" : ""}>Yes</option>
        </select>
      </label>
      <div class="actions">
        ${Object.entries(buttons).map(([label, on]) => `<button type="button" data-cmd="${esc(label)}" ${on ? "" : "disabled"}>${esc(label)}</button>`).join("")}
      </div>
      <p class="note">Allowed from this state: ${ALLOWED[machine.state].join(", ")}.</p>
    </section>
    <section class="card">
      <h2>Latest</h2>
      <p>${machine.log[0] ? esc(machine.log[0].message) : "Power is off."}</p>
    </section>`;
  root.querySelector("#poor").addEventListener("change", (event) => {
    machine.poor = event.target.value === "yes";
  });
  root.querySelectorAll("[data-cmd]").forEach((button) => {
    button.addEventListener("click", () => run(button.dataset.cmd));
  });
}

function run(cmd) {
  if (machine.busy && cmd !== "Power off") return;
  if (cmd === "Power on") {
    machine.pads = false;
    machine.contact = null;
    if (machine.battery < 20) {
      setState("fault", "Self-test stopped. Battery is below 20% in this demo.");
      return;
    }
    machine.busy = true;
    machine.state = "self-test";
    log("Self-test started.");
    ui.paint();
    const steps = ["Battery pack", "Clock", "Speaker", "Pad port"];
    let i = 0;
    const timer = setInterval(() => {
      log(`${steps[i]} check passed.`);
      i += 1;
      if (i < steps.length) return;
      clearInterval(timer);
      machine.timer = null;
      machine.busy = false;
      machine.battery = Math.max(20, machine.battery - 1);
      setState("ready", "Self-test passed. Ready for pads.");
    }, 450);
    machine.timer = timer;
    return;
  }
  if (cmd === "Power off") {
    if (machine.timer) clearInterval(machine.timer);
    if (machine.wait) clearTimeout(machine.wait);
    machine.timer = null;
    machine.wait = null;
    machine.busy = false;
    machine.pads = false;
    machine.contact = null;
    setState("off", "Powered off.");
    return;
  }
  if (cmd === "Connect pads") {
    machine.pads = true;
    machine.busy = true;
    setState("contact-check", "Checking pad contact in the demo.");
    machine.wait = setTimeout(() => {
      machine.busy = false;
      if (machine.poor) {
        machine.contact = "Poor";
        setState("retry", "Contact check failed in the demo. Pads stay off the armed state.");
      } else {
        machine.contact = "OK";
        setState("armed", "Contact check passed. Analyze is available.");
      }
    }, 700);
    return;
  }
  if (cmd === "Analyze") {
    machine.busy = true;
    setState("analyzing", "Analyze step running. No rhythm is being read.");
    machine.wait = setTimeout(() => {
      machine.busy = false;
      machine.battery = Math.max(15, machine.battery - 2);
      setState("complete", "Demo complete. No rhythm was read and no shock was sent.");
    }, 900);
    return;
  }
  if (cmd === "New session") {
    machine.pads = false;
    machine.contact = null;
    setState("ready", "Session cleared. Still powered on.");
  }
}

function logView(root) {
  root.innerHTML = `
    <section class="card">
      <h2>Event log</h2>
      <button type="button" id="download">Download log</button>
      <table>
        <thead><tr><th>Time</th><th>State</th><th>Event</th></tr></thead>
        <tbody>
          ${machine.log.map((row) => `<tr><td>${esc(row.time)}</td><td>${esc(row.state)}</td><td>${esc(row.message)}</td></tr>`).join("") || "<tr><td colspan='3'>No events yet.</td></tr>"}
        </tbody>
      </table>
    </section>`;
  root.querySelector("#download").addEventListener("click", () => {
    const text = machine.log.map((row) => `${row.time}\t${row.state}\t${row.message}`).join("\n");
    const blob = new Blob([text || "empty"], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "aed-log.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

function flowView(root) {
  root.innerHTML = `
    <section class="card">
      <h2>States</h2>
      <pre>off
  power on → self-test
    battery under 20% → fault
    four checks pass → ready
ready
  connect pads → contact-check
    poor contact → retry → connect pads again
    contact ok → armed
armed
  analyze → analyzing → complete
complete
  new session → ready
any powered state
  power off → off</pre>
      <p class="note">The analyze step ends the demo. There is no therapy control on this page.</p>
    </section>`;
}

const ui = mount([
  { id: "console", label: "Console" },
  { id: "log", label: "Log" },
  { id: "flow", label: "Flow" }
], (id, root) => {
  if (id === "console") consoleView(root);
  if (id === "log") logView(root);
  if (id === "flow") flowView(root);
});
ui.paint();
