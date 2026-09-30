'use strict';

// ════════════════════════════════
//  CANVAS GÉNÉRIQUE
// ════════════════════════════════
function getCanvas(name){
  const wrapId = {draw:'wDraw',open:'wOpen',san:'wSan',el:'wEl',studio:'wStudio'}[name];
  const cvId   = {draw:'cvDraw',open:'cvOpen',san:'cvSan',el:'cvEl',studio:'cvStudio'}[name];
  return {wrap:document.getElementById(wrapId), cv:document.getElementById(cvId)};
}

function initCanvas(name){
  const {wrap,cv} = getCanvas(name);
  if(!cv) return;
  const dpr = window.devicePixelRatio||1;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  cv.width = w*dpr; cv.height = h*dpr;
  cv.style.width=w+'px'; cv.style.height=h+'px';
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);

  if(!VIEWS[name].init){
    VIEWS[name].init=true;
    fitView(name);
    if(name==='studio'){ if(!cv._evt){ cv._evt=true; setupStudioEvents(cv); } } else setupCanvasEvents(name, cv);
  }
  redraw(name);
}

function fitView(name){
  const {wrap,cv} = getCanvas(name);
  if(!cv) return;
  const w=cv.clientWidth, h=cv.clientHeight;
  if(!SC.walls.length){
    VIEWS[name].sc=80; VIEWS[name].px=w/2; VIEWS[name].py=h/2;
    return;
  }
  let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
  for(const wall of SC.walls) for(const p of wall.pts){
    mnx=Math.min(mnx,p.x); mxx=Math.max(mxx,p.x);
    mny=Math.min(mny,p.y); mxy=Math.max(mxy,p.y);
  }
  const pad=0.4;
  const rw=mxx-mnx+pad*2, rh=mxy-mny+pad*2;
  const sc=Math.floor(Math.min(w/rw, h/rh, 200));
  VIEWS[name].sc=sc;
  VIEWS[name].px=w/2 - ((mnx+mxx)/2)*sc;
  VIEWS[name].py=h/2 - ((mny+mxy)/2)*sc;
}

function zoom(name, factor){
  const lim = name==='studio' ? [15,800] : [30,400];
  VIEWS[name].sc = Math.max(lim[0], Math.min(lim[1], VIEWS[name].sc*factor));
  redraw(name);
}
function zoomFit(name){ fitView(name); redraw(name); }

function mToScreen(x,y,v){ return {x:v.px+x*v.sc, y:v.py+y*v.sc}; }
function screenToM(sx,sy,v){ return {x:(sx-v.px)/v.sc, y:(sy-v.py)/v.sc}; }
function snap(x,y,g=0.10){ return {x:Math.round(x/g)*g, y:Math.round(y/g)*g}; }

