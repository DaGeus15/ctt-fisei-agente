import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCatalog, parseCourse } from '../src/scraper/parse.js';

const base = 'https://ctt-talleresfisei.uta.edu.ec/';
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parseCatalog extrae las tarjetas visibles e ignora las comentadas', () => {
  const courses = parseCatalog(fixture('course.html'), base);
  assert.ok(courses.length >= 15);
  const arduino = courses.find((c) => c.id === 20);
  assert.equal(arduino.name, 'PREPARACIÓN ARDUINO CERTIFICATION PROGRAM');
  assert.equal(arduino.status, 'abierto');
  assert.equal(arduino.hours, 32);
  assert.equal(arduino.url, `${base}curso20.php`);
  assert.ok(!courses.some((c) => /Control Industrial/i.test(c.name)));
});

test('parseCourse extrae descripción, precios, contenidos e inscripción', () => {
  const course = parseCourse(fixture('curso20.html'), base);
  assert.equal(course.name, 'Preparación Arduino Certification Program');
  assert.match(course.description, /Arduino Uno/);
  assert.equal(course.objectives.length, 3);
  assert.equal(course.details['Modalidad'], 'Presencial');
  assert.match(course.details['Precio para los asistentes'], /\$40,00/);
  assert.match(course.details['Precio para los asistentes'], /\$60,00/);
  assert.ok(course.contents.some((c) => /Unidad 1/.test(c)));
  assert.match(course.registrationUrl, /docs\.google\.com\/forms/);
  assert.ok(course.instructors.length >= 1);
});
