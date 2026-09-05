(() => {
  'use strict';
  window.JaysScorebug = function (game) {
    const line = game.linescore;
    if (game.status.abstractGameState !== 'Live' || !line?.currentInning) return null;
    const bug = document.createElement('span');
    bug.className = 'scorebug';
    const occupied = ['first', 'second', 'third'].filter(base => line.offense?.[base]);
    const count = `${line.balls ?? '–'}–${line.strikes ?? '–'}`;
    const label = `${occupied.length ? `Runners on ${occupied.join(' and ')}` : 'Bases empty'}; ${line.balls ?? 'unknown'} balls, ${line.strikes ?? 'unknown'} strikes; ${line.outs ?? 'unknown'} outs`;
    bug.setAttribute('role', 'img');
    bug.setAttribute('aria-label', label);
    bug.title = label;
    const diamond = document.createElement('span');
    diamond.className = 'scorebug-diamond';
    for (const base of ['second', 'third', 'first']) {
      const marker = document.createElement('span');
      marker.className = `scorebug-base ${base}${line.offense?.[base] ? ' occupied' : ''}`;
      diamond.append(marker);
    }
    const balls = document.createElement('span');
    balls.className = 'scorebug-count';
    balls.textContent = count;
    const outs = document.createElement('span');
    outs.className = 'scorebug-outs';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = `scorebug-out${i < line.outs ? ' recorded' : ''}`;
      outs.append(dot);
    }
    for (const part of [diamond, balls, outs]) part.setAttribute('aria-hidden', 'true');
    bug.append(diamond, balls, outs);
    return bug;
  };
})();
