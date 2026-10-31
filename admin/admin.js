(() => {
  const $ = id => document.getElementById(id);
  const db = supabase.createClient(window.CROSS_SMASH_DB.url, window.CROSS_SMASH_DB.key);
  const BUCKET = 'media';
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MAX_BATCH = 20;

  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    });
    node.append(...kids.filter(k => k !== null && k !== undefined));
    return node;
  }

  let toastTimer = 0;
  function toast(message, bad = false) {
    const t = $('toast');
    t.textContent = message;
    t.className = bad ? 'toast bad' : 'toast';
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 7000 : 3000);
  }

  const showTime = iso => new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  const clock = h => { const v = h % 24; return `${v % 12 || 12} ${v < 12 ? 'AM' : 'PM'}`; };

  // datetime-local inputs have no time zone, so times are entered and shown as Manila time.
  const toInput = iso => iso ? new Date(new Date(iso).getTime() + 8 * 3600000).toISOString().slice(0, 16) : '';
  const fromInput = value => value ? new Date(value + ':00+08:00').toISOString() : null;

  /* ---------- Images are resized in the browser so uploads stay small ---------- */
  async function shrink(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = el('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('This image could not be read.'))), 'image/jpeg', .85));
  }

  async function uploadImage(file, folder) {
    const path = `${folder}/${crypto.randomUUID()}.jpg`;
    const { error } = await db.storage.from(BUCKET).upload(path, await shrink(file), { contentType: 'image/jpeg' });
    if (error) throw error;
    return { path, url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
  }
  const removeImage = path => (path ? db.storage.from(BUCKET).remove([path]) : null);

  /* ---------- Form fields ---------- */
  function buildField(f, row) {
    const id = 'f-' + f.key;
    const value = row ? row[f.key] : f.default;
    const wrap = (control, hint) => el('div', { class: 'field' }, el('label', { htmlFor: id, textContent: f.label + (f.required ? ' *' : '') }), control, hint ? el('small', { textContent: hint }) : null);

    if (f.type === 'check') {
      return el('label', { class: 'check' }, el('input', { id, type: 'checkbox', checked: value ?? true }), f.label);
    }
    if (f.type === 'days') {
      const on = value ?? [0, 1, 2, 3, 4, 5, 6];
      return el('div', { class: 'field' }, el('span', { class: 'label', textContent: f.label }), el('div', { class: 'days' },
        ...WEEK.map((name, i) => el('label', {}, el('input', { id: `${id}-${i}`, type: 'checkbox', checked: on.includes(i) }), name))));
    }
    if (f.type === 'hour') {
      const shown = value === undefined || value === null ? '' : value % 24;
      return wrap(el('select', { id, required: true }, ...Array.from({ length: 24 }, (_, h) => el('option', { value: h, textContent: clock(h), selected: h === shown }))), f.hint);
    }
    if (f.type === 'image') {
      const previews = el('div', { class: 'previews' }, row?.image_url ? el('img', { class: 'preview', alt: '', src: row.image_url }) : null);
      const many = Boolean(f.multiple && !row);
      const input = el('input', {
        id, type: 'file', accept: 'image/jpeg,image/png,image/webp', required: Boolean(f.required && !row), multiple: many,
        onchange: () => {
          if (!input.files.length) return;
          previews.replaceChildren(...[...input.files].map(file => el('img', { class: 'preview', alt: '', src: URL.createObjectURL(file) })));
        }
      });
      const label = (row && f.editLabel) || f.label;
      return el('div', { class: 'field' }, el('label', { htmlFor: id, textContent: label + (f.required && !row ? ' *' : '') }), previews, input, many && f.hint ? el('small', { textContent: f.hint }) : null);
    }
    if (f.type === 'textarea') {
      return wrap(el('textarea', { id, value: value ?? '', required: Boolean(f.required) }), f.hint);
    }
    const shownValue = f.type === 'datetime-local' ? toInput(value) : value ?? '';
    const input = el('input', { id, type: f.type || 'text', value: shownValue, required: Boolean(f.required), min: f.type === 'number' ? 0 : '', autocomplete: f.list ? 'off' : '' });
    if (f.list) input.setAttribute('list', f.list);
    return wrap(input, row && f.newOnly ? null : f.hint);
  }

  function readFields(fields) {
    const out = {};
    fields.forEach(f => {
      const id = 'f-' + f.key;
      if (f.type === 'image') return;
      if (f.type === 'check') out[f.key] = $(id).checked;
      else if (f.type === 'days') out[f.key] = WEEK.map((_, i) => i).filter(i => $(`${id}-${i}`).checked);
      else if (f.type === 'number' || f.type === 'hour') out[f.key] = Number($(id).value);
      else if (f.type === 'datetime-local') out[f.key] = fromInput($(id).value);
      else out[f.key] = $(id).value.trim() || null;
    });
    return out;
  }

  /* ---------- Sections ---------- */
  const SECTIONS = {
    events: {
      label: 'Events', table: 'events', folder: 'events', order: ['starts_at', true], one: 'event',
      hint: 'Upcoming published events appear on the website and disappear after they end.',
      title: r => r.title,
      detail: r => showTime(r.starts_at),
      badge: r => (r.published ? '' : 'Draft'),
      thumb: true,
      fields: [
        { key: 'title', label: 'Event name', required: true },
        { key: 'starts_at', label: 'Starts (Manila time)', type: 'datetime-local', required: true },
        { key: 'ends_at', label: 'Ends (Manila time)', type: 'datetime-local' },
        { key: 'description', label: 'Details', type: 'textarea' },
        { key: 'link_url', label: 'Registration link', type: 'url', hint: 'Must start with https://' },
        { key: 'image', label: 'Poster or photo', type: 'image' },
        { key: 'published', label: 'Show on website', type: 'check' }
      ],
      check: v => (v.ends_at && v.ends_at < v.starts_at ? 'The end time must be after the start time.' : '')
    },
    announcements: {
      label: 'Announcements', table: 'announcements', order: ['created_at', false], one: 'announcement',
      hint: 'Published announcements appear in the bar at the top of the website.',
      title: r => r.title,
      detail: r => (r.expires_at ? 'Until ' + showTime(r.expires_at) : 'No end date'),
      badge: r => (r.published ? '' : 'Draft'),
      fields: [
        { key: 'title', label: 'Headline', required: true },
        { key: 'body', label: 'Details', type: 'textarea' },
        { key: 'expires_at', label: 'Remove from website on (Manila time)', type: 'datetime-local' },
        { key: 'published', label: 'Show on website', type: 'check' }
      ]
    },
    photos: {
      label: 'Photos', table: 'photos', folder: 'gallery', order: ['created_at', false], one: 'photo', groupBy: 'album',
      hint: 'Photos appear on the website grouped by album.',
      title: r => r.caption || 'Untitled photo',
      detail: r => 'Added ' + showTime(r.created_at),
      thumb: true,
      fields: [
        { key: 'album', label: 'Album', required: true, list: 'albumNames', hint: 'Choose an existing album or type a new name.' },
        { key: 'image', label: 'Photos', editLabel: 'Replace photo', type: 'image', required: true, multiple: true, hint: `Choose up to ${MAX_BATCH} JPG, PNG or WebP photos. Large photos are resized automatically.` },
        { key: 'caption', label: 'Caption', hint: 'Used for every photo in this upload.', newOnly: true }
      ]
    },
    sessions: {
      label: 'Open play', table: 'sessions', order: ['start_hour', true], one: 'session',
      hint: 'This schedule repeats every week. Choosing an end time earlier than the start means it ends the next morning.',
      title: r => `${r.name}, ₱${r.price}`,
      detail: r => `${clock(r.start_hour)} to ${clock(r.end_hour)}, ${r.days.length === 7 ? 'daily' : r.days.map(d => WEEK[d]).join(', ')}`,
      fields: [
        { key: 'name', label: 'Session name', required: true },
        { key: 'start_hour', label: 'Start time', type: 'hour', default: 8 },
        { key: 'end_hour', label: 'End time', type: 'hour', default: 13 },
        { key: 'price', label: 'Price per player (₱)', type: 'number', required: true },
        { key: 'days', label: 'Days', type: 'days' },
        { key: 'is_special', label: 'Special session, left out of the live countdown', type: 'check', default: false }
      ],
      before: v => { if (v.end_hour <= v.start_hour) v.end_hour += 24; },
      check: v => (v.days.length ? '' : 'Choose at least one day.')
    },
    details: { label: 'Rates & details', single: true }
  };
  const DETAIL_FIELDS = [
    { key: 'pickleball_rate', label: 'Pickleball court, per hour (₱)', type: 'number', required: true },
    { key: 'badminton_rate', label: 'Badminton court, per hour (₱)', type: 'number', required: true },
    { key: 'paddle_rate', label: 'Paddle rental (₱)', type: 'number', required: true },
    { key: 'racket_rate', label: 'Racket rental (₱)', type: 'number', required: true },
    { key: 'machine_rate', label: 'Ball machine, per hour (₱)', type: 'number', required: true },
    { key: 'phone', label: 'Phone number' },
    { key: 'facebook_url', label: 'Facebook page link', type: 'url' },
    { key: 'address', label: 'Address', type: 'textarea' },
    { key: 'hours_note', label: 'Opening hours', hint: 'Shown in the Find Us section. Example: Open daily, 8 AM to 11 PM' }
  ];

  let active = 'events';

  function drawTabs() {
    $('tabs').replaceChildren(...Object.entries(SECTIONS).map(([key, s]) =>
      el('button', { type: 'button', textContent: s.label, 'aria-current': key === active, onclick: () => { active = key; drawTabs(); drawPanel(); } })));
  }

  const drawPanel = () => (SECTIONS[active].single ? drawDetails() : drawList());

  async function drawDetails() {
    $('panel').replaceChildren(el('p', { textContent: 'Loading…' }));
    const { data, error } = await db.from('site_settings').select('*').eq('id', 1).maybeSingle();
    if (error) { toast('Could not load details: ' + error.message, true); return; }
    const save = el('button', { type: 'submit', class: 'primary', textContent: 'Save changes' });
    const form = el('form', {
      class: 'editor settings',
      onsubmit: async e => {
        e.preventDefault();
        save.disabled = true;
        const res = await db.from('site_settings').upsert({ id: 1, ...readFields(DETAIL_FIELDS) });
        save.disabled = false;
        if (res.error) toast('Could not save: ' + res.error.message, true);
        else toast('Saved. The website is updated.');
      }
    }, ...DETAIL_FIELDS.map(f => buildField(f, data)), el('div', { class: 'form-tools' }, save));
    $('panel').replaceChildren(el('h2', { textContent: 'Rates & details' }), form);
  }

  async function drawList(editing = null) {
    const s = SECTIONS[active];
    const key = active;
    const { data, error } = await db.from(s.table).select('*').order(s.order[0], { ascending: s.order[1] });
    if (key !== active) return;
    if (error) { $('panel').replaceChildren(el('p', { class: 'error', textContent: 'Could not load this section: ' + error.message })); return; }

    const card = row => {
        const del = el('button', {
          type: 'button', class: 'danger', textContent: 'Delete',
          onclick: async () => {
            if (!del.classList.contains('armed')) {
              del.classList.add('armed');
              del.textContent = 'Confirm delete';
              setTimeout(() => { del.classList.remove('armed'); del.textContent = 'Delete'; }, 4000);
              return;
            }
            del.disabled = true;
            const res = await db.from(s.table).delete().eq('id', row.id);
            if (res.error) { del.disabled = false; toast('Could not delete: ' + res.error.message, true); return; }
            await removeImage(row.image_path);
            toast('Deleted.');
            drawList();
          }
        });
        const badge = s.badge && s.badge(row);
        return el('article', { class: 'item' },
          el('img', { class: 'thumb', alt: '', src: row.image_url || '../images/logo.jpg', loading: 'lazy' }),
          el('div', {}, el('h3', { textContent: s.title(row) }), el('p', { textContent: s.detail(row) }), badge ? el('span', { class: 'pill', textContent: badge }) : null),
          el('div', { class: 'item-tools' }, el('button', { type: 'button', textContent: 'Edit', onclick: () => drawList(row) }), del));
    };

    let items = data.map(card);
    const groups = new Map();
    if (s.groupBy) {
      data.forEach(row => {
        const name = row[s.groupBy];
        groups.set(name, [...(groups.get(name) || []), row]);
      });
      items = [...groups].map(([name, rows]) => buildGroup(s, name, rows, card));
    }
    if (!data.length) items = [el('p', { class: 'empty', textContent: `No ${s.label.toLowerCase()} yet. Add the first one with the form.` })];

    const names = s.groupBy
      ? el('datalist', { id: 'albumNames' }, ...[...groups.keys()].filter(Boolean).map(name => el('option', { value: name })))
      : null;
    $('panel').replaceChildren(
      el('div', { class: 'panel-head' }, el('h2', { textContent: s.label })),
      el('p', { class: 'hint', textContent: s.hint }),
      el('div', { class: 'split' }, el('div', { class: 'items' }, ...items), buildEditor(s, editing)),
      ...(names ? [names] : []));
  }

  function buildGroup(s, name, rows, card) {
    const scoped = query => (name === null ? query.is(s.groupBy, null) : query.eq(s.groupBy, name));
    const title = el('h3', { textContent: name ?? 'No album' }, el('span', { textContent: rows.length === 1 ? '1 photo' : `${rows.length} photos` }));
    const head = el('div', { class: 'album-head' });

    const del = el('button', {
      type: 'button', class: 'danger', textContent: 'Delete album',
      onclick: async () => {
        if (!del.classList.contains('armed')) {
          del.classList.add('armed');
          del.textContent = `Confirm: delete ${rows.length}`;
          setTimeout(() => { del.classList.remove('armed'); del.textContent = 'Delete album'; }, 4000);
          return;
        }
        del.disabled = true;
        const res = await scoped(db.from(s.table).delete());
        if (res.error) { del.disabled = false; toast('Could not delete: ' + res.error.message, true); return; }
        await db.storage.from(BUCKET).remove(rows.map(r => r.image_path));
        toast('Album deleted.');
        drawList();
      }
    });

    const showTitle = () => head.replaceChildren(title, el('button', { type: 'button', textContent: 'Rename', onclick: showRename }), del);
    function showRename() {
      const input = el('input', { value: name ?? '', 'aria-label': 'New album name', required: true });
      const form = el('form', {
        class: 'album-head',
        onsubmit: async e => {
          e.preventDefault();
          const next = input.value.trim();
          if (!next) return;
          const res = await scoped(db.from(s.table).update({ [s.groupBy]: next }));
          if (res.error) { toast('Could not rename: ' + res.error.message, true); return; }
          toast('Album renamed.');
          drawList();
        }
      }, input, el('button', { type: 'submit', class: 'primary', textContent: 'Save' }), el('button', { type: 'button', textContent: 'Cancel', onclick: showTitle }));
      head.replaceChildren(form);
      input.focus();
    }
    showTitle();
    return el('section', { class: 'album-group' }, head, ...rows.map(card));
  }

  // One failed photo should not cost the rest of the batch.
  async function addMany(s, values, files, save) {
    const failed = [];
    for (const [i, file] of files.entries()) {
      save.textContent = `Uploading ${i + 1} of ${files.length}…`;
      let added = null;
      try {
        added = await uploadImage(file, s.folder);
        const res = await db.from(s.table).insert({ ...values, image_url: added.url, image_path: added.path });
        if (res.error) throw res.error;
      } catch {
        if (added) await removeImage(added.path);
        failed.push(file.name);
      }
    }
    const saved = files.length - failed.length;
    if (failed.length) toast(`Added ${saved} of ${files.length} photos. Could not upload: ${failed.join(', ')}`, true);
    else toast(`Added ${saved} photos. The website is updated.`);
    drawList();
  }

  function buildEditor(s, row) {
    const save = el('button', { type: 'submit', class: 'primary', textContent: row ? 'Save changes' : `Add ${s.one}` });
    const form = el('form', {
      class: 'editor',
      onsubmit: async e => {
        e.preventDefault();
        const values = readFields(s.fields);
        s.before?.(values);
        const problem = s.check?.(values);
        if (problem) { toast(problem, true); return; }
        const files = s.fields.some(f => f.type === 'image') ? [...$('f-image').files] : [];
        const groupField = s.fields.find(f => f.key === s.groupBy);
        if (groupField) groupField.default = values[s.groupBy];
        if (files.length > MAX_BATCH) { toast(`Choose up to ${MAX_BATCH} photos at a time.`, true); return; }
        save.disabled = true;
        if (files.length > 1) { await addMany(s, values, files, save); return; }
        save.textContent = 'Saving…';
        let added = null;
        try {
          const file = files[0];
          if (file) {
            added = await uploadImage(file, s.folder);
            values.image_url = added.url;
            values.image_path = added.path;
          }
          const res = row
            ? await db.from(s.table).update(values).eq('id', row.id)
            : await db.from(s.table).insert(values);
          if (res.error) throw res.error;
          if (added && row?.image_path) await removeImage(row.image_path);
          toast('Saved. The website is updated.');
          drawList();
        } catch (err) {
          if (added) await removeImage(added.path);
          save.disabled = false;
          save.textContent = row ? 'Save changes' : `Add ${s.one}`;
          toast('Could not save: ' + err.message, true);
        }
      }
    }, el('h3', { textContent: row ? `Edit ${s.one}` : `New ${s.one}` }), ...s.fields.map(f => buildField(f, row)),
    el('div', { class: 'form-tools' }, save, row ? el('button', { type: 'button', textContent: 'Cancel', onclick: () => drawList() }) : null));
    return form;
  }

  /* ---------- Sign in ---------- */
  function showLogin(message = '') {
    $('appView').hidden = true;
    $('loginView').hidden = false;
    $('loginError').textContent = message;
    $('loginError').hidden = !message;
  }

  async function enter(user) {
    const { data, error } = await db.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (error || !data) {
      await db.auth.signOut();
      showLogin(error ? 'The admin database is not ready yet: ' + error.message : 'This account does not have admin access.');
      return;
    }
    $('who').textContent = user.email;
    $('loginView').hidden = true;
    $('appView').hidden = false;
    drawTabs();
    drawPanel();
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginBtn').disabled = true;
    $('loginError').hidden = true;
    const { data, error } = await db.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    $('loginBtn').disabled = false;
    if (error) { showLogin('Wrong email or password. Check both and try again.'); return; }
    $('password').value = '';
    enter(data.user);
  });

  $('signOut').addEventListener('click', async () => {
    await db.auth.signOut();
    showLogin();
  });

  db.auth.getSession().then(({ data }) => {
    if (data.session) enter(data.session.user);
    else showLogin();
  });
})();
