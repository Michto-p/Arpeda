'use strict';

// ════════════════════════════════
//  RENDU CANVAS UNIFIÉ
// ════════════════════════════════
function redraw(name){
  scheduleSave();
  const {cv} = getCanvas(name);
  if(!cv) return;
  const ctx = cv.getContext('2d');
  const v = VIEWS[name];
  const W = cv.clientWidth, H = cv.clientHeight;

  // Background
  ctx.fillStyle='#0a1221';
  ctx.fillRect(0,0,W,H);

  // Grid
  drawGrid(ctx, W, H, v);

  // Murs (toutes étapes)
  drawWalls(ctx, v);

  // Ouvertures
  drawOpenings(ctx, v);

  // Zones (étapes san/el)
  if((name==='san' || name==='el') && !hideZones()){
    drawZones(ctx, v);
  }

  // Sanitaires + meubles (san/el)
  if(name==='san' || name==='el'){
    drawSanitaires(ctx, v, name);
    drawMeubles(ctx, v, name);
  }

  // Élec (el seulement)
  if(name==='el'){
    drawElec(ctx, v);
  }

  // Tracé en cours (draw)
  if(name==='draw'){
    drawCurrentPoly(ctx, v);
  }

  // Update info
  updateInfo(name);
}

function drawGrid(ctx, W, H, v){
  const g10 = 0.1*v.sc;
  const g100 = v.sc;
  ctx.strokeStyle='rgba(80,100,140,.10)';
  ctx.lineWidth=0.5;
  const ox=((v.px%g10)+g10)%g10, oy=((v.py%g10)+g10)%g10;
  for(let x=ox;x<W;x+=g10){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke(); }
  for(let y=oy;y<H;y+=g10){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke(); }
  ctx.strokeStyle='rgba(80,100,140,.22)';
  ctx.lineWidth=0.8;
  const ox2=((v.px%g100)+g100)%g100, oy2=((v.py%g100)+g100)%g100;
  for(let x=ox2;x<W;x+=g100){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke(); }
  for(let y=oy2;y<H;y+=g100){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke(); }
}

// Texte toujours lisible (jamais à l'envers)
function readableAngle(a){
  if(a>Math.PI/2) return a-Math.PI;
  if(a<-Math.PI/2) return a+Math.PI;
  return a;
}

