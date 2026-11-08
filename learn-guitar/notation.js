"use strict";

// Rhythm uses the same quarter-beat durations as playback. No music font needed.
function planRhythm(bar) {
  const values = [6,4,3,2,1.5,1,.5];
  const symbols = [];
  bar.notes.forEach((note,index) => {
    let remaining = note.duration, beat = note.beat, continuation = note.tied;
    while (remaining > 0) {
      const duration = values.find(value => value <= remaining);
      symbols.push({index, beat, duration, rest:Boolean(note.rest), tied:!note.rest && Boolean(continuation), dotted:[1.5,3,6].includes(duration), base:duration === 6 ? 4 : duration === 3 ? 2 : duration === 1.5 ? 1 : duration});
      beat += duration; remaining -= duration; continuation = true;
    }
  });
  const beams = [];
  // Pair eighths within a quarter beat, matching the supplied TAB's beaming.
  for (let i=0;i<symbols.length-1;i++) {
    const a=symbols[i],b=symbols[i+1];
    if (!a.rest && !b.rest && a.duration === .5 && b.duration === .5 && Number.isInteger(a.beat) && b.beat === a.beat+.5) {
      a.beamed=true;b.beamed=true;beams.push([i,i+1]);i++;
    }
  }
  return {symbols,beams};
}

function rhythmRestSVG(base, dotted = false) {
  let mark;
  if (base === .5) {
    mark='<circle cx="-3" cy="-7" r="3.7"/><path class="rhythm-stroke" d="M -3 -7 Q 4 -4 7 -12 L -2 15"/>';
  } else if (base === 1) {
    mark='<path class="rhythm-quarter-rest" d="M -3 -15 L 5 -7 L -2 0 L 5 8 C -4 4 -8 10 -2 16 L -6 12 C -11 6 -5 2 -1 3 L -7 -4 L 0 -11 Z"/>';
  } else {
    mark=`<path class="rhythm-stroke" d="M -12 0 H 12"/><rect x="-8" y="${base === 4 ? 0 : -6}" width="16" height="6"/>`;
  }
  return mark+(dotted?'<circle class="rhythm-dot" cx="14" cy="-3" r="2.5"/>':'');
}

function rhythmNoteSVG(symbol) {
  const whole=symbol.base===4;
  let mark=`<ellipse class="${symbol.base>=2?'rhythm-open-head':'rhythm-filled-head'}" cx="0" cy="0" rx="${whole?10:8}" ry="5.5" transform="rotate(-18)"/>`;
  if (!whole) mark+='<path class="rhythm-stroke" d="M -7 0 V 34"/>';
  if (symbol.base===.5 && !symbol.beamed) mark+='<path class="rhythm-flag" d="M -7 34 C 7 25 7 14 -7 7 C 0 18 0 24 -7 28 Z"/>';
  if (symbol.dotted) mark+='<circle class="rhythm-dot" cx="14" cy="-3" r="2.5"/>';
  return mark;
}

function rhythmSVG(bar, x, top, scale = 1, nextBar = null, width = 292) {
  const plan=planRhythm(bar);
  const notes=bar.notes.map(()=> '');
  let connections='';
  plan.symbols.forEach((symbol,i) => {
    const nx=x(symbol.beat);
    notes[symbol.index]+=`<g class="rhythm-symbol" data-duration="${symbol.duration}" transform="translate(${nx} ${top}) scale(${scale})">${symbol.rest?rhythmRestSVG(symbol.base,symbol.dotted):rhythmNoteSVG(symbol)}</g>`;
    if (symbol.tied) {
      const previous=plan.symbols[i-1];
      const start=previous?x(previous.beat)+10*scale:0;
      const end=nx-10*scale;
      connections+=`<path class="rhythm-tie" d="M ${start} ${top-(previous?12:17)*scale} Q ${(start+end)/2} ${top-23*scale} ${end} ${top-12*scale}"/>`;
    }
  });
  for (const [first,last] of plan.beams) {
    const from=x(plan.symbols[first].beat)-7*scale,to=x(plan.symbols[last].beat)-7*scale;
    connections+=`<path class="rhythm-beam" d="M ${from} ${top+31*scale} H ${to} V ${top+36*scale} H ${from} Z"/>`;
  }
  if (nextBar?.notes[0]?.tied) {
    const last=plan.symbols[plan.symbols.length-1],start=x(last.beat)+10*scale;
    connections+=`<path class="rhythm-tie" d="M ${start} ${top-12*scale} Q ${(start+width)/2} ${top-23*scale} ${width} ${top-17*scale}"/>`;
  }
  return {notes,connections};
}

if (typeof module !== 'undefined' && module.exports) module.exports={planRhythm,rhythmSVG,rhythmRestSVG};
