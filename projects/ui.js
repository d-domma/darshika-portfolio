(function () {
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function money(n) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);
  }

  function today() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback();
    } catch (err) {
      return fallback();
    }
  }

  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function mount(tabs, onTab) {
    const tabEl = document.getElementById("tabs");
    const app = document.getElementById("app");
    let current = tabs[0].id;

    function paint() {
      tabEl.innerHTML = tabs.map((tab) =>
        `<button type="button" data-tab="${tab.id}" class="${tab.id === current ? "on" : ""}">${esc(tab.label)}</button>`
      ).join("");
      app.innerHTML = "";
      onTab(current, app);
    }

    tabEl.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab]");
      if (!button) return;
      current = button.dataset.tab;
      paint();
    });

    return {
      show(id) {
        current = id;
        paint();
      },
      current() { return current; },
      paint
    };
  }

  window.DD = { esc, money, today, load, save, mount };
})();
