const buttons = document.querySelectorAll(".filters button");
const cases = document.querySelectorAll(".case");
const empty = document.querySelector(".empty");

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    buttons.forEach((item) => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-pressed", item === button ? "true" : "false");
    });

    let shown = 0;
    cases.forEach((item) => {
      const match = filter === "all" || item.dataset.domain === filter;
      item.hidden = !match;
      if (match) shown += 1;
    });
    empty.hidden = shown !== 0;
  });
});

buttons.forEach((button) => {
  button.setAttribute("aria-pressed", button.classList.contains("is-active") ? "true" : "false");
});

document.querySelectorAll(".contents a").forEach((link) => {
  link.addEventListener("click", () => {
    const all = document.querySelector('[data-filter="all"]');
    if (all && !all.classList.contains("is-active")) all.click();
  });
});