function drawWalls(ctx, v){
  if(!SC.walls.length) return;
  for(let wi=0; wi<SC.walls.length; wi++){
    const w = SC.walls[wi];
    if(w.pts.length<2) continue;
    const isSel = (wi===selWallIdx);
    const comp = w.comp ? COMP_LIB[w.comp] : null;
    const realThick = comp ? compThickness(comp) : (w.kind==='int' ? 0.10 : 0.20);
    // Épaisseur visuelle proportionnelle à l'épaisseur réelle
    const T = Math.max(4, v.sc * realThick);
    const tracePath = ()=>{
      const p0 = mToScreen(w.pts[0].x, w.pts[0].y, v);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for(let i=1; i<w.pts.length; i++){
        const p=mToScreen(w.pts[i].x, w.pts[i].y, v);
        ctx.lineTo(p.x, p.y);
      }
      if(w.closed) ctx.closePath();
    };
    tracePath();
    if(w.closed){
      // Fond pièce (sol)
      ctx.fillStyle='#1a2b3e';
      ctx.fill();
      // Texture carrelage 40cm
      ctx.save();
      ctx.clip();
      const ts=0.40*v.sc;
      ctx.strokeStyle='rgba(96,165,250,.08)';
      ctx.lineWidth=0.5;
      let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
      for(const p of w.pts){
        const sp=mToScreen(p.x,p.y,v);
        mnx=Math.min(mnx,sp.x);mxx=Math.max(mxx,sp.x);
        mny=Math.min(mny,sp.y);mxy=Math.max(mxy,sp.y);
      }
      for(let x=Math.floor(mnx/ts)*ts;x<mxx;x+=ts){
        ctx.beginPath();ctx.moveTo(x,mny);ctx.lineTo(x,mxy);ctx.stroke();
      }
      for(let y=Math.floor(mny/ts)*ts;y<mxy;y+=ts){
        ctx.beginPath();ctx.moveTo(mnx,y);ctx.lineTo(mxx,y);ctx.stroke();
      }
      ctx.restore();
    }
    tracePath();   // le carrelage a remplacé le chemin courant
    // Halo si sélectionné
    if(isSel){
      ctx.shadowColor='rgba(96,165,250,.8)';
      ctx.shadowBlur=12;
    }
    // Couleur selon type
    const wallCol = w.kind==='int' ? '#f59e0b' : '#3b82f6';
    ctx.strokeStyle = isSel ? '#60a5fa' : wallCol;
    ctx.lineWidth = T;
    ctx.lineJoin='round';
    ctx.lineCap='round';
    ctx.stroke();
    ctx.shadowBlur=0;
    // Reflet intérieur (couches visibles)
    if(comp && comp.layers && comp.layers.length>1){
      // Trace une ligne plus fine au milieu pour suggérer les couches
      ctx.strokeStyle='rgba(255,255,255,.15)';
      ctx.lineWidth=Math.max(1, T*0.20);
      ctx.stroke();
      ctx.strokeStyle='rgba(0,0,0,.20)';
      ctx.lineWidth=1.2;
      ctx.stroke();
    } else {
      ctx.strokeStyle='rgba(255,255,255,.18)';
      ctx.lineWidth=1.5;
      ctx.stroke();
    }

    // Label composition (sur le mur)
    if(comp){
      const pts=w.closed?[...w.pts,w.pts[0]]:w.pts;
      // Trouver le segment le plus long
      let bestLen=0, bestSeg=null;
      for(let i=0;i<pts.length-1;i++){
        const a=pts[i], b=pts[i+1];
        const len=Math.hypot(b.x-a.x,b.y-a.y);
        if(len>bestLen){ bestLen=len; bestSeg={a,b,len}; }
      }
      if(bestSeg && bestLen>1.0){
        const a=bestSeg.a, b=bestSeg.b;
        const m=mToScreen((a.x+b.x)/2, (a.y+b.y)/2, v);
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(readableAngle(Math.atan2(b.y-a.y, b.x-a.x)));
        ctx.fillStyle='rgba(20,26,38,.92)';
        const txt = comp.label;
        ctx.font='bold 8px ui-monospace,monospace';
        const tw = ctx.measureText(txt).width;
        ctx.fillRect(-tw/2-4, -22, tw+8, 11);
        ctx.fillStyle='#9ab4d4';
        ctx.textAlign='center';
        ctx.fillText(txt, 0, -14);
        ctx.restore();
      }
    }

    // Cotes
    ctx.font=`9px ui-monospace,monospace`;
    ctx.textAlign='center';
    const pts=w.closed?[...w.pts,w.pts[0]]:w.pts;
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b=pts[i+1];
      const len=Math.hypot(b.x-a.x,b.y-a.y);
      if(len<0.15) continue;
      const m=mToScreen((a.x+b.x)/2, (a.y+b.y)/2, v);
      ctx.save();
      ctx.translate(m.x,m.y);
      ctx.rotate(readableAngle(Math.atan2(b.y-a.y, b.x-a.x)));
      ctx.fillStyle='rgba(20,26,38,.92)';
      ctx.fillRect(-22,-15,44,11);
      ctx.fillStyle='#9ab4d4';
      ctx.fillText(len.toFixed(2)+'m', 0, -7);
      ctx.restore();
    }
  }
}

function drawOpenings(ctx, v){
  for(const op of SC.openings){
    const w=SC.walls[op.wi]; if(!w) continue;
    const pts=w.closed?[...w.pts,w.pts[0]]:w.pts;
    if(op.si>=pts.length-1) continue;
    const a=pts[op.si], b=pts[op.si+1];
    const sl=Math.hypot(b.x-a.x, b.y-a.y);
    const hw=op.w/2/sl;
    const t1=Math.max(0,op.t-hw), t2=Math.min(1,op.t+hw);
    const p1=mToScreen(a.x+(b.x-a.x)*t1, a.y+(b.y-a.y)*t1, v);
    const p2=mToScreen(a.x+(b.x-a.x)*t2, a.y+(b.y-a.y)*t2, v);
    const T=Math.max(6, v.sc*0.05)+3;
    ctx.strokeStyle='#0a1221';
    ctx.lineWidth=T;
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
    ctx.strokeStyle = op.type==='door'?'#60a5fa': op.type==='wide'?'#a78bfa':'#22d3ee';
    ctx.lineWidth=2.5;
    ctx.stroke();
    // Icone
    const m={x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2};
    ctx.font='12px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(op.type==='window'?'🪟':'🚪', m.x, m.y);
    ctx.textBaseline='alphabetic';
  }
}

