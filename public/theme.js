// Applied before first paint so the page never flashes the wrong theme. Kept out of
// index.html so hosts can forbid inline scripts with a Content-Security-Policy.
try {
  const saved = localStorage.getItem("threatmap-theme");
  if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
} catch {}
