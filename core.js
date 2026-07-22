/* ===== 대원항업 탱고 GIS 공통 엔진 (core.js) — BUILD 789 ===== */
/* BUILD 배지는 각 페이지(html)의 buildno span이 직접 표시 — core.js가 덮어쓰지 않음 */

/* 페이지 자동 감지: 결선(survey) / 측량(현장)(field) / 탱고(tango) */
var IS_FIELD=(document.title==='측량(현장)'), IS_TANGO=(document.title==='탱고 DB'), IS_REALTIME=(document.title==='실시간측량');
var STAGE=IS_TANGO?'tango':(IS_FIELD?'field':(IS_REALTIME?'realtime':'survey'));
var DB=STAGE; // STAGE별 Supabase 테이블 완전 분리: survey_*/field_*/tango_*
if(IS_FIELD)document.body.classList.add('fpage');
/* ====== 설정: 본인 Supabase 정보 입력 (비우면 로컬 모드) ====== */
var SUPABASE_URL = "https://yidswostdxaejjeikxhg.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZHN3b3N0ZHhhZWpqZWlreGhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjM1MDAsImV4cCI6MjA5MzUzOTUwMH0.DIP9Yqr7v0Z5y4bdqU5UkoNn1OL0dh1WuYhaiOxtaq4";
/* ============================================================== */

var SVGNS="http://www.w3.org/2000/svg";
var cv=document.getElementById('cv');
var gGeo=document.createElementNS(SVGNS,'g'); gGeo.setAttribute('pointer-events','none');
var gMark=document.createElementNS(SVGNS,'g'); gMark.setAttribute('pointer-events','none');
var gDraft=document.createElementNS(SVGNS,'g'); gDraft.setAttribute('pointer-events','none');
var gPts=document.createElementNS(SVGNS,'g');
var gMH=document.createElementNS(SVGNS,'g'); // 맨홀 심벌 레이어
var gHyunSym=document.createElementNS(SVGNS,'g'); gHyunSym.setAttribute('pointer-events','none');
var gHit=document.createElementNS(SVGNS,'g'); // 측점 클릭 hit (최상위 — 항상 클릭 우선)
cv.appendChild(gGeo); cv.appendChild(gMark); cv.appendChild(gDraft); cv.appendChild(gPts);cv.appendChild(gHyunSym); cv.appendChild(gHit); cv.appendChild(gMH);

/* 상태 */
var state={ projectId:null, projectName:null, loadedStage:STAGE, _importSrc:[], points:[], lines:[], markups:[], labelOff:{}, manholes:[], photoDir:{}, asbuilt:null, nightShift:null, fieldDone:null, bizInfo:null, titleBlock:null };
// manhole 구조: {id, wx, wy, label, lx, ly}
// wx,wy = 맨홀 중심 세계좌표(x=동,y=북)
// lx,ly = 라벨 앵커 세계좌표
// label = '2M(SKB)' 등
var mode='pan', status='ok', bpCrop=null, bpEraseHover=-1;
var bpOff=false; /* 백판(수치지도) 숨김 여부 */
var LINECOL={"통신관로":{c:"#d92b2b",w:1.6},"압입구간":{c:"#1f6fd6",w:3.0,dash:"10 7"},"지거":{c:"#f2b400",w:2.4},"주입상인출선":{c:"#999",w:1},"보도":{c:"#81d4fa",w:1.4},"도로":{c:"#0277bd",w:1.6}};
function isTpoint(p){return /(^|\s)T(\s|\d|$)/.test((p&&p.code)||'');}
  function tamsaTag(p){
    if(p._tcode)return p._tcode;
    var SF={'\uB3C4\uB85C':'D','\uBCF4\uB3C4':'B','\uC0AC\uB9AC\uB3C4':'S'};
    var PV={'\uC544\uC2A4\uD314\uD2B8':'A','\uBCF4\uB3C4':'B','\uC0AC\uB9AC\uB3C4':'S','\uCF58\uD06C\uB9AC\uD2B8':'C'};
    var sf=SF[p.surface]||'';var pv=PV[p.pave]||(p.pave?p.pave.charAt(0):'');
    var head=sf+pv;var c=(p.code||'').trim();
    var z=(p.z!=null&&isFinite(p.z))?(''+p.z):'';
    var tail=c==='T'?'T':(c?c:'');
    return (head+(tail?' '+tail:'')).replace(/^\s+|\s+$/g,'');
  }
  function isHyunPt(p){var c=((p&&p.code||'')+'').trim().toLowerCase();return c.charAt(0)==='b';}
function pipeCount(p){var m=/[xX×]\s*(\d+)/.exec((p&&p.code)||'');return m?+m[1]:null;}
function isManhole(p){return /^\s*M/.test((p&&p.code)||'');}
function isRiserPt(p){var c=((p&&p.code)||'').trim(),tc=((p&&p._tcode)||'').trim();return /(^|\s)(TJ|EJ)/i.test(c)||/(^|\s)(TJ|EJ)/i.test(tc);} // 전주(통신주TJ·한전주EJ) 측점
// ★ CSV 맨홀 코드 → 종류 이름표 (BUILD512). 코드 앞/뒤 M = 맨홀, M 뗀 나머지로 종류. SW=한전 특수. 모르는 M코드는 코드 그대로 표시(누락 방지)
var MH_KINDS={'DL':'드림라인','SKT':'SKT','SKB':'SKB','\uC2DC\uCCAD':'\uC2DC\uCCAD','\uC138\uC885':'\uC138\uC885','SJ':'\uC138\uC885','TBRO':'\uD2F0\uBE0C\uB85C','LGPOWER':'LG\uD30C\uC6CC','HTI':'HTI'};
function isMhCode(code){var c=(code||'').trim();if(!c)return false;if(/^SW$/i.test(c))return true;if(/^(l|B|D|BD|DB)$/i.test(c))return false;return /M(\s|$)/.test(c)||/^M/.test(c)||/JB(\s|$)/i.test(c);}
function mhKindOf(code){var c=(code||'').trim();if(/^SW$/i.test(c))return '\uD55C\uC804';var base=c.replace(/\s*JB\s*$/i,'').replace(/M(\s.*)?$/i,'').replace(/^M/,'').trim();for(var k in MH_KINDS){if(base.toUpperCase()===k.toUpperCase())return MH_KINDS[k];}return base||c;}
// ── 폴리라인 위 앵커 계산 (지거 멘트 인출선용) ──
function polySegs(pts){var segs=[],total=0;for(var i=0;i<pts.length-1;i++){var d=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]);segs.push(d);total+=d;}return {segs:segs,total:total};}
function polyAnchorT(L){if(L.anchorT!=null)return L.anchorT;var pts=L.pts;if(!pts||pts.length<2)return 0;var ps=polySegs(pts);return ps.total?(ps.segs[0]*0.5)/ps.total:0;} // 기본=첫 두 점 구간 중간
function ptOnPoly(pts,t){var ps=polySegs(pts);if(ps.total===0)return [pts[0][0],pts[0][1]];var target=t*ps.total,acc=0;for(var i=0;i<ps.segs.length;i++){if(acc+ps.segs[i]>=target){var f=ps.segs[i]?(target-acc)/ps.segs[i]:0;return [pts[i][0]+(pts[i+1][0]-pts[i][0])*f,pts[i][1]+(pts[i+1][1]-pts[i][1])*f];}acc+=ps.segs[i];}return [pts[pts.length-1][0],pts[pts.length-1][1]];}
function projToPoly(pts,px,py){var ps=polySegs(pts);if(ps.total===0)return 0;var best=Infinity,bestT=0,acc=0;for(var i=0;i<pts.length-1;i++){var ax=pts[i][0],ay=pts[i][1],dx=pts[i+1][0]-ax,dy=pts[i+1][1]-ay,L2=dx*dx+dy*dy;var f=L2?((px-ax)*dx+(py-ay)*dy)/L2:0;if(f<0)f=0;if(f>1)f=1;var qx=ax+dx*f,qy=ay+dy*f,dist=Math.hypot(px-qx,py-qy);if(dist<best){best=dist;bestT=(acc+ps.segs[i]*f)/ps.total;}acc+=ps.segs[i];}return bestT;}
var MKCOL={ok:'#2a9e50',bad:'#d32f2f'};

function el(t,a){var e=document.createElementNS(SVGNS,t);for(var k in a)e.setAttribute(k,a[k]);return e;}
function S(x,y){return [x,-y];}                 // 화면좌표(북쪽 위)
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},1800);}
// 커스텀 팝업: 드래그 이동 가능, 항상 앞, 도면(팝업 밖)은 그대로 조작 가능(non-blocking)
function parseDepthL(txt){
  var lines=txt.replace(/\r/g,'').split('\n').filter(function(l){return l.trim().length;});
  if(!lines.length)return [];
  var h=lines[0].split(',');
  function ci(ns){for(var k=0;k<ns.length;k++){var x=h.indexOf(ns[k]);if(x>=0)return x;}return -1;}
  var iN=ci(['이름']),iX=ci(['X']),iY=ci(['Y']),iZ=ci(['Z(레벨)','Z']),iC=ci(['코드']);
  var out=[];
  for(var r=1;r<lines.length;r++){
    var c=lines[r].split(',');
    var X=parseFloat(c[iX]),Y=parseFloat(c[iY]),Z=parseFloat(c[iZ]);
    if(isNaN(X)||isNaN(Y)||isNaN(Z))continue;
    var code=(iC>=0?(c[iC]||''):'').trim();
    if(code.toLowerCase()!=='l')continue;   /* L 코드 점만 */
    out.push({name:(c[iN]||'').trim(),X:X,Y:Y,z:Z,code:code});
  }
  return out;
}
function drawDepthMarks(){
  if(!state._showDepthMarks)return;
  (state.depthGround||[]).forEach(function(gp){
    if(gp.dep!=null)return;                 /* 매칭된 점은 패스 */
    var s=S(gp.Y,gp.X);
    gPts.appendChild(el('circle',{cx:s[0],cy:s[1],r:1.1,fill:'none',stroke:'#e11','stroke-width':2.2,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));if(typeof mkLabel==='function')mkLabel(s[0]+1.5,s[1],(gp.name?gp.name+' ':'')+'l X'+(+gp.X).toFixed(2)+' Y'+(+gp.Y).toFixed(2),{fill:'#e11',weight:'700',px:11,grp:'depth',anchor:'start'});
  });
  (state._depthRefUnused||[]).forEach(function(rf){
    var s=S(rf.Y,rf.X);
    gPts.appendChild(el('circle',{cx:s[0],cy:s[1],r:1.1,fill:'none',stroke:'#e80','stroke-width':2.2,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));if(rf.no&&typeof mkLabel==='function')mkLabel(s[0]+1.5,s[1],rf.no,{fill:'#e80',weight:'700',px:11,grp:'depth',anchor:'start'});
  });
}
function parseAftCsv(txt){
  var lines=txt.replace(/\r/g,'').split('\n').filter(function(l){return l.trim().length;});
  if(!lines.length)return {ground:[],align:[]};
  var h=lines[0].split(',');
  function ci(ns){for(var k=0;k<ns.length;k++){var x=h.indexOf(ns[k]);if(x>=0)return x;}return -1;}
  var iN=ci(['\uC774\uB984']),iX=ci(['X']),iY=ci(['Y']),iZ=ci(['Z(\uB808\uBCA8)','Z']);
  var g=[],a=[];
  for(var r=1;r<lines.length;r++){
    var c=lines[r].split(',');
    var X=parseFloat(c[iX]),Y=parseFloat(c[iY]),Z=parseFloat(c[iZ]);
    if(isNaN(X)||isNaN(Y)||isNaN(Z))continue;
    var nm=(c[iN]||'').trim();
    if(nm.indexOf('(')>=0)g.push({name:nm,X:X,Y:Y,z:Z});
    else a.push({X:X,Y:Y,z:Z});
  }
  return {ground:g,align:a};
}
// ===== 검수데이터(탱고): 후측량/현황 CSV 코드 분류 =====
// l=관로측설점(심도) · SKTM=맨홀 · B=보도 · D=도로 · BD=도로/인도경계 · 100x6=측설용성과(무시)
function parseInspCsv(txt){
  var lines=txt.replace(/\r/g,'').split('\n').filter(function(l){return l.trim().length;});
  if(!lines.length)return [];
  var h=lines[0].split(',');
  function ci(ns){for(var k=0;k<ns.length;k++){var x=h.indexOf(ns[k]);if(x>=0)return x;}return -1;}
  var iN=ci(['이름']),iX=ci(['X']),iY=ci(['Y']),iZ=ci(['Z(레벨)','Z']),iC=ci(['코드']),iP=ci(['PDOP']);
  var out=[];
  for(var r=1;r<lines.length;r++){
    var c=lines[r].split(',');
    var X=parseFloat(c[iX]),Y=parseFloat(c[iY]),Z=parseFloat(c[iZ]);
    if(isNaN(X)||isNaN(Y))continue;
    var code=(iC>=0?(c[iC]||''):'').trim();
    var pdop=(iP>=0?(c[iP]||''):'').trim();
    if(code==='100x6'){out.push({code:'100x6',skip:true});continue;}   // 측설용 노출관로 성과 = 무시
    if(code===''&&pdop==='')continue;                                   // 품질 빈칸·코드 없음 = 무시
    var _psf='',_ppv='';var _rawc=code;if(state.tamsa){var _tc=parseTamsaCode(code);if(_tc){_psf=_tc.surface||'';_ppv=_tc.pave||'';code=(_tc.code||(_tc.isT?'T':''));if(_tc.z!=null)Z=_tc.z;}}
    out.push({name:(c[iN]||'').trim(),ex:Y,no:X,z:Z,code:code,surface:_psf,pave:_ppv,_rawc:_rawc,_hyun:/^([BDS]|BD|DB)$/i.test((_rawc||'').trim())});        // ex=동(앱x)=CSV Y, no=북(앱y)=CSV X
  }
  return out;
}
function parseTamsaCode(raw){var t=(raw||'').trim();if(!t)return null;var sp=t.split(/\s+/),pre,val;if(sp.length>=2){pre=sp[0];val=sp.slice(1).join(' ');}else if(/^([BDS]|BD|DB)$/i.test(sp[0]||'')){pre=sp[0];val='';}else{pre='';val=sp[0]||'';}var surface='',c0=pre.charAt(0).toUpperCase();if(c0==='D')surface='\uB3C4\uB85C';else if(c0==='B')surface='\uBCF4\uB3C4';else if(c0==='S')surface='\uC0AC\uB9AC\uB3C4';var pave='',PAVE=[["CON'C",'\uCF58\uD06C\uB9AC\uD2B8'],['\uC11D\uC7AC','\uC11D\uC7AC'],['\uD0C4\uC131\uD3EC\uC7A5\uC7AC','\uD0C4\uC131\uD3EC\uC7A5\uC7AC'],['\uD22C\uC2A4\uCF58','\uD22C\uC2A4\uCF58'],['\uD0DD\uC9C0','\uD0DD\uC9C0'],['AS','\uC544\uC2A4\uD314\uD2B8']];for(var i=0;i<PAVE.length;i++){if(t.toUpperCase().indexOf(PAVE[i][0].toUpperCase())>=0){pave=PAVE[i][1];break;}}if(!pave){var c1=pre.charAt(1).toUpperCase();if(c1==='A')pave='\uC544\uC2A4\uD314\uD2B8';else if(c1==='B')pave='\uBCF4\uB3C4';else if(c1==='S')pave='\uC0AC\uB9AC\uB3C4';else if(c1==='C')pave='\uCF58\uD06C\uB9AC\uD2B8';}var z=null,code='',isT=false;if(!val&&/^T$/i.test(pre))isT=true;if(/^T[\d.]/.test(val)){isT=true;var m=val.match(/[\d.]+/);if(m)z=parseFloat(m[0]);}else if(/^[\d.]+$/.test(val))z=parseFloat(val);else if(/M$/i.test(val))code=val;else if(/^(EJ|TJ)/i.test(val))code=val;else if(val)code=val;return {surface:surface,pave:pave,z:z,code:code,isT:isT};}
function loadHyunPts(){var arr=(typeof finalCsvArr==='function')?finalCsvArr():[];var pts=[];arr.forEach(function(it){var rs;try{rs=parseInspCsv(it.text||'');}catch(e){rs=[];}rs.forEach(function(p){if(p.skip)return;var c=((p._rawc||p.code||'')+'').trim().toLowerCase();if(c==='b'||c==='d'||c==='s'||c==='bd'||c==='db')pts.push([p.ex,p.no,c]);});});state.hyunPts=pts;}
function buildHyunLines(){var arr=(typeof finalCsvArr==='function')?finalCsvArr():[];var csvs=arr.map(function(it){try{return parseInspCsv(it.text||'');}catch(e){return [];}});if(typeof pushHist==='function')pushHist();state.lines=(state.lines||[]).filter(function(l){return !l.insp;});var trunk=[];(state.lines||[]).forEach(function(L){if(L.layer==='\uD1B5\uC2E0\uAD00\uB85C'&&L.pts&&L.pts.length>=2){for(var ti=0;ti<L.pts.length-1;ti++)trunk.push([L.pts[ti],L.pts[ti+1]]);}});function ccw(p,q,r){return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);}function crossTrunk(p,q){for(var ci=0;ci<trunk.length;ci++){var c=trunk[ci][0],dd=trunk[ci][1];if(((ccw(p,q,c)>0)!==(ccw(p,q,dd)>0))&&((ccw(c,dd,p)>0)!==(ccw(c,dd,q)>0)))return true;}return false;}function lc(p){return ((p._rawc||p.code||'')+'').trim().toLowerCase();}var byc={b:[],d:[],s:[]};csvs.forEach(function(seq){seq.forEach(function(p){var c=lc(p);if(c==='b')byc.b.push([p.ex,p.no,0]);else if(c==='d')byc.d.push([p.ex,p.no,0]);else if(c==='s')byc.s.push([p.ex,p.no,0]);else if(c==='bd'||c==='db'){byc.b.push([p.ex,p.no,1]);byc.d.push([p.ex,p.no,1]);}});});var MAXGAP=50,n=0;function limf(d){if(d<=4)return -1.1;if(d<=15)return 0.64;if(d<=30)return 0.71;return 0.91;}function chainNN(pts,trunk){var N=pts.length,used=[],ls=[],i;for(i=0;i<N;i++)used.push(false);for(;;){var st=-1;for(i=0;i<N;i++){if(!used[i]){st=i;break;}}if(st<0)break;used[st]=true;var ch=[st];var dirs=[1,-1];for(var di=0;di<2;di++){var dir=dirs[di];for(;;){var ei=dir>0?ch[ch.length-1]:ch[0],ep=pts[ei],hv=null;if(ch.length>=2){var pr=dir>0?ch[ch.length-2]:ch[1],pp=pts[pr],vx=ep[0]-pp[0],vy=ep[1]-pp[1],hl=Math.hypot(vx,vy);if(hl>0)hv=[vx/hl,vy/hl];}var best=-1,bd=MAXGAP;for(var j=0;j<N;j++){if(used[j])continue;var d=Math.hypot(pts[j][0]-ep[0],pts[j][1]-ep[1]);if(d>MAXGAP)continue;if(ep[2]&&pts[j][2])continue;if(trunk&&crossTrunk(ep,pts[j]))continue;if(hv){var wx=pts[j][0]-ep[0],wy=pts[j][1]-ep[1],wl=Math.hypot(wx,wy);if(wl>0&&(hv[0]*wx+hv[1]*wy)/wl<limf(d))continue;}if(d<bd){bd=d;best=j;}}if(best<0)break;used[best]=true;if(dir>0)ch.push(best);else ch.unshift(best);}}if(ch.length>=2)ls.push(ch.map(function(x){return [pts[x][0],pts[x][1]];}));}return ls;}Object.keys(byc).forEach(function(c){var layer=c==='b'?'\uBCF4\uB3C4':(c==='s'?'\uC0AC\uB9AC\uB3C4':'\uB3C4\uB85C');chainNN(byc[c],trunk).forEach(function(ch){state.lines.push({layer:layer,pts:ch,insp:true});n++;});});if(typeof saveProject==='function')saveProject();drawGeo();toast(n+'\uAC1C \uD604\uD669\uC120 \uC790\uB3D9\uACB0\uC120');}
function buildInspData(){
  var arr=(typeof finalCsvArr==='function')?finalCsvArr():[];
  var csvs=arr.map(function(it){return parseInspCsv(it.text||'');})
              .filter(function(p){return p.some(function(x){return x.code==='l'||x.code==='SKTM'||x.code==='B'||x.code==='D'||x.code==='BD';});});
  if(!csvs.length){toast('후측량/현황 CSV(코드 l/SKTM/B/D)를 먼저 등록하세요');return;}
  if(typeof pushHist==='function')pushHist();
  state.hyunPts=null;
  if(!state.markups)state.markups=[];
  if(!state.manholes)state.manholes=[];
  // 기존 검수 생성물 정리 후 재생성
  state.lines=(state.lines||[]).filter(function(l){return !l.insp;});
  state.markups=state.markups.filter(function(m){return m.near!=='경계';});
  state.manholes=state.manholes.filter(function(m){return !m.insp;});state.manholes.forEach(function(m){m._mhMatched=false;});
  var nB=0,nD=0,nBD=0,nM=0,nL=0,nIg=0;
  function buildLinesIn(seq,code,layer){
    var pp=seq.filter(function(p){return p.code===code;}),run=[],n=0;
    function flush(){if(run.length>=2){state.lines.push({layer:layer,pts:run.map(function(p){return [p.ex,p.no];}),insp:true});n++;}run=[];}
    for(var i=0;i<pp.length;i++){if(run.length){var pv=run[run.length-1];if(Math.hypot(pp[i].ex-pv.ex,pp[i].no-pv.no)>8)flush();}run.push(pp[i]);}
    flush();return n;
  }
  var _bdPts=[];
  csvs.forEach(function(seq){
    nB+=buildLinesIn(seq,'B','보도');
    nD+=buildLinesIn(seq,'D','도로');
    seq.forEach(function(p){
      if(p.skip){nIg++;return;}
      if(p.code==='BD'){_bdPts.push([p.ex,p.no]);nBD++;}
      else if(!state.tamsa&&isMhCode(p.code)){var _kind=mhKindOf(p.code);var _lab='M ('+_kind+' )';var _ex=p.ex,_no=p.no,_bm=null,_bd=4;(state.manholes||[]).forEach(function(m){if(m._mhMatched)return;var _d=Math.hypot((m.wx||0)-_ex,(m.wy||0)-_no);if(_d<=_bd){_bd=_d;_bm=m;}});if(_bm){var _ox2=_bm.wx,_oy2=_bm.wy;_bm.wx=_ex;_bm.wy=_no;_bm._aft=true;_bm._mhMatched=true;if(!_bm._edited)_bm.label=_lab;if(typeof moveMhLines==='function')moveMhLines(_bm,_ox2,_oy2);}else{state.manholes.push({id:(typeof mhIdSeq!=='undefined'?mhIdSeq++:(Date.now()+nM)),wx:_ex,wy:_no,label:_lab,kind:'신',lx:null,ly:null,type:'mh',insp:true,_aft:true,_mhMatched:true});}nM++;}
      else if(p.code==='l')nL++;
    });
  });
  _bdPts.forEach(function(bd){var bx=bd[0],by=bd[1],bL=null,bIdx=-1,bD=1e18;state.lines.forEach(function(L){if(L.layer!=='보도'||!L.pts||L.pts.length<2)return;for(var i=0;i<L.pts.length-1;i++){var a=L.pts[i],c=L.pts[i+1],dx=c[0]-a[0],dy=c[1]-a[1],L2=dx*dx+dy*dy;var t=L2?((bx-a[0])*dx+(by-a[1])*dy)/L2:0;t=Math.max(0,Math.min(1,t));var cx=a[0]+t*dx,cy=a[1]+t*dy,d=Math.hypot(bx-cx,by-cy);if(d<bD){bD=d;bL=L;bIdx=i;}}});if(bL&&bD<=8){bL.pts.splice(bIdx+1,0,[bx,by]);}});
  (state.manholes||[]).forEach(function(m){if(m._aft&&typeof restitchManhole==='function')restitchManhole(m);});
  drawGeo();
  if(state.tamsa&&typeof buildTamsaMh==='function'){nM=buildTamsaMh();}
  if(typeof drawManholes==='function')drawManholes();
  if(typeof drawMarks==='function')drawMarks();
  if(typeof updMeta==='function')updMeta();
  if(online&&state.projectId&&typeof saveProject==='function')saveProject();
  toast('검수데이터 생성 — 보도 '+nB+'선·도로 '+nD+'선·경계 '+nBD+'·맨홀 '+nM+'·측설 '+nL+'점(심도 다음)'+(nIg?(' · 측설용 '+nIg+' 무시'):''));
}

function computeDepth(){
  var ref=[];
  (state.points||[]).forEach(function(p){
    if(isManhole(p))return;                       /* 맨홀 제외 */
    if(!/[xX\u00D7]\s*\d+/.test(p.code||''))return;    /* 관공정보(관경x관수) 있는 파이프점만 */
    ref.push({X:+p.y,Y:+p.x,z:+p.z,no:p.no,used:false});
  });
  var g=state.depthGround||[],sum=0,ok=0;
  g.forEach(function(gp){
    var b=null,bi=-1,bd=1e18;
    for(var i=0;i<ref.length;i++){var d=Math.hypot(ref[i].X-gp.X,ref[i].Y-gp.Y);if(d<bd){bd=d;b=ref[i];bi=i;}}
    if(b&&bd<=0.5){gp.ref=b.z;gp.dep=gp.z-b.z;gp.dist=bd;gp.refNo=b.no;sum+=gp.dep;ok++;ref[bi].used=true;}
    else{gp.ref=null;gp.dep=null;gp.dist=(b?bd:null);}
  });
  state._depthRefUnused=ref.filter(function(r){return !r.used;});
  state._depthByNo={};g.forEach(function(gp){if(gp.refNo!=null&&gp.dep!=null)state._depthByNo[gp.refNo]=gp.dep;});
  return {avg:ok?sum/ok:0,ok:ok,total:g.length};
}
function buildTamsaMh(){
  if(!state.tamsa)return 0;
  var _keep={};(state.manholes||[]).forEach(function(m){if(m._fromCsv&&m._edited&&m.wx!=null)_keep[m.wx+'_'+m.wy]=1;}); // BUILD677 편집맨홀 좌표키 보존
  state.manholes=(state.manholes||[]).filter(function(m){return m.type==='riser'||m._edited||(!m._fromCsv&&!m._aft);});
  var _mhA=(typeof finalCsvArr==='function')?finalCsvArr():[],n=0;
  _mhA.forEach(function(it){var rs;try{rs=parseInspCsv(it.text||'');}catch(e){rs=[];}rs.forEach(function(p){if(p.skip)return;if(isMhCode(p.code)){if(_keep[p.ex+'_'+p.no])return;var _k=mhKindOf(p.code);state.manholes.push({id:(typeof mhIdSeq!=='undefined'?mhIdSeq++:(Date.now()+state.manholes.length)),wx:p.ex,wy:p.no,label:'M ('+_k+' )',kind:'신',lx:null,ly:null,type:'mh',insp:true,_fromCsv:true,surface:p.surface||'',pave:p.pave||''});n++;}});});
  state.points.forEach(function(p){if(isMhCode(p.code))p._hideMark=true;});
  return n;
}
function loadTamsaCsv(f){
  if(!f)return;
  var rd=new FileReader();
  rd.onload=function(){
    var txt;try{txt=decodeBuf(rd.result);}catch(e){txt=''+rd.result;}
    state.tamsa=true;
    state.markups.forEach(function(m){if(m.el)m.el.remove();});
    state.points=parseCsv(txt,f.name).filter(function(_p){return !_p._hyun;});
    state.finalCsv=[{name:f.name,text:txt}];
    state.lines=[];state.markups=[];state.manholes=[];state.projectId=null;state.routingDone=false;
    if(!state.fieldDone)state.fieldDone={csv:false,joseo:false,manhole:false};
    state.fieldDone.csv=true;
    try{buildTamsaMh();}catch(e){}
    var _nrz=0;
    if(typeof setReadOnly==='function')setReadOnly(false);
    state.projectName=f.name.replace(/\.[^.]+$/,'');
    var ps=document.getElementById('proj');if(ps)ps.value='';
    photoMap={};afterMap={};selNum=null;state.labelOff={};
    clearSvg(gSel);clearSvg(gMH);
    try{finalCsvDepthSync();}catch(e){}
    if(typeof photoPanelOpen!=='undefined'&&photoPanelOpen&&typeof refreshPhotoPanel==='function')refreshPhotoPanel();
    drawGeo();drawMarks();drawManholes();fitView();updMeta();
    var el=document.getElementById('rcTamsa');if(el)el.textContent=f.name;
    var cl=document.getElementById('clrTamsa');if(cl)cl.style.display='';
    if(regOpen())updRegStatus();
    toast('탐사 CSV: 측량점 '+state.points.length+'개'+(_nrz?(' · 전주입상 '+_nrz+'개'):''));
  };
  rd.readAsArrayBuffer(f);
}
function loadAfterCsv(f){
  if(!f)return;
  var rd=new FileReader();
  rd.onload=function(){
    var txt;try{txt=decodeBuf(rd.result);}catch(e){txt=''+rd.result;}
    var a=finalCsvArr();a.push({name:f.name,text:txt});state.finalCsv=a;
    if(!state.fieldDone)state.fieldDone={csv:false,joseo:false,manhole:false};state.fieldDone.csv=true;
    finalCsvDepthSync();
    try{if(typeof IS_TANGO!=='undefined'&&IS_TANGO&&typeof buildInspData==='function')buildInspData();}catch(_bi){}
    if(online&&state.projectId)saveProject();
    if(typeof refreshFieldBar==='function')refreshFieldBar();
    if(typeof updRegStatus==='function')updRegStatus();
    var cl=document.getElementById('clrAft');if(cl)cl.style.display='inline-block';
    toast('후측량 CSV 등록 ('+finalCsvArr().length+'개) — 심도 연동됨');
  };
  rd.readAsArrayBuffer(f);
}
function depthTableHtml(rows){
  var html='<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#f3f0fb"><th style="border:1px solid #e3e3df;padding:5px">\uC9C0\uBC18\uC810</th><th style="border:1px solid #e3e3df;padding:5px">\uB178\uCD9C/\uAD00\uB85CZ</th><th style="border:1px solid #e3e3df;padding:5px">\uC9C0\uBC18Z</th><th style="border:1px solid #e3e3df;padding:5px">\uC2EC\uB3C4(m)</th><th style="border:1px solid #e3e3df;padding:5px">\uC218\uD3C9</th></tr></thead><tbody>';
  rows.forEach(function(r){
    html+='<tr><td style="border:1px solid #eee;padding:4px">'+(r.name||'')+'</td><td style="border:1px solid #eee;padding:4px;text-align:right">'+(r.ref!=null?r.ref.toFixed(3):'\u2014')+'</td><td style="border:1px solid #eee;padding:4px;text-align:right">'+r.z.toFixed(3)+'</td><td style="border:1px solid #eee;padding:4px;text-align:right;font-weight:700;color:'+(r.dep!=null?'#7a52e0':'#c0392b')+'">'+(r.dep!=null?r.dep.toFixed(2):'\uB9E4\uCE6D\uC2E4\uD328')+'</td><td style="border:1px solid #eee;padding:4px;text-align:right;color:#999">'+(r.dist!=null?(r.dist*100).toFixed(1)+'cm':'\u2014')+'</td></tr>';
  });
  return html+'</tbody></table>';
}
function renderDepthOverlay(){
  computeDepth();
  state._showDepthMarks=true;if(typeof drawGeo==='function')drawGeo();
  var g=(state.depthGround||[]).slice().sort(function(a,b){return (a.name||'').localeCompare((b.name||''),undefined,{numeric:true});});
  var ok=g.filter(function(r){return r.dep!=null;});
  var avg=ok.length?ok.reduce(function(s,r){return s+r.dep;},0)/ok.length:0;
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:1300;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML='<div style="background:#fff;border-radius:12px;max-width:780px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.2)"><div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #eee"><b style="font-size:15px">\u{1F4D0} \uC2EC\uB3C4 (\uC9C0\uBC18Z \u2212 \uB178\uCD9C\uAD00\uB85CZ)</b><button id="dpX2" style="margin-left:auto;background:#fff;border:1px solid #e3e3df;border-radius:7px;padding:4px 10px;cursor:pointer">\u2715</button></div><div style="padding:16px"><div style="margin-bottom:8px">\uC9C0\uBC18\uC810 <b>'+g.length+'</b>\uAC1C \u00B7 \uB9E4\uCE6D <b>'+ok.length+'</b> \u00B7 \uD3C9\uADE0\uC2EC\uB3C4 <b style="color:#7a52e0">'+avg.toFixed(2)+' m</b></div>'+depthTableHtml(g)+'</div></div>';
  document.body.appendChild(ov);
  ov.querySelector('#dpX2').onclick=function(){ov.remove();};
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
}

function openDepthCalc(){
  if(state.depthGround&&state.depthGround.length){renderDepthOverlay();return;}
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:1300;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML='<div style="background:#fff;border-radius:12px;max-width:780px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.2)"><div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid #eee"><b style="font-size:15px">\u{1F4D0} \uC2EC\uB3C4 \uACC4\uC0B0 (\uC9C0\uBC18Z \u2212 \uB178\uCD9C\uAD00\uB85CZ)</b><button id="dpX" style="margin-left:auto;background:#fff;border:1px solid #e3e3df;border-radius:7px;padding:4px 10px;cursor:pointer">\u2715</button></div><div style="padding:16px"><div style="display:flex;flex-direction:column;gap:10px"><label style="font-size:13px;color:#444">\u2460 \uD6C4\uCE21\uB7C9 CSV <span style="color:#c0392b">(\uD544\uC218 \u00B7 (1)\uC9C0\uBC18\uC810 \uD3EC\uD568)</span><br><input type="file" id="dpFa" accept=".csv"></label><label style="font-size:13px;color:#444">\u2461 \uB178\uCD9C\uAD00\uB85C CSV <span style="color:#16a34a">(\uC815\uD655\uB3C4\u2191 \u00B7 \uAD8C\uC7A5)</span><br><input type="file" id="dpFb" accept=".csv"></label><button id="dpRun" style="background:#7a52e0;color:#fff;border:none;border-radius:8px;font-weight:700;padding:10px;cursor:pointer">\uC2EC\uB3C4 \uACC4\uC0B0</button></div><div id="dpOut" style="margin-top:14px;font-size:13px"></div></div></div>';
  document.body.appendChild(ov);
  function rd(input,cb){var f=input.files&&input.files[0];if(!f){cb(null);return;}var r=new FileReader();r.onload=function(){try{cb(new TextDecoder('euc-kr').decode(r.result));}catch(e){cb(new TextDecoder('utf-8').decode(r.result));}};r.readAsArrayBuffer(f);}
  function parse(txt){
    var lines=txt.split(/\r?\n/).filter(function(l){return l.trim();});
    if(!lines.length)return [];
    var h=lines[0].split(',');
    function ci(names){for(var k=0;k<names.length;k++){var idx=h.indexOf(names[k]);if(idx>=0)return idx;}return -1;}
    var iN=ci(['\uC774\uB984']),iX=ci(['X']),iY=ci(['Y']),iZ=ci(['Z(\uB808\uBCA8)','Z']),iC=ci(['\uCF54\uB4DC']);
    var out=[];
    for(var r=1;r<lines.length;r++){
      var c=lines[r].split(',');
      var x=parseFloat(c[iX]),y=parseFloat(c[iY]),z=parseFloat(c[iZ]);
      if(isNaN(x)||isNaN(y)||isNaN(z))continue;
      out.push({name:(c[iN]||'').trim(),x:x,y:y,z:z});
    }
    return out;
  }
  ov.querySelector('#dpX').onclick=function(){ov.remove();};
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  ov.querySelector('#dpRun').onclick=function(){
    var out=ov.querySelector('#dpOut');out.innerHTML='\uC77D\uB294 \uC911\u2026';
    rd(ov.querySelector('#dpFa'),function(ta){
      if(!ta){out.innerHTML='<span style="color:#c0392b">\uD6C4\uCE21\uB7C9 CSV\uB97C \uC120\uD0DD\uD558\uC138\uC694.</span>';return;}
      rd(ov.querySelector('#dpFb'),function(tb){
        var aft=parse(ta);
        var ground=aft.filter(function(p){return p.name.indexOf('(')>=0;});
        var alignAft=aft.filter(function(p){return p.name.indexOf('(')<0;});
        var ref=tb?parse(tb):alignAft;
        var refLabel=tb?'\uB178\uCD9C\uAD00\uB85C CSV':'\uD6C4\uCE21\uB7C9 \uAD00\uB85C\uC810(\uB300\uCCB4)';
        if(!ground.length){out.innerHTML='<span style="color:#c0392b">(1)\uB958 \uC9C0\uBC18\uC810\uC744 \uBABB \uCC3E\uC558\uC2B5\uB2C8\uB2E4. \uC774\uB984\uC5D0 (1)\uC774 \uC788\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694.</span>';return;}
        function near(p,arr){var b=null,bd=1e18;for(var i=0;i<arr.length;i++){var d=Math.hypot(arr[i].x-p.x,arr[i].y-p.y);if(d<bd){bd=d;b=arr[i];}}return b?{pt:b,d:bd}:null;}
        var rows=[],sum=0,cnt=0;
        ground.forEach(function(g){
          var nr=near(g,ref);
          if(!nr||nr.d>0.5){rows.push({n:g.name,gz:g.z,rz:null,dep:null,d:nr?nr.d:null});return;}
          var dep=g.z-nr.pt.z;sum+=dep;cnt++;
          rows.push({n:g.name,gz:g.z,rz:nr.pt.z,dep:dep,d:nr.d});
        });
        rows.sort(function(a,b){return a.n.localeCompare(b.n,undefined,{numeric:true});});
        var avg=cnt?(sum/cnt):0;
        var html='<div style="margin-bottom:8px">\uC9C0\uBC18\uC810 <b>'+ground.length+'</b>\uAC1C \u00B7 \uAE30\uC900=<b>'+refLabel+'</b> \u00B7 \uD3C9\uADE0\uC2EC\uB3C4 <b style="color:#7a52e0">'+avg.toFixed(2)+' m</b></div>';
        html+='<table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="background:#f3f0fb"><th style="border:1px solid #e3e3df;padding:5px">\uC9C0\uBC18\uC810</th><th style="border:1px solid #e3e3df;padding:5px">\uB178\uCD9C/\uAD00\uB85CZ</th><th style="border:1px solid #e3e3df;padding:5px">\uC9C0\uBC18Z</th><th style="border:1px solid #e3e3df;padding:5px">\uC2EC\uB3C4(m)</th><th style="border:1px solid #e3e3df;padding:5px">\uC218\uD3C9\uAC70\uB9AC</th></tr></thead><tbody>';
        rows.forEach(function(r){
          html+='<tr><td style="border:1px solid #eee;padding:4px">'+r.n+'</td><td style="border:1px solid #eee;padding:4px;text-align:right">'+(r.rz!=null?r.rz.toFixed(3):'\u2014')+'</td><td style="border:1px solid #eee;padding:4px;text-align:right">'+r.gz.toFixed(3)+'</td><td style="border:1px solid #eee;padding:4px;text-align:right;font-weight:700;color:'+(r.dep!=null?'#7a52e0':'#c0392b')+'">'+(r.dep!=null?r.dep.toFixed(2):'\uB9E4\uCE6D\uC2E4\uD328')+'</td><td style="border:1px solid #eee;padding:4px;text-align:right;color:#999">'+(r.d!=null?(r.d*100).toFixed(1)+'cm':'\u2014')+'</td></tr>';
        });
        html+='</tbody></table>';
        out.innerHTML=html;
      });
    });
  };
}

function showModal(opt){
  var ex=document.getElementById('appModal');if(ex)ex.remove();
  var card=document.createElement('div');card.id='appModal';
  card.style.cssText='position:fixed;left:50%;top:120px;transform:translateX(-50%);z-index:10000;'
    +'background:#fff;border:1px solid #e3e3df;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.22);'
    +'min-width:300px;max-width:380px;font-family:inherit;overflow:hidden;';
  var tc=opt.tone==='warn'?'#d98200':(opt.tone==='bad'?'#d32f2f':'#2a9e50');if(opt.center){card.style.top='50%';card.style.transform='translate(-50%,-50%)';card.style.border='2.5px solid '+tc;}
  var hd=document.createElement('div');
  hd.style.cssText='display:flex;align-items:center;gap:8px;padding:11px 14px;background:#f7f7f4;border-bottom:1px solid #eee;cursor:move;user-select:none;font-weight:700;color:#333;font-size:15px;';
  hd.innerHTML='<span style="color:'+tc+';font-size:11px">●</span>'+(opt.title||'알림')+'<span style="margin-left:auto;color:#c4c4be;font-size:11px;font-weight:400">⠿ 드래그로 이동</span>';
  var bd=document.createElement('div');bd.style.cssText='padding:15px 16px;color:#444;font-size:14px;line-height:1.65;';bd.innerHTML=opt.body||'';
  var ft=document.createElement('div');ft.style.cssText='display:flex;justify-content:flex-end;gap:8px;padding:0 16px 15px;';
  (opt.buttons||[{label:'확인'}]).forEach(function(b){
    var btn=document.createElement('button');btn.textContent=b.label;
    var bg=b.ok?'#16a34a':(b.primary?'#d32f2f':'#fff');
    var col=(b.ok||b.primary)?'#fff':(b.danger?'#d32f2f':'#666');
    var bord=b.ok?'#16a34a':(b.primary?'#d32f2f':(b.danger?'#e3a0a0':'#d4d4cf'));
    btn.style.cssText='padding:7px 17px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;border:1px solid '+bord+';background:'+bg+';color:'+col+';';
    btn.onclick=function(){if(b.onClick)b.onClick();card.remove();};
    ft.appendChild(btn);
  });
  card.appendChild(hd);card.appendChild(bd);card.appendChild(ft);document.body.appendChild(card);
  var drag=false,sl=0,st=0,dx=0,dy=0;
  hd.addEventListener('pointerdown',function(ev){drag=true;var r=card.getBoundingClientRect();card.style.transform='none';card.style.left=r.left+'px';card.style.top=r.top+'px';sl=r.left;st=r.top;dx=ev.clientX;dy=ev.clientY;try{hd.setPointerCapture(ev.pointerId);}catch(e){}});
  hd.addEventListener('pointermove',function(ev){if(!drag)return;card.style.left=(sl+ev.clientX-dx)+'px';card.style.top=(st+ev.clientY-dy)+'px';});
  hd.addEventListener('pointerup',function(ev){drag=false;try{hd.releasePointerCapture(ev.pointerId);}catch(e){}});
  return card;
}

/* ====== 렌더 ====== */
function clearSvg(g){while(g.firstChild)g.removeChild(g.firstChild);}
function drawHyunSym(){if(typeof gHyunSym==='undefined')return;clearSvg(gHyunSym);(state.hyunPts||[]).forEach(function(hp){var hs=S(hp[0],hp[1]);var _hx=pxToWorld()*2.4;var _hcol=({b:'#4fc3f7',d:'#1976d2',s:'#8d6e63',bd:'#e53935',db:'#e53935'})[hp[2]]||'#1a7a5e';gHyunSym.appendChild(el('line',{x1:hs[0]-_hx,y1:hs[1]-_hx,x2:hs[0]+_hx,y2:hs[1]+_hx,stroke:_hcol,'stroke-width':1.2,'vector-effect':'non-scaling-stroke','pointer-events':'none','class':'insp-line'}));gHyunSym.appendChild(el('line',{x1:hs[0]-_hx,y1:hs[1]+_hx,x2:hs[0]+_hx,y2:hs[1]-_hx,stroke:_hcol,'stroke-width':1.2,'vector-effect':'non-scaling-stroke','pointer-events':'none','class':'insp-line'}));});}
var LABEL_D=4.5; // (구) 근접 그룹 거리 — 현재 미사용, 호환용 유지
function computeLabels(){
  var pts=state.points, n=pts.length, lay=new Array(n);
  if(!n) return lay;
  var sum=0,cnt=0;
  for(var i=0;i<n;i++){var best=Infinity;
    for(var j=0;j<n;j++){if(i!==j){var d=Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y);if(d<best)best=d;}}
    if(best<Infinity){sum+=best;cnt++;}}
  var avg=cnt?sum/cnt:5;
  var L=Math.max(avg*0.7, 1.0);
  var lblR=L*0.6;
  var placed=[];
  function distSeg(px,py,a,b){var dx=b[0]-a[0],dy=b[1]-a[1];var L2=dx*dx+dy*dy;
    if(L2===0)return Math.hypot(px-a[0],py-a[1]);
    var t=((px-a[0])*dx+(py-a[1])*dy)/L2;t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(a[0]+t*dx),py-(a[1]+t*dy));}
  function candidates(p,pref){var cs=[];var pv=pipeDirAt(p);
    if(pv){var pl=Math.hypot(pv[0],pv[1])||1;var nx=-pv[1]/pl,ny=pv[0]/pl;if(ny<0){nx=-nx;ny=-ny;}cs.push([nx*pref,ny*pref]);cs.push([-nx*pref,-ny*pref]);}
    var dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for(var d=0;d<dirs.length;d++){var dl=Math.hypot(dirs[d][0],dirs[d][1])||1;cs.push([dirs[d][0]/dl,dirs[d][1]/dl]);}
    return cs;}
  function score(lx,ly,selfIdx){var sc=0;var near=L*3;
    for(var i=0;i<n;i++){if(i===selfIdx)continue;if(Math.abs(lx-pts[i].x)>near||Math.abs(ly-pts[i].y)>near)continue;var d=Math.hypot(lx-pts[i].x,ly-pts[i].y);if(d<lblR*1.2)sc+=(lblR*1.2-d)*5;}
    for(var li=0;li<state.lines.length;li++){var L2=state.lines[li];if(!L2.pts)continue;
      for(var s=0;s<L2.pts.length-1;s++){var a=L2.pts[s],b=L2.pts[s+1];if(!a||!b)continue;if(Math.abs(lx-a[0])>near&&Math.abs(lx-b[0])>near)continue;var d=distSeg(lx,ly,a,b);if(d<lblR)sc+=(lblR-d)*8;}}
    for(var q=0;q<placed.length;q++){if(Math.abs(lx-placed[q][0])>near||Math.abs(ly-placed[q][1])>near)continue;var d=Math.hypot(lx-placed[q][0],ly-placed[q][1]);if(d<lblR*1.6)sc+=(lblR*1.6-d)*6;}
    // ★ 인출선(측점→라벨) 교차 강제 배제: (1)관로선 가로지름 (2)다른 인출선 가로지름
    var _px=pts[selfIdx].x,_py=pts[selfIdx].y,_BIG=1e5;
    var _mnx=Math.min(_px,lx)-0.1,_mxx=Math.max(_px,lx)+0.1,_mny=Math.min(_py,ly)-0.1,_mxy=Math.max(_py,ly)+0.1;
    for(var _li=0;_li<state.lines.length;_li++){var _L=state.lines[_li];if(!_L.pts||_L.layer!=='통신관로')continue;
      for(var _s=0;_s<_L.pts.length-1;_s++){var _a=_L.pts[_s],_b=_L.pts[_s+1];if(!_a||!_b)continue;
        if((_a[0]<_mnx&&_b[0]<_mnx)||(_a[0]>_mxx&&_b[0]>_mxx)||(_a[1]<_mny&&_b[1]<_mny)||(_a[1]>_mxy&&_b[1]>_mxy))continue;
        if(Math.hypot(_a[0]-_px,_a[1]-_py)<0.3||Math.hypot(_b[0]-_px,_b[1]-_py)<0.3)continue;
        if(typeof segInt==='function'&&segInt([_px,_py],[lx,ly],_a,_b))sc+=_BIG;}}
    for(var _q=0;_q<placed.length;_q++){var _pp=placed[_q];if(!_pp||_pp.length<4)continue;
      if(Math.hypot(_pp[2]-_px,_pp[3]-_py)<0.3)continue;
      if(typeof segInt==='function'&&segInt([_px,_py],[lx,ly],[_pp[2],_pp[3]],[_pp[0],_pp[1]]))sc+=_BIG;}
    return sc;}
  for(var k=0;k<n;k++){var p=pts[k];
    var o=state.labelOff&&(state.labelOff[p.no]||state.labelOff[ptNum(p)]);
    if(o){lay[k]={lx:o[0],ly:o[1],anchor:(o[0]<p.x?'end':'start'),leader:true};placed.push([o[0],o[1],p.x,p.y]);continue;}
    var pref=(k%2===0)?1:-1;var bestPos=null,bestSc=Infinity;var dists=[Math.min(L*0.225,0.5),Math.min(L*0.4,0.9),Math.min(L*0.65,1.4)];
    var pv=pipeDirAt(p);
    if(pv){var pl=Math.hypot(pv[0],pv[1])||1;var nx0=-pv[1]/pl,ny0=pv[0]/pl;if(ny0<0){nx0=-nx0;ny0=-ny0;}
      var _dP=[[nx0*pref,ny0*pref,0],[-nx0*pref,-ny0*pref,4]];   // pref(번갈아) 우선, 교차나면 반대 강제
      for(var _dp=0;_dp<_dP.length;_dp++){var nx=_dP[_dp][0],ny=_dP[_dp][1],_pen=_dP[_dp][2];
        for(var di=0;di<dists.length;di++){var D=dists[di];var lx=p.x+nx*D,ly=p.y+ny*D;var sc=score(lx,ly,k)+di*2+_pen;if(sc<bestSc){bestSc=sc;bestPos=[lx,ly];}}}
    }else{var cs=candidates(p,pref);
      for(var di=0;di<dists.length;di++){var D=dists[di];
        for(var ci=0;ci<cs.length;ci++){var lx=p.x+cs[ci][0]*D, ly=p.y+cs[ci][1]*D;
          var sc=score(lx,ly,k)+ci*0.4+di*2+(ci<2?0:3);
          if(sc<bestSc){bestSc=sc;bestPos=[lx,ly];}}
        if(bestSc<0.5)break;}
    }
    if(!bestPos)bestPos=[p.x+L,p.y];
    lay[k]={lx:bestPos[0],ly:bestPos[1],anchor:(bestPos[0]<p.x?'end':'start'),leader:true};
    placed.push([bestPos[0],bestPos[1],p.x,p.y]);}
  return lay;
}

var labelDragging=false;
// world(SVG)좌표 → 화면픽셀 (오버레이 div 배치용)
// ★ SVG meet 렌더와 동일한 좌표변환의 기준값 (균일 스케일 + xMidYMid 여백)
//   placeLabelDiv(표시)·toWorld(입력)가 이 하나를 공유 → SVG 점과 픽셀단위로 정확히 일치
function vbScale(){
  var r=cv.getBoundingClientRect();
  var s=Math.min(r.width/vb.w, r.height/vb.h);            // meet: 가로·세로 같은 스케일
  return {r:r, s:s, ox:(r.width-vb.w*s)/2, oy:(r.height-vb.h*s)/2}; // 레터박스 여백(중앙정렬)
}
// SVG user(S-space)좌표 → 페이지(화면)픽셀. getScreenCTM 실측(meet·여백·줌·리사이즈 정확 반영)
function w2screen(sx,sy){var m=null;try{m=cv.getScreenCTM();}catch(e){}if(m&&m.a)return [m.a*sx+m.c*sy+m.e, m.b*sx+m.d*sy+m.f];var r=cv.getBoundingClientRect();return [r.left+(sx-vb.x)/vb.w*r.width, r.top+(sy-vb.y)/vb.h*r.height];}
function worldToPx(svgX,svgY){var p=w2screen(svgX,svgY),r=cv.getBoundingClientRect();return [p[0]-r.left,p[1]-r.top];}
function moveLabelDiv(d,svgX,svgY){d._sx=svgX;d._sy=svgY;placeLabelDiv(d);}
function addLabelHandle(p,L,ls,nt,ct,ld,isSel){
  var anchor=L.anchor;
  var Uh=vb.w/Math.max(cv.getBoundingClientRect().width,1); // 1px = Uh world
  var maxChars=Math.max((''+(p.no||'')).length,((p.code||'').trim()).length);
  var tw=13*Uh;  // 이동/수정 핸들 폭 — 작게(인출선 닿는 라벨 앞부분만)
  var hh=15*Uh;  // 핸들 높이 — 한 줄 정도
  var hx=anchor==='start'?(ls[0]-3*Uh):(ls[0]-tw+3*Uh);
  var handle=el('rect',{x:hx,y:ls[1]-hh*0.5,width:tw,height:hh,fill:'transparent','pointer-events':((typeof LV!=='undefined'&&LV&&LV.tagbox===0)?'none':'all')});
  if(isSel&&(typeof LV==='undefined'||!LV||LV.tagbox!==0)){handle.setAttribute('stroke','#22cc00');handle.setAttribute('stroke-width',0.8);handle.setAttribute('stroke-dasharray','2 2');handle.setAttribute('vector-effect','non-scaling-stroke');}
  handle.style.cursor='move';
  var lx=ls[0],ly=ls[1],dragging=false,moved=false,gx=0,gy=0;
  handle.addEventListener('pointerdown',function(ev){
    if(mode!=='pan'||viewerMode||readOnly)return;ev.stopPropagation();ev.preventDefault();
    if(p.no!==selNum){selNum=p.no;highlightSel();if(photoPanelOpen)refreshPhotoPanel();}
    dragging=true;moved=false;labelDragging=true;var w=toWorld(ev.clientX,ev.clientY);gx=w[0]-lx;gy=w[1]-ly;
    try{handle.setPointerCapture(ev.pointerId);}catch(e){}});
  handle.addEventListener('pointermove',function(ev){
    if(!dragging)return;ev.preventDefault();moved=true;var w=toWorld(ev.clientX,ev.clientY);
    lx=w[0]-gx;ly=w[1]-gy;var off=anchor==='start'?0.15:-0.15;
    moveLabelDiv(nt,lx+off,ly);
    moveLabelDiv(ct,lx+off,ly);
    if(ld){ld.setAttribute('x2',lx);ld.setAttribute('y2',ly);}
    handle.setAttribute('x',anchor==='start'?(lx-3*Uh):(lx-tw+3*Uh));handle.setAttribute('y',ly-hh*0.5);});
  function up(ev){if(!dragging)return;dragging=false;setTimeout(function(){labelDragging=false;},40);
    if(moved)state.labelOff[p.no]=[lx,-ly];
    else{var now=Date.now();if(now-(p._lastClick||0)<350){p._lastClick=0;openPtEdit(p,ls);}else{p._lastClick=now;}}
    try{handle.releasePointerCapture(ev.pointerId);}catch(e){}
    drawGeo();highlightSel();}
  handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);
  gAnc.appendChild(handle);
}
function openPtEdit(p,ls){
  var r=cv.getBoundingClientRect();
  var _p=w2screen(ls[0],ls[1]);var sx=_p[0],sy=_p[1];
  // 기존 번호/코드를 템플릿 칸으로 분해
  var no=p.no||'', code=(p.code||'').trim();
  var yr='', date='', num=''; var mNo=/^(\d{2})(\d{4})-?(.*)$/.exec(no);
  if(mNo){yr=mNo[1];date=mNo[2];num=mNo[3]||'';}
  else{var m2=/^(\d*)-?(.*)$/.exec(no); if(m2){date=m2[1]||'';num=m2[2]||'';}}
  var _tmatch=/^T(?=$|\s|x)/i.exec(code);var _isTpt=!!p.isT||!!_tmatch;var _cbody=_tmatch?code.slice(_tmatch[0].length).replace(/^\s+/,''):code;var prefix='', cnt=''; var xi=_cbody.toLowerCase().lastIndexOf('x');
  if(xi>=0){prefix=_cbody.slice(0,xi).trim();cnt=_cbody.slice(xi+1).trim();} else if(_cbody){prefix=_cbody;}
  
  var wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;z-index:999;left:'+sx+'px;top:'+(sy-34)+'px;background:#fffde7;border:1px solid #d32f2f;border-radius:5px;padding:6px;display:flex;flex-direction:column;gap:5px;box-shadow:0 2px 8px rgba(0,0,0,0.18);';
  var fix=function(t){var s=document.createElement('span');s.textContent=t;s.style.cssText='font-size:15px;font-weight:800;color:#9a9a93;align-self:center;padding:0 1px;';return s;};
  var inp=function(val,ph,w,col){var i=document.createElement('input');i.className='ptin';i.value=val;i.placeholder=ph;i.style.cssText='font-size:14px;font-weight:600;color:'+(col||'#333')+';border:1px solid #ccc;border-radius:3px;padding:2px 5px;outline:none;width:'+w+'px;';return i;};
  var row=function(){var d=document.createElement('div');d.style.cssText='display:flex;gap:3px;align-items:center;';return d;};
  var iYear=inp(yr,'YY',32,'#1a7a3a'), iDate=inp(date,'MMDD',52,'#1a7a3a'), iNum=inp(num,'번호',46,'#1a7a3a');
  var r1=row();r1.appendChild(iYear);r1.appendChild(iDate);r1.appendChild(fix('-'));r1.appendChild(iNum);
  var iT=state.tamsa?inp(_isTpt?'T':'','T',26,'#8e44ad'):null; var _extsP=(typeof TG_OPT!=='undefined'&&TG_OPT.ext)?TG_OPT.ext.slice():[];if(prefix&&_extsP.indexOf(prefix)<0)_extsP.unshift(prefix);var iPre=document.createElement('select');iPre.style.cssText='font-size:13px;font-weight:700;color:#0f7a86;border:1px solid #ccc;border-radius:3px;padding:2px 3px;outline:none;width:98px';var _p0=document.createElement('option');_p0.value='';_p0.textContent='(외관)';iPre.appendChild(_p0);_extsP.forEach(function(o){var op=document.createElement('option');op.value=o;op.textContent=o;if(o===prefix)op.selected=true;iPre.appendChild(op);});var iCnt=inp(cnt,'관수',42,'#0f7a86');
  function sel2(opts,cur,w){var _s=document.createElement('select');_s.style.cssText='font-size:13px;font-weight:600;color:#c0392b;border:1px solid #ccc;border-radius:3px;padding:2px 3px;outline:none;width:'+w+'px;';opts.forEach(function(o){var _op=document.createElement('option');_op.value=o;_op.textContent=o;if(o===cur)_op.selected=true;_s.appendChild(_op);});return _s;}
  var iSurf=state.tamsa?sel2(['\uB3C4\uB85C','\uBCF4\uB3C4','\uC0AC\uB9AC\uB3C4'],p.surface||'\uB3C4\uB85C',60):null;
  var iPave=state.tamsa?sel2(['\uC544\uC2A4\uD314\uD2B8','\uCF58\uD06C\uB9AC\uD2B8','\uBCF4\uB3C4','\uC0AC\uB9AC\uB3C4','\uC11D\uC7AC','\uD0C4\uC131\uD3EC\uC7A5\uC7AC','\uD22C\uC2A4\uCF58','\uD0DD\uC9C0'],p.pave||'\uC544\uC2A4\uD314\uD2B8',86):null;
  var r2=row();if(iT)r2.appendChild(iT);r2.appendChild(iPre);r2.appendChild(fix('x'));r2.appendChild(iCnt);if(iSurf){r2.appendChild(fix('|'));r2.appendChild(iSurf);r2.appendChild(iPave);}
  wrap.appendChild(r1);wrap.appendChild(r2);document.body.appendChild(wrap);iDate.focus();iDate.select();
  var done=function(){if(wrap.parentNode){pushHist();
    p.no=iYear.value.trim()+iDate.value.trim()+'-'+iNum.value.trim();
    var _tv=(iT&&iT.value.trim())||'';p.isT=/^t/i.test(_tv);var _pv=iPre.value.trim(),_cv=iCnt.value.trim();var _body=_pv?(_pv+'x'+_cv):'';p.code=(p.isT?('T'+(_body?' ':'')):'')+_body;
    if(state.tamsa&&iSurf){p.surface=iSurf.value;p.surfaceManual=iSurf.value;p.pave=iPave.value;p._tcode=undefined;}if(state._pointsOrig){var _o=state._pointsOrig.filter(function(q){return q.x===p.x&&q.y===p.y;})[0];if(_o){_o.no=p.no;_o.code=p.code;_o.isT=p.isT;if(state.tamsa&&iSurf){_o.surface=p.surface;_o.surfaceManual=p.surfaceManual;_o.pave=p.pave;_o._tcode=p._tcode;}}}if(state.tamsa&&_pv){var _si=(typeof tgSeg!=='undefined'&&tgSeg>=0)?tgSeg:((typeof tgFindSeg==='function')?tgFindSeg(no):-1);if(_si>=0&&typeof _tgSegs!=='undefined'&&_tgSegs&&_tgSegs[_si]){_tgSegs[_si].forEach(function(nd){if(nd.mh||nd.riser||!nd.no)return;var _q=(typeof pointByNo==='function')?pointByNo(nd.no):null;if(!_q)return;_q.code=(_q.isT?'T ':'')+_pv+'x'+_cv;_q._tcode=undefined;if(state._pointsOrig){var _oo=state._pointsOrig.filter(function(z){return z.x===_q.x&&z.y===_q.y;})[0];if(_oo){_oo.code=_q.code;_oo._tcode=undefined;}}});if(typeof tangoFill==='function')tangoFill();if(tgSeg>=0&&typeof tangoSelSeg==='function')tangoSelSeg(tgSeg);}}
    wrap.remove();drawGeo();if(photoPanelOpen)refreshPhotoPanel();}};
  var onKey=function(e){if(e.key==='Enter'||e.key==='Escape'){e.stopPropagation();done();}else e.stopPropagation();};
  var ins=[iYear,iDate,iNum].concat(iT?[iT]:[]).concat([iPre,iCnt]).concat(iSurf?[iSurf,iPave]:[]);
  var bt=null;function ob(){bt=setTimeout(done,150);}function of(){if(bt){clearTimeout(bt);bt=null;}}
  ins.forEach(function(i){i.addEventListener('keydown',onKey);i.addEventListener('blur',ob);i.addEventListener('focus',of);});
}
function addNoteHandle(L,t,ld,lx,ly,ax,tw){
  var bb;try{bb=t.getBBox();}catch(e){bb=null;}
  var pad=0.4,bw=bb?bb.width:String(L.note).length*0.42,bh=bb?bb.height:0.85,bx=bb?bb.x:lx+0.25,by=bb?bb.y:ly-0.45;
  var hc=L.layer==='압입구간'?'#1f6fd6':'#a07e00', hc2=L.layer==='압입구간'?'#15489e':'#7a5f00';
  var h=el('rect',{x:bx-pad,y:by-pad,width:bw+2*pad,height:bh+2*pad,rx:0.3,fill:'transparent',stroke:((typeof LV!=='undefined'&&LV&&LV.tagbox===0)?'none':hc),'stroke-width':0.7,'stroke-dasharray':'1.6 1.6','vector-effect':'non-scaling-stroke','pointer-events':((typeof LV!=='undefined'&&LV&&LV.tagbox===0)?'none':'all')});h.style.cursor='move';
  var drag=false,moved=false,nx=lx,ny=ly,_lp=null,_lpX=0,_lpY=0;
  h.addEventListener('pointerdown',function(ev){if(mode==='delall2'||mode==='ptdel'){ev.stopPropagation();ev.preventDefault();var li=state.lines.indexOf(L);if(li>=0){pushHist();state.lines.splice(li,1);drawGeo();updMeta();toast('멘트·선 삭제');}return;}if(mode!=='pan'||viewerMode||readOnly)return;ev.stopPropagation();drag=true;moved=false;labelDragging=true;_lpX=ev.clientX;_lpY=ev.clientY;if(_lp)clearTimeout(_lp);_lp=setTimeout(function(){if(drag&&!moved){_lp=null;drag=false;labelDragging=false;try{h.releasePointerCapture(ev.pointerId);}catch(e){}if(typeof openLineNoteEdit==='function')openLineNoteEdit(L,lx,ly);}},1000);h.setAttribute('stroke',hc2);h.setAttribute('stroke-width',1.1);h.setAttribute('stroke-dasharray','2.2 1.4');try{h.setPointerCapture(ev.pointerId);}catch(e){}});
  h.addEventListener('pointermove',function(ev){if(!drag)return;if(_lp&&(Math.abs(ev.clientX-_lpX)+Math.abs(ev.clientY-_lpY)<=8))return;ev.preventDefault();moved=true;if(_lp){clearTimeout(_lp);_lp=null;}var ww=toWorld(ev.clientX,ev.clientY);nx=ww[0];ny=ww[1];
    t.setAttribute('x',nx+0.25);t.setAttribute('y',ny+0.2);ld.setAttribute('x2', (ax!=null&&ax>nx)?nx+0.25+(tw||bw):nx);ld.setAttribute('y2',ny);
    h.setAttribute('x',nx+0.25-pad);h.setAttribute('y',ny-0.45-pad);});
  function up(ev){if(!drag)return;drag=false;if(_lp){clearTimeout(_lp);_lp=null;}setTimeout(function(){labelDragging=false;},40);
    if(moved){L.noteOff=[nx,ny];}
    else{var now=Date.now();if(now-(L._lastClick||0)<350){L._lastClick=0;openLineNoteEdit(L,lx,ly);}else{L._lastClick=now;}}
    try{h.releasePointerCapture(ev.pointerId);}catch(e){}drawGeo();}
  h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up);
  gPts.appendChild(h);
}
// 지거 멘트 앵커: 잘 작동하는 라벨 드래그(addNoteHandle)와 동일한 setPointerCapture 패턴. gAnc 최상위라 측점에 안 가로채임.
function addAnchorHandle(L,ah,anc,ld){
  ah.style.cursor='move';
  var drag=false;
  ah.addEventListener('pointerdown',function(ev){if(mode==='delall2'||mode==='ptdel'){ev.stopPropagation();ev.preventDefault();var li=state.lines.indexOf(L);if(li>=0){pushHist();state.lines.splice(li,1);drawGeo();updMeta();toast('멘트·선 삭제');}return;}if(mode!=='pan'||viewerMode||readOnly)return;ev.stopPropagation();drag=true;labelDragging=true;anc.setAttribute('r',0.46);try{ah.setPointerCapture(ev.pointerId);}catch(e){}});
  ah.addEventListener('pointermove',function(ev){if(!drag)return;ev.preventDefault();var ww=toWorld(ev.clientX,ev.clientY);var t=projToPoly(L.pts.map(function(p){return S(p[0],p[1]);}),ww[0],ww[1]);L.anchorT=t;var aw=ptOnPoly(L.pts,t),sp=S(aw[0],aw[1]);anc.setAttribute('cx',sp[0]);anc.setAttribute('cy',sp[1]);ah.setAttribute('cx',sp[0]);ah.setAttribute('cy',sp[1]);ld.setAttribute('x1',sp[0]);ld.setAttribute('y1',sp[1]);});
  function up(ev){if(!drag)return;drag=false;setTimeout(function(){labelDragging=false;},40);try{ah.releasePointerCapture(ev.pointerId);}catch(e){}drawGeo();}
  ah.addEventListener('pointerup',up);ah.addEventListener('pointercancel',up);
}
// 지거 태그 인라인 편집: [숫자]점(번호 : [번호] ) — '점(번호 :' 와 ')' 고정, 앞 숫자(2자리)+괄호안만 수정
function openLineNoteEdit(L,lx,ly){
  var r=cv.getBoundingClientRect();
  var sx=r.left+(lx-vb.x)*(r.width/vb.w), sy=r.top+(ly-vb.y)*(r.height/vb.h);
  if(L.layer==='압입구간'){
    var m=(L.note||'').match(/^압입구간\s*(.*)$/),inner0=m?m[1].trim():'';
    var wp=document.createElement('div');
    wp.style.cssText='position:fixed;z-index:999;display:flex;align-items:center;left:'+sx+'px;top:'+(sy-34)+'px;background:#eef4fc;border-bottom:2px solid #1f6fd6;padding:3px 8px;font-size:16px;font-weight:700;color:#15489e;border-radius:4px;';
    var spA=document.createElement('span');spA.textContent='압입구간';spA.style.marginRight='6px';
    var inp=document.createElement('input');inp.value=inner0;inp.placeholder='멘트 입력';
    inp.style.cssText='font-size:16px;font-weight:600;color:#15489e;border:none;background:transparent;outline:none;width:150px;text-align:left;';
    wp.appendChild(spA);wp.appendChild(inp);document.body.appendChild(wp);inp.focus();inp.select();
    var dp=function(){if(wp.parentNode){pushHist();var v=inp.value.trim();L.note='압입구간'+(v?' '+v:' ');wp.remove();drawGeo();}};
    inp.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key==='Escape'){e.stopPropagation();dp();}else e.stopPropagation();});
    inp.addEventListener('blur',function(){setTimeout(dp,120);});
    return;
  }
  var pm=(L.note||'').match(/^(\d*)\s*점\(번호\s*:\s*(.*?)\s*\)\s*$/);
  var pre=pm?pm[1].trim():'', inner=pm?pm[2].trim():'';
  var wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;z-index:999;display:flex;align-items:center;gap:1px;left:'+sx+'px;top:'+(sy-34)+'px;background:#fffde7;border-bottom:2px solid #a07e00;padding:3px 6px;font-size:16px;font-weight:600;color:#7a5f00;border-radius:4px;';
  var inpPre=document.createElement('input');
  inpPre.value=pre; inpPre.maxLength=2; inpPre.placeholder='00';
  inpPre.style.cssText='font-size:16px;font-weight:600;color:#7a5f00;border:1px solid #cbb56a;border-radius:4px;background:#fff;outline:none;width:34px;text-align:center;padding:1px 2px;';
  var spM=document.createElement('span');spM.textContent='점(번호 : ';spM.style.margin='0 2px';
  var inpIn=document.createElement('input');
  inpIn.value=inner; inpIn.placeholder='';
  inpIn.style.cssText='font-size:16px;font-weight:600;color:#7a5f00;border:none;background:transparent;outline:none;width:100px;text-align:center;';
  var spR=document.createElement('span');spR.textContent=' )';
  wrap.appendChild(inpPre);wrap.appendChild(spM);wrap.appendChild(inpIn);wrap.appendChild(spR);
  document.body.appendChild(wrap);inpPre.focus();inpPre.select();
  var done=function(){if(wrap.parentNode){pushHist();var p=inpPre.value.trim(),v=inpIn.value.trim();L.note=(p?p:'')+'점(번호 : '+v+' )';wrap.remove();drawGeo();}};
  var onKey=function(e){if(e.key==='Enter'||e.key==='Escape'){e.stopPropagation();done();}else e.stopPropagation();};
  inpPre.addEventListener('keydown',onKey);inpIn.addEventListener('keydown',onKey);
  var blurTimer=null;
  function onBlur(){blurTimer=setTimeout(done,120);}
  function onFocus(){if(blurTimer){clearTimeout(blurTimer);blurTimer=null;}}
  inpPre.addEventListener('blur',onBlur);inpIn.addEventListener('blur',onBlur);
  inpPre.addEventListener('focus',onFocus);inpIn.addEventListener('focus',onFocus);
}
// 줌-안전 텍스트: HTML div 오버레이로 화면 픽셀에 직접 렌더 → viewBox 스킵 문제 원천 차단
// svgX,svgY = SVG(화면) 좌표. 오버레이는 화면픽셀이므로 viewBox→화면 변환해 배치.
var lblOverlay=document.getElementById('lblOverlay');
function clearLabels(grp){
  if(!lblOverlay)return;
  if(!grp){lblOverlay.innerHTML='';return;}
  var ns=lblOverlay.querySelectorAll('.lbl-'+grp);
  for(var i=0;i<ns.length;i++)ns[i].remove();
}
/* 삭제·지우기 후 유령 라벨 방지: 오버레이 통째 비우고 현재 상태로 전부 재그리기 */
function redrawAll(){clearLabels();drawGeo();drawMarks();drawManholes();}
function mkLabel(svgX,svgY,text,opt){
  opt=opt||{};
  var d=document.createElement('div');
  d.textContent=text;
  d.className='lbl-'+(opt.grp||'pt');
  d._sx=svgX; d._sy=svgY; // SVG좌표 저장 → pan/zoom 시 재배치
  var anchor=opt.anchor||'start';
  d._anchor=anchor;
  d.style.cssText='position:absolute;'
    +'font-size:'+((opt.px||13)*(viewerMode?0.7:1))+'px;color:'+(opt.fill||'#333')+';'
    +'font-weight:'+(opt.weight||'400')+';white-space:nowrap;pointer-events:none;'+'text-shadow:-1.2px -1.2px 0 #fff,1.2px -1.2px 0 #fff,-1.2px 1.2px 0 #fff,1.2px 1.2px 0 #fff,0 0 2px #fff,0 0 3px #fff;'
    +'transform:translate('+(anchor==='end'?'-100%':(anchor==='middle'?'-50%':'0'))+',-50%)'+(opt.rot?(' rotate('+opt.rot+'deg)'):'')+';line-height:1;';
  placeLabelDiv(d);
  if(lblOverlay)lblOverlay.appendChild(d);
  return d;
}
function placeLabelDiv(d){
  var p=w2screen(d._sx,d._sy),r=cv.getBoundingClientRect();
  d.style.left=(p[0]-r.left)+'px';
  d.style.top =(p[1]-r.top)+'px';
}
function repositionLabels(){
  if(!lblOverlay)return;
  var ns=lblOverlay.children;
  for(var i=0;i<ns.length;i++){var d=ns[i];if(d._sx!=null)placeLabelDiv(d);}
}
// ★ 심벌(측점 사각·맨홀 이중원)을 라벨과 동일한 화면픽셀 오버레이로 그림
//   크기가 CSS px로 고정 → 줌/팬/리사이즈에 계산 자체가 없어 절대 안 변함
function mkSym(svgX,svgY,grp,css){
  var d=document.createElement('div');
  d.className='lbl-'+(grp||'pt');     // clearLabels/repositionLabels와 동일 그룹키 → 같이 청소·재배치
  d._sx=svgX; d._sy=svgY;
  d.style.cssText='position:absolute;box-sizing:border-box;pointer-events:none;'
    +'transform:translate(-50%,-50%);'+css; // 중심 정렬
  placeLabelDiv(d);
  if(lblOverlay)lblOverlay.appendChild(d);
  return d;
}
// ★ 화면 1px당 월드단위 — getScreenCTM으로 브라우저가 실제 적용한 스케일을 직접 측정
//   (preserveAspectRatio/meet/종횡비/리사이즈/줌이 모두 반영된 실측값 → 추정 오차 없음)
function pxToWorld(){
  var r=cv.getBoundingClientRect();
  if(r.width>0)return vb.w/r.width;   // vb 기반: applyVB 직후 즉시 정확
  var m=null; try{m=cv.getScreenCTM();}catch(e){}
  if(m&&m.a)return 1/m.a;
  return vb.w/Math.max(r.width,1);
}

/* ===== 보강판 구역(관로결선 ±5M 밴드 + 연한 해치 + 태그/인출선) ===== */
var bpFirst=null;
function nearBpPoint(wx,wy){var best=null,bd=1e18;(state.points||[]).forEach(function(p){var d=Math.hypot(p.x-wx,p.y-wy);if(d<bd){bd=d;best=p;}});var tol=(typeof pxToWorld==='function')?pxToWorld()*20:1e18;return (best&&bd<=tol)?best:null;}
function nearBpOnly(wx,wy){var best=null,bd=1e18;(state.points||[]).forEach(function(p){if(!/보강판/.test((p.no||'')+'|'+(p.code||'')))return;var d=Math.hypot(p.x-wx,p.y-wy);if(d<bd){bd=d;best=p;}});var tol=(typeof pxToWorld==='function')?pxToWorld()*30:1e18;return (best&&bd<=tol)?best:null;}
var _bpSelEl=null;
function bpSelClear(){if(_bpSelEl&&_bpSelEl.parentNode)_bpSelEl.parentNode.removeChild(_bpSelEl);_bpSelEl=null;}
function bpSelMark(x,y){bpSelClear();try{var sp=S(x,y);_bpSelEl=el('circle',{cx:sp[0],cy:sp[1],r:Math.max((typeof pxToWorld==='function'?pxToWorld():0.06)*14,0.3),fill:'none',stroke:'#e0a800','stroke-width':3,'stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke','pointer-events':'none'});gGeo.appendChild(_bpSelEl);}catch(e){}}
var bpHoverEl=null,bpDragZone=null,bpPreviewEl=null,roadEditVtx=null,roadFollow=null,depthDrag=null;
function bpHoverPt(ww){var bp=nearBpPoint(ww[0],-ww[1]);if(!bp){bpHoverClear();return;}var sp=S(bp.x,bp.y);if(!bpHoverEl||!bpHoverEl.parentNode){bpHoverEl=el('rect',{fill:'none',stroke:'#d32f2f','stroke-width':5,'vector-effect':'non-scaling-stroke','pointer-events':'none'});gAnc.appendChild(bpHoverEl);}bpHoverEl.setAttribute('x',sp[0]-0.4);bpHoverEl.setAttribute('y',sp[1]-0.4);bpHoverEl.setAttribute('width',0.8);bpHoverEl.setAttribute('height',0.8);}
function bpHoverClear(){if(bpHoverEl){bpHoverEl.remove();bpHoverEl=null;}}
function bpPreview(a,b){var A=S(a[0],a[1]),B=S(b[0],b[1]);if(!bpPreviewEl||!bpPreviewEl.parentNode){bpPreviewEl=el('line',{stroke:'#d32f2f','stroke-width':2,'stroke-dasharray':'1.5 1','vector-effect':'non-scaling-stroke','pointer-events':'none'});gAnc.appendChild(bpPreviewEl);}bpPreviewEl.setAttribute('x1',A[0]);bpPreviewEl.setAttribute('y1',A[1]);bpPreviewEl.setAttribute('x2',B[0]);bpPreviewEl.setAttribute('y2',B[1]);}
function bpPreviewClear(){if(bpPreviewEl){bpPreviewEl.remove();bpPreviewEl=null;}}
function bpFootOnPoly(poly,px,py){return bpFootOnPath(poly.concat([poly[0]]),px,py);}
function bpFootOnPath(path,px,py){var best=null,bd=1e18;for(var i=0;i<path.length-1;i++){var a=path[i],b=path[i+1],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1;var t=((px-a[0])*dx+(py-a[1])*dy)/L2;t=Math.max(0,Math.min(1,t));var fx=a[0]+dx*t,fy=a[1]+dy*t,d=Math.hypot(px-fx,py-fy);if(d<bd){bd=d;best=[fx,fy];}}return best||path[Math.floor(path.length/2)];}
function bpKey(pt){return (Math.round(pt[0]*100)/100)+','+(Math.round(pt[1]*100)/100);}
function bpTracePath(p1,p2){
  var segs=[];(state.lines||[]).forEach(function(L){if(L.layer!=='\uD1B5\uC2E0\uAD00\uB85C'||!L.pts||L.pts.length<2)return;for(var i=0;i<L.pts.length-1;i++)segs.push([L.pts[i],L.pts[i+1]]);});
  if(!segs.length)return [p1,p2];
  var adj={},vmap={};segs.forEach(function(sg){var a=bpKey(sg[0]),b=bpKey(sg[1]);vmap[a]=sg[0];vmap[b]=sg[1];(adj[a]=adj[a]||[]).push(b);(adj[b]=adj[b]||[]).push(a);});
  function nk(pt){var best=null,bd=1e18;for(var k in vmap){var v=vmap[k],d=Math.hypot(v[0]-pt[0],v[1]-pt[1]);if(d<bd){bd=d;best=k;}}return best;}
  var sk=nk(p1),ek=nk(p2);if(!sk||!ek)return [p1,p2];
  var q=[sk],prev={};prev[sk]='_root';var found=false;
  while(q.length){var cur=q.shift();if(cur===ek){found=true;break;}(adj[cur]||[]).forEach(function(nb){if(!(nb in prev)){prev[nb]=cur;q.push(nb);}});}
  if(!found)return [p1,p2];
  var path=[],c=ek;while(c&&c!=='_root'){path.unshift(vmap[c]);c=prev[c];}
  if(path.length>=2){path[0]=p1;path[path.length-1]=p2;return path;}return [p1,p2];
}
function bpBandLR(path,off){
  var n=path.length;if(n<2)return null;
  function un(ax,ay){var l=Math.hypot(ax,ay)||1;return [ax/l,ay/l];}
  var left=[],right=[];
  for(var i=0;i<n;i++){var nx,ny;
    if(i===0){var d=un(path[1][0]-path[0][0],path[1][1]-path[0][1]);nx=-d[1];ny=d[0];}
    else if(i===n-1){var e=un(path[n-1][0]-path[n-2][0],path[n-1][1]-path[n-2][1]);nx=-e[1];ny=e[0];}
    else{var a=un(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]),b=un(path[i+1][0]-path[i][0],path[i+1][1]-path[i][1]);var n1=[-a[1],a[0]],n2=[-b[1],b[0]];var bx=n1[0]+n2[0],by=n1[1]+n2[1],bl=Math.hypot(bx,by)||1;bx/=bl;by/=bl;var ch=bx*n1[0]+by*n1[1];var m=ch>0.25?1/ch:4;nx=bx*m;ny=by*m;}
    left.push([path[i][0]+nx*off,path[i][1]+ny*off]);right.push([path[i][0]-nx*off,path[i][1]-ny*off]);
  }
  return {left:left,right:right};
}
function bpOffsetBand(path,off){var lr=bpBandLR(path,off);if(!lr)return null;return lr.left.concat(lr.right.slice().reverse());}
function bpPathOf(z){return (z.path&&z.path.length>=2)?z.path:[z.p1,z.p2];}
function bpPtInPoly(x,y,poly){var inside=false;for(var i=0,j=poly.length-1;i<poly.length;j=i++){var xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside;}return inside;}
function bpPtHidden(p){
  if(!state.bpzones||!state.bpzones.length)return false;
  for(var zi=0;zi<state.bpzones.length;zi++){var z=state.bpzones[zi];if((z.p1&&Math.hypot(z.p1[0]-p.x,z.p1[1]-p.y)<1)||(z.p2&&Math.hypot(z.p2[0]-p.x,z.p2[1]-p.y)<1))return true;var poly=bpOffsetBand(bpPathOf(z),5);if(poly&&bpPtInPoly(p.x,p.y,poly))return true;}
  return false;
}

/* ===== 타이틀블록 (BUILD 289) ===== */
function tbOuterCode(){
  var cnt={};
  (state.points||[]).forEach(function(p){
    if(!p||!p.no||isManhole(p))return;
    var c=(p.code||'').replace(/(^|\s)T(?=\s|$)/g,' ').replace(/\s+/g,' ').trim();
    if(!c)return; cnt[c]=(cnt[c]||0)+1;
  });
  var best='',bn=0; for(var k in cnt){if(cnt[k]>bn){bn=cnt[k];best=k;}}
  return best;
}
function tbMhOwner(){
  var cnt={};
  (state.manholes||[]).forEach(function(m){
    var mm=/\(([^)]+)\)/.exec(m.label||''); var own=mm?mm[1].trim():'';
    if(!own)return; var key=own+'|'+((m.kind||'').trim());
    cnt[key]=(cnt[key]||0)+1;
  });
  var best='',bn=0; for(var k in cnt){if(cnt[k]>bn){bn=cnt[k];best=k;}}
  if(!best)return '';
  var pr=best.split('|'); return pr[0];
}
function tbFmtCode(code){
  if(!code)return '';
  var pc=joseoParseCode(code);
  var mat=(pc.mat||'').toUpperCase();
  var m=(pc.dia||'').match(/(\d+)\s*[xX\u00d7]\s*(\d+)/);
  var dia=m?m[1]:'', cnt=m?m[2]:'';
  if(!m){var n=(pc.dia||'').match(/\d+/);dia=n?n[0]:'';}
  if(mat==='COD')return (cnt||'')+'COD';
  if(mat==='FC')return 'FC(\uFFE0'+dia+')';
  return code;
}
function tbPipeLength(){
  var total=0;
  (state.lines||[]).forEach(function(L){
    if(!L||L.layer!=='\uD1B5\uC2E0\uAD00\uB85C'||!L.pts||L.pts.length<2)return;
    for(var i=1;i<L.pts.length;i++){
      var dx=L.pts[i][0]-L.pts[i-1][0], dy=L.pts[i][1]-L.pts[i-1][1];
      total+=Math.sqrt(dx*dx+dy*dy);
    }
  });
  return total;
}
function tbCommonTop(f){var mm=(typeof state!=='undefined'&&state&&state.tangoManual)||{},cnt={},bk='',bv=0;for(var k in mm){var v=mm[k]&&mm[k][f];if(v!=null&&v!==''){v=''+v;cnt[v]=(cnt[v]||0)+1;if(cnt[v]>bv){bv=cnt[v];bk=v;}}}return bk;}
function tbData(){
  var b=state.bizInfo||{}, t=state.titleBlock||{};
  var owner=(b.client||'').trim();
  var autoOuter=tbFmtCode(tbOuterCode());
  var outer=(t.outer!=null&&t.outer!=='')?t.outer:autoOuter;
  var mhOwner=(t.mhOwner!=null&&t.mhOwner!=='')?t.mhOwner:(owner||tbMhOwner());
  var pl=tbPipeLength();
  var autoVolT= pl>0 ? pl.toFixed(2)+'m' : '';
  var volT=(t.volT!=null&&t.volT!=='')?t.volT:autoVolT;
  var inner=(t.inner!=null)?t.inner:tbCommonTop('inner');
  var gyeol=(t.gyeol!=null)?t.gyeol:tbCommonTop('gyeol');
  var gdan=(t.gdan!=null)?t.gdan:tbCommonTop('gdan');
  var gwannum=(t.gwannum!=null)?t.gwannum:tbCommonTop('gwannum');
  return { name:(state.projectName||''), bizNo:(b.bizNo||''), client:owner,
           outer:outer, inner:inner, mhOwner:mhOwner,
           gyeol:gyeol, gdan:gdan, gwannum:gwannum,
           volT:volT, volG:(t.volG||'') };
}
function tbEsc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function tbLayout(dxf){
  if(typeof state==='undefined'||!state)return null;
  var pxs=[],pys=[];
  (state.points||[]).forEach(function(p){if(p&&p.x!=null&&p.y!=null){pxs.push(+p.x);pys.push(+p.y);}});
  (state.lines||[]).forEach(function(L){(L.pts||[]).forEach(function(p){pxs.push(p[0]);pys.push(p[1]);});});
  (state.manholes||[]).forEach(function(m){if(m&&m.wx!=null){pxs.push(+m.wx);pys.push(+m.wy);}});
  if(!pxs.length)return null;
  var ptW=Math.max(Math.max.apply(null,pxs)-Math.min.apply(null,pxs),10);
  var axs=pxs.slice(), ays=pys.slice();
  (state.baseTexts||[]).forEach(function(t){if(t&&t.x!=null&&t.y!=null){axs.push(+t.x);ays.push(+t.y);}});
  var minX=Math.min.apply(null,axs),maxX=Math.max.apply(null,axs),maxY=Math.max.apply(null,ays);
  var bw=Math.max(maxX-minX,10);
  var th=ptW*0.020, dy=th*1.55, pad=th*1.0, nameH=th*1.4*0.85;
  var gsc=dxf?0.78:1.0, gh=th*gsc;
  var vxm=dxf?8.5:8.9, rlm=23.8, rvm=29.8;     // 물량 라벨=파란박스 라벨 x 일렬(BUILD662)
  var nameGap=th*2.5;
  var d=tbData();
  var bh=pad+nameH+nameGap+4.6*dy+pad*0.15;
  var b0=minX, by0=maxY, by1=maxY+bh;
  var it=[];
  function add(x,y,h,s,c,a,key){if(s==null)s='';it.push({x:x,y:y,h:h,s:s,c:c,a:a||'start',key:key||null});}
  var _nm=d.name||'(사업명 미입력)';
  var _availW=bw-pad*2,_estW=0;for(var _ci=0;_ci<_nm.length;_ci++){var _cc=_nm.charCodeAt(_ci);_estW+=(_cc>0x1100&&_cc<0xD7A4)?nameH*1.12:nameH*0.64;}
  var _availW2=_availW*0.88;var _nameH=(_estW>_availW2&&_estW>0)?nameH*(_availW2/_estW):nameH;
  add(b0+bw/2, by1-pad-nameH, _nameH, _nm, 'name', 'middle', 'name');
  var lx=b0+pad, vx=b0+pad+th*vxm, firstY=by1-pad-nameH-nameGap-th*0.2;
  var L=[['탱고 번호',d.bizNo,'red','bizNo'],['관로(소유자)',d.client,'blue','client'],['관로(외관)',d.outer,'blue','outer'],['맨홀(소유자)',d.mhOwner,'blue','mhOwner']];
  L.forEach(function(r,i){var y=firstY-dy*i; add(lx,y,gh,r[0]+' :','label'); add(vx,y,gh,r[1]||'',r[2],'start',r[3]);});
  var rlx=b0+pad+th*rlm, rvx=b0+pad+th*rvm;
  var R=[['물량(탱고)',(d.volT||'(직접입력)'),'volT'],['물량(GIS)',(d.volG||'(직접입력)'),'volG']];
  R.forEach(function(r,i){var y=firstY-dy*i; add(rlx,y,gh,r[0]+' :','label'); add(rvx,y,gh,r[1]||'','blue','start',r[2]);});
  var sh=gh*0.74, fbx=b0+pad+th*23.8, y2=firstY-dy*2.35, y3=firstY-dy*3.2;
  add(fbx,y2,sh,'공열 :','label'); add(fbx+th*2.7,y2,sh,d.gyeol||'','blue','start','gyeol'); add(fbx+th*4.2,y2,sh,'열','blue','start','gyeol');
  add(fbx+th*6.4,y2,sh,'공단 :','label'); add(fbx+th*9.1,y2,sh,d.gdan||'','blue','start','gdan'); add(fbx+th*10.6,y2,sh,'단','blue','start','gdan');
  add(fbx+th*13.2,y2,sh,'관공번호 :','label'); add(fbx+th*17.6,y2,sh,d.gwannum||'','blue','start','gwannum'); add(fbx+th*19.4,y2,sh,'번호','blue','start','gwannum');
  add(fbx,y3,sh,'관로(내관) :','label'); add(fbx+th*5.2,y3,sh,d.inner||'','blue','start','inner');
  var _sbx=fbx-th*0.8, _sbx2=fbx+th*21.2, _sby=y3-dy*0.28, _sby2=y2+sh+dy*0.28;
  var subBox={x:_sbx, y:_sby, w:_sbx2-_sbx, h:_sby2-_sby};
  return {box:{x:b0,y:by0,w:bw,h:bh}, items:it, th:th, subBox:subBox};
}
function drawTitleBlock(){
  if(typeof gGeo==='undefined'||!gGeo)return;
  var L=tbLayout(); if(!L)return;
  var COL={name:'#111',label:'#111',red:'#d00',blue:'#1633ff'};
  var bx=L.box, c0=S(bx.x,bx.y), c1=S(bx.x+bx.w,bx.y+bx.h);
  var rx=Math.min(c0[0],c1[0]),ry=Math.min(c0[1],c1[1]),rw=Math.abs(c1[0]-c0[0]),rh=Math.abs(c1[1]-c0[1]);
  var box=el('rect',{x:rx,y:ry,width:rw,height:rh,fill:'#fff','fill-opacity':'0.96',stroke:'#d00','stroke-width':'1.4','vector-effect':'non-scaling-stroke',style:'cursor:pointer'});
  if(!viewerMode&&!readOnly){box.addEventListener('pointerdown',function(ev){ev.stopPropagation();ev.preventDefault();openTbEdit();});}
  gGeo.appendChild(box);
  if(L.subBox){var _s0=S(L.subBox.x,L.subBox.y),_s1=S(L.subBox.x+L.subBox.w,L.subBox.y+L.subBox.h);var _sbx=Math.min(_s0[0],_s1[0]),_sby=Math.min(_s0[1],_s1[1]),_sbw=Math.abs(_s1[0]-_s0[0]),_sbh=Math.abs(_s1[1]-_s0[1]);gGeo.appendChild(el('rect',{x:_sbx,y:_sby,width:_sbw,height:_sbh,fill:'none',stroke:'#1633ff','stroke-width':'1','vector-effect':'non-scaling-stroke','pointer-events':'none'}));}
  L.items.forEach(function(t){
    if(t.s==='')return;
    var sp=S(t.x,t.y);
    var e=el('text',{x:sp[0],y:sp[1],'font-size':t.h,fill:COL[t.c]||'#111','text-anchor':t.a,'font-family':'Malgun Gothic,sans-serif'});
    e.textContent=t.s;
    if(t.key&&!viewerMode&&!readOnly){
      e.setAttribute('pointer-events','auto'); e.style.cursor='text';
      e.addEventListener('pointerdown',function(ev){ev.stopPropagation();});
      (function(key){e.addEventListener('dblclick',function(ev){ev.stopPropagation();ev.preventDefault();editField(key);});})(t.key);
    } else { e.setAttribute('pointer-events','none'); }
    gGeo.appendChild(e);
  });
}
function tbApplyToSegs(key,v){var FMAP={gyeol:'gyeol',gdan:'gdan',gwannum:'gwannum',inner:'inner'};var f=FMAP[key];if(!f)return;if(typeof _tgSegs==='undefined'||!_tgSegs||!_tgSegs.length||typeof tgManualKey!=='function')return;if(!state.tangoManual)state.tangoManual={};_tgSegs.forEach(function(sg){if(!sg||!sg.length)return;var k=tgManualKey(sg);if(!state.tangoManual[k])state.tangoManual[k]={};state.tangoManual[k][f]=v;});try{if(typeof tgSeg!=='undefined'&&tgSeg>=0&&typeof tangoSelSeg==='function')tangoSelSeg(tgSeg,true);else if(typeof tgInspRefresh==='function')tgInspRefresh();}catch(e){}} // BUILD678 제목표→전구간 강제반영
function editField(key){
  if(viewerMode||readOnly)return;
  var b=state.bizInfo||{}, t=state.titleBlock||{}, d=tbData();
  var LAB={name:'사업명',bizNo:'탱고 번호',client:'관로(소유자)',outer:'관로(외관)',inner:'관로(내관)',mhOwner:'맨홀(소유자)',gyeol:'공열',gdan:'공단',gwannum:'관공번호',volT:'물량(탱고)',volG:'물량(GIS)'};
  var cur;
  if(key==='name')cur=state.projectName||'';
  else if(key==='bizNo')cur=b.bizNo||'';
  else if(key==='client')cur=b.client||'';
  else if(key==='outer')cur=d.outer||'';
  else if(key==='mhOwner')cur=d.mhOwner||'';
  else if(key==='inner')cur=d.inner||'';
  else if(key==='gyeol')cur=d.gyeol||'';
  else if(key==='gdan')cur=d.gdan||'';
  else if(key==='gwannum')cur=d.gwannum||'';
  else cur=t[key]||'';
  var src=(key==='name'||key==='bizNo'||key==='client');
  var autoKey=(key==='volT'||key==='outer'||key==='mhOwner'||key==='inner'||key==='gyeol'||key==='gdan'||key==='gwannum');   // 자동계산 되돌리기 가능 필드
  var autoLabel=(key==='volT')?'🔄 관로거리 자동계산':'🔄 자동값으로';
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.25);z-index:9999;display:flex;align-items:center;justify-content:center';
  var card=document.createElement('div');
  card.style.cssText='background:#fff;border-radius:10px;padding:18px 20px;min-width:300px;box-shadow:0 8px 30px rgba(0,0,0,.2)';
  card.innerHTML='<div style="font-weight:700;font-size:15px;margin-bottom:12px">'+(LAB[key]||'수정')+' 수정</div>'
    +(key==='inner'?('<select id="tbfInp" style="width:100%;padding:7px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box;font-size:14px">'+['','SCD내관_22mm','SCD내관_25mm','SCD내관_28mm','SCD내관_36mm'].map(function(o){return '<option value="'+o+'"'+(o===cur?' selected':'')+'>'+(o||'(선택)')+'</option>';}).join('')+'</select>'):key==='outer'?('<select id="tbfInp" style="width:100%;padding:7px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box;font-size:14px">'+(function(){var _os=[''].concat((typeof TG_OPT!=='undefined'&&TG_OPT&&TG_OPT.ext)?TG_OPT.ext:[]);if(cur&&_os.indexOf(cur)<0)_os.push(cur);return _os.map(function(o){return '<option value="'+o+'"'+(o===cur?' selected':'')+'>'+(o||'(선택)')+'</option>';}).join('');})()+'</select>'):key==='mhOwner'?('<select id="tbfSel" style="width:100%;padding:7px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box;font-size:14px">'+(function(){var _ms=['SKT','SKB','LG','드림','직접입력'];var _cus=(['SKT','SKB','LG','드림'].indexOf(cur)<0&&cur!=='');return _ms.map(function(o){var _s=(o===cur||(o==='직접입력'&&_cus))?' selected':'';return '<option value="'+o+'"'+_s+'>'+o+'</option>';}).join('');})()+'</select><input id="tbfInp" style="width:100%;padding:7px;margin-top:8px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box;font-size:14px;display:'+((['SKT','SKB','LG','드림'].indexOf(cur)<0&&cur!=='')?'block':'none')+'" placeholder="직접 입력" value="'+tbEsc((['SKT','SKB','LG','드림'].indexOf(cur)<0)?cur:'')+'">'):('<input id="tbfInp" style="width:100%;padding:7px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box;font-size:14px" value="'+tbEsc(cur)+'">'))
    +(src?'<div style="font-size:12px;color:#888;margin-top:6px">사업 등록 정보도 함께 수정됩니다</div>':'')
    +(autoKey?'<div style="font-size:12px;color:#888;margin-top:6px">비우거나 \'자동\' 버튼을 누르면 자동 계산값으로 돌아갑니다</div>':'')
    +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;align-items:center">'
    +(autoKey?'<button id="tbfAuto" style="margin-right:auto;padding:6px 12px;border:1px solid #1633ff;background:#fff;color:#1633ff;border-radius:6px;cursor:pointer;font-size:13px">'+autoLabel+'</button>':'')
    +'<button id="tbfC" style="padding:6px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">취소</button><button id="tbfO" style="padding:6px 14px;border:none;background:#1633ff;color:#fff;border-radius:6px;cursor:pointer">확인</button></div>';
  ov.appendChild(card);document.body.appendChild(ov);
  var inp=card.querySelector('#tbfInp');
  if(key==='mhOwner'){var _msel=card.querySelector('#tbfSel');if(_msel)_msel.addEventListener('change',function(){var _sh=(_msel.value==='직접입력');if(inp){inp.style.display=_sh?'block':'none';if(_sh)inp.focus();}});}
  setTimeout(function(){var _f=(key==='mhOwner')?card.querySelector('#tbfSel'):inp;if(_f){_f.focus();if(_f.select)_f.select();}},30);
  function close(){ov.remove();}
  function commit(){
    var v;
    if(key==='mhOwner'){var _sel=card.querySelector('#tbfSel');var _sv=_sel?_sel.value:'';v=(_sv==='직접입력')?((inp?inp.value:'')||'').trim():_sv;}
    else v=inp.value.trim();
    if(key==='name'){state.projectName=v; var r=document.getElementById('regName'); if(r)r.value=v;}
    else if(key==='bizNo'){state.bizInfo=state.bizInfo||{}; state.bizInfo.bizNo=v; var r=document.getElementById('regBizNo'); if(r)r.value=v;}
    else if(key==='client'){state.bizInfo=state.bizInfo||{}; state.bizInfo.client=v; var r=document.getElementById('regClient'); if(r)r.value=v;}
    else {state.titleBlock=state.titleBlock||{}; state.titleBlock[key]=v;}
    close(); try{drawGeo();}catch(e){} try{saveProject&&saveProject();}catch(e){}
  }
  function autoReset(){
    state.titleBlock=state.titleBlock||{}; delete state.titleBlock[key];   // override 제거 → 자동값 복귀
    close(); try{drawGeo();}catch(e){} try{saveProject&&saveProject();}catch(e){}
  }
  ov.addEventListener('pointerdown',function(e){if(e.target===ov)close();});
  card.querySelector('#tbfC').addEventListener('click',close);
  card.querySelector('#tbfO').addEventListener('click',commit);
  if(autoKey){var ab=card.querySelector('#tbfAuto'); if(ab)ab.addEventListener('click',autoReset);}
  inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();commit();}else if(e.key==='Escape'){e.preventDefault();close();}});
}
function openTbEdit(){
  if(viewerMode||readOnly)return;
  var t=state.titleBlock||{};
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.25);z-index:9999;display:flex;align-items:center;justify-content:center';
  var card=document.createElement('div');
  card.style.cssText='background:#fff;border-radius:10px;padding:18px 20px;min-width:280px;box-shadow:0 8px 30px rgba(0,0,0,.2)';
  function fld(lab,id,v){return '<label style="display:block;margin-bottom:10px;font-size:13px;color:#333">'+lab+'<input id="'+id+'" style="width:100%;padding:6px;margin-top:3px;border:1px solid #ccc;border-radius:5px;box-sizing:border-box" value="'+tbEsc(v||'')+'"></label>';}
  card.innerHTML='<div style="font-weight:700;font-size:15px;margin-bottom:12px">타이틀블록 입력</div>'
    +fld('관로(내관)','tbeInner',t.inner)+fld('물량(탱고)','tbeVolT',t.volT)+fld('물량(GIS)','tbeVolG',t.volG)
    +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px"><button id="tbeCancel" style="padding:6px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">취소</button><button id="tbeOk" style="padding:6px 14px;border:none;background:#1633ff;color:#fff;border-radius:6px;cursor:pointer">확인</button></div>';
  ov.appendChild(card);document.body.appendChild(ov);
  setTimeout(function(){var f=card.querySelector('#tbeInner');if(f)f.focus();},30);
  function close(){ov.remove();}
  ov.addEventListener('pointerdown',function(e){if(e.target===ov)close();});
  card.querySelector('#tbeCancel').addEventListener('click',close);
  card.querySelector('#tbeOk').addEventListener('click',function(){
    state.titleBlock=state.titleBlock||{};
    state.titleBlock.inner=card.querySelector('#tbeInner').value;
    state.titleBlock.volT=card.querySelector('#tbeVolT').value;
    state.titleBlock.volG=card.querySelector('#tbeVolG').value;
    close();try{drawGeo();}catch(e){}try{saveProject&&saveProject();}catch(e){}
  });
}

function distSegW(px,py,a,b){var dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy;var t=L2?((px-a[0])*dx+(py-a[1])*dy)/L2:0;t=Math.max(0,Math.min(1,t));var cx=a[0]+t*dx,cy=a[1]+t*dy;return Math.hypot(px-cx,py-cy);}
function roadPtInPoly(pt,poly){var wn=0;for(var i=0;i<poly.length;i++){var a=poly[i],b=poly[(i+1)%poly.length];var cross=(b[0]-a[0])*(pt[1]-a[1])-(pt[0]-a[0])*(b[1]-a[1]);if(a[1]<=pt[1]){if(b[1]>pt[1]&&cross>0)wn++;}else{if(b[1]<=pt[1]&&cross<0)wn--;}}return wn!==0;}
function classifyRoad(){var zs=state.roadZones||[];var hasRoad=false;zs.forEach(function(z){if(z.type==='\uB3C4\uB85C')hasRoad=true;});(state.points||[]).forEach(function(p){var r=null;zs.forEach(function(z){if(roadPtInPoly([p.x,p.y],z.poly))r=z.type;});if(r==null&&hasRoad)r='\uBCF4\uB3C4';if(p.surfaceManual)r=p.surfaceManual;p.surface=r;if(!p.pave){if(r==='\uB3C4\uB85C')p.pave='\uC544\uC2A4\uD314\uD2B8';else if(r==='\uBCF4\uB3C4')p.pave='\uBCF4\uB3C4';}});(state.manholes||[]).forEach(function(m){if(m.wx==null||m.wy==null)return;var r=null;zs.forEach(function(z){if(roadPtInPoly([m.wx,m.wy],z.poly))r=z.type;});if(r==null&&hasRoad)r='\uBCF4\uB3C4';if(!m.surface)m.surface=r;if(!m.pave){if(r==='\uB3C4\uB85C')m.pave='\uC544\uC2A4\uD314\uD2B8';else if(r==='\uBCF4\uB3C4')m.pave='\uBCF4\uB3C4';}});}
function buildRoadZones(){var segs=[];(state.lines||[]).forEach(function(L){if(L.insp&&L.pts&&L.pts.length>=2&&L.layer==='\uBCF4\uB3C4')segs.push(L.pts.map(function(p){return [p[0],p[1]];}));});if(segs.length<2){toast('\uBCF4\uB3C4 \uD604\uD669\uC120\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4 (\uBA3C\uC800 \uD604\uD669\uACB0\uC120)');return;}function D(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}function _segX(a,b,c,d){function cw(p,q,r){return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);}return ((cw(c,d,a)>0)!==(cw(c,d,b)>0))&&((cw(a,b,c)>0)!==(cw(a,b,d)>0));}function _crossChain(p1,p2,ch){for(var _ci=0;_ci<ch.length-2;_ci++){if(_segX(p1,p2,ch[_ci],ch[_ci+1]))return true;}return false;}function slen(s){var t=0;for(var i=1;i<s.length;i++)t+=D(s[i-1],s[i]);return t;}function isbranch(s){var xs=s.map(function(p){return p[0];}),ys=s.map(function(p){return p[1];});var dx=Math.max.apply(null,xs)-Math.min.apply(null,xs),dy=Math.max.apply(null,ys)-Math.min.apply(null,ys);return slen(s)<15&&dy>dx;}var use=segs.filter(function(s){return !isbranch(s);});if(use.length<2)use=segs;var used=use.map(function(){return false;});var TH_ABS=60,TH_MED=4;function startNewChain(){var st=-1,bv=1e18;use.forEach(function(s,i){if(used[i])return;var v=s[0][0]+s[0][1];if(v<bv){bv=v;st=i;}});if(st<0)return null;used[st]=true;return use[st].map(function(p){return[p[0],p[1]];});}var chains=[];var chain=startNewChain();var _jumps=[];while(chain){var extended=false;var tail=chain[chain.length-1],prev=chain.length>=2?chain[chain.length-2]:null,pdir=null;if(prev){var pdx=tail[0]-prev[0],pdy=tail[1]-prev[1],pL=Math.hypot(pdx,pdy)||1;pdir=[pdx/pL,pdy/pL];}var best=1e18,bi=-1,brev=false;for(var i=0;i<use.length;i++){if(used[i])continue;var ends=[[use[i][0],false],[use[i][use[i].length-1],true]];for(var c=0;c<2;c++){var cp=ends[c][0],d=D(tail,cp),pen=0;if(_crossChain(tail,cp,chain))continue;if(pdir){var gx=cp[0]-tail[0],gy=cp[1]-tail[1],GL=Math.hypot(gx,gy);if(GL>0.01){var dot=(gx/GL)*pdir[0]+(gy/GL)*pdir[1];pen=Math.max(0,-dot)*40;}}var sc=d+pen;if(sc<best){best=sc;bi=i;brev=ends[c][1];}}}if(bi>=0){var _cp=brev?use[bi][use[bi].length-1]:use[bi][0];var _jd=D(tail,_cp);var _srt=_jumps.slice().sort(function(a,b){return a-b;});var _med=(_srt.length?_srt[Math.floor(_srt.length/2)]:1)||1;var tooFar=(_jd>TH_ABS&&(_jumps.length<3||_jd>_med*TH_MED));if(!tooFar){used[bi]=true;_jumps.push(_jd);var seg=brev?use[bi].slice().reverse():use[bi];seg.forEach(function(p){if(chain.length&&D(chain[chain.length-1],p)<0.05)return;chain.push([p[0],p[1]]);});extended=true;}}if(!extended){if(chain.length>=3)chains.push(chain);chain=startNewChain();_jumps=[];}}if(!chains.length){toast('\uBCF4\uB3C4 \uD3D0\uD569 \uC2E4\uD328 - \uAE30\uC874 \uBC29\uC2DD');if(typeof buildRoadZonesLegacy==='function')buildRoadZonesLegacy();return;}if(typeof pushHist==='function')pushHist();var _npt=(state.points||[]).length||1;var _keep=chains.filter(function(c){var _in=0;(state.points||[]).forEach(function(p){if(roadPtInPoly([p.x,p.y],c))_in++;});return _in>=_npt*0.15;});if(_keep.length)chains=_keep;chains=chains.map(function(c){var _A=0;for(var _k=0;_k<c.length;_k++){var _j=(_k+1)%c.length;_A+=c[_k][0]*c[_j][1]-c[_j][0]*c[_k][1];}return _A<0?c.slice().reverse():c;});state.roadZones=chains.map(function(c){return {type:'\uB3C4\uB85C',poly:c};});classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();toast('\uB3C4\uB85C\uBA74 \uC0DD\uC131 ('+chains.length+'\uBA74 '+chains.reduce(function(a,c){return a+c.length;},0)+'\uC810)');}function buildRoadZonesLegacy(){var segs=[];(state.lines||[]).forEach(function(L){if(L.insp&&L.pts&&L.pts.length>=2)segs.push(L.pts.map(function(p){return [p[0],p[1]];}));});if(segs.length<2){toast('\uD604\uD669\uC120\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4 (\uBA3C\uC800 \uD604\uD669\uACB0\uC120)');return;}var ends=[];segs.forEach(function(L,i){ends.push({seg:i,end:0,p:L[0]});ends.push({seg:i,end:1,p:L[L.length-1]});});function dist(a,b){return Math.hypot(a.p[0]-b.p[0],a.p[1]-b.p[1]);}var used={},pair={};function cands(ai){var A=ends[ai],out=[];ends.forEach(function(B,bi){if(bi===ai||B.seg===A.seg||used[bi])return;out.push([dist(A,B),bi]);});out.sort(function(x,y){return x[0]-y[0];});return out;}var ch=true;while(ch){ch=false;for(var ai=0;ai<ends.length;ai++){if(used[ai])continue;var ca=cands(ai);if(!ca.length)continue;var bi=ca[0][1];var cb=cands(bi);if(cb.length&&cb[0][1]===ai){used[ai]=1;used[bi]=1;pair[ai]=bi;pair[bi]=ai;ch=true;}}}for(var a2=0;a2<ends.length;a2++){if(used[a2])continue;var c2=cands(a2);if(!c2.length)continue;var b2=c2[0][1];used[a2]=1;used[b2]=1;pair[a2]=b2;pair[b2]=a2;}var poly=[],segDone={},cc=0,guard=0;while(guard++<ends.length*2){var e=ends[cc],si=e.seg;if(segDone[si])break;segDone[si]=1;var L=segs[si];var vs=e.end===0?L.slice():L.slice().reverse();vs.forEach(function(p){poly.push([p[0],p[1]]);});var other=e.end===0?2*si+1:2*si;var nxt=pair[other];if(nxt==null)break;cc=nxt;if(segDone[ends[cc].seg])break;}var nseg=0;for(var k in segDone)nseg++;if(poly.length>=3){if(typeof pushHist==='function')pushHist();state.roadZones=[{type:'\uB3C4\uB85C',poly:poly}];classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();toast('\uB3C4\uB85C\uBA74 \uC790\uB3D9 \uC0DD\uC131 ('+nseg+'\uAC1C \uD604\uD669\uC120 \uD3D0\uD569)');}else toast('\uD3D0\uD569 \uC2E4\uD328 - \uD604\uD669\uC120 \uD655\uC778');}
function drawRoadZones(){if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME)return;if(typeof LV!=='undefined'&&LV.roadzone===0)return;(state.roadZones||[]).forEach(function(z,zi){if(!z.poly||z.poly.length<3)return;var pts=z.poly.map(function(p){var s=S(p[0],p[1]);return s[0]+','+s[1];}).join(' ');var isRoad=(z.type==='\uB3C4\uB85C');var col=isRoad?'#d9534f':'#1a7a5e';gGeo.appendChild(el('polygon',{points:pts,fill:col,'fill-opacity':isRoad?0.09:0.15,stroke:col,'stroke-opacity':isRoad?0.5:0.9,'stroke-width':1.2,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));if(mode==='roadedit'||mode==='roadvtxdel'||mode==='roadvtxadd'||mode==='roadfollow'){(function(zz,zzi){zz.poly.forEach(function(vp,vi){var hs=S(vp[0],vp[1]);var hh=el('circle',{cx:hs[0],cy:hs[1],r:0.22,fill:'#fff',stroke:'#1633ff','stroke-width':2,'vector-effect':'non-scaling-stroke'});hh.style.cursor=(mode==='roadvtxdel')?'pointer':'move';hh.addEventListener('pointerdown',function(ev){if(mode==='roadvtxadd')return;ev.stopPropagation();ev.preventDefault();if(mode==='roadvtxdel'){if(zz.poly.length>3){if(typeof pushHist==='function')pushHist();zz.poly.splice(vi,1);classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();toast('\uC815\uC810 \uC0AD\uC81C');}return;}if(mode==='roadfollow'){roadFollow={zi:zzi,vi:vi,p1:[vp[0],vp[1]]};toast('\uD604\uD669\uC810\uC744 \uD074\uB9AD\uD558\uC138\uC694');return;}roadEditVtx={zi:zzi,vi:vi};labelDragging=true;try{cv.setPointerCapture(ev.pointerId);}catch(e){}});gAnc.appendChild(hh);});})(z,zi);}});}
function segInt(p1,p2,p3,p4){function ccw(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}var d1=ccw(p3,p4,p1),d2=ccw(p3,p4,p2),d3=ccw(p1,p2,p3),d4=ccw(p1,p2,p4);return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));}
function crossesPipe(ax,ay,bx,by){var ls=state.lines||[];for(var i=0;i<ls.length;i++){var L=ls[i];if(L.insp||!L.pts||L.pts.length<2)continue;for(var j=0;j<L.pts.length-1;j++){var a=L.pts[j],c=L.pts[j+1];if((Math.hypot(a[0]-ax,a[1]-ay)<0.3)||(Math.hypot(c[0]-ax,c[1]-ay)<0.3))continue;if(segInt([ax,ay],[bx,by],a,c))return true;}}return false;}
function inBpZone(p){if(!state.bpzones)return false;for(var i=0;i<state.bpzones.length;i++){var poly=(typeof bpOffsetBand==='function'&&typeof bpPathOf==='function')?bpOffsetBand(bpPathOf(state.bpzones[i]),5):null;if(poly&&typeof bpPtInPoly==='function'&&bpPtInPoly(p.x,p.y,poly))return true;}return false;}
function inRoadZone(x,y){if(!state.roadZones)return false;for(var i=0;i<state.roadZones.length;i++){if(roadPtInPoly([x,y],state.roadZones[i].poly))return true;}return false;}
function buildDepthCheck(){if(!state.tamsa&&typeof classifyRoad==='function')classifyRoad();var bad=[];(state.points||[]).forEach(function(p){var d=state.tamsa?((p.z!=null&&isFinite(p.z))?p.z:null):((state._depthByNo&&state._depthByNo[p.no]!=null)?state._depthByNo[p.no]:null);if(d==null)return;if(inBpZone(p))return;var surf=p.surface;var limi=(surf==='\uB3C4\uB85C')?7:((surf==='\uBCF4\uB3C4')?5:null);var rdi=Math.round(Math.round(d*100)/10);if(limi!=null&&rdi<limi)bad.push({no:p.no,x:p.x,y:p.y,depth:d,rd:rdi/10,lim:limi/10});});state.depthCheck=bad;if(typeof saveProject==='function')saveProject();drawGeo();toast(bad.length+'\uAC1C \uCE21\uC810 \uAE30\uC900\uC2EC\uB3C4 \uBBF8\uB2EC'+(bad.length?'':' (\uB3C4\uB85C\uBA74 \uCC98\uB9AC\u00B7\uC2EC\uB3C4 \uC785\uB825 \uD655\uC778)'));}
function drawDepthCheck(){if(typeof LV!=='undefined'&&LV.depthchk===0)return;var _placed=[];(state.depthCheck||[]).forEach(function(b,bi){var s=S(b.x,b.y);gGeo.appendChild(el('circle',{cx:s[0],cy:s[1],r:1.2,fill:'none',stroke:'#d500f2','stroke-width':2.4,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));var ex,ey,manual=(b.lx!=null&&b.ly!=null);if(manual){ex=b.lx;ey=b.ly;}else{var pp=(typeof pointByNo==='function')?pointByNo(b.no):null;var w=(pp&&typeof pipeDirAt==='function')?pipeDirAt(pp):null;if(w){var m=Math.hypot(w[0],w[1])||1,ue=w[0]/m,un=w[1]/m,pe=-un,pn=ue,ext=9;var sign=(bi%2===0)?1:-1;ex=b.x+pe*ext*sign;ey=b.y+pn*ext*sign;var tries=0;while(tries<7){var cf=false;for(var q=0;q<_placed.length;q++){if(Math.hypot(_placed[q][0]-ex,_placed[q][1]-ey)<3.2){cf=true;break;}}if(!cf)break;ext+=1.3;ex=b.x+pe*ext*sign;ey=b.y+pn*ext*sign;tries++;}}else{ex=b.x+4;ey=b.y-4;}}_placed.push([ex,ey]);b._dx=ex;b._dy=ey;var es=S(ex,ey);var _ddx=ex-b.x,_ddy=ey-b.y,_ddl=Math.hypot(_ddx,_ddy)||1,_sst=S(b.x+_ddx/_ddl*1.2,b.y+_ddy/_ddl*1.2);gGeo.appendChild(el('line',{x1:_sst[0],y1:_sst[1],x2:es[0],y2:es[1],stroke:'#d500f2','stroke-width':1.3,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));var _anc=(ex>=b.x?'start':'end');var lbl=(typeof mkLabel==='function')?mkLabel(es[0]+(ex>=b.x?0.5:-0.5),es[1],'\uAE30\uC900\uC2EC\uB3C4\uBBF8\uB2EC',{fill:'#d500f2',weight:'700',anchor:_anc,grp:'depthchk',px:Math.max(7,Math.min(13,0.6/((typeof pxToWorld==='function'&&pxToWorld())||0.06)))}):null;if(lbl&&mode==='pan'&&!viewerMode&&!readOnly){lbl.style.pointerEvents='auto';lbl.style.cursor='move';(function(idx){lbl.addEventListener('pointerdown',function(ev){ev.stopPropagation();ev.preventDefault();depthDrag={idx:idx};labelDragging=true;try{cv.setPointerCapture(ev.pointerId);}catch(e){}});})(bi);}});}
function drawBpZones(){
  if(!state.bpzones||!state.bpzones.length)return;
  if((typeof LV!=='undefined')&&LV.bpbox===0)return;
  state.bpzones.forEach(function(z,_zi){
    var path=bpPathOf(z), poly=bpOffsetBand(path,5);if(!poly)return;
    var _hov=(mode==='bpzdel'&&bpEraseHover===_zi);
    var d='M'+poly.map(function(c){var sp=S(c[0],c[1]);return sp[0]+' '+sp[1];}).join(' L')+' Z';
    gGeo.appendChild(el('path',{d:d,fill:'#b8860b','fill-opacity':_hov?'0.20':'0.06',stroke:'#b8860b','stroke-width':_hov?'3.4':'1.6','stroke-opacity':'0.85','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
    var mid=path[Math.floor(path.length/2)];
    if(z.lx==null||z.ly==null){z.lx=mid[0];z.ly=mid[1]+10;}
    var _foot=bpFootOnPoly(poly,z.lx,z.ly);var mc=S(_foot[0],_foot[1]), ts=S(z.lx,z.ly);
    gGeo.appendChild(el('line',{x1:mc[0],y1:mc[1],x2:ts[0],y2:ts[1],stroke:'#b8860b','stroke-width':'1.6','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
    var lbl=mkLabel(ts[0],ts[1],z.note||'\uBCF4\uAC15\uD310 \uC9C0\uC5ED',{fill:'#b8860b',weight:'700',anchor:'middle',grp:'pt',px:Math.max(7,Math.min(13,0.65/((typeof pxToWorld==='function'&&pxToWorld())||0.06)))});
    if(!viewerMode&&!readOnly){
      lbl.style.pointerEvents='auto';lbl.style.cursor='move';
      lbl.addEventListener('dblclick',function(ev){ev.stopPropagation();if(mode==='bpzdel')return;openBpEdit(z);});
      lbl.addEventListener('pointerdown',function(ev){if(viewerMode||readOnly)return;if(mode==='bpzdel'){ev.stopPropagation();ev.preventDefault();var bi=state.bpzones.indexOf(z);if(bi>=0){pushHist();state.bpzones.splice(bi,1);drawGeo();updMeta();toast('\uBCF4\uAC15\uD310 \uAD6C\uC5ED \uC0AD\uC81C');}return;}if(mode!=='pan')return;ev.stopPropagation();ev.preventDefault();bpDragZone=z;labelDragging=true;try{cv.setPointerCapture(ev.pointerId);}catch(e){}});
      var _ahOff=(mode==='delall2'||mode==='delline'||mode==='ptdel'||mode==='bpzdel'||(typeof LV!=='undefined'&&LV&&LV.tagbox===0));var ah=el('circle',{cx:ts[0],cy:ts[1],r:Math.max((typeof pxToWorld==='function'?pxToWorld():0.06)*11,0.25),fill:'rgba(184,134,11,0.001)',stroke:'none',cursor:'move','pointer-events':(_ahOff?'none':'all')});gAnc.appendChild(ah);
      (function(zz,handle){
        handle.addEventListener('pointerdown',function(ev){if(mode==='bpzdel'){ev.stopPropagation();ev.preventDefault();var bi=state.bpzones.indexOf(zz);if(bi>=0){pushHist();state.bpzones.splice(bi,1);drawGeo();updMeta();toast('\uBCF4\uAC15\uD310 \uAD6C\uC5ED \uC0AD\uC81C');}return;}if(mode!=='pan'||viewerMode||readOnly)return;ev.stopPropagation();ev.preventDefault();bpDragZone=zz;labelDragging=true;try{cv.setPointerCapture(ev.pointerId);}catch(e){}});
      })(z,ah);
    }
  });
}
function openBpEdit(z){
  var ts=S(z.lx,z.ly),r=cv.getBoundingClientRect(),scaleX=r.width/vb.w,scaleY=r.height/vb.h;
  var sx=r.left+(ts[0]-vb.x)*scaleX, sy=r.top+(ts[1]-vb.y)*scaleY;
  var wrap=document.createElement('div');
  wrap.style.cssText='position:fixed;z-index:999;left:'+sx+'px;top:'+(sy-34)+'px;background:#fffde7;border-bottom:2px solid #b8860b;padding:3px 6px;border-radius:4px;';
  var inp=document.createElement('input');inp.value=z.note||'\uBCF4\uAC15\uD310 \uC9C0\uC5ED';inp.placeholder='\uBCF4\uAC15\uD310 \uC9C0\uC5ED';
  inp.style.cssText='font-size:16px;font-weight:700;color:#b8860b;border:none;background:transparent;outline:none;width:170px;text-align:center;';
  wrap.appendChild(inp);document.body.appendChild(wrap);inp.focus();inp.select();
  var done=function(){if(wrap.parentNode){pushHist();z.note=inp.value.trim()||'\uBCF4\uAC15\uD310 \uC9C0\uC5ED';wrap.remove();drawGeo();}};
  inp.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key==='Escape'){e.stopPropagation();done();}else e.stopPropagation();});
  inp.addEventListener('blur',function(){setTimeout(done,120);});
}

function drawGeo(){
  (function(){var _tb=document.getElementById('tamsaBadge');if(_tb)_tb.style.display=state.tamsa?'':'none';})();
  clearSvg(gGeo); clearSvg(gPts); clearSvg(gHit); clearSvg(gAnc); clearLabels('pt');clearLabels('depth');clearLabels('depthchk');
  if(typeof drawBpZones==='function')drawBpZones();
  if(typeof drawRoadZones==='function')drawRoadZones();
  if(typeof drawDepthCheck==='function')drawDepthCheck();
  if(typeof drawTitleBlock==='function')drawTitleBlock();
  if(!bpOff)(state.baseTexts||[]).forEach(function(t){var sc=S(t.x,t.y);var tn=el('text',{x:sc[0],y:sc[1],'font-size':Math.max(t.h*2,1.1),fill:'#888','text-anchor':'start','pointer-events':'none'});if(t.rot){tn.setAttribute('transform','rotate('+(-t.rot)+' '+sc[0]+' '+sc[1]+')');}tn.textContent=t.text;gGeo.appendChild(tn);});
  // ★ 백판은 화면영역 컬링으로 그림(drawBackdrop) — 화면 밖 백판은 안 그려 줌/팬 가벼움(BUILD509)
  drawBackdrop();
  // 앱 레이어·crop 라인만 개별(색·굵기·dash 다양, 클릭 필요)
  state.lines.forEach(function(L){if(bpOff&&L.base)return;
    if(!(LINECOL[L.layer]||L.crop))return;      // 백판은 위 통합 path로 처리됨
    var def=LINECOL[L.layer]||{c:"#bbb",w:1.2};if(L.color)def={c:L.color,w:def.w,dash:def.dash};if(L.crop)def={c:"#000",w:1.4};
    var pts=L.pts.map(function(p){var s=S(p[0],p[1]);return s[0]+','+s[1];}).join(' ');
    var pl=el('polyline',{points:pts,fill:'none',stroke:def.c,'stroke-width':def.w,'vector-effect':'non-scaling-stroke','stroke-linejoin':'round','stroke-linecap':def.dash?'butt':'round'});
    if(def.dash)pl.setAttribute('stroke-dasharray',def.dash);
    if(L.insp)pl.setAttribute('class','insp-line');
    gGeo.appendChild(pl);
  });
  drawHyunSym();
  var lay=computeLabels();
  state.lines.forEach(function(L){if((L.layer!=='지거'&&L.layer!=='압입구간')||!L.note)return;
    var nc=L.layer==='압입구간'?'#1f6fd6':'#a07e00';   // 인출선·앵커·박스 색
    var nf=L.layer==='압입구간'?'#15489e':'#7a5f00';   // 글자 색
    var aw=ptOnPoly(L.pts,polyAnchorT(L));      // 선 위 앵커(world)
    var s=S(aw[0],aw[1]),lx=(L.noteOff?L.noteOff[0]:s[0]+1.8),ly=(L.noteOff?L.noteOff[1]:s[1]-1.3);
    var ld=el('line',{x1:s[0],y1:s[1],x2:lx,y2:ly,stroke:nc,'stroke-width':0.8,'vector-effect':'non-scaling-stroke','stroke-dasharray':'2 1.5','pointer-events':'none'});gPts.appendChild(ld);
    var anc=el('circle',{cx:s[0],cy:s[1],r:0.32,fill:nc,'pointer-events':'none'});gAnc.appendChild(anc); // 보이는 원
    var ahR=Math.max(20*pxToWorld(), 1.0); // 클릭영역: 화면 ~20px 고정 (측점 9px보다 크게 → 쉽게 잡힘)
    var ah=el('circle',{cx:s[0],cy:s[1],r:ahR,fill:'transparent','pointer-events':'all'});ah.style.cursor='move';gAnc.appendChild(ah); // 클릭 잡기용 큰 투명 원
    addAnchorHandle(L,ah,anc,ld);
    var t=el('text',{x:lx+0.25,y:ly+0.2,'font-size':1.43,fill:nf,'font-weight':'600','text-anchor':'start','pointer-events':'none'});t.textContent=L.note;gPts.appendChild(t);
    // 인출선이 붙는 쪽: 앵커가 태그보다 오른쪽이면 태그 오른쪽 끝에서, 왼쪽이면 태그 왼쪽에서
    var tbb;try{tbb=t.getBBox();}catch(e){tbb=null;}
    var tw=tbb?tbb.width:(L.note||'').length*0.42;
    ld.setAttribute('x2', s[0]>lx ? lx+0.25+tw : lx);
    addNoteHandle(L,t,ld,lx,ly,s[0],tw);
  });
  var Up=pxToWorld();
  var hitR=Math.min(0.45, 9*Up);   // 클릭 히트: 작은 줌에선 화면 고정, 큰 줌에선 월드 0.45 상한
  state.points.forEach(function(p,i){if(p._hideMark&&!isRiserPt(p))return;if((typeof LV!=='undefined')&&LV.bp===0&&/보강판/.test((p.no||'')+'|'+(p.code||'')))return;var isBp=/보강판/.test((p.no||'')+'|'+(p.code||''));var bpHide=isBp&&(typeof bpPtHidden==='function')&&bpPtHidden(p);var s=S(p.x,p.y);if(p._hyun){var _hxh=0.1875,_hxc=({b:'#4fc3f7',d:'#1976d2',s:'#8d6e63',bd:'#e53935',db:'#e53935'})[(p._tcode||'').toLowerCase()]||'#1a7a5e';gPts.appendChild(el('line',{x1:s[0]-_hxh,y1:s[1]-_hxh,x2:s[0]+_hxh,y2:s[1]+_hxh,stroke:_hxc,'stroke-width':1.4,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));gPts.appendChild(el('line',{x1:s[0]-_hxh,y1:s[1]+_hxh,x2:s[0]+_hxh,y2:s[1]-_hxh,stroke:_hxc,'stroke-width':1.4,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));return;}
    // 측점 심벌(속빈 사각) — 월드고정 정사각: 줌하면 크기는 변하지만 절대 안 찌그러짐, 위치 정확
    if(isRiserPt(p)){var _xh=0.045,_xc='#d500f2';gPts.appendChild(el('line',{x1:s[0]-_xh,y1:s[1]-_xh,x2:s[0]+_xh,y2:s[1]+_xh,stroke:_xc,'stroke-width':1.4,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));gPts.appendChild(el('line',{x1:s[0]-_xh,y1:s[1]+_xh,x2:s[0]+_xh,y2:s[1]-_xh,stroke:_xc,'stroke-width':1.4,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));return;}else{
    gPts.appendChild(el('rect',{x:s[0]-0.147,y:s[1]-0.147,width:0.294,height:0.294,fill:'none',stroke:(state.tamsa?'#111':(isBp?'#b8860b':(isManhole(p)?'#0d47a1':(isTpoint(p)?'#e53935':(p.surface==='\uB3C4\uB85C'?'#d9534f':(p.surface==='\uBCF4\uB3C4'?'#1a7a5e':'#111')))))),'stroke-width':isManhole(p)?3.8:2.5,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));if(p.surface&&(typeof LV==='undefined'||LV.surfacedot!==0)){gPts.appendChild(el('circle',{cx:s[0]+(typeof pxToWorld==='function'?pxToWorld()*6:0.8),cy:s[1]-(typeof pxToWorld==='function'?pxToWorld()*6:0.8),r:(typeof pxToWorld==='function'?pxToWorld()*4.5:0.6),fill:p.surface==='\uB3C4\uB85C'?'#d9534f':'#1a7a5e',stroke:'#fff','stroke-width':(typeof pxToWorld==='function'?pxToWorld()*1:0.15),'pointer-events':'none'}));}
    gPts.appendChild(el('line',{x1:s[0],y1:s[1],x2:s[0],y2:s[1],stroke:'#111','stroke-width':4,'stroke-linecap':'square','vector-effect':'non-scaling-stroke','pointer-events':'none'})); // 중심 점(박스와 동일 vector-effect → 줌 고정)
    }
    if(showDirArrows!==false&&(typeof LV==='undefined'||LV.photoDir!==0))(function(){var d4=getPhotoDir(p),dv=photoDirVec(p,d4),pr=[-dv[1],dv[0]],hl=0.16,AC='#d500f2';
      var ax0=s[0]+dv[0]*0.22,ay0=s[1]+dv[1]*0.22,ax1=s[0]+dv[0]*0.62,ay1=s[1]+dv[1]*0.62;
      gPts.appendChild(el('line',{x1:ax0,y1:ay0,x2:ax1,y2:ay1,stroke:AC,'stroke-width':2.6,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));
      gPts.appendChild(el('line',{x1:ax1,y1:ay1,x2:ax1-dv[0]*hl+pr[0]*hl,y2:ay1-dv[1]*hl+pr[1]*hl,stroke:AC,'stroke-width':2.6,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));
      gPts.appendChild(el('line',{x1:ax1,y1:ay1,x2:ax1-dv[0]*hl-pr[0]*hl,y2:ay1-dv[1]*hl-pr[1]*hl,stroke:AC,'stroke-width':2.6,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));})();
    var hit=el('circle',{cx:s[0],cy:s[1],r:hitR,fill:'transparent','pointer-events':'all'});hit.style.cursor='pointer';
    hit.addEventListener('click',function(ev){if(this._lpFired){this._lpFired=false;ev.stopPropagation();return;}if(mode==='ptdel'||mode==='delall2'){ev.stopPropagation();ev.preventDefault();deletePoint(p);return;}if(mode!=='pan'||labelDragging||noteMode)return;ev.stopPropagation();if(photoLink)selectPoint(p.no);else{selNum=p.no;drawGeo();highlightSel();if(typeof joseoSyncTo==='function')joseoSyncTo(p.no);}toast('측점 '+p.no+' 선택'+(photoLink?'':' (미연동·사진고정)'));});
    hit.addEventListener('mouseenter',function(){if(mode==='ptdel'||mode==='delall2'){hit.setAttribute('fill','rgba(211,47,47,0.28)');hit.setAttribute('stroke','#d32f2f');hit.setAttribute('stroke-width',1.6);hit.setAttribute('vector-effect','non-scaling-stroke');}});
    hit.addEventListener('mouseleave',function(){hit.setAttribute('fill','transparent');hit.removeAttribute('stroke');});
    gHit.appendChild(hit);
    if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME){(function(pno){hit.addEventListener('pointerdown',function(ev){if(mode!=='pan')return;var self=this,sx=ev.clientX,sy=ev.clientY;if(self._lp){clearTimeout(self._lp);self._lp=null;}var end=function(){if(self._lp){clearTimeout(self._lp);self._lp=null;}window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',end,true);window.removeEventListener('pointermove',mv,true);};var mv=function(e){if(Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>10)end();};window.addEventListener('pointerup',end,true);window.addEventListener('pointercancel',end,true);window.addEventListener('pointermove',mv,true);self._lp=setTimeout(function(){self._lp=null;self._lpFired=true;window.removeEventListener('pointerup',end,true);window.removeEventListener('pointercancel',end,true);window.removeEventListener('pointermove',mv,true);if(typeof rtPointMenu==='function')rtPointMenu(pno);},1000);});})(p.no);}
    var L=lay[i],ls=S(L.lx,L.ly),off=L.anchor==='start'?0.15:-0.15;
    var ld=null;if(L.leader&&!bpHide){ld=el('line',{x1:s[0],y1:s[1],x2:ls[0],y2:ls[1],stroke:'#999','stroke-width':1.3,'vector-effect':'non-scaling-stroke','stroke-dasharray':'2 1.5','pointer-events':'none'});gPts.appendChild(ld);}
    var nt=mkLabel(ls[0]+off, ls[1], p.no, {fill:'#1a7a3a',weight:'400',anchor:L.anchor,grp:'pt',px:15});
    // 윗줄 날짜-번호에서 번호(마지막 - 뒤)만 빨간색
    var noStr=(p.no||''), dpos=noStr.lastIndexOf('-');
    if(isBp)nt.innerHTML='<span class="L-bp" style="color:#b8860b;font-weight:700">'+noStr+'</span>';else if(dpos>=0)nt.innerHTML='<span class="L-date">'+noStr.slice(0,dpos+1)+'</span><span class="L-no" style="color:#d32f2f;font-weight:700">'+noStr.slice(dpos+1)+'</span>';else nt.innerHTML='<span class="L-no">'+noStr+'</span>';
    // 코드는 번호 아래 줄로 같은 div에 추가
    if((state.tamsa?tamsaTag(p):(p.code||'')).trim()){
      var sub=document.createElement('div');sub.className=isBp?'L-bp':'L-code';
      var code=(state.tamsa?tamsaTag(p):(p.code||'')).trim();
      if(isTpoint(p)){sub.innerHTML=code.replace(/(^|\s)(T)(?=\s|\d|$)/,'$1<span style="color:#1d4ed8;font-weight:700">T</span>');}
      else{sub.textContent=code;}
      sub.style.cssText='color:#0f7a86;font-weight:400;margin-top:2px;';
      nt.appendChild(sub);
    }
    var _dp=state.tamsa?((p.z!=null&&isFinite(p.z))?p.z:null):(state._depthByNo&&state._depthByNo[p.no]);
    if(_dp!=null&&isFinite(_dp)){var _w=(typeof pipeDirAt==='function')?pipeDirAt(p):null,_ddx=0,_ddy=-0.45,_drot=0;if(_w){var _m=Math.hypot(_w[0],_w[1])||1,_ue=_w[0]/_m,_un=_w[1]/_m,_pe=-_un,_pn=_ue,_lox=(L.lx-p.x),_loy=(L.ly-p.y);if(_pe*_lox+_pn*_loy>0){_pe=-_pe;_pn=-_pn;}_ddx=_pe*0.45;_ddy=_pn*0.45;_drot=Math.atan2(-_w[1],_w[0])*180/Math.PI;if(_drot>90)_drot-=180;if(_drot<-90)_drot+=180;}var _ds=S(p.x+_ddx,p.y+_ddy);var _dlbl=mkLabel(_ds[0],_ds[1],(Math.round(_dp*100)/100).toFixed(2),{fill:'#2196f3',weight:'700',anchor:'middle',grp:'depth',px:Math.max(7,Math.min(13,0.6/((typeof pxToWorld==='function'&&pxToWorld())||0.06))),rot:_drot});if(mode==='depthedit'||mode==='depthdel'){_dlbl.style.pointerEvents='auto';_dlbl.style.cursor='pointer';(function(pp,dpv){_dlbl.addEventListener('dblclick',function(ev){ev.stopPropagation();if(mode!=='depthedit')return;var _nv=prompt('\uC2EC\uB3C4\uAC12 \uC218\uC815 (m)',(Math.round(dpv*100)/100).toFixed(2));if(_nv!=null&&_nv.trim()!==''&&isFinite(parseFloat(_nv))){if(state.tamsa){pp.z=parseFloat(_nv);}else{state._depthByNo[pp.no]=parseFloat(_nv);}if(typeof saveProject==='function')saveProject();drawGeo();}});_dlbl.addEventListener('click',function(ev){ev.stopPropagation();if(mode!=='depthdel')return;delete state._depthByNo[pp.no];if(typeof saveProject==='function')saveProject();drawGeo();});_dlbl.addEventListener('mouseenter',function(){if(mode==='depthdel')_dlbl.style.background='rgba(255,0,0,0.18)';else if(mode==='depthedit')_dlbl.style.background='rgba(33,150,243,0.18)';});_dlbl.addEventListener('mouseleave',function(){_dlbl.style.background='';});})(p,_dp);}}
    if(ld){var _lvis=isBp||((LV.no!==0)&&(p.no||'').length>0)||((LV.date!==0)&&dpos>=0)||((LV.code!==0)&&(p.code||'').trim().length>0);ld.style.display=_lvis?'':'none';}
    if(bpHide){nt.style.display='none';if(ld)ld.style.display='none';}
    var ct=nt; // 핸들 호환
    addLabelHandle(p,L,ls,nt,ct,ld,p.no===selNum);
  });
  /* [BUILD 809] 후측량사진(공사후=after) 등록 측점 표시: 전후사진 모두 있는 것만 · 번호별 1개 */
  try{if(typeof photoMap!=='undefined'&&photoMap&&typeof afterMap!=='undefined'&&afterMap){var _pdrawn={};state.points.forEach(function(p){if(p._hyun)return;if(typeof isRiserPt==='function'&&isRiserPt(p))return;var _k=(typeof ptNum==='function')?ptNum(p):String(p.no||'');if(!_k||_pdrawn[_k])return;var _hasB=photoMap[_k]||photoMap[p.no];var _hasA=afterMap[_k]||afterMap[p.no];if(_hasB&&_hasA){_pdrawn[_k]=1;var _ps=S(p.x,p.y);gPts.appendChild(el('circle',{cx:_ps[0],cy:_ps[1],r:2.1,fill:'#d32f2f','fill-opacity':0.28,stroke:'#ffcc00','stroke-width':2.6,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));}});}}catch(e){}
  /* [BUILD 818] 폰GPS 파란 임시측점 (CSV 점 없는 것만) */
  try{if(typeof clearLabels==='function')clearLabels('gps');if(state.gpsPts&&state.gpsPts.length){var _have={};(state.points||[]).forEach(function(p){_have[p.no]=1;});var _nsF=state.nightShift,_cutF=(_nsF&&_nsF.on)?_nsF.cut:null;state.gpsPts.forEach(function(g){var _wnoF=g.no;if(g._d0!=null&&g._nm!=null){var _dtF=g._d0;if(_cutF!=null&&g._tm!=null&&g._tm<_cutF)_dtF=prevDayYMD(g._d0);_wnoF=_dtF+'-'+g._nm;}if(_have[g.no]||_have[_wnoF])return;var _gs=S(g.x,g.y);var _hc=el('circle',{cx:_gs[0],cy:_gs[1],r:1.9,fill:'transparent'});_hc.style.cursor='pointer';_hc.setAttribute('pointer-events','all');var _bc=el('circle',{cx:_gs[0],cy:_gs[1],r:0.5,fill:'#2196f3','fill-opacity':0.9,stroke:'#0d47a1','stroke-width':1.6,'vector-effect':'non-scaling-stroke'});_bc.setAttribute('pointer-events','none');(function(gno){_hc.addEventListener('pointerdown',function(ev){ev.stopPropagation();ev.preventDefault();try{this.setPointerCapture(ev.pointerId);}catch(_pe){}var self=this;self._lp=setTimeout(function(){self._lp=null;rtPointMenu(gno);},1000);});_hc.addEventListener('pointerup',function(ev){ev.stopPropagation();if(this._lp){clearTimeout(this._lp);this._lp=null;selNum=gno;if(typeof highlightSel==='function')highlightSel();if(typeof photoPanelOpen!=='undefined'&&!photoPanelOpen&&typeof openPhotoPanel==='function')openPhotoPanel();var _sel=document.getElementById('photoSel');if(_sel)_sel.value=gno;if(typeof refreshPhotoPanel==='function')refreshPhotoPanel();}});_hc.addEventListener('pointercancel',function(){if(this._lp){clearTimeout(this._lp);this._lp=null;}});})(g.no);gPts.appendChild(_hc);gPts.appendChild(_bc);var _n=(g.no||'').split('-').pop();if(typeof mkLabel==='function')mkLabel(_gs[0],_gs[1]+0.9,_n,{fill:'#0d47a1',weight:'800',anchor:'middle',grp:'gps',px:Math.max(11,Math.min(20,0.9/((typeof pxToWorld==='function'&&pxToWorld())||0.06)))});});}}catch(e){}
  drawDepthMarks();
  if(typeof tgSelMark==='function')tgSelMark();if(typeof tgDrawCompare==='function')tgDrawCompare();if(typeof tgDrawSegHL==='function'&&typeof LV!=='undefined'&&LV.tgseg){if((typeof _tgSegs==='undefined'||!_tgSegs||!_tgSegs.length)&&typeof tangoBuildSegs==='function'){try{_tgSegs=tangoBuildSegs();}catch(e){}}if(typeof _tgSegs!=='undefined'&&_tgSegs&&_tgSegs.length)tgDrawSegHL(typeof tgSeg!=='undefined'?tgSeg:-1);}
  if(hyunDraw&&hyunDraw.pts&&hyunDraw.pts.length){var _hc=(hyunDraw.layer==='\uB3C4\uB85C')?'#0277bd':'#81d4fa';if(hyunDraw.pts.length>=2){var _hps=hyunDraw.pts.map(function(_p){var _s=S(_p[0],_p[1]);return _s[0]+','+_s[1];}).join(' ');gPts.appendChild(el('polyline',{points:_hps,fill:'none',stroke:_hc,'stroke-width':2,'vector-effect':'non-scaling-stroke','stroke-dasharray':'3 2','pointer-events':'none'}));}hyunDraw.pts.forEach(function(_p){var _s=S(_p[0],_p[1]);gPts.appendChild(el('circle',{cx:_s[0],cy:_s[1],r:0.18,fill:_hc,'pointer-events':'none'}));});}
}
/* ====== 맨홀 심벌 렌더 ====== */
// 가장 가까운 통신관로 세그먼트 찾기 → 관로 반대편 단위방향 [ux,uy,거리] (maxR 밖이면 null)
function nearestPipeDir(wx,wy,maxR){
  var bx=null,by=null,bd=1e18;
  (state.lines||[]).forEach(function(L){
    if(L.layer!=='통신관로'||!L.pts||L.pts.length<2)return;
    for(var s=0;s<L.pts.length-1;s++){
      var ax=L.pts[s][0],ay=L.pts[s][1],cx2=L.pts[s+1][0],cy2=L.pts[s+1][1];
      var dx=cx2-ax,dy=cy2-ay,L2=dx*dx+dy*dy,t=L2?((wx-ax)*dx+(wy-ay)*dy)/L2:0;
      t=t<0?0:(t>1?1:t);
      var px=ax+t*dx,py=ay+t*dy,d=Math.hypot(wx-px,wy-py);
      if(d<bd){bd=d;bx=px;by=py;}
    }
  });
  if(bx===null||(maxR&&bd>maxR))return null;
  var vx=wx-bx,vy=wy-by,vl=Math.hypot(vx,vy);
  if(vl<1e-6)return null; // 관로 위에 정확히 있으면 방향 불명
  return [vx/vl,vy/vl,bd];
}
// 맨홀/입상주 라벨 기본 위치(world) — 화면·DXF 공용. txtW=라벨 폭(각자 단위)
function mhDisp(mh){return ((mh.kind&&mh.type!=='riser')?mh.kind+' ':'')+(mh.label||'')+(mh.spec?' '+mh.spec:'');}
function mhLabelBase(mh, txtW){
  var isRiser=(mh.type==='riser');
  var mp=null,md=1e18;
  if(!isRiser)state.points.forEach(function(p){if(!isManhole(p))return;var d=Math.hypot(p.x-mh.wx,p.y-mh.wy);if(d<md){md=d;mp=p;}});
  var pdirs=[];
  if(!isRiser){var Rm2=2.5,cd2=[];
    state.points.forEach(function(p){if(!isManhole(p))return;var d=Math.hypot(p.x-mh.wx,p.y-mh.wy);if(d<=Rm2)cd2.push({p:p,d:d});});
    cd2.sort(function(a,b){return a.d-b.d;});
    if(cd2.length){var A2=cd2[0].p;pdirs.push([A2.x-mh.wx,A2.y-mh.wy]);var ax2=A2.x-mh.wx,ay2=A2.y-mh.wy;
      for(var pi=1;pi<cd2.length;pi++){var q2=cd2[pi].p;if((q2.x-mh.wx)*ax2+(q2.y-mh.wy)*ay2<0){pdirs.push([q2.x-mh.wx,q2.y-mh.wy]);break;}}}}
  state.lines.forEach(function(L){if(L.layer!=='통신관로'||!L.pts)return;
    for(var i=0;i<L.pts.length;i++){if(Math.abs(L.pts[i][0]-mh.wx)<0.15&&Math.abs(L.pts[i][1]-mh.wy)<0.15){
      if(i>0)pdirs.push([L.pts[i-1][0]-mh.wx,L.pts[i-1][1]-mh.wy]);
      if(i<L.pts.length-1)pdirs.push([L.pts[i+1][0]-mh.wx,L.pts[i+1][1]-mh.wy]);
    }}});
  var defLx,defLy;
  var rpd=isRiser?nearestPipeDir(mh.wx,mh.wy,5):null; // 입상주: 근처 관로선(5m내) 반대쪽 자동
  if(pdirs.length){var psx=0,psy=0;pdirs.forEach(function(d){var l=Math.hypot(d[0],d[1])||1;psx+=d[0]/l;psy+=d[1]/l;});
    var psl=Math.hypot(psx,psy);
    if(psl>0.4){var ux=-psx/psl,uy=-psy/psl;defLx=mh.wx+ux*3.9;defLy=mh.wy+uy*3.9;}
    else {var d0=pdirs[0];var pnx=-d0[1],pny=d0[0];var pl=Math.hypot(pnx,pny)||1;pnx/=pl;pny/=pl;if(pny<0){pnx=-pnx;pny=-pny;}defLx=mh.wx+pnx*3.9;defLy=mh.wy+pny*3.9;}}
  else if(rpd){var rux=rpd[0],ruy=rpd[1];var RHOR=3.0,RLIFT=4.8;defLx=mh.wx+rux*RHOR;defLy=mh.wy+RLIFT+ruy*0.4;} // 꺾임점 위로 들어 대각선 각 세움
  else if(mp){var dx=mh.wx-mp.x,dy=mh.wy-mp.y;defLx=(dx>=0)?mh.wx+3.0:mh.wx-3.0;defLy=(dy>=0)?mh.wy+3.6:mh.wy-2.4;}
  else {defLx=mh.wx+1.0;defLy=mh.wy+1.2;}
  // ★ 인출선 길이=줌 무관 고정 1.3m(world, txtW 보정 제거). 드래그한 라벨(mh.lx)은 어떤 보정·제한도 없이 그대로 — 끌고 간 자리 고정(BUILD514)
  return {lx:(mh.lx!=null?mh.lx:defLx), ly:(mh.ly!=null?mh.ly:defLy)};
}
function mergeAftMh(){var mhs=state.manholes||[];if(!mhs.length)return;mhs.forEach(function(m){m._used=false;m._del=false;});mhs.filter(function(m){return m.insp;}).forEach(function(a){var best=null,bd=4;mhs.forEach(function(b){if(b===a||b.insp||b._used)return;var d=Math.hypot((b.wx||0)-(a.wx||0),(b.wy||0)-(a.wy||0));if(d<=bd){bd=d;best=b;}});if(best){var _ox=best.wx,_oy=best.wy;best.wx=a.wx;best.wy=a.wy;best._aft=true;best._used=true;a._del=true;if(typeof moveMhLines==='function')moveMhLines(best,_ox,_oy);}});state.manholes=mhs.filter(function(m){return !m._del;});}
function drawManholes(){
  clearSvg(gMH); clearLabels('mh');clearLabels('riser');
  (state.manholes||[]).forEach(function(mh){
    var isRiser=(mh.type==='riser');var MHC=(mh._aft||(state.tamsa&&!isRiser))?'#111':'#1f6fd6';
    // 손 안 댄 자동순번 기본라벨(예 '2M (SK )')만 'M (SK )'로 정리. 사용자가 직접 고친 건(_edited) 보존
    if(!isRiser && !mh._edited && /^\s*\d+\s*M\s*\(\s*SK\s*\)\s*$/.test(mh.label||''))mh.label='M (SK )';
    var s=S(mh.wx,mh.wy);
    var mx=s[0], my=s[1];
    if(typeof _tgMode==='function'&&_tgMode()){var _mhitR=pxToWorld()*18;var _mhit=el('circle',{cx:mx,cy:my,r:_mhitR,fill:'transparent','pointer-events':'all'});_mhit.style.cursor='pointer';_mhit.addEventListener('mouseenter',function(){_mhit.setAttribute('fill','rgba(211,47,47,0.28)');_mhit.setAttribute('stroke','#d32f2f');_mhit.setAttribute('stroke-width','2');_mhit.setAttribute('vector-effect','non-scaling-stroke');});_mhit.addEventListener('mouseleave',function(){_mhit.setAttribute('fill','transparent');_mhit.removeAttribute('stroke');});gMH.appendChild(_mhit);}

    // 가장 가까운 M코드 측점 찾기 (맨홀만 — 입상주는 M측점 연결 안 함)
    var mp=null,md=1e18;
    if(!isRiser)state.points.forEach(function(p){if(!isManhole(p))return;var d=Math.hypot(p.x-mh.wx,p.y-mh.wy);if(d<md){md=d;mp=p;}});

    var U=pxToWorld(); // 1px당 월드
    var EM=15*U;

    if(isRiser){
      // 입상주 = 테이퍼 목주(전봇대): 밑동이 넓고 위로 갈수록 좁아짐. 중심점=밑동(mx,my). 색=파랑
      var H=0.9, wB=0.16, wT=0.05, armW=0.27, armY=my-H*0.74, RC=(mh._fromCsv?'#d500f2':MHC);
      var gR=el('g',{'class':'sym-riser'});gMH.appendChild(gR);
      gR.appendChild(el('line',{x1:mx-wB,y1:my,x2:mx-wT,y2:my-H,stroke:RC,'stroke-width':2.2,'stroke-linecap':'round','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
      gR.appendChild(el('line',{x1:mx+wB,y1:my,x2:mx+wT,y2:my-H,stroke:RC,'stroke-width':2.2,'stroke-linecap':'round','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
      gR.appendChild(el('line',{x1:mx-armW,y1:armY,x2:mx+armW,y2:armY,stroke:RC,'stroke-width':2.2,'stroke-linecap':'round','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
      gR.appendChild(el('ellipse',{cx:mx,cy:my-H,rx:wT+0.05,ry:0.05,fill:'none',stroke:RC,'stroke-width':1.6,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
      gR.appendChild(el('line',{x1:mx,y1:my,x2:mx,y2:my,stroke:RC,'stroke-width':5,'stroke-linecap':'round','vector-effect':'non-scaling-stroke','pointer-events':'none'})); // 밑동 중심점(화면고정)
    } else {
      // 맨홀 = 이중원(◎) + 중심점
      gMH.appendChild(el('circle',{cx:mx,cy:my,r:0.294,fill:'none',stroke:MHC,'stroke-width':1.4,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
      gMH.appendChild(el('circle',{cx:mx,cy:my,r:0.133,fill:'none',stroke:MHC,'stroke-width':1.0,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
      gMH.appendChild(el('line',{x1:mx,y1:my,x2:mx,y2:my,stroke:MHC,'stroke-width':4.5,'stroke-linecap':'round','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
    }

    // 라벨 글자 폭 (텍스트 길이 기준 월드값)
    var txtW=0,_lb=mhDisp(mh);for(var _i=0;_i<_lb.length;_i++){txtW+=(_lb.charCodeAt(_i)>127?EM*1.0:EM*0.55);}txtW+=EM*0.5;txtW*=0.73; // 한글=한칸,영문=0.55칸+여유, 라벨 px20 기준 1.33배(맨홀·입상주 동일)

    // 라벨 기본 위치(관로 방향 피해서) — 공통 함수
    var _lp=mhLabelBase(mh, txtW); var lx=_lp.lx, ly=_lp.ly;
    var ls=S(lx,ly);
    var lbx=ls[0], lby=ls[1]; // 밑줄 시작점(라벨 기준점)

    // 라벨이 맨홀 기준 오른쪽/왼쪽 판단 (밑줄이 맨홀쪽으로 뻗는 방향)
    var isRight=(lbx >= mx);
    // 빨간 대각선: 맨홀중심 → 꺾임점. 꺾임점은 밑줄의 맨홀쪽 끝
    // 파란 밑줄 길이 = max(대각선 길이의 30%, 글자 폭)
    // 꺾임점 후보 = lbx (밑줄이 맨홀쪽으로 가는 끝)
    var kinkX = isRight ? lbx : lbx; // 일단 lbx 기준, 아래서 밑줄 방향 결정
    var kinkY = lby;
    // 대각선 길이(맨홀→꺾임점)
    var diagLen = Math.hypot(kinkX-mx, kinkY-my);
    // 파란 밑줄 길이
    var underLen = txtW;
    // 밑줄 방향: 맨홀 반대쪽으로 (라벨이 오른쪽이면 밑줄도 오른쪽으로 뻗음)
    var ulx1, ulx2;
    if(isRight){ ulx1=kinkX; ulx2=kinkX+underLen; }
    else { ulx1=kinkX; ulx2=kinkX-underLen; }
    var uly=kinkY;

    // 대각선 (맨홀중심 → 꺾임점) — 맨홀 검정, 입상주 파랑
    var LDC=(mh._fromCsv&&isRiser?'#d500f2':MHC);
    gMH.appendChild(el('line',{x1:mx,y1:my,x2:kinkX,y2:kinkY,stroke:LDC,'stroke-width':1.6,'vector-effect':'non-scaling-stroke','pointer-events':'none','class':isRiser?'sym-riser':'mh-lead'}));
    // 수평 밑줄
    gMH.appendChild(el('line',{x1:ulx1,y1:uly,x2:ulx2,y2:uly,stroke:LDC,'stroke-width':1.6,'vector-effect':'non-scaling-stroke','pointer-events':'none','class':isRiser?'sym-riser':'mh-lead'}));

    // 라벨 텍스트 위치: 밑줄 중앙 위에 올라오게
    var labelW=txtW, labelH=EM*1.15;
    var txtCx=(ulx1+ulx2)/2; // 밑줄 중앙
    var txtLeft=Math.min(ulx1,ulx2);

    // (맨홀↔M측점 연결선은 결선 데이터(state.lines)로 통일 — drawGeo가 그림. 여기서 즉석으로 안 그림)

    // 더블클릭 → 'M' 과 '( )' 만 고정. 앞부분(숫자 등)과 괄호 안 둘 다 수정 가능
    // 형식: [pre]M ([inner])  예: 2M (SK T), 4M (LG U+)
    function openLabelEdit(){
      if(typeof _tgMode==='function'&&_tgMode()&&typeof tgSelectMh==='function'&&mh&&mh.wx!=null){tgSelectMh(mh.wx,mh.wy);if(typeof _tgSegs!=='undefined'&&_tgSegs&&typeof tgSeg!=='undefined'&&tgSeg>=0&&_tgSegs[tgSeg]){var _fsg=_tgSegs[tgSeg],_fpre=null;if(_fsg[0]&&_fsg[0].mh&&Math.abs(_fsg[0].x-mh.wx)<0.5&&Math.abs(_fsg[0].y-mh.wy)<0.5)_fpre='s';else if(_fsg[_fsg.length-1]&&_fsg[_fsg.length-1].mh&&Math.abs(_fsg[_fsg.length-1].x-mh.wx)<0.5&&Math.abs(_fsg[_fsg.length-1].y-mh.wy)<0.5)_fpre='e';if(_fpre&&typeof tgFacHL==='function')tgFacHL(_fpre);}}
      var r=cv.getBoundingClientRect();
      var scaleX=r.width/vb.w, scaleY=r.height/vb.h;
      var sx=r.left+(txtLeft-vb.x)*scaleX;
      var sy=r.top+(uly-vb.y)*scaleY;
      if(isRiser){
        // 입상점 편집: 설비(입상점) + 시설명 + 소유 + 규격
        var IPSPEC=(typeof TG_OPT!=='undefined'&&TG_OPT.facSpec&&TG_OPT.facSpec['입상점'])||[];
        var wrapR=document.createElement('div');
        wrapR.style.cssText='position:fixed;z-index:999;display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:max-content;left:'+sx+'px;top:'+(sy-36)+'px;background:#fffde7;border-bottom:2px solid #555;padding:3px 6px;border-radius:4px;';
        var spFac=document.createElement('span');spFac.textContent='입상점';spFac.style.cssText='font-size:13px;font-weight:800;color:#7a52e0;margin-right:2px';
        var inpR=document.createElement('input');inpR.value=mh.label||'통신주입상';inpR.placeholder='시설명';var selLbl=document.createElement('select');selLbl.innerHTML=['통신주입상','한전주입상'].map(function(o){return '<option>'+o+'</option>';}).join('')+'<option value="_c">직접입력</option>';selLbl.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;padding:1px 2px;cursor:pointer';var _lv=mh.label||'통신주입상';if(_lv==='통신주입상'||_lv==='한전주입상'){selLbl.value=_lv;inpR.style.display='none';}else{selLbl.value='_c';}selLbl.addEventListener('change',function(){inpR.style.display=(selLbl.value==='_c')?'':'none';if(selLbl.value==='_c')inpR.focus();});inpR.style.cssText='font-size:15px;font-weight:600;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;width:120px;text-align:center;padding:1px 3px';
        var selOwn=document.createElement('select');selOwn.innerHTML='<option value="">소유</option>'+['SKT','SKB','공동','타사'].map(function(o){return '<option'+((mh._own===o)?' selected':'')+'>'+o+'</option>';}).join('');selOwn.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;padding:1px 2px;cursor:pointer';
        var selSp=document.createElement('select');var _ipc=(mh.spec&&IPSPEC.indexOf(mh.spec)<0)?('<option selected>'+mh.spec+'</option>'):'';selSp.innerHTML='<option value="">규격</option>'+IPSPEC.map(function(o){return '<option'+((mh.spec===o)?' selected':'')+'>'+o+'</option>';}).join('')+_ipc+'<option value="__cust">직접입력</option>';selSp.addEventListener('change',function(){if(this.value==='__cust'){var _c=prompt('규격 직접입력',(mh.spec||''));if(_c!=null&&_c.trim()!==''){_c=_c.trim();var _o=document.createElement('option');_o.text=_c;_o.value=_c;this.insertBefore(_o,this.lastChild);this.value=_c;}else{this.value=(mh.spec||'');}}});selSp.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;padding:1px 2px;cursor:pointer';
        var _spOptR=['아스팔트','콘크리트','보도','사리도','석재','탄성포장재','투스콘','택지'];var selSurfR=state.tamsa?document.createElement('select'):null;if(selSurfR){selSurfR.innerHTML='<option value="">위치</option>'+['도로','보도','사리도'].map(function(o){return '<option'+((mh.surface===o)?' selected':'')+'>'+o+'</option>';}).join('');selSurfR.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;padding:1px 2px;cursor:pointer';}var selPaveR=state.tamsa?document.createElement('select'):null;if(selPaveR){selPaveR.innerHTML='<option value="">재질</option>'+_spOptR.map(function(o){return '<option'+((mh.pave===o)?' selected':'')+'>'+o+'</option>';}).join('');selPaveR.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;padding:1px 2px;cursor:pointer';}var _rr1=document.createElement('div');_rr1.style.cssText='display:flex;align-items:center;gap:3px';_rr1.appendChild(spFac);_rr1.appendChild(selLbl);_rr1.appendChild(inpR);_rr1.appendChild(selOwn);_rr1.appendChild(selSp);wrapR.appendChild(_rr1);if(selSurfR){var _rr2=document.createElement('div');_rr2.style.cssText='display:flex;align-items:center;gap:3px';_rr2.appendChild(selSurfR);_rr2.appendChild(selPaveR);wrapR.appendChild(_rr2);}
        document.body.appendChild(wrapR);_mhEditAnchor={wrap:wrapR,tx:txtLeft,ty:uly,dy:-36};
        var doneR=function(){if(wrapR.parentNode){pushHist();mh.label=(selLbl.value==='_c'?inpR.value.trim():selLbl.value)||'통신주입상';mh._own=selOwn.value;mh.spec=selSp.value;if(selSurfR){mh.surface=selSurfR.value;mh.pave=selPaveR.value;if(typeof tangoFill==='function')tangoFill();}mh._edited=true;if(mh.kind)delete mh.kind;try{if(typeof _tgSegs!=='undefined'&&_tgSegs){for(var _si=0;_si<_tgSegs.length;_si++){var _sg=_tgSegs[_si];if(!_sg.length)continue;var _s0=_sg[0],_se=_sg[_sg.length-1];var _k=tgManualKey(_sg);var _setR=function(pre){if(!state.tangoManual)state.tangoManual={};if(!state.tangoManual[_k])state.tangoManual[_k]={};state.tangoManual[_k][pre+'_fac']='입상점';state.tangoManual[_k][pre+'_own']=selOwn.value;state.tangoManual[_k][pre+'_spec']=selSp.value;state.tangoManual[_k][pre+'_nm']=inpR.value.trim();};if(_s0&&_s0.mh&&Math.abs(_s0.x-mh.wx)<0.5&&Math.abs(_s0.y-mh.wy)<0.5)_setR('s');if(_se&&_se.mh&&Math.abs(_se.x-mh.wx)<0.5&&Math.abs(_se.y-mh.wy)<0.5)_setR('e');}}if(typeof tangoSelSeg==='function'&&typeof tgSeg!=='undefined'&&tgSeg>=0)tangoSelSeg(tgSeg,true);}catch(_e){}_mhEditAnchor=null;wrapR.remove();drawManholes();}};
        var onKeyR=function(e){if(e.key==='Enter'||e.key==='Escape'){e.stopPropagation();doneR();}else e.stopPropagation();};
        inpR.addEventListener('keydown',onKeyR);
        var blurTimerR=null;function onBlurR(){blurTimerR=setTimeout(doneR,150);}function onFocusR(){if(blurTimerR){clearTimeout(blurTimerR);blurTimerR=null;}}
        [inpR,selLbl,selOwn,selSp].concat(selSurfR?[selSurfR,selPaveR]:[]).forEach(function(_el){_el.addEventListener('blur',onBlurR);_el.addEventListener('focus',onFocusR);});
        return;
      }
      // 현재 라벨 파싱: 앞부분 + M + (괄호안)
      var lab=mh.label||'';
      var pm=lab.match(/^(.*?)M\s*\(([^)]*)\)/);
      var pre=pm?pm[1].trim():'';
      var inner=pm?pm[2].trim():''; if(!mh._edited){var _cl=((state.bizInfo&&state.bizInfo.client)||'').trim(); if(_cl)inner=_cl;}
      // 자동순번 잔재 제거: 앞이 숫자뿐이고 캐리어가 기본(SK 또는 빈칸)이면 숫자 떼고 시작
      if(/^\d+$/.test(pre) && (inner==='SK'||inner===''))pre='';
      var wrap=document.createElement('div');
      wrap.style.cssText='position:fixed;z-index:999;display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:max-content;'
        +'left:'+sx+'px;top:'+(sy-36)+'px;background:#fffde7;border-bottom:2px solid #555;'
        +'padding:2px 5px;font-size:14px;font-weight:600;color:#333;border-radius:4px;';
      var inpPre=document.createElement('input');
      inpPre.value=pre; inpPre.placeholder=''; inpPre.maxLength=2;
      inpPre.style.cssText='font-size:14px;font-weight:600;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;width:28px;text-align:center;padding:1px 2px;';
      var spM=document.createElement('span');spM.textContent='M (';spM.style.margin='0 2px';
      var inpIn=document.createElement('input');
      inpIn.value=inner; inpIn.placeholder='SK';
      inpIn.style.cssText='font-size:14px;font-weight:600;color:#333;border:none;background:transparent;outline:none;width:52px;text-align:center;';
      var _selCss='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;padding:1px 2px;cursor:pointer';
      var selPre=document.createElement('select');selPre.innerHTML='<option value=""></option>'+[1,2,3,4,5,6,7,8,9,10].map(function(n){return '<option>'+n+'</option>';}).join('')+'<option value="_c">직접입력</option>';selPre.style.cssText=_selCss;
      var selIn=document.createElement('select');selIn.innerHTML='<option value=""></option>'+['SKT','SKB','LGU+','시청','세종','드림'].map(function(c){return '<option>'+c+'</option>';}).join('')+'<option value="_c">직접입력</option>';selIn.style.cssText=_selCss;
      if(/^([1-9]|10)$/.test(pre)){selPre.value=pre;inpPre.style.display='none';}else if(pre){selPre.value='_c';}else{inpPre.style.display='none';}
      if(['SKT','SKB','LGU+','시청','세종','드림'].indexOf(inner)>=0){selIn.value=inner;inpIn.style.display='none';}else if(inner){selIn.value='_c';}else{inpIn.style.display='none';}
      selPre.addEventListener('change',function(){inpPre.style.display=(selPre.value==='_c')?'':'none';if(selPre.value==='_c')inpPre.focus();});
      selIn.addEventListener('change',function(){inpIn.style.display=(selIn.value==='_c')?'':'none';if(selIn.value==='_c')inpIn.focus();});
      var spR=document.createElement('span');var selKind=document.createElement('select');selKind.innerHTML='<option value="신">신설</option><option value="기">기설</option>';selKind.value=(mh.kind==='기'?'기':'신');selKind.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;margin-right:4px;padding:1px 2px;cursor:pointer';
      spR.textContent=')';
      var selSpec=document.createElement('select');selSpec.innerHTML='<option value="">규격</option><option>인공1호</option><option>인공2호</option><option>인공3호</option><option>수공1호</option><option>수공2호</option><option>수공2-1호</option><option>SMC</option>'+((mh.spec&&['인공1호','인공2호','인공3호','수공1호','수공2호','수공2-1호','SMC'].indexOf(mh.spec)<0)?('<option>'+mh.spec+'</option>'):'')+'<option value="__cust">직접입력</option>';selSpec.value=mh.spec||'';selSpec.addEventListener('change',function(){if(this.value==='__cust'){var _c=prompt('규격 직접입력',(mh.spec||''));if(_c!=null&&_c.trim()!==''){_c=_c.trim();var _o=document.createElement('option');_o.text=_c;_o.value=_c;this.insertBefore(_o,this.lastChild);this.value=_c;}else{this.value=(mh.spec||'');}}});selSpec.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;margin-left:4px;padding:1px 2px;cursor:pointer';
      var _spOpt=['아스팔트','콘크리트','보도','사리도','석재','탄성포장재','투스콘','택지'];var selSurf=state.tamsa?document.createElement('select'):null;if(selSurf){selSurf.innerHTML='<option value="">위치</option>'+['도로','보도','사리도'].map(function(o){return '<option'+((mh.surface===o)?' selected':'')+'>'+o+'</option>';}).join('');selSurf.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;margin-left:4px;padding:1px 2px;cursor:pointer';}var selPave=state.tamsa?document.createElement('select'):null;if(selPave){selPave.innerHTML='<option value="">재질</option>'+_spOpt.map(function(o){return '<option'+((mh.pave===o)?' selected':'')+'>'+o+'</option>';}).join('');selPave.style.cssText='font-size:13px;font-weight:700;color:#333;border:1px solid #bbb;border-radius:4px;background:#fff;outline:none;margin-left:2px;padding:1px 2px;cursor:pointer';}var _r1=document.createElement('div');_r1.style.cssText='display:flex;align-items:center;gap:2px';_r1.appendChild(selKind);_r1.appendChild(selPre);_r1.appendChild(inpPre);_r1.appendChild(spM);_r1.appendChild(selIn);_r1.appendChild(inpIn);_r1.appendChild(spR);_r1.appendChild(selSpec);wrap.appendChild(_r1);if(selSurf){selSurf.style.marginLeft='0';var _r2=document.createElement('div');_r2.style.cssText='display:flex;align-items:center;gap:2px';_r2.appendChild(selSurf);_r2.appendChild(selPave);wrap.appendChild(_r2);}
      document.body.appendChild(wrap);_mhEditAnchor={wrap:wrap,tx:txtLeft,ty:uly,dy:-36};
      var done=function(){if(wrap.parentNode){
        pushHist();
        var p=(selPre.value==='_c'?inpPre.value.trim():selPre.value), v=(selIn.value==='_c'?inpIn.value.trim():selIn.value);
        mh.label=p+'M ('+v+(v?' ':'')+')';
        mh.kind=selKind.value;
        mh.spec=selSpec.value;if(selSurf){mh.surface=selSurf.value;mh.pave=selPave.value;if(typeof tangoFill==='function')tangoFill();}
        mh._edited=true; // 사용자가 직접 고침 → 자동정리 안 함
        try{if(typeof _tgSegs!=='undefined'&&_tgSegs){for(var _si=0;_si<_tgSegs.length;_si++){var _sg=_tgSegs[_si];if(!_sg.length)continue;var _s0=_sg[0],_se=_sg[_sg.length-1];var _k=tgManualKey(_sg);var _setP=function(pre){if(!state.tangoManual)state.tangoManual={};if(!state.tangoManual[_k])state.tangoManual[_k]={};state.tangoManual[_k][pre+'_fac']=(mh.kind==='기'?'기설_맨홀':'신설_맨홀');state.tangoManual[_k][pre+'_own']=v;state.tangoManual[_k][pre+'_spec']=(mh.spec||'');state.tangoManual[_k][pre+'_nm']=(p+'M');};if(_s0&&_s0.mh&&Math.abs(_s0.x-mh.wx)<0.5&&Math.abs(_s0.y-mh.wy)<0.5)_setP('s');if(_se&&_se.mh&&Math.abs(_se.x-mh.wx)<0.5&&Math.abs(_se.y-mh.wy)<0.5)_setP('e');}}if(typeof tangoSelSeg==='function'&&typeof tgSeg!=='undefined'&&tgSeg>=0)tangoSelSeg(tgSeg,true);}catch(_e){}_mhEditAnchor=null;wrap.remove();drawManholes();}};
      var onKey=function(e){if(e.key==='Enter'||e.key==='Escape'){e.stopPropagation();done();}else e.stopPropagation();};
      inpPre.addEventListener('keydown',onKey);inpIn.addEventListener('keydown',onKey);
      // 두 입력칸 모두에서 포커스 빠지면 done (단, 서로 이동 시는 유지)
      var blurTimer=null;
      function onBlur(){blurTimer=setTimeout(done,120);}
      function onFocus(){if(blurTimer){clearTimeout(blurTimer);blurTimer=null;}}
      inpPre.addEventListener('blur',onBlur);inpIn.addEventListener('blur',onBlur);
      inpPre.addEventListener('focus',onFocus);inpIn.addEventListener('focus',onFocus);
      selKind.addEventListener('focus',onFocus);selKind.addEventListener('blur',onBlur);[selPre,selIn].forEach(function(_e){_e.addEventListener('focus',onFocus);_e.addEventListener('blur',onBlur);});selSpec.addEventListener('focus',onFocus);selSpec.addEventListener('blur',onBlur);if(selSurf){[selSurf,selPave].forEach(function(_e){_e.addEventListener('focus',onFocus);_e.addEventListener('blur',onBlur);});}
    }

    // 라벨 텍스트 — 파란 밑줄 중앙 바로 위에 (글자가 밑줄을 덮지 않게 위로)
    var mhLbl=mkLabel(txtCx, uly-EM*0.95, mhDisp(mh), {fill:(mh._fromCsv&&isRiser?'#d500f2':MHC),weight:'600',anchor:'middle',grp:(isRiser?'riser':'mh'),px:11});
    // 라벨 div에 직접 더블클릭(수정) — 오버레이라 글자 위에서 바로 동작
    mhLbl.style.pointerEvents='auto';
    mhLbl.style.cursor='text';mhLbl.style.userSelect='none';mhLbl.style.webkitUserSelect='none';mhLbl.style.webkitTouchCallout='none';(function(){var _mLp=null,_mX=0,_mY=0;mhLbl.addEventListener('pointerdown',function(ev){if(mode!=='pan')return;_mX=ev.clientX;_mY=ev.clientY;if(_mLp)clearTimeout(_mLp);_mLp=setTimeout(function(){_mLp=null;openLabelEdit();},600);});mhLbl.addEventListener('pointermove',function(ev){if(_mLp&&(Math.abs(ev.clientX-_mX)+Math.abs(ev.clientY-_mY)>8)){clearTimeout(_mLp);_mLp=null;}});mhLbl.addEventListener('pointerup',function(){if(_mLp){clearTimeout(_mLp);_mLp=null;}});mhLbl.addEventListener('pointercancel',function(){if(_mLp){clearTimeout(_mLp);_mLp=null;}});})();
    mhLbl.addEventListener('dblclick',function(ev){ev.stopPropagation();if(mode==='delmh'||mode==='delriser')return;if(typeof tgSelectMh==='function'&&mh&&mh.wx!=null)tgSelectMh(mh.wx,mh.wy);openLabelEdit();});

    // 드래그 핸들 - 맨홀 중심(이중원) — 히트영역 작게(측점 클릭 안 막게)
    var drag=el('circle',{cx:mx,cy:my,r:13*U,fill:'transparent','pointer-events':'all',cursor:'move'});
    drag.addEventListener('pointerdown',function(ev){if(mode==='pan'){_mhLpX=ev.clientX;_mhLpY=ev.clientY;if(_mhLp)clearTimeout(_mhLp);_mhLp=setTimeout(function(){_mhLp=null;openLabelEdit();},1000);}
      if((mode==='delmh'&&!isRiser)||(mode==='delriser'&&isRiser)||mode==='delall2'){ev.stopPropagation();ev.preventDefault();pushHist();
        var idx=state.manholes.indexOf(mh);if(idx>=0)state.manholes.splice(idx,1);if(!isRiser)removeManholePassLines(mh);redrawAll();toast(isRiser?'입상주 삭제':'맨홀 삭제(통과결선 포함)');return;}
      if(mode!=='pan'&&mode!=='mhplace'&&mode!=='riserplace'||viewerMode||readOnly)return;
      ev.stopPropagation();ev.preventDefault();
      if(typeof _tgMode==='function'&&_tgMode()){var _nowMh=Date.now();if(_nowMh-(mh._lastMhClick||0)<350){mh._lastMhClick=0;openLabelEdit();return;}mh._lastMhClick=_nowMh;if(typeof tgSelectMh==='function')tgSelectMh(mh.wx,mh.wy);if(typeof drawGeo==='function')drawGeo();return;}
      if(mh._aft||state.tamsa){toast(state.tamsa?'탐사 측량 — CSV 점 고정(이동 불가)':'후측량 맨홀 — 위치 고정(라벨만 이동 가능)');return;}
      pushHist();
      if(mh.lx==null){mh.lx=lx;mh.ly=ly;}
      var w=toWorld(ev.clientX,ev.clientY);
      mhDragState={type:'center',mh:mh,gx:w[0]-mh.wx,gy:(-w[1])-mh.wy};});
    drag.addEventListener('dblclick',function(ev){ev.stopPropagation();openLabelEdit();});
    gMH.appendChild(drag);

    // 라벨 드래그 핸들 (밑줄+글자 영역)
    var lbDrag=el('rect',{x:txtLeft-EM*0.5,y:uly-EM*1.7,width:Math.max(underLen,labelW)+EM*1.0,height:EM*2.3,rx:EM*0.1,fill:'transparent','pointer-events':'all',cursor:'move'});
    lbDrag.addEventListener('pointerdown',function(ev){if(mode==='pan'){_mhLpX=ev.clientX;_mhLpY=ev.clientY;if(_mhLp)clearTimeout(_mhLp);_mhLp=setTimeout(function(){_mhLp=null;openLabelEdit();},1000);}
      if((mode==='delmh'&&!isRiser)||(mode==='delriser'&&isRiser)||mode==='delall2'){ev.stopPropagation();ev.preventDefault();
        var idx=state.manholes.indexOf(mh);if(idx>=0)state.manholes.splice(idx,1);if(!isRiser)removeManholePassLines(mh);redrawAll();toast(isRiser?'입상주 삭제':'맨홀 삭제(통과결선 포함)');return;}
      if(mode!=='pan'&&mode!=='mhplace'&&mode!=='riserplace'||viewerMode||readOnly)return;
      ev.stopPropagation();ev.preventDefault();
      if(mh.lx==null){mh.lx=lx;mh.ly=ly;}
      var w=toWorld(ev.clientX,ev.clientY);
      mhDragState={type:'label',mh:mh,gx:w[0]-mh.lx,gy:(-w[1])-mh.ly};});
    lbDrag.addEventListener('dblclick',function(ev){ev.stopPropagation();openLabelEdit();});
    gMH.appendChild(lbDrag);

    // 지우기 모드 hover 빨간 표시
    drag.addEventListener('mouseenter',function(){if(!((mode==='delmh'&&!isRiser)||(mode==='delriser'&&isRiser)||mode==='delall2'))return;drag.setAttribute('stroke','#d32f2f');drag.setAttribute('stroke-width',2);drag.setAttribute('vector-effect','non-scaling-stroke');drag.setAttribute('fill','rgba(211,47,47,0.25)');});
    drag.addEventListener('mouseleave',function(){drag.setAttribute('stroke','none');drag.setAttribute('fill','transparent');});
    lbDrag.addEventListener('mouseenter',function(){if(!((mode==='delmh'&&!isRiser)||(mode==='delriser'&&isRiser)||mode==='delall2'))return;lbDrag.setAttribute('stroke','#d32f2f');lbDrag.setAttribute('stroke-width',1.5);lbDrag.setAttribute('vector-effect','non-scaling-stroke');lbDrag.setAttribute('fill','rgba(211,47,47,0.15)');});
    lbDrag.addEventListener('mouseleave',function(){lbDrag.setAttribute('stroke','none');lbDrag.setAttribute('fill','transparent');});
  });
}
var mhDragState=null; // {type:'center'|'label', mh, gx, gy}
var _mhLp=null,_mhLpX=0,_mhLpY=0;
window.addEventListener('pointermove',function(ev){
  if(_mhLp&&(Math.abs(ev.clientX-_mhLpX)+Math.abs(ev.clientY-_mhLpY)>8)){clearTimeout(_mhLp);_mhLp=null;}if(!mhDragState)return;ev.preventDefault();
  var w=toWorld(ev.clientX,ev.clientY), mh=mhDragState.mh;
  var wx=w[0], wy=-w[1]; // world (x=동, y=북)
  if(mhDragState.type==='center'){
    var newWx=wx-mhDragState.gx, newWy=wy-mhDragState.gy;
    var oldWx=mh.wx, oldWy=mh.wy;
    // 이 맨홀을 통과하는 관로선의 맨홀좌표점도 같이 이동 (결선이 맨홀 중심에 붙어 따라옴)
    state.lines.forEach(function(L){if(L.layer!=='통신관로'||!L.pts)return;L.pts.forEach(function(p){if(Math.abs(p[0]-oldWx)<1e-4&&Math.abs(p[1]-oldWy)<1e-4){p[0]=newWx;p[1]=newWy;}});});
    // 라벨도 같이 이동 (상대위치 유지)
    if(mh.lx!=null){mh.lx+=newWx-mh.wx;mh.ly+=newWy-mh.wy;}
    mh.wx=newWx;mh.wy=newWy;
    drawManholes();drawGeo();
  } else {
    mh.lx=wx-mhDragState.gx; mh.ly=wy-mhDragState.gy; mh._edited=true;
    drawManholes();
  }
});
window.addEventListener('pointerup',function(ev){
  if(_mhLp){clearTimeout(_mhLp);_mhLp=null;}if(!mhDragState)return;mhDragState=null;drawManholes();drawGeo();
});
var mhIdSeq=1;
function placeManholeAt(wx,wy,type){
  pushHist();
  // 팝업 없이 기본라벨로 바로 심기, 더블클릭으로 수정
  var label=(type==='riser')?'통신주입상':'M (SK )';
  var mh={id:mhIdSeq++, wx:wx, wy:wy, label:label, lx:null, ly:null, type:type||'mh'};
  state.manholes.push(mh);
  if(type!=='riser')addManholePassLine(mh); // 맨홀 통과 결선을 결선 데이터에 추가
  drawGeo();drawManholes();
  toast('맨홀 심기 완료 — 더블클릭으로 라벨 수정, Enter/Space로 종료');
  // 모드 유지 (계속 찍을 수 있게)
}
// ★ CSV의 전주(TJ/EJ) 측점 → 같은 코드 가장 가까운 2점 짝 → 중점에 입상주 자동생성(BUILD516). TJ=통신주입상/EJ=한전주입상. 원래 2점은 남김(자동결선만 제외)
function buildRisersFromCsv(){
  var arr=(typeof finalCsvArr==='function')?finalCsvArr():[];
  var rows=[];
  arr.forEach(function(it){var rs;try{rs=parseInspCsv(it.text||'');}catch(e){rs=[];}rs.forEach(function(p){if(p.skip)return;var c=(p.code||'').trim();if(/^(TJ|EJ)/i.test(c))rows.push({x:p.ex,y:p.no,no:p.name||'',code:c.toUpperCase(),surface:p.surface||'',pave:p.pave||''});});});
  if(!rows.length)return 0;
  if(state.tamsa)state.points.forEach(function(p){if(/^(TJ|EJ)/i.test((p.code||'').trim()))p._hideMark=true;});
  state.manholes=(state.manholes||[]).filter(function(m){return !m._fromCsv;});
  state.points=(state.points||[]).filter(function(p){return !p._riserPt;});
  state.lines=(state.lines||[]).filter(function(l){return !l._riserLine;});
  var byCode={};
  rows.forEach(function(p){(byCode[p.code]=byCode[p.code]||[]).push(p);});
  var made=0;
  for(var code in byCode){
    var a2=byCode[code].slice(),used={};
    for(var i=0;i<a2.length;i++){
      if(used[i])continue;
      var best=-1,bd=1e9;
      for(var j=i+1;j<a2.length;j++){
        if(used[j])continue;
        var d=Math.hypot(a2[i].x-a2[j].x,a2[i].y-a2[j].y);
        if(d<bd){bd=d;best=j;}
      }
      if(best<0)continue;
      used[i]=used[best]=1;
      [a2[i],a2[best]].forEach(function(rp){state.points.push({no:rp.no,x:rp.x,y:rp.y,z:null,code:rp.code,_riserPt:true,_hideMark:!!state.tamsa});});
      
      var mx=(a2[i].x+a2[best].x)/2,my=(a2[i].y+a2[best].y)/2;
      state.manholes=(state.manholes||[]).filter(function(m){return !(m.type==='riser'&&Math.hypot((m.wx||0)-mx,(m.wy||0)-my)<2);});
      var isEJ=/^EJ/i.test(code);
      state.manholes.push({id:mhIdSeq++,wx:mx,wy:my,label:isEJ?'한전주입상':'통신주입상',lx:null,ly:null,type:'riser',_fromCsv:true,surface:(a2[i].surface||a2[best].surface||''),pave:(a2[i].pave||a2[best].pave||'')});
      made++;
    }
  }
  return made;
}
// 측점삽입: 다음 측점번호 자동 채번(기존 prefix 이어서 +1)
function nextPtNo(){
  var prefix='', maxN=0;
  (state.points||[]).forEach(function(p){var m=/^(.*)-(\d+)$/.exec(p.no||'');if(m){prefix=m[1];var n=+m[2];if(n>maxN)maxN=n;}});
  if(!prefix){var d=new Date();prefix=(''+d.getFullYear()).slice(2)+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2);}
  return prefix+'-'+(maxN+1);
}
// 측점삽입: 클릭 위치에 측점 생성 + 번호·코드 입력창 자동 오픈
function insertPointAt(wx,wy){
  pushHist();
  var last=(state.points||[])[state.points.length-1];
  var dc=(last&&last.code)?last.code.replace(/^\s*M\s*/i,''):'FC 100x2'; // 기본코드 M 제거(삽입측점이 M측점으로 잡히지 않게)
  var p={no:nextPtNo(), x:wx, y:wy, z:null, code:dc};
  state.points.push(p);
  drawGeo();updMeta();
  openPtEdit(p, S(p.x,p.y)); // 바로 번호·코드 입력
  toast('측점 생성 — 번호·코드 입력 후 Enter (측점삽입 계속하려면 버튼 다시 클릭)');
}
// 측점 삭제: 측점 + 거기 붙은 결선/지거/압입 정리(백판은 유지)
function deletePoint(p){
  var i=(state.points||[]).indexOf(p); if(i<0)return;
  pushHist();
  state.points.splice(i,1);
  var app={'통신관로':1,'지거':1,'압입구간':1,'주입상인출선':1};
  state.lines=(state.lines||[]).filter(function(l){
    if(!app[l.layer])return true;
    return !l.pts.some(function(v){return Math.hypot(v[0]-p.x,v[1]-p.y)<0.3;});
  });
  if(selNum===p.no)selNum=null;
  redrawAll();updMeta();
  toast('측점 '+(p.no||'')+' 삭제');
}
// 맨홀 통과 결선 1개 추가 (반경 안 가장 가까운 M점 + 건너편 M점 → A·맨홀·B)
function moveMhLines(mh,ox,oy){(state.lines||[]).forEach(function(L){if(!L.pts)return;L.pts.forEach(function(pt){if((L.mhId===mh.id||L.layer==='통신관로')&&Math.abs(pt[0]-ox)<1&&Math.abs(pt[1]-oy)<1){pt[0]=mh.wx;pt[1]=mh.wy;}});});}
function addManholePassLine(mh){
  var MHR=4; // 맨홀·입상주 M점 관로선붙이기 반경(4m)
  var nr=state.points.filter(function(p){return isManhole(p)&&Math.hypot(p.x-mh.wx,p.y-mh.wy)<=MHR;})
                     .map(function(p){return {p:p,d:Math.hypot(p.x-mh.wx,p.y-mh.wy)};}).sort(function(a,b){return a.d-b.d;});
  if(!nr.length)return;
  var A=nr[0].p, B=null, ax=A.x-mh.wx, ay=A.y-mh.wy;
  for(var i=1;i<nr.length;i++){var q=nr[i].p;if((q.x-mh.wx)*ax+(q.y-mh.wy)*ay<0){B=q;break;}}
  if(B)state.lines.push({layer:'통신관로',pts:[[A.x,A.y],[mh.wx,mh.wy],[B.x,B.y]],mhId:mh.id});
  else state.lines.push({layer:'통신관로',pts:[[A.x,A.y],[mh.wx,mh.wy]],mhId:mh.id});
}
// 후측량 맨홀: 양옆 진짜 가까운 관로점(앞·뒤,반대방향)에 재결선 — 바로앞점 건너뛰기 방지
function restitchManhole(mh){
  if(!mh||mh.type==='riser')return;
  var MHR=5,T=0.35;
  function nearp(pt,X,Y){return Math.hypot(pt[0]-X,pt[1]-Y)<T;}
  var cand=(state.points||[]).filter(function(p){
    if(isManhole(p))return false;
    if(/보강판/.test((p.no||'')+'|'+(p.code||'')))return false;
    if(!/[xX\u00D7]\s*\d+/.test(p.code||''))return false;
    return Math.hypot(p.x-mh.wx,p.y-mh.wy)<=MHR;
  }).map(function(p){return {p:p,d:Math.hypot(p.x-mh.wx,p.y-mh.wy)};}).sort(function(a,b){return a.d-b.d;});
  if(!cand.length)return;
  var A=cand[0].p, B=null, ax=A.x-mh.wx, ay=A.y-mh.wy;
  for(var i=1;i<cand.length;i++){var q=cand[i].p;if((q.x-mh.wx)*ax+(q.y-mh.wy)*ay<0){B=q;break;}}
  (state.lines||[]).forEach(function(L){
    if(L.layer!=='\ud1b5\uc2e0\uad00\ub85c'||!L.pts)return;
    var np=[];L.pts.forEach(function(v){if(!np.length||Math.hypot(np[np.length-1][0]-v[0],np[np.length-1][1]-v[1])>1e-6)np.push([v[0],v[1]]);});L.pts=np;
    for(var k=0;k<L.pts.length;k++){
      if(!nearp(L.pts[k],mh.wx,mh.wy))continue;
      var nb=(k>0)?L.pts[k-1]:((k<L.pts.length-1)?L.pts[k+1]:null);
      if(!nb)continue;
      if(nearp(nb,A.x,A.y)||(B&&nearp(nb,B.x,B.y)))continue;
      var side=(nb[0]-mh.wx)*ax+(nb[1]-mh.wy)*ay;
      var tgt=(side>0||!B)?A:B;
      L.pts[k][0]=tgt.x;L.pts[k][1]=tgt.y;
    }
  });
  function hasSeg(P){return (state.lines||[]).some(function(L){if(L.layer!=='\ud1b5\uc2e0\uad00\ub85c'||!L.pts)return false;for(var k=0;k<L.pts.length-1;k++){var a=L.pts[k],b=L.pts[k+1];if((nearp(a,P.x,P.y)&&nearp(b,mh.wx,mh.wy))||(nearp(b,P.x,P.y)&&nearp(a,mh.wx,mh.wy)))return true;}return false;});}
  if(!hasSeg(A))state.lines.push({layer:'\ud1b5\uc2e0\uad00\ub85c',pts:[[A.x,A.y],[mh.wx,mh.wy]],mhId:mh.id});
  if(B&&!hasSeg(B))state.lines.push({layer:'\ud1b5\uc2e0\uad00\ub85c',pts:[[B.x,B.y],[mh.wx,mh.wy]],mhId:mh.id});
}
// 맨홀 삭제 시 그 맨홀을 지나는 통신관로 결선도 함께 제거 (맨홀좌표 포함 선)
function removeManholePassLines(mh){
  state.lines=state.lines.filter(function(L){
    if(L.layer!=='통신관로'||!L.pts)return true;
    return !L.pts.some(function(pt){return Math.abs(pt[0]-mh.wx)<1e-4&&Math.abs(pt[1]-mh.wy)<1e-4;});
  });
}

function drawMarks(){ clearSvg(gMark); clearLabels('mk');
  state.markups.forEach(function(m){
    var insp=(m.near==='관공수'||m.near==='중복'||m.near==='끝점'); // 검수 오류 서클(자동검출)
    var sh=m.type==='cir'?el('ellipse',{cx:m.cx,cy:m.cy,rx:m.rx,ry:m.ry}):el('rect',{x:m.x,y:m.y,width:m.w,height:m.h,rx:0.4});
    var fillCol=m.soft?'#ffb74d':(insp?'#f4c400':(m.near==='특이사항'?'#87ceeb':MKCOL[m.status])); var strokeCol=m.soft?'#f57c00':(m.near==='특이사항'?'#1565c0':MKCOL[m.status]);
    sh.setAttribute('fill',fillCol);sh.setAttribute('fill-opacity',insp?0.25:(m.near==='특이사항'?0.32:0.13));sh.setAttribute('stroke',strokeCol);sh.setAttribute('stroke-width',m.near==='특이사항'?3.2:2);sh.setAttribute('vector-effect','non-scaling-stroke');sh.setAttribute('pointer-events','none');
    gMark.appendChild(sh); m.el=sh;
    if(m.seg){var ln=el('line',{x1:m.seg[0][0],y1:m.seg[0][1],x2:m.seg[1][0],y2:m.seg[1][1],stroke:'#16a34a','stroke-width':2.6,'stroke-dasharray':'6 4','stroke-linecap':'butt','vector-effect':'non-scaling-stroke','pointer-events':'none'});gMark.appendChild(ln);} // 20m 초과 구간 = 초록 점선
    if(m.num!=null&&m.num!=='')mkLabel(m.cx, m.cy, String(m.num), {fill:m.soft?'#f57c00':'#c0392b',weight:'800',anchor:'middle',grp:'mk',px:15}); // 오류 번호(써클 중앙) — 써클 지우면 같이 사라짐
    if(m.near==='중복'&&m.cnt){mkLabel(m.cx, m.cy-(m.ry||0.7)-0.35, m.cnt+'선', {fill:'#d32f2f',weight:'700',anchor:'middle',grp:'mk',px:14});}
    if(m.near==='특이사항'&&m.note){var _pd=(typeof nearestPipeDir==='function'&&nearestPipeDir(m.cx,m.cy,999))||[0,1,0];var _off=(m.rx||1.4)+0.9;var _tx=m.cx+_pd[0]*_off, _ty=m.cy+_pd[1]*_off;var _anc=_pd[0]>=0?'start':'end';mkLabel(_tx, _ty, m.note, {fill:'#d32f2f',weight:'800',anchor:_anc,grp:'mk',px:Math.max(14,Math.min(28,1.2/((typeof pxToWorld==='function'&&pxToWorld())||0.06)))});}
  });
  renderRecs();
}
function renderRecs(){var box=document.getElementById('recs');document.getElementById('recCount').textContent=state.markups.length;
  if(!state.markups.length){box.innerHTML='<div class="empty">표시 없음</div>';return;}
  box.innerHTML=state.markups.map(function(r,i){
    return '<div class="rec"><span class="dot '+(r.type==='cir'?'cir':'box')+'" style="background:'+MKCOL[r.status]+'"></span>'
      +'<span style="color:#6b6b66">'+(i+1)+'</span><span>'+(r.type==='cir'?'써클':'박스')+'</span>'
      +'<span style="color:'+MKCOL[r.status]+'">· '+(r.status==='ok'?'확인':'이상')+'</span>'
      +'<span style="margin-left:auto;color:#6b6b66;margin-right:6px">'+(r.near||'-')+'</span>'
      +'<button class="del" data-i="'+i+'">✕</button></div>';
  }).join('');
}
function updMeta(){document.getElementById('meta').textContent=(state.projectName||'현장 미선택')+' · 측량점 '+state.points.length+' · 결선 '+state.lines.filter(function(l){return l.layer==='통신관로';}).length;}

/* ====== 뷰박스 ====== */
var vb={x:0,y:0,w:100,h:100}, vb0={x:0,y:0,w:100,h:100}, _vbwLast=null;
var _bpPathEl=null,_bpPad=null,_bpImgURL=null,_bpImgBox=null,_bpSig=null;
var _mhEditAnchor=null;
function _updateMhEditPos(){if(!_mhEditAnchor||!_mhEditAnchor.wrap||!_mhEditAnchor.wrap.parentNode){_mhEditAnchor=null;return;}var _cv=document.getElementById('cv');if(!_cv)return;var _r=_cv.getBoundingClientRect();var _sx=_r.left+(_mhEditAnchor.tx-vb.x)*(_r.width/vb.w);var _sy=_r.top+(_mhEditAnchor.ty-vb.y)*(_r.height/vb.h);_mhEditAnchor.wrap.style.left=_sx+'px';_mhEditAnchor.wrap.style.top=(_sy+_mhEditAnchor.dy)+'px';}
function applyVB(){cv.setAttribute('viewBox',vb.x+' '+vb.y+' '+vb.w+' '+vb.h);repositionLabels();if(bgMapOn)syncMapBg();_updateMhEditPos();}
// ★ 백판(수치지도) 화면영역 컬링 렌더 (BUILD509) — 화면보다 넓은 여유영역에 걸치는 백판만 통합 path로
function bpSignature(){var n=0,fx=0,fy=0;(state.lines||[]).forEach(function(L){if(LINECOL[L.layer]||L.crop||!L.pts||!L.pts.length)return;n++;fx+=L.pts[0][0];fy+=L.pts[0][1];});return n+':'+fx.toFixed(0)+':'+fy.toFixed(0)+':'+(bpOff?'off':'on');}
function bakeBackdrop(){
  var minx=1e18,miny=1e18,maxx=-1e18,maxy=-1e18,has=false;
  (state.lines||[]).forEach(function(L){if(LINECOL[L.layer]||L.crop||!L.pts||!L.pts.length)return;has=true;for(var i=0;i<L.pts.length;i++){var x=L.pts[i][0],y=L.pts[i][1];if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;}});
  if(!has||maxx<=minx||maxy<=miny){_bpImgURL=null;_bpImgBox=null;return;}
  var ww=maxx-minx,hh=maxy-miny,diag=Math.max(ww,hh);
  var pxPerWorld=2048/diag;   // 긴 변 2048px (끊김 방지 우선, 줄 중 재그림 없음)
  var cw=Math.max(1,Math.round(ww*pxPerWorld)),ch=Math.max(1,Math.round(hh*pxPerWorld));
  var cap=8192;if(cw>cap||ch>cap){var k=cap/Math.max(cw,ch);cw=Math.max(1,Math.round(cw*k));ch=Math.max(1,Math.round(ch*k));pxPerWorld*=k;}
  var cvs=document.createElement('canvas');cvs.width=cw;cvs.height=ch;
  var ctx=cvs.getContext('2d');if(!ctx){_bpImgURL=null;_bpImgBox=null;return;}
  ctx.strokeStyle='#bbb';ctx.lineWidth=Math.max(1,pxPerWorld*0.1);ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  (state.lines||[]).forEach(function(L){if(LINECOL[L.layer]||L.crop||!L.pts||!L.pts.length)return;for(var i=0;i<L.pts.length;i++){var px=(L.pts[i][0]-minx)*pxPerWorld,py=(maxy-L.pts[i][1])*pxPerWorld;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}});
  ctx.stroke();
  try{_bpImgURL=cvs.toDataURL('image/png');_bpImgBox={minx:minx,miny:miny,maxx:maxx,maxy:maxy};}catch(e){_bpImgURL=null;_bpImgBox=null;}
}
// ★ 백판은 고해상도 이미지로 구워 SVG image로 배치(BUILD510). 줌/팬은 viewBox만 변환→가벼움. 좌표(state.lines)는 보존(DXF·수선의발 계산용)
function drawBackdrop(){
  if(typeof gGeo==='undefined'||!gGeo)return;
  if(bpOff)return;
  var sig=bpSignature();
  if(sig!==_bpSig||!_bpImgURL){bakeBackdrop();_bpSig=sig;}
  if(!_bpImgURL||!_bpImgBox)return;
  var b=_bpImgBox;
  var im=el('image',{x:b.minx,y:-b.maxy,width:(b.maxx-b.minx),height:(b.maxy-b.miny),preserveAspectRatio:'none','pointer-events':'none'});
  try{im.setAttributeNS('http://www.w3.org/1999/xlink','href',_bpImgURL);}catch(e){}
  im.setAttribute('href',_bpImgURL);
  gGeo.insertBefore(im,gGeo.firstChild);
}
function fixAspect(){var r=cv.getBoundingClientRect();if(r.width<1||r.height<1)return;var car=r.width/r.height,cx=vb.x+vb.w/2,cy=vb.y+vb.h/2;if(vb.w/vb.h<car)vb.w=vb.h*car;else vb.h=vb.w/car;vb.x=cx-vb.w/2;vb.y=cy-vb.h/2;}
function fitSoon(){var n=0;(function go(){var done=false;try{var r=cv.getBoundingClientRect();if(r.width>=1&&r.height>=1){fitView();requestAnimationFrame(function(){if(typeof drawGeo==='function')drawGeo();});done=true;}}catch(e){}if(!done&&n++<50)requestAnimationFrame(go);})();}
function fitView(){
  var xs=[],ys=[];function add(x,y){if(!isFinite(x)||!isFinite(y))return;var s=S(x,y);xs.push(s[0]);ys.push(s[1]);}
  state.points.forEach(function(p){add(p.x,p.y);});
  state.lines.forEach(function(L){L.pts.forEach(function(p){add(p[0],p[1]);});});if(state.gpsPts){var _haveF={};(state.points||[]).forEach(function(p){_haveF[p.no]=1;});var _nsF2=state.nightShift,_cutF2=(_nsF2&&_nsF2.on)?_nsF2.cut:null;state.gpsPts.forEach(function(g){var _wnoF2=g.no;if(g._d0!=null&&g._nm!=null){var _dtF2=g._d0;if(_cutF2!=null&&g._tm!=null&&g._tm<_cutF2)_dtF2=prevDayYMD(g._d0);_wnoF2=_dtF2+'-'+g._nm;}if(_haveF[g.no]||_haveF[_wnoF2])return;add(g.x,g.y);});}
  if(!xs.length){vb={x:0,y:0,w:100,h:100};vb0={x:0,y:0,w:100,h:100};applyVB();return;}
  var pad=5,minx=Math.min.apply(0,xs),maxx=Math.max.apply(0,xs),miny=Math.min.apply(0,ys),maxy=Math.max.apply(0,ys);
  vb0={x:minx-pad,y:miny-pad,w:(maxx-minx)+2*pad,h:(maxy-miny)+2*pad};
  vb={x:vb0.x,y:vb0.y,w:vb0.w,h:vb0.h};fixAspect();applyVB();drawGeo();drawManholes();highlightSel();
}
function tgFitAll(){var cv=document.getElementById('cv');if(cv){try{var bb=(function(){var xs=[],ys=[];(state.points||[]).forEach(function(p){if(p&&isFinite(p.x)&&isFinite(p.y)){var s=S(p.x,p.y);xs.push(s[0]);ys.push(s[1]);}});(state.lines||[]).forEach(function(L){(L.pts||[]).forEach(function(pt){if(pt&&isFinite(pt[0])&&isFinite(pt[1])){var s=S(pt[0],pt[1]);xs.push(s[0]);ys.push(s[1]);}});});if(xs.length>1){var mnx=Math.min.apply(0,xs),mxx=Math.max.apply(0,xs),mny=Math.min.apply(0,ys),mxy=Math.max.apply(0,ys);return {x:mnx,y:mny,width:Math.max(1,mxx-mnx),height:Math.max(1,mxy-mny)};}return cv.getBBox();})();if(bb&&bb.width>1&&bb.height>1){var pad=Math.max(bb.width,bb.height)*0.04;vb0={x:bb.x-pad,y:bb.y-pad,w:bb.width+2*pad,h:bb.height+2*pad};vb={x:vb0.x,y:vb0.y,w:vb0.w,h:vb0.h};if(typeof fixAspect==='function')fixAspect();if(typeof applyVB==='function')applyVB();if(typeof drawGeo==='function')drawGeo();if(typeof drawManholes==='function')drawManholes();if(typeof highlightSel==='function')highlightSel();return;}}catch(e){}}if(typeof fitView==='function')fitView();}
function tangoFitSeg(nodes){if(!nodes||!nodes.length){if(typeof fitView==='function')fitView();return;}var xs=[],ys=[];nodes.forEach(function(n){var s=S(n.x,n.y);xs.push(s[0]);ys.push(s[1]);});var pad=8,minx=Math.min.apply(0,xs),maxx=Math.max.apply(0,xs),miny=Math.min.apply(0,ys),maxy=Math.max.apply(0,ys);vb0={x:minx-pad,y:miny-pad,w:(maxx-minx)+2*pad,h:(maxy-miny)+2*pad};vb={x:vb0.x,y:vb0.y,w:vb0.w,h:vb0.h};if(typeof fixAspect==='function')fixAspect();if(typeof applyVB==='function')applyVB();if(typeof drawGeo==='function')drawGeo();if(typeof drawManholes==='function')drawManholes();if(typeof highlightSel==='function')highlightSel();}
var _tgVB={};function tgBindMini(){var sv=document.getElementById('tgMiniSvg');if(!sv)return;sv.style.cursor='grab';sv.onwheel=function(e){e.preventDefault();var r=sv.getBoundingClientRect();var fx=(e.clientX-r.left)/r.width,fy=(e.clientY-r.top)/r.height;var mx=_tgVB.x+fx*_tgVB.w,my=_tgVB.y+fy*_tgVB.h;var k=e.deltaY>0?1.12:0.89;_tgVB.w*=k;_tgVB.h*=k;_tgVB.x=mx-fx*_tgVB.w;_tgVB.y=my-fy*_tgVB.h;sv.setAttribute('viewBox',_tgVB.x+' '+_tgVB.y+' '+_tgVB.w+' '+_tgVB.h);};var pan=false,px=0,py=0;sv.onpointerdown=function(e){pan=true;px=e.clientX;py=e.clientY;try{sv.setPointerCapture(e.pointerId);}catch(_){}sv.style.cursor='grabbing';};sv.onpointermove=function(e){if(!pan)return;var r=sv.getBoundingClientRect();_tgVB.x-=(e.clientX-px)/r.width*_tgVB.w;_tgVB.y-=(e.clientY-py)/r.height*_tgVB.h;px=e.clientX;py=e.clientY;sv.setAttribute('viewBox',_tgVB.x+' '+_tgVB.y+' '+_tgVB.w+' '+_tgVB.h);};sv.onpointerup=function(e){pan=false;sv.style.cursor='grab';};}
function tgLayerBox(){var defs=[['no','\uC810\uBC88\uD638'],['code','\uAD00\uC815\uBCF4'],['depth','\uC2EC\uB3C4'],['date','\uB0A0\uC9DC'],['mh','\uB9E8\uD640 \uC815\uBCF4'],['riser','\uC785\uC0C1\uC8FC'],['bp','\uBCF4\uAC15\uD310 \uCE21\uC810'],['bpbox','\uBCF4\uAC15\uD310 \uBC15\uC2A4'],['hyun','\uD604\uD669 \uCE21\uB7C9(\uB3C4\uB85C)'],['roadzone','\uB3C4\uB85C\uBA74'],['photoDir','\uC0AC\uC9C4\uBC29\uD5A5'],['depthchk','\uAE30\uC900\uC2EC\uB3C4\uBBF8\uB2EC'],['surfacedot','\uB3C4\uB85C/\uBCF4\uB3C4\uC810'],['selbox','\uC120\uD0DD \uD45C\uC2DC'],['tagbox','\uD0DC\uADF8 \uC774\uB3D9 \uBC94\uC704']];defs.push(['tgseg','\uAD6C\uAC04 \uC0C9\uCE60']);if(typeof IS_TANGO!=='undefined'&&IS_TANGO){defs.push(['tgcmp','\uC6D0\uBCF8 \uBE44\uAD50']);}var LVx=(typeof LV!=='undefined'&&LV)?LV:{};var open=(typeof window._tgLayerOpen==='undefined')?true:window._tgLayerOpen;var h='<div style="border:1px solid #f1c40f;border-radius:8px;padding:7px 11px;background:#fffdf5;box-shadow:0 2px 8px rgba(0,0,0,.12)">';h+='<div onclick="tgLayerToggleOpen()" style="font-weight:700;font-size:12px;color:#0a3ea0;cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none'+(open?';margin-bottom:5px':'')+'">\uB808\uC774\uC5B4 <span style="font-size:9px">'+(open?'\u25BC':'\u25B6')+'</span></div>';if(open){defs.forEach(function(d){h+='<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0;cursor:pointer"><input type="checkbox" data-tglv="'+d[0]+'"'+(LVx[d[0]]?' checked':'')+' onchange="tgLayerToggle(this)">'+d[1]+'</label>';});}return h+'</div>';}
function tgLayerToggleOpen(){window._tgLayerOpen=(window._tgLayerOpen===false)?true:false;var lw=document.getElementById('tgLayerWrap');if(lw)lw.innerHTML=tgLayerBox();}
function tgLayerToggle(inp){if(typeof setLayerVis==='function')setLayerVis(inp.getAttribute('data-tglv'),inp.checked);if(typeof tgSeg!=='undefined'&&tgSeg>=0&&typeof tgInfoRender==='function')tgInfoRender(tgSeg);}
function tgInfoLayout(on){var mc=document.querySelector('.maincol');var cw=document.querySelector('.canvas-wrap');var ip=document.getElementById('tgInfoPanel');var lw=document.getElementById('tgLayerWrap');if(on){if(mc)mc.style.position='relative';if(cw){cw.style.marginRight='50%';if(getComputedStyle(cw).position==='static')cw.style.position='relative';if(!lw){lw=document.createElement('div');lw.id='tgLayerWrap';lw.style.cssText='position:absolute;right:12px;top:36px;z-index:7';cw.appendChild(lw);}lw.innerHTML=tgLayerBox();lw.style.display='block';}if(!ip){ip=document.createElement('div');ip.id='tgInfoPanel';ip.style.cssText='position:absolute;right:0;top:0;bottom:0;width:50%;border-left:2px solid #f1c40f;background:#fff;overflow:auto;padding:10px 14px;font-size:12px;z-index:6;display:flex;flex-direction:column';if(mc)mc.appendChild(ip);}ip.style.display='flex';if(typeof tgInfoRender==='function')tgInfoRender(tgSeg);}else{if(cw)cw.style.marginRight='';if(ip)ip.style.display='none';if(lw)lw.style.display='none';}}
function tgInfoRender(i){var ip=document.getElementById('tgInfoPanel');if(!ip)return;ip.style.display='flex';ip.style.flexDirection='column';var _ah=(typeof _tgCtx!=='undefined'&&_tgCtx==='attr')?'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #0a7ea0"><b style="font-size:15px;color:#0a7ea0">\uC18D\uC131\uC815\uBCF4 \uD3B8\uC9D1 (\uC6D0\uBCF8)</b><button onclick="exportTango()" style="margin-left:auto;background:#1e7e34;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-weight:700;cursor:pointer">\uD0F1\uACE0\uC131\uACFC \uB0B4\uBCF4\uB0B4\uAE30</button><button onclick="closeTangoPanel()" style="background:#fff;border:1px solid #ccc;border-radius:6px;padding:5px 11px;cursor:pointer">\u2715</button></div>':'';if(i<0||!_tgSegs||!_tgSegs[i]){var _ms=(typeof tgMissingEdges==='function')?tgMissingEdges():{total:0,miss:[]};var _sum=_ms.miss.length?('<div style="margin:6px 0;padding:8px 10px;background:#ffe5e5;border:1px solid #ff6b6b;border-radius:6px;color:#c0392b;font-size:12px;font-weight:700">\u26A0 \uD1B5\uC2E0\uAD00\uB85C '+_ms.total+'\uAC1C \uC911 '+_ms.miss.length+'\uAC1C \uBBF8\uBC30\uC815(\uB204\uB77D) \u2014 \uB3C4\uBA74 \uBE68\uAC04\uC120 \uD655\uC778</div>'):('<div style="margin:6px 0;padding:8px 10px;background:#e7f7ec;border:1px solid #2ecc71;border-radius:6px;color:#1e7e34;font-size:12px;font-weight:700">\u2713 \uD1B5\uC2E0\uAD00\uB85C '+_ms.total+'\uAC1C \uC804\uBD80 \uAD6C\uAC04 \uBC30\uC815\uB428</div>');ip.innerHTML=_ah+tgSegButtons()+_sum+'<div style="color:#999;margin:auto;text-align:center;font-size:13px;padding:24px">\uD558\uB2E8 \uD45C\uC758 \uAD6C\uAC04\uC744 \uD074\uB9AD\uD558\uBA74<br>\uADF8 \uAD6C\uAC04\uB9CC \uB3C4\uBA74\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4.</div>';return;}var sg=_tgSegs[i];var pts=sg.filter(function(n){return !n.mh;});var avgd=pts.filter(function(n){return n.z!=null;});var avg=avgd.length?(avgd.reduce(function(a,n){return a+n.z;},0)/avgd.length):null;var totd=0;for(var k=1;k<sg.length;k++)totd+=Math.hypot(sg[k].x-sg[k-1].x,sg[k].y-sg[k-1].y);var jj=Math.floor(totd/10)+1;var s0=sg[0],s1=sg[sg.length-1];function fc(n){return n.mh?('\uB9E8\uD640 '+(n.name||'')+(n.spec?(' '+n.spec):'')):'\uAD00\uB9D0';}var info='<div style="font-size:14px;font-weight:800;color:#0a3ea0">'+(i+1)+'\uAD6C\uAC04</div><div style="font-size:12px;line-height:1.5;margin:3px 0 6px">\u25B6'+fc(s0)+' \u2192 \u25C0'+fc(s1)+'<br>\uCE21\uC810 '+pts.length+' \u00B7 \uC900\uACF5 '+totd.toFixed(2)+'m \u00B7 \uD3C9\uADE0\uC2EC\uB3C4 '+(avg!=null?avg.toFixed(1):'-')+'m \u00B7 \uC9C0\uC911\uD45C\uC2DC '+jj+'</div>';info+=tgSegMeta(sg,s0,s1,totd,avg,jj)+tgSegTable(sg);ip.innerHTML=_ah+tgSegButtons()+info;}
function clipSegRect(p1,p2,xmin,ymin,xmax,ymax){
  var x0=p1[0],y0=p1[1],dx=p2[0]-p1[0],dy=p2[1]-p1[1];
  var t0=0,t1=1,P=[-dx,dx,-dy,dy],Q=[x0-xmin,xmax-x0,y0-ymin,ymax-y0];
  for(var i=0;i<4;i++){
    if(P[i]===0){if(Q[i]<0)return null;}
    else{var r=Q[i]/P[i];if(P[i]<0){if(r>t1)return null;if(r>t0)t0=r;}else{if(r<t0)return null;if(r<t1)t1=r;}}
  }
  return [[x0+t0*dx,y0+t0*dy],[x0+t1*dx,y0+t1*dy]];
}
function clipPolyRect(pts,xmin,ymin,xmax,ymax){
  var out=[],cur=[],eps=1e-6;
  for(var i=0;i<pts.length-1;i++){
    var seg=clipSegRect(pts[i],pts[i+1],xmin,ymin,xmax,ymax);
    if(!seg){if(cur.length>=2)out.push(cur);cur=[];continue;}
    if(cur.length===0){cur=[seg[0],seg[1]];}
    else{var last=cur[cur.length-1];
      if(Math.abs(last[0]-seg[0][0])<eps&&Math.abs(last[1]-seg[0][1])<eps){cur.push(seg[1]);}
      else{if(cur.length>=2)out.push(cur);cur=[seg[0],seg[1]];}}
  }
  if(cur.length>=2)out.push(cur);
  return out;
}
function drawBpRect(){
  if(!bpCrop)return;clearSvg(gDraft);
  var x=Math.min(bpCrop.sx,bpCrop.ex),y=Math.min(bpCrop.sy,bpCrop.ey),
      w=Math.abs(bpCrop.ex-bpCrop.sx),h=Math.abs(bpCrop.ey-bpCrop.sy);
  var r=el('rect',{x:x,y:y,width:w,height:h,fill:'rgba(122,82,224,0.06)',stroke:'#000','stroke-width':1.2,'vector-effect':'non-scaling-stroke','stroke-dasharray':'4 3','pointer-events':'none'});
  gDraft.appendChild(r);
}
function applyBpCrop(c){
  var x1=Math.min(c.sx,c.ex),x2=Math.max(c.sx,c.ex),Y1=Math.min(c.sy,c.ey),Y2=Math.max(c.sy,c.ey);
  if((x2-x1)<0.3||(Y2-Y1)<0.3){toast('영역이 너무 작습니다');return;}
  var xmin=x1,xmax=x2,ymin=-Y2,ymax=-Y1; // SVG y=-worldY 변환
  if(typeof pushHist==='function')pushHist();
  var nb=[];
  (state.lines||[]).forEach(function(l){
    if(!l.base){nb.push(l);return;}
    var subs=clipPolyRect(l.pts,xmin,ymin,xmax,ymax);
    subs.forEach(function(pp){if(pp.length>=2)nb.push({layer:l.layer,pts:pp,base:true});});
  });
  nb.push({layer:'CROP',pts:[[xmin,ymin],[xmax,ymin],[xmax,ymax],[xmin,ymax],[xmin,ymin]],base:true,crop:true});
  state.lines=nb;
  state.baseTexts=(state.baseTexts||[]).filter(function(t){return t.x>=xmin&&t.x<=xmax&&t.y>=ymin&&t.y<=ymax;});
  mode='pan';if(typeof setModeUI==='function')setModeUI();
  drawGeo();toast('백판 크롭 완료 — 영역 안만 남기고 테두리선 추가');
  if(state.projectId&&typeof saveProject==='function'){try{saveProject();if(typeof toast==='function')toast('크롭 자동 저장됨');}catch(e){}}
}
var BP_APP={'통신관로':1,'지거':1,'압입구간':1,'주입상인출선':1};
function bpHit(cw,noCap){
  var best=null,bd=1e18,lim=vb.w*0.05;
  (state.lines||[]).forEach(function(L,li){
    if(!L.pts||!(L.base||!BP_APP[L.layer]))return;
    for(var sg=0;sg<L.pts.length-1;sg++){
      var a=S(L.pts[sg][0],L.pts[sg][1]),b=S(L.pts[sg+1][0],L.pts[sg+1][1]);
      var d=segDist(cw[0],cw[1],a[0],a[1],b[0],b[1]);
      if(d<bd){bd=d;best={t:'line',i:li};}
    }
  });
  (state.baseTexts||[]).forEach(function(tx,ti){
    var p=S(tx.x||0,tx.y||0);var d=Math.hypot(cw[0]-p[0],cw[1]-p[1]);
    if(d<bd){bd=d;best={t:'text',i:ti};}
  });
  return (best&&(noCap||bd<=lim))?best:null;
}
function bpHover(cw){
  clearSvg(gDraw);
  var best=bpHit(cw,true); if(!best)return;
  gDraw.appendChild(el('circle',{cx:cw[0],cy:cw[1],r:9,fill:'rgba(255,23,68,0.2)',stroke:'#ff1744','stroke-width':2.5,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
  if(best.t==='line'){
    var L=state.lines[best.i];
    for(var k=0;k<L.pts.length-1;k++){
      var a=S(L.pts[k][0],L.pts[k][1]),b=S(L.pts[k+1][0],L.pts[k+1][1]);
      gDraw.appendChild(el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#ff1744','stroke-width':7,'stroke-opacity':0.6,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));
    }
  }else{
    var t=state.baseTexts[best.i],p=S(t.x||0,t.y||0);
    gDraw.appendChild(el('circle',{cx:p[0],cy:p[1],r:11,fill:'rgba(255,23,68,0.15)',stroke:'#ff1744','stroke-width':3,'vector-effect':'non-scaling-stroke','pointer-events':'none'}));
  }
}
function bpEraseAt(cw){
  var best=bpHit(cw,true);
  if(!best){toast('지울 백판 요소가 없습니다');return;}
  pushHist();
  if(best.t==='line'){state.lines.splice(best.i,1);drawGeo();toast('백판 선 삭제');}
  else{state.baseTexts.splice(best.i,1);drawGeo();toast('백판 텍스트 삭제');}
  clearSvg(gDraw);
}
function toWorld(cx,cy){var m=null;try{m=cv.getScreenCTM();}catch(e){}if(m&&m.a){var im=m.inverse();return [im.a*cx+im.c*cy+im.e, im.b*cx+im.d*cy+im.f];}var r=cv.getBoundingClientRect();return [vb.x+(cx-r.left)/r.width*vb.w, vb.y+(cy-r.top)/r.height*vb.h];}
function zoomAt(f,cx,cy){var w=toWorld(cx,cy),r=cv.getBoundingClientRect();vb.w*=f;vb.h*=f;vb.x=w[0]-(cx-r.left)/r.width*vb.w;vb.y=w[1]-(cy-r.top)/r.height*vb.h;applyVB();if(typeof drawGeo==='function')drawGeo();if(typeof drawManholes==='function')drawManholes();}

/* ====== 결선 ====== */
function nearestPointWorld(wx,wy){var best=null,bd=1e18;state.points.forEach(function(p){var s=S(p.x,p.y);var d=(s[0]-wx)*(s[0]-wx)+(s[1]-wy)*(s[1]-wy);if(d<bd){bd=d;best=p;}});return {p:best,d:Math.sqrt(bd)};}
// 그리기 스냅: 측점 + 맨홀 중심 중 가장 가까운 것 (pt=[worldX,worldY])
function nearestSnapWorld(wx,wy){var bd=1e18,pt=null;
  state.points.forEach(function(p){var s=S(p.x,p.y);var d=(s[0]-wx)*(s[0]-wx)+(s[1]-wy)*(s[1]-wy);if(d<bd){bd=d;pt=[p.x,p.y];}});
  (state.manholes||[]).forEach(function(mh){var s=S(mh.wx,mh.wy);var d=(s[0]-wx)*(s[0]-wx)+(s[1]-wy)*(s[1]-wy);if(d<bd){bd=d;pt=[mh.wx,mh.wy];}});
  return {pt:pt,d:Math.sqrt(bd)};}
function autoConnectTamsa(){
  if(state.points.length<2){toast('\uCE21\uB7C9\uC810\uC744 \uBA3C\uC800 \uC62C\uB824\uC8FC\uC138\uC694');return;}
  pushHist();
  var route=state.points.filter(function(p){var c=(p.code||'').trim();if(/^(EJ|TJ)/i.test(c))return false;if(/\uBCF4\uAC15\uD310/.test((p.no||'')+'|'+c))return false;if(p._riserPt)return false;if(p._hyun)return false;return true;});
  function pnum(p){var m=(p.no||'').match(/-(\d+)$/);return m?parseInt(m[1],10):0;}
  route.sort(function(a,b){return pnum(a)-pnum(b);});
  state.lines=(state.lines||[]).filter(function(l){return l.layer!=='\uD1B5\uC2E0\uAD00\uB85C';});
  if(route.length<2){drawGeo();return;}
  var GAP=12,CONN=18,segs=[],cur=[route[0]];
  for(var i=1;i<route.length;i++){var a=route[i-1],b=route[i];if(Math.hypot(a.x-b.x,a.y-b.y)>GAP){segs.push(cur);cur=[b];}else cur.push(b);}
  if(cur.length)segs.push(cur);
  segs.forEach(function(seg){if(seg.length>=2)state.lines.push({layer:'\uD1B5\uC2E0\uAD00\uB85C',pts:seg.map(function(p){return [p.x,p.y];})});});
  var seen={};
  segs.forEach(function(seg,si){[seg[0],seg[seg.length-1]].forEach(function(ep){var best=null,bd=CONN;segs.forEach(function(sg2,sj){if(sj===si)return;sg2.forEach(function(q){var dd=Math.hypot(ep.x-q.x,ep.y-q.y);if(dd<bd){bd=dd;best=q;}});});if(best){var key=[Math.min(ep.x,best.x).toFixed(2),Math.min(ep.y,best.y).toFixed(2),Math.max(ep.x,best.x).toFixed(2),Math.max(ep.y,best.y).toFixed(2)].join(',');if(!seen[key]){seen[key]=1;state.lines.push({layer:'\uD1B5\uC2E0\uAD00\uB85C',pts:[[ep.x,ep.y],[best.x,best.y]]});}}});});
  (state.manholes||[]).forEach(function(m){if(m.type!=='riser')return;var best=null,bd=1e18;route.forEach(function(q){var dd=Math.hypot(m.wx-q.x,m.wy-q.y);if(dd<bd){bd=dd;best=q;}});if(best&&bd<CONN*2.5)state.lines.push({layer:'\uD1B5\uC2E0\uAD00\uB85C',pts:[[m.wx,m.wy],[best.x,best.y]]});});
  state.routingDone=true;drawGeo();
  toast('\uD0D0\uC0AC \uC790\uB3D9\uACB0\uC120: \uAD6C\uAC04 '+segs.length+'\uAC1C');
}
function autoConnect(){
  if(state.tamsa){autoConnectTamsa();return;}
  if(state.points.length<2){toast('측량점을 먼저 올려주세요');return;}
  pushHist();
  // ★ 맨홀/입상주 종단선 보존 + 앞타점(endPt)
  var endPts=[];
  function _dMH(pt){var d=1e18;(state.manholes||[]).forEach(function(mh){var e=Math.hypot(pt[0]-mh.wx,pt[1]-mh.wy);if(e<d)d=e;});return d;}
  function _nrPt(pt){var b=null,bd=1e18;state.points.forEach(function(p){var e=Math.hypot(p.x-pt[0],p.y-pt[1]);if(e<bd){bd=e;b=p;}});return [b,bd];}
  state.lines=state.lines.filter(function(l){
    if(l.layer!=='통신관로')return true;
    if(!l.pts||l.pts.length<2)return false;
    var touchMH=l.pts.some(function(pt){var dm=_dMH(pt),np=_nrPt(pt);return dm<np[1]&&dm<1.0;});
    if(!touchMH)return false;
    l.pts.forEach(function(pt){var dm=_dMH(pt),np=_nrPt(pt);if(np[0]&&np[1]<dm&&np[1]<1.0&&endPts.indexOf(np[0])<0)endPts.push(np[0]);});
    return true;
  });
  var THRESH=20;
  var TBRANCH=5;
  var pts=state.points.filter(function(p){return !/보강판/.test((p.no||'')+'|'+(p.code||''))&&!isRiserPt(p);}); // 보강판·전주(TJ/EJ) 제외
  var mhs=state.manholes||[];
  // ★ 코드에 M(맨홀)·I(입상) 붙은 측점도 앞타점(endPt) — 무조건
  pts.forEach(function(p){if((isManhole(p)||/^\s*I/i.test((p.code||'')))&&endPts.indexOf(p)<0)endPts.push(p);});
  var endSet=new Set(endPts);
  function D(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  // ★ 관경별 공수 [100mm공수, 50mm공수] — 같은 측점 한 선으로 가되 공수는 관경별
  function pcMap(p){var m100=0,m50=0;var c=(p.code||'');var re=/(100|50)\s*[xX×]\s*(\d+)/g,mm;while(mm=re.exec(c)){if(mm[1]==='100')m100+=+mm[2];else m50+=+mm[2];}return [m100,m50];}
  pts.forEach(function(p){p._pc=pcMap(p);});
  function P100(p){return p._pc?p._pc[0]:0;}
  function P50(p){return p._pc?p._pc[1]:0;}
  function pcEq(a,b){return P100(a)===P100(b)&&P50(a)===P50(b);}
  function ang(a,b){return Math.atan2(b.y-a.y,b.x-a.x);}
  function angDiff(x,y){var d=Math.abs(x-y)%(2*Math.PI);return d>Math.PI?2*Math.PI-d:d;}
  function isT(p){return isTpoint(p);}
  var edges=[], degM=new Map(), tLock=new Set(), branchOf=new Map();
  function deg(p){return degM.get(p)||0;}
  function linked(p,q){for(var i=0;i<edges.length;i++){if((edges[i][0]===p&&edges[i][1]===q)||(edges[i][0]===q&&edges[i][1]===p))return true;}return false;}
  function edgeCrosses(p,q){for(var i=0;i<edges.length;i++){var a=edges[i][0],b=edges[i][1];if(a===p||a===q||b===p||b===q)continue;if(segInt([p.x,p.y],[q.x,q.y],[a.x,a.y],[b.x,b.y]))return true;}return false;}
  function link(p,q){if(p===q||linked(p,q))return false;if(tLock.has(p)||tLock.has(q))return false;if(endSet.has(p)&&deg(p)>=1)return false;if(endSet.has(q)&&deg(q)>=1)return false;if(!isT(p)&&deg(p)>=2)return false;if(!isT(q)&&deg(q)>=2)return false;if(edgeCrosses(p,q))return false;edges.push([p,q]);degM.set(p,deg(p)+1);degM.set(q,deg(q)+1);return true;}
  // ★ 2차원 부분집합합: (100mm합,50mm합)=(t100,t50) 동시 만족
  function subsetSum2(c100,c50,t100,t50){var n=c100.length,res=null;
    function bt(i,s100,s50,pick){if(res)return;if(s100===t100&&s50===t50&&pick.length){res=pick.slice();return;}if(s100>t100||s50>t50||i>=n)return;
      pick.push(i);bt(i+1,s100+c100[i],s50+c50[i],pick);pick.pop();bt(i+1,s100,s50,pick);}
    bt(0,0,0,[]);return res;}
  // ===== 1단계: T점(아래부터) — ①본선(같은 100·50쌍) ②분기(100·50 합 동시) =====
  var tpts=pts.filter(isT);
  tpts.sort(function(a,b){return a.y-b.y;});
  var tBad=0;
  tpts.forEach(function(t){
    var T100=P100(t),T50=P50(t);if(T100===0&&T50===0)return;
    // ① 본선: 100·50 공수쌍이 똑같은 측점 1개
    var mc=pts.filter(function(p){return p!==t&&D(t,p)<=THRESH&&!linked(t,p)&&!tLock.has(p)&&pcEq(p,t)&&(isT(p)||deg(p)<2);});
    mc.sort(function(a,b){return D(t,a)-D(t,b);});
    if(mc[0])link(t,mc[0]);
    // ② 분기: 100mm 합=T100 그리고 50mm 합=T50 (작은 점들 조합)
    var BRANCHR=7;   // 분기 반경(방향 첫점 포함 위해 5→7)
    var bcAll=pts.filter(function(p){return p!==t&&D(t,p)<=BRANCHR&&!linked(t,p)&&!tLock.has(p)&&(isT(p)||deg(p)<2)&&(P100(p)>0||P50(p)>0)&&P100(p)<=T100&&P50(p)<=T50&&!(P100(p)===T100&&P50(p)===T50);});
    bcAll.sort(function(a,b){return D(t,a)-D(t,b);});
    // ★ 방향 규칙: 방향(T→측점 각도)이 30° 이내로 같으면 같은 분기(갈래)로 보고, 각 갈래의 가장 가까운 1점만 분기 대표
    var bc=[];
    bcAll.forEach(function(p){
      var ap=Math.atan2(p.y-t.y,p.x-t.x);
      var same=bc.some(function(q){return pcEq(p,q)&&angDiff(ap,Math.atan2(q.y-t.y,q.x-t.x))<0.349;});  // ★같은 공수쌍 + 방향 20°(0.349rad)이내만 같은 갈래
      if(!same)bc.push(p);
    });
    var idx=subsetSum2(bc.map(P100),bc.map(P50),T100,T50);
    if(idx)idx.forEach(function(i){if(link(t,bc[i]))branchOf.set(bc[i],t);});
    else tBad++;
    tLock.add(t);
  });
  // ===== 2단계: 일반점(아래부터) — 100·50쌍 둘 다 같은 점끼리 체인 =====
  var npts=pts.filter(function(p){return !isT(p);});
  npts.sort(function(a,b){return a.y-b.y;});
  npts.forEach(function(p){
    var guard=0;
    while(deg(p)<2&&guard<8){guard++;
      var cand=pts.filter(function(q){return q!==p&&!isT(q)&&!linked(p,q)&&pcEq(p,q)&&deg(q)<2&&D(p,q)<=THRESH&&!(branchOf.get(p)&&branchOf.get(p)===branchOf.get(q));});
      cand.sort(function(a,b){return D(p,a)-D(p,b);});
      if(!cand.length)break;
      if(!link(p,cand[0]))break;
    }
  });
  edges.forEach(function(e){state.lines.push({layer:'통신관로',pts:[[e[0].x,e[0].y],[e[1].x,e[1].y]]});});
  var t3=0;tpts.forEach(function(t){if(deg(t)<3)t3++;});
  drawGeo();updMeta();toast('자동결선 · T '+tpts.length+'(3갈래미만 '+t3+'·공수미달 '+tBad+') · 결선 '+edges.length+' (맨홀은 그린 선만)');
}

function autoConnectLegacy(){
  if(state.points.length<2){toast('측량점을 먼저 올려주세요');return;}
  pushHist();
  state.lines=state.lines.filter(function(l){return l.layer!=='통신관로';}); // 자동결선만 갱신
  var THRESH=20, pts=state.points.filter(function(p){return !/보강판/.test((p.no||'')+'|'+(p.code||''));}); // 공공측량 20m 규정 · 보강판=참고용(결선 제외)
  function D(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  var edges=[];
  var ufp=new Map(); // 폐합 방지 union-find (지하관로 = 트리, 고리 없음)
  function ufFind(p){if(!ufp.has(p))ufp.set(p,p);var r=p;while(ufp.get(r)!==r)r=ufp.get(r);while(ufp.get(p)!==r){var n=ufp.get(p);ufp.set(p,r);p=n;}return r;}
  var chainAdj=new Map(), deg=new Map();
  function caPush(a,b){if(!chainAdj.has(a))chainAdj.set(a,[]);chainAdj.get(a).push(b);}
  function angV(v1,v2){var d1=Math.hypot(v1[0],v1[1]),d2=Math.hypot(v2[0],v2[1]);if(d1===0||d2===0)return 180;var cv=Math.max(-1,Math.min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(d1*d2)));return Math.acos(cv)*180/Math.PI;}
  function segCross(a,b,c,e){ if(a===c||a===e||b===c||b===e)return false; // 끝점 공유는 교차 아님
    function ccw(p,q,r){return (q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);}
    var d1=ccw(c,e,a),d2=ccw(c,e,b),d3=ccw(a,b,c),d4=ccw(a,b,e);
    return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0))&&d1!==0&&d2!==0&&d3!==0&&d4!==0; }
  function addE(p,q,chain){if(p===q)return false;if(ufFind(p)===ufFind(q))return false; /* 폐합방지 */
    if((!isTpoint(p)&&(deg.get(p)||0)>=2)||(!isTpoint(q)&&(deg.get(q)||0)>=2))return false; /* ★절대규칙: T 아닌 점은 분기인입 금지(연결 2개=통과선까지만) */
    for(var ci=0;ci<edges.length;ci++){if(segCross(p,q,edges[ci][0],edges[ci][1]))return false;} /* ★관로선은 다른 관로선을 가로지르지 않음 */
    edges.push([p,q]);ufp.set(ufFind(p),ufFind(q)); deg.set(p,(deg.get(p)||0)+1);deg.set(q,(deg.get(q)||0)+1); if(chain){caPush(p,q);caPush(q,p);} return true;}

  function nearestT(q){var qc=pipeCount(q),best=null,bd=1e18;pts.forEach(function(p){if(!isTpoint(p))return;var pc=pipeCount(p);if(pc==null||qc==null||pc<=qc)return;var d=D(p,q);if(d<=THRESH&&d<bd){bd=d;best=p;}});return best;}
  function nearestSC(q){var qc=pipeCount(q);if(qc==null)return null;var best=null,bd=1e18;pts.forEach(function(p){if(p===q||pipeCount(p)!==qc)return;var d=D(p,q);if(d<=THRESH&&d<bd){bd=d;best=p;}});return best;}
  var branchAcc=new Map();
  // 1) 분기: 비T점 q는 '가장 가까운 T'가 '가장 가까운 같은관수 이웃'보다 가까우면 그 T에 붙음
  pts.forEach(function(q){ if(isTpoint(q))return; var qc=pipeCount(q); if(qc==null)return;
    var t=nearestT(q); if(!t)return; var sc=nearestSC(q);
    if(sc===null||D(t,q)<D(sc,q)){ if(addE(q,t))branchAcc.set(t,(branchAcc.get(t)||0)+qc); }
  });
  // 2) T점이 자기 관수(Np)를 채우도록 분기 가져옴(본선 있어도) — 단 ①q의 최근접 T가 나 ②q의 같은관수 이웃이 나보다 1.5배 이상 가깝진 않음
  pts.forEach(function(P){ if(!isTpoint(P))return; var Np=pipeCount(P); if(Np==null)return;
    var acc=branchAcc.get(P)||0; if(acc>=Np)return;
    var sm=pts.filter(function(x){return !isTpoint(x)&&pipeCount(x)!=null&&pipeCount(x)<Np&&D(P,x)<=THRESH;}).sort(function(a,b){return D(P,a)-D(P,b);});
    for(var i=0;i<sm.length&&acc<Np;i++){var q=sm[i],c=pipeCount(q);
      if(acc+c>Np)continue;
      if(nearestT(q)!==P)continue;                            // 다른 T가 더 가까우면 그 T의 분기
      var completes=(acc+c===Np); var sc=nearestSC(q); if(sc){ if(D(P,q)>1.5*D(sc,q))continue; if(!completes&&angV([q.x-sc.x,q.y-sc.y],[P.x-q.x,P.y-q.y])>90)continue; } // 라인점 가드 + 정렬가드(단, 이 분기로 T가 정확히 채워지면 완화)
      if(addE(P,q))acc+=c;
    }
  });
  // 3) 같은 관수 nearest 체인(본선) — 형제 분기끼린 폐합방지로 자동 차단
  var groups={};
  pts.forEach(function(p){var c=pipeCount(p);var k=(c==null?'?':String(c));(groups[k]=groups[k]||[]).push(p);});
  Object.keys(groups).forEach(function(k){
    var g=groups[k].slice(); if(g.length<2)return;
    var cx=0,cy=0;g.forEach(function(p){cx+=p.x;cy+=p.y;});cx/=g.length;cy/=g.length; // 무게중심
    g.sort(function(a,b){return Math.hypot(b.x-cx,b.y-cy)-Math.hypot(a.x-cx,a.y-cy);}); // 먼 실제 끝점부터 시작(수직선 x정렬 지그재그 방지)
    function tParent(p){var best=null,bd=1e18;edges.forEach(function(e){var o=(e[0]===p)?e[1]:(e[1]===p?e[0]:null);if(o&&pipeCount(o)!=null&&pipeCount(p)!=null&&pipeCount(o)>pipeCount(p)){var d=D(p,o);if(d<bd){bd=d;best=o;}}});return best;}
    function chainOK(cu,nx){
      if(goesUp(cu)&&goesUp(nx))return false;                                  // 분기엽끼리 다리 금지
      var tp=tParent(cu); if(tp&&angV([cu.x-tp.x,cu.y-tp.y],[nx.x-cu.x,nx.y-cu.y])>75)return false; // 분기엽은 제 라인 진행방향(상위T 반대쪽)으로만
      var t2=tParent(nx); if(t2&&angV([nx.x-t2.x,nx.y-t2.y],[cu.x-nx.x,cu.y-nx.y])>75)return false;
      return true;
    }
    var cur=g.shift();
    while(g.length){
      var pick=-1,pd=1e18;
      for(var i=0;i<g.length;i++){var d=D(g[i],cur); if(d<=THRESH&&d<pd&&chainOK(cur,g[i])){pd=d;pick=i;}}
      if(pick<0){ var fi=0,fd=-1;for(var j=0;j<g.length;j++){var dd=Math.hypot(g[j].x-cx,g[j].y-cy);if(dd>fd){fd=dd;fi=j;}} cur=g.splice(fi,1)[0];continue; } // 이어갈 데 없음 → 남은 것 중 끝점에서 새 체인 시작
      var nx=g.splice(pick,1)[0];addE(cur,nx,true);cur=nx;
    }
  });
  // 4) 라인 끝점(비T, 체인차수 1)을 진행 방향과 정렬된(꺾임<45°) 가까운 T에 연결 (22→14처럼)
  pts.forEach(function(q){ if(isTpoint(q))return; var ca=chainAdj.get(q); if(!ca||ca.length!==1)return;
    var r=ca[0], dirv=[q.x-r.x,q.y-r.y], best=null, bturn=45;
    pts.forEach(function(p){ if(!isTpoint(p)||D(p,q)>THRESH||ufFind(p)===ufFind(q))return; var turn=angV(dirv,[p.x-q.x,p.y-q.y]); if(turn<bturn){bturn=turn;best=p;} });
    if(best)addE(q,best);
  });

  // 분기합(상위관수 점 t에 붙은 더 작은 관수들의 합) — 용량초과 판정용
  function branchSum(t){var tc=pipeCount(t),s=0;edges.forEach(function(e){var o=(e[0]===t)?e[1]:(e[1]===t?e[0]:null);if(o){var oc=pipeCount(o);if(oc!=null&&tc!=null&&oc<tc)s+=oc;}});return s;}
  // 4.5) ★T 본선연결: T는 상위관수 점(부모)에 연결돼야 — 아직 상위에 안 붙은 T를 가까운 상위관수점에 잇기(용량초과 금지)
  pts.filter(isTpoint).sort(function(a,b){return (pipeCount(a)||0)-(pipeCount(b)||0);}).forEach(function(P){
    var Np=pipeCount(P); if(Np==null)return;
    var linkedUp=edges.some(function(e){var o=(e[0]===P)?e[1]:(e[1]===P?e[0]:null);return o&&pipeCount(o)!=null&&pipeCount(o)>Np;});
    if(linkedUp)return;
    var cand=pts.filter(function(p){return pipeCount(p)!=null&&pipeCount(p)>Np&&D(P,p)<=THRESH&&ufFind(p)!==ufFind(P);}).sort(function(a,b){return D(P,a)-D(P,b);});
    for(var i=0;i<cand.length;i++){var Q=cand[i]; if(branchSum(Q)+Np>pipeCount(Q))continue; if(addE(P,Q))break;}
  });
  // 5) ★떠 있는 단일관수 라인 도킹: 어디에도 안 붙은 한 관수짜리 라인의 끝점을 가까운 상위관수 T에 연결(용량·정렬 가드)
  var comp=new Map();
  pts.forEach(function(p){var r=ufFind(p);if(!comp.has(r))comp.set(r,[]);comp.get(r).push(p);});
  comp.forEach(function(members){
    var vals={},hasT=false;members.forEach(function(m){vals[String(pipeCount(m))]=1;if(isTpoint(m))hasT=true;});
    var keys=Object.keys(vals); if(keys.length!==1||hasT||keys[0]==='null')return;
    var v=pipeCount(members[0]);
    var eps=members.filter(function(m){return (deg.get(m)||0)<=1;}); if(!eps.length)eps=members;
    var best=null,bestD=1e18,bestTurn=999;
    eps.forEach(function(e){
      var ca=chainAdj.get(e),dirv=null; if(ca&&ca.length){dirv=[e.x-ca[0].x,e.y-ca[0].y];}
      pts.forEach(function(t){
        if(!isTpoint(t)||pipeCount(t)==null||pipeCount(t)<=v||ufFind(t)===ufFind(e))return;
        var d=D(e,t); if(d>THRESH)return;
        var turn=dirv?angV(dirv,[t.x-e.x,t.y-e.y]):0; if(turn>90)return;
        if(branchSum(t)+v>pipeCount(t))return;
        if(d<bestD-0.01||(Math.abs(d-bestD)<=0.01&&turn<bestTurn)){bestD=d;bestTurn=turn;best=[e,t];}
      });
    });
    if(best)addE(best[0],best[1]);
  });

  // 6) ★과결선 정리 — '같은관수 따라가다' 잘못 엮인 잉여 선 제거
  function goesUp(p){return edges.some(function(e){var o=(e[0]===p)?e[1]:(e[1]===p?e[0]:null);return o&&pipeCount(o)!=null&&pipeCount(p)!=null&&pipeCount(o)>pipeCount(p);});}
  // 6a) 양쪽 다 상위 T로 올라가는 같은관수 변 = 서로 다른 분기끼리 잘못 엮임 → 제거(예: 29-34)
  edges=edges.filter(function(e){var a=e[0],b=e[1];
    if(pipeCount(a)!=null&&pipeCount(a)===pipeCount(b)&&goesUp(a)&&goesUp(b))return false;
    return true;});
  // 6b) 입력(하위관수 분기)이 이미 꽉 찬 T는 같은관수 트렁크를 '입력 반대방향' 1개만 유지(예: 28-30 제거, 28-25 유지)
  pts.filter(isTpoint).forEach(function(P){
    var Np=pipeCount(P); if(Np==null||branchSum(P)<Np)return;
    var same=edges.filter(function(e){return (e[0]===P||e[1]===P)&&pipeCount((e[0]===P)?e[1]:e[0])===Np;});
    if(same.length<2)return;
    var ix=0,iy=0;edges.forEach(function(e){var o=(e[0]===P)?e[1]:(e[1]===P?e[0]:null);if(o&&pipeCount(o)!=null&&pipeCount(o)<Np){var dx=o.x-P.x,dy=o.y-P.y,d=Math.hypot(dx,dy)||1;ix+=dx/d;iy+=dy/d;}});
    var keep=null,kbest=-9;same.forEach(function(e){var o=(e[0]===P)?e[1]:e[0];var dx=o.x-P.x,dy=o.y-P.y,d=Math.hypot(dx,dy)||1;var dot=(dx/d)*(-ix)+(dy/d)*(-iy);if(dot>kbest){kbest=dot;keep=e;}});
    edges=edges.filter(function(e){return !(same.indexOf(e)>=0&&e!==keep);});
  });

  var MHR=4, mhCount=0;
  (state.manholes||[]).forEach(function(mh){
    var nr=pts.filter(function(p){return isManhole(p);}).map(function(p){return {p:p,d:Math.hypot(p.x-mh.wx,p.y-mh.wy)};}).filter(function(o){return o.d<=MHR;}).sort(function(a,b){return a.d-b.d;});
    if(nr.length>=2){var A=nr[0].p,B=nr[1].p;edges=edges.filter(function(e){return !((e[0]===A&&e[1]===B)||(e[0]===B&&e[1]===A));});state.lines.push({layer:'통신관로',pts:[[A.x,A.y],[mh.wx,mh.wy],[B.x,B.y]]});mhCount++;}
    else if(nr.length===1){var A1=nr[0].p;state.lines.push({layer:'통신관로',pts:[[A1.x,A1.y],[mh.wx,mh.wy]]});mhCount++;}
  });
  edges.forEach(function(e){state.lines.push({layer:'통신관로',pts:[[e[0].x,e[0].y],[e[1].x,e[1].y]]});});
  drawGeo();updMeta();toast('자동 결선 '+edges.length+'개 + 맨홀통과 '+mhCount+'개 (검수·수정하세요)');
}
var lineDraft=null, previewLine=null, drawLayer='통신관로', delLayer='통신관로';
// 같은 선분 키(좌표쌍, 방향무관)
function segKey(a,b){var lo=(a[0]<b[0]||(a[0]===b[0]&&a[1]<=b[1]))?[a,b]:[b,a];return lo[0][0].toFixed(3)+','+lo[0][1].toFixed(3)+'|'+lo[1][0].toFixed(3)+','+lo[1][1].toFixed(3);}
// 중복 선분 제거 — 같은 구간이 여러 번이면 1선만 남김
function removeDupLines(){
  var seen={}, out=[];
  state.lines.forEach(function(L){
    if(L.layer!=='통신관로'||!L.pts||L.pts.length<2){out.push(L);return;}
    var keep=[L.pts[0]];
    for(var i=0;i<L.pts.length-1;i++){
      var k=segKey(L.pts[i],L.pts[i+1]);
      if(seen[k]){ if(keep.length>=2)out.push({layer:L.layer,pts:keep,note:L.note}); keep=[L.pts[i+1]]; }
      else { seen[k]=true; keep.push(L.pts[i+1]); }
    }
    if(keep.length>=2)out.push({layer:L.layer,pts:keep,note:L.note});
  });
  state.lines=out;
}
// 중복선 검수: 통신관로 중 같은 구간이 2개 이상이면 써클 표시 + 팝업
function inspectDupLines(){
  state.markups=state.markups.filter(function(m){return m.near!=='중복';}); // 이전 중복 써클 제거(갱신)
  var segs={};
  state.lines.forEach(function(L){if(L.layer!=='통신관로'||!L.pts)return;
    for(var i=0;i<L.pts.length-1;i++){var a=L.pts[i],b=L.pts[i+1];var k=segKey(a,b);
      if(!segs[k])segs[k]={mid:[(a[0]+b[0])/2,(a[1]+b[1])/2],n:0};
      segs[k].n++;}});
  var dups=[];for(var k in segs)if(segs[k].n>=2)dups.push(segs[k]);
  if(!dups.length){drawMarks();updMeta();showModal({title:'중복선 검수 결과',tone:'ok',body:'<b style="font-size:16px">중복 0</b><br>중복된 관로선이 없습니다.',buttons:[{label:'확인'}]});return;}
  pushHist();
  var totalExtra=0;
  dups.forEach(function(d){var sm=S(d.mid[0],d.mid[1]);state.markups.push({type:'cir',cx:sm[0],cy:sm[1],rx:1.19,ry:1.19,status:'bad',near:'중복',cnt:d.n-1});totalExtra+=d.n-1;});
  drawMarks();updMeta();
  showModal({title:'중복선 검수 결과',tone:'bad',
    body:'중복 <b style="color:#d32f2f;font-size:16px">'+dups.length+'곳 · '+totalExtra+'선</b> 발견했습니다.<br>도면에서 빨간 써클 위치를 확인하세요.<br>(빈 곳을 끌어 도면을 이동할 수 있어요)<br><br>중복된 선을 삭제하고 <b>1선만</b> 남길까요?',
    buttons:[
      {label:'취소',onClick:function(){toast('중복 '+dups.length+'곳 표시만 (삭제 안 함)');}},
      {label:'중복 삭제',primary:true,onClick:function(){removeDupLines();state.markups=state.markups.filter(function(m){return m.near!=='중복';});drawGeo();drawMarks();updMeta();toast('중복선 삭제 완료 — 1선만 유지');}}
    ]});
}
// 관공수 검수: 빨간 관로선(결선)을 따라 관수(xN) 규칙 점검
//  규칙1 연속성 — 측점↔측점 직접 결선은 관수 동일해야(T점 제외). 맨홀을 거치는 구간은 관수 변화 허용.
//  규칙2 T점   — 분기 가닥(관수<T) 들의 합 = T점 관수.
function inspectPipeCount(){
  state.markups=state.markups.filter(function(m){return m.near!=='관공수';}); // 이전 관공수 마크 갱신
  var pts=state.points||[], mhs=state.manholes||[], TOL=0.05;
  function findPt(xy){var b=null,bd=TOL*TOL;for(var i=0;i<pts.length;i++){var dx=pts[i].x-xy[0],dy=pts[i].y-xy[1],d=dx*dx+dy*dy;if(d<=bd){bd=d;b=pts[i];}}return b;}
  function isMHcoord(xy){for(var i=0;i<mhs.length;i++){if(Math.hypot(mhs[i].wx-xy[0],mhs[i].wy-xy[1])<=TOL)return true;}return false;}
  function idxOf(p){for(var i=0;i<pts.length;i++)if(pts[i]===p)return i;return -1;}
  var issues=[]; // {wx,wy,msg}

  state.lines.forEach(function(L){if((L.layer!=='통신관로'&&L.layer!=='지거')||!L.pts||L.pts.length<2)return; // 결선+지거선 함께
    for(var s=0;s<L.pts.length-1;s++){
      var a=L.pts[s], b=L.pts[s+1];
      if(isMHcoord(a)||isMHcoord(b))continue;            // 맨홀 거치는 구간 → 관수 변화 허용
      var pa=findPt(a), pb=findPt(b); if(!pa||!pb)continue; // 측점 매칭 실패(끝점검수 영역)
      if(L.layer==='통신관로'){var dd=Math.hypot(pa.x-pb.x,pa.y-pb.y); // 점간격 20m 초과 검수(결선만, 지거 제외)
        if(dd>20)issues.push({wx:(pa.x+pb.x)/2,wy:(pa.y+pb.y)/2,msg:pa.no+' ↔ '+pb.no+' 측점간격 '+dd.toFixed(1)+'m > 20m',seg:[[pa.x,pa.y],[pb.x,pb.y]]});}
      var ca=pipeCount(pa), cb=pipeCount(pb);
      if(isTpoint(pa)||isTpoint(pb))continue;            // 연속성은 둘 다 비T점만
      if(ca==null||cb==null)continue;                    // 관수 미기재는 스킵
      if(ca!==cb){var mx=(pa.x+pb.x)/2,my=(pa.y+pb.y)/2;
        issues.push({wx:mx,wy:my,msg:pa.no+'('+ca+'공) ↔ '+pb.no+'('+cb+'공) 관수 불일치'});}
    }
  });

  // ===== T점 관 흐름 보존 검수 (트리: 맨홀/입상에서만 관 추가) =====
  var adj={};
  function addAdj(u,w){if(u===w)return;adj[u]=adj[u]||[];adj[w]=adj[w]||[];if(adj[u].indexOf(w)<0)adj[u].push(w);if(adj[w].indexOf(u)<0)adj[w].push(u);}
  state.lines.forEach(function(L){if((L.layer!=='통신관로'&&L.layer!=='지거')||!L.pts)return; // 결선+지거(연결되면 같은 관망으로 계산)
    var seq=[]; // 선을 따라가며 측점 순서 수집(맨홀 꼭짓점은 건너뛰되 양옆 측점 연결)
    L.pts.forEach(function(v){if(isMHcoord(v))return;var p=findPt(v);if(p){var i=idxOf(p);if(i>=0&&(!seq.length||seq[seq.length-1]!==i))seq.push(i);}});
    for(var k=0;k<seq.length-1;k++)addAdj(seq[k],seq[k+1]);
  });
  function isSrc(p){if(isManhole(p))return true;for(var i=0;i<mhs.length;i++){if(Math.hypot(mhs[i].wx-p.x,mhs[i].wy-p.y)<=2.5)return true;}return false;} // 맨홀/입상 2.5m 이내 = 관 공급원
  // ===== ② T점 국소 분기 규칙 (다중 맨홀에 강함 · 빨강 권위) =====
  //  같은 관수 가닥(본선)은 분기합에서 제외, 더 작은 분기들의 합 = T 관수.
  var tPassed={}, redIdx={};
  Object.keys(adj).forEach(function(uk){var u=+uk,P=pts[u];if(!P||!isTpoint(P))return;
    var N=pipeCount(P);if(N==null)return;
    var branches=[],mains=0,bigs=[];
    (adj[u]||[]).forEach(function(v){var c=pipeCount(pts[v]);if(c==null)return;if(c>N)bigs.push(c);else if(c===N)mains++;else branches.push(c);});
    if(bigs.length){issues.push({wx:P.x,wy:P.y,idx:u,msg:'T점 '+P.no+'('+N+'공): 더 큰 관수 '+Math.max.apply(null,bigs)+'공 가닥 연결 — 확인'});redIdx[u]=1;return;}
    if(branches.length){var bs=0;branches.forEach(function(b){bs+=b;});
      if(bs!==N){issues.push({wx:P.x,wy:P.y,idx:u,msg:'T점 '+P.no+'('+N+'공) 분기합 '+bs+'공 ≠ '+N+'공'});redIdx[u]=1;return;}}
    tPassed[u]=1;
  });
  // ===== ① 흐름 보조점검(단일루트) → 주황 "확인 필요". 방향 1개 가정이라 다중 맨홀에선 모호 =====
  var flowRaw=[], fvisited={}, fpar={}; // fpar[u]=부모쪽으로 흐르는 관수
  Object.keys(adj).forEach(function(sk){sk=+sk;if(fvisited[sk])return;
    var comp=[],stk=[sk],cseen={};cseen[sk]=1; // 연결요소 수집
    while(stk.length){var u=stk.pop();comp.push(u);(adj[u]||[]).forEach(function(v){if(!cseen[v]){cseen[v]=1;stk.push(v);}});}
    var root=null; // 루트=잎(소스 우선) — T점을 루트로 잡으면 본선도 분기로 세므로 금지
    for(var a=0;a<comp.length;a++){if((adj[comp[a]]||[]).length<=1&&isSrc(pts[comp[a]])){root=comp[a];break;}}
    if(root===null)for(var b=0;b<comp.length;b++){if((adj[comp[b]]||[]).length<=1){root=comp[b];break;}}
    if(root===null)root=comp[0];
    var parent={},order=[];parent[root]=-1;fvisited[root]=1;var st2=[root];
    while(st2.length){var u=st2.pop();order.push(u);(adj[u]||[]).forEach(function(v){if(v===parent[u])return;if(fvisited[v])return;fvisited[v]=1;parent[v]=u;st2.push(v);});}
    var ecnt=0;comp.forEach(function(n){ecnt+=(adj[n]||[]).length;});ecnt/=2; // 컴포넌트 엣지 수
    if(ecnt>comp.length-1){ // 트리(노드수-1)보다 엣지 많음 = 폐합(고리) 있음 → 흐름 계산 신뢰 불가, 고리만 표시
      var done=false;
      for(var ci=0;ci<comp.length&&!done;ci++){var cu=comp[ci],nbs=adj[cu]||[];
        for(var ni=0;ni<nbs.length;ni++){var cv=nbs[ni];if(cu<cv&&parent[cu]!==cv&&parent[cv]!==cu){
          issues.push({wx:(pts[cu].x+pts[cv].x)/2,wy:(pts[cu].y+pts[cv].y)/2,msg:'폐합(고리) 결선: '+pts[cu].no+' ↔ '+pts[cv].no+' — 지하관로는 고리가 없어야 함'});done=true;break;}}}
      return;
    }
    for(var oi=order.length-1;oi>=0;oi--){var u=order[oi]; // 후위순회: 잎→루트
      var ch=(adj[u]||[]).filter(function(v){return parent[v]===u;});
      var cs=0;ch.forEach(function(c){cs+=fpar[c];}); // 자식 흐름 합
      var P=pts[u],Np=pipeCount(P);
      if(Np==null){fpar[u]=cs;continue;}            // 관수 미기재 → 통과
      if(isSrc(P)){var f=Np-cs;if(cs>Np)flowRaw.push({wx:P.x,wy:P.y,idx:u,msg:P.no+' 흐름 점검: 분기합 '+cs+'공 > '+Np+'공'});fpar[u]=Math.max(f,0);} // 소스=추가 허용
      else{var mx=0;ch.forEach(function(c){if(fpar[c]>mx)mx=fpar[c];});
        if(!ch.length)fpar[u]=Np;                                                                          // 잎
        else if(mx>Np){flowRaw.push({wx:P.x,wy:P.y,idx:u,msg:P.no+'('+Np+'공) 흐름 점검: 자식 '+mx+'공 초과'});fpar[u]=Np;}
        else if(mx===Np)fpar[u]=Np-(cs-mx);                                                                // 본선=자식, 부모=분기
        else{if(cs!==Np)flowRaw.push({wx:P.x,wy:P.y,idx:u,msg:P.no+'('+Np+'공) 흐름 점검: 합 '+cs+'공 ≠ '+Np+'공'});fpar[u]=Np;} // 부모=본선
      }
    }
    var rP=pts[root],Nr=pipeCount(rP),rch=(adj[root]||[]).filter(function(v){return parent[v]===root;}),rs=0;
    rch.forEach(function(c){rs+=fpar[c];});
    if(!isSrc(rP)&&Nr!=null&&rs!==Nr)flowRaw.push({wx:rP.x,wy:rP.y,idx:root,msg:'끝점 '+rP.no+'('+Nr+'공) 흐름 '+rs+'공 불일치'});
  });

  // ===== 주황 후보: ②통과·빨강·맨홀인접 점은 억제(흐름 방향 모호) =====
  var soft=[];
  flowRaw.forEach(function(fi){var u=fi.idx;if(u!=null&&(tPassed[u]||redIdx[u]||isSrc(pts[u])))return;soft.push(fi);});

  if(!issues.length&&!soft.length){drawMarks();updMeta();showModal({title:'관공수 검수 결과',tone:'ok',body:'<b style="font-size:16px">이상 0</b><br>관수 규칙(연속성·T점 분기·흐름)을 모두 통과했습니다.',buttons:[{label:'확인'}]});return;}
  pushHist();
  var R=1.33;
  function spread(arr){ // 겹치는 검수원 분산
    var SP=2.0,usd=arr.map(function(){return false;});
    for(var gi=0;gi<arr.length;gi++){ if(usd[gi])continue; var cl=[gi]; usd[gi]=true;
      for(var gj=gi+1;gj<arr.length;gj++){ if(usd[gj])continue;
        if(Math.hypot(arr[gj].wx-arr[gi].wx,arr[gj].wy-arr[gi].wy)<2*R+0.6){cl.push(gj);usd[gj]=true;} }
      if(cl.length>1){ var cx=0,cy=0;cl.forEach(function(k){cx+=arr[k].wx;cy+=arr[k].wy;});cx/=cl.length;cy/=cl.length;
        cl.forEach(function(k,j){var ang=2*Math.PI*j/cl.length-Math.PI/2;arr[k].wx=cx+Math.cos(ang)*SP;arr[k].wy=cy+Math.sin(ang)*SP;}); } }
  }
  spread(issues); spread(soft);
  issues.forEach(function(it,i){var sm=S(it.wx,it.wy);var sg=it.seg?[S(it.seg[0][0],it.seg[0][1]),S(it.seg[1][0],it.seg[1][1])]:null;state.markups.push({type:'cir',cx:sm[0],cy:sm[1],rx:R,ry:R,status:'bad',near:'관공수',msg:it.msg,num:i+1,seg:sg});});
  soft.forEach(function(it){var sm=S(it.wx,it.wy);state.markups.push({type:'cir',cx:sm[0],cy:sm[1],rx:R,ry:R,status:'bad',near:'관공수',soft:true,msg:it.msg,num:'?'});});
  drawMarks();updMeta();
  var redList=issues.map(function(it,i){return (i+1)+'. '+it.msg;}).join('<br>');
  var softList=soft.map(function(it){return '• '+it.msg;}).join('<br>');
  showModal({title:'관공수 검수 결과',tone:issues.length?'bad':'ok',
    body:(issues.length?'확실한 이상 <b style="color:#d32f2f;font-size:16px">'+issues.length+'곳</b> (빨강 써클)':'확실한 이상 <b style="color:#16a34a">0</b>')
      +(soft.length?'<br>확인 필요 <b style="color:#f57c00;font-size:16px">'+soft.length+'곳</b> (주황 써클 — 흐름이 한 방향 가정에서 안 맞음. 오류가 아닐 수 있음)':'')
      +'<br><br><div style="text-align:left;font-size:13px;line-height:1.7;max-height:220px;overflow:auto">'
      +(redList?'<b style="color:#d32f2f">● 빨강(확실)</b><br>'+redList:'')
      +(redList&&softList?'<br><br>':'')
      +(softList?'<b style="color:#f57c00">● 주황(확인 필요)</b><br>'+softList:'')+'</div>',
    buttons:[{label:'확인'}]});
}
// 끝점 검수 — 단순 규칙: 선의 끝점이 CSV 측점에 안 붙으면 이상
function inspectEndpoints(){
  state.markups=state.markups.filter(function(m){return m.near!=='끝점';}); // 이전 끝점 마크 제거(갱신)
  var TOL=1e-6; // 사실상 0 — 측점에 정확히 붙은 것만 정상, 조금이라도 떨어지면 잡음
  function nearPoint(x,y){
    for(var i=0;i<state.points.length;i++){var p=state.points[i];if(Math.hypot(p.x-x,p.y-y)<=TOL)return true;}
    var mhs=state.manholes||[];for(var j=0;j<mhs.length;j++){if(Math.hypot(mhs[j].wx-x,mhs[j].wy-y)<=TOL)return true;} // 맨홀·입상주에 붙은 끝점도 정상
    return false;
  }
  var bad=[], seen={};
  state.lines.forEach(function(L){if(L.layer!=='통신관로'||!L.pts||L.pts.length<2)return;
    [L.pts[0],L.pts[L.pts.length-1]].forEach(function(pt){
      if(nearPoint(pt[0],pt[1]))return; // CSV 측점에 붙음 = 정상
      var k=pt[0].toFixed(3)+','+pt[1].toFixed(3); if(seen[k])return; seen[k]=1;
      bad.push(pt);
    });
  });
  if(!bad.length){drawMarks();updMeta();showModal({title:'끝점 검수 결과',tone:'ok',body:'<b style="font-size:16px">정상</b><br>모든 선의 끝점이 CSV 측점에 붙어 있습니다.',buttons:[{label:'확인'}]});return;}
  pushHist();
  bad.forEach(function(pt){var sm=S(pt[0],pt[1]);state.markups.push({type:'cir',cx:sm[0],cy:sm[1],rx:1.33,ry:1.33,status:'bad',near:'끝점'});});
  drawMarks();updMeta();
  showModal({title:'끝점 검수 결과',tone:'bad',
    body:'끝점이 CSV 측점에 안 붙은 곳 <b style="color:#d32f2f;font-size:16px">'+bad.length+'곳</b> 발견했습니다.<br>빨간 써클 위치를 확인하세요.',
    buttons:[{label:'확인'}]});
}
// DXF 내보내기 — 측점·결선·맨홀·입상주를 DXF(R12 ENTITIES)로 저장 후 다운로드. 좌표는 측량 월드(x=동, y=북)
/* 측설용 CSV 내보내기 — 점번호·X·Y·Z·코드 (현재 사업 성과) */
function exportSurveyCsv(){
  if(!state.points||!state.points.length){toast('내보낼 측점이 없습니다');return;}
  var head='이름,X,Y,Z(레벨),코드';
  var rows=state.points.map(function(p){
    var nm=ptNum(p);
    var X=(p.y!=null&&!isNaN(p.y))?(+p.y).toFixed(3):'';   // CSV X = 앱 p.y (북)
    var Y=(p.x!=null&&!isNaN(p.x))?(+p.x).toFixed(3):'';   // CSV Y = 앱 p.x (동)
    var Z=(p.z!=null&&!isNaN(p.z))?(+p.z).toFixed(3):'';
    var cd=(p.code||'').trim(); if(/[",]/.test(cd))cd='"'+cd.replace(/"/g,'""')+'"';
    if(/[",]/.test(nm))nm='"'+nm.replace(/"/g,'""')+'"';
    return [nm,X,Y,Z,cd].join(',');
  });
  var csv='\uFEFF'+head+'\r\n'+rows.join('\r\n')+'\r\n';
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var nm=(state.projectName||'측설용').replace(/[\\/:*?"<>|]/g,'_');
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='측설용_'+nm+'.csv';
  document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},150);
  toast('측설용 CSV 내보내기 — '+state.points.length+'점');
}
function startAreaSelect(cb){var wrap=document.querySelector('.canvas-wrap');if(!wrap){cb(null);return;}var ov=document.createElement('div');ov.style.cssText='position:absolute;inset:0;z-index:9999;cursor:crosshair;background:rgba(0,0,0,0.06)';var box=document.createElement('div');box.style.cssText='position:absolute;border:2px dashed #1565c0;background:rgba(21,101,192,0.12);display:none;pointer-events:none';ov.appendChild(box);var hint=document.createElement('div');hint.textContent='\uCD9C\uB825\uD560 \uC601\uC5ED \uB4DC\uB798\uADF8 \u00B7 \uD720=\uD655\uB300/\uCD95\uC18C \u00B7 \uD720\uD074\uB9AD=\uC774\uB3D9 \u00B7 ESC=\uC804\uCCB4';hint.style.cssText='position:absolute;top:8px;left:50%;transform:translateX(-50%);background:#1565c0;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;pointer-events:none;white-space:nowrap';ov.appendChild(hint);wrap.appendChild(ov);var sx,sy,dg=false,midP=false,mpx,mpy,mvb;function clean(){ov.remove();document.removeEventListener('keydown',ek);}function ek(e){if(e.key==='Escape'){clean();cb('FULL');}}document.addEventListener('keydown',ek);ov.addEventListener('wheel',function(e){e.preventDefault();if(typeof zoomAt==='function')zoomAt(e.deltaY>0?1.07:0.935,e.clientX,e.clientY);},{passive:false});ov.addEventListener('pointerdown',function(e){if(e.button===1){e.preventDefault();midP=true;mpx=e.clientX;mpy=e.clientY;mvb={x:vb.x,y:vb.y};try{ov.setPointerCapture(e.pointerId);}catch(_){}return;}if(e.button!==0)return;dg=true;var r=wrap.getBoundingClientRect();sx=e.clientX-r.left;sy=e.clientY-r.top;box.style.display='block';box.style.left=sx+'px';box.style.top=sy+'px';box.style.width='0';box.style.height='0';try{ov.setPointerCapture(e.pointerId);}catch(_){}});ov.addEventListener('pointermove',function(e){if(midP){var rc=cv.getBoundingClientRect();vb.x=mvb.x-(e.clientX-mpx)*(vb.w/rc.width);vb.y=mvb.y-(e.clientY-mpy)*(vb.h/rc.height);if(typeof applyVB==='function')applyVB();return;}if(!dg)return;var r=wrap.getBoundingClientRect();var cx=e.clientX-r.left,cy=e.clientY-r.top;var x=Math.min(sx,cx),y=Math.min(sy,cy),w=Math.abs(cx-sx),h=Math.abs(cy-sy);box.style.left=x+'px';box.style.top=y+'px';box.style.width=w+'px';box.style.height=h+'px';});ov.addEventListener('pointerup',function(e){if(midP){midP=false;try{ov.releasePointerCapture(e.pointerId);}catch(_){}return;}if(!dg)return;dg=false;var r=wrap.getBoundingClientRect();var cx=e.clientX-r.left,cy=e.clientY-r.top;var x=Math.min(sx,cx),y=Math.min(sy,cy),w=Math.abs(cx-sx),h=Math.abs(cy-sy);clean();if(w>20&&h>20)cb({x:x,y:y,w:w,h:h});else cb('FULL');});}
var _nanumB64=null,_PDFREQ=false;
  function ensureNanum(cb){
    if(_nanumB64!==null){cb(_nanumB64?null:'ERR');return;}
    fetch('https://cdn.jsdelivr.net/font-nanum/1.0/nanumgothic/v3/NanumGothic-Regular.ttf').then(function(r){if(!r.ok)throw 0;return r.arrayBuffer();}).then(function(buf){var by=new Uint8Array(buf),bin='',CH=8192;for(var i=0;i<by.length;i+=CH){bin+=String.fromCharCode.apply(null,by.subarray(i,i+CH));}_nanumB64=btoa(bin);cb(null);}).catch(function(){_nanumB64='';cb('ERR');});
  }
  function ensurePdfLib(cb){if(typeof html2canvas!=='undefined'&&(typeof window.jspdf!=='undefined'||typeof window.jsPDF!=='undefined')){cb();return;}var s1=document.createElement('script');s1.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';s1.onload=function(){var s2=document.createElement('script');s2.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s2.onload=cb;s2.onerror=function(){toast('PDF \uB77C\uC774\uBE0C\uB7EC\uB9AC \uB85C\uB4DC \uC2E4\uD328');};document.head.appendChild(s2);};s1.onerror=function(){toast('PDF \uB77C\uC774\uBE0C\uB7EC\uB9AC \uB85C\uB4DC \uC2E4\uD328');};document.head.appendChild(s1);}
function exportPDFVector(){if(!state.points.length&&!state.lines.length&&!(state.manholes||[]).length){toast('\\uB0B4\\uBCF4\\uB0BC \\uB370\\uC774\\uD130\\uAC00 \\uC5C6\\uC2B5\\uB2C8\\uB2E4');return;}toast('PDF \\uC0DD\\uC131 \\uC911...');ensurePdfLib(function(){ensureNanum(function(err){if(err)toast('\\uD55C\\uAE00 \\uD3F0\\uD2B8 \\uB85C\\uB4DC \\uC2E4\\uD328-\\uACC4\\uC18D');_PDFREQ=true;try{exportDXF(false);}catch(e){toast('PDF \\uC0DD\\uC131 \\uC624\\uB958');}_PDFREQ=false;});});}
  function exportPDF(){startAreaSelect(function(sel){var rect=(sel&&sel!=='FULL')?sel:null;toast('PDF \uC0DD\uC131 \uC911...');ensurePdfLib(function(){var wrap=document.querySelector('.canvas-wrap');if(!wrap){toast('\uB3C4\uBA74\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C');return;}var sc=rect?Math.max(3,Math.min(8,4800/Math.max(rect.w,rect.h))):4;var opt={backgroundColor:'#ffffff',scale:sc,useCORS:true,logging:false};if(rect){opt.x=rect.x;opt.y=rect.y;opt.width=rect.w;opt.height=rect.h;}html2canvas(wrap,opt).then(function(canvas){var png=canvas.toDataURL('image/jpeg',0.92);var JP=(window.jspdf&&window.jspdf.jsPDF)?window.jspdf.jsPDF:window.jsPDF;var land=canvas.width>=canvas.height;var pdf=new JP({orientation:land?'l':'p',unit:'mm',format:'a4'});var pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();var r=Math.min(pw/canvas.width,ph/canvas.height)*0.97;var w=canvas.width*r,h=canvas.height*r;pdf.addImage(png,'JPEG',(pw-w)/2,(ph-h)/2,w,h);pdf.save(((state&&state.projectName)||'tango')+'.pdf');toast('PDF \uC800\uC7A5 \uC644\uB8CC ('+(land?'\uAC00\uB85C':'\uC138\uB85C')+')');}).catch(function(e){toast('PDF \uC0DD\uC131 \uC2E4\uD328');});});});}
function exportDXF(returnStr){
  if(!state.points.length&&!state.lines.length&&!(state.manholes||[]).length){if(returnStr)return null;toast('내보낼 데이터가 없습니다');return;}
  var _mnx=1e20,_mny=1e20,_mxx=-1e20,_mxy=-1e20;function _ext(x,y){if(typeof x==='number'&&typeof y==='number'){if(x<_mnx)_mnx=x;if(y<_mny)_mny=y;if(x>_mxx)_mxx=x;if(y>_mxy)_mxy=y;}}state.points.forEach(function(p){_ext(p.x,p.y);});(state.lines||[]).forEach(function(L){(L.pts||[]).forEach(function(p){_ext(p[0],p[1]);});});(state.manholes||[]).forEach(function(m){_ext(m.wx,m.wy);});(state.bpzones||[]).forEach(function(z){(z.path||[]).forEach(function(p){_ext(p[0],p[1]);});});try{var _tbB=tbLayout(true);if(_tbB&&_tbB.box){_ext(_tbB.box.x,_tbB.box.y);_ext(_tbB.box.x+_tbB.box.w,_tbB.box.y+_tbB.box.h);}}catch(e){}if(_mnx>_mxx){_mnx=0;_mny=0;_mxx=100;_mxy=100;}var _pad=Math.max(_mxx-_mnx,_mxy-_mny)*0.06+5;_mnx-=_pad;_mny-=_pad;_mxx+=_pad;_mxy+=_pad;var _cx=(_mnx+_mxx)/2,_cy=(_mny+_mxy)/2,_vh=Math.max(_mxy-_mny,(_mxx-_mnx)/1.34,10);
  var _PDF=null;
  if(_PDFREQ){try{var _jl=(window.jspdf&&window.jspdf.jsPDF)||window.jsPDF;var _wW=_mxx-_mnx,_wH=_mxy-_mny;var _land=_wW>=_wH;var _doc=new _jl({orientation:_land?'landscape':'portrait',unit:'mm',format:'a4'});if(_nanumB64){try{_doc.addFileToVFS('NanumGothic.ttf',_nanumB64);_doc.addFont('NanumGothic.ttf','NanumGothic','normal');_doc.setFont('NanumGothic');}catch(e){}}var _PW=_doc.internal.pageSize.getWidth(),_PH=_doc.internal.pageSize.getHeight(),_mg=7;var _uW=_PW-_mg*2,_uH=_PH-_mg*2;var _sc=Math.min(_uW/_wW,_uH/_wH);var _ox=(_PW-_wW*_sc)/2,_oy=(_PH-_wH*_sc)/2;_PDF={doc:_doc,mnx:_mnx,mny:_mny,sc:_sc,ox:_ox,oy:_oy,ph:_PH,lw:0.07};}catch(e){_PDF=null;}}
  function PX(x){return _PDF.ox+(x-_PDF.mnx)*_PDF.sc;}
  function PY(y){return _PDF.ph-(_PDF.oy+(y-_PDF.mny)*_PDF.sc);}
  function ACIrgb(c){var m={1:[220,40,40],2:[200,160,0],3:[0,150,0],4:[41,160,210],5:[40,90,200],6:[210,0,230],7:[20,20,20],8:[188,188,188],9:[160,160,160]};return m[c]||[20,20,20];}
  var _pdfQ=[],_pqi=0;
  function _pq(z,fn){_pdfQ.push([z,_pqi++,fn]);}
  function _pdfFlush(){_pdfQ.sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});for(var i=0;i<_pdfQ.length;i++){try{_pdfQ[i][2]();}catch(e){}}_pdfQ=[];_pqi=0;}
  function _pdfPoly(pts,col,closed,lt,layer){if(!pts||pts.length<2)return;var z=(layer==='PIPE')?1:2;_pq(z,function(){var d=_PDF.doc,c=ACIrgb(col);d.setDrawColor(c[0],c[1],c[2]);d.setLineWidth(_PDF.lw);d.setLineDashPattern(lt==='DASHED'?[1.1,0.7]:[],0);for(var i=0;i<pts.length-1;i++)d.line(PX(pts[i][0]),PY(pts[i][1]),PX(pts[i+1][0]),PY(pts[i+1][1]));if(closed&&pts.length>2)d.line(PX(pts[pts.length-1][0]),PY(pts[pts.length-1][1]),PX(pts[0][0]),PY(pts[0][1]));d.setLineDashPattern([],0);});}
  function _pdfCirc(cx,cy,r,col,layer){_pq(4,function(){var d=_PDF.doc,c=ACIrgb(col);d.setDrawColor(c[0],c[1],c[2]);d.setLineWidth(_PDF.lw);d.setLineDashPattern([],0);d.circle(PX(cx),PY(cy),Math.max(0.2,r*_PDF.sc),'S');});}
  function _pdfLine(x1,y1,x2,y2,col,lt,layer){_pq(2,function(){var d=_PDF.doc,c=ACIrgb(col);d.setDrawColor(c[0],c[1],c[2]);d.setLineWidth(_PDF.lw);d.setLineDashPattern(lt==='DASHED'?[1.0,0.7]:[],0);d.line(PX(x1),PY(y1),PX(x2),PY(y2));d.setLineDashPattern([],0);});}
  function _pdfText(x,y,h,s,layer,col,align,rot,valign){if(s==null||s==='')return;var z=(layer==='PT_DEPTH')?9:5;var tc=(layer==='PT_DEPTH')?[0,40,150]:ACIrgb(col);_pq(z,function(){var d=_PDF.doc;d.setTextColor(tc[0],tc[1],tc[2]);var fmm=h*_PDF.sc;if(layer==='DEPTHCHK')fmm*=1.25;var fpt=fmm*2.8346;if(fpt<1.2)fpt=1.2;d.setFontSize(fpt);if(layer==='PT_DEPTH'){var oo={align:'center',baseline:(valign===1)?'bottom':(valign===3)?'top':'alphabetic'};if(rot)oo.angle=-rot;try{d.text(String(s),PX(x),PY(y),oo);}catch(e){}return;}var o={align:(align===1)?'center':(align===2)?'right':'left',baseline:(valign===2)?'middle':(valign===3)?'top':'alphabetic'};if(rot)o.angle=-rot;try{d.text(String(s),PX(x),PY(y),o);}catch(e){}});}
  function _pdfInsert(name,x,y,sc,col){_pq(4,function(){var d=_PDF.doc,c=ACIrgb(col);d.setDrawColor(c[0],c[1],c[2]);d.setLineWidth(_PDF.lw);d.setLineDashPattern([],0);var px=PX(x),py=PY(y);if(name==='SD100'){d.circle(px,py,Math.max(0.3,0.504*sc*_PDF.sc*0.65),'S');d.circle(px,py,Math.max(0.42,0.750*sc*_PDF.sc*0.65),'S');}else{d.setLineWidth(_PDF.lw*0.5);var r=Math.max(0.12,0.055*sc*_PDF.sc);d.line(px-r,py-r,px+r,py+r);d.line(px-r,py+r,px+r,py-r);}});}
  function _pdfFill(p1,p2,p3,p4,r,g,bl){_pq(0,function(){var d=_PDF.doc;d.setFillColor(r,g,bl);d.triangle(PX(p1[0]),PY(p1[1]),PX(p2[0]),PY(p2[1]),PX(p3[0]),PY(p3[1]),'F');d.triangle(PX(p1[0]),PY(p1[1]),PX(p3[0]),PY(p3[1]),PX(p4[0]),PY(p4[1]),'F');});}var PRE=`  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1015
  9
$ACADMAINTVER
 70
6
  9
$DWGCODEPAGE
  3
ANSI_1252
  9
$INSBASE
 10
0.0
 20
0.0
 30
0.0
  9
$EXTMIN
 10
${_mnx}
 20
${_mny}
 30
0.0
  9
$EXTMAX
 10
${_mxx}
 20
${_mxy}
 30
0.0
  9
$LIMMIN
 10
0.0
 20
0.0
  9
$LIMMAX
 10
420.0
 20
297.0
  9
$ORTHOMODE
 70
0
  9
$REGENMODE
 70
1
  9
$FILLMODE
 70
1
  9
$QTEXTMODE
 70
0
  9
$MIRRTEXT
 70
1
  9
$LTSCALE
 40
1.0
  9
$ATTMODE
 70
1
  9
$TEXTSIZE
 40
2.5
  9
$TRACEWID
 40
1.0
  9
$TEXTSTYLE
  7
Standard
  9
$CLAYER
  8
0
  9
$CELTYPE
  6
ByLayer
  9
$CECOLOR
 62
256
  9
$CELTSCALE
 40
1.0
  9
$DISPSILH
 70
0
  9
$DIMSCALE
 40
1.0
  9
$DIMASZ
 40
2.5
  9
$DIMEXO
 40
0.625
  9
$DIMDLI
 40
3.75
  9
$DIMRND
 40
0.0
  9
$DIMDLE
 40
0.0
  9
$DIMEXE
 40
1.25
  9
$DIMTP
 40
0.0
  9
$DIMTM
 40
0.0
  9
$DIMTXT
 40
2.5
  9
$DIMCEN
 40
2.5
  9
$DIMTSZ
 40
0.0
  9
$DIMTOL
 70
0
  9
$DIMLIM
 70
0
  9
$DIMTIH
 70
0
  9
$DIMTOH
 70
0
  9
$DIMSE1
 70
0
  9
$DIMSE2
 70
0
  9
$DIMTAD
 70
1
  9
$DIMZIN
 70
8
  9
$DIMBLK
  1

  9
$DIMASO
 70
1
  9
$DIMSHO
 70
1
  9
$DIMPOST
  1

  9
$DIMAPOST
  1

  9
$DIMALT
 70
0
  9
$DIMALTD
 70
3
  9
$DIMALTF
 40
0.03937007874
  9
$DIMLFAC
 40
1.0
  9
$DIMTOFL
 70
1
  9
$DIMTVP
 40
0.0
  9
$DIMTIX
 70
0
  9
$DIMSOXD
 70
0
  9
$DIMSAH
 70
0
  9
$DIMBLK1
  1

  9
$DIMBLK2
  1

  9
$DIMSTYLE
  2
ISO-25
  9
$DIMCLRD
 70
0
  9
$DIMCLRE
 70
0
  9
$DIMCLRT
 70
0
  9
$DIMTFAC
 40
1.0
  9
$DIMGAP
 40
0.625
  9
$DIMJUST
 70
0
  9
$DIMSD1
 70
0
  9
$DIMSD2
 70
0
  9
$DIMTOLJ
 70
0
  9
$DIMTZIN
 70
8
  9
$DIMALTZ
 70
0
  9
$DIMALTTZ
 70
0
  9
$DIMUPT
 70
0
  9
$DIMDEC
 70
2
  9
$DIMTDEC
 70
2
  9
$DIMALTU
 70
2
  9
$DIMALTTD
 70
3
  9
$DIMTXSTY
  7
Standard
  9
$DIMAUNIT
 70
0
  9
$DIMADEC
 70
0
  9
$DIMALTRND
 40
0.0
  9
$DIMAZIN
 70
0
  9
$DIMDSEP
 70
44
  9
$DIMATFIT
 70
3
  9
$DIMFRAC
 70
0
  9
$DIMLDRBLK
  1

  9
$DIMLUNIT
 70
2
  9
$DIMLWD
 70
-2
  9
$DIMLWE
 70
-2
  9
$DIMTMOVE
 70
0
  9
$LUNITS
 70
2
  9
$LUPREC
 70
4
  9
$SKETCHINC
 40
1.0
  9
$FILLETRAD
 40
10.0
  9
$AUNITS
 70
0
  9
$AUPREC
 70
2
  9
$MENU
  1
.
  9
$ELEVATION
 40
0.0
  9
$PELEVATION
 40
0.0
  9
$THICKNESS
 40
0.0
  9
$LIMCHECK
 70
0
  9
$CHAMFERA
 40
0.0
  9
$CHAMFERB
 40
0.0
  9
$CHAMFERC
 40
0.0
  9
$CHAMFERD
 40
0.0
  9
$SKPOLY
 70
0
  9
$TDCREATE
 40
2461208.088020833
  9
$TDUCREATE
 40
2458532.153996898
  9
$TDUPDATE
 40
2461208.088020833
  9
$TDUUPDATE
 40
2458532.1544311
  9
$TDINDWG
 40
0.0
  9
$TDUSRTIMER
 40
0.0
  9
$USRTIMER
 70
1
  9
$ANGBASE
 50
0.0
  9
$ANGDIR
 70
0
  9
$PDMODE
 70
0
  9
$PDSIZE
 40
0.0
  9
$PLINEWID
 40
0.0
  9
$SPLFRAME
 70
0
  9
$SPLINETYPE
 70
6
  9
$SPLINESEGS
 70
8
  9
$HANDSEED
  5
43
  9
$SURFTAB1
 70
6
  9
$SURFTAB2
 70
6
  9
$SURFTYPE
 70
6
  9
$SURFU
 70
6
  9
$SURFV
 70
6
  9
$UCSBASE
  2

  9
$UCSNAME
  2

  9
$UCSORG
 10
0.0
 20
0.0
 30
0.0
  9
$UCSXDIR
 10
1.0
 20
0.0
 30
0.0
  9
$UCSYDIR
 10
0.0
 20
1.0
 30
0.0
  9
$UCSORTHOREF
  2

  9
$UCSORTHOVIEW
 70
0
  9
$UCSORGTOP
 10
0.0
 20
0.0
 30
0.0
  9
$UCSORGBOTTOM
 10
0.0
 20
0.0
 30
0.0
  9
$UCSORGLEFT
 10
0.0
 20
0.0
 30
0.0
  9
$UCSORGRIGHT
 10
0.0
 20
0.0
 30
0.0
  9
$UCSORGFRONT
 10
0.0
 20
0.0
 30
0.0
  9
$UCSORGBACK
 10
0.0
 20
0.0
 30
0.0
  9
$PUCSBASE
  2

  9
$PUCSNAME
  2

  9
$PUCSORG
 10
0.0
 20
0.0
 30
0.0
  9
$PUCSXDIR
 10
1.0
 20
0.0
 30
0.0
  9
$PUCSYDIR
 10
0.0
 20
1.0
 30
0.0
  9
$PUCSORTHOREF
  2

  9
$PUCSORTHOVIEW
 70
0
  9
$PUCSORGTOP
 10
0.0
 20
0.0
 30
0.0
  9
$PUCSORGBOTTOM
 10
0.0
 20
0.0
 30
0.0
  9
$PUCSORGLEFT
 10
0.0
 20
0.0
 30
0.0
  9
$PUCSORGRIGHT
 10
0.0
 20
0.0
 30
0.0
  9
$PUCSORGFRONT
 10
0.0
 20
0.0
 30
0.0
  9
$PUCSORGBACK
 10
0.0
 20
0.0
 30
0.0
  9
$USERI1
 70
0
  9
$USERI2
 70
0
  9
$USERI3
 70
0
  9
$USERI4
 70
0
  9
$USERI5
 70
0
  9
$USERR1
 40
0.0
  9
$USERR2
 40
0.0
  9
$USERR3
 40
0.0
  9
$USERR4
 40
0.0
  9
$USERR5
 40
0.0
  9
$WORLDVIEW
 70
1
  9
$SHADEDGE
 70
3
  9
$SHADEDIF
 70
70
  9
$TILEMODE
 70
1
  9
$MAXACTVP
 70
64
  9
$PINSBASE
 10
0.0
 20
0.0
 30
0.0
  9
$PLIMCHECK
 70
0
  9
$PEXTMIN
 10
1e+20
 20
1e+20
 30
1e+20
  9
$PEXTMAX
 10
-1e+20
 20
-1e+20
 30
-1e+20
  9
$PLIMMIN
 10
0.0
 20
0.0
  9
$PLIMMAX
 10
420.0
 20
297.0
  9
$UNITMODE
 70
0
  9
$VISRETAIN
 70
1
  9
$PLINEGEN
 70
0
  9
$PSLTSCALE
 70
1
  9
$TREEDEPTH
 70
3020
  9
$CMLSTYLE
  2
Standard
  9
$CMLJUST
 70
0
  9
$CMLSCALE
 40
20.0
  9
$PROXYGRAPHICS
 70
1
  9
$MEASUREMENT
 70
1
  9
$CELWEIGHT
370
-1
  9
$ENDCAPS
280
0
  9
$JOINSTYLE
280
0
  9
$LWDISPLAY
290
0
  9
$INSUNITS
 70
6
  9
$HYPERLINKBASE
  1

  9
$STYLESHEET
  1

  9
$XEDIT
290
1
  9
$CEPSNTYPE
380
0
  9
$PSTYLEMODE
290
1
  9
$FINGERPRINTGUID
  2
{00DE19DB-40A1-46AE-A1EF-B4F1CDD48632}
  9
$VERSIONGUID
  2
{1EB46289-0012-4F44-A87B-47AFBD8FBAAE}
  9
$EXTNAMES
290
1
  9
$PSVPSCALE
 40
0.0
  9
$OLESTARTUP
290
0
  0
ENDSEC
  0
SECTION
  2
CLASSES
  0
CLASS
  1
ACDBDICTIONARYWDFLT
  2
AcDbDictionaryWithDefault
  3
ObjectDBX Classes
 90
0
280
0
281
0
  0
CLASS
  1
SUN
  2
AcDbSun
  3
SCENEOE
 90
1153
280
0
281
0
  0
CLASS
  1
VISUALSTYLE
  2
AcDbVisualStyle
  3
ObjectDBX Classes
 90
4095
280
0
281
0
  0
CLASS
  1
MATERIAL
  2
AcDbMaterial
  3
ObjectDBX Classes
 90
1153
280
0
281
0
  0
CLASS
  1
SCALE
  2
AcDbScale
  3
ObjectDBX Classes
 90
1153
280
0
281
0
  0
CLASS
  1
TABLESTYLE
  2
AcDbTableStyle
  3
ObjectDBX Classes
 90
4095
280
0
281
0
  0
CLASS
  1
MLEADERSTYLE
  2
AcDbMLeaderStyle
  3
ACDB_MLEADERSTYLE_CLASS
 90
4095
280
0
281
0
  0
CLASS
  1
DICTIONARYVAR
  2
AcDbDictionaryVar
  3
ObjectDBX Classes
 90
0
280
0
281
0
  0
CLASS
  1
CELLSTYLEMAP
  2
AcDbCellStyleMap
  3
ObjectDBX Classes
 90
1152
280
0
281
0
  0
CLASS
  1
MENTALRAYRENDERSETTINGS
  2
AcDbMentalRayRenderSettings
  3
SCENEOE
 90
1024
280
0
281
0
  0
CLASS
  1
ACDBDETAILVIEWSTYLE
  2
AcDbDetailViewStyle
  3
ObjectDBX Classes
 90
1025
280
0
281
0
  0
CLASS
  1
ACDBSECTIONVIEWSTYLE
  2
AcDbSectionViewStyle
  3
ObjectDBX Classes
 90
1025
280
0
281
0
  0
CLASS
  1
RASTERVARIABLES
  2
AcDbRasterVariables
  3
ISM
 90
0
280
0
281
0
  0
CLASS
  1
ACDBPLACEHOLDER
  2
AcDbPlaceHolder
  3
ObjectDBX Classes
 90
0
280
0
281
0
  0
CLASS
  1
LAYOUT
  2
AcDbLayout
  3
ObjectDBX Classes
 90
0
280
0
281
0
  0
ENDSEC
  0
SECTION
  2
TABLES
  0
TABLE
  2
VPORT
  5
8
330
0
100
AcDbSymbolTable
 70
1
  0
VPORT
  5
23
330
8
100
AcDbSymbolTableRecord
100
AcDbViewportTableRecord
  2
*Active
 70
0
 10
0.0
 20
0.0
 11
1.0
 21
1.0
 12
${_cx}
 22
${_cy}
 13
0.0
 23
0.0
 14
0.5
 24
0.5
 15
0.5
 25
0.5
 16
0.0
 26
0.0
 36
1.0
 17
0.0
 27
0.0
 37
0.0
 40
${_vh}
 41
1.34
 42
50.0
 43
0.0
 44
0.0
 50
0.0
 51
0.0
 71
0
 72
1000
 73
1
 74
3
 75
0
 76
0
 77
0
 78
0
281
0
 65
0
146
0.0
  0
ENDTAB
  0
TABLE
  2
LTYPE
  5
2
330
0
100
AcDbSymbolTable
 70
5
  0
LTYPE
  5
24
330
2
100
AcDbSymbolTableRecord
100
AcDbLinetypeTableRecord
  2
ByBlock
 70
0
  3

 72
65
 73
0
 40
0.0
  0
LTYPE
  5
25
330
2
100
AcDbSymbolTableRecord
100
AcDbLinetypeTableRecord
  2
ByLayer
 70
0
  3

 72
65
 73
0
 40
0.0
  0
LTYPE
  5
26
330
2
100
AcDbSymbolTableRecord
100
AcDbLinetypeTableRecord
  2
Continuous
 70
0
  3

 72
65
 73
0
 40
0.0
  0
LTYPE
  5
30
330
2
100
AcDbSymbolTableRecord
100
AcDbLinetypeTableRecord
  2
DASHED
 70
0
  3
__ __ __
 72
65
 73
2
 40
1.0
 49
0.6
 74
0
 49
-0.4
 74
0
  0
LTYPE
  5
500
330
2
100
AcDbSymbolTableRecord
100
AcDbLinetypeTableRecord
  2
PUSHDASH
 70
0
  3
___ ___ ___
 72
65
 73
2
 40
5.0
 49
3.0
 74
0
 49
-2.0
 74
0
  0
ENDTAB
  0
TABLE
  2
LAYER
  5
1
330
0
100
AcDbSymbolTable
 70
17
  0
LAYER
  5
27
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
0
 70
0
 62
7
  6
Continuous
370
-3
390
13
  0
LAYER
  5
28
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
Defpoints
 70
0
 62
7
  6
Continuous
290
0
370
-3
390
13
  0
LAYER
  5
31
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
PIPE
 70
0
 62
1
  6
Continuous
370
-3
390
13
  0
LAYER
  5
32
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
JIGER
 70
0
 62
2
  6
Continuous
370
-3
390
13
  0
LAYER
  5
33
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
PUSH
 70
0
 62
5
  6
Continuous
370
-3
390
13
  0
LAYER
  5
34
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
POINT
 70
0
 62
7
  6
Continuous
370
-3
390
13
  0
LAYER
  5
35
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
MANHOLE
 70
0
 62
7
  6
Continuous
370
-3
390
13
  0
LAYER
  5
36
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
RISER
 70
0
 62
5
  6
Continuous
370
-3
390
13
  0
LAYER
  5
37
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
PT_LABEL
 70
0
 62
3
  6
Continuous
370
-3
390
13
  0
LAYER
  5
38
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
PT_CODE
 70
0
 62
4
  6
Continuous
370
-3
390
13
  0
LAYER
  5
39
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
PT_LEADER
 70
0
 62
7
  6
Continuous
370
-3
390
13
  0
LAYER
  5
3A
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
MANHOLE_LABEL
 70
0
 62
7
  6
Continuous
370
-3
390
13
  0
LAYER
  5
3B
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
RISER_LABEL
 70
0
 62
5
  6
Continuous
370
-3
390
13
  0
LAYER
  5
3C
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
JIGER_LABEL
 70
0
 62
6
  6
Continuous
370
-3
390
13
  0
LAYER
  5
3D
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
PUSH_LABEL
 70
0
 62
5
  6
Continuous
370
-3
390
13
  0
LAYER
  5
3E
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
JIGER_LEADER
 70
0
 62
2
  6
Continuous
370
-3
390
13
  0
LAYER
  5
3F
330
1
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
  2
PUSH_LEADER
 70
0
 62
5
  6
Continuous
370
-3
390
13
  0
ENDTAB
  0
TABLE
  2
STYLE
  5
5
330
0
100
AcDbSymbolTable
 70
2
  0
STYLE
  5
29
330
5
100
AcDbSymbolTableRecord
100
AcDbTextStyleTableRecord
  2
Standard
 70
0
 40
0.0
 41
1.0
 50
0.0
 71
0
 42
2.5
  3
romans.shx
  4

  0
STYLE
  5
2F
330
5
100
AcDbSymbolTableRecord
100
AcDbTextStyleTableRecord
  2
HANGUL
 70
0
 40
0.0
 41
1.0
 50
0.0
 71
0
 42
2.5
  3
malgun.ttf
  4

  0
ENDTAB
  0
TABLE
  2
VIEW
  5
7
330
0
100
AcDbSymbolTable
 70
0
  0
ENDTAB
  0
TABLE
  2
UCS
  5
6
330
0
100
AcDbSymbolTable
 70
0
  0
ENDTAB
  0
TABLE
  2
APPID
  5
3
330
0
100
AcDbSymbolTable
 70
3
  0
APPID
  5
2A
330
3
100
AcDbSymbolTableRecord
100
AcDbRegAppTableRecord
  2
ACAD
 70
0
  0
APPID
  5
40
330
3
100
AcDbSymbolTableRecord
100
AcDbRegAppTableRecord
  2
HATCHBACKGROUNDCOLOR
 70
0
  0
APPID
  5
41
330
3
100
AcDbSymbolTableRecord
100
AcDbRegAppTableRecord
  2
EZDXF
 70
0
  0
ENDTAB
  0
TABLE
  2
DIMSTYLE
  5
4
330
0
100
AcDbSymbolTable
 70
1
100
AcDbDimStyleTable
  0
DIMSTYLE
105
2B
330
4
100
AcDbSymbolTableRecord
100
AcDbDimStyleTableRecord
  2
Standard
 70
0
  3

  4

 40
1.0
 41
2.5
 42
0.625
 43
3.75
 44
1.25
 45
0.0
 46
0.0
 47
0.0
 48
0.0
140
2.5
141
2.5
142
0.0
143
0.03937007874
144
1.0
145
0.0
146
1.0
147
0.625
148
0.0
 71
0
 72
0
 73
0
 74
0
 75
0
 76
0
 77
1
 78
8
 79
3
170
0
171
3
172
1
173
0
174
0
175
0
176
0
177
0
178
0
179
2
271
2
272
2
273
2
274
3
275
0
276
0
277
2
278
44
279
0
280
0
281
0
282
0
283
0
284
8
285
0
286
0
288
0
289
3
371
-2
372
-2
  0
ENDTAB
  0
TABLE
  2
BLOCK_RECORD
  5
9
330
0
100
AcDbSymbolTable
 70
2
  0
BLOCK_RECORD
  5
17
330
9
100
AcDbSymbolTableRecord
100
AcDbBlockTableRecord
  2
*Model_Space
340
1A
  0
BLOCK_RECORD
  5
1B
330
9
100
AcDbSymbolTableRecord
100
AcDbBlockTableRecord
  2
*Paper_Space
340
1E
  0
ENDTAB
  0
ENDSEC
  0
SECTION
  2
BLOCKS
  0
BLOCK
  5
18
330
17
100
AcDbEntity
  8
0
100
AcDbBlockBegin
  2
*Model_Space
 70
0
 10
0.0
 20
0.0
 30
0.0
  3
*Model_Space
  1

  0
ENDBLK
  5
19
330
17
100
AcDbEntity
  8
0
100
AcDbBlockEnd
  0
BLOCK
  5
1C
330
1B
100
AcDbEntity
  8
0
100
AcDbBlockBegin
  2
*Paper_Space
 70
0
 10
0.0
 20
0.0
 30
0.0
  3
*Paper_Space
  1

  0
ENDBLK
  5
1D
330
1B
100
AcDbEntity
  8
0
100
AcDbBlockEnd
  0
ENDSEC
  0
SECTION
  2
ENTITIES
`;
  var SUF=`  0
ENDSEC
  0
SECTION
  2
OBJECTS
  0
DICTIONARY
  5
A
330
0
100
AcDbDictionary
281
1
  3
ACAD_COLOR
350
B
  3
ACAD_GROUP
350
C
  3
ACAD_LAYOUT
350
D
  3
ACAD_MATERIAL
350
E
  3
ACAD_MLEADERSTYLE
350
F
  3
ACAD_MLINESTYLE
350
10
  3
ACAD_PLOTSETTINGS
350
11
  3
ACAD_PLOTSTYLENAME
350
12
  3
ACAD_SCALELIST
350
14
  3
ACAD_TABLESTYLE
350
15
  3
ACAD_VISUALSTYLE
350
16
  3
EZDXF_META
350
2D
  0
DICTIONARY
  5
B
330
A
100
AcDbDictionary
281
1
  0
DICTIONARY
  5
C
330
A
100
AcDbDictionary
281
1
  0
DICTIONARY
  5
D
330
A
100
AcDbDictionary
281
1
  3
Model
350
1A
  3
Layout1
350
1E
  0
DICTIONARY
  5
E
330
A
100
AcDbDictionary
281
1
  3
ByBlock
350
1F
  3
ByLayer
350
20
  3
Global
350
21
  0
DICTIONARY
  5
F
330
A
100
AcDbDictionary
281
1
  3
Standard
350
2C
  0
DICTIONARY
  5
10
330
A
100
AcDbDictionary
281
1
  3
Standard
350
22
  0
DICTIONARY
  5
11
330
A
100
AcDbDictionary
281
1
  0
ACDBDICTIONARYWDFLT
  5
12
330
A
100
AcDbDictionary
281
1
  3
Normal
350
13
100
AcDbDictionaryWithDefault
340
13
  0
ACDBPLACEHOLDER
  5
13
330
12
  0
DICTIONARY
  5
14
330
A
100
AcDbDictionary
281
1
  0
DICTIONARY
  5
15
330
A
100
AcDbDictionary
281
1
  0
DICTIONARY
  5
16
330
A
100
AcDbDictionary
281
1
  0
LAYOUT
  5
1A
330
D
100
AcDbPlotSettings
  1

  4
A3
  6

 40
7.5
 41
20.0
 42
7.5
 43
20.0
 44
420.0
 45
297.0
 46
0.0
 47
0.0
 48
0.0
 49
0.0
140
0.0
141
0.0
142
1.0
143
1.0
 70
1024
 72
1
 73
0
 74
5
  7

 75
16
 76
0
 77
2
 78
300
147
1.0
148
0.0
149
0.0
100
AcDbLayout
  1
Model
 70
1
 71
0
 10
0.0
 20
0.0
 11
420.0
 21
297.0
 12
0.0
 22
0.0
 32
0.0
 14
1e+20
 24
1e+20
 34
1e+20
 15
-1e+20
 25
-1e+20
 35
-1e+20
146
0.0
 13
0.0
 23
0.0
 33
0.0
 16
1.0
 26
0.0
 36
0.0
 17
0.0
 27
1.0
 37
0.0
 76
1
330
17
  0
LAYOUT
  5
1E
330
D
100
AcDbPlotSettings
  1

  4
A3
  6

 40
7.5
 41
20.0
 42
7.5
 43
20.0
 44
420.0
 45
297.0
 46
0.0
 47
0.0
 48
0.0
 49
0.0
140
0.0
141
0.0
142
1.0
143
1.0
 70
0
 72
1
 73
0
 74
5
  7

 75
16
 76
0
 77
2
 78
300
147
1.0
148
0.0
149
0.0
100
AcDbLayout
  1
Layout1
 70
1
 71
1
 10
0.0
 20
0.0
 11
420.0
 21
297.0
 12
0.0
 22
0.0
 32
0.0
 14
1e+20
 24
1e+20
 34
1e+20
 15
-1e+20
 25
-1e+20
 35
-1e+20
146
0.0
 13
0.0
 23
0.0
 33
0.0
 16
1.0
 26
0.0
 36
0.0
 17
0.0
 27
1.0
 37
0.0
 76
1
330
1B
  0
MATERIAL
  5
1F
102
{ACAD_REACTORS
330
E
102
}
330
E
100
AcDbMaterial
  1
ByBlock
  2

 70
0
 40
1.0
 71
1
 41
1.0
 91
-1023410177
 42
1.0
 72
1
  3

 73
1
 74
1
 75
1
 44
0.5
 73
0
 45
1.0
 46
1.0
 77
1
  4

 78
1
 79
1
170
1
 48
1.0
171
1
  6

172
1
173
1
174
1
140
1.0
141
1.0
175
1
  7

176
1
177
1
178
1
143
1.0
179
1
  8

270
1
271
1
272
1
145
1.0
146
1.0
273
1
  9

274
1
275
1
276
1
 42
1.0
 72
1
  3

 73
1
 74
1
 75
1
 94
63
  0
MATERIAL
  5
20
102
{ACAD_REACTORS
330
E
102
}
330
E
100
AcDbMaterial
  1
ByLayer
  2

 70
0
 40
1.0
 71
1
 41
1.0
 91
-1023410177
 42
1.0
 72
1
  3

 73
1
 74
1
 75
1
 44
0.5
 73
0
 45
1.0
 46
1.0
 77
1
  4

 78
1
 79
1
170
1
 48
1.0
171
1
  6

172
1
173
1
174
1
140
1.0
141
1.0
175
1
  7

176
1
177
1
178
1
143
1.0
179
1
  8

270
1
271
1
272
1
145
1.0
146
1.0
273
1
  9

274
1
275
1
276
1
 42
1.0
 72
1
  3

 73
1
 74
1
 75
1
 94
63
  0
MATERIAL
  5
21
102
{ACAD_REACTORS
330
E
102
}
330
E
100
AcDbMaterial
  1
Global
  2

 70
0
 40
1.0
 71
1
 41
1.0
 91
-1023410177
 42
1.0
 72
1
  3

 73
1
 74
1
 75
1
 44
0.5
 73
0
 45
1.0
 46
1.0
 77
1
  4

 78
1
 79
1
170
1
 48
1.0
171
1
  6

172
1
173
1
174
1
140
1.0
141
1.0
175
1
  7

176
1
177
1
178
1
143
1.0
179
1
  8

270
1
271
1
272
1
145
1.0
146
1.0
273
1
  9

274
1
275
1
276
1
 42
1.0
 72
1
  3

 73
1
 74
1
 75
1
 94
63
  0
MLINESTYLE
  5
22
102
{ACAD_REACTORS
330
10
102
}
330
10
100
AcDbMlineStyle
  2
Standard
 70
0
  3

 62
256
 51
90.0
 52
90.0
 71
2
 49
0.5
 62
256
  6
BYLAYER
 49
-0.5
 62
256
  6
BYLAYER
  0
MLEADERSTYLE
  5
2C
102
{ACAD_REACTORS
330
F
102
}
330
F
100
AcDbMLeaderStyle
179
2
170
2
171
1
172
0
 90
2
 40
0.0
 41
0.0
173
1
 91
-1056964608
 92
-2
290
1
 42
2.0
291
1
 43
8.0
  3
Standard
 44
4.0
300

342
29
174
1
175
1
176
0
178
1
 93
-1056964608
 45
4.0
292
0
297
0
 46
4.0
 94
-1056964608
 47
1.0
 49
1.0
140
1.0
294
1
141
0.0
177
0
142
1.0
295
0
296
0
143
3.75
271
0
272
9
273
9
  0
DICTIONARY
  5
2D
330
A
100
AcDbDictionary
280
1
281
1
  3
CREATED_BY_EZDXF
350
2E
  3
WRITTEN_BY_EZDXF
350
42
  0
DICTIONARYVAR
  5
2E
330
2D
100
DictionaryVariables
280
0
  1
1.4.4 @ 2026-06-16T02:06:45.251362+00:00
  0
DICTIONARYVAR
  5
42
330
2D
100
DictionaryVariables
280
0
  1
1.4.4 @ 2026-06-16T02:06:45.254593+00:00
  0
ENDSEC
  0
EOF
`;
  var BOX=0.3, RO=0.5, RI=0.3, TH=0.5, RH=0.8;
  var E=[], hs=0x1000;
  function H(){return (hs++).toString(16).toUpperCase();}
  function N(n){return (Math.round(n*1000)/1000).toString();}
  function push(a){for(var i=0;i<a.length;i++)E.push(a[i]);}
  function uesc(s){var o='';for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);o+=(c>127)?('\\U+'+('000'+c.toString(16).toUpperCase()).slice(-4)):s.charAt(i);}return o;}
  function pline(pts,layer,col,closed,lt,lts,wid){if(_PDF){_pdfPoly(pts,col,closed,lt,layer);return;}var a=['0','LWPOLYLINE','5',H(),'330','17','100','AcDbEntity','8',layer];if(lt)a.push('6',lt);if(lts)a.push('48',N(lts));a.push('62',String(col),'100','AcDbPolyline','90',String(pts.length),'70',closed?'1':'0');if(wid)a.push('43',N(wid));for(var i=0;i<pts.length;i++){a.push('10',N(pts[i][0]),'20',N(pts[i][1]));}push(a);}
  function roadHatch(poly){if(_PDF)return;var tc=245*65536+200*256+200;var a=['  0','HATCH','  5',H(),'330','17','100','AcDbEntity','  8','ROADZONE',' 62','1','420',String(tc),'100','AcDbHatch',' 10','0.0',' 20','0.0',' 30','0.0','210','0.0','220','0.0','230','1.0','  2','SOLID',' 70','1',' 71','0',' 91','1',' 92','3',' 72','0',' 73','1',' 93',String(poly.length)];for(var i=0;i<poly.length;i++){a.push(' 10',N(poly[i][0]),' 20',N(poly[i][1]));}a.push(' 97','0',' 75','0',' 76','1',' 98','0');push(a);}
  // 선종에 의존하지 않는 '물리적 점선': 경로 따라 dash만큼 실선 LINE, gap만큼 띄움 → 어떤 뷰어에서도 점선으로 보임
  function dashedPolyline(pts,layer,col,dash,gap){var period=dash+gap,pos=0;for(var i=0;i<pts.length-1;i++){var ax=pts[i][0],ay=pts[i][1],bx=pts[i+1][0],by=pts[i+1][1];var seg=Math.hypot(bx-ax,by-ay);if(seg<1e-9)continue;var ux=(bx-ax)/seg,uy=(by-ay)/seg,d=0;while(d<seg){var inPat=pos%period;if(inPat<dash){var step=Math.min(dash-inPat,seg-d);line(ax+ux*d,ay+uy*d,ax+ux*(d+step),ay+uy*(d+step),layer,col);d+=step;pos+=step;}else{var step2=Math.min(period-inPat,seg-d);d+=step2;pos+=step2;}}}}
  function circle(cx,cy,r,layer,col){if(_PDF){_pdfCirc(cx,cy,r,col,layer);return;}push(['0','CIRCLE','5',H(),'330','17','100','AcDbEntity','8',layer,'62',String(col),'100','AcDbCircle','10',N(cx),'20',N(cy),'30','0','40',N(r)]);}
  function line(x1,y1,x2,y2,layer,col,lt){if(_PDF){_pdfLine(x1,y1,x2,y2,col,lt,layer);return;}var a=['0','LINE','5',H(),'330','17','100','AcDbEntity','8',layer];if(lt)a.push('6',lt);a.push('62',String(col),'100','AcDbLine','10',N(x1),'20',N(y1),'30','0','11',N(x2),'21',N(y2),'31','0');push(a);}
  function box(cx,cy,sz,layer,col){var h=sz/2;pline([[cx-h,cy-h],[cx+h,cy-h],[cx+h,cy+h],[cx-h,cy+h]],layer,col,true);}
  function insert(name,x,y,sc,layer,col){if(_PDF){_pdfInsert(name,x,y,sc,col);return;}push(['0','INSERT','5',H(),'330','17','100','AcDbEntity','8',layer,'62',String(col),'100','AcDbBlockReference','2',name,'10',N(x),'20',N(y),'30','0','41',N(sc),'42',N(sc),'43',N(sc),'50','0']);}
  function text(x,y,h,s,layer,col,align,rot,valign,x11,y11){if(_PDF){_pdfText(x,y,h,s,layer,col,align,rot,valign);return;}var hangul=/[^\x00-\x7F]/.test(s);var es=uesc(s);var a=['0','TEXT','5',H(),'330','17','100','AcDbEntity','8',layer,'62',String(col),'100','AcDbText','10',N(x),'20',N(y),'30','0','40',N(h),'1',es];if(rot){a.push('50',N(rot));}if(hangul)a.push('7','HANGUL');a.push('72',String(align||0),'11',N(x11!=null?x11:x),'21',N(y11!=null?y11:y),'31','0','100','AcDbText');if(valign){a.push('73',String(valign));}push(a);}
  function tw(label,unit){function gw(ch){var c=ch.charCodeAt(0);if(c>127)return 1.1;if(ch===' ')return 0.392;if(ch==='M')return 1.065;if(ch==='W')return 1.22;if(ch>='0'&&ch<='9')return 0.785;if('()[]{}'.indexOf(ch)>=0)return 0.482;if('Iilj|!.,:;'.indexOf(ch)>=0)return 0.36;if('TY'.indexOf(ch)>=0)return 0.755;if(ch>='A'&&ch<='Z')return 0.8;if(ch>='a'&&ch<='z')return 0.6;return 0.5;}var w=0;for(var i=0;i<label.length;i++)w+=gw(label.charAt(i))*unit;return w+unit*0.05;}
  // 측점: 박스 + 인출선(검정 점선) + 번호/코드
  var lay=computeLabels();
  var bpentArr=[];if(!((typeof LV!=='undefined')&&LV.bpbox===0))(state.bpzones||[]).forEach(function(z,zi){var _br=(512+zi*3).toString(16).toUpperCase();bpentArr[zi]=bpentArr[zi]||[];var path=(z.path&&z.path.length>=2)?z.path:[z.p1,z.p2];var lr=(typeof bpBandLR==='function')?bpBandLR(path,5):null;if(!lr)return;for(var si=0;si<lr.left.length-1;si++){var L1=lr.left[si],L2=lr.left[si+1],R1=lr.right[si],R2=lr.right[si+1];if(_PDF){_pdfFill(L1,L2,R2,R1,242,233,205);}else bpentArr[zi].push(['  0','SOLID','  5',H(),'330',_br,'100','AcDbEntity','  8','BPZONE',' 62','256','420','15919565','440','33554440','100','AcDbTrace',' 10',N(L1[0]),' 20',N(L1[1]),' 30','0',' 11',N(L2[0]),' 21',N(L2[1]),' 31','0',' 12',N(R1[0]),' 22',N(R1[1]),' 32','0',' 13',N(R2[0]),' 23',N(R2[1]),' 33','0'].join('\n'));}});
  for(var _zi=0;_zi<bpentArr.length;_zi++){if(bpentArr[_zi]&&bpentArr[_zi].length)push(['  0','INSERT','  5',H(),'330','17','100','AcDbEntity','  8','BPZONE','100','AcDbBlockReference','  2','BPBAND'+_zi,' 10','0',' 20','0',' 30','0',' 41','1',' 42','1',' 43','1',' 50','0']);}
  if(!(typeof LV!=='undefined'&&LV.roadzone===0)){var _reE=[],_svE=E;E=_reE;(state.roadZones||[]).forEach(function(_z){if(_z&&_z.poly&&_z.poly.length>=3){roadHatch(_z.poly);pline(_z.poly,'ROADZONE',(_z.type==='\uB3C4\uB85C'?1:3),true);}});E=_svE;Array.prototype.unshift.apply(E,_reE);}
  state.points.forEach(function(p,k){
    if(p._riserPt)return;
    if(p._hideMark)return;
    var _bp=/보강판/.test((p.no||'')+'|'+(p.code||''));var _bpHide=_bp&&(typeof bpPtHidden==='function')&&bpPtHidden(p);
    var _LV=(typeof LV!=='undefined')?LV:{};
    if(_bp&&_LV.bp===0)return;
    insert('SD901',p.x,p.y,0.3,'SD901',_bp?2:(isTpoint(p)?1:7));
    var lo=lay[k]||{lx:p.x+1,ly:p.y,anchor:'start'};
    var al=(lo.anchor==='end')?2:0;
    var no=(p.no||'')+'', cd=(state.tamsa&&typeof tamsaTag==='function')?tamsaTag(p):((p.code||'').trim());
    var noOut='';
    if(_bp){noOut=no;}else{var _dp2=no.lastIndexOf('-'),_dt=_dp2>=0?no.slice(0,_dp2):'',_nm=_dp2>=0?no.slice(_dp2+1):no,_sN=(_LV.no!==0),_sD=(_LV.date!==0);if(_dp2>=0){if(_sN&&_sD)noOut=no;else if(_sN)noOut=_nm;else if(_sD)noOut=_dt;}else if(_sN)noOut=no;}
    var cdOut=(cd&&(_bp||_LV.code!==0))?cd:'';
    var _dep=(_bp||_LV.depth===0)?null:(state.tamsa?((p.z!=null&&isFinite(p.z))?p.z:null):(state._depthByNo&&state._depthByNo[p.no]));var _hasDep=(_dep!=null&&isFinite(_dep));
    if(_bpHide){noOut='';cdOut='';}
    if(noOut||cdOut)line(p.x,p.y,lo.lx,lo.ly,'PT_LEADER',7,'DASHED');
    if(noOut)text(lo.lx,lo.ly+TH*0.1,TH,noOut,'PT_LABEL',_bp?2:3,al);
    if(cdOut)text(lo.lx,lo.ly-TH*1.1,TH,cdOut,'PT_CODE',_bp?2:4,al);
    if(_hasDep){var _w3=(typeof pipeDirAt==='function')?pipeDirAt(p):null,_drot3=0,_vA3=1,_dpx=p.x,_dpy=p.y;if(_w3){_drot3=Math.atan2(_w3[1],_w3[0])*180/Math.PI;if(_drot3>90)_drot3-=180;if(_drot3<-90)_drot3+=180;var _th3=_drot3*Math.PI/180,_lux3=-Math.sin(_th3),_luy3=Math.cos(_th3),_tnx=(lo.lx-p.x),_tny=(lo.ly-p.y),_s3=((_lux3*_tnx+_luy3*_tny)<0)?1:-1;_vA3=(_s3>0)?1:3;var _DH=(state.tamsa?TH*0.55:TH*1.1),_gap=_DH*0;_dpx=p.x+_lux3*_s3*_gap;_dpy=p.y+_luy3*_s3*_gap;}text(state.tamsa?p.x:_dpx,state.tamsa?p.y:_dpy,_DH,(Math.round(_dep*100)/100).toFixed(2),'PT_DEPTH',5,1,_drot3,_vA3,state.tamsa?_dpx:null,state.tamsa?_dpy:null);}
  });
  // 결선: LWPOLYLINE (압입=점선) + 지거/압입 멘트(인출선 점선 + 밑줄 + 중앙 글자)
  var LM={'통신관로':['PIPE',1],'지거':['JIGER',2],'압입구간':['PUSH',5]};
  var appLay={'통신관로':1,'지거':1,'압입구간':1,'주입상인출선':1};
  // 백판(수치지도)=앱 레이어 외 라인 → 블록으로 따로 처리(여기선 제외)
  var baseLines=state.lines.filter(function(l){return (l.base||!appLay[l.layer])&&l.pts&&l.pts.length>=2&&!l.insp;});
  state.lines.forEach(function(_L){if(_L.insp&&_L.pts&&_L.pts.length>=2&&!((typeof LV!=='undefined')&&LV.hyun===0))pline(_L.pts,'HYUN',4,false);});
  (state.hyunPts||[]).forEach(function(_hp){if((typeof LV!=='undefined')&&LV.hyun===0)return;var _hcol=({b:4,d:5,s:8,bd:1,db:1})[(_hp[2]||'').toLowerCase()]||3;insert('SD901',_hp[0],_hp[1],0.3,'\ud604\ud669',_hcol);});
  state.lines.forEach(function(Ln){if(!Ln.pts||Ln.pts.length<2)return;if(Ln.base||!appLay[Ln.layer])return;var lm=LM[Ln.layer]||['PIPE',1];
    if(Ln.layer==='압입구간'){pline(Ln.pts,'PUSH',5,false,'DASHED');} // 압입=DASHED 선종 1폴리라인(첨부2 스타일, 가는 점선)
    else pline(Ln.pts,lm[0],lm[1],false);
    if((Ln.layer==='지거'||Ln.layer==='압입구간')&&Ln.note){
      var aw=ptOnPoly(Ln.pts,polyAnchorT(Ln));
      var nx,ny; if(Ln.noteOff){nx=Ln.noteOff[0];ny=-Ln.noteOff[1];} else {nx=aw[0]+1.8;ny=aw[1]+1.3;}
      var lyr=Ln.layer==='압입구간'?'PUSH':'JIGER', lc=Ln.layer==='압입구간'?5:2;
      var dx=nx-aw[0],dy=ny-aw[1],dl=Math.hypot(dx,dy)||1;
      if(dl>2.5){nx=aw[0]+dx/dl*2.5;ny=aw[1]+dy/dl*2.5;} // 인출선 최대 2.5m(혼자 길게 안 나오게)
      var w=tw(Ln.note,TH); var isR=nx>=aw[0]; var u2=isR?nx+w:nx-w;
      pline([[aw[0],aw[1]],[nx,ny],[u2,ny]],lyr+'_LEADER',lc,false); // 인출선+밑줄=실선 폴리라인(떨어짐 없이 붙음)
      text((nx+u2)/2,ny+TH*0.45,TH,Ln.note,lyr+'_LABEL',(Ln.layer==='지거')?6:lc,1);
    }
  });
  // 맨홀/입상주 + 인출선 + 태그(밑줄 위로 띄워 안 겹치게)
  (state.manholes||[]).forEach(function(mh){
    var isRiser=(mh.type==='riser');
    if((typeof LV!=='undefined')&&((isRiser&&LV.riser===0)||(!isRiser&&LV.mh===0)))return;
    var lyr=isRiser?'RISER':'MANHOLE', col=isRiser?5:7;
    if(isRiser){var wB=0.14,wT=0.04,armW=0.24,armY=mh.wy+RH*0.74;
      line(mh.wx-wB,mh.wy,mh.wx-wT,mh.wy+RH,lyr,5);line(mh.wx+wB,mh.wy,mh.wx+wT,mh.wy+RH,lyr,5);
      line(mh.wx-armW,armY,mh.wx+armW,armY,lyr,5);circle(mh.wx,mh.wy+RH,wT+0.05,lyr,5);
    } else {insert('SD100',mh.wx,mh.wy,0.5,'SD100',7);}
    var MTH=TH*1.7; var w=tw(mhDisp(mh),MTH);
    var _p=mhLabelBase(mh,w); var lx=_p.lx, lyy=_p.ly;
    var isRight=(lx>=mh.wx);
    var uw=w+MTH*0.12+1.2; var ux2=isRight?lx+uw:lx-uw; // 밑줄=글자폭+여유 +1.2m 연장(종훈님 CAD 실측)
    pline([[mh.wx,mh.wy],[lx,lyy],[ux2,lyy]],lyr,col,false,null,null,0.10); // 대각선+밑줄=폴리선 1개(붙음)
    if(mh.label)text((lx+ux2)/2,lyy+MTH*0.45,MTH,mhDisp(mh),lyr+'_LABEL',col,1); // 꺾임점 기준 정렬(R=좌0,L=우2)
  });
  // 보강판 구역(관로결선 ±5M 밴드 + 연한 해치 + 태그/인출선) — true color 보강판색(#B8860B)
  if(!((typeof LV!=='undefined')&&LV.bpbox===0))(state.bpzones||[]).forEach(function(z,zi){var _br=(512+zi*3).toString(16).toUpperCase();bpentArr[zi]=bpentArr[zi]||[];
    var BPTC=12092939;
    function bpLine(x1,y1,x2,y2){push(['0','LINE','5',H(),'330','17','100','AcDbEntity','8','BPZONE','62','256','420',String(BPTC),'100','AcDbLine','10',N(x1),'20',N(y1),'30','0','11',N(x2),'21',N(y2),'31','0']);}
    var path=(z.path&&z.path.length>=2)?z.path:[z.p1,z.p2];
    var poly=(typeof bpOffsetBand==='function')?bpOffsetBand(path,5):null;if(!poly)return;
    for(var pi=0;pi<poly.length;pi++){var a=poly[pi],b=poly[(pi+1)%poly.length];bpentArr[zi].push(['  0','LINE','  5',H(),'330',_br,'100','AcDbEntity','  8','BPZONE',' 62','256','420',String(BPTC),'100','AcDbLine',' 10',N(a[0]),' 20',N(a[1]),' 30','0',' 11',N(b[0]),' 21',N(b[1]),' 31','0'].join('\n'));}
    
    var mid=path[Math.floor(path.length/2)];
    if(z.lx==null||z.ly==null){z.lx=mid[0];z.ly=mid[1]+10;}
    var _ft=(typeof bpFootOnPoly==='function')?bpFootOnPoly(poly,z.lx,z.ly):mid;bpLine(_ft[0],_ft[1],z.lx,z.ly);
    var _nt=z.note||'\uBCF4\uAC15\uD310 \uC9C0\uC5ED',_es=uesc(_nt),_hg=false;for(var _k=0;_k<_nt.length;_k++){if(_nt.charCodeAt(_k)>127){_hg=true;break;}}
    var ta=['0','TEXT','5',H(),'330','17','100','AcDbEntity','8','BPZONE','62','256','420','7032320','100','AcDbText','10',N(z.lx),'20',N(z.ly),'30','0','40',N(TH*3.2),'1',_es];if(_hg)ta.push('7','HANGUL');ta.push('72','1','11',N(z.lx),'21',N(z.ly),'31','0','100','AcDbText');push(ta);
  });
  // ===== 백판(수치지도)을 단일 블록 BACKDROP 으로 묶기 (CAD에서 통째로 선택) =====
  var PREx=PRE;
  if(_PDF){baseLines.forEach(function(L){pline(L.pts,'0',8,false);});}
  if(baseLines.length&&!_PDF){
    var BR='F0',BK='F1',EB='F2';                 // 미사용 핸들(충돌 검증됨)
    var bent=[];                                 // 블록 내부 폴리라인(owner=BLOCK_RECORD BR, 회색8, 레이어0)
    baseLines.forEach(function(L){
      var a=['  0','LWPOLYLINE','  5',H(),'330',BR,'100','AcDbEntity','  8','0',' 62',(L.crop?'7':'8')];if(!L.crop)a.push('420','12369084');a.push('100','AcDbPolyline',' 90',String(L.pts.length),' 70','0');
      for(var i=0;i<L.pts.length;i++){a.push(' 10',N(L.pts[i][0]),' 20',N(L.pts[i][1]));}
      bent.push(a.join('\n'));
    });
    (state.baseTexts||[]).forEach(function(t){if(!t||!t.text)return;var hg=/[^\x00-\x7F]/.test(t.text);var es=uesc(t.text);var a=['  0','TEXT','  5',H(),'330',BR,'100','AcDbEntity','  8','0',' 62','8','100','AcDbText',' 10',N(t.x),' 20',N(t.y),' 30','0',' 40',N(t.h||0.5),'  1',es];if(hg)a.push('  7','HANGUL');a.push(' 72','0',' 11',N(t.x),' 21',N(t.y),' 31','0','100','AcDbText');bent.push(a.join('\n'));});
    // 모델스페이스에 INSERT 1개(BACKDROP 참조, 원점·배율1)
    push(['  0','INSERT','  5',H(),'330','17','100','AcDbEntity','  8','0','100','AcDbBlockReference','  2','BACKDROP',' 10','0',' 20','0',' 30','0',' 41','1',' 42','1',' 43','1',' 50','0']);
    // BLOCK_RECORD 주입(테이블 ENDTAB 앞)
    var brStr=['  0','BLOCK_RECORD','  5',BR,'330','9','100','AcDbSymbolTableRecord','100','AcDbBlockTableRecord','  2','BACKDROP'].join('\n')+'\n';
    PREx=PREx.replace('340\n1E\n  0\nENDTAB','340\n1E\n'+brStr+'  0\nENDTAB');
    // BLOCK 정의 주입(BLOCKS ENDSEC 앞)
    var blkBegin=['  0','BLOCK','  5',BK,'330',BR,'100','AcDbEntity','  8','0','100','AcDbBlockBegin','  2','BACKDROP',' 70','0',' 10','0.0',' 20','0.0',' 30','0.0','  3','BACKDROP','  1',''].join('\n');
    var blkEnd=['  0','ENDBLK','  5',EB,'330',BR,'100','AcDbEntity','  8','0','100','AcDbBlockEnd'].join('\n');
    var blkStr=blkBegin+'\n'+bent.join('\n')+'\n'+blkEnd+'\n';
    PREx=PREx.replace('AcDbBlockEnd\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES','AcDbBlockEnd\n'+blkStr+'  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES');
  }
  var _bpBrAll='',_bpBlkAll='';for(var _zi=0;_zi<bpentArr.length;_zi++){if(!bpentArr[_zi]||!bpentArr[_zi].length)continue;var _br=(512+_zi*3).toString(16).toUpperCase(),_bk=(512+_zi*3+1).toString(16).toUpperCase(),_eb=(512+_zi*3+2).toString(16).toUpperCase();_bpBrAll+=['  0','BLOCK_RECORD','  5',_br,'330','9','100','AcDbSymbolTableRecord','100','AcDbBlockTableRecord','  2','BPBAND'+_zi].join('\n')+'\n';var _bb=['  0','BLOCK','  5',_bk,'330',_br,'100','AcDbEntity','  8','BPZONE','100','AcDbBlockBegin','  2','BPBAND'+_zi,' 70','0',' 10','0.0',' 20','0.0',' 30','0.0','  3','BPBAND'+_zi,'  1',''].join('\n');var _be=['  0','ENDBLK','  5',_eb,'330',_br,'100','AcDbEntity','  8','BPZONE','100','AcDbBlockEnd'].join('\n');_bpBlkAll+=_bb+'\n'+bpentArr[_zi].join('\n')+'\n'+_be+'\n';}if(_bpBrAll){var _anc=baseLines.length?'  2\nBACKDROP\n  0\nENDTAB':'340\n1E\n  0\nENDTAB';var _pre=baseLines.length?'  2\nBACKDROP\n':'340\n1E\n';PREx=PREx.replace(_anc,_pre+_bpBrAll+'  0\nENDTAB');PREx=PREx.replace('AcDbBlockEnd\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES','AcDbBlockEnd\n'+_bpBlkAll+'  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES');}
  // ===== 측점/맨홀 표준 블럭 SD901(X자)/SD100(이중원) 주입 — 중앙 POINT로 Node 스냅 =====
  (function(){
    var L1='  0\nLAYER\n  5\nDC\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nSD901\n 70\n0\n 62\n7\n  6\nContinuous\n370\n-3\n390\n13\n';
    var L2='  0\nLAYER\n  5\nDD\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nSD100\n 70\n0\n 62\n7\n  6\nContinuous\n370\n-3\n390\n13\n';
    PREx=PREx.replace('390\n13\n  0\nENDTAB','390\n13\n'+L1+L2+'  0\nENDTAB');
    var BR1='  0\nBLOCK_RECORD\n  5\nD0\n330\n9\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n  2\nSD901\n';
    var BR2='  0\nBLOCK_RECORD\n  5\nD6\n330\n9\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n  2\nSD100\n';
    PREx=PREx.replace('  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nBLOCKS',BR1+BR2+'  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nBLOCKS');
    var DEF1='  0\nBLOCK\n  5\nD1\n330\nD0\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockBegin\n  2\nSD901\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\nSD901\n  1\n\n'+'  0\nLINE\n  5\nD3\n330\nD0\n100\nAcDbEntity\n  8\n0\n 62\n0\n100\nAcDbLine\n 10\n-0.19\n 20\n0.19\n 30\n0\n 11\n0.19\n 21\n-0.19\n 31\n0\n'+'  0\nLINE\n  5\nD4\n330\nD0\n100\nAcDbEntity\n  8\n0\n 62\n0\n100\nAcDbLine\n 10\n-0.19\n 20\n-0.19\n 30\n0\n 11\n0.19\n 21\n0.19\n 31\n0\n'+'  0\nPOINT\n  5\nD5\n330\nD0\n100\nAcDbEntity\n  8\n0\n 62\n0\n100\nAcDbPoint\n 10\n0\n 20\n0\n 30\n0\n'+'  0\nENDBLK\n  5\nD2\n330\nD0\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockEnd\n';
    var DEF2='  0\nBLOCK\n  5\nD7\n330\nD6\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockBegin\n  2\nSD100\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\nSD100\n  1\n\n'+'  0\nCIRCLE\n  5\nD9\n330\nD6\n100\nAcDbEntity\n  8\n0\n 62\n0\n100\nAcDbCircle\n 10\n0\n 20\n0\n 30\n0\n 40\n0.504\n'+'  0\nCIRCLE\n  5\nDA\n330\nD6\n100\nAcDbEntity\n  8\n0\n 62\n0\n100\nAcDbCircle\n 10\n0\n 20\n0\n 30\n0\n 40\n0.75\n'+'  0\nPOINT\n  5\nDB\n330\nD6\n100\nAcDbEntity\n  8\n0\n 62\n0\n100\nAcDbPoint\n 10\n0\n 20\n0\n 30\n0\n'+'  0\nENDBLK\n  5\nD8\n330\nD6\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockEnd\n';
    PREx=PREx.replace('  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES',DEF1+DEF2+'  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES');
  })();
    // ===== 타이틀블록 DXF (BUILD 291) =====
  (function(){
    if(typeof tbLayout!=='function')return;
    var L=tbLayout(true); if(!L)return;
    var LY='TBLOCK', CN={name:7,label:7,red:1,blue:5}, bx=L.box;
    line(bx.x,bx.y,bx.x+bx.w,bx.y,LY,1); line(bx.x,bx.y+bx.h,bx.x+bx.w,bx.y+bx.h,LY,1);
    line(bx.x,bx.y,bx.x,bx.y+bx.h,LY,1); line(bx.x+bx.w,bx.y,bx.x+bx.w,bx.y+bx.h,LY,1);
    if(L.subBox){var _sb=L.subBox;line(_sb.x,_sb.y,_sb.x+_sb.w,_sb.y,LY,5);line(_sb.x,_sb.y+_sb.h,_sb.x+_sb.w,_sb.y+_sb.h,LY,5);line(_sb.x,_sb.y,_sb.x,_sb.y+_sb.h,LY,5);line(_sb.x+_sb.w,_sb.y,_sb.x+_sb.w,_sb.y+_sb.h,LY,5);}
    L.items.forEach(function(t){ if(t.s==='')return; var al=(t.a==='middle')?1:0; text(t.x,t.y,t.h,t.s,LY,CN[t.c]||7,al,0,0); });
  })();
if(!((typeof LV!=='undefined')&&LV.depthchk===0))(state.depthCheck||[]).forEach(function(b){circle(b.x,b.y,1.2,'DEPTHCHK',6);var ex=(b._dx!=null)?b._dx:b.x+8,ey=(b._dy!=null)?b._dy:b.y-8;var _qx=ex-b.x,_qy=ey-b.y,_ql=Math.hypot(_qx,_qy)||1;line(b.x+_qx/_ql*1.2,b.y+_qy/_ql*1.2,ex,ey,'DEPTHCHK',6);var anc=(ex>=b.x?0:2);text(ex+(ex>=b.x?0.3:-0.3),ey,TH*1.8,'\uAE30\uC900\uC2EC\uB3C4\uBBF8\uB2EC','DEPTHCHK',6,anc);});if(!((typeof LV!=='undefined')&&LV.tgcmp===0)&&state.tangoEdit&&state.tangoEdit.points){var _co=state._pointsOrig||state.points||[],_cc=state.tangoEdit.points||[],_cod=state._depthOrig||state._depthByNo||{},_ccd=state.tangoEdit.depthByNo||{};var _cn={},_on={};_cc.forEach(function(p){_cn[p.no]=p;});_co.forEach(function(p){_on[p.no]=p;});_co.forEach(function(p){if(!_cn[p.no]){circle(p.x,p.y,1.2,'TGCMP',1);text(p.x,p.y+2,TH*1.8,'삭제','TGCMP',1,1);}});_cc.forEach(function(p){if(!_on[p.no]){circle(p.x,p.y,1.2,'TGCMP',5);text(p.x,p.y+2,TH*1.8,'추가','TGCMP',5,1);}});_cc.forEach(function(p){if(_on[p.no]){var _a=_cod[p.no],_b=_ccd[p.no];var _an=(_a==null||_a==='')?null:+_a,_bn=(_b==null||_b==='')?null:+_b;if(_an!==_bn&&(_an!=null||_bn!=null)){circle(p.x,p.y,1.2,'TGCMP',3);text(p.x,p.y+2,TH*1.8,(_an!=null?_an.toFixed(2):'-')+'→'+(_bn!=null?_bn.toFixed(2):'-'),'TGCMP',3,1);}}});}
  if(_PDF){try{_pdfFlush();var pfn=((state.projectName||'survey').replace(/[^\\w\\uAC00-\\uD7A3\\-]/g,'_'))+'.pdf';_PDF.doc.save(pfn);toast('PDF \\uC800\\uC7A5\\uB428');}catch(e){toast('PDF \\uC624\\uB958');}_PDF=null;return;}
  var dxf=PREx+E.join('\n')+'\n'+SUF;
  if(returnStr)return dxf;
  var blob=new Blob([dxf],{type:'application/dxf'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=((state.projectName||'survey').replace(/[^\w가-힣\-]/g,'_'))+'.dxf';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},1500);
  toast('DXF 내보내기 완료 — 다운로드됨');
}
function renderDraft(){clearSvg(gDraft);previewLine=null;if(!lineDraft)return;
  var col=(LINECOL[drawLayer]||{}).c||'#d92b2b', lw=(LINECOL[drawLayer]||{}).w||1.6;
  for(var i=1;i<lineDraft.length;i++){var a=S(lineDraft[i-1][0],lineDraft[i-1][1]),b=S(lineDraft[i][0],lineDraft[i][1]);
    gDraft.appendChild(el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:col,'stroke-width':lw,'stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke','pointer-events':'none'}));}
  lineDraft.forEach(function(p){var s=S(p[0],p[1]);gDraft.appendChild(el('line',{x1:s[0],y1:s[1],x2:s[0],y2:s[1],stroke:'#1f6fd6','stroke-width':8,'stroke-linecap':'round','vector-effect':'non-scaling-stroke','pointer-events':'none'}));});
  drawIndicators(null);}
function drawIndicators(cw){clearSvg(gDraw);if(mode!=='line'||!lineDraft)return;
  if(cw){var ns=nearestSnapWorld(cw[0],cw[1]);if(ns.pt&&ns.d<vb.w*0.04){var s2=S(ns.pt[0],ns.pt[1]);gDraw.appendChild(el('line',{x1:s2[0],y1:s2[1],x2:s2[0],y2:s2[1],stroke:'#1f6fd6','stroke-width':10,'stroke-linecap':'round','vector-effect':'non-scaling-stroke','pointer-events':'none'}));}}}
function delHoverHighlight(cw){clearSvg(gDraw);var best=null,bd=1e18;
  state.lines.forEach(function(L){if(L.base||(mode!=='delall2'&&L.layer!==delLayer))return;for(var s=0;s<L.pts.length-1;s++){var a=S(L.pts[s][0],L.pts[s][1]),b=S(L.pts[s+1][0],L.pts[s+1][1]);var d=segDist(cw[0],cw[1],a[0],a[1],b[0],b[1]);if(d<bd){bd=d;best={a:a,b:b,layer:L.layer};}}});
  if(best&&bd<vb.w*0.03){var col=(LINECOL[best.layer]||{}).c||'#d92b2b';gDraw.appendChild(el('line',{x1:best.a[0],y1:best.a[1],x2:best.b[0],y2:best.b[1],stroke:col,'stroke-width':6,'stroke-opacity':0.4,'vector-effect':'non-scaling-stroke','stroke-linecap':'round','pointer-events':'none'}));}
  if(mode==='delall2'){ // 검수 써클·박스도 마우스가 위에 오면 두껍게
    var mb=-1,mbd=1e18;
    state.markups.forEach(function(m,i){var cx=m.type==='cir'?m.cx:(m.x+m.w/2),cy=m.type==='cir'?m.cy:(m.y+m.h/2);var rr=m.type==='cir'?Math.max(m.rx,m.ry):Math.max(m.w,m.h)/2;var d=Math.hypot(cw[0]-cx,cw[1]-cy);if(d<rr+vb.w*0.015&&d<mbd){mbd=d;mb=i;}});
    if(mb>=0){var m=state.markups[mb];var sh=m.type==='cir'?el('ellipse',{cx:m.cx,cy:m.cy,rx:m.rx,ry:m.ry}):el('rect',{x:m.x,y:m.y,width:m.w,height:m.h,rx:0.4});sh.setAttribute('fill','none');sh.setAttribute('stroke',MKCOL[m.status]||'#d32f2f');sh.setAttribute('stroke-width',7);sh.setAttribute('stroke-opacity',0.55);sh.setAttribute('vector-effect','non-scaling-stroke');sh.setAttribute('pointer-events','none');gDraw.appendChild(sh);}
  }
}
function startDraw(layer){drawLayer=layer||'통신관로';mode='line';setModeUI();lineDraft=[];clearSvg(gDraft);clearSvg(gDraw);toast((drawLayer==='지거'?'지거선':(drawLayer==='압입구간'?'압입구간':'관로선'))+' 그리기: 점 클릭 → Enter/Space 또는 "완료" (되돌리기=한 점 취소)');}
function finishDraw(){if(lineDraft&&lineDraft.length>=2){pushHist();var rec={layer:drawLayer,pts:lineDraft.slice()};if(drawLayer==='지거'){rec.note='점(번호 :  )';}else if(drawLayer==='압입구간'){rec.note='압입구간 ';}state.lines.push(rec);if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME&&rec.layer==='통신관로'&&typeof rtAutoTags==='function')rtAutoTags(rec);}lineDraft=null;previewLine=null;clearSvg(gDraft);clearSvg(gDraw);mode='pan';setModeUI();drawGeo();updMeta();}
function clearLines(){pushHist();state.lines=state.lines.filter(function(l){return l.layer!=='통신관로';});drawGeo();updMeta();toast('결선 모두 삭제');}
// 수치지도 백판 전체 삭제 (앱 레이어=통신관로·지거·압입·주입상인출선 외 모두 = 백판)
function clearBaseMap(){
  var app={'통신관로':1,'지거':1,'압입구간':1,'주입상인출선':1};
  var isBase=function(l){return l.base||!app[l.layer];};
  var n=state.lines.filter(isBase).length;
  if(!n){toast('삭제할 백판이 없습니다');return;}
  pushHist();
  state.lines=state.lines.filter(function(l){return !isBase(l);});
  drawGeo();updMeta();toast('백판(수치지도) '+n+'개 라인 전체 삭제');
}
function clearAllDraw(){pushHist();state.lines=state.lines.filter(function(l){return l.layer!=='통신관로'&&l.layer!=='지거';});redrawAll();updMeta();toast('관로선·지거선 전체삭제');}
function clearAllSym(){
  var nL=(state.lines||[]).length, nM=(state.manholes||[]).length;
  if(!nL&&!nM){toast('지울 선·심벌이 없습니다');return;}
  pushHist();
  state.lines=[];           // 관로·지거·압입 전부
  state.manholes=[];        // 맨홀·입상주 (인출선 포함)
  if(lineDraft){lineDraft=null;clearSvg(gDraft);clearSvg(gDraw);mode='pan';setModeUI();}
  redrawAll();updMeta();
  toast('선·심벌 전체 삭제 ('+nL+'선·'+nM+'심벌 / 되돌리기로 복구)');
}
function segDist(px,py,ax,ay,bx,by){var dx=bx-ax,dy=by-ay,L2=dx*dx+dy*dy,t=L2?((px-ax)*dx+(py-ay)*dy)/L2:0;t=Math.max(0,Math.min(1,t));var cx=ax+t*dx,cy=ay+t*dy;return Math.hypot(px-cx,py-cy);}
function deleteSegmentAt(wx,wy){
  var best=null,bd=1e18;
  state.lines.forEach(function(L,li){ if(L.base||(mode!=='delall2'&&L.layer!==delLayer))return;
    for(var s=0;s<L.pts.length-1;s++){var a=S(L.pts[s][0],L.pts[s][1]),b=S(L.pts[s+1][0],L.pts[s+1][1]);
      var d=segDist(wx,wy,a[0],a[1],b[0],b[1]); if(d<bd){bd=d;best={li:li,si:s};}}});
  if(!best||bd>vb.w*0.03){toast('지울 선에 더 가까이 클릭하세요');return;}
  pushHist();
  var L=state.lines[best.li],left=L.pts.slice(0,best.si+1),right=L.pts.slice(best.si+1),repl=[];
  if(left.length>=2)repl.push({layer:L.layer,pts:left,note:L.note});
  if(right.length>=2)repl.push({layer:L.layer,pts:right});
  state.lines.splice.apply(state.lines,[best.li,1].concat(repl));
  clearSvg(gDraw);drawGeo();updMeta();toast('선 1개 삭제');
}
// 통합 지우기에서 검수 표시(써클·박스·중복원) 클릭 삭제
function deleteMarkupAt(wx,wy){
  var best=-1,bd=1e18;
  state.markups.forEach(function(m,i){
    var cx=m.type==='cir'?m.cx:(m.x+m.w/2), cy=m.type==='cir'?m.cy:(m.y+m.h/2);
    var rr=m.type==='cir'?Math.max(m.rx,m.ry):Math.max(m.w,m.h)/2;
    var d=Math.hypot(wx-cx,wy-cy);
    if(d<rr+vb.w*0.015 && d<bd){bd=d;best=i;}
  });
  if(best<0)return false;
  pushHist();var m=state.markups[best];if(m.el)m.el.remove();state.markups.splice(best,1);
  drawMarks();updMeta();toast('검수 표시 삭제');return true;
}

/* ====== 모드 UI ====== */
var lastStartAction=null; // 엔터/스페이스로 다시 시작할 '바로 전 시작 기능'
function setModeUI(){if(mode!=='bpcrop'&&typeof bpCrop!=='undefined'&&bpCrop){bpCrop=null;if(typeof gDraft!=='undefined'&&gDraft&&typeof clearSvg==='function'){try{clearSvg(gDraft);}catch(e){}}}
  if(mode==='mhplace')lastStartAction=function(){mode='mhplace';setModeUI();toast('맨홀심기 — 클릭해 심기');};
  else if(mode==='riserplace')lastStartAction=function(){mode='riserplace';setModeUI();toast('입상주심기 — 클릭해 심기');};
  else if(mode==='line')lastStartAction=function(){startDraw(drawLayer);};
  if(mode!=='measure'){measurePts=[];if(typeof gMeasure!=='undefined'&&gMeasure)clearSvg(gMeasure);clearLabels('measure');}renderSub();cv.classList.toggle('draw',mode!=='pan'&&mode!=='mhplace'&&mode!=='delmh'&&mode!=='riserplace'&&mode!=='delriser'&&mode!=='delall2'&&mode!=='ptins'&&mode!=='ptdel');if(mode==='ptins'||mode==='bpcrop'||mode==='tglineedit'||mode==='tglinedel'){cv.style.cursor='crosshair';}else if(mode==='bperase'||mode==='tgptedit'){cv.style.cursor='pointer';}else if(mode==='mhplace'||mode==='delmh'||mode==='riserplace'||mode==='delriser'||mode==='delall2'||mode==='ptdel'){cv.style.cursor='default';}else{cv.style.cursor='';}}
function setStatusUI(){renderSub();}

/* ====== 포인터 ====== */
var dragging=false,startC=null,startVB=null,drawing=false,cur=null,sx=0,sy=0,midPanning=false;var pendAct=null;function startPanFrom(e){dragging=true;startC=[e.clientX,e.clientY];startVB={x:vb.x,y:vb.y,w:vb.w,h:vb.h};try{cv.setPointerCapture(e.pointerId);}catch(x){}}
var activePtrs={},pinch=null,noteDrag=null,_lastNoteTap={i:-1,t:0};
function hitNote(clientX,clientY){var w=toWorld(clientX,clientY),tol=pxToWorld()*18;for(var i=0;i<state.markups.length;i++){var m=state.markups[i];if(m.near==='특이사항'&&Math.hypot(m.cx-w[0],m.cy-w[1])<((m.rx||1.2)+tol))return i;}return -1;}
var hyunDraw=null;
var hyunSnapMk=document.createElementNS(SVGNS,'circle');hyunSnapMk.setAttribute('fill','#ff6f0022');hyunSnapMk.setAttribute('stroke','#ff6f00');hyunSnapMk.setAttribute('stroke-width','3');hyunSnapMk.setAttribute('vector-effect','non-scaling-stroke');hyunSnapMk.setAttribute('pointer-events','none');hyunSnapMk.style.display='none';cv.appendChild(hyunSnapMk);var roadSnapMk=document.createElementNS(SVGNS,'circle');roadSnapMk.setAttribute('fill','#e1111a');roadSnapMk.setAttribute('stroke','#b00');roadSnapMk.setAttribute('stroke-width','4');roadSnapMk.setAttribute('vector-effect','non-scaling-stroke');roadSnapMk.setAttribute('pointer-events','none');roadSnapMk.style.display='none';cv.appendChild(roadSnapMk);var roadRubber=document.createElementNS(SVGNS,'line');roadRubber.setAttribute('stroke','#e11');roadRubber.setAttribute('stroke-width','2');roadRubber.setAttribute('stroke-dasharray','5 3');roadRubber.setAttribute('vector-effect','non-scaling-stroke');roadRubber.setAttribute('pointer-events','none');roadRubber.style.display='none';cv.appendChild(roadRubber);
function hyunSnap(wi){var bp=null,bd=1e18;(state.hyunPts||[]).forEach(function(h){var dx=h[0]-wi[0],dy=(-h[1])-wi[1],d=dx*dx+dy*dy;if(d<bd){bd=d;bp=[h[0],h[1]];}});return {pt:bp,d:Math.sqrt(bd)};}
function roadFollowFinish(wi){if(!roadFollow||!state.roadZones||!state.roadZones[roadFollow.zi])return;var p1=roadFollow.p1;function D(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}var lines=(state.lines||[]).filter(function(L){return L.insp&&L.pts&&L.pts.length>=2&&(L.layer==='\uBCF4\uB3C4'||L.layer==='\uB3C4\uB85C');});if(!lines.length){toast('\uD604\uD669\uC120\uC774 \uC5C6\uC2B5\uB2C8\uB2E4');return;}var nodes=[],key={};function nid(p){var k=p[0].toFixed(2)+','+p[1].toFixed(2);if(key[k]!=null)return key[k];key[k]=nodes.length;nodes.push([p[0],p[1]]);return key[k];}var adj=[];function ens(i){while(adj.length<=i)adj.push([]);}function link(a,b,w){if(a===b)return;ens(a);ens(b);adj[a].push([b,w]);adj[b].push([a,w]);}lines.forEach(function(L){for(var i=0;i<L.pts.length-1;i++)link(nid(L.pts[i]),nid(L.pts[i+1]),D(L.pts[i],L.pts[i+1]));});var ends=[];lines.forEach(function(L){ends.push(nid(L.pts[0]));ends.push(nid(L.pts[L.pts.length-1]));});for(var a=0;a<ends.length;a++)for(var b=a+1;b<ends.length;b++){if(ends[a]===ends[b])continue;var w=D(nodes[ends[a]],nodes[ends[b]]);if(w<=40&&w>0.01)link(ends[a],ends[b],w*3);}function nearest(pt,scr){var bi=-1,bb=1e18;for(var i=0;i<nodes.length;i++){var dx=nodes[i][0]-pt[0],dy=(scr?(-nodes[i][1]):nodes[i][1])-pt[1],d=dx*dx+dy*dy;if(d<bb){bb=d;bi=i;}}return bi;}var sN=nearest(p1,false),tN=nearest(wi,true);if(sN<0||tN<0){toast('\uC810\uC744 \uCC3E\uC9C0 \uBABB\uD568');return;}var N=nodes.length,dist=[],prev=[],vis=[],i;for(i=0;i<N;i++){dist.push(1e18);prev.push(-1);vis.push(false);}dist[sN]=0;for(var it=0;it<N;it++){var u=-1,ub=1e18;for(i=0;i<N;i++){if(!vis[i]&&dist[i]<ub){ub=dist[i];u=i;}}if(u<0)break;vis[u]=true;if(u===tN)break;ens(u);adj[u].forEach(function(e){var nd=dist[u]+e[1];if(nd<dist[e[0]]){dist[e[0]]=nd;prev[e[0]]=u;}});}if(dist[tN]>=1e18){toast('\uACBD\uB85C\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4');return;}var pathN=[tN];while(pathN[pathN.length-1]!==sN)pathN.push(prev[pathN[pathN.length-1]]);pathN.reverse();var path=pathN.map(function(i){return [nodes[i][0],nodes[i][1]];});var z=state.roadZones[roadFollow.zi];if(typeof pushHist==='function')pushHist();for(var k=1;k<path.length;k++)z.poly.splice(roadFollow.vi+k,0,path[k]);var _nvi=roadFollow.vi+(path.length-1);roadFollow={zi:roadFollow.zi,vi:_nvi,p1:[path[path.length-1][0],path[path.length-1][1]]};try{roadSnapMk.style.display='none';}catch(e){}if(typeof classifyRoad==='function')classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();toast('\uC774\uC5B4\uC9D0 ('+path.length+'\uC810) \u00B7 \uACC4\uC18D \uCC0D\uAE30, \uC2A4\uD398\uC774\uC2A4=\uC644\uB8CC');}
function hyunFinish(dropLast){if(!hyunDraw||!hyunDraw.pts||hyunDraw.pts.length<2)return false;var _pp=hyunDraw.pts.slice();if(dropLast&&_pp.length>=3){var _a=_pp[_pp.length-1],_b=_pp[_pp.length-2];if(Math.hypot(_a[0]-_b[0],_a[1]-_b[1])<pxToWorld()*4)_pp.pop();}if(_pp.length<2)return false;if(typeof pushHist==='function')pushHist();state.lines.push({layer:hyunDraw.layer,pts:_pp,insp:true});hyunDraw=null;hyunSnapMk.style.display='none';roadRubber.style.display='none';if(typeof saveProject==='function')saveProject();drawGeo();toast('\uD604\uD669\uC120 \uCD94\uAC00');return true;}
cv.addEventListener('pointermove',function(ev){if(mode==='roadfollow'){var _w=toWorld(ev.clientX,ev.clientY),_bb=1e18,_bp=null;(state.lines||[]).forEach(function(L){if(!L.insp||!L.pts||(L.layer!=='\uBCF4\uB3C4'&&L.layer!=='\uB3C4\uB85C'))return;L.pts.forEach(function(q){var dx=q[0]-_w[0],dy=(-q[1])-_w[1],d=dx*dx+dy*dy;if(d<_bb){_bb=d;_bp=q;}});});(state.hyunPts||[]).forEach(function(q){var dx=q[0]-_w[0],dy=(-q[1])-_w[1],d=dx*dx+dy*dy;if(d<_bb){_bb=d;_bp=q;}});if(_bp&&Math.sqrt(_bb)<=pxToWorld()*20){var _sc=S(_bp[0],_bp[1]);roadSnapMk.setAttribute('cx',_sc[0]);roadSnapMk.setAttribute('cy',_sc[1]);roadSnapMk.setAttribute('r',pxToWorld()*7);roadSnapMk.style.display='';}else{_bp=null;roadSnapMk.style.display='none';}if(roadFollow){var _a=S(roadFollow.p1[0],roadFollow.p1[1]),_e=_bp?S(_bp[0],_bp[1]):[_w[0],_w[1]];roadRubber.setAttribute('x1',_a[0]);roadRubber.setAttribute('y1',_a[1]);roadRubber.setAttribute('x2',_e[0]);roadRubber.setAttribute('y2',_e[1]);roadRubber.style.display='';}else roadRubber.style.display='none';if(hyunSnapMk.style.display!=='none')hyunSnapMk.style.display='none';return;}if(mode!=='hyunroad'&&mode!=='hyunwalk'){if(hyunSnapMk.style.display!=='none')hyunSnapMk.style.display='none';if(roadSnapMk.style.display!=='none')roadSnapMk.style.display='none';if(roadRubber.style.display!=='none')roadRubber.style.display='none';return;}var wi=toWorld(ev.clientX,ev.clientY);var sn=hyunSnap(wi);if(sn.pt&&sn.d<=pxToWorld()*15){var sc=S(sn.pt[0],sn.pt[1]);hyunSnapMk.setAttribute('cx',sc[0]);hyunSnapMk.setAttribute('cy',sc[1]);hyunSnapMk.setAttribute('r',pxToWorld()*11);hyunSnapMk.style.display='';}else{hyunSnapMk.style.display='none';}if(hyunDraw&&hyunDraw.pts&&hyunDraw.pts.length>0){var _lp=hyunDraw.pts[hyunDraw.pts.length-1];var _cpt=(sn.pt&&sn.d<=pxToWorld()*15)?sn.pt:[wi[0],-wi[1]];var _ra=S(_lp[0],_lp[1]),_re=S(_cpt[0],_cpt[1]);roadRubber.setAttribute('x1',_ra[0]);roadRubber.setAttribute('y1',_ra[1]);roadRubber.setAttribute('x2',_re[0]);roadRubber.setAttribute('y2',_re[1]);roadRubber.style.display='';}else{roadRubber.style.display='none';}});
cv.addEventListener('pointerdown',function(e){
  if(typeof _tgMode==='function'&&_tgMode()&&mode!=='pan'&&mode!=='tgptedit'&&mode!=='tglineedit'&&mode!=='tglinedel'&&mode!=='measure'&&mode!=='tgsegfix'){if(typeof toast==='function')toast('탱고성과 제작 중에는 검수 편집도구를 쓸 수 없습니다');mode='pan';if(typeof setModeUI==='function')setModeUI();return;}
  if(mode==='bpcrop'&&e.button===0){var w=toWorld(e.clientX,e.clientY);bpCrop={sx:w[0],sy:w[1],ex:w[0],ey:w[1]};try{cv.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();return;}
  if(mode==='bperase'&&e.button===0){bpEraseAt(toWorld(e.clientX,e.clientY));e.preventDefault();return;}
  if(e.pointerType==='touch'){activePtrs[e.pointerId]={x:e.clientX,y:e.clientY};
    var pids=Object.keys(activePtrs);
    if(pids.length>=2){ // 두 손가락 = 핀치 확대/축소(+이동)
      dragging=false;midPanning=false;drawing=false;pendAct=null;cv.style.cursor='';
      var pa=activePtrs[pids[0]],pb=activePtrs[pids[1]];
      var pmx=(pa.x+pb.x)/2,pmy=(pa.y+pb.y)/2;
      pinch={d0:Math.max(1,Math.hypot(pa.x-pb.x,pa.y-pb.y)),w0:toWorld(pmx,pmy),vbw0:vb.w,vbh0:vb.h};
      try{cv.setPointerCapture(e.pointerId);}catch(x){}
      return;
    }
  }
  /* [BUILD 803] 특이사항 완료 후 고정: viewer에서 드래그로 안 잡히게 (실수 이동 방지) */
  if(rvPick&&e.button===0){e.preventDefault();pickRoadview(e.clientX,e.clientY);return;}
  if(noteMode&&e.button===0){e.preventDefault();addNote(e.clientX,e.clientY);return;}
  if(e.button===1){e.preventDefault();midPanning=true;startC=[e.clientX,e.clientY];startVB={x:vb.x,y:vb.y,w:vb.w,h:vb.h};cv.style.cursor='grabbing';try{cv.setPointerCapture(e.pointerId);}catch(x){}return;}
  if(mode==='pan'){/* 측점/맨홀 위=선택(pointerup), 빈 곳 드래그=화면이동 */
    if(typeof _tgMode==='function'&&_tgMode()&&e.button===0){var _tw2=toWorld(e.clientX,e.clientY);var _twx=_tw2[0],_twy=-_tw2[1];var _tp2=(typeof nearBpPoint==='function')?nearBpPoint(_twx,_twy):null;var _mTol=Math.max((typeof pxToWorld==='function')?pxToWorld()*22:3,1.5);var _mm=null,_mmd=1e18;(state.manholes||[]).forEach(function(mh){if(mh.wx==null)return;var _md=Math.hypot(mh.wx-_twx,mh.wy-_twy);if(_md<_mmd){_mmd=_md;_mm=mh;}});if(_mm&&_mmd<=_mTol){if(typeof tgSelectMh==='function'&&tgSelectMh(_mm.wx,_mm.wy)){if(typeof drawGeo==='function')drawGeo();return;}}if(_tp2){tgSelectPt(_tp2.no);if(typeof drawGeo==='function')drawGeo();return;}}
    var w0=toWorld(e.clientX,e.clientY);var nr0=nearestSnapWorld(w0[0],w0[1]);
    if(!(nr0.pt&&nr0.d<vb.w*0.025)){dragging=true;startC=[e.clientX,e.clientY];startVB={x:vb.x,y:vb.y,w:vb.w,h:vb.h};cv.style.cursor='grabbing';try{cv.setPointerCapture(e.pointerId);}catch(x){}}
  }
  else if(mode==='tgsegfix'){var _sw=toWorld(e.clientX,e.clientY);var _wx=_sw[0],_wy=-_sw[1];var _tol=(typeof pxToWorld==='function')?pxToWorld()*28:3;var _key=null,_kx=0,_ky=0,_bd=_tol;var _BB=window._tgBnd;if(_BB&&Object.keys(_BB).length){for(var _bq2 in _BB){var _dd2=Math.hypot(_BB[_bq2].x-_wx,_BB[_bq2].y-_wy);if(_dd2<_bd){_bd=_dd2;_key=_bq2;_kx=_BB[_bq2].x;_ky=_BB[_bq2].y;}}}else{(state.lines||[]).forEach(function(L){if(L.layer!=='\uD1B5\uC2E0\uAD00\uB85C'||!L.pts)return;L.pts.forEach(function(pt){var _dd=Math.hypot(pt[0]-_wx,pt[1]-_wy);if(_dd<_bd){_bd=_dd;_key=Math.round(pt[0]*100)+'_'+Math.round(pt[1]*100);_kx=pt[0];_ky=pt[1];}});});}if(_key){if(!_segFix){_segFix={a:_key,ax:_kx,ay:_ky};if(typeof toast==='function')toast('\uC885\uB8CC \uC2DC\uC124\uBB3C\uC744 \uD074\uB9AD\uD558\uC138\uC694');}else{if(typeof tgApplySegFix==='function')tgApplySegFix(_segFix.a,_key);_segFix=null;if(typeof tgSegFixRubber==='function')tgSegFixRubber(null);mode='pan';if(typeof setModeUI==='function')setModeUI();}if(typeof drawGeo==='function')drawGeo();}else{if(typeof toast==='function')toast('\uC2DC\uC124\uBB3C(\uB9E8\uD640\u00B7\uC785\uC0C1\u00B7\uAD00\uB9D0) \uAC00\uAE4C\uC774\uB97C \uD074\uB9AD\uD558\uC138\uC694');}return;}else if(mode==='tgptedit'){var _tw=toWorld(e.clientX,e.clientY);var _tp=(typeof nearBpPoint==='function')?nearBpPoint(_tw[0],-_tw[1]):null;if(_tp){tgSelectPt(_tp.no);if(typeof drawGeo==='function')drawGeo();}return;}
  else if(mode==='tglineedit'){var _lw=toWorld(e.clientX,e.clientY);var _lp=(typeof nearBpPoint==='function')?nearBpPoint(_lw[0],-_lw[1]):null;if(_lp){if(_tgDrawLast&&_tgDrawLast.no!==_lp.no){if(typeof tgSnap==='function')tgSnap();state.lines.push({pts:[[_tgDrawLast.x,_tgDrawLast.y],[_lp.x,_lp.y]],layer:'통신관로'});if(state._linesOrig&&state.tangoEdit)state.tangoEdit.lines=state.lines;if(typeof saveProject==='function')saveProject();if(typeof tangoFill==='function')tangoFill();if(typeof tangoSelSeg==='function'&&tgSeg>=0)tangoSelSeg(tgSeg);}_tgDrawLast=_lp;if(typeof drawGeo==='function')drawGeo();}return;}
  else if(mode==='tglinedel'){var _dw=toWorld(e.clientX,e.clientY);var _nl=(typeof tgNearLine==='function')?tgNearLine(_dw[0],-_dw[1]):{idx:-1,d:1e18};var _tol=(typeof pxToWorld==='function')?pxToWorld()*16:1;if(_nl.idx>=0&&_nl.d<=_tol){if(typeof tgSnap==='function')tgSnap();state.lines.splice(_nl.idx,1);if(state._linesOrig&&state.tangoEdit)state.tangoEdit.lines=state.lines;var _hh=document.getElementById('tgLineHi');if(_hh)_hh.style.display='none';if(typeof saveProject==='function')saveProject();if(typeof tangoFill==='function')tangoFill();if(typeof tangoSelSeg==='function'&&tgSeg>=0)tangoSelSeg(tgSeg);if(typeof drawGeo==='function')drawGeo();}return;}
  else if(mode==='roadtoggle'){var _wi=toWorld(e.clientX,e.clientY);var _bp=(typeof nearBpPoint==='function')?nearBpPoint(_wi[0],-_wi[1]):null;if(_bp){var _cu=_bp.surface||'';_bp.surfaceManual=(_cu==='\uB3C4\uB85C')?'\uBCF4\uB3C4':'\uB3C4\uB85C';if(typeof classifyRoad==='function')classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();toast('\uCE21\uC810 '+_bp.no+' \u2192 '+_bp.surfaceManual);}else toast('\uCE21\uC810 \uADFC\uCC98\uB97C \uD074\uB9AD');return;}else if(mode==='mhplace'){var wm=toWorld(e.clientX,e.clientY);pendAct=function(){placeManholeAt(wm[0],-wm[1]);mode='pan';setModeUI();};startPanFrom(e);return;}
  else if(mode==='riserplace'){var wr=toWorld(e.clientX,e.clientY);pendAct=function(){placeManholeAt(wr[0],-wr[1],'riser');mode='pan';setModeUI();};startPanFrom(e);return;}
  else if(mode==='ptins'){var wi=toWorld(e.clientX,e.clientY);insertPointAt(wi[0],-wi[1]);mode='pan';setModeUI();return;}
  else if(mode==='hyundelsel'){var wi=toWorld(e.clientX,e.clientY);var wx=wi[0],wy=-wi[1];var bi=-1,bpi=-1,bd=1e18;for(var li=0;li<(state.lines||[]).length;li++){var L=state.lines[li];if(!L.insp||!L.pts||L.pts.length<2)continue;for(var pi=0;pi<L.pts.length-1;pi++){var a=L.pts[pi],c=L.pts[pi+1],dx=c[0]-a[0],dy=c[1]-a[1],L2=dx*dx+dy*dy;var tt=L2?((wx-a[0])*dx+(wy-a[1])*dy)/L2:0;tt=tt<0?0:(tt>1?1:tt);var cx=a[0]+tt*dx,cy=a[1]+tt*dy,dd=Math.hypot(wx-cx,wy-cy);if(dd<bd){bd=dd;bi=li;bpi=pi;}}}if(bi>=0&&bpi>=0&&bd<=pxToWorld()*12){if(typeof pushHist==='function')pushHist();var _L=state.lines[bi];var _s1=_L.pts.slice(0,bpi+1),_s2=_L.pts.slice(bpi+1);var _arr=[];if(_s1.length>=2){var _n1=Object.assign({},_L);_n1.pts=_s1;_arr.push(_n1);}if(_s2.length>=2){var _n2=Object.assign({},_L);_n2.pts=_s2;_arr.push(_n2);}state.lines.splice.apply(state.lines,[bi,1].concat(_arr));if(typeof saveProject==='function')saveProject();drawGeo();toast('\uD604\uD669\uC120 \uAD6C\uAC04 \uC0AD\uC81C');}else{toast('\uD074\uB9AD \uADFC\uCC98 \uD604\uD669\uC120 \uC5C6\uC74C');}return;}
  else if(mode==='roadfollow'){var _rw=toWorld(e.clientX,e.clientY);if(roadFollow){roadFollowFinish(_rw);}else{var _bz=-1,_bv=-1,_bb=1e18;(state.roadZones||[]).forEach(function(z,zi){z.poly.forEach(function(vp,vi){var dx=vp[0]-_rw[0],dy=(-vp[1])-_rw[1],d=dx*dx+dy*dy;if(d<_bb){_bb=d;_bz=zi;_bv=vi;}});});if(_bz>=0&&Math.sqrt(_bb)<=pxToWorld()*25){roadFollow={zi:_bz,vi:_bv,p1:[state.roadZones[_bz].poly[_bv][0],state.roadZones[_bz].poly[_bv][1]]};toast('\uD604\uD669\uC810\uC744 \uD074\uB9AD\uD558\uC138\uC694 (\uC2A4\uD398\uC774\uC2A4=\uC644\uB8CC)');}else{toast('\uB3C4\uB85C\uBA74 \uC815\uC810 \uADFC\uCC98\uB97C \uD074\uB9AD\uD558\uC138\uC694');}}return;}else if(mode==='hyunroad'||mode==='hyunwalk'){var wi=toWorld(e.clientX,e.clientY);var sn=hyunSnap(wi);var pt;if(sn.pt&&sn.d<=pxToWorld()*15){pt=sn.pt;}else{pt=[wi[0],-wi[1]];}if(!hyunDraw)hyunDraw={layer:(mode==='hyunroad'?'\uB3C4\uB85C':'\uBCF4\uB3C4'),pts:[]};hyunDraw.pts.push(pt);drawGeo();return;}
  else if(mode==='depthadd'){var wi=toWorld(e.clientX,e.clientY);var pp=(typeof nearBpPoint==='function')?nearBpPoint(wi[0],-wi[1]):null;if(pp&&pp.no!=null){var _cur=state.tamsa?((pp.z!=null&&isFinite(pp.z))?(Math.round(pp.z*100)/100).toFixed(2):''):((state._depthByNo&&state._depthByNo[pp.no]!=null)?(Math.round(state._depthByNo[pp.no]*100)/100).toFixed(2):'');var _nv=prompt('\uC2EC\uB3C4\uAC12 \uC785\uB825 (m) \u2014 \uCE21\uC810 '+pp.no,_cur);if(_nv!=null&&_nv.trim()!==''&&isFinite(parseFloat(_nv))){if(state.tamsa){pp.z=parseFloat(_nv);}else{if(!state._depthByNo)state._depthByNo={};state._depthByNo[pp.no]=parseFloat(_nv);}if(typeof saveProject==='function')saveProject();drawGeo();}}else{toast('\uCE21\uC810 \uADFC\uCC98\uB97C \uD074\uB9AD\uD558\uC138\uC694');}return;}
  else if(mode==='bpz1'){var wi=toWorld(e.clientX,e.clientY);var _rt=(typeof IS_REALTIME!=='undefined'&&IS_REALTIME);var bp=_rt?nearBpOnly(wi[0],-wi[1]):nearBpPoint(wi[0],-wi[1]);pendAct=function(){if(_rt&&!bp){toast('보강판 측점을 탭하세요');return;}bpFirst=bp?[bp.x,bp.y]:[wi[0],-wi[1]];bpSelMark(bpFirst[0],bpFirst[1]);mode='bpz2';setModeUI();toast('끝 보강판 측점을 탭하세요');};startPanFrom(e);return;}
  else if(mode==='bpz2'){var wi=toWorld(e.clientX,e.clientY);var _rt2=(typeof IS_REALTIME!=='undefined'&&IS_REALTIME);var bp=_rt2?nearBpOnly(wi[0],-wi[1]):nearBpPoint(wi[0],-wi[1]);var p2=bp?[bp.x,bp.y]:[wi[0],-wi[1]];pendAct=function(){if(_rt2&&!bp){toast('보강판 측점을 탭하세요');return;}bpSelClear();if(!state.bpzones)state.bpzones=[];state.roadZones=[];pushHist();state.bpzones.push({p1:bpFirst,p2:p2,note:'보강판 지역',path:bpTracePath(bpFirst,p2)});bpFirst=null;bpHoverClear();bpPreviewClear();mode='pan';setModeUI();drawGeo();updMeta();toast('보강판 구역 생성');};startPanFrom(e);return;}
  else if(mode==='bpzdel'){var wi=toWorld(e.clientX,e.clientY),wx=wi[0],wy=-wi[1];if(state.bpzones){for(var zi=0;zi<state.bpzones.length;zi++){var poly=bpOffsetBand(bpPathOf(state.bpzones[zi]),5);if(poly&&bpPtInPoly(wx,wy,poly)){pushHist();state.bpzones.splice(zi,1);drawGeo();updMeta();toast('보강판 구역 삭제');return;}}}return;}
  else if(mode==='roaddel'){var wi=toWorld(e.clientX,e.clientY),wx=wi[0],wy=-wi[1];if(state.roadZones){for(var ri=state.roadZones.length-1;ri>=0;ri--){if(roadPtInPoly([wx,wy],state.roadZones[ri].poly)){if(typeof pushHist==='function')pushHist();state.roadZones.splice(ri,1);classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();toast('\uB3C4\uB85C\uBA74 \uC0AD\uC81C');return;}}}return;}
  else if(mode==='roadvtxadd'){var wi=toWorld(e.clientX,e.clientY),wx=wi[0],wy=-wi[1];if(state.roadZones){var bz=-1,bv=-1,bd=1e18;for(var zi2=0;zi2<state.roadZones.length;zi2++){var pl=state.roadZones[zi2].poly;for(var vi2=0;vi2<pl.length;vi2++){var a=pl[vi2],b=pl[(vi2+1)%pl.length];var dd=distSegW(wx,wy,a,b);if(dd<bd){bd=dd;bz=zi2;bv=vi2;}}}if(bz>=0&&bd<pxToWorld()*15){if(typeof pushHist==='function')pushHist();state.roadZones[bz].poly.splice(bv+1,0,[wx,wy]);classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();toast('\uC815\uC810 \uC0BD\uC785');return;}}return;}
  else if(mode==='ptdel'){return;} // 측점삭제: 빈 곳 클릭은 무시(측점 클릭은 hit 핸들러가 삭제)
  else if(mode==='line'){var w=toWorld(e.clientX,e.clientY);var ns=nearestSnapWorld(w[0],w[1]);
    var snapTol=(drawLayer==='지거')?Math.max(pxToWorld()*14,0.25):vb.w*0.04;
    var _ok=(ns.pt&&ns.d<snapTol),_pt=_ok?[ns.pt[0],ns.pt[1]]:null;
    pendAct=function(){if(_pt){lineDraft.push(_pt);renderDraft();}else if(typeof toast==='function')toast('측점 위를 클릭하세요 — 측점끼리만 연결됩니다');};
    startPanFrom(e);return;}
  else if(mode==='delline'||mode==='delall2'){var wd=toWorld(e.clientX,e.clientY);
    if(mode==='delall2'){var hp=null,hpd=Math.max(pxToWorld()*12,0.4);(state.points||[]).forEach(function(q){var d=Math.hypot(q.x-wd[0],q.y+wd[1]);if(d<hpd){hpd=d;hp=q;}});if(hp){deletePoint(hp);return;} if(deleteMarkupAt(wd[0],wd[1]))return;if(state.bpzones&&state.bpzones.length){for(var _bz=state.bpzones.length-1;_bz>=0;_bz--){var _poly=(typeof bpOffsetBand==='function'&&typeof bpPathOf==='function')?bpOffsetBand(bpPathOf(state.bpzones[_bz]),5):null;if(_poly&&typeof bpPtInPoly==='function'&&bpPtInPoly(wd[0],-wd[1],_poly)){pushHist();state.bpzones.splice(_bz,1);if(typeof classifyRoad==='function')classifyRoad();drawGeo();updMeta();if(typeof saveProject==='function'){try{saveProject();}catch(e){}}if(typeof toast==='function')toast('보강판 삭제');return;}}}}
    deleteSegmentAt(wd[0],wd[1]);}
  else if(mode==='measure'){var wm=toWorld(e.clientX,e.clientY);var nm=nearestSnapWorld(wm[0],wm[1]);var mp=(nm.pt&&nm.d<vb.w*0.04)?[nm.pt[0],nm.pt[1]]:[wm[0],-wm[1]];measureClick(mp);return;}
  else if(mode==='delmh'){/* 맨홀 삭제 모드: 빈 곳 클릭은 아무것도 안 함 (맨홀 클릭은 심벌 핸들러가 처리) */return;}
  else{drawing=true;var w2=toWorld(e.clientX,e.clientY);sx=w2[0];sy=w2[1];
    cur=el(mode==='box'?'rect':'ellipse',{fill:MKCOL[status],'fill-opacity':0.13,stroke:MKCOL[status],'stroke-width':2,'vector-effect':'non-scaling-stroke','pointer-events':'none'});
    if(mode==='box'){cur.setAttribute('x',sx);cur.setAttribute('y',sy);cur.setAttribute('width',0);cur.setAttribute('height',0);cur.setAttribute('rx',0.4);}else{cur.setAttribute('cx',sx);cur.setAttribute('cy',sy);cur.setAttribute('rx',0);cur.setAttribute('ry',0);}
    gMark.appendChild(cur);}
  if(mode!=='pan')try{cv.setPointerCapture(e.pointerId);}catch(x){}
});
cv.addEventListener('pointermove',function(e){
  if(mode==='tgptedit'){var _hw=toWorld(e.clientX,e.clientY);var _hp=(typeof nearBpPoint==='function')?nearBpPoint(_hw[0],-_hw[1]):null;if(typeof tgHover==='function')tgHover(_hp);}
  if(mode==='tglinedel'){var _lhw=toWorld(e.clientX,e.clientY);if(typeof tgLineHover==='function')tgLineHover(_lhw[0],-_lhw[1]);}if(mode==='tgsegfix'){var _sfw=toWorld(e.clientX,e.clientY);if(_segFix&&typeof tgSegFixRubber==='function')tgSegFixRubber(_segFix.ax,_segFix.ay,_sfw[0],-_sfw[1]);if(typeof tgFixHover==='function')tgFixHover(_sfw[0],-_sfw[1]);}if(mode==='pan'&&typeof _tgMode==='function'&&_tgMode()){var _pmw=toWorld(e.clientX,e.clientY);if(typeof tgFixHover==='function')tgFixHover(_pmw[0],-_pmw[1]);}
  if(depthDrag){var _dw=toWorld(e.clientX,e.clientY);state.depthCheck[depthDrag.idx].lx=_dw[0];state.depthCheck[depthDrag.idx].ly=-_dw[1];drawGeo();return;}
  if(roadEditVtx){var _rw=toWorld(e.clientX,e.clientY);state.roadZones[roadEditVtx.zi].poly[roadEditVtx.vi]=[_rw[0],-_rw[1]];drawGeo();return;}
  if(bpDragZone){var dw=toWorld(e.clientX,e.clientY);bpDragZone.lx=dw[0];bpDragZone.ly=-dw[1];drawGeo();return;}
  if(bpCrop){var w=toWorld(e.clientX,e.clientY);bpCrop.ex=w[0];bpCrop.ey=w[1];drawBpRect();return;}
  if(mode==='bperase'&&!midPanning){bpHover(toWorld(e.clientX,e.clientY));return;}
  if((mode==='bpz1'||mode==='bpz2')&&!midPanning&&!dragging&&!pinch){var hw=toWorld(e.clientX,e.clientY);bpHoverPt(hw);if(mode==='bpz2'&&bpFirst){var hbp=nearBpPoint(hw[0],-hw[1]);bpPreview(bpFirst,hbp?[hbp.x,hbp.y]:[hw[0],-hw[1]]);}else bpPreviewClear();return;}
  if(mode==='bpzdel'&&!midPanning){var _ew=toWorld(e.clientX,e.clientY),_ex=_ew[0],_ey=-_ew[1],_hi=-1;if(state.bpzones)for(var _zi=0;_zi<state.bpzones.length;_zi++){var _pl=bpOffsetBand(bpPathOf(state.bpzones[_zi]),5);if(_pl&&bpPtInPoly(_ex,_ey,_pl)){_hi=_zi;break;}}if(_hi!==bpEraseHover){bpEraseHover=_hi;drawGeo();}return;}
  if(e.pointerType==='touch'&&activePtrs[e.pointerId]){activePtrs[e.pointerId].x=e.clientX;activePtrs[e.pointerId].y=e.clientY;}
  if(noteDrag){var m=state.markups[noteDrag.i];
    if(!noteDrag.moved){if(Math.hypot(e.clientX-noteDrag.sx0,e.clientY-noteDrag.sy0)<8)return;noteDrag.moved=true;noteDrag.lastW=toWorld(e.clientX,e.clientY);}
    var wd=toWorld(e.clientX,e.clientY);if(m){m.cx+=wd[0]-noteDrag.lastW[0];m.cy+=wd[1]-noteDrag.lastW[1];noteDrag.lastW=wd;drawMarks();}return;}
  if(pinch){var pids=Object.keys(activePtrs);if(pids.length<2)return;
    var pa=activePtrs[pids[0]],pb=activePtrs[pids[1]];
    var pmx=(pa.x+pb.x)/2,pmy=(pa.y+pb.y)/2,d=Math.max(1,Math.hypot(pa.x-pb.x,pa.y-pb.y));
    var f=pinch.d0/d,r=cv.getBoundingClientRect();
    var nw=pinch.vbw0*f,nh=pinch.vbh0*f;
    if(nw<0.2){var k=0.2/nw;nw*=k;nh*=k;} if(nw>200000){var k2=200000/nw;nw*=k2;nh*=k2;}
    vb.w=nw;vb.h=nh;
    vb.x=pinch.w0[0]-(pmx-r.left)/r.width*nw;
    vb.y=pinch.w0[1]-(pmy-r.top)/r.height*nh;
    applyVB();return;}
  if(midPanning){var rr=cv.getBoundingClientRect();var ddx=(e.clientX-startC[0])/rr.width*startVB.w,ddy=(e.clientY-startC[1])/rr.height*startVB.h;vb.x=startVB.x-ddx;vb.y=startVB.y-ddy;applyVB();return;}
  if(dragging){var r=cv.getBoundingClientRect();var dx=(e.clientX-startC[0])/r.width*startVB.w,dy=(e.clientY-startC[1])/r.height*startVB.h;vb.x=startVB.x-dx;vb.y=startVB.y-dy;applyVB();}
  else if(mode==='line'&&lineDraft&&lineDraft.length){var w=toWorld(e.clientX,e.clientY);var last=S(lineDraft[lineDraft.length-1][0],lineDraft[lineDraft.length-1][1]);
    if(!previewLine){previewLine=el('line',{stroke:(LINECOL[drawLayer]||{}).c||'#d92b2b','stroke-width':1.2,'stroke-dasharray':'4 3','vector-effect':'non-scaling-stroke','pointer-events':'none'});gDraft.appendChild(previewLine);}
    previewLine.setAttribute('x1',last[0]);previewLine.setAttribute('y1',last[1]);previewLine.setAttribute('x2',w[0]);previewLine.setAttribute('y2',w[1]);}
  else if(drawing&&cur){var w=toWorld(e.clientX,e.clientY),x=w[0],y=w[1];
    if(mode==='box'){cur.setAttribute('x',Math.min(sx,x));cur.setAttribute('y',Math.min(sy,y));cur.setAttribute('width',Math.abs(x-sx));cur.setAttribute('height',Math.abs(y-sy));}
    else{cur.setAttribute('cx',(sx+x)/2);cur.setAttribute('cy',(sy+y)/2);cur.setAttribute('rx',Math.abs(x-sx)/2);cur.setAttribute('ry',Math.abs(y-sy)/2);}}
});
function endPtr(e){
  if(depthDrag){depthDrag=null;setTimeout(function(){labelDragging=false;},40);if(typeof saveProject==='function')saveProject();drawGeo();return;}
  if(roadEditVtx){roadEditVtx=null;setTimeout(function(){labelDragging=false;},40);classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();return;}
  if(bpDragZone){bpDragZone=null;setTimeout(function(){labelDragging=false;},40);drawGeo();return;}
  if(bpCrop){var _c=bpCrop;bpCrop=null;clearSvg(gDraft);applyBpCrop(_c);return;}
  if(e&&e.pointerType==='touch'&&e.pointerId!=null&&activePtrs[e.pointerId]){delete activePtrs[e.pointerId];}
  if(pinch&&Object.keys(activePtrs).length<2){pinch=null;drawGeo();drawManholes();highlightSel();return;}
  if(noteDrag){var nd=noteDrag;noteDrag=null;
    if(nd.moved){noteAutoSave();return;}
    var now=Date.now();
    if(_lastNoteTap.i===nd.i&&(now-_lastNoteTap.t)<450){_lastNoteTap={i:-1,t:0};openNoteEdit(nd.i);}
    else{_lastNoteTap={i:nd.i,t:now};}
    return;}
  if(midPanning){midPanning=false;cv.style.cursor='';return;}
  if(dragging){dragging=false;cv.style.cursor='';if(pendAct){var _mvd=(startC&&e&&e.clientX!=null)?(Math.abs(e.clientX-startC[0])+Math.abs(e.clientY-startC[1])):0;var _fn=pendAct;pendAct=null;if(_mvd<8){try{_fn();}catch(_pe){}}return;}}if(pendAct)pendAct=null;
  if(drawing&&cur){drawing=false;
    var isBox=mode==='box';var w=isBox?+cur.getAttribute('width'):+cur.getAttribute('rx')*2;var h=isBox?+cur.getAttribute('height'):+cur.getAttribute('ry')*2;
    if(w<0.4&&h<0.4){cur.remove();cur=null;return;}
    var ccx=isBox?(+cur.getAttribute('x')+w/2):+cur.getAttribute('cx');var ccy=isBox?(+cur.getAttribute('y')+h/2):+cur.getAttribute('cy');
    var np=nearestPointWorld(ccx,ccy);var rec={type:isBox?'box':'cir',status:status,near:np.p?np.p.no:'-',el:cur};
    if(isBox){rec.x=+cur.getAttribute('x');rec.y=+cur.getAttribute('y');rec.w=w;rec.h=h;}else{rec.cx=+cur.getAttribute('cx');rec.cy=+cur.getAttribute('cy');rec.rx=+cur.getAttribute('rx');rec.ry=+cur.getAttribute('ry');}
    pushHist();state.markups.push(rec);cur=null;renderRecs();}
}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
/* 유령 포인터 청소: 손가락이 메뉴/팝업 위에서 떨어져도 확실히 제거 */
window.addEventListener('pointerup',function(e){try{if(activePtrs[e.pointerId]!==undefined)delete activePtrs[e.pointerId];if(pinch&&Object.keys(activePtrs).length<2)pinch=null;}catch(_){}});
window.addEventListener('pointercancel',function(e){try{if(activePtrs[e.pointerId]!==undefined)delete activePtrs[e.pointerId];if(pinch&&Object.keys(activePtrs).length<2)pinch=null;}catch(_){}});
cv.addEventListener('mousedown',function(e){if(e.button===1)e.preventDefault();});
cv.addEventListener('auxclick',function(e){if(e.button===1)e.preventDefault();});
cv.addEventListener('wheel',function(e){e.preventDefault();zoomAt(e.deltaY>0?1.07:0.935,e.clientX,e.clientY);},{passive:false});
cv.addEventListener('dblclick',function(e){if(viewerMode||readOnly)return;if((mode==='hyunroad'||mode==='hyunwalk')&&hyunDraw&&hyunDraw.pts&&hyunDraw.pts.length>=2){e.preventDefault();hyunFinish(true);return;}var ni=hitNote(e.clientX,e.clientY);if(ni>=0){e.preventDefault();openNoteEdit(ni);}}); // PC 편집모드: 특이사항 더블클릭=수정/삭제

/* ====== CSV / DXF 파싱 ====== */
function decodeBuf(buf){var u=new TextDecoder('utf-8',{fatal:false}).decode(buf);if(u.indexOf('\uFFFD')>=0){try{return new TextDecoder('euc-kr').decode(buf);}catch(e){return u;}}return u;}
function splitCsvLine(s){var out=[],cur='',q=false;for(var i=0;i<s.length;i++){var c=s[i];if(c==='"'){q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function timeMin(s){var m=(s||'').match(/(\d{1,2}):(\d{2})/);return m?(+m[1]*60+ +m[2]):null;}
function prevDayYMD(ymd){if(!ymd||ymd.length<6)return ymd;var dt=new Date(2000+ +ymd.slice(0,2),+ymd.slice(2,4)-1,+ymd.slice(4,6));dt.setDate(dt.getDate()-1);return (''+dt.getFullYear()).slice(2)+('0'+(dt.getMonth()+1)).slice(-2)+('0'+dt.getDate()).slice(-2);}
function parseCsv(text,fname){
  var rows=text.replace(/\r/g,'').split('\n').filter(function(l){return l.trim().length;});
  if(!rows.length)return [];
  var head=splitCsvLine(rows[0]).map(function(s){return s.trim();});
  function col(){for(var a=0;a<arguments.length;a++){var i=head.indexOf(arguments[a]);if(i>=0)return i;}return -1;}
  var ci={name:col('이름','번호'),x:col('X','x'),y:col('Y','y'),z:col('Z(레벨)','Z','z'),code:col('코드','code'),date:col('현재날짜'),time:col('현재시간','시간','관측시간','측정시간','시작시간','데이터 시작시간','GPS시간','UTC시간','TIME')};
  if(ci.time<0){var smp=splitCsvLine(rows[1]||'');for(var c0=0;c0<head.length;c0++){if(/^\s*\d{1,2}:\d{2}(:\d{2})?\s*$/.test(smp[c0]||'')){ci.time=c0;break;}}}
  var dm=(fname||'').match(/20(\d{6})/);var fdate=dm?dm[1]:'';
  var ns=state.nightShift, nsCut=(ns&&ns.on)?ns.cut:null;
  var pts=[];
  for(var r=1;r<rows.length;r++){var f=splitCsvLine(rows[r]);
    var cx=parseFloat(f[ci.x]),cy=parseFloat(f[ci.y]);if(isNaN(cx)||isNaN(cy))continue;
    var d0=fdate; if(ci.date>=0&&f[ci.date]){var raw=(f[ci.date]||'').replace(/[^0-9]/g,'');if(raw.length>=8)d0=raw.slice(2,8);}
    var tmin=ci.time>=0?timeMin(f[ci.time]):null;
    var dt=d0; if(nsCut!=null&&tmin!=null&&tmin<nsCut&&d0)dt=prevDayYMD(d0);
    var name=ci.name>=0?(f[ci.name]||'').trim():String(r);
    var _rc=ci.code>=0?(f[ci.code]||'').trim():'';var _pz=ci.z>=0?parseFloat(f[ci.z]):null;var _pc=_rc,_psf=null,_ppv=null,_pIsT=false;if(state.tamsa){var _tc=parseTamsaCode(_rc);if(_tc){_pc=_tc.code||(_tc.isT?'T':'');_pz=_tc.z;_psf=_tc.surface;_ppv=_tc.pave;_pIsT=!!_tc.isT;}}pts.push({no:(dt?dt+'-':'')+name, x:cy, y:cx, z:_pz, code:_pc, _csv:(fname||''), _d0:d0, _tm:tmin, _nm:name, pave:_ppv, surface:_psf, _hyun:/^([BDS]|BD|DB)$/i.test((_rc||'').trim()), isT:(state.tamsa?_pIsT:undefined), surfaceManual:(_psf||undefined), _tcode:(state.tamsa?_rc:undefined)});
  }
  return pts;
}
function applyNightShift(){
  var ns=state.nightShift, cut=(ns&&ns.on)?ns.cut:null, n=0;
  (state.points||[]).forEach(function(p){
    if(p._d0==null||p._nm==null)return;
    var dt=p._d0;
    if(cut!=null&&p._tm!=null&&p._tm<cut&&p._d0)dt=prevDayYMD(p._d0);
    var nu=(dt?dt+'-':'')+p._nm; if(nu!==p.no){p.no=nu;n++;}
  });
  selNum=null;if(typeof clearSvg==='function'&&typeof gSel!=='undefined')clearSvg(gSel);
  if(typeof drawGeo==='function')drawGeo();if(typeof drawMarks==='function')drawMarks();if(typeof updMeta==='function')updMeta();
  return n;
}
function parseDxfLines(text){
  var L=text.replace(/\r/g,'').split('\n'),pairs=[];
  for(var i=0;i+1<L.length;i+=2)pairs.push([L[i].trim(),L[i+1]]);
  var lines=[],i2=0;
  while(i2<pairs.length){
    var code=pairs[i2][0],val=(pairs[i2][1]||'').trim();
    if(code==='0'&&val==='LINE'){
      var layer='0',ent={},j=i2+1;
      while(j<pairs.length&&pairs[j][0]!=='0'){var c=pairs[j][0],v=pairs[j][1];
        if(c==='8')layer=v.trim();
        if(c==='10')ent.x1=parseFloat(v);if(c==='20')ent.y1=parseFloat(v);
        if(c==='11')ent.x2=parseFloat(v);if(c==='21')ent.y2=parseFloat(v);j++;}
      if(ent.x1!=null)lines.push({layer:layer,pts:[[ent.x1,ent.y1],[ent.x2,ent.y2]]});
      i2=j;
    } else if(code==='0'&&val==='LWPOLYLINE'){
      var layer='0',xs=[],ys=[],j=i2+1;
      while(j<pairs.length&&pairs[j][0]!=='0'){var c=pairs[j][0],v=pairs[j][1];
        if(c==='8')layer=v.trim();
        if(c==='10')xs.push(parseFloat(v));if(c==='20')ys.push(parseFloat(v));j++;}
      if(xs.length>=2){var pp=[];for(var k=0;k<xs.length;k++)pp.push([xs[k],ys[k]]);lines.push({layer:layer,pts:pp});}
      i2=j;
    } else if(code==='0'&&val==='POLYLINE'){
      var layer='0',j=i2+1;
      while(j<pairs.length&&pairs[j][0]!=='0'){if(pairs[j][0]==='8')layer=pairs[j][1].trim();j++;}
      var xs=[],ys=[];
      while(j<pairs.length){
        var v0=(pairs[j][1]||'').trim();
        if(pairs[j][0]==='0'&&v0==='VERTEX'){
          var k=j+1,vx=null,vy=null;
          while(k<pairs.length&&pairs[k][0]!=='0'){if(pairs[k][0]==='10')vx=parseFloat(pairs[k][1]);if(pairs[k][0]==='20')vy=parseFloat(pairs[k][1]);k++;}
          if(vx!=null&&!isNaN(vx)){xs.push(vx);ys.push(vy);}
          j=k;
        } else if(pairs[j][0]==='0'&&v0==='SEQEND'){j++;break;}
        else if(pairs[j][0]==='0'){break;}
        else j++;
      }
      if(xs.length>=2){var pp=[];for(var k2=0;k2<xs.length;k2++)pp.push([xs[k2],ys[k2]]);lines.push({layer:layer,pts:pp});}
      i2=j;
    } else i2++;
  }
  return lines;
}
function parseDxfTexts(text){
  var L=text.replace(/\r/g,'').split('\n'),pairs=[];
  for(var i=0;i+1<L.length;i+=2)pairs.push([L[i].trim(),L[i+1]]);
  var out=[],i2=0;
  while(i2<pairs.length){
    var code=pairs[i2][0],val=(pairs[i2][1]||'').trim();
    if(code==='0'&&(val==='TEXT'||val==='MTEXT')){
      var isM=(val==='MTEXT'),layer='0',x=null,y=null,h=1,rot=0,txt='',pre='',j=i2+1;
      while(j<pairs.length&&pairs[j][0]!=='0'){var c=pairs[j][0],v=pairs[j][1];
        if(c==='8')layer=v.trim();
        else if(c==='10')x=parseFloat(v);
        else if(c==='20')y=parseFloat(v);
        else if(c==='40'){var hh=parseFloat(v);if(hh)h=hh;}
        else if(c==='50'){var rr=parseFloat(v);if(rr)rot=rr;}
        else if(c==='1')txt=v;
        else if(c==='3'&&isM)pre+=v;
        j++;}
      var full=pre+txt;
      if(isM){full=full.replace(/\\P/g,' ').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'');}
      full=(full||'').replace(/^\s+|\s+$/g,'');
      if(x!=null&&!isNaN(x)&&full)out.push({x:x,y:y,text:full,h:h,layer:layer,rot:rot});
      i2=j;
    } else i2++;
  }
  return out;
}

/* ====== Supabase ====== */
var sb=null, online=false;
function initSb(){
  if(SUPABASE_URL&&SUPABASE_ANON_KEY&&window.supabase){
    sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);online=true;
    document.getElementById('conn').className='conn on';document.getElementById('conn').textContent='Supabase 연결';
    refreshProjects();
  }else{document.getElementById('conn').className='conn off';document.getElementById('conn').textContent='로컬 모드';}
}
function refreshProjects(){ if(!online)return;
  sb.from(DB+'_projects').select('id,name,updated_at,stage:payload->>stage').order('updated_at',{ascending:false}).then(function(res){
    var sel=document.getElementById('proj');sel.innerHTML='<option value="">사업 선택…</option>';
    (res.data||[]).forEach(function(p){if((p.stage||'survey')!==STAGE)return;var o=document.createElement('option');o.value=p.id;o.textContent=p.name;o.title=p.name;sel.appendChild(o);});
    if(state.projectId)sel.value=state.projectId;
    /* [BUILD 913] 실시간측량 기존 사업명 _S 마이그레이션 */
    if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME){(res.data||[]).forEach(function(p){if((p.stage||'survey')!==STAGE)return;if(/_S$/.test(p.name||''))return;var nn=(p.name||'')+'_S';sb.from(DB+'_projects').update({name:nn}).eq('id',p.id).then(function(){});var o=sel.querySelector('option[value="'+p.id+'"]');if(o){o.textContent=nn;o.title=nn;}if(state.projectId===p.id)state.projectName=nn;});}
    if(typeof refreshDoneProjects==='function')refreshDoneProjects();
  });
}
function saveProject(cb){ if(readOnly){if(typeof cb==='function')cb();return;}
  var payload={points:(state._pointsOrig||state.points),gpsPts:(state.gpsPts||[]),lines:(state._linesOrig||state.lines),baseTexts:state.baseTexts||[],labelOff:state.labelOff,markups:state.markups.map(function(m){var c={};for(var k in m)if(k!=='el')c[k]=m[k];return c;}),manholes:state.manholes,crs:state.crs,photoDir:state.photoDir,routingDone:!!state.routingDone,asbuilt:state.asbuilt||null,rtDone:state.rtDone||null,trash:state._trash||[],nightShift:state.nightShift||null,fieldDone:state.fieldDone||null,finalCsv:state.finalCsv||null,tamsa:!!state.tamsa,bizInfo:state.bizInfo||null,depthGround:state.depthGround||null,bpzones:state.bpzones||[],roadZones:state.roadZones||[],depthCheck:state.depthCheck||[],titleBlock:state.titleBlock||null,tangoEdit:state.tangoEdit||null,tangoManual:state.tangoManual||null,tgStore:state.tgStore||null,mnList:state.mnList||[]};  if(!online){toast('로컬 모드 — Supabase 키를 넣으면 저장됩니다');return;}
  if(!state.projectName){toast('사업명을 먼저 정하세요(새 사업)');return;}
  payload.stage=STAGE;
  if(state.loadedStage&&state.loadedStage!==STAGE){state.projectId=null;} // 다운스트림 분리: 다른 단계 사업은 처음 저장 시 새 사본 생성(원본 보호)
  var row={name:state.projectName,payload:payload,updated_at:new Date().toISOString()};
  if(state.projectId)row.id=state.projectId;
  sb.from(DB+'_projects').upsert(row).select().then(function(res){
    if(res.error){toast('저장 오류: '+res.error.message);return;}
    var saved=res.data&&res.data[0];if(saved){state.projectId=saved.id;state.loadedStage=STAGE;}
    sb.from(DB+'_history').insert({project_id:state.projectId,payload:payload}); // 이력
    refreshProjects();loadPhotos();toast('저장 완료');if(state._importSrc&&state._importSrc.length&&state.projectId){var _srcs=state._importSrc.slice();state._importSrc=[];(function _nx(){if(!_srcs.length)return;var _sid=_srcs.shift();copyPhotos(_sid,state.projectId,_nx);})();}if(typeof cb==='function')cb(state.projectId);
  });
}
function pickProject(id){ if(!id)return;
  if(STAGE==='survey'||STAGE==='realtime'||!online){ loadProject(id); return; }
  /* 다운스트림(현장/탱고): 사업 선택 즉시 내 단계 사본으로 전환 */
  sb.from(DB+'_projects').select('id,name,stage:payload->>stage').eq('id',id).single().then(function(r){
    if(r.error||!r.data){ loadProject(id); return; }
    var nm=r.data.name, st=r.data.stage||'survey';
    if(st===STAGE){ loadProject(id); return; } /* 이미 내 단계 사본 */
    sb.from(DB+'_projects').select('id,updated_at,stage:payload->>stage').eq('name',nm).order('updated_at',{ascending:false}).then(function(r2){
      var rows=r2.data||[],mine=null;
      for(var k=0;k<rows.length;k++){ if((rows[k].stage||'survey')===STAGE){ mine=rows[k]; break; } }
      if(mine){ loadProject(mine.id); return; } /* 기존 내 단계 사본 로딩 */
      var _lab=({survey:'결선',field:'현장',tango:'탱고'})[STAGE]||STAGE;
      loadProject(id,false,function(){ saveProject(); toast(_lab+' 사본 생성'); }); /* 업스트림 가져와 즉시 내 단계로 저장 */
    });
  });
}
function _loadProjectRaw(id,ro,cb){ if(!online||!id)return; setReadOnly(!!ro);state._tgCmpRemote=null;state._tgCmpRemoteOrig=null;
  sb.from(DB+'_projects').select('*').eq('id',id).single().then(function(res){
    if(res.error||!res.data){toast('불러오기 실패');return;}if(typeof _tgStageBackup==='function'&&state.tgStore&&(state._pointsOrig||state._linesOrig||state._depthOrig))_tgStageBackup();if(typeof _tgStageOut==='function')_tgStageOut();var _xp=document.getElementById('tangoPanel');if(_xp)_xp.style.display='none';var _xi=document.getElementById('tgInfoPanel');if(_xi)_xi.style.display='none';if(typeof tgPanelLayout==='function')tgPanelLayout(false);if(typeof tgUpdateBtn==='function')tgUpdateBtn(false);if(typeof tgSeg!=='undefined')tgSeg=-1;if(typeof _segFix!=='undefined')_segFix=null;if(typeof _tgSegs!=='undefined')_tgSegs=null;if(typeof mode!=='undefined'&&mode&&mode.indexOf('tg')===0){mode='pan';if(typeof setModeUI==='function')setModeUI();}state.tgSegLabelOff={};['tgSegHLG','tgSegHLF','tgSegHL'].forEach(function(_xid){var _xe=document.getElementById(_xid);if(_xe)_xe.remove();});
    var p=res.data.payload||{};state.projectId=res.data.id;state.projectName=res.data.name;state.loadedStage=p.stage||'survey';state._importSrc=[];
    state.points=p.points||[];state.gpsPts=p.gpsPts||[];state.tangoEdit=p.tangoEdit||null;if(p.tangoManual)state.tangoManual=p.tangoManual;state.tgStore=p.tgStore||null;if(!state.tgStore&&(p.tangoEdit||p.tangoManual)){state.tgStore={tango:{edit:p.tangoEdit,manual:p.tangoManual||{},segDel:{}}};}_tgCtx='tango';state.lines=p.lines||[];state.baseTexts=p.baseTexts||[];state.markups=(p.markups||[]);state.labelOff=p.labelOff||{};state.manholes=p.manholes||[];state.bpzones=p.bpzones||[];state.roadZones=p.roadZones||[];state.depthCheck=p.depthCheck||[];if(typeof classifyRoad==='function')classifyRoad();state.depthGround=p.depthGround||null;state._depthAlign=null;state.titleBlock=p.titleBlock||null;state.crs=p.crs||'5186';state.photoDir=p.photoDir||{};state.routingDone=!!p.routingDone;state.asbuilt=p.asbuilt||null;state.rtDone=p.rtDone||null;state.mnList=p.mnList||[];state._trash=p.trash||[];if(typeof rtPurgeTrash==='function')setTimeout(rtPurgeTrash,800);state.nightShift=p.nightShift||null;state.fieldDone=p.fieldDone||null;state.tamsa=!!p.tamsa;state.finalCsv=p.finalCsv?(Array.isArray(p.finalCsv)?p.finalCsv:[p.finalCsv]):[];state.bizInfo=p.bizInfo||null;
    selNum=null;clearSvg(gSel);try{if(state.finalCsv&&state.finalCsv.length&&typeof finalCsvDepthSync==='function')finalCsvDepthSync();if(state.depthGround&&state.depthGround.length&&typeof computeDepth==='function')computeDepth();}catch(e){}try{mergeAftMh();}catch(_me){}if(state.tamsa&&typeof buildTamsaMh==='function')try{buildTamsaMh();}catch(_te){}if(typeof IS_TANGO!=='undefined'&&IS_TANGO&&state.tangoEdit){if(!state.tangoEdit.lines)state.tangoEdit.lines=JSON.parse(JSON.stringify(state.lines||[]));if(!state.tangoEdit.points)state.tangoEdit.points=JSON.parse(JSON.stringify(state.points||[]));if(!state.tangoEdit.depthByNo)state.tangoEdit.depthByNo={};}drawGeo();drawMarks();drawManholes();try{fitView();}catch(_e0){}updMeta();loadPhotos();fitSoon();if(typeof refreshFieldBar==='function')refreshFieldBar();toast('현장 불러옴: '+res.data.name);
    var vs=document.getElementById('vproj');if(vs)vs.value=res.data.id;
    if(viewerMode&&!IS_FIELD)setTimeout(function(){openPhotoPanel(true);},150);
    try{toolsOpen=false;inspmkOpen=false;activeCat='pan';if(typeof renderRail==='function')renderRail();if(typeof renderSub==='function')renderSub();}catch(_e){}if(typeof cb==='function')cb();
  });
}
function deleteProject(){
  if(!online){toast('로컬 모드 — Supabase 연결이 필요합니다');return;}
  var sel=document.getElementById('proj');var id=sel.value;
  if(!id){toast('삭제할 사업을 먼저 선택하세요');return;}
  var nm=(sel.options[sel.selectedIndex]&&sel.options[sel.selectedIndex].text)||'(이름없음)';
  if(!confirm("'"+nm+"' 사업을 삭제할까요?\n\n측점·결선·검수·사진 기록이 모두 지워지며 되돌릴 수 없습니다."))return;
  deleteProjectById(id,nm);
}
function deleteProjectById(id,nm){
  if(!online){toast('로컬 모드 — Supabase 연결이 필요합니다');return Promise.resolve();}
  // 사진 스토리지 정리(best-effort) → 사진행 → 이력 → 사업 순서
  return Promise.resolve()
    .then(function(){return sb.storage.from('photos').list(id).then(function(r){
        var files=((r&&r.data)||[]).map(function(f){return id+'/'+f.name;});
        return files.length?sb.storage.from('photos').remove(files):null;
      }).catch(function(){});})
    .then(function(){return sb.from(DB+'_photos').delete().eq('project_id',id);})
    .then(function(){return sb.from(DB+'_history').delete().eq('project_id',id);})
    .then(function(){return sb.from(DB+'_projects').delete().eq('id',id);})
    .then(function(res){
      if(res&&res.error){toast('삭제 오류: '+res.error.message);return;}
      if(state.projectId===id){ // 현재 열려있던 사업이면 화면 초기화
        state.projectId=null;state.projectName=null;state.points=[];state.lines=[];state.baseTexts=[];state.markups=[];state.manholes=[];state.gpsPts=[];state.bpzones=[];state.roadZones=[];state.depthCheck=[];state.labelOff={};state.depthGround=null;state.finalCsv=[];state.photoDir={};state.bizInfo=null;state.routingDone=false;state.asbuilt=null;state.fieldDone=null;state._importSrc=[];photoMap={};afterMap={};selNum=null;
        clearSvg(gSel);clearSvg(gMH);if(typeof clearLabels==='function'){try{clearLabels('gps');}catch(e){}}redrawAll();updMeta();if(photoPanelOpen)refreshPhotoPanel();
      }
      refreshProjects();
      toast('사업 삭제 완료: '+(nm||''));
    });
}

/* ====== 버튼 바인딩 ====== */
function bind(id,fn){var e=document.getElementById(id);if(e)e.onclick=fn;}
/* ====== 데이터 기반 툴바 (좌측 카테고리 + 상단 세부도구) ====== */
var TB=[
  {k:'data',label:'사업등록',icon:'📋',c:{bg:'#eceef1',fg:'#6e757f'},tools:[
    {t:'CSV 업로드',tone:'data',fn:function(){document.getElementById('fCsv').click();}},
    {t:'수치지도 DXF업로드',tone:'data',fn:function(){document.getElementById('fDxf').click();}},
    {t:'백판 삭제',tone:'delall',fn:clearBaseMap}]},
  {k:'pan',label:'선택·이동',icon:'✋',c:{bg:'#fdf1dd',fg:'#d98200'},setmode:'pan',hint:'측점 클릭=선택 · 라벨 끌어 이동 · 휠 확대 · 가운데버튼 화면이동',tools:[]},
  {k:'mh',label:'맨홀편집',icon:'◎',c:{bg:'#efeafa',fg:'#7a52e0'},tools:[
    {t:'맨홀심기',tone:'draw',mode:'mhplace',hint:'도면에서 맨홀 위치를 클릭하세요'},
    {t:'맨홀/인출선 지우기',tone:'del',mode:'delmh',hint:'지울 맨홀을 클릭하세요 (맨홀+인출선+라벨 전부 삭제)'}]},
  {k:'riser',label:'입상주편집',icon:'🗼',c:{bg:'#f1efe3',fg:'#7a6a3a'},tools:[
    {t:'입상주심기',tone:'draw',mode:'riserplace',hint:'도면에서 입상주(전봇대) 위치를 클릭하세요'},
    {t:'입상주 지우기',tone:'del',mode:'delriser',hint:'지울 입상주를 클릭하세요'}]},
  {k:'conn',label:'결선',icon:'🔗',c:{bg:'#e7f3ea',fg:'#2a9e50'},tools:[
    {t:'자동결선',tone:'draw',fn:autoConnect},
    {t:'결선지우기(선택)',tone:'del',mode:'delline',delLayer:'통신관로',hint:'지울 결선을 클릭'},
    {t:'결선지우기(전체)',tone:'delall',fn:clearLines}]},
  {k:'pipe',label:'관로선편집',icon:'✎',c:{bg:'#e6effb',fg:'#2f7fe0'},tools:[
    {t:'관로선 그리기',tone:'draw',fn:function(){startDraw('통신관로');},activeMode:'line'},
    {t:'관로선 지우기',tone:'del',mode:'delline',delLayer:'통신관로',hint:'지울 관로선 위에 마우스→두껍게 표시되면 클릭'},
    {t:'전체삭제',tone:'delall',fn:clearAllDraw}]},
  {k:'jiger',label:'지거편집',icon:'〰',c:{bg:'#fdf7e3',fg:'#c9920a'},tools:[
    {t:'지거선 그리기',tone:'draw',fn:function(){startDraw('지거');},activeMode:'line'},
    {t:'지거선 지우기',tone:'del',mode:'delline',delLayer:'지거',hint:'지울 지거선 위에 마우스→클릭'}]},
  {k:'push',label:'압입구간편집',icon:'⇥',c:{bg:'#e3f4ef',fg:'#109a82'},tools:[
    {t:'압입구간 그리기',tone:'draw',fn:function(){startDraw('압입구간');},activeMode:'line'},
    {t:'압입구간 지우기',tone:'del',mode:'delline',delLayer:'압입구간',hint:'지울 압입구간 위에 마우스→클릭'}]},
  {k:'ptins',label:'측점삽입',icon:'＋',c:{bg:'#e6effb',fg:'#2f7fe0'},tools:[
    {t:'측점삽입',tone:'pick',mode:'ptins',hint:'클릭한 위치에 측점 생성 → 번호·코드 입력'},
    {t:'측점 삭제',tone:'del',mode:'ptdel',hint:'삭제할 측점을 클릭 (빨갛게 표시되면 클릭)'}]},
  {k:'bpzone',label:'보강판편집',icon:'▦',c:{bg:'#fdf6e3',fg:'#b8860b'},tools:[
    {t:'보강판 구역',tone:'pick',mode:'bpz1',hint:'시작점→끝점 두 번 클릭 (±7M 박스 자동)'},
    {t:'보강판 지우기',tone:'del',mode:'bpzdel',hint:'지울 보강판 태그 핸들을 클릭'}]},
  {k:'bpedit',label:'빽판편집',icon:'✂️',c:{bg:'#f0eef7',fg:'#7a52e0'},tools:[
    {t:'영역 크롭',tone:'pick',mode:'bpcrop',hint:'한 점 찍고 드래그→사각형. 떼면 그 영역 안 백판만 남고 검정 테두리선 추가'},
    {t:'지우기',tone:'del',mode:'bperase',hint:'지울 백판 선·텍스트를 클릭 (백판만 삭제)'},
    {t:'되돌리기',tone:'pick',fn:doUndo,hint:'방금 지운 백판 한 단계 복구'}]},
  {k:'insp',label:'검수',icon:'✓',c:{bg:'#fbe9e9',fg:'#df524b'},tools:[
    {t:'관공수 검수',tone:'insp1',fn:inspectPipeCount,hint:'관수 규칙 자동 점검 — 연속성(맨홀 제외) + T점 분기 합산'},
    {t:'중복선 검수',tone:'insp2',fn:inspectDupLines,hint:'중복 관로선을 찾아 빨간 써클로 표시'},
    {t:'끝점 검수',tone:'insp3',fn:inspectEndpoints,hint:'결선 끝점이 측점·맨홀에 붙어있는지 검수'}]},
  {k:'inspmk',label:'검수데이터 제작',icon:'\uD83E\uDDFE',c:{bg:'#fbe9e9',fg:'#df524b'},tools:[],custom:1}
];
var TONE={data:{bg:'#eceef1',fg:'#6e757f'},draw:{bg:'#e7f3ea',fg:'#2a9e50'},del:{bg:'#fdf1dd',fg:'#d98200'},delall:{bg:'#fbe9e9',fg:'#df524b'},pick:{bg:'#e6effb',fg:'#2f7fe0'},shape:{bg:'#e6effb',fg:'#2f7fe0'},ok:{bg:'#e7f3ea',fg:'#2a9e50'},bad:{bg:'#fbe9e9',fg:'#df524b'},pt:{bg:'#efeafa',fg:'#7a52e0'},insp1:{bg:'#e6effb',fg:'#2f7fe0'},insp2:{bg:'#efeafa',fg:'#7a52e0'},insp3:{bg:'#e3f4ef',fg:'#109a82'}};
function toneStyle(tone,active){var c=TONE[tone]||{bg:'#f3f3f0',fg:'#333'};return active?('background:'+c.fg+';color:#fff;border:1px solid '+c.fg+';border-left:4px solid '+c.fg+';border-radius:0 8px 8px 0;font-weight:700;'):('background:#fff;color:'+c.fg+';border:1px solid #e3e3df;border-left:4px solid '+c.fg+';border-radius:0 8px 8px 0;font-weight:600;');}
function railStyle(col,active){col=col||{bg:'#f3f3f0',fg:'#333'};return active?('background:'+col.bg+';color:'+col.fg+';border:1px solid '+col.fg+';border-left:4px solid '+col.fg+';border-radius:0 8px 8px 0;font-weight:700;'):('background:#fff;color:'+col.fg+';border:1px solid #e3e3df;border-left:4px solid '+col.fg+';border-radius:0 8px 8px 0;font-weight:600;');}
var activeCat='pan';
var toolsOpen=false;try{toolsOpen=(localStorage.getItem('toolsOpen')==='1');}catch(e){}
var LV_KEY='layerVis_'+STAGE;var LV=(function(){try{return JSON.parse(localStorage.getItem(LV_KEY))||{};}catch(e){return {};}})();['no','date','code','depth','mh','riser','hyun','bp','bpbox','selbox','tagbox'].forEach(function(k){if(LV[k]==null)LV[k]=1;});if(typeof IS_TANGO!=='undefined'&&!IS_TANGO&&(typeof IS_FIELD==='undefined'||!IS_FIELD)){['no','date','code','depth','mh','riser','hyun','bp','bpbox','selbox','tagbox'].forEach(function(k){LV[k]=1;});} /* 결선/현장: 레이어체크바와 무관하게 전부 표시(탱고 전용 기능) */function applyLayerVis(){var b=document.body;if(!b)return;['no','date','code','depth','mh','riser','hyun'].forEach(function(k){b.classList.toggle('hide-'+k,!LV[k]);});}function setLayerVis(k,on){LV[k]=on?1:0;try{localStorage.setItem(LV_KEY,JSON.stringify(LV));}catch(e){}if(k==='tgcmp'){var _isTTn=/_TT\d*$/.test(state.projectName||'');if(on&&online&&!_isTTn){_tgFetchRemoteCmp();}else if(!on){state._tgCmpRemote=null;state._tgCmpRemoteOrig=null;}}applyLayerVis();if(typeof drawGeo==='function')drawGeo();if(typeof tgDrawSegHL==='function'){if(LV.tgseg&&(typeof _tgSegs==='undefined'||!_tgSegs||!_tgSegs.length)&&typeof tangoBuildSegs==='function'){try{_tgSegs=tangoBuildSegs();}catch(e){}}if(typeof _tgSegs!=='undefined'&&_tgSegs&&_tgSegs.length)tgDrawSegHL(typeof tgSeg!=='undefined'?tgSeg:-1);}}
function curCat(){for(var i=0;i<TB.length;i++)if(TB[i].k===activeCat)return TB[i];return TB[0];}
function renderRail(){
  var r=document.getElementById('rail'),html='';
  TB.forEach(function(c){
    var kb=keyForAction('cat:'+c.k),bdg=kb?'<span class="hk-badge">'+kb+'</span>':'';
    if(c.custom)return;
    if(c.k==='bpzone'&&IS_TANGO)return;
    if(c.k==='data'){
      html+='<button data-k="'+c.k+'" style="'+railStyle(c.c,c.k===activeCat)+';justify-content:flex-start">'+c.icon+' '+c.label+bdg+'</button>';
      html+='<div class="sep"></div>';
      html+='<button id="toolToggle" style="background:'+(toolsOpen?'#fdf1dd':'#fff')+';color:#d98200;border:1px solid #d98200;border-radius:8px;font-weight:700;justify-content:flex-start">🛠 '+'편집도구'+'<span style="margin-left:auto;font-size:12px">'+(toolsOpen?'▲':'▼')+'</span></button>';
      html+='<div id="toolGroup" style="display:'+(toolsOpen?'flex':'none')+';flex-direction:column;gap:7px">';
      return;
    }
    html+='<button data-k="'+c.k+'" style="'+railStyle(c.c,c.k===activeCat)+';align-self:flex-start;width:60%;box-sizing:border-box;font-size:11px;padding:5px 8px;margin-left:10px">'+c.icon+' '+c.label+bdg+'</button>';});
  html+='</div>';
  html+='<button data-k="inspmk" style="'+railStyle({bg:'#fbe9e9',fg:'#df524b'},activeCat==='inspmk')+'">'+(IS_TANGO?'\uD83E\uDDFE \uAC80\uC218\uB370\uC774\uD130 \uC81C\uC791':'\uD83D\uDCD1 \uB808\uC774\uC5B4')+'<span style="margin-left:auto;font-size:12px">'+(activeCat==='inspmk'&&inspmkOpen?'\u25B2':'\u25BC')+'</span></button>';if(IS_TANGO&&activeCat==='inspmk'&&inspmkOpen){var _isb=function(k,l,fg,bg){var on=(inspmkSub===k);return '<button data-isub="'+k+'" style="border:1px solid '+fg+';'+(on?'border-left:4px solid '+fg+';':'')+'border-radius:8px;background:'+(on?bg:'#fff')+';color:'+fg+';font-weight:'+(on?'700':'600')+';justify-content:flex-start;align-self:flex-start;width:60%;box-sizing:border-box;font-size:11px;padding:6px 10px;margin-left:10px">'+l+'</button>';};html+='<div style="display:flex;flex-direction:column;gap:5px;margin-top:5px">'+_isb('bp','\uBCF4\uAC15\uD310\uD3B8\uC9D1','#b8860b','#fdf6e3')+_isb('depth','\uC2EC\uB3C4\uD3B8\uC9D1','#7a52e0','#f0eef7')+_isb('hyun','\uD604\uD669\uCE21\uB7C9 \uD3B8\uC9D1','#1a7a5e','#e3f2ee')+_isb('road','\uB3C4\uB85C\uBA74 \uD3B8\uC9D1','#e8820c','#fdf0e0')+_isb('attr','\uC18D\uC131\uC815\uBCF4 \uD3B8\uC9D1','#0a7ea0','#e4f3f7')+'</div>';}
  html+=(IS_TANGO?'<button id="tgBtn" onclick="tgTogglePanel()" style="background:#fff;color:#0a3ea0;border:2px solid #ffd31a;border-radius:8px;font-weight:800;padding:9px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:6px;justify-content:flex-start">\u{1F4CB} \uD0F1\uACE0\uC131\uACFC \uC81C\uC791</button>':'')+'<div class="sep"'+(IS_TANGO?' style="margin-top:auto"':'')+'></div>'+'<button id="dxfExport" style="background:#fff;color:#c0392b;border:1px solid #c0392b;border-radius:8px;font-weight:700;justify-content:flex-start"><span style="color:#c0392b">📐</span> DXF로 내보내기</button>'+'<button id="pdfExport" style="background:#fff;color:#1565c0;border:1px solid #1565c0;border-radius:8px;font-weight:700;justify-content:flex-start"><span style="color:#1565c0">📄</span> PDF로 내보내기</button>';
  
  if(!IS_TANGO)html+='<button id="csvExport" style="background:#fff;color:#0d7a52;border:1px solid #0d7a52;border-radius:8px;font-weight:700;justify-content:flex-start"><span style="color:#0d7a52">📄</span> 측설용 CSV 내보내기</button>';
  html+='<button id="doneReg" style="background:#16a34a;color:#fff;border:1px solid #16a34a;border-radius:8px;font-weight:700;justify-content:flex-start">✅ '+(IS_TANGO?'탱고':'결선')+'완료사업 등록</button>';
  if(IS_TANGO)html+='<button id="tgDoneList" style="background:#fff;color:#16a34a;border:1px solid #16a34a;border-radius:8px;font-weight:700;justify-content:flex-start">\uD83D\uDCCB \uD0F1\uACE0\uC644\uB8CC\uC0AC\uC5C5 \uBAA9\uB85D</button>';
  html+='<button id="hkOpen" style="'+(IS_TANGO?'':'margin-top:auto;')+'background:#fff;color:#555;border:1px solid #e3e3df;border-radius:8px;font-weight:600;justify-content:flex-start"><span style="color:#1f6fd6;font-size:16px">⌨</span> 단축키 설정</button>';
  r.innerHTML=html;
  try{applyLayerVis();}catch(e){}
  var tt=document.getElementById('toolToggle');if(tt)tt.onclick=function(){toolsOpen=!toolsOpen;if(toolsOpen){inspmkOpen=false;if(typeof closeTangoPanel==='function'&&document.getElementById('tangoPanel'))closeTangoPanel();}try{localStorage.setItem('toolsOpen',toolsOpen?'1':'0');}catch(e){}renderRail();renderSub();};
  r.querySelectorAll('button[data-isub]').forEach(function(b){b.onclick=function(){inspmkSub=b.getAttribute('data-isub');renderRail();renderSub();if(inspmkSub==='attr'&&typeof openTangoPanel==='function')openTangoPanel('attr');};});r.querySelectorAll('button[data-k]').forEach(function(b){b.onclick=function(){
    var bk=b.getAttribute('data-k');
    if(bk==='data'){openRegModal();return;}if(bk==='inspmk'){if(/_TT\d*$/.test(state.projectName||'')){var _cmpOn=!(typeof LV!=='undefined'&&LV.tgcmp);if(typeof setLayerVis==='function')setLayerVis('tgcmp',_cmpOn);if(typeof toast==='function')toast(_cmpOn?'\uC6D0\uBCF8\uBE44\uAD50 \uCF1C\uC9D0 (\uD0F1\uACE0\uC131\uACFC \uC0AC\uBCF8)':'\uC6D0\uBCF8\uBE44\uAD50 \uAEBC\uC9D0');return;}if(activeCat==='inspmk'){inspmkOpen=!inspmkOpen;}else{activeCat='inspmk';inspmkOpen=true;}if(inspmkOpen){toolsOpen=false;if(typeof closeTangoPanel==='function'&&document.getElementById('tangoPanel'))closeTangoPanel();if(typeof LV!=='undefined'&&LV.tgcmp&&online&&!/_TT\d*$/.test(state.projectName||'')&&!state._tgCmpRemote&&typeof _tgFetchRemoteCmp==='function')_tgFetchRemoteCmp();}renderRail();renderSub();return;}
    activeCat=bk;var c=curCat();
    renderRail();renderSub();
    if(c.k==='mh'){mode='mhplace';setModeUI();toast('맨홀심기: 도면을 클릭해 심기 (한 번 심으면 종료, 다시 심으려면 맨홀심기 클릭)');}
    else if(c.k==='riser'){mode='riserplace';setModeUI();toast('입상주심기: 도면을 클릭해 심기 (한 번 심으면 종료, 다시 심으려면 입상주심기 클릭)');}
    else if(c.k==='pipe'){startDraw('통신관로');}
    else if(c.k==='jiger'){startDraw('지거');}
    else if(c.k==='push'){startDraw('압입구간');}
    else if(c.k==='ptins'){mode='ptins';setModeUI();toast('측점삽입: 도면을 클릭해 측점 생성 (한 번 생성 후 종료, 다시 하려면 측점삽입 클릭)');}
    else if(c.setmode){mode=c.setmode;cv.classList.toggle('draw',mode!=='pan');setModeUI();}
    else if(c.hint&&!c.tools.length)toast(c.hint);};});
  var ho=document.getElementById('hkOpen');if(ho)ho.onclick=openHotkeyModal;
  var dx=document.getElementById('dxfExport');if(dx)dx.onclick=function(){exportDXF();};var pf=document.getElementById('pdfExport');if(pf)pf.onclick=function(){exportPDFVector();};
  var ce=document.getElementById('csvExport');if(ce)ce.onclick=exportSurveyCsv;
  var dr=document.getElementById('doneReg');if(dr)dr.onclick=registerDone;var tdl=document.getElementById('tgDoneList');if(tdl)tdl.onclick=openDoneList;
  var dc=document.getElementById('depthCalc');if(dc)dc.onclick=openDepthCalc;var ib=document.getElementById('inspBuild');if(ib)ib.onclick=buildInspData;
}
function mkBtn(tool,i){
  var active=(tool.mode&&mode===tool.mode)||(tool.activeMode&&mode===tool.activeMode)||(tool.status&&status===tool.status);
  if(tool.soon)return '<button class="sub-b soon" style="'+toneStyle(tool.tone,false)+'opacity:.55">'+tool.t+'</button>';
  var kb=keyForAction('tool:'+curCat().k+':'+i),bdg=kb?'<span class="hk-badge">'+kb+'</span>':'';
  return '<button data-i="'+i+'" class="sub-b" style="'+toneStyle(tool.tone,active)+'">'+tool.t+bdg+'</button>';
}
var inspmkSub='bp',inspmkOpen=true;function inspmkBar(){var riserBtn='<button id="mkRiser" style="border:1px solid #d500f2;color:#d500f2;font-weight:700">\uD83D\uDCCD \uC804\uC8FC\uC785\uC0C1 \uBC18\uC601</button>';var btn='<button id="mkInsp" style="border:1px solid #16a34a;color:#16a34a;font-weight:700">\uD83D\uDCCB \uAC80\uC218\uB370\uC774\uD130 \uC0DD\uC131</button>'+'<button id="mkDepth" style="border:1px solid #7a52e0;color:#7a52e0;font-weight:700">\uD83D\uDCD0 \uC2EC\uB3C4 \uACC4\uC0B0</button>'+'<button id="mkDepthChk" style="border:1px solid #e53935;color:#e53935;font-weight:700">\uAE30\uC900\uC2EC\uB3C4 \uAC80\uC218</button>';var defs=[['no','\uC810\uBC88\uD638'],['code','\uAD00\uC815\uBCF4'],['depth','\uC2EC\uB3C4'],['date','\uB0A0\uC9DC'],['mh','\uB9E8\uD640 \uC815\uBCF4'],['riser','\uC785\uC0C1\uC8FC'],['bp','\uBCF4\uAC15\uD310 \uCE21\uC810'],['bpbox','\uBCF4\uAC15\uD310 \uBC15\uC2A4'],['hyun','\uD604\uD669 \uCE21\uB7C9(\uB3C4\uB85C)'],['roadzone','\uB3C4\uB85C\uBA74'],['photoDir','\uC0AC\uC9C4\uBC29\uD5A5'],['depthchk','\uAE30\uC900\uC2EC\uB3C4\uBBF8\uB2EC'],['surfacedot','\uB3C4\uB85C/\uBCF4\uB3C4\uC810'],['selbox','\uC120\uD0DD \uD45C\uC2DC'],['tagbox','\uD0DC\uADF8 \uC774\uB3D9 \uBC94\uC704']];defs.push(['tgseg','\uAD6C\uAC04 \uC0C9\uCE60']);var _cmpC=(typeof IS_TANGO!=='undefined'&&IS_TANGO)?'<label class="lvchk" style="background:#fce4ec;border:1px solid #e91e63;border-radius:4px;padding:0 5px;font-weight:700;color:#c2185b"><input type="checkbox" data-lv="tgcmp" onchange="setLayerVis(\'tgcmp\',this.checked)"'+(LV.tgcmp?' checked':'')+'>\uC6D0\uBCF8 \uBE44\uAD50</label>':'';var layerBar='<span class="subhint">\uB808\uC774\uC5B4</span>'+_cmpC+defs.map(function(d){return '<label class="lvchk"><input type="checkbox" data-lv="'+d[0]+'"'+(LV[d[0]]?' checked':'')+'>'+d[1]+'</label>';}).join('');var body='';if(inspmkSub==='bp'){body='<button id="bpZone" class="sub-b" style="'+toneStyle('pick',mode==='bpz1')+'">\uBCF4\uAC15\uD310 \uAD6C\uC5ED</button><button id="bpDel" class="sub-b" style="'+toneStyle('del',mode==='bpzdel')+'">\uBCF4\uAC15\uD310 \uC9C0\uC6B0\uAE30</button>';}else if(inspmkSub==='depth'){body='<button id="mkDepthAdd" class="sub-b" style="'+toneStyle('shape',mode==='depthadd')+'">\uC2EC\uB3C4 \uC0BD\uC785</button><button id="mkDepthEdit" class="sub-b" style="'+toneStyle('pick',mode==='depthedit')+'">\uC2EC\uB3C4 \uC218\uC815</button><button id="mkDepthDel" class="sub-b" style="'+toneStyle('del',mode==='depthdel')+'">\uC9C0\uC6B0\uAE30</button>';}else if(inspmkSub==='hyun'){body='<button id=\"hyunSpray\" class=\"sub-b\" style=\"'+toneStyle('pick',false)+'\">\uD0C0\uC810 \uBFCC\uB9AC\uAE30</button><button id=\"hyunAuto\" class=\"sub-b\" style=\"'+toneStyle('pick',false)+'\">\uD604\uD669\uACB0\uC120(\uC790\uB3D9)</button><button id=\"hyunRoad\" class=\"sub-b\" style=\"'+toneStyle('shape',mode==='hyunroad')+'\">\uB3C4\uB85C \uADF8\uB9AC\uAE30</button><button id=\"hyunWalk\" class=\"sub-b\" style=\"'+toneStyle('shape',mode==='hyunwalk')+'\">\uBCF4\uB3C4 \uADF8\uB9AC\uAE30</button><button id=\"hyunDelSel\" class=\"sub-b\" style=\"'+toneStyle('del',mode==='hyundelsel')+'\">\uD604\uD669\uC120 \uC9C0\uC6B0\uAE30(\uC120\uD0DD)</button><button id=\"hyunDelAll\" class=\"sub-b\" style=\"'+toneStyle('del',false)+'\">\uD604\uD669\uC120 \uC9C0\uC6B0\uAE30(\uC804\uCCB4)</button>';}else if(inspmkSub==='road'){function rb(id,lab,col,on){return '<button id="'+id+'" class="sub-b" style="border:1px solid '+col+';color:'+col+';font-weight:600'+(on?';background:'+col+'1f':'')+'">'+lab+'</button>';}body=rb('roadAuto','\uB3C4\uB85C \uBA74\uCC98\uB9AC(\uC790\uB3D9)','#e8820c',false)+rb('roadEdit','\uBA74 \uC218\uC815','#1633ff',mode==='roadedit')+rb('roadVtx','\uC810 \uCDE8\uC18C/\uC0BD\uC785','#7a52e0',mode==='roadvtxdel'||mode==='roadvtxadd')+rb('roadFollow','\uD604\uD669\uC120 \uB530\uB77C\uC787\uAE30','#0a9a7a',mode==='roadfollow')+rb('roadDel','\uBA74 \uC0AD\uC81C(\uC120\uD0DD)','#d9534f',mode==='roaddel')+rb('roadClear','\uBA74 \uC0AD\uC81C(\uC804\uCCB4)','#b71c1c',false)+rb('roadToggle','\uCE21\uC810 \uB3C4\uB85C/\uBCF4\uB3C4 \uC804\uD658','#1a7a5e',mode==='roadtoggle');}if(typeof IS_TANGO==='undefined'||!IS_TANGO){btn='';body='';}return '<div style="display:flex;flex-direction:column;gap:5px;width:100%">'+'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+riserBtn+btn+layerBar+'</div>'+(body?'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'+body+'</div>':'')+'</div>';}function wireInspmk(sb){var a=document.getElementById('mkInsp');if(a)a.onclick=function(){if(typeof buildInspData==='function')buildInspData();};var mr=document.getElementById('mkRiser');if(mr)mr.onclick=function(){if(typeof buildRisersFromCsv==='function'){var _rn=buildRisersFromCsv();drawManholes();drawGeo();if(typeof tangoFill==='function')tangoFill();if(typeof saveProject==='function')saveProject();toast('\uC804\uC8FC\uC785\uC0C1 '+_rn+'\uAC1C \uBC18\uC601(\uB9C8\uC820\uD0C0)');}};var b=document.getElementById('mkDepth');if(b)b.onclick=function(){if(typeof openDepthCalc==='function')openDepthCalc();};var sc=document.getElementById('mkSubCode');if(sc)sc.onclick=function(){inspmkSub='code';renderSub();};var sbp=document.getElementById('mkSubBp');if(sbp)sbp.onclick=function(){inspmkSub='bp';renderSub();};var sd=document.getElementById('mkSubDepth');if(sd)sd.onclick=function(){inspmkSub='depth';renderSub();};sb.querySelectorAll('input[data-lv]').forEach(function(inp){inp.onchange=function(){setLayerVis(inp.getAttribute('data-lv'),inp.checked);};});var bz=document.getElementById('bpZone');if(bz)bz.onclick=function(){if(mode==='bpz1'){mode='pan';}else{mode='bpz1';toast('\uC2DC\uC791\uC810\u2192\uB05D\uC810 \uB450 \uBC88 \uD074\uB9AD (\u00B17M \uBC15\uC2A4 \uC790\uB3D9)');}setModeUI();renderSub();};var bd=document.getElementById('bpDel');if(bd)bd.onclick=function(){if(mode==='bpzdel'){mode='pan';}else{mode='bpzdel';toast('\uC9C0\uC6B8 \uBCF4\uAC15\uD310 \uD0DC\uADF8 \uD578\uB4E4\uC744 \uD074\uB9AD');}setModeUI();renderSub();};var da=document.getElementById('mkDepthAdd');if(da)da.onclick=function(){if(mode==='depthadd'){mode='pan';}else{mode='depthadd';toast('\uC2EC\uB3C4\uB97C \uB123\uC744 \uCE21\uC810\uC744 \uD074\uB9AD\uD558\uC138\uC694');}setModeUI();drawGeo();renderSub();};var de=document.getElementById('mkDepthEdit');if(de)de.onclick=function(){if(mode==='depthedit'){mode='pan';}else{mode='depthedit';toast('\uC2EC\uB3C4\uAC12\uC744 \uB354\uBE14\uD074\uB9AD\uD558\uBA74 \uC218\uC815\uB429\uB2C8\uB2E4');}setModeUI();drawGeo();renderSub();};var dd=document.getElementById('mkDepthDel');if(dd)dd.onclick=function(){if(mode==='depthdel'){mode='pan';}else{mode='depthdel';toast('\uC9C0\uC6B8 \uC2EC\uB3C4\uC5D0 \uB9C8\uC6B0\uC2A4\uB97C \uC62C\uB9AC\uACE0 \uD074\uB9AD');}setModeUI();drawGeo();renderSub();};var dck=document.getElementById('mkDepthChk');if(dck)dck.onclick=function(){buildDepthCheck();};var hsp=document.getElementById('hyunSpray');if(hsp)hsp.onclick=function(){if(typeof loadHyunPts==='function'){loadHyunPts();drawGeo();toast((state.hyunPts?state.hyunPts.length:0)+'\uAC1C \uD0C0\uC810 \uD45C\uC2DC');}};var hau=document.getElementById('hyunAuto');if(hau)hau.onclick=function(){if(typeof buildHyunLines==='function')buildHyunLines();};var hrd=document.getElementById('hyunRoad');if(hrd)hrd.onclick=function(){if(mode==='hyunroad'){mode='pan';hyunDraw=null;}else{mode='hyunroad';hyunDraw=null;toast('\uD074\uB9AD\uC73C\uB85C \uB3C4\uB85C \uD604\uD669\uC120 \u00B7 \uB354\uBE14\uD074\uB9AD \uC644\uB8CC \u00B7 ESC \uCDE8\uC18C');}setModeUI();drawGeo();renderSub();};var hwk=document.getElementById('hyunWalk');if(hwk)hwk.onclick=function(){if(mode==='hyunwalk'){mode='pan';hyunDraw=null;}else{mode='hyunwalk';hyunDraw=null;toast('\uD074\uB9AD\uC73C\uB85C \uBCF4\uB3C4 \uD604\uD669\uC120 \u00B7 \uB354\uBE14\uD074\uB9AD \uC644\uB8CC \u00B7 ESC \uCDE8\uC18C');}setModeUI();drawGeo();renderSub();};var hds=document.getElementById('hyunDelSel');if(hds)hds.onclick=function(){if(mode==='hyundelsel'){mode='pan';}else{mode='hyundelsel';toast('\uC9C0\uC6B8 \uD604\uD669\uC120\uC744 \uD074\uB9AD');}setModeUI();drawGeo();renderSub();};var hda=document.getElementById('hyunDelAll');if(hda)hda.onclick=function(){if(!confirm('\uD604\uD669\uC120 \uC804\uCCB4\uB97C \uC9C0\uC6B8\uAE4C\uC694?'))return;if(typeof pushHist==='function')pushHist();state.lines=(state.lines||[]).filter(function(l){return !l.insp;});if(typeof saveProject==='function')saveProject();drawGeo();toast('\uD604\uD669\uC120 \uC804\uCCB4 \uC0AD\uC81C');};var rau=document.getElementById('roadAuto');if(rau)rau.onclick=function(){buildRoadZones();};var rcl=document.getElementById('roadClear');if(rcl)rcl.onclick=function(){if(!confirm('\uB3C4\uB85C\uBA74 \uC804\uCCB4\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?'))return;if(typeof pushHist==='function')pushHist();state.roadZones=[];classifyRoad();if(typeof saveProject==='function')saveProject();drawGeo();toast('\uB3C4\uB85C\uBA74 \uC0AD\uC81C');};var rtg=document.getElementById('roadToggle');if(rtg)rtg.onclick=function(){if(mode==='roadtoggle'){mode='pan';}else{mode='roadtoggle';toast('\uCE21\uC810\uC744 \uD074\uB9AD\uD558\uBA74 \uB3C4\uB85C\u2194\uBCF4\uB3C4 \uC804\uD658');}setModeUI();drawGeo();renderSub();};var rdl=document.getElementById('roadDel');if(rdl)rdl.onclick=function(){if(mode==='roaddel'){mode='pan';}else{mode='roaddel';toast('\uC9C0\uC6B8 \uB3C4\uB85C\uBA74 \uC548\uC744 \uD074\uB9AD');}setModeUI();renderSub();};var red=document.getElementById('roadEdit');if(red)red.onclick=function(){if(mode==='roadedit'){mode='pan';}else{mode='roadedit';toast('\uBA74 \uC815\uC810\uC744 \uB4DC\uB798\uADF8\uD574 \uC218\uC815');}setModeUI();drawGeo();renderSub();};var rfl=document.getElementById('roadFollow');if(rfl)rfl.onclick=function(){if(mode==='roadfollow'){mode='pan';roadFollow=null;}else{mode='roadfollow';roadFollow=null;if(typeof loadHyunPts==='function'){try{loadHyunPts();}catch(e){}}toast('\uBA74 \uC815\uC810 \uD074\uB9AD \u2192 \uD604\uD669\uC810 \uD074\uB9AD (\uC2A4\uD398\uC774\uC2A4=\uB05D)');}setModeUI();drawGeo();renderSub();};var rvx=document.getElementById('roadVtx');if(rvx)rvx.onclick=function(){if(mode==='roadvtxdel'){mode='roadvtxadd';toast('\uBCC0\uC744 \uD074\uB9AD\uD558\uBA74 \uC810 \uC0BD\uC785');}else if(mode==='roadvtxadd'){mode='pan';}else{mode='roadvtxdel';toast('\uC815\uC810\uC744 \uD074\uB9AD\uD558\uBA74 \uC0AD\uC81C');}setModeUI();drawGeo();renderSub();};}
function renderSub(){
  var c=curCat(),s=document.getElementById('subbar'),html='';
  if(c.k==='inspmk')html+=inspmkBar();else if(c.tools.length)html+=c.tools.map(mkBtn).join('');
  else if(c.hint&&!(typeof IS_REALTIME!=='undefined'&&IS_REALTIME))html+='<span class="subhint">'+c.hint+'</span>';
  if(mode==='line')html+='<button id="lineDone" class="on">완료</button>';
  var kbM=keyForAction('fixed:measure'),kbU=keyForAction('fixed:undo'),kbR=keyForAction('fixed:redo'),kbC=keyForAction('fixed:clearsym');
  var bdg=function(k){return k?' <span class="hk-badge" style="margin-left:4px">'+k+'</span>':'';};
  var vhtml='<button data-g="delall2" style="border:1px solid #c0392b;color:#c0392b;font-weight:700">🧹 지우기(통합)'+bdg(kbC)+'</button><button data-g="measure" style="border:1px solid #d32f2f;color:#d32f2f;font-weight:700"><span style="color:#f2b400">📏</span> 거리산출'+bdg(kbM)+'</button><button data-g="undo">← 되돌리기'+bdg(kbU)+'</button><button data-g="redo">다시 실행 →'+bdg(kbR)+'</button>'
      +'<span class="subhint">보기</span><button data-g="fit">전체</button>';
  if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME)html='<button id="rtNewProj" style="font-size:14px;padding:8px 13px;border:1px solid #6e757f;border-radius:6px;background:#fff;color:#333;font-weight:700;cursor:pointer;margin-right:6px">사업등록</button>'+html+((state.rtDone&&state.rtDone.done)?'<button id="rtDoneBtn" style="font-size:14px;padding:8px 13px;border:1px solid #1d9e75;border-radius:6px;background:#e1f5ee;color:#0f6e56;font-weight:700;margin-right:6px">완료됨 ✓</button>':'<button id="rtDoneBtn" style="font-size:14px;padding:8px 13px;border:1px solid #c0392b;border-radius:6px;background:#fff;color:#c0392b;font-weight:700;cursor:pointer;margin-right:6px">실측완료</button>')+((typeof isMobileDevice==='function'&&isMobileDevice())?'':'<button id="rtDoneListBtn" style="font-size:14px;padding:8px 13px;border:1px solid #1d9e75;border-radius:6px;background:#fff;color:#1d9e75;font-weight:700;cursor:pointer;margin-right:6px">완료목록</button>');
  s.innerHTML=html;
  if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME){var _np=document.getElementById('rtNewProj');if(_np)_np.onclick=function(){if(typeof openRegModal==='function')openRegModal();};var _dn=document.getElementById('rtDoneBtn');if(_dn)_dn.onclick=function(){if(typeof rtOpenDoneModal==='function')rtOpenDoneModal();};var _dl=document.getElementById('rtDoneListBtn');if(_dl)_dl.onclick=function(){if(typeof rtOpenDoneList==='function')rtOpenDoneList();};}
  if(c.k==='inspmk')wireInspmk(s);
  var gb=document.getElementById('globalbtns'); if(gb)gb.innerHTML=vhtml;
  c.tools.forEach(function(tool,i){if(tool.soon)return;var b=s.querySelector('button[data-i="'+i+'"]');if(!b)return;
    b.onclick=function(){
      if(tool.delLayer)delLayer=tool.delLayer;
      if(tool.fn)tool.fn();
      if(tool.setmode){mode=tool.setmode;setModeUI();if(tool.hint)toast(tool.hint);}
      if(tool.mode){if(mode===tool.mode){mode='pan';}else{mode=tool.mode;if(mode==='bperase'){toast('지우기: 건물선·글씨 근처에 올리면 가장 가까운 선이 빨갛게 — 클릭해 삭제');}else if(tool.hint){toast(tool.hint);}}setModeUI();}
      if(tool.status){status=tool.status;setStatusUI();}
    };});
  s.querySelectorAll('button.soon').forEach(function(b){b.onclick=function(){toast(b.textContent+' — 다음 단계에서 추가 예정');};});
  var ld=document.getElementById('lineDone');if(ld)ld.onclick=finishDraw;
  if(gb)gb.querySelectorAll('button[data-g]').forEach(function(b){b.onclick=function(){var g=b.getAttribute('data-g');
    if(readOnly&&(g==='undo'||g==='redo'||g==='delall2')){toast('보기 전용 — 수정은 상단 "사업 선택"으로 불러오세요');return;}
    if(g==='undo')doUndo();
    else if(g==='redo')doRedo();
    else if(g==='delall2'){if(mode==='delall2'){mode='pan';toast('통합 지우기 종료');}else{mode='delall2';toast('통합 지우기: 지울 선·맨홀·입상주·측점을 클릭하세요 (선택한 것만 삭제)');}setModeUI();}
    else if(g==='measure'){if(mode==='measure'){mode='pan';measurePts=[];clearSvg(gMeasure);clearLabels('measure');toast('거리산출 종료');}else{mode='measure';measurePts=[];clearSvg(gMeasure);clearLabels('measure');toast('거리산출: 두 점을 클릭하세요 (측점·맨홀 자동 스냅, 3번째 클릭은 새로 시작)');}setModeUI();}
    else if(g==='fit'){fitView();drawGeo();drawManholes();}};});
  var db=gb&&gb.querySelector('button[data-g="delall2"]');if(db&&mode==='delall2'){db.style.background='#c0392b';db.style.color='#fff';db.style.borderColor='#c0392b';}
  var mb=gb&&gb.querySelector('button[data-g="measure"]');if(mb&&mode==='measure'){mb.style.background='#e8590c';mb.style.color='#fff';mb.style.borderColor='#e8590c';}
}
/* ====== 단축키 시스템 ====== */
var HK_KEY='survey_hotkeys';
function loadHotkeys(){try{return JSON.parse(localStorage.getItem(HK_KEY)||'{}')||{};}catch(e){return {};}}
function saveHotkeys(){try{localStorage.setItem(HK_KEY,JSON.stringify(hotkeys));}catch(e){}}
var hotkeys=loadHotkeys(); // {actionId:'A'}
function keyForAction(id){return hotkeys[id]?hkLabel(hotkeys[id]):'';}
function actionForKey(key){for(var id in hotkeys){if(hotkeys[id]===key)return id;}return null;}
function normKey(e){var k=e.key;if(!k)return '';
  if(k===' ')return '';                       // 스페이스=그리기 완료용, 제외
  if(k.length===1)return k.toUpperCase();
  if(/^(Arrow(Up|Down|Left|Right)|F[1-9]|F1[0-2])$/.test(k))return k;
  return '';}
function hkLabel(k){return k.replace('Arrow','').replace('Up','↑').replace('Down','↓').replace('Left','←').replace('Right','→');}
function actionList(){var arr=[];
  TB.forEach(function(c){arr.push({id:'cat:'+c.k,name:c.icon+' '+c.label,grp:c.label});
    c.tools.forEach(function(t,i){if(t.soon)return;arr.push({id:'tool:'+c.k+':'+i,name:'└ '+t.t,grp:c.label});});});
  arr.push({id:'fixed:clearsym',name:'🧹 지우기(통합)',grp:'도구'});
  arr.push({id:'fixed:measure',name:'📏 거리산출',grp:'도구'});
  arr.push({id:'fixed:undo',name:'← 되돌리기',grp:'도구'});
  arr.push({id:'fixed:redo',name:'다시 실행 →',grp:'도구'});
  return arr;}
function runAction(id){
  if(id==='fixed:undo'){doUndo();return;}
  if(id==='fixed:redo'){doRedo();return;}
  if(id==='fixed:clearsym'){var cb=document.querySelector('#globalbtns button[data-g="delall2"]');if(cb)cb.click();return;}
  if(id==='fixed:measure'){var mb=document.querySelector('#globalbtns button[data-g="measure"]');if(mb)mb.click();return;}
  if(id.indexOf('cat:')===0){var k=id.slice(4);activeCat=k;var c=curCat();
    if(c.setmode){mode=c.setmode;cv.classList.toggle('draw',mode!=='pan');setModeUI();}
    renderRail();renderSub();if(c.hint&&!c.tools.length)toast(c.hint);}
  else if(id.indexOf('tool:')===0){var p=id.split(':'),ck=p[1],i=+p[2];
    activeCat=ck;renderRail();renderSub();
    var b=document.querySelector('#subbar button[data-i="'+i+'"]');if(b)b.click();}
}
var hkCapturing=null;
function openHotkeyModal(){
  var ov=document.createElement('div');ov.className='hk-overlay';ov.id='hkOverlay';
  ov.innerHTML='<div class="hk-card"><h3>⌨ 단축키 설정 <span style="font-weight:400;color:#999;font-size:12px">— 칸을 누른 뒤 키보드를 누르세요</span></h3><div class="hk-body" id="hkBody"></div><div class="hk-foot"><button id="hkReset" style="background:#fff;color:#888;border:1px solid #e3e3df;border-radius:7px">전체 초기화</button><button id="hkClose" style="background:#222;color:#fff;border:none;border-radius:7px;font-weight:600">닫기</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('mousedown',function(e){if(e.target===ov)closeHotkeyModal();});
  document.getElementById('hkClose').onclick=closeHotkeyModal;
  document.getElementById('hkReset').onclick=function(){if(confirm('설정한 단축키를 모두 지울까요?')){hotkeys={};saveHotkeys();renderHkBody();renderRail();renderSub();}};
  renderHkBody();
}
function closeHotkeyModal(){hkCapturing=null;var ov=document.getElementById('hkOverlay');if(ov)ov.remove();}
function renderHkBody(){
  var body=document.getElementById('hkBody');if(!body)return;
  var list=actionList(),html='',lastGrp=null;
  list.forEach(function(a){
    if(a.grp!==lastGrp){html+='<div class="hk-grp">'+a.grp+'</div>';lastGrp=a.grp;}
    var raw=hotkeys[a.id],disp=hkCapturing===a.id?'…':(raw?hkLabel(raw):'지정');
    var cls='keyb'+(raw?' set':'')+(hkCapturing===a.id?' cap':'');
    html+='<div class="hk-row"><span class="nm">'+a.name+'</span><span class="'+cls+'" data-id="'+a.id+'">'+disp+'</span><span class="clr" data-clr="'+a.id+'">✕</span></div>';
  });
  body.innerHTML=html;
  body.querySelectorAll('.keyb').forEach(function(el){el.onclick=function(){hkCapturing=el.getAttribute('data-id');renderHkBody();};});
  body.querySelectorAll('.clr').forEach(function(el){el.onclick=function(){var id=el.getAttribute('data-clr');delete hotkeys[id];saveHotkeys();renderHkBody();renderRail();renderSub();};});
}
window.addEventListener('keydown',function(e){
  if(mode==='roadfollow'&&(e.key===' '||e.code==='Space')){e.preventDefault();mode='pan';roadFollow=null;if(typeof setModeUI==='function')setModeUI();drawGeo();if(typeof renderSub==='function')renderSub();toast('\uD604\uD669\uC120 \uB530\uB77C \uC885\uB8CC');return;}
  if(hyunDraw&&(e.key===' '||e.code==='Space')&&hyunDraw.pts&&hyunDraw.pts.length>=2){e.preventDefault();hyunFinish(false);return;}if(hyunDraw&&e.key==='Escape'){hyunDraw=null;hyunSnapMk.style.display='none';roadRubber.style.display='none';if(typeof drawGeo==='function')drawGeo();return;}
  if(hkCapturing){
    if(e.key==='Escape'){hkCapturing=null;renderHkBody();return;}
    var nk=normKey(e);if(!nk)return;e.preventDefault();
    var prev=actionForKey(nk);if(prev&&prev!==hkCapturing)delete hotkeys[prev];
    hotkeys[hkCapturing]=nk;hkCapturing=null;saveHotkeys();renderHkBody();renderRail();renderSub();return;
  }
  var tg=(e.target&&e.target.tagName)||'';if(/INPUT|TEXTAREA|SELECT/.test(tg))return;
  if(document.getElementById('hkOverlay'))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  var k=normKey(e);if(!k)return;
  var id=actionForKey(k);if(id){e.preventDefault();runAction(id);}
},true);

renderRail();renderSub();
bind('save',saveProject);
bind('delProj',deleteProject);
bind('bpToggle',function(){bpOff=!bpOff;var b=document.getElementById('bpToggle');if(b){b.classList.toggle('off',bpOff);b.textContent=bpOff?'🗺 백판 OFF':'🗺 백판 ON';}drawGeo();});

/* ====== 사업 등록 모달 ====== */
var pendingPhotos=null, pendingAsbuilt=null;
function regOpen(){return document.getElementById('regModal').style.display!=='none';}
function updRegStatus(){
  var c=document.getElementById('rcCsv');
  if(state.points&&state.points.length){var ng=csvGroups().length;c.textContent='측점 '+state.points.length+'개'+(ng>1?(' · '+ng+'개 파일'):'')+' 로딩됨';c.classList.add('done');}
  else{c.textContent='측점 데이터 (.csv)';c.classList.remove('done');}
  var d=document.getElementById('rcDxf');
  var nb=(state.lines||[]).filter(function(l){return l.base;}).length;
  if(nb){d.textContent='백판 '+nb+'개 라인 로딩됨';d.classList.add('done');}
  else{d.textContent='백판 도면 (.dxf)';d.classList.remove('done');}
  var p=document.getElementById('rcPho');
  if(pendingPhotos&&pendingPhotos.length){p.textContent='사진 '+pendingPhotos.length+'장 선택됨';p.classList.add('done');}
  else{p.textContent='사진 (파일명=측점번호)';p.classList.remove('done');}
  if(state.points&&state.points.length&&typeof crsCheck==='function')crsCheck();
  var _tg=function(id,on){var b=document.getElementById(id);if(b)b.style.display=on?'inline-block':'none';};
  _tg('clrCsv', !!(state.points&&state.points.length));
  _tg('clrAft', !!(state.depthGround&&state.depthGround.length));
  (function(){var _st=document.getElementById('rcAft'),_o=document.getElementById('rcAftOut'),_cnt=document.getElementById('rcAftCnt');if(_cnt){var _nL=0,_nH=0,_nM=0;(typeof finalCsvArr==='function'?finalCsvArr():[]).forEach(function(it){var _pp=(typeof parseInspCsv==='function')?parseInspCsv(it.text||''):[];_pp.forEach(function(p){if(p.skip)return;if(p.code==='l')_nL++;else if(p.code==='SKTM')_nM++;else if(p.code==='B'||p.code==='D'||p.code==='BD')_nH++;});});_cnt.textContent=(_nL||_nH||_nM)?('측점 '+_nL+'점 · 현황 '+_nH+'점 · 맨홀 '+_nM+'개'):'';}if(state.depthGround&&state.depthGround.length){var _r=(typeof computeDepth==='function')?computeDepth():{avg:0,ok:0,total:state.depthGround.length};if(_st)_st.textContent='복구후 '+state.depthGround.length+'점 등록됨'+((typeof finalCsvArr==='function'&&finalCsvArr().length)?(' ('+finalCsvArr().length+'CSV)'):'');if(_o&&_r)_o.textContent='✅ 평균심도 '+(_r.avg||0).toFixed(2)+'m · '+_r.ok+'/'+_r.total+'점 매칭';}})();
  _tg('clrDxf', (state.lines||[]).filter(function(l){return l.base;}).length>0);
  _tg('clrPho', !!(pendingPhotos&&pendingPhotos.length));
}
function _openRegNow(){
  (function(){var box=document.querySelector('#regModal .regbox'),tb=document.getElementById('regTamsaBtn'),rb=document.getElementById('regRealBtn');if(box)box.classList.toggle('tamsa-on',!!state.tamsa);if(tb)tb.classList.toggle('on',!!state.tamsa);if(rb)rb.classList.toggle('on',!state.tamsa);})();
  document.getElementById('regName').value=state.projectName||'';
  pendingPhotos=null;pendingAsbuilt=null;if(typeof asbuiltStageUI==='function')asbuiltStageUI();if(typeof fillBizInfo==='function')fillBizInfo(state.bizInfo);
  (function(){var rn=document.getElementById('regNight'),rnc=document.getElementById('regNightCut');if(rn)rn.checked=!!(state.nightShift&&state.nightShift.on);if(rnc&&state.nightShift&&state.nightShift.cut!=null)rnc.value=('0'+Math.floor(state.nightShift.cut/60)).slice(-2)+':'+('0'+(state.nightShift.cut%60)).slice(-2);})();
  var crs=state.crs||'5186';var rc=document.querySelector('input[name="regCrs"][value="'+crs+'"]');if(rc)rc.checked=true;
  var out=document.getElementById('crsResult');out.textContent='CSV 로딩 후 변환 확인';out.style.color='';
  document.getElementById('crsMapLink').style.display='none';
  document.getElementById('regModal').style.display='flex';
  updRegStatus();
  setTimeout(function(){document.getElementById('regName').focus();},30);
}
function clearForNew(){state.tamsa=false;state.projectId=null;state.projectName='';state.points=[];state.routingDone=false;state.asbuilt=null;state.nightShift=null;state.fieldDone=null;state.bizInfo=null;if(typeof fillBizInfo==='function')fillBizInfo({});if(typeof refreshFieldBar==='function')refreshFieldBar();if(typeof setReadOnly==='function')setReadOnly(false);(state.markups||[]).forEach(function(m){if(m.el)m.el.remove();});state.markups=[];state.lines=[];state.manholes=[];state.photoDir={};photoMap={};afterMap={};selNum=null;state.labelOff={};clearSvg(gSel);clearSvg(gMH);redrawAll();updMeta();}
function regStartWarn(){
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:1001;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center';
  var box=document.createElement('div');
  box.style.cssText='background:#fff;border-radius:14px;max-width:430px;width:90%;box-shadow:0 10px 34px rgba(0,0,0,.3);overflow:hidden';
  box.innerHTML='<div style="background:#fff5f5;border-bottom:1px solid #f3c9c4;padding:16px 18px;font-size:16px;font-weight:800;color:#c0392b">⚠ 작업 중인 사업이 열려 있습니다</div>'
    +'<div style="padding:16px 18px;font-size:13.5px;line-height:1.7;color:#333">지금 등록 창에서 CSV를 올리면 <b>기존 측점에 합쳐져</b> 작업이 섞일 수 있습니다.<br><br>· <b>새 사업으로 시작</b> — 현재 측점·결선·특이사항을 비우고 새로 시작<br>· <b>이어서 추가</b> — 기존 사업에 측점 추가(다중 날짜 등)</div>'
    +'<div style="display:flex;gap:8px;padding:0 18px 18px;justify-content:flex-end;flex-wrap:wrap">'
    +'<button id="rswCancel" style="border:1px solid #ccc;background:#fff;border-radius:9px;padding:9px 14px;font-size:13px;cursor:pointer">취소</button>'
    +'<button id="rswCont" style="border:1px solid #1f6fd6;background:#eef4fc;color:#1f6fd6;border-radius:9px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer">➕ 이어서 추가</button>'
    +'<button id="rswNew" style="border:1px solid #c0392b;background:#c0392b;color:#fff;border-radius:9px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer">🆕 새 사업으로 시작</button>'
    +'</div>';
  box.querySelector('#rswCancel').onclick=function(){ov.remove();};
  box.querySelector('#rswCont').onclick=function(){ov.remove();_openRegNow();};
  box.querySelector('#rswNew').onclick=function(){ov.remove();clearForNew();_openRegNow();};
  ov.appendChild(box);ov.onclick=function(e){if(e.target===ov)ov.remove();};
  document.body.appendChild(ov);
}
function openRegModal(){
  var work=state.projectId||(state.lines||[]).some(function(l){return l&&!l.base;})||(state.markups||[]).length||(state.manholes||[]).length;
  if(work){regStartWarn();return;}
  _openRegNow();
}
function closeRegModal(){document.getElementById('regModal').style.display='none';pendingPhotos=null;pendingAsbuilt=null;if(typeof asbuiltStageUI==='function')asbuiltStageUI();}
function readBizInfo(){function g(id){var e=document.getElementById(id);return e?(e.value||'').trim():'';}return {client:g('regClient'),category:g('regCategory'),facility:g('regFacility'),bizNo:g('regBizNo')};}
function fillBizInfo(b){b=b||{};function s(id,v){var e=document.getElementById(id);if(e)e.value=v||'';}s('regClient',b.client);s('regCategory',b.category);s('regFacility',b.facility);s('regBizNo',b.bizNo);}
function registerProject(){
  var name=document.getElementById('regName').value.trim();
  if(!name){toast('사업명을 입력하세요');document.getElementById('regName').focus();return;}
  if(!online){toast('로컬 모드 — Supabase 연결이 필요합니다');return;}
  if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME&&!/_S$/.test(name))name+='_S'; /* [BUILD 913] 실시간측량 사업명 _S 자동 부착 */
  state.projectName=name;
  state.mnList=[];state.bizInfo=readBizInfo();
  var crsEl=document.querySelector('input[name="regCrs"]:checked');state.crs=crsEl?crsEl.value:'5186';
  var payload={points:(state._pointsOrig||state.points),gpsPts:(state.gpsPts||[]),lines:(state._linesOrig||state.lines),baseTexts:state.baseTexts||[],labelOff:state.labelOff,markups:state.markups.map(function(m){var c={};for(var k in m)if(k!=='el')c[k]=m[k];return c;}),manholes:state.manholes,crs:state.crs,photoDir:state.photoDir,routingDone:!!state.routingDone,asbuilt:state.asbuilt||null,rtDone:state.rtDone||null,trash:state._trash||[],nightShift:state.nightShift||null,fieldDone:state.fieldDone||null,finalCsv:state.finalCsv||null,tamsa:!!state.tamsa,bizInfo:state.bizInfo||null,depthGround:state.depthGround||null,bpzones:state.bpzones||[],roadZones:state.roadZones||[],depthCheck:state.depthCheck||[],titleBlock:state.titleBlock||null,tangoEdit:state.tangoEdit||null,tangoManual:state.tangoManual||null,tgStore:state.tgStore||null,mnList:state.mnList||[]};
  payload.stage=STAGE;
  var row={name:name,payload:payload,updated_at:new Date().toISOString()};
  if(state.projectId)row.id=state.projectId;
  var photos=pendingPhotos; // 모달 닫으면 null되므로 미리 캡쳐
  var asb=pendingAsbuilt;
  toast('등록 중…');
  sb.from(DB+'_projects').upsert(row).select().then(function(res){
    if(res.error){toast('등록 오류: '+res.error.message);return;}
    var saved=res.data&&res.data[0];if(saved){state.projectId=saved.id;state.loadedStage=STAGE;}
    sb.from(DB+'_history').insert({project_id:state.projectId,payload:payload});
    refreshProjects();
    closeRegModal();
    if(photos&&photos.length)uploadPhotos(photos); // projectId 확보 후 사진 업로드
    if(asb)uploadAsbuilt(asb,function(){saveProject();}); // 준공도면 업로드 후 URL 저장
    toast('사업 등록 완료: '+name);
  });
}
bind('regX',closeRegModal);
bind('regCancel',closeRegModal);
bind('regOk',registerProject);
(function(){
  var tb=document.getElementById('regTamsaBtn');
  function _regSetMode(on){var box=document.querySelector('#regModal .regbox');state.tamsa=on;if(box)box.classList.toggle('tamsa-on',on);var _tb=document.getElementById('regTamsaBtn'),_rb=document.getElementById('regRealBtn');if(_tb)_tb.classList.toggle('on',on);if(_rb)_rb.classList.toggle('on',!on);}
  if(tb)tb.onclick=function(){_regSetMode(true);};
  var rb=document.getElementById('regRealBtn');
  if(rb)rb.onclick=function(){_regSetMode(false);};
  var fT=document.getElementById('fTamsa');
  if(fT)fT.onchange=function(){if(fT.files&&fT.files.length){if(regOpen())regAddCsvFilesTamsa(fT.files);else loadTamsaCsv(fT.files[0]);}fT.value='';};
  var bT=document.getElementById('rcTamsaBtn');
  if(bT)bT.onclick=function(){document.getElementById('fTamsa').click();};
  var dT=document.getElementById('dropTamsa');
  if(dT){
    dT.addEventListener('click',function(){document.getElementById('fTamsa').click();});
    dT.addEventListener('dragover',function(e){e.preventDefault();dT.classList.add('over');});
    dT.addEventListener('dragleave',function(){dT.classList.remove('over');});
    dT.addEventListener('drop',function(e){e.preventDefault();dT.classList.remove('over');var fs=e.dataTransfer.files;if(fs&&fs.length){if(regOpen())regAddCsvFilesTamsa(fs);else loadTamsaCsv(fs[0]);}});
  }
  var cT=document.getElementById('clrTamsa');
  if(cT)cT.onclick=function(){
    state.finalCsv=[];state.points=[];clearSvg(gSel);clearSvg(gMH);
    drawGeo();drawMarks();drawManholes();
    var el=document.getElementById('rcTamsa');if(el)el.textContent='탐사 측점 데이터 (.csv)';
    cT.style.display='none';updMeta();if(regOpen())updRegStatus();
  };
})();
(function(){
  function setNS(){var on=document.getElementById('regNight').checked;var t=document.getElementById('regNightCut').value||'06:00';var cut=timeMin(t);state.nightShift={on:on,cut:(cut==null?360:cut)};var n=applyNightShift();toast(on?('야간 보정 ON — 새벽 '+t+' 이전 '+n+'점을 전날로'):'야간 보정 OFF ('+n+'점 복귀)');}
  var n=document.getElementById('regNight');if(n)n.onchange=setNS;
  var nc=document.getElementById('regNightCut');if(nc)nc.onchange=function(){if(document.getElementById('regNight').checked)setNS();};
})();
/* ===== 준공도면 (as-built) ===== */
function asbuiltStageUI(){var n=document.getElementById('asbuiltName'),c=document.getElementById('clrAsbuilt');if(!n)return;if(pendingAsbuilt){n.textContent=pendingAsbuilt.name;n.style.cssText='display:inline-block;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;font-size:11px';c.style.display='inline-block';}else{n.textContent='';c.style.display='none';}}
(function(){
  var b=document.getElementById('rcAsbuiltBtn');if(b)b.onclick=function(){document.getElementById('fAsbuilt').click();};
  var f=document.getElementById('fAsbuilt');if(f)f.addEventListener('change',function(e){var file=e.target.files[0];if(file){pendingAsbuilt=file;asbuiltStageUI();toast('준공도면 선택: '+file.name+' (등록 시 업로드)');}e.target.value='';});
  var c=document.getElementById('clrAsbuilt');if(c)c.onclick=function(){pendingAsbuilt=null;asbuiltStageUI();};
  var fd=document.getElementById('fAsbuiltDirect');if(fd)fd.addEventListener('change',function(e){var file=e.target.files[0];if(file)uploadAsbuilt(file,function(){saveProject();openAsbuilt();});e.target.value='';});
  var ab=document.getElementById('asbuiltBtn');if(ab)ab.onclick=openAsbuilt;
})();
function uploadAsbuilt(file,cb){
  if(!online){toast('로컬 모드 — 준공도면 저장 불가');return;}
  if(!state.projectId){toast('먼저 사업을 저장한 뒤 준공도면을 올려주세요');return;}
  var ext=((file.name.match(/\.([A-Za-z0-9]+)$/)||[])[1]||'').toLowerCase();
  var isPdf=ext==='pdf'||(file.type||'').indexOf('pdf')>=0;
  var put=function(blob,outExt,ctype){
    var path=state.projectId+'/_asbuilt.'+outExt;
    sb.storage.from('photos').upload(path,blob,{upsert:true,contentType:ctype}).then(function(up){
      if(up.error){toast('준공도면 업로드 오류: '+up.error.message);return;}
      var url=sb.storage.from('photos').getPublicUrl(path).data.publicUrl+'?t='+Date.now();
      state.asbuilt={url:url,ext:outExt};
      toast('준공도면 업로드 완료'+(outExt==='jpg'?' (자동 압축)':''));
      if(cb)cb();
    });
  };
  toast('준공도면 업로드 중…');
  if(isPdf){put(file,'pdf','application/pdf');}
  else{compressImage(file,2400,0.85).then(function(blob){put(blob,'jpg','image/jpeg');}).catch(function(){put(file,(ext||'jpg'),file.type||'image/jpeg');});}
}
function asbuiltEmbed(win,buf){
  try{var u=URL.createObjectURL(new Blob([buf],{type:'application/pdf'}));
    win.document.body.style.cssText='margin:0;background:#525659';
    win.document.body.innerHTML='<embed src="'+u+'" type="application/pdf" style="width:100%;height:100vh;border:0">';
  }catch(e){}
}
function renderPdfPages(buf){
  if(window.pdfjsLib&&!pdfjsLib.GlobalWorkerOptions.workerSrc)pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  return pdfjsLib.getDocument({data:buf}).promise.then(function(pdf){
    var imgs=[],N=Math.min(pdf.numPages,12);
    function step(i){
      if(i>N)return imgs;
      return pdf.getPage(i).then(function(page){
        var b=page.getViewport({scale:1});var sc=Math.min(2.2,2200/Math.max(b.width,1));if(sc<0.6)sc=0.6;
        var vp=page.getViewport({scale:sc});
        var c=document.createElement('canvas');c.width=Math.round(vp.width);c.height=Math.round(vp.height);
        return page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise.then(function(){
          imgs.push(c.toDataURL('image/jpeg',0.85));return step(i+1);
        });
      });
    }
    return Promise.resolve(step(1));
  });
}
function asbuiltViewer(win,srcs){
  var d=win.document;
  d.body.style.cssText='margin:0;height:100vh;background:#525659;overflow:hidden';
  d.body.innerHTML='<div id="wrap" style="position:absolute;inset:0;overflow:hidden;cursor:grab"><div id="content" style="transform-origin:0 0;position:absolute;left:0;top:0">'
    +srcs.map(function(s){return '<img src="'+s+'" style="display:block;margin:0 auto 8px;max-width:none;background:#fff">';}).join('')
    +'</div></div><div style="position:fixed;left:10px;bottom:10px;color:#eee;font:12px sans-serif;background:rgba(0,0,0,.5);padding:5px 10px;border-radius:7px">휠 = 확대·축소 · 드래그 = 이동</div>';
  var wrap=d.getElementById('wrap'),ct=d.getElementById('content');
  var scale=1,tx=0,ty=0,drag=false,sx=0,sy=0;
  function apply(){ct.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';}
  wrap.addEventListener('wheel',function(e){e.preventDefault();var r=wrap.getBoundingClientRect();var mx=e.clientX-r.left,my=e.clientY-r.top;var f=e.deltaY<0?1.12:1/1.12;var ns=Math.min(10,Math.max(0.1,scale*f));tx=mx-(mx-tx)*(ns/scale);ty=my-(my-ty)*(ns/scale);scale=ns;apply();},{passive:false});
  wrap.addEventListener('mousedown',function(e){drag=true;sx=e.clientX-tx;sy=e.clientY-ty;wrap.style.cursor='grabbing';e.preventDefault();});
  win.addEventListener('mousemove',function(e){if(!drag)return;tx=e.clientX-sx;ty=e.clientY-sy;apply();});
  win.addEventListener('mouseup',function(){drag=false;wrap.style.cursor='grab';});
  setTimeout(function(){var cw=wrap.clientWidth||900,iw=0;[].forEach.call(ct.getElementsByTagName('img'),function(im){iw=Math.max(iw,im.naturalWidth||0);});if(iw>0){scale=Math.min(1,(cw-20)/iw);tx=(cw-iw*scale)/2;}apply();},150);
  apply();
}
function openAsbuilt(){
  var a=state.asbuilt;
  if(!a||!a.url){
    if(state.projectId){if(confirm('이 사업에 등록된 준공도면이 없습니다.\n지금 올릴까요? (PDF·이미지)'))document.getElementById('fAsbuiltDirect').click();}
    else toast('먼저 사업을 저장한 뒤 준공도면을 올려주세요');
    return;
  }
  var win=window.open('','asbuilt','width=1100,height=1200,resizable=yes,scrollbars=yes');
  if(!win){toast('팝업이 차단됨 — 팝업 허용 후 다시 누르세요');window.open(a.url,'_blank');return;}
  try{
    win.document.title='준공도면 — '+(state.projectName||'');
    win.document.body.style.cssText='margin:0;font:14px sans-serif;background:#525659';
    win.document.body.innerHTML='<div style="padding:20px;color:#eee">준공도면 불러오는 중…</div>';
  }catch(e){}
  fetch(a.url).then(function(r){return r.arrayBuffer();}).then(function(buf){
    var isPdf=(a.ext==='pdf');
    if(isPdf){
      if(window.pdfjsLib){return renderPdfPages(buf).then(function(imgs){asbuiltViewer(win,imgs);}).catch(function(){asbuiltEmbed(win,buf);});}
      asbuiltEmbed(win,buf);
    }else{
      asbuiltViewer(win,[URL.createObjectURL(new Blob([buf],{type:'image/jpeg'}))]);
    }
  }).catch(function(){try{win.document.body.innerHTML='<div style="padding:24px;font:15px sans-serif;color:#eee;line-height:1.7">도면을 창 안에서 열지 못했습니다(접근 제한).<br><br><a href="'+a.url+'" target="_blank" style="color:#9cf">여기를 눌러 새 탭에서 열기</a></div>';}catch(e){window.open(a.url,'_blank');}});
}
document.getElementById('rcCsvBtn').onclick=function(){document.getElementById('fCsv').click();};document.getElementById('rcAftBtn').onclick=function(){if(typeof openFinalCsvUpload==='function')openFinalCsvUpload();else document.getElementById('fAft').click();};var _clrAft=document.getElementById('clrAft');if(_clrAft)_clrAft.onclick=function(){state.finalCsv=[];if(state.fieldDone)state.fieldDone.csv=false;state.depthGround=null;state._depthAlign=null;if(online&&state.projectId)saveProject();if(typeof refreshFieldBar==='function')refreshFieldBar();var st=document.getElementById('rcAft');if(st)st.textContent='복구후 후측량 (.csv)';var o=document.getElementById('rcAftOut');if(o)o.textContent='';this.style.display='none';toast('심도 데이터 삭제');};(function(){if(!IS_TANGO){var c=document.getElementById('regAftCard');if(c)c.style.display='none';}})();
document.getElementById('rcDxfBtn').onclick=function(){document.getElementById('fDxf').click();};
document.getElementById('rcPhoBtn').onclick=function(){document.getElementById('fRegPhotos').click();};
(function(){
  var c1=document.getElementById('clrCsv');if(c1)c1.onclick=openCsvList;
  var c2=document.getElementById('clrPho');if(c2)c2.onclick=openPhotoList;
  var c3=document.getElementById('clrDxf');if(c3)c3.onclick=function(){state.lines=(state.lines||[]).filter(function(l){return !l.base;});state.baseTexts=[];drawGeo();updMeta();updRegStatus();toast('수치지도(백판) 제거됨');};
})();
function openPhotoList(){
  if(!pendingPhotos||!pendingPhotos.length){toast('선택된 사진이 없습니다');return;}
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center';
  var box=document.createElement('div');
  box.style.cssText='background:#fff;border-radius:12px;max-width:440px;width:88%;max-height:74vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.25)';
  function render(){
    var rows=pendingPhotos.map(function(f,i){return '<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid #f2f2f2;font-size:13px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+f.name+'</span><button data-i="'+i+'" class="ppl-x" style="flex:none;border:1px solid #e3b4ae;background:#fff;color:#c0392b;border-radius:6px;padding:2px 9px;font-size:12px;cursor:pointer">✕</button></div>';}).join('');
    box.innerHTML='<div style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #eee"><b style="flex:1;font-size:15px">선택 사진 '+pendingPhotos.length+'장</b><button id="pplClose" style="border:none;background:#f2f2f2;border-radius:7px;padding:5px 11px;cursor:pointer">닫기</button></div><div style="overflow:auto">'+rows+'</div><div style="padding:10px 14px;border-top:1px solid #eee;text-align:right"><button id="pplAll" style="border:1px solid #e3b4ae;background:#fff;color:#c0392b;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer">전체 비우기</button></div>';
    [].forEach.call(box.querySelectorAll('.ppl-x'),function(b){b.onclick=function(){var i=+this.getAttribute('data-i');pendingPhotos.splice(i,1);updRegStatus();if(!pendingPhotos.length){pendingPhotos=null;ov.remove();toast('사진 전부 제거됨');return;}render();};});
    box.querySelector('#pplClose').onclick=function(){ov.remove();};
    box.querySelector('#pplAll').onclick=function(){pendingPhotos=null;updRegStatus();ov.remove();toast('선택 사진 전부 제거됨');};
  }
  render();
  ov.appendChild(box);ov.onclick=function(e){if(e.target===ov)ov.remove();};
  document.body.appendChild(ov);
}
function regAddPhotos(list){expandPhotoFiles(list).then(function(files){if(!files.length){toast('처리할 사진이 없습니다');return;}pendingPhotos=(pendingPhotos||[]).concat(files);updRegStatus();toast('사진 '+pendingPhotos.length+'장 선택 (등록 시 업로드)');});}
document.getElementById('fRegPhotos').addEventListener('change',function(e){regAddPhotos(e.target.files);e.target.value='';});
function setupDrop(zid,onfiles){var z=document.getElementById(zid);if(!z)return;
  z.addEventListener('dragover',function(e){e.preventDefault();e.stopPropagation();z.classList.add('over');});
  z.addEventListener('dragleave',function(e){e.preventDefault();e.stopPropagation();z.classList.remove('over');});
  z.addEventListener('drop',function(e){e.preventDefault();e.stopPropagation();z.classList.remove('over');var fs=e.dataTransfer&&e.dataTransfer.files;if(fs&&fs.length)onfiles(fs);});
}
setupDrop('dropCsv',function(fs){if(regOpen())regAddCsvFiles(fs);else loadCsvFile(fs[0]);});
setupDrop('dropDxf',function(fs){loadDxfFile(fs[0]);});
setupDrop('dropPho',function(fs){regAddPhotos(fs);});setupDrop('dropAft',function(fs){loadAfterCsv(fs[0]);});
document.getElementById('dropCsv').addEventListener('click',function(){document.getElementById('fCsv').click();});document.getElementById('dropAft').addEventListener('click',function(){document.getElementById('fAft').click();});
document.getElementById('dropDxf').addEventListener('click',function(){document.getElementById('fDxf').click();});
document.getElementById('dropPho').addEventListener('click',function(){document.getElementById('fRegPhotos').click();});
document.getElementById('regModal').addEventListener('dragover',function(e){e.preventDefault();});
document.getElementById('regModal').addEventListener('drop',function(e){e.preventDefault();});
document.getElementById('regModal').addEventListener('click',function(e){if(e.target===this)closeRegModal();});

/* ===== 좌표계 변환 (proj4: TM → WGS84) ===== */
(function(){if(typeof proj4==='undefined')return;
  proj4.defs('KTM5185','+proj=tmerc +lat_0=38 +lon_0=125 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs');
  proj4.defs('KTM5186','+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs');
  proj4.defs('KTM5187','+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs');
})();
function toLatLng(east,north,crs){if(typeof proj4==='undefined')return null;try{var r=proj4('KTM'+(crs||state.crs||'5186'),'WGS84',[east,north]);return {lng:r[0],lat:r[1]};}catch(e){return null;}}
function regSelectedCrs(){var el=document.querySelector('input[name="regCrs"]:checked');return el?el.value:'5186';}
function crsCheck(){
  var crs=regSelectedCrs();state.crs=crs;
  var out=document.getElementById('crsResult'),lk=document.getElementById('crsMapLink');
  if(!state.points||!state.points.length){out.textContent='CSV를 먼저 로딩하세요';out.style.color='#d98200';lk.style.display='none';return;}
  var p=state.points[0],ll=toLatLng(p.x,p.y,crs);
  if(!ll){out.textContent='변환 실패 (proj4 로드 확인)';out.style.color='#d32f2f';lk.style.display='none';return;}
  var zn={'5185':'서부','5186':'중부','5187':'동부'}[crs]||crs;
  out.style.color='#2a9e50';
  out.innerHTML='측점 '+p.no+' ('+zn+'원점)<br>위도 '+ll.lat.toFixed(6)+' / 경도 '+ll.lng.toFixed(6);
  lk.href='https://map.kakao.com/link/map/'+encodeURIComponent(p.no+' 측점')+','+ll.lat+','+ll.lng;
  lk.style.display='block';
}
document.getElementById('crsCheckBtn').onclick=crsCheck;
document.querySelectorAll('input[name="regCrs"]').forEach(function(r){r.addEventListener('change',function(){state.crs=regSelectedCrs();crsCheck();});});

/* ===== 지도 / 로드뷰 (카카오) ===== */
var KAKAO_KEY='5b0b406bb81a843663c796bed1d59a9a'; // 도메인 잠금(leejonghoon9609.github.io) JS 키
function loadKakao(cb){
  if(window.kakao&&window.kakao.maps&&window.kakao.maps.Map){cb();return;}
  if(window.__kakaoLoading){var t=setInterval(function(){if(window.kakao&&window.kakao.maps&&window.kakao.maps.Map){clearInterval(t);cb();}},150);return;}
  window.__kakaoLoading=true;
  var s=document.createElement('script');
  s.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey='+KAKAO_KEY+'&autoload=false&libraries=services';
  s.onload=function(){kakao.maps.load(function(){window.__kakaoLoading=false;cb();});};
  s.onerror=function(){window.__kakaoLoading=false;toast('카카오 지도 로드 실패 — 네트워크 또는 도메인 등록을 확인하세요');};
  document.head.appendChild(s);
}
/* ===== 로드뷰 (위치 찍기 → 오른쪽 패널: 위=로드뷰 / 아래=측점사진) ===== */
var rv=null,rvClient=null,rvPick=false;
function ensureRv(cb){
  loadKakao(function(){
    if(!rv){rv=new kakao.maps.Roadview(document.getElementById('rvView'));rvClient=new kakao.maps.RoadviewClient();}
    cb();
  });
}
function openRvPanel(){
  if(photoPanelOpen){photoPanelOpen=false;document.getElementById('photoPanel').classList.remove('open');}
  document.getElementById('rvPanel').classList.add('open');
}
function closeRvPanel(){document.getElementById('rvPanel').classList.remove('open');}
function setRvPhoto(pt){
  var body=document.getElementById('rvPhotoBody');
  if(!pt){body.innerHTML='<div class="rv-photo-empty">측점 위치가 아닙니다 — 사진 없음</div>';return;}
  var big=IS_FIELD||(typeof isMobileDevice==='function'&&isMobileDevice());
  body.innerHTML=paneImg(pt.no,'측점 사진',big);
  if(big&&typeof setupZoom==='function')setupZoom(document.getElementById('zoomImg'));
}
function pickRoadview(clientX,clientY){
  var w=toWorld(clientX,clientY),east=w[0],north=-w[1];
  var ll=toLatLng(east,north,state.crs);
  if(!ll){toast('좌표 변환 실패 — 좌표계를 확인하세요');return;}
  openRvPanel();
  var best=null,bd=Infinity;
  (state.points||[]).forEach(function(p){var d=Math.hypot(p.x-east,p.y-north);if(d<bd){bd=d;best=p;}});
  var pt=(best&&bd<pxToWorld()*18)?best:null;
  document.getElementById('rvPtLabel').textContent=pt?((pt.no||'')+' '+(pt.code||'').trim()):'(측점 아님)';
  setRvPhoto(pt);
  ensureRv(function(){
    setTimeout(function(){if(rv)rv.relayout();},60);
    var pos=new kakao.maps.LatLng(ll.lat,ll.lng),msg=document.getElementById('rvMsg');
    rvClient.getNearestPanoId(pos,60,function(panoId){
      if(panoId===null){msg.style.display='flex';}
      else{msg.style.display='none';rv.setPanoId(panoId,pos);setTimeout(function(){rv.relayout();},250);}
    });
  });
}
function toggleRvPick(){
  var btn=document.getElementById('rvBtn');
  if(rvPick){rvPick=false;btn.classList.remove('on');var _vr=document.getElementById('vRv');if(_vr)_vr.classList.remove('on');cv.style.cursor='';toast('로드뷰 위치찍기 종료');return;}
  if((!state.points||!state.points.length)&&(!state.gpsPts||!state.gpsPts.length)){toast('먼저 측점을 불러오거나 촬영하세요');return;}
  if(!bgMapOn)toggleBgMap();
  rvPick=true;btn.classList.add('on');var _vr2=document.getElementById('vRv');if(_vr2)_vr2.classList.add('on');cv.style.cursor='pointer';
  toast('지도에서 로드뷰 볼 위치를 클릭하세요 (측점을 찍으면 아래에 사진)');
}
bind('rvBtn',toggleRvPick);
bind('dirToggle',function(){showDirArrows=!showDirArrows;var b=document.getElementById('dirToggle');b.classList.toggle('on',showDirArrows);b.textContent='🧭 방향 '+(showDirArrows?'ON':'OFF');drawGeo();});

/* ===== 작업/뷰어 모드 + 특이사항 ===== */
var viewerMode=false,noteMode=false,readOnly=false;
function isMobileDevice(){var t=(navigator.maxTouchPoints||0)>0||('ontouchstart' in window);var ua=/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'');var narrow=Math.min(screen.width||9999,screen.height||9999)<820;return t&&(ua||narrow);}
function setViewer(v){viewerMode=!!v;document.body.classList.toggle('viewer',viewerMode);var b=document.getElementById('modeToggle');if(b)b.textContent=IS_FIELD?'💻 후측량 결선':(IS_TANGO?(viewerMode?'📱 현장':'💻 결선'):'📱 측량(현장)');try{if(IS_TANGO)localStorage.setItem('viewMode',viewerMode?'1':'0');}catch(e){}
  if(viewerMode&&noteMode){} 
  setTimeout(function(){fixAspect();applyVB();if(bgMapOn&&bgmap){try{bgmap.relayout();}catch(e){}}if(typeof drawGeo==='function'){drawGeo();drawMarks();drawManholes();highlightSel();}},80);}
function toggleNoteMode(){noteMode=!noteMode;var b=document.getElementById('vNote2');if(b)b.classList.toggle('on',noteMode);cv.style.cursor=noteMode?'crosshair':'';toast(noteMode?'특이사항: 빈 곳을 탭해 추가(한 번 쓰면 종료) · 기존 특이사항 탭=수정/삭제':'특이사항 종료');}
function openNoteEdit(i){
  var m=state.markups[i];if(!m)return;
  var card=showModal({title:'⚠ 특이사항',tone:'warn',
    body:'<div style="margin-bottom:5px;font-size:13px;color:#666">멘트</div><textarea id="noteEditTa" style="width:100%;min-height:74px;font-size:15px;padding:9px;border:1px solid #d4d4cf;border-radius:8px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>',
    buttons:[
      {label:'🗑 삭제',danger:true,onClick:function(){state.markups.splice(i,1);drawMarks();noteAutoSave();toast('특이사항 삭제됨');}},
      {label:'취소'},
      {label:'저장',ok:true,onClick:function(){var ta=document.getElementById('noteEditTa');var v=ta?ta.value.trim():'';if(v===''){state.markups.splice(i,1);}else{m.note=v;}drawMarks();noteAutoSave();}}
    ]});
  var ta=card.querySelector('#noteEditTa');if(ta){ta.value=m.note||'';setTimeout(function(){try{ta.focus();}catch(e){}},60);}
}
function noteAutoSave(){if(online&&state.projectName){saveProject();}else{toast('특이사항 추가됨 — 온라인 연결 시 저장됩니다');}}
function noteModeOff(){noteMode=false;var _b=document.getElementById('vNote2');if(_b)_b.classList.remove('on');try{cv.style.cursor='';}catch(e){}}
function addNote(clientX,clientY){
  var w=toWorld(clientX,clientY),tol=pxToWorld()*16,hit=-1;
  for(var i=0;i<state.markups.length;i++){var m=state.markups[i];if(m.near==='특이사항'&&Math.hypot(m.cx-w[0],m.cy-w[1])<((m.rx||1.2)+tol)){hit=i;break;}}
  if(hit>=0){
    if(confirm('이 특이사항을 삭제할까요?\n(확인=삭제 · 취소=텍스트 수정)')){state.markups.splice(hit,1);}
    else{var nv=prompt('특이사항 수정 (비우면 삭제)',state.markups[hit].note||'');if(nv===null){noteModeOff();return;}if(nv.trim()===''){state.markups.splice(hit,1);}else{state.markups[hit].note=nv.trim();}}
    drawMarks();noteAutoSave();noteModeOff();return;
  }
  var note=prompt('특이사항 멘트를 입력하세요');if(note===null||note.trim()===''){noteModeOff();return;}
  state.markups.push({type:'cir',cx:w[0],cy:w[1],rx:4.2,ry:4.2,status:'bad',near:'특이사항',note:note.trim()});
  drawMarks();noteAutoSave();noteModeOff();
}
bind('modeToggle',function(){if(IS_FIELD){location.href='survey.html';}else if(IS_TANGO){setViewer(!viewerMode);}else{if(confirm('측량(현장)으로 이동할까요? 저장 안 한 변경은 사라집니다.'))location.href='field.html';}});
(function(){var hb=document.getElementById('homeBtn');if(hb)hb.onclick=function(){if(viewerMode||confirm('홈(랜딩)으로 이동할까요? 저장 안 한 변경은 사라집니다.'))location.href='index.html';};})();
bind('vPhoto',function(){openPhotoPanel();});
bind('vMap',toggleBgMap);
bind('vRv',toggleRvPick);
bind('vNote2',toggleNoteMode);
var _vproj=document.getElementById('vproj');if(_vproj)_vproj.addEventListener('change',function(){if(this.value)loadProject(this.value);});

/* ===== 결선완료 사업 ===== */
function baseName(n){return (''+(n||'')).replace(/_(S|A|B|C|TT?)\d*$/,'');}function _uniqName(base,suffix,cb){if(!online){cb(base+suffix);return;}sb.from(DB+'_projects').select('id,name,stage:payload->>stage').then(function(_ex){var _names=(_ex.data||[]).filter(function(r){return r.id!==state.projectId&&(r.stage||'survey')===STAGE;}).map(function(r){return r.name;});var want=base+suffix;if(_names.indexOf(want)<0){cb(want);return;}var i=1;while(_names.indexOf(want+i)>=0)i++;cb(want+i);});}
function registerDone(){
  if(!online){toast('로컬 모드 — Supabase 연결이 필요합니다');return;}
  if(!state.projectName){toast('등록할 사업을 먼저 선택/저장하세요');return;}
  var _tg=(typeof IS_TANGO!=='undefined'&&IS_TANGO);var _isTT=/_TT\d*$/.test(state.projectName||'');var suf=_tg?'_T':'_A';var lbl=_tg?'탱고':'결선';
  var _mkModal=function(_aName){
  var seg=(_tg&&typeof _tgSegs!=='undefined'&&_tgSegs)?('<br>구간 <b>'+_tgSegs.length+'개</b> · 측점 <b>'+state.points.filter(function(p){return !isManhole(p);}).length+'개</b>'):'';
  showModal({title:lbl+'완료 사업 등록',tone:'warn',
    body:'<b>'+state.projectName+'</b>'+seg+'<br>이 사업을 <b style="color:#16a34a">'+lbl+' 완료</b> 상태로 등록할까요?<br><span style="color:#888;font-size:13px">완료 시 이름이 <b>'+_aName+'</b> 로 바뀝니다. (해제하려면 다시 눌러 취소)</span>',
    buttons:[{label:(state.routingDone?'완료 해제':'취소')+'',onClick:function(){if(state.routingDone){state.routingDone=false;state.projectName=baseName(state.projectName);saveProject();toast(lbl+'완료 해제됨');}}},
             {label:'등록',primary:true,onClick:function(){state.routingDone=true;state.projectName=_aName;saveProject();toast(lbl+'완료 사업으로 등록됨 ('+_aName+')');}}]});};if(_isTT){_mkModal(state.projectName);}else{_uniqName(baseName(state.projectName),suf,_mkModal);}
}

function countNotes(pl){return ((pl&&pl.markups)||[]).filter(function(m){return m.near==='특이사항';}).length;}
function setReadOnly(v){readOnly=!!v;document.body.classList.toggle('readonly',readOnly);var b=document.getElementById('roBadge');if(b)b.style.display=readOnly?'':'none';}
function refreshDoneProjects(){ if(!online)return;
  if(IS_FIELD){var _vf=document.getElementById('vproj');if(_vf){sb.from(DB+'_projects').select('id,name,updated_at,stage:payload->>stage').order('updated_at',{ascending:false}).then(function(rr){var fr=(rr.data||[]).filter(function(p){return (p.stage||'survey')==='field';});_vf.innerHTML='<option value="">현장 사업목록</option>'+fr.map(function(p){return '<option value="'+p.id+'">'+p.name+'</option>';}).join('');if(state.projectId)_vf.value=state.projectId;});}return;}
  sb.from(DB+'_projects').select('id,name,updated_at,payload').order('updated_at',{ascending:false}).then(function(res){
    var rows=(res.data||[]).filter(function(p){return p.payload&&p.payload.routingDone&&((p.payload.stage||'survey')===STAGE);});
    var vsel=document.getElementById('vproj');
    if(vsel){vsel.innerHTML='<option value="">결선완료사업목록</option>'+rows.map(function(p){return '<option value="'+p.id+'">'+p.name+'</option>';}).join('');if(state.projectId)vsel.value=state.projectId;}
    var pw=0,tn=0;rows.forEach(function(p){var n=countNotes(p.payload);if(n>0){pw++;tn+=n;}});
    var sm=document.getElementById('doneSummary');
    if(sm){if(tn>0){sm.style.display='';sm.textContent='⚠ 수정 '+pw+'사업 · '+tn+'건';}else{sm.style.display='none';}}
  });
}
function copyPhotos(fromId,toId,done,srcStage){
  function fin(){if(typeof done==='function')done();}
  if(!online||!fromId||!toId||fromId===toId){fin();return;}
  var _srcPT=(srcStage||STAGE)+'_photos';
  sb.from(_srcPT).select('point_no,url').eq('project_id',fromId).then(function(res){
    if(res&&res.error){toast('사진 읽기 오류: '+res.error.message);fin();return;}
    var rows=(res.data||[]);if(!rows.length){toast('가져올 사진이 없습니다 ('+_srcPT+')');loadPhotos();fin();return;}
    sb.from(DB+'_photos').select('point_no').eq('project_id',toId).then(function(ex){
      var have={};((ex&&ex.data)||[]).forEach(function(r){have[String(r.point_no)]=1;});
      var ins=rows.filter(function(r){return !have[String(r.point_no)];}).map(function(r){return {project_id:toId,point_no:r.point_no,url:r.url};});
      if(!ins.length){loadPhotos();fin();return;}
      sb.from(DB+'_photos').insert(ins).then(function(rr){if(rr&&rr.error){toast('사진 복사 오류: '+rr.error.message);fin();return;}loadPhotos();if(photoPanelOpen&&typeof refreshPhotoPanel==='function')refreshPhotoPanel();toast('📷 결선 사진 '+ins.length+'장 복사됨 (사본)');fin();});
    });
  });
}

function fieldDelProject(){
  if(!online){toast('로컬 모드 — Supabase 연결이 필요합니다');return;}
  if(!state.projectId){toast('삭제할 사업을 먼저 선택하세요');return;}
  var nm=state.projectName||'(이름없음)';
  if(!confirm("'"+nm+"' 사업을 삭제할까요?\n측점·결선·검수·사진 기록이 모두 지워지며 되돌릴 수 없습니다."))return;
  deleteProjectById(state.projectId,nm);
}

/* 상위 단계 사업을 통째로 복사 → 내 단계 사본으로 자동저장 (연동X·복사O, 원본 보존). 이름 뒤 _C/_T */
function importFromStage(id,srcStage){
  if(!online||!id)return;
  var srcTbl=srcStage+'_projects';
  sb.from(srcTbl).select('*').eq('id',id).single().then(function(res){
    if(res.error||!res.data){toast('가져오기 실패 — '+(res.error?res.error.message:'없음'));return;}
    var p=res.data.payload||{};
    var suffix=(STAGE==='tango'?'_T':(STAGE==='field'?'_B':(STAGE==='survey'?'_A':'')));
    var _base=baseName(res.data.name),_want=_base+suffix;
    var _run=function(newName){
    state.projectId=null;state.projectName=newName;state.loadedStage=srcStage;state._importSrc=[];
    state.points=p.points||[];state.gpsPts=p.gpsPts||[];state.tangoEdit=p.tangoEdit||null;if(p.tangoManual)state.tangoManual=p.tangoManual;state.tgStore=p.tgStore||null;if(!state.tgStore&&(p.tangoEdit||p.tangoManual)){state.tgStore={tango:{edit:p.tangoEdit,manual:p.tangoManual||{},segDel:{}}};}_tgCtx='tango';state.lines=p.lines||[];state.baseTexts=p.baseTexts||[];state.markups=(p.markups||[]);state.labelOff=p.labelOff||{};state.manholes=p.manholes||[];state.bpzones=p.bpzones||[];state.roadZones=p.roadZones||[];state.depthCheck=p.depthCheck||[];if(typeof classifyRoad==='function')classifyRoad();state.depthGround=p.depthGround||null;state._depthAlign=null;state.titleBlock=p.titleBlock||null;state.crs=p.crs||'5186';state.photoDir=p.photoDir||{};state.routingDone=false;state.asbuilt=p.asbuilt||null;state.rtDone=p.rtDone||null;state.mnList=p.mnList||[];state._trash=p.trash||[];if(typeof rtPurgeTrash==='function')setTimeout(rtPurgeTrash,800);state.nightShift=p.nightShift||null;state.fieldDone=p.fieldDone||null;state.tamsa=!!p.tamsa;state.finalCsv=p.finalCsv?(Array.isArray(p.finalCsv)?p.finalCsv:[p.finalCsv]):[];state.bizInfo=p.bizInfo||null;
    selNum=null;clearSvg(gSel);
    try{if(state.finalCsv&&state.finalCsv.length&&typeof finalCsvDepthSync==='function')finalCsvDepthSync();if(state.depthGround&&state.depthGround.length&&typeof computeDepth==='function')computeDepth();}catch(e){}
    try{if(typeof IS_TANGO!=='undefined'&&IS_TANGO&&state.finalCsv&&state.finalCsv.length&&typeof buildInspData==='function')buildInspData();}catch(_bi){}
    try{mergeAftMh();}catch(_me){}if(state.tamsa&&typeof buildTamsaMh==='function')try{buildTamsaMh();}catch(_te){}
    drawGeo();drawMarks();drawManholes();try{fitView();}catch(_e0){}updMeta();
    if(typeof refreshFieldBar==='function')refreshFieldBar();
    saveProject(function(newId){ copyPhotos(id,newId,function(){
      var _dm='';
      try{if(STAGE==='tango'&&state.depthGround&&state.depthGround.length&&typeof computeDepth==='function'){var _r=computeDepth();_dm=' · 심도 '+_r.ok+'/'+_r.total+'점 자동계산(평균 '+(_r.avg||0).toFixed(2)+'m)';}}catch(e){}
      toast('✅ '+newName+' — 사본 저장 완료'+_dm);
    },srcStage); });
    };
    sb.from(DB+'_projects').select('name,payload').then(function(_ex){
      var _names=(_ex.data||[]).filter(function(r){return r.payload&&((r.payload.stage||'survey')===STAGE);}).map(function(r){return r.name;});
      if(_names.indexOf(_want)<0){_run(_want);return;}
      var _mx=0;
      _names.forEach(function(nm){if(nm.indexOf(_want)===0){var _tail=nm.slice(_want.length);if(_tail!==''&&/^\d+$/.test(_tail)){var nn=parseInt(_tail,10);if(nn>_mx)_mx=nn;}}});
      var _next=_want+(_mx+1);
      showModal({title:'同일 이름 존재',tone:'warn',center:true,body:'"<b>'+_want+'</b>" 작업본이 이미 있습니다.<br>원본을 새로 받아 "<b>'+_next+'</b>" 로 만들까요?<br><span style=\"color:#888;font-size:13px\">취소하면 기존 작업본(상단 사업 목록)에서 이어서 작업하세요.</span>',buttons:[{label:'취소'},{label:'새로 만들기',primary:true,onClick:function(){_run(_next);}}]});
    });
  });
}
function openImportList(scope){
  if(!online){toast('로컬 모드 — Supabase 연결이 필요합니다');return;}
  var srcTbl=(scope==='survey'?'survey':'field')+'_projects';
  sb.from(srcTbl).select('id,name,updated_at,payload').order('updated_at',{ascending:false}).then(function(res){
    var rows=(res.data||[]).filter(function(p){
      if(!p.payload)return false;
      if(scope==='survey')return !!p.payload.routingDone;            /* 결선완료(_A)만 */
      var fd=p.payload.fieldDone||{};return !!fd.csv;                /* 현장 후측량성과 등록된 것 */
    });
    var LB={survey:'결선',field:'현장'};
    var body=rows.length
      ? '<div style="max-height:340px;overflow:auto;text-align:left">'+rows.map(function(p){
          var st=(p.payload.stage||(scope==='survey'?'survey':'field'));var bg=st==='field'?'#eafff2':'#eef5ff',col=st==='field'?'#15803d':'#1d4ed8';
          return '<button class="imp-row" data-id="'+p.id+'" data-stage="'+st+'" style="display:block;width:100%;text-align:left;margin:4px 0;padding:10px 12px;border:1px solid #d7dee8;border-radius:9px;background:'+bg+';cursor:pointer;font-size:14px;font-weight:700;color:'+col+'"><span style="font-size:11px;background:'+col+';color:#fff;padding:2px 7px;border-radius:9px;margin-right:7px">'+LB[st]+'</span>'+p.name+'</button>';
        }).join('')+'</div><div style="color:#999;font-size:12px;margin-top:6px">고르면 <b>사본으로 복사</b>되어 '+(scope==='survey'?'<b>_B</b>':'<b>_T</b>')+' 이름으로 <b>자동 저장</b>됩니다 (원본은 그대로 보존)</div>'
      : '<div style="color:#999;padding:8px">가져올 완료 사업이 없습니다.</div>';
    var card=showModal({title:(scope==='survey'?'📥 결선완료 성과목록':'📥 결선/현장 완료목록'),tone:'ok',center:true,body:body,buttons:[{label:'닫기'}]});
    card.querySelectorAll('.imp-row').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-id'),st=b.getAttribute('data-stage');card.remove();importFromStage(id,st);};});
  });
}

function openDoneList(){
  if(!online){toast('로컬 모드 — Supabase 연결이 필요합니다');return;}
  sb.from(DB+'_projects').select('id,name,updated_at,payload').order('updated_at',{ascending:false}).then(function(res){
    var all=(res.data||[]).filter(function(p){return p.payload&&p.payload.routingDone&&((p.payload.stage||'survey')===STAGE);});
    var rows=all.filter(function(p){return !p.payload.tangoArchived;});
    var arch=all.filter(function(p){return p.payload.tangoArchived;});
    function rowHtml(p){var n=countNotes(p.payload);var bg=n>0?'#fdecec':'#f6fcf8',bd=n>0?'#eaa':'#d6eede',col=n>0?'#c0392b':'#15803d';var badge=n>0?'<span style="background:#d32f2f;color:#fff;font-size:11px;font-weight:800;padding:2px 7px;border-radius:10px;margin-right:7px">수정 '+n+'</span>':'';return '<div style="display:flex;gap:6px;margin:4px 0"><button class="done-row" data-id="'+p.id+'" style="flex:1;text-align:left;padding:10px 12px;border:1px solid '+bd+';border-radius:9px;background:'+bg+';cursor:pointer;font-size:14px;font-weight:700;color:'+col+'">'+badge+(n>0?'⚠':'✅')+' '+p.name+'</button><button class="done-del" data-id="'+p.id+'" data-nm="'+(''+p.name).replace(/"/g,'&quot;')+'" title="완료목록에서 제거" style="flex:none;padding:0 13px;border:1px solid #f0c4c4;border-radius:9px;background:#fdf3f3;color:#d32f2f;cursor:pointer;font-size:15px">🗑</button></div>';}
    var rowsReal=rows.filter(function(p){return !p.payload.tamsa;});var rowsTamsa=rows.filter(function(p){return !!p.payload.tamsa;});function secHtml(t,col,list){var head='<div style="font-size:12px;font-weight:800;color:'+col+';margin:9px 2px 3px;letter-spacing:.3px">'+t+' ('+list.length+')</div>';var inner=list.length?list.map(rowHtml).join(''):'<div style="color:#c4c4c4;font-size:12px;padding:3px 6px">없음</div>';return head+inner;}function archHtml(p){return '<div style="display:flex;gap:6px;margin:4px 0"><div style="flex:1;text-align:left;padding:9px 12px;border:1px solid #d8d8d8;border-radius:9px;background:#f5f5f5;font-size:13px;color:#666">🗂 '+p.name+'</div><button class="arch-restore" data-id="'+p.id+'" title="다시 완료 등록" style="flex:none;padding:0 13px;border:1px solid #bfe3c8;border-radius:9px;background:#eafaef;color:#16a34a;cursor:pointer;font-size:12px;font-weight:700">복원</button></div>';}
    var body;if(!rows.length){body='<div style="color:#999;padding:6px">등록된 '+(IS_TANGO?'탱고':'결선')+'완료 사업이 없습니다.</div>';}else if(rowsTamsa.length){body='<div style="max-height:320px;overflow:auto;text-align:left">'+secHtml('🟢 실시간측량','#15803d',rowsReal)+secHtml('🔴 탐사측량','#c0392b',rowsTamsa)+'</div>';}else{body='<div style="max-height:300px;overflow:auto;text-align:left">'+rows.map(rowHtml).join('')+'</div>';}
    body+='<div style="margin-top:8px;border-top:1px dashed #ddd;padding-top:8px"><button id="showArch" style="width:100%;padding:8px;border:1px solid #d0d0d0;border-radius:8px;background:#fafafa;color:#555;cursor:pointer;font-size:13px;font-weight:700">🗂 삭제목록 불러오기 ('+arch.length+')</button><div id="archBox" style="display:none;margin-top:6px">'+(arch.length?arch.map(archHtml).join(''):'<div style="color:#aaa;font-size:12px;padding:6px">삭제목록이 비어있습니다.</div>')+'</div></div>';
    var card=showModal({title:(IS_TANGO?'✅ 탱고완료 사업 목록':'✅ 결선 완료사업'),tone:'ok',body:body,buttons:[{label:'닫기'}]});
    card.querySelectorAll('.done-row').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-id');card.remove();loadProject(id,true);};});
    card.querySelectorAll('.done-del').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-id'),nm=b.getAttribute('data-nm')||'(이름없음)';if(!confirm("'"+nm+"' 을(를) 완료목록에서 제거할까요?\n데이터는 보존되며 삭제목록에서 복원할 수 있습니다."))return;tgArchiveSet(id,true,card);};});
    var sa=card.querySelector('#showArch');if(sa)sa.onclick=function(){var ab=card.querySelector('#archBox');if(ab)ab.style.display=(ab.style.display==='none')?'block':'none';};
    card.querySelectorAll('.arch-restore').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-id');tgArchiveSet(id,false,card);};});
    if(STAGE==='survey'&&typeof rtDonePairCard==='function')setTimeout(function(){rtDonePairCard(card);},30);
  });
}
/* [BUILD 917] 결선DB: 실시간측량 완료사업 카드 (결선 완료사업 왼쪽에 나란히) */
function rtDonePairCard(main){
  if(!online||!main||!document.body.contains(main))return;
  var ex=document.getElementById('rtPairModal');if(ex)ex.remove();
  sb.from('realtime_projects').select('id,name,updated_at,payload').order('updated_at',{ascending:false}).then(function(res){
    if(!document.body.contains(main))return;
    var rows=(res.data||[]).filter(function(p){return p.payload&&p.payload.rtDone&&p.payload.rtDone.done&&((p.payload.stage||'realtime')==='realtime');});
    var r=main.getBoundingClientRect();
    var card=document.createElement('div');card.id='rtPairModal';
    card.style.cssText='position:fixed;z-index:10000;background:#fff;border:1px solid #f0caca;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.22);overflow:hidden;font-family:inherit;display:flex;flex-direction:column;';
    card.style.width=r.width+'px';card.style.height=r.height+'px';
    var lft=r.left-r.width-12;if(lft<8)lft=8;
    card.style.left=lft+'px';card.style.top=r.top+'px';
    var listHtml=rows.length
      ? rows.map(function(p){var dt=((p.payload.rtDone&&p.payload.rtDone.at)||'').slice(0,10);return '<button class="rtp-row" data-id="'+p.id+'" style="display:block;width:100%;text-align:left;margin:4px 0;padding:10px 12px;border:1px solid #f0caca;border-radius:9px;background:#fdf1f1;cursor:pointer;font-size:14px;font-weight:700;color:#c0392b">✓ '+p.name+(dt?'<span style="float:right;font-size:12px;color:#c9a0a0;font-weight:400">'+dt+'</span>':'')+'</button>';}).join('')
      : '<div style="color:#999;padding:8px">실측완료된 사업이 없습니다.</div>';
    card.innerHTML='<div id="rtPairHd" style="display:flex;align-items:center;gap:8px;padding:11px 14px;background:#fbf5f5;border-bottom:1px solid #f2e2e2;cursor:move;user-select:none;font-weight:700;color:#333;font-size:15px"><span style="color:#d32f2f;font-size:11px">●</span>실시간측량 완료사업<span style="margin-left:auto;color:#d4bcbc;font-size:11px;font-weight:400">⠿ 드래그로 이동</span></div>'
      +'<div style="padding:15px 16px;color:#444;font-size:14px;line-height:1.65;overflow:auto;flex:1;text-align:left">'+listHtml
      +'<div style="color:#999;font-size:12px;margin-top:6px">고르면 <b>사본으로 복사</b>되어 <b>_A</b> 이름으로 <b>자동 저장</b>됩니다 (원본 _S는 보존)</div></div>'
      +'<div style="display:flex;justify-content:flex-end;gap:8px;padding:0 16px 15px"><button id="rtPairClose" style="padding:8px 16px;border:1px solid #ddd;border-radius:8px;background:#fff;color:#666;cursor:pointer;font-weight:700">닫기</button></div>';
    document.body.appendChild(card);
    card.querySelector('#rtPairClose').onclick=function(){card.remove();};
    card.querySelectorAll('.rtp-row').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-id');card.remove();if(document.body.contains(main))main.remove();importFromStage(id,'realtime');};});
    /* 드래그 이동 */
    var hd=card.querySelector('#rtPairHd');var dx=0,dy=0,drag=false;
    hd.addEventListener('pointerdown',function(e){drag=true;dx=e.clientX-card.offsetLeft;dy=e.clientY-card.offsetTop;hd.setPointerCapture(e.pointerId);});
    hd.addEventListener('pointermove',function(e){if(!drag)return;card.style.left=(e.clientX-dx)+'px';card.style.top=(e.clientY-dy)+'px';});
    hd.addEventListener('pointerup',function(){drag=false;});
    /* 초록 카드 닫히면 같이 닫힘 */
    var mo=new MutationObserver(function(){if(!document.body.contains(main)){if(document.body.contains(card))card.remove();mo.disconnect();}});
    mo.observe(document.body,{childList:true});
  });
}
function tgArchiveSet(id,arch,card){if(!online)return;sb.from(DB+'_projects').select('payload').eq('id',id).single().then(function(r){var pl=(r.data&&r.data.payload)||{};pl.tangoArchived=arch;sb.from(DB+'_projects').update({payload:pl}).eq('id',id).then(function(){if(card)card.remove();openDoneList();toast(arch?'완료목록에서 제거됨 (삭제목록으로 이동)':'완료목록으로 복원됨');});});}
var _dlb=document.getElementById('doneListBtn');if(_dlb){if(IS_TANGO){_dlb.onclick=function(){openImportList('both');};_dlb.textContent='📥 결선/현장 완료목록';}else{_dlb.onclick=openDoneList;}}
var _rob=document.getElementById('roBadge');if(_rob)_rob.onclick=function(){if(state._foreignLock){_lockTry(state.projectId,function(ok,holder){if(ok){state._foreignLock=null;setReadOnly(false);var _ps=document.getElementById('proj');if(_ps)_ps.value=state.projectId;toast('편집 모드로 전환');}else{toast('아직 '+holder+'님이 편집 중');}});return;}if(readOnly&&state.projectId){setReadOnly(false);var ps=document.getElementById('proj');if(ps)ps.value=state.projectId;toast('수정 가능 모드로 전환 (사업 선택)');}};
(function(){if(IS_FIELD){setViewer(true);return;}if(IS_TANGO){var saved=null;try{saved=localStorage.getItem('viewMode');}catch(e){}setViewer(saved!=null?(saved==='1'):isMobileDevice());return;}setViewer(false);})();
/* 페이지 분리 — 이동은 랜딩에서. 결선/현장은 모드이동버튼 제거(탱고 in-page 토글만 유지), 시스템이동버튼은 전 페이지 제거 */
(function(){var mt=document.getElementById('modeToggle');if(mt)mt.remove();var ss=document.getElementById('sysSwitch');if(ss)ss.remove();})();
/* 측량(현장) 전용: 탱고작업용 성과제작 버튼 (기능은 다음 단계에서 연결) */
function refreshFieldBar(){
  var fd=state.fieldDone||{};
  var _mob=(typeof isMobileDevice==='function'&&isMobileDevice());
  [['fldCsv','csv',_mob?'CSV':'후측량 csv'],['fldJoseo','joseo','실시간 사진조서'],['fldManhole','manhole','맨홀도 제작']].forEach(function(m){
    var b=document.getElementById(m[0]);if(!b)return;var done=!!fd[m[1]];b.classList.toggle('done',done);b.textContent=(done?'✓ ':'')+m[2];
  });
}
function finalCsvArr(){var f=state.finalCsv;if(!f)return [];return Array.isArray(f)?f:[f];}
function finalCsvDepthSync(){
  var arr=finalCsvArr(); if(!arr.length){return;}
  var L=[];
  arr.forEach(function(it){try{L=L.concat(parseDepthL(it.text||''));}catch(e){}});
  if(L.length){state.depthGround=L;state._depthAlign=null;try{computeDepth();}catch(e){}}
}
function openFinalCsvUpload(){
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:1250;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML='<div style="background:#fff;border-radius:14px;width:92%;max-width:460px;box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden"><div style="padding:15px 18px;border-bottom:1px solid #eee;display:flex;align-items:center"><b style="flex:1;font-size:16px;color:#2563eb">📄 후측량 CSV 등록</b><button id="fcX" style="border:none;background:#f2f2f2;border-radius:8px;padding:6px 12px;cursor:pointer">닫기</button></div><div style="padding:18px"><div id="fcDrop" style="border:1.5px dashed #cdd6e6;border-radius:10px;padding:24px;text-align:center;cursor:pointer;color:#5b6b86"><div style="font-size:24px">⬇</div><div style="margin-top:6px">후측량 CSV (.csv) 끌어다 놓기 / 클릭 (여러 개 가능)</div></div><button id="fcBtn" style="margin-top:12px;width:100%;background:#2563eb;color:#fff;border:none;border-radius:9px;padding:11px;font-weight:700;cursor:pointer">파일 선택</button><div id="fcList" style="margin-top:12px"></div><button id="fcDone" style="margin-top:14px;width:100%;background:#16a34a;color:#fff;border:none;border-radius:9px;padding:11px;font-weight:700;cursor:pointer">✅ 등록 완료</button></div></div>';
  document.body.appendChild(ov);
  var inp=document.createElement('input');inp.type='file';inp.accept='.csv';inp.multiple=true;inp.style.display='none';ov.appendChild(inp);
  function renderList(){
    var arr=finalCsvArr(),o=document.getElementById('fcList');if(!o)return;
    if(!arr.length){o.innerHTML='<div style="font-size:12px;color:#999;text-align:center;padding:4px">아직 등록된 CSV가 없습니다</div>';return;}
    o.innerHTML='<div style="font-size:12.5px;color:#16a34a;font-weight:700;margin-bottom:7px">✅ '+arr.length+'개 등록됨</div>'+arr.map(function(it,i){return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid #e5e9f0;border-radius:8px;margin-bottom:5px"><span style="flex:1;min-width:0;font-size:12.5px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 '+joseoEsc(it.name||'csv')+'</span><button data-i="'+i+'" class="fcDel" style="border:1px solid #e3b4ae;background:#fff;color:#c0392b;border-radius:6px;padding:3px 9px;font-size:11px;cursor:pointer;flex:none">삭제</button></div>';}).join('');
    [].forEach.call(o.querySelectorAll('.fcDel'),function(b){b.onclick=function(){var i=+this.getAttribute('data-i'),a=finalCsvArr();a.splice(i,1);state.finalCsv=a;if(!state.fieldDone)state.fieldDone={csv:false,joseo:false,manhole:false};state.fieldDone.csv=a.length>0;finalCsvDepthSync();if(online&&state.projectId)saveProject();if(typeof refreshFieldBar==='function')refreshFieldBar();renderList();};});
  }
  function handle(f){if(!f)return;var rd=new FileReader();rd.onload=function(){var txt;try{txt=decodeBuf(rd.result);}catch(e){txt=''+rd.result;}var a=finalCsvArr();a.push({name:f.name,text:txt});state.finalCsv=a;if(!state.fieldDone)state.fieldDone={csv:false,joseo:false,manhole:false};state.fieldDone.csv=true;finalCsvDepthSync();if(online&&state.projectId)saveProject();if(typeof refreshFieldBar==='function')refreshFieldBar();renderList();toast('후측량 CSV 등록 ('+finalCsvArr().length+'개) — 최종성과·심도 연동됨');};rd.readAsArrayBuffer(f);}
  ov.querySelector('#fcX').onclick=function(){ov.remove();};
  var _fd=ov.querySelector('#fcDone');if(_fd)_fd.onclick=function(){if(finalCsvArr().length){if(!state.fieldDone)state.fieldDone={csv:false,joseo:false,manhole:false};state.fieldDone.csv=true;finalCsvDepthSync();if(online&&state.projectId)saveProject();if(typeof refreshFieldBar==='function')refreshFieldBar();toast('후측량 CSV 등록 완료 ('+finalCsvArr().length+'개)');}ov.remove();};
  ov.querySelector('#fcBtn').onclick=function(){inp.click();};
  ov.querySelector('#fcDrop').onclick=function(){inp.click();};
  inp.addEventListener('change',function(e){[].forEach.call(e.target.files,function(f){handle(f);});e.target.value='';});
  var dz=ov.querySelector('#fcDrop');
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.style.background='#eef4ff';});
  dz.addEventListener('dragleave',function(){dz.style.background='';});
  dz.addEventListener('drop',function(e){e.preventDefault();dz.style.background='';[].forEach.call(e.dataTransfer.files,function(f){handle(f);});});
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  renderList();
}
function downloadFinalCsv(){
  var arr=finalCsvArr();
  if(!arr.length){toast('등록된 후측량 CSV가 없습니다');return;}
  if(arr.length===1){var it=arr[0],bl=new Blob(['\uFEFF'+(it.text||'')],{type:'text/csv;charset=utf-8'}),a0=document.createElement('a');a0.href=URL.createObjectURL(bl);a0.download=it.name||'후측량.csv';document.body.appendChild(a0);a0.click();a0.remove();return;}
  if(typeof JSZip==='undefined'){toast('압축 모듈 없음 — 새로고침(Ctrl+Shift+R)');return;}
  var zip=new JSZip(),seen={};
  arr.forEach(function(it,i){var nm=it.name||('후측량'+(i+1)+'.csv');if(seen[nm])nm=(i+1)+'_'+nm;seen[nm]=1;zip.file(nm,'\uFEFF'+(it.text||''));});
  zip.generateAsync({type:'blob'}).then(function(blob){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='후측량CSV_'+(state.projectName||'성과')+'.zip';document.body.appendChild(a);a.click();a.remove();toast(arr.length+'개 CSV → ZIP 다운로드');});
}
function downloadFinalCsvDxf(){
  var arr=finalCsvArr();
  var dxf=null;try{dxf=exportDXF(true);}catch(e){}
  if(!arr.length&&!dxf){toast('후측량 CSV·결선 도면이 없습니다');return;}
  if(typeof JSZip==='undefined'){toast('압축 모듈 없음 — 새로고침(Ctrl+Shift+R)');return;}
  var base=(state.projectName||'성과'),safe=base.replace(/[^\w가-힣\-]/g,'_');
  var zip=new JSZip(),seen={};
  arr.forEach(function(it,i){var nm=it.name||('후측량'+(i+1)+'.csv');if(seen[nm])nm=(i+1)+'_'+nm;seen[nm]=1;zip.file(nm,'\uFEFF'+(it.text||''));});
  if(dxf){zip.file(safe+'_결선.dxf',dxf);}
  zip.generateAsync({type:'blob'}).then(function(blob){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='후측량성과_'+base+'.zip';document.body.appendChild(a);a.click();a.remove();toast('📦 후측량CSV+결선DXF → ZIP 다운로드');});
}
function openFinalStatus(){
  var fd=state.fieldDone||{csv:false,joseo:false,manhole:false};state.fieldDone=fd;
  var items=[['csv','후측량CSV+결선'],['joseo','실시간 사진조서'],['manhole','맨홀도 제작']];
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center';
  var box=document.createElement('div');
  box.style.cssText='background:#fff;border-radius:14px;width:92%;max-width:440px;box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden';
  function row(k,label){var done=!!fd[k];var btn;if(((k==='joseo')||(k==='csv'&&state.finalCsv&&state.finalCsv.length))&&done){btn='<button class="fs-dl" data-k="'+k+'" style="border:1px solid #0d9488;background:#e7faf5;color:#0d9488;border-radius:8px;padding:5px 11px;font-size:12.5px;cursor:pointer;font-weight:700">📥 다운로드</button>';}else if(k==='csv'){btn='<span style="font-size:12px;color:#888">상단 \'후측량 csv\'로 업로드</span>';}else{btn='<button class="fs-tgl" data-k="'+k+'" style="border:1px solid #ccc;background:#fff;border-radius:8px;padding:5px 11px;font-size:12.5px;cursor:pointer">'+(done?'미완료로':'등록완료')+'</button>';}return '<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #f1f1f1"><span style="flex:1;font-size:15px;font-weight:600">'+label+'</span><span style="font-size:13px;font-weight:800;padding:4px 11px;border-radius:20px;'+(done?'background:#eafaf0;color:#16a34a;border:1px solid #16a34a':'background:#fff5f5;color:#d32f2f;border:1px solid #d32f2f')+'">'+(done?'등록완료':'미완료')+'</span>'+btn+'</div>';}
  function render(){
    var allDone=items.every(function(it){return !!fd[it[0]];});
    box.innerHTML='<div style="padding:15px 18px;border-bottom:1px solid #eee;display:flex;align-items:center"><b style="flex:1;font-size:16px;color:#4f46e5">📋 후측량 최종성과 등록</b><button id="fsClose" style="border:none;background:#f2f2f2;border-radius:8px;padding:6px 12px;cursor:pointer">닫기</button></div>'
      +items.map(function(it){return row(it[0],it[1]);}).join('')
      +'<div style="padding:13px 18px;font-size:13px;'+(allDone?'color:#16a34a;font-weight:700':'color:#888')+'">'+(allDone?'✅ 모든 성과 등록완료':'각 항목을 등록완료로 표시하세요 (성과 제작 연결은 다음 단계)')+'</div>';
    box.querySelector('#fsClose').onclick=function(){ov.remove();};
    [].forEach.call(box.querySelectorAll('.fs-tgl'),function(b){b.onclick=function(){var k=this.getAttribute('data-k');fd[k]=!fd[k];state.fieldDone=fd;if(online&&state.projectId)saveProject();refreshFieldBar();render();};});
    [].forEach.call(box.querySelectorAll('.fs-dl'),function(b){b.onclick=function(){var dk=this.getAttribute('data-k');if(dk==='csv'){downloadFinalCsvDxf();}else{joseoDownloadFinal();}};});
  }
  render();ov.appendChild(box);ov.onclick=function(e){if(e.target===ov)ov.remove();};document.body.appendChild(ov);
}
(function(){
  var fb=document.getElementById('fieldBar');if(!fb)return;
  if(!IS_FIELD){fb.remove();return;}
  fb.style.display='flex';
  if(window.innerWidth>760){
    var vp=document.getElementById('vPhoto'),vm=document.getElementById('vMap'),vr=document.getElementById('vRv');
    if(vp)vp.style.marginLeft='auto';
    [vp,vm,vr].forEach(function(b){if(b)fb.appendChild(b);});
  }
  var sv=document.getElementById('fldSave');if(sv)sv.onclick=function(){saveProject();};
  var c=document.getElementById('fldCsv');if(c)c.onclick=openFinalCsvUpload;
  var j=document.getElementById('fldJoseo');if(j)j.onclick=openJoseoPanel;
  var m=document.getElementById('fldManhole');if(m)m.onclick=function(){if(typeof mnOpenList==='function')mnOpenList();};var _fi=document.getElementById('fldImport');if(_fi)_fi.onclick=function(){openImportList('survey');};var _fdd=document.getElementById('fldDel');if(_fdd)_fdd.onclick=fieldDelProject;
  var f=document.getElementById('fldFinal');if(f)f.onclick=openFinalStatus;
  var _rg=document.getElementById('fldReg');if(_rg)_rg.onclick=function(){if(typeof openRegModal==='function')openRegModal();};
  if(typeof isMobileDevice==='function'&&isMobileDevice()){var _vp=document.getElementById('vPhoto');if(_vp)_vp.textContent='📷 사진';if(f)f.textContent='후측량 최종성과등록';}
  refreshFieldBar();
})();

/* ===================== [BUILD 918] 맨홀조사 야장 (측량현장) ===================== */
var MH_SPECS=[
  {name:'수공1호',w:450,h:950,dep:700},
  {name:'수공2-1호',w:700,h:1300,dep:700},
  {name:'수공2호',w:800,h:1700,dep:1100},
  {name:'수공3호',w:1000,h:2000,dep:1100}
];
/* [1002] 규격 선택 모달 — 하나 고르면 좌우벽폭(w12=짧은변)·상하벽폭(w34=긴변)·깊이 자동채움 */
/* [1003] 규격 기반 치수 선택 — mode: 'w12'(좌우/1번), 'w34'(상하/3번), 'dep'(깊이).
   폭: 클릭한 벽=짧은변(선택), 반대벽=규격 긴변 자동 → 방향(가로/세로) 자동 결정. 깊이: 규격깊이 선택+직접. */
function mnSyncSpec(rec){
  rec.spec=mnDetectSpec(rec.dep,rec.w12,rec.w34);
  if(rec.spec&&rec.dep>0)rec.spec.dep=Math.round(rec.dep*1000);
}
function mnAskSpec(rec,cb){mnAskSpecDim(rec,'w12',cb);} /* 하위호환 */
function mnAskSpecDim(rec,mode,cb){
  var w=document.createElement('div');w.id='mnSpecModal';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1332;display:flex;align-items:flex-start;justify-content:center;padding-top:11dvh';
  var isDep=(mode==='dep');
  var title=isDep?'깊이 선택':(mode==='w12'?'좌우벽(①②) 폭 선택':'상하벽(③④) 폭 선택');
  var hint=isDep?'규격 깊이를 선택하거나 직접 입력하세요':'선택한 폭이 짧은 쪽이 되고, 긴 쪽은 규격대로 자동 채워집니다';
  var rows='';
  if(isDep){
    var deps=[{v:0.7,nm:'수공1호·2-1호',c:'#e67e22',bg:'#fdf3e7'},{v:1.1,nm:'수공2호·3호',c:'#e74c3c',bg:'#fdecea'}];
    rows=deps.map(function(d){var on=(Math.abs((rec.dep||0)-d.v)<0.001);
      return '<button type="button" class="mnSpB" data-v="'+d.v+'" style="width:100%;text-align:left;border:'+(on?'2.5px':'1.5px')+' solid '+d.c+';background:'+d.bg+';border-radius:10px;padding:12px 14px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px;color:'+d.c+'">'+d.v+' m</b><span style="font-size:12px;color:'+d.c+';opacity:.75">'+d.nm+'</span></button>';
    }).join('');
  }else{
    var curShort=(mode==='w12')?rec.w12:rec.w34;
    var SPC={'수공1호':['#1d9e75','#e1f5ee'],'수공2-1호':['#e67e22','#fdf3e7'],'수공2호':['#2471a3','#eaf3fb'],'수공3호':['#8e44ad','#f4ecf9']};
    rows=MH_SPECS.map(function(sp){
      var shortM=Math.min(sp.w,sp.h)/1000, longM=Math.max(sp.w,sp.h)/1000;
      var on=(Math.abs((curShort||0)-shortM)<0.001);
      var cc=SPC[sp.name]||['#2471a3','#eaf3fb'];
      return '<button type="button" class="mnSpB" data-s="'+shortM+'" data-l="'+longM+'" data-d="'+(sp.dep/1000)+'" style="width:100%;text-align:left;border:'+(on?'2.5px':'1.5px')+' solid '+cc[0]+';background:'+cc[1]+';border-radius:10px;padding:11px 14px;margin-bottom:8px;cursor:pointer;display:flex;justify-content:space-between;align-items:center"><b style="font-size:14.5px;color:'+cc[0]+'">'+sp.name+'</b><span style="font-size:13.5px;color:'+cc[0]+';font-weight:800">'+shortM+' m</span></button>';
    }).join('');
  }
  w.innerHTML='<div style="background:#fff;border-radius:13px;width:min(90vw,360px);padding:16px;max-height:86dvh;overflow:auto">'
    +'<div style="font-weight:800;font-size:15px;margin-bottom:4px">'+title+'</div>'
    +'<div style="font-size:12px;color:#999;margin-bottom:11px">'+hint+'</div>'
    +rows
    +'<button id="mnSpecManual" style="width:100%;border:1px dashed #bbb;background:#fafafa;color:#667;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;margin-top:2px">직접 입력</button>'
    +'<button id="mnSpecCancel" style="width:100%;border:0;background:#f1f1ee;color:#333;border-radius:10px;padding:11px;font-weight:700;font-size:14px;margin-top:8px;cursor:pointer">취소</button></div>';
  document.body.appendChild(w);
  function close(){w.remove();}
  w.onclick=function(e){if(e.target===w)close();};
  w.querySelector('#mnSpecCancel').onclick=close;
  w.querySelectorAll('.mnSpB').forEach(function(b){b.onclick=function(){
    if(isDep){ rec.dep=parseFloat(this.getAttribute('data-v')); }
    else{
      var sh=parseFloat(this.getAttribute('data-s')),lo=parseFloat(this.getAttribute('data-l')),dp=parseFloat(this.getAttribute('data-d'));
      if(mode==='w12'){rec.w12=sh;rec.w34=lo;}else{rec.w34=sh;rec.w12=lo;}
      if(!(rec.dep>0))rec.dep=dp;
    }
    mnSyncSpec(rec);close();cb();
  };});
  w.querySelector('#mnSpecManual').onclick=function(){
    close();
    var t=isDep?'깊이':(mode==='w12'?'좌우벽 폭':'상하벽 폭');
    var COLS={dep:['#e74c3c','#fdecea'],w12:['#8e44ad','#f4ecf9'],w34:['#2471a3','#eaf3fb']}; /* [1004] 전역 스코프용 자체 색상 */
    var key=isDep?'dep':mode;
    mnAsk({title:t,unit:'m',val:rec[key],color:COLS[key],cb:function(v){rec[key]=(v===''?'':v);mnSyncSpec(rec);cb();}});
  };
}
function mnDetectSpec(dep,w12,w34){
  if(!(dep>0)||!(w12>0)||!(w34>0))return null;
  var d=dep*1000,a=Math.min(w12,w34)*1000,b=Math.max(w12,w34)*1000,best=null,bs=1e18;
  MH_SPECS.forEach(function(sp){var sc=Math.abs(d-sp.dep)+Math.abs(a-sp.w)+Math.abs(b-sp.h);if(sc<bs){bs=sc;best=sp;}});
  if(!best)return null;
  return {name:best.name,w:best.w,h:best.h,dep:best.dep,orient:(w12>=w34)?'가로':'세로'};
}
function mnList(){if(!state.mnList)state.mnList=[];return state.mnList;}
function mnLabel(r){var ow=(r.owner==='_c'?(r.ownerC||''):(r.owner||''));var nt=(r.note||'').trim();var pf=(r.newFlag==='신설'?'신설':(r.newFlag==='기설'?'기설':''));return pf+(r.no||'')+(ow?'('+ow+')':'')+(nt?nt:'');}
var MN_SLOTS=[['bd','표찰'],['fr','전경'],['p1','① 서'],['p2','② 동'],['p3','③ 북'],['p4','④ 남']];
/* [BUILD 935] PC: 맨홀조사를 우측 도킹 패널로 (실시간조서 방식) */
function mnHostOpen(){
  if(typeof isMobileDevice==='function'&&isMobileDevice())return null;
  var jp=document.getElementById('joseoPanel');
  var pn=document.getElementById('mnPanel');
  if(!pn){
    pn=document.createElement('div');pn.id='mnPanel';pn.className='photo-panel';
    if(jp&&jp.parentNode)jp.parentNode.insertBefore(pn,jp.nextSibling);else document.body.appendChild(pn);
  }
  [].forEach.call(document.querySelectorAll('.photo-panel.open'),function(p){if(p.id!=='mnPanel'){p.classList.remove('open');p.style.display='none';}});
  pn.classList.add('open');pn.style.display='flex';pn.innerHTML='';
  return pn;
}
function mnHostClose(){var pn=document.getElementById('mnPanel');if(pn){pn.classList.remove('open');pn.style.display='none';pn.innerHTML='';}}
/* [1012] 삭제목록(7일 휴지통) — 남은 일수 표시 + 복원 */
function mnTrashList(afterClose){
  var old=document.getElementById('mnTrashModal');if(old)old.remove();
  var all=mnList(),now=Date.now();
  var items=[];all.forEach(function(r,i){if(r.delAt)items.push({r:r,i:i});});
  items.sort(function(a,b){return b.r.delAt-a.r.delAt;});
  var rows=items.length?items.map(function(o){
    var left=Math.max(0,7-Math.floor((now-o.r.delAt)/86400000));
    return '<div style="background:#fff;border:1px solid #eee2c8;border-radius:11px;padding:11px 13px;margin-bottom:8px;display:flex;align-items:center;gap:9px">'
      +'<div style="flex:1;min-width:0"><div style="font-size:14.5px;font-weight:800;color:#5a4a12;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(o.r.no?joseoEsc(mnLabel(o.r)):'번호 미입력')+'</div>'
      +'<div style="font-size:11.5px;color:#a08a4a;margin-top:2px">'+left+'일 후 완전삭제</div></div>'
      +'<button class="mnTrRe" data-i="'+o.i+'" style="flex:none;border:1.5px solid #1d9e75;background:#fff;color:#1d9e75;border-radius:9px;padding:8px 14px;font-weight:800;font-size:13px;cursor:pointer">복원</button></div>';
  }).join('')
  :'<div style="text-align:center;color:#b0a070;font-size:13.5px;padding:24px 0">삭제된 항목이 없습니다</div>';
  var w=document.createElement('div');w.id='mnTrashModal';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1335;display:flex;align-items:flex-start;justify-content:center;padding-top:10dvh';
  w.innerHTML='<div style="background:#fdfbf4;border-radius:14px;width:min(92vw,400px);max-height:78dvh;display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:13px 16px;background:#fff;border-bottom:1px solid #eee2c8;display:flex;align-items:center;gap:8px"><b style="flex:1;font-size:15px;color:#5a4a12">🗑 삭제목록 (7일 보관)</b>'
    +'<button id="mnTrClose" style="border:1.5px solid #d32f2f;background:#fff;color:#d32f2f;border-radius:9px;padding:6px 14px;font-weight:800;cursor:pointer">닫기</button></div>'
    +'<div style="padding:12px 14px;overflow:auto;flex:1">'+rows+'</div></div>';
  document.body.appendChild(w);
  w.onclick=function(e){if(e.target===w)w.remove();};
  w.querySelector('#mnTrClose').onclick=function(){w.remove();};
  [].forEach.call(w.querySelectorAll('.mnTrRe'),function(b){b.onclick=function(){
    var i=+b.getAttribute('data-i');var r=mnList()[i];if(!r)return;
    delete r.delAt;saveProject();w.remove();
    toast('복원됨: '+(r.no?mnLabel(r):'번호 미입력'));
    if(afterClose){afterClose();mnOpenList();}
  };});
}
function mnOpenList(){
  if(!state.projectId){toast('먼저 사업을 선택하세요');return;}
  var host=mnHostOpen();
  var old=document.getElementById('mnListModal');if(old)old.remove();
  var mob=(typeof isMobileDevice==='function'&&isMobileDevice());
  /* [1012] 7일 지난 휴지통 항목 완전삭제 */
  var _all=mnList(),_nowT=Date.now(),_purged=false;
  for(var _pi=_all.length-1;_pi>=0;_pi--){if(_all[_pi].delAt&&_nowT-_all[_pi].delAt>7*86400000){_all.splice(_pi,1);_purged=true;}}
  if(_purged)saveProject();
  var rows=_all.filter(function(r){return !r.delAt;});
  var listHtml;
  if(rows.length){
    var arr=[];_all.forEach(function(r,i){if(!r.delAt)arr.push({r:r,i:i});});
    arr.sort(function(a,b){return ((b.r.up||b.r.at||'')+'').localeCompare((a.r.up||a.r.at||'')+'');});
    listHtml=arr.map(function(o,k){
      var r=o.r,i=o.i;
      var pc=0;MN_SLOTS.forEach(function(sl){if(r.photos&&r.photos[sl[0]])pc++;});
      var spBadge=r.spec
        ?'<span style="background:#e1f5ee;color:#0f6e56;border:1px solid #bfe5d6;border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:800">'+joseoEsc(r.spec.name)+' · '+r.spec.orient+'</span>'
        :'<span style="background:#f4f4f1;color:#9a9a94;border:1px solid #e3e3de;border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:700">규격 미판정</span>';
      var dt=((r.up||r.at||'')).slice(0,10).replace(/-/g,'.');
      var recent=(k===0&&rows.length>1)?'<span style="background:#1d9e75;color:#fff;border-radius:20px;padding:2px 8px;font-size:10.5px;font-weight:800">최근 작업</span>':'';
      return '<div class="mn-card" data-i="'+i+'" style="background:#fff;border:1px solid '+(k===0?'#9fd4bd':'#e2eae5')+';border-radius:13px;padding:13px 14px;margin-bottom:9px;cursor:pointer;box-shadow:0 1px 4px rgba(20,60,45,.06)">'
        +'<div style="display:flex;align-items:center;gap:8px"><span style="flex:1;font-size:16px;font-weight:800;color:#134e3a">'+(r.no?joseoEsc(mnLabel(r)):'<span style=\"color:#b8b8b0\">번호 미입력</span>')+'</span>'+recent+spBadge
        +'<button class="mn-del" data-i="'+i+'" style="flex:none;border:none;background:#faf1f0;color:#c0392b;border-radius:6px;width:16px;height:16px;padding:0;cursor:pointer;font-size:10px;line-height:1">✕</button></div>'
        +'<div style="display:flex;align-items:center;gap:12px;margin-top:7px;font-size:12px;color:#8a948e"><span style="font-weight:700;color:'+(pc===6?'#1d9e75':'#8a948e')+'">사진 '+pc+'/6</span><span>'+dt+'</span></div>'
        +'</div>';
    }).join('');
  }else{
    listHtml='<div style="text-align:center;padding:26px 10px 22px">'
      +'<div style="width:64px;height:64px;border:2px dashed #bcd8cb;border-radius:50%;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;color:#8fbfa9;font-size:12px;font-weight:800">맨홀</div>'
      +'<div style="font-size:14.5px;font-weight:700;color:#4a5a52">조사한 맨홀이 없습니다</div>'
      +'<div style="font-size:12.5px;color:#9aa8a0;margin-top:4px">아래 버튼으로 첫 조사를 시작하세요</div></div>';
  }
  var newBtn='<div style="padding:'+(host?'12px 15px 4px':'11px 15px 15px')+'"><button id="mnNew" style="width:100%;background:#fff;color:#d32f2f;border:1.5px solid #d32f2f;border-radius:12px;padding:13px;font-weight:800;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(211,47,47,.15)"><span style="letter-spacing:2px;margin-right:-2px">+ 새 맨홀조사</span></button></div>';
  var inner='<div style="background:#f5f8f6;'+(host?'width:100%;height:100%;border-radius:0':'border-radius:16px;width:min(94vw,420px);max-height:84dvh;box-shadow:0 16px 48px rgba(0,0,0,.25)')+';display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:15px 17px;background:#fff;border-bottom:1px solid #e7eeea;display:flex;align-items:center;gap:9px">'
      +'<span style="width:10px;height:10px;border-radius:50%;background:#1d9e75;flex:none"></span>'
      +'<b style="flex:1;font-size:16px;color:#22332b">맨홀조사 야장</b>'
      +(rows.length?'<span style="background:#e1f5ee;color:#0f6e56;border-radius:20px;padding:3px 11px;font-size:12px;font-weight:800">'+rows.length+'개</span>':'')
      +'<button id="mnTrashBtn" style="border:1px solid #b58900;background:#fdf6e3;color:#8a6d00;border-radius:9px;padding:7px 11px;cursor:pointer;font-weight:800;font-size:12.5px">🗑 삭제목록</button>'
      +'<button id="mnLClose" style="border:1.5px solid #d32f2f;background:#fff;border-radius:9px;padding:7px 15px;cursor:pointer;color:#d32f2f;font-weight:800;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">닫기</span></button></div>'
    +(host?newBtn:'')
    +'<div style="padding:13px 15px 4px;overflow:auto;flex:1">'+listHtml+'</div>'
    +(host?'':newBtn)
    +'</div>';
  var wrap=null,root=null;
  if(host){host.innerHTML=inner;root=host;}
  else{
    wrap=document.createElement('div');wrap.id='mnListModal';
    wrap.style.cssText='position:fixed;inset:0;background:rgba(20,30,26,.5);z-index:1300;display:flex;justify-content:center;'+(mob?'align-items:flex-start;padding-top:7dvh':'align-items:center');
    wrap.innerHTML=inner;document.body.appendChild(wrap);root=wrap;
    wrap.onclick=function(e){if(e.target===wrap)wrap.remove();};
  }
  function uClose(){if(host)mnHostClose();else if(wrap)wrap.remove();}
  root.querySelector('#mnLClose').onclick=uClose;
  root.querySelector('#mnNew').onclick=function(){uClose();mnOpenForm(null);};
  [].forEach.call(root.querySelectorAll('.mn-card'),function(b){b.onclick=function(e){if(e.target.classList.contains('mn-del'))return;var i=+b.getAttribute('data-i');uClose();mnOpenForm(mnList()[i]);};});
  [].forEach.call(root.querySelectorAll('.mn-del'),function(b){b.onclick=function(){var i=+b.getAttribute('data-i');var r=mnList()[i];if(!confirm('맨홀 '+mnLabel(r)+' 조사를 삭제할까요?\n(7일 보관 후 완전삭제 — 삭제목록에서 복원 가능)'))return;r.delAt=Date.now();saveProject();uClose();mnOpenList();toast('🗑 삭제됨 (7일 보관)');};});
  var _tb=root.querySelector('#mnTrashBtn');if(_tb)_tb.onclick=function(){mnTrashList(uClose);};
}
function mnAsk(opt){
  var old=document.getElementById('mnAskModal');if(old)old.remove();
  var c=(opt.color&&opt.color[0])||'#1d9e75', cbg=(opt.color&&opt.color[1])||'#f2fbf7';
  var w=document.createElement('div');w.id='mnAskModal';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1330;display:flex;align-items:flex-start;justify-content:center;padding-top:18dvh';
  w.innerHTML='<div style="background:'+cbg+';border:1.5px solid '+c+';border-radius:12px;width:min(72vw,220px);padding:12px 13px">'
    +'<div style="font-weight:800;font-size:13.5px;color:'+c+';margin-bottom:8px">'+opt.title+(opt.unit?' <span style="font-weight:400;font-size:11px;opacity:.75">('+opt.unit+')</span>':'')+'</div>'
    +'<input id="mnAskIn" '+(opt.text?'type="text"':'type="number" step="0.01" inputmode="decimal"')+' value="'+(opt.val==null?'':(''+opt.val).replace(/"/g,'&quot;'))+'" style="width:100%;box-sizing:border-box;border:1.5px solid '+c+';border-radius:8px;padding:8px;font-size:15px;text-align:center;background:#fff">'
    +'<div style="display:flex;gap:6px;margin-top:9px"><button id="mnAskOk" style="flex:1;background:'+c+';color:#fff;border:0;border-radius:8px;padding:9px;font-weight:800;font-size:13.5px;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">확인</span></button><button id="mnAskNo" style="flex:1;background:#fff;color:#555;border:1px solid #ddd;border-radius:8px;padding:9px;font-weight:700;font-size:13.5px;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">취소</span></button></div></div>';
  document.body.appendChild(w);
  var inp=w.querySelector('#mnAskIn');setTimeout(function(){inp.focus();inp.select&&inp.select();},60);
  w.querySelector('#mnAskNo').onclick=function(){w.remove();};
  w.onclick=function(e){if(e.target===w)w.remove();};
  function ok(){var v=inp.value;w.remove();opt.cb(opt.text?v.trim():(v===''?'':parseFloat(v)));}
  w.querySelector('#mnAskOk').onclick=ok;
  inp.addEventListener('keydown',function(e){if(e.key==='Enter')ok();});
}
function mnAskNoOwner(rec,cb){
  var old=document.getElementById('mnAskModal');if(old)old.remove();
  var no=rec.no||'';var suf=rec.suf||'M';
  var m=/^(.+?)([MH])$/.exec(no);if(m){no=m[1];suf=m[2];}
  var nf=rec.newFlag||'기설';
  var w=document.createElement('div');w.id='mnAskModal';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1330;display:flex;align-items:flex-start;justify-content:center;padding-top:12dvh';
  var opts=['LG','SKT','SKB','시청','세종','드림'].map(function(o){return '<option value="'+o+'"'+(rec.owner===o?' selected':'')+'>'+o+'</option>';}).join('')+'<option value="_c"'+(rec.owner==='_c'?' selected':'')+'>직접입력</option>';
  function nfBtn(v){var on=(nf===v);return '<button type="button" class="mnNfB" data-v="'+v+'" style="flex:1;border:1.5px solid '+(on?'#1d9e75':'#ccc')+';background:'+(on?'#e1f5ee':'#fff')+';color:'+(on?'#0f6e56':'#667')+';border-radius:8px;padding:8px;font-weight:800;font-size:14px;cursor:pointer">'+v+'</button>';}
  w.innerHTML='<div style="background:#fff;border-radius:13px;width:min(90vw,340px);padding:16px;max-height:86dvh;overflow:auto">'
    +'<div style="font-weight:800;font-size:15px;margin-bottom:10px">맨홀번호</div>'
    +'<div style="display:flex;gap:7px;margin-bottom:8px" id="mnNfRow">'+nfBtn('신설')+nfBtn('기설')+'</div>'
    +'<div style="display:flex;gap:7px;align-items:center"><div style="flex:1.2;min-width:0;display:flex;align-items:center;gap:4px"><select id="mnNoSel" style="flex:1;min-width:0;border:1.5px solid #1d9e75;border-radius:9px;padding:10px 4px;font-size:16px;background:#fff">'+(function(){var o='';for(var i=1;i<=10;i++){o+='<option value=\''+i+'\''+(no===String(i)?' selected':'')+'>'+i+'</option>';}o+='<option value=\'_c\''+((no&&['1','2','3','4','5','6','7','8','9','10'].indexOf(no)<0)?' selected':'')+'>직접</option>';return o;})()+'</select><input id="mnNoIn" type="text" inputmode="text" value="'+joseoEsc(no)+'" placeholder="직접입력" style="flex:1;min-width:0;border:1.5px solid #1d9e75;border-radius:9px;padding:10px;font-size:16px;display:'+((no&&['1','2','3','4','5','6','7','8','9','10'].indexOf(no)<0)?'block':'none')+'"><select id="mnSufIn" style="flex:none;width:52px;border:1.5px solid #1d9e75;border-radius:9px;padding:10px 4px;font-size:15px;font-weight:800;color:#1d9e75;background:#fff"><option value="M"'+(suf==='M'?' selected':'')+'>M</option><option value="H"'+(suf==='H'?' selected':'')+'>H</option></select></div>'
    +'<select id="mnOwIn" style="flex:1;min-width:0;border:1px solid #ddd;border-radius:9px;padding:10px 6px;font-size:14px;background:#fff">'+opts+'</select></div>'
    +'<input id="mnOwC" value="'+joseoEsc(rec.ownerC||'')+'" placeholder="소유자 직접입력" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:9px;padding:10px;font-size:14px;margin-top:8px;display:'+(rec.owner==='_c'?'block':'none')+'">'
    +'<input id="mnNoteIn" value="'+joseoEsc(rec.note||'')+'" placeholder="특이사항 (예: 폐, 이설 등 — 번호 뒤에 붙음)" style="width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:9px;padding:10px;font-size:14px;margin-top:8px">'
    +'<div style="font-size:12px;color:#999;margin-top:6px" id="mnPrev"></div>'
    +'<div style="display:flex;gap:8px;margin-top:12px"><button id="mnAskOk" style="flex:1;background:#1d9e75;color:#fff;border:0;border-radius:9px;padding:11px;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">확인</span></button><button id="mnAskNo2" style="flex:1;background:#f1f1ee;color:#333;border:0;border-radius:9px;padding:11px;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">취소</span></button></div></div>';
  document.body.appendChild(w);
  w.querySelectorAll('.mnNfB').forEach(function(b){b.onclick=function(){nf=this.getAttribute('data-v');w.querySelectorAll('.mnNfB').forEach(function(x){var on=(x.getAttribute('data-v')===nf);x.style.borderColor=on?'#1d9e75':'#ccc';x.style.background=on?'#e1f5ee':'#fff';x.style.color=on?'#0f6e56':'#667';});};});
  function noVal(){var sel=w.querySelector('#mnNoSel').value;return sel==='_c'?w.querySelector('#mnNoIn').value.trim():sel;}
  w.querySelector('#mnNoSel').addEventListener('change',function(){var c=(this.value==='_c');w.querySelector('#mnNoIn').style.display=c?'block':'none';if(c)setTimeout(function(){w.querySelector('#mnNoIn').focus();},30);upPrev();});
  function upPrev(){var n=noVal();var sf=w.querySelector('#mnSufIn').value;var ov=w.querySelector('#mnOwIn').value;var oc=w.querySelector('#mnOwC').value.trim();var ow=(ov==='_c'?oc:ov);var nt=w.querySelector('#mnNoteIn').value.trim();var pf=(nf==='신설'?'신설':(nf==='기설'?'기설':''));w.querySelector('#mnPrev').textContent='표시: '+pf+(n?(n+sf):'')+(ow?'('+ow+')':'')+(nt||'');}
  w.querySelector('#mnOwIn').addEventListener('change',function(){w.querySelector('#mnOwC').style.display=(this.value==='_c')?'block':'none';upPrev();});
  ['mnNoIn','mnSufIn','mnOwC','mnNoteIn'].forEach(function(id){w.querySelector('#'+id).addEventListener('input',upPrev);w.querySelector('#'+id).addEventListener('change',upPrev);});
  upPrev();
  w.querySelector('#mnAskNo2').onclick=function(){w.remove();};
  w.onclick=function(e){if(e.target===w)w.remove();};
  w.querySelector('#mnAskOk').onclick=function(){
    var n=noVal();var sf=w.querySelector('#mnSufIn').value;
    rec.suf=sf;rec.newFlag=nf;
    rec.no=n?(n+sf):'';
    rec.owner=w.querySelector('#mnOwIn').value;rec.ownerC=w.querySelector('#mnOwC').value.trim();
    rec.note=w.querySelector('#mnNoteIn').value.trim();
    w.remove();cb();
  };
  setTimeout(function(){var c=w.querySelector('#mnNoSel').value==='_c';(c?w.querySelector('#mnNoIn'):w.querySelector('#mnNoSel')).focus();},60);
}
function mnAskDest(cur,dn,cb){
  var old=document.getElementById('mnAskModal');if(old)old.remove();
  var no='',ow='LG',owc='';
  if(cur==='전주입상'){ow='전주입상';}
  else{
    var m=/^(.+?)M\((.+)\)$/.exec(cur||'');
    if(m){no=m[1];var o=m[2];if(['LG','SKT','SKB','시청','세종','드림'].indexOf(o)>=0)ow=o;else{ow='_c';owc=o;}}
    else{var m2=/^(.+?)M$/.exec(cur||'');if(m2)no=m2[1];}
  }
  var w=document.createElement('div');w.id='mnAskModal';
  w.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:1330;display:flex;align-items:flex-start;justify-content:center;padding-top:16dvh';
  var opts=['LG','SKT','SKB','시청','세종','드림','전주입상'].map(function(o){return '<option value="'+o+'"'+(ow===o?' selected':'')+'>'+o+'</option>';}).join('')+'<option value="_c"'+(ow==='_c'?' selected':'')+'>직접입력</option>';
  w.innerHTML='<div style="background:#f1f8e9;border:1.5px solid #558b2f;border-radius:12px;width:min(80vw,280px);padding:13px 14px">'
    +'<div style="font-weight:800;font-size:13.5px;color:#558b2f;margin-bottom:9px">연결 맨홀 ('+dn+'방향)</div>'
    +'<div style="display:flex;gap:7px;align-items:center"><div style="flex:1.1;min-width:0;display:flex;align-items:center;gap:4px"><input id="mnDNo" type="text" inputmode="numeric" value="'+joseoEsc(no)+'" placeholder="예: 2" style="flex:1;min-width:0;border:1.5px solid #558b2f;border-radius:9px;padding:9px;font-size:15px;background:#fff"><b style="font-size:15px;color:#558b2f;flex:none">M</b></div>'
    +'<select id="mnDOw" style="flex:1;min-width:0;border:1px solid #ccd8c0;border-radius:9px;padding:9px 6px;font-size:14px;background:#fff">'+opts+'</select></div>'
    +'<input id="mnDOwC" value="'+joseoEsc(owc)+'" placeholder="소유자 직접입력" style="width:100%;box-sizing:border-box;border:1px solid #ccd8c0;border-radius:9px;padding:9px;font-size:14px;margin-top:8px;background:#fff;display:'+(ow==='_c'?'block':'none')+'">'
    +'<div style="display:flex;gap:7px;margin-top:10px"><button id="mnDOk" style="flex:1;background:#558b2f;color:#fff;border:0;border-radius:9px;padding:10px;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">확인</span></button><button id="mnDNo2" style="flex:1;background:#fff;color:#555;border:1px solid #ddd;border-radius:9px;padding:10px;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">취소</span></button></div></div>';
  document.body.appendChild(w);
  w.querySelector('#mnDOw').addEventListener('change',function(){
    if(this.value==='전주입상'){w.remove();cb('전주입상');return;}
    w.querySelector('#mnDOwC').style.display=(this.value==='_c')?'block':'none';
  });
  w.querySelector('#mnDNo2').onclick=function(){w.remove();};
  w.onclick=function(e){if(e.target===w)w.remove();};
  w.querySelector('#mnDOk').onclick=function(){
    var n=w.querySelector('#mnDNo').value.trim();
    var o=w.querySelector('#mnDOw').value;
    if(o==='전주입상'){w.remove();cb('전주입상');return;}
    if(o==='_c')o=w.querySelector('#mnDOwC').value.trim();
    w.remove();cb(n?(n+'M'+(o?'('+o+')':'')):'');
  };
  setTimeout(function(){w.querySelector('#mnDNo').focus();},60);
}
/* [BUILD 983] 맨홀도 DXF — 규격샘플 템플릿(dxf/) fetch → 마커치환 + 관 실좌표 재그리기 */
var MN_DXF_GEO={"tpl_045x095": {"bx0": 139955, "bx1": 140405, "by0": -150953, "by1": -150003, "ar": {"d1": [138854.9, -150473.3], "d3": [140179.9, -148903.2], "d4": [140179.9, -152053.2], "d2": [141504.9, -150473.3]}, "nk": [{"d": "L", "ax": "x", "end": 138854.9, "sign": 1, "blk": ["*D9"]}, {"d": "R", "ax": "x", "end": 141504.9, "sign": -1, "blk": ["*D5"]}, {"d": "T", "ax": "y", "end": -148903.2, "sign": -1, "blk": []}, {"d": "B", "ax": "y", "end": -152053.2, "sign": 1, "blk": []}]}, "tpl_095x045": {"bx0": 139705, "bx1": 140655, "by0": -150703, "by1": -150253, "ar": {"d1": [138604.9, -150478.2], "d3": [140174.9, -149153.2], "d2": [141754.9, -150478.2], "d4": [140174.9, -151803.2]}, "nk": [{"d": "L", "ax": "x", "end": 138604.9, "sign": 1, "blk": ["*D8"]}, {"d": "R", "ax": "x", "end": 141754.9, "sign": -1, "blk": ["*D12"]}, {"d": "T", "ax": "y", "end": -149153.2, "sign": -1, "blk": []}, {"d": "B", "ax": "y", "end": -151803.2, "sign": 1, "blk": []}]}, "tpl_07x13": {"bx0": 139830, "bx1": 140530, "by0": -151128, "by1": -149828, "ar": {"d4": [140179.9, -152228.2], "d1": [138729.9, -150483.2], "d2": [141629.9, -150483.2], "d3": [140179.9, -148728.2]}, "nk": [{"d": "L", "ax": "x", "end": 138729.9, "sign": 1, "blk": ["*D12"]}, {"d": "R", "ax": "x", "end": 141629.9, "sign": -1, "blk": ["*D6"]}, {"d": "T", "ax": "y", "end": -148728.2, "sign": -1, "blk": []}, {"d": "B", "ax": "y", "end": -152228.2, "sign": 1, "blk": []}]}, "tpl_13x07": {"bx0": 139530, "bx1": 140830, "by0": -150828, "by1": -150128, "ar": {"d2": [141929.9, -150478.2], "d4": [140183.4, -151928.2], "d1": [138429.9, -150478.2], "d3": [140183.4, -149028.2]}, "nk": [{"d": "L", "ax": "x", "end": 138429.9, "sign": 1, "blk": ["*D12"]}, {"d": "R", "ax": "x", "end": 141929.9, "sign": -1, "blk": ["*D8"]}, {"d": "T", "ax": "y", "end": -149028.2, "sign": -1, "blk": []}, {"d": "B", "ax": "y", "end": -151928.2, "sign": 1, "blk": []}]}, "tpl_08x17": {"bx0": 139780, "bx1": 140580, "by0": -151328, "by1": -149628, "ar": {"d4": [140179.9, -152828.2], "d1": [138279.9, -150483.2], "d2": [142079.9, -150483.2], "d3": [140179.9, -148128.2]}, "nk": [{"d": "L", "ax": "x", "end": 138279.9, "sign": 1, "blk": ["*D10"]}, {"d": "R", "ax": "x", "end": 142079.9, "sign": -1, "blk": ["*D6"]}, {"d": "T", "ax": "y", "end": -148128.2, "sign": -1, "blk": []}, {"d": "B", "ax": "y", "end": -152828.2, "sign": 1, "blk": []}]}, "tpl_17x08": {"bx0": 139330, "bx1": 141030, "by0": -150878, "by1": -150078, "ar": {"d2": [142529.9, -150478.2], "d4": [140184.9, -152378.2], "d3": [140184.9, -148578.2], "d1": [137829.9, -150478.2]}, "nk": [{"d": "L", "ax": "x", "end": 137829.9, "sign": 1, "blk": ["*D10"]}, {"d": "R", "ax": "x", "end": 142529.9, "sign": -1, "blk": ["*D8"]}, {"d": "T", "ax": "y", "end": -148578.2, "sign": -1, "blk": []}, {"d": "B", "ax": "y", "end": -152378.2, "sign": 1, "blk": []}]}, "tpl_10x20": {"bx0": 139680, "bx1": 140680, "by0": -151478, "by1": -149478, "ar": {"d4": [140179.9, -152978.2], "d1": [138179.9, -150483.2], "d2": [142179.9, -150483.2], "d3": [140179.9, -147978.2]}, "nk": [{"d": "L", "ax": "x", "end": 138179.9, "sign": 1, "blk": ["*D7"]}, {"d": "R", "ax": "x", "end": 142179.9, "sign": -1, "blk": ["*D9"]}, {"d": "T", "ax": "y", "end": -147978.2, "sign": -1, "blk": []}, {"d": "B", "ax": "y", "end": -152978.2, "sign": 1, "blk": []}]}, "tpl_20x10": {"bx0": 139180, "bx1": 141180, "by0": -150978, "by1": -149978, "ar": {"d2": [142679.9, -150478.2], "d4": [140184.9, -152478.2], "d3": [140184.9, -148478.2], "d1": [137679.9, -150478.2]}, "nk": [{"d": "L", "ax": "x", "end": 137679.9, "sign": 1, "blk": ["*D10"]}, {"d": "R", "ax": "x", "end": 142679.9, "sign": -1, "blk": ["*D7"]}, {"d": "T", "ax": "y", "end": -148478.2, "sign": -1, "blk": []}, {"d": "B", "ax": "y", "end": -152478.2, "sign": 1, "blk": []}]}};
function mnDxfPickTpl(rec){
  /* [988] 상하벽 실폭(topW)으로 직접 선택 — 템플릿 tpl_AxB: 바닥 A(가로,상하팔폭) x B(세로,좌우팔폭) → 편집기 mnWallRealW와 항상 일치 */
  var sp=rec.spec||{w:800,h:1700,dep:1100,orient:'세로'};
  var topW=mnWallRealW(rec,'p3');
  var map={450:'tpl_045x095',950:'tpl_095x045',700:'tpl_07x13',1300:'tpl_13x07',800:'tpl_08x17',1700:'tpl_17x08',1000:'tpl_10x20',2000:'tpl_20x10'};
  return {key:map[topW]||'tpl_17x08',dep:sp.dep||1100};
}
function mnDxfEnt(lines){return lines.join('\n')+'\n';}
function mnDxfCircle(h,x,y,r){return mnDxfEnt(['  0','CIRCLE','  5',h,'100','AcDbEntity','  8','pipe','100','AcDbCircle',' 10',x.toFixed(1),' 20',y.toFixed(1),' 30','0.0',' 40',r.toFixed(1)]);}
function mnDxfHatch(h,x,y,r){return mnDxfEnt(['  0','HATCH','  5',h,'100','AcDbEntity','  8','pipe','100','AcDbHatch',' 10','0.0',' 20','0.0',' 30','0.0','210','0.0','220','0.0','230','1.0','  2','SOLID',' 70','1',' 71','0',' 91','1',' 92','1',' 93','1',' 72','2',' 10',x.toFixed(1),' 20',y.toFixed(1),' 40',r.toFixed(1),' 50','0.0',' 51','360.0',' 73','1',' 97','0',' 75','1',' 76','1',' 47','1.0',' 98','1',' 10',x.toFixed(1),' 20',y.toFixed(1)]);}
function mnDxfText(h,x,y,txt,ht,rot){return mnDxfEnt(['  0','TEXT','  5',h,'100','AcDbEntity','  8','Attr','100','AcDbText',' 10',x.toFixed(1),' 20',y.toFixed(1),' 30','0.0',' 40',String(ht),'  1',txt,' 50',String(rot||0),'100','AcDbText']);}
function mnDxfTextC(h,cx,cy,txt,ht){return mnDxfEnt(['  0','TEXT','  5',h,'100','AcDbEntity','  8','Attr','100','AcDbText',' 10',cx.toFixed(1),' 20',cy.toFixed(1),' 30','0.0',' 40',String(ht),'  1',txt,' 50','0','  7','DIM',' 72','1',' 11',cx.toFixed(1),' 21',cy.toFixed(1),' 31','0.0','100','AcDbText',' 73','2']);}
/* ===== [BUILD 1017] 현장전자야장 DXF — 평면 맨홀도(샘플 규격) 생성 ===== */
/* 몸체=실측 벽폭, 팔=관 있는 방향만(1100+목320), 목 개구=766 기준, 내선=ANSI31 해치, 제외관=빨강, 뚜껑=rec.lid */
function mnEfbGen(rec){
  toast('현장전자야장 DXF 생성 중...');
  fetch('dxf/tpl_efb.dxf?v='+Date.now()).then(function(r){
    if(!r.ok)throw new Error('tpl');
    return r.text();
  }).then(function(x){
    x=x.split('{{MHNO}}').join(mnLabel(rec)||'');
    var hm=x.match(/\$HANDSEED\r?\n  5\r?\n([0-9A-Fa-f]+)/);
    var seed=hm?parseInt(hm[1],16):0x50000;
    function nh(){return (seed++).toString(16).toUpperCase();}
    var CX=524932, CY=677315;
    var bw=mnWallRealW(rec,'p3'), bh=mnWallRealW(rec,'p1');
    var x0=CX-bw/2,x1=CX+bw/2,y0=CY-bh/2,y1=CY+bh/2;
    var A=1100,N=320,out='';
    function fx(v){return (Math.round(v*10)/10).toFixed(1);}
    function eL(ly,ax,ay,bx,by,col){var a=['  0','LINE','  5',nh(),'330','2','100','AcDbEntity','  8',ly];if(col)a.push(' 62',String(col));a.push('100','AcDbLine',' 10',fx(ax),' 20',fx(ay),' 30','0.0',' 11',fx(bx),' 21',fx(by),' 31','0.0');return mnDxfEnt(a);}
    function ePL(ly,pts,closed,lt,col){var a=['  0','LWPOLYLINE','  5',nh(),'330','2','100','AcDbEntity','  8',ly];if(lt)a.push('  6',lt);if(col)a.push(' 62',String(col));a.push('100','AcDbPolyline',' 90',String(pts.length),' 70',closed?'1':'0',' 43','0.0');pts.forEach(function(p){a.push(' 10',fx(p[0]),' 20',fx(p[1]));if(p[2]!=null)a.push(' 42',String(p[2]));});return mnDxfEnt(a);}
    function eC(ly,cx,cy,r,col){var a=['  0','CIRCLE','  5',nh(),'330','2','100','AcDbEntity','  8',ly];if(col)a.push(' 62',String(col));a.push('100','AcDbCircle',' 10',fx(cx),' 20',fx(cy),' 30','0.0',' 40',fx(r));return mnDxfEnt(a);}
    function eTxt(cx,cy,txt,ht,rot,sty,ly){return mnDxfEnt(['  0','TEXT','  5',nh(),'330','2','100','AcDbEntity','  8',ly||'Attr','100','AcDbText',' 10',fx(cx),' 20',fx(cy),' 30','0.0',' 40',String(ht),'  1',txt,' 50',String(rot||0),'  7',sty||'DIM',' 72','1',' 11',fx(cx),' 21',fx(cy),' 31','0.0','100','AcDbText',' 73','2']);}
    function eOpen(ax,ay,rot){return mnDxfEnt(['  0','INSERT','  5',nh(),'330','2','100','AcDbEntity','  8','Dim','100','AcDbBlockReference','  2','_OPEN',' 10',fx(ax),' 20',fx(ay),' 30','0.0',' 41','50',' 42','50',' 43','50',' 50',String(rot)]);}
    function eArrow(ax,ay,sx,rot){return mnDxfEnt(['  0','INSERT','  5',nh(),'330','2','100','AcDbEntity','  8','arrow','100','AcDbBlockReference','  2','arrow',' 10',fx(ax),' 20',fx(ay),' 30','0.0',' 41',String(sx),' 42','0.5',' 43','1.0',' 50',String(rot)]);}
    function hatchTailA(sx,sy){return [' 75','0',' 76','1',' 52','90.0',' 41','1.0',' 77','0',' 78','1',' 53','135.0',' 43','0.0',' 44','0.0',' 45','-2.245064',' 46','-2.245064',' 79','0',' 98','1',' 10',sx,' 20',sy];}
    function eHatchCirc(cx,cy,r,solid,col){
      var a=['  0','HATCH','  5',nh(),'330','2','100','AcDbEntity','  8','Pipe'];if(col)a.push(' 62',String(col));
      a=a.concat(['100','AcDbHatch',' 10','0.0',' 20','0.0',' 30','0.0','210','0.0','220','0.0','230','1.0','  2',solid?'SOLID':'ANSI31',' 70',solid?'1':'0',' 71','0',' 91','1',' 92','1',' 93','1',' 72','2',' 10',fx(cx),' 20',fx(cy),' 40',fx(r),' 50','0.0',' 51','360.0',' 73','1',' 97','0']);
      a=a.concat(solid?[' 75','1',' 76','1',' 47','1.0',' 98','1',' 10',fx(cx),' 20',fx(cy)]:hatchTailA(fx(cx),fx(cy)));
      return mnDxfEnt(a);
    }
    function eHatchPoly(pts,solid,col){
      var a=['  0','HATCH','  5',nh(),'330','2','100','AcDbEntity','  8','Pipe'];if(col)a.push(' 62',String(col));
      a=a.concat(['100','AcDbHatch',' 10','0.0',' 20','0.0',' 30','0.0','210','0.0','220','0.0','230','1.0','  2',solid?'SOLID':'ANSI31',' 70',solid?'1':'0',' 71','0',' 91','1',' 92','1',' 93',String(pts.length)]);
      for(var i=0;i<pts.length;i++){var p=pts[i],q=pts[(i+1)%pts.length];a.push(' 72','1',' 10',fx(p[0]),' 20',fx(p[1]),' 11',fx(q[0]),' 21',fx(q[1]));}
      a.push(' 97','0');
      var scx=0,scy=0;pts.forEach(function(q){scx+=q[0];scy+=q[1];});scx=fx(scx/pts.length);scy=fx(scy/pts.length);
      a=a.concat(solid?[' 75','1',' 76','1',' 47','1.0',' 98','1',' 10',scx,' 20',scy]:hatchTailA(scx,scy));
      return mnDxfEnt(a);
    }
    /* ── 몸체 ── */
    out+=ePL('Con',[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],true);
    /* ── 뚜껑(DASHED2 원 + 지름 치수) ── */
    var lid=Math.min(parseFloat(rec.lid)||766, Math.min(bw,bh)-34), lr=lid/2;
    out+=ePL('mh',[[CX+lr,CY,1],[CX-lr,CY,1],[CX+lr,CY]],false,'DASHED2');
    out+=eL('mh',CX-lr,CY+10,CX-lr,CY+50)+eL('mh',CX+lr,CY+10,CX+lr,CY+50)+eL('mh',CX-lr+50,CY,CX+lr-50,CY);
    out+=eOpen(CX-lr,CY,180)+eOpen(CX+lr,CY,0)+eTxt(CX,CY+43,String(lid),50,0,'DIM','mh');
    /* ── 몸체 치수 (세로=우벽 안쪽, 가로=하벽 안쪽) ── */
    var dimIn=(x1-62)-(CX+lr)>=50; /* 안쪽 치수선이 뚜껑과 안 겹칠 때만 샘플식 안쪽 배치 */
    var xd=dimIn?(x1-62):(x1+62);
    if(dimIn)out+=eL('Dim',x1-10,y0,x1-112,y0)+eL('Dim',x1-10,y1,x1-112,y1);
    else out+=eL('Dim',x1+10,y0,x1+112,y0)+eL('Dim',x1+10,y1,x1+112,y1);
    out+=eL('Dim',xd,y0+50,xd,y1-50);
    out+=eOpen(xd,y0,270)+eOpen(xd,y1,90)+eTxt(xd-43,CY,String(Math.round(bh)),50,0,'DIM','Dim');
    var yd=y0+52;
    out+=eL('Dim',x1,y0+10,x1,y0+102)+eL('Dim',x0,y0+10,x0,y0+102)+eL('Dim',x0+50,yd,x1-50,yd);
    out+=eOpen(x1,yd,0)+eOpen(x0,yd,180)+eTxt(CX,yd+42,String(Math.round(bw)),50,0,'DIM','Dim');
    /* ── 방향별 팔·관·라벨 ── */
    var d=rec.dest||{};
    var dm={p1:'d1',p2:'d2',p3:'d3',p4:'d4'};
    function armXY(w,px,py){
      if(w==='p1')return [x0-py,y0+px];
      if(w==='p2')return [x1+py,y0+px];
      if(w==='p3')return [x0+px,y1+py];
      return [x0+px,y0-py];
    }
    function armDims(w){ /* 팔 치수 1100+320 — 좌우팔=하단(y0-107), 상하팔=우측(x1+107) */
      var o='';
      if(w==='p1'||w==='p2'){
        var s=(w==='p1'?-1:1), bx=(w==='p1'?x0:x1), ya=y0-107;
        var e1=bx+s*A, e2=bx+s*(A+N);
        o+=eL('Dim',bx,y0-10,bx,y0-157)+eL('Dim',e1,y0-10,e1,y0-157)+eL('Dim',e2,y0-10,e2,y0-157);
        o+=eL('Dim',bx+s*50,ya,e1-s*50,ya)+eOpen(bx,ya,s<0?0:180)+eOpen(e1,ya,s<0?180:0)+eTxt((bx+e1)/2,ya+43,'1100',50,0,'DIM','Dim');
        o+=eL('Dim',e1+s*50,ya,e2-s*50,ya)+eOpen(e1,ya,s<0?0:180)+eOpen(e2,ya,s<0?180:0)+eTxt((e1+e2)/2,ya+43,'320',50,0,'DIM','Dim');
      }else{
        var s2=(w==='p3'?1:-1), by=(w==='p3'?y1:y0), xa=x1+107;
        var f1=by+s2*A, f2=by+s2*(A+N);
        o+=eL('Dim',x1+10,by,x1+157,by)+eL('Dim',x1+10,f1,x1+157,f1)+eL('Dim',x1+10,f2,x1+157,f2);
        o+=eL('Dim',xa,by+s2*50,xa,f1-s2*50,0)+eOpen(xa,by,s2>0?270:90)+eOpen(xa,f1,s2>0?90:270)+eTxt(xa-43,(by+f1)/2,'1100',50,0,'DIM','Dim');
        o+=eL('Dim',xa,f1+s2*50,xa,f2-s2*50,0)+eOpen(xa,f1,s2>0?270:90)+eOpen(xa,f2,s2>0?90:270)+eTxt(xa-43,(f1+f2)/2,'320',50,0,'DIM','Dim');
      }
      return o;
    }
    function armWalls(w){ /* 팔 외벽 2체인: 목 개구 766 기준 si/flare */
      var armW=(w==='p1'||w==='p2')?bh:bw;
      var si=Math.max(17,armW/2-lr), fl=Math.max(41,armW/2-lr);
      var o='';
      if(w==='p1'||w==='p2'){
        var s=(w==='p1'?-1:1), bx=(w==='p1'?x0:x1);
        var e1=bx+s*A, e2=bx+s*(A+N);
        o+=ePL('Con',[[bx,y1],[e1,y1],[e1,y1-si],[e2,y1-si],[e2,y1-si+fl]],false);
        o+=ePL('Con',[[bx,y0],[e1,y0],[e1,y0+si],[e2,y0+si],[e2,y0+si-fl]],false);
      }else{
        var s2=(w==='p3'?1:-1), by=(w==='p3'?y1:y0);
        var f1=by+s2*A, f2=by+s2*(A+N);
        o+=ePL('Con',[[x0,by],[x0,f1],[x0+si,f1],[x0+si,f2],[x0+si-fl,f2]],false);
        o+=ePL('Con',[[x1,by],[x1,f1],[x1-si,f1],[x1-si,f2],[x1-si+fl,f2]],false);
      }
      return o;
    }
    function drawPipe(w,c){ /* 심볼: Ø50=삼각형, Ø120=사각형, 그외=원(실척) */
      var st=(c.st!=null?c.st:(c.fill?1:0));
      var p=armXY(w,c.x,c.y), px=p[0],py=p[1];
      var col=(st===2?1:0), o='';
      if(c.dia===50){
        var tri=[[px-21,py-14],[px,py+28],[px+21,py-14]];
        o+=ePL('Pipe',tri,true,null,col||null);
        if(st===1)o+=eHatchPoly(tri,false);
        if(st===2)o+=eHatchPoly(tri,true,1);
      }else if(c.dia===120){
        var sq=[[px-60,py-60],[px+60,py-60],[px+60,py+60],[px-60,py+60]];
        o+=ePL('Pipe',sq,true,null,col||null);
        if(st===1)o+=eHatchPoly(sq,false);
        if(st===2)o+=eHatchPoly(sq,true,1);
      }else{
        var r=c.dia/2;
        o+=eC('Pipe',px,py,r,col||null);
        if(st===1)o+=eHatchCirc(px,py,r,false);
        if(st===2)o+=eHatchCirc(px,py,r,true,1);
      }
      return o;
    }
    ['p1','p2','p3','p4'].forEach(function(w){
      out+=armWalls(w)+armDims(w); /* 팔·치수는 4방 항상 (샘플 규칙) */
      var dv2=d[dm[w]];
      if(dv2){
        if(w==='p1'){out+=eArrow(x0-A-N,CY,0.5,180)+eTxt(x0-A-N-182,CY,dv2,100,90,'DIM','Attr');}
        else if(w==='p2'){out+=eArrow(x1+A+N,CY,-0.5,180)+eTxt(x1+A+N+181,CY,dv2,100,270,'DIM','Attr');}
        else if(w==='p3'){out+=eArrow(CX,y1+A+N,0.5,90)+eTxt(CX,y1+A+N+182,dv2,100,0,'DIM','Attr');}
        else{out+=eArrow(CX,y0-A-N,0.5,270)+eTxt(CX,y0-A-N-182,dv2,100,0,'DIM','Attr');}
      }
      var pw=rec.pipes&&rec.pipes[w];if(!pw||!pw.groups)return;
      var all=[];pw.groups.forEach(function(gr){(gr.circles||[]).forEach(function(c){all.push(c);});});
      if(!all.length)return;
      var mnx=1e18,mxx=-1e18,mny=1e18,mxy=-1e18;
      all.forEach(function(c){
        out+=drawPipe(w,c);
        var p=armXY(w,c.x,c.y);
        mnx=Math.min(mnx,p[0]);mxx=Math.max(mxx,p[0]);mny=Math.min(mny,p[1]);mxy=Math.max(mxy,p[1]);
      });
      var ccx=(mnx+mxx)/2, ccy=(mny+mxy)/2;
      /* FCØ 라벨(관경별 X공수(내선수), 제외관은 공수 제외) + 지시 화살표 */
      var agg={};all.forEach(function(c){var st=(c.st!=null?c.st:(c.fill?1:0));if(st===2)return;if(!agg[c.dia])agg[c.dia]={n:0,f:0};agg[c.dia].n++;if(st===1)agg[c.dia].f++;});
      var dias=Object.keys(agg).map(Number).sort(function(a,b){return a-b;});
      if(dias.length){
        var tip,lsx,lst,lstep;
        if(w==='p1'){tip=[ccx-438,ccy+961];out+=eArrow(tip[0],tip[1],0.5,90);lst=[tip[0]-40,tip[1]+165];lstep=131;}
        else if(w==='p2'){tip=[ccx+399,ccy-865];out+=eArrow(tip[0],tip[1],-0.5,90);lst=[tip[0]+24,tip[1]-164];lstep=-131;}
        else if(w==='p3'){tip=[Math.max(ccx+865,x1+420),ccy+399];out+=eArrow(tip[0],tip[1],-0.5,180);lst=[tip[0]+320,tip[1]+164];lstep=131;}
        else{tip=[Math.max(ccx+865,x1+420),ccy-399];out+=eArrow(tip[0],tip[1],0.5,180);lst=[tip[0]+320,tip[1]-164];lstep=-131;}
        dias.forEach(function(dv,i){
          out+=eTxt(lst[0],lst[1]+lstep*i,'FC\u00d8'+dv+'X'+agg[dv].n+'('+agg[dv].f+')',100,0,'DIM','Attr');
        });
      }
    });
    var _hasPipe=false;['p1','p2','p3','p4'].forEach(function(w){var pw=rec.pipes&&rec.pipes[w];if(pw&&pw.groups&&pw.groups.some(function(g){return g.circles&&g.circles.length;}))_hasPipe=true;});
    if(!_hasPipe)toast('⚠ 관배치 없음 — 관·라벨 없이 출력 (벽면별 관배치 후 재생성 가능)');
    var CRLF=x.indexOf('\r\nENTITIES\r\n')>=0;
    var Q=CRLF?'\r\n':'\n';
    var ei=x.indexOf(Q+'ENTITIES'+Q);
    var end=x.indexOf(Q+'  0'+Q+'ENDSEC',ei);
    if(ei<0||end<0)throw new Error('sec');
    if(CRLF)out=out.replace(/\n/g,'\r\n');
    x=x.slice(0,end+Q.length)+out+x.slice(end+Q.length);
    if(hm)x=x.replace(/\$HANDSEED\r?\n  5\r?\n[0-9A-Fa-f]+/,'$HANDSEED'+Q+'  5'+Q+seed.toString(16).toUpperCase());
    var nm=(mnLabel(rec)||'맨홀').replace(/[\\/:*?"<>|]/g,'_');
    var blob=new Blob([x],{type:'application/dxf'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nm+'_전자야장.dxf';document.body.appendChild(a);a.click();
    setTimeout(function(){a.remove();URL.revokeObjectURL(a.href);},1000);
    toast('현장전자야장 '+nm+'_전자야장.dxf 다운로드');
  }).catch(function(e){console.error('mnEfbGen',e);toast('전자야장 생성 실패 — dxf/tpl_efb.dxf 배포 확인');});
}
function mnDxfGen(rec){
  var pick=mnDxfPickTpl(rec);
  var g=MN_DXF_GEO[pick.key];
  if(!g){toast('규격 템플릿 없음');return;}
  toast('맨홀도 DXF 생성 중...');
  fetch('dxf/'+pick.key+'.dxf').then(function(r){
    if(!r.ok)throw new Error('tpl');
    return r.text();
  }).then(function(x){
    var d=rec.dest||{},now=new Date();
    var ym=now.getFullYear()+'. '+(now.getMonth()+1<10?'0':'')+(now.getMonth()+1)+'.';
    /* [1013] 표제 현행번호 길면 텍스트 높이 자동 축소(칸 맞춤) */
    (function(){
      var lb=mnLabel(rec)||'';var ew=0;
      for(var ci=0;ci<lb.length;ci++){ew+=(lb.charCodeAt(ci)>0x2500?1:0.55);}
      if(ew>8){
        var nh2=Math.max(52,Math.round(150*8/ew));
        var mi=x.indexOf('{{MHNO}}');
        if(mi>=0){
          var hIdx=x.lastIndexOf('\n 40\n',mi);
          if(hIdx>=0&&mi-hIdx<200){
            var vEnd=x.indexOf('\n',hIdx+5);
            x=x.slice(0,hIdx+5)+String(nh2)+x.slice(vEnd);
          }
        }
      }
    })();
    x=x.split('{{MHNO}}').join(mnLabel(rec)||'');
    x=x.split('{{D1}}').join(d.d1||'');x=x.split('{{D2}}').join(d.d2||'');
    x=x.split('{{D3}}').join(d.d3||'');x=x.split('{{D4}}').join(d.d4||'');
    x=x.split('{{MAPNO}}').join(rec.mapNo||'');x=x.split('{{YM}}').join(ym);
    var hm=x.match(/\$HANDSEED\n  5\n([0-9A-Fa-f]+)/);
    var seed=hm?parseInt(hm[1],16):0x50000;
    function nh(){return (seed++).toString(16).toUpperCase();}
    function armXY(wall,px,py){
      if(wall==='p1')return [g.bx0-py, g.by0+px];
      if(wall==='p2')return [g.bx1+py, g.by0+px];
      if(wall==='p3')return [g.bx0+px, g.by1+py];
      return [g.bx0+px, g.by0-py];
    }
    /* [992] 완성본(1M_SKB) 규칙: 확대묶음 사분면 배치 + 그룹·관경별 라벨 줄바꿈(FCØ 접두) + 벽 연결 화살표 + dest 없는 방향화살표 제거 */
    function mnDxfIns(h,ax,ay,sx,sy,rot){return mnDxfEnt(['  0','INSERT','  5',h,'100','AcDbEntity','  8','arrow','100','AcDbBlockReference','  2','arrow',' 10',ax.toFixed(1),' 20',ay.toFixed(1),' 30','0.0',' 41',String(sx),' 42',String(sy),' 43','1.0',' 50',String(rot)]);}
    /* dest 없는 방향의 4방 화살표 INSERT 제거 */
    ['d1','d2','d3','d4'].forEach(function(dk){
      if(d[dk])return; var ap=g.ar&&g.ar[dk]; if(!ap)return;
      var idx=0;
      while((idx=x.indexOf('\n  0\nINSERT\n',idx))>=0){
        var nxt=x.indexOf('\n  0\n',idx+11); if(nxt<0)break;
        var chunk=x.slice(idx,nxt);
        var mx2=chunk.match(/\n 10\n([\-0-9.]+)\n 20\n([\-0-9.]+)/);
        if(mx2&&Math.abs(parseFloat(mx2[1])-ap[0])<2&&Math.abs(parseFloat(mx2[2])-ap[1])<2&&chunk.indexOf('\narrow\n')>=0){
          x=x.slice(0,idx)+x.slice(nxt);break;
        }
        idx=nxt;
      }
    });
    /* [997] 토피 실측 변형: 목 구간(기본 400) 지오메트리·치수를 실측 토피로 — 팔 끝 좌표 이동 + 치수블록 '400'→실측 */
    var topiM=Math.round((parseFloat(rec.topi)||0)*1000);
    if(topiM>0&&topiM!==400&&g.nk){
      var L=x.split('\n');
      /* 치수 캐시블록·DIMENSION 청크 인덱스 범위 수집 */
      function findBlk(nm){
        for(var i=0;i<L.length-1;i+=2){
          if(L[i].trim()==='2'&&L[i+1]===nm){
            /* BLOCK 정의 헤더인지 확인(코드2가 BLOCK 시작 8라인 이내) — ENTITIES의 블록참조(그룹2)와 구분 */
            var isDef=false;
            for(var b=i-2;b>=Math.max(0,i-60);b-=2){if(L[b].trim()==='0'){isDef=(L[b+1]==='BLOCK');break;}}
            if(!isDef)continue;
            var s0=i;while(s0>0&&!(L[s0].trim()==='0'&&L[s0+1]==='BLOCK'))s0-=2;
            var e0=i;while(e0<L.length-1&&!(L[e0].trim()==='0'&&L[e0+1]==='ENDBLK'))e0+=2;
            return [s0,e0];
          }
        }
        return null;
      }
      g.nk.forEach(function(nk){
        var dx=(400-topiM)*nk.sign;
        var xc=(nk.ax==='x'),codes=xc?{'10':1,'11':1,'13':1,'14':1}:{'20':1,'21':1,'23':1,'24':1};
        var end=nk.end,e50=end+50*nk.sign,e200=end+200*nk.sign;
        var rng=[];(nk.blk||[]).forEach(function(bn){var r=findBlk(bn);if(r)rng.push(r);});
        function inBlk(i){for(var k=0;k<rng.length;k++)if(i>=rng[k][0]&&i<=rng[k][1])return true;return false;}
        for(var i=0;i<L.length-1;i+=2){
          var cd=L[i].trim();
          if(codes[cd]){
            var v=parseFloat(L[i+1]);
            if(isFinite(v)){
              if(Math.abs(v-end)<1.5)L[i+1]=(v+dx).toFixed(4);
              else if(inBlk(i)&&Math.abs(v-e50)<1.5)L[i+1]=(v+dx).toFixed(4);
              else if(Math.abs(v-e200)<1.5&&(inBlk(i)||cd==='11'||cd==='21'))L[i+1]=(v+dx/2).toFixed(4);
            }
          }else if(cd==='1'&&L[i+1]==='\\A1;400'&&inBlk(i)){
            L[i+1]='\\A1;'+topiM;
          }
        }
      });
      x=L.join('\n');
    }
    var out='';
    var slots={
      p1:{sx:g.bx0-650,sy:g.by1+1050,lab:'L',ar:'down'},
      p2:{sx:g.bx1+850,sy:g.by0-900,lab:'R',ar:'up'},
      p3:{sx:g.bx1+950,sy:g.by1+950,lab:'R',ar:'left'},
      p4:{sx:g.bx0-650,sy:g.by0-1050,lab:'R',ar:'right'}
    };
    ['p1','p2','p3','p4'].forEach(function(wall){
      var pw=rec.pipes&&rec.pipes[wall];if(!pw||!pw.groups)return;
      var _sp=rec.spec||{w:800,h:1700,dep:1100};
      var _W=mnWallRealW(rec,wall),_H=_sp.dep||1100;
      if(!pw.bw||!pw.bh){pw.bw=Math.max(_sp.w||800,_sp.h||1700);pw.bh=_sp.dep||1100;}
      if(pw.bw!==_W||pw.bh!==_H){
        var _fx=_W/pw.bw,_fy=_H/pw.bh;
        pw.groups.forEach(function(gg){(gg.circles||[]).forEach(function(cc){cc.x=Math.round(cc.x*_fx);cc.y=Math.round(cc.y*_fy);});});
        pw.bw=_W;pw.bh=_H;try{mnPersistRec(rec);}catch(_e){}
      }
      var all=[];pw.groups.forEach(function(gr){(gr.circles||[]).forEach(function(c){var st=(c.st!=null?c.st:(c.fill?1:0));if(st===2)return;all.push({x:c.x,y:c.y,dia:c.dia,st:st});});});
      if(!all.length)return;
      /* 실척 */
      all.forEach(function(c){
        var p=armXY(wall,c.x,c.y);
        out+=mnDxfCircle(nh(),p[0],p[1],c.dia/2);
        if(c.st===1)out+=mnDxfHatch(nh(),p[0],p[1],c.dia/2);
      });
      /* [993] 확대(2배) — armXY 회전 그대로(전개도 팔 방향과 일치, 완성본 방식) */
      var mx=0,my=0;all.forEach(function(c){mx+=c.x;my+=c.y;});mx/=all.length;my/=all.length;
      var pcArm=armXY(wall,mx,my);
      var sl=slots[wall];
      var minX=1e18,maxX=-1e18,minY=1e18,maxY=-1e18;
      var gInfo=[]; /* 그룹별 확대 y중심(라벨 줄 순서용) */
      pw.groups.forEach(function(gr){
        var gys=0,gn=0;
        (gr.circles||[]).forEach(function(c){
          var st=(c.st!=null?c.st:(c.fill?1:0));if(st===2)return;
          var pp=armXY(wall,c.x,c.y);
          var ex=sl.sx+(pp[0]-pcArm[0])*2, ey=sl.sy+(pp[1]-pcArm[1])*2;
          out+=mnDxfCircle(nh(),ex,ey,c.dia);
          if(st===1)out+=mnDxfHatch(nh(),ex,ey,c.dia);
          if(ex-c.dia<minX)minX=ex-c.dia; if(ex+c.dia>maxX)maxX=ex+c.dia;
          if(ey-c.dia<minY)minY=ey-c.dia; if(ey+c.dia>maxY)maxY=ey+c.dia;
          gys+=ey;gn++;
        });
        if(gn){
          var lb=(typeof mnGroupLabel==='function')?mnGroupLabel(gr):'';
          if(lb){
            var kind=lb.split('\u00d8')[0]||'';
            var ls=[];lb.split(' ').forEach(function(tk){if(!tk)return;ls.push(tk.indexOf('\u00d8')>=0?tk:(kind+'\u00d8'+tk));});
            gInfo.push({cy:gys/gn,lines:ls});
          }
        }
      });
      /* [993] 라벨: DIM 스타일·중앙정렬, 완성본 간격(묶음끝+220+폭/2), 줄간격 131, 위쪽 그룹 먼저 */
      gInfo.sort(function(a,b){return b.cy-a.cy;});
      var lines=[];gInfo.forEach(function(gi){gi.lines.forEach(function(L){lines.push(L);});});
      var cymL=(minY+maxY)/2;
      lines.forEach(function(L,i){
        var half=L.length*39.5;
        var lcx=(sl.lab==='L')?(minX-220-half):(maxX+220+half);
        var lcy=cymL+((lines.length-1)/2-i)*131;
        out+=mnDxfTextC(nh(),lcx,lcy,L,100);
      });
      /* 확대묶음↔벽 연결 화살표 (완성본 arrow 블록 방식) */
      var cxm=(minX+maxX)/2, cym=(minY+maxY)/2;
      if(sl.ar==='down')out+=mnDxfIns(nh(),cxm,minY-200,0.5,0.5,90);
      else if(sl.ar==='up')out+=mnDxfIns(nh(),cxm,maxY+200,-0.5,0.5,90);
      else if(sl.ar==='left')out+=mnDxfIns(nh(),minX-200,cym,0.5,0.5,180);
      else out+=mnDxfIns(nh(),maxX+200,cym,-0.5,0.5,180);
    });
    var ei=x.indexOf('\nENTITIES\n');
    var end=x.indexOf('\n  0\nENDSEC',ei);
    if(ei<0||end<0)throw new Error('sec');
    x=x.slice(0,end+1)+out+x.slice(end+1);
    if(hm)x=x.replace(/\$HANDSEED\n  5\n[0-9A-Fa-f]+/,'$HANDSEED\n  5\n'+seed.toString(16).toUpperCase());
    var nm2=(mnLabel(rec)||'맨홀').replace(/[\\/:*?"<>|]/g,'_');
    var blob=new Blob([x],{type:'application/dxf'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nm2+'.dxf';document.body.appendChild(a);a.click();
    setTimeout(function(){a.remove();URL.revokeObjectURL(a.href);},1000);
    toast('맨홀도 '+nm2+'.dxf 다운로드');
  }).catch(function(e){console.error('mnDxfGen',e);toast('DXF 생성 실패 — dxf 폴더 배포 확인');});
}
/* [BUILD 982] 맨홀설비사진 엑셀 — 샘플 양식 템플릿 내장(base64), 마커 치환 + 사진 5장 삽입 */
var MN_XLS_TPL='UEsDBBQAAAAIAPww81ymMMMgdgEAALAFAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK1UyW7CMBC9V+o/RL4iYuihqioChy7HFgn6ASaeJC6JbXmG7e87CYsqBEQILnGSeZvHy2C0rspoCQGNs4noxz0RgU2dNjZPxM/0s/siIiRltSqdhURsAMVo+PgwmG48YMRsi4koiPyrlJgWUCmMnQfLlcyFShF/hlx6lc5VDvKp13uWqbMElrpUa4jh4B0ytSgp+ljz722SmbEietviaqtEKO9LkyrislxafWTSdVlmUtAuXVRMidEHUBoLAKrK2AfDSmECRDwxFPKk56+H/MjUVHXopnCaE6DE64LuOhEzs8FgYTx2GHDGoa6cN9jxvnkJg9EQjVWgL1UxSq5LuXJhPnNuHl8WubadzRhXythOu38DRtkM/TsHOei35CDel7B93h6hkWkxRNqUgPdueyPa5lyoAHpCod7od1/3f9otOXRQqxq2f7m97zuhS76MHQfnkW+YANcb7o9mze56FoJA5nLHD44sffMMoT71GvQJb9nct8M/UEsDBBQAAAAIAPww81y1VTAj6wAAAEwCAAALAAAAX3JlbHMvLnJlbHOtks1qwzAMgO+DvYPRvVHawRijTi9j0NsY2QNotvJDEsvYbpe+/bzD2AJd6WFHy9KnT0Lb3TyN6sgh9uI0rIsSFDsjtnethrf6efUAKiZylkZxrOHEEXbV7c32lUdKuSh2vY8qU1zU0KXkHxGj6XiiWIhnl38aCROl/AwtejIDtYybsrzH8JsB1YKp9lZD2Ns7UPXJ8zVsaZre8JOYw8QunWmBPCd2lu3Kh1wfUp+nUTWFlpMGK+YlhyOS90VGA5432lxv9Pe0OHEiS4nQSODLPl8Zl4TW/7miZcaPzTzih4ThXWT4dsHFDVSfUEsDBBQAAAAIAPww81wGU1PC9QIAAK0GAAAPAAAAeGwvd29ya2Jvb2sueG1srZTPaxNBFMfvgv/DOPS63R/Z/FqalDZNsaASbG0uhTLZnWSH7s6ss7NNSulF8CyCIEIVvHlQ1ILgwb/I5I/wzSabNG0PtTokM/N2sp/35r3vy9r6KI7QMZUpE7yB7VULI8p9ETA+aOBne9tGDaNUER6QSHDawCc0xevN+/fWhkIe9YQ4QgDgaQOHSiWeaaZ+SGOSroqEcjjpCxkTBaYcmGkiKQnSkFIVR6ZjWRUzJozjKcGTt2GIfp/5dEv4WUy5mkIkjYiC8NOQJWlBi/3b4GIij7LE8EWcAKLHIqZOcihGse/tDLiQpBfBtUd2GY0kfCrwtS2YnMITHF1zFTNfilT01SqgZ0Ffu79tmba9lILR9RzcjuRCEo6ZruECVbkjqzJnVRYw2/pnmm0tcM4daeU5zcHNtT6L6P5UuogkyRMS60pFGEUkVe2AKRo0cBVMMaSLB3ArmSWbGYvAcNySU8Fmcy7njkSgfjpl7YUs7c4OMApon2SR2oOAC7fQMY7rTAkgmI1IUcmJoi3BFejzP2kxZ7dCASlBT+nzjEma5pKEE5iJ75Fe2iEqRJmMGrjtHUwuvoy//jqwrMPJh9eTty8PJu9/Ti7O0fjFp/Grd79/fEbjb9/HF2/GH88PLumYXA/0L5RMfJ0Gcx7rdH81JxCy9IoqdpREsN/ZegQV2yXHkHNQSTBr7x0oUO3wtFS1W6WN+rZRdmo1w61vlYyaW9s06vVWZbNda7dK5fYZ1r3p+YJkKpwVRzMb2K3ecPSYjIoT2/IyFiz8n1qzYdwwFeNM31SrYp/RYbpQjzbRqMt4IIYNbNgO3OZk2RzmVpcFKgT51S13/uwhZYMQIrbLVf1D6BId2ZWItqbBbMPIp6WIzEsh5dUpVsRzPe/qvQ1/6HrV2YW99LQPuRPYOaF4DcTOOA10HyxbM9ThKOLxakcyrg43QA26y3wS7RZkCzen3h6sbKzY3kp3xa2umZc4zSULfMDbvu4+WDSg7pRtJw+pSG7zD1BLAwQUAAAACAD8MPNcgT6Ul+wAAAC6AgAAGgAAAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzrVLLasMwELwX+g9i77XstJRSIucSCrm27gcIaW2Z2JLQbh/++6oNbRwIoQeflhmxM6PdXW8+x0G8Y6I+eAVVUYJAb4LtfafgtXm6eQBBrL3VQ/CoYEKCTX19tX7GQXNuItdHElnFkwLHHB+lJONw1FSEiD6/tCGNmjNMnYza7HWHclWW9zLNNaA+0RQ7qyDt7C2IZor4H+3Qtr3BbTBvI3o+YyGJpyF/QDQ6dcgKDrjIOiDP26+WtOfci0f3H3ggq0sZqiUzfIS0J4fIxxx/VB7Qd7kY5m7RfTid0L5wyuc2X8uc/g0jTy6u/gJQSwMEFAAAAAgA/DDzXG5OSaAOEAAAB2sAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWyd3Vtz2kgWwPH3rdrv4PL72EgtrhVny2PJ0f1+qXkkNo6pscELJJlLzXdfAWoQ+ovE2tQkcX463S31aRp8RoYP//nj9eXi22y1ni8XN5fKVe/yYrZ4WD7OF19uLrP0/pfR5cV6M108Tl+Wi9nN5Z+z9eV/Pv77Xx++L1e/r59ns81F2cNifXP5vNm8Ta6v1w/Ps9fp+mr5NluUR56Wq9fppvzn6sv1+m01mz7uGr2+XKu93uD6dTpfXO57mKze08fy6Wn+MNOXD19fZ4vNvpPV7GW6Kc9//Tx/W8veXh/e093rdPX717dfHpavb2UXn+cv882fu04vL14fJtaXxXI1/fxSXvcfijZ9uPhjVf6nlr+FHGbnGOl1/rBarpdPm6uy5+qcefnj6/H19OHQE6//Xd0oWjkB3+bbBB67Uv/PvvqHvtRjZ+L/7Gxw6Gw7XavJ1/njzeXfverXL+Vv5Rf51f4P+eufy48fdh2Fq4tyMc786WuZg2QryuX1xw+P8zL7244vVrOnm8tbZfKbNtwe2DXK57Pv69rXF5vp52T2MnvYzMoTUC4v/louX5OH6Tavo37tn/52Zbw0cDeqO/1z+XXXWdlBr3yQbJf/5+Xy9y1ZZa+97Rnvxtie1bT869vsbvZSdvabUo64/u/uRLdfl2d5fTi1+tfylO9367O88sfZ0/TryyZefjdn8y/Pm3JocdXfdvCwfFnv/rx4nS92l/Q6/WP39/f54+b55rLfvxqNBkNlNCwv5eHrerN8LfZHlKr9vqVatVQPLZWr4XAoNPGThqJqKDoPqVUtta5D9quG/UPD0fsaDqqGg0ND9arf1wY/O9Nh1W54aNe7Ggy03kD9cbtR1W7Ucbxx1W5cmxn1p/Op9GT2ex3HUw7rRuk2olw1itp1RLlsFNFtRLloFK3riHLVKP1uI8pFo3RdNYpcNsqw24hy2SijjutNkQtHra+Adz00VLkE1OMSEO9setg7xDtHvd5vW7tNTp9uph8/rJbfL1a7fWv9Nt2+iFAm22vdbnX93pUiOzlsf+Um+7BtcLttUW4h5fWWvC7528feh+tv2zGqkF8PIdeV3EF0iAG5h3yCmBALYkMciAvxID4kgISQCBJDEkgKySA5pKjLdZniQ57VljzvntLO5lnddTWqpVlppHkfoRyzzCbqaRN9H6Eek17BsNZGnLa5r4bZh8wXL/PFLNmsytB5uaI3H//+Ow5u9X/++XC9KVtt7dD0U9X0OJ4JsSA2xIG4EA/iQwJICIkqGR2Xy17EcbWczMh+0rTTSUvRbwbJIUV97JPlIzovH7Hv6rg2fxXN5YIQXTSu1BByeRz2hKrR+LgnVHJsZUIsiA1xIC7Eg/iQABJCouq6antC89ITXGiKbjJIDinqQ53kVOucU616fB9SqjVO+q4ZoTcjDI0P+H7jAa/97AHv3YZ+0P6I1/CIh1gQG+JAXIgH8SEBJIREGh7xzVlLqllTzk6JLlrnI9031LTjmoHkkKIaTmDN9Duvmf6uq+Mq/rXfXDPNCL0ZYfSxC/SxC/SxC0AsiA1xIC7Eg/iQABJCoj52gealJ3vQxPnEK+2Jr0bTao+zwenjLKtC+seVUMnguBKq8dXz46vN8U8WzKDzghk0F8yguWCaEXozwhhwkxk2NpnBTzcZ89weM8AeA7EgNsSBuBAP4kMCSAiJBthjmpOWDORSOzzhVDKovwZszGO2jxm0vXLLq/b9evvRaUwxkAusudUMO6+cYXPlDJsrpxmhNyOMIbaaIbaaIbYaiAWxIQ7EhXgQHxJAQkg0xFbTvPRkiPwPZf4PTx5Vx8cXcfkQW8bwXEZHnTM6amZ01MxoM0JvRhgj7gXjxl4w+tmz662ux+17QdW0thdALIgNcSAuxIP4kAASQqJR7dl9vxb2csxqMsJaGGEtjLAWRlgLo3NrYdx5LYyba2HcXAvNCL0ZYYzx6K7k+NrnUyXHZ0UTYkFsiANxIR7EhwSQEBJVcpz4eNzM6BgZHSOj49pe3viGMh8jt+Nzud1WQzsmd9fkJLuV1NKLGB0xRiUnj3alUZ66r4KGbbWrT9VBRa330PgOxayC+m1lEes9PdgnPTSqJM57enBPemg883rv6cE/6aGR7+A9PYQnPTQORrKH2msOJCyppL4uZbv6S9fGq4ZMxtReu0qqrVDZecsSbat7/mSJKliiCpZoM0ZHjFFJfROq6CifKqm/xqioda4txts/incY7/4o3mO8/6P4gPHhj+IjOSn1Imlz5hIZpJ3/ZkRr/2aoaln/NpiUkwo55IArqHtFVVGxgpqlvTvE6IgxKtGU2goCfSKZJItkkxySS/JIPikghaSIFJMSUkrKSDmpOKHTVLdWP7Ur9Ue5Fsh1s8J3hxgdMUYl6ri+DavNJ7SqWf1/lIBMkkWySQ7JJXkknxSQQlJEikkJKSVlpJxUSDouiN8UUZ/zY/HkdG10r6IqGpYG6qiI0RFjSDm+sr+XJGoLAWSSLJJNckguySP5pIAUkiJSTEpIKSkj5aRCksZtoHvxU0H1U0H5EzE6Ygwp/Vqqq+LhqJZqkEmySDbJIbkkj+STAlJIikgxKSGlpIyUkwo5qy1P7t3LlgrqlgoKl4jREWNIqad6wFSDTJJFskkOySV5JJ8UkEJSRIpJCSklZaScVMhZbUn1SZ1RvCvVKDQqqDQiRkeMIaWe6iFTDTJJFskmOSSX5JF8UkAKSREpJiWklJSRclIhZ7Ul1aPuqUYFUkEJEjE6Ygwp9VSPmGqQSbJINskhuSSP5JMCUkiKSDEpIaWkjJSTCjmrLaked081CowKKoyI0RFjSKmnesxUg0ySRbJJDskleSSfFJBCUkSKSQkpJWWknFTIWWWq1V7nVKuoNqqoNiJGR4whpZbqiuqpJpkki2STHJJL8kg+KSCFpIgUkxJSSspIOamQs9qSaqV7qlG1U1G1Q4yOGENKPdUKUw0ySRbJJjkkl+SRfFJACkkRKSYlpJSUkXJSIWe1JdVq91SjvKaivIYYHTGGlHqqVaYaZJIskk1ySC7JI/mkgBSSIlJMSkgpKSPlpELOakuqRfdU8+5CFeU1BukIMqTUky2YbJBJskg2ySG5JI/kkwJSSIpIMSkhpaSMlJMKOastyda6J7u6P66Wa9TLKtFqqUa9TEo91RpTDTJJFskmOSSX5JF8UkAKSREpJiWklJSRclIhZ7Ul1f3uqW5Wvn6F3EF0iCGlnmrWy0gmySLZJIfkkjySTwpIISkixaSElJIyUk4q5Ky2pHrQPdX7iszJzxfgBwyqQk4t+S2tRPNnDFBTU1lTU1lTI5kki2STHJJL8kg+KSCFpIgUkxJSSspIOalQz9bU1O41NXXIZ3QU1RikI8hQWVVTWVUjmSSLZJMckkvySD4pIIWkiBSTElJKykg5qVDPVtXU7lU1dVQ9io+5RlUNMTpiDJVVNZVVNZJJskg2ySG5JI/kkwJSSIpIMSkhpaSMlJMK9WxVTe1eVVNRVVNRVUOMjhhDSu2uGUn1VINMkkWySQ7JJXkknxSQQlJEikkJKSVlpJxUSBoj1aK1qvbjex4EymoCZTXE6IgxBGpC96RPJJNkkWySQ3JJHsknBaSQFJFiUkJKSRkpJxUndJrr1rLaT3KNuppAXQ0xOmKMSk7vb2nci3gvm9XubyGZJItkkxySS/JIPikghaSIFJMSUkrKSDmpkMS7m0T3SptApU2g0oYYHTGGlNodLJJqd7CQTJJFskkOySV5JJ8UkEJSRIpJCSklZaScVEjiHSyie6VN4D42gUIbYnTEGFJqL9UE62wkk2SRbJJDckkeyScFpJAUkWJSQkpJGSknFXJW+VJNdK+zCdyXJlBnQ4yOGEOwziZYZyOZJItkkxySS/JIPikghaSIFJMSUkrKSDmpEGfrbKJ7nU3gvjSBOhtidMQYUuqpZp2NZJIskk1ySC7JI/mkgBSSIlJMSkgpKSPlpELOakuqu9fZBO5LE7gvDTE6YgzBGppgDY1kkiySTXJILskj+aSAFJIiUkxKSCkpI+WkQpytoYnuNTSB+9IESmiI0RFjCFbQBCtoJJNkkWySQ3JJHsknBaSQFJFiUkJKSRkpJxXibAVNdK+gCdyXJlBBQ4yOGEOwgiZYQSOZJItkkxySS/JIPikghaSIFJMSUkrKSDmpEGcraKJ7BU2ggiZQQUOMjhhDSj3VvC+NZJIskk1ySC7JI/mkgBSSIlJMSkgpKSPlpELOKlOtdb8vTUMBTUMBDTE6YgwptVRrLKCRTJJFskkOySV5JJ8UkEJSRIpJCSklZaScVMhZbUl19/vSNNTPNNTPEKMjxpBSTzXvSyOZJItkkxySS/JIPikghaSIFJMSUkrKSDmpkLPakuru1TIN1TIN1TLE6IgxpNRTzfvSSCbJItkkh+SSPJJPCkghKSLFpISUkjJSTirkrLakunu1TEO1TEO1DDE6Ygwp9VSzWkYySRbJJjkkl+SRfFJACkkRKSYlpJSUkXJSIWe1JdXdq2UaqmUa3w0P1TLEGBqrZRqrZSSTZJFskkNySR7JJwWkkBSRYlJCSkkZKScV2tlqmda9WqahWqahWoYYHTGGlHqqWS0jmSSLZJMckkvySD4pIIWkiBSTElJKykg5qZCz2pLq7tUyDdUyDdUyxOiIMTRWyzRWy0gmySLZJIfkkjySTwpIISkixaSElJIyUk4qtLPVMq17tUzjHWcaymUM0hFkSKndmyKpnmyQSbJINskhuSSP5JMCUkiKSDEpIaWkjJSTCkm1e1Oua+9f/jpbfdl9zMP64mH5dbHZfRdW4+rjKdTB5Hb/VjuNI3flkbvWI0V/UuwT3jjwSelNPu3f76xxxCuPeK1Hkv4kae0sUZRJ0dokH0zycYtb5SBWawtDmxj9tjG0SaG1eDqYpG0jBOUIQfsIStmV2tYm7U/ytrFv1dHkVmuf+dHkrvWIIXqTQrTNliHK2RKtZybUSdHa2+12glvPbHIrWs9rctfmhjox2jwpB27ze3UStfajlA3278mJI2JSKG1tbrXJrdo6iDaJ2qbdGE2MtjRFZWqj1tTel0fuW4/caZO71sGz4SQbtbhTduW0dpWWR/LWx8H9YBK1Ze9+NInaLsQoezLa1+hgYux6uj7uDR8/vD0vF7PN/CFcXTwtF5vtB8Zs39Lsz7fZzeViebdcVJ/AtG34tpovNsHb7gONLp6Xq/lfZYvpy91ssZmtqg+wKcPL3k5x23T6ZeZNV1/mZcuX2dNm+wESQ23UE4o2HvQG6nisbt9PZrV/Fmo9tlm+bY+MR5raV8aDUb8nxmLYK1/Jfl5uyqewMwefZ9PH2Wp7sK8oI0XpqWKgqj1tuP2Jq6flcnPuYHXWyWzz9e3ibfo2WyXzv2a7m+vLSy8vb/fJTjeXL9PF4/qhPF6e/mT7OUIr63F3zfuR73dDXExf5l8WxXzzXM3C9nN5ypjH1fT7fPHl2HL/XmyHj7D6+D9QSwMEFAAAAAgA/DDzXJfr5VCABgAAHiIAABMAAAB4bC90aGVtZS90aGVtZTEueG1s7Vpbb9s2FH4fsP9A6L2VL1LqBHWK2LGbtUkTJG6HPtIyLTGmRIGkk/ptaDFgwIYBw7phLwP21odhW4EW2Ev3a7J12Lqhf2FHki+iTaVOm93QOIAtUt+58Nx4ROXqtXshQ0dESMqjulW+XLIQiTzeo5Fft2532pdqFpIKRz3MeETq1ohI69r6u+9cxWsqICFBQB/JNVy3AqXiNduWHkxjeZnHJIJ7fS5CrGAofLsn8DHwDZldKZVW7BDTyEIRDoHtbr9PPYL+/PCTF48+stYn3FsMviIlkwmPiQMvFZknSbG9QTn5kSPZZAIdYVa3QFCPH3fIPWUhhqWCG3WrlH4se/2qPSViqoA2R9dOP2O6MUFvUEnphN+dEpbbzuqVzSn/SsZ/EddqtZqt8pRfCsCeBystL2Cddq3cmPDMgbLLRd7NkltydHyOf3UBv9poNNxVDV+d4Z0FfK204mxUNLwzw7uL+jc2ms0VDe/O8CsL+PaV1RVHx6eggNFosIBO/Dn1zBTS52zLCK8BvDYJgBnKzkVXRh+polgL8SEXbQCkzsWKRkiNYtLHHuCaOOwKii0U44hLmChVSu1SFb6TPye9chLxeI3gHF025cmFqUQTJD1BY1W3bgBXKwd5+ey7l8+eoJfPHp/cf3py/8eTBw9O7v9gINzCkZ8nfPHosz++/gD9/uSbFw+/MONlHv/L9x///NPnZqDKA59/+fjXp4+ff/Xpb98+NMA3BO7m4R0aEolukWO0z0NYm0EA6YqzUXQCTDUKHADSAGypQAPeGmFmwjWIbrw7AsqDCXh9eKjpehCIoaIG4M0g1IA7nLMGF8bl3Exk5ZczjHyzcDHM4/YxPjLJbs65tjWMIc6piWUzIJqaewy8jX0SEYWSe3xAiIHsLqWaXXeoJ7jkfYXuUtTA1GiSDu0qM9EWDcEvI5OC4GrNNjt3UIMzE/tNcqQjISEwM7EkTDPjdTxUODRqjEOWR25jFZiUPBgJTzO4VOBpnzCOWj0ipYlmV4w0dW9iqFNGt++wUagjhaIDE3Ibc55HbvJBM8BhbNSZRkEe+54cQIhitMeVUQmuZ0gyBj/gqNDddyhRZ0vr29QPzAGS3BkKU0oQrufjiPUxMTHfEKFWWDeghpuiozH0tdDeJoThY9wjBN1+z4TnMTcrfSOAqrJFTLa5gfVYTcYRkQSlzYzBsVRqIXtAfF6gz85orvCMcBRiUcT51kAPmRbsbcZSusu8gVZKqUiS1qzErgzxUlz3AqyFVTKW5ngdieisOQY0h69BQ85MA4V9adt0MCPmgOlgirZN5RZIhmaSJJ1SsqGRrq8n7cwN9lyTE9LotI6HUaCc63jci47H3PEUVZb5PqcI9z/sbjbxMNojsKFcNDcXzc3b2NwU5fJFS3PR0ly0NP9YSzPrYuz8CU/KJSw87ulTxg7UiJFtmfY/EnK/14bJdJASTU+X4gAux+I0nC9weo0EV+9TFRwEOAYx5VSCL8esfYliLqGDsgp5Jzeg/1LZnDs5zQQ0Vju8l01X86ecUzbpyJd5QdWEwbLCqlfeTFg5Ay4preyapbmnSrNz1oRNBeHkELu8UslEQ5xALPYSu2cMJm45dxfJAAro2Edl40LK1SXNVnu11XLSVqtvJm0ZJ+XFOQXi3HPwUmnBS/ZiOrJIH6Fj0MqtuBbycFy3+vC4ApdhDPxkUhww86O65anxUl6ZzPMLNodluVS4YE1ELKTaxDLIqNJbk5cA0Uz/iuskdjifBRiq0XJaVGvlf1ELe961pN8nniqYmQ3H9/hQEXEQ9I5Rlw3FPga9nSy6elTCTlGZDARkqDMOPD3zx1kw/7JhnB2YxQEe16RazvcZPL2e6pCOcurZBbq/5lKq57gU9+1dShK58PRX7aXnEtAGCIySGK1bXKiAQxWKA+q1BTQOqSzQC0FaJCohlrw7TXQlR7O6lfHIipwfqH3qI0Gh0qlAELKnxut8BbNyJb+/ThiN68xUXRlnv11yRFgnyd6VZP0WCibVZGyIFDfvNNuUXV2//R/ufJyCzuf09mAmyDlLL+Lkin5uK1h9MxXOuNVWzCuuuEtvtTE8w6PkCwo3FR6b9bcdvg/eR9OOEkEgXqqN02862QWda7nFJaz+3jZq5oJagb/Ps/nMGbtaYOzTxb2+sV2Drd3TTW0vpqide5BJRwv/QsG7hyB7Ex6PhkzJ7FD2HjzvNScvv4GPPSNd/wtQSwMEFAAAAAgA/DDzXFaOrDnEBAAA2jIAAA0AAAB4bC9zdHlsZXMueG1s3VvLbuM2FN0X6D8I2jt6WFIsw/ZgHMfAAFO0aFygW1qibHYo0qDoQJ6iwABddlEU6Kw6y35AF931kyb5h5KSH3JSNbYj21Q2FnlFnnvu5etSJjuv0hhrt5AliJKubl2YugZJQENEJl39u9Gw0dK1hAMSAkwJ7OoLmOivel9+0Un4AsObKYRcExAk6epTzmdtw0iCKYxBckFnkIg3EWUx4CLLJkYyYxCEiawUY8M2Tc+IASJ6jtCOg11AYsDezWeNgMYzwNEYYcQXGZauxUH7zYRQBsZYUE0tBwRaannM1lK2UpJJH+mJUcBoQiN+IXANGkUogI/p+oZvgGCDJJAPQ7Jcw7S3bE/ZgUiOweAtks2n9zoRJTzRAjonXDSmuZT0Osl77RZgIbJ0o9chIIZ5/vOvv9z98UHKIhAjvMilTSkIpoAlonHzerYvZUaOlv+OhWBubLBtszrsFWarWrprNzjVU7Uy8wOKKdMQCWEKw0f87z9+uvvn789//X7/88eH2qz9rTiCw6vE3OJqHwm3wg5dLWb2SEQdhPF6SDb1XNDriLmLQ0aGIqMt06PFTMxaREyzOUxW7onSEwYWlu3uXiGhGIWSxeRqu6tm3McPpV42UowC3FpR9hAGjikLxfqxnnU8fSXrdTCMuKjP0GQqn5zOpBLKuZjQep0QgQklAEsNqxrlNbVsxenqfIrkVBf8J1FRbqVgp/J50aep7AQmCy4p71Q+K3mQbTs478iM92nHU1F5yS1+VtsOG4BHH+F7KKjfeDSO2LdLpuSj6KjlYFZgxTlRz1XAzYeEBBWvVsuEiGYCiPGNxP4+2oQ0QkMaaWQeD2P+RuCLTbKM7lZJEQctkzlMnul1AEYTEkPC5Qabo0AGiYHIQpbRSyPxU9SXay8odi4P0qyl0R4UdsC3S/A1MJvhhYwKcyc9Q5uzszaaN8m27jz3eqX/IZ0pZei9qCgJ/TBPOIoW+gk8sgerJYX9SbWe57hnNZpbotvap9H6WbVTucs7WT8rpaglU4bIuxEdIr7c9x/mZVtdNzdLONeQcrN+lB11KfsvZ/xdquvl0iljLzcrwvmMvbmqrlLD3m259Xe7V7/e3qofZb9+lC2FI1QFO/MLWDGrMuGM47MqE844XitbnM4Yx1RmwxnnoKpsOGOM8BTly/OHYodSVHljX8q5hpQV3tmXcVY4oi2jrPA2uYyywkF4aWdW+JtPKecaLh8Kb3ZK3azwR59SzgqvJ5b6kYUC36EOpXjGRVnjMOXfUg54fhi6ZVYWKKtjlV+dUTXawJT97fcSvnKq9IFck6fTEZl8vVKyddBhfcYhO/Gwdb5iLdXkwduufv/bp7s/PxQMG88R5ojkOaN4ckJghunm0ET2lssrANtaBEYIIzDHfLR+2dU36a9giOaxvy71DbqlfFlqk34rz5RYntQhhtXbhGdPbc5QV//xun/pD66HdqNl9lsNpwndhu/2Bw3XueoPBkPftM2rnwoXEZ5xDSG7OyD6iuW0EyxKsaWxS/I3G1lXL2Ry+pn/BO0id9/2zNeuZTaGTdNqOB5oNVpe020MXcseeE7/2h26Be7ugdcVTMOyNuTdNkcxxIjAbfqjolQ0ksj+jxHGqiWMzaWU3r9QSwMEFAAAAAgA/DDzXEjH3QP5AQAAMAgAABQAAAB4bC9zaGFyZWRTdHJpbmdzLnhtbK2VQWvUQBTH74LfYZiTgnaSVERLkh4KBRGhYP0A0+xsE0gmcWZ2cT3VEktLC+tarbu44laFLbKCLhXag19mjzuz38FJdhXEWyeXQF7e+71/8ub9464+S2LQJIxHKfWgvWRBQGiQ1iK67cEnm+u370HABaY1HKeUeLBFOFz1r19zORdA11LuwVCIbAUhHoQkwXwpzQjVT+opS7DQt2wb8YwRXOMhISKJkWNZd1GCIwpBkDao8KCjuzRo9LRB1haBO9B3eeS7wpfDs1lvB6j8i7zMgdodqWHuIuG7WagViSjYYKCeUvGgpssgEK1My6TpWkoXrwWR76KC9S9vkE/Hv0xAfxT1c3XZNVLUzoE87QP59aWRnvLTAHU+Ut0XJiAb2ZZlmRAmex3zEcnx/qx7YSbj2KR8dnKgBm+nP0fq3TejwZx01H5XfjwwgpRjXZw2MOl8qhI2qBL2uUrYqQnslkFxYW4rPMOBztLuxQlrEuiDqxPZ/ES+KgmIlQG2oS/8OWjiWJuvVeSzdU2cB2T7UL3fKYJ1nERxax5dLgJBiBknizzbuV92Kml6ff92uLpO5z+VW6h6pZO912Za9Xn5cKHG/el5R++oOtQeunsm2z29s0AOj4qta/eMnOj7Dzl+o83ZBOIsP7rx+OHmTSOGXQHDMWEg/cf3fwNQSwMEFAAAAAgA/DDzXH/yb6nHAwAAeBsAABgAAAB4bC9kcmF3aW5ncy9kcmF3aW5nMS54bWztmVmO2zYYx98L5A6C3jniKpLG2IG1MAgQtIOiPYBC07EQbaA0HgdBrtMrtA89UXuJUpY1k3FmMHWz1DH85I+L+C1/6geRvny+KQtvbWyb19XURxfQ90yl60VevZn6v/6igPC9tsuqRVbUlZn670zrP589++Fys7CTmzaxnlugaieuOfVXXddMgqDVK1Nm7UXdmMqNLmtbZp1r2jfBwmY3bumyCDCEYdA21mSLdmVMlwwj/m697D+sVmZ55c+2kXU3dWyKYl7pVW2HrqWty8HSdTHDl8Fojn0/LZczeNvdt7Yjtr6ZkaG7N8e+j2bvWkPjzk1X37kjB7nDB/gbvTS5HoxqfZXrq13S+sf1lfXyxdTnvldlpVPwr9//+Pu3P73QVSqbmE33qu12lndt86n/XikcsVRRoJwFKIwoiFIqgcJEpJirGJPwQ/80Cifa6de5rfNyMeqGwk+UK3Nt67Zedhe6LoN6ucy1GbVzyiE6KLcN8/0cpkIwwoCSBAGKSAoEVBCQmIcJRiFjFH3wA5f9Nubxd5tFcJvyXfZDLbK+Pq9q/bYNPpo2jAWfVO11kTcqL4r+ud7e5favdviQXlLr69JU3bAxrSm2VWpXedP6np2Y8rVxydqXC+R72r1fnROmsXnVPaoKFnMIJY5AzGDsVOEpmEvKAYcpp5AKFKN4UIVOrlvjcs2KpMlvZaEHywJ3sqyzYurDx0o+VKiPte2s6fSqN5eueD8b3Q3P3A4E94vbt9pmkGeztGX/68LwNlOfSkooZ773bupLjhjb+h/qoftxLhHsx7WbQCgRDLNdhONKjW27F6Yuvd5wtXbhbIubrV3gw9Rxyi6yIZbg3tuki9zJmGRdNm6cB9DyJG3gt6UN+t9pI/doI46UNlCqkCjBAVFhBGhCGRACcUAVmmOaYCg4PSHa4DNtHqINPBXO0INefPTZoMEHftfIL08ahPZQg+CRsmZOcEpxTIGUQgIqVQQiGjEQx7HgnKRz2Xs/GdaQM2seYo0UIpRsIA52FuPsPnKIFIj2E3rkYE6JK/TJIIegb4wcyr8Ccsg+cvCRIkfRlPIIKpBE7kRFRSSAIAgBySV0/t0bjOQJIYeekfMUcpiAkOPvGzmHnabwAQT4Esepr0Ictk8ceqTEISLiIQsxIBGdA5omCAiOCUBMCBKlCFOoTog47Eycxw9UDEom9j9v9k5UVEB2zKw57J7481lzBF83+zfF6FiviiVLiEpwCpiSyh2oGHbeSQLUXEUpT915XqUnxJrwzJqnroqPnDjbvv5Ps9k/UEsDBBQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAeGwvbWVkaWEvaW1hZ2UxLmpwZWf7f+P/AwYBLzdPNwZGRgYGRiBk+H+bwZmBg42NnY2Vg52dnZOTg4tHhJeHm5tHUkiYX0RWSl5OVkpGRkFFT11BSUdZRkbDXFPHwNDExERe3dLWwshGz9jECGQIIycnJw83jwQvr4SRooyiEcng/wEGQQ4GFgYWZkYlBiZBRmZBxv9HGOSB7mRlBAMGKGBkYmZhZWPn4OTiBirYKsDAxMjMzMTCzMrKwgKUrQXKM7AIsgopGjqyCQcmsisVihg1TlzIoey08aBo0MUPKsZJRU2cXGLiEpJSqmrqGppaJqZm5haWVs4urm7uHp5ewSGhYeERkVHJKalp6RmZWcUlpWXlFZVVzS2tbe0dnV2TJk+ZOm36jJmzFi1esnTZ8hUrV23avGXrtu07du46dPjI0WPHT5w8denylavXrt+4eevho8dPnj57/uLlq4+fPn/5+u37j5+/QP5iZGBmhAGs/hIE+ouJhYWZhR3kL0amcpACQRZWRUM2IcdA9sRCYSWjRg4Rp4kLNx7kVDYO+iCaVHSRS0zF5KHqR5DXwD4jzmNNZPkM7jGEv24x8DAzAiOPWZDBnuH7L41FDfb/bwIAUEsDBBQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAeGwvbWVkaWEvaW1hZ2UyLmpwZWf7f+P/AwYBLzdPNwZGRgYGRiBk+H+bwZmBg42NnY2Vg52dnZOTg4tHhJeHm5tHUkiYX0RWSl5OVkpGRkFFT11BSUdZRkbDXFPHwNDExERe3dLWwshGz9jECGQIIycnJw83jwQvr4SRooyiEcng/wEGQQ4GFgYWZkYlBiZBRmZBxv9HGOSB7mRlBAMGKGBkYmZhZWPn4OTiBirYKsDAxMjMzMTCzMrKwgKUrQXKM7AIsgopGjqyCQcmsisVihg1TlzIoey08aBo0MUPKsZJRU2cXGLiEpJSqmrqGppaJqZm5haWVs4urm7uHp5ewSGhYeERkVHJKalp6RmZWcUlpWXlFZVVzS2tbe0dnV2TJk+ZOm36jJmzFi1esnTZ8hUrV23avGXrtu07du46dPjI0WPHT5w8denylavXrt+4eevho8dPnj57/uLlq4+fPn/5+u37j5+/QP5iZGBmhAGs/hIE+ouJhYWZhR3kL0amcpACQRZWRUM2IcdA9sRCYSWjRg4Rp4kLNx7kVDYO+iCaVHSRS0zF5KHqR5DXwD4jzmNNZPkM7jGEv24x8DAzAiOPWZDBnuH7L41FDfb/bwIAUEsDBBQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAeGwvbWVkaWEvaW1hZ2UzLmpwZWf7f+P/AwYBLzdPNwZGRgYGRiBk+H+bwZmBg42NnY2Vg52dnZOTg4tHhJeHm5tHUkiYX0RWSl5OVkpGRkFFT11BSUdZRkbDXFPHwNDExERe3dLWwshGz9jECGQIIycnJw83jwQvr4SRooyiEcng/wEGQQ4GFgYWZkYlBiZBRmZBxv9HGOSB7mRlBAMGKGBkYmZhZWPn4OTiBirYKsDAxMjMzMTCzMrKwgKUrQXKM7AIsgopGjqyCQcmsisVihg1TlzIoey08aBo0MUPKsZJRU2cXGLiEpJSqmrqGppaJqZm5haWVs4urm7uHp5ewSGhYeERkVHJKalp6RmZWcUlpWXlFZVVzS2tbe0dnV2TJk+ZOm36jJmzFi1esnTZ8hUrV23avGXrtu07du46dPjI0WPHT5w8denylavXrt+4eevho8dPnj57/uLlq4+fPn/5+u37j5+/QP5iZGBmhAGs/hIE+ouJhYWZhR3kL0amcpACQRZWRUM2IcdA9sRCYSWjRg4Rp4kLNx7kVDYO+iCaVHSRS0zF5KHqR5DXwD4jzmNNZPkM7jGEv24x8DAzAiOPWZDBnuH7L41FDfb/bwIAUEsDBBQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAeGwvbWVkaWEvaW1hZ2U0LmpwZWf7f+P/AwYBLzdPNwZGRgYGRiBk+H+bwZmBg42NnY2Vg52dnZOTg4tHhJeHm5tHUkiYX0RWSl5OVkpGRkFFT11BSUdZRkbDXFPHwNDExERe3dLWwshGz9jECGQIIycnJw83jwQvr4SRooyiEcng/wEGQQ4GFgYWZkYlBiZBRmZBxv9HGOSB7mRlBAMGKGBkYmZhZWPn4OTiBirYKsDAxMjMzMTCzMrKwgKUrQXKM7AIsgopGjqyCQcmsisVihg1TlzIoey08aBo0MUPKsZJRU2cXGLiEpJSqmrqGppaJqZm5haWVs4urm7uHp5ewSGhYeERkVHJKalp6RmZWcUlpWXlFZVVzS2tbe0dnV2TJk+ZOm36jJmzFi1esnTZ8hUrV23avGXrtu07du46dPjI0WPHT5w8denylavXrt+4eevho8dPnj57/uLlq4+fPn/5+u37j5+/QP5iZGBmhAGs/hIE+ouJhYWZhR3kL0amcpACQRZWRUM2IcdA9sRCYSWjRg4Rp4kLNx7kVDYO+iCaVHSRS0zF5KHqR5DXwD4jzmNNZPkM7jGEv24x8DAzAiOPWZDBnuH7L41FDfb/bwIAUEsDBBQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAeGwvbWVkaWEvaW1hZ2U1LmpwZWf7f+P/AwYBLzdPNwZGRgYGRiBk+H+bwZmBg42NnY2Vg52dnZOTg4tHhJeHm5tHUkiYX0RWSl5OVkpGRkFFT11BSUdZRkbDXFPHwNDExERe3dLWwshGz9jECGQIIycnJw83jwQvr4SRooyiEcng/wEGQQ4GFgYWZkYlBiZBRmZBxv9HGOSB7mRlBAMGKGBkYmZhZWPn4OTiBirYKsDAxMjMzMTCzMrKwgKUrQXKM7AIsgopGjqyCQcmsisVihg1TlzIoey08aBo0MUPKsZJRU2cXGLiEpJSqmrqGppaJqZm5haWVs4urm7uHp5ewSGhYeERkVHJKalp6RmZWcUlpWXlFZVVzS2tbe0dnV2TJk+ZOm36jJmzFi1esnTZ8hUrV23avGXrtu07du46dPjI0WPHT5w8denylavXrt+4eevho8dPnj57/uLlq4+fPn/5+u37j5+/QP5iZGBmhAGs/hIE+ouJhYWZhR3kL0amcpACQRZWRUM2IcdA9sRCYSWjRg4Rp4kLNx7kVDYO+iCaVHSRS0zF5KHqR5DXwD4jzmNNZPkM7jGEv24x8DAzAiOPWZDBnuH7L41FDfb/bwIAUEsDBBQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAeGwvbWVkaWEvaW1hZ2U2LmpwZWf7f+P/AwYBLzdPNwZGRgYGRiBk+H+bwZmBg42NnY2Vg52dnZOTg4tHhJeHm5tHUkiYX0RWSl5OVkpGRkFFT11BSUdZRkbDXFPHwNDExERe3dLWwshGz9jECGQIIycnJw83jwQvr4SRooyiEcng/wEGQQ4GFgYWZkYlBiZBRmZBxv9HGOSB7mRlBAMGKGBkYmZhZWPn4OTiBirYKsDAxMjMzMTCzMrKwgKUrQXKM7AIsgopGjqyCQcmsisVihg1TlzIoey08aBo0MUPKsZJRU2cXGLiEpJSqmrqGppaJqZm5haWVs4urm7uHp5ewSGhYeERkVHJKalp6RmZWcUlpWXlFZVVzS2tbe0dnV2TJk+ZOm36jJmzFi1esnTZ8hUrV23avGXrtu07du46dPjI0WPHT5w8denylavXrt+4eevho8dPnj57/uLlq4+fPn/5+u37j5+/QP5iZGBmhAGs/hIE+ouJhYWZhR3kL0amcpACQRZWRUM2IcdA9sRCYSWjRg4Rp4kLNx7kVDYO+iCaVHSRS0zF5KHqR5DXwD4jzmNNZPkM7jGEv24x8DAzAiOPWZDBnuH7L41FDfb/bwIAUEsDBBQAAAAIAPww81w5MbWR0gAAANABAAAjAAAAeGwvd29ya3NoZWV0cy9fcmVscy9zaGVldDEueG1sLnJlbHOtkbFOAzEMhnck3iHyTnLXASHUXBeE1LWUBwiJ7y7qnRM5LtC3Jx1AXNWBgdH+5c+f5fXmc57UO3KJiSy0ugGF5FOINFh43T/fPYAq4ii4KRFaOGGBTXd7s97h5KQOlTHmoiqFioVRJD8aU/yIsys6ZaSa9IlnJ7XkwWTnD25As2qae8O/GdAtmGobLPA2rEDtTxn/wk59Hz0+JX+ckeTKChPYfdTLKtLxgGJB6+/eT9jqigVz3ab9T5vMkQT5BUXOAguri+yybvVbpLOkWfyh+wJQSwMEFAAAAAgA/DDzXOkzVqjbAAAAzQMAACMAAAB4bC9kcmF3aW5ncy9fcmVscy9kcmF3aW5nMS54bWwucmVsc73TzWoDIRDA8Xug7yBzr+5ukiWEuLmUQK4lfQDRWdd2/UBtaN6+QqE0EJaePKrMf34XD8cvO5MrxmS849DSBgg66ZVxmsPb5fS8A5KycErM3iGHGyY4Dk+rwyvOIpehNJmQSKm4xGHKOewZS3JCKxL1AV15GX20Ipdj1CwI+SE0sq5pehb/NmC4a5Kz4hDPag3kcgv4n7YfRyPxxctPiy4/WMGMLbtLUESNmQOlzKIy4ud+Td8DamCPHV01R7foaKs52kVHX83RLzq21RzbRcemmmPz62B3n3D4BlBLAwQUAAAACAD8MPNcvFBUZZQAAACUCgAAJwAAAHhsL3ByaW50ZXJTZXR0aW5ncy9wcmludGVyU2V0dGluZ3MxLmJpbvNgSGTIY0hmyGfIZVBgCGBwYXBjIAUwsjAz3mHYwem/n5GBiYGDYRZ3hgBQFCjz5z8TkI5gAqlyZDAmyVQCdhKprprBksGJwQxotxuDOYMBgyGDLtAlZkDaDMgyAcpaAkmQGIjlCGS5AtUbM1gAVRsCRcyBbGOguCFDLRVdPwroBTwoTNujYBSMglEwCkbBKKAfAABQSwMEFAAAAAgA/DDzXM5jLaBUAQAAjgIAABEAAABkb2NQcm9wcy9jb3JlLnhtbH2SXUvDMBSG7wX/Q8l9l5Pu09B2oLIrBwMnyu5CcrYV27Qk0W7/3rRbu4lDyE1ynvPkzSHx/FDkwTcam5U6IWwAJEAtS5XpXULe1otwRgLrhFYiLzUm5IiWzNP7u1hWXJYGV6as0LgMbeBN2nJZJWTvXMUptXKPhbADT2hf3JamEM5vzY5WQn6KHdIIYEILdEIJJ2gjDKveSM5KJXtl9WXyVqAkxRwL1M5SNmD0wjo0hb3Z0FauyCJzxwpvol2xpw8268G6rgf1sEV9fkY/li+v7VPDTDezkkjSWEkuDQpXmtTuGcAopldHzfhyYd3ST3qboXo8pqqO6d/TDlyZTDtUaQRsGMI0hOEaphzGfAybvq+D4vMUTtehCnx6fnprV3kfPj2vF8T74CH0i83WABwmHKabJumv/ouwOCf71xhNmoTMJxxxiHjEroydIG1D//5B6Q9QSwMEFAAAAAgA/DDzXLLRr+DMAQAArQMAABAAAABkb2NQcm9wcy9hcHAueG1spVOxbtRAEO2R+AezfW59IYrQab1RdAGlAHHSXdJGy3p8XmHvWrsT644KpFRAQQEVh5QqaagQBQV/dM4/sPZhx0kQBXQz857evpmdYXuLPAtKsE4ZHZHhICQBaGlipecROZo92XpEAodCxyIzGiKyBEf2+P17bGJNARYVuMBLaBeRFLEYUepkCrlwAw9rjyTG5gJ9aufUJImScGDkaQ4a6XYY7lJYIOgY4q2iEyQbxVGJ/yoaG1n7c8ezZeH1ONsvikxJgb5L/kxJa5xJMHi8kJAx2geZF5qCPLUKlzxktJ+yqRQZjL0wT0TmgNHrAjsEUQ9tIpR1nJU4KkGisYFTr/zYdkjwQjio7USkFFYJjWRD2yRNnBUOLa8+v79687V6t7p6+4PRrtyEfXY/Vjt82BB88Ffi7ye+fF9fnAXV5evq/NP6wypYf/tYrc7+/zXaNe7jmyOZKczAPU8mwuIfJrTdn1DjgfQMT1MAHPb93YIeTKzSeLJvQdzpovVzy8HY5IXQS16tztcXPxltc/ZU6ZfuqJiZA4HQfvXNIpumwkLst6Nbha7ADn0PNqv541ToOcQt5y5QL+bx5vr4cHcQPgzDZh/bGqPXd8Z/AVBLAQIUAxQAAAAIAPww81ymMMMgdgEAALAFAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgA/DDzXLVVMCPrAAAATAIAAAsAAAAAAAAAAAAAAIABpwEAAF9yZWxzLy5yZWxzUEsBAhQDFAAAAAgA/DDzXAZTU8L1AgAArQYAAA8AAAAAAAAAAAAAAIABuwIAAHhsL3dvcmtib29rLnhtbFBLAQIUAxQAAAAIAPww81yBPpSX7AAAALoCAAAaAAAAAAAAAAAAAACAAd0FAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc1BLAQIUAxQAAAAIAPww81xuTkmgDhAAAAdrAAAYAAAAAAAAAAAAAACAAQEHAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwECFAMUAAAACAD8MPNcl+vlUIAGAAAeIgAAEwAAAAAAAAAAAAAAgAFFFwAAeGwvdGhlbWUvdGhlbWUxLnhtbFBLAQIUAxQAAAAIAPww81xWjqw5xAQAANoyAAANAAAAAAAAAAAAAACAAfYdAAB4bC9zdHlsZXMueG1sUEsBAhQDFAAAAAgA/DDzXEjH3QP5AQAAMAgAABQAAAAAAAAAAAAAAIAB5SIAAHhsL3NoYXJlZFN0cmluZ3MueG1sUEsBAhQDFAAAAAgA/DDzXH/yb6nHAwAAeBsAABgAAAAAAAAAAAAAAIABECUAAHhsL2RyYXdpbmdzL2RyYXdpbmcxLnhtbFBLAQIUAxQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAAAAAAAAAAACAAQ0pAAB4bC9tZWRpYS9pbWFnZTEuanBlZ1BLAQIUAxQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAAAAAAAAAAACAAfwqAAB4bC9tZWRpYS9pbWFnZTIuanBlZ1BLAQIUAxQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAAAAAAAAAAACAAessAAB4bC9tZWRpYS9pbWFnZTMuanBlZ1BLAQIUAxQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAAAAAAAAAAACAAdouAAB4bC9tZWRpYS9pbWFnZTQuanBlZ1BLAQIUAxQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAAAAAAAAAAACAAckwAAB4bC9tZWRpYS9pbWFnZTUuanBlZ1BLAQIUAxQAAAAIAPww81xm9Jq/vQEAAHcCAAAUAAAAAAAAAAAAAACAAbgyAAB4bC9tZWRpYS9pbWFnZTYuanBlZ1BLAQIUAxQAAAAIAPww81w5MbWR0gAAANABAAAjAAAAAAAAAAAAAACAAac0AAB4bC93b3Jrc2hlZXRzL19yZWxzL3NoZWV0MS54bWwucmVsc1BLAQIUAxQAAAAIAPww81zpM1ao2wAAAM0DAAAjAAAAAAAAAAAAAACAAbo1AAB4bC9kcmF3aW5ncy9fcmVscy9kcmF3aW5nMS54bWwucmVsc1BLAQIUAxQAAAAIAPww81y8UFRllAAAAJQKAAAnAAAAAAAAAAAAAACAAdY2AAB4bC9wcmludGVyU2V0dGluZ3MvcHJpbnRlclNldHRpbmdzMS5iaW5QSwECFAMUAAAACAD8MPNczmMtoFQBAACOAgAAEQAAAAAAAAAAAAAAgAGvNwAAZG9jUHJvcHMvY29yZS54bWxQSwECFAMUAAAACAD8MPNcstGv4MwBAACtAwAAEAAAAAAAAAAAAAAAgAEyOQAAZG9jUHJvcHMvYXBwLnhtbFBLBQYAAAAAFAAUAEkFAAAsOwAAAAA=';
function mnXmlEsc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
/* [1013] 도로명·행정구역이 비어있고 GPS가 있으면 카카오 즉석 조회 (과거 촬영분 대응, 4초 타임아웃) */
function mnEnsureAddr(rec){
  return new Promise(function(res){
    if((rec.addr&&rec.road)||!(rec.geo&&rec.geo.lat)){res();return;}
    var done=false;function fin(){if(!done){done=true;res();}}
    setTimeout(fin,4000);
    try{
      kakaoReady(function(){
        try{
          if(!(window.kakao&&kakao.maps&&kakao.maps.services&&kakao.maps.services.Geocoder)){fin();return;}
          new kakao.maps.services.Geocoder().coord2Address(rec.geo.lng,rec.geo.lat,function(r,st){
            if(st===kakao.maps.services.Status.OK&&r&&r[0]){
              var ad=r[0].address,rd=r[0].road_address;
              if(ad&&!rec.addr)rec.addr=(ad.region_1depth_name||'')+' '+(ad.region_2depth_name||'')+' '+(ad.region_3depth_name||'');
              if(rd&&rd.road_name&&!rec.road)rec.road=rd.road_name;
              try{mnPersistRec(rec);}catch(e){}
            }
            fin();
          });
        }catch(e){fin();}
      });
    }catch(e){fin();}
  });
}
function mnEquipXls(rec){
  if(typeof JSZip==='undefined'){toast('압축 모듈 없음 — 새로고침(Ctrl+Shift+R)');return;}
  toast('설비사진 엑셀 생성 중...');
  mnEnsureAddr(rec).then(function(){
  return JSZip.loadAsync(MN_XLS_TPL,{base64:true}).then(function(zip){
    return zip.file('xl/worksheets/sheet1.xml').async('string').then(function(x){
      var dest=rec.dest||{};
      x=x.replace('{{ROAD}}',mnXmlEsc(rec.road||''))
         .replace('{{MAPNO}}',mnXmlEsc(rec.mapNo||''))
         .replace('{{MHNO}}',mnXmlEsc(mnLabel(rec)||''))
         .replace('{{ADDR}}',mnXmlEsc(rec.addr||''))
         .replace('{{D1}}',mnXmlEsc(dest.d1||''))
         .replace('{{D2}}',mnXmlEsc(dest.d2||''))
         .replace('{{D3}}',mnXmlEsc(dest.d3||''))
         .replace('{{D4}}',mnXmlEsc(dest.d4||''));
      zip.file('xl/worksheets/sheet1.xml',x);
      /* 사진: image2=전경 image3=① image4=② image5=③ image6=④ (image1=설비위치, 추후) */
      var ph=rec.photos||{};
      var mapImg=[['fr','xl/media/image2.jpeg'],['p1','xl/media/image3.jpeg'],['p2','xl/media/image4.jpeg'],['p3','xl/media/image5.jpeg'],['p4','xl/media/image6.jpeg']];
      return Promise.all(mapImg.map(function(m){
        if(!ph[m[0]])return null;
        return fetch(ph[m[0]]).then(function(r){return r.blob();}).then(function(b){return mnFixOrient(b);}).then(function(fx){zip.file(m[1],fx.blob);}).catch(function(){});
      })).then(function(){return zip;});
    });
  }).then(function(zip){
    return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }).then(function(blob){
    var nm=(mnLabel(rec)||'맨홀').replace(/[\\/:*?"<>|]/g,'_').trim()||'맨홀';
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nm+'.xlsx';document.body.appendChild(a);a.click();
    setTimeout(function(){a.remove();URL.revokeObjectURL(a.href);},1000);
    toast('📄 '+nm+'.xlsx 다운로드');
  }).catch(function(e){console.error('mnEquipXls',e);toast('엑셀 생성 실패');});
  });
}
function mnPhotoZip(rec){
  if(typeof JSZip==='undefined'){toast('압축 모듈 없음 — 새로고침(Ctrl+Shift+R)');return;}
  var ph=rec.photos||{};
  /* 표찰=표찰 / 전경=1 / 서·동·북·남 = 2-번호(파란박스 벽번호). 사진 있으면 체크여부 무관 포함 */
  var map=[['bd','표찰'],['fr','1'],['p1','2-1'],['p2','2-2'],['p3','2-3'],['p4','2-4']];
  var jobs=[];map.forEach(function(m){if(ph[m[0]])jobs.push({name:m[1],url:ph[m[0]]});});
  if(!jobs.length){toast('저장된 사진이 없습니다');return;}
  var zip=new JSZip();toast('사진 압축 중...');
  Promise.all(jobs.map(function(j){
    return fetch(j.url).then(function(r){return r.blob();}).then(function(b){return mnFixOrient(b);}).then(function(fx){zip.file(j.name+'.jpg',fx.blob);}).catch(function(){});
  })).then(function(){
    var nm=(mnLabel(rec)||'맨홀').replace(/[\\/:*?"<>|]/g,'_').trim()||'맨홀';
    zip.generateAsync({type:'blob'}).then(function(blob){
      var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nm+'.zip';document.body.appendChild(a);a.click();setTimeout(function(){a.remove();URL.revokeObjectURL(a.href);},1000);
      toast('📦 '+jobs.length+'장 → '+nm+'.zip');
    }).catch(function(){toast('압축 실패');});
  });
}
function mnOpenForm(rec){
  var isNew=!rec;
  if(isNew)rec={id:'mn'+Date.now(),no:'',owner:'LG',ownerC:'',dep:'',w12:'',w34:'',topi:'',lid:766,lidRect:'',spec:null,photos:{},pipes:{},at:new Date().toISOString()};
  var mob=(typeof isMobileDevice==='function'&&isMobileDevice());
  var host=mnHostOpen();
  var old=document.getElementById('mnFormModal');if(old)old.remove();
  var wrap=null;
  var inner='<div style="background:#fff;'+(host?'width:100%;height:100%;border-radius:0':(mob?'width:100vw;height:100dvh;border-radius:0':'border-radius:14px;width:min(96vw,540px);max-height:95dvh'))+';display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:9px 14px 7px;border-bottom:1px solid #f2f2f0;display:flex;align-items:center;flex:none"><b style="font-size:15.5px;white-space:nowrap">맨홀 조사야장</b><button id="mnFTrash" style="border:1px solid #b58900;background:#fdf6e3;color:#8a6d00;border-radius:9px;padding:7px 11px;margin-left:10px;cursor:pointer;font-weight:800;font-size:12px">🗑 삭제목록</button><span style="flex:1"></span><button id="mnFClose" style="border:1.5px solid #d32f2f;background:#fff;color:#d32f2f;border-radius:9px;padding:8px 20px;cursor:pointer;font-size:14.5px;font-weight:800">닫기</button></div>'
    +'<div style="padding:7px 12px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:4px;flex:none;flex-wrap:nowrap;overflow-x:auto"><button id="mnDxfBtn" style="flex:1;text-align:center;display:flex;align-items:center;justify-content:center;border:1px solid #c0392b;background:#fdeaea;color:#c0392b;border-radius:8px;padding:6px 2px;cursor:pointer;font-weight:700;font-size:11px;white-space:nowrap">📐 맨홀도DXF</button><button id="mnEqXls" style="flex:1;text-align:center;display:flex;align-items:center;justify-content:center;border:1px solid #1d9e75;background:#e1f5ee;color:#0f6e56;border-radius:8px;padding:6px 2px;cursor:pointer;font-weight:700;font-size:11px;white-space:nowrap">📄 설비사진엑셀</button><button id="mnPhotoDl" style="flex:1;text-align:center;display:flex;align-items:center;justify-content:center;border:1px solid #2471a3;background:#eef6fc;color:#2471a3;border-radius:8px;padding:6px 2px;cursor:pointer;font-weight:700;font-size:11px;white-space:nowrap">📥 맨홀사진다운</button><button id="mnEfb" style="flex:1;text-align:center;display:flex;align-items:center;justify-content:center;border:1px solid #8e44ad;background:#f4ecf9;color:#8e44ad;border-radius:8px;padding:6px 2px;cursor:pointer;font-weight:700;font-size:11px;white-space:nowrap">🖋 현장전자야장</button></div>'
    +'<div id="mnSheetBox" style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch;background:#f4f4f2"></div>'
    +'<div style="display:flex;gap:8px;padding:10px 14px;border-top:1px solid #eee;flex:none">'
    +'<button id="mnSave" style="flex:1;background:#fff;color:#d32f2f;border:1.5px solid #d32f2f;border-radius:10px;padding:12px;font-weight:800;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">저장</span></button>'
    +'<button id="mnBack" style="flex:1;background:#fff;color:#1d9e75;border:1.5px solid #1d9e75;border-radius:10px;padding:12px;font-weight:800;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:2px;margin-right:-2px">목록보기</span></button>'
    +'</div></div>';
  var root=null;
  if(host){host.innerHTML=inner;root=host;}
  else{
    wrap=document.createElement('div');wrap.id='mnFormModal';
    wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1300;display:flex;justify-content:center;align-items:'+(mob?'stretch':'center');
    wrap.innerHTML=inner;document.body.appendChild(wrap);root=wrap;
  }
  function uClose(){if(host)mnHostClose();else if(wrap)wrap.remove();}
  var box=root.querySelector('#mnSheetBox');
  function fv(v){return (v===''||v==null)?null:v;}
  var MN_DIMC={dep:['#e74c3c','#fdecea'],topi:['#e67e22','#fdf3e7'],w34:['#2471a3','#eaf3fb'],w12:['#8e44ad','#f4ecf9'],lid:['#1d9e75','#e1f5ee'],lidRect:['#d4537e','#fbeaf0'],lidW:['#d4537e','#fbeaf0'],lidH:['#d4537e','#fbeaf0']};
  var MN_UNITS={dep:'m',w12:'m',w34:'m',topi:'m'};
  function dimSpot(x,y,k,label,w){
    w=w||50;
    var val=rec[k];var has=!(val===''||val==null);var c=MN_DIMC[k]||['#c8a600','#fffbe6'];
    var txt=has?(val+(MN_UNITS[k]||'')):label;
    return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="21" rx="5" fill="'+c[1]+'" stroke="'+c[0]+'" stroke-width="1.5" data-act="dim" data-k="'+k+'" style="cursor:pointer"/>'
      +'<text x="'+(x+w/2)+'" y="'+(y+15)+'" text-anchor="middle" font-size="'+(has?'11.5':'10.5')+'" font-weight="800" fill="'+c[0]+'" pointer-events="none">'+txt+'</text>';
  }
  function destPill(k,x,y,w,h,rot){
    var v=(rec.dest&&rec.dest[k])||'';
    var t=v||'방향';
    var cx=x+w/2,cy=y+h/2,txt;
    if(rot===0)txt='<text x="'+cx+'" y="'+(cy+3.5)+'" text-anchor="middle" font-size="11.5" font-weight="800" fill="'+(v?'#558b2f':'#a8c790')+'" pointer-events="none">'+joseoEsc(t)+'</text>';
    else txt='<text x="'+cx+'" y="'+cy+'" text-anchor="middle" font-size="11.5" font-weight="800" fill="'+(v?'#558b2f':'#a8c790')+'" transform="rotate('+rot+' '+cx+' '+cy+')" dominant-baseline="central" pointer-events="none">'+joseoEsc(t)+'</text>';
    return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="5" fill="#f1f8e9" stroke="#7cb342" stroke-width="1.2" data-act="dest" data-d="'+k+'" style="cursor:pointer"/>'+txt;
  }
  function wallPhoto(k,x,y,w,h,rot){var u=rec.photos&&rec.photos[k];if(!u)return '';
    var cx=x+w/2,cy=y+h/2;
    var iw=(rot===90||rot===-90)?h:w, ih=(rot===90||rot===-90)?w:h;
    var img='<image href="'+u+'" x="'+(cx-iw/2)+'" y="'+(cy-ih/2)+'" width="'+iw+'" height="'+ih+'" preserveAspectRatio="xMidYMid slice" opacity="0.35" pointer-events="none"/>';
    if(!rot)return img;
    return '<g transform="rotate('+rot+' '+cx+' '+cy+')" pointer-events="none">'+img+'</g>';}
  function wallHint(x,y){return '<rect x="'+(x-46)+'" y="'+(y-11)+'" width="92" height="22" rx="6" fill="#ffffff" fill-opacity="0.78" stroke="#c9d5ec" stroke-width="1" pointer-events="none"/><text x="'+x+'" y="'+(y+4)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="#a9b8d6" pointer-events="none">촬영/공수배치</text>';}
  function dimRange(x1,y1,x2,y2,color){
    var o='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="1.5"/>',aw=8,ah=3.2;
    if(x1===x2){
      o+='<path d="M'+x1+','+y1+' l'+ah+','+aw+' l-'+(ah*2)+',0 z" fill="'+color+'"/>';
      o+='<path d="M'+x1+','+y2+' l'+ah+',-'+aw+' l-'+(ah*2)+',0 z" fill="'+color+'"/>';
    }else{
      o+='<path d="M'+x1+','+y1+' l'+aw+','+ah+' l0,-'+(ah*2)+' z" fill="'+color+'"/>';
      o+='<path d="M'+x2+','+y1+' l-'+aw+','+ah+' l0,-'+(ah*2)+' z" fill="'+color+'"/>';
    }
    return o;
  }
  function wallCircles(wallKey,mapFn){
    var pwv=rec.pipes&&rec.pipes[wallKey];if(!pwv||!pwv.groups)return '';
    /* ★ 실벽폭 기준. 관을 "닿아있으면 한 덩어리"로 자동 묶고, 각 덩어리를 중심기준 비율 위치에 배치.
       덩어리 안 관은 붙은 상대배치 유지(등방, 고정 표시크기) → 겹침/뜸 없음. 정밀좌표는 편집기(→DXF)가 보존 */
    var Wm=mnWallRealW(rec,wallKey),Hm=(mnWallDims(rec,wallKey)[1])||1100,out='';
    var all=[];pwv.groups.forEach(function(g){(g.circles||[]).forEach(function(c){all.push(c);});});
    if(!all.length)return '';
    /* 1) 인접(닿음) 그룹핑: 중심거리 ≤ (d1+d2)/2 * 1.4 이면 같은 덩어리 (BFS) */
    var n=all.length,seen=new Array(n).fill(false),clusters=[];
    for(var i=0;i<n;i++){ if(seen[i])continue;
      var q=[i],comp=[];seen[i]=true;
      while(q.length){ var a=q.pop();comp.push(a);
        for(var b=0;b<n;b++){ if(seen[b])continue;
          var dx=all[a].x-all[b].x,dy=all[a].y-all[b].y,th=(all[a].dia+all[b].dia)/2*1.4;
          if(dx*dx+dy*dy<=th*th){seen[b]=true;q.push(b);}
        }
      }
      clusters.push(comp);
    }
    /* 2) mapFn 단위벡터(회전 자동 반영) */
    var o0=mapFn(0,0),e1=mapFn(1,0),e2=mapFn(0,1);
    var ex=[e1[0]-o0[0],e1[1]-o0[1]],ey=[e2[0]-o0[0],e2[1]-o0[1]];
    var exl=Math.hypot(ex[0],ex[1])||1,eyl=Math.hypot(ey[0],ey[1])||1;
    var exU=[ex[0]/exl,ex[1]/exl],eyU=[ey[0]/eyl,ey[1]/eyl];
    var DS=0.15; /* 표시 배율(px/mm) — 야장 확인용 크기. 붙은 관은 그대로 붙음 */
    clusters.forEach(function(comp){
      /* 덩어리 중심(편집기 실좌표) */
      var cx=0,cy=0;comp.forEach(function(idx){cx+=all[idx].x;cy+=all[idx].y;});cx/=comp.length;cy/=comp.length;
      /* 중심기준 비율 → 셀 중심(0.5,0.5)에서 같은 비율. 셀 밖으로 안나가게 clamp */
      var ncx=Math.min(0.88,Math.max(0.12,0.5+(cx-Wm/2)/Wm));
      var ncy=Math.min(0.88,Math.max(0.12,0.5+(cy-Hm/2)/Hm));
      var pc=mapFn(ncx,ncy);
      comp.forEach(function(idx){
        var c=all[idx];
        var ddx=c.x-cx,ddy=c.y-cy; /* 덩어리 내 상대(편집기 실mm, ddy=바닥기준 위 */
        var px=pc[0]+DS*(ddx*exU[0]+ddy*eyU[0]);
        var py=pc[1]+DS*(ddx*exU[1]+ddy*eyU[1]);
        var r=Math.max(c.dia*0.5*DS,3);
        var st=(c.st!=null?c.st:(c.fill?1:0));
        out+='<circle cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+(st===2?'#d32f2f':(st===1?'#222':'#fff'))+'" stroke="#333" stroke-width="1.2" pointer-events="none"/>';
      });
    });
    return out;
  }
  function mnLbl(k){
    var sm=mnPipeSummary(rec,k);if(!sm)return '';
    var lines=sm.split(' / ');
    var t='#1565d8';
    function head(x,y,dx,dy){return '<path d="M'+x+','+y+' L'+(x-dx*7-dy*3.5)+','+(y-dy*7+dx*3.5)+' L'+(x-dx*7+dy*3.5)+','+(y-dy*7-dx*3.5)+' z" fill="'+t+'"/>';}
    function tsp(x,y){var o='';lines.forEach(function(L,i){o+='<tspan x="'+x+'" '+(i?'dy="13"':('y="'+y+'"'))+'>'+joseoEsc(L)+'</tspan>';});return o;}
    if(k==='p1')return '<line x1="132" y1="427" x2="132" y2="416" stroke="'+t+'" stroke-width="1.6"/>'+head(132,414,0,-1)
      +'<text transform="rotate(-90 132 408)" font-size="11.5" font-weight="800" fill="'+t+'" pointer-events="none">'+tsp(132,408)+'</text>';
    if(k==='p3')return '<line x1="394" y1="340" x2="406" y2="340" stroke="'+t+'" stroke-width="1.6"/>'+head(410,340,1,0)
      +'<text font-size="11.5" font-weight="800" fill="'+t+'" pointer-events="none">'+tsp(416,344)+'</text>';
    if(k==='p2')return '<line x1="465" y1="574" x2="465" y2="586" stroke="'+t+'" stroke-width="1.6"/>'+head(465,590,0,1)
      +'<text transform="rotate(90 465 598)" font-size="11.5" font-weight="800" fill="'+t+'" pointer-events="none">'+tsp(465,598)+'</text>';
    if(k==='p4'){
      if(lines.length===1)return '<line x1="246" y1="645" x2="234" y2="645" stroke="'+t+'" stroke-width="1.6"/>'+head(230,645,-1,0)
        +'<text x="226" y="649" text-anchor="end" font-size="11.5" font-weight="800" fill="'+t+'" pointer-events="none">'+joseoEsc(sm)+'</text>';
      var mx=0;lines.forEach(function(L){if(L.length>mx)mx=L.length;});var sx=226-Math.round(mx*6.4);
      return '<line x1="246" y1="645" x2="234" y2="645" stroke="'+t+'" stroke-width="1.6"/>'+head(230,645,-1,0)
        +'<text font-size="11.5" font-weight="800" fill="'+t+'" pointer-events="none">'+tsp(sx,643)+'</text>';
    }
    return '';
  }

  function wallLine(wallKey,x,y,rot){
    var sm=mnPipeSummary(rec,wallKey);if(!sm)return '';
    sm=sm.replace(/ \/ /g,' ');
    if(!rot)return '<text x="'+x+'" y="'+y+'" font-size="11.5" font-weight="800" fill="#1565d8" pointer-events="none">'+joseoEsc(sm)+'</text>';
    return '<text transform="rotate('+rot+' '+x+' '+y+')" x="'+x+'" y="'+y+'" text-anchor="middle" font-size="11.5" font-weight="800" fill="#1565d8" pointer-events="none">'+joseoEsc(sm)+'</text>';
  }
  function render(){
    rec.spec=mnDetectSpec(rec.dep,rec.w12,rec.w34);
    var specTxt=rec.spec?(rec.spec.name+' ('+(rec.spec.w/1000)+'×'+(rec.spec.h/1000)+')·'+rec.spec.orient):'';
    var dash='stroke="#999" stroke-width="0.8" stroke-dasharray="5,4"';
    function grid(arm){
      var o='',k;
      if(arm==='p3'){for(k=1;250+28*k<390;k++)o+='<line x1="'+(250+28*k)+'" y1="280" x2="'+(250+28*k)+'" y2="430" '+dash+'/>';for(k=1;430-28*k>280;k++)o+='<line x1="250" y1="'+(430-28*k)+'" x2="390" y2="'+(430-28*k)+'" '+dash+'/>';}
      if(arm==='p4'){for(k=1;250+28*k<390;k++)o+='<line x1="'+(250+28*k)+'" y1="570" x2="'+(250+28*k)+'" y2="720" '+dash+'/>';for(k=1;570+28*k<720;k++)o+='<line x1="250" y1="'+(570+28*k)+'" x2="390" y2="'+(570+28*k)+'" '+dash+'/>';}
      if(arm==='p1'){for(k=1;250-28*k>100;k++)o+='<line x1="'+(250-28*k)+'" y1="430" x2="'+(250-28*k)+'" y2="570" '+dash+'/>';for(k=1;430+28*k<570;k++)o+='<line x1="100" y1="'+(430+28*k)+'" x2="250" y2="'+(430+28*k)+'" '+dash+'/>';}
      if(arm==='p2'){for(k=1;390+28*k<540;k++)o+='<line x1="'+(390+28*k)+'" y1="430" x2="'+(390+28*k)+'" y2="570" '+dash+'/>';for(k=1;430+28*k<570;k++)o+='<line x1="390" y1="'+(430+28*k)+'" x2="540" y2="'+(430+28*k)+'" '+dash+'/>';}
      return o;
    }
    var phRows='';
    MN_SLOTS.forEach(function(sl,i){
      var y=182+i*36;var url=rec.photos&&rec.photos[sl[0]];
      var chkOn=!(rec.chk&&rec.chk[sl[0]]===0);
      phRows+='<rect x="558" y="'+(y-7.5)+'" width="15" height="15" rx="3.5" fill="'+(chkOn?'#1d9e75':'#fff')+'" stroke="'+(chkOn?'#1d9e75':'#bbb')+'" stroke-width="1.4" data-act="chk" data-s="'+sl[0]+'" style="cursor:pointer"/>'
        +(chkOn?'<path d="M561.5 '+y+' l3.7 4.2 l6.3 -7.5" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>':'')
        +'<text x="579" y="'+(y+6)+'" text-anchor="start" font-size="13" fill="#444">'+sl[1].replace(/^[①-④] /,'')+' :</text>'
        +(url?'<image href="'+url+'" x="622" y="'+(y-12)+'" width="24" height="24" preserveAspectRatio="xMidYMid slice" data-act="ph" data-s="'+sl[0]+'" style="cursor:pointer"/><rect x="652" y="'+(y-11.5)+'" width="42" height="23" rx="6" fill="#e1f5ee" stroke="#1d9e75" stroke-width="1.5" data-act="ph" data-s="'+sl[0]+'" style="cursor:pointer"/><text x="673" y="'+(y+4)+'" text-anchor="middle" font-size="11" font-weight="800" fill="#1d9e75" pointer-events="none">완료</text>'
             :'<rect x="638" y="'+(y-11.5)+'" width="56" height="23" rx="6" fill="#fdeaea" stroke="#d32f2f" stroke-width="1.6" data-act="ph" data-s="'+sl[0]+'" style="cursor:pointer"/><text x="666" y="'+(y+4)+'" text-anchor="middle" font-size="11.5" font-weight="800" fill="#d32f2f" pointer-events="none">촬영</text>');
    });
    var svg='<svg viewBox="0 0 720 980" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#fff;'+(host?'width:100%;height:100%':'width:100%;max-width:720px')+';margin:0 auto;font-family:inherit">'
      +'<rect x="12" y="12" width="696" height="956" fill="none" stroke="#777" stroke-width="1.5"/>'
      +'<rect x="440" y="26" width="256" height="34" fill="none" stroke="#555"/><text x="568" y="49" text-anchor="middle" font-size="16" font-weight="800" letter-spacing="8">맨 홀 표 찰</text>'
      +'<rect x="440" y="60" width="84" height="34" fill="none" stroke="#555"/><text x="482" y="82" text-anchor="middle" font-size="13" fill="#333">맨홀번호</text>'
      +'<rect x="524" y="60" width="172" height="34" fill="'+(rec.no?'#fff':'#fffdf2')+'" stroke="#c0392b" stroke-width="1.6" data-act="no" style="cursor:pointer"/>'
      +(function(){var lb=rec.no?mnLabel(rec):'탭하여 입력';var wpx=0;for(var ci=0;ci<lb.length;ci++){wpx+=(lb.charCodeAt(ci)>0x2500?13.5:8);}var tl=(rec.no&&wpx>164)?' textLength="164" lengthAdjust="spacingAndGlyphs"':'';return '<text x="610" y="82" text-anchor="middle" font-size="14" font-weight="800" fill="'+(rec.no?'#c0392b':'#c8b8a0')+'" pointer-events="none"'+tl+'>'+joseoEsc(lb)+'</text>';})()
      +'<rect x="440" y="94" width="84" height="34" fill="none" stroke="#555"/><text x="482" y="116" text-anchor="middle" font-size="13" fill="#333">맨홀규격</text>'
      +'<rect x="524" y="94" width="172" height="34" fill="none" stroke="#555"/><text x="610" y="116" text-anchor="middle" font-size="12.5" font-weight="800" fill="#1d9e75">'+(specTxt||'치수 입력 시 자동')+'</text>'
      +(function(){ /* [1007] 상단 사진 스트립: 1(전경)·2-1~2-4, 회전사진 표시 */
        var st='';var items=[['fr','1'],['p1','2-1'],['p2','2-2'],['p3','2-3'],['p4','2-4']];
        items.forEach(function(it,i){
          var u=rec.photos&&rec.photos[it[0]];var x0=28+i*80;
          st+='<rect x="'+x0+'" y="30" width="74" height="54" fill="'+(u?'#fff':'#fafaf7')+'" stroke="#bbb" stroke-width="0.8"/>';
          if(u)st+='<image href="'+u+'" x="'+(x0+1)+'" y="31" width="72" height="52" preserveAspectRatio="xMidYMid meet" data-act="pview" data-s="'+it[0]+'" style="cursor:pointer"/>';
          st+='<text x="'+(x0+37)+'" y="97" text-anchor="middle" font-size="11" fill="#555" font-weight="700">'+it[1]+'</text>';
          if(u&&rec.rotP&&rec.rotP[it[0]]===1)st+='<text x="'+(x0+37)+'" y="109" text-anchor="middle" font-size="9" font-weight="800" fill="#d32f2f">회전적용됨</text>';
        });
        /* [1011] 기존 사진(플래그 없음)도 실제 비율 검사로 회전 여부 자동 판정 → 1회 재렌더 */
        if(!rec._rotScan){
          var need=items.filter(function(it){return rec.photos&&rec.photos[it[0]]&&!(rec.rotP&&rec.rotP[it[0]]!==undefined);});
          if(need.length){
            rec._rotScan=1;
            setTimeout(function(){
              var left=need.length,changed=false;
              need.forEach(function(it){
                var im=new Image();
                im.onload=function(){
                  if(!rec.rotP)rec.rotP={};
                  var p=(im.naturalHeight>im.naturalWidth)?1:0;
                  if(rec.rotP[it[0]]!==p){rec.rotP[it[0]]=p;changed=true;}
                  if(--left===0){rec._rotScan=0;if(changed){try{mnPersistRec(rec);}catch(e){}render();}}
                };
                im.onerror=function(){if(--left===0){rec._rotScan=0;if(changed){try{mnPersistRec(rec);}catch(e){}render();}}};
                im.src=rec.photos[it[0]];
              });
            },50);
          }
        }
        return st;
      })()
      +'<text x="660" y="152" text-anchor="end" font-size="12.5" fill="#555" font-weight="700">사진번호</text>'+phRows
      +'<defs><marker id="mnArw" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#333"/></marker></defs>'
      /* ===== 전개도 (중앙) ===== */
      +'<g transform="translate(40,0)">'
      +'<rect x="250" y="430" width="140" height="140" fill="#fff" stroke="#333" stroke-width="1.6"/>'
      +'<circle cx="320" cy="500" r="30" fill="none" stroke="#333" stroke-width="1.4" stroke-dasharray="6,5"/>'
      +(rec.photos&&rec.photos.fr?'<image href="'+rec.photos.fr+'" x="250" y="430" width="140" height="140" preserveAspectRatio="xMidYMid slice" opacity="0.35" pointer-events="none"/>':'')
      +'<rect x="256" y="539" width="128" height="22" rx="6" fill="#ffffff" fill-opacity="0.78" stroke="#ecc9c9" stroke-width="1" pointer-events="none"/><text x="320" y="554" text-anchor="middle" font-size="10.5" font-weight="700" fill="#d9a0a0" pointer-events="none">전경사진 촬영</text>'
      /* 상(3=북): 목 — 되꺾임 안쪽 */
      +'<rect x="250" y="280" width="140" height="150" fill="#fff" stroke="#333" stroke-width="1.5"/>'+grid('p3')
      +'<polyline points="278,280 278,235 258,235" fill="none" stroke="#333" stroke-width="1.5"/>'
      +'<polyline points="362,280 362,235 382,235" fill="none" stroke="#333" stroke-width="1.5"/>'
      +'<line x1="320" y1="274" x2="320" y2="254" stroke="#333" stroke-width="1.2" marker-end="url(#mnArw)"/>'
      +'<text x="313" y="248" font-size="15" font-weight="700" fill="#333">3</text>'
      +destPill('d3',306,156,28,74,-90)
      /* 하(4=남) */
      +'<rect x="250" y="570" width="140" height="150" fill="#fff" stroke="#333" stroke-width="1.5"/>'+grid('p4')
      +'<polyline points="278,720 278,765 258,765" fill="none" stroke="#333" stroke-width="1.5"/>'
      +'<polyline points="362,720 362,765 382,765" fill="none" stroke="#333" stroke-width="1.5"/>'
      +'<line x1="320" y1="726" x2="320" y2="746" stroke="#333" stroke-width="1.2" marker-end="url(#mnArw)"/>'
      +'<text x="313" y="762" font-size="15" font-weight="700" fill="#333">4</text>'
      +destPill('d4',306,772,28,74,90)
      /* 좌(1=서) */
      +'<rect x="100" y="430" width="150" height="140" fill="#fff" stroke="#333" stroke-width="1.5"/>'+grid('p1')
      +'<polyline points="100,458 55,458 55,438" fill="none" stroke="#333" stroke-width="1.5"/>'
      +'<polyline points="100,542 55,542 55,562" fill="none" stroke="#333" stroke-width="1.5"/>'
      +'<line x1="94" y1="500" x2="76" y2="500" stroke="#333" stroke-width="1.2" marker-end="url(#mnArw)"/>'
      +'<text x="62" y="505" font-size="15" font-weight="700" fill="#333">1</text>'
      +destPill('d1',0,485,58,30,0)
      /* 우(2=동) */
      +'<rect x="390" y="430" width="150" height="140" fill="#fff" stroke="#333" stroke-width="1.5"/>'+grid('p2')
      +'<polyline points="540,458 585,458 585,438" fill="none" stroke="#333" stroke-width="1.5"/>'
      +'<polyline points="540,542 585,542 585,562" fill="none" stroke="#333" stroke-width="1.5"/>'
      +'<line x1="548" y1="500" x2="568" y2="500" stroke="#333" stroke-width="1.2" marker-end="url(#mnArw)"/>'
      +'<text x="571" y="505" font-size="15" font-weight="700" fill="#333">2</text>'
      +destPill('d2',586,485,58,30,0)
      +wallPhoto('p3',250,280,140,150,0)+wallPhoto('p4',250,570,140,150,180)+wallPhoto('p1',100,430,150,140,-90)+wallPhoto('p2',390,430,150,140,90)
      +wallHint(320,355)+wallHint(320,645)+wallHint(175,500)+wallHint(465,500)
      +wallCircles('p3',function(nx,ny){return [250+nx*140,430-ny*150];})
      +wallCircles('p4',function(nx,ny){return [250+nx*140,570+ny*150];})
      +wallCircles('p1',function(nx,ny){return [250-ny*150,570-nx*140];})
      +wallCircles('p2',function(nx,ny){return [390+ny*150,430+nx*140];})
      +mnLbl('p1')+mnLbl('p3')+mnLbl('p2')+mnLbl('p4')
      /* 치수: 범위선(양끝 화살표) + 작은 탭 */
      +dimRange(250,288,390,288,'#2471a3')+dimSpot(396,278,'w34','폭',46)
      +dimRange(240,235,240,280,'#e67e22')+dimSpot(188,247,'topi','토피',46)
      +dimRange(240,280,240,430,'#e74c3c')+dimSpot(188,344,'dep','깊이',46)
      +dimRange(106,430,106,570,'#8e44ad')+dimSpot(34,442,'w12','폭',46)
      +'<rect x="250" y="430" width="140" height="140" fill="rgba(0,0,0,0)" data-act="ph" data-s="fr" style="cursor:pointer"/>'
      +'<rect x="250" y="235" width="140" height="195" fill="rgba(0,0,0,0)" data-act="wall" data-w="p3" style="cursor:pointer"/>'
      +'<rect x="250" y="570" width="140" height="195" fill="rgba(0,0,0,0)" data-act="wall" data-w="p4" style="cursor:pointer"/>'
      +'<rect x="55" y="430" width="195" height="140" fill="rgba(0,0,0,0)" data-act="wall" data-w="p1" style="cursor:pointer"/>'
      +'<rect x="390" y="430" width="195" height="140" fill="rgba(0,0,0,0)" data-act="wall" data-w="p2" style="cursor:pointer"/>'
      +'</g>'
      /* 뚜껑 */
      +'<circle cx="128" cy="790" r="34" fill="#fff" stroke="#1d9e75" stroke-width="1.5" stroke-dasharray="6,5" data-act="dim" data-k="lid" style="cursor:pointer"/>'
      +dimRange(94,790,162,790,'#1d9e75')
      +'<text x="128" y="781" text-anchor="middle" font-size="12.5" font-weight="800" fill="#1d9e75" data-act="dim" data-k="lid" style="cursor:pointer">'+(fv(rec.lid)!=null?rec.lid:766)+'</text>'
      +'<text x="128" y="838" text-anchor="middle" font-size="12" fill="#444">원형맨홀뚜껑</text>'
      +dimRange(68,868,188,868,'#888')
      +'<line x1="128" y1="862" x2="128" y2="874" stroke="#888" stroke-width="1.2"/>'
      +'<rect x="68" y="874" width="120" height="48" fill="#fff" stroke="#333" stroke-width="1.4"/>'
      +dimRange(68,934,188,934,'#d4537e')
      +'<rect x="105" y="926" width="46" height="17" rx="4" fill="#fbeaf0" stroke="#d4537e" stroke-width="1.1" data-act="dim" data-k="lidW" style="cursor:pointer"/>'
      +'<text x="128" y="938.5" text-anchor="middle" font-size="10.5" font-weight="800" fill="#d4537e" pointer-events="none">'+(fv(rec.lidW)!=null?rec.lidW:'가로')+'</text>'
      +dimRange(58,874,58,922,'#d4537e')
      +'<rect x="13" y="890" width="42" height="17" rx="4" fill="#fbeaf0" stroke="#d4537e" stroke-width="1.1" data-act="dim" data-k="lidH" style="cursor:pointer"/>'
      +'<text x="34" y="902.5" text-anchor="middle" font-size="10.5" font-weight="800" fill="#d4537e" pointer-events="none">'+(fv(rec.lidH)!=null?rec.lidH:'세로')+'</text>'
      +'<text x="128" y="960" text-anchor="middle" font-size="12" fill="#444">사각맨홀뚜껑</text>'
      +'<text x="420" y="960" text-anchor="middle" font-size="11.5" fill="#aab">벽면=관배치 · 색칸=치수 · 표찰표=번호 · 우측=사진</text>'
      +'</svg>';
    box.innerHTML=svg;
    [].forEach.call(box.querySelectorAll('[data-act]'),function(el){
      el.addEventListener('click',function(){
        var act=el.getAttribute('data-act');
        if(act==='no'){mnAskNoOwner(rec,function(){mnPersistRec(rec);render();});}
        else if(act==='dim'){
          var k=el.getAttribute('data-k');
          if(k==='w12'||k==='w34'||k==='dep'){mnAskSpecDim(rec,k,function(){mnPersistRec(rec);render();});return;}
          var titles={dep:'깊이',w12:'폭',w34:'폭',topi:'토피',lid:'뚜껑지름',lidRect:'사각뚜껑 SIZE',lidW:'사각뚜껑 가로',lidH:'사각뚜껑 세로'};
          var units={dep:'m',w12:'m',w34:'m',topi:'m',lid:'mm',lidRect:'',lidW:'mm',lidH:'mm'};
          mnAsk({title:titles[k],unit:units[k],val:rec[k],text:(k==='lidRect'),color:MN_DIMC[k],cb:function(v){rec[k]=(v===''?'':v);mnPersistRec(rec);render();}});
        }
        else if(act==='dest'){var dk=el.getAttribute('data-d');var dn={d1:'1',d2:'2',d3:'3',d4:'4'}[dk];mnAskDest((rec.dest&&rec.dest[dk])||'',dn,function(v){if(!rec.dest)rec.dest={};rec.dest[dk]=v;mnPersistRec(rec);render();});}
        else if(act==='wall'){var wl=el.getAttribute('data-w');var closeIt=function(){if(!host&&wrap)wrap.remove();};if(!(rec.photos&&rec.photos[wl])){toast('벽면 사진을 먼저 촬영합니다');mnShootSlot(rec,wl,function(){closeIt();mnPipeEditor(rec,wl);});}else{closeIt();mnPipeEditor(rec,wl);}}
        else if(act==='pview'){
          var vs=el.getAttribute('data-s');var vu=rec.photos&&rec.photos[vs];
          if(vu){
            var ov=document.createElement('div');
            ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:1340;overflow:hidden;touch-action:none';
            ov.innerHTML='<img src="'+vu+'" style="position:absolute;left:50%;top:50%;max-width:96vw;max-height:88dvh;transform:translate(-50%,-50%) scale(1);transform-origin:center;object-fit:contain;border-radius:8px;will-change:transform">'
              +'<button style="position:fixed;right:16px;bottom:18px;z-index:2;border:1.5px solid #fff;background:rgba(211,47,47,.92);color:#fff;border-radius:10px;padding:11px 22px;font-weight:800;font-size:15px;cursor:pointer">사진 닫기</button>';
            var im=ov.querySelector('img'),sc=1,tx=0,ty=0;
            function ap(){im.style.transform='translate(calc(-50% + '+tx+'px), calc(-50% + '+ty+'px)) scale('+sc+')';}
            ov.querySelector('button').onclick=function(){ov.remove();};
            /* PC 휠 줌 */
            ov.addEventListener('wheel',function(e){e.preventDefault();sc=Math.min(6,Math.max(1,sc*(e.deltaY<0?1.15:1/1.15)));if(sc===1){tx=0;ty=0;}ap();},{passive:false});
            /* 드래그 팬(마우스) */
            var dg=null;
            im.addEventListener('mousedown',function(e){e.preventDefault();dg=[e.clientX-tx,e.clientY-ty];});
            window.addEventListener('mousemove',function(e){if(dg&&sc>1){tx=e.clientX-dg[0];ty=e.clientY-dg[1];ap();}});
            window.addEventListener('mouseup',function(){dg=null;});
            /* 터치: 핀치 줌 + 한손 팬 */
            var pt=null,pd=0,ps=1;
            ov.addEventListener('touchstart',function(e){
              if(e.touches.length===2){pd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);ps=sc;}
              else if(e.touches.length===1){pt=[e.touches[0].clientX-tx,e.touches[0].clientY-ty];}
            },{passive:true});
            ov.addEventListener('touchmove',function(e){
              if(e.touches.length===2){e.preventDefault();var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);sc=Math.min(6,Math.max(1,ps*d/(pd||d)));if(sc===1){tx=0;ty=0;}ap();}
              else if(e.touches.length===1&&pt&&sc>1){e.preventDefault();tx=e.touches[0].clientX-pt[0];ty=e.touches[0].clientY-pt[1];ap();}
            },{passive:false});
            ov.addEventListener('touchend',function(e){if(e.touches.length<2)pd=0;if(!e.touches.length)pt=null;});
            document.body.appendChild(ov);
          }
        }
        else if(act==='chk'){var cs=el.getAttribute('data-s');if(!rec.chk)rec.chk={bd:1,fr:1,p1:1,p2:1,p3:1,p4:1};rec.chk[cs]=(rec.chk[cs]===0?1:0);mnPersistRec(rec);render();}
        else if(act==='ph'){mnShootSlot(rec,el.getAttribute('data-s'),function(){render();});}
      });
    });
  }
  render();
  if(!host){
    /* [BUILD 949] 모바일 야장 핀치 확대/축소 */
    box.style.overflow='auto';
    box.style.touchAction='pan-x pan-y';
    var pinch=null;
    function sheetZ(){var sv=box.querySelector('svg');return sv?parseFloat(sv.getAttribute('data-z')||'1'):1;}
    box.addEventListener('touchstart',function(e){
      if(e.touches.length===2){
        var t0=e.touches[0],t1=e.touches[1];
        pinch={d:Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY),z:sheetZ(),
               cx:(t0.clientX+t1.clientX)/2,cy:(t0.clientY+t1.clientY)/2};
      }
    },{passive:true});
    box.addEventListener('touchmove',function(e){
      if(!pinch||e.touches.length!==2)return;
      e.preventDefault();
      var sv=box.querySelector('svg');if(!sv)return;
      var t0=e.touches[0],t1=e.touches[1];
      var nd=Math.hypot(t1.clientX-t0.clientX,t1.clientY-t0.clientY);
      var z=sheetZ();
      var nz=Math.min(5,Math.max(1,pinch.z*nd/pinch.d));
      if(Math.abs(nz-z)<0.005)return;
      var br=box.getBoundingClientRect();
      var rx=box.scrollLeft+(pinch.cx-br.left), ry=box.scrollTop+(pinch.cy-br.top);
      var bw=box.clientWidth;
      if(nz<=1.005){nz=1;sv.style.width='100%';sv.style.maxWidth='720px';box.scrollLeft=0;}
      else{sv.style.width=(bw*nz)+'px';sv.style.maxWidth='none';var k=nz/z;box.scrollLeft=rx*k-(pinch.cx-br.left);box.scrollTop=ry*k-(pinch.cy-br.top);}
      sv.setAttribute('data-z',nz);
    },{passive:false});
    box.addEventListener('touchend',function(){pinch=null;},{passive:true});
    box.addEventListener('touchcancel',function(){pinch=null;},{passive:true});
  }
  if(host){
    box.style.overflow='auto';
    box.addEventListener('wheel',function(e){
      var svgEl=box.querySelector('svg');if(!svgEl)return;
      e.preventDefault();
      var z=parseFloat(svgEl.getAttribute('data-z')||'1');
      var nz=Math.min(5,Math.max(1,z*(e.deltaY<0?1.12:1/1.12)));
      if(Math.abs(nz-z)<0.001)return;
      var br=box.getBoundingClientRect();
      var rx=box.scrollLeft+(e.clientX-br.left), ry=box.scrollTop+(e.clientY-br.top);
      if(nz<=1.001){nz=1;svgEl.style.height='100%';svgEl.style.width='100%';box.scrollTop=0;box.scrollLeft=0;}
      else{svgEl.style.height=(box.clientHeight*nz)+'px';svgEl.style.width='auto';var k=nz/z;box.scrollLeft=rx*k-(e.clientX-br.left);box.scrollTop=ry*k-(e.clientY-br.top);}
      svgEl.setAttribute('data-z',nz);
    },{passive:false});
  }
  root.querySelector('#mnFClose').onclick=uClose;
  var _ft=root.querySelector('#mnFTrash');if(_ft)_ft.onclick=function(){mnTrashList(null);};
  var _pdl=root.querySelector('#mnPhotoDl');if(_pdl)_pdl.onclick=function(){mnPhotoZip(rec);};
  var _eqx=root.querySelector('#mnEqXls');if(_eqx)_eqx.onclick=function(){mnEquipXls(rec);};
  var _dxb=root.querySelector('#mnDxfBtn');if(_dxb)_dxb.onclick=function(){mnDxfGen(rec);};
  var _efb=root.querySelector('#mnEfb');if(_efb)_efb.onclick=function(){mnEfbGen(rec);};
  root.querySelector('#mnBack').onclick=function(){uClose();mnOpenList();};
  root.querySelector('#mnSave').onclick=function(){
    if(!rec.no){toast('맨홀번호를 입력하세요');mnAskNoOwner(rec,function(){mnPersistRec(rec);render();});return;}
    var miss=[];MN_SLOTS.forEach(function(sl){if(!(rec.chk&&rec.chk[sl[0]]===0)&&!(rec.photos&&rec.photos[sl[0]]))miss.push(sl[1].replace(/^[①-④] /,''));});
    if(miss.length){alert(miss.join(', ')+' 사진을 등록하세요');return;}
    var dup=null;mnList().forEach(function(r){if(r.id!==rec.id&&mnLabel(r)===mnLabel(rec))dup=r;});
    if(dup){if(!confirm('같은 번호('+mnLabel(rec)+')가 목록에 있습니다. 덮어쓸까요?'))return;var L=mnList();var di=L.indexOf(dup);if(di>=0)L.splice(di,1);}
    mnPersistRec(rec,'맨홀조사 저장됨');uClose();mnOpenList();
  };
}
/* [BUILD 981] 도엽번호(1/1000, 국토지리원 체계) 계산 — 셰이프 62만개 검증(수도권 100%) */
function mnMapSheetNo(lat,lon){
  function p2(n){return ('0'+n).slice(-2);}
  var a=Math.floor(lat), b=Math.floor(lon)%10;
  var r50=Math.floor((Math.floor(lat)+1-lat)/0.25), c50=Math.floor((lon-Math.floor(lon))/0.25);
  var i50=r50*4+c50+1;
  var latTop=Math.floor(lat)+1-r50*0.25, lonL=Math.floor(lon)+c50*0.25;
  var r10=Math.floor((latTop-lat)/0.05), c10=Math.floor((lon-lonL)/0.05);
  var AA=r10*5+c10+1;
  var lat10=latTop-r10*0.05, lon10=lonL+c10*0.05;
  var r1=Math.max(0,Math.min(9,Math.floor((lat10-lat)/0.005)));
  var c1=Math.max(0,Math.min(9,Math.floor((lon-lon10)/0.005)));
  var BB=(r1*10+c1+1)%100;
  return p2(a)+b+p2(i50)+p2(AA)+p2(BB);
}
/* [BUILD 981] 촬영 시 GPS→도엽번호·카카오주소 자동 수집 (전경=항상 갱신, 그 외=없을 때만) */
function mnCaptureGeo(rec,slot){
  if(!navigator.geolocation)return;
  if(slot!=='fr'&&rec.geo&&rec.geo.lat)return;
  navigator.geolocation.getCurrentPosition(function(pos){
    var lat=pos.coords.latitude,lng=pos.coords.longitude;
    rec.geo={lat:lat,lng:lng,acc:pos.coords.accuracy,at:Date.now()};
    try{rec.mapNo=mnMapSheetNo(lat,lng);}catch(e){}
    mnPersistRec(rec);
    try{kakaoReady(function(){
      if(!(kakao.maps.services&&kakao.maps.services.Geocoder))return;
      new kakao.maps.services.Geocoder().coord2Address(lng,lat,function(res,st){
        if(st!==kakao.maps.services.Status.OK||!res||!res[0])return;
        var ad=res[0].address,rd=res[0].road_address;
        if(ad)rec.addr=(ad.region_1depth_name||'')+' '+(ad.region_2depth_name||'')+' '+(ad.region_3depth_name||'');
        if(rd&&rd.road_name)rec.road=rd.road_name;
        mnPersistRec(rec);
      });
    });}catch(e){}
  },function(){},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
}
/* [1007] 세로로 찍힌 맨홀 사진 → 반시계 90° 자동 회전(가로화). 회전 여부 반환 */
function mnFixOrient(blob){
  return new Promise(function(res){
    var img=new Image();
    img.onload=function(){
      var w=img.naturalWidth,h=img.naturalHeight;
      if(w>=h){URL.revokeObjectURL(img.src);res({blob:blob,rotated:false});return;}
      var cv=document.createElement('canvas');cv.width=h;cv.height=w;
      var ctx=cv.getContext('2d');
      ctx.translate(0,w);ctx.rotate(-Math.PI/2);
      ctx.drawImage(img,0,0);
      URL.revokeObjectURL(img.src);
      cv.toBlob(function(b){res({blob:b||blob,rotated:!!b});},'image/jpeg',0.85);
    };
    img.onerror=function(){res({blob:blob,rotated:false});};
    img.src=URL.createObjectURL(blob);
  });
}
function mnShootSlot(rec,slot,done){
  try{mnCaptureGeo(rec,slot);}catch(e){}
  var fi=document.createElement('input');fi.type='file';fi.accept='image/*';fi.setAttribute('capture','environment');fi.style.display='none';
  document.body.appendChild(fi);
  fi.addEventListener('change',function(e){
    var f=e.target.files&&e.target.files[0];fi.remove();if(!f)return;
    if(!online){toast('로컬 모드 — 사진 저장 불가');return;}
    toast('사진 업로드 중…');
    compressImage(f,1280,0.7).then(function(blob){
      /* [1008] 저장은 촬영 원본 그대로. 세로 사진이면 rotP 기록 → 내보낼 때만 회전 적용 */
      return new Promise(function(res){var img=new Image();img.onload=function(){var p=(img.naturalHeight>img.naturalWidth);URL.revokeObjectURL(img.src);res({blob:blob,portrait:p});};img.onerror=function(){res({blob:blob,portrait:false});};img.src=URL.createObjectURL(blob);});
    }).then(function(fx){
      var blob=fx.blob;
      if(!rec.rotP)rec.rotP={};
      if(fx.portrait)rec.rotP[slot]=1;else delete rec.rotP[slot];
      var path=state.projectId+'/mh_'+rec.id+'_'+slot+'.jpg';
      return sb.storage.from('photos').upload(path,blob,{upsert:true,contentType:'image/jpeg'}).then(function(up){
        if(up.error)throw up.error;
        var url=sb.storage.from('photos').getPublicUrl(path).data.publicUrl+'?t='+Date.now();
        if(!rec.photos)rec.photos={};rec.photos[slot]=url;
        mnPersistRec(rec,'사진 저장됨');if(done)done();
      });
    }).catch(function(err){console.error('mn photo',err);toast('사진 업로드 실패');});
  });
  fi.click();
}
/* ===================== [BUILD 921] 맨홀 관배치 편집기 ===================== */
var MN_WALLS=[['p1','① 서'],['p2','② 동'],['p3','③ 북'],['p4','④ 남']];
var MN_KINDS=['FC','COD','PE','강관'];
function mnWallDims(rec,wall){
  var sp=rec.spec||{w:800,h:1700,dep:1100};
  return [Math.max(sp.w||800,sp.h||1700),sp.dep||1100];
}
function mnWallRealW(rec,wall){
  var sp=rec.spec||{w:800,h:1700,dep:1100,orient:'세로'};
  /* [988] 실측 매핑 교정: w12(왼쪽 세로 치수)=좌우벽(p1/p2), w34(위 가로 치수)=상하벽(p3/p4)
     orient '가로'=(w12>=w34)→좌우벽이 긴변 / '세로'→상하벽이 긴변 */
  var dLR=(sp.orient==='가로')?Math.max(sp.w,sp.h):Math.min(sp.w,sp.h); /* 좌우벽 */
  var dTB=(sp.orient==='가로')?Math.min(sp.w,sp.h):Math.max(sp.w,sp.h); /* 상하벽 */
  return (wall==='p1'||wall==='p2')?dLR:dTB;
}
function mnGroupLabel(g){
  var order=[],agg={};
  (g.circles||[]).forEach(function(c){
    if(!(c.dia in agg)){agg[c.dia]={cnt:0,fill:0};order.push(c.dia);}
    var st=(c.st!=null?c.st:(c.fill?1:0));
    if(st===2)return; /* 제외관: 관수에서 제외 */
    agg[c.dia].cnt++;
    if(st===1)agg[c.dia].fill++;
  });
  var parts=[],first=true;
  order.forEach(function(d){var a=agg[d];if(!a.cnt)return;parts.push((first?(g.kind+'Ø'):'')+d+'X'+a.cnt+'('+a.fill+')');first=false;});
  return parts.join(' ');
}
function mnPipeSummary(rec,wall){
  var pw=rec.pipes&&rec.pipes[wall];
  if(!pw||!pw.groups||!pw.groups.length)return '';
  return pw.groups.map(mnGroupLabel).filter(function(t){return t;}).join(' / ');
}
function mnPipeBtnsHtml(rec){
  var btns=MN_WALLS.map(function(w){
    var sm=mnPipeSummary(rec,w[0]);
    return '<button class="mn-pipe" data-w="'+w[0]+'" style="text-align:left;padding:9px 10px;border:1px solid '+(sm?'#b9d7ea':'#ddd')+';border-radius:9px;background:'+(sm?'#f2f8fd':'#fafafa')+';cursor:pointer;font-size:12.5px;overflow:hidden"><b style="color:#335">'+w[1]+'</b><br><span style="font-size:11px;color:'+(sm?'#2471a3':'#aab')+'">'+(sm?joseoEsc(sm):'관 없음 — 눌러서 배치')+'</span></button>';
  }).join('');
  return '<div style="font-size:12.5px;font-weight:800;color:#334;margin-bottom:6px">관배치 (벽면별)</div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">'+btns+'</div>';
}
function mnPersistRec(rec,msg){
  rec.up=new Date().toISOString();
  var L=mnList(),ix=-1;L.forEach(function(r,i){if(r.id===rec.id)ix=i;});
  if(ix<0)L.push(rec);else L[ix]=rec;
  saveProject();if(msg)toast(msg);
}
function mnPipeEditor(rec,wall){
  if(!rec.pipes)rec.pipes={};
  if(!rec.pipes[wall])rec.pipes[wall]={groups:[]};
  var pw=rec.pipes[wall];
  /* ★ 실벽폭 좌표계: 각 벽을 실제 폭×깊이로. dispW(긴변) 통일 폐기 */
  var WH=mnWallDims(rec,wall),W=mnWallRealW(rec,wall),H=WH[1];
  /* [986] 좌표 기준 벽치수 없으면 옛 dispW 좌표계로 간주 → 항상 현재 벽치수로 비율 변환 */
  var _sp986=rec.spec||{w:800,h:1700,dep:1100};
  if(!pw.bw||!pw.bh){pw.bw=Math.max(_sp986.w||800,_sp986.h||1700);pw.bh=_sp986.dep||1100;}
  if(pw.bw!==W||pw.bh!==H){
    var _fx=W/pw.bw,_fy=H/pw.bh;
    pw.groups.forEach(function(g){(g.circles||[]).forEach(function(c){c.x=Math.round(c.x*_fx);c.y=Math.round(c.y*_fy);});});
  }
  pw.bw=W;pw.bh=H;
  var wname='';MN_WALLS.forEach(function(x){if(x[0]===wall)wname=x[1];});
  var mob=(typeof isMobileDevice==='function'&&isMobileDevice());
  var old=document.getElementById('mnPipeModal');if(old)old.remove();
  var wrap=document.createElement('div');wrap.id='mnPipeModal';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1310;display:flex;justify-content:center;'+(mob?'align-items:flex-start;padding-top:2dvh':'align-items:center');
  wrap.innerHTML='<div style="background:#fff;border-radius:14px;width:min(96vw,460px);max-height:95dvh;display:flex;flex-direction:column;overflow:hidden">'
    +'<div style="padding:12px 14px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px"><b style="flex:1;font-size:15px">관배치 — '+wname+'</b><span style="font-size:11px;color:#99a">벽 '+(mnWallRealW(rec,wall)/1000)+'m × 깊이 '+(H/1000)+'m</span><button id="mnPClose" style="border:none;background:#f2f2f2;border-radius:8px;padding:6px 11px;cursor:pointer">닫기</button></div>'
    +'<div style="padding:10px 14px;overflow:auto;flex:1">'
    +'<div style="display:flex;gap:6px;align-items:center;margin-bottom:7px">'
      +'<button id="mnMdAll" class="mn-md" style="flex:none;border:1px solid #2471a3;background:#fff;color:#2471a3;border-radius:7px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer">전체이동</button>'
      +'<button id="mnMdOne" class="mn-md" style="flex:none;border:1px solid #1d9e75;background:#fff;color:#1d9e75;border-radius:7px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer">개별이동</button>'
      +'<button id="mnMdDel" class="mn-md" style="flex:none;border:1px solid #e67e22;background:#fff;color:#e67e22;border-radius:7px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer">개별삭제</button>'
      +'<button id="mnDelAll" style="flex:none;border:1px solid #d32f2f;background:#fff;color:#d32f2f;border-radius:7px;padding:6px 10px;font-size:12px;font-weight:800;cursor:pointer">전체삭제</button>'
      +'<button id="mnReShoot" style="margin-left:auto;flex:none;border:1px solid #d32f2f;background:#fdeaea;color:#d32f2f;border-radius:7px;padding:6px 10px;font-size:12px;font-weight:800;cursor:pointer">재촬영</button></div>'
    +'<div id="mnCvBox" style="border:1.5px solid #556;border-radius:8px;overflow:hidden;background:#fff"><canvas id="mnCv" style="display:block;touch-action:none;user-select:none;-webkit-user-select:none"></canvas></div>'
    +'<div style="font-size:11px;color:#99a;margin-top:4px;text-align:right">탭: 빈관→내선(검정)→제외(빨강) · 노란선=맨홀 바닥</div>'
    +'<div id="mnGChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px"></div>'
    +'<div style="border-top:1px dashed #ddd;margin-top:10px;padding-top:9px">'
      +'<div style="display:flex;gap:6px;margin-bottom:6px"><select id="mnGKind" style="flex:1;border:1px solid #ddd;border-radius:7px;padding:7px 5px;font-size:13px;background:#fff">'+MN_KINDS.map(function(k){return '<option>'+k+'</option>';}).join('')+'<option value="_c">직접입력</option></select>'
      +'<input id="mnGKindC" placeholder="관종" style="flex:1;display:none;border:1px solid #ddd;border-radius:7px;padding:7px 8px;font-size:13px">'
      +'<div style="flex:1;display:flex;align-items:center;gap:4px"><span style="font-size:12px;color:#667">단수</span><select id="mnGRowsSel" style="flex:1;min-width:0;border:1px solid #ddd;border-radius:7px;padding:7px 4px;font-size:14px;background:#fff"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option value="_c">직접입력</option></select><input id="mnGRows" type="number" min="1" max="12" value="6" inputmode="numeric" style="flex:1;min-width:0;border:1px solid #ddd;border-radius:7px;padding:7px 8px;font-size:14px;display:none"></div></div>'
      +'<div id="mnGRowsBox"></div>'
      +'<button id="mnGAdd" style="width:100%;margin-top:12px;background:#fff;color:#1d9e75;border:2.5px solid #1d9e75;border-radius:8px;padding:9px;font-weight:800;font-size:13.5px;cursor:pointer;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:2px;margin-right:-2px">관위치 조정</span></button>'
    +'</div></div>'
    +'<div style="display:flex;gap:8px;padding:11px 14px;border-top:1px solid #eee">'
    +'<button id="mnPDone" style="flex:1;background:#fff;color:#d32f2f;border:2.5px solid #d32f2f;border-radius:10px;padding:12px;font-weight:800;font-size:14.5px;cursor:pointer;display:flex;align-items:center;justify-content:center">완료 ('+({p1:'1',p2:'2',p3:'3',p4:'4'}[wall])+'번 완료등록합니다)</button>'
    +'</div></div>';
  document.body.appendChild(wrap);
  var cv=wrap.querySelector('#mnCv'),bx=wrap.querySelector('#mnCvBox');
  var sp0=rec.spec||{w:800,h:1700,dep:1100};
  var cssW=Math.min(window.innerWidth*0.96,460)-30;
  var cssH=cssW*H/W;var maxH=window.innerHeight*0.4;
  if(cssH>maxH){var _f=maxH/cssH;cssH=maxH;cssW*=_f;}
  var sx=cssW/W, sy=cssH/H;
  var dpr=window.devicePixelRatio||1;
  cv.style.width=cssW+'px';cv.style.height=cssH+'px';cv.width=Math.round(cssW*dpr);cv.height=Math.round(cssH*dpr);
  bx.style.width=cssW+'px';bx.style.margin='0 auto';
  var ctx=cv.getContext('2d');
  var vz=1,vox=0,voy=0;
  function clampView(){vz=Math.min(5,Math.max(1,vz));vox=Math.min(Math.max(vox,0),cssW*(vz-1));voy=Math.min(Math.max(voy,0),cssH*(vz-1));if(vz===1){vox=0;voy=0;}}
  var mode='all';
  function setMode(m){mode=m;
    /* [991] 버튼별 고유색: 전체이동=파랑 개별이동=초록 개별삭제=주황. 활성=연한 배경 */
    [['mnMdAll','all','#2471a3','#eaf3fb'],['mnMdOne','one','#1d9e75','#e1f5ee'],['mnMdDel','del','#e67e22','#fdf0e3']].forEach(function(x){
      var el=wrap.querySelector('#'+x[0]);var on=(m===x[1]);
      el.style.background=on?x[3]:'#fff';
      el.style.color=x[2];
      el.style.borderColor=x[2];
      el.style.borderWidth=on?'2px':'1px';
    });
  }
  wrap.querySelector('#mnMdAll').onclick=function(){setMode('all');};
  wrap.querySelector('#mnMdOne').onclick=function(){setMode('one');};
  wrap.querySelector('#mnMdDel').onclick=function(){setMode('del');};
  wrap.querySelector('#mnDelAll').onclick=function(){
    if(!pw.groups||!pw.groups.length){toast('삭제할 관이 없습니다');return;}
    var n=0;pw.groups.forEach(function(g){n+=(g.circles||[]).length;});
    if(!confirm('이 벽면의 관 '+n+'개를 전부 삭제할까요?'))return;
    pw.groups.length=0;
    if(mode==='del')setMode('all');
    draw();chips();
    try{mnPersistRec(rec);}catch(e){}
    toast('전체 삭제 완료');
  };
  setMode('all');
  /* 삭제모드: 캔버스·삭제버튼 외 다른 곳 터치 시 자동 해제 */
  wrap.addEventListener('pointerdown',function(e){
    if(mode!=='del')return;
    if(e.target===cv||cv.contains(e.target))return;
    var db=wrap.querySelector('#mnMdDel');
    if(db&&(e.target===db||db.contains(e.target)))return;
    setMode('all');
  },true);
  var bg=null;
  function loadBg(){bg=null;var u=rec.photos&&rec.photos[wall];if(!u){draw();return;}
    var im=new Image();im.crossOrigin='anonymous';
    im.onload=function(){bg=im;draw();};im.onerror=function(){bg=null;draw();};
    im.src=u;}
  wrap.querySelector('#mnReShoot').onclick=function(){if(mode==='del')setMode('all');mnShootSlot(rec,wall,function(){loadBg();});};
  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);
    ctx.setTransform(dpr*vz,0,0,dpr*vz,-vox*dpr,-voy*dpr);
    if(bg){var iw=bg.width,ih=bg.height;var k=Math.max(cssW/iw,cssH/ih);var dw=iw*k,dh=ih*k;ctx.globalAlpha=0.5;try{ctx.drawImage(bg,(cssW-dw)/2,(cssH-dh)/2,dw,dh);}catch(_e){}ctx.globalAlpha=1;}
    ctx.strokeStyle='#e4e8ee';ctx.lineWidth=1;
    for(var gx=100;gx<W;gx+=100){ctx.beginPath();ctx.moveTo(gx*sx,0);ctx.lineTo(gx*sx,cssH);ctx.stroke();}
    for(var gy=100;gy<H;gy+=100){ctx.beginPath();ctx.moveTo(0,gy*sy);ctx.lineTo(cssW,gy*sy);ctx.stroke();}
    /* 중심선 (빨강) */
    ctx.strokeStyle='#e05252';ctx.lineWidth=1.3;
    ctx.beginPath();ctx.moveTo(W/2*sx,0);ctx.lineTo(W/2*sx,cssH);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,H/2*sy);ctx.lineTo(cssW,H/2*sy);ctx.stroke();
    /* 바닥선 (노랑) */
    ctx.strokeStyle='#e6c200';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,cssH-1.5);ctx.lineTo(cssW,cssH-1.5);ctx.stroke();
    ctx.fillStyle='#c8a600';ctx.font='700 10px sans-serif';ctx.fillText('맨홀 바닥',6,cssH-7);
    pw.groups.forEach(function(g){(g.circles||[]).forEach(function(c){
      var r=c.dia/2*sy;
      var st=(c.st!=null?c.st:(c.fill?1:0));
      ctx.beginPath();ctx.arc(c.x*sx,(H-c.y)*sy,Math.max(r,3),0,Math.PI*2);
      ctx.fillStyle=(st===2?'#d32f2f':(st===1?'#222':'#fff'));ctx.fill();
      ctx.strokeStyle='#333';ctx.lineWidth=1.4;ctx.stroke();
    });});
  }
  function chips(){
    var o=wrap.querySelector('#mnGChips');
    o.innerHTML=pw.groups.length?pw.groups.map(function(g,i){
      return '<span style="display:inline-flex;align-items:center;gap:5px;border:1px solid #b9d7ea;background:#f2f8fd;color:#2471a3;border-radius:8px;padding:5px 8px;font-size:12px;font-weight:700">'+joseoEsc(mnGroupLabel(g))+'<button class="mn-gdel" data-i="'+i+'" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:13px;padding:0">✕</button></span>';
    }).join(''):'<span style="font-size:12px;color:#aab">아래에서 관그룹을 추가하세요</span>';
    [].forEach.call(o.querySelectorAll('.mn-gdel'),function(b){b.onclick=function(){pw.groups.splice(+b.getAttribute('data-i'),1);draw();chips();};});
  }
  function rowsN(){
    var rs=wrap.querySelector('#mnGRowsSel');
    if(rs.value==='_c')return Math.max(1,Math.min(12,parseInt(wrap.querySelector('#mnGRows').value)||1));
    return parseInt(rs.value)||1;
  }
  function rowsBox(){
    var n=rowsN();
    var o=wrap.querySelector('#mnGRowsBox');
    o.innerHTML=Array.apply(null,Array(n)).map(function(_,i){
      return '<div style="display:flex;gap:4px;align-items:center;margin-bottom:5px"><span style="flex:none;font-size:12px;color:#667;width:26px">'+(i+1)+'단</span>'
        +'<select class="mn-rdia" style="flex:1.1;min-width:0;border:1px solid #ddd;border-radius:7px;padding:6px 3px;font-size:13px;background:#fff"><option>100</option><option>50</option><option>80</option><option>150</option></select>'
        +'<select class="mn-rcnt-sel" style="flex:0.9;min-width:0;border:1px solid #ddd;border-radius:7px;padding:6px 3px;font-size:13px;background:#fff"><option selected>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option value="_c">직접</option></select>'
        +'<input class="mn-rcnt" type="number" min="1" max="12" value="6" inputmode="numeric" style="flex:0.9;min-width:0;border:1px solid #ddd;border-radius:7px;padding:6px 4px;font-size:13px;display:none">'
        +'<span style="flex:none;font-size:12px;color:#aab">/</span>'
        +'<select class="mn-rdia2" style="flex:1.1;min-width:0;border:1px solid #ddd;border-radius:7px;padding:6px 3px;font-size:13px;background:#fff;color:#889"><option value="-">관경</option><option>50</option><option>100</option><option>80</option><option>150</option></select>'
        +'<select class="mn-rcnt2-sel" style="flex:0.9;min-width:0;border:1px solid #ddd;border-radius:7px;padding:6px 3px;font-size:13px;background:#fff"><option selected>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option><option value="_c">직접</option></select>'
        +'<input class="mn-rcnt2" type="number" min="1" max="12" value="6" inputmode="numeric" style="flex:0.9;min-width:0;border:1px solid #ddd;border-radius:7px;padding:6px 4px;font-size:13px;display:none">'
        +'</div>';
    }).join('');
    [].forEach.call(o.querySelectorAll('.mn-rcnt-sel'),function(sel){
      sel.addEventListener('change',function(){
        var inp=sel.parentNode.querySelector('.mn-rcnt');
        inp.style.display=(sel.value==='_c')?'block':'none';
      });
    });
    [].forEach.call(o.querySelectorAll('.mn-rdia2'),function(sel){
      sel.addEventListener('change',function(){
        sel.style.color=(sel.value!=='-')?'#333':'#889';
      });
    });
    [].forEach.call(o.querySelectorAll('.mn-rcnt2-sel'),function(sel){
      sel.addEventListener('change',function(){
        var inp=sel.parentNode.querySelector('.mn-rcnt2');
        inp.style.display=(sel.value==='_c')?'block':'none';
      });
    });
  }
  wrap.querySelector('#mnGRowsSel').addEventListener('change',function(){
    if(mode==='del')setMode('all');
    wrap.querySelector('#mnGRows').style.display=(this.value==='_c')?'block':'none';
    rowsBox();
  });
  wrap.querySelector('#mnGRows').addEventListener('input',rowsBox);
  wrap.querySelector('#mnGKind').addEventListener('change',function(){if(mode==='del')setMode('all');wrap.querySelector('#mnGKindC').style.display=(this.value==='_c')?'block':'none';});
  rowsBox();chips();loadBg();
  wrap.querySelector('#mnGAdd').onclick=function(){
    if(mode==='del')setMode('all');
    var kd=wrap.querySelector('#mnGKind').value;
    if(kd==='_c')kd=wrap.querySelector('#mnGKindC').value.trim()||'FC';
    var rowSegs=[];
    var ds=wrap.querySelectorAll('.mn-rdia'),ss=wrap.querySelectorAll('.mn-rcnt-sel'),cs=wrap.querySelectorAll('.mn-rcnt');
    var d2s=wrap.querySelectorAll('.mn-rdia2'),s2s=wrap.querySelectorAll('.mn-rcnt2-sel'),c2s=wrap.querySelectorAll('.mn-rcnt2');
    for(var i=0;i<ds.length;i++){
      var segs=[];
      var cnt=(ss[i].value==='_c')?(parseInt(cs[i].value)||0):(parseInt(ss[i].value)||0);
      cnt=Math.max(0,Math.min(12,cnt));
      if(cnt>0)segs.push({dia:parseInt(ds[i].value)||100,cnt:cnt});
      if(d2s[i]&&d2s[i].value!=='-'){
        var cnt2=(s2s[i].value==='_c')?(parseInt(c2s[i].value)||0):(parseInt(s2s[i].value)||0);
        cnt2=Math.max(0,Math.min(12,cnt2));
        if(cnt2>0)segs.push({dia:parseInt(d2s[i].value)||50,cnt:cnt2});
      }
      if(segs.length)rowSegs.push(segs);
    }
    if(!rowSegs.length){toast('수량을 선택하세요');return;}
    var rows=[];rowSegs.forEach(function(sg){sg.forEach(function(s2){rows.push({dia:s2.dia,cnt:s2.cnt});});});
    var g={kind:kd,rows:rows,circles:[]};
    var maxX=0;pw.groups.forEach(function(og){(og.circles||[]).forEach(function(c){maxX=Math.max(maxX,c.x+c.dia/2);});});
    var x0=maxX?(maxX+150):150;
    var rowH=rowSegs.map(function(sg){var m=0;sg.forEach(function(s2){m=Math.max(m,s2.dia);});return m;});
    var totH=0;rowH.forEach(function(h){totH+=h;});
    var vv=Math.min(H,H/2+totH/2);
    rowSegs.forEach(function(sg,ri){
      var h=rowH[ri];var cy=vv-h/2;vv-=h;
      cy=Math.min(Math.max(cy,h/2),H-h/2);
      var xcur=x0;
      sg.forEach(function(s2){
        for(var j=0;j<s2.cnt;j++){
          var cx=xcur+s2.dia/2;xcur+=s2.dia;
          cx=Math.min(Math.max(cx,s2.dia/2),W-s2.dia/2);
          g.circles.push({x:Math.round(cx/25)*25,y:Math.round(cy/25)*25,dia:s2.dia,ri:ri,st:0,fill:false});
        }
      });
    });
    pw.groups.push(g);
    draw();chips();
  };
  var pDown=null,pTarget=null,pMoved=false;
  var _pts={},_pinch=null;
  function _ptCount(){var n=0;for(var k in _pts)n++;return n;}
  function hit(mx,my){
    for(var gi=pw.groups.length-1;gi>=0;gi--){var g=pw.groups[gi];
      for(var ci=(g.circles||[]).length-1;ci>=0;ci--){var c=g.circles[ci];
        var dx=mx-c.x,dy=my-c.y,rr=Math.max(c.dia*0.8,90);
        if(dx*dx+dy*dy<=rr*rr)return {gi:gi,ci:ci};
      }}
    return null;
  }
  function hitGroup(mx,my){
    for(var gi=pw.groups.length-1;gi>=0;gi--){var g=pw.groups[gi];
      var cs=g.circles||[];if(!cs.length)continue;
      var x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
      cs.forEach(function(c){x1=Math.min(x1,c.x-c.dia/2);x2=Math.max(x2,c.x+c.dia/2);y1=Math.min(y1,c.y-c.dia/2);y2=Math.max(y2,c.y+c.dia/2);});
      var pad=120;
      if(mx>=x1-pad&&mx<=x2+pad&&my>=y1-pad&&my<=y2+pad)return {gi:gi,ci:0};
    }
    return null;
  }
  function evPos(e){var r=cv.getBoundingClientRect();var bx=((e.clientX-r.left)+vox)/vz,by=((e.clientY-r.top)+voy)/vz;return [bx/sx,H-by/sy];}
  cv.addEventListener('pointerdown',function(e){
    _pts[e.pointerId]={x:e.clientX,y:e.clientY};
    if(_ptCount()===2){
      var ks=Object.keys(_pts),a=_pts[ks[0]],b=_pts[ks[1]];
      _pinch={d:Math.hypot(b.x-a.x,b.y-a.y),vz0:vz,vox0:vox,voy0:voy,mx:(a.x+b.x)/2,my:(a.y+b.y)/2};
      pDown=null;pTarget=null;pMoved=false;
      return;
    }
    var p=evPos(e);var _ex=hit(p[0],p[1]);
    pTarget=_ex||((mode==='all')?hitGroup(p[0],p[1]):null);
    if(pTarget)pTarget.exact=!!_ex;
    pDown={x:e.clientX,y:e.clientY,mx:p[0],my:p[1]};pMoved=false;
    if(pTarget)cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove',function(e){
    if(_pts[e.pointerId]){_pts[e.pointerId].x=e.clientX;_pts[e.pointerId].y=e.clientY;}
    if(_pinch&&_ptCount()===2){
      var ks=Object.keys(_pts),a=_pts[ks[0]],b=_pts[ks[1]];
      var nd=Math.hypot(b.x-a.x,b.y-a.y);
      var nmx=(a.x+b.x)/2,nmy=(a.y+b.y)/2;
      var r=cv.getBoundingClientRect();
      var bx=((_pinch.mx-r.left)+_pinch.vox0)/_pinch.vz0;
      var by=((_pinch.my-r.top)+_pinch.voy0)/_pinch.vz0;
      vz=_pinch.vz0*nd/Math.max(_pinch.d,1);
      vz=Math.min(5,Math.max(1,vz));
      vox=bx*vz-(nmx-r.left);voy=by*vz-(nmy-r.top);
      clampView();draw();
      return;
    }
    if(!pDown||!pTarget||mode==='del')return;
    var dxp=e.clientX-pDown.x,dyp=e.clientY-pDown.y;
    if(!pMoved&&dxp*dxp+dyp*dyp<49)return;
    pMoved=true;
    var p=evPos(e),dmx=p[0]-pDown.mx,dmy=p[1]-pDown.my;
    var g=pw.groups[pTarget.gi];if(!g)return;
    if(mode==='all'){
      g.circles.forEach(function(c){
        if(c._bx==null){c._bx=c.x;c._by=c.y;}
        c.x=Math.min(Math.max(Math.round((c._bx+dmx)/25)*25,c.dia/2),W-c.dia/2);
        c.y=Math.min(Math.max(Math.round((c._by+dmy)/25)*25,c.dia/2),H-c.dia/2);
      });
    }else{
      var c=g.circles[pTarget.ci];if(!c)return;
      if(c._bx==null){c._bx=c.x;c._by=c.y;}
      c.x=Math.min(Math.max(Math.round((c._bx+dmx)/25)*25,c.dia/2),W-c.dia/2);
      c.y=Math.min(Math.max(Math.round((c._by+dmy)/25)*25,c.dia/2),H-c.dia/2);
    }
    draw();
  });
  function pEnd(){
    if(pDown&&pTarget&&!pMoved&&pTarget.exact){
      var g=pw.groups[pTarget.gi],c=g&&g.circles[pTarget.ci];
      if(c){
        if(mode==='del'){
          g.circles.splice(pTarget.ci,1);
          if(!g.circles.length)pw.groups.splice(pTarget.gi,1);
          draw();chips();
        }else{var st=(c.st!=null?c.st:(c.fill?1:0));st=(st+1)%3;c.st=st;c.fill=(st===1);draw();chips();}
      }
    }
    pw.groups.forEach(function(g){(g.circles||[]).forEach(function(c){delete c._bx;delete c._by;});});
    pDown=null;pTarget=null;pMoved=false;
  }
  cv.addEventListener('pointerup',function(e){delete _pts[e.pointerId];if(_ptCount()<2)_pinch=null;pEnd();});
  cv.addEventListener('pointercancel',function(e){delete _pts[e.pointerId];if(_ptCount()<2)_pinch=null;pEnd();});
  /* PC 휠 줌 */
  cv.addEventListener('wheel',function(e){
    e.preventDefault();
    var r=cv.getBoundingClientRect();
    var oz=vz;
    vz=Math.min(5,Math.max(1,vz*(e.deltaY<0?1.12:1/1.12)));
    if(vz===oz)return;
    var bx=((e.clientX-r.left)+vox)/oz,by=((e.clientY-r.top)+voy)/oz;
    vox=bx*vz-(e.clientX-r.left);voy=by*vz-(e.clientY-r.top);
    clampView();draw();
  },{passive:false});
  wrap.querySelector('#mnPClose').onclick=function(){wrap.remove();mnOpenForm(rec);};
  wrap.querySelector('#mnPDone').onclick=function(){mnPersistRec(rec,'관배치 저장됨');wrap.remove();mnOpenForm(rec);};
}
/* ===================== 실시간 사진조서 (관로) ===================== */
var JOSEO_TPL_URL = encodeURI('실시간조서_템플릿.xlsx');
var _joseoTplBuf = null, joseoState = null;
var JOSEO_PER_PAGE = 2;

function joseoEsc(s){ return (s==null?'':String(s)).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function joseoGetTemplate(){
  if(_joseoTplBuf) return Promise.resolve(_joseoTplBuf);
  return fetch(JOSEO_TPL_URL).then(function(r){ if(!r.ok) throw new Error('템플릿 로드 실패('+r.status+')'); return r.arrayBuffer(); }).then(function(b){ _joseoTplBuf=b; return b; });
}
function joseoDateK(d){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(d||'');return m?(m[1]+'년 '+(+m[2])+'월 '+(+m[3])+'일'):(d||'');}
function joseoDate(no){ var d=(no||'').toString().slice(0,6); if(d.length<6) return ''; return '20'+d.slice(0,2)+'-'+d.slice(2,4)+'-'+d.slice(4,6); }
function joseoParseCode(code){
  var c=(code||'').replace(/(^|\s)T(?=\s|$)/g,' ').replace(/\s+/g,' ').trim();   // 내부표시 T 제거
  var m=/^([A-Za-z]+)\s*(.*)$/.exec(c);
  return { mat: m?m[1]:c, dia: m?((m[2]||'').trim()):'' };
}
function joseoPoints(){
  return (state.points||[]).filter(function(p){
    if(!p||!p.no) return false;
    if(isManhole(p)) return false;                                              // 맨홀 제외
    if(/보강판/.test((p.no||'')+'|'+(p.code||''))) return false;                 // 보강판 제외
    return true;
  });
}
function joseoGroups(){
  var g={}; joseoPoints().forEach(function(p){ var dk=joseoDate(p.no); if(!dk) return; (g[dk]=g[dk]||[]).push(p); });
  Object.keys(g).forEach(function(dk){ g[dk].sort(function(a,b){ return (parseFloat(ptNum(a))||0)-(parseFloat(ptNum(b))||0); }); });
  return g;
}
function joseoRec(p){
  var pc=joseoParseCode(p.code), biz=state.bizInfo||{};
  return {
    date: joseoDate(p.no), name: ptNum(p), fullNo: p.no,
    x: (p.y!=null&&p.y!=='')?(+p.y).toFixed(3):'',                              // X(N)=북=p.y
    y: (p.x!=null&&p.x!=='')?(+p.x).toFixed(3):'',                              // Y(E)=동=p.x
    facility: biz.facility||'', mat: pc.mat, dia: pc.dia, gap:'직접측량', depth:'',
    expUrl: photoMap[p.no]||photoMap[ptNum(p)]||null,
    aftUrl: afterMap[p.no]||afterMap[ptNum(p)]||null,
    expBuf:null, aftBuf:null
  };
}
function joseoFetchBuf(url){
  if(!url) return Promise.resolve(null);
  return fetch(url).then(function(r){ return r.ok? r.arrayBuffer():null; }).catch(function(){ return null; });
}

/* ---- ExcelJS 채우기 (Node 검증 로직 그대로) ---- */
var JOSEO_BM=['B3:C3','E3:G3','A4:B4','C4:C5','D4:D5','E4:E5','F4:F5','G4:G5','A7:C7','D7:G7','A8:C18','D8:G18','A19:C19','D19:G19']; // 블록(17행, 라벨=사진아래) 병합, row3 기준
function joseoShift(rng,dr){ return rng.replace(/([A-G])(\d+)/g,function(_,c,n){ return c+(parseInt(n,10)+dr); }); }
function joseoSetv(ws,a,v){ if(v!==undefined&&v!==null&&v!=='') ws.getCell(a).value=v; }
function joseoFillBlk(ws,S,p){ joseoSetv(ws,'B'+S,joseoDateK(p.date));joseoSetv(ws,'E'+S,p.name);joseoSetv(ws,'A'+(S+3),p.x);joseoSetv(ws,'B'+(S+3),p.y);joseoSetv(ws,'C'+(S+3),p.facility);joseoSetv(ws,'D'+(S+3),p.mat);joseoSetv(ws,'E'+(S+3),p.dia);joseoSetv(ws,'F'+(S+3),p.gap); }
function joseoStampBlk(ws,S,BLK){
  for(var k=0;k<BLK.length;k++){ var tr=S+k; ws.getRow(tr).height=BLK[k].h; for(var c=1;c<=7;c++){ var t=ws.getCell(tr,c); t.style=BLK[k].row[c-1].style; t.value=BLK[k].row[c-1].value; } }
  JOSEO_BM.forEach(function(mm){ try{ ws.mergeCells(joseoShift(mm,S-3)); }catch(e){} });
}
function joseoAddPhotosBlk(wb,ws,S,p){
  var top=S+5, bot=S+15;
  if(p.expBuf){ var id=wb.addImage({buffer:p.expBuf,extension:'jpeg'}); ws.addImage(id,'A'+top+':C'+bot); }
  if(p.aftBuf){ var id2=wb.addImage({buffer:p.aftBuf,extension:'jpeg'}); ws.addImage(id2,'D'+top+':G'+bot); }
}
async function joseoBuildWb(projectName, recs, perPage){
  var tplBuf=await joseoGetTemplate();
  var wb=new ExcelJS.Workbook(); await wb.xlsx.load(tplBuf);
  var ws=wb.worksheets[0];
  var BLK=[]; for(var r=3;r<=19;r++){ var row=[]; for(var c=1;c<=7;c++){ var s=ws.getCell(r,c); row.push({style:s.style,value:s.value}); } BLK.push({h:ws.getRow(r).height,row:row}); }
  joseoSetv(ws,'B2',projectName||'');
  for(var i=0;i<recs.length;i++){ var S=3+i*17; if(i>=1) joseoStampBlk(ws,S,BLK); joseoFillBlk(ws,S,recs[i]); joseoAddPhotosBlk(wb,ws,S,recs[i]); }
  // G열(폼 오른쪽 외곽선) 굵기 통일 — 2번째 블록 이후도 medium (병합셀은 마스터셀에 적용됨)
  var joseoLastRow=2+recs.length*17;
  for(var gr=3;gr<=joseoLastRow;gr++){ var gc=ws.getCell(gr,7); var gb=gc.border||{}; gc.border={top:gb.top,left:gb.left,bottom:gb.bottom,right:{style:'medium',color:{argb:'FF000000'}}}; }
  ws.pageSetup.margins={left:0.2,right:0.2,top:0.3,bottom:0.3,header:0.2,footer:0.2};
  ws.pageSetup.fitToPage=false;
  var K=perPage||JOSEO_PER_PAGE, N=recs.length;
  for(var m=K;m<N;m+=K){ ws.getRow(2+m*17).addPageBreak(); }
  return wb;
}
async function joseoFetchPhotos(recs,onProg){
  var total=0; recs.forEach(function(r){ if(r.expUrl)total++; if(r.aftUrl)total++; }); var done=0;
  for(var i=0;i<recs.length;i++){ var r=recs[i];
    if(r.expUrl){ r.expBuf=await joseoFetchBuf(r.expUrl); done++; if(onProg)onProg(done,total); }
    if(r.aftUrl){ r.aftBuf=await joseoFetchBuf(r.aftUrl); done++; if(onProg)onProg(done,total); }
  }
}
function joseoFileName(dk){ return (state.projectName||'조서')+'_'+dk.replace(/-/g,'')+'.xlsx'; }
function joseoSaveBlob(data,name){
  var blob=(data instanceof Blob)?data:new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },2000);
}

/* ---- 패널 UI ---- */
function joseoProg(msg,frac){
  var w=document.getElementById('joseoProgWrap'), b=document.getElementById('joseoProgBar'), t=document.getElementById('joseoProgTxt');
  if(!w)return; w.style.display='block'; if(t)t.textContent=msg||''; if(b)b.style.width=Math.max(0,Math.min(1,frac||0))*100+'%';
}
function joseoProgHide(){ var w=document.getElementById('joseoProgWrap'); if(w)w.style.display='none'; }
function joseoEnsureLibs(){ if(typeof ExcelJS==='undefined'){ toast('엑셀 모듈 로딩 안됨 — 새로고침(Ctrl+Shift+R)'); return false; } return true; }
function tgPanelLayout(on){var st=document.querySelector('.stage');var sb=document.getElementById('subbar');if(st)st.style.marginBottom=(on&&(typeof _tgCtx==='undefined'||_tgCtx!=='attr'))?'34vh':'';if(sb)sb.style.display=on?'none':'';if(typeof tgInfoLayout==='function')tgInfoLayout(on);if(on){var ff=function(){try{if(typeof tgFitAll==='function')tgFitAll();else if(typeof fitView==='function')fitView();}catch(e){}};setTimeout(ff,110);setTimeout(ff,380);}}
function _tgMode(){var p=document.getElementById('tangoPanel');if(p&&p.style.display!=='none')return true;var ip=document.getElementById('tgInfoPanel');return !!(ip&&ip.style.display==='flex');}var _tgSelNo=null,_tgSelXY=null;function tgSelMark(){var g=(typeof gAnc!=='undefined'&&gAnc)?gAnc:cv;var el=document.getElementById('tgSelBox');if(!_tgSelXY||(typeof _tgMode==='function'&&!_tgMode())||(typeof LV!=='undefined'&&LV&&LV.selbox===0)){if(el)el.style.display='none';return;}var _col=(mode==='tgptedit')?'#ff1744':'#19a974';var u=(typeof pxToWorld==='function')?pxToWorld():0.1;var sz=u*22;if(!el){el=document.createElementNS('http://www.w3.org/2000/svg','rect');el.id='tgSelBox';el.setAttribute('fill','none');el.setAttribute('stroke','#ff1744');el.setAttribute('pointer-events','none');g.appendChild(el);}el.setAttribute('stroke',_col);el.setAttribute('stroke-width',u*2.5);el.setAttribute('x',_tgSelXY.x-sz/2);el.setAttribute('y',(-_tgSelXY.y)-sz/2);el.setAttribute('width',sz);el.setAttribute('height',sz);el.style.display='';}function tgPtEditToggle(){if(mode==='tgptedit'){mode='pan';_tgSelNo=null;_tgSelXY=null;var _sb=document.getElementById('tgSelBox');if(_sb)_sb.style.display='none';}else{mode='tgptedit';if(typeof toast==='function')toast('측점을 클릭하면 정보가 표시됩니다');}if(typeof setModeUI==='function')setModeUI();if(typeof drawGeo==='function')drawGeo();if(typeof tangoSelSeg==='function'&&tgSeg>=0)tangoSelSeg(tgSeg);}function tgToggleT(no){if(!no)return;var q=(typeof pointByNo==='function')?pointByNo(no):null;if(!q)return;if(typeof tgSnap==='function')tgSnap();q.isT=!q.isT;var _b=(q.code||'').replace(/^T\s*/i,'');q.code=(q.isT?('T'+(_b?' ':'')):'')+_b;q._tcode=undefined;if(state._pointsOrig){var _o=state._pointsOrig.filter(function(z){return z.x===q.x&&z.y===q.y;})[0];if(_o){_o.isT=q.isT;_o.code=q.code;_o._tcode=undefined;}}if(typeof tangoFill==='function')tangoFill();if(typeof tgSeg!=='undefined'&&tgSeg>=0&&typeof tangoSelSeg==='function')tangoSelSeg(tgSeg);if(typeof drawGeo==='function')drawGeo();if(typeof saveProject==='function')saveProject();}function openCodeEdit(no,ev){var p=(typeof pointByNo==='function')?pointByNo(no):null;if(!p)return;var ex=document.getElementById('_codeEditPop');if(ex)ex.remove();var _mx=(ev&&ev.clientX!=null)?ev.clientX:220,_my=(ev&&ev.clientY!=null)?ev.clientY:220;var code=(p.code||'').trim();var _tm=/^T(?=$|\s|x)/i.exec(code);var _isTp=!!p.isT||!!_tm;var _cb=_tm?code.slice(_tm[0].length).replace(/^\s+/,''):code;var prefix='',cnt='';var xi=_cb.toLowerCase().lastIndexOf('x');if(xi>=0){prefix=_cb.slice(0,xi).trim();cnt=_cb.slice(xi+1).trim();}else if(_cb){prefix=_cb;}var wrap=document.createElement('div');wrap.id='_codeEditPop';wrap.style.cssText='position:fixed;z-index:10001;left:'+_mx+'px;top:'+(_my+10)+'px;background:#fffde7;border:1px solid #d32f2f;border-radius:5px;padding:6px;display:flex;gap:3px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,0.2)';var mk=function(v,ph,w,col){var i=document.createElement('input');i.className='ptin';i.value=v;i.placeholder=ph;i.style.cssText='font-size:14px;font-weight:700;color:'+(col||'#333')+';border:1px solid #ccc;border-radius:3px;padding:2px 5px;outline:none;width:'+w+'px';return i;};var iT=mk(_isTp?'T':'','T',26,'#e53935'),iCnt=mk(cnt,'관수',42,'#0f7a86');var _exts=(typeof TG_OPT!=='undefined'&&TG_OPT.ext)?TG_OPT.ext.slice():[];if(prefix&&_exts.indexOf(prefix)<0)_exts.unshift(prefix);var iPre=document.createElement('select');iPre.style.cssText='font-size:13px;font-weight:700;color:#0f7a86;border:1px solid #ccc;border-radius:3px;padding:2px 3px;outline:none;width:98px';var _o0=document.createElement('option');_o0.value='';_o0.textContent='(외관)';iPre.appendChild(_o0);_exts.forEach(function(o){var op=document.createElement('option');op.value=o;op.textContent=o;if(o===prefix)op.selected=true;iPre.appendChild(op);});var fx=function(t){var s=document.createElement('span');s.textContent=t;s.style.cssText='font-weight:800;color:#9a9a93;align-self:center;padding:0 1px';return s;};wrap.appendChild(iT);wrap.appendChild(iPre);wrap.appendChild(fx('x'));wrap.appendChild(iCnt);var _okb=document.createElement('button');_okb.textContent='✓';_okb.title='완료';_okb.style.cssText='margin-left:4px;font-size:13px;font-weight:800;color:#fff;background:#16a34a;border:none;border-radius:4px;padding:3px 9px;cursor:pointer';_okb.onmousedown=function(e){e.stopPropagation();e.preventDefault();done();};wrap.appendChild(_okb);document.body.appendChild(wrap);iPre.focus();var _oc=null;var done=function(){if(!wrap.parentNode)return;if(_oc)document.removeEventListener('mousedown',_oc);var _tv=iT.value.trim(),_pv=iPre.value.trim(),_cv=iCnt.value.trim();wrap.remove();if(typeof tgSnap==='function')tgSnap();p.isT=/^t/i.test(_tv);var _bd=_pv?(_pv+'x'+_cv):'';p.code=(p.isT?('T'+(_bd?' ':'')):'')+_bd;p._tcode=undefined;if(state._pointsOrig){var _o=state._pointsOrig.filter(function(z){return z.x===p.x&&z.y===p.y;})[0];if(_o){_o.isT=p.isT;_o.code=p.code;_o._tcode=undefined;}}if(_pv){var _si=(typeof tgSeg!=='undefined'&&tgSeg>=0)?tgSeg:((typeof tgFindSeg==='function')?tgFindSeg(no):-1);if(_si>=0&&typeof _tgSegs!=='undefined'&&_tgSegs&&_tgSegs[_si]){_tgSegs[_si].forEach(function(nd){if(nd.mh||nd.riser||!nd.no)return;var _q=(typeof pointByNo==='function')?pointByNo(nd.no):null;if(!_q)return;_q.code=(_q.isT?'T ':'')+_pv+'x'+_cv;_q._tcode=undefined;if(state._pointsOrig){var _oo=state._pointsOrig.filter(function(z){return z.x===_q.x&&z.y===_q.y;})[0];if(_oo){_oo.code=_q.code;_oo._tcode=undefined;}}});}}if(typeof tangoFill==='function')tangoFill();if(typeof tgSeg!=='undefined'&&tgSeg>=0&&typeof tangoSelSeg==='function')tangoSelSeg(tgSeg);if(typeof drawGeo==='function')drawGeo();if(typeof saveProject==='function')saveProject();};var onKey=function(e){if(e.key==='Enter'||e.key==='Escape'){e.stopPropagation();done();}else e.stopPropagation();};[iT,iPre,iCnt].forEach(function(i){i.addEventListener('keydown',onKey);});_oc=function(e){if(wrap.parentNode&&!wrap.contains(e.target))done();};setTimeout(function(){document.addEventListener('mousedown',_oc);},60);}function tgFindSeg(no){if(typeof _tgSegs==='undefined'||!_tgSegs)return -1;for(var i=0;i<_tgSegs.length;i++){var sg=_tgSegs[i];for(var j=0;j<sg.length;j++)if(sg[j].no===no)return i;}return -1;}function tgSurvScroll(){var _tw=document.querySelector('.tgwrap');if(!_tw)return;[].forEach.call(_tw.querySelectorAll('.tgfacHL'),function(x){x.classList.remove('tgfacHL');});var _sc=document.getElementById('tgcolSurvey');if(_sc){var _wr=_tw.getBoundingClientRect(),_cr=_sc.getBoundingClientRect();_tw.scrollLeft=Math.max(0,_tw.scrollLeft+(_cr.left-_wr.left)-(_tw.clientWidth/2)+(_cr.width/2));}}function tgBotRowClick(si,ri){var nd=(typeof _tgSegs!=='undefined'&&_tgSegs&&_tgSegs[si])?_tgSegs[si][ri]:null;if(!nd){if(typeof tangoSelSeg==='function')tangoSelSeg(si);return;}if(nd.mh){if(typeof tgSelectMh==='function')tgSelectMh(nd.x,nd.y);if(typeof drawGeo==='function')drawGeo();var _bp=(ri===0)?'s':((_tgSegs[si]&&ri===_tgSegs[si].length-1)?'e':null);if(_bp&&typeof tgFacHL==='function')tgFacHL(_bp);}else if(nd.no){if(typeof tgSelectPt==='function')tgSelectPt(nd.no);if(typeof drawGeo==='function')drawGeo();}else{if(typeof tangoSelSeg==='function')tangoSelSeg(si);}}function tgSelectPt(no){_tgSelNo=no;var _sp=(typeof pointByNo==='function')?pointByNo(no):null;_tgSelXY=_sp?{x:_sp.x,y:_sp.y}:null;if(typeof tgSurvScroll==='function')tgSurvScroll();var _wa=(tgSeg<0);var si=tgFindSeg(no);if(si>=0){tgSeg=si;if(typeof tgSegGo==='function')tgSegGo(si,_wa);else if(typeof tangoSelSeg==='function')tangoSelSeg(si,_wa);}else if(typeof tangoSelSeg==='function'&&tgSeg>=0){tangoSelSeg(tgSeg);}if(tgSeg>=0&&typeof _tgSegs!=='undefined'&&_tgSegs&&_tgSegs[tgSeg]){var _sri=-1;for(var _sq=0;_sq<_tgSegs[tgSeg].length;_sq++){if(_tgSegs[tgSeg][_sq].no===no){_sri=_sq;break;}}if(_sri>=0)setTimeout(function(){var _str=document.getElementById('tgsr'+_sri);if(_str&&_str.scrollIntoView)_str.scrollIntoView({block:'center',behavior:'smooth'});var _key=(typeof tgManualKey==='function'&&_tgSegs[tgSeg])?tgManualKey(_tgSegs[tgSeg]):null;if(_key){var _old=document.querySelectorAll('.tgwrap tr.tgsegrow,.tgwrap tr.tgselrow');[].forEach.call(_old,function(x){x.classList.remove('tgsegrow');x.classList.remove('tgselrow');x.style.background='';x.style.outline='';});var _segrows=document.querySelectorAll('.tgwrap tr[data-tgkey="'+_key+'"]');[].forEach.call(_segrows,function(x){x.classList.add('tgsegrow');x.style.background='#eafaef';});var _hr=document.querySelector('.tgwrap tr[data-tgkey="'+_key+'"][data-ri="'+_sri+'"]');if(_hr){_hr.classList.add('tgselrow');_hr.style.background='#a8e6b8';if(_hr.scrollIntoView)_hr.scrollIntoView({block:'center',behavior:'smooth'});}}},40);}}function tgGotoPt(x,y){if(typeof vb==='undefined')return;vb.x=x-vb.w/2;vb.y=(-y)-vb.h/2;if(typeof applyVB==='function')applyVB();if(typeof drawGeo==='function')drawGeo();}function tgSelectMh(wx,wy){var bi=-1,bri=-1,bd=1e18,bx=0,by=0;if(_tgSegs)for(var i=0;i<_tgSegs.length;i++){var sg=_tgSegs[i];for(var j=0;j<sg.length;j++){var nd=sg[j];if(!nd.mh)continue;var dd=Math.hypot(nd.x-wx,nd.y-wy);if(dd<bd){bd=dd;bi=i;bri=j;bx=nd.x;by=nd.y;}}}var tol=Math.max((typeof pxToWorld==='function')?pxToWorld()*26:3,2);if(bi<0||bd>tol){var bd2=1e18;if(_tgSegs)for(var i2=0;i2<_tgSegs.length;i2++){var sg2=_tgSegs[i2];for(var j2=0;j2<sg2.length;j2++){var nd2=sg2[j2];var dd2=Math.hypot(nd2.x-wx,nd2.y-wy);if(dd2<bd2){bd2=dd2;bi=i2;bri=j2;bx=nd2.x;by=nd2.y;}}}var tol2=Math.max((typeof pxToWorld==='function')?pxToWorld()*40:5,4);if(bi<0||bd2>tol2)return false;}var _wa=true;tgSeg=bi;_tgSelNo=null;_tgSelXY={x:bx,y:by};if(typeof tangoSelSeg==='function')tangoSelSeg(bi,_wa);setTimeout(function(){var r=document.getElementById('tgsr'+bri);if(r&&r.scrollIntoView)r.scrollIntoView({block:'center',behavior:'smooth'});var _sg=_tgSegs[bi]||[];var _fid=(bri===0)?'tgmeta_start':((bri===_sg.length-1)?'tgmeta_end':null);['tgmeta_start','tgmeta_end'].forEach(function(id){var e=document.getElementById(id);if(e)for(var c=0;c<e.children.length;c++)e.children[c].style.background=(c===0?'#eaf1ff':'');});if(_fid){var fr=document.getElementById(_fid);if(fr)for(var c=0;c<fr.children.length;c++)fr.children[c].style.background='#bdf0c8';}},40);return true;}function tgShowTip(el,txt){var t=document.getElementById('_ftip');if(!t){t=document.createElement('div');t.id='_ftip';t.style.cssText='position:fixed;background:#fff;color:#d32f2f;border:1.5px solid #d32f2f;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;z-index:99999;pointer-events:none';document.body.appendChild(t);}t.textContent=txt;var r=el.getBoundingClientRect();t.style.left=(r.right+8)+'px';t.style.top=(r.top+r.height/2-9)+'px';t.style.display='block';}function tgHideTip(){var t=document.getElementById('_ftip');if(t)t.style.display='none';}function tgFacHL(pre){var _tw=document.querySelector('.tgwrap');var _tc=document.getElementById(pre==='s'?'tgcolStart':'tgcolEnd');if(_tw&&_tc){var _twr=_tw.getBoundingClientRect(),_tcr=_tc.getBoundingClientRect();var _rw=_tw.querySelector('tr.seg0[data-seg="'+((typeof tgSeg!=='undefined')?tgSeg:-1)+'"]');var _topD=0;if(_rw){var _rr=_rw.getBoundingClientRect(),_th=_tw.querySelector('thead'),_thh=_th?_th.getBoundingClientRect().height:0;_topD=(_rr.top-_twr.top)-_thh-2;}_tw.scrollTo({left:_tw.scrollLeft+(_tcr.left-_twr.left)-(_tw.clientWidth/2)+(_tcr.width/2),top:Math.max(0,_tw.scrollTop+_topD),behavior:'smooth'});[].forEach.call(_tw.querySelectorAll('.tgfacHL'),function(x){x.classList.remove('tgfacHL');});var _hl=function(el){if(el)el.classList.add('tgfacHL');};_hl(_tc);var _thd=_tc.closest('thead');if(_thd){var _hr2=_thd.querySelectorAll('tr');if(_hr2.length>=2){var _sub=_hr2[1].querySelectorAll('th');var _off=(pre==='s'?0:5);for(var _hi=_off;_hi<_off+5;_hi++)_hl(_sub[_hi]);}}var _sk=(typeof _tgSegs!=='undefined'&&_tgSegs&&typeof tgSeg!=='undefined'&&tgSeg>=0&&_tgSegs[tgSeg]&&typeof tgManualKey==='function')?tgManualKey(_tgSegs[tgSeg]):null;if(_sk){[].forEach.call(_tw.querySelectorAll('[data-seg="'+_sk+'"]'),function(c){var _fd=c.getAttribute('data-field')||'';if(_fd.indexOf(pre+'_')===0){var _td=c.closest('td');if(_td)_hl(_td);}});}}}function tgGotoFac(pre){if(tgSeg<0||!_tgSegs||!_tgSegs[tgSeg])return;var sg=_tgSegs[tgSeg];var nd=(pre==='s')?sg[0]:sg[sg.length-1];if(nd){_tgSelNo=null;_tgSelXY={x:nd.x,y:nd.y};if(typeof tgGotoPt==='function')tgGotoPt(nd.x,nd.y);if(typeof drawGeo==='function')drawGeo();if(typeof tgFacHL==='function')tgFacHL(pre);}}function tgHover(p){var g=(typeof gAnc!=='undefined'&&gAnc)?gAnc:cv;var el=document.getElementById('tgHoverBox');if(!p){if(el)el.style.display='none';return;}var u=(typeof pxToWorld==='function')?pxToWorld():0.1;var sz=u*18;if(!el){el=document.createElementNS('http://www.w3.org/2000/svg','rect');el.id='tgHoverBox';el.setAttribute('fill','none');el.setAttribute('stroke','#ff1744');el.setAttribute('pointer-events','none');g.appendChild(el);}el.setAttribute('stroke-width',u*2);el.setAttribute('x',p.x-sz/2);el.setAttribute('y',(-p.y)-sz/2);el.setAttribute('width',sz);el.setAttribute('height',sz);el.style.display='';}function _tgScrollRowCenter(key,ri){var w=document.querySelector('.tgwrap');if(!w)return null;var r=w.querySelector('tr[data-tgkey="'+key+'"][data-ri="'+ri+'"]');if(!r)return null;var wr=w.getBoundingClientRect(),rr=r.getBoundingClientRect();w.scrollTop+=(rr.top-wr.top)-(w.clientHeight/2)+(rr.height/2);return r;}function _tgHiliteBotRow(key,ri){if(typeof _tgInsp!=='undefined'&&_tgInsp)return;var w=document.querySelector('.tgwrap');if(!w)return;var all=w.querySelectorAll('tr[data-tgkey]');for(var i=0;i<all.length;i++){var m=(all[i].getAttribute('data-tgkey')===key&&all[i].getAttribute('data-ri')===(''+ri));all[i].style.background=m?'#eafaef':'';}}function tgRowClick(ri){if(tgSeg<0||typeof _tgSegs==='undefined'||!_tgSegs||!_tgSegs[tgSeg])return;var nd=_tgSegs[tgSeg][ri];if(!nd)return;_tgSelNo=nd.no||('__r'+ri);_tgSelXY={x:nd.x,y:nd.y};if(nd.mh){var _rpre=(ri===0)?'s':((_tgSegs[tgSeg]&&ri===_tgSegs[tgSeg].length-1)?'e':null);if(_rpre&&typeof tgFacHL==='function')tgFacHL(_rpre);}else if(typeof tgSurvScroll==='function')tgSurvScroll();if(typeof tgGotoPt==='function')tgGotoPt(nd.x,nd.y);if(typeof tangoSelSeg==='function')tangoSelSeg(tgSeg);var _hk=(typeof tgManualKey==='function'&&_tgSegs[tgSeg])?tgManualKey(_tgSegs[tgSeg]):null;if(_hk){_tgHiliteBotRow(_hk,ri);_tgScrollRowCenter(_hk,ri);}}function tgRowEdit(ri){if(tgSeg<0||typeof _tgSegs==='undefined'||!_tgSegs||!_tgSegs[tgSeg])return;var nd=_tgSegs[tgSeg][ri];if(!nd||nd.mh)return;var no=nd.no;if(!no)return;var _tq=state.tamsa?(typeof pointByNo==='function'?pointByNo(no):null):null;var cur=_tq?(_tq.z!=null?(+_tq.z).toFixed(2):''):((state._depthByNo&&state._depthByNo[no]!=null)?(+state._depthByNo[no]).toFixed(2):'');var nv=prompt('심도값 수정 (m) — 측점 '+no,cur);if(nv==null||!(''+nv).trim()||!isFinite(parseFloat(nv)))return;if(typeof tgSnap==='function')tgSnap();if(_tq){_tq.z=parseFloat(nv);}else{if(!state._depthByNo)state._depthByNo={};state._depthByNo[no]=parseFloat(nv);}if(typeof saveProject==='function')saveProject();if(typeof tangoFill==='function')tangoFill();if(typeof tangoSelSeg==='function'&&tgSeg>=0)tangoSelSeg(tgSeg);if(typeof drawGeo==='function')drawGeo();}function tgPtDelete(ri){if(tgSeg<0||typeof _tgSegs==='undefined'||!_tgSegs||!_tgSegs[tgSeg])return;var nd=_tgSegs[tgSeg][ri];if(!nd||nd.mh)return;var no=nd.no;if(!no)return;if(!confirm('측점 '+no+' 을(를) 삭제하시겠습니까?\n(탱고성과에서만 빠지며 양옆 결선이 자동 연결됩니다)'))return;if(typeof tgSnap==='function')tgSnap();var px=nd.x,py=nd.y;var idx=-1;for(var i=0;i<state.points.length;i++){if(state.points[i].no===no){idx=i;break;}}if(idx>=0)state.points.splice(idx,1);var orphan=[],_proto=null;for(var k=state.lines.length-1;k>=0;k--){var L=state.lines[k];if(!L||!L.pts){state.lines.splice(k,1);continue;}var hasM=false;for(var j=0;j<L.pts.length;j++){if(Math.hypot(L.pts[j][0]-px,L.pts[j][1]-py)<=0.06){hasM=true;break;}}if(!hasM)continue;if(L.pts.length>2){L.pts=L.pts.filter(function(pt){return Math.hypot(pt[0]-px,pt[1]-py)>0.06;});if(L.pts.length<2)state.lines.splice(k,1);}else{_proto=L;L.pts.forEach(function(pt){if(Math.hypot(pt[0]-px,pt[1]-py)>0.06)orphan.push(pt);});state.lines.splice(k,1);}}if(orphan.length===2){var nl={pts:[orphan[0],orphan[1]]};if(_proto){for(var pk in _proto){if(pk!=='pts')nl[pk]=_proto[pk];}}state.lines.push(nl);}if(state._depthByNo)delete state._depthByNo[no];_tgSelNo=null;_tgSelXY=null;if(typeof saveProject==='function')saveProject();if(typeof tangoFill==='function')tangoFill();if(typeof tangoSelSeg==='function'&&tgSeg>=0)tangoSelSeg(tgSeg);if(typeof drawGeo==='function')drawGeo();}var _segFix=null,_segFixOrig=-1;function tgSegFixToggle(){if(mode==='tgsegfix'){mode='pan';_segFix=null;if(typeof tgSegFixRubber==='function')tgSegFixRubber(null);var _fh0=document.getElementById('tgFixHov');if(_fh0)_fh0.remove();}else{if(typeof tgSeg==='undefined'||tgSeg<0){alert('\uC218\uC815\uD560 \uAD6C\uAC04\uC744 \uBA3C\uC800 \uC120\uD0DD\uD558\uC138\uC694 (\uAD6C\uAC04 \uBC84\uD2BC \uD074\uB9AD)');return;}mode='tgsegfix';_segFix=null;_segFixOrig=tgSeg;if(typeof toast==='function')toast('\uC2DC\uC791 \uC2DC\uC124\uBB3C \uD074\uB9AD \u2192 \uC885\uB8CC \uC2DC\uC124\uBB3C \uD074\uB9AD');}if(typeof setModeUI==='function')setModeUI();if(typeof drawGeo==='function')drawGeo();if(typeof tgInfoRender==='function')tgInfoRender(typeof tgSeg!=='undefined'?tgSeg:-1);}function tgSegResetAll(){var _fs=state.tgFixSegs||[],_sd=state.tgSegDel||{};var _n=_fs.length+Object.keys(_sd).length;if(!_n){if(typeof toast==='function')toast('\uB9AC\uC14B\uD560 \uAD6C\uAC04\uC218\uC815\u00B7\uAD6C\uAC04\uC0AD\uC81C \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4');return;}if(!confirm('\uAD6C\uAC04\uC218\uC815\u00B7\uAD6C\uAC04\uC0AD\uC81C \uB0B4\uC5ED\uC744 \uBAA8\uB450 \uC9C0\uC6B0\uACE0 \uC790\uB3D9\uBD84\uD560 \uC0C1\uD0DC\uB85C \uB418\uB3CC\uB9BD\uB2C8\uB2E4. \uACC4\uC18D\uD560\uAE4C\uC694?'))return;if(typeof tgSnap==='function')tgSnap();if(state.tgFixSegs)state.tgFixSegs.length=0;else state.tgFixSegs=[];if(state.tgSegDel){for(var _k in state.tgSegDel)delete state.tgSegDel[_k];}else state.tgSegDel={};if(typeof mode!=='undefined'&&mode==='tgsegfix'){mode='pan';if(typeof setModeUI==='function')setModeUI();}_segFixOrig=-1;if(typeof tangoFill==='function')tangoFill();if(typeof saveProject==='function')saveProject();tgSeg=-1;if(typeof tgInfoLayout==='function')tgInfoLayout(true);if(typeof tgInfoRender==='function')tgInfoRender(-1);if(typeof drawGeo==='function')drawGeo();if(typeof tgDrawSegHL==='function')tgDrawSegHL(-1);if(typeof toast==='function')toast('\uAD6C\uAC04\uB9AC\uC14B \uC644\uB8CC \u2014 \uC790\uB3D9\uBD84\uD560\uB85C \uC7AC\uACC4\uC0B0\uB418\uC5C8\uC2B5\uB2C8\uB2E4');}function tgApplySegFix(a,b){if(a===b)return;if(!state.tgFixSegs)state.tgFixSegs=[];if(typeof tgSnap==='function')tgSnap();var _uk=a<b?a+'|'+b:b+'|'+a;for(var _fi=state.tgFixSegs.length-1;_fi>=0;_fi--){var _f=state.tgFixSegs[_fi];var _bad=!_f||!_f.a||!_f.b;var _k2=_bad?null:(_f.a<_f.b?_f.a+'|'+_f.b:_f.b+'|'+_f.a);if(_bad||_k2===_uk){state.tgFixSegs.splice(_fi,1);}else if(_f.del){delete _f.del;}}state.tgFixSegs.push({a:a,b:b});_segFixOrig=-1;if(typeof tangoFill==='function')tangoFill();if(typeof saveProject==='function')saveProject();tgSeg=-1;if(typeof tgInfoLayout==='function')tgInfoLayout(true);if(typeof tgInfoRender==='function')tgInfoRender(-1);if(typeof drawGeo==='function')drawGeo();if(typeof tgDrawSegHL==='function')tgDrawSegHL(-1);if(typeof toast==='function')toast('\uAD6C\uAC04 \uC218\uC815 \uBC18\uC601\uB428');}function tgSegFixRubber(x1,y1,x2,y2){var g=(typeof gAnc!=='undefined'&&gAnc)?gAnc:cv;var el=document.getElementById('tgSegFixRub');if(x1==null){if(el)el.remove();return;}var s1=S(x1,y1),s2=S(x2,y2);if(!el){el=document.createElementNS('http://www.w3.org/2000/svg','line');el.id='tgSegFixRub';el.setAttribute('stroke','#1e7e34');el.setAttribute('stroke-width','2');el.setAttribute('stroke-dasharray','6 4');el.setAttribute('vector-effect','non-scaling-stroke');el.setAttribute('pointer-events','none');g.appendChild(el);}el.setAttribute('x1',s1[0]);el.setAttribute('y1',s1[1]);el.setAttribute('x2',s2[0]);el.setAttribute('y2',s2[1]);el.style.display='';}function tgFixHover(wx,wy){var g=(typeof gAnc!=='undefined'&&gAnc)?gAnc:cv;var el=document.getElementById('tgFixHov');var u=(typeof pxToWorld==='function')?pxToWorld():0.1;var tol=u*22;var best=null,bd=tol;var sp=(typeof nearBpPoint==='function')?nearBpPoint(wx,wy):null;if(sp){var d1=Math.hypot(sp.x-wx,sp.y-wy);if(d1<bd){bd=d1;best={x:sp.x,y:sp.y};}}(state.manholes||[]).forEach(function(m){if(m.wx==null)return;var dd=Math.hypot(m.wx-wx,m.wy-wy);if(dd<bd){bd=dd;best={x:m.wx,y:m.wy};}});if(!best){if(el)el.style.display='none';return;}var s=S(best.x,best.y);var sz=Math.min(0.55,u*20);if(!el){el=document.createElementNS('http://www.w3.org/2000/svg','circle');el.id='tgFixHov';el.setAttribute('fill','none');el.setAttribute('stroke','#ff1744');el.setAttribute('pointer-events','none');g.appendChild(el);}el.setAttribute('cx',s[0]);el.setAttribute('cy',s[1]);el.setAttribute('r',sz);el.setAttribute('stroke-width',u*3.5);el.style.display='';}var _tgDrawLast=null;function tgLineEditToggle(){if(mode==='tglineedit'){mode='tglinedel';if(typeof toast==='function')toast('관로선(선)을 클릭하면 삭제됩니다');}else if(mode==='tglinedel'){mode='pan';_tgDrawLast=null;}else{mode='tglineedit';_tgDrawLast=null;if(typeof toast==='function')toast('측점을 순서대로 클릭하면 관로선이 그려집니다');}if(typeof setModeUI==='function')setModeUI();if(typeof drawGeo==='function')drawGeo();if(tgSeg>=0&&typeof tangoSelSeg==='function')tangoSelSeg(tgSeg);else if(typeof tgInfoRender==='function')tgInfoRender(-1);}function tgNearLine(wx,wy){var best=-1,bd=1e18;for(var li=0;li<state.lines.length;li++){var L=state.lines[li];if(!L.pts)continue;for(var pi=0;pi<L.pts.length-1;pi++){var d=(typeof distSegW==='function')?distSegW(wx,wy,L.pts[pi],L.pts[pi+1]):1e18;if(d<bd){bd=d;best=li;}}}return {idx:best,d:bd};}function tgLineHover(wx,wy){var g=(typeof gAnc!=='undefined'&&gAnc)?gAnc:cv;var el=document.getElementById('tgLineHi');if(mode!=='tglinedel'){if(el)el.style.display='none';return;}var nl=tgNearLine(wx,wy);var tol=(typeof pxToWorld==='function')?pxToWorld()*16:1;if(nl.idx<0||nl.d>tol){if(el)el.style.display='none';return;}var L=state.lines[nl.idx];if(!L||!L.pts){if(el)el.style.display='none';return;}if(!el){el=document.createElementNS('http://www.w3.org/2000/svg','polyline');el.id='tgLineHi';el.setAttribute('fill','none');el.setAttribute('stroke','#ff1744');el.setAttribute('stroke-linecap','round');el.setAttribute('stroke-linejoin','round');el.setAttribute('pointer-events','none');g.appendChild(el);}el.setAttribute('stroke-width',(typeof pxToWorld==='function')?pxToWorld()*5:1);el.setAttribute('points',L.pts.map(function(p){var sp=S(p[0],p[1]);return sp[0]+','+sp[1];}).join(' '));el.style.display='';}var _tgUndo=[],_tgRedo=[];function tgSnap(){try{if(state.tangoEdit){_tgUndo.push(JSON.stringify(state.tangoEdit));if(_tgUndo.length>40)_tgUndo.shift();_tgRedo=[];}}catch(e){}}function _tgReSwap(){if(!state.tangoEdit)return;if(state._pointsOrig)state.points=state.tangoEdit.points;if(state._linesOrig)state.lines=state.tangoEdit.lines;if(state._depthOrig)state._depthByNo=state.tangoEdit.depthByNo;}function tgUndo(){if(!_tgUndo.length){if(typeof toast==='function')toast('되돌릴 작업이 없습니다');return;}try{_tgRedo.push(JSON.stringify(state.tangoEdit));}catch(e){}try{state.tangoEdit=JSON.parse(_tgUndo.pop());}catch(e){return;}_tgReSwap();_tgSelNo=null;_tgSelXY=null;if(typeof saveProject==='function')saveProject();if(typeof tangoFill==='function')tangoFill();if(typeof tangoSelSeg==='function'&&tgSeg>=0)tangoSelSeg(tgSeg);if(typeof drawGeo==='function')drawGeo();if(typeof toast==='function')toast('되돌렸습니다');}function tgRedo(){if(!_tgRedo.length){if(typeof toast==='function')toast('다시 실행할 작업이 없습니다');return;}try{_tgUndo.push(JSON.stringify(state.tangoEdit));}catch(e){}try{state.tangoEdit=JSON.parse(_tgRedo.pop());}catch(e){return;}_tgReSwap();_tgSelNo=null;_tgSelXY=null;if(typeof saveProject==='function')saveProject();if(typeof tangoFill==='function')tangoFill();if(typeof tangoSelSeg==='function'&&tgSeg>=0)tangoSelSeg(tgSeg);if(typeof drawGeo==='function')drawGeo();if(typeof toast==='function')toast('다시 실행했습니다');}function _tgFetchRemoteCmp(){if(!online||!state.projectName)return;var _base=baseName(state.projectName);sb.from(DB+'_projects').select('id,name,updated_at,payload').order('updated_at',{ascending:false}).then(function(res){var rows=(res.data||[]).filter(function(p){return p.payload&&(p.payload.stage||'survey')===STAGE&&baseName(p.name)===_base&&/_TT\d*$/.test(p.name)&&p.payload.tangoEdit&&p.payload.tangoEdit.points;});if(!rows.length){state._tgCmpRemote=null;state._tgCmpRemoteOrig=null;if(typeof toast==='function')toast('\uB300\uC751 \uD0F1\uACE0\uC131\uACFC(_TT) \uC5C6\uC74C');if(typeof drawGeo==='function')drawGeo();return;}var _tt=rows[0];state._tgCmpRemote=_tt.payload.tangoEdit;state._tgCmpRemoteOrig=_tt.payload.points||state.points;if(typeof toast==='function')toast('\uD0F1\uACE0\uC131\uACFC \uC218\uC815\uB0B4\uC6A9 \uBD88\uB7EC\uC634: '+_tt.name);if(typeof drawGeo==='function')drawGeo();});}function tgDrawCompare(){var g=(typeof gAnc!=='undefined'&&gAnc)?gAnc:cv;var olds=g.querySelectorAll('.tgcmpEl');for(var i=0;i<olds.length;i++)olds[i].parentNode.removeChild(olds[i]);var _isTTc=/_TT\d*$/.test(state.projectName||'');var _ed=_isTTc?state.tangoEdit:(state._tgCmpRemote||state.tangoEdit);if(typeof LV==='undefined'||LV.tgcmp===0||!_ed||!_ed.points)return;var orig=_isTTc?(state._pointsOrig||state.points||[]):(state._tgCmpRemoteOrig||state.points||[]),cur=_ed.points||[],od=_isTTc?(state._depthOrig||state._depthByNo||{}):(state._depthByNo||{}),cd=_ed.depthByNo||{};var curNo={},origNo={};cur.forEach(function(p){curNo[p.no]=p;});orig.forEach(function(p){origNo[p.no]=p;});var u=(typeof pxToWorld==='function')?pxToWorld():0.1;var r=u*16;var NS='http://www.w3.org/2000/svg';function circ(p,col){var sp=S(p.x,p.y);var c=document.createElementNS(NS,'circle');c.setAttribute('class','tgcmpEl');c.setAttribute('cx',sp[0]);c.setAttribute('cy',sp[1]);c.setAttribute('r',r);c.setAttribute('fill','none');c.setAttribute('stroke',col);c.setAttribute('stroke-width',u*3);c.setAttribute('pointer-events','none');g.appendChild(c);}function txt(p,t,col){var sp=S(p.x,p.y);var e=document.createElementNS(NS,'text');e.setAttribute('class','tgcmpEl');e.setAttribute('x',sp[0]);e.setAttribute('y',sp[1]-r*1.35);e.setAttribute('fill',col);e.setAttribute('font-size',u*14);e.setAttribute('font-weight','800');e.setAttribute('text-anchor','middle');e.setAttribute('paint-order','stroke');e.setAttribute('stroke','#fff');e.setAttribute('stroke-width',u*2.4);e.setAttribute('stroke-linejoin','round');e.setAttribute('pointer-events','none');e.textContent=t;g.appendChild(e);}orig.forEach(function(p){if(!curNo[p.no]){circ(p,'#e02424');txt(p,'삭제','#e02424');}});cur.forEach(function(p){if(!origNo[p.no]){circ(p,'#1d4ed8');txt(p,'추가','#1d4ed8');}});var _tmc=!!state.tamsa;cur.forEach(function(p){if(origNo[p.no]){var a=_tmc?(origNo[p.no]?origNo[p.no].z:null):od[p.no],b=_tmc?p.z:cd[p.no];var an=(a==null||a==='')?null:+a,bn=(b==null||b==='')?null:+b;if(an!==bn&&(an!=null||bn!=null)){circ(p,'#16a34a');txt(p,(an!=null?an.toFixed(2):'-')+'→'+(bn!=null?bn.toFixed(2):'-'),'#16a34a');}}});}function tgEditReset(){if(!confirm('원본(검수데이터)에서 수정본을 다시 가져올까요?\n현재 탱고성과 수정 내용은 사라집니다.'))return;var _od=state._depthOrig||state._depthByNo;var _op=state._pointsOrig||state.points;var _ol=state._linesOrig||state.lines;state.tangoEdit={points:JSON.parse(JSON.stringify(_op||[])),lines:JSON.parse(JSON.stringify(_ol||[])),depthByNo:JSON.parse(JSON.stringify(_od||{}))};if(state._depthOrig)state._depthByNo=state.tangoEdit.depthByNo;if(state._pointsOrig)state.points=state.tangoEdit.points;if(state._linesOrig)state.lines=state.tangoEdit.lines;if(typeof saveProject==='function')saveProject();if(typeof tangoFill==='function')tangoFill();if(typeof drawGeo==='function')drawGeo();if(typeof toast==='function')toast('원본에서 다시 가져왔습니다');}
function openTangoPanel(ctx){ctx=ctx||_tgCtx||'tango';if(typeof toolsOpen!=='undefined')toolsOpen=false;var _pnl=document.getElementById('tangoPanel');var _pif=document.getElementById('tgInfoPanel');if(((_pnl&&_pnl.style.display!=='none')||(_pif&&_pif.style.display==='flex'))&&_tgCtx!==ctx){_tgStageBackup();_tgStageOut();}_tgCtx=ctx;if(typeof drawGeo==='function')drawGeo();if(typeof renderRail==='function')renderRail();if(!state.tgStore)state.tgStore={};var CP=function(o){return o==null?o:JSON.parse(JSON.stringify(o));};var D=state.tgStore[ctx];if(!D){if(ctx==='tango'&&state.tgStore.attr){var _s=state.tgStore.attr;D={edit:CP(_s.edit),manual:CP(_s.manual)||{},segDel:CP(_s.segDel)||{}};}else{D={edit:{points:CP(state.points)||[],lines:CP(state.lines)||[],depthByNo:CP(state._depthByNo)||{}},manual:{},segDel:{}};}state.tgStore[ctx]=D;}if(!D.edit){D.edit={points:CP(state.points)||[],lines:CP(state.lines)||[],depthByNo:CP(state._depthByNo)||{}};}if(!D.edit.lines)D.edit.lines=CP(state.lines)||[];if(!D.edit.depthByNo)D.edit.depthByNo=CP(state._depthByNo)||{};state.tangoEdit=D.edit;state.tangoManual=D.manual||(D.manual={});state.tgSegDel=D.segDel||(D.segDel={});state.tgFixSegs=D.fixSegs||(D.fixSegs=[]);if(!state._depthOrig)state._depthOrig=state._depthByNo;state._depthByNo=D.edit.depthByNo;if(!state._pointsOrig)state._pointsOrig=state.points;state.points=D.edit.points;if(!state._linesOrig)state._linesOrig=state.lines;state.lines=D.edit.lines;var _isAttr=(ctx==='attr');if(_isAttr){var _ep=document.getElementById('tangoPanel');if(_ep)_ep.style.display='none';var _st=document.querySelector('.stage');if(_st)_st.style.marginBottom='';tangoFill();if(typeof tgInfoLayout==='function')tgInfoLayout(true);tgUpdateBtn(false);if(typeof LV!=='undefined'&&LV){LV.tgseg=1;try{localStorage.setItem(LV_KEY,JSON.stringify(LV));}catch(e){}if(typeof applyLayerVis==='function')applyLayerVis();}if(typeof tangoSelSeg==='function')tangoSelSeg(tgSeg);if(typeof drawGeo==='function')drawGeo();var _cbs=document.querySelectorAll('input[data-lv="tgseg"]');for(var _ci=0;_ci<_cbs.length;_ci++)_cbs[_ci].checked=true;return;}var _title=_isAttr?'\uC18D\uC131\uC815\uBCF4 \uD3B8\uC9D1 (\uC6D0\uBCF8)':'\uD0F1\uACE0\uC131\uACFC \uC81C\uC791';var _accent=_isAttr?'#0a7ea0':'#f1c40f';var _bg=_isAttr?'#eef8fb':'#fffbea';var ex=document.getElementById('tangoPanel');if(ex){ex.style.display='block';ex.style.background=_bg;ex.style.borderTopColor=_accent;var _tt=ex.querySelector('.tgTitle');if(_tt)_tt.textContent=_title;var _rb=ex.querySelector('.tgResetBtn');if(_rb)_rb.style.display=_isAttr?'none':'';tgPanelLayout(true);tangoFill();tgUpdateBtn(true);if(typeof tgInfoLayout==='function')tgInfoLayout(true);if(typeof tangoSelSeg==='function')tangoSelSeg(typeof tgSeg!=='undefined'&&tgSeg>=0?tgSeg:-1);return;}var p=document.createElement('div');p.id='tangoPanel';p.style.cssText='position:fixed;left:0;right:0;bottom:0;height:34vh;background:'+_bg+';border-top:3px solid '+_accent+';box-shadow:0 -4px 18px rgba(0,0,0,.15);z-index:9000;overflow:auto;padding:12px 18px;font-size:13px';p.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><b class="tgTitle" style="font-size:16px">'+_title+'</b><span id="tangoSum" style="color:#888;font-size:12px"></span><span id="tgMeta" style="font-size:13px;margin-left:6px"></span><button onclick="exportTango()" style="margin-left:auto;background:#1e7e34;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer">\uD0F1\uACE0\uC131\uACFC \uB0B4\uBCF4\uB0B4\uAE30</button><button class="tgResetBtn" onclick="tgEditReset()" style="background:#fff;border:1px solid #e0a800;color:#856404;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;font-weight:700;display:'+(_isAttr?'none':'')+'">\u21BA \uC6D0\uBCF8 \uB2E4\uC2DC\uAC00\uC838\uC624\uAE30</button><button onclick="closeTangoPanel()" style="background:#fff;border:1px solid #ccc;border-radius:6px;padding:5px 12px;cursor:pointer">\u2715</button></div><div id="tangoBody" style="color:#555"></div>';document.body.appendChild(p);tgPanelLayout(true);if(typeof LV!=='undefined'&&LV){LV.tgseg=1;try{localStorage.setItem(LV_KEY,JSON.stringify(LV));}catch(e){}if(typeof applyLayerVis==='function')applyLayerVis();}tangoFill();tgUpdateBtn(true);if(typeof tgInfoLayout==='function')tgInfoLayout(true);if(typeof tangoSelSeg==='function')tangoSelSeg(typeof tgSeg!=='undefined'&&tgSeg>=0?tgSeg:-1);var _cbs=document.querySelectorAll('input[data-lv="tgseg"]');for(var _ci=0;_ci<_cbs.length;_ci++)_cbs[_ci].checked=true;}
function closeTangoPanel(){var p=document.getElementById('tangoPanel');if(p)p.style.display='none';_tgStageBackup();_tgStageOut();tgPanelLayout(false);tgUpdateBtn(false);if(typeof drawGeo==='function')drawGeo();}
function _tgStageBackup(){if(!state.tgStore||!state.tgStore[_tgCtx])return;var D=state.tgStore[_tgCtx];D.edit=state.tangoEdit;D.manual=state.tangoManual;D.segDel=state.tgSegDel;D.fixSegs=state.tgFixSegs;}function _tgStageOut(){if(state._depthOrig){state._depthByNo=state._depthOrig;state._depthOrig=null;}if(state._pointsOrig){state.points=state._pointsOrig;state._pointsOrig=null;}if(state._linesOrig){state.lines=state._linesOrig;state._linesOrig=null;}}
function tgUpdateBtn(on){var b=document.getElementById('tgBtn');if(!b)return;b.style.background=on?'#ffd31a':'#fff';b.style.color=on?'#000':'#0a3ea0';}
function _ensureTangoCopy(cb){if(!online||!state.projectName||/_TT\d*$/.test(state.projectName)){cb();return;}if(typeof _tgStageOut==='function')_tgStageOut();state.tgStore=null;state.tangoEdit=null;var _b=baseName(state.projectName);state.projectId=null;_uniqName(_b,'_TT',function(_nm){state.projectName=_nm;if(typeof toast==='function')toast('\uD0F1\uACE0\uC81C\uC791 \uC0AC\uBCF8: '+state.projectName);saveProject(function(){cb();});});}function tgTogglePanel(){var p=document.getElementById('tangoPanel');if(p&&p.style.display!=='none'){closeTangoPanel();return;}_ensureTangoCopy(function(){openTangoPanel('tango');});}
var TG_OPT={ext:['FC(\uFFE0100)','FC(\uFFE050)','1COD','2COD','3COD','4COD','5COD','6COD','MD(1way)','MD(2way)','MD(4way)','MD(7way)'],own:['SKT','SKB','\uACF5\uB3D9','\uD0C0\uC0AC'],inner:['SCD\uB0B4\uAD00_22mm','SCD\uB0B4\uAD00_25mm','SCD\uB0B4\uAD00_28mm','SCD\uB0B4\uAD00_36mm'],dig:['\uBCF4\uB3C4(\uC0AC\uB9AC\uB3C4)','\uBCF4\uB3C4(\uB300\uB9AC\uC11D)','\uBCF4\uB3C4(\uC624\uB098\uB9E8\uD2B8)','\uBCF4\uB3C4(\uD22C\uC2A4\uCF58)','\uBCF4\uB3C4(\uC18C\uD615\uBCF4\uB3C4)','\uBCF4\uB3C4(\uC77C\uBC18\uBCF4\uB3C4)','\uB3C4\uB85C(\uC0AC\uB9AC\uB3C4/\uB85C\uACAC)','\uB3C4\uB85C(\uCF58\uD06C\uB9AC\uD2B8)','\uB3C4\uB85C(ASP-B)\uC11C\uC6B8','\uB3C4\uB85C(ASP-B)','\uB3C4\uB85C(ASP-A)\uC11C\uC6B8','\uB3C4\uB85C(ASP-A)'],fac:['\uC2E0\uC124_\uB9E8\uD640','\uAE30\uC124_\uB9E8\uD640','\uC9C0\uC911\uAD6C\uC870\uBB3C','\uC785\uC0C1\uC810'],spec:['\uC778\uACF51\uD638','\uC778\uACF52\uD638','\uC778\uACF53\uD638','\uC218\uACF51\uD638','\uC218\uACF52\uD638','\uC218\uACF52-1\uD638','SMC','\uAE30\uD0C0'],pos:['\uAD50\uB7C9','\uD130\uB110','\uC9C0\uD558\uCCA0','\uB3C4\uB85C(\uCC28\uB3C4)','\uC778\uB3C4','\uCCA0\uB3C4','\uC0B0\uB9BC','\uC0AC\uC720\uC9C0'],soil:['AS','B','CON\'C','S','\uC11D\uC7AC','\uD0C4\uC131\uD3EC\uC7A5\uC7AC','\uD22C\uC2A4\uCF58','\uD0DD\uC9C0'],facSpec:{'\uC2E0\uC124_\uB9E8\uD640':['\uC778\uACF51\uD638','\uC778\uACF52\uD638','\uC778\uACF53\uD638','\uC218\uACF51\uD638','\uC218\uACF52\uD638','\uC218\uACF52-1\uD638','SMC'],'\uAE30\uC124_\uB9E8\uD640':['\uC778\uACF51\uD638','\uC778\uACF52\uD638','\uC778\uACF53\uD638','\uC218\uACF51\uD638','\uC218\uACF52\uD638','\uC218\uACF52-1\uD638','SMC'],'\uC9C0\uC911\uAD6C\uC870\uBB3C':['\uD658\uAE30\uAD6C','\uD480\uBC15\uC2A4','\uAE30\uD0C0'],'\uC785\uC0C1\uC810':['\uC790\uAC00\uC8FC','\uD0C0\uC0AC\uC8FC','\uB9E8\uD640','\uAC74\uBB3C','\uAC74\uBB3C\uBCBD','\uAC74\uBB3C\uC625\uC0C1','\uAD6C\uB0B4\uBE44\uD2B8\uC2E4']}};
var _tgCtx='tango';var tgSeg=-1;var _tgSegs=[];var _tgInspResult=null;var _tgReviewSeg=null;var TG_COLS=['#7ee787','#9ecbff','#ffd59e','#d8b4fe','#fca5a5','#5eead4','#fde68a','#a5b4fc','#fbcfe8','#bef264'];var _tgLDrag=null;window.addEventListener('pointermove',function(e){if(!_tgLDrag)return;var w=toWorld(e.clientX,e.clientY);if(!state.tgSegLabelOff)state.tgSegLabelOff={};state.tgSegLabelOff[_tgLDrag.si]={x:w[0],y:-w[1]};var sp=S(w[0],-w[1]);if(_tgLDrag.t){_tgLDrag.t.setAttribute('x',sp[0]);_tgLDrag.t.setAttribute('y',sp[1]);}if(_tgLDrag.ln){_tgLDrag.ln.setAttribute('x2',sp[0]);_tgLDrag.ln.setAttribute('y2',sp[1]);}});window.addEventListener('pointerup',function(){if(_tgLDrag){_tgLDrag=null;if(typeof saveProject==='function')saveProject();}});function tgSegButtons(){var n=(_tgSegs||[]).length;var bs='display:inline-block;padding:4px 11px;margin:0 4px 5px 0;border:1px solid #f1c40f;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;background:#fff';var on=';background:#f1c40f;color:#000';var h='<div style="margin-bottom:6px"><button onclick="tgUndo()" style="'+bs+'">\u21BA \uB418\uB3CC\uB9AC\uAE30</button><button onclick="tgRedo()" style="'+bs+'">\u21BB \uB2E4\uC2DC\uC2E4\uD589</button></div><div style="margin-bottom:8px"><button onclick="tgSegGo(-1)" style="'+bs+(tgSeg<0?on:'')+'">\uC804\uCCB4</button>';for(var i=0;i<n;i++){var _bc=TG_COLS[i%TG_COLS.length];h+='<button onclick="tgSegGo('+i+')" style="'+bs+';background:'+_bc+(tgSeg===i?';outline:2px solid #333;outline-offset:1px;font-weight:800':'66')+'">'+(i+1)+'\uAD6C\uAC04</button>';}if(_tgCtx!=='attr')h+='<button onclick="tgStartInspect()" style="'+bs+';background:#e74c3c;color:#fff;border-color:#c0392b;font-weight:700">\uAC80\uC218</button>';h+='<button onclick="tgSegDelete()" style="'+bs+';background:#fff;border-color:#c0392b;color:#c0392b;font-weight:700">\uAD6C\uAC04\uC0AD\uC81C</button><button onclick="tgSegFixToggle()" style="'+bs+';background:'+(mode==='tgsegfix'?'#1e7e34;color:#fff':'#fff;color:#1e7e34')+';border-color:#1e7e34;font-weight:700">\uAD6C\uAC04\uC218\uC815</button><button onclick=\"tgSegResetAll()\" style=\"'+bs+';background:#fff;border-color:#e67e22;color:#e67e22;font-weight:700\">\u21BA \uAD6C\uAC04\uB9AC\uC14B</button>'+(_tgCtx!=='attr'?'<button onclick="tgEditReset()" style="'+bs+';background:#fff;border-color:#e67e22;color:#e67e22;font-weight:700">\u21BA \uC6D0\uBCF8 \uB9AC\uC14B</button>':'')+' <button onclick="tgPtEditToggle()" style="'+bs+';float:right;margin-right:0;background:#fff;border-color:#7a52e0;color:#7a52e0;font-weight:700">\uC2EC\uB3C4/\uC810 \uD3B8\uC9D1</button><button onclick="tgLineEditToggle()" style="'+bs+';float:right'+((mode==='tglineedit')?';background:#fff7d6;border-color:#1633ff;color:#1633ff':(mode==='tglinedel')?';background:#ffe0e0;border-color:#e74c3c;color:#e74c3c':';background:#fff;border-color:#1633ff;color:#1633ff')+';font-weight:700\">'+((mode==='tglineedit')?'\uAD00\uB85C\uC120 \uC0AD\uC81C':(mode==='tglinedel')?'\uD3B8\uC9D1 \uB044\uAE30':'\uAD00\uB85C\uC120 \uADF8\uB9AC\uAE30')+'</button>';if(_tgCtx!=='attr')h+='<button onclick="tgInspShowResult()" style="'+bs+';background:#fff3cd;border-color:#e0a800;color:#856404;font-weight:700">\uC624\uB958\uB0B4\uC5ED</button>';return h+'</div>';}
function tgScrollToSeg(i){var row=document.querySelector('.tgwrap tr.seg0[data-seg="'+i+'"]');if(!row)return;var wrap=document.querySelector('.tgwrap');if(wrap){var th=wrap.querySelector('thead');var ho=th?th.offsetHeight:0;wrap.scrollTop=Math.max(0,row.offsetTop-ho-2);}}
function tgSegGo(i,noFit){tangoSelSeg(i,noFit);if(i>=0&&typeof tgScrollToSeg==='function')setTimeout(function(){tgScrollToSeg(i);},20);}
function tgMissingEdges(){function qk(x,y){return Math.round(x*100)+'_'+Math.round(y*100);}function ek(a,b){var ka=qk(a[0],a[1]),kb=qk(b[0],b[1]);return ka<kb?ka+'|'+kb:kb+'|'+ka;}var pipes=(state.lines||[]).filter(function(L){return L.layer==='\uD1B5\uC2E0\uAD00\uB85C'&&L.pts&&L.pts.length>=2;});var all=[],seen={};pipes.forEach(function(L){for(var i=0;i<L.pts.length-1;i++){var a=L.pts[i],b=L.pts[i+1];if(qk(a[0],a[1])===qk(b[0],b[1]))continue;var k=ek(a,b);if(!seen[k]){seen[k]=1;all.push([a,b,k]);}}});var used={};(window._tgSegRaw||[]).forEach(function(raw){if(!raw)return;for(var i=0;i<raw.length-1;i++)used[ek(raw[i],raw[i+1])]=1;});var miss=all.filter(function(e){return !used[e[2]];});return {total:all.length,miss:miss};}function tgDrawSegHL(i){var cv=document.getElementById('cv');if(!cv)return;['tgSegHLG','tgSegHLF'].forEach(function(id){var e=document.getElementById(id);if(e)e.remove();});if(typeof LV==='undefined'||!LV||!LV.tgseg){var _o=document.getElementById('tgSegHL');if(_o)_o.remove();return;}var old=document.getElementById('tgSegHL');if(old)old.remove();if(!_tgSegs||!_tgSegs.length)return;var NS='http://www.w3.org/2000/svg';var COLS=TG_COLS;var vbw=(cv.viewBox&&cv.viewBox.baseVal&&cv.viewBox.baseVal.width)||1000;var gB=document.createElementNS(NS,'g');gB.id='tgSegHLG';gB.setAttribute('pointer-events','none');var gF=document.createElementNS(NS,'g');gF.id='tgSegHLF';var _tgLB=[];var _tgPE=[];var _tgLL=[];(state.lines||[]).forEach(function(L){if(L.layer!=='\uD1B5\uC2E0\uAD00\uB85C'||!L.pts)return;for(var _q=1;_q<L.pts.length;_q++){var _sA=S(L.pts[_q-1][0],L.pts[_q-1][1]),_sB=S(L.pts[_q][0],L.pts[_q][1]);_tgPE.push([_sA[0],_sA[1],_sB[0],_sB[1]]);}});function _segX2(ax,ay,bx,by,cx,cy,dx,dy){function _o(px,py,qx,qy,rx,ry){var v=(qx-px)*(ry-py)-(qy-py)*(rx-px);return v>1e-9?1:(v<-1e-9?-1:0);}var o1=_o(ax,ay,bx,by,cx,cy),o2=_o(ax,ay,bx,by,dx,dy),o3=_o(cx,cy,dx,dy,ax,ay),o4=_o(cx,cy,dx,dy,bx,by);return o1!==o2&&o3!==o4;}function _segRect(x1,y1,x2,y2,rx,ry,rw,rh){if(x1>rx&&x1<rx+rw&&y1>ry&&y1<ry+rh)return true;if(x2>rx&&x2<rx+rw&&y2>ry&&y2<ry+rh)return true;return _segX2(x1,y1,x2,y2,rx,ry,rx+rw,ry)||_segX2(x1,y1,x2,y2,rx+rw,ry,rx+rw,ry+rh)||_segX2(x1,y1,x2,y2,rx,ry+rh,rx+rw,ry+rh)||_segX2(x1,y1,x2,y2,rx,ry,rx,ry+rh);}function drawOne(si,col,lab){var raw=(window._tgSegRaw||[])[si];if(!raw||raw.length<2)raw=_tgSegs[si].map(function(n){return [n.x,n.y];});var pstr=raw.map(function(p){var s=S(p[0],p[1]);return s[0]+','+s[1];}).join(' ');var pl=document.createElementNS(NS,'polyline');pl.setAttribute('points',pstr);pl.setAttribute('fill','none');pl.setAttribute('stroke',col);pl.setAttribute('stroke-opacity','0.45');pl.setAttribute('stroke-width','22.4');pl.setAttribute('stroke-linecap','round');pl.setAttribute('stroke-linejoin','round');pl.setAttribute('vector-effect','non-scaling-stroke');pl.setAttribute('pointer-events','none');gB.appendChild(pl);if(lab){var fs=vbw*0.014;var off=(state.tgSegLabelOff||{})[si];var _nstr=''+(si+1);var _tw=fs*(0.62*_nstr.length+2.1),_th=fs*1.25;var _mi=Math.floor(raw.length/2);var mid=raw[_mi];var ap=S(mid[0],mid[1]);var lp;if(off){lp=S(off.x,off.y);}else{var _cand=[];var _fr=[0.5,0.3,0.7];for(var _fi=0;_fi<_fr.length;_fi++){var _ix=Math.max(1,Math.min(raw.length-2,Math.round((raw.length-1)*_fr[_fi])));var _md=raw.length===2?[(raw[0][0]+raw[1][0])/2,(raw[0][1]+raw[1][1])/2]:raw[_ix];if(raw.length===2)_ix=0;var _a2=S(_md[0],_md[1]);var _p1=raw[Math.max(0,_ix-1)],_p2=raw[Math.min(raw.length-1,_ix+1)];var _s1=S(_p1[0],_p1[1]),_s2=S(_p2[0],_p2[1]);var _dx2=_s2[0]-_s1[0],_dy2=_s2[1]-_s1[1];var _dl2=Math.hypot(_dx2,_dy2)||1;var _ux=-_dy2/_dl2,_uy=_dx2/_dl2;var _ds=[2.6,3.8,5.0,6.2];for(var _sd=0;_sd<2;_sd++){var _sg=_sd?-1:1;for(var _di=0;_di<_ds.length;_di++){_cand.push({ax:_a2[0],ay:_a2[1],x:_a2[0]+_ux*_sg*fs*_ds[_di],y:_a2[1]+_uy*_sg*fs*_ds[_di],c:_fi*100+_di*10+_sd});}}if(raw.length===2)break;}var _best=null,_bs=1e18;for(var _ci=0;_ci<_cand.length;_ci++){var C=_cand[_ci];var _rx=C.x-_tw/2,_ry=C.y-_th*0.8;var _pen=C.c;for(var _bi=0;_bi<_tgLB.length;_bi++){var B=_tgLB[_bi];if(_rx<B.x+B.w&&_rx+_tw>B.x&&_ry<B.y+B.h&&_ry+_th>B.y){_pen+=100000;break;}}if(_pen<100000){for(var _ei=0;_ei<_tgPE.length;_ei++){var E=_tgPE[_ei];if(_segRect(E[0],E[1],E[2],E[3],_rx,_ry,_tw,_th)){_pen+=20000;break;}}}for(var _li=0;_li<_tgLL.length;_li++){var LL=_tgLL[_li];if(_segX2(C.ax,C.ay,C.x,C.y,LL[0],LL[1],LL[2],LL[3])){_pen+=50000;break;}}if(_pen<_bs){_bs=_pen;_best=C;}}if(_best){ap=[_best.ax,_best.ay];lp=[_best.x,_best.y];}else{lp=[ap[0],ap[1]-fs*2.8];}}_tgLB.push({x:lp[0]-_tw/2,y:lp[1]-_th*0.8,w:_tw,h:_th});_tgLL.push([ap[0],ap[1],lp[0],lp[1]]);var ln=document.createElementNS(NS,'line');ln.setAttribute('x1',ap[0]);ln.setAttribute('y1',ap[1]);ln.setAttribute('x2',lp[0]);ln.setAttribute('y2',lp[1]);ln.setAttribute('stroke','#0a3ea0');ln.setAttribute('stroke-width','1');ln.setAttribute('stroke-opacity','0.7');ln.setAttribute('vector-effect','non-scaling-stroke');ln.setAttribute('pointer-events','none');gF.appendChild(ln);var t=document.createElementNS(NS,'text');t.setAttribute('x',lp[0]);t.setAttribute('y',lp[1]);t.setAttribute('fill',col);t.setAttribute('font-size',fs);t.setAttribute('font-weight','800');t.setAttribute('text-anchor','middle');t.setAttribute('paint-order','stroke');t.setAttribute('stroke','#fff');t.setAttribute('stroke-width',fs*0.18);t.setAttribute('stroke-linejoin','round');t.style.cursor='move';t.setAttribute('pointer-events','auto');t.textContent=(si+1)+'\uAD6C\uAC04';(function(idx,tx,lnx){tx.addEventListener('pointerdown',function(ev){ev.stopPropagation();ev.preventDefault();_tgLDrag={si:idx,t:tx,ln:lnx};try{tx.setPointerCapture(ev.pointerId);}catch(e){}});})(si,t,ln);gF.appendChild(t);}}if(i<0&&typeof _tgMode==='function'&&_tgMode()){var ms=tgMissingEdges();ms.miss.forEach(function(e){var s1=S(e[0][0],e[0][1]),s2=S(e[1][0],e[1][1]);var ml=document.createElementNS(NS,'line');ml.setAttribute('x1',s1[0]);ml.setAttribute('y1',s1[1]);ml.setAttribute('x2',s2[0]);ml.setAttribute('y2',s2[1]);ml.setAttribute('stroke','#ff1744');ml.setAttribute('stroke-width','5');ml.setAttribute('stroke-opacity','0.95');ml.setAttribute('vector-effect','non-scaling-stroke');ml.setAttribute('pointer-events','none');gF.appendChild(ml);});}if(i>=0){if(_tgSegs[i])drawOne(i,COLS[i%COLS.length],false);}else{for(var si=0;si<_tgSegs.length;si++){if(_segFix&&typeof _segFixOrig!=="undefined"&&_segFixOrig===si)continue;drawOne(si,COLS[si%COLS.length],true);}}cv.insertBefore(gB,cv.firstChild);cv.appendChild(gF);}
function tgPipeExt(code){if(!code)return '';var c=(''+code).toUpperCase();var dm=/(\d+)\s*[X×]\s*(\d+)/.exec(c);var dia=dm?+dm[1]:null,cnt=dm?+dm[2]:null;if(cnt==null){var m2=/[X×]\s*(\d+)/.exec(c);if(m2)cnt=+m2[1];}if(dia==null){var m3=/(\d{2,})/.exec(c);if(m3)dia=+m3[1];}if(/FC/.test(c))return dia?('FC(\uFFE0'+dia+')'):'';if(/MD/.test(c)){var mw=/(\d+)\s*WAY/.exec(c);return mw?('MD('+mw[1]+'way)'):'';}if(/COD/.test(c))return cnt?(cnt+'COD'):'';return '';}
function tgPtRoad(nd){if(!nd.mh&&nd.no&&typeof pointByNo==='function'){var p=pointByNo(nd.no);if(p){var sf=p.surfaceManual||p.surface;if(sf)return sf==='\uB3C4\uB85C';}}var rz=state.roadZones||[];for(var i=0;i<rz.length;i++){if(rz[i]&&rz[i].poly&&typeof roadPtInPoly==='function'&&roadPtInPoly([nd.x,nd.y],rz[i].poly))return rz[i].type==='\uB3C4\uB85C';}return false;}
function tgMhOwner(nd){if(!nd||!nd.mh)return '';var mhs=state.manholes||[];var best=null,bd=0.5;for(var i=0;i<mhs.length;i++){var m=mhs[i];if(m.wx==null)continue;var d=Math.hypot(m.wx-nd.x,m.wy-nd.y);if(d<bd){bd=d;best=m;}}if(!best)return '';var mm=/\(([^)]+)\)/.exec(best.label||'');return mm?mm[1].trim():'';}
function tgAutoMatch(){if(!_tgSegs||!_tgSegs.length)return;var tb=state.titleBlock||{};var client=((state.bizInfo&&state.bizInfo.client)||tb.client||'').trim();var inner=tb.inner||'';if(!state.tangoManual)state.tangoManual={};function topKey(o){var bk='',bv=-1;for(var k in o)if(o[k]>bv){bv=o[k];bk=k;}return bk;}_tgSegs.forEach(function(sg){var key=tgManualKey(sg);var M=state.tangoManual[key]=state.tangoManual[key]||{};function setIf(f,v){if(v&&(M[f]==null||M[f]===''))M[f]=v;}var extCnt={};sg.forEach(function(nd){if(nd.mh||!nd.no)return;var p=(typeof pointByNo==='function')?pointByNo(nd.no):null;var e=tgPipeExt(p?p.code:'');if(e)extCnt[e]=(extCnt[e]||0)+1;});setIf('ext',topKey(extCnt));setIf('own',client);var road=0,bo=0;sg.forEach(function(nd){if(tgPtRoad(nd))road++;else bo++;});var dig=(road>=bo)?'\uB3C4\uB85C(ASP-A)':'\uBCF4\uB3C4(\uC77C\uBC18\uBCF4\uB3C4)';var pos=(road>=bo)?'\uB3C4\uB85C(\uCC28\uB3C4)':'\uC778\uB3C4';setIf('dig',dig);var s0=sg[0],s1=sg[sg.length-1];setIf('s_own',client||tgMhOwner(s0));setIf('e_own',client||tgMhOwner(s1));if(s0.riser){delete M['s_pos'];}else setIf('s_pos',pos);if(s1.riser){delete M['e_pos'];}else setIf('e_pos',pos);sg.forEach(function(nd){if(nd.mh)return;if(tgPtRoad(nd))setIf('soil_'+(nd.no||''),'AS');});});}
var _tgInsp=null;
var TGFL={s_fac:'시작 설비',s_own:'시작 소유',s_spec:'시작 규격',s_pos:'시작 위치',s_nm:'시작 시설명',ext:'외관',own:'주관',gyeol:'공열',gdan:'공단',naegwan:'내관',gwannum:'관공번호',inner:'내관규격',dig:'굴착방법',e_fac:'종료 설비',e_own:'종료 소유',e_spec:'종료 규격',e_pos:'종료 위치',e_nm:'종료 시설명'};
function tgExpect(si){var sg=_tgSegs[si];if(!sg)return {_soil:{}};var tb=state.titleBlock||{};var client=((state.bizInfo&&state.bizInfo.client)||tb.client||'').trim();var inner=tb.inner||'';function topKey(o){var bk='',bv=-1;for(var k in o)if(o[k]>bv){bv=o[k];bk=k;}return bk;}var extCnt={};sg.forEach(function(nd){if(nd.mh||!nd.no)return;var p=(typeof pointByNo==='function')?pointByNo(nd.no):null;var e=tgPipeExt(p?p.code:'');if(e)extCnt[e]=(extCnt[e]||0)+1;});var road=0,bo=0;sg.forEach(function(nd){if(tgPtRoad(nd))road++;else bo++;});var dig=(road>=bo)?'도로(ASP-A)':'보도(일반보도)';var pos=(road>=bo)?'도로(차도)':'인도';var s0=sg[0],s1=sg[sg.length-1];var E={ext:topKey(extCnt),own:client,inner:inner,dig:dig,s_own:client||tgMhOwner(s0),e_own:client||tgMhOwner(s1),s_pos:pos,e_pos:pos,s_fac:s0.mh?'\uC2E0\uC124_\uB9E8\uD640':'\uC9C0\uC911\uAD6C\uC870\uBB3C',s_nm:s0.mh?(s0.name||''):'\uAD00\uB9D0',s_spec:s0.mh?(s0.spec||''):'\uAE30\uD0C0',e_fac:s1.mh?'\uC2E0\uC124_\uB9E8\uD640':'\uC9C0\uC911\uAD6C\uC870\uBB3C',e_nm:s1.mh?(s1.name||''):'\uAD00\uB9D0',e_spec:s1.mh?(s1.spec||''):'\uAE30\uD0C0'};E._soil={};sg.forEach(function(nd){if(nd.mh)return;if(tgPtRoad(nd))E._soil[nd.no||'']='AS';});return E;}
function tgInspProbs(si){var sg=_tgSegs[si];if(!sg)return {};var key=tgManualKey(sg);var M=(state.tangoManual&&state.tangoManual[key])||{};var E=tgExpect(si);var P={};var fld={};['ext','own','gyeol','gdan','naegwan','gwannum','inner','dig','s_fac','s_own','s_spec','s_pos','s_nm','e_fac','e_own','e_spec','e_pos','e_nm'].forEach(function(k){var v=(M[k]==null?'':(''+M[k])).trim();var ex=(E[k]==null?'':(''+E[k])).trim();if(!(v||ex))fld[k]=1;else if(v&&ex&&v!==ex)fld[k]=1;});if(Object.keys(fld).length)P._fld=fld;sg.forEach(function(nd,ri){var pr=[];if(!nd.mh){var soil=M['soil_'+(nd.no||'')]||'';var exs=E._soil[nd.no||'']||'';if(exs&&soil!==exs)pr.push('soil');if(nd.z==null)pr.push('z');}var ll=(typeof toLatLng==='function')?toLatLng(nd.x,nd.y):null;if(!ll||ll.lng==null||ll.lat==null||isNaN(ll.lng)||isNaN(ll.lat)||ll.lng<124||ll.lng>132||ll.lat<33||ll.lat>43)pr.push('xy');if(pr.length)P[ri]=pr;});var _cnts={};sg.forEach(function(nd){if(nd.mh||!nd.no)return;var _p=(typeof pointByNo==='function')?pointByNo(nd.no):null;var _c=(typeof pipeCount==='function')?pipeCount(_p):null;if(_c!=null)_cnts[''+_c]=1;});var _cks=Object.keys(_cnts);if(_cks.length>1){fld['ext']=1;P._extMix=1;}else if(_cks.length===1){var _gw=+_cks[0];var _gy=parseInt(M.gyeol||'',10),_gd=parseInt(M.gdan||'',10);if(_gy&&_gd&&(_gy*_gd)!==_gw){fld['gyeol']=1;fld['gdan']=1;P._gwMul={gy:_gy,gd:_gd,gw:_gw};}}if(!P._fld&&Object.keys(fld).length)P._fld=fld;return P;}
function tgInspSteps(si){var sg=_tgSegs[si];var steps=[];['ext','own','gyeol','gdan','naegwan','gwannum','inner','dig'].forEach(function(f){steps.push({t:'fld',grp:'common',f:f});});['s_fac','s_own','s_spec','s_pos','s_nm'].forEach(function(f){steps.push({t:'fld',grp:'start',f:f});});var pExt=null,pRoad=null;sg.forEach(function(nd,ri){var ext=nd.mh?null:tgPipeExt(((typeof pointByNo==='function'&&pointByNo(nd.no))||{}).code||'');var road=tgPtRoad(nd);var ch=[];if(ri>0){if(ext&&ext!==pExt)ch.push('외관');if(road!==pRoad)ch.push('적용토적');}steps.push({t:'pt',ri:ri,ch:ch});pExt=ext;pRoad=road;});['e_fac','e_own','e_spec','e_pos','e_nm'].forEach(function(f){steps.push({t:'fld',grp:'end',f:f});});return steps;}
function tgStartInspect(){if(!_tgSegs||!_tgSegs.length){alert('구간이 없습니다');return;}if(_tgInsp){tgInspEnd();return;}_tgReviewSeg=null;var _st0=(tgSeg>=0&&tgSeg<_tgSegs.length)?tgSeg:0;var _auto=!(tgSeg>=0&&tgSeg<_tgSegs.length);tgSeg=_st0;if(typeof tgInfoRender==='function')tgInfoRender(_st0);if(_tgSegs[_st0]&&typeof tangoFitSeg==='function')tangoFitSeg(_tgSegs[_st0]);if(typeof tgDrawSegHL==='function')tgDrawSegHL(_st0);_tgInsp={seg:_st0,autoAll:_auto,step:0,playing:false,timer:null,probs:tgInspProbs(_st0),steps:tgInspSteps(_st0),lvBak:(typeof LV!=='undefined'&&LV)?JSON.parse(JSON.stringify(LV)):null};tgInspBar();tgInspGo(0);tgInspPlayToggle();}function tgInspGotoSeg(si,toEnd){if(!_tgInsp)return;tgSeg=si;if(typeof tgInfoRender==='function')tgInfoRender(si);if(_tgSegs[si]&&typeof tangoFitSeg==='function')tangoFitSeg(_tgSegs[si]);if(typeof tgDrawSegHL==='function')tgDrawSegHL(si);_tgInsp.seg=si;_tgInsp.steps=tgInspSteps(si);_tgInsp.probs=tgInspProbs(si);_tgInsp.step=toEnd?(_tgInsp.steps.length-1):0;tgInspRender();}function tgInspFinish(){_tgInspResult=[];for(var si=0;si<_tgSegs.length;si++){_tgInspResult.push({si:si,items:tgInspItems(si)});}tgInspShowResult();}function tgInspRedAll(si){var sg=_tgSegs[si];if(!sg)return;var key=tgManualKey(sg);var P=tgInspProbs(si);for(var ri=0;ri<sg.length;ri++){var on=P[ri]&&P[ri].length;var r=document.getElementById('tgsr'+ri);if(r)r.style.background=on?'#ffb3b3':'';var hr=document.querySelector('.tgwrap tr[data-tgkey="'+key+'"][data-ri="'+ri+'"]');if(hr)hr.style.background=on?'#ffb3b3':'';}['ext','own','gyeol','gdan','naegwan','gwannum','inner','dig','s_fac','s_own','s_spec','s_pos','s_nm','e_fac','e_own','e_spec','e_pos','e_nm'].forEach(function(f){var on=P._fld&&P._fld[f];var nds=document.querySelectorAll('[data-seg="'+key+'"][data-field="'+f+'"]');for(var i=0;i<nds.length;i++)nds[i].style.background=on?'#ffb3b3':'';});}function tgInspItems(si){var sg=_tgSegs[si];if(!sg)return [];var key=tgManualKey(sg);var M=(state.tangoManual&&state.tangoManual[key])||{};var P=tgInspProbs(si);var items=[];if(P._fld)for(var f in P._fld){var v=(M[f]==null?'':(''+M[f])).trim();var kd=v?'불일치':'빈칸';if((f==='gyeol'||f==='gdan')&&P._gwMul)kd='공열×공단('+(P._gwMul.gy*P._gwMul.gd)+')≠관수('+P._gwMul.gw+')';if(f==='ext'&&P._extMix)kd='관수 측점마다 다름';items.push({key:f,label:(typeof TGFL!=='undefined'&&TGFL[f])||f,kind:kd});}for(var ri=0;ri<sg.length;ri++){if(P[ri]&&P[ri].length){(function(ri2){P[ri2].forEach(function(c){var kd=(c==='z')?'심도 빈칸':(c==='soil')?'적용토적 불일치':(c==='xy')?'좌표변환 오류':c;items.push({ri:ri2,code:c,label:'측점 '+(ri2+1),kind:kd});});})(ri);}}return items;}function tgInspReview(si,fkey,fri){if(typeof tgInspStop==='function')tgInspStop();if(_tgInsp){_tgInsp.review=true;_tgInsp.seg=si;}tgSeg=si;_tgReviewSeg=si;if(typeof tgInfoRender==='function')tgInfoRender(si);if(_tgSegs[si]&&typeof tangoFitSeg==='function')tangoFitSeg(_tgSegs[si]);if(typeof tgDrawSegHL==='function')tgDrawSegHL(si);var mk=document.getElementById('tgInspMk');if(mk)mk.remove();var ib=document.getElementById('tgInspInfo');if(ib)ib.remove();tgInspRedAll(si);var key=tgManualKey(_tgSegs[si]);setTimeout(function(){var el=null;if(fkey){el=document.querySelector('[data-seg="'+key+'"][data-field="'+fkey+'"]');}else if(fri!=null){el=document.querySelector('.tgwrap tr[data-tgkey="'+key+'"][data-ri="'+fri+'"]');}if(el){var _w9=document.querySelector('.tgwrap');if(_w9){var _wr9=_w9.getBoundingClientRect(),_rr9=el.getBoundingClientRect();_w9.scrollTop+=(_rr9.top-_wr9.top)-(_w9.clientHeight/2)+(_rr9.height/2);}}},60);}function tgInspJump(si){tgInspReview(si);}function tgInspGotoItem(si,fkey,fri){tgInspReview(si,fkey,fri);}function tgInspShowResult(){if(typeof _tgInspResult==='undefined'||!_tgInspResult||!_tgInspResult.length){if(typeof _tgSegs!=='undefined'&&_tgSegs&&_tgSegs.length&&typeof tgInspItems==='function'){_tgInspResult=[];for(var _si=0;_si<_tgSegs.length;_si++){_tgInspResult.push({si:_si,items:tgInspItems(_si)});}}else{if(typeof toast==='function')toast('구간이 없습니다 (구간색칠/검수 먼저)');return;}}var ip=document.getElementById('tgInfoPanel');if(!ip||!_tgInspResult)return;var html='<div style="padding:8px"><div style="font-weight:800;color:#1e7e34;margin-bottom:6px;font-size:13px">✓ 검수 완료 — 구간별 오류내역</div>';_tgInspResult.forEach(function(R){var P=tgInspProbs(R.si);function solved(it){if(it.key)return !(P._fld&&P._fld[it.key]);if(it.ri!=null)return !(P[it.ri]&&P[it.ri].indexOf(it.code)>=0);return false;}var orig=R.items.length;var remain=R.items.filter(function(it){return !solved(it);}).length;var none=(orig===0);var allDone=(orig>0&&remain===0);var bad=(remain>0);var hc=bad?'#ff6b6b':'#2ecc71';var hb=bad?'#ffe5e5':'#e7f7ec';var ht=bad?'#c0392b':'#1e7e34';var col=TG_COLS[R.si%TG_COLS.length];html+='<div style="margin:5px 0;border:1px solid '+hc+';border-radius:6px;overflow:hidden">';html+='<div onclick="tgInspJump('+R.si+')" style="padding:6px 9px;background:'+hb+';font-weight:700;color:'+ht+';font-size:12px;border-left:7px solid '+col+';cursor:pointer">'+(R.si+1)+'구간 '+(none?'✓ 정상':(allDone?'✓ 수정완료':('⚠ 오류 '+remain+'건')))+'</div>';R.items.forEach(function(it){var sv=solved(it);var ka=it.key?("'"+it.key+"'"):'null';var ra=(it.ri!=null)?it.ri:'null';html+='<div onclick="tgInspGotoItem('+R.si+','+ka+','+ra+')" style="display:flex;align-items:stretch;border-top:1px solid #eee;font-size:11px;cursor:pointer">';html+='<span style="width:118px;padding:5px 9px;color:#333;flex-shrink:0">'+it.label+'</span>';html+='<span style="flex:1;padding:5px 9px;border-left:2px solid #2d7dff;text-align:left;color:'+(sv?'#1e7e34':'#c0392b')+';font-weight:700">'+(sv?'✓ 수정완료':it.kind)+'</span>';html+='</div>';});html+='</div>';});html+='</div>';ip.innerHTML=tgSegButtons()+html;}function tgSegDelete(){if(tgSeg<0||!_tgSegs||!_tgSegs[tgSeg]){alert('삭제할 구간을 먼저 선택하세요');return;}if(!confirm((tgSeg+1)+'구간을 탱고성과에서 제외할까요?'))return;if(_tgInsp)tgInspEnd();if(!state.tgSegDel)state.tgSegDel={};state.tgSegDel[tgManualKey(_tgSegs[tgSeg])]=1;tgSeg=-1;if(typeof tangoFill==='function')tangoFill();if(typeof tangoSelSeg==='function')tangoSelSeg(-1);if(typeof saveProject==='function')saveProject();}
function tgInspBar(){var b=document.getElementById('tgInspBar');if(b)b.remove();b=document.createElement('div');b.id='tgInspBar';b.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:35vh;z-index:9500;background:#fff;border:2px solid #e74c3c;border-radius:10px;padding:7px 13px;box-shadow:0 4px 16px rgba(0,0,0,.22);display:flex;gap:8px;align-items:center;font-size:14px;max-width:90vw';b.innerHTML='<b style="color:#e74c3c">검수</b><button onclick="tgInspPrev()" style="cursor:pointer;padding:3px 9px">◀</button><button id="tgInspPlayBtn" onclick="tgInspPlayToggle()" style="cursor:pointer;padding:3px 11px;font-weight:700">▶재생</button><button onclick="tgInspNext()" style="cursor:pointer;padding:3px 9px">▶</button><span id="tgInspStat" style="margin:0 6px;font-weight:600;min-width:240px"></span><button onclick="tgInspEnd()" style="cursor:pointer;padding:3px 9px;border:1px solid #ccc;border-radius:5px">✕ 종료</button>';document.body.appendChild(b);}
function tgInspRefresh(){if(_tgInsp){_tgInsp.probs=tgInspProbs(_tgInsp.seg);if(_tgInsp.review){tgInspRedAll(_tgInsp.seg);}else{tgInspRender();}return;}if(_tgReviewSeg!=null)tgInspRedAll(_tgReviewSeg);}
function tgInspClear(){document.querySelectorAll('.tg-insp-hl').forEach(function(el){el.classList.remove('tg-insp-hl');el.style.outline='';el.style.boxShadow='';el.style.background='';});}
function tgInspRender(){if(!_tgInsp)return;var sg=_tgSegs[_tgInsp.seg];if(!sg)return;var key=tgManualKey(sg);tgInspClear();if(typeof LV!=='undefined'&&LV){var _ctrl=['mh','riser','depth','code'];var _want=tgInspLayers(_tgInsp.steps[_tgInsp.step],sg);var _chg=false;_ctrl.forEach(function(k){var on=_want.indexOf(k)>=0?1:0;if((LV[k]?1:0)!==on){LV[k]=on;_chg=true;}});if(_chg){try{localStorage.setItem(LV_KEY,JSON.stringify(LV));}catch(e){}if(typeof applyLayerVis==='function')applyLayerVis();if(typeof drawGeo==='function')drawGeo();}}
 var _dF={},_dR={};for(var _si=0;_si<=_tgInsp.step;_si++){var _st=_tgInsp.steps[_si];if(!_st)continue;if(_st.t==='fld'){if(_tgInsp.probs._fld&&_tgInsp.probs._fld[_st.f])_dF[_st.f]=1;}else if(_st.t==='pt'){if(_tgInsp.probs[_st.ri]&&_tgInsp.probs[_st.ri].length)_dR[_st.ri]=1;}}for(var ri=0;ri<sg.length;ri++){var prob=_dR[ri];var r=document.getElementById('tgsr'+ri);if(r)r.style.background=prob?'#ffb3b3':'';var hr=document.querySelector('.tgwrap tr[data-tgkey="'+key+'"][data-ri="'+ri+'"]');if(hr)hr.style.background=prob?'#ffb3b3':'';}['ext','own','gyeol','gdan','naegwan','gwannum','inner','dig','s_fac','s_own','s_spec','s_pos','s_nm','e_fac','e_own','e_spec','e_pos','e_nm'].forEach(function(f){var nodes=document.querySelectorAll('[data-seg="'+key+'"][data-field="'+f+'"]');for(var i=0;i<nodes.length;i++){nodes[i].style.background=_dF[f]?'#ffb3b3':'';}});
 var st=_tgInsp.steps[_tgInsp.step];var lab='',valStr='',markRi=0;
 if(st.t==='fld'){var f=st.f;var M=(state.tangoManual&&state.tangoManual[key])||{};var E=tgExpect(_tgInsp.seg);var s0=sg[0],s1=sg[sg.length-1];var autoMap={s_fac:s0.mh?'신설_맨홀':'지중구조물',s_spec:s0.mh?(s0.spec||''):'기타',s_nm:s0.mh?(s0.name||''):'관말',e_fac:s1.mh?'신설_맨홀':'지중구조물',e_spec:s1.mh?(s1.spec||''):'기타',e_nm:s1.mh?(s1.name||''):'관말'};var v=M[f]||autoMap[f]||E[f]||'';lab=TGFL[f]||f;valStr=v||'(빈칸)';markRi=(st.grp==='end')?sg.length-1:0;var metaId=st.grp==='start'?'tgmeta_start':(st.grp==='end'?'tgmeta_end':'tgmeta_common');var me=document.getElementById(metaId);if(me){me.classList.add('tg-insp-hl');me.style.outline='2px solid #e74c3c';}
  var sels=document.querySelectorAll('[data-seg="'+key+'"][data-field="'+f+'"]');sels.forEach(function(el){el.classList.add('tg-insp-hl');el.style.outline='3px solid #e74c3c';el.style.boxShadow='0 0 0 3px rgba(231,76,60,.28)';el.style.background='#fff3b0';if(el.scrollIntoView)el.scrollIntoView({block:'center',inline:'center'});});
 }else{markRi=st.ri;var nd=sg[st.ri];lab='측점 '+(st.ri+1)+(st.ch&&st.ch.length?' · ⚠변화['+st.ch.join(',')+']':' · 심도');valStr='심도 '+(nd.mh?'-':(nd.z!=null?nd.z.toFixed(2):'(빈칸)'));var r2=document.getElementById('tgsr'+st.ri);if(r2){if(!(_tgInsp.probs[st.ri]&&_tgInsp.probs[st.ri].length))r2.style.background='#fff0a0';r2.classList.add('tg-insp-hl');r2.style.outline='2px solid #e74c3c';if(r2.scrollIntoView)r2.scrollIntoView({block:'nearest'});}var hr2=document.querySelector('.tgwrap tr[data-tgkey="'+key+'"][data-ri="'+st.ri+'"]');if(hr2){hr2.classList.add('tg-insp-hl');hr2.style.background='#fff0a0';if(hr2.scrollIntoView)hr2.scrollIntoView({block:'center'});}var _ss=document.querySelector('.tgwrap [data-seg="'+key+'"][data-field="soil_'+(nd.no||st.ri)+'"]');if(_ss&&_ss.scrollIntoView)_ss.scrollIntoView({block:'center',inline:'center'});}
 tgInspMarker(sg[markRi]);
 var nProb=0;for(var _ni=0;_ni<=_tgInsp.step;_ni++){var _ns=_tgInsp.steps[_ni];if(!_ns)continue;if(_ns.t==='fld'){if(_tgInsp.probs._fld&&_tgInsp.probs._fld[_ns.f])nProb++;}else if(_ns.t==='pt'){if(_tgInsp.probs[_ns.ri]&&_tgInsp.probs[_ns.ri].length)nProb++;}}var sb=document.getElementById('tgInspStat');if(sb)sb.innerHTML='['+(_tgInsp.step+1)+'/'+_tgInsp.steps.length+'] '+lab+' = <b style="color:#0a3ea0">'+valStr+'</b> · <span style="color:'+(nProb?'#e74c3c':'#1e7e34')+'">문제 '+nProb+'</span>';if(typeof tgInspInfoBox==='function')tgInspInfoBox(lab+' = '+valStr,sg[markRi]);}
function tgInspGo(stepIdx){if(!_tgInsp)return;var L=_tgInsp.steps.length;if(stepIdx<0)stepIdx=0;if(stepIdx>=L)stepIdx=L-1;_tgInsp.step=stepIdx;tgInspRender();}
function tgInspNext(){if(_tgInsp)tgInspGo(_tgInsp.step+1);}
function tgInspPrev(){if(_tgInsp)tgInspGo(_tgInsp.step-1);}
function tgInspPlayToggle(){if(!_tgInsp)return;if(_tgInsp.playing){tgInspStop();return;}if(_tgInsp.step>=_tgInsp.steps.length-1)tgInspGo(0);_tgInsp.playing=true;var b=document.getElementById('tgInspPlayBtn');if(b)b.textContent='⏸정지';_tgInsp.timer=setInterval(function(){if(!_tgInsp)return;if(_tgInsp.step>=_tgInsp.steps.length-1){if(_tgInsp.autoAll&&_tgInsp.seg<_tgSegs.length-1){tgInspGotoSeg(_tgInsp.seg+1,false);return;}tgInspStop();if(_tgInsp.autoAll)tgInspFinish();return;}tgInspGo(_tgInsp.step+1);},800);}
function tgInspStop(){if(!_tgInsp)return;_tgInsp.playing=false;if(_tgInsp.timer){clearInterval(_tgInsp.timer);_tgInsp.timer=null;}var b=document.getElementById('tgInspPlayBtn');if(b)b.textContent='▶재생';}
function tgInspEnd(){tgInspStop();var b=document.getElementById('tgInspBar');if(b)b.remove();var m=document.getElementById('tgInspMk');if(m)m.remove();var _ib=document.getElementById('tgInspInfo');if(_ib)_ib.remove();tgInspClear();if(_tgInsp){var sg=_tgSegs[_tgInsp.seg];var key=sg?tgManualKey(sg):'';if(sg)for(var ri=0;ri<sg.length;ri++){var r=document.getElementById('tgsr'+ri);if(r){r.style.background='';r.style.outline='';}var hr=document.querySelector('.tgwrap tr[data-tgkey="'+key+'"][data-ri="'+ri+'"]');if(hr)hr.style.background='';}['ext','own','gyeol','gdan','naegwan','gwannum','inner','dig','s_fac','s_own','s_spec','s_pos','s_nm','e_fac','e_own','e_spec','e_pos','e_nm'].forEach(function(f){var nds=document.querySelectorAll('[data-seg="'+key+'"][data-field="'+f+'"]');for(var i=0;i<nds.length;i++)nds[i].style.background='';});['tgmeta_common','tgmeta_start','tgmeta_end'].forEach(function(id){var e=document.getElementById(id);if(e)e.style.outline='';});if(_tgInsp.lvBak&&typeof LV!=='undefined'){for(var lk in _tgInsp.lvBak)LV[lk]=_tgInsp.lvBak[lk];try{localStorage.setItem(LV_KEY,JSON.stringify(LV));}catch(e){}if(typeof applyLayerVis==='function')applyLayerVis();if(typeof drawGeo==='function')drawGeo();}}_tgInsp=null;}
function tgInspLayers(st,sg){if(st.t==='pt')return ['depth'];if(st.t==='fld'){if(st.grp==='common')return ['code'];var nd=(st.grp==='start')?sg[0]:sg[sg.length-1];if(nd.mh)return nd.riser?['riser']:['mh'];return ['depth'];}return [];}
function tgInspInfoBox(txt,nd){var cw=document.querySelector('.canvas-wrap');if(!cw)return;var b=document.getElementById('tgInspInfo');if(!b){b=document.createElement('div');b.id='tgInspInfo';b.style.cssText='position:absolute;z-index:60;background:rgba(231,76,60,.93);color:#fff;padding:5px 11px;border-radius:7px;font-size:13px;font-weight:700;box-shadow:0 2px 10px rgba(0,0,0,.3);pointer-events:none;white-space:nowrap;transform:translateY(-50%)';cw.appendChild(b);}b.innerHTML=txt;var cv=document.getElementById('cv');if(cv&&nd&&cv.getScreenCTM){var sx=S(nd.x,nd.y);var pt=cv.createSVGPoint();pt.x=sx[0];pt.y=sx[1];var ctm=cv.getScreenCTM();if(ctm){var sp=pt.matrixTransform(ctm);var rect=cw.getBoundingClientRect();var lx=sp.x-rect.left+26,ty=sp.y-rect.top-32;if(lx>rect.width-130)lx=sp.x-rect.left-26-b.offsetWidth;b.style.left=lx+'px';b.style.top=ty+'px';}}}
function tgInspMarker(nd){var cv=document.getElementById('cv');if(!cv||!nd)return;var m=document.getElementById('tgInspMk');if(m)m.remove();var s=S(nd.x,nd.y);var g=document.createElementNS('http://www.w3.org/2000/svg','g');g.id='tgInspMk';g.setAttribute('pointer-events','none');var c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',s[0]);c.setAttribute('cy',s[1]);c.setAttribute('r','3.4');c.setAttribute('fill','rgba(231,76,60,0.28)');c.setAttribute('stroke','#e74c3c');c.setAttribute('stroke-width','1.8');c.setAttribute('vector-effect','non-scaling-stroke');g.appendChild(c);cv.appendChild(g);}
function tgManualKey(sg){function q(n){return Math.round(n.x*100)+'_'+Math.round(n.y*100);}return q(sg[0])+'__'+q(sg[sg.length-1]);}
function tgManualOnChange(el){var seg=el.getAttribute('data-seg'),fld=el.getAttribute('data-field');if(!seg||!fld)return;if(!state.tangoManual)state.tangoManual={};if(!state.tangoManual[seg])state.tangoManual[seg]={};state.tangoManual[seg][fld]=el.value;var nl=document.querySelectorAll('[data-seg="'+seg+'"][data-field="'+fld+'"]');for(var i=0;i<nl.length;i++){if(nl[i]!==el&&nl[i].value!==el.value)nl[i].value=el.value;}if(/_fac$/.test(fld)){var _pre=fld.charAt(0);['spec','pos'].forEach(function(_sp){var _op=(_sp==='spec')?tgSpecFor(el.value):tgPosFor(el.value);var _ss=document.querySelectorAll('[data-seg="'+seg+'"][data-field="'+_pre+'_'+_sp+'"]');for(var _i=0;_i<_ss.length;_i++){var _cv=_ss[_i].value;var _hh='<option value=""></option>';_op.forEach(function(o){_hh+='<option'+(o===_cv?' selected':'')+'>'+o+'</option>';});_ss[_i].innerHTML=_hh;}});}try{var _mm=fld.match(/^([se])_(fac|own|spec|nm)$/);if(_mm&&typeof _tgSegs!=='undefined'&&_tgSegs){var _pre0=_mm[1],_sub=_mm[2];var _tsg=null;for(var _q=0;_q<_tgSegs.length;_q++){if(tgManualKey(_tgSegs[_q])===seg){_tsg=_tgSegs[_q];break;}}if(_tsg){var _nd=(_pre0==='s')?_tsg[0]:_tsg[_tsg.length-1];if(_nd&&_nd.mh){var _mx=_nd.x,_my=_nd.y;for(var _q2=0;_q2<_tgSegs.length;_q2++){var _g=_tgSegs[_q2];var _gk=tgManualKey(_g);var _ends=[['s',_g[0]],['e',_g[_g.length-1]]];for(var _e=0;_e<2;_e++){var _pp=_ends[_e];if(_pp[1]&&_pp[1].mh&&Math.abs(_pp[1].x-_mx)<0.5&&Math.abs(_pp[1].y-_my)<0.5){if(!state.tangoManual[_gk])state.tangoManual[_gk]={};state.tangoManual[_gk][_pp[0]+'_'+_sub]=el.value;var _o2=document.querySelectorAll('[data-seg="'+_gk+'"][data-field="'+_pp[0]+'_'+_sub+'"]');for(var _o=0;_o<_o2.length;_o++){if(_o2[_o].value!==el.value)_o2[_o].value=el.value;}}}}var _mh=(state.manholes||[]).filter(function(m){return m.wx!=null&&Math.abs(m.wx-_mx)<0.5&&Math.abs(m.wy-_my)<0.5;})[0];if(_mh){if(_mh.type==='riser'||(_nd&&_nd.riser)||(state.tangoManual[seg]&&state.tangoManual[seg][_pre0+'_fac']==='입상점')){if(_mh.type!=='riser'){_mh.type='riser';}if(_mh.kind)delete _mh.kind;if(_sub==='spec')_mh.spec=el.value;else if(_sub==='own')_mh._own=el.value;else if(_sub==='nm')_mh.label=el.value;}else if(_sub==='fac')_mh.kind=(el.value.indexOf('기')===0?'기':'신');else if(_sub==='spec')_mh.spec=el.value;else{var _own=(state.tangoManual[seg][_pre0+'_own']||'');var _nm=(state.tangoManual[seg][_pre0+'_nm']||'');var _pp2=_nm.replace(/M\s*$/,'').trim();_mh.label=_pp2+'M ('+_own+(_own?' ':'')+')';}_mh._edited=true;if(typeof drawManholes==='function')drawManholes();}}}}}catch(_e2){}if(typeof tgInspRefresh==='function')tgInspRefresh();if(typeof saveProject==='function')saveProject();}
function tgSurfToPos(sf){return sf==='\uB3C4\uB85C'?'\uB3C4\uB85C(\uCC28\uB3C4)':(sf==='\uBCF4\uB3C4'||sf==='\uC0AC\uB9AC\uB3C4')?'\uC778\uB3C4':'';}
function tgSpecFor(f){return (TG_OPT.facSpec&&TG_OPT.facSpec[f])||TG_OPT.spec;}
function tgPosFor(f){return (TG_OPT.facPos&&TG_OPT.facPos[f])||TG_OPT.pos;}
function sel(opts,auto,seg,fld){var sv=(seg&&fld&&state.tangoManual&&state.tangoManual[seg]&&state.tangoManual[seg][fld]!=null)?state.tangoManual[seg][fld]:null;var v=(sv!=null&&sv!=='')?sv:(auto||'');var dz=seg?(' data-seg="'+seg+'" data-field="'+fld+'" onchange="tgManualOnChange(this)"'):'';var h='<select class="tgs"'+dz+'><option value=""></option>';opts.forEach(function(o){h+='<option'+(o===v?' selected':'')+'>'+o+'</option>';});return h+'</select>';}
function inp(v,seg,fld,bare){var sv=(seg&&fld&&state.tangoManual&&state.tangoManual[seg]&&state.tangoManual[seg][fld]!=null)?state.tangoManual[seg][fld]:null;var vv=(sv!=null&&sv!=='')?sv:(v||'');var dz=seg?(' data-seg="'+seg+'" data-field="'+fld+'" onchange="tgManualOnChange(this)"'):'';return '<input class="tgi"'+(bare?' style="border:1px solid #bcd;outline:none;box-shadow:none;background:#fff;border-radius:3px;box-sizing:border-box;text-align:center;width:100%;min-height:22px;cursor:text"':'')+dz+' value="'+vv+'">';}
function tgSegMeta(sg,s0,s1,totd,avg,jj){var SEGK=tgManualKey(sg);var O=TG_OPT;var sFac=s0.riser?'\uC785\uC0C1\uC810':(s0.mh?'\uC2E0\uC124_\uB9E8\uD640':'\uC9C0\uC911\uAD6C\uC870\uBB3C'),sNm=s0.mh?(s0.name||''):'\uAD00\uB9D0',sSp=s0.mh?(s0.spec||''):'\uAE30\uD0C0';var eFac=s1.riser?'\uC785\uC0C1\uC810':(s1.mh?'\uC2E0\uC124_\uB9E8\uD640':'\uC9C0\uC911\uAD6C\uC870\uBB3C'),eNm=s1.mh?(s1.name||''):'\uAD00\uB9D0',eSp=s1.mh?(s1.spec||''):'\uAE30\uD0C0';var thc='border:1px solid #cbd5e8;padding:7px 9px;text-align:center;font-size:12px;font-weight:700;background:#dde6f7;white-space:nowrap';var tdc='border:1px solid #e2e2e2;padding:7px 9px;text-align:center;font-size:12px;white-space:nowrap';var Ah=['\uC678\uAD00','\uC8FC\uAD00','\uACF5\uC5F4','\uACF5\uB2E8','\uB0B4\uAD00','\uAD00\uACF5\uBC88\uD638','\uB0B4\uAD00\uADDC\uACA9','\uAD74\uCC29\uBC29\uBC95','\uC900\uACF5\uAC70\uB9AC(m)','\uD3C9\uADE0\uC2EC\uB3C4(m)','\uC9C0\uC911\uD45C\uC2DC'];var Av=[sel(O.ext,null,SEGK,'ext'),sel(O.own,null,SEGK,'own'),inp('',SEGK,'gyeol',1),inp('',SEGK,'gdan',1),inp('',SEGK,'naegwan',1),inp('',SEGK,'gwannum',1),sel(O.inner,null,SEGK,'inner'),sel(O.dig,null,SEGK,'dig'),totd.toFixed(2),(avg!=null?avg.toFixed(1):'-'),''+jj];var thcA=thc+';padding:3px 3px;font-size:11px;white-space:normal;word-break:keep-all';var tdcA=tdc+';padding:2px 2px;font-size:11px;white-space:normal';var mA='<table style="border-collapse:collapse;margin-top:8px;width:100%;table-layout:fixed"><tr>'+Ah.map(function(t,idx){var ex='';var _w=';width:'+[10,9,7.5,7.5,7.5,7.5,14,15,10,7,5][idx]+'%';return '<th style="'+thcA+ex+_w+'">'+t+'</th>';}).join('')+'</tr><tr id="tgmeta_common">'+Av.map(function(v,idx){var ex='';return '<td style="'+tdcA+ex+'">'+v+'</td>';}).join('')+'</tr></table>';function frow(lab,fac,spec,nm,pre){return '<tr id="tgmeta_'+(pre==='s'?'start':'end')+'"><td onclick="tgGotoFac(\''+pre+'\')" style="'+tdc+';font-weight:700;background:#eaf1ff;cursor:pointer"><span onmouseenter="tgShowTip(this,\''+(pre==='s'?'\uC2DC\uC791':'\uC885\uB8CC')+' \uCE21\uC810\uC774\uB3D9\')" onmouseleave="tgHideTip()" style="cursor:pointer">'+lab+'</span></td><td style="'+tdc+'">'+sel(O.fac,fac,SEGK,pre+'_fac')+'</td><td style="'+tdc+'">'+sel(O.own,null,SEGK,pre+'_own')+'</td><td style="'+tdc+'">'+sel(tgSpecFor(fac),spec,SEGK,pre+'_spec')+'</td><td style="'+tdc+'">'+sel(tgPosFor(fac),null,SEGK,pre+'_pos')+'</td><td style="'+tdc+'">'+inp(nm,SEGK,pre+'_nm')+'</td></tr>';}var mB='<table style="border-collapse:collapse;margin-top:6px"><tr><th style="'+thc+'">\uC2DC\uC124\uBB3C</th><th style="'+thc+'">\uC124\uBE44</th><th style="'+thc+'">\uC18C\uC720</th><th style="'+thc+'">\uADDC\uACA9</th><th style="'+thc+'">\uC704\uCE58</th><th style="'+thc+'">\uC2DC\uC124\uBA85</th></tr>'+frow('\uC2DC\uC791',sFac,sSp,sNm,'s')+frow('\uC885\uB8CC',eFac,eSp,eNm,'e')+'</table>';return mA+mB;}
var TAMSA_PAVE_CODE={'\uC544\uC2A4\uD314\uD2B8':'AS'};function tgSegTable(sg){var th='border:1px solid #cbd5e8;padding:1px 6px;text-align:center;font-weight:700;background:#dde6f7;position:sticky;top:0;z-index:1';var td='border:1px solid #e2e2e2;padding:1px 6px;text-align:center;line-height:1.3';var _tm=!!(state&&state.tamsa);var h='<table style="border-collapse:collapse;width:100%;font-size:11px;margin-top:8px"><tr><th style="'+th+'">\uC21C\uBC88</th><th style="'+th+'">\uAD6C\uBD84</th>'+(_tm?'<th style="'+th+'">\uCF54\uB4DC</th><th style="'+th+'">\uC704\uCE58</th><th style="'+th+'">\uD1A0\uC801</th>':'')+'<th style="'+th+'">\uC2EC\uB3C4(m)</th><th style="'+th+'">\uAD6C\uAC04\uAC70\uB9AC(m)</th>'+(_tm?'':'<th style="'+th+'">\uACBD\uB3C4</th><th style="'+th+'">\uC704\uB3C4</th>')+'</tr>';sg.forEach(function(nd,ri){var ll=(typeof toLatLng==='function')?toLatLng(nd.x,nd.y):null;var d=(ri===0)?0:Math.hypot(nd.x-sg[ri-1].x,nd.y-sg[ri-1].y);var isEnd=(ri===0||ri===sg.length-1);var kind=nd.mh?(nd.riser?'\uC785\uC0C1':'\uB9E8\uD640'):(isEnd?'\uAD00\uB9D0':'\uCE21\uC810');var _selr=(typeof _tgSelNo!=='undefined'&&_tgSelNo!=null&&nd.no===_tgSelNo)||(nd.mh&&typeof _tgSelXY!=='undefined'&&_tgSelXY&&Math.abs(nd.x-_tgSelXY.x)<0.01&&Math.abs(nd.y-_tgSelXY.y)<0.01);var rbg=_selr?('background:'+((mode==='tgptedit')?'#ffb3b3':'#bdf0c8')+';font-weight:700'):nd.mh?'background:#fff3d6;font-weight:700':((!nd.mh&&isEnd)?'background:#ffe6ee;font-weight:700':(ri%2?'background:#f7f9fc':''));h+='<tr id="tgsr'+ri+'" onclick="tgRowClick('+ri+')" ondblclick="tgRowEdit('+ri+')" style="cursor:pointer;'+rbg+'"><td style="'+td+'">'+(ri+1)+((mode==='tgptedit'&&!nd.mh)?' <span onclick="event.stopPropagation();tgPtDelete('+ri+')" style="cursor:pointer;color:#e74c3c;font-size:13px" title="삭제">🗑</span>':'')+'</td><td style="'+td+'">'+kind+'</td>'+(_tm?(function(){var _p=(!nd.mh&&nd.no!=null&&typeof pointByNo==='function')?pointByNo(nd.no):null;var _cd=_p?(_p._tcode||_p.code||''):'';var _sf,_pv;if(_p){_sf=_p.surface||'';_pv=_p.pave||'';}else if(nd.riser){_sf='';_pv=nd.pave||'';}else{_sf=nd.surface||'';_pv=nd.pave||'';}_pv=TAMSA_PAVE_CODE[_pv]||_pv;var _codeHtml,_ddbl='';if(_p&&!nd.mh&&!nd.riser){var _isTx=!!_p.isT;var _bodyx=(_cd||'').replace(/^T\s*/i,'');_codeHtml=(_isTx?'<span style="color:#e53935;font-weight:800">T</span>'+(_bodyx?' ':''):'')+_bodyx;_ddbl=' ondblclick="event.stopPropagation();openCodeEdit(\''+(nd.no||'')+'\',event)" title="더블클릭: 점정보/관경/관수 편집"';}else{_codeHtml=_cd;}return '<td style="'+td+'"'+_ddbl+'>'+_codeHtml+'</td><td style="'+td+'">'+_sf+'</td><td style="'+td+'">'+_pv+'</td>';})():'')+'<td style="'+td+'">'+(nd.mh?'-':(nd.z!=null?nd.z.toFixed(2):''))+'</td><td style="'+td+'">'+d.toFixed(2)+'</td>'+(_tm?'':'<td style="'+td+'">'+(ll?(+ll.lng).toFixed(6):'')+'</td><td style="'+td+'">'+(ll?(+ll.lat).toFixed(6):'')+'</td>')+'</tr>';});return h+'</table>';}
function tangoSelSeg(i,noFit){if(typeof _tgInsp!=='undefined'&&_tgInsp)tgInspEnd();tgSeg=i;if(typeof tgInfoRender==='function')tgInfoRender(i);if(!noFit){if(i>=0&&_tgSegs&&_tgSegs[i]){if(typeof tangoFitSeg==='function')tangoFitSeg(_tgSegs[i]);}else{if(typeof tgFitAll==='function')tgFitAll();}}if(typeof tgDrawSegHL==='function')tgDrawSegHL(i);}
function tangoBuildSegs(){if(typeof classifyRoad==='function')classifyRoad();function qk(x,y){return Math.round(x*100)+'_'+Math.round(y*100);}function dep2(p){var v=(state._depthByNo&&state._depthByNo[p.no]!=null)?state._depthByNo[p.no]:p.z;return(v==null||v==='')?null:+v;}var pipes=(state.lines||[]).filter(function(L){return L.layer==='통신관로'&&L.pts&&L.pts.length>=2;});var adj={},pos={};pipes.forEach(function(L){for(var i=0;i<L.pts.length-1;i++){var a=L.pts[i],b=L.pts[i+1];var ka=qk(a[0],a[1]),kb=qk(b[0],b[1]);if(ka===kb)continue;pos[ka]={x:a[0],y:a[1]};pos[kb]={x:b[0],y:b[1]};(adj[ka]=adj[ka]||[]).push(kb);(adj[kb]=adj[kb]||[]).push(ka);}});for(var k in adj){var sn={},u=[];adj[k].forEach(function(v){if(!sn[v]){sn[v]=1;u.push(v);}});adj[k]=u;}if(!Object.keys(pos).length)return [];var mhByKey={};(state.manholes||[]).forEach(function(m){if(m.wx==null)return;var mk=qk(m.wx,m.wy);if(pos[mk]){mhByKey[mk]=m;return;}var best=null,bd=0.25;for(var kk in pos){var dd=Math.hypot(pos[kk].x-m.wx,pos[kk].y-m.wy);if(dd<bd){bd=dd;best=kk;}}if(best)mhByKey[best]=m;});function deg(k){return (adj[k]||[]).length;}function isB(k){return !!(mhByKey[k]||deg(k)===1);}function ek(a,b){return a<b?a+'|'+b:b+'|'+a;}var _bnd={};for(var _bq in pos){if(isB(_bq))_bnd[_bq]={x:pos[_bq].x,y:pos[_bq].y};}window._tgBnd=_bnd;var usedE={};function pathTo(a,b){var pr={};pr[a]=null;var q=[a],sn={};sn[a]=1;while(q.length){var x=q.shift();if(x===b)break;(adj[x]||[]).forEach(function(y){if(!sn[y]){sn[y]=1;pr[y]=x;q.push(y);}});}if(!(b in pr))return null;var pp=[b],z=pr[b];while(z!=null){pp.push(z);z=pr[z];}pp.reverse();return pp;}var fixPaths=[];var _fsn={};function _snapB(k){if(!pos[k])return null;if(isB(k))return k;var best=null,bd=3.0;for(var bk in pos){if(!isB(bk))continue;var dd=Math.hypot(pos[bk].x-pos[k].x,pos[bk].y-pos[k].y);if(dd<bd){bd=dd;best=bk;}}return best;}(state.tgFixSegs||[]).forEach(function(fx){if(!fx||!fx.a||!fx.b)return;var ka=_snapB(fx.a),kb=_snapB(fx.b);if(!ka||!kb||ka===kb)return;var fk=ka<kb?ka+'|'+kb:kb+'|'+ka;if(_fsn[fk])return;_fsn[fk]=1;var pp=pathTo(ka,kb);if(pp&&pp.length>=2){fixPaths.push(pp);for(var qi=1;qi<pp.length;qi++)usedE[ek(pp[qi-1],pp[qi])]=1;}});function turn(a,b,c){var v1x=pos[b].x-pos[a].x,v1y=pos[b].y-pos[a].y,v2x=pos[c].x-pos[b].x,v2y=pos[c].y-pos[b].y;var d1=Math.hypot(v1x,v1y),d2=Math.hypot(v2x,v2y);if(d1<1e-9||d2<1e-9)return 0;var dot=(v1x*v2x+v1y*v2y)/(d1*d2);dot=Math.max(-1,Math.min(1,dot));return Math.acos(dot)*180/Math.PI;}var TMAX=100;function chain(A,nb){if(usedE[ek(A,nb)])return null;var path=[A,nb],prev=A,cur=nb,g=0;while(!isB(cur)&&g++<10000){var nx=(adj[cur]||[]).filter(function(x){return x!==prev&&!usedE[ek(cur,x)];});if(!nx.length)return null;var best=null,ba=1e9;nx.forEach(function(x){var t=turn(prev,cur,x);if(t<ba){ba=t;best=x;}});if(best==null||ba>=TMAX)return null;path.push(best);prev=cur;cur=best;}return isB(cur)?path:null;}var raw=[];Object.keys(pos).filter(isB).forEach(function(A){(adj[A]||[]).forEach(function(nb){var c=chain(A,nb);if(c)raw.push(c);});});raw=fixPaths.concat(raw);var seen={},segsN=[];raw.forEach(function(p){var a=p.join('>'),b=p.slice().reverse().join('>');var key=a<b?a:b;if(seen[key])return;seen[key]=1;segsN.push(p);});function seglen(p){var t=0;for(var i=1;i<p.length;i++)t+=Math.hypot(pos[p[i]].x-pos[p[i-1]].x,pos[p[i]].y-pos[p[i-1]].y);return t;}function segKey(p){var a=p.join('>'),b=p.slice().reverse().join('>');return a<b?a:b;}var byB={};segsN.forEach(function(p){(byB[p[0]]=byB[p[0]]||[]).push(p);(byB[p[p.length-1]]=byB[p[p.length-1]]||[]).push(p);});var bnd=Object.keys(pos).filter(isB);if(!bnd.length)return [];var root=bnd[0];bnd.forEach(function(k){if(pos[k].y<pos[root].y)root=k;});var ordered=[],used={};function walk(node){var outs=(byB[node]||[]).filter(function(p){return !used[segKey(p)];});outs.sort(function(a,b){return seglen(a)-seglen(b);});outs.forEach(function(p){var kk=segKey(p);if(used[kk])return;used[kk]=1;var ori=(p[0]===node)?p:p.slice().reverse();ordered.push(ori);walk(ori[ori.length-1]);});}walk(root);segsN.forEach(function(p){if(!used[segKey(p)]){used[segKey(p)]=1;ordered.push(p);}});var pts=(state.points||[]).filter(function(p){return !/보강판/.test((p.no||'')+(p.code||''))&&!(typeof isManhole==='function'&&isManhole(p));});function toNode(kk){var m=mhByKey[kk];if(m){var lb=m.label||'';var nm=(m.kind||'')+(lb.replace(/\s*\([^)]*\)\s*/g,'').trim());return {mh:true,x:m.wx,y:m.wy,z:null,spec:(m.spec||((/\)\s*([^)]+)$/.exec(m.label||'')||[])[1]||'').trim()),name:nm,riser:m.type==='riser',surface:m.surface||'',pave:m.pave||''};}var pp=pos[kk];var best=null,bd=1e9;pts.forEach(function(p){var dd=Math.hypot(p.x-pp.x,p.y-pp.y);if(dd<bd){bd=dd;best=p;}});return {mh:false,x:pp.x,y:pp.y,z:best?dep2(best):null,no:best?best.no:''};}var segs=[],raws=[];ordered.forEach(function(pa){var nd=pa.map(toNode);var A=nd[0],B=nd[nd.length-1];if(!A.mh&&!B.mh)return;var out=[];nd.forEach(function(n){var last=out[out.length-1];if(last&&!last.mh&&!n.mh&&last.no===n.no&&n.no)return;out.push(n);});if(out.length<2)return;var rw=pa.map(function(k3){return [pos[k3].x,pos[k3].y];});segs.push(out);raws.push(rw);});window._tgSegRaw=raws;return segs;}
function tangoFill(){var sm=document.getElementById('tangoSum'),bd=document.getElementById('tangoBody');
function dep(p){var v=(state._depthByNo&&state._depthByNo[p.no]!=null)?state._depthByNo[p.no]:p.z;return(v==null||v==='')?null:+v;}
var segs=tangoBuildSegs();if(state.tgSegDel){var _raw=window._tgSegRaw||[];var _ns=[],_nr=[];segs.forEach(function(sg,ix){if(!state.tgSegDel[tgManualKey(sg)]){_ns.push(sg);_nr.push(_raw[ix]);}});segs=_ns;window._tgSegRaw=_nr;}_tgSegs=segs;tgAutoMatch();if(!bd)return;var _SOIL_CODE={'\uC544\uC2A4\uD314\uD2B8':'AS','\uBCF4\uB3C4':'B','\uC0AC\uB9AC\uB3C4':'S','\uCF58\uD06C\uB9AC\uD2B8':"CON'C"};function _soilAuto(nd){if(!nd)return null;var _pv=nd.pave;if((_pv==null||_pv==='')&&nd.no&&typeof pointByNo==='function'){var _q=pointByNo(nd.no);if(_q)_pv=_q.pave;}if(_pv==null||_pv==='')return null;return _SOIL_CODE[_pv]||_pv;}var mhCnt=(state.manholes||[]).filter(function(m){return m&&m.wx!=null;}).length;var ptCnt=(state.points||[]).filter(function(p){return !/보강판/.test((p.no||'')+(p.code||''))&&!(typeof isManhole==='function'&&isManhole(p));}).length;
var tb=state.titleBlock||{},biz=state.bizInfo||{};var tango=tb.tango||tb.tangoNo||biz.bizNo||'',pname=state.projectName||'';
if(sm)sm.textContent='\uAD6C\uAC04 '+segs.length+' \u00B7 \uB9E8\uD640 '+mhCnt+' \u00B7 \uCE21\uC810 '+ptCnt;var mm=document.getElementById('tgMeta');if(mm)mm.innerHTML='\uACF5\uC0AC\uBC88\uD638 <b>'+tango+'</b>\u3000\uACF5\uC0AC\uBA85 <b>'+pname+'</b>';
var O=TG_OPT;
var H='<style>.tgmeta{margin:0 0 8px;display:flex;gap:16px;align-items:center;font-size:13px}.tgexp{margin-left:auto;background:#1e7e34;color:#fff;border:none;border-radius:6px;padding:7px 16px;font-weight:700;cursor:pointer}.tgwrap{overflow:auto;max-height:calc(34vh - 50px);border:1px solid #ddd}.tgwrap .tgt thead tr:first-child th{position:sticky;top:0;z-index:4;background:#dde6f7;height:22px;box-sizing:border-box}.tgwrap .tgt thead tr:nth-child(2) th{position:sticky;top:22px;z-index:3;background:#dde6f7}.tgwrap .tgfacHL{background:#fff3b0!important;outline:1px solid #f1c40f;outline-offset:-1px}.tgt{border-collapse:collapse;font-size:11px;white-space:nowrap;background:#fff;table-layout:fixed;width:2262px}.tgt th,.tgt td{border:1px solid #cfcfcf;padding:0 4px;text-align:center;vertical-align:middle;line-height:1.05}.tgt th{background:#eef2fb;font-weight:600;position:sticky;top:0;z-index:2}.tgs,.tgi{width:100%;box-sizing:border-box;font-size:10px;padding:0 1px;height:14px;border:1px solid #ccc;border-radius:3px;background:#fff}.tgs{padding-right:0;width:100%;box-sizing:border-box}#tgmeta_common td{border:1px solid #e2e2e2!important}#tgmeta_common input.tgi{border:1px solid #ccc;outline:none;box-shadow:none;background:#fff;text-align:center;border-radius:3px}#tgmeta_common .tgs{border:1px solid #ccc!important}#tgmeta_start>td:first-child:hover,#tgmeta_end>td:first-child:hover{background:#ff5a5a!important;color:#fff!important;box-shadow:inset 0 0 0 2px #d32f2f;transition:.1s}.ftipw{position:relative;display:inline-block}.ftipw:hover::after{content:attr(data-tip);position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:8px;background:#fff;color:#d32f2f;border:1.5px solid #d32f2f;border-radius:5px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;z-index:1000}.tgsegs{display:flex;gap:6px;margin:0 0 8px;flex-wrap:wrap}.tgsegs button{font-size:12px;padding:4px 12px;border:1px solid #f1c40f;background:#fff;border-radius:6px;cursor:pointer;font-weight:600}.tgsegs button.on{background:#f1c40f;color:#000}.tgt .seg0{border-top:2px solid #f1c40f}</style>';
H+='<div class="tgwrap"><table class="tgt"><colgroup><col style="width:98px"><col style="width:62px"><col style="width:48px"><col style="width:48px"><col style="width:48px"><col style="width:96px"><col style="width:124px"><col style="width:62px"><col style="width:58px"><col style="width:152px"><col style="width:104px"><col style="width:62px"><col style="width:94px"><col style="width:104px"><col style="width:112px"><col style="width:104px"><col style="width:62px"><col style="width:94px"><col style="width:104px"><col style="width:112px"><col style="width:56px"><col style="width:44px"><col style="width:104px"><col style="width:98px"><col style="width:94px"><col style="width:62px"><col style="width:56px"></colgroup>';
H+='<thead><tr><th rowspan=2>\uC678\uAD00</th><th rowspan=2>\uC8FC\uAD00</th><th rowspan=2>\uACF5\uC5F4</th><th rowspan=2>\uACF5\uB2E8</th><th rowspan=2>\uB0B4\uAD00</th><th rowspan=2>\uAD00\uACF5\uBC88\uD638</th><th rowspan=2>\uB0B4\uAD00\uADDC\uACA9</th><th rowspan=2>\uC900\uACF5<br>\uAC70\uB9AC</th><th rowspan=2>\uD3C9\uADE0<br>\uC2EC\uB3C4</th><th rowspan=2>\uAD74\uCC29\uBC29\uBC95</th><th colspan=5 id="tgcolStart">\uC2DC\uC791\uC2DC\uC124\uBB3C</th><th colspan=5 id="tgcolEnd">\uC885\uB8CC\uC2DC\uC124\uBB3C</th><th rowspan=2>\uC9C0\uC911<br>\uD45C\uC2DC</th><th rowspan=2>\uC21C\uBC88</th><th colspan=2 id="tgcolSurvey">\uCE21\uB7C9\uC88C\uD45C</th><th rowspan=2>\uC801\uC6A9<br>\uD1A0\uC801</th><th rowspan=2>\uAD6C\uAC04<br>\uAC70\uB9AC</th><th rowspan=2>\uC2EC\uB3C4\uAC12</th></tr><tr><th>\uC124\uBE44</th><th>\uC18C\uC720</th><th>\uADDC\uACA9</th><th>\uC704\uCE58</th><th>\uC2DC\uC124\uBA85</th><th>\uC124\uBE44</th><th>\uC18C\uC720</th><th>\uADDC\uACA9</th><th>\uC704\uCE58</th><th>\uC2DC\uC124\uBA85</th><th>\uACBD\uB3C4</th><th>\uC704\uB3C4</th></tr></thead><tbody>';
segs.forEach(function(sg,si){
var pts=sg.filter(function(n){return !n.mh;});var avgd=pts.filter(function(n){return n.z!=null;});var avg=avgd.length?(avgd.reduce(function(a,n){return a+n.z;},0)/avgd.length):null;
var totd=0;for(var k=1;k<sg.length;k++)totd+=Math.hypot(sg[k].x-sg[k-1].x,sg[k].y-sg[k-1].y);var jj=Math.floor(totd/10)+1;
var s0=sg[0],s1=sg[sg.length-1];var sFac=s0.riser?'\uC785\uC0C1\uC810':(s0.mh?'\uC2E0\uC124_\uB9E8\uD640':'\uC9C0\uC911\uAD6C\uC870\uBB3C'),sNm=s0.mh?(s0.name||''):'\uAD00\uB9D0',sSp=s0.mh?(s0.spec||''):'\uAE30\uD0C0';
var eFac=s1.riser?'\uC785\uC0C1\uC810':(s1.mh?'\uC2E0\uC124_\uB9E8\uD640':'\uC9C0\uC911\uAD6C\uC870\uBB3C'),eNm=s1.mh?(s1.name||''):'\uAD00\uB9D0',eSp=s1.mh?(s1.spec||''):'\uAE30\uD0C0';
var SEGK=tgManualKey(sg);var R=sg.length;
sg.forEach(function(nd,ri){H+='<tr onclick="tgBotRowClick('+si+','+ri+')" data-tgkey="'+SEGK+'" data-ri="'+ri+'" style="cursor:pointer"'+(ri===0?' class="seg0" data-seg="'+si+'"':'')+'>';
if(ri===0){H+='<td rowspan='+R+'>'+sel(O.ext,null,SEGK,'ext')+'</td><td rowspan='+R+'>'+sel(O.own,null,SEGK,'own')+'</td><td rowspan='+R+'>'+inp('',SEGK,'gyeol')+'</td><td rowspan='+R+'>'+inp('',SEGK,'gdan')+'</td><td rowspan='+R+'>'+inp('',SEGK,'naegwan')+'</td><td rowspan='+R+'>'+inp('',SEGK,'gwannum')+'</td><td rowspan='+R+'>'+sel(O.inner,null,SEGK,'inner')+'</td><td rowspan='+R+'>'+totd.toFixed(2)+'</td><td rowspan='+R+'>'+(avg!=null?avg.toFixed(1):'')+'</td><td rowspan='+R+'>'+sel(O.dig,null,SEGK,'dig')+'</td>';
H+='<td rowspan='+R+'>'+sel(O.fac,sFac,SEGK,'s_fac')+'</td><td rowspan='+R+'>'+sel(O.own,null,SEGK,'s_own')+'</td><td rowspan='+R+'>'+sel(O.spec,sSp,SEGK,'s_spec')+'</td><td rowspan='+R+'>'+sel(O.pos,null,SEGK,'s_pos')+'</td><td rowspan='+R+'>'+inp(sNm,SEGK,'s_nm')+'</td>';
H+='<td rowspan='+R+'>'+sel(O.fac,eFac,SEGK,'e_fac')+'</td><td rowspan='+R+'>'+sel(O.own,null,SEGK,'e_own')+'</td><td rowspan='+R+'>'+sel(O.spec,eSp,SEGK,'e_spec')+'</td><td rowspan='+R+'>'+sel(O.pos,null,SEGK,'e_pos')+'</td><td rowspan='+R+'>'+inp(eNm,SEGK,'e_nm')+'</td>';
H+='<td rowspan='+R+'>'+jj+'</td>';}
var ll=(typeof toLatLng==='function')?toLatLng(nd.x,nd.y):null;var d=(ri===0)?0:Math.hypot(nd.x-sg[ri-1].x,nd.y-sg[ri-1].y);
H+='<td>'+(ri+1)+'</td><td>'+(ll?(+ll.lng).toFixed(8):'')+'</td><td>'+(ll?(+ll.lat).toFixed(8):'')+'</td><td>'+sel(O.soil,_soilAuto(nd),SEGK,'soil_'+(nd.no||ri))+'</td><td>'+d.toFixed(2)+'</td><td>'+(nd.mh?'':(nd.z!=null?nd.z.toFixed(2):''))+'</td></tr>';});});
H+='</tbody></table></div>';bd.innerHTML=H;}
var TANGO_TPL_URL=encodeURI('탱고양식_템플릿.xlsx');var _tangoTplBuf=null;
function tangoGetTemplate(){if(_tangoTplBuf)return Promise.resolve(_tangoTplBuf);return fetch(TANGO_TPL_URL).then(function(r){if(!r.ok)throw new Error('탱고양식 템플릿 로드 실패('+r.status+')');return r.arrayBuffer();}).then(function(b){_tangoTplBuf=b;return b;});}
function tgColL(c){var s='';while(c>0){var m=(c-1)%26;s=String.fromCharCode(65+m)+s;c=(c-m-1)/26;}return s;}
async function exportTango(){
 if(typeof ExcelJS==='undefined'){alert('ExcelJS 로드 안됨');return;}
 if(typeof tgAutoMatch==='function')tgAutoMatch();
 if(!_tgSegs||!_tgSegs.length){alert('구간이 없습니다. 탱고성과 표를 먼저 생성하세요.');return;}
 var tplBuf;
 try{tplBuf=await tangoGetTemplate();}catch(e){alert('탱고양식 템플릿을 불러오지 못했습니다. GitHub에 탱고양식_템플릿.xlsx를 올렸는지 확인하세요.\n'+e.message);return;}
 var wb=new ExcelJS.Workbook();await wb.xlsx.load(tplBuf);
 var ws=wb.worksheets[0];
 var TST=[];for(var c=1;c<=27;c++)TST.push(ws.getCell(7,c).style);
 for(var c=1;c<=21;c++){try{ws.unMergeCells(tgColL(c)+'7:'+tgColL(c)+'20');}catch(e){}}
 var tb=state.titleBlock||{},biz=state.bizInfo||{};
 joseoSetv(ws,'B1',tb.tango||tb.tangoNo||biz.bizNo||'');
 joseoSetv(ws,'B2',state.projectName||'');
 var row=7;
 _tgSegs.forEach(function(sg){
  var key=tgManualKey(sg);var M=(state.tangoManual&&state.tangoManual[key])||{};
  var pts=sg.filter(function(n){return !n.mh;});
  var avgd=pts.filter(function(n){return n.z!=null;});
  var avg=avgd.length?(avgd.reduce(function(a,n){return a+n.z;},0)/avgd.length):null;
  var totd=0;for(var k=1;k<sg.length;k++)totd+=Math.hypot(sg[k].x-sg[k-1].x,sg[k].y-sg[k-1].y);
  var jj=Math.floor(totd/10)+1;
  var s0=sg[0],s1=sg[sg.length-1];
  var sFac=s0.riser?'입상점':(s0.mh?'신설_맨홀':'지중구조물'),sNm=s0.mh?(s0.name||''):'관말',sSp=s0.mh?(s0.spec||''):'기타';
  var eFac=s1.riser?'입상점':(s1.mh?'신설_맨홀':'지중구조물'),eNm=s1.mh?(s1.name||''):'관말',eSp=s1.mh?(s1.spec||''):'기타';
  var startRow=row;
  sg.forEach(function(nd,ri){
   for(var c=1;c<=27;c++)ws.getCell(row,c).style=TST[c-1];
   var ll=(typeof toLatLng==='function')?toLatLng(nd.x,nd.y):null;
   var d=(ri===0)?0:Math.hypot(nd.x-sg[ri-1].x,nd.y-sg[ri-1].y);
   ws.getCell('V'+row).value=ri+1;
   if(ll){ws.getCell('W'+row).value=+(+ll.lng).toFixed(8);ws.getCell('X'+row).value=+(+ll.lat).toFixed(8);}
   var soilV=M['soil_'+(nd.no||'')]||'';if(!soilV){var _spv=nd.pave;if((_spv==null||_spv==='')&&nd.no&&typeof pointByNo==='function'){var _sq=pointByNo(nd.no);if(_sq)_spv=_sq.pave;}var _sMAP={'\uC544\uC2A4\uD314\uD2B8':'AS','\uBCF4\uB3C4':'B','\uC0AC\uB9AC\uB3C4':'S','\uCF58\uD06C\uB9AC\uD2B8':"CON'C"};if(_spv)soilV=_sMAP[_spv]||_spv;else if(typeof tgPtRoad==='function'&&tgPtRoad(nd))soilV='AS';}joseoSetv(ws,'Y'+row,soilV);
   ws.getCell('Z'+row).value=+d.toFixed(2);
   if(!nd.mh&&nd.z!=null)ws.getCell('AA'+row).value=+(+nd.z).toFixed(2);
   row++;
  });
  var endRow=row-1;
  var LV={A:M.ext||'',B:M.own||'',C:M.gyeol||'',D:M.gdan||'',E:M.naegwan||'',F:M.gwannum||'',G:M.inner||'',H:+totd.toFixed(2),I:(avg!=null?+avg.toFixed(1):''),J:M.dig||'',K:M.s_fac||sFac,L:M.s_own||'',M:M.s_spec||sSp,N:M.s_pos||'',O:M.s_nm||sNm,P:M.e_fac||eFac,Q:M.e_own||'',R:M.e_spec||eSp,S:M.e_pos||'',T:M.e_nm||eNm,U:jj};
  for(var L2 in LV){if(endRow>startRow){try{ws.mergeCells(L2+startRow+':'+L2+endRow);}catch(e){}}joseoSetv(ws,L2+startRow,LV[L2]);}
 });
 var buf=await wb.xlsx.writeBuffer();
 var _tno=(tb.tango||tb.tangoNo||biz.bizNo||'').toString().trim();var _pn=(state.projectName||'').toString().trim();var _fn=((_tno?_tno+'_':'')+(_pn||'탱고성과')).replace(/[\\/:*?"<>|]/g,'_')+'.xlsx';
 joseoSaveBlob(buf,_fn);
}
function openJoseoPanel(){
  if(!joseoEnsureLibs()) return;
  if(!state.projectName){ toast('먼저 사업을 불러오세요'); return; }
  var groups=joseoGroups(), dates=Object.keys(groups).sort();
  if(!dates.length){ toast('관로 측점이 없습니다 (맨홀·보강판 제외)'); return; }
  joseoState={ groups:groups, dates:dates, cur:dates[0] };
  var panel=document.getElementById('joseoPanel'); panel.style.display='flex';
  joseoProgHide(); joseoRenderTabs(); joseoRenderPreview(joseoState.cur);
  joseoSyncDoneBtn();
}
var joseoLink=true;
function joseoSyncDoneBtn(){
  var db=document.getElementById('joseoDoneBtn'); if(!db)return;
  var done=!!(state.fieldDone&&state.fieldDone.joseo);
  db.classList.toggle('on',done); db.textContent=done?'✅ 등록완료':'✅ 완료등록';
}
function joseoSyncTo(no){
  if(!joseoState||!joseoLink||!no) return;
  var panel=document.getElementById('joseoPanel'); if(!panel||panel.style.display==='none') return;
  var p=pointByNo(no); if(!p) return;
  var dk=joseoDate(p.no); if(!dk) return;
  if(joseoState.cur!==dk && joseoState.groups[dk]){ joseoState.cur=dk; joseoRenderTabs(); joseoRenderPreview(dk); }
  var box=document.getElementById('joseoPreview'); if(!box) return;
  var cards=box.querySelectorAll('.jz-card'), hit=null;
  [].forEach.call(cards,function(c){ c.classList.remove('sel'); if(c.getAttribute('data-no')===String(p.no)) hit=c; });
  if(hit){ hit.classList.add('sel'); hit.scrollIntoView({behavior:'smooth',block:'center'}); }
}
function joseoRegisterDone(){
  if(!state.projectId){ toast('먼저 사업을 불러오세요'); return; }
  var fd=state.fieldDone||{csv:false,joseo:false,manhole:false}; fd.joseo=true; state.fieldDone=fd;
  if(online&&state.projectId) saveProject();
  if(typeof refreshFieldBar==='function') refreshFieldBar();
  joseoSyncDoneBtn();
  toast('실시간 사진조서 등록완료 ✓ — 최종본은 [전체 ZIP]/[날짜별 다운로드]로 받으세요');
}
(function(){
  var lb=document.getElementById('joseoLinkBtn');
  if(lb) lb.onclick=function(){ joseoLink=!joseoLink; this.textContent=joseoLink?'🔗 연동':'🔓 미연동'; this.classList.toggle('off',!joseoLink); toast(joseoLink?'측점↔조서 연동 ON (점 클릭=조서 이동)':'조서 연동 OFF'); };
  var db=document.getElementById('joseoDoneBtn');
  if(db) db.onclick=joseoRegisterDone;
  var dd=document.getElementById('joseoDlDate');
  if(dd) dd.onclick=function(e){ e.stopPropagation(); joseoToggleDateMenu(); };
})();
function closeJoseoPanel(){ var p=document.getElementById('joseoPanel'); if(p)p.style.display='none'; }
function joseoRenderTabs(){
  var t=document.getElementById('joseoTabs'); if(!t)return; t.innerHTML='';
  joseoState.dates.forEach(function(dk){
    var b=document.createElement('button'); b.className='jz-tab'+(dk===joseoState.cur?' on':''); b.textContent=dk+' ('+joseoState.groups[dk].length+')';
    b.onclick=function(){ joseoState.cur=dk; joseoRenderTabs(); joseoRenderPreview(dk); };
    t.appendChild(b);
  });
}
function joseoRenderPreview(dk){
  var box=document.getElementById('joseoPreview'); if(!box)return;
  var recs=(joseoState.groups[dk]||[]).map(joseoRec);
  var html='<div class="jz-proj">사업명 : '+joseoEsc(state.projectName||'')+'</div>';
  recs.forEach(function(r){
    var exp=r.expUrl?'<img src="'+joseoEsc(r.expUrl)+'">':'<div class="ne">실시간 사진 없음</div>';
    var aft=r.aftUrl?'<img src="'+joseoEsc(r.aftUrl)+'">':'<div class="ne">공사후 사진 없음</div>';
    html+='<div class="jz-card" data-no="'+joseoEsc(r.fullNo||r.name)+'">'
      +'<table class="jz-tbl">'
      +'<colgroup><col style="width:17%"><col style="width:16.5%"><col style="width:16.5%"><col style="width:12.5%"><col style="width:12.5%"><col style="width:12.5%"><col style="width:12.5%"></colgroup>'
      +'<tr><td class="lbl">측량날짜</td><td class="val" colspan="2">'+joseoEsc(joseoDateK(r.date))+'</td><td class="lbl">측점명</td><td class="val" colspan="3">'+joseoEsc(r.name)+'</td></tr>'
      +'<tr><td class="lbl" colspan="2">좌표(GRS80)</td><td class="lbl" rowspan="2">시설물종류</td><td class="lbl" rowspan="2">재질</td><td class="lbl" rowspan="2">관경</td><td class="lbl" rowspan="2">이격거리</td><td class="lbl" rowspan="2">심도</td></tr>'
      +'<tr><td class="lbl">X(N)</td><td class="lbl">Y(E)</td></tr>'
      +'<tr><td class="val">'+joseoEsc(r.x)+'</td><td class="val">'+joseoEsc(r.y)+'</td><td class="val">'+joseoEsc(r.facility)+'</td><td class="val">'+joseoEsc(r.mat)+'</td><td class="val">'+joseoEsc(r.dia)+'</td><td class="val">'+joseoEsc(r.gap)+'</td><td class="val">'+joseoEsc(r.depth)+'</td></tr>'
      +'</table>'
      +'<div class="jz-ph2"><div class="jz-pc">'+exp+'<div class="jz-cap">실시간 측량점</div></div>'
      +'<div class="jz-pc">'+aft+'<div class="jz-cap">공사 후 관로</div></div></div>'
      +'</div>';
  });
  box.innerHTML=html;
}
async function joseoDownloadDate(forceDk){
  if(!joseoState)return;
  try{
    var dk=forceDk||joseoState.cur, recs=(joseoState.groups[dk]||[]).map(joseoRec);
    joseoProg('사진 불러오는 중…',0.05);
    await joseoFetchPhotos(recs,function(d,t){ joseoProg('사진 '+d+'/'+t, t?(d/t*0.7):0.5); });
    joseoProg('엑셀 생성 중…',0.85);
    var wb=await joseoBuildWb(state.projectName,recs,JOSEO_PER_PAGE);
    var buf=await wb.xlsx.writeBuffer();
    joseoSaveBlob(buf, joseoFileName(dk));
    joseoProg('완료 ✓',1); setTimeout(joseoProgHide,1200);
  }catch(e){ toast('조서 생성 실패: '+(e&&e.message||e)); joseoProgHide(); }
}
function joseoToggleDateMenu(){
  var m=document.getElementById('joseoDateMenu'), btn=document.getElementById('joseoDlDate');
  if(!m||!btn){ return; }
  if(m.style.display==='block'){ m.style.display='none'; return; }
  if(!joseoState||!joseoState.dates||!joseoState.dates.length){ toast('먼저 사업을 불러오세요'); return; }
  m.innerHTML=joseoState.dates.map(function(dk){ return '<div class="jz-dateitem" data-dk="'+joseoEsc(dk)+'">📥 '+joseoEsc(dk)+' ('+joseoState.groups[dk].length+') 다운로드</div>'; }).join('');
  [].forEach.call(m.querySelectorAll('.jz-dateitem'),function(it){ it.onclick=function(e){ e.stopPropagation(); var dk=this.getAttribute('data-dk'); m.style.display='none'; joseoDownloadDate(dk); }; });
  m.style.display='block';
  var r=btn.getBoundingClientRect();
  m.style.top=(r.bottom+5)+'px';
  m.style.left='auto';
  m.style.right=Math.max(8,(window.innerWidth-r.right))+'px';
}
document.addEventListener('click',function(e){ var m=document.getElementById('joseoDateMenu'); if(!m||m.style.display!=='block')return; if(!e.target.closest('#joseoDateMenu')&&e.target.id!=='joseoDlDate') m.style.display='none'; });
function joseoDownloadFinal(){
  if(!joseoEnsureLibs())return;
  if(!state.projectName){ toast('먼저 사업을 불러오세요'); return; }
  var groups=joseoGroups(), dates=Object.keys(groups).sort();
  if(!dates.length){ toast('관로 측점이 없습니다 (맨홀·보강판 제외)'); return; }
  joseoState={ groups:groups, dates:dates, cur:dates[0] };
  var panel=document.getElementById('joseoPanel'); if(panel)panel.style.display='flex';
  joseoRenderTabs(); joseoRenderPreview(joseoState.cur); joseoSyncDoneBtn();
  toast('최종본(전체) 생성 중…');
  joseoDownloadAll();
}
async function joseoDownloadAll(){
  if(!joseoState)return;
  try{
    if(typeof JSZip==='undefined'){ toast('압축 모듈 없음'); return; }
    var zip=new JSZip(), dates=joseoState.dates;
    for(var di=0;di<dates.length;di++){
      var dk=dates[di];
      joseoProg('('+(di+1)+'/'+dates.length+') '+dk+' 처리 중…', di/dates.length);
      var recs=(joseoState.groups[dk]||[]).map(joseoRec);
      await joseoFetchPhotos(recs);
      var wb=await joseoBuildWb(state.projectName,recs,JOSEO_PER_PAGE);
      var buf=await wb.xlsx.writeBuffer();
      zip.file(joseoFileName(dk), buf);
    }
    joseoProg('ZIP 압축 중…',0.96);
    var blob=await zip.generateAsync({type:'blob'});
    joseoSaveBlob(blob,(state.projectName||'조서')+'_실시간조서.zip');
    joseoProg('완료 ✓',1); setTimeout(joseoProgHide,1500);
  }catch(e){ toast('ZIP 생성 실패: '+(e&&e.message||e)); joseoProgHide(); }
}

// 사진 방향 화살표 클릭 → 90° 회전 (사진 패널·로드뷰 패널 공통)
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.dirArrow');if(!b)return;e.stopPropagation();e.preventDefault();var p=pointByNo(b.getAttribute('data-num'));if(!p)return;cyclePhotoDir(p);b.textContent=ARROWS[getPhotoDir(p)];drawGeo();},true);
bind('rvClose',closeRvPanel);

/* ===== 지도 배경 (도면 뒤에 깔림, 방식 나) ===== */
var bgmap=null,bgMapOn=false,_bgSync=false,_bgRaf=0;
function bgMpp(){
  if(!bgmap)return null;
  try{
    var proj=bgmap.getProjection(),c=bgmap.getCenter(),lat=c.getLat(),lng=c.getLng();
    var p1=proj.containerPointFromCoords(c);
    var p2=proj.containerPointFromCoords(new kakao.maps.LatLng(lat,lng+0.0009));
    var dpx=Math.hypot(p2.x-p1.x,p2.y-p1.y);if(dpx<0.001)return null;
    var dm=0.0009*(Math.PI/180)*6378137*Math.cos(lat*Math.PI/180);
    return dm/dpx;
  }catch(e){return null;}
}
function syncMapBg(){if(!bgMapOn||!bgmap)return;if(_bgRaf)return;_bgRaf=requestAnimationFrame(function(){_bgRaf=0;syncMapBgNow();});}
function syncMapBgNow(){
  if(!bgMapOn||!bgmap||_bgSync)return;
  _bgSync=true;
  try{
    var crs=state.crs||'5186';
    var wE=vb.x+vb.w/2,wN=-(vb.y+vb.h/2);
    var ll=toLatLng(wE,wN,crs);
    if(ll){
      bgmap.setCenter(new kakao.maps.LatLng(ll.lat,ll.lng));
      var m=null;try{m=cv.getScreenCTM();}catch(e){}
      var svgMpp=(m&&m.a)?(1/m.a):(vb.w/Math.max(cv.getBoundingClientRect().width,1)),cur=bgMpp();
      if(cur&&svgMpp>0){
        var delta=Math.round(Math.log(cur/svgMpp)/Math.LN2);
        if(delta){var L=Math.max(1,Math.min(14,bgmap.getLevel()-delta));if(L!==bgmap.getLevel())bgmap.setLevel(L);}
        var now=bgMpp()||svgMpp,scale=now/svgMpp;
        if(!isFinite(scale)||scale<=0)scale=1;
        scale=Math.max(0.63,Math.min(scale,8)); // 0.63 하한=160% 오버사이즈가 덮는 범위(빈틈 방지)
        document.getElementById('kmapBg').style.transform='scale('+scale.toFixed(3)+')';
      }
    }
  }catch(e){}
  _bgSync=false;
}
function toggleBgMap(){
  var btn=document.getElementById('bgBtn'),div=document.getElementById('kmapBg');
  if(bgMapOn){bgMapOn=false;div.style.display='none';btn.classList.remove('on');var _vm=document.getElementById('vMap');if(_vm)_vm.classList.remove('on');return;}
  if((!state.points||!state.points.length)&&(!state.gpsPts||!state.gpsPts.length)){toast('먼저 측점을 불러오거나 촬영하세요');return;}
  div.style.display='block';btn.classList.add('on');var _vm2=document.getElementById('vMap');if(_vm2)_vm2.classList.add('on');
  loadKakao(function(){
    if(!bgmap){
      bgmap=new kakao.maps.Map(div,{center:new kakao.maps.LatLng(37.27,127.0),level:3,draggable:false,scrollwheel:false,disableDoubleClickZoom:true});
      bgmap.setZoomable(false);
    }
    bgMapOn=true;bgmap.relayout();syncMapBg();
    toast('지도 배경 ON — 그 위에서 결선 작업하세요');
  });
}
bind('bgBtn',toggleBgMap);
bind('newProj',function(){var n=prompt('새 사업명을 입력하세요 (예: 수원 권선동 1041-6)');if(!n)return;state.projectId=null;state.projectName=n;state.routingDone=false;setReadOnly(false);state.manholes=[];state.photoDir={};photoMap={};afterMap={};selNum=null;state.labelOff={};clearSvg(gSel);clearSvg(gMH);if(photoPanelOpen)refreshPhotoPanel();updMeta();toast('새 사업: '+n+' (CSV 업로드 후 저장)');});
document.getElementById('recs').addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.del');if(!b)return;var i=+b.getAttribute('data-i');var r=state.markups[i];if(r){pushHist();if(r.el)r.el.remove();state.markups.splice(i,1);renderRecs();}});
document.getElementById('proj').addEventListener('change',function(e){if(e.target.value)pickProject(e.target.value);});
function loadCsvFile(f){if(!f)return;var rd=new FileReader();rd.onload=function(){state.tamsa=false;state.markups.forEach(function(m){if(m.el)m.el.remove();});state.points=parseCsv(decodeBuf(rd.result),f.name);state.lines=[];state.markups=[];state.manholes=[];state.projectId=null;state.routingDone=false;var _nrz=(typeof buildRisersFromCsv==='function')?buildRisersFromCsv():0;setReadOnly(false);state.projectName=f.name.replace(/\.[^.]+$/,'');var ps=document.getElementById('proj');if(ps)ps.value='';photoMap={};afterMap={};selNum=null;state.labelOff={};clearSvg(gSel);clearSvg(gMH);if(photoPanelOpen)refreshPhotoPanel();drawGeo();drawMarks();drawManholes();fitView();updMeta();if(regOpen())updRegStatus();toast('새 CSV: 측량점 '+state.points.length+'개'+(_nrz?(' · 전주입상 '+_nrz+'개 자동생성'):'')+' (결선·검수 초기화)');};rd.readAsArrayBuffer(f);}
function regAddCsv(f,cb){if(!f){if(cb)cb();return;}var rd=new FileReader();rd.onload=function(){
  var pts=parseCsv(decodeBuf(rd.result),f.name);
  if(pts.length){
    if(!state.points)state.points=[];
    var _ex={};state.points.forEach(function(p){if(p&&p.no!=null)_ex[p.no]=p;});
    var _add=[],_upd=0,_skip=0;window._rtCsvStat=window._rtCsvStat||{};var _st={};
    pts.forEach(function(p){var q=_ex[p.no];var _dk=String(p.no).split('-')[0];if(!_st[_dk])_st[_dk]={fresh:0,dup:0};
      if(q&&Math.abs((q.x||0)-(p.x||0))<0.001&&Math.abs((q.y||0)-(p.y||0))<0.001&&String(q.code||'')===String(p.code||'')){_skip++;_st[_dk].dup++;return;}
      if(q)_upd++;_st[_dk].fresh++;_add.push(p);});
    Object.keys(_st).forEach(function(k){window._rtCsvStat[k]=_st[k];});
    var _rep={};_add.forEach(function(p){_rep[p.no]=1;});
    state.points=state.points.filter(function(p){return !_rep[p.no];}).concat(_add);
    var nn={};pts.forEach(function(p){nn[p.no]=1;});
    if(state.gpsPts&&state.gpsPts.length){var _nsc=state.nightShift,_cutc=(_nsc&&_nsc.on)?_nsc.cut:null;state.gpsPts=state.gpsPts.filter(function(g){var _wnoc=g.no;if(g._d0!=null&&g._nm!=null){var _dtc=g._d0;if(_cutc!=null&&g._tm!=null&&g._tm<_cutc)_dtc=prevDayYMD(g._d0);_wnoc=_dtc+'-'+g._nm;}return !(nn[g.no]||nn[_wnoc]);});}
    if(!state.projectName){state.projectName=f.name.replace(/\.[^.]+$/,'');var rn=document.getElementById('regName');if(rn&&!rn.value.trim())rn.value=state.projectName;}
    selNum=null;clearSvg(gSel);drawGeo();drawMarks();drawManholes();fitView();updMeta();if(regOpen())updRegStatus();
    toast('CSV "'+f.name+'" 신규 '+(_add.length-_upd)+' · 갱신 '+_upd+' · 중복제외 '+_skip+' (총 '+state.points.length+'개)');
  }else toast('CSV에서 측점을 못 읽었습니다: '+f.name);
  if(cb)cb();
};rd.readAsArrayBuffer(f);}
function regAddCsvTamsa(f,cb){if(!f){if(cb)cb();return;}var rd=new FileReader();rd.onload=function(){var txt;try{txt=decodeBuf(rd.result);}catch(e){txt=''+rd.result;}var pts=parseCsv(txt,f.name);if(pts.length){state.tamsa=true;if(!state.points)state.points=[];if(!state.finalCsv)state.finalCsv=[];var nn={};pts.forEach(function(p){nn[p.no]=1;});state.points=state.points.filter(function(p){return !nn[p.no];}).concat(pts.filter(function(_p){return !_p._hyun;}));state.finalCsv=state.finalCsv.filter(function(c){return c.name!==f.name;});state.finalCsv.push({name:f.name,text:txt});if(!state.projectName){state.projectName=f.name.replace(/\.[^.]+$/,'');var rn=document.getElementById('regName');if(rn&&!rn.value.trim())rn.value=state.projectName;}try{buildTamsaMh();}catch(e){}selNum=null;clearSvg(gSel);clearSvg(gMH);drawGeo();drawMarks();drawManholes();fitView();updMeta();if(regOpen())updRegStatusTamsa();toast('CSV "'+f.name+'" +'+pts.length+'개 (총 '+state.points.length+'개)');}else toast('CSV에서 측점을 못 읽었습니다: '+f.name);if(cb)cb();};rd.readAsArrayBuffer(f);}function regAddCsvFilesTamsa(files){var arr=[].slice.call(files);(function next(i){if(i>=arr.length)return;regAddCsvTamsa(arr[i],function(){next(i+1);});})(0);}function updRegStatusTamsa(){var c=document.getElementById('rcTamsa');if(!c)return;if(state.points&&state.points.length){var ng=(state.finalCsv||[]).length;c.textContent='측점 '+state.points.length+'개'+(ng>1?(' · '+ng+'개 파일'):'')+' 로딩됨';c.classList.add('done');}else{c.textContent='탐사 측점 데이터 (.csv)';c.classList.remove('done');}}function regAddCsvFiles(files){var arr=[].slice.call(files);(function next(i){if(i>=arr.length){if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME&&state.projectId&&typeof saveProject==='function'){try{saveProject();if(typeof toast==='function')toast('CSV 자동 저장됨');}catch(e){}}return;}regAddCsv(arr[i],function(){next(i+1);});})(0);}
function expandPhotoFiles(list){
  var arr=[].slice.call(list),out=[],zips=[];
  arr.forEach(function(f){if(/\.zip$/i.test(f.name))zips.push(f);else if(!/thumbs\.db$/i.test(f.name))out.push(f);});
  if(!zips.length)return Promise.resolve(out);
  if(typeof JSZip==='undefined'){toast('압축 모듈 로딩 실패 — 사진만 처리');return Promise.resolve(out);}
  toast('압축 푸는 중…');
  return Promise.all(zips.map(function(zf){
    var dm=(zf.name||'').match(/(\d{6})/);var zdate=dm?dm[1]:'';
    return JSZip.loadAsync(zf).then(function(zip){
      var jobs=[];
      zip.forEach(function(path,entry){
        if(entry.dir)return;var base=path.split('/').pop();
        if(/^thumbs\.db$/i.test(base)||/__macosx/i.test(path))return;
        if(!/\.(jpe?g|png)$/i.test(base))return;
        jobs.push(entry.async('blob').then(function(blob){var file=new File([blob],base,{type:'image/jpeg'});file._relpath=path;file._zipdate=zdate;return file;}));
      });
      return Promise.all(jobs);
    });
  })).then(function(groups){groups.forEach(function(g){out=out.concat(g);});return out;}).catch(function(err){console.error('zip',err);toast('압축 해제 실패');return out;});
}
function csvGroups(){var g={},order=[];(state.points||[]).forEach(function(p){var k=p._csv||'(파일명 없음)';if(g[k]==null){g[k]=0;order.push(k);}g[k]++;});return order.map(function(k){return {name:k,count:g[k]};});}
function removeCsvGroup(name){state.points=(state.points||[]).filter(function(p){return (p._csv||'(파일명 없음)')!==name;});selNum=null;clearSvg(gSel);drawGeo();drawMarks();drawManholes();fitView();updMeta();updRegStatus();toast('"'+name+'" 측점 제거됨');}
function openCsvList(){
  if(!csvGroups().length){toast('로딩된 CSV가 없습니다');return;}
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center';
  var box=document.createElement('div');
  box.style.cssText='background:#fff;border-radius:12px;max-width:460px;width:88%;max-height:74vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.25)';
  function render(){
    var gs=csvGroups();
    if(!gs.length){ov.remove();toast('CSV 전부 제거됨');return;}
    var rows=gs.map(function(g){return '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #f2f2f2;font-size:13px"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+g.name+' <b style="color:#1a7a3a">'+g.count+'개</b></span><button data-k="'+encodeURIComponent(g.name)+'" class="cvl-x" style="flex:none;border:1px solid #e3b4ae;background:#fff;color:#c0392b;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer">✕ 삭제</button></div>';}).join('');
    box.innerHTML='<div style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #eee"><b style="flex:1;font-size:15px">로딩된 CSV ('+gs.length+'개 파일)</b><button id="cvlClose" style="border:none;background:#f2f2f2;border-radius:7px;padding:5px 11px;cursor:pointer">닫기</button></div><div style="overflow:auto">'+rows+'</div><div style="padding:10px 14px;border-top:1px solid #eee;text-align:right"><button id="cvlAll" style="border:1px solid #e3b4ae;background:#fff;color:#c0392b;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer">전체 비우기</button></div>';
    [].forEach.call(box.querySelectorAll('.cvl-x'),function(b){b.onclick=function(){removeCsvGroup(decodeURIComponent(this.getAttribute('data-k')));render();};});
    box.querySelector('#cvlClose').onclick=function(){ov.remove();};
    box.querySelector('#cvlAll').onclick=function(){state.points=[];selNum=null;clearSvg(gSel);drawGeo();drawMarks();drawManholes();fitView();updMeta();updRegStatus();ov.remove();toast('CSV 전부 제거됨');};
  }
  render();
  ov.appendChild(box);ov.onclick=function(e){if(e.target===ov)ov.remove();};
  document.body.appendChild(ov);
}
document.getElementById('fCsv').addEventListener('change',function(e){var fs=e.target.files;if(regOpen()||IS_REALTIME)regAddCsvFiles(fs);else loadCsvFile(fs[0]);e.target.value='';});document.getElementById('fAft').addEventListener('change',function(e){[].forEach.call(e.target.files,function(f){loadAfterCsv(f);});e.target.value='';});
function loadDxfFile(f){if(!f)return;var rd=new FileReader();rd.onload=function(){try{var _tt=decodeBuf(rd.result);var ln=parseDxfLines(_tt);ln.forEach(function(l){l.base=true;});state.lines=state.lines.filter(function(l){return !l.base;}).concat(ln);state.baseTexts=parseDxfTexts(_tt);drawGeo();fitView();updMeta();if(regOpen())updRegStatus();toast('수치지도 백판 '+ln.length+'개 라인 · '+state.baseTexts.length+'개 텍스트 로드');}catch(err){toast('DXF 파싱 오류');}};rd.readAsArrayBuffer(f);}
document.getElementById('fDxf').addEventListener('change',function(e){loadDxfFile(e.target.files[0]);e.target.value='';});

/* ====== 샘플 데이터 (수원 권선동 1041-6) ====== */
function loadSample(){
  state.projectId=null;state.projectName='샘플 — 수원 권선동 1041-6';
  state.points=[
    {no:'260522-1',x:202592.400,y:517281.538,code:'FC 100x2'},{no:'260522-2',x:202592.887,y:517283.007,code:'FC 100x2'},
    {no:'260522-3',x:202592.896,y:517287.406,code:'FC 100x2'},{no:'260522-4',x:202590.990,y:517276.500,code:'FC 100x2'},
    {no:'260522-5',x:202588.265,y:517272.106,code:'FC 100x2'},{no:'260522-6',x:202594.399,y:517293.622,code:'M FC 100x2'},
    {no:'260522-7',x:202596.028,y:517298.226,code:'FC 100x3'},{no:'260522-8',x:202595.385,y:517295.748,code:'M FC 100x3'},
    {no:'260522-9',x:202568.987,y:517213.439,code:'FC 100x2'},{no:'260522-10',x:202575.269,y:517234.256,code:'FC 100x3'},
    {no:'260522-11',x:202573.568,y:517233.149,code:'FC 100x3'},{no:'260522-12',x:202567.429,y:517213.978,code:'FC T 100x5'},
    {no:'260522-13',x:202566.936,y:517212.318,code:'M FC 100x5'}];
  state.lines=[
    {layer:'통신관로',pts:[[202567.43,517213.98],[202568.99,517213.44]]},
    {layer:'통신관로',pts:[[202573.57,517233.15],[202575.27,517234.26]]},
    {layer:'통신관로',pts:[[202588.26,517272.11],[202590.99,517276.5],[202592.4,517281.54],[202592.89,517283.01],[202592.9,517287.41],[202594.4,517293.62],[202594.89,517294.72]]},
    {layer:'통신관로',pts:[[202594.89,517294.72],[202595.38,517295.75],[202596.03,517298.23]]},
    {layer:'통신관로',pts:[[202567.43,517213.98],[202566.94,517212.32],[202566.72,517211.58]]},
    {layer:'압입구간',pts:[[202566.72,517211.58],[202594.89,517294.72]]},
    {layer:'지거',pts:[[202567.43,517213.98],[202573.57,517233.15]]}];
  state.markups=[];state.manholes=[];photoMap={};afterMap={};selNum=null;state.labelOff={};clearSvg(gSel);if(photoPanelOpen)refreshPhotoPanel();drawGeo();drawMarks();drawManholes();fitView();updMeta();toast('샘플 로드됨');
}

/* init */
/* ====== 측점 사진 ====== */
var photoMap={}, afterMap={}, afterTargetNum=null, selNum=null, photoPanelOpen=false, photoLink=true;
var gSel=document.createElementNS(SVGNS,'g'); gSel.setAttribute('pointer-events','none'); cv.appendChild(gSel);
var gDraw=document.createElementNS(SVGNS,'g'); gDraw.setAttribute('pointer-events','none'); cv.appendChild(gDraw);
var gAnc=document.createElementNS(SVGNS,'g'); cv.appendChild(gAnc); // 지거 멘트 앵커 (최상위 — 측점보다 위에서 클릭 우선)
var gMeasure=document.createElementNS(SVGNS,'g'); cv.appendChild(gMeasure); // 거리산출 표시
/* ====== 실행취소(Undo) / 다시실행(Redo) ====== */
var undoStack=[],redoStack=[];
function snapHist(){return JSON.stringify({l:state.lines,bt:state.baseTexts,m:state.manholes,lo:state.labelOff,pt:state.points,gp:state.gpsPts,tr:state._trash,mk:state.markups.map(function(x){var o={};for(var k in x)if(k!=='el')o[k]=x[k];return o;})});}
function restoreHist(s){var o=JSON.parse(s);state.lines=o.l||[];if(o.bt)state.baseTexts=o.bt;state.manholes=o.m||[];state.labelOff=o.lo||{};if(o.pt)state.points=o.pt;if(o.gp)state.gpsPts=o.gp;if(o.tr)state._trash=o.tr;state.markups.forEach(function(x){if(x.el)x.el.remove();});state.markups=o.mk||[];drawGeo();drawManholes();drawMarks();updMeta();}
function pushHist(){undoStack.push(snapHist());if(undoStack.length>60)undoStack.shift();redoStack=[];if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME&&typeof rtSaveSoon==='function'){try{rtSaveSoon();}catch(e){}}}
function doUndo(){if(!undoStack.length){toast('되돌릴 작업이 없습니다');return;}redoStack.push(snapHist());restoreHist(undoStack.pop());toast('되돌렸습니다');}
function doRedo(){if(!redoStack.length){toast('다시 실행할 작업이 없습니다');return;}undoStack.push(snapHist());restoreHist(redoStack.pop());toast('다시 실행했습니다');}
/* ====== 거리산출 ====== */
var measurePts=[];
function measureClick(pt){if(measurePts.length>=2){measurePts=[];clearLabels('measure');}measurePts.push(pt);drawMeasure();}
function drawMeasure(){clearSvg(gMeasure);clearLabels('measure');if(!measurePts.length)return;
  measurePts.forEach(function(p){var s=S(p[0],p[1]);gMeasure.appendChild(el('line',{x1:s[0],y1:s[1],x2:s[0],y2:s[1],stroke:'#e8590c','stroke-width':9,'stroke-linecap':'round','vector-effect':'non-scaling-stroke','pointer-events':'none'}));});
  if(measurePts.length===2){var a=S(measurePts[0][0],measurePts[0][1]),b=S(measurePts[1][0],measurePts[1][1]);
    gMeasure.appendChild(el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#e8590c','stroke-width':2.5,'stroke-dasharray':'5 3','vector-effect':'non-scaling-stroke','pointer-events':'none'}));
    var d=Math.hypot(measurePts[1][0]-measurePts[0][0],measurePts[1][1]-measurePts[0][1]);
    mkLabel((a[0]+b[0])/2,(a[1]+b[1])/2,d.toFixed(2)+' m',{fill:'#e8590c',weight:'800',anchor:'middle',grp:'measure',px:16});
    toast('거리: '+d.toFixed(3)+' m');
  }
}
function ptNum(p){return (p.no||'').toString().split('-').pop();}
function pointByNum(n){for(var i=0;i<state.points.length;i++)if(ptNum(state.points[i])===String(n))return state.points[i];return null;}
function sortedNums(){return state.points.map(ptNum).filter(function(v){return v!=='';}).sort(function(a,b){return (parseFloat(a)||0)-(parseFloat(b)||0);});}
function pointByNo(no){if(no==null)return null;for(var i=0;i<state.points.length;i++)if(state.points[i].no===no)return state.points[i];return pointByNum(no);}
function sortedNos(){var _a=state.points.map(function(p){return p.no;}).filter(function(v){return v;});if(state.gpsPts){var _h={};_a.forEach(function(n){_h[n]=1;});state.gpsPts.forEach(function(g){if(g.no&&!_h[g.no]){_a.push(g.no);_h[g.no]=1;}});}return _a.sort(function(a,b){function pr(s){var m=/^(\d{6})-?(.*)$/.exec(s);return m?[parseFloat(m[1])||0,parseFloat(m[2])||0]:[0,parseFloat(s.split('-').pop())||0];}var A=pr(a),B=pr(b);return A[0]-B[0]||A[1]-B[1];});}
function pointAtCoord(x,y){for(var i=0;i<state.points.length;i++){var q=state.points[i];if(Math.abs(q.x-x)<0.06&&Math.abs(q.y-y)<0.06)return q;}return null;}
function lineNeighbors(sel){var p=pointByNo(sel);if(!p)return [];var res=[];(state.lines||[]).forEach(function(l){if(l.layer!=='통신관로')return;var pts=l.pts;for(var i=0;i<pts.length;i++){if(Math.abs(pts[i][0]-p.x)<0.06&&Math.abs(pts[i][1]-p.y)<0.06){[i-1,i+1].forEach(function(j){if(j>=0&&j<pts.length){var q=pointAtCoord(pts[j][0],pts[j][1]);if(q&&q.no!==sel&&res.indexOf(q)<0)res.push(q);}});}}});return res;}
function neighborsOf(sel){var selP=pointByNo(sel),up=null,down=null;if(!selP)return {up:null,down:null};
  var nb=lineNeighbors(sel);
  if(nb.length){nb.forEach(function(q){if(q.y>selP.y){if(!up||q.y<up.y)up=q;}else{if(!down||q.y>down.y)down=q;}});}
  else{var ups=[],downs=[];state.points.forEach(function(q){if(q.no===sel)return;var d=Math.hypot(q.x-selP.x,q.y-selP.y);(q.y>selP.y?ups:downs).push({q:q,d:d});});ups.sort(function(a,b){return a.d-b.d;});downs.sort(function(a,b){return a.d-b.d;});if(ups[0])up=ups[0].q;if(downs[0])down=downs[0].q;}
  return {up:up,down:down};}
function highlightSel(){clearSvg(gSel);if(selNum==null)return;var p=pointByNo(selNum);if(!p&&state.gpsPts){for(var _gi=0;_gi<state.gpsPts.length;_gi++){if(state.gpsPts[_gi].no===selNum){var _gg=state.gpsPts[_gi],_ggs=S(_gg.x,_gg.y);gSel.appendChild(el('circle',{cx:_ggs[0],cy:_ggs[1],r:2.4,fill:'none',stroke:'#12b312','stroke-width':3.4,'stroke-dasharray':'5 3','vector-effect':'non-scaling-stroke'}));return;}}}if(!p)return;
  var nbs=neighborsOf(selNum);
  [nbs.up,nbs.down].forEach(function(q){if(q){var sy=S(q.x,q.y);gSel.appendChild(el('circle',{cx:sy[0],cy:sy[1],r:0.224,fill:'none',stroke:'#ffcc00','stroke-width':1.4,'vector-effect':'non-scaling-stroke'}));}});
  var s=S(p.x,p.y);gSel.appendChild(el('circle',{cx:s[0],cy:s[1],r:1.6,fill:'none',stroke:'#22cc00','stroke-width':3.6,'stroke-dasharray':'4 2.5','vector-effect':'non-scaling-stroke'}));}
function compressImage(file,maxW,q){return new Promise(function(res,rej){var img=new Image(),u=URL.createObjectURL(file);img.onload=function(){URL.revokeObjectURL(u);var w=img.width,h=img.height;if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);c.toBlob(function(b){b?res(b):rej(new Error('blob'));},'image/jpeg',q);};img.onerror=function(){rej(new Error('img'));};img.src=u;});}
var zoomState={img:null,scale:1,tx:0,ty:0,drag:false,sx:0,sy:0};
function applyZoom(){var z=zoomState;if(!z.img)return;z.img.style.transform='translate('+z.tx+'px,'+z.ty+'px) scale('+z.scale+')';z.img.style.cursor=z.scale>1?(z.drag?'grabbing':'grab'):'zoom-in';}
function setupZoom(img){zoomState={img:img,scale:1,tx:0,ty:0,drag:false,sx:0,sy:0};if(!img)return;img.style.transformOrigin='center center';
  img.addEventListener('wheel',function(e){e.preventDefault();var z=zoomState;z.scale*=(e.deltaY<0?1.2:0.83);z.scale=Math.max(1,Math.min(6,z.scale));if(z.scale<=1){z.scale=1;z.tx=0;z.ty=0;}applyZoom();},{passive:false});
  img.addEventListener('mousedown',function(e){var z=zoomState;if(z.scale<=1)return;e.preventDefault();z.drag=true;z.sx=e.clientX-z.tx;z.sy=e.clientY-z.ty;applyZoom();});
  img.addEventListener('dblclick',function(e){e.preventDefault();var z=zoomState;z.scale=1;z.tx=0;z.ty=0;applyZoom();});
  applyZoom();}
window.addEventListener('mousemove',function(e){var z=zoomState;if(!z.drag)return;z.tx=e.clientX-z.sx;z.ty=e.clientY-z.sy;applyZoom();});
window.addEventListener('mouseup',function(){var z=zoomState;if(z.drag){z.drag=false;applyZoom();}});
/* ===== 측점사진 방향 화살표 (0=↑북 1=→동 2=↓남 3=←서) ===== */
var ARROWS=['↑','→','↓','←'],showDirArrows=true;
function pipeDirAt(p){
  for(var i=0;i<state.lines.length;i++){var L=state.lines[i];if(!L.pts)continue;
    for(var j=0;j<L.pts.length;j++){var v=L.pts[j];
      if(Math.abs(v[0]-p.x)<0.5&&Math.abs(v[1]-p.y)<0.5){var nb=L.pts[j+1]||L.pts[j-1];if(nb)return [nb[0]-p.x,nb[1]-p.y];}
    }}
  return null;
}
function dir4FromVec(dE,dN){return (Math.abs(dN)>=Math.abs(dE))?(dN>=0?0:2):(dE>=0?1:3);}
function defaultPhotoDir(p){return 0;}
function photoDirVec(p,d4){var w=pipeDirAt(p);if(w){var tx=w[0],ty=-w[1],m=Math.hypot(tx,ty)||1;tx/=m;ty/=m;return [[tx,ty],[-ty,tx],[-tx,-ty],[ty,-tx]][d4];}return [[0,-1],[1,0],[0,1],[-1,0]][d4];}
function getPhotoDir(p){if(!p)return 0;var k=ptNum(p);if(state.photoDir&&state.photoDir[k]!=null)return state.photoDir[k];return defaultPhotoDir(p);}
function setPhotoDir(p,d){if(!state.photoDir)state.photoDir={};state.photoDir[ptNum(p)]=((d%4)+4)%4;}
function cyclePhotoDir(p){setPhotoDir(p,getPhotoDir(p)+1);}
function paneImg(no,label,big,capOverride){var p=no!=null?pointByNo(no):null;var bn=p?ptNum(p):null;var url=(no!=null?photoMap[no]:null)||(bn!=null?photoMap[bn]:null);var sub=p?(p.no+' '+((p.code||'').trim())):(no!=null?('번호 '+no):'');
  var cap=capOverride||(sub?(label+' / '+sub):label);
  var inner;
  if(url){inner=big?('<div class="zoomwrap"><img class="ph" id="zoomImg" src="'+url+'" alt=""></div>'):('<img class="ph" src="'+url+'" alt="">');}
  else{inner='<div class="ph php-none">'+(no!=null?'사진 없음':'-')+'</div>';}
  var arrow=p?('<button class="dirArrow" data-num="'+p.no+'" title="사진 방향 — 클릭하면 회전">'+ARROWS[getPhotoDir(p)]+'</button>'):'';
  return '<div class="'+(big?'php-main':'php-sub')+'"><div class="cap">'+arrow+'<span>'+cap+'</span></div>'+inner+'</div>';}
/* 후측량 사진 슬롯 — afterMap 표시 + 폰:촬영 / PC:새로고침 (캡션 번호 뒤 _A) */
function paneAfter(no,label){var p=no!=null?pointByNo(no):null;var bn=p?ptNum(p):null;var url=(no!=null?afterMap[no]:null)||(bn!=null?afterMap[bn]:null);var dn=(p?p.no:no);
  var sub=p?((p.no+'_A '+((p.code||'').trim())).trim()):(no!=null?('번호 '+no+'_A'):'');
  var cap=sub?(label+' / '+sub):label;
  var isMob=(typeof isMobileDevice==='function')?isMobileDevice():false;
  var btn='';
  if(no!=null){
    if(isMob&&viewerMode)btn='<button class="afterCap" data-num="'+dn+'" style="flex:none;margin-left:auto;border:1px solid #16a34a;background:#eafaf0;color:#16a34a;border-radius:7px;padding:4px 10px;font-size:13px;font-weight:700;cursor:pointer">📷 '+(url?'재촬영':'촬영')+'</button>';
    else if(!isMob)btn='<button class="afterRefresh" data-num="'+dn+'" style="flex:none;margin-left:auto;border:1px solid #1f6fd6;background:#eef4fc;color:#1f6fd6;border-radius:7px;padding:4px 10px;font-size:13px;font-weight:700;cursor:pointer">🔄 새로고침</button>';
  }
  var ph=url?('<img class="ph" src="'+url+'" alt="">'):('<div class="ph php-none">'+((isMob&&viewerMode)?'📷 촬영 버튼으로 후측량 사진을 찍어주세요':(!isMob?'🔄 새로고침으로 최신 후측량 사진을 불러오세요':'촬영 예정'))+'</div>');
  return '<div class="php-main php-after"><div class="cap"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cap+'</span>'+btn+'</div>'+ph+'</div>';}
function refreshPhotoPanel(){
  var sel=document.getElementById('photoSel'),nos=sortedNos();
  sel.innerHTML='<option value="">측점 선택…</option>'+nos.map(function(n){return '<option value="'+n+'">'+n+'</option>';}).join('');
  if(selNum!=null)sel.value=String(selNum);
  var body=document.getElementById('photoBody');
  if(selNum==null){body.innerHTML='<div style="color:#999;font-size:12px;padding:14px;text-align:center;line-height:1.7">측점을 선택하세요.<br>(위 드롭다운 또는 도면에서 점 클릭)<br>또는 <b>사진 업로드</b>로 일괄 등록</div>';return;}
  if(IS_FIELD||IS_TANGO){
    // 측량(현장)·탱고: 노출관로/후측량 2등분
    body.innerHTML='<div class="php-split">'+paneImg(selNum,'노출관로 사진',true)+paneAfter(selNum,'후측량 사진')+'</div>';
  }else if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME){
    // 실시간측량: 선택측점 사진만 + "노출관로측량 / 번호 · 관종 · 관경x관수"
    var _rp=(typeof pointByNo==='function')?pointByNo(selNum):null;
    var _rc=_rp?((_rp.code||'').trim()):'';
    var _cap='노출관로측량 / '+selNum;
    if(_rc){var _m=/^([A-Za-z가-힣]+)\s*(.*)$/.exec(_rc);var _gj=_m?_m[1]:_rc;var _gk=_m?(_m[2]||'').trim():'';_cap+=' · '+_gj+(_gk?' · '+_gk:'');}
    body.innerHTML=paneImg(selNum,'노출관로측량',true,_cap);
  }else{
    // 결선 DB: 원래대로 — 선택측점 사진 + 위/아래 측점 썸네일
    var nbs=neighborsOf(selNum),up=nbs.up,down=nbs.down;
    var n1=up?up.no:null,n2=down?down.no:null;
    if(viewerMode){body.innerHTML=paneImg(selNum,'선택측점 사진',true);}
    else{body.innerHTML=paneImg(selNum,'선택측점 사진',true)+'<div class="php-row">'+paneImg(n1,'위 측점',false)+paneImg(n2,'아래 측점',false)+'</div>';}
  }
  setupZoom(document.getElementById('zoomImg'));
  var ac=document.querySelector('.afterCap');if(ac)ac.onclick=function(){afterTargetNum=this.getAttribute('data-num');document.getElementById('fAfter').click();};
  var ar=document.querySelector('.afterRefresh');if(ar)ar.onclick=function(){toast('후측량 사진 새로고침…');loadPhotos();};
}
function centerOnNo(no){var p=null;(state.points||[]).forEach(function(q){if(q&&String(q.no)===String(no))p=q;});if(!p||!isFinite(p.x)||!isFinite(p.y))return;try{var sp=S(p.x,p.y);vb.x=sp[0]-vb.w/2;vb.y=sp[1]-vb.h/2;if(typeof applyVB==='function')applyVB();}catch(e){}}
function selectPoint(num){selNum=String(num);drawGeo();highlightSel();var sel=document.getElementById('photoSel');if(sel)sel.value=String(num);if(photoPanelOpen)refreshPhotoPanel();if(typeof joseoSyncTo==='function')joseoSyncTo(num);}
function openPhotoPanel(o){photoPanelOpen=(o==null)?!photoPanelOpen:!!o;document.getElementById('photoPanel').classList.toggle('open',photoPanelOpen);if(photoPanelOpen&&typeof closeRvPanel==='function')closeRvPanel();if(photoPanelOpen)refreshPhotoPanel();setTimeout(function(){if(typeof fixAspect==='function')fixAspect();if(typeof applyVB==='function')applyVB();if(typeof drawGeo==='function')drawGeo();if(typeof drawManholes==='function')drawManholes();if(typeof highlightSel==='function')highlightSel();if(typeof placeCoord==='function')placeCoord();},30);}
function loadPhotos(){photoMap={};afterMap={};if(!online||!state.projectId){if(photoPanelOpen)refreshPhotoPanel();return;}
  sb.from(DB+'_photos').select('point_no,url').eq('project_id',state.projectId).then(function(res){(res.data||[]).forEach(function(r){var pn=String(r.point_no);if(/_A$/.test(pn))afterMap[pn.replace(/_A$/,'')]=r.url;else photoMap[pn]=r.url;});if(photoPanelOpen)refreshPhotoPanel();if(typeof drawGeo==='function')drawGeo();});}
function _normTxt(s){return (s||'').toString().replace(/[\s_\-]+/g,'').toLowerCase();}
function _hashStr(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h.toString(36);}
function safeName(s){s=(s||'').toString();return /^[A-Za-z0-9._-]+$/.test(s)?s:(s.replace(/[^A-Za-z0-9._-]+/g,'')+'_'+_hashStr(s));}
function _dateOfPt(p){var m=/^(\d{6})-/.exec(p.no||'');return m?m[1]:'';}
function resolvePhotoNo(f){
  var base=f.name.replace(/\.[^.]+$/,'').trim();if(!base)return null;
  var rel=f.webkitRelativePath||f._relpath||'',date='';
  if(rel){var parts=rel.split('/');for(var i=parts.length-2;i>=0;i--){var m=(parts[i]||'').match(/(\d{6})/);if(m){date=m[1];break;}}}
  if(!date&&f._zipdate)date=f._zipdate;
  var pool=(state.points||[]);
  var dpool=date?pool.filter(function(p){return _dateOfPt(p)===date;}):[];
  var cand=(date&&dpool.length)?dpool:pool;
  if(/^\d+$/.test(base)){
    // 순수 숫자 → 번호 매칭
    if(date){var no=date+'-'+base;if(pointByNo(no))return {no:no,matched:true};}
    var ms=cand.filter(function(p){return ptNum(p)===base;});
    if(ms.length===1)return {no:ms[0].no,matched:true};
    return {no:(date?date+'-'+base:base),matched:false}; // ASCII 키 — 추후 측점 들어오면 매칭
  }
  // 글자 → 공백 무시하고 코드칸(없으면 이름) 대조
  var nb=_normTxt(base);
  var cm=cand.filter(function(p){return _normTxt(p.code)===nb;});
  if(cm.length===1)return {no:cm[0].no,matched:true};
  var im=cand.filter(function(p){return _normTxt(ptNum(p))===nb;});
  if(im.length===1)return {no:im[0].no,matched:true};
  return null; // 글자인데 못 찾음(또는 중복) → 미매칭
}
function uploadPhotos(files){
  if(!online){toast('로컬 모드 — 사진 저장 불가');return;}
  if(!state.projectId){toast('먼저 "저장"으로 현장을 저장한 뒤 사진을 올려주세요');return;}
  var arr=[].slice.call(files);if(!arr.length)return;toast('사진 '+arr.length+'장 업로드 중…');
  var done=0,ok=0,unmatched=0,total=arr.length;
  function finish(){if(done<total)return;var msg=ok+'/'+total+'장 업로드 완료';if(unmatched)msg+=' · 미매칭 '+unmatched+'장(측점 없음)';toast(msg);if(photoPanelOpen)refreshPhotoPanel();}
  arr.forEach(function(f){
    var r=resolvePhotoNo(f);
    if(!r){unmatched++;done++;finish();return;}
    if(!r.matched)unmatched++;var no=r.no;
    compressImage(f,1280,0.7).then(function(blob){
      var path=state.projectId+'/'+safeName(no)+'.jpg';
      return sb.storage.from('photos').upload(path,blob,{upsert:true,contentType:'image/jpeg'}).then(function(up){
        if(up.error)throw up.error;
        var url=sb.storage.from('photos').getPublicUrl(path).data.publicUrl+'?t='+Date.now();
        return sb.from(DB+'_photos').delete().eq('project_id',state.projectId).eq('point_no',no).then(function(){
          return sb.from(DB+'_photos').insert({project_id:state.projectId,point_no:no,url:url}).then(function(ins){if(ins.error)throw ins.error;photoMap[no]=url;ok++;if(typeof drawGeo==='function')drawGeo();});
        });
      });
    }).catch(function(err){console.error('photo upload',no,err);}).then(function(){done++;finish();});
  });
}
/* 후측량 사진 — 단일 촬영/업로드 (point_no = 번호_A) */
function uploadAfterPhoto(file,num){
  if(!file)return;
  if(!online){toast('로컬 모드 — 사진 저장 불가');return;}
  if(!state.projectId){toast('먼저 "저장"으로 현장을 저장한 뒤 촬영하세요');return;}
  if(num==null){toast('측점을 먼저 선택하세요');return;}
  var pn=num+'_A';toast('후측량 사진 업로드 중…');
  compressImage(file,1280,0.7).then(function(blob){
    var path=state.projectId+'/'+safeName(num)+'_A.jpg';
    return sb.storage.from('photos').upload(path,blob,{upsert:true,contentType:'image/jpeg'}).then(function(up){
      if(up.error)throw up.error;
      var url=sb.storage.from('photos').getPublicUrl(path).data.publicUrl+'?t='+Date.now();
      return sb.from(DB+'_photos').delete().eq('project_id',state.projectId).eq('point_no',pn).then(function(){
        return sb.from(DB+'_photos').insert({project_id:state.projectId,point_no:pn,url:url}).then(function(ins){if(ins.error)throw ins.error;afterMap[num]=url;});
      });
    });
  }).then(function(){toast('후측량 사진 업로드 완료');if(photoPanelOpen)refreshPhotoPanel();}).catch(function(err){console.error('after upload',num,err);toast('후측량 사진 업로드 실패');});
}
bind('photoBtn',function(){openPhotoPanel();});
document.getElementById('photoClose').onclick=function(){openPhotoPanel(false);};
document.getElementById('photoUp').onclick=function(){document.getElementById('fPhotos').click();};
document.getElementById('photoLinkBtn').onclick=function(){photoLink=!photoLink;this.textContent=photoLink?'🔗 연동':'🔓 미연동';this.classList.toggle('linkon',photoLink);toast(photoLink?'도면↔사진 연동 ON (점 클릭=사진)':'연동 OFF (점 클릭해도 사진 고정)');};
document.getElementById('fPhotos').addEventListener('change',function(e){expandPhotoFiles(e.target.files).then(uploadPhotos);e.target.value='';});
document.getElementById('fAfter').addEventListener('change',function(e){if(e.target.files[0])uploadAfterPhoto(e.target.files[0],afterTargetNum);e.target.value='';});
document.getElementById('photoSel').addEventListener('change',function(e){if(e.target.value){selNum=e.target.value;drawGeo();highlightSel();refreshPhotoPanel();if(typeof centerOnNo==='function')centerOnNo(selNum);}else{selNum=null;drawGeo();clearSvg(gSel);refreshPhotoPanel();}});
/* 도면에서 점 클릭 → 선택 (이동 모드) */
cv.addEventListener('click',function(e){
  if(mode!=='pan'||labelDragging)return;
  var w=toWorld(e.clientX,e.clientY),r=cv.getBoundingClientRect(),wpp=vb.w/r.width;
  var nr=nearestPointWorld(w[0],w[1]);
  if(nr.p&&nr.d<40*wpp){
    if(photoLink){selectPoint(nr.p.no);}
    else{selNum=nr.p.no;drawGeo();highlightSel();if(typeof joseoSyncTo==='function')joseoSyncTo(nr.p.no);}
    toast('측점 '+nr.p.no+' 선택'+(photoLink?'':' (미연동·사진고정)'));
  }
});

/* ====== 좌표 표시 (마우스 따라) ====== */
function fmtCoord(v){return v.toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3});}
var coordBox=document.getElementById('coordBox');
var cwrap=cv.parentElement;
function placeCoord(){var r=cv.getBoundingClientRect();coordBox.style.right=(Math.max(2,window.innerWidth-r.right)+10)+'px';coordBox.style.bottom=(Math.max(2,window.innerHeight-r.bottom)+10)+'px';}
function coordReset(){coordBox.innerHTML='X <b>–</b>　Y <b>–</b>';placeCoord();if(gDraw)clearSvg(gDraw);}
cwrap.addEventListener('mousemove',function(e){
  placeCoord();
  var w=toWorld(e.clientX,e.clientY); var X=-w[1], Y=w[0];   // X=북, Y=동
  var r=cv.getBoundingClientRect(), wpp=vb.w/r.width;
  var nr=nearestPointWorld(w[0],w[1]); var near='';
  if(nr.p && nr.d < 22*wpp){ near='<span class="cb-near">'+nr.p.no+'  '+((nr.p.code||'').trim())+'</span>'; }
  coordBox.innerHTML='X <b>'+fmtCoord(X)+'</b>　Y <b>'+fmtCoord(Y)+'</b>'+near;
  if(mode==='line')drawIndicators(w); else if(mode==='delline'||mode==='delall2')delHoverHighlight(w); else if(gDraw.childNodes.length)clearSvg(gDraw);
});
cwrap.addEventListener('mouseleave',coordReset);
window.addEventListener('resize',function(){fixAspect();applyVB();placeCoord();if(typeof drawGeo==='function'){drawGeo();drawManholes();highlightSel();}});
// 캔버스 영역 크기 변화(사진패널 열기/닫기·창 크기 등) 감지 → 배경지도 relayout + 종횡비 재맞춤
if(window.ResizeObserver){
  var _cwEl=document.querySelector('.canvas-wrap');
  if(_cwEl){var _cwro=new ResizeObserver(function(){if(bgMapOn&&bgmap){try{bgmap.relayout();}catch(e){}}fixAspect();applyVB();});_cwro.observe(_cwEl);}
}
coordReset();
window.addEventListener('keydown',function(e){
  var tg=((e.target||{}).tagName)||'';if(/INPUT|TEXTAREA|SELECT/.test(tg))return;
  if(e.key==='Enter'||e.key===' '||e.code==='Space'){
    e.preventDefault();
    if(mode==='line'){finishDraw();return;}              // 선 그리는 중 → 완료(끔)
    if(mode==='measure'){mode='pan';setModeUI();toast('거리산출 종료');return;}
    if(mode==='mhplace'||mode==='riserplace')return;      // 심기 모드 중엔 무시(클릭으로 심음)
    if(lastStartAction)lastStartAction();                 // 그 외(완료·심기 후 등) → 바로 전 시작 기능 다시 시작
  }
});
document.getElementById('recClear').onclick=function(){if(!state.markups.length){toast('삭제할 검수 기록이 없습니다');return;}state.markups.forEach(function(r){if(r.el)r.el.remove();});state.markups=[];renderRecs();toast('검수 기록 전체 삭제');};

setModeUI();setStatusUI();initSb();updMeta();toast('CSV 업로드 또는 상단에서 현장을 선택하세요');


/* ===== [BUILD 791] 사업 잠금: 공정별 같은 사업 동시열기 방지 ===== */

var LOCK_TABLE='applock', LOCK_TTL=90000, LOCK_BEAT=30000;

var _myLock=null, _lockTimer=null;





function _lockRelease(){
  if(!_myLock)return; var L=_myLock; _myLock=null;
  if(_lockTimer){clearInterval(_lockTimer);_lockTimer=null;}
  try{sb.from(LOCK_TABLE).delete().eq('stage',L.stage).eq('project_id',L.pid).eq('holder',ME).then(function(){},function(){});}catch(e){}
}
function _lockBeat(){
  if(!_myLock)return;
  try{sb.from(LOCK_TABLE).update({ts:new Date().toISOString()}).eq('stage',_myLock.stage).eq('project_id',_myLock.pid).eq('holder',ME).then(function(){},function(){});}catch(e){}
}
/* cb(ok, holder). 테이블 미설정/오류 시 fail-open(ok=true) — 절대 못 열게 하지 않음 */
function _lockTry(id, cb){
  if(!id){cb(true,ME);return;}
  var pid=String(id), q;
  try{ q=sb.from(LOCK_TABLE).select('*').eq('stage',STAGE).eq('project_id',pid).limit(1); }
  catch(e){ cb(true,ME); return; }
  q.then(function(res){
    if(res&&res.error){ cb(true,ME); return; }
    var row=res&&res.data&&res.data[0], now=Date.now();
    var free = !row || !row.ts || row.holder===ME || (now-new Date(row.ts).getTime()>LOCK_TTL);
    if(!free){ cb(false, row.holder||'\ub2e4\ub978 \uc0ac\uc6a9\uc790'); return; }
    sb.from(LOCK_TABLE).upsert({stage:STAGE,project_id:pid,holder:ME||'(\ubbf8\uc9c0\uc815)',ts:new Date().toISOString()}).then(function(r2){
      if(r2&&r2.error){ cb(true,ME); return; }
      _myLock={stage:STAGE,pid:pid};
      if(_lockTimer)clearInterval(_lockTimer); _lockTimer=setInterval(_lockBeat,LOCK_BEAT);
      cb(true,ME);
    }, function(){ cb(true,ME); });
  }, function(){ cb(true,ME); });
}

/* loadProject 잠금 래퍼 (원본=_loadProjectRaw) */
function loadProject(id,ro,cb){
  if(!online||!id)return;
  if(ro===true){ state._foreignLock=null; _loadProjectRaw(id,true,cb); return; }
  _lockRelease();
  _lockTry(id,function(ok,holder){
    if(ok){ state._foreignLock=null; _loadProjectRaw(id,false,cb); }
    else{ state._foreignLock=holder; _loadProjectRaw(id,true,function(){ toast('\uD83D\uDD12 '+holder+'\ub2d8\uc774 \ud3b8\uc9d1 \uc911 \u2014 \uc77d\uae30 \uc804\uc6a9'); if(typeof cb==='function')cb(); }); }
  });
}

try{ window.addEventListener('beforeunload', function(){ _lockRelease(); }); }catch(e){}

/* ===== 잠금 모듈 끝 ===== */


/* ===== [BUILD 796] 현장(field) 레이어 패널 (도면 위 떠있는 접이식) ===== */
function fldLayerBox(){
  var ALL=['no','code','depth','date','mh','riser','bp','bpbox','hyun','roadzone','photoDir','depthchk','surfacedot','selbox','tagbox','tgseg'];
  ALL.forEach(function(k){ if(LV[k]==null) LV[k]=1; });
  try{ localStorage.setItem(LV_KEY,JSON.stringify(LV)); }catch(e){}
  var defs=(typeof IS_REALTIME!=='undefined'&&IS_REALTIME)?[['no','점번호'],['code','관정보'],['date','날짜'],['mh','맨홀 정보'],['riser','입상주'],['bp','보강판 측점'],['bpbox','보강판 박스'],['photoDir','사진방향'],['tagbox','태그 이동']]:[['no','점번호'],['code','관정보'],['depth','심도'],['date','날짜'],['mh','맨홀 정보'],['riser','입상주'],['bp','보강판 측점'],['bpbox','보강판 박스'],['photoDir','사진방향'],['tgseg','구간 색칠']];
  var open=(function(){try{return localStorage.getItem('fldLayerOpen')!=='0';}catch(e){return true;}})();
  var h='<div style="border:1px solid #f1c40f;border-radius:8px;padding:6px 10px;background:#fffdf5;box-shadow:0 2px 8px rgba(0,0,0,.15);min-width:92px">';
  h+='<div onclick="fldLayerToggleOpen()" style="font-weight:700;font-size:12px;color:#0a3ea0;cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none'+(open?';margin-bottom:5px':'')+'">레이어 <span style="font-size:9px">'+(open?'▼':'▶')+'</span></div>';
  if(open){ defs.forEach(function(d){ h+='<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:2px 0;cursor:pointer;white-space:nowrap"><input type="checkbox" data-tglv="'+d[0]+'"'+(LV[d[0]]?' checked':'')+' onchange="fldLayerToggle(this)">'+d[1]+'</label>'; }); }
  return h+'</div>';
}
function fldLayerToggle(inp){ if(typeof setLayerVis==='function') setLayerVis(inp.getAttribute('data-tglv'),inp.checked); }
function fldLayerToggleOpen(){ var cur=true; try{cur=(localStorage.getItem('fldLayerOpen')!=='0');}catch(e){} try{localStorage.setItem('fldLayerOpen',cur?'0':'1');}catch(e){} var lw=document.getElementById('fldLayerWrap'); if(lw) lw.innerHTML=fldLayerBox(); }
function fieldLayerBar(){
  var cw=document.querySelector('.canvas-wrap'); if(!cw) return;
  if(getComputedStyle(cw).position==='static') cw.style.position='relative';
  var lw=document.getElementById('fldLayerWrap');
  if(!lw){ lw=document.createElement('div'); lw.id='fldLayerWrap'; lw.style.cssText='position:absolute;left:10px;top:10px;z-index:20'; cw.appendChild(lw); }
  lw.innerHTML=fldLayerBox();
  if(typeof applyLayerVis==='function') applyLayerVis();
}
try{
  if((typeof IS_FIELD!=='undefined'&&IS_FIELD)||(typeof IS_REALTIME!=='undefined'&&IS_REALTIME)){
    fieldLayerBar();
    setTimeout(function(){try{fieldLayerBar();}catch(e){}},700);
    setTimeout(function(){try{fieldLayerBar();}catch(e){}},2000);
  }
}catch(e){}
/* ===== 현장 레이어 패널 끝 ===== */

/* ===== [BUILD 815] 실시간측량 측점 촬영 (날짜 자동 + 번호 자동제안·수정가능) ===== */
function rtToday(){var d=new Date();function p(n){return('0'+n).slice(-2);}return String(d.getFullYear()).slice(2)+p(d.getMonth()+1)+p(d.getDate());}function rtWorkDay(){var d=new Date();var real=rtToday();var tm=d.getHours()*60+d.getMinutes();var ns=state.nightShift;var work=(ns&&ns.on&&ns.cut!=null&&tm<ns.cut)?prevDayYMD(real):real;return {real:real,work:work,tm:tm};}
function rtNextNo(day){var mx=0;var re=new RegExp('^'+day+'-(\\d+)$');try{Object.keys((typeof photoMap!=='undefined'&&photoMap)?photoMap:{}).forEach(function(k){var m=re.exec(k);if(m)mx=Math.max(mx,parseInt(m[1],10));});}catch(e){}(state.points||[]).forEach(function(p){var m=re.exec(p.no||'');if(m)mx=Math.max(mx,parseInt(m[1],10));});return mx+1;}
var rtPendingNo=null;var rtPendingMeta=null;
function rtCapture(){
  if(typeof online!=='undefined'&&!online){toast('로컬 모드 — 사진 저장 불가');return;}
  if(!state.projectId){toast('먼저 "저장"으로 사업을 저장한 뒤 촬영하세요');return;}
  var _wi=rtWorkDay();var day=_wi.work;var sug=rtNextNo(day);
  rtShowNumPopup(day,String(sug),function(num){
    rtPendingNo=day+'-'+num;rtPendingMeta={_d0:_wi.real,_tm:_wi.tm,_nm:num};
    var inp=document.getElementById('rtCamInput');if(inp){inp.value='';inp.click();}
  });
}
function rtShowNumPopup(day,sug,onOk){
  var old=document.getElementById('rtNumOv');if(old&&old.parentNode)old.parentNode.removeChild(old);
  var ov=document.createElement('div');ov.id='rtNumOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,20,30,.5);z-index:100000;display:flex;align-items:center;justify-content:center';
  var card=document.createElement('div');
  card.style.cssText='background:#fff;border-radius:16px;width:300px;max-width:90vw;box-shadow:0 24px 70px rgba(0,0,0,.4);overflow:hidden';
  card.innerHTML=
    '<div style="height:6px;background:linear-gradient(90deg,#EA002C 0%,#FF7A00 55%,#FFC61A 100%)"></div>'+
    '<div style="padding:22px 24px">'+
      '<div style="font-weight:800;font-size:18px;color:#1f2d3d;margin-bottom:3px">\uD83D\uDCF7 \uCE21\uC810 \uCD2C\uC601</div>'+
      '<div style="font-size:12px;color:#9aa4b0;margin-bottom:15px">\uC624\uB298 '+day+' \u00B7 \uCE21\uC810 \uBC88\uD638\uB97C \uD655\uC778/\uC218\uC815\uD558\uC138\uC694</div>'+
      '<input id="rtNumInp" type="text" inputmode="numeric" value="'+sug+'" style="width:100%;box-sizing:border-box;font-size:18px;font-weight:800;text-align:center;padding:9px;border:2px solid #f0c9c9;border-radius:9px;color:#EA002C;outline:none;margin-bottom:12px">'+
      '<div style="display:flex;gap:8px">'+
        '<button id="rtNumCancel" style="flex:1;display:flex;align-items:center;justify-content:center;padding:11px;border:1px solid #dfe3e8;background:#f5f6f8;color:#333;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer">\uCDE8\uC18C</button>'+
        '<button id="rtNumOk" style="flex:2;display:flex;align-items:center;justify-content:center;gap:4px;padding:11px;border:0;background:#EA002C;color:#fff;border-radius:10px;font-weight:800;font-size:15px;cursor:pointer">\uD83D\uDCF7 \uCD2C\uC601</button>'+
      '</div>'+
    '</div>';
  ov.appendChild(card);document.body.appendChild(ov);
  var inp=document.getElementById('rtNumInp');
  setTimeout(function(){try{inp.focus();inp.select();}catch(e){}},60);
  function close(){if(ov.parentNode)ov.parentNode.removeChild(ov);}
  document.getElementById('rtNumCancel').onclick=close;
  document.getElementById('rtNumOk').onclick=function(){var v=(inp.value||'').trim();if(!v){inp.focus();return;}close();onOk(v);};
  inp.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();document.getElementById('rtNumOk').click();}else if(e.key==='Escape'){close();}};
  ov.onclick=function(e){if(e.target===ov)close();};
}
function rtCamPicked(inp){
  var f=inp&&inp.files&&inp.files[0];if(!f||!rtPendingNo)return;
  var no=rtPendingNo;rtPendingNo=null;
  if(navigator.geolocation){rtGetLoc(no);}else{toast('⚠ 이 브라우저는 위치 미지원');}
  toast('측점 '+no+' 사진 업로드 중…');
  compressImage(f,1280,0.7).then(function(blob){
    var path=state.projectId+'/'+safeName(no)+'.jpg';
    return sb.storage.from('photos').upload(path,blob,{upsert:true,contentType:'image/jpeg'}).then(function(up){
      if(up.error)throw up.error;
      var url=sb.storage.from('photos').getPublicUrl(path).data.publicUrl+'?t='+Date.now();
      return sb.from(DB+'_photos').delete().eq('project_id',state.projectId).eq('point_no',no).then(function(){
        return sb.from(DB+'_photos').insert({project_id:state.projectId,point_no:no,url:url}).then(function(){
          if(typeof photoMap!=='undefined')photoMap[no]=url;
          if(typeof drawGeo==='function')drawGeo();
          if(typeof photoPanelOpen!=='undefined'&&photoPanelOpen&&typeof refreshPhotoPanel==='function')refreshPhotoPanel();
          toast('측점 '+no+' 사진 완료');rtSaveSoon();selNum=no;if(typeof highlightSel==='function')highlightSel();if(typeof photoPanelOpen!=='undefined'&&!photoPanelOpen&&typeof openPhotoPanel==='function')openPhotoPanel();var _psel=document.getElementById('photoSel');if(_psel)_psel.value=no;if(typeof refreshPhotoPanel==='function')refreshPhotoPanel();
        });
      });
    });
  }).catch(function(e){toast('사진 업로드 실패: '+(e&&e.message||e));});
}
/* ===== 실시간 촬영 끝 ===== */
/* [BUILD 833] 저장 디바운스 (연속 촬영 시 마지막 한 번만 저장 -> 버벅임 해결) */
var _rtSaveTimer=null;
function rtOpenDoneModal(){
  if(!state.projectId){toast('먼저 사업을 선택하세요');return;}
  if(state.rtDone&&state.rtDone.done){if(confirm('이미 완료된 사업입니다. 완료를 취소할까요?')){state.rtDone=null;saveProject();renderSub();toast('완료 취소됨');}return;}
  var old=document.getElementById('rtDoneModal');if(old)old.remove();
  var _mob=(typeof isMobileDevice==='function'&&isMobileDevice());
  var wrap=document.createElement('div');wrap.id='rtDoneModal';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;justify-content:center;'+(_mob?'align-items:flex-start;padding-top:10dvh':'align-items:center');
  wrap.innerHTML='<div style="background:#fff;border-radius:14px;width:min(90vw,340px);padding:20px 18px;text-align:center">'
    +'<div style="font-weight:800;font-size:16px;margin-bottom:10px">실시간측량 사업완료</div>'
    +'<div style="font-size:14px;color:#444;line-height:1.6;margin-bottom:16px">실시간측량 사업완료로<br>완료목록에 등록합니다</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button type="button" id="rtDoneOk" style="flex:1;background:#1d9e75;color:#fff;border:0;border-radius:9px;padding:12px;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">등록</span></button>'
    +'<button type="button" id="rtDoneCancel" style="flex:1;background:#f1f1ee;color:#333;border:0;border-radius:9px;padding:12px;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center"><span style="letter-spacing:4px;margin-right:-4px">취소</span></button>'
    +'</div></div>';
  document.body.appendChild(wrap);
  /* [BUILD 915] 모바일: 팝업 밑에 완료된 사업 목록 표시 */
  if(_mob){
    var _bx=wrap.firstChild;
    var lb=document.createElement('div');
    lb.innerHTML='<div style="border-top:1px solid #eee;margin-top:14px;padding-top:10px;font-size:13px;font-weight:800;color:#0f6e56;text-align:left">완료된 사업</div>'
      +'<div id="rtDoneRows" style="max-height:34dvh;overflow:auto;text-align:left;margin-top:4px"><div style="color:#bbb;font-size:12px;padding:6px">불러오는 중…</div></div>';
    _bx.appendChild(lb);
    if(online){sb.from(DB+'_projects').select('id,name,updated_at,payload').order('updated_at',{ascending:false}).then(function(res){
      var rows=(res.data||[]).filter(function(p){return p.payload&&p.payload.rtDone&&p.payload.rtDone.done&&((p.payload.stage||'survey')===STAGE);});
      var rd=wrap.querySelector('#rtDoneRows');if(!rd)return;
      rd.innerHTML=rows.length?rows.map(function(p){var dt=((p.payload.rtDone&&p.payload.rtDone.at)||'').slice(0,10);return '<button class="rtdone-row" data-id="'+p.id+'" style="display:block;width:100%;text-align:left;margin:4px 0;padding:10px 12px;border:1px solid #cfe8dd;border-radius:9px;background:#f2fbf7;cursor:pointer;font-size:14px;font-weight:700;color:#0f6e56">✓ '+p.name+(dt?'<span style="float:right;font-size:12px;color:#8aa79b;font-weight:400">'+dt+'</span>':'')+'</button>';}).join(''):'<div style="color:#bbb;font-size:12px;padding:6px">실측완료된 사업이 없습니다.</div>';
      rd.querySelectorAll('.rtdone-row').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-id');wrap.remove();loadProject(id);};});
    });}
  }
  wrap.addEventListener('click',function(e){if(e.target===wrap)wrap.remove();});
  document.getElementById('rtDoneCancel').onclick=function(){wrap.remove();};
  document.getElementById('rtDoneOk').onclick=function(){wrap.remove();state.rtDone={done:true,at:new Date().toISOString()};saveProject();renderSub();toast('실측완료 등록됨');};
}
/* [BUILD 914] 실측완료 사업목록 팝업 */
function rtOpenDoneList(){
  if(!online){toast('로컬 모드 — Supabase 연결이 필요합니다');return;}
  sb.from(DB+'_projects').select('id,name,updated_at,payload').order('updated_at',{ascending:false}).then(function(res){
    var rows=(res.data||[]).filter(function(p){return p.payload&&p.payload.rtDone&&p.payload.rtDone.done&&((p.payload.stage||'survey')===STAGE);});
    var body=rows.length
      ? '<div style="max-height:320px;overflow:auto;text-align:left">'+rows.map(function(p){
          var dt=((p.payload.rtDone&&p.payload.rtDone.at)||'').slice(0,10);
          return '<button class="rtdone-row" data-id="'+p.id+'" style="display:block;width:100%;text-align:left;margin:4px 0;padding:10px 12px;border:1px solid #cfe8dd;border-radius:9px;background:#f2fbf7;cursor:pointer;font-size:14px;font-weight:700;color:#0f6e56">✓ '+p.name+(dt?'<span style="float:right;font-size:12px;color:#8aa79b;font-weight:400">'+dt+'</span>':'')+'</button>';
        }).join('')+'</div>'
      : '<div style="color:#999;padding:8px">실측완료된 사업이 없습니다.</div>';
    var card=showModal({title:'실측완료 사업목록',tone:'ok',body:body,buttons:[{label:'닫기'}]});
    card.querySelectorAll('.rtdone-row').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-id');card.remove();loadProject(id);};});
  });
}
function rtPurgeTrash(){try{
  if(!state._trash||!state._trash.length)return;
  var now=Date.now(),keep=[],del=[];
  var live={};(state.points||[]).forEach(function(p){live[p.no]=1;});(state.gpsPts||[]).forEach(function(g){live[g.no]=1;});
  state._trash.forEach(function(t){if(!t||!t.no)return;if(live[t.no])return;
    if(now-new Date(t.at||0).getTime()>7*86400000)del.push(t);else keep.push(t);});
  state._trash=keep;
  if(del.length&&typeof online!=='undefined'&&online&&state.projectId){del.forEach(function(t){
    try{sb.storage.from('photos').remove([state.projectId+'/'+safeName(t.no)+'.jpg']).then(function(){});}catch(e){}
    try{sb.from(DB+'_photos').delete().eq('project_id',state.projectId).eq('point_no',t.no).then(function(){});}catch(e){}});}
}catch(e){}}
function rtUndo(){if(typeof doUndo==='function')doUndo();if(typeof drawGeo==='function')drawGeo();if(typeof updMeta==='function')updMeta();if(typeof rtSaveSoon==='function')rtSaveSoon();}
function rtAutoTags(rec){try{
  if(!rec||!rec.pts||rec.pts.length<2)return;
  var seq=[];rec.pts.forEach(function(v){var best=null,bd=0.25;(state.points||[]).forEach(function(p){
    if(!p||!isFinite(p.x))return;var d=Math.min(Math.hypot(p.x-v[0],p.y-v[1]),Math.hypot(p.x-v[0],-p.y-v[1]));
    if(d<bd){bd=d;best=p;}});if(best&&seq.indexOf(best)<0)seq.push(best);});
  if(seq.length<2)return;
  var segs=[];for(var i=1;i<seq.length;i++)segs.push(Math.hypot(seq[i].x-seq[i-1].x,seq[i].y-seq[i-1].y));
  segs.sort(function(a,b){return a-b;});var med=segs[Math.floor(segs.length/2)]||4;
  var LEN=Math.max(2.5,Math.min(8,med*1.1));
  state.labelOff=state.labelOff||{};
  for(var k=0;k<seq.length;k++){var p=seq[k];
    var a=seq[Math.max(0,k-1)],b=seq[Math.min(seq.length-1,k+1)];
    var dx=b.x-a.x,dy=b.y-a.y,L2=Math.hypot(dx,dy)||1;dx/=L2;dy/=L2;
    var sd=(k%2===0)?1:-1;
    state.labelOff[p.no]=[p.x+(-dy)*sd*LEN,p.y+dx*sd*LEN];
  }
}catch(e){}}
function rtSaveSoon(){if(_rtSaveTimer)clearTimeout(_rtSaveTimer);_rtSaveTimer=setTimeout(function(){_rtSaveTimer=null;if(typeof saveProject==='function'){try{saveProject();}catch(e){}}},2500);}

/* ===== [BUILD 827] 측점 삭제(롱프레스) + 재촬영 ===== */
function rtDeletePoint(no){
  if(!confirm('측점 '+no+' 을(를) 삭제할까요?\n(사진은 7일 보관 후 완전삭제 — 되돌리기로 복구 가능)'))return;if(typeof pushHist==='function')pushHist();state._trash=state._trash||[];state._trash.push({no:no,at:new Date().toISOString()});
  if(state.gpsPts)state.gpsPts=state.gpsPts.filter(function(g){return g.no!==no;});
  if(state.points)state.points=state.points.filter(function(p){return p.no!==no;});
  if(String(selNum)===String(no)){selNum=null;if(typeof gSel!=='undefined'&&typeof clearSvg==='function')clearSvg(gSel);}
  if(typeof drawGeo==='function')drawGeo();
  if(typeof saveProject==='function'){try{saveProject();}catch(e){}}
  if(typeof photoPanelOpen!=='undefined'&&photoPanelOpen&&typeof refreshPhotoPanel==='function')refreshPhotoPanel();
  if(typeof toast==='function')toast('측점 '+no+' 삭제됨');
}
function rtRecapture(){
  if(selNum==null){toast('먼저 측점을 선택하세요 (점 클릭)');return;}
  if(typeof online!=='undefined'&&!online){toast('로컬 모드 — 사진 저장 불가');return;}
  if(!state.projectId){toast('먼저 "저장"으로 사업을 저장한 뒤 촬영하세요');return;}
  if(!confirm('측점 '+selNum+' 사진을 다시 촬영할까요? (기존 사진 덮어씀)'))return;
  rtPendingNo=String(selNum);
  var inp=document.getElementById('rtCamInput');if(inp){inp.value='';inp.click();}
}
/* ===== 삭제/재촬영 끝 ===== */

/* ===== [BUILD 829] 측점 롱프레스 메뉴(번호 수정 / 삭제) ===== */
function rtPointMenu(no){
  var old=document.getElementById('rtMenuOv');if(old&&old.parentNode)old.parentNode.removeChild(old);
  var ov=document.createElement('div');ov.id='rtMenuOv';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,20,30,.5);z-index:100001;display:flex;align-items:center;justify-content:center';
  var card=document.createElement('div');
  card.style.cssText='background:#fff;border-radius:16px;width:266px;max-width:88vw;box-shadow:0 24px 70px rgba(0,0,0,.4);overflow:hidden';
  card.innerHTML='<div style="height:6px;background:linear-gradient(90deg,#EA002C,#FF7A00,#FFC61A)"></div>'+
    '<div style="padding:18px 20px">'+
    '<div style="font-weight:800;font-size:16px;color:#1f2d3d;text-align:center;margin-bottom:14px">측점 '+no+'</div>'+
    '<button id="rtmEdit" style="display:flex;align-items:center;justify-content:center;width:100%;padding:12px;border:1px solid #1565c0;background:#eaf2fc;color:#1565c0;border-radius:10px;font-weight:800;font-size:14px;margin-bottom:8px;cursor:pointer">\u270F\uFE0F \uBC88\uD638 \uC218\uC815</button>'+
    '<button id="rtmDel" style="display:flex;align-items:center;justify-content:center;width:100%;padding:12px;border:0;background:#EA002C;color:#fff;border-radius:10px;font-weight:800;font-size:14px;margin-bottom:8px;cursor:pointer">\uD83D\uDDD1 \uC0AD\uC81C</button>'+
    '<button id="rtmCancel" style="display:flex;align-items:center;justify-content:center;width:100%;padding:11px;border:1px solid #dfe3e8;background:#f5f6f8;color:#333;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer">\uCDE8\uC18C</button>'+
    '</div>';
  ov.appendChild(card);document.body.appendChild(ov);
  function close(){if(ov.parentNode)ov.parentNode.removeChild(ov);}
  document.getElementById('rtmCancel').onclick=close;
  document.getElementById('rtmDel').onclick=function(){close();rtDeletePoint(no);};
  document.getElementById('rtmEdit').onclick=function(){close();rtEditNo(no);};
  ov.onclick=function(e){if(e.target===ov)close();};
}
function rtEditNo(no){
  var day=(no||'').split('-')[0];var cur=(no||'').split('-').slice(1).join('-');
  var nv=prompt('측점 번호 수정 (오늘 '+day+')\n실제 측점번호로 고치세요',cur);
  if(nv===null)return;nv=(nv||'').trim();if(!nv||nv===cur)return;
  var newNo=day+'-'+nv;
  var dup=(state.gpsPts||[]).some(function(g){return g.no===newNo;})||(typeof pointByNo==='function'&&pointByNo(newNo));
  if(dup){toast('이미 있는 번호입니다: '+newNo);return;}
  if(state.gpsPts)state.gpsPts.forEach(function(g){if(g.no===no)g.no=newNo;});
  if(state.points)state.points.forEach(function(p){if(p.no===no)p.no=newNo;});
  try{if(typeof photoMap!=='undefined'&&photoMap[no]){photoMap[newNo]=photoMap[no];delete photoMap[no];}}catch(e){}
  try{if(typeof afterMap!=='undefined'&&afterMap[no]){afterMap[newNo]=afterMap[no];delete afterMap[no];}}catch(e){}
  if(typeof online!=='undefined'&&online&&state.projectId){
    try{sb.from(DB+'_photos').update({point_no:newNo}).eq('project_id',state.projectId).eq('point_no',no).then(function(r){if(r&&r.error){toast('사진 번호 이동 실패: '+r.error.message);}else{try{var _op=state.projectId+'/'+safeName(no)+'.jpg',_np=state.projectId+'/'+safeName(newNo)+'.jpg';sb.storage.from('photos').move(_op,_np).then(function(mv){if(!mv||!mv.error){var _u=sb.storage.from('photos').getPublicUrl(_np).data.publicUrl+'?t='+Date.now();if(typeof photoMap!=='undefined')photoMap[newNo]=_u;sb.from(DB+'_photos').update({url:_u}).eq('project_id',state.projectId).eq('point_no',newNo).then(function(){});if(typeof photoPanelOpen!=='undefined'&&photoPanelOpen&&typeof refreshPhotoPanel==='function')refreshPhotoPanel();}});}catch(_me){}}});}catch(e){}
  }
  if(String(selNum)===String(no))selNum=newNo;
  if(typeof drawGeo==='function')drawGeo();
  if(typeof highlightSel==='function')highlightSel();
  if(typeof saveProject==='function'){try{saveProject();}catch(e){}}
  if(typeof photoPanelOpen!=='undefined'&&photoPanelOpen&&typeof refreshPhotoPanel==='function')refreshPhotoPanel();
  if(typeof toast==='function')toast('번호 변경: '+no+' \u2192 '+newNo);
}
/* ===== 롱프레스 메뉴 끝 ===== */

/* ===== [BUILD 818] 폰 GPS 위경도 -> 도면좌표(EPSG:5186) 변환 + 파란 임시측점 ===== */
function tm5186(lat,lon){
  var a=6378137.0,f=1/298.257222101,e2=f*(2-f);
  var lat0=38.0*Math.PI/180,lon0=127.0*Math.PI/180,k0=1.0,FE=200000.0,FN=600000.0;
  var phi=lat*Math.PI/180,lam=lon*Math.PI/180,ep2=e2/(1-e2);
  var N=a/Math.sqrt(1-e2*Math.sin(phi)*Math.sin(phi));
  var T=Math.tan(phi)*Math.tan(phi),C=ep2*Math.cos(phi)*Math.cos(phi),A=(lam-lon0)*Math.cos(phi);
  function Mf(p){return a*((1-e2/4-3*e2*e2/64-5*e2*e2*e2/256)*p-(3*e2/8+3*e2*e2/32+45*e2*e2*e2/1024)*Math.sin(2*p)+(15*e2*e2/256+45*e2*e2*e2/1024)*Math.sin(4*p)-(35*e2*e2*e2/3072)*Math.sin(6*p));}
  var M=Mf(phi),M0=Mf(lat0);
  var E=FE+k0*N*(A+(1-T+C)*A*A*A/6+(5-18*T+T*T+72*C-58*ep2)*Math.pow(A,5)/120);
  var No=FN+k0*(M-M0+N*Math.tan(phi)*(A*A/2+(5-T+9*C+4*C*C)*Math.pow(A,4)/24+(61-58*T+T*T+600*C-330*ep2)*Math.pow(A,6)/720));
  return [No,E]; /* [Northing(X), Easting(Y)] */
}
function rtAddGps(no,lat,lon){
  try{
    var ne=tm5186(lat,lon); var px=ne[1],py=ne[0]; /* point.x=Easting, point.y=Northing (parseCsv와 동일) */
    if(!state.gpsPts)state.gpsPts=[];
    var found=false;
    var _m=rtPendingMeta;rtPendingMeta=null;
    for(var i=0;i<state.gpsPts.length;i++){if(state.gpsPts[i].no===no){state.gpsPts[i].x=px;state.gpsPts[i].y=py;if(_m){state.gpsPts[i]._d0=_m._d0;state.gpsPts[i]._tm=_m._tm;state.gpsPts[i]._nm=_m._nm;}found=true;break;}}
    if(!found)state.gpsPts.push(_m?{no:no,x:px,y:py,_d0:_m._d0,_tm:_m._tm,_nm:_m._nm}:{no:no,x:px,y:py});
    var _nd=(!state.points||!state.points.length)&&(!state.lines||!state.lines.length);if(_nd&&state.gpsPts.length<=1){if(typeof fitView==='function')fitView();}else{rtCenterOn(px,py);}
    rtSaveSoon();
  }catch(e){}
}
function rtCenterOn(wx,wy){try{var _s=S(wx,wy);vb.x=_s[0]-vb.w/2;vb.y=_s[1]-vb.h/2;if(typeof applyVB==='function')applyVB();if(typeof drawGeo==='function')drawGeo();if(typeof drawManholes==='function')drawManholes();if(typeof highlightSel==='function')highlightSel();}catch(e){}}
var _rtWatchId=null,_rtLastPos=null;
function rtStartWatch(){if(!navigator.geolocation||_rtWatchId!=null)return;try{_rtWatchId=navigator.geolocation.watchPosition(function(pos){_rtLastPos={lat:pos.coords.latitude,lon:pos.coords.longitude,acc:pos.coords.accuracy,t:Date.now()};},function(e){},{enableHighAccuracy:true,timeout:20000,maximumAge:3000});}catch(e){}}
function rtStopWatch(){if(_rtWatchId!=null&&navigator.geolocation){try{navigator.geolocation.clearWatch(_rtWatchId);}catch(e){}_rtWatchId=null;}}
function rtGetLoc(no){
  if(_rtLastPos&&(Date.now()-_rtLastPos.t)<12000){rtAddGps(no,_rtLastPos.lat,_rtLastPos.lon);if(typeof toast==='function')toast('측점 '+no+' 위치 표시(파란점)');return;}
  if(!navigator.geolocation){toast('이 브라우저는 위치 미지원');return;}
  // 1차: 빠른 저정밀(와이파이/기지국) — 실내·도심에서 잘 잡힘
  navigator.geolocation.getCurrentPosition(function(pos){
    rtAddGps(no,pos.coords.latitude,pos.coords.longitude);
    toast('측점 '+no+' 위치 표시(파란점)');
  },function(err1){
    // 2차: 정밀(GPS) 재시도 — 넉넉한 타임아웃
    navigator.geolocation.getCurrentPosition(function(pos){
      rtAddGps(no,pos.coords.latitude,pos.coords.longitude);
      toast('측점 '+no+' 위치 표시(파란점)');
    },function(err2){
      toast('⚠ 위치 못 받음 — 사진만 저장됨(나중에 CSV로 위치 표시)');
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  },{enableHighAccuracy:false,timeout:6000,maximumAge:60000});
}
/* ===== TM/GPS 끝 ===== */

/* [BUILD 824] 실시간측량 모바일 헤더 라벨 축약 */
try{if(typeof IS_REALTIME!=='undefined'&&IS_REALTIME){rtStartWatch();setTimeout(function(){var _pb=document.getElementById('photoBtn');if(_pb)_pb.textContent='\uD83D\uDCF7 \uC0AC\uC9C4';var _bb=document.getElementById('bgBtn');if(_bb)_bb.textContent='\uD83D\uDDFA \uC9C0\uB3C4';},400);}}catch(e){}


/* [1006] 측량현장: 안드로이드 뒤로가기 가드 — 실수로 뒤로 눌러도 확인 후에만 이탈 */
(function(){
  if(document.title.indexOf('현장')<0)return;
  function arm(){try{history.pushState({fgGuard:1},'');}catch(e){}}
  arm();
  window.addEventListener('popstate',function(){
    if(confirm('측량현장 초기화면으로 돌아갑니다')){
      try{history.back();}catch(e){}
    }else{
      arm();
    }
  });
})();
