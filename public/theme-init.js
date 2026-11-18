// Apply the saved theme before first paint (no flash). External file to satisfy CSP.
(function () {
  try {
    var t = localStorage.getItem("devspace-theme") || "system";
    var dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.classList.add("dark");
  }
})();
