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
  --ink:#0A0D13; --ink2:#11161F; --bone:#ECE6DC; --ash:#8D94A0; --ash2:#59616D;
  --burn:#FF4B3A; --amber:#FFB23D; --sky:#4FD8FF; --ok:#3DFFA8; --line:rgba(236,230,220,.13); --line2:rgba(236,230,220,.3);
  --fd:'SA Display','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;
  --fm:'SA Mono','Apple SD Gothic Neo','Noto Sans KR',monospace;
  --fk:'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',system-ui,sans-serif;
  --ease:cubic-bezier(.16,1,.3,1);
  --cy:var(--sky); --am:var(--amber); --rd:var(--burn); --gn:var(--ok);
  --sat:env(safe-area-inset-top,0px); --sab:env(safe-area-inset-bottom,0px); --sal:env(safe-area-inset-left,0px); --sar:env(safe-area-inset-right,0px);
  --gx:calc(28px + var(--sal)); --gr:calc(28px + var(--sar));
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;padding:0;text-align:left}
#ui{position:fixed;inset:0;pointer-events:none;font-family:var(--fk);color:var(--bone);z-index:10;-webkit-font-smoothing:antialiased}
#ui .scr{position:absolute;inset:0;pointer-events:auto;display:none}
#ui .scr.show{display:block}
.d{font-family:var(--fd);font-weight:400;letter-spacing:.03em;text-transform:uppercase;line-height:.88}
.m{font-family:var(--fm);font-variant-numeric:tabular-nums}
.dim{color:var(--ash)}
.eyebrow{font-family:var(--fm);font-weight:700;font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--ash)}
.eyebrow b{color:var(--burn);font-weight:700}
.meta{font-family:var(--fm);font-weight:500;font-size:11px;letter-spacing:.08em;color:var(--ash);text-transform:uppercase}
.meta i{font-style:normal;color:var(--ash2);margin:0 7px}

/* ---------- motion ---------- */
@keyframes in-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes in-left{from{opacity:0;transform:translateX(-28px)}to{opacity:1;transform:none}}
@keyframes in-right{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:none}}
@keyframes reveal{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes wipe{0%{transform:translateX(-120%) skewX(-16deg)}45%,55%{transform:translateX(0) skewX(-16deg)}100%{transform:translateX(120%) skewX(-16deg)}}
@keyframes slam{0%{opacity:0;transform:scale(1.5);filter:blur(12px)}60%{opacity:1;transform:scale(.985);filter:blur(0)}100%{transform:none}}
@keyframes pop{0%{transform:scale(0);opacity:0}70%{transform:scale(1.25);opacity:1}100%{transform:none}}
@keyframes scan{from{transform:translateY(-100%)}to{transform:translateY(400%)}}
@keyframes lb-in{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes ring{from{transform:scale(.6);opacity:.9}to{transform:scale(1.6);opacity:0}}
@keyframes rise{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:none}}
.st>*{animation:in-up .5s var(--ease) both}
.st>*:nth-child(1){animation-delay:.03s}.st>*:nth-child(2){animation-delay:.07s}.st>*:nth-child(3){animation-delay:.11s}.st>*:nth-child(4){animation-delay:.15s}.st>*:nth-child(5){animation-delay:.19s}.st>*:nth-child(6){animation-delay:.23s}.st>*:nth-child(7){animation-delay:.27s}.st>*:nth-child(8){animation-delay:.31s}.st>*:nth-child(n+9){animation-delay:.35s}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
.wipe{position:fixed;inset:-10% -30%;z-index:40;pointer-events:none;display:none}
.wipe.go{display:block}
.wipe i{position:absolute;inset:0;animation:wipe .6s cubic-bezier(.7,0,.3,1) both}
.wipe i:nth-child(1){background:var(--burn)}
.wipe i:nth-child(2){background:var(--ink);animation-delay:.05s}

/* ---------- backdrops (no boxes: content sits on graded shade over the 3D scene) ---------- */
.shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(6,8,12,.9) 0%,rgba(6,8,12,.5) 36%,rgba(6,8,12,0) 64%),linear-gradient(0deg,rgba(6,8,12,.85) 0%,rgba(6,8,12,0) 34%),linear-gradient(180deg,rgba(6,8,12,.65) 0%,rgba(6,8,12,0) 22%)}
.shade.r{background:linear-gradient(270deg,rgba(6,8,12,.94) 0%,rgba(6,8,12,.78) 34%,rgba(6,8,12,0) 62%),linear-gradient(180deg,rgba(6,8,12,.65) 0%,rgba(6,8,12,0) 22%)}
.shade.lr{background:linear-gradient(90deg,rgba(6,8,12,.86) 0%,rgba(6,8,12,.2) 30%,rgba(6,8,12,.2) 62%,rgba(6,8,12,.92) 76%),linear-gradient(180deg,rgba(6,8,12,.65) 0%,rgba(6,8,12,0) 22%)}
.shade.full{background:linear-gradient(180deg,rgba(6,8,12,.9),rgba(6,8,12,.8))}

