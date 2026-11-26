import bebas from '../assets/BebasNeue-Regular.woff2';
import chakraM from '../assets/ChakraPetch-Medium.woff2';
import chakraB from '../assets/ChakraPetch-Bold.woff2';

/*
  SKY ACE design system — see flight/DESIGN.md
  angular clipped panels · condensed display type · burn/dusk accents · motion via transform/opacity/clip-path only
*/
export const CSS = `
@font-face{font-family:'SA Display';src:url(${bebas}) format('woff2');font-display:swap}
@font-face{font-family:'SA Mono';src:url(${chakraM}) format('woff2');font-weight:500;font-display:swap}
@font-face{font-family:'SA Mono';src:url(${chakraB}) format('woff2');font-weight:700;font-display:swap}
:root{
  --ink:#0A0D13; --ink2:#11161F; --ink3:#1A212D; --bone:#ECE6DC; --ash:#8B93A1; --ash2:#5B6472;
  --burn:#FF4B3A; --burn2:#FF7A45; --pink:#FF3D8B; --amber:#FFB23D; --sky:#4FD8FF; --ok:#3DFFA8; --line:rgba(236,230,220,.14); --line2:rgba(236,230,220,.32);
  --dusk:linear-gradient(100deg,#FF3D8B 0%,#FF6A4A 45%,#FFB23D 100%);
  --fd:'SA Display','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;
  --fm:'SA Mono','Apple SD Gothic Neo','Noto Sans KR',monospace;
  --fk:'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;
  --ease:cubic-bezier(.16,1,.3,1); --cut:14px;
  --cy:var(--sky); --am:var(--amber); --rd:var(--burn); --gn:var(--ok);
  --sat:env(safe-area-inset-top,0px); --sab:env(safe-area-inset-bottom,0px); --sal:env(safe-area-inset-left,0px); --sar:env(safe-area-inset-right,0px);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;padding:0}
#ui{position:fixed;inset:0;pointer-events:none;font-family:var(--fk);color:var(--bone);z-index:10;-webkit-font-smoothing:antialiased}
#ui .scr{position:absolute;inset:0;pointer-events:auto;display:none}
#ui .scr.show{display:block}
.cut{clip-path:polygon(0 0,calc(100% - var(--cut)) 0,100% var(--cut),100% 100%,var(--cut) 100%,0 calc(100% - var(--cut)))}
.cut-s{--cut:8px}
.d{font-family:var(--fd);font-weight:400;letter-spacing:.04em;text-transform:uppercase;line-height:.9}
.m{font-family:var(--fm);font-variant-numeric:tabular-nums}
.k{font-family:var(--fk);font-weight:800}
.dim{color:var(--ash)}
.tag{display:inline-flex;align-items:center;gap:6px;font-family:var(--fm);font-weight:700;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ash)}
.tag::before{content:'';width:6px;height:6px;background:var(--burn)}

/* ---------- motion ---------- */
@keyframes in-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes in-left{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:none}}
@keyframes in-right{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:none}}
@keyframes reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes wipe{0%{transform:translateX(-120%) skewX(-18deg)}45%,55%{transform:translateX(0) skewX(-18deg)}100%{transform:translateX(120%) skewX(-18deg)}}
@keyframes slam{0%{opacity:0;transform:scale(1.7);filter:blur(14px)}60%{opacity:1;transform:scale(.97);filter:blur(0)}100%{transform:scale(1)}}
@keyframes pop{0%{transform:scale(0) rotate(-30deg);opacity:0}70%{transform:scale(1.3) rotate(6deg);opacity:1}100%{transform:none}}
@keyframes shine{from{background-position:-200% 0}to{background-position:200% 0}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes scan{from{transform:translateY(-100%)}to{transform:translateY(400%)}}
@keyframes lb-in{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes banner-in{0%{clip-path:inset(0 100% 0 0)}100%{clip-path:inset(0 0 0 0)}}
@keyframes ring{from{transform:scale(.6);opacity:.9}to{transform:scale(1.6);opacity:0}}
.st>*{animation:in-up .5s var(--ease) both}
.st>*:nth-child(1){animation-delay:.04s}.st>*:nth-child(2){animation-delay:.09s}.st>*:nth-child(3){animation-delay:.14s}.st>*:nth-child(4){animation-delay:.19s}.st>*:nth-child(5){animation-delay:.24s}.st>*:nth-child(6){animation-delay:.29s}.st>*:nth-child(7){animation-delay:.34s}.st>*:nth-child(8){animation-delay:.39s}.st>*:nth-child(9){animation-delay:.44s}.st>*:nth-child(n+10){animation-delay:.48s}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}

/* ---------- transition wipe ---------- */
.wipe{position:fixed;inset:-10% -30%;z-index:40;pointer-events:none;display:none}
.wipe.go{display:block}
.wipe i{position:absolute;inset:0;animation:wipe .62s cubic-bezier(.7,0,.3,1) both}
.wipe i:nth-child(1){background:var(--burn)}
.wipe i:nth-child(2){background:var(--ink);animation-delay:.05s}

/* ---------- backdrops ---------- */
.shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(6,8,12,.92) 0%,rgba(6,8,12,.55) 34%,rgba(6,8,12,0) 62%),linear-gradient(0deg,rgba(6,8,12,.85) 0%,rgba(6,8,12,0) 32%),linear-gradient(180deg,rgba(6,8,12,.6) 0%,rgba(6,8,12,0) 20%)}
.shade.full{background:rgba(6,8,12,.72)}
.hatch{position:absolute;pointer-events:none;background:repeating-linear-gradient(-45deg,rgba(236,230,220,.07) 0 2px,transparent 2px 9px)}

/* ---------- top bar ---------- */
.top{position:absolute;left:0;right:0;top:0;height:calc(64px + var(--sat));background:linear-gradient(180deg,rgba(6,8,12,.8),rgba(6,8,12,0));padding:calc(12px + var(--sat)) calc(20px + var(--sar)) 0 calc(20px + var(--sal));display:flex;align-items:center;gap:16px;z-index:3}
.logo{display:flex;align-items:baseline;gap:10px}
.logo b{font-family:var(--fd);font-weight:400;font-size:30px;letter-spacing:.06em;line-height:1}
.logo span{font-family:var(--fm);font-weight:700;font-size:10px;letter-spacing:.42em;color:var(--burn)}
.top .sp{flex:1}
.pilot{display:flex;align-items:center;gap:12px}
.pilot .av{width:38px;height:38px;background:var(--dusk);display:grid;place-items:center;font-family:var(--fd);font-size:20px;color:var(--ink)}
.pilot .nm{font-family:var(--fd);font-size:20px;letter-spacing:.06em;line-height:1}
.pilot .rk{font-family:var(--fm);font-size:10px;letter-spacing:.2em;color:var(--ash)}
.chipstat{display:flex;align-items:center;gap:6px;padding:7px 12px;background:rgba(10,13,19,.55);border:1px solid var(--line);font-family:var(--fm);font-weight:700;font-size:13px}
.chipstat svg{width:14px;height:14px;fill:var(--amber)}
.ibtn{width:40px;height:40px;display:grid;place-items:center;background:rgba(10,13,19,.55);border:1px solid var(--line);transition:all .2s var(--ease)}
.ibtn:hover,.ibtn:focus-visible{border-color:var(--bone);background:rgba(236,230,220,.1)}
.ibtn svg{width:18px;height:18px;stroke:var(--bone);fill:none;stroke-width:1.8}
.back{display:flex;align-items:center;gap:10px;padding:0 14px 0 8px;height:40px;background:rgba(10,13,19,.6);border:1px solid var(--line2);font-family:var(--fm);font-weight:700;font-size:12px;letter-spacing:.16em}
.back svg{width:16px;height:16px;stroke:var(--bone);fill:none;stroke-width:2}
.back:hover{border-color:var(--burn);color:var(--burn)} .back:hover svg{stroke:var(--burn)}
.ttl{display:flex;flex-direction:column}
.ttl .d{font-size:34px}
.ttl small{font-family:var(--fk);font-weight:700;font-size:11.5px;color:var(--ash);letter-spacing:.06em;margin-top:2px}

/* ---------- tabs (GTA-style strip) ---------- */
.tabs{position:relative;display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:18px;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{position:relative;padding:12px 18px 13px;font-family:var(--fd);font-size:21px;letter-spacing:.08em;color:var(--ash);white-space:nowrap;transition:color .2s}
.tab small{font-family:var(--fk);font-size:10.5px;font-weight:700;margin-left:6px;letter-spacing:0}
.tab.on{color:var(--bone)}
.tab:hover{color:var(--bone)}
.tabs .ul{position:absolute;bottom:0;height:3px;background:var(--burn);transition:transform .4s var(--ease),width .4s var(--ease);left:0}

/* ---------- main menu ---------- */
.home-nav{position:absolute;left:calc(28px + var(--sal));top:50%;transform:translateY(-46%);display:flex;flex-direction:column;gap:0;z-index:2}
.hn{position:relative;display:flex;align-items:center;gap:16px;padding:8px 24px 8px 0;text-align:left;animation:in-left .6s var(--ease) both}
.hn .ix{font-family:var(--fm);font-weight:700;font-size:11px;color:var(--ash2);width:22px;letter-spacing:.06em;transition:color .25s}
.hn .tx{display:flex;flex-direction:column}
.hn .d{font-size:clamp(38px,5.6vw,64px);color:rgba(236,230,220,.62);transition:color .25s,transform .35s var(--ease);transform-origin:left center}
.hn .kr{font-family:var(--fk);font-weight:800;font-size:12px;color:var(--ash);letter-spacing:.08em;max-height:0;overflow:hidden;opacity:0;transition:all .35s var(--ease)}
.hn::after{content:'';position:absolute;left:38px;right:0;bottom:6px;height:3px;background:var(--burn);transform:scaleX(0);transform-origin:left;transition:transform .35s var(--ease)}
.hn:hover .d,.hn:focus-visible .d,.hn.sel .d{color:var(--bone);transform:translateX(8px)}
.hn:hover .ix,.hn.sel .ix{color:var(--burn)}
.hn:hover .kr,.hn.sel .kr{max-height:20px;opacity:1;transform:translateX(8px)}
.hn:hover::after,.hn.sel::after{transform:scaleX(.35)}
.feature{position:absolute;right:calc(26px + var(--sar));bottom:calc(26px + var(--sab));width:min(400px,40vw);background:linear-gradient(150deg,rgba(17,22,31,.94),rgba(10,13,19,.94));border:1px solid var(--line);padding:18px 20px 20px;animation:in-right .7s .2s var(--ease) both;z-index:2}
.feature .bar{position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--dusk)}
.feature .d{font-size:36px;margin:6px 0 4px}
.feature p{margin:0 0 14px;font-size:12.5px;color:var(--ash);line-height:1.55}
.feature .meta{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.pill{font-family:var(--fm);font-weight:700;font-size:10.5px;letter-spacing:.1em;padding:4px 8px;border:1px solid var(--line2);color:var(--bone);text-transform:uppercase}
.pill.hot{border-color:var(--burn);color:var(--burn)}
.cta{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:12px;height:52px;padding:0 28px;background:var(--burn);color:var(--ink);font-family:var(--fd);font-size:24px;letter-spacing:.1em;overflow:hidden;transition:transform .2s var(--ease),filter .2s}
.cta::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.45) 50%,transparent 70%);background-size:220% 100%;animation:shine 2.8s linear infinite}
.cta:hover{filter:brightness(1.08);transform:translateY(-2px)} .cta:active{transform:scale(.97)}
.cta svg{width:16px;height:16px;fill:var(--ink)}
.cta.full{width:100%}
.cta.ghost{background:transparent;color:var(--bone);border:1px solid var(--line2)} .cta.ghost::after{display:none} .cta.ghost:hover{border-color:var(--bone)}
.cta.sm{height:42px;font-size:19px;padding:0 18px}
.home-stats{position:absolute;left:calc(28px + var(--sal));bottom:calc(22px + var(--sab));display:flex;gap:26px;z-index:2;animation:in-up .6s .4s var(--ease) both}
.hs .m{font-weight:700;font-size:22px;line-height:1}
.hs span{display:block;font-family:var(--fk);font-weight:700;font-size:10px;color:var(--ash);letter-spacing:.1em;margin-top:4px}
.home-ac{position:absolute;right:calc(28px + var(--sar));top:calc(78px + var(--sat));text-align:right;z-index:2;animation:in-right .6s .1s var(--ease) both}
.home-ac .d{font-size:42px}
.home-ac small{display:block;font-family:var(--fk);font-weight:700;font-size:11px;color:var(--ash);margin-top:4px}

/* ---------- page shell ---------- */
.page{position:absolute;left:0;right:0;top:calc(70px + var(--sat));bottom:0;overflow:auto;padding:6px calc(24px + var(--sar)) calc(28px + var(--sab)) calc(24px + var(--sal));-webkit-overflow-scrolling:touch;z-index:2}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card{position:relative;text-align:left;padding:18px 18px 16px;background:linear-gradient(160deg,rgba(26,33,45,.92),rgba(10,13,19,.92));border:1px solid var(--line);overflow:hidden;transition:transform .3s var(--ease),border-color .2s;min-height:150px}
.card .wm{position:absolute;right:-6px;bottom:-18px;font-family:var(--fd);font-size:120px;color:rgba(236,230,220,.05);line-height:1;pointer-events:none}
.card .acc{position:absolute;left:0;top:0;height:3px;width:100%;background:var(--burn);transform:scaleX(0);transform-origin:left;transition:transform .35s var(--ease)}
.card:hover,.card:focus-visible{transform:translateY(-4px);border-color:var(--line2)} .card:hover .acc{transform:scaleX(1)}
.card .d{font-size:30px;margin:8px 0 2px}
.card .kt{font-family:var(--fk);font-weight:800;font-size:16px}
.card .sb{font-size:12px;color:var(--ash);margin-top:3px}
.card .meta{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}
.stars{display:inline-flex;gap:3px}
.stars i{width:12px;height:12px;background:var(--ash2);clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.stars i.on{background:var(--amber)}
.card .stars{position:absolute;right:14px;top:16px}
.done-badge{position:absolute;right:14px;bottom:14px;font-family:var(--fm);font-weight:700;font-size:10px;letter-spacing:.14em;color:var(--ok)}

/* ---------- briefing ---------- */
.brief{position:absolute;right:calc(24px + var(--sar));top:calc(78px + var(--sat));bottom:calc(24px + var(--sab));width:min(460px,44vw);display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(17,22,31,.95),rgba(10,13,19,.95));border:1px solid var(--line);z-index:2;animation:in-right .55s var(--ease) both}
.brief .hd{padding:20px 22px 14px;border-bottom:1px solid var(--line);position:relative}
.brief .hd .d{font-size:46px;margin-top:6px}
.brief .hd .k{font-size:17px;margin-top:2px}
.brief{overflow:auto} .brief .bd{flex:1 0 auto;padding:16px 22px}
.brief p{margin:0 0 14px;color:var(--ash);font-size:13px;line-height:1.65}
.conds{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:16px}
.conds div{background:var(--ink2);padding:9px 10px}
.conds b{display:block;font-family:var(--fm);font-weight:700;font-size:14px}
.conds span{font-size:10px;color:var(--ash);letter-spacing:.08em}
.obj{display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;font-weight:700}
.obj .n{font-family:var(--fm);font-weight:700;font-size:11px;color:var(--ink);background:var(--bone);min-width:22px;height:18px;display:grid;place-items:center}
.tips{margin:14px 0 0;padding:0;list-style:none}
.tips li{position:relative;padding-left:16px;font-size:12px;color:var(--ash);line-height:1.7}
.tips li::before{content:'';position:absolute;left:0;top:8px;width:7px;height:2px;background:var(--burn)}
.brief .ft{position:sticky;bottom:0;background:var(--ink2);padding:14px 22px 18px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.acsel{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.acsel button{flex:none;padding:8px 12px;border:1px solid var(--line);font-family:var(--fd);font-size:18px;letter-spacing:.06em;color:var(--ash);transition:all .2s}
.acsel button.on{border-color:var(--bone);color:var(--bone);background:rgba(236,230,220,.08);box-shadow:inset 0 -3px 0 var(--burn)}

/* ---------- hangar ---------- */
.hg{position:absolute;inset:calc(70px + var(--sat)) 0 0 0;pointer-events:none;z-index:2}
.hg>*{pointer-events:auto}
.hg-list{position:absolute;left:calc(24px + var(--sal));top:8px;bottom:calc(24px + var(--sab));width:250px;display:flex;flex-direction:column;gap:6px;overflow:auto;scrollbar-width:none}
.hgi{position:relative;flex:none;text-align:left;padding:11px 14px;background:rgba(10,13,19,.7);border:1px solid var(--line);transition:all .25s var(--ease);animation:in-left .5s var(--ease) both}
.hgi .r{font-family:var(--fm);font-weight:700;font-size:9.5px;letter-spacing:.16em;color:var(--ash);text-transform:uppercase}
.hgi .d{font-size:26px;margin-top:3px}
.hgi.on{background:rgba(236,230,220,.1);border-color:var(--bone);transform:translateX(6px)}
.hgi.on::before{content:'';position:absolute;left:-1px;top:-1px;bottom:-1px;width:4px;background:var(--burn)}
.hg-info{position:absolute;right:calc(24px + var(--sar));top:8px;bottom:calc(24px + var(--sab));width:min(360px,34vw);display:flex;flex-direction:column;background:linear-gradient(160deg,rgba(17,22,31,.93),rgba(10,13,19,.93));border:1px solid var(--line);animation:in-right .5s var(--ease) both}
.hg-info{overflow:auto} .hg-info .in{flex:1 0 auto;padding:18px 20px}
.hg-info .d.big{font-size:44px}
.hg-info p{font-size:12.5px;color:var(--ash);line-height:1.6;margin:8px 0 14px}
.seg10{display:grid;grid-template-columns:78px 1fr 30px;align-items:center;gap:10px;margin:8px 0;font-size:11px;font-weight:700;color:var(--ash)}
.seg10 .s{display:grid;grid-template-columns:repeat(10,1fr);gap:3px;height:8px}
.seg10 .s i{background:rgba(236,230,220,.1);transform-origin:left}
.seg10 .s i.on{background:var(--bone);animation:bar .4s var(--ease) both}
.seg10 .s i.on.hi{background:var(--burn)}
.seg10 b{font-family:var(--fm);color:var(--bone);text-align:right}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);margin:14px 0}
.specs div{background:var(--ink2);padding:8px 10px}
.specs span{display:block;font-size:10px;color:var(--ash);letter-spacing:.06em}
.specs b{font-family:var(--fm);font-weight:700;font-size:13px}
.livs{display:flex;gap:12px;margin:10px 0 4px;padding-left:4px}
.liv{width:28px;height:28px;transform:rotate(45deg) scale(.86);border:2px solid transparent;transition:all .25s var(--ease)}
.liv.on{border-color:var(--bone);transform:rotate(45deg) scale(1)}
.hg-info .ft{position:sticky;bottom:0;background:var(--ink2);padding:14px 20px 18px;border-top:1px solid var(--line)}
.drag-hint{position:absolute;left:50%;bottom:calc(30px + var(--sab));transform:translateX(-50%);font-family:var(--fm);font-weight:700;font-size:10.5px;letter-spacing:.22em;color:var(--ash);display:flex;align-items:center;gap:10px;pointer-events:none}
.drag-hint::before,.drag-hint::after{content:'';width:40px;height:1px;background:var(--line2)}

/* ---------- forms ---------- */
.panel{background:linear-gradient(160deg,rgba(17,22,31,.92),rgba(10,13,19,.92));border:1px solid var(--line);padding:6px 18px;margin-bottom:12px}
.row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:0}
.row .l{font-weight:800;font-size:13.5px}
.row .l small{display:block;font-weight:500;font-size:11px;color:var(--ash);margin-top:3px;line-height:1.4}
.segc{display:flex;border:1px solid var(--line2);flex-wrap:wrap}
.segc button{padding:8px 13px;font-family:var(--fk);font-weight:800;font-size:12px;color:var(--ash);white-space:nowrap;transition:all .2s;border-right:1px solid var(--line)}
.segc button:last-child{border-right:0}
.segc button.on{background:var(--bone);color:var(--ink)}
.tog{width:50px;height:26px;position:relative;background:rgba(236,230,220,.12);flex:none;clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px);transition:background .25s}
.tog::after{content:'';position:absolute;left:4px;top:4px;width:18px;height:18px;background:var(--ash);transition:transform .3s var(--ease),background .2s}
.tog.on{background:var(--burn)} .tog.on::after{transform:translateX(24px);background:var(--ink)}
input[type=range]{-webkit-appearance:none;appearance:none;width:min(240px,42vw);height:4px;background:linear-gradient(90deg,var(--bone) var(--v,50%),rgba(236,230,220,.16) var(--v,50%));outline:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:22px;background:var(--bone);border:0;clip-path:polygon(0 0,100% 0,100% 70%,50% 100%,0 70%)}
input[type=range]::-moz-range-thumb{width:16px;height:22px;background:var(--bone);border:0;border-radius:0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sec-h{font-family:var(--fd);font-size:22px;letter-spacing:.08em;color:var(--bone);margin:6px 0 2px}

/* ---------- loading ---------- */
.boot{position:absolute;inset:0;background:#05070b;display:grid;place-items:center;overflow:hidden}
.boot .scanl{position:absolute;left:0;right:0;top:0;height:25%;background:linear-gradient(180deg,transparent,rgba(79,216,255,.05),transparent);animation:scan 2.6s linear infinite}
.boot .c{width:min(520px,84vw);text-align:center;position:relative}
.boot .d.lg{font-size:clamp(64px,14vw,120px);animation:reveal 1s var(--ease) both}
.boot .sub{font-family:var(--fm);font-weight:700;letter-spacing:.8em;color:var(--burn);font-size:12px;margin-top:8px;padding-left:.8em;animation:in-up .6s .5s var(--ease) both}
.segbar{display:grid;grid-template-columns:repeat(24,1fr);gap:3px;margin-top:34px;height:6px}
.segbar i{background:rgba(236,230,220,.1);transition:background .2s}
.segbar i.on{background:var(--bone)}
.boot .row2{display:flex;justify-content:space-between;margin-top:10px;font-family:var(--fm);font-weight:700;font-size:11px;letter-spacing:.14em;color:var(--ash)}
.corner{position:absolute;width:26px;height:26px;border-color:var(--line2);border-style:solid;border-width:0}
.corner.tl{left:22px;top:22px;border-left-width:2px;border-top-width:2px}.corner.tr{right:22px;top:22px;border-right-width:2px;border-top-width:2px}
.corner.bl{left:22px;bottom:22px;border-left-width:2px;border-bottom-width:2px}.corner.br{right:22px;bottom:22px;border-right-width:2px;border-bottom-width:2px}
.legal{position:absolute;left:0;right:0;bottom:calc(14px + var(--sab));text-align:center;font-size:10px;color:var(--ash2);letter-spacing:.04em}

/* ---------- pause ---------- */
.pz{position:absolute;inset:0;display:grid;grid-template-columns:minmax(300px,420px) 1fr;background:linear-gradient(90deg,rgba(6,8,12,.94) 0%,rgba(6,8,12,.75) 40%,rgba(6,8,12,.35) 100%)}
.pz .l{padding:calc(40px + var(--sat)) 28px 28px calc(36px + var(--sal));display:flex;flex-direction:column;overflow:auto}
.pz .l .d.big{font-size:84px;animation:reveal .6s var(--ease) both}
.pz .list{display:flex;flex-direction:column;margin-top:18px}
.pz .list .hn .d{font-size:40px}
.pz .r{padding:calc(48px + var(--sat)) calc(36px + var(--sar)) 28px 20px;overflow:auto}
.keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 16px;font-size:11.5px;color:var(--ash)}
.keys b{display:inline-block;min-width:26px;padding:2px 6px;margin-right:6px;border:1px solid var(--line2);font-family:var(--fm);font-weight:700;color:var(--bone);text-align:center}

/* ---------- results ---------- */
.rs{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(6,8,12,.55)}
.lbx{position:absolute;left:0;right:0;height:11%;background:#000;animation:lb-in .6s var(--ease) both;z-index:1}
.lbx.t{top:0;transform-origin:top}.lbx.b{bottom:0;transform-origin:bottom}
.rs .box{position:relative;z-index:2;width:min(720px,calc(100% - 32px));max-height:calc(78% - 10px);overflow:auto;padding:4px 2px}
.rs .big{font-family:var(--fd);font-size:clamp(54px,10vw,104px);letter-spacing:.04em;line-height:.9;animation:slam .7s var(--ease) both}
.rs .big.ok{background:var(--dusk);-webkit-background-clip:text;background-clip:text;color:transparent}
.rs .big.no{color:var(--burn)}
.rs .why{font-weight:800;color:var(--ash);margin-top:6px;animation:in-up .5s .3s var(--ease) both}
.rs .bigstars{display:flex;gap:10px;margin:16px 0 4px}
.rs .bigstars i{width:36px;height:36px;background:rgba(236,230,220,.12);clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.rs .bigstars i.on{background:var(--amber);animation:pop .55s cubic-bezier(.2,.9,.3,1.4) both}
.rs .grid2{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;margin:14px 0}
.grade{width:96px;height:96px;display:grid;place-items:center;font-family:var(--fd);font-size:72px;line-height:1;color:var(--ink);background:var(--dusk);animation:pop .6s .5s cubic-bezier(.2,.9,.3,1.4) both}
.grade.F,.grade.D{background:var(--burn)}
.rtab{width:100%;border-collapse:collapse;margin:8px 0 16px}
.rtab td{padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;animation:in-up .45s var(--ease) both}
.rtab td:nth-child(n+2){text-align:right;font-family:var(--fm);font-weight:700}
.barline{display:inline-block;width:70px;height:4px;background:rgba(236,230,220,.12);vertical-align:middle;margin-left:10px;position:relative}
.barline i{position:absolute;left:0;top:0;bottom:0;background:var(--bone);transform-origin:left;animation:bar .8s .4s var(--ease) both}
.btnrow{display:flex;gap:10px;flex-wrap:wrap}

/* ---------- in-flight overlays ---------- */
.banner{position:absolute;left:calc(22px + var(--sal));top:calc(34% + var(--sat));display:flex;align-items:stretch;pointer-events:none;animation:banner-in .22s var(--ease) both;filter:drop-shadow(0 6px 18px rgba(0,0,0,.5))}
.banner .a{width:6px;background:var(--burn)}
.banner .t{padding:10px 18px 10px 14px;background:rgba(10,13,19,.86);font-family:var(--fd);font-size:28px;letter-spacing:.06em;line-height:1}
.banner .t small{display:block;font-family:var(--fk);font-weight:800;font-size:11px;letter-spacing:.04em;color:var(--ash);margin-top:4px}
.banner.out{transition:opacity .25s,transform .25s;opacity:0;transform:translateX(-20px)}
.feed{position:absolute;right:calc(14px + var(--sar));top:calc(110px + var(--sat));display:flex;flex-direction:column;align-items:flex-end;gap:5px;pointer-events:none}
.feed div{display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(10,13,19,.78);border-right:3px solid var(--burn);font-family:var(--fk);font-weight:800;font-size:12px;animation:in-right .3s var(--ease) both;transition:opacity .4s}
.feed div b{font-family:var(--fm);color:var(--burn)}
.tipbox{position:absolute;left:50%;bottom:calc(31% + var(--sab));transform:translateX(-50%);display:flex;align-items:center;gap:12px;padding:10px 16px;max-width:min(560px,86vw);background:rgba(10,13,19,.82);border-left:3px solid var(--amber);font-size:13px;font-weight:700;pointer-events:none;animation:in-up .4s var(--ease) both}
.tipbox .m{color:var(--amber);font-size:11px;letter-spacing:.16em;flex:none}
.intro{position:absolute;inset:0;pointer-events:none}
.intro .lbx{height:13%}
.intro .card2{position:absolute;left:calc(40px + var(--sal));bottom:calc(17% + var(--sab));animation:in-left .7s .25s var(--ease) both}
.intro .card2 .m{font-weight:700;font-size:12px;letter-spacing:.3em;color:var(--burn)}
.intro .card2 .d{font-size:clamp(54px,9vw,96px)}
.intro .card2 .k{font-size:15px;color:var(--ash)}
.intro.out .lbx{transition:transform .5s var(--ease);transform:scaleY(0)} .intro.out .card2{transition:opacity .4s;opacity:0}
.ap{position:absolute;right:calc(64px + var(--sar));top:calc(56px + var(--sat));width:250px;padding:14px;pointer-events:auto;background:rgba(10,13,19,.9);border:1px solid var(--line);animation:in-up .3s var(--ease) both}
.ap .hh{font-family:var(--fd);font-size:22px;letter-spacing:.1em;color:var(--ok);margin-bottom:8px}
.ap .r{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:7px 0;font-size:12.5px}
.ap .r .v{font-family:var(--fm);font-weight:700;font-size:15px;min-width:64px;text-align:center}
.ap .pm{width:32px;height:30px;background:rgba(236,230,220,.08);font-weight:700;font-family:var(--fm)}
.ap .md{padding:6px 9px;border:1px solid var(--line2);font-family:var(--fm);font-weight:700;letter-spacing:.06em;font-size:12px}
.ap .md.on{background:var(--ok);color:var(--ink);border-color:var(--ok)}
.photo-ui{position:absolute;left:50%;bottom:calc(20px + var(--sab));transform:translateX(-50%);display:flex;gap:10px;pointer-events:auto}
.fps{position:absolute;left:8px;bottom:8px;font:11px monospace;color:#7f8;background:rgba(0,0,0,.4);padding:2px 6px;pointer-events:none}

/* ---------- portrait bottom tab bar ---------- */
.tabbar{position:absolute;left:0;right:0;bottom:0;height:calc(64px + var(--sab));padding-bottom:var(--sab);display:none;grid-template-columns:repeat(5,1fr);background:rgba(8,10,15,.96);border-top:1px solid var(--line);z-index:5;pointer-events:auto}
.tabbar button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-family:var(--fk);font-weight:800;font-size:10px;color:var(--ash)}
.tabbar svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.8}
.tabbar button.on{color:var(--bone)}
.tabbar button.on::before{content:'';position:absolute;top:0;left:30%;right:30%;height:3px;background:var(--burn)}

/* ========== responsive ========== */
@media (max-height:540px) and (orientation:landscape){
  .top{height:calc(52px + var(--sat));padding-top:calc(8px + var(--sat))} .logo b{font-size:24px}
  .ttl .d{font-size:26px} .ttl small{display:none}
  .page{top:calc(56px + var(--sat))}
  .home-nav{top:calc(58px + var(--sat));transform:none} .hn{padding:2px 20px 2px 0} .hn .d{font-size:clamp(30px,8.6vh,44px)}
  .home-stats{display:none} .home-ac{display:none}
  .feature{width:min(330px,40vw);padding:12px 14px 14px} .feature .d{font-size:28px} .feature p{display:none} .feature .meta{margin-bottom:10px}
  .cta{height:44px;font-size:20px}
  .hg{inset:calc(56px + var(--sat)) 0 0 0} .hg-list{width:190px} .hgi{padding:7px 10px} .hgi .d{font-size:20px}
  .hg-info .in{padding:12px 14px} .hg-info .d.big{font-size:32px} .hg-info p{display:none}
  .brief{top:calc(58px + var(--sat));width:min(420px,48vw)} .brief .hd{padding:12px 16px 10px} .brief .hd .d{font-size:32px} .brief .bd{padding:10px 16px} .brief .ft{padding:10px 16px 12px}
  .pz .l .d.big{font-size:56px} .pz .list .hn .d{font-size:30px}
  .rs .big{font-size:56px} .grade{width:72px;height:72px;font-size:52px}
  .banner{top:calc(26% + var(--sat))} .banner .t{font-size:22px}
  .feed{top:calc(96px + var(--sat))}
}
@media (orientation:portrait){
  .tabbar{display:grid}
  .shade{background:linear-gradient(0deg,rgba(6,8,12,.97) 0%,rgba(6,8,12,.86) 46%,rgba(6,8,12,0) 72%),linear-gradient(180deg,rgba(6,8,12,.7) 0%,rgba(6,8,12,0) 18%)}
  .top{padding-left:calc(16px + var(--sal));padding-right:calc(16px + var(--sar))}
  .pilot .nm,.pilot .rk,.hide-p{display:none!important}
  .home-nav{display:none}
  .feature{left:16px;right:16px;width:auto;top:auto;bottom:calc(80px + var(--sab));padding:14px 16px}
  .feature p{display:none} .feature .d{font-size:30px}
  .home-stats{display:none} .home-ac{top:calc(66px + var(--sat));right:16px} .home-ac .d{font-size:28px}
  .page{padding-left:16px;padding-right:16px;bottom:calc(64px + var(--sab));top:calc(66px + var(--sat))}
  .grid{grid-template-columns:1fr}
  .cols{grid-template-columns:1fr}
  .brief{left:12px;right:12px;width:auto;top:40%;bottom:calc(74px + var(--sab))}
  .brief .hd .d{font-size:34px}
  .hg-list{left:0;right:0;top:auto;bottom:auto;top:calc(36vh);width:auto;flex-direction:row;overflow-x:auto;padding:0 12px;height:70px}
  .hgi{min-width:150px;padding:8px 12px} .hgi .d{font-size:20px} .hgi.on{transform:translateY(-3px)}
  .hg-info{left:12px;right:12px;width:auto;top:calc(36vh + 80px);bottom:calc(72px + var(--sab))}
  .hg-info p{display:none} .hg-info .d.big{font-size:32px}
  .drag-hint{display:none}
  .pz{grid-template-columns:1fr} .pz .r{display:none} .pz .l{padding-left:24px}
  .tab{padding:10px 12px;font-size:18px}
  .banner{top:calc(18% + var(--sat))}
  .intro .card2{left:20px;bottom:calc(20% + var(--sab))}
  .ap{right:12px;left:12px;width:auto;top:calc(56px + var(--sat))}
  .tipbox{bottom:calc(46% + var(--sab))}
  .feed{top:calc(150px + var(--sat))}
}

/* ================= touch flight controls ================= */
.fc{position:fixed;inset:0;z-index:5;touch-action:none;user-select:none;-webkit-user-select:none;font-family:var(--fm);color:var(--bone)}
.fc>*{position:absolute}
.fc .zone{bottom:0;top:30%}
.fc .zone.l{left:76px;width:calc(46% - 76px)} .fc .zone.r{right:0;width:54%}
.fc .hint{position:absolute;bottom:calc(20% + var(--sab));left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;opacity:.4;transition:opacity .5s;pointer-events:none}
.fc .hint svg{width:42px;height:42px;stroke:var(--bone);fill:none;stroke-width:1.4}
.fc .hint span{font-weight:700;font-size:10px;letter-spacing:.3em;white-space:nowrap}
.fc .zone.r .hint{left:40%}
.fc .zone.used .hint{opacity:0}
.fl{position:absolute;pointer-events:none;opacity:0;transition:opacity .18s;width:0;height:0}
.fl.on{opacity:1}
.fl .trk{position:absolute;left:0;top:0;transform:translate(-50%,-50%);border:1.5px solid rgba(236,230,220,.45);background:rgba(10,13,19,.22);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.fl.v .trk{width:58px;height:220px;border-radius:29px}
.fl.h .trk{width:240px;height:58px;border-radius:29px}
.fl.s .trk{width:190px;height:190px;border-radius:50%}
.fl .tick{position:absolute;background:rgba(236,230,220,.4)}
.fl.v .tick{width:16px;height:1.5px;margin-left:-8px;left:0} .fl.h .tick{height:16px;width:1.5px;margin-top:-8px;top:0}
.fl.s .tick{width:1.5px;height:12px;margin:-6px 0 0 -1px;left:0;top:0}
.fl .th{position:absolute;left:0;top:0;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:radial-gradient(circle at 50% 40%,rgba(236,230,220,.95),rgba(236,230,220,.75));box-shadow:0 0 0 6px rgba(236,230,220,.12),0 8px 18px rgba(0,0,0,.45);will-change:transform}
.fl .th::after{content:'';position:absolute;inset:16px;border-radius:50%;border:2px solid var(--ink)}
.fl.hot .th{background:radial-gradient(circle at 50% 40%,#fff,var(--burn2));box-shadow:0 0 0 6px rgba(255,75,58,.22),0 8px 18px rgba(0,0,0,.45)}
.fl .lbl{position:absolute;left:0;transform:translateX(-50%);font-weight:700;font-size:9.5px;letter-spacing:.3em;color:rgba(236,230,220,.6);white-space:nowrap}
.fl.v .lbl{top:-134px} .fl.h .lbl{top:-50px} .fl.s .lbl{top:-118px}
.thr{left:calc(10px + var(--sal));bottom:calc(20px + var(--sab));width:56px;height:min(48vh,280px)}
.thr .rail{position:absolute;left:50%;top:0;bottom:0;width:6px;margin-left:-3px;background:rgba(236,230,220,.14)}
.thr .fill{position:absolute;left:50%;bottom:0;top:0;width:6px;margin-left:-3px;background:var(--bone);transform-origin:bottom;transform:scaleY(0)}
.thr .ab{position:absolute;left:50%;top:0;height:14%;width:6px;margin-left:-3px;background:repeating-linear-gradient(0deg,rgba(255,122,69,.7) 0 3px,transparent 3px 6px)}
.thr .det{position:absolute;left:10px;right:10px;height:1.5px;background:rgba(236,230,220,.5)}
.thr .det span{position:absolute;left:100%;margin-left:6px;top:-6px;font-weight:700;font-size:9px;letter-spacing:.12em;color:rgba(236,230,220,.6)}
.thr .kn{position:absolute;left:0;right:0;height:30px;top:-15px;background:linear-gradient(180deg,rgba(236,230,220,.96),rgba(190,184,174,.96));clip-path:polygon(0 30%,10% 0,90% 0,100% 30%,100% 70%,90% 100%,10% 100%,0 70%);display:grid;place-items:center;color:var(--ink);font-weight:700;font-size:11px;will-change:transform}
.thr.ab-on .kn{background:linear-gradient(180deg,#FFB08A,var(--burn))}
.thr .ro{position:absolute;left:-4px;right:-4px;top:-28px;text-align:center;font-weight:700;font-size:12px}
.wpn{right:calc(14px + var(--sar));bottom:calc(34% + var(--sab));display:flex;flex-direction:column;align-items:flex-end;gap:12px}
.rb{position:relative;display:grid;place-items:center;border-radius:50%;border:1.5px solid rgba(236,230,220,.5);background:rgba(10,13,19,.32);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);color:var(--bone);transition:transform .12s,background .15s,border-color .15s}
.rb svg{width:46%;height:46%;stroke:var(--bone);fill:none;stroke-width:1.7}
.rb .q{position:absolute;bottom:-15px;left:50%;transform:translateX(-50%);font-weight:700;font-size:10px;white-space:nowrap;text-shadow:0 1px 3px #000}
.rb.on{transform:scale(.92);background:rgba(236,230,220,.22);border-color:var(--bone)}
.rb.fx::after{content:'';position:absolute;inset:-2px;border-radius:50%;border:2px solid var(--bone);animation:ring .35s ease-out forwards}
.rb.xl{width:78px;height:78px} .rb.lg{width:62px;height:62px} .rb.md{width:48px;height:48px} .rb.sm{width:42px;height:42px}
.rb.gun{border-color:rgba(255,75,58,.75)} .rb.gun.on{background:rgba(255,75,58,.35)}
.rb .ring{position:absolute;inset:-5px;border-radius:50%;background:conic-gradient(var(--c,var(--amber)) calc(var(--p,0)*1turn),transparent 0);-webkit-mask:radial-gradient(circle,transparent calc(50% - 3px),#000 calc(50% - 2px));mask:radial-gradient(circle,transparent calc(50% - 3px),#000 calc(50% - 2px));pointer-events:none}
.rb.lock .ring{--c:var(--burn)}
.rb.empty{opacity:.4}
.ctx{right:calc(14px + var(--sar));top:calc(58px + var(--sat));display:flex;gap:10px;flex-direction:row-reverse;flex-wrap:wrap;max-width:62%;align-items:center}
.ctx .hid{display:none!important}
.ctx .rb.act{border-color:var(--ok);box-shadow:inset 0 0 0 2px rgba(61,255,168,.35)}
.ctx .rb.act svg{stroke:var(--ok)}
.flp{display:flex;align-items:center;border:1.5px solid rgba(236,230,220,.5);background:rgba(10,13,19,.32);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);height:42px}
.flp button{width:36px;height:100%;font-weight:700;font-size:17px}
.flp span{min-width:50px;text-align:center;font-weight:700;font-size:10.5px;letter-spacing:.06em;border-left:1px solid var(--line);border-right:1px solid var(--line);line-height:40px}
.sys{right:calc(14px + var(--sar));top:calc(8px + var(--sat));display:flex;gap:8px}
.sys .sq{width:38px;height:38px;display:grid;place-items:center;background:rgba(10,13,19,.42);border:1px solid rgba(236,230,220,.28);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
.sys .sq svg{width:17px;height:17px;stroke:var(--bone);fill:none;stroke-width:1.8}
.sys .sq.on{border-color:var(--ok)} .sys .sq.on svg{stroke:var(--ok)}
.drawer{right:calc(14px + var(--sar));top:calc(52px + var(--sat));display:none;flex-direction:column;gap:2px;background:rgba(10,13,19,.94);border:1px solid var(--line);padding:6px;min-width:180px;z-index:2}
.drawer.open{display:flex;animation:in-up .2s var(--ease) both}
.drawer button{display:flex;align-items:center;gap:10px;padding:10px;font-family:var(--fk);font-weight:800;font-size:12.5px;text-align:left}
.drawer button:active{background:rgba(236,230,220,.1)}
.drawer svg{width:16px;height:16px;stroke:var(--bone);fill:none;stroke-width:1.8}
.rud{left:50%;bottom:calc(10px + var(--sab));width:min(30vw,180px);height:30px;transform:translateX(-50%);border:1px solid rgba(236,230,220,.3);background:rgba(10,13,19,.25)}
.rud .tk{position:absolute;top:3px;bottom:3px;left:50%;width:22px;margin-left:-11px;background:rgba(236,230,220,.8)}
.rud span{position:absolute;left:50%;top:-15px;transform:translateX(-50%);font-weight:700;font-size:9px;letter-spacing:.3em;color:rgba(236,230,220,.55)}
.calib{left:50%;bottom:calc(52px + var(--sab));transform:translateX(-50%);padding:8px 14px;border:1px solid var(--line2);background:rgba(10,13,19,.5);font-weight:700;font-size:11px;letter-spacing:.14em}
@media (pointer:fine){.fc.desk .zone,.fc.desk .rud,.fc.desk .fl,.fc.desk .wpn,.fc.desk .ctx{display:none}}
@media (max-height:540px) and (orientation:landscape){
  .thr{height:min(52vh,210px)} .wpn{bottom:calc(32% + var(--sab));gap:9px} .rb.xl{width:64px;height:64px} .rb.lg{width:52px;height:52px} .rb.md{width:42px;height:42px} .rb.sm{width:38px;height:38px}
  .ctx{top:calc(52px + var(--sat))} .flp{height:38px}
  .fl.v .trk{height:170px} .fl.v .lbl{top:-108px}
}
@media (orientation:portrait){
  .fc .zone{top:58%}
  .fc .zone.l{left:72px;width:calc(50% - 72px)} .fc .zone.r{width:50%}
  .thr{height:min(30vh,220px)}
  .wpn{bottom:calc(41% + var(--sab));gap:9px} .rb.xl{width:64px;height:64px} .rb.lg{width:52px;height:52px} .rb.md{width:42px;height:42px} .rb.sm{width:40px;height:40px}
  .ctx{max-width:74%}
  .fl.h .trk{width:min(44vw,220px)}
  .fl.v .trk{height:180px} .fl.v .lbl{top:-112px}
}
`;
