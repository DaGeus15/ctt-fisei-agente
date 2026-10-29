import { refreshCourses } from './courses.js';

const data = await refreshCourses();
const open = data.courses.filter((c) => c.status === 'abierto').length;
console.log(`${data.courses.length} cursos guardados en data/courses.json (${open} abiertos)`);
