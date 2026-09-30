'use strict';

// ════════════════════════════════
//  RESIZE HANDLING
// ════════════════════════════════
refreshHome();

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
