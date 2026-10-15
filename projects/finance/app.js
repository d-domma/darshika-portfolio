const { esc, money, today, load, save, mount } = window.DD;
const KEY = "dd-finance-v2";

const CATEGORIES = ["pay", "rent", "food", "transport", "school", "health", "other"];

function walk(seed, start, n) {
  let a = seed;
  const out = [start];
  for (let i = 1; i < n; i++) {
    a = (a * 1664525 + 1013904223) >>> 0;
    const unit = a / 4294967296;
    out.push(Math.round((out[i - 1] + (unit - 0.48) * start * 0.015) * 100) / 100);
  }
  return out;
}

const STOCKS = [
  { symbol: "AAPL", name: "Apple", prices: walk(11, 220, 24) },
  { symbol: "MSFT", name: "Microsoft", prices: walk(29, 410, 24) },
  { symbol: "NVDA", name: "Nvidia", prices: walk(47, 125, 24) },
  { symbol: "SPY", name: "S&P 500 ETF", prices: walk(73, 560, 24) }
];

function fresh() {
  return {
    accounts: [
      { id: "chk", name: "Checking" },
      { id: "sav", name: "Savings" }
    ],
    tx: [],
    budgets: { food: 400, transport: 150, school: 100, rent: 0, health: 80, other: 120, pay: 0 }
  };
}

let data = load(KEY, fresh);
let filters = { q: "", account: "all", month: today().slice(0, 7) };
const chat = [];

function persist() { save(KEY, data); }

function accountName(id) {
  return (data.accounts.find((a) => a.id === id) || {}).name || "Account";
}

function signed(tx, accountId) {
  if (tx.kind === "income" && tx.accountId === accountId) return tx.amount;
  if (tx.kind === "expense" && tx.accountId === accountId) return -tx.amount;
  if (tx.kind === "transfer" && tx.from === accountId) return -tx.amount;
  if (tx.kind === "transfer" && tx.to === accountId) return tx.amount;
  return 0;
}

function balance(accountId) {
  return data.tx.reduce((sum, tx) => sum + signed(tx, accountId), 0);
}

function netWorth() {
  return data.accounts.reduce((sum, account) => sum + balance(account.id), 0);
}

function monthKey(date) { return String(date).slice(0, 7); }

function inMonth(tx, key) { return monthKey(tx.date) === key; }

function project(prices) {
  const slice = prices.slice(-8);
  const n = slice.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  slice.forEach((y, i) => { sx += i; sy += y; sxx += i * i; sxy += i * y; });
  const denom = n * sxx - sx * sx || 1;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const sma = (k) => {
    const part = prices.slice(-k);
    return part.reduce((a, b) => a + b, 0) / part.length;
  };
  return { slope, next: intercept + slope * n, sma5: sma(5), sma12: sma(12), last: prices[prices.length - 1] };
}

function barChart(canvas, rows) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expense]));
  const gap = 16;
  const group = (w - 40) / rows.length;
  rows.forEach((row, i) => {
    const x = 30 + i * group;
    const ih = (row.income / max) * (h - 36);
    const eh = (row.expense / max) * (h - 36);
    ctx.fillStyle = "#157a4b";
    ctx.fillRect(x, h - 20 - ih, group * 0.28, ih);
    ctx.fillStyle = "#c2412a";
    ctx.fillRect(x + group * 0.32, h - 20 - eh, group * 0.28, eh);
    ctx.fillStyle = "#444";
    ctx.font = "12px Segoe UI, sans-serif";
    ctx.fillText(row.label, x, h - 6);
  });
}

function lastMonths(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const income = data.tx.filter((t) => t.kind === "income" && monthKey(t.date) === key).reduce((s, t) => s + t.amount, 0);
    const expense = data.tx.filter((t) => t.kind === "expense" && monthKey(t.date) === key).reduce((s, t) => s + t.amount, 0);
    out.push({ key, label: key.slice(5), income, expense });
  }
  return out;
}

function spendByCategory(month) {
  const map = {};
  data.tx.filter((t) => t.kind === "expense" && inMonth(t, month)).forEach((t) => {
    map[t.category] = (map[t.category] || 0) + t.amount;
  });
  return map;
}

