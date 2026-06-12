const API_BASE = 'http://127.0.0.1:8000/api/v1';
const TOKEN_KEY = 'boa_api_token_v2';

const state = {
  user: null,
  catalogs: {
    estados_reclamo: [],
    tipos_reclamo: [],
    equipajes_disponibles: [],
    vuelos: [],
    pilotos: [],
  },
  claims: [],
  flights: [],
  pilots: [],
  assignments: [],
  selectedClaim: null,
  currentPage: 1,      
  rowsPerPage: 5,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const nodes = {
  authView: $('#authView'),
  workspace: $('#workspace'),
  alert: $('#alertBox'),
  sidebarUser: $('#sidebarUser'),
  pageTitle: $('#pageTitle'),
  globalSearch: $('#globalSearch'),
  statsGrid: $('#statsGrid'),
  claimsTable: $('#claimsTable'),
  claimCount: $('#claimCount'),
  flightsTable: $('#flightsTable'),
  pilotsTable: $('#pilotsTable'),
  assignmentsTable: $('#assignmentsTable'),
  claimLuggage: $('#claimLuggage'),
  claimType: $('#claimType'),
  statusNew: $('#statusNew'),
  manageCode: $('#manageCode'),
  claimDetail: $('#claimDetail'),
  trackingList: $('#trackingList'),
  assignmentFlight: $('#assignmentFlight'),
  assignmentPilot: $('#assignmentPilot'),
  clientFlight: $('#clientFlight'),
  claimsPagination: $('#claimsPagination'),
};

const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
const clearToken = () => localStorage.removeItem(TOKEN_KEY);

function setVisible(element, visible) {
  element.classList.toggle('hidden', !visible);
}

function notify(message, type = 'info') {
  nodes.alert.textContent = message;
  nodes.alert.className = `alert ${type}`;
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => nodes.alert.classList.add('hidden'), 4200);
}

async function api(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errors = payload.errors ? Object.values(payload.errors).flat().join(' ') : '';
    throw new Error(payload.mensaje || payload.message || errors || 'No se pudo completar la operación.');
  }

  return payload;
}

function createCell(value, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = value ?? '-';
  return td;
}

function createStackCell(primary, secondary) {
  const td = document.createElement('td');
  const strong = document.createElement('strong');
  strong.textContent = primary ?? '-';
  td.appendChild(strong);

  if (secondary) {
    td.appendChild(document.createElement('br'));
    const span = document.createElement('span');
    span.className = 'muted';
    span.textContent = secondary;
    td.appendChild(span);
  }

  return td;
}

function createBadge(label, code = '') {
  const span = document.createElement('span');
  const normalized = String(code).toLowerCase();
  span.className = 'badge';
  if (normalized.includes('pendiente')) span.classList.add('pending');
  if (normalized.includes('proceso')) span.classList.add('process');
  if (normalized.includes('encontrado') || normalized.includes('entregado')) span.classList.add('found');
  if (normalized.includes('cerrado')) span.classList.add('closed');
  span.textContent = label || '-';
  return span;
}

function clearSelect(select, placeholder = 'Seleccione una opción') {
  select.replaceChildren();
  const option = document.createElement('option');
  option.value = '';
  option.textContent = placeholder;
  option.disabled = true;
  option.selected = true;
  select.appendChild(option);
}

function appendOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function passengerFromClaim(claim) {
  return claim.equipaje?.boleto?.reserva?.pasajero ?? null;
}

function flightFromClaim(claim) {
  return claim.equipaje?.boleto?.reserva?.vuelo ?? null;
}

function airportLabel(airport) {
  if (!airport) return '-';
  const city = airport.ciudad?.nombre_ciudad || '-';
  return `${airport.codigo_iata || ''} ${city}`.trim();
}

function claimTypeLabel(claim) {
  return claim.tipo_reclamo?.nombre_tipo || claim.tipo_reclamo?.codigo || '-';
}

