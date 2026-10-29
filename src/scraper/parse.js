import * as cheerio from 'cheerio';

const clean = (text) => text.replace(/\s+/g, ' ').trim();

/** Extrae las tarjetas de cursos del listado (course.php). */
export function parseCatalog(html, baseUrl) {
  const $ = cheerio.load(html);
  const courses = [];
  $('a.h5[href^="curso"]').each((_, el) => {
    const link = $(el);
    const href = link.attr('href');
    const card = link.closest('.bg-secondary');
    const [status, hours] = card
      .find('small')
      .map((_, s) => clean($(s).text()))
      .get();
    const id = href.match(/curso(\d+)\.php/)?.[1];
    if (!id) return;
    courses.push({
      id: Number(id),
      name: clean(link.text()),
      status: status?.toUpperCase() === 'ABIERTO' ? 'abierto' : 'cerrado',
      hours: Number.parseInt(hours, 10) || null,
      url: new URL(href, baseUrl).href,
      imageUrl: new URL(`img/curso${id}.jpg`, baseUrl).href,
    });
  });
  return courses;
}

const listItems = ($, scope) =>
  scope
    .find('li')
    .map((_, li) => clean($(li).text()))
    .get()
    .filter(Boolean);

/** Extrae el detalle de un curso (cursoN.php). */
export function parseCourse(html, baseUrl) {
  const $ = cheerio.load(html);
  const comite = $('.comite');
  const [organizers, instructors] = comite
    .find('ul')
    .map((_, ul) => [listItems($, $(ul))])
    .get();

  const details = {};
  const detailLines = [];
  let lastKey = null;
  $('.pc-tab section .tab1 li').each((_, li) => {
    const strong = $(li).find('strong').first();
    const text = clean($(li).text());
    if (strong.length) {
      lastKey = clean(strong.text()).replace(/:$/, '');
      details[lastKey] = clean(text.slice(clean(strong.text()).length));
    } else if (lastKey) {
      details[lastKey] = [details[lastKey], text].filter(Boolean).join('; ');
    }
    detailLines.push(text);
  });
  const notes = $('.pc-tab section .tab1 p')
    .map((_, p) => clean($(p).text()))
    .get()
    .filter(Boolean);

  const registrationHref = $('#inscripcion a[href]').attr('href');

  return {
    name: clean($('h1.tituloCurso').text()),
    description: clean($('.descripcion p').text()),
    objectives: listItems($, $('.objetivos')),
    location: listItems($, $('.ubicacion')),
    organizers: organizers ?? [],
    instructors: instructors ?? [],
    details,
    detailLines,
    notes,
    materials: listItems($, $('.pc-tab section .tab2')),
    contents: listItems($, $('.pc-tab section .tab3')),
    registrationUrl: registrationHref ? new URL(registrationHref, baseUrl).href : null,
  };
}
