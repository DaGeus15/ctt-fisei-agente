import { readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { rootCertificates } from 'node:tls';
import { Agent, fetch } from 'undici';
import { parseCatalog, parseCourse } from './parse.js';
import { config } from '../config.js';

const CACHE_PATH = 'data/courses.json';

// El servidor de la UTA no envía el certificado intermedio de Sectigo,
// así que se agrega a las CA de confianza para validar la cadena completa.
const intermediate = readFileSync(new URL('./certs/sectigo-dv-r36.pem', import.meta.url), 'utf8');
const dispatcher = new Agent({ connect: { ca: [...rootCertificates, intermediate] } });

async function fetchHtml(url) {
  const res = await fetch(url, { dispatcher, headers: { 'User-Agent': 'CTT-FISEI-Agente/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.text();
}

/** Descarga el catálogo completo y el detalle de cada curso. */
export async function scrapeCourses(baseUrl = config.coursesUrl) {
  const catalog = parseCatalog(await fetchHtml(new URL('course.php', baseUrl).href), baseUrl);
  const courses = [];
  for (const item of catalog) {
    try {
      const detail = parseCourse(await fetchHtml(item.url), baseUrl);
      courses.push({ ...item, ...detail, name: item.name || detail.name, title: detail.name });
    } catch (err) {
      console.warn(`[scraper] No se pudo leer ${item.url}: ${err.message}`);
      courses.push(item);
    }
  }
  return { updatedAt: new Date().toISOString(), source: baseUrl, courses };
}

let state = null;

export async function loadCachedCourses() {
  try {
    state = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {
    state = null;
  }
  return state;
}

export async function refreshCourses() {
  const data = await scrapeCourses();
  if (!data.courses.length) throw new Error('El catálogo no devolvió cursos');
  await mkdir(dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(data, null, 2));
  state = data;
  return data;
}

/** Devuelve los cursos en memoria; usa la caché en disco si la web no responde. */
export async function initCourses() {
  try {
    await refreshCourses();
  } catch (err) {
    console.warn(`[scraper] Usando caché local: ${err.message}`);
    await loadCachedCourses();
  }
  if (!state) throw new Error('No hay datos de cursos disponibles');
  const hours = config.coursesRefreshHours;
  if (hours > 0) {
    setInterval(() => refreshCourses().catch((e) => console.warn(`[scraper] ${e.message}`)), hours * 3600_000).unref();
  }
  return state;
}

export const getCourses = () => state?.courses ?? [];
export const getCoursesUpdatedAt = () => state?.updatedAt ?? null;
export const setCoursesForTest = (courses) => {
  state = { updatedAt: new Date().toISOString(), courses };
};
