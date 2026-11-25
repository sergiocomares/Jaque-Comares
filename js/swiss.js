/*
 * JAQUE COMARES - Motor de emparejamientos suizos.
 *
 * Implementación propia INSPIRADA en el sistema suizo holandés (Dutch System):
 *  - Grupos de puntuación (los jugadores con los mismos puntos se emparejan entre sí).
 *  - Dentro de cada grupo, la mitad superior se enfrenta a la mitad inferior (S1 contra S2).
 *  - Descenso (downfloat) del jugador sobrante al grupo siguiente.
 *  - Nadie repite rival ni recibe dos descansos (BYE) mientras sea posible.
 *  - Colores: se respetan las preferencias de color absolutas y fuertes cuando es posible.
 *
 * AVISO: no es una implementación homologada por la FIDE ni verificada íntegramente
 * conforme a su reglamento. Es un sistema suizo real, pero simplificado.
 *
 * Entrada de cada jugador:
 *   { id, number, points, opponents: [ids rivales ya enfrentados],
 *     colors: ['W'|'B', ...] (colores de partidas jugadas, en orden), hadBye: boolean }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Swiss = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Máximo de nodos que explora la búsqueda en cada intento (evita bloqueos).
  var NODE_BUDGET = 40000;

  /** Preferencia de color: side = 'W' | 'B' | null; strength 0 (ninguna) a 3 (absoluta). */
  function colorPref(colors) {
    var n = colors.length;
    if (!n) return { side: null, strength: 0 };
    var diff = 0;
    for (var i = 0; i < n; i++) diff += colors[i] === 'W' ? 1 : -1;
    var last = colors[n - 1];
    var opposite = last === 'W' ? 'B' : 'W';
    if (n >= 2 && colors[n - 2] === last) return { side: opposite, strength: 3 };
    if (diff >= 2) return { side: 'B', strength: 3 };
    if (diff <= -2) return { side: 'W', strength: 3 };
    if (diff === 1) return { side: 'B', strength: 2 };
    if (diff === -1) return { side: 'W', strength: 2 };
    return { side: opposite, strength: 1 };
  }

  function sortPlayers(list) {
    return list.slice().sort(function (a, b) {
      return b.points - a.points || a.number - b.number;
    });
  }

  /** Reglas de compatibilidad por nivel de exigencia (0 = máxima, 3 = último recurso). */
  function compatible(a, b, level) {
    if (level >= 3) return true;
    if (a.opponents.indexOf(b.id) !== -1) return false;
    if (level >= 2) return true;
    var pa = colorPref(a.colors), pb = colorPref(b.colors);
    var conflict = pa.side && pa.side === pb.side;
    if (!conflict) return true;
    if (level === 1) return !(pa.strength === 3 && pb.strength === 3);
    return !(pa.strength >= 2 && pb.strength >= 2);
  }

  /** Busca un emparejamiento completo respetando el nivel. Devuelve pares de índices o null. */
  function solve(order, level, rematchLimit, gapLimit) {
    if (gapLimit === undefined) gapLimit = Infinity;
    var n = order.length;
    var ok = [], rem = [];
    for (var i = 0; i < n; i++) {
      ok.push([]); rem.push([]);
      for (var j = 0; j < n; j++) {
        rem[i].push(i !== j && order[i].opponents.indexOf(order[j].id) !== -1);
        ok[i].push(i !== j && compatible(order[i], order[j], level));
      }
    }
    var used = new Array(n).fill(false);
    var pairs = [];
    var nodes = 0;
    var rematches = 0;
    var gap = 0;

    // Poda: si algún jugador libre se queda sin rivales posibles, esta rama no sirve.
    function deadEnd() {
      for (var k = 0; k < n; k++) {
        if (used[k]) continue;
        var has = false;
        for (var m = 0; m < n; m++) {
          if (!used[m] && ok[k][m]) { has = true; break; }
        }
        if (!has) return true;
      }
      return false;
    }

    // Rivales posibles para el jugador i, de más a menos deseable (criterio S1/S2 holandés).
    function candidates(i) {
      var group = [], lower = [];
      for (var j = i + 1; j < n; j++) {
        if (used[j]) continue;
        if (order[j].points === order[i].points) group.push(j); else lower.push(j);
      }
      var ideal = Math.floor((group.length + 1) / 2); // posición 1..g-1 dentro del grupo
      var upper = [], below = [];
      group.forEach(function (idx, p) {
        if (!ok[i][idx]) return;
        if (p + 1 >= ideal) upper.push(idx); else below.unshift(idx);
      });
      var res = upper.concat(below, lower.filter(function (x) { return ok[i][x]; }));
      if (level >= 3) {
        res = res.filter(function (x) { return !rem[i][x]; }).concat(res.filter(function (x) { return rem[i][x]; }));
      }
      return res;
    }

    function rec(left) {
      if (left === 0) return true;
      if (++nodes > NODE_BUDGET) return false;
      var i = 0;
      while (used[i]) i++;
      used[i] = true;
      var cands = candidates(i);
      for (var c = 0; c < cands.length; c++) {
        var j = cands[c];
        var isRem = rem[i][j];
        if (isRem && rematches >= rematchLimit) continue;
        var d = order[i].points - order[j].points;
        if (gap + d > gapLimit + 1e-9) continue;
        used[j] = true;
        if (isRem) rematches++;
        gap += d;
        pairs.push([i, j]);
        if (!deadEnd() && rec(left - 2)) return true;
        pairs.pop();
        if (isRem) rematches--;
        gap -= d;
        used[j] = false;
        if (nodes > NODE_BUDGET) break;
      }
      used[i] = false;
      return false;
    }

    return rec(n) ? pairs.slice() : null;
  }

  /** Decide quién juega con blancas. `a` es el mejor clasificado. `boardIndex` desempata. */
  function assignColors(a, b, boardIndex) {
    var pa = colorPref(a.colors), pb = colorPref(b.colors);
    if (pa.side && pb.side && pa.side !== pb.side) {
      return pa.side === 'W' ? { white: a, black: b } : { white: b, black: a };
    }
    var aWins = pa.strength >= pb.strength;
    var win = aWins ? a : b, other = aWins ? b : a, pw = aWins ? pa : pb;
    if (pw.side) return pw.side === 'W' ? { white: win, black: other } : { white: other, black: win };
    return boardIndex % 2 === 0 ? { white: a, black: b } : { white: b, black: a };
  }

  function trySolve(order, level) {
    if (level < 3) return solve(order, level, 0);
    var max = Math.floor(order.length / 2);
    for (var k = 1; k <= max; k++) {
      var r = solve(order, level, k);
      if (r) return r;
    }
    return null;
  }

  /**
   * Genera los emparejamientos de una ronda.
   * Devuelve { pairs: [{white, black}] (ids), bye: id|null, level, warnings: [texto] }.
   */
  function pair(players) {
    var warnings = [];
    var order = sortPlayers(players);
    var n = order.length;
    if (n < 2) return { pairs: [], bye: n === 1 ? order[0].id : null, level: 0, warnings: warnings };

    var byeOptions = [null];
    if (n % 2 === 1) {
      var fromBottom = order.slice().reverse();
      byeOptions = fromBottom.filter(function (p) { return !p.hadBye; })
        .concat(fromBottom.filter(function (p) { return p.hadBye; }));
    }

    // Niveles: 1 = sin repetir rivales ni conflictos de color absolutos; 2 = se admiten conflictos de color;
    // 3 = se admiten rivales repetidos (último recurso). Con el nivel 1 se intenta además respetar
    // también las preferencias de color fuertes sin alejar más a los jugadores por puntuación (nivel 0).
    for (var level = 1; level <= 3; level++) {
      for (var b = 0; b < byeOptions.length; b++) {
        var byePlayer = byeOptions[b];
        var rest = byePlayer ? order.filter(function (p) { return p !== byePlayer; }) : order;
        var idx = trySolve(rest, level);
        if (!idx) continue;
        if (level === 1) {
          var gap = 0;
          idx.forEach(function (ij) { gap += Math.abs(rest[ij[0]].points - rest[ij[1]].points); });
          var better = solve(rest, 0, 0, gap);
          if (better) idx = better;
        }
        var pairs = idx.map(function (ij, k) {
          return assignColors(rest[ij[0]], rest[ij[1]], k);
        });
        pairs.sort(function (x, y) {
          var mx = Math.max(x.white.points, x.black.points), my = Math.max(y.white.points, y.black.points);
          var sx = x.white.points + x.black.points, sy = y.white.points + y.black.points;
          return my - mx || sy - sx ||
            Math.min(x.white.number, x.black.number) - Math.min(y.white.number, y.black.number);
        });
        if (level >= 2) warnings.push('Algunos jugadores no han podido recibir el color ideal (blancas/negras) para evitar repetir rivales (algún jugador repite color).');
        if (level >= 3) warnings.push('No existía ninguna combinación sin repetir enfrentamientos: hay partidas repetidas inevitables.');
        if (byePlayer && byePlayer.hadBye) warnings.push('Un jugador recibe un segundo descanso porque todos los demás ya habían descansado.');
        return {
          pairs: pairs.map(function (p) { return { white: p.white.id, black: p.black.id }; }),
          bye: byePlayer ? byePlayer.id : null,
          level: level,
          warnings: warnings
        };
      }
    }
    throw new Error('No se pudo generar ningún emparejamiento.');
  }

  return { pair: pair, colorPref: colorPref, assignColors: assignColors };
});