function claimStateLabel(claim) {
  return claim.estado?.nombre_estado || '-';
}

function renderSession(isAuthenticated) {
  setVisible(nodes.authView, !isAuthenticated);
  setVisible(nodes.workspace, isAuthenticated);
  setVisible($('#sidebar'), isAuthenticated);
}

// Modificado para limpiar la barra de búsqueda al cambiar de sección
function showSection(sectionName) {
  $$('.section').forEach((section) => section.classList.remove('is-active'));
  $(`#section-${sectionName}`)?.classList.add('is-active');

  $$('.nav-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.section === sectionName);
  });

  const labels = {
    dashboard: 'Resumen',
    reclamos: 'Reclamos',
    clientes: 'Clientes y equipajes',
    vuelos: 'Vuelos',
    pilotos: 'Pilotos',
    asignaciones: 'Asignaciones',
    'manage-claim': 'Gestionar reclamo',
  };

  nodes.pageTitle.textContent = labels[sectionName] || 'Panel';
}

function renderStats() {
  const totalClaims = state.claims.length;
  const pending = state.claims.filter((claim) => claim.estado?.codigo === 'PENDIENTE').length;
  const inProcess = state.claims.filter((claim) => claim.estado?.codigo === 'EN_PROCESO').length;
  const flights = state.flights.length;

  const stats = [
    ['Reclamos activos', totalClaims],
    ['Pendientes', pending],
    ['En proceso', inProcess],
    ['Vuelos cargados', flights],
  ];

  nodes.statsGrid.replaceChildren();
  stats.forEach(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'card stat-card';
    const small = document.createElement('span');
    small.textContent = label;
    const strong = document.createElement('strong');
    strong.textContent = value;
    card.append(small, strong);
    nodes.statsGrid.appendChild(card);
  });
}

function renderCatalogControls() {
  const equipajes = state.catalogs.equipajes_disponibles || [];
  const tiposReclamo = state.catalogs.tipos_reclamo || [];
  const estadosReclamo = state.catalogs.estados_reclamo || [];
  const vuelos = state.catalogs.vuelos || [];
  const pilotos = state.catalogs.pilotos || [];

  clearSelect(nodes.claimLuggage, 'Seleccione equipaje sin reclamo');
  equipajes.forEach((item) => {
    const passenger = item.boleto?.reserva?.pasajero;
    const name = passenger ? `${passenger.nombre} ${passenger.apellido_pat}` : 'Sin pasajero';
    appendOption(nodes.claimLuggage, item.id, `${item.codigo_etiqueta} - ${name}`);
  });

  clearSelect(nodes.claimType, 'Seleccione tipo de reclamo');
  tiposReclamo.forEach((item) => {
    appendOption(nodes.claimType, item.id, `${item.nombre_tipo} (${item.codigo})`);
  });

  clearSelect(nodes.statusNew, 'Seleccione estado');
  estadosReclamo.forEach((item) => {
    appendOption(nodes.statusNew, item.id, `${item.nombre_estado} (${item.codigo})`);
  });

  clearSelect(nodes.assignmentFlight, 'Seleccione vuelo');
  vuelos.forEach((flight) => {
    appendOption(
      nodes.assignmentFlight,
      flight.id,
      `${flight.codigo_vuelo} - ${airportLabel(flight.aeropuerto_origen)} a ${airportLabel(flight.aeropuerto_destino)}`
    );
  });

  clearSelect(nodes.assignmentPilot, 'Seleccione piloto');
  pilotos.forEach((pilot) => {
    appendOption(nodes.assignmentPilot, pilot.id, `${pilot.apellido}, ${pilot.nombre} - ${pilot.licencia}`);
  });

  clearSelect(nodes.clientFlight, 'Seleccione vuelo para el cliente');
  vuelos.forEach((flight) => {
    appendOption(
      nodes.clientFlight,
      flight.id,
      `${flight.codigo_vuelo} - ${airportLabel(flight.aeropuerto_origen)} a ${airportLabel(flight.aeropuerto_destino)}`
    );
  });
}

