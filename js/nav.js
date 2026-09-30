'use strict';

// ════════════════════════════════
//  NAVIGATION
// ════════════════════════════════
function enterApp(){
  document.getElementById('home').style.display='none';
  document.getElementById('app').style.display='flex';
  // Pré-créer une pièce 3×2.4m si vide
  if(!SC.walls.length){
    SC.walls=[{pts:[{x:0,y:0},{x:3,y:0},{x:3,y:2.4},{x:0,y:2.4}],closed:true,kind:"ext",comp:DEFAULT_WALL}];
  }
  goStep(0);
}

function exitApp(){
  if(EXO.active){ exitExercise(); return; }
  document.getElementById('app').style.display='none';
  document.getElementById('home').style.display='flex';
  saveNow();
  refreshHome();
}

function goStep(n){
  if(STUDIO.active){ studioGoStep(n); return; }
  curStep=n;
  for(let i=0;i<8;i++){
    const sc=document.getElementById('s'+i);
    if(sc) sc.classList.toggle('off', i!==n);
  }
  // Step dots (0-4 sont les principales étapes, 5 = vérification)
  document.querySelectorAll('.step-dot').forEach((d,i)=>{
    d.classList.toggle('on', i===n);
    d.classList.toggle('done', i<n);
  });
  document.getElementById('topTitle').textContent = STEP_TITLES[n] || '';
  const labels=['1/5','2/5','3/5','4/5','5/5','✓','🎓',''];
  document.getElementById('topStep').textContent = labels[n] || '';

  // Init canvas du step actif
  setTimeout(()=>{
    if(n===0) initCanvas('draw');
    if(n===1) initCanvas('open');
    if(n===2) initCanvas('san');
    if(n===3) initCanvas('el');
    if(n===4) init3D();
    if(n===5) renderNorms();
    if(n===6) renderExoBuilder();
    if(n===7) renderExoReport();
  }, 30);
}
