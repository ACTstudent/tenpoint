// Runs before first paint on the landing page so animated content starts hidden instead of flashing.
(function () {
  var root = document.documentElement;
  if (!window.matchMedia || !matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  root.classList.add('js-motion');
  // If the main script never runs, show everything rather than leave it hidden.
  setTimeout(function () { if (!window.__tenpoint) root.classList.remove('js-motion'); }, 4000);
})();
