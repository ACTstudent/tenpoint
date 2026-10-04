import { mapImport, summarize, group } from '/lib/nps.js';

window.__tenpoint = true;
const root = document.documentElement;
const motionOK = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// Entry animation. Without motion, or without JS, everything is simply visible.
if (motionOK) {
  root.classList.add('js-motion');
  const start = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-loaded')));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
  setTimeout(() => root.classList.add('is-loaded'), 1200);
}

// Nav gets a backdrop once the hero starts to scroll away.
// A 1px marker at the very top of the page is watched instead of listening to scroll events.
const nav = $('[data-nav]');
if (nav && 'IntersectionObserver' in window) {
  const marker = document.createElement('div');
  marker.setAttribute('aria-hidden', 'true');
  marker.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:24px;pointer-events:none';
  document.body.prepend(marker);
  new IntersectionObserver(([e]) => nav.classList.toggle('is-scrolled', !e.isIntersecting)).observe(marker);
}

// Scroll reveal, staggered among siblings.
if (motionOK && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in');
    io.unobserve(e.target);
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  $$('[data-reveal]').forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.hasAttribute('data-reveal'));
    const i = sibs.indexOf(el);
    if (i > 0) el.style.setProperty('--d', `${Math.min(i, 5) * 90}ms`);
    io.observe(el);
  });
} else {
  $$('[data-reveal]').forEach((el) => el.classList.add('is-in'));
}

/* Hero demo: a working survey card and a stream of sample answers. */

const SAMPLES = [
  [10, 'Barista remembered my order on day three.'],
  [6, 'Love the beans, but the line at 8am is brutal.'],
  [9, 'Mobile order was ready when I walked in.'],
  [8, 'Good coffee. The wifi drops a lot.'],
  [3, 'Got charged twice for one latte.'],
  [10, 'Best cortado in the neighbourhood.'],
  [7, 'Pastries sell out before noon.'],
  [9, 'Staff are quick and friendly, even at rush hour.'],
  [4, 'Oat milk ran out twice this week.'],
  [10, ''],
  [9, 'Quiet enough to work in the afternoons.'],
  [5, 'Prices went up again.'],
];

const demo = $('[data-demo]');
if (demo) {
  const form = $('[data-demo-form]', demo);
  const follow = $('[data-demo-follow]', demo);
  const why = $('#demo-why', demo);
  const npsEl = $('[data-demo-nps]', demo);
  const countEl = $('[data-demo-count]', demo);
  const feed = $('[data-feed]', demo);
  const toggle = $('[data-feed-toggle]', demo);
  const status = $('[data-demo-status]', demo);
  const counts = { promoter: 34, passive: 18, detractor: 12 };
  let next = 3;
  let userPaused = false;
  let visible = true;
  let timer = 0;

  const signed = (n) => (n > 0 ? `+${n}` : String(n));
  const render = (bump) => {
    const total = counts.promoter + counts.passive + counts.detractor;
    const nps = Math.round(((counts.promoter - counts.detractor) / total) * 100);
    npsEl.textContent = signed(nps);
    npsEl.style.color = nps >= 30 ? 'var(--pro)' : nps >= 0 ? 'var(--ink)' : 'var(--det)';
    countEl.textContent = `from ${total} sample answers`;
    if (bump && motionOK) {
      npsEl.classList.remove('is-bump');
      void npsEl.offsetWidth;
      npsEl.classList.add('is-bump');
    }
  };

  const item = (score, text, when, you) => {
    const li = document.createElement('li');
    li.className = `feed-item${you ? ' is-you' : ''}`;
    const chip = document.createElement('span');
    chip.className = `score-chip g-${group(score)}`;
    chip.textContent = score;
    const body = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = text || 'No comment';
    if (!text) p.className = 'muted';
    const small = document.createElement('small');
    small.textContent = you ? `You, ${when}` : when;
    body.append(p, small);
    li.append(chip, body);
    return li;
  };

  const push = (score, text, you = false) => {
    counts[group(score)]++;
    const li = item(score, text, 'just now', you);
    if (motionOK) li.classList.add('is-new');
    feed.prepend(li);
    $$('.feed-item', feed).slice(3).forEach((el) => el.remove());
    $$('.feed-item small', feed).slice(1).forEach((el, i) => {
      const base = el.textContent.startsWith('You') ? 'You, ' : '';
      el.textContent = `${base}${i === 0 ? '1 min ago' : `${i + 1} min ago`}`;
    });
    render(true);
  };

  // Three answers to start with.
  [[2, '3 min ago'], [1, '2 min ago'], [0, '1 min ago']].forEach(([i, when]) => feed.prepend(item(SAMPLES[i][0], SAMPLES[i][1], when)));
  render(false);

  const playing = () => motionOK && !userPaused && visible && !document.hidden && !demo.contains(document.activeElement);
  const tick = () => {
    timer = 0;
    if (playing()) {
      const [s, t] = SAMPLES[next % SAMPLES.length];
      next++;
      push(s, t);
    }
    schedule();
  };
  const schedule = () => {
    if (!timer && motionOK && !userPaused) timer = setTimeout(tick, 3600);
  };

  if (motionOK) {
    schedule();
    toggle.addEventListener('click', () => {
      userPaused = !userPaused;
      toggle.setAttribute('aria-pressed', String(userPaused));
      toggle.textContent = userPaused ? 'Play answers' : 'Pause answers';
      if (!userPaused) schedule();
      else { clearTimeout(timer); timer = 0; }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(demo);
    }
  } else {
    toggle.hidden = true;
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'demo') follow.hidden = false;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const picked = form.querySelector('input[name="demo"]:checked');
    if (!picked) return;
    const score = Number(picked.value);
    push(score, why.value.trim().slice(0, 140), true);
    status.textContent = `Your ${score} was added to the sample answers. The score is now ${npsEl.textContent}.`;
    picked.checked = false;
    why.value = '';
    follow.hidden = true;
  });
}

