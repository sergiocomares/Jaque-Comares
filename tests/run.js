/* Pruebas automatizadas de JAQUE COMARES. Ejecutar con:  node tests/run.js */
'use strict';
var assert = require('assert');
var JC = require('../js/tournament.js');
var Swiss = require('../js/swiss.js');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  OK   ' + name); }
  catch (e) { failed++; console.log('  FALLO ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n       ')); }
}

function rng(seed) {
  var s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function newTournament(n, rounds) {
  var t = JC.createTournament({ name: 'Prueba', numRounds: rounds });
  for (var i = 1; i <= n; i++) JC.addPlayer(t, { name: 'Alumno ' + i, course: '1º ESO', group: 'A' });
  return t;
}

function playAll(t, seed) {
  var rand = rng(seed);
  var warnings = [];
  JC.generateRound(t);
  while (!t.finished) {
    var cur = JC.currentRound(t);
    if (cur.warnings.length) warnings.push({ round: cur.number, w: cur.warnings });
    cur.games.forEach(function (g) {
      var r = rand();
      JC.setResult(t, cur.number, g.board, r < 0.4 ? '1-0' : r < 0.55 ? '1/2' : '0-1');
    });
    JC.closeRound(t);
  }
  return warnings;
}

function checkInvariants(t, opts) {
  opts = opts || {};
  var met = {}, byes = {};
  t.rounds.forEach(function (round) {
    var seen = {};
    round.games.forEach(function (g) {
      [g.white, g.black].forEach(function (id) {
        assert(!seen[id], 'Jugador repetido en la ronda ' + round.number);
        seen[id] = true;
      });
      var key = [g.white, g.black].sort().join('|');
      if (!opts.allowRematch) assert(!met[key], 'Enfrentamiento repetido en la ronda ' + round.number);
      met[key] = true;
    });
    if (round.bye) {
      assert(!seen[round.bye], 'El jugador con descanso también juega');
      seen[round.bye] = true;
      if (!opts.allowRematch) assert(!byes[round.bye], 'Descanso repetido');
      byes[round.bye] = true;
    }
    assert.strictEqual(Object.keys(seen).length, t.players.length, 'Todos deben estar emparejados o descansar');
  });
  // Puntuaciones coherentes con los resultados.
  var stats = JC.computeStats(t);
  t.players.forEach(function (p) {
    var exp = 0;
    t.rounds.forEach(function (r) {
      r.games.forEach(function (g) {
        if (g.white === p.id) exp += g.result === '1-0' ? 1 : g.result === '1/2' ? 0.5 : 0;
        if (g.black === p.id) exp += g.result === '0-1' ? 1 : g.result === '1/2' ? 0.5 : 0;
      });
      if (r.bye === p.id) exp += 1;
    });
    assert.strictEqual(stats[p.id].points, exp, 'Puntos incorrectos de ' + p.name);
  });
  return stats;
}

console.log('\nAlgoritmo suizo con distintos tamaños');
[20, 21, 24, 25, 30].forEach(function (n) {
  [1, 2, 3].forEach(function (seed) {
    test(n + ' participantes, semilla ' + seed + ', ' + JC.recommendedRounds(n) + ' rondas', function () {
      var t = newTournament(n, JC.recommendedRounds(n));
      var warnings = playAll(t, seed * 7919 + n);
      assert.strictEqual(warnings.length, 0, 'Avisos inesperados: ' + JSON.stringify(warnings));
      var stats = checkInvariants(t);
      // Colores razonablemente equilibrados: diferencia máxima de 2 y nunca 3 seguidas.
      t.players.forEach(function (p) {
        var s = stats[p.id];
        assert(Math.abs(s.whites - s.blacks) <= 2, p.name + ' desequilibrio de colores ' + s.whites + '/' + s.blacks);
        for (var i = 2; i < s.colors.length; i++) {
          assert(!(s.colors[i] === s.colors[i - 1] && s.colors[i] === s.colors[i - 2]), 'Tres colores seguidos');
        }
      });
      // Los emparejamientos tienen en cuenta los puntos: en la ronda 2 todos los pares comparten puntos
      // salvo los descensos necesarios (grupos impares): como mucho 3 pares con diferencia de puntos.
      var s1 = JC.computeStats(t, 1);
      var r2 = t.rounds[1];
      var unequal = r2.games.filter(function (g) { return s1[g.white].points !== s1[g.black].points; });
      assert(unequal.length <= 3, 'Ronda 2 empareja demasiadas puntuaciones distintas');
      unequal.forEach(function (g) {
        assert(Math.abs(s1[g.white].points - s1[g.black].points) <= 1, 'Salto de puntuación excesivo');
      });
      // En general la diferencia media de puntos en un par es pequeña.
      t.rounds.forEach(function (r, i) {
        var st = JC.computeStats(t, i);
        var gap = 0;
        r.games.forEach(function (g) { gap += Math.abs(st[g.white].points - st[g.black].points); });
        assert(gap / r.games.length <= 1.0, 'Diferencia media de puntos alta en ronda ' + r.number);
      });
    });
  });
});

console.log('\nCasos con restricciones difíciles');
test('4 jugadores, 3 rondas = todos contra todos sin repetir', function () {
  var t = newTournament(4, 3);
  var w = playAll(t, 5);
  assert.strictEqual(w.length, 0);
  checkInvariants(t);
});
test('6 jugadores, 5 rondas: pueden aparecer repeticiones solo al final, siempre con aviso', function () {
  var ok = 0;
  for (var seed = 1; seed <= 20; seed++) {
    var t = newTournament(6, 5);
    var w = playAll(t, seed);
    checkInvariants(t, { allowRematch: w.length > 0 });
    ok++;
  }
  assert.strictEqual(ok, 20);
});
test('5 jugadores, 5 rondas: cada jugador descansa exactamente una vez', function () {
  for (var seed = 1; seed <= 20; seed++) {
    var t = newTournament(5, 5);
    var w = playAll(t, seed);
    checkInvariants(t, { allowRematch: w.length > 0 });
    if (!w.length) {
      var count = {};
      t.rounds.forEach(function (r) { count[r.bye] = (count[r.bye] || 0) + 1; });
      assert.strictEqual(Object.keys(count).length, 5);
    }
  }
});
test('3 jugadores con más rondas que rivales: se avisa de la repetición', function () {
  var t = newTournament(3, 4);
  var w = playAll(t, 2);
  assert(w.length > 0, 'Debe avisar de repeticiones inevitables');
  checkInvariants(t, { allowRematch: true });
});
test('2 jugadores, 2 rondas: repite pero no falla', function () {
  var t = newTournament(2, 2);
  playAll(t, 1);
  assert.strictEqual(t.rounds.length, 2);
});
test('Ganadores con colores absolutos opuestos se emparejan sin conflicto', function () {
  var pl = [
    { id: 'a', number: 1, points: 2, opponents: ['x', 'y'], colors: ['W', 'W'], hadBye: false },
    { id: 'b', number: 2, points: 2, opponents: ['z', 'w'], colors: ['B', 'B'], hadBye: false },
    { id: 'c', number: 3, points: 2, opponents: ['x', 'y'], colors: ['W', 'W'], hadBye: false },
    { id: 'd', number: 4, points: 2, opponents: ['z', 'w'], colors: ['B', 'B'], hadBye: false }
  ];
  var res = Swiss.pair(pl);
  res.pairs.forEach(function (p) {
    assert(['a', 'c'].indexOf(p.black) !== -1 && ['b', 'd'].indexOf(p.white) !== -1, 'Cada uno debe recibir el color que le toca');
  });
  assert.strictEqual(res.warnings.length, 0);
});
test('El descanso se asigna al jugador con menos puntos que no haya descansado', function () {
  var pl = [
    { id: 'a', number: 1, points: 2, opponents: [], colors: [], hadBye: false },
    { id: 'b', number: 2, points: 1, opponents: [], colors: [], hadBye: false },
    { id: 'c', number: 3, points: 0, opponents: [], colors: [], hadBye: true },
    { id: 'd', number: 4, points: 0, opponents: [], colors: [], hadBye: false },
    { id: 'e', number: 5, points: 3, opponents: [], colors: [], hadBye: false }
  ];
  assert.strictEqual(Swiss.pair(pl).bye, 'd');
});
test('Un jugador retirado no se empareja', function () {
  var t = newTournament(8, 3);
  JC.generateRound(t);
  var r = JC.currentRound(t);
  r.games.forEach(function (g) { JC.setResult(t, 1, g.board, '1-0'); });
  JC.setWithdrawn(t, t.players[0].id, true);
  JC.closeRound(t);
  var r2 = JC.currentRound(t);
  var ids = [];
  r2.games.forEach(function (g) { ids.push(g.white, g.black); });
  assert(ids.indexOf(t.players[0].id) === -1 && r2.bye !== t.players[0].id);
});

console.log('\nResultados, clasificación y rondas');
test('No se puede cerrar una ronda con resultados pendientes', function () {
  var t = newTournament(6, 3);
  JC.generateRound(t);
  assert.throws(function () { JC.closeRound(t); }, /Faltan resultados/);
  assert.strictEqual(t.rounds.length, 1);
});
test('Corregir un resultado antiguo no rompe las rondas posteriores', function () {
  var t = newTournament(10, 4);
  playAll(t, 11);
  var before = JSON.stringify(t.rounds.map(function (r) { return r.games.map(function (g) { return [g.white, g.black]; }); }));
  var g = t.rounds[0].games[0];
  JC.setResult(t, 1, g.board, g.result === '1-0' ? '0-1' : '1-0');
  var after = JSON.stringify(t.rounds.map(function (r) { return r.games.map(function (x) { return [x.white, x.black]; }); }));
  assert.strictEqual(before, after);
  checkInvariants(t);
  var st = JC.standings(t);
  for (var i = 1; i < st.length; i++) assert(st[i - 1].points >= st[i].points);
});
test('Clasificación: puntos, Buchholz, mediano y progresivo', function () {
  var t = newTournament(4, 3);
  var ids = t.players.map(function (p) { return p.id; });
  // Se fuerzan rondas manualmente: R1: 1-2, 3-4 ; R2: 1-3, 2-4 ; R3: 1-4, 2-3
  var mk = function (n, games) {
    return { number: n, closed: true, bye: null, warnings: [], games: games.map(function (x, i) { return { board: i + 1, white: ids[x[0]], black: ids[x[1]], result: x[2] }; }) };
  };
  t.rounds = [mk(1, [[0, 1, '1-0'], [2, 3, '1/2']]), mk(2, [[0, 2, '1-0'], [1, 3, '1-0']]), mk(3, [[3, 0, '0-1'], [1, 2, '1/2']])];
  t.finished = true;
  var s = JC.computeStats(t);
  assert.strictEqual(s[ids[0]].points, 3);
  assert.strictEqual(s[ids[1]].points, 1.5);
  assert.strictEqual(s[ids[2]].points, 1);
  assert.strictEqual(s[ids[3]].points, 0.5);
  // Buchholz del jugador 1: 1.5 + 1 + 0.5 = 3
  assert.strictEqual(s[ids[0]].buchholz, 3);
  assert.strictEqual(s[ids[0]].buchholzCut1, 2.5);
  assert.strictEqual(s[ids[0]].buchholzMedian, 1);
  // Progresivo del jugador 1: 1 + 2 + 3 = 6
  assert.strictEqual(s[ids[0]].progressive, 6);
  var st = JC.standings(t);
  assert.strictEqual(st[0].id, ids[0]);
  assert.deepStrictEqual(st.map(function (r) { return r.rank; }), [1, 2, 3, 4]);
});
test('Las incomparecencias puntúan pero no cuentan como partida jugada ni color', function () {
  var t = newTournament(2, 1);
  JC.generateRound(t);
  JC.setResult(t, 1, 1, '+/-');
  var s = JC.computeStats(t);
  var w = s[JC.currentRound(t).games[0].white];
  assert.strictEqual(w.points, 1);
  assert.strictEqual(w.played, 0);
  assert.strictEqual(w.colors.length, 0);
});
test('Recomendación de rondas', function () {
  assert.strictEqual(JC.recommendedRounds(20), 5);
  assert.strictEqual(JC.recommendedRounds(8), 3);
  assert.strictEqual(JC.recommendedRounds(2), 1);
  assert.strictEqual(JC.recommendedRounds(40), 6);
});
test('Límites de participantes', function () {
  var t = newTournament(40, 6);
  assert.throws(function () { JC.addPlayer(t, { name: 'Extra' }); }, /máximo/);
  var t2 = newTournament(1, 1);
  assert.throws(function () { JC.generateRound(t2); }, /al menos/);
});
test('Importación CSV con ; y con cabecera', function () {
  var r = JC.parseCSV('Nombre;Curso;Grupo\nAna López;1º ESO;A\n"Pérez, Luis";2º ESO;B\n;;\n');
  assert.strictEqual(r.rows.length, 2);
  assert.strictEqual(r.rows[1].name, 'Pérez, Luis');
  assert.strictEqual(r.skipped, 1);
});

console.log('\nPersistencia y copias de seguridad');
test('Los datos se recuperan tras "cerrar el navegador" (almacenamiento simulado)', function () {
  var mem = {};
  var storage = { getItem: function (k) { return k in mem ? mem[k] : null; }, setItem: function (k, v) { mem[k] = String(v); } };
  var store = JC.emptyStore();
  var t = newTournament(12, 4);
  store.tournaments.push(t); store.activeId = t.id;
  JC.generateRound(t);
  JC.setResult(t, 1, 1, '1-0');
  JC.saveStore(storage, store);
  var again = JC.loadStore(storage);
  assert.deepStrictEqual(again, JSON.parse(JSON.stringify(store)));
  assert.strictEqual(JC.standings(again.tournaments[0]).length, 12);
});
test('Exportar e importar una copia de seguridad', function () {
  var store = JC.emptyStore();
  var t = newTournament(6, 3);
  JC.generateRound(t);
  store.tournaments.push(t);
  var json = JC.exportBackup(store);
  var other = JC.emptyStore();
  assert.strictEqual(JC.importBackup(other, json), 1);
  assert.strictEqual(JC.importBackup(other, json), 1); // id duplicado: se regenera
  assert.notStrictEqual(other.tournaments[0].id, other.tournaments[1].id);
  assert.throws(function () { JC.importBackup(other, '{"hola":1}'); }, /JAQUE COMARES/);
  assert.throws(function () { JC.importBackup(other, 'no json'); }, /válida/);
});

console.log('\n' + passed + ' correctas, ' + failed + ' con fallos.');
process.exit(failed ? 1 : 0);