function drawZones(ctx, v){
  const sanZ = SC.sanitaires.filter(s => CAT_SAN[s.type]?.genZone);
  if(!sanZ.length) return;

  let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
  if(SC.walls.length){
    for(const w of SC.walls) for(const p of w.pts){
      mnx=Math.min(mnx,p.x); mxx=Math.max(mxx,p.x);
      mny=Math.min(mny,p.y); mxy=Math.max(mxy,p.y);
    }
  } else { mnx=0;mxx=3;mny=0;mxy=2.4; }

  const STEP = Math.max(0.04, Math.min(0.10, 5/v.sc));
  const cellPx = STEP * v.sc;
  const roomPoly = SC.walls.length && SC.walls[0].closed ? SC.walls[0].pts : null;

  // Couleurs des zones (vue dessus = h=1m → V0/V1/V2 en projection horizontale)
  // V2 plus pâle (extérieur), V1 moyen, V0 vif (intérieur)
  const colorsByZone = {
    0: 'rgba(220,38,38,.30)',
    1: 'rgba(245,158,11,.22)',
    2: 'rgba(37,99,235,.18)',
  };

  // 3 passes : V2, V1, V0 (les superpositions ne posent pas de problème)
  for(const z of [2, 1, 0]){
    ctx.fillStyle = colorsByZone[z];
    for(let mx=mnx; mx<=mxx; mx+=STEP){
      for(let my=mny; my<=mxy; my+=STEP){
        if(roomPoly && !ptInPoly(mx, my, roomPoly)) continue;
        // h=1m : on est entre 0.10 et 2.25 donc V0 baignoire, V1 partout au-dessus emprise, etc.
        const zoneAtPt = getZone(mx, my, 1.0);
        if(zoneAtPt !== z) continue;
        const sp = mToScreen(mx, my, v);
        ctx.fillRect(sp.x - cellPx/2, sp.y - cellPx/2, cellPx + 0.5, cellPx + 0.5);
      }
    }
  }

  // Pommeau de douche (point déplaçable pour douche italienne)
  for(const s of sanZ){
    if(s.type !== 'douche_it') continue;
    const p = pommeauPos(s);
    const sp = mToScreen(p.x, p.y, v);
    // Halo / anneau extérieur (drag-affordance)
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 13, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(34,211,238,.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3,3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Cercle plein
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 8, 0, Math.PI*2);
    ctx.fillStyle = '#22d3ee';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Croix centrale (style cible)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sp.x-3, sp.y); ctx.lineTo(sp.x+3, sp.y);
    ctx.moveTo(sp.x, sp.y-3); ctx.lineTo(sp.x, sp.y+3);
    ctx.stroke();
    // Label
    ctx.font = 'bold 8px ui-monospace,monospace';
    ctx.fillStyle = '#22d3ee';
    ctx.textAlign = 'center';
    ctx.fillText('Pommeau', sp.x, sp.y - 16);
  }
}

function drawSanitaires(ctx, v, name){
  for(const s of SC.sanitaires){
    const c=CAT_SAN[s.type];
    const cp = mToScreen(s.x, s.y, v);
    const w=c.w*v.sc, h=c.d*v.sc;
    const sel=(name==='san' && s.id===selSanId);
    ctx.save();
    ctx.translate(cp.x, cp.y);
    ctx.rotate(s.rot||0);
    if(sel){
      ctx.shadowColor='rgba(96,165,250,.7)';
      ctx.shadowBlur=14;
    }
    drawSanShape(ctx, s.type, -w/2, -h/2, w, h, sel, c);
    ctx.restore();
    // Label
    if(name==='san' || sel){
      ctx.font=`bold 9px ui-monospace,monospace`;
      ctx.fillStyle=sel?'#60a5fa':'rgba(150,180,220,.75)';
      ctx.textAlign='center';
      ctx.fillText(c.label, cp.x, cp.y + Math.max(c.w,c.d)*v.sc/2 + 12);
    }
  }
}

