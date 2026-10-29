(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const charts = {};
  const CHANNELS = { telegram: 'Telegram', whatsapp: 'WhatsApp' };
  const STATES = {
    nuevo: { label: 'Nuevo', icon: '✨', color: '--state-nuevo' },
    interesado: { label: 'Interesado', icon: '🙂', color: '--state-interesado' },
    dudoso: { label: 'Dudoso', icon: '🤔', color: '--state-dudoso' },
    frustrado: { label: 'Frustrado', icon: '😠', color: '--state-frustrado' },
    lead_caliente: { label: 'Lead caliente', icon: '🔥', color: '--state-lead' },
  };
  const FILTERS = [
    ['todas', 'Todas'],
    ['atencion', 'Requieren atención'],
    ['lead_caliente', '🔥 Leads'],
    ['frustrado', '😠 Frustrados'],
    ['dudoso', '🤔 Dudosos'],
    ['human', 'Con operador'],
  ];
  const FLAG_LABELS = {
    inyeccion: 'intento de inyección',
    descuento_indebido: 'pide descuento indebido',
    pide_humano: 'pide humano',
    frustracion: 'frustración',
    respuesta_bloqueada: 'respuesta bloqueada',
    riesgo: 'POSIBLE RIESGO',
  };

  let inbox = [];
  let selected = null;
  let stateFilter = 'todas';
  let activeTab = 'inbox';

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = (n) => new Intl.NumberFormat('es-EC').format(n ?? 0);
  const fmtDate = (iso) => new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const fmtTime = (iso) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return new Intl.DateTimeFormat('es-EC', today ? { timeStyle: 'short' } : { day: '2-digit', month: 'short' }).format(d);
  };
  const debounce = (fn, ms) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children.flat()) {
      if (child != null && child !== false) node.append(child instanceof Node ? child : String(child));
    }
    return node;
  }

  function query() {
    const params = new URLSearchParams({ range: $('range').value });
    if ($('channel').value) params.set('channel', $('channel').value);
    return params.toString();
  }

  async function api(url, options) {
    const res = await fetch(url, options && { ...options, headers: { 'Content-Type': 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `${res.status} ${url}`);
    return body;
  }
  const post = (url, data) => api(url, { method: 'POST', body: JSON.stringify(data ?? {}) });

  const stateChip = (state) => {
    const s = STATES[state] || STATES.nuevo;
    return el('span', { class: 'state', style: `--state-color: var(${s.color})` }, `${s.icon} ${s.label}`);
  };
  const modeChip = (mode) => el('span', { class: `mode ${mode}` }, mode === 'human' ? 'Operador' : 'IA');
  const displayName = (c) => c.name || c.external_id.replace('@c.us', '');
  const needsAttention = (c) => c.mode === 'human' || c.state === 'frustrado' || c.state === 'lead_caliente';

  // ---------- Bandeja ----------

  function renderFilters() {
    $('state-filter').replaceChildren(
      ...FILTERS.map(([key, label]) =>
        el(
          'button',
          {
            type: 'button',
            'aria-pressed': String(stateFilter === key),
            onclick: () => {
              stateFilter = key;
              renderFilters();
              renderInbox();
            },
          },
          label,
        ),
      ),
    );
  }

  function filteredInbox() {
    const term = $('search').value.trim().toLowerCase();
    return inbox.filter((c) => {
      if (stateFilter === 'atencion' && !needsAttention(c)) return false;
      if (stateFilter === 'human' && c.mode !== 'human') return false;
      if (STATES[stateFilter] && c.state !== stateFilter) return false;
      if (term && !`${displayName(c)} ${c.last_message ?? ''} ${c.summary ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }

  function renderInbox(flashId) {
    const list = filteredInbox();
    const attention = inbox.filter((c) => c.mode === 'human' || c.state === 'frustrado').length;
    $('attention').hidden = !attention;
    $('attention').textContent = attention;
    document.title = attention ? `(${attention}) Panel CTT-FISEI` : 'Panel CTT-FISEI';

    if (!list.length) {
      $('conversation-list').replaceChildren(el('li', { class: 'muted' }, 'No hay conversaciones con este filtro.'));
      return;
    }
    $('conversation-list').replaceChildren(
      ...list.map((c) => {
        const s = STATES[c.state] || STATES.nuevo;
        const prefix = { user: '', operator: 'Operador: ', assistant: 'IA: ' }[c.last_role] ?? '';
        return el(
          'li',
          {},
          el(
            'button',
            {
              type: 'button',
              class: `conv${c.user_id === flashId ? ' flash' : ''}`,
              style: `--state-color: var(${s.color})`,
              'aria-current': String(c.user_id === selected),
              onclick: () => openConversation(c.user_id),
            },
            el('span', { class: 'row' }, el('span', { class: 'name' }, displayName(c)), el('time', { datetime: c.last_seen }, fmtTime(c.last_seen))),
            el('span', { class: 'preview' }, c.last_message ? prefix + c.last_message : 'Abrió el chat, aún sin mensajes'),
            el(
              'span',
              { class: 'row' },
              el('span', { class: 'tags' }, stateChip(c.state), modeChip(c.mode), el('span', { class: `badge ${c.channel}` }, CHANNELS[c.channel])),
              c.unread && c.user_id !== selected ? el('span', { class: 'unread', 'aria-label': `${c.unread} sin leer` }, c.unread) : null,
            ),
          ),
        );
      }),
    );
  }

  async function loadInbox(flashId) {
    inbox = await api(`/api/inbox?${query()}`);
    renderInbox(flashId);
  }
  const reloadInbox = debounce(loadInbox, 250);

  function messageNode(m) {
    if (m.role === 'system') return el('div', { class: 'msg system', 'data-id': m.id }, `— ${m.content} · ${fmtTime(m.created_at)} —`);
    const author = { user: null, assistant: 'IA', operator: 'Operador' }[m.role];
    const meta = [
      author,
      fmtDate(m.created_at),
      m.latency_ms ? `${(m.latency_ms / 1000).toFixed(1)} s` : null,
      m.error ? `error: ${m.error}` : null,
    ].filter(Boolean);
    return el(
      'div',
      { class: `msg ${m.role}${m.error ? ' error' : ''}`, 'data-id': m.id },
      m.content,
      el('small', {}, meta.join(' · '), ...(m.flags || []).map((f) => el('span', { class: 'flag' }, `⚠ ${FLAG_LABELS[f] || f}`))),
    );
  }

  function renderChatHead(c) {
    const profile = c.profile || {};
    const tags = [
      profile.tipo && profile.tipo.replace('_', ' '),
      profile.curso_interes,
      profile.meta,
    ].filter(Boolean);
    const take = c.mode === 'human'
      ? el('button', { type: 'button', class: 'btn-ai', onclick: () => setMode('ai') }, 'Devolver a la IA')
      : el('button', { type: 'button', class: 'btn-take', onclick: () => setMode('human') }, 'Tomar control');
    return el(
      'header',
      { class: `poster ${c.mode === 'human' ? 'human' : 'ai'}`, id: 'chat-head' },
      el(
        'div',
        { class: 'row' },
        el(
          'div',
          { style: 'min-width: 0' },
          el('h2', {}, displayName(c)),
          el('div', { class: 'pills' }, stateChip(c.state), modeChip(c.mode), el('span', { class: `badge ${c.channel}` }, CHANNELS[c.channel]), ...tags.map((t) => el('span', { class: 'pill' }, t))),
        ),
        take,
      ),
      c.mode === 'human' && c.handover_reason ? el('p', { class: 'handover' }, `IA en pausa: ${c.handover_reason}`) : null,
      el('p', { class: 'summary' }, el('strong', {}, 'Resumen: '), c.summary || 'Aún no hay suficiente conversación para resumir.'),
    );
  }

  async function openConversation(userId) {
    selected = userId;
    const { conversation, messages } = await api(`/api/conversations/${encodeURIComponent(userId)}`);
    const list = el('div', { class: 'messages', id: 'messages' }, messages.map(messageNode));
    const input = el('textarea', {
      id: 'composer-input',
      rows: 2,
      placeholder: 'Escribe como el bot… (Enter envía, Shift+Enter nueva línea)',
      'aria-label': 'Mensaje del operador',
      onkeydown: (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      },
    });
    $('chat').replaceChildren(
      renderChatHead(conversation),
      list,
      el('form', { class: 'composer', onsubmit: (e) => (e.preventDefault(), sendMessage()) }, input, el('button', { type: 'submit' }, 'Enviar')),
      el('p', { class: 'composer-hint' }, 'Al enviar, la IA se pausa y tu mensaje llega por el mismo bot.'),
    );
    list.scrollTop = list.scrollHeight;
    post(`/api/conversations/${encodeURIComponent(userId)}/read`).catch(() => {});
    const local = inbox.find((c) => c.user_id === userId);
    if (local) local.unread = 0;
    renderInbox();
  }

  function appendMessage(m) {
    const list = $('messages');
    if (!list || m.user_id !== selected || list.querySelector(`[data-id="${m.id}"]`)) return;
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.append(messageNode(m));
    if (atBottom || m.role !== 'user') list.scrollTop = list.scrollHeight;
  }

  async function sendMessage() {
    const input = $('composer-input');
    const text = input.value.trim();
    if (!text || !selected) return;
    input.disabled = true;
    try {
      const saved = await post(`/api/conversations/${encodeURIComponent(selected)}/messages`, { text });
      appendMessage(saved);
      input.value = '';
    } catch (err) {
      alertInline(err.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  function alertInline(message) {
    const hint = document.querySelector('.composer-hint');
    if (hint) {
      hint.textContent = `No se pudo enviar: ${message}`;
      hint.style.color = css('--critical');
    }
  }

  async function setMode(mode) {
    if (!selected) return;
    const conversation = await post(`/api/conversations/${encodeURIComponent(selected)}/mode`, { mode });
    updateConversation(conversation);
  }

  function updateConversation(c) {
    if (!c) return;
    const local = inbox.find((x) => x.user_id === c.id);
    if (local) Object.assign(local, { mode: c.mode, state: c.state, summary: c.summary, profile: c.profile, handover_reason: c.handover_reason, unread: c.unread });
    if (c.id === selected && $('chat-head')) $('chat-head').replaceWith(renderChatHead(c));
    renderInbox();
  }

  // ---------- Estado de canales ----------

  const ICONS = {
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19.5c-.2 1.1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.2l-4.8-1.5c-1-.3-1.1-1 .2-1.5L20.5 2.9c.9-.3 1.7.2 1.4 1.4z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>',
    cursos: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3zM5 13.2v4L12 21l7-3.8v-4L12 17l-7-3.8z"/></svg>',
  };

  function channelItem(kind, color, title, detail) {
    const icon = el('span', { class: 'icon', style: `--channel-color: ${color}` });
    icon.innerHTML = ICONS[kind];
    return el('div', { class: 'channel' }, icon, el('strong', {}, title), el('small', {}, ...[detail].flat()));
  }

  function renderStatus(st) {
    lastStatus = st;
    const tg = st.telegram;
    const wa = st.whatsapp;
    $('status').replaceChildren(
      channelItem(
        'telegram',
        '#012e5a',
        'Telegram',
        tg
          ? [el('span', { class: 'dot ok' }), el('a', { href: `https://t.me/${tg.username}`, target: '_blank', rel: 'noopener' }, `@${tg.username}`)]
          : [el('span', { class: 'dot off' }), 'Sin configurar'],
      ),
      renderWhatsApp(wa),
      channelItem('cursos', '#ad272e', `${st.courses.open} cursos para inscribirse`, [
        el('span', { class: 'dot ok' }),
        st.courses.updatedAt ? `de ${st.courses.total} publicados · sincronizado ${fmtTime(st.courses.updatedAt)}` : 'Sin datos',
      ]),
    );
    renderWhatsAppLink(wa);
  }

  const WA_BUSY = ['iniciando', 'esperando QR', 'autenticado'];

  function renderWhatsApp(wa) {
    const ok = wa.status === 'conectado';
    const busy = WA_BUSY.includes(wa.status);
    const parts = [el('span', { class: `dot ${ok ? 'ok' : busy ? 'warn' : 'off'}` })];
    if (ok) parts.push(wa.number ? `+${wa.number}` : 'Conectado', ' ', el('button', { type: 'button', class: 'link-btn', onclick: () => whatsappAction('logout') }, 'Cerrar sesión'));
    else if (busy) parts.push(wa.status === 'iniciando' ? 'Abriendo WhatsApp Web…' : wa.status === 'esperando QR' ? 'Esperando escaneo del QR' : 'Vinculando…');
    else if (wa.available) parts.push(el('button', { type: 'button', class: 'link-btn', onclick: () => whatsappAction('start') }, 'Iniciar sesión'));
    else parts.push('No disponible');
    return channelItem('whatsapp', '#1e8e5a', 'WhatsApp', parts);
  }

  /** Franja con el QR mientras se vincula el teléfono. */
  function renderWhatsAppLink(wa) {
    const box = $('wa-link');
    if (!wa.qrDataUrl && wa.status !== 'iniciando') {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.replaceChildren(
      el(
        'div',
        {},
        wa.qrDataUrl ? el('img', { class: 'qr', src: wa.qrDataUrl, alt: 'Código QR para vincular WhatsApp' }) : null,
        el(
          'div',
          {},
          el('h2', {}, wa.qrDataUrl ? 'Vincula el WhatsApp del CTT' : 'Abriendo WhatsApp Web…'),
          wa.qrDataUrl
            ? el('ol', {}, el('li', {}, 'Abre WhatsApp en el teléfono.'), el('li', {}, 'Ve a Dispositivos vinculados y toca Vincular un dispositivo.'), el('li', {}, 'Escanea este código. El panel se actualiza solo al conectar.'))
            : el('p', {}, 'El código QR aparecerá aquí en unos segundos.'),
        ),
      ),
    );
  }

  async function whatsappAction(action) {
    try {
      renderStatusPatch(await post(`/api/whatsapp/${action}`));
    } catch (err) {
      console.error(err);
    }
  }

  let lastStatus = null;
  function renderStatusPatch(wa) {
    if (lastStatus) renderStatus({ ...lastStatus, whatsapp: wa });
  }

  // ---------- Métricas ----------

  function baseOptions(extra) {
    const grid = css('--grid');
    const text = css('--text');
    return Object.assign(
      {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: css('--surface'), titleColor: css('--ink'), bodyColor: css('--ink'), borderColor: css('--line'), borderWidth: 1, padding: 10 },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: text }, border: { color: grid } },
          y: { beginAtZero: true, grid: { color: grid }, ticks: { color: text, precision: 0 }, border: { display: false } },
        },
      },
      extra,
    );
  }

  if (window.Chart) {
    Chart.defaults.font.family = 'Poppins, system-ui, sans-serif';
    Chart.defaults.font.size = 12;
  }

  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), config);
  }

  const barStyle = { borderRadius: 4, borderSkipped: 'start', borderColor: 'transparent', maxBarThickness: 28 };

  function renderKpis(s, events, byState) {
    const leads = byState.find((r) => r.state === 'lead_caliente')?.users ?? 0;
    const items = [
      ['Personas atendidas', fmt(s.users)],
      ['Preguntas', fmt(s.questions)],
      ['Leads calientes', fmt(leads)],
      ['Derivaciones a humano', fmt(events.handover)],
      ['Manipulaciones bloqueadas', fmt(events.intento_manipulacion)],
      ['Respuesta media', s.avgLatencyMs ? `${(s.avgLatencyMs / 1000).toFixed(1)} s` : '—'],
      ['Tokens por respuesta', s.answers ? fmt(Math.round(s.tokens / s.answers)) : '—'],
      ['Errores del LLM', fmt(s.errors)],
    ];
    $('kpis').replaceChildren(...items.map(([label, value]) => el('div', { class: 'kpi' }, el('span', {}, label), el('strong', {}, value))));
  }

  function renderDays(rows) {
    const days = [...new Set(rows.map((r) => r.day))];
    const channels = Object.keys(CHANNELS).filter((c) => !$('channel').value || c === $('channel').value);
    const datasets = channels.map((c) => ({
      label: CHANNELS[c],
      data: days.map((d) => rows.find((r) => r.day === d && r.channel === c)?.questions ?? 0),
      backgroundColor: css(`--${c}`),
      ...barStyle,
      borderWidth: { top: 2 },
      borderColor: css('--surface'),
    }));
    $('legend-day').replaceChildren(...datasets.map((d) => el('span', {}, el('i', { style: `background:${d.backgroundColor}` }), d.label)));
    const opts = baseOptions();
    opts.scales.x.stacked = true;
    opts.scales.y.stacked = true;
    draw('chart-day', { type: 'bar', data: { labels: days.map((d) => d.slice(5).split('-').reverse().join('/')), datasets }, options: opts });
  }

  function horizontalBar(id, labels, values, label, colors) {
    const opts = baseOptions({ indexAxis: 'y', interaction: { mode: 'nearest', axis: 'y', intersect: false } });
    opts.scales = {
      x: { beginAtZero: true, grid: { color: css('--grid') }, ticks: { color: css('--text'), precision: 0 }, border: { display: false } },
      y: { grid: { display: false }, ticks: { color: css('--ink'), callback: (v) => (labels[v].length > 34 ? `${labels[v].slice(0, 33)}…` : labels[v]) } },
    };
    draw(id, { type: 'bar', data: { labels, datasets: [{ label, data: values, backgroundColor: colors || css('--bar'), ...barStyle }] }, options: opts });
  }

  async function loadMetrics() {
    const o = await api(`/api/overview?${query()}`);
    renderKpis(o.summary, o.events, o.byState);
    renderDays(o.byDay);
    const states = Object.keys(STATES).filter((k) => o.byState.some((r) => r.state === k));
    horizontalBar(
      'chart-state',
      states.map((k) => `${STATES[k].icon} ${STATES[k].label}`),
      states.map((k) => o.byState.find((r) => r.state === k).users),
      'Personas',
      states.map((k) => css(STATES[k].color)),
    );
    horizontalBar('chart-topic', o.byTopic.map((t) => t.label), o.byTopic.map((t) => t.questions), 'Preguntas');
    horizontalBar('chart-course', o.topCourses.map((c) => c.name), o.topCourses.map((c) => c.mentions), 'Consultas');
    draw('chart-hour', {
      type: 'bar',
      data: { labels: o.byHour.map((r) => `${String(r.hour).padStart(2, '0')}h`), datasets: [{ label: 'Preguntas', data: o.byHour.map((r) => r.questions), backgroundColor: css('--bar'), ...barStyle }] },
      options: baseOptions(),
    });
  }
  const reloadMetrics = debounce(() => activeTab === 'metrics' && loadMetrics().catch(console.error), 1500);

  // ---------- Cursos ----------

  const REGISTRATION = {
    abierta: 'Inscripción abierta',
    próxima: 'Inscripción por abrir',
    'abierta (confirmar fechas)': 'Abierta, confirmar fechas',
    vencida: 'Inscripción vencida',
    cerrada: 'Cerrado',
  };

  function courseCard(c) {
    const open = c.registration === 'próxima' || c.registration.startsWith('abierta');
    const facts = [
      ['Inscripciones', c.registrationDates],
      ['Fechas', c.courseDates],
      ['Modalidad', c.modality],
      ['Horario', c.schedule],
      ['Precios', c.prices],
    ].filter(([, v]) => v);
    return el(
      'article',
      { class: `course${open ? '' : ' past'}` },
      el(
        'header',
        { class: `poster ${open ? 'ai' : 'human'}` },
        el('div', { class: 'pills' }, el('span', { class: 'pill' }, REGISTRATION[c.registration] ?? c.registration), c.hours ? el('span', { class: 'pill' }, `${c.hours} horas`) : null),
        el('h3', {}, c.name),
      ),
      el(
        'div',
        { class: 'course-body' },
        c.description ? el('p', { class: 'course-desc' }, c.description) : null,
        el('dl', {}, ...facts.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v.replaceAll('; ', '\n'))])),
        el(
          'div',
          { class: 'course-actions' },
          open && c.registrationUrl ? el('a', { class: 'btn-primary', href: c.registrationUrl, target: '_blank', rel: 'noopener' }, 'Formulario de inscripción') : null,
          el('a', { href: c.url, target: '_blank', rel: 'noopener' }, 'Ver en la web del CTT'),
        ),
      ),
    );
  }

  async function loadCourses() {
    const courses = await api('/api/courses');
    const now = courses.filter((c) => c.registration.startsWith('abierta')).length;
    const soon = courses.filter((c) => c.registration === 'próxima').length;
    $('courses-summary').textContent = `${now} con inscripción abierta y ${soon} por abrir, de ${courses.length} cursos publicados. Es la misma información que usa el asistente.`;
    $('courses').replaceChildren(...courses.map(courseCard));
  }

  $('courses-refresh').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    button.textContent = 'Sincronizando…';
    try {
      await post('/api/courses/refresh');
      await loadCourses();
      button.textContent = 'Sincronizado';
    } catch (err) {
      button.textContent = `No se pudo sincronizar: ${err.message}`;
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.textContent = 'Sincronizar con la web';
      }, 2500);
    }
  });

  // ---------- Tiempo real (SSE) ----------

  function connect() {
    const source = new EventSource('/api/events');
    source.onopen = () => {
      $('live').textContent = 'En vivo';
      $('live').classList.add('on');
      loadInbox();
    };
    source.onerror = () => {
      $('live').textContent = 'reconectando…';
      $('live').classList.remove('on');
    };
    source.addEventListener('status', (e) => renderStatus(JSON.parse(e.data)));
    source.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      appendMessage(m);
      if (m.user_id === selected && m.role === 'user') post(`/api/conversations/${encodeURIComponent(selected)}/read`).catch(() => {});
      reloadInbox(m.user_id);
      reloadMetrics();
    });
    source.addEventListener('conversation', (e) => {
      const c = JSON.parse(e.data);
      if (!inbox.some((x) => x.user_id === c.id)) reloadInbox(c.id);
      else updateConversation(c);
    });
  }

  // ---------- Pestañas y filtros ----------

  const TABS = ['inbox', 'courses', 'metrics'];

  function showTab(tab) {
    activeTab = tab;
    for (const t of TABS) {
      $(`tab-${t}`).setAttribute('aria-selected', String(t === tab));
      $(`view-${t}`).hidden = t !== tab;
    }
    if (tab === 'metrics') loadMetrics().catch(console.error);
    if (tab === 'courses') loadCourses().catch(console.error);
  }

  for (const t of TABS) $(`tab-${t}`).addEventListener('click', () => showTab(t));
  $('search').addEventListener('input', () => renderInbox());
  for (const id of ['range', 'channel']) {
    $(id).addEventListener('change', () => {
      loadInbox();
      if (activeTab === 'metrics') loadMetrics();
    });
  }

  renderFilters();
  api('/api/status').then(renderStatus).catch(console.error);
  loadInbox().catch(console.error);
  connect();
  if (location.hash === '#metricas') showTab('metrics');
  if (location.hash === '#cursos') showTab('courses');
  // Enlace directo a una conversación: #c=telegram:123
  if (location.hash.startsWith('#c=')) openConversation(decodeURIComponent(location.hash.slice(3))).catch(console.error);
})();
