'use strict';

// ════════════════════════════════
//  RESIZE HANDLING
// ════════════════════════════════
refreshHome();

document.body.classList.add(isDesktop()?'is-desktop':'is-mobile');

// Projet reçu du PC : …#ar=<code>
if(/^#ar=/.test(location.hash)) openViewerFromCode(location.hash.slice(4));

// Ouverture d'un exercice depuis un lien / QR : …#ex=<code>
if(/^#ex=/.test(location.hash)) openExerciseFromCode(location.hash.slice(4));

window.addEventListener('resize',()=>{
  ['draw','open','san','el'].forEach(n=>{
    if(VIEWS[n].init) initCanvas(n);
  });
  // 3D
  if(curStep===4 && v3D){
    const cv = document.getElementById('cv3D');
    const wrap = document.getElementById('w3D');
    if(cv && wrap){
      const dpr = window.devicePixelRatio||1;
      cv.width = wrap.clientWidth*dpr;
      cv.height = wrap.clientHeight*dpr;
      cv.style.width = wrap.clientWidth+'px';
      cv.style.height = wrap.clientHeight+'px';
    }
  }
});
