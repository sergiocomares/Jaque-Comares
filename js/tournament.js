/*
 * JAQUE COMARES - Modelo del torneo: jugadores, rondas, resultados, clasificación y almacenamiento.
 * Todo el estado de puntuaciones se CALCULA a partir de los resultados de las partidas,
 * por lo que corregir un resultado nunca deja datos inconsistentes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./swiss.js'));
  else root.JC = factory(root.Swiss);
})(typeof self !== 'undefined' ? self : this, function (Swiss) {
  'use strict';

  var MAX_PLAYERS = 40, MIN_PLAYERS = 2;
  var STORE_KEY = 'jaque-comares:v1';

  // Resultados posibles de una partida (null = pendiente).
  var RESULTS = {
    '1-0': { label: 'Ganan blancas', w: 'win', b: 'loss', played: true },
    '1/2': { label: 'Tablas', w: 'draw', b: 'draw', played: true },
    '0-1': { label: 'Ganan negras', w: 'loss', b: 'win', played: true },
    '+/-': { label: 'Incomparecencia: gana blancas', w: 'win', b: 'loss', played: false },
    '-/+': { label: 'Incomparecencia: gana negras', w: 'loss', b: 'win', played: false },
    '-/-': { label: 'Ninguno puntúa (no se juega)', w: 'loss', b: 'loss', played: false }
  };

  var TIEBREAKS = {
    none: 'Ninguno',
    wins: 'Número de victorias',
    buchholz: 'Buchholz (suma de puntos de los rivales)',
    buchholzCut1: 'Buchholz con corte (sin el peor rival)',
    buchholzMedian: 'Buchholz mediano (sin el mejor y el peor rival)',
    progressive: 'Progresivo (suma de puntos tras cada ronda)',
    sonneborn: 'Sonneborn-Berger (puntos de rivales vencidos)'
  };

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function recommendedRounds(n) {
    if (n < 2) return 0;
    var r = Math.ceil(Math.log(n) / Math.LN2);
    return Math.max(1, Math.min(r, n % 2 ? n : n - 1));
  }

  function createTournament(opts) {
    return {
      id: uid(),
      name: String(opts.name || 'Torneo').trim(),
      date: opts.date || '',
      expectedPlayers: Number(opts.expectedPlayers) || 0,
      numRounds: Number(opts.numRounds) || 1,
      mode: 'suizo',
      timeControl: '6 min + 3 s por jugada',
      config: {
        win: 1, draw: 0.5, loss: 0, bye: 1,
        tiebreaks: ['buchholz', 'buchholzMedian', 'progressive']
      },
      players: [],
      rounds: [],
      finished: false,
      createdAt: new Date().toISOString()
    };
  }

  /* ------------------------------ Jugadores ------------------------------ */

  function playerById(t, id) {
    for (var i = 0; i < t.players.length; i++) if (t.players[i].id === id) return t.players[i];
    return null;
  }

  function hasStarted(t) { return t.rounds.length > 0; }

  function addPlayer(t, data) {
    var name = String(data.name || '').trim();
    if (!name) throw new Error('Escribe el nombre y apellidos del alumno.');
    if (hasStarted(t)) throw new Error('El torneo ya ha empezado: no se pueden añadir alumnos nuevos.');
    if (t.players.length >= MAX_PLAYERS) throw new Error('El máximo es de ' + MAX_PLAYERS + ' participantes.');
    var p = {
      id: uid(), number: t.players.length + 1, name: name,
      course: String(data.course || '').trim(), group: String(data.group || '').trim(),
      withdrawn: false
    };
    t.players.push(p);
    return p;
  }

  function updatePlayer(t, id, data) {
    var p = playerById(t, id);
    if (!p) throw new Error('Alumno no encontrado.');
    var name = String(data.name || '').trim();
    if (!name) throw new Error('El nombre no puede estar vacío.');
    p.name = name;
    p.course = String(data.course || '').trim();
    p.group = String(data.group || '').trim();
    return p;
  }

  function removePlayer(t, id) {
    if (hasStarted(t)) throw new Error('El torneo ya ha empezado: no se puede eliminar, pero sí retirar al alumno.');
    t.players = t.players.filter(function (p) { return p.id !== id; });
    t.players.forEach(function (p, i) { p.number = i + 1; });
  }

  function setWithdrawn(t, id, value) {
    var p = playerById(t, id);
    if (p) p.withdrawn = !!value;
  }

  /** Lee un CSV (nombre;curso;grupo). Devuelve {rows:[{name,course,group}], skipped:n}. */
  function parseCSV(text) {
    var lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return { rows: [], skipped: 0 };
    var sep = lines[0].indexOf(';') !== -1 ? ';' : (lines[0].indexOf('\t') !== -1 ? '\t' : ',');
    function split(line) {
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      out.push(cur.trim());
      return out;
    }
    var rows = [], skipped = 0;
    lines.forEach(function (line, i) {
      var c = split(line);
      if (i === 0 && /^(nombre( y apellidos)?|alumnos?|apellidos|name)$/i.test(c[0])) return; // cabecera
      if (!c[0]) { skipped++; return; }
      rows.push({ name: c[0], course: c[1] || '', group: c[2] || '' });
    });
    return { rows: rows, skipped: skipped };
  }

  /* ------------------------------ Estadísticas ------------------------------ */

  function emptyStat(p) {
    return {
      id: p.id, number: p.number, name: p.name, player: p,
      points: 0, played: 0, wins: 0, draws: 0, losses: 0, byes: 0,
      whites: 0, blacks: 0, colors: [], opponents: [], scoredAgainst: [],
      roundPoints: [], records: [],
      buchholz: 0, buchholzCut1: 0, buchholzMedian: 0, progressive: 0, sonneborn: 0
    };
  }

  function pts(cfg, outcome) {
    return outcome === 'win' ? cfg.win : outcome === 'draw' ? cfg.draw : cfg.loss;
  }

  /**
   * Calcula las estadísticas de todos los jugadores con las rondas 1..upTo (por defecto todas).
   * Devuelve un mapa id -> estadística.
   */
  function computeStats(t, upTo) {
    var cfg = t.config;
    var stats = {};
    t.players.forEach(function (p) { stats[p.id] = emptyStat(p); });
    var limit = upTo == null ? t.rounds.length : upTo;

    t.rounds.forEach(function (round) {
      if (round.number > limit) return;
      var gained = {};
      round.games.forEach(function (g) {
        var sw = stats[g.white], sb = stats[g.black];
        if (!sw || !sb) return;
        if (!g.result) {
          sw.records.push({ round: round.number, opponent: g.black, color: 'W', outcome: null, points: 0, result: null });
          sb.records.push({ round: round.number, opponent: g.white, color: 'B', outcome: null, points: 0, result: null });
          return;
        }
        var def = RESULTS[g.result];
        [[sw, sb, 'W', def.w], [sb, sw, 'B', def.b]].forEach(function (x) {
          var me = x[0], opp = x[1], color = x[2], out = x[3];
          var p = pts(cfg, out);
          me.points += p;
          gained[me.id] = (gained[me.id] || 0) + p;
          if (out === 'win') me.wins++; else if (out === 'draw') me.draws++; else me.losses++;
          if (def.played) {
            me.played++;
            me.colors.push(color);
            if (color === 'W') me.whites++; else me.blacks++;
            me.opponents.push(opp.id);
            me.scoredAgainst.push({ opp: opp.id, score: p });
          }
          me.records.push({ round: round.number, opponent: opp.id, color: color, outcome: out, points: p, result: g.result, played: def.played });
        });
      });
      if (round.bye && stats[round.bye]) {
        var s = stats[round.bye];
        s.points += cfg.bye; s.byes++;
        gained[s.id] = (gained[s.id] || 0) + cfg.bye;
        s.records.push({ round: round.number, opponent: null, color: null, outcome: 'bye', points: cfg.bye, result: 'BYE' });
      }
      t.players.forEach(function (p) { stats[p.id].roundPoints.push(gained[p.id] || 0); });
    });

    var ids = Object.keys(stats);
    ids.forEach(function (id) {
      var s = stats[id];
      var cum = 0;
      s.roundPoints.forEach(function (rp) { cum += rp; s.progressive += cum; });
      var opp = s.scoredAgainst.map(function (x) { return stats[x.opp] ? stats[x.opp].points : 0; }).sort(function (a, b) { return a - b; });
      var sum = opp.reduce(function (a, b) { return a + b; }, 0);
      s.buchholz = sum;
      s.buchholzCut1 = opp.length > 1 ? sum - opp[0] : sum;
      s.buchholzMedian = opp.length > 2 ? sum - opp[0] - opp[opp.length - 1] : sum;
      s.sonneborn = s.scoredAgainst.reduce(function (a, x) { return a + (stats[x.opp] ? stats[x.opp].points : 0) * (x.score / (cfg.win || 1)); }, 0);
    });
    return stats;
  }

  /** Clasificación ordenada con puestos (los empates exactos comparten puesto). */
  function standings(t, upTo) {
    var stats = computeStats(t, upTo);
    var keys = (t.config.tiebreaks || []).filter(function (k) { return k && k !== 'none'; });
    var rows = Object.keys(stats).map(function (id) { return stats[id]; });
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i] === 'wins' ? 'wins' : keys[i];
        if (b[k] !== a[k]) return b[k] - a[k];
      }
      return a.number - b.number;
    });
    rows.forEach(function (r, i) {
      var prev = rows[i - 1];
      var same = prev && prev.points === r.points && keys.every(function (k) { return prev[k] === r[k]; });
      r.rank = same ? prev.rank : i + 1;
    });
    return rows;
  }

  /* ------------------------------ Rondas ------------------------------ */

  function currentRound(t) {
    return t.rounds.length ? t.rounds[t.rounds.length - 1] : null;
  }

  function pendingGames(round) {
    return round.games.filter(function (g) { return !g.result; });
  }

  function generateRound(t) {
    if (t.finished) throw new Error('El torneo ya ha terminado.');
    var cur = currentRound(t);
    if (cur && !cur.closed) throw new Error('Cierra primero la ronda actual.');
    if (t.rounds.length >= t.numRounds) throw new Error('Ya se han jugado todas las rondas previstas.');
    var active = t.players.filter(function (p) { return !p.withdrawn; });
    if (active.length < MIN_PLAYERS) throw new Error('Se necesitan al menos ' + MIN_PLAYERS + ' participantes en juego.');
    var stats = computeStats(t);
    var input = active.map(function (p) {
      var s = stats[p.id];
      return { id: p.id, number: p.number, points: s.points, opponents: s.opponents.slice(), colors: s.colors.slice(), hadBye: s.byes > 0 };
    });
    var res = Swiss.pair(input);
    var round = {
      number: t.rounds.length + 1,
      games: res.pairs.map(function (pr, i) { return { board: i + 1, white: pr.white, black: pr.black, result: null }; }),
      bye: res.bye,
      closed: false,
      warnings: res.warnings
    };
    t.rounds.push(round);
    return round;
  }

  /** Borra la ronda actual (si no tiene resultados) y la vuelve a emparejar. */
  function regenerateCurrentRound(t) {
    var cur = currentRound(t);
    if (!cur || cur.closed) throw new Error('No hay ninguna ronda abierta.');
    if (cur.games.some(function (g) { return g.result; })) throw new Error('La ronda ya tiene resultados: no se puede volver a emparejar.');
    t.rounds.pop();
    return generateRound(t);
  }

  function setResult(t, roundNumber, board, result) {
    var round = t.rounds[roundNumber - 1];
    if (!round) throw new Error('Ronda no encontrada.');
    var g = round.games.filter(function (x) { return x.board === board; })[0];
    if (!g) throw new Error('Tablero no encontrado.');
    if (result && !RESULTS[result]) throw new Error('Resultado no válido.');
    g.result = result || null;
  }

  /** Cierra la ronda actual y genera la siguiente (o finaliza el torneo). */
  function closeRound(t) {
    var cur = currentRound(t);
    if (!cur || cur.closed) throw new Error('No hay ninguna ronda abierta.');
    var pending = pendingGames(cur);
    if (pending.length) {
      var e = new Error('Faltan resultados en los tableros: ' + pending.map(function (g) { return g.board; }).join(', ') + '.');
      e.pending = pending; throw e;
    }
    cur.closed = true;
    if (t.rounds.length >= t.numRounds) { t.finished = true; return null; }
    return generateRound(t);
  }

  /* ------------------------------ Almacenamiento ------------------------------ */

  function emptyStore() { return { version: 1, activeId: null, tournaments: [] }; }

  function loadStore(storage) {
    try {
      var raw = storage.getItem(STORE_KEY);
      if (!raw) return emptyStore();
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.tournaments)) return emptyStore();
      return s;
    } catch (e) { return emptyStore(); }
  }

  function saveStore(storage, store) {
    storage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function exportBackup(store, onlyId) {
    return JSON.stringify({
      app: 'JAQUE COMARES', version: 1, exportedAt: new Date().toISOString(),
      tournaments: store.tournaments.filter(function (t) { return !onlyId || t.id === onlyId; })
    }, null, 2);
  }

  /** Valida e incorpora una copia de seguridad. Devuelve el número de torneos importados. */
  function importBackup(store, text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('El archivo no es una copia de seguridad válida.'); }
    if (!data || data.app !== 'JAQUE COMARES' || !Array.isArray(data.tournaments)) {
      throw new Error('El archivo no es una copia de seguridad de JAQUE COMARES.');
    }
    var count = 0;
    data.tournaments.forEach(function (t) {
      if (!t || !Array.isArray(t.players) || !Array.isArray(t.rounds) || !t.config) return;
      if (store.tournaments.some(function (x) { return x.id === t.id; })) t.id = uid();
      store.tournaments.push(t);
      count++;
    });
    if (!count) throw new Error('La copia no contiene ningún torneo utilizable.');
    return count;
  }

  return {
    MAX_PLAYERS: MAX_PLAYERS, MIN_PLAYERS: MIN_PLAYERS, RESULTS: RESULTS, TIEBREAKS: TIEBREAKS,
    uid: uid, recommendedRounds: recommendedRounds, createTournament: createTournament,
    playerById: playerById, hasStarted: hasStarted, addPlayer: addPlayer, updatePlayer: updatePlayer,
    removePlayer: removePlayer, setWithdrawn: setWithdrawn, parseCSV: parseCSV,
    computeStats: computeStats, standings: standings, currentRound: currentRound, pendingGames: pendingGames,
    generateRound: generateRound, regenerateCurrentRound: regenerateCurrentRound, setResult: setResult,
    closeRound: closeRound, emptyStore: emptyStore, loadStore: loadStore, saveStore: saveStore,
    exportBackup: exportBackup, importBackup: importBackup
  };
});

