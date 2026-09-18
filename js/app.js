'use strict';

const $ = (selector) => document.querySelector(selector);

const input = $('#username');
const btnBuscar = $('#btnBuscar');
const btnBuscarTexto = $('#btnBuscar span');
const resultado = $('#resultado');
const chipContainer = $('#chips');
const historialSection = $('#historial');
const btnLimpiar = $('#btnLimpiarHistorial');
const btnTema = $('#btnTema');
const pantallaCarga = $('#pantallaCarga');
const toast = $('#toast');

const CLAVE_HISTORIAL = 'gh-buscador-historial';
const CLAVE_TEMA = 'gh-buscador-tema';
const MAX_HISTORIAL = 5;
const DURACION_MINIMA_CARGA = 650;

let toastTimer = null;

/* ---------- Tema claro / oscuro ---------- */

function aplicarTema(tema) {
    document.documentElement.dataset.theme = tema;
    const esClaro = tema === 'light';
    btnTema.setAttribute('aria-label', esClaro ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
    try {
        localStorage.setItem(CLAVE_TEMA, tema);
    } catch (e) { /* almacenamiento no disponible */ }
}

btnTema.addEventListener('click', () => {
    aplicarTema(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
});

/* ---------- Historial de búsquedas ---------- */

function leerHistorial() {
    try {
        const datos = JSON.parse(localStorage.getItem(CLAVE_HISTORIAL));
        return Array.isArray(datos) ? datos : [];
    } catch (e) {
        return [];
    }
}

function guardarHistorial(historial) {
    try {
        localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(historial));
    } catch (e) { /* almacenamiento no disponible */ }
}

function agregarHistorial(username) {
    const historial = leerHistorial();
    const normalizado = username.toLowerCase();
    const sinDuplicados = historial.filter((u) => u.toLowerCase() !== normalizado);
    sinDuplicados.unshift(username);
    guardarHistorial(sinDuplicados.slice(0, MAX_HISTORIAL));
}

function renderHistorial() {
    const historial = leerHistorial();
    historialSection.hidden = historial.length === 0;
    chipContainer.innerHTML = historial
        .map((usuario, i) => `
            <button type="button" class="chip" data-buscar="${usuario}" aria-label="Buscar de nuevo a @${usuario}">
                <span class="chip-icon" aria-hidden="true">${i + 1}</span>
                @${usuario}
            </button>
        `)
        .join('');
}

chipContainer.addEventListener('click', (evento) => {
    const chip = evento.target.closest('.chip');
    if (!chip) return;
    input.value = chip.dataset.buscar;
    input.focus();
    buscar();
});

btnLimpiar.addEventListener('click', () => {
    guardarHistorial([]);
    renderHistorial();
    toastMostrar('Historial borrado');
    input.focus();
});

/* ---------- Comunicación con la API ---------- */

async function buscarUsuario(username) {
    const respuesta = await fetch(`https://api.github.com/users/${username}`, {
        headers: {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2026-03-10'
        }
    });

    if (!respuesta.ok) {
        if (respuesta.status === 404) {
            throw new Error('El usuario no existe en GitHub', { cause: 'not-found' });
        }
        if (respuesta.status === 403) {
            throw new Error('Se superó el límite de peticiones a la API', { cause: 'rate-limit' });
        }
        throw new Error(`Error del servidor (código ${respuesta.status})`, { cause: 'server' });
    }

    return respuesta.json();
}

function errorAmigable(error) {
    let tipo = 'error-danger';
    let icono = '❌';
    let detalle = 'Inténtalo nuevamente en unos momentos.';

    if (error.cause === 'vacio') {
        tipo = 'error-warning';
        icono = '⚠️';
        titulo = 'Por favor escribe un nombre de usuario';
        detalle = 'Escribe el username de GitHub que quieres buscar.';
    } else if (error.cause === 'not-found') {
        detalle = `No encontramos ninguna cuenta con el nombre "${input.value.trim()}".`;
    } else if (error.cause === 'rate-limit') {
        tipo = 'error-warning';
        icono = '⏳';
        detalle = 'Espera un momento y vuelve a intentarlo.';
    } else if (error instanceof TypeError) {
        tipo = 'error-network';
        icono = '📡';
        detalle = 'Revisa tu conexión a internet e inténtalo de nuevo.';
    }

    return { tipo, icono, titulo: error.message, detalle };
}

/* ---------- Renderizado ---------- */

function renderResultado(usuario) {
    resultado.innerHTML = `
        <div class="card result">
            <div class="avatar-wrap">
                <img src="${usuario.avatar_url}" alt="Avatar de @${usuario.login}" loading="lazy">
            </div>
            <div class="name">${usuario.name || usuario.login}</div>
            <div class="username">@${usuario.login}</div>
            ${usuario.bio ? `<p class="bio">${usuario.bio}</p>` : ''}
            ${usuario.location ? `<p class="location">📍 ${usuario.location}</p>` : ''}
            <p class="joined">🗓️ Miembro desde ${new Date(usuario.created_at).toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long'
    })}</p>
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${usuario.public_repos.toLocaleString('es-ES')}</div>
                    <div class="stat-label">Repos</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${usuario.followers.toLocaleString('es-ES')}</div>
                    <div class="stat-label">Seguidores</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${usuario.following.toLocaleString('es-ES')}</div>
                    <div class="stat-label">Siguiendo</div>
                </div>
            </div>
            <div class="actions">
                <a class="btn-ghost" href="${usuario.html_url}" target="_blank" rel="noopener noreferrer">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Ver perfil
                </a>
                <button type="button" class="btn-ghost" id="btnCopiar">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copiar usuario
                </button>
            </div>
        </div>
    `;

    const btnCopiar = $('#btnCopiar');
    btnCopiar.addEventListener('click', () => copiarUsuario(usuario.login));
}

function renderError(error) {
    const datos = errorAmigable(error);
    resultado.innerHTML = `
        <div class="card error ${datos.tipo}" role="alert">
            <div class="error-icon" aria-hidden="true">${datos.icono}</div>
            <div class="error-msg">${datos.titulo}<small>${datos.detalle}</small></div>
        </div>
    `;
}

function renderVacio() {
    resultado.innerHTML = `
        <div class="empty">
            <span aria-hidden="true">🔎</span>
            <p>Busca un usuario para ver su perfil de GitHub</p>
        </div>
    `;
}

/* ---------- Copiar al portapapeles ---------- */

async function copiarUsuario(login) {
    try {
        await navigator.clipboard.writeText(login);
        toastMostrar(`@${login} copiado al portapapeles`);
    } catch (e) {
        toastMostrar('No se pudo copiar el usuario');
    }
}

/* ---------- Toast ---------- */

function toastMostrar(mensaje) {
    toast.textContent = mensaje;
    toast.classList.add('is-active');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-active'), 2600);
}

/* ---------- Pantalla de carga ---------- */

function mostrarCarga() {
    pantallaCarga.hidden = false;
    pantallaCarga.setAttribute('aria-hidden', 'false');
}

function ocultarCarga() {
    pantallaCarga.hidden = true;
    pantallaCarga.setAttribute('aria-hidden', 'true');
}

/* ---------- Flujo de búsqueda ---------- */

async function buscar() {
    const username = input.value.trim();

    if (!username) {
        renderError(new Error('Por favor escribe un nombre de usuario', { cause: 'vacio' }));
        input.focus();
        return;
    }

    agregarHistorial(username);
    renderHistorial();

    btnBuscar.disabled = true;
    btnBuscarTexto.textContent = 'Buscando…';
    resultado.setAttribute('aria-busy', 'true');
    mostrarCarga();

    const esperaMinima = new Promise((resolve) => setTimeout(resolve, DURACION_MINIMA_CARGA));

    try {
        const [datos] = await Promise.all([buscarUsuario(username), esperaMinima]);
        renderResultado(datos);
    } catch (error) {
        renderError(error);
    } finally {
        ocultarCarga();
        resultado.setAttribute('aria-busy', 'false');
        btnBuscar.disabled = false;
        btnBuscarTexto.textContent = 'Buscar';
        resultado.setAttribute('tabindex', '-1');
        resultado.focus();
    }
}

/* ---------- Eventos ---------- */

input.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') buscar();
});

input.setAttribute('enterkeyhint', 'search');

document.addEventListener('keydown', (evento) => {
    const campoTexto = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    const esInputBusqueda = document.activeElement === input;
    if (evento.key === '/' && !campoTexto) {
        evento.preventDefault();
        input.focus();
    }
    if (evento.key === 'Escape' && esInputBusqueda && input.value) {
        input.value = '';
        renderVacio();
    }
});

renderHistorial();
renderVacio();