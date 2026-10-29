(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const charts = {};
  const CHANNELS = { telegram: 'Telegram', whatsapp: 'WhatsApp' };
  let selectedUser = null;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const fmt = (n) => new Intl.NumberFormat('es-EC').format(n ?? 0);
  const fmtDate = (iso) =>
    new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const child of children.flat()) {
      if (child != null) node.append(child instanceof Node ? child : String(child));
    }
    return node;
  }

  function query() {
    const params = new URLSearchParams({ range: $('range').value });
    if ($('channel').value) params.set('channel', $('channel').value);
    return params.toString();
  }

  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }

  function baseOptions(extra) {
    const grid = css('--grid');
    const text = css('--text-secondary');
    return Object.assign(
      {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: css('--surface'),
            titleColor: css('--text-primary'),
            bodyColor: css('--text-primary'),
            borderColor: css('--border'),
            borderWidth: 1,
            padding: 10,
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: text }, border: { color: grid } },
          y: { beginAtZero: true, grid: { color: grid }, ticks: { color: text, precision: 0 }, border: { display: false } },
        },
      },
      extra,
    );
  }

  function draw(id, config) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), config);
  }

  const barStyle = { borderRadius: 4, borderSkipped: 'start', borderColor: 'transparent', maxBarThickness: 28 };

  function renderKpis(s) {
    const items = [
      ['Personas atendidas', fmt(s.users)],
      ['Conversaciones', fmt(s.conversations)],
      ['Preguntas', fmt(s.questions)],
      ['Respuestas con error', fmt(s.errors)],
      ['Tiempo medio de respuesta', s.avgLatencyMs ? `${(s.avgLatencyMs / 1000).toFixed(1)} s` : '—'],
      ['Tokens usados', fmt(s.tokens)],
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
    $('legend-day').replaceChildren(
      ...datasets.map((d) => el('span', {}, el('i', { style: `background:${d.backgroundColor}` }), d.label)),
    );
    draw('chart-day', {
      type: 'bar',
      data: { labels: days.map((d) => d.slice(5).split('-').reverse().join('/')), datasets },
      options: baseOptions({
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: css('--text-secondary') } },
          y: { stacked: true, beginAtZero: true, grid: { color: css('--grid') }, ticks: { color: css('--text-secondary'), precision: 0 }, border: { display: false } },
        },
      }),
    });
  }

  function horizontalBar(id, labels, values, label) {
    const opts = baseOptions({ indexAxis: 'y', interaction: { mode: 'nearest', axis: 'y', intersect: false } });
    opts.scales = {
      x: { beginAtZero: true, grid: { color: css('--grid') }, ticks: { color: css('--text-secondary'), precision: 0 }, border: { display: false } },
      y: {
        grid: { display: false },
        ticks: { color: css('--text-primary'), callback: (v) => (labels[v].length > 34 ? `${labels[v].slice(0, 33)}…` : labels[v]) },
      },
    };
    draw(id, {
      type: 'bar',
      data: { labels, datasets: [{ label, data: values, backgroundColor: css('--bar'), ...barStyle }] },
      options: opts,
    });
  }

  function renderHours(rows) {
    draw('chart-hour', {
      type: 'bar',
      data: {
        labels: rows.map((r) => `${String(r.hour).padStart(2, '0')}h`),
        datasets: [{ label: 'Preguntas', data: rows.map((r) => r.questions), backgroundColor: css('--bar'), ...barStyle }],
      },
      options: baseOptions(),
    });
  }

  function renderStatus(st) {
    const tg = st.telegram;
    const wa = st.whatsapp;
    const waOk = wa.status === 'conectado';
    const items = [
      el(
        'div',
        { class: 'status-item' },
        el('span', { class: `dot ${tg ? 'ok' : 'off'}` }),
        el(
          'div',
          {},
          el('strong', {}, 'Telegram'),
          tg ? el('small', {}, el('a', { href: `https://t.me/${tg.username}`, target: '_blank', rel: 'noopener' }, `@${tg.username}`)) : el('small', {}, 'Sin configurar'),
        ),
      ),
      el(
        'div',
        { class: 'status-item' },
        el('span', { class: `dot ${waOk ? 'ok' : wa.status === 'deshabilitado' ? 'off' : 'warn'}` }),
        el('div', {}, el('strong', {}, 'WhatsApp'), el('small', {}, waOk && wa.number ? `Conectado · +${wa.number}` : wa.status)),
        wa.qrDataUrl ? el('img', { class: 'qr', src: wa.qrDataUrl, alt: 'Código QR para vincular WhatsApp' }) : null,
      ),
      el(
        'div',
        { class: 'status-item' },
        el('span', { class: 'dot ok' }),
        el(
          'div',
          {},
          el('strong', {}, `Cursos: ${st.courses.open} abiertos de ${st.courses.total}`),
          el('small', {}, st.courses.updatedAt ? `Actualizado ${fmtDate(st.courses.updatedAt)}` : 'Sin datos'),
        ),
      ),
    ];
    $('status').replaceChildren(...items);
  }

  async function renderConversations() {
    const list = await getJson(`/api/conversations?${query()}`);
    if (!list.length) {
      $('conversation-list').replaceChildren(el('li', { class: 'muted' }, 'Sin conversaciones en este periodo.'));
      return;
    }
    $('conversation-list').replaceChildren(
      ...list.map((c) =>
        el(
          'li',
          {},
          el(
            'button',
            { type: 'button', 'aria-pressed': String(c.user_id === selectedUser), onclick: () => openConversation(c.user_id) },
            el('span', { class: 'who' }, c.name || c.external_id.replace('@c.us', ''), el('span', { class: `badge ${c.channel}` }, CHANNELS[c.channel])),
            el('span', { class: 'q' }, c.last_question || ''),
            el('span', { class: 'q' }, `${c.questions} preguntas · ${fmtDate(c.last_at)}`),
          ),
        ),
      ),
    );
  }

  async function openConversation(userId) {
    selectedUser = userId;
    const messages = await getJson(`/api/conversations/${encodeURIComponent(userId)}`);
    $('transcript').replaceChildren(
      ...messages.map((m) =>
        el(
          'div',
          { class: `msg ${m.role}${m.error ? ' error' : ''}` },
          m.content,
          el(
            'small',
            {},
            [
              fmtDate(m.created_at),
              m.latency_ms ? `${(m.latency_ms / 1000).toFixed(1)} s` : null,
              m.topic ? `tema: ${m.topic}` : null,
              m.error ? `error: ${m.error}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        ),
      ),
    );
    $('transcript').scrollTop = $('transcript').scrollHeight;
    document.querySelectorAll('.conv-list button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    renderConversations();
  }

  async function load() {
    const [overview, status] = await Promise.all([getJson(`/api/overview?${query()}`), getJson('/api/status')]);
    renderStatus(status);
    renderKpis(overview.summary);
    renderDays(overview.byDay);
    horizontalBar('chart-topic', overview.byTopic.map((t) => t.label), overview.byTopic.map((t) => t.questions), 'Preguntas');
    horizontalBar('chart-course', overview.topCourses.map((c) => c.name), overview.topCourses.map((c) => c.mentions), 'Consultas');
    renderHours(overview.byHour);
    await renderConversations();
  }

  $('range').addEventListener('change', load);
  $('channel').addEventListener('change', load);
  $('refresh').addEventListener('click', load);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', load);
  setInterval(() => getJson('/api/status').then(renderStatus).catch(() => {}), 5000);
  load().catch((err) => console.error(err));
})();