/* Product tour: tabs, swipeable track, optional autoplay with a visible pause button. */

const tour = $('[data-tour]');
if (tour) {
  const tabs = $$('[role="tab"]', tour);
  const slides = $$('[data-slide]', tour);
  const track = $('[data-tour-track]', tour);
  const pauseBtn = $('[data-tour-pause]', tour);
  let index = 0;
  let stopped = !motionOK;
  let inView = false;

  const setActive = (i) => {
    index = i;
    tabs.forEach((t, n) => {
      const on = n === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    slides.forEach((s, n) => s.setAttribute('aria-hidden', String(n !== i)));
    const tab = tabs[i];
    const box = tab.parentElement;
    if (tab.offsetLeft < box.scrollLeft || tab.offsetLeft + tab.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: tab.offsetLeft - 16, behavior: motionOK ? 'smooth' : 'auto' });
    }
  };

  const goTo = (i) => {
    const n = (i + slides.length) % slides.length;
    setActive(n);
    track.scrollTo({ left: slides[n].offsetLeft - slides[0].offsetLeft, behavior: motionOK ? 'smooth' : 'auto' });
  };

  const updatePlay = () => {
    tour.classList.toggle('is-playing', !stopped && inView);
    pauseBtn.setAttribute('aria-pressed', String(stopped));
    pauseBtn.querySelector('span').textContent = stopped ? 'Play' : 'Pause';
    pauseBtn.querySelector('use').setAttribute('href', pauseBtn.querySelector('use').getAttribute('href').replace(/#i-(pause|play)$/, stopped ? '#i-play' : '#i-pause'));
  };
  const stop = () => { stopped = true; updatePlay(); };

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { stop(); goTo(i); });
    t.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: slides.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      stop();
      goTo(keys[e.key]);
      tabs[index].focus();
    });
  });
  $('[data-tour-prev]', tour).addEventListener('click', () => { stop(); goTo(index - 1); });
  $('[data-tour-next]', tour).addEventListener('click', () => { stop(); goTo(index + 1); });

  // Advance when the active tab's progress bar finishes.
  tour.addEventListener('animationend', (e) => {
    if (e.animationName === 'tour-progress' && !stopped) goTo(index + 1);
  });

  // Hovering or focusing the tour holds the timer; the pause button stops it.
  tour.addEventListener('pointerenter', () => tour.classList.add('is-held'));
  tour.addEventListener('pointerleave', () => tour.classList.remove('is-held'));
  tour.addEventListener('focusin', () => tour.classList.add('is-held'));
  tour.addEventListener('focusout', () => { if (!tour.contains(document.activeElement)) tour.classList.remove('is-held'); });

  if (motionOK) {
    pauseBtn.addEventListener('click', () => { stopped = !stopped; updatePlay(); });
  } else {
    pauseBtn.hidden = true;
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; updatePlay(); }, { threshold: 0.35 }).observe(tour);
    // Swiping the track by hand updates the tabs.
    const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting && e.intersectionRatio > 0.6) {
        const i = slides.indexOf(e.target);
        if (i !== index) { setActive(i); }
      }
    }), { root: track, threshold: [0.6] });
    slides.forEach((s) => seen.observe(s));
  }
  track.addEventListener('pointerdown', () => stop(), { passive: true });
  track.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) stop(); }, { passive: true });

  setActive(0);
  updatePlay();
}