/* ---------- top bar ---------- */
.top{position:absolute;left:0;right:0;top:0;padding:calc(18px + var(--sat)) var(--gr) 0 var(--gx);display:flex;align-items:center;gap:18px;z-index:3}
.logo{display:flex;align-items:baseline;gap:10px}
.logo b{font-family:var(--fd);font-weight:400;font-size:28px;letter-spacing:.06em;line-height:1}
.logo span{font-family:var(--fm);font-weight:700;font-size:9.5px;letter-spacing:.46em;color:var(--burn)}
.top .sp{flex:1}
.who{display:flex;align-items:baseline;gap:14px;font-family:var(--fm);font-weight:700;font-size:11px;letter-spacing:.18em;color:var(--ash);text-transform:uppercase;white-space:nowrap}
.who b{color:var(--bone);font-weight:700}
.who .st2{color:var(--amber)}
.back{display:flex;align-items:center;gap:8px;height:36px;font-family:var(--fm);font-weight:700;font-size:11px;letter-spacing:.22em;color:var(--ash);transition:color .2s}
.back svg{width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;transition:transform .25s var(--ease)}
.back:hover,.back:focus-visible{color:var(--bone)} .back:hover svg{transform:translateX(-3px)}
.ttl{display:flex;align-items:baseline;gap:14px;min-width:0}
.ttl .d{font-size:30px}
.ttl small{font-family:var(--fk);font-weight:700;font-size:11.5px;color:var(--ash);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.divider{width:1px;height:22px;background:var(--line2)}

/* ---------- tabs: text strip with sliding rule ---------- */
.tabs{position:relative;display:flex;gap:26px;margin:4px 0 18px;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{position:relative;padding:8px 0 10px;font-family:var(--fd);font-size:22px;letter-spacing:.06em;color:var(--ash2);white-space:nowrap;transition:color .2s}
.tab.on,.tab:hover{color:var(--bone)}
.tabs .ul{position:absolute;bottom:0;height:2px;background:var(--burn);transition:transform .45s var(--ease),width .45s var(--ease);left:0}

/* ---------- primary action ---------- */
.cta{position:relative;display:inline-flex;align-items:center;justify-content:space-between;gap:28px;height:54px;padding:0 22px;background:var(--burn);color:var(--ink);font-family:var(--fd);font-size:25px;letter-spacing:.08em;transition:background .2s,transform .2s var(--ease)}
.cta svg{width:18px;height:18px;stroke:var(--ink);fill:none;stroke-width:2.2;transition:transform .25s var(--ease)}
.cta:hover{background:#ff5d4d} .cta:hover svg{transform:translateX(4px)} .cta:active{transform:scale(.98)}
.cta.full{width:100%}
.link{display:inline-flex;align-items:center;gap:10px;height:40px;font-family:var(--fd);font-size:21px;letter-spacing:.08em;color:var(--bone);position:relative}
.link::after{content:'';position:absolute;left:0;right:0;bottom:6px;height:1px;background:var(--line2);transform-origin:left;transition:background .2s}
.link:hover::after{background:var(--bone)}
.link[disabled]{opacity:.3;pointer-events:none}
.actions{display:flex;gap:26px;align-items:center;flex-wrap:wrap}

/* ---------- home ---------- */
.home{position:absolute;left:var(--gx);bottom:calc(30px + var(--sab));right:var(--gr);display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:40px;z-index:2}
.cont .d{font-size:clamp(56px,8.4vw,112px);animation:in-up .7s .1s var(--ease) both}
.cont{position:relative;isolation:isolate}
.cont .kt{font-weight:800;font-size:16px;margin:10px 0 6px;animation:in-up .5s .3s var(--ease) both}
.cont .meta{animation:in-up .5s .35s var(--ease) both}
.cont .cta{margin-top:22px;min-width:240px;animation:in-up .5s .42s var(--ease) both}
.nav{display:flex;flex-direction:column;align-items:flex-end;gap:2px;padding-bottom:4px}
.nv{display:flex;align-items:baseline;gap:12px;padding:5px 0;animation:in-right .55s var(--ease) both}
.nv .d{font-size:clamp(26px,3vw,36px);color:rgba(236,230,220,.55);transition:color .2s,transform .3s var(--ease)}
.nv .ix{font-family:var(--fm);font-weight:700;font-size:10px;color:var(--ash2);letter-spacing:.1em}
.nv .kr{font-weight:700;font-size:11px;color:var(--ash);opacity:0;transform:translateX(6px);transition:all .3s var(--ease)}
.nv:hover .d,.nv:focus-visible .d{color:var(--bone);transform:translateX(-4px)}
.nv:hover .kr,.nv:focus-visible .kr{opacity:1;transform:none}
.nv:hover .ix{color:var(--burn)}
.home-stats{position:absolute;top:calc(64px + var(--sat));left:var(--gx);display:flex;gap:28px;z-index:2;animation:in-up .6s .4s var(--ease) both}
.hs .m{font-weight:700;font-size:20px;line-height:1}
.hs span{display:block;font-family:var(--fm);font-weight:700;font-size:9px;color:var(--ash);letter-spacing:.2em;margin-top:5px}
.home-ac{position:absolute;right:var(--gr);top:calc(64px + var(--sat));text-align:right;z-index:2;animation:in-right .6s .1s var(--ease) both}
.home-ac .d{font-size:30px;margin-top:6px}

/* ---------- page shell ---------- */
.page{position:absolute;left:0;right:0;top:calc(72px + var(--sat));bottom:0;overflow:auto;padding:6px var(--gr) calc(30px + var(--sab)) var(--gx);-webkit-overflow-scrolling:touch;z-index:2;scrollbar-width:thin}
.narrow{max-width:900px}

/* ---------- mission list (rows, not cards) ---------- */
.mlist{border-top:1px solid var(--line)}
.mrow{position:relative;display:grid;grid-template-columns:64px minmax(0,1.1fr) minmax(0,1.3fr) auto;align-items:center;gap:20px;width:100%;padding:16px 4px;border-bottom:1px solid var(--line);transition:background .25s}
.mrow::before{content:'';position:absolute;left:0;top:-1px;height:2px;width:100%;background:var(--burn);transform:scaleX(0);transform-origin:left;transition:transform .45s var(--ease)}
.mrow:hover,.mrow:focus-visible{background:linear-gradient(90deg,rgba(236,230,220,.06),rgba(236,230,220,0))}
.mrow:hover::before{transform:scaleX(1)}
.mrow .n{font-family:var(--fd);font-size:38px;color:var(--ash2);line-height:1;transition:color .2s}
.mrow:hover .n{color:var(--burn)}
.mrow .d{font-size:30px}
.mrow .kt{font-weight:800;font-size:14px;margin-top:4px}
.mrow .sb{font-size:12px;color:var(--ash);margin-bottom:6px}
.mrow .go{width:18px;height:18px;stroke:var(--ash);fill:none;stroke-width:2;transition:transform .3s var(--ease),stroke .2s}
.mrow:hover .go{transform:translateX(4px);stroke:var(--bone)}
.marks{display:inline-flex;gap:4px;vertical-align:middle;margin-right:12px}
.marks i{width:14px;height:3px;background:var(--ash2)}
.marks i.on{background:var(--amber)}
.mrow .r{display:flex;align-items:center;gap:6px}

/* ---------- briefing (right column on shade) ---------- */
.brief{position:absolute;right:var(--gr);top:calc(76px + var(--sat));bottom:calc(24px + var(--sab));width:min(440px,42vw);display:flex;flex-direction:column;z-index:2;animation:in-right .55s var(--ease) both}
.brief .sc{flex:1;overflow:auto;padding-right:6px;scrollbar-width:none}
.brief .sc::-webkit-scrollbar{display:none}
.brief .d.big{font-size:clamp(48px,6vw,78px);margin:8px 0 4px}
.brief .kt{font-weight:800;font-size:17px}
.brief p{margin:14px 0 18px;color:var(--ash);font-size:13.5px;line-height:1.7}
.facts{display:flex;gap:28px;margin:18px 0 4px}
.facts div span{display:block;font-family:var(--fm);font-weight:700;font-size:9.5px;letter-spacing:.22em;color:var(--ash)}
.facts div b{font-family:var(--fm);font-weight:700;font-size:16px}
.hdr2{font-family:var(--fm);font-weight:700;font-size:10px;letter-spacing:.26em;color:var(--ash);margin:20px 0 6px;text-transform:uppercase}
.obj{display:grid;grid-template-columns:30px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--line);font-size:13.5px;font-weight:700;line-height:1.45}
.obj .n{font-family:var(--fm);font-weight:700;font-size:12px;color:var(--burn)}
.tips{margin:0;padding:0;list-style:none}
.tips li{padding:6px 0 6px 18px;position:relative;font-size:12.5px;color:var(--ash);line-height:1.6}
.tips li::before{content:'—';position:absolute;left:0;color:var(--ash2)}
.brief .ft{padding-top:16px;display:flex;flex-direction:column;gap:14px}
.choose{display:flex;gap:20px;overflow-x:auto;scrollbar-width:none}
.choose button{position:relative;flex:none;padding:4px 0 8px;font-family:var(--fd);font-size:21px;letter-spacing:.05em;color:var(--ash2);transition:color .2s}
.choose button.on{color:var(--bone)}
.choose button.on::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--burn);animation:bar .4s var(--ease) both;transform-origin:left}

