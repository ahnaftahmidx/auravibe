(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const KEY = 'jfa_ultra_';
  const read = (name, fallback) => { try { const v = JSON.parse(localStorage.getItem(KEY + name)); return v ?? fallback; } catch { return fallback; } };
  const write = (name, value) => { try { localStorage.setItem(KEY + name, JSON.stringify(value)); } catch {} };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatTime = seconds => Number.isFinite(Number(seconds)) && Number(seconds) >= 0 ? `${Math.floor(Number(seconds) / 60)}:${String(Math.floor(Number(seconds) % 60)).padStart(2,'0')}` : '0:00';
  const audio = $('#audio');
  let favorites = read('favorites', []);
  let playlists = read('playlists', []);
  let notes = read('notes', []);
  let queue = read('queue', []);
  let current = read('current', null);
  let settings = Object.assign({theme:'dark', accent:'violet', motion:true, compact:false, volume:0.8}, read('settings', {}));
  const catalog = new Map();
  [...favorites, ...queue, ...(current ? [current] : []), ...playlists.flatMap(p => p.tracks || [])].forEach(track => { if (track && track.id != null) catalog.set(String(track.id), track); });
  let toastTimer;
  let toastEl = $('#toast');
  let localUrls = [];

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }
  function persist() {
    write('favorites', favorites.filter(track => !track.local && !String(track.stream || '').startsWith('blob:'))); write('playlists', playlists); write('notes', notes);
    // Object URLs for local files only exist in the current tab; never persist them.
    if (current && !String(current.stream || '').startsWith('blob:')) write('current', current);
    else write('current', null);
    write('queue', queue.filter(track => !track.local && !String(track.stream || '').startsWith('blob:')));
    write('settings', settings);
  }
  function applySettings() {
    document.body.classList.toggle('light', settings.theme === 'light');
    document.body.classList.toggle('no-motion', settings.motion === false);
    document.body.classList.toggle('compact', settings.compact === true);
    const accents = {
      violet: ['#b58aff','#f28ed4','#8de4e7'], ocean: ['#73b7ff','#70ead1','#c1abff'],
      rose: ['#ff8fbe','#ffbb91','#d8a6ff'], ember: ['#ffb56b','#f47c9e','#8dd7ff']
    };
    const set = accents[settings.accent] || accents.violet;
    document.documentElement.style.setProperty('--accent', set[0]);
    document.documentElement.style.setProperty('--accent2', set[1]);
    document.documentElement.style.setProperty('--accent3', set[2]);
    $$('[data-theme-set]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.themeSet === settings.theme)));
    $$('[data-accent-set]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.accentSet === settings.accent)));
    const motion = $('#motion-toggle'); if (motion) motion.checked = settings.motion !== false;
    const volume = $('#volume-control'); if (volume) volume.value = String(settings.volume ?? 0.8);
    const compact = $('#compact-toggle'); if (compact) compact.checked = settings.compact === true;
    const themeLabel = $('#theme-label'); if (themeLabel) themeLabel.textContent = settings.theme === 'light' ? 'Light atmosphere' : 'Midnight atmosphere';
  }
  function trackRow(track) {
    const id = escapeHTML(track.id);
    const artwork = `<div class="track-cover" aria-hidden="true">${track.artwork ? `<img src="${escapeHTML(track.artwork)}" alt="" loading="lazy" onerror="this.remove()">` : '♫'}</div>`;
    const active = current && String(current.id) === String(track.id);
    const isFav = favorites.some(item => String(item.id) === String(track.id));
    return `<article class="track-row" data-track-row="${id}">${artwork}<div class="track-meta"><b title="${escapeHTML(track.title)}">${escapeHTML(track.title || 'Untitled track')}</b><small>${escapeHTML(track.artist || 'Unknown artist')}${active ? ' · Now playing' : ''}</small></div><span class="track-duration">${formatTime(track.duration)}</span><button class="track-action play-small" type="button" data-play="${id}" aria-label="Play ${escapeHTML(track.title)}">${active && audio && !audio.paused ? 'Ⅱ' : '▶'}</button><button class="track-action heart" type="button" data-fav="${id}" aria-label="${isFav?'Remove from':'Add to'} favorites">${isFav ? '♥' : '♡'}</button></article>`;
  }
  function emptyState(icon, title, copy) {
    return `<div class="empty-state"><span class="empty-icon">${icon}</span><b>${escapeHTML(title)}</b><br>${escapeHTML(copy)}</div>`;
  }
  function renderFavorites() {
    const box = $('#favorites');
    if (box) box.innerHTML = favorites.length ? favorites.map(trackRow).join('') : emptyState('♡', 'Nothing saved just yet', 'When a song feels like you, tap the heart and find it here.');
    const count = $('#favorite-count'); if (count) count.textContent = favorites.length;
    const stat = $('#stat-favorites'); if (stat) stat.textContent = favorites.length;
  }
  function renderPlaylists() {
    const box = $('#playlist-list');
    if (!box) return;
    if (!playlists.length) { box.innerHTML = emptyState('▤', 'Your first playlist is waiting', 'Give a feeling a name, then add tracks that belong to it.'); return; }
    box.innerHTML = playlists.map((playlist, index) => `<article class="playlist-card"><div class="playlist-card-head"><div class="playlist-cover">♫</div><div style="min-width:0;flex:1"><h3>${escapeHTML(playlist.name)}</h3><p>${(playlist.tracks || []).length} ${(playlist.tracks || []).length === 1 ? 'track' : 'tracks'}</p></div><button class="track-action" data-playlist-delete="${escapeHTML(playlist.id)}" aria-label="Delete ${escapeHTML(playlist.name)}" title="Delete playlist">×</button></div>${(playlist.tracks || []).length ? (playlist.tracks || []).map(t => `<div class="mini-track"><span>${escapeHTML(t.title)} · ${escapeHTML(t.artist)}</span><button class="track-action" data-play="${escapeHTML(t.id)}" aria-label="Play ${escapeHTML(t.title)}">▶</button></div>`).join('') : '<p class="small muted">A beautiful blank canvas. Add a song below.</p>'}<div class="form-actions" style="margin-top:12px"><button class="btn secondary" type="button" data-playlist-add="${escapeHTML(playlist.id)}">＋ Add current song</button></div></article>`).join('');
    const select = $('#playlist-select');
    if (select) select.innerHTML = '<option value="">Choose a playlist…</option>' + playlists.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('');
    const stat = $('#stat-playlists'); if (stat) stat.textContent = playlists.length;
  }
  function renderNotes() {
    const box = $('#notes-list'); if (!box) return;
    box.innerHTML = notes.length ? [...notes].reverse().map(note => `<article class="note-card"><button class="track-action delete-note" data-note-delete="${escapeHTML(note.id)}" type="button" aria-label="Delete note">×</button><span class="note-mood">${escapeHTML(note.mood || 'A little thought')}</span><h3>${escapeHTML(note.title || 'Untitled note')}</h3><p>${escapeHTML(note.body)}</p><span class="note-date">${escapeHTML(note.date || '')}</span></article>`).join('') : emptyState('≋', 'Leave a thought here', 'Keep a line, a memory, a lyric idea, or anything you do not want to lose.');
    const stat = $('#stat-notes'); if (stat) stat.textContent = notes.length;
  }
  function paintPlayer() {
    const title = current?.title || 'Nothing playing yet';
    const artist = current?.artist || 'Choose a song to begin';
    const art = current?.artwork || '';
    const playing = !!(audio && !audio.paused && audio.src);
    const dTitle = $('#dock-title'), dArtist = $('#dock-artist'), dCover = $('#dock-cover'), dPlay = $('#dock-play');
    if (dTitle) dTitle.textContent = title;
    if (dArtist) dArtist.textContent = artist;
    if (dCover) dCover.innerHTML = art ? `<img src="${escapeHTML(art)}" alt="" onerror="this.parentElement.textContent='♫'">` : '♫';
    if (dPlay) { dPlay.textContent = playing ? 'Ⅱ' : '▶'; dPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play'); }
    const nowTitle = $('#now-title'); if (nowTitle) nowTitle.textContent = title;
    const nowArtist = $('#now-artist'); if (nowArtist) nowArtist.textContent = artist;
    const nowCover = $('#now-cover'); if (nowCover) { nowCover.innerHTML = art ? `<img src="${escapeHTML(art)}" alt="">` : '♫'; }
    const playerBox = $('.player-art-panel'); if (playerBox) playerBox.classList.toggle('is-playing', playing);
    const bigPlay = $('#main-play'); if (bigPlay) bigPlay.textContent = playing ? 'Ⅱ' : '▶';
    const favButton = $('#current-fav'); if (favButton) { const on = !!current && favorites.some(t => String(t.id) === String(current.id)); favButton.textContent = on ? '♥' : '♡'; favButton.setAttribute('aria-pressed', String(on)); }
    if (audio && audio.duration && Number.isFinite(audio.duration)) {
      const progress = Math.min(100, (audio.currentTime / audio.duration) * 100);
      const dockSeek = $('#dock-seek'); if (dockSeek) dockSeek.value = progress;
      const fullSeek = $('#full-seek'); if (fullSeek) fullSeek.value = progress;
      const elapsed = $('#elapsed'); if (elapsed) elapsed.textContent = formatTime(audio.currentTime);
      const duration = $('#duration'); if (duration) duration.textContent = formatTime(audio.duration);
    } else {
      const dockSeek = $('#dock-seek'); if (dockSeek) dockSeek.value = 0;
      const fullSeek = $('#full-seek'); if (fullSeek) fullSeek.value = 0;
      const elapsed = $('#elapsed'); if (elapsed) elapsed.textContent = '0:00';
      const duration = $('#duration'); if (duration) duration.textContent = formatTime(current?.duration);
    }
  }
  let streamAttempt = 0;
  function streamCandidates(track) {
    const id = encodeURIComponent(track.id);
    const appName = 'JustFeelWithAhnaf';
    const candidates = [
      track.stream,
      track.url,
      `https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=${appName}`,
      `https://api.audius.co/v1/tracks/${id}/stream?app_name=${appName}`
    ].filter(Boolean);
    return [...new Set(candidates)];
  }
  function startStreamAttempt(index) {
    if (!audio || !current) return;
    const candidates = streamCandidates(current);
    if (index >= candidates.length) {
      toast('This track cannot be streamed right now. Try another track or upload an audio file from your device.');
      paintPlayer(); return;
    }
    streamAttempt = index;
    audio.src = candidates[index];
    audio.load();
    audio.play().then(() => {
      paintPlayer();
      toast('Now playing · ' + (current.title || 'your track'));
    }).catch(() => {
      if (index + 1 < candidates.length) startStreamAttempt(index + 1);
      else { paintPlayer(); toast('Playback was blocked or this track is unavailable. Try another track.'); }
    });
  }
  function playTrack(track) {
    if (!track) return;
    if (!track.id && !(track.stream || track.url)) { toast('This track does not have a playable audio stream.'); return; }
    current = track;
    catalog.set(String(track.id), track);
    if (!queue.some(t => String(t.id) === String(track.id))) queue.unshift(track);
    if (audio) startStreamAttempt(0);
    persist(); paintPlayer();
  }
  function togglePlay() {
    if (!audio || !current) { toast('Explore music and choose a song first.'); return; }
    if (audio.paused) {
      if (!audio.src && current.stream) audio.src = current.stream;
      audio.play().then(paintPlayer).catch(() => toast('Could not play this track. Try another one.'));
    } else audio.pause();
    paintPlayer();
  }
  function adjacent(direction) {
    if (!queue.length) { toast('Play a song first to start a queue.'); return; }
    let index = current ? queue.findIndex(t => String(t.id) === String(current.id)) : -1;
    if (index < 0) index = direction > 0 ? -1 : 0;
    const next = (index + direction + queue.length) % queue.length;
    playTrack(queue[next]);
  }
  function toggleFavorite(track) {
    if (!track) { toast('Choose a song first.'); return; }
    const index = favorites.findIndex(item => String(item.id) === String(track.id));
    if (index >= 0) { favorites.splice(index, 1); toast('Removed from favorites'); }
    else { favorites.unshift(track); toast('Saved to your favorites ♥'); }
    persist(); renderFavorites(); renderPlaylists(); paintPlayer();
    const existing = $(`[data-fav="${CSS.escape(String(track.id))}"]`);
    if (existing) { const active = favorites.some(t => String(t.id) === String(track.id)); existing.textContent = active ? '♥' : '♡'; existing.setAttribute('aria-label', active ? 'Remove from favorites' : 'Add to favorites'); }
  }
  function normalizeTrack(item) {
    const id = String(item.id);
    return {id,title:item.title || item.name || 'Untitled track',artist:item.user?.name || item.artist || 'Unknown artist',artwork:item.artwork?.['480x480'] || item.artwork?.['150x150'] || item.artwork || '',duration:Number(item.duration) || 0,stream:item.stream || `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(id)}/stream?app_name=JustFeelWithAhnaf`,permalink:item.permalink || ''};
  }
  async function searchMusic(query) {
    const results = $('#results'), status = $('#status');
    if (!results || !status) return;
    const q = String(query || '').trim();
    if (!q) { status.textContent = 'Type a mood, artist, or song to begin exploring.'; results.innerHTML = emptyState('⌕','What are you feeling?','Search a sound, an artist, or a mood above.'); return; }
    status.textContent = `Finding a sound for “${q}”…`;
    results.innerHTML = '<div class="empty-state"><span class="empty-icon">◌</span>Listening across the music universe…</div>';
    try {
      const params = `?query=${encodeURIComponent(q)}&limit=25&app_name=JustFeelWithAhnaf`;
      let payload = null;
      let lastError = null;
      for (const host of ['https://discoveryprovider.audius.co/v1', 'https://api.audius.co/v1']) {
        try {
          const response = await fetch(`${host}/tracks/search${params}`);
          if (!response.ok) throw new Error(`Audius returned ${response.status}`);
          payload = await response.json();
          if (payload && Array.isArray(payload.data)) break;
        } catch (error) { lastError = error; }
      }
      if (!payload || !Array.isArray(payload.data)) throw lastError || new Error('Search service unavailable');
      const tracks = (payload.data || []).filter(t => t && t.id != null).map(normalizeTrack);
      tracks.forEach(track => catalog.set(String(track.id), track));
      if (!tracks.length) { status.textContent = `No tracks found for “${q}”. Try another phrase.`; results.innerHTML = emptyState('☾','A quiet corner of the universe','Try “lofi”, “indie”, “ambient”, or another artist.'); return; }
      queue = tracks; write('queue', queue);
      status.textContent = `${tracks.length} tracks found · tap play to follow the feeling`;
      results.innerHTML = tracks.map(trackRow).join('');
    } catch (error) {
      status.textContent = 'Online search could not connect. Check your internet and try again.';
      results.innerHTML = emptyState('⌁','The signal is a little quiet','Music search uses the public Audius discovery service. Try again in a moment.');
    }
  }
  function playCurrentInPlaylist(id) {
    if (!current) { toast('Play a song first, then add it to a playlist.'); return; }
    const playlist = playlists.find(p => String(p.id) === String(id));
    if (!playlist) return;
    playlist.tracks = playlist.tracks || [];
    if (playlist.tracks.some(t => String(t.id) === String(current.id))) toast('That song is already in this playlist.');
    else { playlist.tracks.push(current); toast('Added to “' + playlist.name + '”'); }
    persist(); renderPlaylists();
  }

  // Keep the active item, controls, and saved collections in sync across every page.
  if (audio && current && current.stream && !String(current.stream).startsWith('blob:')) audio.src = current.stream;
  if (audio) {
    audio.volume = Math.max(0, Math.min(1, Number(settings.volume ?? .8)));
    audio.addEventListener('timeupdate', paintPlayer);
    audio.addEventListener('loadedmetadata', paintPlayer);
    audio.addEventListener('play', paintPlayer);
    audio.addEventListener('pause', paintPlayer);
    audio.addEventListener('ended', () => adjacent(1));
    audio.addEventListener('error', () => {
      if (!current) return;
      const candidates = streamCandidates(current);
      if (streamAttempt + 1 < candidates.length) {
        const next = streamAttempt + 1;
        toast('Trying another music stream…');
        startStreamAttempt(next);
      } else {
        paintPlayer();
        toast('This stream is unavailable. Search another version or use Add local music.');
      }
    });
  }
  $('#dock-play')?.addEventListener('click', togglePlay);
  $('#dock-prev')?.addEventListener('click', () => adjacent(-1));
  $('#dock-next')?.addEventListener('click', () => adjacent(1));
  $('#main-play')?.addEventListener('click', togglePlay);
  $('#main-prev')?.addEventListener('click', () => adjacent(-1));
  $('#main-next')?.addEventListener('click', () => adjacent(1));
  $('#current-fav')?.addEventListener('click', () => toggleFavorite(current));
  function seek(value) { if (audio && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(100, Number(value))) / 100 * audio.duration; }
  $('#dock-seek')?.addEventListener('input', e => seek(e.target.value));
  $('#full-seek')?.addEventListener('input', e => seek(e.target.value));
  $('#volume-control')?.addEventListener('input', e => { if (audio) audio.volume = Number(e.target.value); settings.volume = Number(e.target.value); persist(); });
  $('#search-form')?.addEventListener('submit', e => { e.preventDefault(); const q = $('#search-input')?.value || ''; const url = new URL(location.href); url.searchParams.set('q', q); history.replaceState({}, '', url); searchMusic(q); });
  $$('[data-search-term]').forEach(button => button.addEventListener('click', () => { const q = button.dataset.searchTerm; const input = $('#search-input'); if (input) input.value = q; searchMusic(q); }));
  $('#create-playlist-form')?.addEventListener('submit', e => {
    e.preventDefault(); const input = $('#playlist-name'); const name = input?.value.trim();
    if (!name) { toast('Give your playlist a name first.'); return; }
    if (playlists.some(p => p.name.toLowerCase() === name.toLowerCase())) { toast('You already have a playlist with that name.'); return; }
    playlists.unshift({id:'pl_' + Date.now().toString(36),name,tracks:[]});
    persist(); renderPlaylists(); input.value=''; toast('Your new playlist is here ✦');
  });
  $('#playlist-add-current')?.addEventListener('click', () => { const id = $('#playlist-select')?.value; if (!id) { toast('Choose a playlist first.'); return; } playCurrentInPlaylist(id); });
  $('#playlist-add-favorites')?.addEventListener('click', () => {
    const id = $('#playlist-select')?.value; if (!id) { toast('Choose a playlist first.'); return; }
    const playlist = playlists.find(p => String(p.id) === String(id)); if (!playlist) return;
    playlist.tracks = playlist.tracks || []; let added = 0;
    favorites.forEach(t => { if (!playlist.tracks.some(s => String(s.id) === String(t.id))) { playlist.tracks.push(t); added++; } });
    persist(); renderPlaylists(); toast(added ? `Added ${added} favorite${added === 1 ? '' : 's'}.` : 'All favorites are already in that playlist.');
  });
  $('#note-form')?.addEventListener('submit', e => {
    e.preventDefault(); const title = $('#note-title')?.value.trim() || 'Untitled thought'; const body = $('#note-body')?.value.trim(); const mood = $('#note-mood')?.value || 'A little thought';
    if (!body) { toast('Write a few words before saving.'); return; }
    notes.push({id:'note_' + Date.now().toString(36),title,body,mood,date:new Date().toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})});
    persist(); renderNotes(); $('#note-form').reset(); toast('Saved to your little corner ✦');
  });
  $$('[data-theme-set]').forEach(button => button.addEventListener('click', () => { settings.theme = button.dataset.themeSet; persist(); applySettings(); }));
  $$('[data-accent-set]').forEach(button => button.addEventListener('click', () => { settings.accent = button.dataset.accentSet; persist(); applySettings(); }));
  $('#motion-toggle')?.addEventListener('change', e => { settings.motion = e.target.checked; persist(); applySettings(); });
  $('#compact-toggle')?.addEventListener('change', e => { settings.compact = e.target.checked; persist(); applySettings(); });
  $('#clear-data')?.addEventListener('click', () => {
    if (!confirm('Clear your saved favorites, playlists, and notes from this browser? This cannot be undone.')) return;
    favorites=[]; playlists=[]; notes=[]; queue=[]; current=null; persist();
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    renderFavorites(); renderPlaylists(); renderNotes(); paintPlayer(); toast('Your local music space has been cleared.');
  });
  $('#local-audio')?.addEventListener('change', e => {
    const files = [...(e.target.files || [])].filter(file => file.type.startsWith('audio/'));
    if (!files.length) { toast('Choose one or more audio files.'); return; }
    const localTracks = files.map((file, index) => ({id:`local_${Date.now()}_${index}`,title:file.name.replace(/\.[^.]+$/,''),artist:'Your device · Local audio',artwork:'',duration:0,stream:URL.createObjectURL(file),local:true}));
    localUrls.push(...localTracks.map(t => t.stream)); queue = localTracks; localTracks.forEach(t => catalog.set(String(t.id),t));
    if ($('#local-list')) $('#local-list').innerHTML = localTracks.map(trackRow).join('');
    if (localTracks.length === 1) playTrack(localTracks[0]);
    else toast(`${localTracks.length} tracks ready · choose one to play`);
    e.target.value='';
  });
  document.addEventListener('click', event => {
    const playBtn = event.target.closest('[data-play]');
    if (playBtn) { event.preventDefault(); const t = catalog.get(String(playBtn.dataset.play)); if (t) playTrack(t); else toast('Search for the track again to refresh its stream.'); return; }
    const favBtn = event.target.closest('[data-fav]');
    if (favBtn) { event.preventDefault(); toggleFavorite(catalog.get(String(favBtn.dataset.fav)) || favorites.find(t => String(t.id) === String(favBtn.dataset.fav))); return; }
    const removePlaylist = event.target.closest('[data-playlist-delete]');
    if (removePlaylist) { playlists = playlists.filter(p => String(p.id) !== String(removePlaylist.dataset.playlistDelete)); persist(); renderPlaylists(); toast('Playlist removed.'); return; }
    const addPlaylist = event.target.closest('[data-playlist-add]');
    if (addPlaylist) { playCurrentInPlaylist(addPlaylist.dataset.playlistAdd); return; }
    const removeNote = event.target.closest('[data-note-delete]');
    if (removeNote) { notes = notes.filter(n => String(n.id) !== String(removeNote.dataset.noteDelete)); persist(); renderNotes(); toast('Note removed.'); }
  });

  // Populate query-driven mood searches when Explore opens.
  const query = new URLSearchParams(location.search).get('q');
  if ($('#search-input') && query) { $('#search-input').value = query; searchMusic(query); }
  else if ($('#search-input')) { const defaultSearch = 'lofi chill'; $('#search-input').value = defaultSearch; searchMusic(defaultSearch); }
  if ($('#local-list')) {
    const local = queue.filter(t => t.local && String(t.stream || '').startsWith('blob:'));
    if (local.length) $('#local-list').innerHTML = local.map(trackRow).join('');
  }
  applySettings(); renderFavorites(); renderPlaylists(); renderNotes(); paintPlayer();
  const revealItems = $$('.reveal');
  if ('IntersectionObserver' in window && settings.motion !== false) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }), {threshold:.08});
    revealItems.forEach(el => observer.observe(el));
  } else revealItems.forEach(el => el.classList.add('is-visible'));
})();


