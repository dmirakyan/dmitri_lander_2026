import { referenceArchive } from './references.js';
import { stories as hingeStories } from './hinge/stories.js';
import { michaelaStories } from './michaela/stories.js';

function frameUrl(lane, story, slide) {
  return lane === 'hinge'
    ? `hinge/renders/${story.id}-${slide}.png`
    : `michaela/${story.assets[slide - 1]}`;
}

function addStories(lane, stories) {
  const picker = document.querySelector('#'+lane+'-choices');
  const container = document.querySelector(`#${lane}-stories`);
  for (const [index, story] of stories.entries()) {
    const article = document.createElement('article');
    article.className = 'story';
    article.hidden = index !== 0;
    const option = document.createElement('option');
    option.textContent = story.status ? story.title + ' · ' + story.status : story.title;
    option.value = String(index);
    picker.append(option);
    article.innerHTML = '<p class="eyebrow"></p><h3></h3><p class="description"></p><div class="previews"></div><div class="links"></div>';
    article.querySelector('.eyebrow').textContent = story.status || `CONCEPT ${String(index + 1).padStart(2, '0')}`;
    article.querySelector('h3').textContent = story.title;
    article.querySelector('.description').textContent = story.description;
    const total = story.frames || story.assets?.length || 2;
    const previewGrid = article.querySelector('.previews');
    if (total===3) previewGrid.className += ' three-frames';
    for (let slide=1;slide<=total;slide++) {
      const beat = total===3 ? ['Quote card','Hinge chat','Inbox reveal'][slide-1] : ['First frame','Reveal'][slide-1];
      const href = frameUrl(lane, story, slide);
      const preview = document.createElement('a');
      preview.href = href;
      const image = document.createElement('img');
      image.src = href;
      image.alt = `${story.title}: slide ${slide} of ${total}, ${beat.toLowerCase()}`;
      image.loading = 'lazy';
      image.decoding = 'async';
      preview.append(image);
      previewGrid.append(preview);
      const link = document.createElement('a');
      link.href = href;
      link.textContent = 'Open ' + beat.toLowerCase() + ' ↗';
      article.querySelector('.links').append(link);
    }
    container.append(article);
  }
  picker.addEventListener('change', () => {
    const selected = Number(picker.value);
    [...container.children].forEach((card, index) => { card.hidden = index !== selected; });
    const paired = stories[selected]?.pairedReference;
    if (paired) {
      const next = referenceArchive[lane].findIndex(post => post.id === paired);
      const referencePicker = document.querySelector('#'+lane+'-references');
      if (next >= 0 && Number(referencePicker.value) !== next) {
        referencePicker.value = String(next);
        referencePicker.dispatchEvent(new Event('change'));
      }
    }
  });
}

addStories('michaela', michaelaStories);
addStories('hinge', hingeStories);


