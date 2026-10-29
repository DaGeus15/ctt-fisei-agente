Git Workflow

Este proyecto debe utilizar un flujo de trabajo basado en Git con las siguientes ramas:

main
  └── develop
       ├── feature/*
       ├── fix/*
       ├── refactor/*
       └── chore/*
Inicialización del repositorio

Antes de comenzar cualquier trabajo:

Verifica si el proyecto ya es un repositorio Git.

Si NO existe .git, inicializa el repositorio:

git init
Configura el flujo de ramas:
main: rama estable y de producción.
develop: rama principal de desarrollo.
feature/*: nuevas funcionalidades.
fix/*: correcciones de errores.
refactor/*: refactorizaciones.
chore/*: mantenimiento, configuración y tareas auxiliares.

Si el repositorio acaba de ser inicializado:

git add .
git commit -m "chore: initial commit"
git branch -M main
git checkout -b develop
Regla principal

No trabajes directamente sobre main.

Todo desarrollo debe realizarse desde develop o desde una rama específica de trabajo.

Antes de comenzar una funcionalidad:

git checkout develop
git pull
git checkout -b feature/nombre-de-la-funcionalidad

Utiliza nombres descriptivos y en kebab-case.

Ejemplos:

feature/scroll-animations
feature/authentication
feature/product-catalog
fix/login-validation
refactor/api-services
chore/update-dependencies
Commits

Haz commits frecuentes y pequeños.

Cada logro funcional o etapa significativa debe tener su propio commit.

No esperes hasta terminar toda una funcionalidad para hacer un único commit.

Ejemplo:

feat: create landing page structure
feat: add hero section
feat: add scroll-driven animations
feat: add responsive navigation
feat: add mobile layout
fix: correct scroll animation timing
refactor: extract animation components

Los commits deben:

Representar un cambio coherente.
Ser suficientemente pequeños para poder revertirse fácilmente.
No mezclar funcionalidades diferentes.
Usar mensajes claros.
Seguir Conventional Commits.
Formato
type: description

Tipos permitidos:

feat
fix
refactor
style
docs
test
chore
perf
build
ci

Ejemplos:

git add .
git commit -m "feat: add hero section"
git add .
git commit -m "feat: implement scroll-driven animations"
git add .
git commit -m "fix: prevent animation overflow on mobile"
Flujo de trabajo

Para cada funcionalidad:

1. Actualizar develop
git checkout develop
git pull
2. Crear la rama
git checkout -b feature/nombre
3. Implementar

Trabaja en pequeñas etapas.

Después de cada logro significativo:

git status
git add .
git commit -m "tipo: descripción"
4. Verificar

Antes de considerar terminada una funcionalidad:

Ejecuta el linter.
Ejecuta las pruebas disponibles.
Verifica que el proyecto compile/build correctamente.
Corrige cualquier error encontrado.
Haz un commit separado para cada corrección importante.
5. Integrar a develop

Cuando la funcionalidad esté completamente terminada:

git checkout develop
git merge --no-ff feature/nombre

Después:

git branch -d feature/nombre
Main

main debe contener únicamente versiones estables.

No hagas commits directamente sobre main.

Cuando develop contenga una versión estable y probada:

git checkout main
git merge --no-ff develop

El resultado debe ser:

main
  ↓
versión estable

develop
  ↓
desarrollo actual

feature/*
  ↓
funcionalidades individuales
Antes de modificar código

Siempre revisa:

git status
git branch

Comprueba en qué rama estás trabajando.

Si estás en main, cambia a develop o crea una rama feature/* apropiada antes de modificar archivos.

No hacer

No hagas:

git add .
git commit -m "update"

como único commit después de realizar una gran cantidad de trabajo.

No hagas commits gigantes que mezclen:

Nuevas funcionalidades.
Correcciones.
Refactorizaciones.
Cambios de estilos.
Configuración.

Sepáralos cuando sea razonable.

No hagas git reset --hard, git clean -fd u otras operaciones destructivas sin una razón clara y sin verificar primero qué archivos se perderían.

No sobrescribas trabajo existente sin revisarlo.

No hagas push --force sobre main o develop.

Regla para Claude Code

Autoría de commits

* Todos los commits deben utilizar exclusivamente la identidad Git configurada por el usuario.
* No incluir a Claude Code, Anthropic ni a ninguna herramienta de IA como coautor.
* No añadir trailers `Co-Authored-By` ni variantes equivalentes que atribuyan coautoría a una IA.
* No añadir líneas de atribución de IA en los mensajes de commit.
* Antes de crear un commit, verificar que el mensaje cumpla estas reglas.
* No modificar `user.name`, `user.email` ni la configuración global de Git.
* No reescribir ni modificar commits existentes para eliminar coautorías sin autorización explícita del usuario.
* Estas reglas se aplican a todos los commits, independientemente de la rama o del tipo de tarea.

Claude debe mantener este workflow durante toda la sesión.

Cuando complete una etapa importante del trabajo:

Revisar los cambios.
Ejecutar las verificaciones apropiadas.
Crear un commit descriptivo.
Continuar con la siguiente etapa.

Si una tarea contiene varias funcionalidades, dividirla en varias etapas y realizar commits independientes.

Al finalizar el trabajo, mostrar un resumen:

Branch:
<rama actual>

Commits realizados:
- <commit 1>
- <commit 2>
- <commit 3>

Verificaciones:
- Tests: PASS/FAIL
- Linter: PASS/FAIL
- Build: PASS/FAIL

La prioridad es mantener un historial Git limpio, entendible y fácil de revertir.

README

Cuando se pida crear o actualizar el README.md de un proyecto, seguir esta estructura. Está escrito en español, con títulos con emoji y bloques de Markdown de GitHub. Los datos (versiones, cantidades, comandos, rutas) se sacan siempre del código y de git, nunca se inventan: si algo no existe en el repo (por ejemplo un archivo LICENSE), no se afirma.

Encabezado

* Título con un emoji: `# 💼 Nombre del Proyecto`.
* Una fila de insignias de shields.io con `style=flat-square`: framework principal, lenguaje, base de datos, versión de Node o del runtime, plataforma de despliegue y licencia. Cada insignia enlaza a la página oficial de la tecnología; la de licencia enlaza al archivo `LICENSE`.
* Un párrafo que empieza con el nombre del proyecto en negrita y dice qué es y para quién, y otro con el contexto (para qué curso, guía o cliente se hizo).
* Un bloque `> [!TIP]` con la forma más rápida de ver el proyecto funcionando: el enlace a la demo o, si no hay, los comandos mínimos de arranque.

Secciones, en este orden (cada una separada por `---` y con emoji en el título)

1. Descripción: tres subtítulos `###` — ¿Qué problema resuelve?, ¿Qué hace? (lista numerada de lo que ocurre paso a paso) y ¿Para quién está pensado?
2. Capturas: tabla de dos columnas con imágenes `<img width="420">` y un pie `<sub>` en cada una. Las imágenes viven en `docs/capturas/` dentro del repo; se generan con el proyecto corriendo en local y base de datos de ejemplo, en pantalla completa y sin datos reales.
3. Características: lista con viñetas; cada una lleva el nombre de la característica en negrita, dos puntos y una explicación de una o dos frases.
4. Tecnologías Utilizadas: lista agrupada por frontend, backend, base de datos, pruebas y despliegue.
5. Arquitectura: un diagrama `mermaid` (`graph TD`) con el flujo real entre los módulos, y una o dos frases que expliquen la idea principal.
6. Estructura del Proyecto: árbol de carpetas en un bloque `bash`, con un comentario a la derecha de cada archivo o carpeta importante.
7. Requisitos del Sistema: versiones mínimas y lo que se necesita solo en producción.
8. Instalación y Configuración: pasos numerados, cada uno con su bloque de código. Incluir las variables de entorno y avisar que los secretos nunca se guardan en el repositorio.
9. Uso y Ejecución: un subtítulo por modo (producción local, desarrollo) y una tabla de scripts con el comando y lo que hace.
10. Despliegue: cómo se publica y qué variables hay que definir en la plataforma.
11. Secciones técnicas propias del proyecto (recorrido, API, reglas de negocio, migraciones, diseño, lo que queda por confirmar): tablas para endpoints y reglas, y un subtítulo `###` por tema.
12. Roadmap de Funcionalidades: lista de tareas con `- [x]` para lo hecho y `- [ ]` para lo pendiente.
13. Contribuidores: tabla con nombre y número de commits, tomados de `git shortlog -sn`.
14. Fuentes o referencias, si las hay: dentro de un bloque `<details><summary>` para que no alargue la página.
15. Licencia: una frase y un enlace a `LICENSE`. Solo si el archivo existe.
16. Autor: una línea con el nombre que usa el autor en git.

Reglas de estilo

* Todo el texto en español. Los nombres técnicos, comandos y rutas van en `código`.
* Los emojis solo van en los títulos de sección, no en el cuerpo del texto.
* Las tablas se usan para comparar o enumerar (comandos, endpoints, reglas); la prosa, para explicar.
* No se enlazan anclas de títulos con emoji (se rompen); se nombra la sección en el texto.
* Al agregar o quitar un archivo, un script, un endpoint o una migración, se actualiza el README en el mismo cambio, igual que el árbol de la estructura y el número de contribuidores.
* El README se cambia en una rama `docs/*` con commits `docs:` y se integra a `develop` como el resto del trabajo.
