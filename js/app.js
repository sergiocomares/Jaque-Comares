/*
 * JAQUE COMARES - Interfaz de usuario.
 * Estructura: utilidades · estado y guardado · diálogos · vistas · informes · acciones · arranque.
 * La lógica del torneo está en js/tournament.js y el emparejamiento en js/swiss.js.
 */
(function () {
  'use strict';

  var CENTER = 'IES Marqués de Comares – Lucena (Córdoba)';
  var RES_LABEL = { '1-0': '1-0', '1/2': '½-½', '0-1': '0-1', '+/-': '+/- (incomp.)', '-/+': '-/+ (incomp.)', '-/-': '0-0 (nulo)' };
  var VIEWS = [
    ['panel', 'Panel'], ['participantes', 'Participantes'], ['emparejamientos', 'Emparejamientos'],
    ['resultados', 'Resultados'], ['clasificacion', 'Clasificación'], ['historial', 'Historial'],
    ['informes', 'Informes'], ['configuracion', 'Configuración']
  ];

  /* ============================ Utilidades ============================ */

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** Formatea puntos: 2.5 -> 2½, 0.5 -> ½. */
  function fmt(n) {
    var w = Math.floor(n + 1e-9), f = n - w;
    if (Math.abs(f - 0.5) < 1e-9) return (w ? w : '') + '½';
    if (Math.abs(f) < 1e-9) return String(w);
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function fmtDate(s) {
    if (!s) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? m[3] + '/' + m[2] + '/' + m[1] : s;
  }
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, type === 'error' ? 7000 : 3800);
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function slug(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'torneo';
  }
  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  /* ============================ Estado y guardado ============================ */

  var store = JC.loadStore(window.localStorage);
  var undoStack = [];
  var ui = { view: 'panel', round: null, query: '', sort: 'number', histRound: null, histPlayer: null, report: null, confirmedRounds: {} };

  function active() {
    for (var i = 0; i < store.tournaments.length; i++) if (store.tournaments[i].id === store.activeId) return store.tournaments[i];
    return null;
  }
  function save() {
    try { JC.saveStore(window.localStorage, store); }
    catch (e) { toast('No se han podido guardar los datos en el navegador. Descarga una copia de seguridad.', 'error'); }
  }
  function snapshot() { return JSON.stringify({ activeId: store.activeId, tournaments: store.tournaments }); }
  function restore(s) {
    var d = JSON.parse(s);
    store.activeId = d.activeId; store.tournaments = d.tournaments;
  }

  /** Ejecuta un cambio: guarda para poder deshacer, persiste y vuelve a dibujar. */
  function mutate(label, fn) {
    var snap = snapshot();
    try { fn(); }
    catch (e) { restore(snap); toast(e.message, 'error'); render(); return false; }
    undoStack.push({ label: label, snap: snap });
    if (undoStack.length > 50) undoStack.shift();
    save();
    render();
    return true;
  }
  function undo() {
    var u = undoStack.pop();
    if (!u) return;
    restore(u.snap);
    save();
    if (!active() && ui.view !== 'cover') ui.view = 'cover';
    ui.round = null;
    toast('Deshecho: ' + u.label);
    render();
  }

  /* ============================ Diálogos ============================ */

  function openDialog(title, html, opts) {
    opts = opts || {};
    var dlg = $('dlg');
    $('dlgTitle').textContent = title;
    $('dlgBody').innerHTML = html;
    var ok = $('dlgOk');
    ok.textContent = opts.ok || 'Aceptar';
    ok.className = 'btn ' + (opts.danger ? 'danger' : 'primary');
    $('dlgCancel').classList.toggle('hidden', opts.noCancel === true);
    $('dlgForm').onsubmit = function (e) {
      e.preventDefault();
      if (opts.onOk && opts.onOk($('dlgForm')) === false) return;
      dlg.close();
    };
    $('dlgCancel').onclick = function () { dlg.close(); };
    dlg.showModal();
    var first = $('dlgBody').querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
    if (first) first.focus();
  }
  function confirmBox(title, message, okLabel, onOk, danger) {
    openDialog(title, '<p>' + message + '</p>', { ok: okLabel, danger: danger, onOk: function () { onOk(); } });
  }

  /* ============================ Vistas ============================ */

  function pname(t, id) {
    var p = JC.playerById(t, id);
    return p ? p.name : '(eliminado)';
  }
  function pnum(t, id) {
    var p = JC.playerById(t, id);
    return p ? p.number : '?';
  }
  function pfull(t, id) { return pnum(t, id) + '. ' + pname(t, id); }

  function render() {
    var t = active();
    if (!t && ui.view !== 'cover') ui.view = 'cover';
    renderTop(t);
    var html;
    if (ui.view === 'cover') html = viewCover();
    else if (ui.view === 'panel') html = viewPanel(t);
    else if (ui.view === 'participantes') html = viewPlayers(t);
    else if (ui.view === 'emparejamientos') html = viewRound(t, 'pairings');
    else if (ui.view === 'resultados') html = viewRound(t, 'results');
    else if (ui.view === 'clasificacion') html = viewStandings(t);
    else if (ui.view === 'historial') html = viewHistory(t);
    else if (ui.view === 'informes') html = viewReports(t);
    else html = viewConfig(t);
    $('main').innerHTML = html;
  }

  function renderTop(t) {
    var top = '<button class="brand" data-act="go" data-view="cover" title="Ir a la portada">' +
      '<img src="assets/logo-centro.png" alt="IES Marqués de Comares"><span class="app"><b>JAQUE COMARES</b><small>Gestión de torneos escolares de ajedrez</small></span></button>' +
      '<span class="spacer"></span>';
    if (t) top += '<span class="tname" title="Torneo activo">🏆 ' + esc(t.name) + '</span>';
    var u = undoStack[undoStack.length - 1];
    top += '<button class="btn small" data-act="undo"' + (u ? '' : ' disabled') + ' title="Deshace el último cambio importante">↶ Deshacer' + (u ? ': ' + esc(u.label) : '') + '</button>';
    $('topbar').innerHTML = top;
    var tabs = '';
    if (t && ui.view !== 'cover') {
      VIEWS.forEach(function (v) {
        tabs += '<button data-act="go" data-view="' + v[0] + '" class="' + (ui.view === v[0] ? 'active' : '') + '">' + v[1] + '</button>';
      });
    }
    $('tabs').innerHTML = tabs;
    $('tabs').classList.toggle('hidden', !tabs);
  }

  /* ---- Portada ---- */

  function boardSvg() {
    var s = '<svg viewBox="0 0 400 400" role="img" aria-label="Tablero de ajedrez con piezas"><rect x="0" y="0" width="400" height="400" rx="14" fill="#5c161c"/>';
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      s += '<rect x="' + (20 + c * 45) + '" y="' + (20 + r * 45) + '" width="45" height="45" fill="' + ((r + c) % 2 ? '#7a1f26' : '#f8f2e7') + '"/>';
    }
    var pieces = [[0, 1, '♞', '#111'], [3, 0, '♛', '#111'], [5, 2, '♜', '#111'], [2, 4, '♘', '#fff', '#111'], [4, 5, '♔', '#fff', '#111'], [6, 6, '♙', '#fff', '#111'], [1, 6, '♗', '#fff', '#111'], [7, 3, '♟', '#111']];
    pieces.forEach(function (p) {
      var darkSq = (p[1] + p[0]) % 2 === 1;
      var fill = darkSq ? '#f8f2e7' : '#2a0a0c';
      p[4] = darkSq ? '#2a0a0c' : null;
      s += '<text x="' + (20 + p[0] * 45 + 22.5) + '" y="' + (20 + p[1] * 45 + 35) + '" font-size="38" text-anchor="middle" fill="' + fill + '" stroke="' + (p[4] || 'none') + '" stroke-width="1" font-family="Segoe UI Symbol,Apple Symbols,DejaVu Sans,serif">' + p[2] + '</text>';
    });
    return s + '</svg>';
  }

  function viewCover() {
    var list = store.tournaments.map(function (t) {
      var st = t.finished ? 'Finalizado' : (t.rounds.length ? 'Ronda ' + t.rounds.length + ' de ' + t.numRounds : 'Sin empezar');
      return '<div class="t-item' + (t.id === store.activeId ? ' active' : '') + '"><div><b>' + esc(t.name) + '</b><div class="small muted">' +
        esc(fmtDate(t.date)) + ' · ' + t.players.length + ' participantes · ' + st + '</div></div><div class="btn-row">' +
        '<button class="btn primary small" data-act="openTournament" data-id="' + t.id + '">Abrir</button>' +
        '<button class="btn small" data-act="exportOne" data-id="' + t.id + '">Copia (JSON)</button>' +
        '<button class="btn danger small" data-act="deleteTournament" data-id="' + t.id + '">Eliminar</button></div></div>';
    }).join('');
    return '<section class="hero"><div><img class="hero-logo" src="assets/logo-centro.png" alt="IES Marqués de Comares"><h1>JAQUE COMARES</h1><div class="sub">Gestión de torneos escolares de ajedrez</div>' +
      '<p>' + CENTER + '</p><p class="muted">Organiza un torneo por sistema suizo de principio a fin: la aplicación calcula los emparejamientos, ' +
      'las puntuaciones y la clasificación. Sin servidores, sin cuentas y sin necesidad de saber ajedrez.</p>' +
      '<div class="btn-row"><button class="btn primary big" data-act="newTournament">＋ Crear torneo</button>' +
      '<button class="btn big" data-act="importBackup">Importar copia de seguridad</button></div></div>' + boardSvg() + '</section>' +
      '<div class="card"><h2>Tus torneos</h2>' + (list ? '<div class="t-list">' + list + '</div>' :
        '<p class="muted">Todavía no hay ningún torneo. Pulsa «Crear torneo» para empezar.</p>') +
      (list ? '<p class="btn-row" style="margin-top:12px"><button class="btn small" data-act="exportAll">Copia de seguridad de todos los torneos</button></p>' : '') + '</div>' +
      '<div class="card"><h2>Cómo se usa (8 pasos)</h2><ol class="steps"><li>Crea el torneo</li><li>Introduce a los participantes</li>' +
      '<li>Genera la primera ronda</li><li>Anota los resultados</li><li>Pulsa «Cerrar ronda y generar siguiente»</li>' +
      '<li>Consulta la clasificación</li><li>Repite hasta terminar las rondas</li><li>Imprime la clasificación final</li></ol></div>';
  }

  /* ---- Panel ---- */

  function nextStep(t) {
    var cur = JC.currentRound(t);
    var n = t.players.length;
    if (n < JC.MIN_PLAYERS) return { text: 'Paso 2: introduce a los participantes (mínimo ' + JC.MIN_PLAYERS + ').', label: 'Ir a Participantes', view: 'participantes' };
    if (!cur) return { text: 'Ya hay ' + n + ' participantes. Cuando estén todos, genera la primera ronda.', label: 'Generar primera ronda', act: 'genRound' };
    if (t.finished) return { text: '¡Torneo terminado! Consulta la clasificación final e imprímela.', label: 'Ver clasificación final', view: 'clasificacion' };
    if (!cur.closed) {
      var p = JC.pendingGames(cur).length;
      return p ? { text: 'Ronda ' + cur.number + ': faltan ' + p + ' resultados por anotar.', label: 'Anotar resultados', view: 'resultados' }
        : { text: 'Ronda ' + cur.number + ': todos los resultados están anotados. Ya puedes cerrarla.', label: 'Ir a cerrar la ronda', view: 'resultados' };
    }
    return { text: 'La ronda ' + cur.number + ' está cerrada. Genera la siguiente.', label: 'Generar siguiente ronda', act: 'genRound' };
  }

  function viewPanel(t) {
    var cur = JC.currentRound(t);
    var total = 0, done = 0;
    t.rounds.forEach(function (r) { r.games.forEach(function (g) { total++; if (g.result) done++; }); });
    var pending = cur && !cur.closed ? JC.pendingGames(cur).length : 0;
    var top = JC.standings(t).slice(0, 3);
    var ns = nextStep(t);
    var topHtml = top.length && t.rounds.length ? '<ol>' + top.map(function (r) { return '<li><b>' + esc(r.name) + '</b> · ' + fmt(r.points) + ' pts</li>'; }).join('') + '</ol>' :
      '<p class="muted">Aparecerán cuando se juegue la primera ronda.</p>';
    var sc = [
      ['participantes', '👥', 'Participantes', 'Alta, edición e importación'], ['emparejamientos', '♟', 'Emparejamientos', 'Quién juega contra quién'],
      ['resultados', '✅', 'Resultados', 'Anota y cierra rondas'], ['clasificacion', '🏆', 'Clasificación', 'Puestos y desempates'],
      ['historial', '📜', 'Historial de rondas', 'Rondas y trayectoria de cada alumno'], ['informes', '🖨', 'Informes', 'Imprimir y exportar'],
      ['configuracion', '⚙', 'Configuración', 'Rondas, puntos y desempates']
    ].map(function (s) {
      return '<button class="shortcut" data-act="go" data-view="' + s[0] + '"><span class="ic">' + s[1] + '</span><b>' + s[2] + '</b><span>' + s[3] + '</span></button>';
    }).join('');
    return '<h1>' + esc(t.name) + '</h1><p class="muted">' + esc(fmtDate(t.date)) + ' · Sistema suizo · Partidas rápidas ' + esc(t.timeControl) + '</p>' +
      '<div class="note"><b>¿Qué toca ahora?</b> ' + esc(ns.text) + '<div style="margin-top:10px"><button class="btn primary" ' +
      (ns.act ? 'data-act="' + ns.act + '"' : 'data-act="go" data-view="' + ns.view + '"') + '>' + esc(ns.label) + '</button></div></div>' +
      '<div class="grid stats" style="margin-bottom:18px">' +
      stat(t.players.length + (t.expectedPlayers ? ' / ' + t.expectedPlayers : ''), 'Participantes inscritos' + (t.expectedPlayers ? ' / previstos' : '')) +
      stat(cur ? cur.number + ' de ' + t.numRounds : '0 de ' + t.numRounds, 'Ronda actual') +
      stat(t.numRounds, 'Rondas totales') + stat(done, 'Partidas finalizadas') + stat(pending, 'Partidas pendientes (ronda actual)') + '</div>' +
      '<div class="grid two"><div class="card"><h2>🏆 Primeros clasificados</h2>' + topHtml + '</div>' +
      '<div class="card"><h2>Accesos directos</h2><div class="grid shortcuts">' + sc + '</div></div></div>';
  }
  function stat(n, l) { return '<div class="stat"><div class="n">' + esc(n) + '</div><div class="l">' + esc(l) + '</div></div>'; }

  /* ---- Participantes ---- */

  function colorsHtml(s) {
    var last = s.colors.length ? s.colors[s.colors.length - 1] : null;
    return '<span class="piece w" title="Blancas"></span>' + s.whites + ' <span class="piece b" title="Negras"></span>' + s.blacks +
      (last ? ' <span class="muted small">(última: ' + (last === 'W' ? 'blancas' : 'negras') + ')</span>' : '');
  }

  function playersTable(t) {
    var stats = JC.computeStats(t);
    var q = ui.query.trim().toLowerCase();
    var list = t.players.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) !== -1; });
    list.sort(ui.sort === 'alpha' ? function (a, b) { return a.name.localeCompare(b.name, 'es'); } : function (a, b) { return a.number - b.number; });
    var started = JC.hasStarted(t);
    if (!list.length) return '<p class="muted">' + (t.players.length ? 'Ningún alumno coincide con la búsqueda.' : 'Aún no hay participantes. Añade al primero con el formulario de arriba.') + '</p>';
    return '<div class="table-wrap"><table><thead><tr><th class="num">Dorsal</th><th>Nombre y apellidos</th><th>Curso y grupo</th><th class="num">Puntos</th>' +
      '<th class="num" title="Partidas disputadas">PJ</th><th class="num">V</th><th class="num">T</th><th class="num">D</th><th>Colores usados</th><th></th></tr></thead><tbody>' +
      list.map(function (p) {
        var s = stats[p.id];
        return '<tr class="' + (p.withdrawn ? 'out' : '') + '"><td class="num">' + p.number + '</td><td><b>' + esc(p.name) + '</b>' + (p.withdrawn ? ' <span class="badge out">Retirado</span>' : '') + '</td>' +
          '<td>' + esc((p.course + ' ' + p.group).trim()) + '</td><td class="num"><b>' + fmt(s.points) + '</b></td><td class="num">' + s.played + '</td><td class="num">' + s.wins + '</td>' +
          '<td class="num">' + s.draws + '</td><td class="num">' + s.losses + '</td><td>' + colorsHtml(s) + '</td><td><div class="btn-row">' +
          '<button class="btn small" data-act="editPlayer" data-id="' + p.id + '">Editar</button>' +
          '<button class="btn small" data-act="playerHistory" data-id="' + p.id + '">Ficha</button>' +
          (started ? '<button class="btn small" data-act="withdraw" data-id="' + p.id + '">' + (p.withdrawn ? 'Reincorporar' : 'Retirar') + '</button>'
            : '<button class="btn danger small" data-act="deletePlayer" data-id="' + p.id + '">Eliminar</button>') + '</div></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function viewPlayers(t) {
    var started = JC.hasStarted(t);
    var full = t.players.length >= JC.MAX_PLAYERS;
    return '<h1>Participantes</h1><div class="card">' +
      (started ? '<div class="note warn">El torneo ya ha empezado, así que no se pueden añadir ni eliminar alumnos. Si alguien abandona, usa «Retirar»: dejará de ser emparejado.</div>' :
        '<form data-form="addPlayer"><div class="form-row"><div class="field"><label for="pn">Nombre y apellidos</label><input type="text" id="pn" name="name" required autocomplete="off"' + (full ? ' disabled' : '') + '></div>' +
        '<div class="field"><label for="pc">Curso</label><input type="text" id="pc" name="course" list="courses" placeholder="1º ESO"' + (full ? ' disabled' : '') + '></div>' +
        '<datalist id="courses"><option>1º ESO</option><option>2º ESO</option><option>3º ESO</option><option>4º ESO</option><option>1º Bachillerato</option><option>2º Bachillerato</option><option>FP Básica</option><option>Ciclo Formativo</option></datalist>' +
        '<div class="field"><label for="pg">Grupo</label><input type="text" id="pg" name="group" placeholder="A"' + (full ? ' disabled' : '') + '></div>' +
        '<div class="field"><button class="btn primary" type="submit"' + (full ? ' disabled' : '') + '>＋ Añadir alumno</button></div></div></form>' +
        '<div class="btn-row"><button class="btn" data-act="importCsv">Importar desde CSV</button></div>' +
        '<p class="help">El dorsal se asigna solo. No hace falta nivel de ajedrez ni Elo. Se admiten entre ' + JC.MIN_PLAYERS + ' y ' + JC.MAX_PLAYERS + ' participantes.</p>') + '</div>' +
      '<div class="card"><div class="form-row"><div><h2 style="margin:0">' + t.players.length + ' inscritos</h2><span class="muted small">máximo ' + JC.MAX_PLAYERS + '</span></div>' +
      '<div class="field" style="margin:0"><label for="q">Buscar por nombre</label><input type="text" id="q" data-bind="query" value="' + esc(ui.query) + '" placeholder="Escribe un nombre…"></div>' +
      '<div class="field" style="margin:0"><label for="so">Ordenar</label><select id="so" data-bind="sort"><option value="number"' + (ui.sort === 'number' ? ' selected' : '') + '>Por dorsal</option><option value="alpha"' + (ui.sort === 'alpha' ? ' selected' : '') + '>Alfabéticamente</option></select></div>' +
      '<div class="field" style="margin:0"><button class="btn" data-act="exportPlayersCsv">Exportar listado (CSV)</button></div></div>' +
      '<div id="playersTable" style="margin-top:12px">' + playersTable(t) + '</div></div>';
  }

  /* ---- Rondas: emparejamientos y resultados ---- */

  function roundPills(t) {
    return '<div class="round-pills">' + t.rounds.map(function (r) {
      return '<button class="pill' + (ui.round === r.number ? ' active' : '') + (r.closed ? '' : ' open') + '" data-act="selectRound" data-round="' + r.number + '">Ronda ' + r.number + '</button>';
    }).join('') + '</div>';
  }

  function genBlock(t) {
    var cur = JC.currentRound(t);
    if (t.finished) return '';
    if (cur && !cur.closed) return '';
    var many = t.players.length;
    return '<div class="note">' + (many < JC.MIN_PLAYERS ? 'Necesitas al menos ' + JC.MIN_PLAYERS + ' participantes para empezar.' :
      cur ? 'La ronda anterior está cerrada. Puedes generar la siguiente.' : 'Cuando estén todos los alumnos inscritos, genera la primera ronda.') +
      '<div style="margin-top:10px"><button class="btn primary big" data-act="genRound"' + (many < JC.MIN_PLAYERS ? ' disabled' : '') + '>Generar ' + (cur ? 'siguiente' : 'primera') + ' ronda</button></div></div>';
  }

  function viewRound(t, mode) {
    var title = mode === 'pairings' ? 'Emparejamientos' : 'Resultados';
    var cur = JC.currentRound(t);
    if (!t.rounds.length) return '<h1>' + title + '</h1><div class="card">' + (genBlock(t) || '') + '</div>';
    if (!ui.round || ui.round > t.rounds.length) ui.round = cur.number;
    var round = t.rounds[ui.round - 1];
    var isCurrentOpen = round === cur && !round.closed;
    var intro = mode === 'pairings' ?
      'Estos son los enfrentamientos de la ronda. «Blancas» mueve primero. Puedes imprimirlos para el tablón del aula.' :
      'Pulsa el botón del resultado de cada tablero. Puedes corregirlo pulsando otro (o el mismo para dejarlo pendiente).';
    var html = '<h1>' + title + ' · Ronda ' + round.number + ' de ' + t.numRounds + '</h1><p class="muted">' + intro + '</p>' + roundPills(t) + genBlock(t);
    if (round.warnings && round.warnings.length) html += '<div class="note warn"><b>Aviso del sistema de emparejamiento:</b><br>' + round.warnings.map(esc).join('<br>') + '</div>';
    if (round.closed) html += '<div class="note warn">Esta ronda está cerrada. ' + (mode === 'results' ? 'Si corriges un resultado se recalculará la clasificación, pero los emparejamientos de las rondas siguientes no cambian.' : '') + '</div>';

    if (mode === 'pairings') {
      html += '<div class="card"><div class="table-wrap"><table><thead><tr><th class="num">Tablero</th><th>Blancas</th><th>Negras</th><th class="num">Resultado</th><th>Estado</th></tr></thead><tbody>' +
        round.games.map(function (g) {
          return '<tr><td class="num"><b>' + g.board + '</b></td><td><span class="piece w"></span>' + esc(pfull(t, g.white)) + '</td><td><span class="piece b"></span>' + esc(pfull(t, g.black)) + '</td>' +
            '<td class="num">' + (g.result ? esc(RES_LABEL[g.result]) : '—') + '</td><td>' + (g.result ? '<span class="badge">Finalizada</span>' : '<span class="badge pending">Pendiente</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        (round.bye ? '<p style="margin-top:12px"><b>Descansa (BYE):</b> ' + esc(pfull(t, round.bye)) + ' <span class="help">— no juega esta ronda y recibe ' + fmt(t.config.bye) + ' punto(s).</span></p>' : '') +
        '<div class="btn-row" style="margin-top:12px"><button class="btn gold" data-act="printPairings" data-round="' + round.number + '">🖨 Imprimir emparejamientos</button>' +
        (isCurrentOpen && !round.games.some(function (g) { return g.result; }) ? '<button class="btn" data-act="regenRound">Volver a emparejar</button>' : '') +
        '<button class="btn" data-act="go" data-view="resultados">Ir a anotar resultados</button></div></div>';
      return html;
    }

    html += '<div class="grid two">' + round.games.map(function (g) {
      var sel = function (r) { return g.result === r ? ' sel' : ''; };
      var isExc = g.result && ['+/-', '-/+', '-/-'].indexOf(g.result) !== -1;
      return '<div class="board-card' + (g.result ? ' done' : '') + '"><h3>TABLERO ' + g.board + ' <span class="badge' + (g.result ? '' : ' pending') + '">' + (g.result ? 'Finalizada' : 'Pendiente') + '</span></h3>' +
        '<div class="vs"><div class="w">⚪ ' + esc(pfull(t, g.white)) + '</div><div class="b">⚫ ' + esc(pfull(t, g.black)) + '</div></div>' +
        '<div class="res-btns"><button class="' + sel('1-0').trim() + '" data-act="setResult" data-round="' + round.number + '" data-board="' + g.board + '" data-res="1-0">Ganan blancas</button>' +
        '<button class="' + sel('1/2').trim() + '" data-act="setResult" data-round="' + round.number + '" data-board="' + g.board + '" data-res="1/2">Tablas</button>' +
        '<button class="' + sel('0-1').trim() + '" data-act="setResult" data-round="' + round.number + '" data-board="' + g.board + '" data-res="0-1">Ganan negras</button></div>' +
        '<select data-change="exceptional" data-round="' + round.number + '" data-board="' + g.board + '" aria-label="Resultado excepcional"><option value="">Resultado excepcional (incomparecencia)…</option>' +
        ['+/-', '-/+', '-/-'].map(function (r) { return '<option value="' + r + '"' + (g.result === r ? ' selected' : '') + '>' + esc(JC.RESULTS[r].label) + '</option>'; }).join('') +
        (isExc ? '<option value="">Quitar resultado</option>' : '') + '</select></div>';
    }).join('') + '</div>';
    if (round.bye) html += '<div class="note" style="margin-top:14px"><b>Descansa (BYE):</b> ' + esc(pfull(t, round.bye)) + ' recibe ' + fmt(t.config.bye) + ' punto(s) sin jugar.</div>';

    if (isCurrentOpen) {
      var pend = JC.pendingGames(round).length;
      var last = round.number >= t.numRounds;
      html += '<div class="close-bar">' + (pend ? '<p class="muted"><b>' + pend + '</b> partida(s) pendiente(s): anota o resuelve cada una antes de cerrar.</p>' : '<p class="muted">Todos los resultados están anotados.</p>') +
        '<button class="btn gold big" data-act="closeRound">' + (last ? 'CERRAR ÚLTIMA RONDA Y FINALIZAR TORNEO' : 'CERRAR RONDA Y GENERAR SIGUIENTE') + '</button></div>';
    } else if (t.finished && round === cur) {
      html += '<div class="note" style="margin-top:14px">🏁 El torneo ha terminado. <button class="btn primary small" data-act="go" data-view="clasificacion">Ver clasificación final</button></div>';
    }
    return html;
  }

  /* ---- Clasificación ---- */

  function standingCols(t) {
    var cols = [['points', 'Puntos'], ['wins', 'V'], ['draws', 'T'], ['losses', 'D'], ['buchholz', 'Buchholz'], ['buchholzMedian', 'Buch. mediano'], ['progressive', 'Progresivo']];
    (t.config.tiebreaks || []).forEach(function (k) {
      if (k === 'buchholzCut1') cols.push(['buchholzCut1', 'Buch. con corte']);
      if (k === 'sonneborn') cols.push(['sonneborn', 'Sonneborn-B.']);
    });
    return cols;
  }
  function standingsTable(t, rows) {
    var cols = standingCols(t);
    var used = t.config.tiebreaks || [];
    return '<div class="table-wrap"><table><thead><tr><th class="num">Puesto</th><th>Nombre</th>' +
      cols.map(function (c) { return '<th class="num">' + c[1] + (used.indexOf(c[0]) !== -1 && c[0] !== 'points' ? ' ★' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        var cls = r.rank === 1 ? 'gold' : r.rank === 2 ? 'silver' : r.rank === 3 ? 'bronze' : '';
        return '<tr class="' + cls + (r.player.withdrawn ? ' out' : '') + '"><td class="num">' + (r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] + ' ' : '') + r.rank + '</td><td>' + esc(r.name) + (r.player.withdrawn ? ' <span class="badge out">Retirado</span>' : '') + '</td>' +
          cols.map(function (c) { return '<td class="num">' + (c[0] === 'wins' || c[0] === 'draws' || c[0] === 'losses' ? r[c[0]] : fmt(r[c[0]])) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  function podium(rows) {
    var med = ['🥇', '🥈', '🥉'];
    var top = rows.filter(function (r) { return r.rank <= 3; }).slice(0, 3);
    return '<div class="podium">' + top.map(function (r) {
      return '<div class="p g' + r.rank + '"><div class="medal">' + med[r.rank - 1] + '</div><b>' + esc(r.name) + '</b><div>' + fmt(r.points) + ' puntos</div><div class="small muted">' + esc((r.player.course + ' ' + r.player.group).trim()) + '</div></div>';
    }).join('') + '</div>';
  }

  function viewStandings(t) {
    var rows = JC.standings(t);
    var played = t.rounds.some(function (r) { return r.games.some(function (g) { return g.result; }); });
    var names = (t.config.tiebreaks || []).filter(function (k) { return k !== 'none'; }).map(function (k) { return JC.TIEBREAKS[k]; });
    return '<h1>Clasificación ' + (t.finished ? 'final' : 'provisional') + '</h1>' +
      (played ? podium(rows) : '<div class="note">La clasificación se rellenará cuando se anoten resultados.</div>') +
      '<div class="card">' + standingsTable(t, rows) +
      '<details style="margin-top:12px"><summary><b>¿Cómo se ordena?</b></summary><p class="help">Primero por puntos (victoria ' + fmt(t.config.win) + ', tablas ' + fmt(t.config.draw) + ', derrota ' + fmt(t.config.loss) + ', descanso ' + fmt(t.config.bye) + '). ' +
      'Si hay empate, se aplican los desempates marcados con ★ en este orden: ' + (names.length ? esc(names.join(' → ')) : 'ninguno') + '. Después, por dorsal. ' +
      'El <b>Buchholz</b> suma los puntos de los rivales con los que se ha jugado (los descansos e incomparecencias no cuentan). El <b>progresivo</b> suma los puntos acumulados tras cada ronda. Puedes cambiar los criterios en Configuración.</p></details>' +
      '<div class="btn-row" style="margin-top:12px"><button class="btn gold" data-act="printStandings">🖨 Imprimir clasificación</button><button class="btn" data-act="exportStandingsCsv">Exportar (CSV)</button></div></div>';
  }

  /* ---- Historial ---- */

  function recordLabel(t, rec) {
    if (rec.outcome === 'bye') return 'Descanso (BYE)';
    if (!rec.result) return 'Pendiente';
    var base = rec.outcome === 'win' ? 'Victoria' : rec.outcome === 'draw' ? 'Tablas' : 'Derrota';
    return base + (rec.played === false ? ' (incomparecencia/nulo)' : '');
  }
  function playerHistoryTable(t, id) {
    var stats = JC.computeStats(t), s = stats[id];
    if (!s) return '';
    var cum = 0;
    var rows = s.records.slice().sort(function (a, b) { return a.round - b.round; }).map(function (rec) {
      cum += rec.points;
      return '<tr><td class="num">' + rec.round + '</td><td>' + (rec.opponent ? esc(pfull(t, rec.opponent)) : '—') + '</td><td>' +
        (rec.color ? (rec.color === 'W' ? 'Blancas' : 'Negras') : '—') + '</td><td>' + esc(recordLabel(t, rec)) + '</td><td class="num">' + fmt(rec.points) + '</td><td class="num"><b>' + fmt(cum) + '</b></td></tr>';
    }).join('');
    var rank = JC.standings(t).filter(function (r) { return r.id === id; })[0];
    return '<p><b>' + esc(s.name) + '</b> · ' + esc((s.player.course + ' ' + s.player.group).trim()) + ' · Dorsal ' + s.number + (rank ? ' · Puesto actual: ' + rank.rank : '') + '</p>' +
      '<p>Puntos: <b>' + fmt(s.points) + '</b> · Partidas jugadas: ' + s.played + ' · Ganadas: ' + s.wins + ' · Tablas: ' + s.draws + ' · Perdidas: ' + s.losses + ' · Descansos: ' + s.byes + '</p>' +
      '<div class="table-wrap"><table><thead><tr><th class="num">Ronda</th><th>Rival</th><th>Color</th><th>Resultado</th><th class="num">Puntos</th><th class="num">Acumulado</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="muted">Todavía no ha jugado ninguna ronda.</td></tr>') + '</tbody></table></div>';
  }
  function roundResultsTable(t, round) {
    return '<div class="table-wrap"><table><thead><tr><th class="num">Tablero</th><th>Blancas</th><th>Negras</th><th class="num">Resultado</th></tr></thead><tbody>' +
      round.games.map(function (g) {
        return '<tr><td class="num">' + g.board + '</td><td>' + esc(pfull(t, g.white)) + '</td><td>' + esc(pfull(t, g.black)) + '</td><td class="num">' + (g.result ? esc(RES_LABEL[g.result]) : 'Pendiente') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (round.bye ? '<p><b>Descansa:</b> ' + esc(pfull(t, round.bye)) + '</p>' : '');
  }

  function viewHistory(t) {
    if (!t.rounds.length) return '<h1>Historial</h1><div class="note">Aún no hay rondas. Genera la primera para empezar el historial.</div>';
    if (!ui.histRound || ui.histRound > t.rounds.length) ui.histRound = t.rounds.length;
    var round = t.rounds[ui.histRound - 1];
    var pills = '<div class="round-pills">' + t.rounds.map(function (r) {
      return '<button class="pill' + (ui.histRound === r.number ? ' active' : '') + '" data-act="histRound" data-round="' + r.number + '">Ronda ' + r.number + '</button>';
    }).join('') + '</div>';
    var opts = t.players.map(function (p) { return '<option value="' + p.id + '"' + (ui.histPlayer === p.id ? ' selected' : '') + '>' + p.number + '. ' + esc(p.name) + '</option>'; }).join('');
    return '<h1>Historial del torneo</h1>' + pills +
      '<div class="grid two"><div class="card"><h2>Emparejamientos y resultados · Ronda ' + round.number + '</h2>' + roundResultsTable(t, round) + '</div>' +
      '<div class="card"><h2>Clasificación tras la ronda ' + round.number + '</h2>' + standingsTable(t, JC.standings(t, round.number)) + '</div></div>' +
      '<div class="card"><h2>Trayectoria de un participante</h2><div class="field"><label for="hp">Elige un alumno</label><select id="hp" data-bind="histPlayer"><option value="">— Selecciona —</option>' + opts + '</select></div>' +
      '<div id="histPlayerBox">' + (ui.histPlayer ? playerHistoryTable(t, ui.histPlayer) : '<p class="muted">Selecciona un alumno para ver todas sus partidas.</p>') + '</div></div>';
  }

  /* ---- Informes ---- */

  function repHead(t, title) {
    return '<div class="rep-head"><img class="rep-logo" src="assets/logo-centro.png" alt="IES Marqués de Comares"><div class="rep-brand">JAQUE COMARES</div><div>' + CENTER + '</div><h1>' + esc(title) + '</h1>' +
      '<div>' + esc(t.name) + (t.date ? ' · ' + esc(fmtDate(t.date)) : '') + ' · Sistema suizo · ' + esc(t.timeControl) + '</div></div>';
  }
  function repStandings(t) {
    return '<section class="report">' + repHead(t, 'Clasificación ' + (t.finished ? 'final' : 'provisional')) + standingsTable(t, JC.standings(t)) + '</section>';
  }
  function repPlayers(t) {
    var stats = JC.computeStats(t);
    return '<section class="report">' + repHead(t, 'Listado de participantes') + '<p>' + t.players.length + ' inscritos</p><table><thead><tr><th>Dorsal</th><th>Nombre y apellidos</th><th>Curso y grupo</th><th>Puntos</th><th>PJ</th><th>V</th><th>T</th><th>D</th></tr></thead><tbody>' +
      t.players.map(function (p) { var s = stats[p.id]; return '<tr><td>' + p.number + '</td><td>' + esc(p.name) + (p.withdrawn ? ' (retirado)' : '') + '</td><td>' + esc((p.course + ' ' + p.group).trim()) + '</td><td>' + fmt(s.points) + '</td><td>' + s.played + '</td><td>' + s.wins + '</td><td>' + s.draws + '</td><td>' + s.losses + '</td></tr>'; }).join('') + '</tbody></table></section>';
  }
  function repPairings(t, n) {
    var r = t.rounds[n - 1];
    if (!r) return '';
    return '<section class="report">' + repHead(t, 'Emparejamientos · Ronda ' + n + ' de ' + t.numRounds) +
      '<table><thead><tr><th>Tablero</th><th>Blancas</th><th>Negras</th><th>Resultado</th></tr></thead><tbody>' +
      r.games.map(function (g) { return '<tr><td>' + g.board + '</td><td>' + esc(pfull(t, g.white)) + '</td><td>' + esc(pfull(t, g.black)) + '</td><td style="width:90px">' + (g.result ? esc(RES_LABEL[g.result]) : '') + '</td></tr>'; }).join('') +
      '</tbody></table>' + (r.bye ? '<p><b>Descansa:</b> ' + esc(pfull(t, r.bye)) + '</p>' : '') + '<p>Ritmo de juego: ' + esc(t.timeControl) + '. Blancas mueve primero.</p></section>';
  }
  function repResults(t, n) {
    var r = t.rounds[n - 1];
    if (!r) return '';
    return '<section class="report">' + repHead(t, 'Resultados · Ronda ' + n) + roundResultsTable(t, r) + '<h2>Clasificación tras la ronda ' + n + '</h2>' + standingsTable(t, JC.standings(t, n)) + '</section>';
  }
  function repCard(t, id) {
    return '<section class="report avoid">' + repHead(t, 'Ficha individual') + playerHistoryTable(t, id) + '</section>';
  }
  function repGeneral(t) {
    var c = t.config;
    var h = '<section class="report">' + repHead(t, 'Informe general del torneo') +
      '<p>Participantes: <b>' + t.players.length + '</b> · Rondas: <b>' + t.rounds.length + ' de ' + t.numRounds + '</b> · Estado: <b>' + (t.finished ? 'finalizado' : 'en curso') + '</b></p>' +
      '<p>Puntuación: victoria ' + fmt(c.win) + ', tablas ' + fmt(c.draw) + ', derrota ' + fmt(c.loss) + ', descanso ' + fmt(c.bye) + '. Desempates: ' +
      esc((c.tiebreaks || []).filter(function (k) { return k !== 'none'; }).map(function (k) { return JC.TIEBREAKS[k]; }).join(' → ') || 'ninguno') + '.</p>' +
      '<p class="small">Emparejamientos generados con un sistema suizo propio inspirado en el sistema holandés; no está homologado por la FIDE.</p>' +
      '<h2>Clasificación ' + (t.finished ? 'final' : 'provisional') + '</h2>' + standingsTable(t, JC.standings(t));
    t.rounds.forEach(function (r) { h += '<div class="avoid"><h2>Ronda ' + r.number + '</h2>' + roundResultsTable(t, r) + '</div>'; });
    return h + '</section>';
  }

  function viewReports(t) {
    var rOpts = t.rounds.map(function (r) { return '<option value="' + r.number + '">Ronda ' + r.number + '</option>'; }).join('');
    var pOpts = t.players.map(function (p) { return '<option value="' + p.id + '">' + p.number + '. ' + esc(p.name) + '</option>'; }).join('');
    var hasR = t.rounds.length > 0;
    return '<h1>Informes y exportación</h1><div class="note">Elige un informe para verlo aquí. Con «Imprimir / Guardar como PDF» se abre el cuadro de impresión del navegador: elige tu impresora o «Guardar como PDF».</div>' +
      '<div class="grid two"><div class="card"><h2>Informes</h2><div class="btn-row">' +
      '<button class="btn" data-act="report" data-kind="standings">Clasificación' + (t.finished ? ' final' : '') + '</button>' +
      '<button class="btn" data-act="report" data-kind="players">Listado de participantes</button>' +
      '<button class="btn" data-act="report" data-kind="general">Informe general</button></div>' +
      '<div class="form-row" style="margin-top:14px"><div class="field"><label for="rr">Ronda</label><select id="rr"' + (hasR ? '' : ' disabled') + '>' + rOpts + '</select></div>' +
      '<div class="field"><button class="btn" data-act="report" data-kind="pairings"' + (hasR ? '' : ' disabled') + '>Emparejamientos</button></div>' +
      '<div class="field"><button class="btn" data-act="report" data-kind="results"' + (hasR ? '' : ' disabled') + '>Resultados</button></div></div>' +
      '<div class="form-row"><div class="field"><label for="rp">Alumno</label><select id="rp"' + (t.players.length ? '' : ' disabled') + '>' + pOpts + '</select></div>' +
      '<div class="field"><button class="btn" data-act="report" data-kind="card"' + (t.players.length ? '' : ' disabled') + '>Ficha individual</button></div>' +
      '<div class="field"><button class="btn" data-act="report" data-kind="cards"' + (t.players.length ? '' : ' disabled') + '>Todas las fichas</button></div></div></div>' +
      '<div class="card"><h2>Exportar datos</h2><div class="btn-row"><button class="btn" data-act="exportStandingsCsv">Clasificación (CSV)</button><button class="btn" data-act="exportPlayersCsv">Participantes (CSV)</button>' +
      '<button class="btn" data-act="exportOne" data-id="' + t.id + '">Copia de seguridad de este torneo (JSON)</button><button class="btn" data-act="exportAll">Copia de seguridad de todos (JSON)</button></div>' +
      '<p class="help">Los CSV se abren con Excel o LibreOffice. Las copias JSON se importan desde la portada.</p></div></div>' +
      (ui.report ? '<div class="btn-row" style="margin-bottom:12px"><button class="btn gold big" data-act="printReport">🖨 Imprimir / Guardar como PDF</button></div>' + ui.report : '');
  }

  /* ---- Configuración ---- */

  function tbSelect(name, val) {
    return '<select name="' + name + '">' + Object.keys(JC.TIEBREAKS).map(function (k) { return '<option value="' + k + '"' + (val === k ? ' selected' : '') + '>' + esc(JC.TIEBREAKS[k]) + '</option>'; }).join('') + '</select>';
  }
  function viewConfig(t) {
    var c = t.config, tb = c.tiebreaks;
    return '<h1>Configuración</h1><form data-form="config"><div class="card"><h2>Datos del torneo</h2><div class="form-row">' +
      '<div class="field"><label for="cn">Nombre</label><input type="text" id="cn" name="name" value="' + esc(t.name) + '" required></div>' +
      '<div class="field"><label for="cd">Fecha</label><input type="date" id="cd" name="date" value="' + esc(t.date) + '"></div>' +
      '<div class="field"><label for="cr">Número de rondas</label><input type="number" id="cr" name="numRounds" min="' + Math.max(1, t.rounds.length) + '" max="39" value="' + t.numRounds + '">' +
      '<span class="help">Recomendado para ' + t.players.length + ' participantes: ' + JC.recommendedRounds(t.players.length) + ' rondas.</span></div></div>' +
      '<p class="help"><b>Modalidad:</b> sistema suizo · <b>Ritmo:</b> ' + esc(t.timeControl) + ' (rápidas).</p></div>' +
      '<div class="card"><h2>Puntuación</h2><div class="form-row">' +
      '<div class="field"><label for="pw">Victoria</label><input type="number" step="0.5" min="0" id="pw" name="win" value="' + c.win + '"></div>' +
      '<div class="field"><label for="pd">Tablas</label><input type="number" step="0.5" min="0" id="pd" name="draw" value="' + c.draw + '"></div>' +
      '<div class="field"><label for="pl">Derrota</label><input type="number" step="0.5" min="0" id="pl" name="loss" value="' + c.loss + '"></div>' +
      '<div class="field"><label for="pb">Descanso (BYE)</label><input type="number" step="0.5" min="0" id="pb" name="bye" value="' + c.bye + '"></div></div>' +
      '<p class="help">El <b>descanso</b> se asigna cuando hay un número impar de participantes: ese alumno no juega la ronda y cobra esos puntos.</p></div>' +
      '<div class="card"><h2>Criterios de desempate</h2><p class="help">Se aplican por orden cuando dos alumnos tienen los mismos puntos.</p><div class="form-row">' +
      '<div class="field"><label>1.º desempate</label>' + tbSelect('tb0', tb[0] || 'none') + '</div><div class="field"><label>2.º desempate</label>' + tbSelect('tb1', tb[1] || 'none') + '</div>' +
      '<div class="field"><label>3.º desempate</label>' + tbSelect('tb2', tb[2] || 'none') + '</div></div></div>' +
      '<div class="btn-row"><button class="btn primary big" type="submit">Guardar configuración</button></div></form>' +
      '<div class="card" style="margin-top:18px"><h2>Zona delicada</h2><p class="help">Todo se puede deshacer con «Deshacer» mientras no cierres la página.</p>' +
      '<button class="btn danger" data-act="deleteTournament" data-id="' + t.id + '">Eliminar este torneo</button></div>' +
      '<div class="note" style="margin-top:18px"><b>Sobre el sistema de emparejamiento:</b> JAQUE COMARES usa un sistema suizo propio, inspirado en el sistema holandés (Dutch): grupos por puntos, ' +
      'mitad superior contra mitad inferior, descensos, sin repetir rival ni descanso y equilibrando colores. No está homologado ni certificado por la FIDE.</div>';
  }

  /* ============================ Acciones ============================ */

  function printHtml(html) {
    $('printArea').innerHTML = html;
    window.print();
  }
  function reportHtml(kind, t) {
    var rr = $('rr') ? Number($('rr').value) : 0, rp = $('rp') ? $('rp').value : '';
    if (kind === 'standings') return repStandings(t);
    if (kind === 'players') return repPlayers(t);
    if (kind === 'general') return repGeneral(t);
    if (kind === 'pairings') return repPairings(t, rr);
    if (kind === 'results') return repResults(t, rr);
    if (kind === 'card') return repCard(t, rp);
    if (kind === 'cards') return t.players.map(function (p, i) { return i ? '<div class="pb">' + repCard(t, p.id) + '</div>' : repCard(t, p.id); }).join('');
    return '';
  }

  function tournamentFormHtml() {
    return '<div class="field"><label for="tn">Nombre del torneo</label><input type="text" id="tn" name="name" required value="Torneo de ajedrez ' + new Date().getFullYear() + '"></div>' +
      '<div class="form-row"><div class="field"><label for="td">Fecha</label><input type="date" id="td" name="date" value="' + today() + '"></div>' +
      '<div class="field"><label for="te">Número de participantes</label><input type="number" id="te" name="expected" min="2" max="40" value="20" data-recalc="1"></div></div>' +
      '<div class="form-row"><div class="field"><label for="tr">Número de rondas</label><input type="number" id="tr" name="rounds" min="1" max="39" value="' + JC.recommendedRounds(20) + '"></div>' +
      '<div class="field"><label>Modalidad</label><input type="text" value="Sistema suizo" disabled></div></div>' +
      '<p id="recText" class="help"></p>' +
      '<div class="field"><label>Ritmo de juego</label><input type="text" value="Partidas rápidas: 6 minutos + 3 segundos de incremento por jugada" disabled></div>' +
      '<div class="note small">Sistema suizo: los jugadores se enfrentan en cada ronda a participantes con puntuaciones similares, evitando repetir enfrentamientos siempre que sea posible.</div>';
  }
  function updateRecommendation() {
    var te = $('te'), tr = $('tr'), rt = $('recText');
    if (!te || !rt) return;
    var n = Number(te.value) || 0, rec = JC.recommendedRounds(n);
    rt.textContent = n >= 2 ? 'Recomendación para ' + n + ' participantes: ' + rec + ' rondas (suficientes para que destaquen los mejores). Puedes cambiarlo.' : '';
    if (tr && !tr.dataset.touched && rec) tr.value = rec;
  }

  var actions = {
    go: function (el) { ui.view = el.dataset.view; render(); window.scrollTo(0, 0); },
    undo: undo,
    newTournament: function () {
      openDialog('Crear torneo', tournamentFormHtml(), {
        ok: 'Crear torneo',
        onOk: function (f) {
          var name = f.elements.name.value.trim(), exp = Number(f.elements.expected.value), rounds = Number(f.elements.rounds.value);
          if (!name) { toast('Escribe un nombre para el torneo.', 'error'); return false; }
          if (!(exp >= 2 && exp <= JC.MAX_PLAYERS)) { toast('El número de participantes debe estar entre 2 y ' + JC.MAX_PLAYERS + '.', 'error'); return false; }
          if (!(rounds >= 1 && rounds <= 39)) { toast('El número de rondas debe ser al menos 1.', 'error'); return false; }
          mutate('crear torneo', function () {
            var t = JC.createTournament({ name: name, date: f.elements.date.value, expectedPlayers: exp, numRounds: rounds });
            store.tournaments.push(t); store.activeId = t.id;
            ui.view = 'participantes'; ui.round = null; ui.report = null; ui.histPlayer = null;
          });
          toast('Torneo creado. Ahora introduce a los participantes.');
        }
      });
      updateRecommendation();
    },
    openTournament: function (el) { store.activeId = el.dataset.id; ui.view = 'panel'; ui.round = null; ui.report = null; ui.histPlayer = null; ui.histRound = null; save(); render(); },
    deleteTournament: function (el) {
      var t = store.tournaments.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (!t) return;
      confirmBox('Eliminar torneo', '¿Seguro que quieres eliminar «' + esc(t.name) + '» con todos sus datos? Podrás deshacerlo con «Deshacer» hasta que cierres la página.', 'Eliminar', function () {
        mutate('eliminar torneo', function () {
          store.tournaments = store.tournaments.filter(function (x) { return x.id !== t.id; });
          if (store.activeId === t.id) store.activeId = null;
          ui.view = 'cover';
        });
      }, true);
    },
    exportAll: function () { download('jaque-comares-copia-' + today() + '.json', JC.exportBackup(store), 'application/json'); toast('Copia de seguridad descargada.'); },
    exportOne: function (el) {
      var t = store.tournaments.filter(function (x) { return x.id === el.dataset.id; })[0];
      if (t) { download('jaque-comares-' + slug(t.name) + '-' + today() + '.json', JC.exportBackup(store, t.id), 'application/json'); toast('Copia de seguridad descargada.'); }
    },
    importBackup: function () { $('fileBackup').click(); },
    editPlayer: function (el) {
      var t = active(), p = JC.playerById(t, el.dataset.id);
      openDialog('Editar participante', '<div class="field"><label>Nombre y apellidos</label><input type="text" name="name" value="' + esc(p.name) + '"></div>' +
        '<div class="form-row"><div class="field"><label>Curso</label><input type="text" name="course" value="' + esc(p.course) + '"></div><div class="field"><label>Grupo</label><input type="text" name="group" value="' + esc(p.group) + '"></div></div>', {
        ok: 'Guardar',
        onOk: function (f) {
          if (!f.elements.name.value.trim()) { toast('El nombre no puede estar vacío.', 'error'); return false; }
          mutate('editar participante', function () { JC.updatePlayer(t, p.id, { name: f.elements.name.value, course: f.elements.course.value, group: f.elements.group.value }); });
        }
      });
    },
    deletePlayer: function (el) {
      var t = active(), p = JC.playerById(t, el.dataset.id);
      confirmBox('Eliminar participante', '¿Eliminar a <b>' + esc(p.name) + '</b> de la lista? Los dorsales se renumerarán.', 'Eliminar', function () {
        mutate('eliminar participante', function () { JC.removePlayer(t, p.id); });
      }, true);
    },
    withdraw: function (el) {
      var t = active(), p = JC.playerById(t, el.dataset.id);
      if (p.withdrawn) { mutate('reincorporar participante', function () { JC.setWithdrawn(t, p.id, false); }); return; }
      confirmBox('Retirar participante', '<b>' + esc(p.name) + '</b> dejará de ser emparejado en las próximas rondas. Si tiene una partida pendiente en la ronda actual, resuélvela como incomparecencia. Sus puntos se conservan.', 'Retirar', function () {
        mutate('retirar participante', function () { JC.setWithdrawn(t, p.id, true); });
      });
    },
    playerHistory: function (el) { ui.histPlayer = el.dataset.id; ui.view = 'historial'; render(); window.scrollTo(0, 0); },
    importCsv: function () {
      openDialog('Importar participantes desde CSV',
        '<p class="help">Una línea por alumno con las columnas <b>nombre y apellidos; curso; grupo</b> (separadas por «;», coma o tabulador). Si el nombre lleva coma, ponlo entre comillas. La primera línea puede ser una cabecera.</p>' +
        '<div class="field"><label>Archivo CSV</label><input type="file" id="csvFile" accept=".csv,.txt"></div><div class="field"><label for="csvText">…o pega aquí el contenido</label><textarea id="csvText" name="text" placeholder="Ana García López;1º ESO;A"></textarea></div>', {
        ok: 'Importar',
        onOk: function (f) {
          var go = function (text) {
            var res = JC.parseCSV(text), t = active();
            if (!res.rows.length) { toast('No se ha encontrado ningún alumno en el CSV.', 'error'); return; }
            var room = JC.MAX_PLAYERS - t.players.length;
            if (res.rows.length > room) { toast('Hay demasiados alumnos: caben ' + room + ' más (máximo ' + JC.MAX_PLAYERS + ').', 'error'); return; }
            mutate('importar CSV', function () { res.rows.forEach(function (r) { JC.addPlayer(t, r); }); });
            toast(res.rows.length + ' alumnos importados' + (res.skipped ? ' (' + res.skipped + ' líneas ignoradas)' : '') + '.');
          };
          var file = $('csvFile').files[0];
          if (file) { var fr = new FileReader(); fr.onload = function () { go(fr.result); }; fr.readAsText(file, 'utf-8'); }
          else if (f.elements.text.value.trim()) go(f.elements.text.value);
          else { toast('Elige un archivo o pega el contenido.', 'error'); return false; }
        }
      });
    },
    exportPlayersCsv: function () {
      var t = active(), stats = JC.computeStats(t);
      var lines = ['Dorsal;Nombre;Curso;Grupo;Puntos;PJ;V;T;D;Blancas;Negras'].concat(t.players.map(function (p) {
        var s = stats[p.id];
        return [p.number, p.name, p.course, p.group, s.points, s.played, s.wins, s.draws, s.losses, s.whites, s.blacks].map(csvCell).join(';');
      }));
      download('participantes-' + slug(t.name) + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    },
    exportStandingsCsv: function () {
      var t = active(), cols = standingCols(t);
      var lines = [['Puesto', 'Nombre', 'Curso', 'Grupo'].concat(cols.map(function (c) { return c[1]; })).map(csvCell).join(';')].concat(JC.standings(t).map(function (r) {
        return [r.rank, r.name, r.player.course, r.player.group].concat(cols.map(function (c) { return r[c[0]]; })).map(csvCell).join(';');
      }));
      download('clasificacion-' + slug(t.name) + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    },
    genRound: function () {
      var t = active();
      var ok = mutate('generar ronda', function () { JC.generateRound(t); ui.round = t.rounds.length; });
      if (ok) { ui.view = 'emparejamientos'; render(); window.scrollTo(0, 0); toast('Ronda ' + t.rounds.length + ' generada.'); }
    },
    regenRound: function () {
      var t = active();
      mutate('volver a emparejar', function () { JC.regenerateCurrentRound(t); ui.round = t.rounds.length; });
    },
    selectRound: function (el) { ui.round = Number(el.dataset.round); render(); },
    histRound: function (el) { ui.histRound = Number(el.dataset.round); render(); },
    setResult: function (el) {
      var t = active(), n = Number(el.dataset.round), b = Number(el.dataset.board), res = el.dataset.res;
      var g = t.rounds[n - 1].games.filter(function (x) { return x.board === b; })[0];
      var apply = function () { mutate('resultado tablero ' + b, function () { JC.setResult(t, n, b, g.result === res ? null : res); }); };
      guardClosed(t, n, apply);
    },
    closeRound: function () {
      var t = active(), cur = JC.currentRound(t);
      var pend = JC.pendingGames(cur);
      if (pend.length) {
        toast('No se puede cerrar: faltan resultados en los tableros ' + pend.map(function (g) { return g.board; }).join(', ') + '.', 'error');
        return;
      }
      var last = cur.number >= t.numRounds;
      confirmBox('Cerrar ronda ' + cur.number, last ? 'Es la última ronda. Se cerrará y el torneo quedará <b>finalizado</b> con la clasificación final.' :
        'Se actualizará la clasificación y se generarán los emparejamientos de la ronda ' + (cur.number + 1) + '. ¿Todos los resultados son correctos?', last ? 'Cerrar y finalizar' : 'Cerrar y generar', function () {
        var done = mutate('cerrar ronda ' + cur.number, function () { JC.closeRound(t); ui.round = JC.currentRound(t).number; });
        if (!done) return;
        if (t.finished) { ui.view = 'clasificacion'; render(); toast('¡Torneo finalizado! Aquí está la clasificación final.'); }
        else { ui.view = 'emparejamientos'; render(); toast('Ronda ' + cur.number + ' cerrada. Ronda ' + (cur.number + 1) + ' generada.'); }
        window.scrollTo(0, 0);
      });
    },
    report: function (el) { var t = active(); ui.report = reportHtml(el.dataset.kind, t); render(); var r = document.querySelector('#main .report'); if (r) r.scrollIntoView({ behavior: 'smooth' }); },
    printReport: function () { if (ui.report) printHtml(ui.report); },
    printPairings: function (el) { printHtml(repPairings(active(), Number(el.dataset.round))); },
    printStandings: function () { printHtml(repStandings(active())); }
  };

  /** Pide confirmación antes de modificar una ronda ya cerrada (una vez por ronda). */
  function guardClosed(t, n, apply) {
    var key = t.id + ':' + n;
    if (t.rounds[n - 1].closed && !ui.confirmedRounds[key]) {
      confirmBox('Corregir una ronda cerrada', 'Esta ronda ya está cerrada. Corregir el resultado actualizará puntos y clasificación, pero <b>no</b> vuelve a calcular los emparejamientos de las rondas siguientes. ¿Continuar?', 'Sí, corregir', function () { ui.confirmedRounds[key] = true; apply(); });
    } else apply();
  }

  /* ============================ Eventos ============================ */

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset.change === 'exceptional') {
      var t = active(), n = Number(el.dataset.round), b = Number(el.dataset.board), val = el.value || null;
      guardClosed(t, n, function () { mutate('resultado tablero ' + b, function () { JC.setResult(t, n, b, val); }); });
      render();
    }
    if (el.id === 'fileBackup' && el.files[0]) {
      var fr = new FileReader();
      fr.onload = function () {
        var snap = snapshot();
        try {
          var count = JC.importBackup(store, fr.result);
          undoStack.push({ label: 'importar copia', snap: snap });
          save(); ui.view = 'cover'; render();
          toast(count + ' torneo(s) importado(s).');
        } catch (err) { restore(snap); toast(err.message, 'error'); }
      };
      fr.readAsText(el.files[0]);
      el.value = '';
    }
    if (el.dataset.bind === 'sort') { ui.sort = el.value; var tb = $('playersTable'); if (tb) tb.innerHTML = playersTable(active()); }
    if (el.dataset.bind === 'histPlayer') { ui.histPlayer = el.value; var hb = $('histPlayerBox'); if (hb) hb.innerHTML = el.value ? playerHistoryTable(active(), el.value) : '<p class="muted">Selecciona un alumno para ver todas sus partidas.</p>'; }
  });

  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset.bind === 'query') { ui.query = el.value; var tb = $('playersTable'); if (tb) tb.innerHTML = playersTable(active()); }
    if (el.dataset.recalc) updateRecommendation();
    if (el.id === 'tr') el.dataset.touched = '1';
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.dataset || !f.dataset.form) return;
    e.preventDefault();
    var t = active();
    if (f.dataset.form === 'addPlayer') {
      var d = { name: f.elements.name.value, course: f.elements.course.value, group: f.elements.group.value };
      if (mutate('añadir participante', function () { JC.addPlayer(t, d); })) {
        var n = $('pn'); if (n) n.focus();
      }
    } else if (f.dataset.form === 'config') {
      var el = f.elements, rounds = Number(el.numRounds.value);
      var name = el.name.value.trim();
      if (!name) { toast('El nombre no puede estar vacío.', 'error'); return; }
      mutate('cambiar configuración', function () {
        if (!(rounds >= Math.max(1, t.rounds.length)) || rounds > 39) throw new Error('El número de rondas debe estar entre ' + Math.max(1, t.rounds.length) + ' y 39.');
        t.name = name; t.date = el.date.value; t.numRounds = rounds;
        ['win', 'draw', 'loss', 'bye'].forEach(function (k) {
          var v = Number(el[k].value);
          if (!(v >= 0)) throw new Error('Los puntos no pueden ser negativos.');
          t.config[k] = v;
        });
        t.config.tiebreaks = [el.tb0.value, el.tb1.value, el.tb2.value].filter(function (k, i, a) { return k !== 'none' && a.indexOf(k) === i; });
        var last = JC.currentRound(t);
        t.finished = !!(last && last.closed && t.rounds.length >= t.numRounds);
      });
      toast('Configuración guardada.');
    }
  });

  /* ============================ Arranque ============================ */

  window.addEventListener('storage', function (e) {
    if (e.key && e.key.indexOf('jaque-comares') === 0) { store = JC.loadStore(window.localStorage); render(); }
  });
  if (!active()) store.activeId = null;
  ui.view = active() ? 'panel' : 'cover';
  render();
})();