// === GESTIÓN ÚNICA DE RECLAMOS Y PAGINACIÓN ===

async function loadClaims() {
  const value = nodes.globalSearch.value.trim();
  const query = value ? `?buscar=${encodeURIComponent(value)}` : '';
  
  if (value) {
    state.currentPage = 1;
  }

  try {
    const response = await api(`/reclamos${query}`);
    state.claims = response.data || [];

    renderClaims();
    renderStats();
  } catch (error) {
    notify(error.message, 'error');
  }
}

function renderClaims() {
  nodes.claimsTable.replaceChildren();
  nodes.claimCount.textContent = `${state.claims.length} registros`;

  if (!state.claims.length) {
    const row = document.createElement('tr');
    const cell = createCell('No hay reclamos para mostrar.', 'muted');
    cell.colSpan = 8;
    row.appendChild(cell);
    nodes.claimsTable.appendChild(row);
    nodes.claimsPagination.replaceChildren();
    return;
  }

  const totalItems = state.claims.length;
  const totalPages = Math.ceil(totalItems / state.rowsPerPage);

  if (state.currentPage > totalPages) state.currentPage = totalPages;
  if (state.currentPage < 1) state.currentPage = 1;

  const startIndex = (state.currentPage - 1) * state.rowsPerPage;
  const endIndex = startIndex + state.rowsPerPage;
  const paginatedClaims = state.claims.slice(startIndex, endIndex);

  paginatedClaims.forEach((claim) => {
    const passenger = passengerFromClaim(claim);
    const flight = flightFromClaim(claim);
    const row = document.createElement('tr');

    const stateCell = document.createElement('td');
    stateCell.appendChild(createBadge(claimStateLabel(claim), claim.estado?.codigo));

    const actions = document.createElement('td');
    const manageButton = document.createElement('button');
    manageButton.className = 'btn btn-light btn-small';
    manageButton.type = 'button';
    manageButton.dataset.action = 'manage-claim';
    manageButton.dataset.id = claim.id;
    manageButton.textContent = 'Gestionar';
    actions.appendChild(manageButton);

    row.append(
      createCell(claim.id),
      createStackCell(claim.codigo_reclamo, claimTypeLabel(claim)),
      stateCell,
      createStackCell(claim.equipaje?.codigo_etiqueta, `${claim.equipaje?.peso || '-'} kg`),
      createStackCell(passenger ? `${passenger.nombre} ${passenger.apellido_pat}` : '-', passenger?.ci),
      createStackCell(flight?.codigo_vuelo, flight ? `${airportLabel(flight.aeropuerto_origen || flight.origen)} → ${airportLabel(flight.aeropuerto_destino || flight.destino)}` : '-'),
      createCell(claim.fecha_reclamo),
      actions,
    );

    nodes.claimsTable.appendChild(row);
  });

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  nodes.claimsPagination.replaceChildren();

  if (totalPages <= 1) return;

  const prevBtn = document.createElement('button');
  prevBtn.className = `btn btn-light btn-small ${state.currentPage === 1 ? 'disabled' : ''}`;
  prevBtn.textContent = '«';
  prevBtn.disabled = state.currentPage === 1;
  prevBtn.addEventListener('click', () => {
    state.currentPage--;
    renderClaims();
  });
  nodes.claimsPagination.appendChild(prevBtn);

  for (let i = 1; i <= totalPages; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.className = `btn btn-small ${state.currentPage === i ? 'btn-primary' : 'btn-light'}`;
    pageBtn.textContent = i;
    pageBtn.addEventListener('click', () => {
      state.currentPage = i;
      renderClaims();
    });
    nodes.claimsPagination.appendChild(pageBtn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.className = `btn btn-light btn-small ${state.currentPage === totalPages ? 'disabled' : ''}`;
  nextBtn.textContent = '»';
  nextBtn.disabled = state.currentPage === totalPages;
  nextBtn.addEventListener('click', () => {
    state.currentPage++;
    renderClaims();
  });
  nodes.claimsPagination.appendChild(nextBtn);
}

// === FIN COMPONENTE DE RECLAMOS ===

async function loadFlights() {
  const value = nodes.globalSearch.value.trim();
  const query = value ? `?buscar=${encodeURIComponent(value)}` : '';
  const response = await api(`/vuelos${query}`);

  state.flights = Array.isArray(response) ? response : (response.data || []);

  renderFlights();
  renderStats();
}

function renderFlights() {
  nodes.flightsTable.replaceChildren();

  state.flights.forEach((flight) => {
    const row = document.createElement('tr');
    const pilots = (flight.asignaciones_pilotos || [])
      .map((assignment) => `${assignment.piloto?.apellido || ''} ${assignment.piloto?.nombre || ''} (${assignment.rol_tripulacion})`.trim())
      .join(' / ');

    const stateCell = document.createElement('td');
    stateCell.appendChild(createBadge(flight.estado, flight.estado));

    row.append(
      createCell(flight.codigo_vuelo),
      createStackCell(`${airportLabel(flight.aeropuerto_origen)} → ${airportLabel(flight.aeropuerto_destino)}`, `${flight.aeropuerto_origen?.ciudad?.pais?.nombre_pais || ''}`),
      createCell(flight.fecha_salida),
      createCell(`${flight.hora_salida} - ${flight.hora_llegada}`),
      createStackCell(flight.avion?.matricula, flight.avion?.modelo),
      createCell(pilots || 'Sin asignación'),
      stateCell,
    );

    nodes.flightsTable.appendChild(row);
  });
}

async function loadPilots() {
  const value = nodes.globalSearch.value.trim();
  const query = value ? `?buscar=${encodeURIComponent(value)}` : '';
  const response = await api(`/pilotos${query}`);

  state.pilots = Array.isArray(response) ? response : (response.data || []);

  renderPilots();
}

function renderPilots() {
  nodes.pilotsTable.replaceChildren();

  state.pilots.forEach((pilot) => {
    const row = document.createElement('tr');
    const stateCell = document.createElement('td');
    stateCell.appendChild(createBadge(pilot.estado, pilot.estado));
    row.append(
      createStackCell(`${pilot.nombre} ${pilot.apellido}`, `${pilot.asignaciones?.length || 0} asignaciones`),
      createCell(pilot.licencia),
      createCell(pilot.telefono),
      stateCell,
    );
    nodes.pilotsTable.appendChild(row);
  });
}

async function loadAssignments() {
  const response = await api('/asignacion-pilotos');
  state.assignments = Array.isArray(response) ? response : (response.data || []);
  renderAssignments();
}

function renderAssignments() {
  nodes.assignmentsTable.replaceChildren();

  state.assignments.forEach((assignment) => {
    const row = document.createElement('tr');
    row.append(
      createCell(assignment.vuelo?.codigo_vuelo),
      createCell(`${assignment.piloto?.nombre || ''} ${assignment.piloto?.apellido || ''}`.trim()),
      createCell(assignment.rol_tripulacion),
    );
    nodes.assignmentsTable.appendChild(row);
  });
}

function addDetail(label, value) {
  const item = document.createElement('div');
  item.className = 'detail-item';
  const span = document.createElement('span');
  span.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value || '-';
  item.append(span, strong);
  nodes.claimDetail.appendChild(item);
}

function renderClaimDetail(claim) {
  const passenger = passengerFromClaim(claim);
  const flight = flightFromClaim(claim);
  nodes.manageCode.textContent = claim.codigo_reclamo;
  nodes.claimDetail.replaceChildren();

  addDetail('Estado', claimStateLabel(claim));
  addDetail('Tipo', claimTypeLabel(claim));
  addDetail('Pasajero', passenger ? `${passenger.nombre} ${passenger.apellido_pat} - CI ${passenger.ci}` : '-');
  addDetail('Equipaje', `${claim.equipaje?.codigo_etiqueta || '-'} / ${claim.equipaje?.tipo || '-'}`);
  addDetail('Vuelo', flight ? `${flight.codigo_vuelo} / ${airportLabel(flight.origen)} → ${airportLabel(flight.destino)}` : '-');
  addDetail('Fecha reclamo', claim.fecha_reclamo);
  addDetail('Boleto', claim.equipaje?.boleto?.numero_boleto);
  addDetail('Descripción', claim.descripcion);

  $('#statusClaimId').value = claim.id;
}

function renderTracking(items) {
  nodes.trackingList.replaceChildren();

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No hay seguimientos registrados.';
    nodes.trackingList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const box = document.createElement('div');
    box.className = 'timeline-item';
    const title = document.createElement('strong');
    const previous = item.estado_anterior?.nombre_estado || 'Registro inicial';
    const next = item.estado_nuevo?.nombre_estado || '-';
    title.textContent = `${previous} → ${next}`;
    const detail = document.createElement('span');
    detail.textContent = `${item.fecha} | ${item.usuario_responsable?.nombre_usuario || 'usuario'} | ${item.observaciones || ''}`;
    box.append(title, detail);
    nodes.trackingList.appendChild(box);
  });
}