// Rendu réaliste 2D de chaque sanitaire vue de dessus
function drawSanShape(ctx, type, x, y, w, h, sel, c){
  const stk = sel ? '#60a5fa' : (c.water?'#3a6080':'#4a5060');
  const sw = sel ? 2.5 : 1.5;

  switch(type){
    case 'baignoire': {
      // Contour extérieur
      ctx.fillStyle='#243d54';
      rr(ctx, x, y, w, h, 8); ctx.fill();
      // Cuve intérieure céramique
      ctx.fillStyle='#3a5a78';
      const inset=Math.min(w,h)*0.10;
      rr(ctx, x+inset, y+inset, w-inset*2, h-inset*2, 6); ctx.fill();
      // Reflet eau
      ctx.fillStyle='rgba(96,165,250,.30)';
      rr(ctx, x+inset+2, y+inset+2, w-inset*2-4, h-inset*2-4, 5); ctx.fill();
      // Robinetterie (cercle au bord)
      ctx.fillStyle='#94a3b8';
      ctx.beginPath();ctx.arc(x+w*0.15, y+h*0.5, Math.min(w,h)*0.04, 0, Math.PI*2);ctx.fill();
      // Bonde d'évacuation
      ctx.fillStyle='#475569';
      ctx.beginPath();ctx.arc(x+w*0.85, y+h*0.5, Math.min(w,h)*0.05, 0, Math.PI*2);ctx.fill();
      // Contour
      ctx.strokeStyle=stk;ctx.lineWidth=sw;
      rr(ctx, x, y, w, h, 8);ctx.stroke();
      break;
    }
    case 'douche_it': {
      // Receveur
      ctx.fillStyle='#2a4560';
      rr(ctx, x, y, w, h, 4);ctx.fill();
      // Carrelage (lignes diagonales pour antidérapant)
      ctx.strokeStyle='rgba(96,165,250,.20)';
      ctx.lineWidth=0.5;
      const step=Math.max(8, Math.min(w,h)/8);
      for(let i=-w;i<w*2;i+=step){
        ctx.beginPath();ctx.moveTo(x+i,y);ctx.lineTo(x+i+h,y+h);ctx.stroke();
      }
      // Bonde centrale
      ctx.fillStyle='#475569';
      ctx.beginPath();ctx.arc(x+w/2, y+h/2, Math.min(w,h)*0.08, 0, Math.PI*2);ctx.fill();
      ctx.fillStyle='#1e293b';
      ctx.beginPath();ctx.arc(x+w/2, y+h/2, Math.min(w,h)*0.06, 0, Math.PI*2);ctx.fill();
      // Pomme de douche (coin)
      ctx.fillStyle='#94a3b8';
      ctx.beginPath();ctx.arc(x+w*0.15, y+h*0.15, Math.min(w,h)*0.06, 0, Math.PI*2);ctx.fill();
      // Contour
      ctx.strokeStyle=stk;ctx.lineWidth=sw;
      rr(ctx, x, y, w, h, 4);ctx.stroke();
      break;
    }
    case 'lavabo':
    case 'vasque': {
      // Plan de toilette
      ctx.fillStyle='#1e3550';
      rr(ctx, x, y, w, h, 4);ctx.fill();
      // Vasque (ovale ou cercle)
      ctx.fillStyle='#3a5a78';
      const cx=x+w/2, cy=y+h*0.55;
      ctx.beginPath();
      if(type==='vasque') ctx.arc(cx, cy, Math.min(w,h)*0.35, 0, Math.PI*2);
      else ctx.ellipse(cx, cy, w*0.38, h*0.32, 0, 0, Math.PI*2);
      ctx.fill();
      // Reflet
      ctx.fillStyle='rgba(96,165,250,.25)';
      ctx.beginPath();
      if(type==='vasque') ctx.arc(cx, cy, Math.min(w,h)*0.30, 0, Math.PI*2);
      else ctx.ellipse(cx, cy, w*0.34, h*0.28, 0, 0, Math.PI*2);
      ctx.fill();
      // Bonde
      ctx.fillStyle='#475569';
      ctx.beginPath();ctx.arc(cx, cy, Math.min(w,h)*0.05, 0, Math.PI*2);ctx.fill();
      // Robinet (haut)
      ctx.fillStyle='#94a3b8';
      ctx.fillRect(cx-2, y+h*0.15, 4, h*0.12);
      ctx.beginPath();ctx.arc(cx, y+h*0.27, 3, 0, Math.PI*2);ctx.fill();
      ctx.strokeStyle=stk;ctx.lineWidth=sw;
      rr(ctx, x, y, w, h, 4);ctx.stroke();
      break;
    }
    case 'wc': {
      // Réservoir (en haut)
      ctx.fillStyle='#2a3548';
      rr(ctx, x+w*0.05, y, w*0.9, h*0.32, 3);ctx.fill();
      ctx.strokeStyle='#475569';ctx.lineWidth=1;
      rr(ctx, x+w*0.05, y, w*0.9, h*0.32, 3);ctx.stroke();
      // Cuvette (forme ovale)
      ctx.fillStyle='#3a4658';
      ctx.beginPath();
      ctx.moveTo(x+w*0.12, y+h*0.32);
      ctx.lineTo(x+w*0.88, y+h*0.32);
      ctx.quadraticCurveTo(x+w*1.05, y+h*0.65, x+w*0.85, y+h*0.97);
      ctx.lineTo(x+w*0.15, y+h*0.97);
      ctx.quadraticCurveTo(x-w*0.05, y+h*0.65, x+w*0.12, y+h*0.32);
      ctx.closePath();ctx.fill();
      // Lunette intérieure
      ctx.fillStyle='#1e2838';
      ctx.beginPath();
      ctx.ellipse(x+w/2, y+h*0.65, w*0.30, h*0.22, 0, 0, Math.PI*2);
      ctx.fill();
      // Contour cuvette
      ctx.strokeStyle=stk;ctx.lineWidth=sw;
      ctx.beginPath();
      ctx.moveTo(x+w*0.12, y+h*0.32);
      ctx.lineTo(x+w*0.88, y+h*0.32);
      ctx.quadraticCurveTo(x+w*1.05, y+h*0.65, x+w*0.85, y+h*0.97);
      ctx.lineTo(x+w*0.15, y+h*0.97);
      ctx.quadraticCurveTo(x-w*0.05, y+h*0.65, x+w*0.12, y+h*0.32);
      ctx.closePath();ctx.stroke();
      break;
    }
    case 'bidet': {
      ctx.fillStyle='#2a3548';
      rr(ctx, x, y, w, h, 4);ctx.fill();
      ctx.fillStyle='#3a4658';
      ctx.beginPath();
      ctx.ellipse(x+w/2, y+h/2, w*0.42, h*0.38, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle='#1e2838';
      ctx.beginPath();
      ctx.ellipse(x+w/2, y+h/2, w*0.30, h*0.26, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle=stk;ctx.lineWidth=sw;
      rr(ctx, x, y, w, h, 4);ctx.stroke();
      break;
    }
    case 'balneo': {
      // Identique baignoire mais avec jets
      ctx.fillStyle='#243d54';
      rr(ctx, x, y, w, h, 8);ctx.fill();
      ctx.fillStyle='#3a5a78';
      const inset=Math.min(w,h)*0.10;
      rr(ctx, x+inset, y+inset, w-inset*2, h-inset*2, 6);ctx.fill();
      ctx.fillStyle='rgba(96,165,250,.30)';
      rr(ctx, x+inset+2, y+inset+2, w-inset*2-4, h-inset*2-4, 5);ctx.fill();
      // Jets balnéo (cercles aux 4 coins intérieurs)
      ctx.fillStyle='#7c3aed';
      const jr=Math.min(w,h)*0.04;
      [[0.20,0.35],[0.80,0.35],[0.20,0.65],[0.80,0.65]].forEach(([fx,fy])=>{
        ctx.beginPath();ctx.arc(x+w*fx, y+h*fy, jr, 0, Math.PI*2);ctx.fill();
      });
      ctx.strokeStyle=stk;ctx.lineWidth=sw;
      rr(ctx, x, y, w, h, 8);ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = c.water?'#1e3a5a':'#2a3040';
      rr(ctx, x, y, w, h, 6);ctx.fill();
      ctx.font=`${Math.min(w,h)*0.42}px sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(c.ico, x+w/2, y+h/2);
      ctx.textBaseline='alphabetic';
      ctx.strokeStyle=stk;ctx.lineWidth=sw;
      rr(ctx, x, y, w, h, 6);ctx.stroke();
    }
  }
}

function drawElec(ctx, v){
  for(const e of SC.electrique){
    const c=CAT_EL[e.type]; if(!c) continue;
    const {errs,warns}=checkEl(e);
    const col=hideChecks()?'#60a5fa':errs.length?'#ef4444':warns.length?'#f59e0b':'#22c55e';
    const sp=mToScreen(e.x,e.y,v);
    const R=Math.max(11, v.sc*0.10);
    const sel=(e.id===selElId);
    if(sel){
      ctx.beginPath();
      ctx.arc(sp.x,sp.y, R+5, 0, Math.PI*2);
      ctx.fillStyle='rgba(96,165,250,.20)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(sp.x,sp.y, R, 0, Math.PI*2);
    ctx.fillStyle='#141a26';
    ctx.fill();
    ctx.strokeStyle=col;
    ctx.lineWidth=sel?2.8:2;
    ctx.stroke();
    ctx.font=`${Math.max(9, R*0.85)}px sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(c.ico, sp.x, sp.y);
    ctx.textBaseline='alphabetic';
    ctx.font=`bold 8px ui-monospace,monospace`;
    ctx.fillStyle=col;
    ctx.fillText((e.h||1).toFixed(1)+'m', sp.x, sp.y+R+10);
    // Status dot
    ctx.beginPath();
    ctx.arc(sp.x+R*.7, sp.y-R*.7, 3.5, 0, Math.PI*2);
    ctx.fillStyle=col; ctx.fill();
    ctx.strokeStyle='#0a1221'; ctx.lineWidth=1; ctx.stroke();
    drawNumBadge(ctx, sp.x-R*.8, sp.y-R*.8, exoNum(e));
  }
}

function drawCurrentPoly(ctx, v){
  if(!curPoly.length) return;
  const p0=mToScreen(curPoly[0].x, curPoly[0].y, v);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for(let i=1;i<curPoly.length;i++){
    const p=mToScreen(curPoly[i].x, curPoly[i].y, v);
    ctx.lineTo(p.x, p.y);
  }
  if(dMouse){
    const pm=mToScreen(dMouse.x, dMouse.y, v);
    ctx.lineTo(pm.x, pm.y);
  }
  ctx.strokeStyle='#60a5fa';
  ctx.lineWidth=2;
  ctx.setLineDash([6,4]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Points
  for(const pt of curPoly){
    const p=mToScreen(pt.x, pt.y, v);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
    ctx.fillStyle='#3b82f6';
    ctx.fill();
    ctx.strokeStyle='#fff';
    ctx.lineWidth=1.5;
    ctx.stroke();
  }
  // Cercle de fermeture
  if(curPoly.length>2 && dMouse){
    const d=Math.hypot(dMouse.x-curPoly[0].x, dMouse.y-curPoly[0].y);
    if(d<0.20){
      const p=mToScreen(curPoly[0].x, curPoly[0].y, v);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12, 0, Math.PI*2);
      ctx.strokeStyle='#22c55e';
      ctx.lineWidth=2;
      ctx.stroke();
    }
  }
}

function rr(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// ════════════════════════════════
//  INFO BAR
// ════════════════════════════════
function updateInfo(name){
  const id={draw:'infoDraw',open:'infoOpen',san:'infoSan',el:'infoEl'}[name];
  const el=document.getElementById(id); if(!el) return;
  let txt='';
  if(name==='draw'){
    const a=SC.walls.length?roomArea():0;
    txt = `<b>${SC.walls.length}</b> mur(s) · <b>${a.toFixed(2)}</b> m²`;
  } else if(name==='open'){
    txt = `<b>${SC.openings.length}</b> ouverture(s)`;
  } else if(name==='san'){
    txt = `<b>${SC.sanitaires.length}</b> sanitaire(s) · <b>${SC.meubles.length}</b> meuble(s)`;
  } else if(name==='el'){
    const ne=SC.electrique.filter(e=>checkEl(e).errs.length>0).length;
    txt = hideChecks() ? `<b>${SC.electrique.length}</b> él.` : `<b>${SC.electrique.length}</b> él. · <b style="color:${ne?'var(--er)':'var(--ok)'}">${ne}</b> erreur(s)`;
  }
  el.innerHTML=txt;
}
