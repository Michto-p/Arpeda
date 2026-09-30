'use strict';

// ════════════════════════════════
//  CALCULS
// ════════════════════════════════
function polyArea(pts){
  let a=0;
  for(let i=0;i<pts.length;i++){
    const j=(i+1)%pts.length;
    a += pts[i].x*pts[j].y - pts[j].x*pts[i].y;
  }
  return a/2;
}

function roomArea(){
  let a=0;
  for(const w of SC.walls) a += Math.abs(polyArea(w.pts));
  return a;
}

function ptInPoly(px,py,pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const xi=pts[i].x, yi=pts[i].y;
    const xj=pts[j].x, yj=pts[j].y;
    if(((yi>py)!==(yj>py)) && (px<(xj-xi)*(py-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}

function calcVols(){
  const H=SC.roomH, ZH=2.25;
  let mnx=0,mxx=3,mny=0,mxy=2.4;
  if(SC.walls.length) for(const w of SC.walls)for(const p of w.pts){
    mnx=Math.min(mnx,p.x); mxx=Math.max(mxx,p.x);
    mny=Math.min(mny,p.y); mxy=Math.max(mxy,p.y);
  }
  const roomPoly = SC.walls.length ? SC.walls[0].pts : [];
  const rArea = roomArea();
  const roomVol = rArea*H;
  if(!roomPoly.length) return {roomVol:0, z0:0, z1:0, z2:0, hors:0};

  // Échantillonnage 3D : on parcourt en X, Y, Z avec un pas adapté
  const STEPxz=0.10, STEPy=0.15;
  const cellV = STEPxz*STEPxz*STEPy;
  let z0v=0, z1v=0, z2v=0;
  for(let x=mnx+STEPxz/2; x<mxx; x+=STEPxz){
    for(let y=mny+STEPxz/2; y<mxy; y+=STEPxz){
      if(!ptInPoly(x,y,roomPoly)) continue;
      // Pour chaque colonne, échantillonner en hauteur
      for(let h=STEPy/2; h<H; h+=STEPy){
        const z = getZone(x, y, h);
        if(z===0) z0v += cellV;
        else if(z===1) z1v += cellV;
        else if(z===2) z2v += cellV;
      }
    }
  }
  return {roomVol, z0:z0v, z1:z1v, z2:z2v, hors:Math.max(0,roomVol-z0v-z1v-z2v)};
}