async function loadUser() {
  state.user = await api('/auth/me');
  nodes.sidebarUser.textContent = `${state.user.nombre_usuario} · ${state.user.rol?.nombre_rol || 'SIN ROL'}`;
}

async function loadCatalogs() {
  const response = await api('/catalogos');
  const data = response.data || response || {};

  state.catalogs = {
    paises: data.paises || [],
    ciudades: data.ciudades || [],
    aeropuertos: data.aeropuertos || [],
    aviones: data.aviones || [],
    pilotos: data.pilotos || [],
    vuelos: data.vuelos || [],
    tipos_reclamo: data.tipos_reclamo || [],
    estados_reclamo: data.estados_reclamo || [],
    equipajes_disponibles: data.equipajes_disponibles || [],
  };

  renderCatalogControls();
}

async function loadAll() {
  await Promise.all([loadCatalogs(), loadClaims(), loadFlights(), loadPilots(), loadAssignments()]);
}

async function openClaimManager(id) {
  const response = await api(`/reclamos/${id}`);
  const claim = response.data;
  const tracking = await api(`/reclamos/${id}/seguimientos`);
  state.selectedClaim = claim;
  renderClaimDetail(claim);
  renderTracking(tracking);
  showSection('manage-claim');
}

function activeSectionName() {
  const active = $('.section.is-active');
  return active?.id?.replace('section-', '') || 'dashboard';
}

