const { esc, load, save, mount } = window.DD;
const KEY = "dd-lockap-v2";

const BANK = {
  Biology: [
    ["A cell membrane is mainly", ["Protein only", "A phospholipid bilayer", "Cellulose", "Starch"], 1],
    ["Mitosis produces", ["Four gametes", "Two nuclei with the same DNA", "A ribosome", "One haploid cell"], 1],
    ["Enzymes work by", ["Raising activation energy", "Lowering activation energy", "Becoming the product", "Copying DNA"], 1],
    ["Mitochondria are the main site of", ["Photosynthesis", "Aerobic respiration", "Transcription only", "Cellulose building"], 1]
  ],
  Calculus: [
    ["The derivative of x² is", ["x", "2x", "x³", "2"], 1],
    ["A derivative at a point is", ["Area under the curve", "Instantaneous rate of change", "The y-intercept", "A constant always"], 1],
    ["The integral of 2x dx is", ["2", "x² + C", "2x² + C", "x + C"], 1],
    ["If f′ changes from + to −", ["f has a local minimum", "f has a local maximum", "f is linear", "f is undefined"], 1]
  ],
  Chemistry: [
    ["Atomic number counts", ["Neutrons", "Protons", "Bonds", "Shells only"], 1],
    ["NaCl is", ["A covalent gas", "An ionic compound", "A polymer", "An acid"], 1],
    ["pH 3 is", ["Basic", "Neutral", "Acidic", "A solid"], 2],
    ["A catalyst", ["Is used up as a product", "Speeds a reaction", "Changes ΔH into zero", "Removes all reactants"], 1]
  ],
  English: [
    ["A thesis sentence", ["States the main claim", "Lists every source", "Replaces evidence", "Ends the essay"], 0],
    ["A counterclaim is", ["A spelling note", "An opposing point", "The title", "A citation style"], 1],
    ["Evidence in an essay should", ["Stay unrelated", "Support the claim", "Replace the thesis", "Avoid specifics"], 1],
    ["A topic sentence", ["Opens the idea of a paragraph", "Is always a quote", "Is the works cited", "Ends the paper"], 0]
  ],
  "US History": [
    ["The Constitution was drafted in", ["1776", "1787", "1812", "1865"], 1],
    ["Checks and balances limit", ["Any one branch", "Only voters", "Only the courts", "Only the states"], 0],
    ["The 14th Amendment deals with", ["The income tax", "Citizenship and equal protection", "Prohibition", "Presidential term limits"], 1],
    ["Judicial review lets courts", ["Write statutes", "Decide if a law fits the Constitution", "Command the army", "Set tax rates"], 1]
  ],
  "Computer Science": [
    ["A loop is used to", ["Repeat steps", "Store one name only", "End a file", "Draw a printer"], 0],
    ["An array holds", ["One bit always", "An ordered collection", "A comment", "A network cable"], 1],
    ["A function is useful because it", ["Hides a named piece of work", "Deletes variables", "Stops all input", "Replaces tests"], 0],
    ["Binary search needs", ["A random list", "A sorted list", "A picture", "Two printers"], 1]
  ]
};

const SUBJECTS = Object.keys(BANK);

function fresh() {
  const stats = {};
  const notes = {};
  SUBJECTS.forEach((name) => { stats[name] = { seen: 0, correct: 0 }; notes[name] = ""; });
  return { stats, notes, sessions: [], lastQuiz: null };
}

let store = load(KEY, fresh);
SUBJECTS.forEach((name) => {
  store.stats[name] = store.stats[name] || { seen: 0, correct: 0 };
  if (store.notes[name] == null) store.notes[name] = "";
});

let subject = SUBJECTS[0];
let practiceIndex = 0;
let practiceLocked = false;
let quiz = null;
let timer = { left: 25 * 60, total: 25 * 60, running: false, endAt: 0 };
let tickHandle = null;

function persist() { save(KEY, store); }

function record(name, ok) {
  store.stats[name].seen += 1;
  if (ok) store.stats[name].correct += 1;
  persist();
}