// ════════════════════════════════
//  ÉVÉNEMENTS UNIFIÉS
// ════════════════════════════════
function setupCanvasEvents(name, cv){
  let dragId=-1, dragOff={x:0,y:0}, dragMode='move';
  let touchData=[];
  let lastTap=0;

  function getMPos(clientX, clientY){
    const r=cv.getBoundingClientRect();
    return screenToM(clientX-r.left, clientY-r.top, VIEWS[name]);
  }

  function onPress(clientX, clientY, isDouble=false){
    const p=getMPos(clientX,clientY);
    const sp=snap(p.x,p.y);

    if(EXO.active){ exoTap(p); return; }

    if(name==='draw'){
      if(drawTool==='pan'){
        // Mode sélection : tap sur un mur l'édite
        const wi = hitWall(p.x, p.y);
        if(wi !== null){
          selWallIdx = wi;
          openWallProp(wi);
        } else {
          selWallIdx = -1;
          closePS('wall');
        }
        redraw(name);
        return;
      }
      if(drawTool==='poly'){
        // Test fermeture
        if(curPoly.length>2){
          const d=Math.hypot(sp.x-curPoly[0].x, sp.y-curPoly[0].y);
          if(d<0.20 || isDouble){ closePoly(); return; }
        }
        if(isDouble && curPoly.length>=3){ closePoly(); return; }
        curPoly.push(sp);
      } else if(drawTool==='rect'){
        curPoly.push(sp);
        if(curPoly.length===2){
          const [a,b]=curPoly;
          SC.walls.push({pts:[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}],closed:true,kind:"ext",comp:DEFAULT_WALL});
          curPoly=[];
        }
      }
      redraw(name);
    }
    else if(name==='open'){
      // D'abord tester si on tap sur une ouverture existante
      const hitO = hitOp(p.x, p.y);
      if(hitO){
        selOpId = hitO.id;
        openOpProp(hitO.id);
        redraw(name);
        return;
      }
      placeOpening(p.x, p.y);
      redraw(name);
    }
    else if(name==='san'){
      // Test si on tap sur le pommeau d'une douche italienne sélectionnée
      let pommeauHit = null;
      for(const s of SC.sanitaires){
        if(s.type !== 'douche_it') continue;
        const pp = pommeauPos(s);
        if(Math.hypot(p.x - pp.x, p.y - pp.y) < 0.15){
          pommeauHit = s;
          break;
        }
      }
      if(pommeauHit){
        selSanId = pommeauHit.id;
        dragId = pommeauHit.id;
        dragMode = 'pommeau';
        openSanProp(pommeauHit.id);
        redraw(name);
        return;
      }
      const hitM = SC.meubles.slice().reverse().find(m=>{
        const c=CAT_MEUBLE[m.type];
        return Math.hypot(p.x-m.x,p.y-m.y) <= Math.max(c.w,c.d)/2*1.1;
      });
      if(hitM){
        selMeuId=hitM.id; selSanId=-1;
        dragId=hitM.id; dragMode='meuble';
        dragOff={x:hitM.x-p.x, y:hitM.y-p.y};
        openMeubleProp(hitM.id);
        redraw(name);
        return;
      }
      selMeuId=-1;
      const hit = hitTest(p.x,p.y, SC.sanitaires, s=>{
        const c=CAT_SAN[s.type];
        return Math.max(c.w,c.d)/2*1.1;
      });
      if(hit){
        selSanId=hit.id;
        dragId=hit.id;
        dragMode = 'move';
        dragOff={x:hit.x-p.x, y:hit.y-p.y};
        openSanProp(hit.id);
      } else {
        selSanId=-1; closePS('san');
      }
      redraw(name);
    }
    else if(name==='el'){
      const hit = hitTest(p.x,p.y, SC.electrique, ()=>0.20);
      if(hit){
        selElId=hit.id;
        dragId=hit.id;
        dragOff={x:hit.x-p.x, y:hit.y-p.y};
        openElProp(hit.id);
      } else {
        selElId=-1; closePS('el');
      }
      redraw(name);
    }
  }

  function onMove(clientX, clientY){
    const p=getMPos(clientX,clientY);
    dMouse=p;
    if(dragId>0){
      if(name==='san' && dragMode==='meuble'){
        const m=SC.meubles.find(x=>x.id===dragId);
        if(m){ m.x=p.x+dragOff.x; m.y=p.y+dragOff.y; updateMeubleProp(dragId); }
      } else if(name==='san'){
        const el=SC.sanitaires.find(s=>s.id===dragId);
        if(el){
          if(dragMode==='pommeau'){
            // Déplacer pommeau : convertir position monde → repère local
            const loc = worldToLocalPommeau(el, p.x, p.y);
            el.pommeauLx = loc.lx;
            el.pommeauLy = loc.ly;
            updateSanProp(dragId);
          } else {
            el.x=p.x+dragOff.x; el.y=p.y+dragOff.y;
            updateSanProp(dragId);
          }
        }
      } else if(name==='el'){
        const el=SC.electrique.find(e=>e.id===dragId);
        if(el){
          el.x=p.x+dragOff.x; el.y=p.y+dragOff.y;
          elMountToWall(el, 0.8);
          el.zone=getZone(el.x,el.y,el.h);
          el.distCm=distToV0(el.x,el.y);
          updateElProp(dragId);
        }
      }
    }
    if(name==='draw' && drawTool!=='pan'){
      // Refresh pour preview de la ligne
    }
    redraw(name);
  }

  // Mouse
  cv.addEventListener('mousedown', e=>{
    e.preventDefault();
    onPress(e.clientX, e.clientY);
  });
  cv.addEventListener('mousemove', e=>onMove(e.clientX, e.clientY));
  document.addEventListener('mouseup', ()=>{ dragId=-1; dragMode='move'; });
  cv.addEventListener('dblclick', e=>{
    e.preventDefault();
    onPress(e.clientX, e.clientY, true);
  });
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    zoom(name, e.deltaY<0?1.15:0.87);
  }, {passive:false});

  // Touch
  cv.addEventListener('touchstart', e=>{
    e.preventDefault();
    touchData = Array.from(e.touches).map(t=>({x:t.clientX,y:t.clientY}));
    if(e.touches.length===1){
      const t=e.touches[0];
      const now=Date.now();
      if(now-lastTap<300){
        onPress(t.clientX, t.clientY, true);
        lastTap=0;
      } else {
        onPress(t.clientX, t.clientY);
        lastTap=now;
      }
    }
  }, {passive:false});

  cv.addEventListener('touchmove', e=>{
    e.preventDefault();
    const ts = Array.from(e.touches);
    if(ts.length===2 && touchData.length===2){
      // Pinch zoom
      const d0=Math.hypot(touchData[1].x-touchData[0].x, touchData[1].y-touchData[0].y);
      const d1=Math.hypot(ts[1].clientX-ts[0].clientX, ts[1].clientY-ts[0].clientY);
      if(d0>0) VIEWS[name].sc = Math.max(30, Math.min(400, VIEWS[name].sc*d1/d0));
      // Pan center
      const c0={x:(touchData[0].x+touchData[1].x)/2, y:(touchData[0].y+touchData[1].y)/2};
      const c1={x:(ts[0].clientX+ts[1].clientX)/2, y:(ts[0].clientY+ts[1].clientY)/2};
      VIEWS[name].px += c1.x-c0.x;
      VIEWS[name].py += c1.y-c0.y;
      touchData = ts.map(t=>({x:t.clientX,y:t.clientY}));
      redraw(name);
    } else if(ts.length===1){
      if(dragId>0){
        onMove(ts[0].clientX, ts[0].clientY);
      } else if(drawTool==='pan' || (name!=='draw'&&name!=='open' && touchData[0])){
        // Pan single finger en mode pan ou en placement
        if(touchData[0] && drawTool==='pan'){
          const dx=ts[0].clientX-touchData[0].x;
          const dy=ts[0].clientY-touchData[0].y;
          VIEWS[name].px+=dx; VIEWS[name].py+=dy;
          touchData = ts.map(t=>({x:t.clientX,y:t.clientY}));
          redraw(name);
        }
      }
    }
  }, {passive:false});

  cv.addEventListener('touchend', e=>{
    e.preventDefault();
    dragId=-1; dragMode='move';
    touchData=[];
  }, {passive:false});
}

function hitTest(x,y, list, radiusFn){
  for(let i=list.length-1;i>=0;i--){
    const it=list[i];
    if(Math.hypot(x-it.x, y-it.y) < radiusFn(it)) return it;
  }
  return null;
}
