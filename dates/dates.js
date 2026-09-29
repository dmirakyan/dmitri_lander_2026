(() => {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('[data-day]')];
  const count = document.getElementById('count');

  function filter(day) {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === day)));
    let visible = 0;
    cards.forEach(card => {
      card.hidden = day !== 'all' && card.dataset.day !== day && card.dataset.day !== 'any';
      if (!card.hidden) visible++;
    });
    count.textContent = `${visible} ideas, including a night in`;
  }

  buttons.forEach(button => button.addEventListener('click', () => filter(button.dataset.filter)));

  // Anchor links still reach a plan when another day's filter is active.
  function revealAnchor() {
    const target = document.getElementById(location.hash.slice(1));
    if (target?.matches('[data-day]') && target.hidden) {
      filter('all');
      target.scrollIntoView();
    }
  }
  window.addEventListener('hashchange', revealAnchor);
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', () => {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (target?.hidden) filter('all');
    });
  });
  revealAnchor();
})();