/* CSV checker: reads an export in the browser and shows what an import would bring in. */

const checker = $('[data-checker]');
if (checker) {
  const out = $('[data-check-result]', checker);
  const drop = $('[data-drop]', checker);
  const input = $('[data-check-file]', checker);
  const sprite = checker.querySelector('use').getAttribute('href').split('#')[0];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = (iso) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  const show = (text, name) => {
    out.replaceChildren();
    out.hidden = false;
    const result = mapImport(text);
    if (result.error || !result.rows.length) {
      const p = el('p', 'form-error check-error', result.error || 'No rows had a score from 0 to 10.');
      out.append(p);
      return;
    }
    const dates = result.rows.map((r) => r.created_at).sort();
    const stats = summarize(result.rows.map((r) => r.score));
    const dl = el('dl', 'check-stats');
    const stat = (label, value) => { const d = el('div', 'check-stat'); d.append(el('dt', '', label), el('dd', '', value)); return d; };
    const range = month(dates[0]) === month(dates[dates.length - 1]) ? month(dates[0]) : `${month(dates[0])} to ${month(dates[dates.length - 1])}`;
    dl.append(
      stat('Answers', result.rows.length.toLocaleString('en-US')),
      stat('NPS, all of it', stats.nps > 0 ? `+${stats.nps}` : String(stats.nps)),
      stat('Dates', range),
    );
    const ul = el('ul', 'check-map');
    const rows = [['score', 'Score'], ['comment', 'Comment'], ['email', 'Email'], ['date', 'Date']];
    rows.forEach(([key, label], i) => {
      const li = el('li');
      li.style.setProperty('--i', i);
      const found = result.columns[key];
      const code = el('code', found ? '' : 'is-missing', found ? `"${found}"` : 'Not found');
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      arrow.setAttribute('class', 'icon');
      arrow.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `${sprite}#i-arrow-right`);
      arrow.append(use);
      li.append(code, arrow, el('strong', '', label));
      ul.append(li);
    });
    const note = el('p', 'check-note', `${name ? `${name}: ` : ''}${result.skipped ? `${result.skipped.toLocaleString('en-US')} rows without a score from 0 to 10 would be skipped. ` : ''}Every answer would keep its date.`);
    out.append(dl, ul, note);
  };

  const readFile = (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      out.hidden = false;
      out.replaceChildren(el('p', 'form-error check-error', 'That file is larger than 8 MB. Split it into smaller files first.'));
      return;
    }
    file.text().then((t) => show(t, file.name));
  };

  input.addEventListener('change', () => readFile(input.files[0]));
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });
  $('[data-check-sample]', checker).addEventListener('click', async () => {
    const res = await fetch('/sample.csv');
    show(await res.text(), 'sample-export.csv');
  });
}

/* Brand colour swatches */

const brandDemo = $('[data-brand-demo]');
if (brandDemo) {
  const inkFor = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111413' : '#ffffff';
  };
  const swatches = $$('[data-swatch]');
  swatches.forEach((b) => b.addEventListener('click', () => {
    swatches.forEach((s) => s.setAttribute('aria-pressed', String(s === b)));
    brandDemo.style.setProperty('--brand', b.dataset.swatch);
    brandDemo.style.setProperty('--brand-ink', inkFor(b.dataset.swatch));
  }));
}
