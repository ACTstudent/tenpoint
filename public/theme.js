// Light by default. Visitors can switch to dark with the sun/moon button; the choice is remembered.
// Loaded in <head> so the saved theme applies before the page paints.
(function () {
  var root = document.documentElement;
  var KEY = 'tp-theme';
  function saved() {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function apply(theme) {
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    var imgs = document.querySelectorAll('img[data-src-dark]');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var want = theme === 'dark' ? img.getAttribute('data-src-dark') : img.getAttribute('data-src-light');
      if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    }
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].setAttribute('aria-pressed', String(theme === 'dark'));
      buttons[j].setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }
  var current = saved();
  apply(current);
  document.addEventListener('DOMContentLoaded', function () {
    apply(current);
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
      if (!btn) return;
      current = current === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, current); } catch (err) { /* storage blocked: the switch lasts for this page */ }
      apply(current);
    });
  });
})();