function clockText(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function ensureTick() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    if (!timer.running) return;
    timer.left = Math.max(0, Math.round((timer.endAt - Date.now()) / 1000));
    const el = document.getElementById("clock");
    const note = document.getElementById("timer-note");
    if (el) el.textContent = clockText(timer.left);
    if (timer.left <= 0) {
      timer.running = false;
      const minutes = Math.round(timer.total / 60);
      store.sessions.unshift({ at: new Date().toLocaleString(), minutes });
      store.sessions = store.sessions.slice(0, 20);
      persist();
      if (note) note.textContent = `${minutes} minute session saved.`;
    }
  }, 400);
}

function todayView(root) {
  const done = store.sessions.length;
  const seen = SUBJECTS.reduce((sum, name) => sum + store.stats[name].seen, 0);
  const correct = SUBJECTS.reduce((sum, name) => sum + store.stats[name].correct, 0);
  root.innerHTML = `
    <div class="stats">
      <div class="stat"><span>Questions answered</span><b>${seen}</b></div>
      <div class="stat"><span>Correct</span><b>${seen ? Math.round(100 * correct / seen) : 0}%</b></div>
      <div class="stat"><span>Finished sessions</span><b>${done}</b></div>
    </div>
    <section class="card">
      <h2 id="clock">${clockText(timer.left)}</h2>
      <div class="actions">
        <button type="button" id="m25">25 min</button>
        <button type="button" id="m50" class="ghost">50 min</button>
        <button type="button" id="start">Start</button>
        <button type="button" id="pause" class="ghost">Pause</button>
      </div>
      <p class="note" id="timer-note">${timer.running ? "Running." : "Choose a length, then start."}</p>
    </section>
    <section class="card">
      <h2>Recent sessions</h2>
      <ul>${store.sessions.slice(0, 5).map((s) => `<li>${esc(s.at)} · ${s.minutes} min</li>`).join("") || "<li>None yet.</li>"}</ul>
    </section>`;
  root.querySelector("#m25").addEventListener("click", () => setLength(25 * 60));
  root.querySelector("#m50").addEventListener("click", () => setLength(50 * 60));
  root.querySelector("#start").addEventListener("click", () => {
    if (timer.left <= 0) setLength(timer.total);
    timer.running = true;
    timer.endAt = Date.now() + timer.left * 1000;
    root.querySelector("#timer-note").textContent = "Running.";
    ensureTick();
  });
  root.querySelector("#pause").addEventListener("click", () => {
    timer.running = false;
    root.querySelector("#timer-note").textContent = "Paused.";
  });
}

function setLength(seconds) {
  timer.running = false;
  timer.total = seconds;
  timer.left = seconds;
  const el = document.getElementById("clock");
  if (el) el.textContent = clockText(seconds);
}

function choices(host, options, onPick) {
  host.innerHTML = "";
  options.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost";
    button.textContent = choice;
    button.addEventListener("click", () => onPick(index, button));
    host.appendChild(button);
  });
}

