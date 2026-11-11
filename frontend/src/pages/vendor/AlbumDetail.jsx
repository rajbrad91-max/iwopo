/**
 * 📸 One album: tabs, uploads, faces, RAW files, sharing.
 * Moved out of pages/VendorPanel.jsx unchanged (code audit #2, Raj 2026-11-11).
 */
import { useState, useEffect, useRef } from 'react';
import { useDialog } from '../../lib/dialog.jsx';
import { api, getAuthToken, fmtDateTime } from '../../lib/api';

/* 🎞️ camera RAW files — same list as backend lib/rawFiles.js */
const RAW_FILE = /\.(arw|cr3|cr2|nef|raf|dng|rw2|orf)$/i;
const RAW_ACCEPT = '.arw,.cr3,.cr2,.nef,.raf,.dng,.rw2,.orf';

export function AlbumDetail({ albumId, onBack }) {
  const dialog = useDialog();
  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [events, setEvents] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [prog, setProg] = useState('');
  const [activeEvent, setActiveEvent] = useState('all'); // filter + upload target
  const [evModal, setEvModal] = useState(null); // { type:'add'|'edit'|'delete', ev, name }
  const [evBusy, setEvBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20); // infinite-scroll: how many thumbs are mounted
  const [pending, setPending] = useState([]); // local previews of files still uploading {uid, url, eventId}
  const [dragOver, setDragOver] = useState(false); // drag-and-drop upload zone highlight
  const [lightbox, setLightbox] = useState(null); // index into `visible` of the open full-screen photo
  const [favModal, setFavModal] = useState(false);      // ⭐ show the client-favorites panel
  const [favData, setFavData] = useState(null);         // { total, lists:[{email,count,photos}] }
  const [favBusy, setFavBusy] = useState(false);
  /* 🎞️ Raw Selector (private feature): null when it is off for this vendor —
     then RAW files are simply not offered, exactly as before */
  const [raw, setRaw] = useState(null);
  const loadRaw = () => api.rawselStatus(albumId).then(setRaw).catch(() => setRaw(null));
  useEffect(() => { api.rawselStatus(albumId).then(setRaw).catch(() => setRaw(null)); }, [albumId]);
  const [selModal, setSelModal] = useState(false);      // 📩 show the client's sent selection
  const [selData, setSelData] = useState(null);
  const [selBusy, setSelBusy] = useState(false);
  const [copiedNames, setCopiedNames] = useState(false);
  const [selActBusy, setSelActBusy] = useState(false);   // mark-complete / clear in flight
  const [selClearAsk, setSelClearAsk] = useState(false); // confirm clearing the selection
  const dropInputRef = useRef(null);
  const dropVidInputRef = useRef(null);   // the same zone, for the Videos folder
  const sentinelRef = useRef(null);
  const workerRef = useRef(null);
  const visibleLenRef = useRef(0); // holds current visible-photo count for the keyboard handler
  const token = getAuthToken();   // this tab's token, not whatever another tab last wrote

  // clean up the upload worker + any object URLs on unmount
  useEffect(() => () => {
    if (workerRef.current) workerRef.current.terminate();
    setPending(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
  }, []);

  // keyboard controls for the full-screen viewer: Esc closes, arrows navigate.
  // reads the count from a ref so it doesn't depend on `visible` (defined later).
  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowLeft') setLightbox(i => (i > 0 ? i - 1 : i));
      else if (e.key === 'ArrowRight') setLightbox(i => (i < visibleLenRef.current - 1 ? i + 1 : i));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  // browser Back closes the full-screen photo instead of leaving the gallery.
  // On open we push a history entry; Back pops it and closes the viewer. Closing
  // via X/Esc/click goes back once to consume that entry, keeping history clean.
  const lbHistRef = useRef(false); // did WE push a history entry for the current lightbox?
  const lightboxOpen = lightbox !== null;
  useEffect(() => {
    if (!lightboxOpen) return;
    window.history.pushState({ adLightbox: true }, '');
    lbHistRef.current = true;
    const onPop = () => { lbHistRef.current = false; setLightbox(null); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // if the viewer was closed by something other than Back, consume our entry
      if (lbHistRef.current) { lbHistRef.current = false; window.history.back(); }
    };
  }, [lightboxOpen]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the listed values change; load reads the latest state each time it is called
  useEffect(() => { load(); }, [albumId]);
  function load() { api.album(albumId).then(d => {
    setAlbum(d.album); setPhotos(d.photos || []); setEvents(d.events || []);
    // an album with folders opens on the first of them
    if ((d.events || []).length > 0) {
      setActiveEvent(prev => prev === 'all' ? d.events[0].id : prev);
    }
  }).catch(() => {}); }

  // refresh only the photo list (used mid-upload so new photos appear without resetting the view)
  function reloadPhotos() { return api.album(albumId).then(d => { setPhotos(d.photos || []); }).catch(() => {}); }
  /* ⏳ Photos sent straight to R2 get their thumbnails a moment later. While
     any are still being prepared, re-read the album every few seconds so each
     spinner turns into its photo without the vendor reloading. */
  useEffect(() => {
    if (!photos.some(p => p.ready === false)) return undefined;
    const t = setTimeout(() => { api.album(albumId).then(d => setPhotos(d.photos || [])).catch(() => {}); }, 4000);
    return () => clearTimeout(t);
  }, [photos, albumId]);

  // ⭐ open the client-favorites panel and load favorites grouped by email
  function openFavorites() {
    setFavModal(true); setFavBusy(true); setFavData(null);
    api.albumFavorites(albumId)
      .then(d => setFavData(d))
      .catch(() => setFavData({ total: 0, lists: [] }))
      .finally(() => setFavBusy(false));
  }

  // 📩 open the sent-selection panel (what the client's admin sent to the studio)
  function openSelection() {
    setSelModal(true); setSelBusy(true); setSelData(null); setCopiedNames(false);
    api.albumSelection(albumId)
      .then(d => setSelData(d))
      .catch(() => setSelData({ total: 0, events: [] }))
      .finally(() => setSelBusy(false));
  }

  // 📋 copy every selected file name, space-separated (DSC112 DSC113 …)
  async function copySelectionNames() {
    if (!selData?.events?.length) return;
    const names = selData.events.flatMap(ev => ev.photos.map(p => (p.filename || '').replace(/\.[^.]+$/, '')));
    const text = names.join(' ');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API blocked (http or permissions) — fall back to a temporary textarea
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    setCopiedNames(true);
    setTimeout(() => setCopiedNames(false), 2000);
  }

  // ✅ flag the selection as handled (or un-flag it)
  async function toggleSelectionComplete() {
    const next = !selData?.completed_at;
    setSelActBusy(true);
    try {
      const d = await api.completeSelection(albumId, next);
      setSelData(s => ({ ...s, completed_at: next ? (d.completed_at || new Date().toISOString()) : null }));
    } catch { /* leave state as-is */ }
    finally { setSelActBusy(false); }
  }

  // 🗑️ clear the sent selection + note (photos are not touched)
  async function clearSelection() {
    setSelActBusy(true);
    try {
      await api.clearSelection(albumId);
      setSelData({ total: 0, events: [], note: '', sent_at: null, completed_at: null });
      setSelClearAsk(false);
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setSelActBusy(false); }
  }

  // reset the infinite-scroll window when switching event tabs
  useEffect(() => { setVisibleCount(20); }, [activeEvent]);

  // infinite scroll: reveal 20 more each time the sentinel scrolls into view
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount(c => c + 20);
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [activeEvent, photos.length]);

  const isPerClient = true; // per-client is the only gallery mode

  const [vidBusy, setVidBusy] = useState('');

  /* 🚧 Closing the tab mid-upload throws the work away, and a vendor an hour
     into a large film should be asked first. Switching tabs or minimising is
     fine and needs no guard — fetch keeps running in a background tab; it is
     only leaving the page that kills it. */
  useEffect(() => {
    if (!vidBusy && !uploading) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [vidBusy, uploading]);
  const vidLabel = vidBusy || '🎬 Add Videos';

  /**
   * 🖼️ A poster frame, drawn by the browser.
   *
   * The browser is about to upload this file, so it can already decode it — it
   * can seek a little way in and paint a frame onto a canvas. That is the whole
   * thumbnail pipeline, and it needs no ffmpeg on the server.
   *
   * A second in, not frame zero: films very often open on black, and a black
   * thumbnail looks like a broken one. If the browser cannot decode the file at
   * all — an HEVC export opened in Chrome — this resolves empty and the grid
   * falls back to a plain film tile.
   */
  /** 95 → "1:35". Films are minutes, so hours appear only when they exist. */
  function fmtDur(sec) {
    const t = Math.round(sec);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), r = t % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
             : `${m}:${String(r).padStart(2, '0')}`;
  }

  function posterFor(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      let done = false;
      const finish = (poster, duration) => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        resolve({ poster, duration });
      };
      // a file the browser stalls on must not hang the upload forever
      const bail = setTimeout(() => finish(null, null), 12000);
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      v.onloadedmetadata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 2); };
      v.onseeked = () => {
        clearTimeout(bail);
        try {
          const c = document.createElement('canvas');
          c.width = v.videoWidth; c.height = v.videoHeight;
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(b => finish(b, v.duration), 'image/jpeg', 0.82);
        } catch { finish(null, v.duration); }
      };
      v.onerror = () => { clearTimeout(bail); finish(null, null); };
      v.src = url;
    });
  }

  /* One film per request, sequentially. They are gigabytes; sending five at
     once saturates the connection and makes every one of them slower. */
  /**
   * ⬆️ One film, carried by the browser straight to Cloudflare.
   *
   * The file never passes through our server. It is cut into parts, each sent
   * to a signed URL, and only the paperwork — begin, sign, complete — goes to
   * the API. That is what makes a hundred-gigabyte film possible at all: a
   * single request that size would exceed R2's own limit, need twice the file
   * in free disk, and drop long before it finished.
   *
   * A failed part is retried on its own rather than restarting the film, which
   * is the difference between a wobbly connection costing seconds and costing
   * an hour.
   */
  async function uploadOneFilm(file, onProgress) {
    /* The poster is drawn FIRST, while the vendor is still looking at the page.
       It used to be drawn after the last part had gone up, by which time the
       tab was often in the background — and a background tab throttles video
       decoding hard enough that the twelve second guard fired and the film
       arrived with no poster and no duration at all. Which is exactly what
       happened to the first real upload. */
    onProgress?.(0, 1, 'Reading the film…');
    const { poster, duration } = await posterFor(file);

    let begun;
    try {
      begun = await api.videoBegin(albumId, {
        size_bytes: file.size,
        filename: file.name,
        content_type: file.type || 'video/mp4',
      });
    } catch (err) {
      /* Direct upload needs object storage. Where it is not configured — a
         fresh install, or a deployment still on local disk — fall back to
         sending the file through our server. That path caps out at four
         gigabytes, which is the honest limit of what a single request can
         carry, but it means video is never simply broken. */
      if (/R2 storage/i.test(err.message || '')) {
        onProgress?.(1, 1, 'Uploading…');
        return api.uploadAlbumVideo(albumId, file, poster, duration, null);
      }
      throw err;
    }
    const { upload_id: uploadId, key } = begun;
    const partSize = begun.part_size || 64 * 1024 * 1024;
    const total = Math.max(1, Math.ceil(file.size / partSize));

    try {
      /* Four parts in flight at once. One at a time meant every part waited a
         full round trip to Cloudflare before the next began, so most of the
         upload was spent idle rather than sending — a film felt far slower than
         the connection could manage. Four is deliberate: enough to keep the
         link busy, few enough that a modest connection is not swamped and a
         retry still has room to breathe. */
      const CONCURRENCY = 4;
      let done = 0, next = 1, failed = null;

      const sendPart = async (n) => {
        const blob = file.slice((n - 1) * partSize, n * partSize);
        const { url } = await api.videoSign(albumId, { key, upload_id: uploadId, part_number: n });
        /* Three attempts per part. A part is the unit of failure here, so a
           blip costs one retry of sixty-four megabytes rather than the film. */
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const r = await fetch(url, { method: 'PUT', body: blob });
            if (!r.ok) throw new Error('Part ' + n + ' rejected (' + r.status + ')');
            return;
          } catch (err) {
            lastErr = err;
            /* A background tab clamps setTimeout to about once a minute, so a
               one-second backoff can become a sixty-second stall. Kept short
               deliberately — the delay is only there to let a blip pass. */
            await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
          }
        }
        throw lastErr || new Error('Part ' + n + ' failed');
      };

      const worker = async () => {
        while (!failed) {
          const n = next++;
          if (n > total) return;
          try { await sendPart(n); } catch (e) { failed = e; return; }
          onProgress?.(++done, total);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
      if (failed) throw failed;
      onProgress?.(total, total, 'Assembling…');

      onProgress?.(1, 1, 'Finishing…');
      return await api.videoComplete(albumId, {
        key, upload_id: uploadId, filename: file.name, duration_s: duration,
      }, poster);
    } catch (err) {
      // leave nothing half-uploaded to sit in the bucket costing storage
      api.videoAbort(albumId, { key, upload_id: uploadId }).catch(() => {});
      throw err;
    }
  }

  async function onVideos(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      const label = files.length > 1 ? `${i + 1}/${files.length} ` : '';
      setVidBusy(label + 'Starting…');
      try {
        await uploadOneFilm(files[i], (n, total, note) => {
          /* A film takes minutes, so silence reads as a hang. Show the stage
             while there is no percentage to show, and the percentage once
             there is. */
          setVidBusy(note ? label + note : label + Math.round((n / total) * 100) + '%');
        });
        ok++;
        setProg(`✅ ${files[i].name} uploaded`);
      } catch (err) {
        setVidBusy('');
        // the same channel the photo upload already reports through, so a
        // vendor is not hunting two places for the same kind of news
        setProg('⚠️ ' + files[i].name + ' — ' + err.message);
        break;
      }
    }
    setVidBusy('');
    if (ok) {
      setProg(`✅ ${ok} video${ok > 1 ? 's' : ''} uploaded`);
      setTimeout(() => setProg(''), 4000);
      api.uploadsDone(albumId).catch(() => {});   // films end a batch too
      // the films are in the Videos folder, so that is where to look
      api.album(albumId).then(d => {
        setAlbum(d.album); setPhotos(d.photos || []); setEvents(d.events || []);
        const vids = (d.events || []).find(e => e.name === 'Videos');
        if (vids) setActiveEvent(vids.id);
      }).catch(() => {});
    }
  }

  function onFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    startUpload(files);
  }
  // drag-and-drop onto the big upload zone
  /* Declared here rather than beside the other view helpers further down:
     onDrop reads it, and a const is unusable until its own line has run — so a
     drop would have thrown instead of uploading. */
  const inVideos = events.find(e => String(e.id) === String(activeEvent))?.name === 'Videos';

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    /* The drop zone belongs to whichever folder it is standing in. Dropping a
       film onto the Videos folder used to be silently ignored — startUpload
       keeps only images — which looked like the upload had failed. */
    if (inVideos) onVideos({ target: { files: e.dataTransfer.files, value: '' } });
    else startUpload(e.dataTransfer.files);
  }
  function onDragOver(e) { e.preventDefault(); if (!dragOver) setDragOver(true); }
  function onDragLeave(e) { e.preventDefault(); setDragOver(false); }
  function startUpload(fileArr) {
    /* JPEGs as always; with the Raw Selector, camera RAWs too — after the
       photos, so the instant previews (JPEGs only) line up with the progress */
    const images = [...fileArr].filter(f => f.type.startsWith('image/') && !RAW_FILE.test(f.name));
    const raws = raw ? [...fileArr].filter(f => RAW_FILE.test(f.name)) : [];
    const files = [...images, ...raws];
    if (!files.length) return;
    // in per-client mode uploads go into the active event (must pick one first)
    const eventId = isPerClient && activeEvent !== 'all' ? activeEvent : null;
    if (isPerClient && !eventId) { setProg('⚠️ Pick an event tab first to upload into it'); setTimeout(() => setProg(''), 2500); return; }
    const total = files.length;

    // 📸 instant previews: show the first 50 picked photos right away (dimmed + spinner).
    // Capped at 50 so huge batches (1000s of photos) don't fill browser memory with previews.
    const PREVIEW_CAP = 50;
    const previews = images.slice(0, PREVIEW_CAP).map((f, idx) => ({
      uid: `${Date.now()}_${idx}_${f.name}`,
      url: URL.createObjectURL(f),
      eventId: eventId ? String(eventId) : null,
    }));
    setPending(previews);
    /* "Uploading 18 / 80" read as though eighteen were in flight, when in fact
       eighteen had already landed. The number is a count of what is DONE, so it
       says so. */
    setUploading(true); setProg(`0 of ${total} photos uploaded…`);

    // upload on a background thread so it keeps running when the tab is hidden
    if (workerRef.current) workerRef.current.terminate();
    const worker = new Worker(new URL('../../lib/uploadWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    const finish = () => {
      setUploading(false);
      // drop all previews (real photos have replaced them) and free their memory
      setPending(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
      reloadPhotos();
      /* This is the one place that knows the batch is over — the server only
         sees N separate requests and has to guess. Telling it saves the wait.
         Failure is harmless: the server's own timer still fires. */
      api.uploadsDone(albumId).catch(() => {});
    };
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'progress') {
        setProg(`${m.done} of ${m.total} photos uploaded…`);
        // photos 0..done have landed as real thumbs — drop that many previews from the front
        setPending(() => {
          const consumed = previews.slice(0, m.done);
          consumed.forEach(p => URL.revokeObjectURL(p.url));
          return previews.slice(m.done);
        });
      } else if (m.type === 'chunk') {
        reloadPhotos();
      } else if (m.type === 'done') {
        setProg(`✅ ${m.count} uploaded`);
        finish();
        if (raws.length) loadRaw();
        setTimeout(() => setProg(''), 2500);
        worker.terminate(); workerRef.current = null;
      } else if (m.type === 'error') {
        setProg('⚠️ ' + m.message);
        finish();
        worker.terminate(); workerRef.current = null;
      }
    };
    worker.postMessage({ albumId, files, eventId, token });   // straight to R2, 6 at a time — see uploadWorker.js
  }
  async function delPhoto(pid) {
    if (!await dialog.confirm('This photo will be removed from the album.', { title: 'Delete photo?', okLabel: 'Delete' })) return;
    await api.deletePhoto(albumId, pid); load();
  }
  // event add/edit/delete now go through a styled in-app modal (evModal)
  function openAddEvent() { setEvModal({ type: 'add', ev: null, name: '' }); }
  function openEditEvent() { const ev = events.find(e => String(e.id) === String(activeEvent)); if (ev) setEvModal({ type: 'edit', ev, name: ev.name }); }
  function openDeleteEvent() { const ev = events.find(e => String(e.id) === String(activeEvent)); if (ev) setEvModal({ type: 'delete', ev, name: ev.name }); }

  async function commitEvent() {
    if (!evModal) return;
    const { type, ev, name } = evModal;
    const trimmed = (name || '').trim();
    if ((type === 'add' || type === 'edit') && !trimmed) return;
    setEvBusy(true);
    try {
      if (type === 'add') {
        const d = await api.addAlbumEvent(albumId, trimmed);
        setActiveEvent(d.event.id);
      } else if (type === 'edit') {
        if (trimmed !== ev.name) await api.renameAlbumEvent(albumId, ev.id, trimmed);
      } else if (type === 'delete') {
        await api.deleteAlbumEvent(albumId, ev.id);
        if (String(activeEvent) === String(ev.id)) setActiveEvent('all');
      }
      setEvModal(null);
      load();
    } catch (e) { dialog.alert(e.message, { error: true }); }
    finally { setEvBusy(false); }
  }

  if (!album) return <div className="loading">Loading…</div>;

  /* A photograph with no folder is shown in the FIRST folder rather than
     nowhere. The upload button is disabled until a folder is chosen, so this
     should never happen — but it did once, when a Videos folder appeared beside
     photographs uploaded before any folder existed, and the album then reported
     seven photographs while showing none. Somewhere wrong beats invisible. */
  /* Where a photograph with no folder is shown. The FIRST folder was wrong: on
     an album whose only remaining folder is Videos, deleting the photo folder
     tipped every photograph into it. A film folder is the one place a
     photograph must never appear. */
  const firstPhotoEvent = events.find(e => e.name !== 'Videos');
  const firstEventId = firstPhotoEvent ? String(firstPhotoEvent.id) : null;
  const shown = isPerClient && activeEvent !== 'all'
    ? photos.filter(p => String(p.event_id) === String(activeEvent)
        || (p.event_id == null && String(activeEvent) === firstEventId))
    : photos;
  const visible = shown.slice(0, visibleCount); // infinite-scroll window
  visibleLenRef.current = visible.length; // keep the keyboard handler's bound current
  // previews for the current event view (per-client shows only the active event's uploads)
  const pendingShown = (isPerClient && activeEvent !== 'all')
    ? pending.filter(p => p.eventId === String(activeEvent))
    : pending;
  /* 🎬 The Videos folder is a different kind of thing to an event.
     Favorites and Selection are about which photographs a couple wants
     printed; renaming or deleting the Videos folder would break the rule that
     it is always there and always last; and Upload to this event sends
     photographs, which have no business in it. All six are shown faded rather
     than hidden, so a vendor can see they exist and be told why they are off. */
  const onlyPhotos = inVideos ? 'Only for photos — you are in the Videos folder' : undefined;

  /* The label is left alone in the Videos folder. Fading the button and saying
     why on hover was what was asked for; rewriting what it says was not. */
  const uploadLabel = uploading ? '⏳ Uploading…'
    : isPerClient ? (activeEvent === 'all' ? '📤 Pick an event to upload' : '📤 Upload to this event')
    : '📤 Upload photos';

  return (
    <>
      <div className="ad-head">
        <div>
          <button className="refresh ad-back" onClick={onBack}>← Back</button>
          <h2 className="ad-title">🖼️ {album.title}</h2>
          {/* Films counted apart. "1 photos" for an album holding one film and
              no photographs at all was simply wrong. */}
          <div className="ad-count">
            {photos.filter(p => p.kind !== 'video').length} photos
            {photos.some(p => p.kind === 'video') && ` · ${photos.filter(p => p.kind === 'video').length} videos`}
            {isPerClient ? ` · ${events.length} events` : ''}
          </div>
        </div>
        <div className="ad-head-actions">
          <button className="refresh ad-ev-btn" onClick={openFavorites} disabled={inVideos}
            title={onlyPhotos || 'See which photos clients marked as favorites'}>⭐ Favorites</button>
          <button className="refresh ad-ev-btn" onClick={openSelection} disabled={inVideos}
            title={onlyPhotos || 'See the photo selection the client sent you'}>📩 Selection</button>
          {isPerClient && (
            <div className="ad-ev-actions">
              {/* Not faded in the Videos folder: adding a photo folder is the
                  one thing a vendor standing there is most likely to want. */}
              <button className="refresh ad-ev-btn" onClick={openAddEvent}
                title="Add a photos folder">➕ Add Photos Folder</button>
              <button className="refresh ad-ev-btn" onClick={openEditEvent} disabled={activeEvent === 'all' || inVideos}
                title={onlyPhotos || 'Rename the selected event'}>✏️ Rename</button>
              <button className="refresh ad-ev-btn ad-ev-btn-del" onClick={openDeleteEvent} disabled={activeEvent === 'all' || inVideos}
                title={onlyPhotos || 'Delete the selected event'}>🗑️ Delete</button>
            </div>
          )}
          <label className={`refresh ad-upload ${(isPerClient && activeEvent === 'all') || inVideos ? 'ad-upload-off' : ''}`}
            title={onlyPhotos || undefined}>
            {uploadLabel}
            <input type="file" accept={raw ? `image/*,${RAW_ACCEPT}` : 'image/*'} multiple hidden onChange={onFiles} disabled={uploading || inVideos || (isPerClient && activeEvent === 'all')} />
          </label>
          {/* Films go to their own Videos folder wherever you are, so unlike
              photographs this is never disabled by which tab is open. */}
          <label className="refresh ad-upload ad-upload-vid">
            {vidLabel}
            <input type="file" accept="video/*" multiple hidden onChange={onVideos} disabled={uploading || !!vidBusy} />
          </label>
          {/* 🎞️ RAWs behind this album's JPEGs — only with the Raw Selector */}
          {raw && raw.raws > 0 && (
            <span className="ad-raw" title={raw.rawsWithoutJpeg.length ? `Waiting for their JPEG: ${raw.rawsWithoutJpeg.slice(0, 8).map(r => r.filename).join(', ')}` : 'Every RAW has its JPEG'}>
              🎞️ RAW {raw.paired} / {raw.jpegs}
              {raw.rawsWithoutJpeg.length > 0 && <span className="ad-raw-warn"> · {raw.rawsWithoutJpeg.length} without JPEG</span>}
              <button type="button" className="ad-raw-del" aria-label="Delete this album's RAW files"
                onClick={async () => {
                  if (!await dialog.confirm(`Delete all ${raw.raws} RAW files of this album? The JPEGs stay. This cannot be undone.`, { title: 'Delete RAW files?', okLabel: 'Delete RAWs', danger: true })) return;
                  await api.rawselDeleteAll(albumId).catch(() => {});
                  loadRaw();
                }}>🗑️</button>
            </span>
          )}
        </div>
      </div>

      {isPerClient && (
        <div className="ad-events">
          {events.map(ev => {
            /* Counted the same way the grid filters, so the number on the tab
               and the number of tiles behind it cannot disagree — including a
               photograph with no folder, which lands in the first one. */
            const n = photos.filter(p => String(p.event_id) === String(ev.id)
              || (p.event_id == null && String(ev.id) === firstEventId)).length;
            return (
              <button key={ev.id} className={`pg-ev ${String(activeEvent) === String(ev.id) ? 'on' : ''}`} onClick={() => setActiveEvent(ev.id)}>
                <span>{ev.name}</span>
                <span className="pg-ev-count">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {isPerClient && evModal && (
        <div className="al-overlay" onClick={() => !evBusy && setEvModal(null)}>
          <div className="gal-set-modal ev-modal" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">
                {evModal.type === 'add' ? '➕ New event' : evModal.type === 'edit' ? '✏️ Rename event' : '🗑️ Delete event'}
              </h3>
              <button className="al-x" onClick={() => !evBusy && setEvModal(null)}>✕</button>
            </div>

            {evModal.type === 'delete' ? (
              <p className="ev-modal-text">
                Delete <strong>“{evModal.ev.name}”</strong>
                {(() => {
                  const n = photos.filter(p => String(p.event_id) === String(evModal.ev.id)).length;
                  return n
                    ? <> and the <strong>{n} photo{n > 1 ? 's' : ''}</strong> in it? This cannot be undone.</>
                    : <>? It is empty.</>;
                })()}
              </p>
            ) : (
              <>
                <label className="lbl">Event name</label>
                <input
                  className="gal-input" autoFocus value={evModal.name}
                  onChange={e => setEvModal(m => ({ ...m, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && commitEvent()}
                  placeholder="e.g. Wedding, Reception, Mehndi"
                />
              </>
            )}

            <div className="ev-modal-foot">
              <button className="refresh ev-modal-cancel" onClick={() => setEvModal(null)} disabled={evBusy}>Cancel</button>
              <button
                className={`refresh ev-modal-ok ${evModal.type === 'delete' ? 'ev-modal-danger' : ''}`}
                onClick={commitEvent} disabled={evBusy}
              >
                {evBusy ? '…' : evModal.type === 'add' ? 'Add event' : evModal.type === 'edit' ? 'Save' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {favModal && (
        <div className="al-overlay" onClick={() => setFavModal(false)}>
          <div className="gal-set-modal ad-fav-modal" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">⭐ Client favorites</h3>
              <button className="al-x" onClick={() => setFavModal(false)}>✕</button>
            </div>

            {favBusy ? (
              <div className="ad-fav-empty">Loading favorites…</div>
            ) : !favData || favData.total === 0 ? (
              <div className="ad-fav-empty">No favorites yet. When clients ⭐ photos in the gallery, their picks show up here — grouped by event, then by the email they used.</div>
            ) : (
              <div>
                <div className="ad-fav-total">{favData.total} favorite{favData.total === 1 ? '' : 's'} across {favData.events.length} event{favData.events.length === 1 ? '' : 's'}</div>
                {favData.events.map(ev => (
                  <div key={ev.event_id ?? 'none'} className="ad-fav-event">
                    <div className="ad-fav-event-head">
                      <span className="ad-fav-event-name">🗂️ {ev.event_name}</span>
                      <span className="ad-fav-count">{ev.count} photo{ev.count === 1 ? '' : 's'}</span>
                    </div>
                    {ev.lists.map(list => (
                      <div key={list.email} className="ad-fav-group">
                        <div className="ad-fav-group-head">
                          <span className="ad-fav-email">{list.email}</span>
                          <span className="ad-fav-count">{list.count} photo{list.count === 1 ? '' : 's'}</span>
                        </div>
                        <div className="ad-fav-grid">
                          {list.photos.map(ph => (
                            <div key={ph.photo_id} className="ad-fav-thumb" title={ph.filename}>
                              <img src={`${api.fileUrl(ph.photo_id, 'thumb')}?token=${token}`} loading="lazy" alt="" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selModal && (
        <div className="al-overlay" onClick={() => setSelModal(false)}>
          <div className="gal-set-modal ad-fav-modal" onClick={e => e.stopPropagation()}>
            <div className="al-head">
              <h3 className="al-title">📩 Client's selection</h3>
              <button className="al-x" onClick={() => setSelModal(false)}>✕</button>
            </div>
            {selBusy ? (
              <div className="ad-fav-empty">Loading selection…</div>
            ) : !selData || selData.total === 0 ? (
              <div className="ad-fav-empty">Nothing sent yet. When the client logs in with the admin password, picks photos with the ✓ tool, and clicks “Send to studio”, their final selection appears here — grouped by event.</div>
            ) : (
              <div>
                <div className="ad-sel-bar">
                  <div className="ad-fav-total">
                    {selData.total} photo{selData.total === 1 ? '' : 's'} selected across {selData.events.length} event{selData.events.length === 1 ? '' : 's'}
                    {selData.sent_at && <span className="ad-sel-when"> · sent {fmtDateTime(selData.sent_at)}</span>}
                    {selData.completed_at && <span className="ad-sel-done">✓ Completed</span>}
                  </div>
                  <div className="ad-sel-acts">
                    <button className="refresh ad-ev-btn" onClick={copySelectionNames} title="Copy all selected file names">
                      {copiedNames ? '✓ Copied' : '📋 Copy names'}
                    </button>
                    <a className="refresh ad-ev-btn" href={`/api/albums/${albumId}/selection.zip?token=${token}`} title="Download the selected photos as a Zip file">⬇️ Download Zip</a>
                    <button className={`refresh ad-ev-btn ${selData.completed_at ? 'ad-btn-done' : ''}`} onClick={toggleSelectionComplete} disabled={selActBusy}
                      title={selData.completed_at ? 'Mark as not completed' : 'Mark this selection as handled'}>
                      {selData.completed_at ? '↩️ Mark not done' : '✅ Mark completed'}
                    </button>
                    <button className="refresh ad-ev-btn ad-btn-danger" onClick={() => setSelClearAsk(true)} disabled={selActBusy}
                      title="Clear this selection and note — your photos are not deleted">🗑️ Delete selection</button>
                  </div>
                </div>

                {selClearAsk && (
                  <div className="ad-sel-confirm">
                    <span>Clear this selection and the client's note? Your photos will <b>not</b> be deleted.</span>
                    <span className="ad-sel-confirm-acts">
                      <button className="refresh ad-ev-btn ad-btn-danger" onClick={clearSelection} disabled={selActBusy}>
                        {selActBusy ? 'Clearing…' : 'Yes, clear it'}
                      </button>
                      <button className="refresh ad-ev-btn" onClick={() => setSelClearAsk(false)} disabled={selActBusy}>Cancel</button>
                    </span>
                  </div>
                )}

                {selData.note && (
                  <div className="ad-sel-note">
                    <div className="ad-sel-note-h">📝 Client's note</div>
                    <p className="ad-sel-note-b">{selData.note}</p>
                  </div>
                )}

                {selData.events.map(ev => (
                  <div key={ev.event_id ?? 'none'} className="ad-fav-event">
                    <div className="ad-fav-event-head">
                      <span className="ad-fav-event-name">🗂️ {ev.event_name}</span>
                      <span className="ad-fav-count">{ev.count} photo{ev.count === 1 ? '' : 's'}</span>
                    </div>
                    <div className="ad-sel-grid">
                      {ev.photos.map(ph => (
                        <figure key={ph.photo_id} className="ad-sel-item">
                          <img src={`${api.fileUrl(ph.photo_id, 'thumb')}?token=${token}`} loading="lazy" alt="" />
                          <figcaption title={ph.filename}>{ph.filename}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {prog && <div className="ad-prog">{prog}</div>}

      {shown.length === 0 && pendingShown.length === 0 ? (
        (isPerClient && activeEvent === 'all' && events.length === 0) ? (
          <div className="table-wrap ad-empty">Click ➕ Add up top to create an event, then upload photos into it 📤</div>
        ) : (
          <div
            className={`ad-dropzone ${dragOver ? 'is-drag' : ''} ${uploading || (isPerClient && activeEvent === 'all') ? 'is-off' : ''}`}
            onClick={() => {
              if (uploading || vidBusy || (isPerClient && activeEvent === 'all')) return;
              (inVideos ? dropVidInputRef : dropInputRef).current?.click();
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            {/* Two inputs, and the folder decides which one the zone opens.
                An empty Videos folder used to offer to choose PHOTOS, which is
                the one thing that cannot go in it. */}
            <input ref={dropInputRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
            <input ref={dropVidInputRef} type="file" accept="video/*" multiple hidden onChange={onVideos} />
            <div className="ad-dropzone-inner">
              <div className="ad-dropzone-ico">{inVideos ? '🎬' : '📤'}</div>
              <div className="ad-dropzone-title">
                {isPerClient && activeEvent === 'all' ? 'Pick an event above to upload'
                  : inVideos
                    ? (dragOver ? 'Drop videos to upload' : 'Click to choose videos, or drag & drop them here')
                    : (dragOver ? 'Drop photos to upload' : 'Click to choose photos, or drag & drop them here')}
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="ad-grid">
          {visible.map((p, idx) => p.ready === false ? (
            /* ⏳ Safe in R2, screen sizes still being made in the background —
               a spinner tile rather than a broken image. The grid re-reads
               itself every few seconds until none are left. */
            <div key={p.id} className="ad-photo is-uploading" title={`${p.filename} — preparing`}>
              <span className="ad-photo-spin" />
              <span className="ad-photo-name">{(p.filename || '').replace(/\.[^.]+$/, '')}</span>
            </div>
          ) : (
            <div key={p.id} className={`ad-photo ${p.kind === 'video' ? 'is-video' : ''}`} title={p.filename}>
              {/* A film with no poster has no thumbnail to fetch, so asking for
                  one gives a broken tile. Hide the image and let the play badge
                  sit on a plain card instead. */}
              <img className="ad-photo-img" src={`${api.fileUrl(p.id, 'thumb')}?token=${token}`}
                loading="lazy" onClick={() => setLightbox(idx)}
                onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
              {p.kind === 'video' && (
                <span className="ad-vid-badge" onClick={() => setLightbox(idx)}>
                  <span className="ad-vid-play">▶</span>
                  {p.duration_s ? <span className="ad-vid-time">{fmtDur(p.duration_s)}</span> : null}
                </span>
              )}
              {p.is_selected && <span className="ad-picked">✅ Picked</span>}
              <button className="ad-photo-del" onClick={() => delPhoto(p.id)}>🗑️</button>
              <span className="ad-photo-name">{(p.filename || '').replace(/\.[^.]+$/, '')}</span>
            </div>
          ))}
          {pendingShown.map(p => (
            <div key={p.uid} className="ad-photo is-uploading">
              <img src={p.url} />
              <span className="ad-photo-spin" />
            </div>
          ))}
        </div>
      )}
      {visible.length < shown.length && <div ref={sentinelRef} className="ad-grid-sentinel">Loading more…</div>}

      {lightbox !== null && visible[lightbox] && (
        <div className="ad-lb" onClick={() => setLightbox(null)}>
          <button className="ad-lb-close" onClick={() => setLightbox(null)}>✕</button>
          {lightbox > 0 && (
            <button className="ad-lb-nav prev" onClick={e => { e.stopPropagation(); setLightbox(i => i - 1); }}>‹</button>
          )}
          {visible[lightbox].kind === 'video' ? (
            /* The panel showed a film as an <img> pointed at its poster, which
               meant a vendor could never watch what they had just uploaded —
               and with no poster it was simply a broken image. */
            <video
              key={visible[lightbox].id}
              className="ad-lb-video"
              src={`${api.fileUrl(visible[lightbox].id, 'orig')}?token=${token}`}
              poster={`${api.fileUrl(visible[lightbox].id, 'preview')}?token=${token}`}
              controls autoPlay playsInline preload="metadata"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <img
              className="ad-lb-img"
              src={`${api.fileUrl(visible[lightbox].id, 'preview')}?token=${token}`}
              alt={visible[lightbox].filename || ''}
              onClick={e => e.stopPropagation()}
            />
          )}
          {lightbox < visible.length - 1 && (
            <button className="ad-lb-nav next" onClick={e => { e.stopPropagation(); setLightbox(i => i + 1); }}>›</button>
          )}
          <span className="ad-lb-name">{(visible[lightbox].filename || '').replace(/\.[^.]+$/, '')}</span>
        </div>
      )}
    </>
  );
}
