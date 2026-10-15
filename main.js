const bar = document.getElementById("bar");
const projects = [...document.querySelectorAll(".project")];
const filters = [...document.querySelectorAll(".filters button")];
const live = document.getElementById("live");

if (bar) {
  const onScroll = () => bar.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

filters.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    filters.forEach((item) => {
      const on = item === button;
      item.classList.toggle("on", on);
      item.setAttribute("aria-pressed", on ? "true" : "false");
    });
    let shown = 0;
    projects.forEach((project) => {
      const match = filter === "all" || project.dataset.domain.split(" ").includes(filter);
      project.hidden = !match;
      if (match) shown += 1;
    });
    live.textContent = shown === 1 ? "1 project" : `${shown} projects`;
  });
});
