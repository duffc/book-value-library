(() => {
  const root = document.documentElement;
  const toggle = document.getElementById("themeToggle");
  const meta = document.querySelector('meta[name="theme-color"]');
  function applyTheme(theme, persist) {
    const dark = theme === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    if (toggle) {
      toggle.innerHTML = dark
        ? '<span aria-hidden="true">☼</span> Light mode'
        : '<span aria-hidden="true">◐</span> Dark mode';
      toggle.setAttribute("aria-pressed", dark ? "true" : "false");
      toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    }
    if (meta) meta.setAttribute("content", dark ? "#101914" : "#14251d");
    if (persist) {
      try { localStorage.setItem("bvl-theme", dark ? "dark" : "light"); } catch (e) {}
    }
  }
  let initial = "light";
  try { initial = localStorage.getItem("bvl-theme") === "dark" ? "dark" : "light"; } catch (e) {}
  applyTheme(initial, false);
  if (toggle) toggle.addEventListener("click", () => applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
})();