/* ---------- hangar ---------- */
.hg{position:absolute;inset:calc(72px + var(--sat)) 0 0 0;pointer-events:none;z-index:2}
.hg>*{pointer-events:auto}
.hg-list{position:absolute;left:var(--gx);top:10px;bottom:calc(24px + var(--sab));width:230px;display:flex;flex-direction:column;overflow:auto;scrollbar-width:none}
.hgi{position:relative;flex:none;padding:10px 0 10px 16px;border-left:1px solid var(--line);transition:border-color .25s;animation:in-left .5s var(--ease) both}
.hgi .r{font-weight:700;font-size:10.5px;color:var(--ash);transition:color .2s}
.hgi .d{font-size:24px;margin-top:4px;color:rgba(236,230,220,.5);transition:color .25s,transform .3s var(--ease)}
.hgi:hover .d{color:var(--bone)}
.hgi.on{border-left:2px solid var(--burn);padding-left:15px}
.hgi.on .d{color:var(--bone);transform:translateX(4px)} .hgi.on .r{color:var(--burn)}
.hg-info{position:absolute;right:var(--gr);top:10px;bottom:calc(24px + var(--sab));width:min(360px,34vw);display:flex;flex-direction:column;animation:in-right .5s var(--ease) both}
.hg-info .in{flex:1;overflow:auto;scrollbar-width:none}
.hg-info .in::-webkit-scrollbar{display:none}
.hg-info .d.big{font-size:52px;margin-top:6px}
.hg-info p{font-size:12.5px;color:var(--ash);line-height:1.65;margin:10px 0 16px}
.statl{display:grid;grid-template-columns:86px 1fr 28px;align-items:center;gap:12px;margin:9px 0;font-family:var(--fm);font-weight:700;font-size:10px;letter-spacing:.16em;color:var(--ash)}
.statl .t{position:relative;height:2px;background:var(--line)}
.statl .t i{position:absolute;left:0;right:0;top:-1px;height:4px;background:var(--bone);transform-origin:left;animation:bar .7s var(--ease) both}
.statl .t i.hi{background:var(--burn)}
.statl b{color:var(--bone);text-align:right}
.dl{display:grid;grid-template-columns:1fr 1fr;column-gap:22px;margin:16px 0}
.dl div{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-bottom:1px solid var(--line)}
.dl span{font-family:var(--fm);font-weight:700;font-size:9.5px;letter-spacing:.16em;color:var(--ash)}
.dl b{font-family:var(--fm);font-weight:700;font-size:12.5px}
.livs{display:flex;gap:14px;margin:12px 0 2px;align-items:center}
.liv{width:22px;height:22px;border-radius:50%;box-shadow:0 0 0 1px var(--line2);transition:box-shadow .25s,transform .25s var(--ease)}
.liv.on{box-shadow:0 0 0 2px var(--ink),0 0 0 3.5px var(--bone);transform:scale(1.1)}
.hg-info .ft{padding-top:16px}
.drag-hint{position:absolute;left:50%;bottom:calc(30px + var(--sab));transform:translateX(-50%);font-family:var(--fm);font-weight:700;font-size:10px;letter-spacing:.3em;color:var(--ash2);pointer-events:none}