/* AURAVIBE cinematic intro + browser-local name recognition. */
(() => {
  const intro = document.getElementById('welcome-intro');
  const gate = document.getElementById('name-gate');
  const storedName = (() => { try { return localStorage.getItem('auravibeVisitorName') || ''; } catch (_) { return ''; } })();
  const showGate = () => {
    if (!gate) return;
    if (storedName) {
      gate.hidden = true;
      document.querySelectorAll('.hero-copy h1').forEach(h => { h.innerHTML = `Welcome to your music universe,<br><span class="gradient">${storedName.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}.</span>`; });
      return;
    }
    gate.hidden = false;
    document.querySelector('.app-shell')?.classList.add('entry-locked');
    document.querySelector('.mobile-nav')?.classList.add('entry-locked');
    document.querySelector('.player-dock')?.classList.add('entry-locked');
    gate.querySelector('#visitor-name')?.focus();
  };
  const finish = () => {
    if (intro && !intro.classList.contains('is-leaving')) {
      intro.classList.add('is-leaving');
      window.setTimeout(() => { intro.remove(); showGate(); }, 850);
    } else showGate();
  };
  document.getElementById('intro-skip')?.addEventListener('click', finish);
  document.getElementById('name-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const field = document.getElementById('visitor-name');
    const name = (field?.value || '').trim().slice(0,32);
    if (!name) { field?.focus(); return; }
    try { localStorage.setItem('auravibeVisitorName', name); } catch (_) {}
    gate.hidden = true;
    document.querySelector('.app-shell')?.classList.remove('entry-locked');
    document.querySelector('.mobile-nav')?.classList.remove('entry-locked');
    document.querySelector('.player-dock')?.classList.remove('entry-locked');
    document.querySelectorAll('.hero-copy h1').forEach(h => { h.innerHTML = 'Welcome to your music universe,<br><span class="gradient">' + name.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c])) + '.</span>'; });
  });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else if (intro) window.setTimeout(finish, 5200);
  else showGate();
})();