function replyTo(text) {
  const q = text.toLowerCase();
  const month = filters.month;
  const spent = spendByCategory(month);
  if (q.includes("help")) return "Ask about balance, a named account, top spending, budgets, a stock symbol, or 'what if I spend 40'.";
  if (q.includes("what if")) {
    const num = Number((q.match(/(\d+(\.\d+)?)/) || [])[1]);
    if (!num) return "Include an amount, like: what if I spend 40.";
    return `An extra expense of ${money(num)} would put net worth at ${money(netWorth() - num)}.`;
  }
  const stock = STOCKS.find((s) => q.includes(s.symbol.toLowerCase()));
  if (stock || q.includes("stock")) {
    const pick = stock || STOCKS[0];
    const fit = project(pick.prices);
    return `${pick.symbol} last sample ${money(fit.last)}. One step on the fitted line: ${money(fit.next)}. Sample series only, not advice.`;
  }
  const named = data.accounts.find((a) => q.includes(a.name.toLowerCase()));
  if (named) return `${named.name} is ${money(balance(named.id))}.`;
  if (q.includes("balance") || q.includes("worth")) return `Net worth is ${money(netWorth())}. ` + data.accounts.map((a) => `${a.name} ${money(balance(a.id))}`).join(". ") + ".";
  if (q.includes("top") || q.includes("most") || q.includes("spend")) {
    const top = Object.entries(spent).sort((a, b) => b[1] - a[1])[0];
    if (!top) return `No expenses in ${month}.`;
    return `Largest expense category in ${month} is ${top[0]} at ${money(top[1])}.`;
  }
  if (q.includes("budget")) {
    const lines = Object.entries(spent).map(([cat, amt]) => {
      const limit = Number(data.budgets[cat] || 0);
      if (!limit) return `${cat} ${money(amt)} (no limit)`;
      return `${cat} ${money(amt)} of ${money(limit)}${amt > limit ? " over" : ""}`;
    });
    return lines.length ? lines.join(". ") + "." : `No expenses in ${month} to compare with budgets.`;
  }
  return "I can use your ledger. Try balance, top spending, budgets, AAPL, or what if I spend 25.";
}

function overview(root) {
  const months = lastMonths(6);
  const month = filters.month;
  const income = data.tx.filter((t) => t.kind === "income" && inMonth(t, month)).reduce((s, t) => s + t.amount, 0);
  const expense = data.tx.filter((t) => t.kind === "expense" && inMonth(t, month)).reduce((s, t) => s + t.amount, 0);
  const spent = spendByCategory(month);
  root.innerHTML = `
    <div class="stats">
      <div class="stat"><span>Net worth</span><b>${money(netWorth())}</b></div>
      <div class="stat"><span>${esc(month)} income</span><b>${money(income)}</b></div>
      <div class="stat"><span>${esc(month)} expenses</span><b>${money(expense)}</b></div>
      <div class="stat"><span>Left this month</span><b>${money(income - expense)}</b></div>
    </div>
    <section class="card">
      <h2>Six months</h2>
      <p class="note">Green is income. Red is expenses. Transfers are not in the bars.</p>
      <canvas class="block" id="chart" width="720" height="200"></canvas>
    </section>
    <section class="card">
      <h2>Accounts</h2>
      <table><tbody>
        ${data.accounts.map((a) => `<tr><td>${esc(a.name)}</td><td>${money(balance(a.id))}</td></tr>`).join("")}
      </tbody></table>
    </section>
    <section class="card">
      <h2>Categories in ${esc(month)}</h2>
      <table><tbody>
        ${Object.keys(spent).length ? Object.entries(spent).map(([c, n]) => `<tr><td>${esc(c)}</td><td>${money(n)}</td></tr>`).join("") : "<tr><td>No expenses yet.</td></tr>"}
      </tbody></table>
    </section>`;
  barChart(root.querySelector("#chart"), months);
}