/* ---------- form rows ---------- */
.sect{margin-bottom:26px}
.sect h3{margin:0 0 4px;font-family:var(--fd);font-weight:400;font-size:22px;letter-spacing:.06em}
.row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 0;border-bottom:1px solid var(--line)}
.row .l{font-weight:800;font-size:13.5px;min-width:0}
.row .l small{display:block;font-weight:500;font-size:11px;color:var(--ash);margin-top:3px;line-height:1.45}
.row.stack{flex-direction:column;align-items:flex-start;gap:10px}
.opts{display:flex;gap:4px 18px;flex-wrap:wrap}
.opts button{position:relative;padding:4px 0 7px;font-weight:800;font-size:12.5px;color:var(--ash);white-space:nowrap;transition:color .2s}
.opts button:hover{color:var(--bone)}
.opts button.on{color:var(--bone)}
.opts button.on::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--burn)}
.tog{width:44px;height:24px;position:relative;flex:none;border-radius:12px;background:rgba(236,230,220,.14);transition:background .25s}
.tog::after{content:'';position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:var(--ash);transition:transform .3s var(--ease),background .2s}
.tog.on{background:var(--burn)} .tog.on::after{transform:translateX(20px);background:var(--bone)}
input[type=range]{-webkit-appearance:none;appearance:none;width:min(220px,40vw);height:2px;background:linear-gradient(90deg,var(--bone) var(--v,50%),rgba(236,230,220,.16) var(--v,50%));outline:none;flex:none}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:var(--bone);border:3px solid var(--ink);box-shadow:0 0 0 1px var(--bone)}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--bone);border:3px solid var(--ink)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0 44px}

/* ---------- loading ---------- */
.boot{position:absolute;inset:0;background:#05070b;display:grid;place-items:center;overflow:hidden}
.boot .scanl{position:absolute;left:0;right:0;top:0;height:25%;background:linear-gradient(180deg,transparent,rgba(79,216,255,.04),transparent);animation:scan 2.8s linear infinite}
.boot .c{width:min(480px,84vw)}
.boot .d.lg{font-size:clamp(64px,14vw,118px);animation:reveal 1s var(--ease) both}
.boot .sub{font-family:var(--fm);font-weight:700;letter-spacing:.7em;color:var(--burn);font-size:11px;margin-top:10px;animation:in-up .6s .5s var(--ease) both}
.prog{position:relative;height:2px;background:rgba(236,230,220,.1);margin-top:40px;overflow:hidden}
.prog i{position:absolute;left:0;top:0;bottom:0;width:100%;background:var(--bone);transform-origin:left;transform:scaleX(0);transition:transform .3s var(--ease)}
.boot .row2{display:flex;justify-content:space-between;margin-top:12px;font-family:var(--fm);font-weight:700;font-size:10.5px;letter-spacing:.16em;color:var(--ash)}
.legal{position:absolute;left:0;right:0;bottom:calc(16px + var(--sab));text-align:center;font-size:10px;color:var(--ash2);letter-spacing:.04em}

/* ---------- pause ---------- */
.pz{position:absolute;inset:0;display:grid;grid-template-columns:minmax(280px,420px) 1fr;background:linear-gradient(90deg,rgba(6,8,12,.95) 0%,rgba(6,8,12,.78) 42%,rgba(6,8,12,.4) 100%)}
.pz .l{padding:calc(40px + var(--sat)) 24px 28px var(--gx);display:flex;flex-direction:column;overflow:auto}
.pz .l .d.big{font-size:80px;animation:reveal .6s var(--ease) both}
.pz .list{display:flex;flex-direction:column;margin-top:22px}
.pz .nv{align-self:flex-start}
.pz .nv .d{font-size:40px}
.pz .nv:hover .d{transform:translateX(4px)}
.pz .r{padding:calc(48px + var(--sat)) var(--gr) 28px 20px;overflow:auto}
.keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 18px;font-size:12px;color:var(--ash)}
.keys div{display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--line)}
.keys b{min-width:46px;font-family:var(--fm);font-weight:700;color:var(--bone)}