for (const pane of document.querySelectorAll('[data-reference-lane]')) {
  const lane = pane.dataset.referenceLane;
  const posts = referenceArchive[lane];
  pane.innerHTML = `<p class="eyebrow">REFERENCE ARCHIVE · ${posts.length} POSTS</p>
    <label for="${lane}-references">Choose a reference</label><select id="${lane}-references" class="reference-select"></select>
    <div class="reference-summary" aria-live="polite"><p class="reference-role"></p><h3></h3>
      <p class="reference-credit"></p><p class="reference-mechanic"></p><dl class="reference-metrics"></dl><p class="reference-evidence"></p><div class="secondary-evidence" hidden></div></div>
    <div class="reference-links"><a class="source-link" target="_blank" rel="noopener noreferrer">Open original on TikTok ↗</a>
      <a class="evidence-link" hidden target="_blank" rel="noopener noreferrer">Open evidence ↗</a></div>
    <details class="reference-player"><summary>Load TikTok player</summary>
      <iframe title="Selected TikTok reference" allow="fullscreen; autoplay; encrypted-media" allowfullscreen referrerpolicy="no-referrer"></iframe></details>
    <p class="compare-note">If the player is blocked, open the original above. Metrics are snapshots, not live totals.</p>`;
  const select = pane.querySelector('select');
  const details = pane.querySelector('details');
  const frame = pane.querySelector('iframe');
  const metrics = pane.querySelector('.reference-metrics');
  posts.forEach((post,index) => {
    const option = document.createElement('option');
    option.value = String(index);
    const counts = Object.entries(post.metrics).slice(0,2).map(([name,value]) => `${value} ${name.toLowerCase()}`).join(' / ');
    option.textContent = `${post.title} · ${counts || 'metrics unverified'}`;
    select.append(option);
  });
  function render() {
    const post = posts[Number(select.value)];
    pane.querySelector('h3').textContent = post.title;
    pane.querySelector('.reference-role').textContent = post.role;
    pane.querySelector('.reference-credit').textContent = `@${post.handle} · ${post.date || 'Post date not verified'}`;
    pane.querySelector('.reference-mechanic').textContent = post.mechanic;
    const entries = Object.entries(post.metrics);
    metrics.replaceChildren();
    for (const [label,value] of entries) {
      const cell = document.createElement('div'), term = document.createElement('dt'), definition = document.createElement('dd');
      term.textContent = label;
      definition.textContent = value;
      cell.append(term,definition);
      metrics.append(cell);
    }
    const evidence = pane.querySelector('.reference-evidence');
    const lacking = !entries.length ? 'Views and likes not verified. ' : !post.metrics.Views ? 'Views not verified. ' : !post.metrics.Likes ? 'Likes not verified. ' : '';
    evidence.textContent = lacking + [post.source[0],post.review,post.duration].filter(Boolean).join(' · ');
    const secondary = pane.querySelector('.secondary-evidence');
    secondary.replaceChildren();
    secondary.hidden = !post.secondSnapshot;
    if (post.secondSnapshot) {
      const link = document.createElement('a');
      link.href=post.secondSnapshot.url; link.target='_blank'; link.rel='noopener noreferrer';
      link.textContent=post.secondSnapshot.label+' ↗';
      const counts = document.createElement('p');
      counts.textContent=Object.entries(post.secondSnapshot.metrics).map(([name,value]) => `${value} ${name.toLowerCase()}`).join(' · ');
      secondary.append(link,counts);
    }
    pane.querySelector('.source-link').href = post.url;
    const link = pane.querySelector('.evidence-link');
    link.hidden = !post.source[1];
    if (post.source[1]) link.href = post.source[1];
    else link.removeAttribute('href');
    frame.title = post.title + ' on TikTok';
    setPlayer();
  }
  function setPlayer() {
    if (!details.open) {
      frame.removeAttribute('src');
      return;
    }
    const src = 'https://www.tiktok.com/player/v1/' + posts[Number(select.value)].id + '?autoplay=0&description=0';
    if (frame.getAttribute('src') !== src) frame.src = src;
  }
  details.addEventListener('toggle', setPlayer);
  select.addEventListener('change', render);
  if (lane === 'video') {
    const videoPicker = document.querySelector('#video-choices');
    const videoCuts = Array.from(document.querySelectorAll('[data-video-cut]'));
    const setCut = () => {
      const chosen = videoCuts.find(cut => cut.dataset.videoCut === videoPicker.value);
      if (!chosen) return;
      for (const cut of videoCuts) {
        const hide = cut !== chosen;
        if (hide && !cut.hidden) cut.querySelector('video').pause();
        cut.hidden = hide;
      }
      const index = posts.findIndex(post => post.id === chosen.dataset.pairedReference);
      if (index >= 0) select.value = String(index);
      render();
    };
    videoPicker.addEventListener('change', setCut);
    videoPicker.value = 'wingman';
    setCut();
  } else {
    render();
  }
}