async function reloadCurrentSection(resetSearch = false) {
  if (resetSearch) nodes.globalSearch.value = '';

  const section = activeSectionName();
  if (section === 'dashboard') await loadAll();
  if (section === 'reclamos') await loadClaims();
  if (section === 'vuelos') await loadFlights();
  if (section === 'pilotos') await loadPilots();
  if (section === 'asignaciones') await loadAssignments();
}

// === EVENT LISTENERS DE FORMULARIOS Y BOTONES ===

$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        nombre_usuario: $('#loginUser').value.trim(),
        contrasena: $('#loginPassword').value,
      }),
    });
    setToken(payload.access_token);
    renderSession(true);
    await loadUser();
    await loadAll();
    showSection('dashboard');
    notify('Ingreso correcto.', 'info');
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nombre_usuario: $('#registerUser').value.trim(),
        contrasena: $('#registerPassword').value,
      }),
    });
    event.target.reset();
    notify('Usuario registrado. Ahora puede iniciar sesión.', 'info');
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#clientLuggageForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const payload = {
      nombre: $('#clientName').value.trim(),
      apellido_pat: $('#clientLastName').value.trim(),
      apellido_mat: $('#clientSecondLastName').value.trim() || null,
      ci: $('#clientCi').value.trim(),
      telefono: $('#clientPhone').value.trim() || null,
      correo: $('#clientEmail').value.trim() || null,
      id_vuelo: $('#clientFlight').value, 
      precio: parseFloat($('#ticketPrice').value), 
      codigo_etiqueta: $('#luggageCode').value.trim(),
      peso: parseFloat($('#luggageWeight').value),
      tipo: $('#luggageType').value, 
      descripcion: $('#luggageDescription').value.trim() || null 
    };

    await api('/registro-equipaje', { 
      method: 'POST',
      body: JSON.stringify(payload),
    });

    notify('Cliente, reserva, boleto y equipaje registrados correctamente.', 'info');
    event.target.reset(); 
    await loadAll();      
    showSection('dashboard'); 
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#claimForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/reclamos', {
      method: 'POST',
      body: JSON.stringify({
        id_equipaje: Number(nodes.claimLuggage.value),
        id_tipo_reclamo: Number(nodes.claimType.value),
        descripcion: $('#claimDescription').value.trim(),
      }),
    });
    event.target.reset();
    await loadCatalogs();
    await loadClaims();
    notify('Reclamo creado correctamente.', 'info');
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#statusForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const id = Number($('#statusClaimId').value);
    await api(`/reclamos/${id}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({
        id_estado_nuevo: Number(nodes.statusNew.value),
        observaciones: $('#statusNotes').value.trim(),
      }),
    });
    await loadClaims();
    await openClaimManager(id);
    notify('Estado actualizado correctamente.', 'info');
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#assignmentForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/asignacion-pilotos', {
      method: 'POST',
      body: JSON.stringify({
        id_vuelo: Number(nodes.assignmentFlight.value),
        id_piloto: Number(nodes.assignmentPilot.value),
        rol_tripulacion: $('#assignmentRole').value,
      }),
    });
    event.target.reset();
    await loadCatalogs();
    await loadFlights();
    await loadAssignments();
    notify('Piloto asignado correctamente.', 'info');
  } catch (error) {
    notify(error.message, 'error');
  }
});

nodes.claimsTable.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="manage-claim"]');
  if (!button) return;
  try {
    await openClaimManager(button.dataset.id);
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#btnBackClaims').addEventListener('click', () => showSection('reclamos'));

$$('.nav-link').forEach((button) => {
  button.addEventListener('click', async () => {
    showSection(button.dataset.section);
    try {
      await reloadCurrentSection(false);
    } catch (error) {
      notify(error.message, 'error');
    }
  });
});

$('#btnGlobalSearch').addEventListener('click', async () => {
  try {
    await reloadCurrentSection(false);
    notify('Búsqueda aplicada.', 'info');
  } catch (error) {
    notify(error.message, 'error');
  }
});

$('#btnReload').addEventListener('click', async () => {
  try {
    await reloadCurrentSection(true);
    notify('Datos recargados.', 'info');
  } catch (error) {
    notify(error.message, 'error');
  }
});

nodes.globalSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('#btnGlobalSearch').click();
});

$('#btnLogout').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (_) {}
  clearToken();
  state.user = null;
  renderSession(false);
  notify('Sesión cerrada.', 'info');
});

(async function init() {
  renderSession(false);
  $('#sidebar').classList.add('hidden');

  if (!getToken()) return;

  try {
    renderSession(true);
    $('#sidebar').classList.remove('hidden');
    await loadUser();
    await loadAll();
    showSection('dashboard');
  } catch (error) {
    clearToken();
    renderSession(false);
    notify('La sesión expiró. Ingrese nuevamente.', 'error');
  }
})();