function practiceView(root) {
  const pack = BANK[subject];
  const [prompt, options, answer] = pack[practiceIndex % pack.length];
  root.innerHTML = `
    <section class="card">
      <label>Subject
        <select id="subject">${SUBJECTS.map((name) => `<option ${name === subject ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>
      </label>
      <p id="prompt"></p>
      <div id="choices" class="actions"></div>
      <p class="note" id="feedback">Question ${practiceIndex % pack.length + 1} of ${pack.length}.</p>
      <button type="button" class="ghost" id="next">Next</button>
    </section>`;
  root.querySelector("#prompt").textContent = prompt;
  root.querySelector("#subject").addEventListener("change", (event) => {
    subject = event.target.value;
    practiceIndex = 0;
    practiceLocked = false;
    ui.paint();
  });
  choices(root.querySelector("#choices"), options, (index) => {
    if (practiceLocked) return;
    practiceLocked = true;
    const ok = index === answer;
    record(subject, ok);
    root.querySelector("#feedback").textContent = ok ? "Right." : `The answer is: ${options[answer]}`;
  });
  root.querySelector("#next").addEventListener("click", () => {
    practiceIndex += 1;
    practiceLocked = false;
    ui.paint();
  });
}

function quizView(root) {
  if (!quiz) {
    root.innerHTML = `
      <section class="card">
        <label>Subject
          <select id="subject">${SUBJECTS.map((name) => `<option ${name === subject ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>
        </label>
        <p>Four questions. You get the score at the end, then a review of any misses.</p>
        <button type="button" id="begin">Start quiz</button>
        ${store.lastQuiz ? `<p class="note">Last quiz: ${esc(store.lastQuiz.subject)} ${store.lastQuiz.correct}/4.</p>` : ""}
      </section>`;
    root.querySelector("#subject").addEventListener("change", (event) => { subject = event.target.value; });
    root.querySelector("#begin").addEventListener("click", () => {
      subject = root.querySelector("#subject").value;
      quiz = {
        subject,
        order: BANK[subject].map((_, i) => i),
        step: 0,
        picks: [],
        correct: 0
      };
      ui.paint();
    });
    return;
  }
  if (quiz.step >= 4) {
    const missed = quiz.picks.map((pick, i) => ({ pick, i })).filter((row) => row.pick !== BANK[quiz.subject][quiz.order[row.i]][2]);
    root.innerHTML = `
      <section class="card">
        <h2>${quiz.correct} / 4</h2>
        ${missed.length ? `<ul>${missed.map((row) => {
          const item = BANK[quiz.subject][quiz.order[row.i]];
          return `<li>${esc(item[0])} — ${esc(item[1][item[2]])}</li>`;
        }).join("")}</ul>` : "<p>All four were right.</p>"}
        <button type="button" id="again">New quiz</button>
      </section>`;
    root.querySelector("#again").addEventListener("click", () => { quiz = null; ui.paint(); });
    return;
  }
  const item = BANK[quiz.subject][quiz.order[quiz.step]];
  root.innerHTML = `
    <section class="card">
      <p class="note">${esc(quiz.subject)} · ${quiz.step + 1} / 4</p>
      <p id="prompt"></p>
      <div id="choices" class="actions"></div>
    </section>`;
  root.querySelector("#prompt").textContent = item[0];
  choices(root.querySelector("#choices"), item[1], (index) => {
    const ok = index === item[2];
    quiz.picks.push(index);
    if (ok) quiz.correct += 1;
    record(quiz.subject, ok);
    quiz.step += 1;
    if (quiz.step >= 4) {
      store.lastQuiz = { subject: quiz.subject, correct: quiz.correct, at: new Date().toLocaleString() };
      persist();
    }
    ui.paint();
  });
}

function progressView(root) {
  root.innerHTML = `
    <section class="card">
      <table>
        <thead><tr><th>Subject</th><th>Answered</th><th>Correct</th><th>Rate</th></tr></thead>
        <tbody>
          ${SUBJECTS.map((name) => {
            const row = store.stats[name];
            const rate = row.seen ? Math.round(100 * row.correct / row.seen) + "%" : "—";
            return `<tr><td>${esc(name)}</td><td>${row.seen}</td><td>${row.correct}</td><td>${rate}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </section>`;
}

function notesView(root) {
  root.innerHTML = `
    <section class="card">
      <label>Subject
        <select id="subject">${SUBJECTS.map((name) => `<option ${name === subject ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>
      </label>
      <textarea id="notes"></textarea>
      <p class="note">Saved as you type, per subject.</p>
    </section>`;
  const box = root.querySelector("#notes");
  box.value = store.notes[subject] || "";
  root.querySelector("#subject").addEventListener("change", (event) => {
    subject = event.target.value;
    box.value = store.notes[subject] || "";
  });
  box.addEventListener("input", () => {
    store.notes[subject] = box.value;
    persist();
  });
}

const ui = mount([
  { id: "today", label: "Today" },
  { id: "practice", label: "Practice" },
  { id: "quiz", label: "Quiz" },
  { id: "progress", label: "Progress" },
  { id: "notes", label: "Notes" }
], (id, root) => {
  if (id === "today") todayView(root);
  if (id === "practice") practiceView(root);
  if (id === "quiz") quizView(root);
  if (id === "progress") progressView(root);
  if (id === "notes") notesView(root);
});
ensureTick();
ui.paint();