/* ---------- results ---------- */
.rs{position:absolute;inset:0;display:flex;align-items:center;background:linear-gradient(90deg,rgba(6,8,12,.9),rgba(6,8,12,.55) 60%,rgba(6,8,12,.3))}
.lbx{position:absolute;left:0;right:0;height:9%;background:#000;animation:lb-in .6s var(--ease) both;z-index:1}
.lbx.t{top:0;transform-origin:top}.lbx.b{bottom:0;transform-origin:bottom}
.rs .box{position:relative;z-index:2;margin-left:var(--gx);width:min(620px,calc(100% - 56px));max-height:80%;overflow:auto;scrollbar-width:none}
.rs .box::-webkit-scrollbar{display:none}
.rs .big{font-size:clamp(56px,9vw,100px);animation:slam .7s var(--ease) both}
.rs .big.no{color:var(--burn)}
.rs .why{font-weight:800;color:var(--ash);margin-top:10px;animation:in-up .5s .3s var(--ease) both}
.rs .stars3{display:flex;gap:8px;margin:18px 0 6px}
.rs .stars3 i{width:44px;height:4px;background:rgba(236,230,220,.14)}
.rs .stars3 i.on{background:var(--amber);animation:pop .5s cubic-bezier(.2,.9,.3,1.4) both;transform-origin:left}
.grade{display:flex;align-items:flex-end;gap:18px;margin:18px 0 4px}
.grade .g{font-family:var(--fd);font-size:110px;line-height:.8;animation:pop .6s .5s cubic-bezier(.2,.9,.3,1.4) both}
.grade .g.F,.grade .g.D{color:var(--burn)} .grade .g.S,.grade .g.A{color:var(--amber)}
.rtab{width:100%;border-collapse:collapse;margin:10px 0 18px}
.rtab td{padding:9px 0;border-bottom:1px solid var(--line);font-size:13px;animation:in-up .45s var(--ease) both}
.rtab td:nth-child(n+2){text-align:right;font-family:var(--fm);font-weight:700}
.barline{display:inline-block;width:64px;height:2px;background:rgba(236,230,220,.14);vertical-align:middle;margin-left:12px;position:relative}
.barline i{position:absolute;left:0;top:-1px;height:4px;width:100%;background:var(--bone);transform-origin:left;animation:bar .8s .4s var(--ease) both}

/* ---------- in-flight overlays (type on scene, no boxes) ---------- */
.banner{position:absolute;left:50%;top:calc(24% + var(--sat));transform:translateX(-50%);text-align:center;pointer-events:none;animation:in-up .25s var(--ease) both;text-shadow:0 2px 14px rgba(0,0,0,.7)}
.banner .t{font-family:var(--fd);font-size:44px;letter-spacing:.08em;line-height:1}
.banner .a{display:block;height:2px;width:100%;margin:6px auto 0;background:var(--burn);transform-origin:center;animation:bar .35s var(--ease) both}
.banner small{display:block;font-weight:800;font-size:12px;letter-spacing:.04em;color:var(--bone);opacity:.8;margin-top:6px}
.banner.out{transition:opacity .3s,transform .3s;opacity:0;transform:translate(-50%,-8px)}
.feed{position:absolute;right:var(--gr);bottom:calc(46% + var(--sab));display:flex;flex-direction:column;align-items:flex-end;gap:3px;pointer-events:none;text-shadow:0 1px 8px rgba(0,0,0,.8)}
.feed div{display:flex;align-items:baseline;gap:8px;font-weight:800;font-size:12.5px;animation:in-right .3s var(--ease) both;transition:opacity .4s}
.feed div b{font-family:var(--fm);font-weight:700;font-size:10px;letter-spacing:.18em;color:var(--burn)}
.tipbox{position:absolute;left:50%;top:calc(15% + var(--sat));transform:translateX(-50%);max-width:min(520px,82vw);text-align:center;font-size:13px;font-weight:700;pointer-events:none;animation:in-up .4s var(--ease) both;text-shadow:0 1px 10px rgba(0,0,0,.85)}
.tipbox .m{display:block;color:var(--amber);font-size:9.5px;letter-spacing:.3em;margin-bottom:4px}
.intro{position:absolute;inset:0;pointer-events:none}
.intro .lbx{height:12%}
.intro .card2{position:absolute;left:var(--gx);bottom:calc(16% + var(--sab));animation:in-left .7s .25s var(--ease) both}
.intro .card2 .m{font-weight:700;font-size:11px;letter-spacing:.34em;color:var(--burn)}
.intro .card2 .d{font-size:clamp(52px,9vw,96px);margin:6px 0}
.intro .card2 .k{font-weight:800;font-size:15px;color:var(--bone);opacity:.8}
.intro.out .lbx{transition:transform .5s var(--ease);transform:scaleY(0)} .intro.out .card2{transition:opacity .4s;opacity:0}
.ap{position:absolute;right:var(--gr);top:calc(104px + var(--sat));width:240px;padding:14px 16px;pointer-events:auto;background:rgba(8,11,16,.88);animation:in-up .3s var(--ease) both}
.ap .hh{font-family:var(--fm);font-weight:700;font-size:10px;letter-spacing:.3em;color:var(--ok);margin-bottom:6px}
.ap .r{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12px}
.ap .r:last-of-type{border:0}
.ap .r .v{font-family:var(--fm);font-weight:700;font-size:14px;min-width:70px;text-align:center}
.ap .pm{width:28px;height:28px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line2);font-weight:700;font-family:var(--fm);text-align:center}
.ap .md{font-family:var(--fm);font-weight:700;letter-spacing:.1em;font-size:11.5px;color:var(--ash);padding:4px 0}
.ap .md.on{color:var(--ok)}
.photo-ui{position:absolute;left:50%;bottom:calc(24px + var(--sab));transform:translateX(-50%);display:flex;gap:28px;pointer-events:auto}
.fps{position:absolute;left:8px;bottom:8px;font:11px monospace;color:#7f8;background:rgba(0,0,0,.4);padding:2px 6px;pointer-events:none}

/* ========== responsive ========== */
@media (max-height:540px) and (orientation:landscape){
  :root{--gx:calc(20px + var(--sal));--gr:calc(20px + var(--sar))}
  .top{padding-top:calc(12px + var(--sat))} .logo b{font-size:22px} .ttl .d{font-size:24px} .ttl small{display:none}
  .page{top:calc(52px + var(--sat))}
  .home{bottom:calc(16px + var(--sab));gap:24px}
  .cont .d{font-size:clamp(40px,13vh,64px)} .cont .kt{margin:4px 0 2px;font-size:13px} .launch{margin-top:10px} .play{height:48px} .play .tri{width:48px} .play .lbl{font-size:24px} .quick{margin-top:10px} .hero .ghost{font-size:clamp(110px,34vh,180px)}
  .nv{padding:2px 0} .nv .d{font-size:clamp(22px,6.4vh,30px)}
  .home-stats,.home-ac{display:none}
  .hg{inset:calc(54px + var(--sat)) 0 0 0} .hg-list{width:180px} .hgi{padding:6px 0 6px 14px} .hgi .d{font-size:19px}
  .hg-info .d.big{font-size:36px} .hg-info p{display:none}
  .brief{top:calc(56px + var(--sat));width:min(400px,50vw)} .brief .d.big{font-size:44px} .brief p{margin:8px 0 10px}
  .pz .l .d.big{font-size:54px} .pz .nv .d{font-size:28px}
  .rs .big{font-size:52px} .grade .g{font-size:76px}
  .banner{top:calc(20% + var(--sat))} .banner .t{font-size:32px}
  .tipbox{top:calc(22% + var(--sat))}
}
@media (orientation:portrait){
  :root{--gx:calc(20px + var(--sal));--gr:calc(20px + var(--sar))}
  .shade,.shade.r,.shade.lr{background:linear-gradient(0deg,rgba(6,8,12,.97) 0%,rgba(6,8,12,.9) 42%,rgba(6,8,12,0) 66%),linear-gradient(180deg,rgba(6,8,12,.7) 0%,rgba(6,8,12,0) 18%)}
  .who .hide-p{display:none}
  .ttl small{display:none}
  .home{grid-template-columns:1fr;gap:26px;bottom:calc(24px + var(--sab))}
  .cont .d{font-size:clamp(52px,16vw,76px)}
  .cont .cta{width:100%}
  .launch{width:100%} .play{width:calc(100% - 22px);margin-left:6px} .launch .streaks{display:none} .launch .chev{left:auto;right:-6px;top:-18px;transform:scale(.6);transform-origin:right} .hero .speedrule{display:none} .hero .ghost{font-size:44vw;left:auto;right:-10px}
  .quick button{padding-right:10px;margin-right:10px}
  .nav{flex-direction:row;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 0;border-top:1px solid var(--line);padding-top:14px}
  .nv{flex-direction:column;align-items:flex-start;gap:2px;width:50%;padding:6px 0}
  .nv .d{font-size:26px;color:var(--bone)} .nv .kr{opacity:1;transform:none}
  .nv .ix{display:none}
  .home-stats{display:none}
  .home-ac{top:calc(60px + var(--sat))} .home-ac .d{font-size:24px}
  .page{top:calc(66px + var(--sat))}
  .mrow{grid-template-columns:40px minmax(0,1fr);gap:4px 12px;padding:14px 0}
  .mrow .n{font-size:28px;grid-row:1/3} .mrow .d{font-size:26px}
  .mrow .c3{grid-column:2/3} .mrow .sb{display:none!important}
  .mrow .r{position:absolute;right:0;top:18px}
  .row:has(.opts){flex-direction:column;align-items:flex-start;gap:10px}
  .cols{grid-template-columns:1fr}
  .brief{left:var(--gx);right:var(--gr);width:auto;top:38%;bottom:calc(20px + var(--sab))}
  .brief .d.big{font-size:52px}
  .hg-list{left:0;right:0;top:auto;bottom:auto;top:calc(30vh);width:auto;flex-direction:row;overflow-x:auto;gap:20px;padding:0 var(--gr) 0 var(--gx);height:64px}
  .hgi{padding:6px 0 6px 12px} .hgi .d{font-size:20px}
  .hg-info{left:var(--gx);right:var(--gr);width:auto;top:calc(30vh + 80px);bottom:calc(20px + var(--sab))}
  .hg-info p{display:none} .hg-info .d.big{font-size:36px}
  .drag-hint{display:none}
  .pz{grid-template-columns:1fr} .pz .r{display:none}
  .rs .box{margin:0 var(--gx);width:auto}
  .banner{top:calc(13% + var(--sat))} .banner .t{font-size:34px}
  .tipbox{top:calc(48% + var(--sat))}
  .intro .card2{bottom:calc(20% + var(--sab))}
  .ap{left:var(--gx);right:var(--gr);width:auto;top:calc(104px + var(--sat))}
  .feed{bottom:auto;top:calc(52% + var(--sat))}
}


/* ---------- home hero ---------- */
.gear{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;transition:background .2s,transform .4s var(--ease)}
.gear svg{width:20px;height:20px;stroke:var(--bone);fill:none;stroke-width:1.7}
.gear:hover{background:rgba(236,230,220,.1);transform:rotate(60deg)}
.hero{position:relative;display:inline-block;padding:10px 0 6px}
.hero .ghost{position:absolute;left:-6px;top:50%;transform:translateY(-50%);font-family:var(--fd);font-size:clamp(150px,22vw,280px);line-height:.8;color:transparent;-webkit-text-stroke:1.5px rgba(236,230,220,.16);pointer-events:none;animation:in-left 1s var(--ease) both;z-index:-1}
.hero .slash{position:absolute;left:-26px;top:16%;width:6px;height:70%;background:var(--burn);transform:skewX(-20deg);animation:in-up .6s .15s var(--ease) both}
.hero .slash.s2{left:-38px;width:3px;opacity:.6;animation-delay:.2s}
.hero .slash.s3{left:-46px;width:2px;opacity:.3;animation-delay:.25s}
.hero .d{position:relative}
.hero .speedrule{position:absolute;left:calc(100% + 18px);top:58%;width:min(26vw,320px);height:2px;background:linear-gradient(90deg,var(--burn),rgba(255,75,58,0));transform-origin:left;animation:bar .9s .4s var(--ease) both}
.hero .speedrule::after{content:'';position:absolute;left:0;top:8px;width:60%;height:1px;background:linear-gradient(90deg,rgba(236,230,220,.5),transparent)}
.launch{position:relative;margin-top:24px;width:max-content;animation:in-up .5s .42s var(--ease) both}
.launch .streaks{position:absolute;right:100%;top:50%;width:min(30vw,380px);height:110px;margin-top:-55px;margin-right:-10px;overflow:visible;pointer-events:none;opacity:.55}
.launch .streaks line{stroke:rgba(236,230,220,.5);stroke-width:1.2;animation:streak 1.4s linear infinite}
.launch .streaks line:nth-child(3n){stroke:rgba(255,75,58,.8)}
@keyframes streak{from{transform:translateX(-140px);opacity:0}30%{opacity:1}to{transform:translateX(340px);opacity:0}}
.launch .chev{position:absolute;left:calc(100% + 14px);top:50%;display:flex;gap:4px;transform:translateY(-50%);pointer-events:none}
.launch .chev i{width:14px;height:30px;background:var(--burn);clip-path:polygon(0 0,45% 0,100% 50%,45% 100%,0 100%,55% 50%);opacity:.15;animation:chev 1.2s ease-in-out infinite}
.launch .chev i:nth-child(2){animation-delay:.1s}.launch .chev i:nth-child(3){animation-delay:.2s}.launch .chev i:nth-child(4){animation-delay:.3s}.launch .chev i:nth-child(5){animation-delay:.4s}.launch .chev i:nth-child(6){animation-delay:.5s}
@keyframes chev{0%,100%{opacity:.12}40%{opacity:1}}
.play{position:relative;display:flex;align-items:center;height:62px;padding:0 34px 0 0;transform:skewX(-14deg);background:var(--burn);color:var(--ink);transition:background .2s,transform .25s var(--ease);box-shadow:8px 8px 0 rgba(236,230,220,.08)}
.play::before{content:'';position:absolute;left:-14px;top:0;bottom:0;width:6px;background:var(--bone)}
.play::after{content:'';position:absolute;right:-18px;top:0;bottom:0;width:8px;background:repeating-linear-gradient(0deg,var(--ink) 0 6px,var(--burn) 6px 12px);opacity:.9}
.play>*{transform:skewX(14deg)}
.play .tri{width:62px;height:100%;display:grid;place-items:center;background:rgba(10,13,19,.14);margin-right:20px}
.play .tri svg{width:20px;height:20px;fill:var(--ink);transition:transform .35s var(--ease)}
.play .lbl{font-family:var(--fd);font-size:32px;letter-spacing:.12em;line-height:1}
.play .sub{margin-left:18px;font-family:var(--fm);font-weight:700;font-size:10px;letter-spacing:.18em;opacity:.65;text-transform:uppercase}
.play:hover{background:#ff5d4d;transform:skewX(-14deg) translateX(4px)}
.play:hover .tri svg{transform:translateX(4px)}
.play:active{transform:skewX(-14deg) scale(.97)}
.launch.fire .play{background:#fff}
.launch.fire .tri svg{transform:translateX(220px);transition:transform .45s cubic-bezier(.5,0,.75,0)}
.launch.fire .chev i{background:#fff;opacity:1;animation:chevgo .35s ease-in forwards}
@keyframes chevgo{to{transform:translateX(240px);opacity:0}}
.launch.fire .streaks line{stroke:#fff;animation-duration:.35s}
.quick{display:flex;margin-top:20px;animation:in-up .5s .5s var(--ease) both;flex-wrap:wrap}
.quick button{position:relative;padding:4px 16px 4px 0;margin-right:16px;border-right:1px solid var(--line)}
.quick button:last-child{border-right:0}
.quick span{display:block;font-family:var(--fm);font-weight:700;font-size:9px;letter-spacing:.24em;color:var(--ash)}
.quick b{display:block;font-weight:800;font-size:13px;margin-top:3px;transition:color .2s}
.quick button:hover b{color:var(--burn)}
.quick b.flip{animation:in-up .3s var(--ease)}
/* ---------- small system notice ---------- */
.notice{position:absolute;left:50%;top:calc(70px + var(--sat));transform:translate(-50%,-6px);font-family:var(--fm);font-weight:700;font-size:11.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--bone);text-shadow:0 1px 6px rgba(0,0,0,.9);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s var(--ease);white-space:nowrap}
.notice.on{opacity:1;transform:translate(-50%,0)}
@media (orientation:portrait){.notice{top:calc(22% + var(--sat))}}
/* ---------- white transition effects, one per destination ---------- */
.fxo{position:fixed;inset:0;z-index:45;pointer-events:none;overflow:hidden}
.fxo i{position:absolute;background:#fff}
.fxo.sweep i{top:-20%;bottom:-20%;width:22%;transform:skewX(-18deg) translateX(-200%);animation:fxsweep .55s cubic-bezier(.7,0,.3,1) forwards}
.fxo.sweep i:nth-child(2){animation-delay:.05s;width:12%;opacity:.7}.fxo.sweep i:nth-child(3){animation-delay:.1s;width:6%;opacity:.5}
@keyframes fxsweep{to{transform:skewX(-18deg) translateX(700%)}}
.fxo.burst i{left:50%;top:50%;width:40px;height:40px;margin:-20px;border-radius:50%;background:none;border:3px solid #fff;animation:fxburst .55s var(--ease) forwards}
.fxo.burst i:nth-child(2){animation-delay:.06s}.fxo.burst i:nth-child(3){animation-delay:.12s;background:rgba(255,255,255,.9);border:0}
@keyframes fxburst{to{transform:scale(60);opacity:0}}
.fxo.zig svg{position:absolute;inset:0;width:100%;height:100%}
.fxo.zig polyline{fill:none;stroke:#fff;stroke-width:6;stroke-dasharray:3000;stroke-dashoffset:3000;animation:zzfire .45s var(--ease) forwards}
.fxo.zig polyline:nth-child(2){animation-delay:.05s;stroke-width:3}.fxo.zig polyline:nth-child(3){animation-delay:.1s;stroke-width:10}
.fxo.shutter i{top:0;bottom:0;width:20.5%;transform:scaleY(0);animation:fxshut .5s cubic-bezier(.7,0,.3,1) forwards}
.fxo.shutter i:nth-child(odd){transform-origin:top}.fxo.shutter i:nth-child(even){transform-origin:bottom}
@keyframes fxshut{50%{transform:scaleY(1)}100%{transform:scaleY(0)}}
.fxo.iris i{left:50%;top:50%;width:200vmax;height:200vmax;margin:-100vmax;border-radius:50%;background:none;box-shadow:0 0 0 100vmax #fff inset;animation:fxiris .55s var(--ease) forwards;transform:scale(1)}
@keyframes fxiris{0%{transform:scale(1.2);opacity:0}40%{opacity:1}100%{transform:scale(0);opacity:0}}
.fxo.flash{background:#fff;animation:fxflash .5s ease-out forwards}
@keyframes fxflash{0%{opacity:0}25%{opacity:1}100%{opacity:0}}

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
.fl{position:absolute;pointer-events:none;opacity:0;transition:opacity .18s;width:0;height:0;transform:scale(var(--cs,1))}
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
.thr{left:calc(10px + var(--sal));bottom:calc(20px + var(--sab));width:56px;height:min(48vh,280px);transform:scale(var(--cs,1));transform-origin:left bottom}
.thr .rail{position:absolute;left:50%;top:0;bottom:0;width:6px;margin-left:-3px;background:rgba(236,230,220,.14)}
.thr .fill{position:absolute;left:50%;bottom:0;top:0;width:6px;margin-left:-3px;background:var(--bone);transform-origin:bottom;transform:scaleY(0)}
.thr .ab{position:absolute;left:50%;top:0;height:14%;width:6px;margin-left:-3px;background:repeating-linear-gradient(0deg,rgba(255,122,69,.7) 0 3px,transparent 3px 6px)}
.thr .det{position:absolute;left:10px;right:10px;height:1.5px;background:rgba(236,230,220,.5)}
.thr .det span{position:absolute;left:100%;margin-left:6px;top:-6px;font-weight:700;font-size:9px;letter-spacing:.12em;color:rgba(236,230,220,.6)}
.thr .kn{position:absolute;left:0;right:0;height:30px;top:-15px;background:linear-gradient(180deg,rgba(236,230,220,.96),rgba(190,184,174,.96));clip-path:polygon(0 30%,10% 0,90% 0,100% 30%,100% 70%,90% 100%,10% 100%,0 70%);display:grid;place-items:center;color:var(--ink);font-weight:700;font-size:11px;will-change:transform}
.thr.ab-on .kn{background:linear-gradient(180deg,#FFB08A,var(--burn))}
.thr .ro{position:absolute;left:-4px;right:-4px;top:-28px;text-align:center;font-weight:700;font-size:12px}
.wpn{right:calc(14px + var(--sar));bottom:calc(34% + var(--sab));display:flex;flex-direction:column;align-items:flex-end;gap:12px;transform:scale(var(--cs,1));transform-origin:right bottom}
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
.ctx{transform:scale(var(--cs,1));transform-origin:right top;right:calc(14px + var(--sar));top:calc(58px + var(--sat));display:flex;gap:10px;flex-direction:row-reverse;flex-wrap:wrap;max-width:62%;align-items:center}
.ctx .hid{display:none!important}
.ctx .rb.act{border-color:var(--ok);box-shadow:inset 0 0 0 2px rgba(61,255,168,.35)}
.ctx .rb.act svg{stroke:var(--ok)}
.flp{display:flex;align-items:center;gap:4px;height:42px}
.flp button{width:38px;height:38px;border-radius:50%;border:1.5px solid rgba(236,230,220,.5);background:rgba(10,13,19,.32);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);font-weight:700;font-size:17px;text-align:center}
.flp span{min-width:48px;text-align:center;font-weight:700;font-size:10.5px;letter-spacing:.08em;text-shadow:0 1px 4px #000}
.sys{right:calc(14px + var(--sar));top:calc(8px + var(--sat));display:flex;gap:8px}
.sys .sq{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;transition:background .2s}
.sys .sq:active{background:rgba(236,230,220,.14)}
.sys .sq svg{width:19px;height:19px;stroke:var(--bone);fill:none;stroke-width:1.8;filter:drop-shadow(0 1px 3px rgba(0,0,0,.8))}
.sys .sq.on{border-color:var(--ok)} .sys .sq.on svg{stroke:var(--ok)}
.drawer{right:calc(14px + var(--sar));top:calc(52px + var(--sat));display:none;flex-direction:column;background:rgba(8,11,16,.92);padding:6px 4px;min-width:190px;z-index:2}
.drawer.open{display:flex;animation:in-up .2s var(--ease) both}
.drawer button{display:flex;align-items:center;gap:10px;padding:10px;font-family:var(--fk);font-weight:800;font-size:12.5px;text-align:left}
.drawer button:active{background:rgba(236,230,220,.1)}
.drawer svg{width:16px;height:16px;stroke:var(--bone);fill:none;stroke-width:1.8}
.rud{left:50%;bottom:calc(14px + var(--sab));width:min(30vw,180px);height:30px;transform:translateX(-50%);border-radius:15px;border:1.5px solid rgba(236,230,220,.3);background:rgba(10,13,19,.22)}
.rud .tk{position:absolute;top:3px;bottom:3px;left:50%;width:22px;margin-left:-11px;border-radius:11px;background:rgba(236,230,220,.85)}
.rud span{position:absolute;left:50%;top:-15px;transform:translateX(-50%);font-weight:700;font-size:9px;letter-spacing:.3em;color:rgba(236,230,220,.55)}
.calib{left:50%;bottom:calc(52px + var(--sab));transform:translateX(-50%);padding:8px 0;font-weight:700;font-size:11px;letter-spacing:.2em;border-bottom:1px solid var(--line2)}
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