function ledger(root) {
  const rows = data.tx.filter((tx) => {
    const blob = `${tx.desc} ${tx.category || ""} ${tx.kind}`.toLowerCase();
    if (filters.q && !blob.includes(filters.q.toLowerCase())) return false;
    if (filters.account !== "all") {
      const hit = tx.accountId === filters.account || tx.from === filters.account || tx.to === filters.account;
      if (!hit) return false;
    }
    return true;
  }).slice().reverse();
  root.innerHTML = `
    <form id="tx" class="card">
      <div class="grid-2">
        <label>Kind
          <select name="kind">
            <option value="expense">Expense</option>
            <option value="income">Income</option>
            <option value="transfer">Transfer</option>
          </select>
        </label>
        <label>Amount
          <input name="amount" type="number" min="0.01" step="0.01" required>
        </label>
        <label>Description
          <input name="desc" required>
        </label>
        <label>Date
          <input name="date" type="date" required value="${today()}">
        </label>
        <label>Account
          <select name="account">${data.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select>
        </label>
        <label>To account (transfers)
          <select name="to">${data.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select>
        </label>
        <label>Category
          <select name="category">${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}</select>
        </label>
        <label>Repeats monthly
          <select name="recurring"><option value="no">No</option><option value="yes">Yes</option></select>
        </label>
      </div>
      <button type="submit">Add entry</button>
      <button type="button" class="ghost" id="post-recurring">Post this month's repeating entries</button>
    </form>
    <section class="card">
      <div class="grid-2">
        <label>Search <input id="q" value="${esc(filters.q)}"></label>
        <label>Account
          <select id="acct">
            <option value="all">All</option>
            ${data.accounts.map((a) => `<option value="${a.id}" ${filters.account === a.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="ghost" id="export">Export CSV</button>
        <button type="button" class="ghost" id="add-account">Add account</button>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Entry</th><th>Amount</th><th></th></tr></thead>
        <tbody>
          ${rows.map((tx) => `<tr>
            <td>${esc(tx.date)}</td>
            <td>${esc(tx.desc)} <span class="note">${esc(tx.kind)}${tx.category ? " · " + esc(tx.category) : ""}${tx.recurring ? " · repeats" : ""}</span></td>
            <td>${money(tx.amount)}</td>
            <td><button type="button" class="small" data-del="${tx.id}">Remove</button></td>
          </tr>`).join("") || "<tr><td colspan='4'>No entries match.</td></tr>"}
        </tbody>
      </table>
    </section>`;

  root.querySelector("#tx").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const amount = Number(form.get("amount"));
    const kind = form.get("kind");
    const from = form.get("account");
    const to = form.get("to");
    if (kind === "transfer" && from === to) return;
    data.tx.push({
      id: Date.now(),
      kind,
      amount,
      desc: String(form.get("desc")),
      date: form.get("date"),
      accountId: from,
      from,
      to,
      category: kind === "transfer" ? "" : form.get("category"),
      recurring: form.get("recurring") === "yes"
    });
    persist();
    ui.paint();
  });
  root.querySelector("#q").addEventListener("input", (event) => {
    filters.q = event.target.value;
    const caret = event.target.selectionStart;
    ui.paint();
    const again = document.getElementById("q");
    if (!again) return;
    again.focus();
    again.setSelectionRange(caret, caret);
  });
  root.querySelector("#acct").addEventListener("change", (event) => { filters.account = event.target.value; ui.paint(); });
  root.querySelector("#export").addEventListener("click", exportCsv);
  root.querySelector("#add-account").addEventListener("click", () => {
    const name = prompt("Account name");
    if (!name) return;
    data.accounts.push({ id: "a" + Date.now(), name: name.slice(0, 40) });
    persist();
    ui.paint();
  });
  root.querySelector("#post-recurring").addEventListener("click", () => {
    const month = today().slice(0, 7);
    data.tx.filter((tx) => tx.recurring).forEach((tx) => {
      const already = data.tx.some((other) => other.sourceId === tx.id && monthKey(other.date) === month);
      if (already) return;
      data.tx.push({ ...tx, id: Date.now() + Math.random(), date: today(), recurring: false, sourceId: tx.id });
    });
    persist();
    ui.paint();
  });
  root.querySelectorAll("[data-del]").forEach((button) => {
    button.addEventListener("click", () => {
      data.tx = data.tx.filter((tx) => String(tx.id) !== button.dataset.del);
      persist();
      ui.paint();
    });
  });
}

function exportCsv() {
  const lines = ["date,kind,description,amount,category,account"];
  data.tx.forEach((tx) => {
    lines.push([tx.date, tx.kind, `"${tx.desc.replace(/"/g, '""')}"`, tx.amount, tx.category || "", accountName(tx.accountId || tx.from)].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "ledger.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function budgets(root) {
  const month = filters.month;
  const spent = spendByCategory(month);
  root.innerHTML = `
    <form id="budget" class="card">
      <label>Month <input name="month" type="month" value="${esc(month)}"></label>
      <p class="note">Limits apply to expenses. Pay and transfers are not budgeted.</p>
      ${CATEGORIES.filter((c) => c !== "pay").map((c) => `
        <label>${esc(c)}
          <input name="${c}" type="number" min="0" step="1" value="${Number(data.budgets[c] || 0)}">
        </label>`).join("")}
      <button type="submit">Save limits</button>
    </form>
    <section class="card">
      <h2>${esc(month)}</h2>
      <table>
        <thead><tr><th>Category</th><th>Spent</th><th>Limit</th><th>Left</th></tr></thead>
        <tbody>
          ${CATEGORIES.filter((c) => c !== "pay").map((c) => {
            const used = spent[c] || 0;
            const limit = Number(data.budgets[c] || 0);
            const left = limit - used;
            return `<tr><td>${esc(c)}</td><td>${money(used)}</td><td>${money(limit)}</td><td class="${left < 0 ? "fail" : "pass"}">${money(left)}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </section>`;
  root.querySelector("#budget").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    filters.month = form.get("month");
    CATEGORIES.filter((c) => c !== "pay").forEach((c) => { data.budgets[c] = Number(form.get(c) || 0); });
    persist();
    ui.paint();
  });
}

function stocks(root) {
  root.innerHTML = `
    <section class="card">
      <h2>Sample series</h2>
      <p class="note">Each next value is the least-squares line through the last 8 sample points, extended one step. SMA is a plain average of the last 5 and last 12.</p>
      <table>
        <thead><tr><th>Symbol</th><th>Last</th><th>SMA 5</th><th>SMA 12</th><th>Slope</th><th>One step</th></tr></thead>
        <tbody>
          ${STOCKS.map((stock) => {
            const fit = project(stock.prices);
            return `<tr>
              <td>${stock.symbol}<div class="note">${esc(stock.name)}</div></td>
              <td>${money(fit.last)}</td>
              <td>${money(fit.sma5)}</td>
              <td>${money(fit.sma12)}</td>
              <td>${fit.slope.toFixed(2)}</td>
              <td>${money(fit.next)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <canvas class="block" id="spark" width="720" height="180"></canvas>
    </section>`;
  const canvas = root.querySelector("#spark");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  STOCKS.forEach((stock, index) => {
    const prices = stock.prices;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    ctx.beginPath();
    ctx.strokeStyle = index === 0 ? "#1c1c1c" : "#8a8a8a";
    prices.forEach((price, i) => {
      const x = 20 + (i / (prices.length - 1)) * (canvas.width - 40);
      const y = 20 + (1 - (price - min) / (max - min || 1)) * (canvas.height - 40);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function chatView(root) {
  root.innerHTML = `
    <section class="card">
      <div id="log">${chat.map((line) => `<p><strong>${esc(line.who)}</strong> ${esc(line.text)}</p>`).join("") || "<p class='note'>Ask about balance, budgets, spending, or a symbol.</p>"}</div>
      <form id="chat" class="row">
        <input name="q" required placeholder="balance, budgets, top spending, AAPL, what if I spend 30">
        <button type="submit">Send</button>
      </form>
    </section>`;
  root.querySelector("#chat").addEventListener("submit", (event) => {
    event.preventDefault();
    const q = new FormData(event.target).get("q").toString().trim();
    chat.push({ who: "You", text: q });
    chat.push({ who: "Tracker", text: replyTo(q) });
    ui.paint();
  });
}

const ui = mount([
  { id: "overview", label: "Overview" },
  { id: "ledger", label: "Ledger" },
  { id: "budgets", label: "Budgets" },
  { id: "stocks", label: "Stocks" },
  { id: "chat", label: "Chat" }
], (id, root) => {
  if (id === "overview") overview(root);
  if (id === "ledger") ledger(root);
  if (id === "budgets") budgets(root);
  if (id === "stocks") stocks(root);
  if (id === "chat") chatView(root);
});
ui.paint();
