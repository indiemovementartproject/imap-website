(async () => {
  const q = s => document.querySelector(s), r = e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width), Math.round(b.height)]; };
  const cards = [...document.querySelectorAll('.rc-card')];
  const rail = q('#rcRail');
  const figs = [...document.querySelectorAll('.about2-collage .ph')].map(f => r(f).join('/'));
  const imgsLoaded = [...document.querySelectorAll('.about2-collage img')].filter(i => i.complete && i.naturalWidth).length;
  // drive the rail: next button should move it by one card
  const before = rail.scrollLeft; q('#rcNext').click(); await new Promise(r => setTimeout(r, 1200)); const after = rail.scrollLeft;
  return { engine: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'WebKit', vw: innerWidth,
    railCardWidths: [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().width)))], railScrollable: rail.scrollWidth > rail.clientWidth,
    railNextMoved: Math.round(after - before), collageBoxes: figs, collageImgsLoaded: imgsLoaded,
    aboutHeadingLeft: r(q('#about h2'))[0], classesHeadingLeft: r(q('#classes h2'))[0], jamHeadingLeft: r(q('#jam h2'))[0],
    footerCols: getComputedStyle(q('.foot-inner')).gridTemplateColumns, docOverflowX: document.documentElement.scrollWidth > innerWidth };
})()
