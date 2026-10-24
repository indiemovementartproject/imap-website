(async () => {
  const belt = document.getElementById('rvBelt'), track = belt.parentElement;
  document.getElementById('reviews').scrollIntoView();
  await new Promise(r => setTimeout(r, 300));
  const cs = getComputedStyle(belt), dur = parseFloat(cs.animationDuration);
  const shift = parseFloat(belt.style.getPropertyValue('--rv-shift'));
  const tr = track.getBoundingClientRect();
  const firstVisible = () => { const c = [...belt.children].find(c => c.getBoundingClientRect().right > tr.left + 1); return c ? Math.round(c.getBoundingClientRect().left) + ':' + c.querySelector('.who').textContent.slice(0,10) : 'none'; };
  const seek = async f => { belt.style.animationPlayState = 'paused'; belt.style.animationDelay = (-f * dur) + 's'; await new Promise(r => setTimeout(r, 150)); };
  // the page has been running a few seconds; a negative delay is measured from the start, so read the real offset of "f" via the transform
  let minVis = 99, emptyAt = [];
  for (let i = 0; i <= 40; i++) {
    const f = i / 40 * 0.999; await seek(f);
    const vis = [...belt.children].filter(c => { const b = c.getBoundingClientRect(); return b.right > tr.left && b.left < tr.right; }).length;
    if (vis < minVis) minVis = vis; if (vis === 0) emptyAt.push(Math.round(f * 100) + '%');
  }
  // seamless: the strip at the very end of a cycle must look like the strip at its very start
  belt.style.animation = 'none'; belt.offsetWidth;
  belt.style.transform = 'translateX(0px)'; await new Promise(r => setTimeout(r, 80)); const atStart = firstVisible();
  belt.style.transform = `translateX(${-shift}px)`; await new Promise(r => setTimeout(r, 80)); const atEnd = firstVisible();
  return { engine: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'WebKit', cardsPerSet: belt.children.length / 2,
           oneSetPx: shift, cycleSeconds: dur, speedPxPerSec: Math.round(shift / dur), secondsPerCard: Math.round((belt.children[1].offsetLeft - belt.children[0].offsetLeft) / (shift / dur)),
           minCardsVisible: minVis, emptyAt, seamless: atStart.split(':')[1] === atEnd.split(':')[1] && atStart.split(':')[0] === atEnd.split(':')[0], atStart, atEnd };
})()
