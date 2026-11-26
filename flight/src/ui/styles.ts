export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
:root{
  --bg:#05080d; --glass:rgba(10,16,24,.62); --glass2:rgba(14,22,34,.82); --line:rgba(140,200,255,.16); --line2:rgba(140,200,255,.32);
  --tx:#e9f1f8; --tx2:#93a6b8; --tx3:#5f7183; --cy:#5ce1ff; --cy2:#1aa6d9; --am:#ffb547; --rd:#ff4d5e; --gn:#4dff9a; --pu:#a78bfa;
  --f1:'Rajdhani','Noto Sans KR',system-ui,sans-serif; --f2:'Noto Sans KR',system-ui,sans-serif;
  --sat:env(safe-area-inset-top,0px); --sab:env(safe-area-inset-bottom,0px); --sal:env(safe-area-inset-left,0px); --sar:env(safe-area-inset-right,0px);
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
#ui{position:fixed;inset:0;pointer-events:none;font-family:var(--f2);color:var(--tx);z-index:10}
#ui .scr{position:absolute;inset:0;pointer-events:auto;display:none;opacity:0;transition:opacity .35s ease}
#ui .scr.show{display:block;opacity:1}
#ui .scr.fade-in{animation:fadeIn .45s ease both}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes slideL{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:none}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes sheen{from{background-position:-200% 0}to{background-position:200% 0}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes starPop{0%{transform:scale(0) rotate(-40deg);opacity:0}70%{transform:scale(1.35) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0)}}
.vign{position:absolute;inset:0;background:radial-gradient(120% 90% at 70% 50%,transparent 40%,rgba(2,5,9,.75) 100%),linear-gradient(90deg,rgba(3,6,10,.88) 0%,rgba(3,6,10,.45) 38%,transparent 60%);pointer-events:none}
.glass{background:var(--glass);backdrop-filter:blur(14px) saturate(140%);-webkit-backdrop-filter:blur(14px) saturate(140%);border:1px solid var(--line);border-radius:14px}
.brand{position:absolute;left:calc(28px + var(--sal));top:calc(22px + var(--sat));font-family:var(--f1);letter-spacing:.18em}
.brand .t1{font-size:clamp(30px,5vw,56px);font-weight:700;line-height:.9;background:linear-gradient(100deg,#fff 0%,#bfefff 40%,var(--cy) 60%,#fff 80%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:sheen 6s linear infinite}
.brand .t2{font-size:clamp(12px,1.6vw,16px);color:var(--am);letter-spacing:.6em;margin-top:4px;font-weight:600}
.brand .t3{font-family:var(--f2);font-size:12px;color:var(--tx2);letter-spacing:.2em;margin-top:6px}
.mainnav{position:absolute;left:calc(28px + var(--sal));top:50%;transform:translateY(-42%);display:flex;flex-direction:column;gap:8px;width:min(360px,44vw)}
.mi{position:relative;display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;text-align:left;transition:all .2s;animation:slideL .5s ease both;border:1px solid transparent}
.mi .ic{width:38px;height:38px;flex:none;border-radius:10px;display:grid;place-items:center;background:linear-gradient(140deg,rgba(92,225,255,.18),rgba(92,225,255,.03));border:1px solid var(--line2)}
.mi .ic svg{width:20px;height:20px;stroke:var(--cy);fill:none;stroke-width:1.8}
.mi .nm{font-family:var(--f1);font-size:clamp(17px,2.2vw,22px);font-weight:700;letter-spacing:.08em}
.mi .ds{font-size:11.5px;color:var(--tx2);margin-top:1px}
.mi:hover,.mi:focus-visible{background:linear-gradient(90deg,rgba(92,225,255,.16),rgba(92,225,255,0));border-color:var(--line2);transform:translateX(6px)}
.mi:hover::before{content:'';position:absolute;left:-1px;top:20%;bottom:20%;width:3px;border-radius:3px;background:var(--cy);box-shadow:0 0 12px var(--cy)}
.mi.primary .ic{background:linear-gradient(140deg,var(--am),#ff7a1a);border-color:transparent}
.mi.primary .ic svg{stroke:#1b1200}
.statbar{position:absolute;right:calc(24px + var(--sar));bottom:calc(20px + var(--sab));display:flex;gap:10px}
.stat{padding:8px 14px;min-width:84px;text-align:center}
.stat b{display:block;font-family:var(--f1);font-size:22px;color:var(--cy);line-height:1}
.stat span{font-size:10.5px;color:var(--tx2);letter-spacing:.08em}
.showcase{position:absolute;right:calc(26px + var(--sar));top:calc(22px + var(--sat));text-align:right}
.showcase .k{font-size:11px;color:var(--tx2);letter-spacing:.2em}
.showcase .v{font-family:var(--f1);font-size:22px;font-weight:700;letter-spacing:.06em}
.hdr{position:absolute;left:0;right:0;top:0;padding:calc(16px + var(--sat)) calc(22px + var(--sar)) 14px calc(22px + var(--sal));display:flex;align-items:center;gap:14px;background:linear-gradient(180deg,rgba(3,6,10,.9),rgba(3,6,10,0))}
.hdr h2{margin:0;font-family:var(--f1);font-size:clamp(22px,3vw,30px);letter-spacing:.12em;font-weight:700}
.hdr .sub{color:var(--tx2);font-size:12px}
.back{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;border:1px solid var(--line2);background:var(--glass)}
.back:hover{border-color:var(--cy)}
.body{position:absolute;left:0;right:0;top:calc(76px + var(--sat));bottom:0;overflow:auto;padding:8px calc(22px + var(--sar)) calc(24px + var(--sab)) calc(22px + var(--sal));-webkit-overflow-scrolling:touch}
.tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.tab{padding:8px 16px;border-radius:999px;border:1px solid var(--line);font-family:var(--f1);font-weight:600;letter-spacing:.08em;color:var(--tx2);background:var(--glass)}
.tab.on{color:#03111a;background:var(--cy);border-color:var(--cy);box-shadow:0 0 18px rgba(92,225,255,.4)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.card{position:relative;padding:16px;border-radius:14px;background:linear-gradient(160deg,rgba(20,32,48,.85),rgba(8,12,18,.85));border:1px solid var(--line);text-align:left;transition:all .2s;overflow:hidden;animation:fadeIn .4s ease both}
.card:hover{border-color:var(--cy);transform:translateY(-3px);box-shadow:0 12px 30px rgba(0,0,0,.4),0 0 0 1px rgba(92,225,255,.25)}
.card .no{font-family:var(--f1);font-size:12px;color:var(--am);letter-spacing:.2em}
.card .ti{font-size:18px;font-weight:700;margin:4px 0 2px}
.card .sb{font-size:12px;color:var(--tx2)}
.card .meta{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.chip{font-size:10.5px;padding:3px 8px;border-radius:999px;border:1px solid var(--line2);color:var(--tx2)}
.chip.am{color:var(--am);border-color:rgba(255,181,71,.4)}
.stars{position:absolute;right:14px;top:14px;font-size:14px;letter-spacing:2px;color:#2b3846}
.stars .on{color:var(--am);text-shadow:0 0 10px rgba(255,181,71,.6)}
.card .glow{position:absolute;right:-30px;bottom:-30px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(92,225,255,.18),transparent 70%)}
.hangar{position:absolute;inset:0;display:grid;grid-template-columns:minmax(240px,320px) 1fr minmax(240px,340px);gap:16px;padding:calc(82px + var(--sat)) calc(22px + var(--sar)) calc(22px + var(--sab)) calc(22px + var(--sal));pointer-events:none}
.hangar>*{pointer-events:auto}
.aclist{display:flex;flex-direction:column;gap:8px;overflow:auto}
.acitem{padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--glass);text-align:left;transition:all .2s}
.acitem.on{border-color:var(--cy);background:linear-gradient(90deg,rgba(92,225,255,.18),rgba(10,16,24,.7));box-shadow:inset 3px 0 0 var(--cy)}
.acitem .r{font-size:10.5px;color:var(--am);letter-spacing:.12em}
.acitem .n{font-family:var(--f1);font-size:19px;font-weight:700;letter-spacing:.04em}
.acinfo{padding:18px;align-self:end}
.acinfo h3{margin:0;font-family:var(--f1);font-size:28px;letter-spacing:.06em}
.acinfo .role{color:var(--am);font-size:12px;letter-spacing:.14em}
.acinfo p{font-size:13px;color:var(--tx2);line-height:1.55}
.bar{display:grid;grid-template-columns:70px 1fr 34px;align-items:center;gap:8px;font-size:11.5px;color:var(--tx2);margin:7px 0}
.bar .tr{height:6px;border-radius:6px;background:rgba(255,255,255,.07);overflow:hidden}
.bar .fl{height:100%;border-radius:6px;background:linear-gradient(90deg,var(--cy2),var(--cy));box-shadow:0 0 10px rgba(92,225,255,.5);transition:width .6s cubic-bezier(.2,.8,.2,1)}
.bar b{font-family:var(--f1);color:var(--tx);text-align:right}
.specs{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:12px;font-size:11.5px}
.specs div{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:4px 0}
.specs span{color:var(--tx2)} .specs b{font-family:var(--f1)}
.livs{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.liv{width:34px;height:34px;border-radius:50%;border:2px solid var(--line2);transition:all .2s}
.liv.on{border-color:var(--cy);box-shadow:0 0 0 3px rgba(92,225,255,.25)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 26px;border-radius:12px;font-family:var(--f1);font-size:18px;font-weight:700;letter-spacing:.14em;transition:all .2s}
.btn.pri{background:linear-gradient(135deg,var(--am),#ff8a1f);color:#1a0f00;box-shadow:0 8px 24px rgba(255,150,40,.3)}
.btn.pri:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(255,150,40,.45)}
.btn.sec{background:var(--glass2);border:1px solid var(--line2)}
.btn.sec:hover{border-color:var(--cy)}
.btn.full{width:100%}
.row{display:flex;gap:10px;flex-wrap:wrap}
.panel{padding:16px;margin-bottom:12px}
.panel h4{margin:0 0 10px;font-family:var(--f1);letter-spacing:.14em;font-size:15px;color:var(--cy)}
.opt{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.opt:last-child{border:0}
.opt .l small{display:block;color:var(--tx3);font-size:11px}
.seg{display:flex;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:10px;padding:3px;gap:2px;flex-wrap:wrap}
.seg button{padding:6px 11px;border-radius:7px;font-size:12.5px;color:var(--tx2);white-space:nowrap}
.seg button.on{background:var(--cy);color:#04121a;font-weight:700}
.tog{width:46px;height:26px;border-radius:26px;background:rgba(255,255,255,.12);position:relative;transition:all .2s;flex:none}
.tog::after{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#cfd8e0;transition:all .2s}
.tog.on{background:var(--cy2)} .tog.on::after{left:23px;background:#fff}
input[type=range]{-webkit-appearance:none;appearance:none;width:min(220px,40vw);height:4px;border-radius:4px;background:rgba(255,255,255,.15)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--cy);box-shadow:0 0 10px var(--cy)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:820px){.two{grid-template-columns:1fr}.hangar{grid-template-columns:1fr;grid-template-rows:auto 1fr auto;overflow:auto}.aclist{flex-direction:row;overflow-x:auto}.acitem{min-width:150px}.mainnav{width:min(320px,62vw)}.statbar{display:none}}
.brief{position:absolute;right:calc(22px + var(--sar));bottom:calc(22px + var(--sab));width:min(460px,calc(100% - 44px));padding:20px}
.brief .k{font-family:var(--f1);color:var(--am);letter-spacing:.24em;font-size:12px}
.brief h3{margin:4px 0 6px;font-size:26px}
.brief p{color:var(--tx2);font-size:13.5px;line-height:1.6}
.brief ul{margin:8px 0 14px;padding-left:18px;color:var(--tx);font-size:12.5px;line-height:1.7}
.obj{display:flex;gap:10px;align-items:flex-start;font-size:13px;margin:6px 0}
.obj i{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--cy);flex:none;margin-top:1px}
.load{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 60%,#0b1622,#020407)}
.load .c{text-align:center;width:min(420px,80vw)}
.load .ring{width:64px;height:64px;margin:0 auto 18px;border-radius:50%;border:3px solid rgba(92,225,255,.15);border-top-color:var(--cy);animation:spin 1s linear infinite}
.load .pb{height:3px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;margin-top:14px}
.load .pb div{height:100%;background:linear-gradient(90deg,var(--cy2),var(--cy));box-shadow:0 0 12px var(--cy);transition:width .2s}
.load .tip{font-size:12px;color:var(--tx2);margin-top:12px;min-height:2.6em}
.modal{position:absolute;inset:0;display:grid;place-items:center;background:rgba(2,4,8,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.modal .box{width:min(440px,calc(100% - 40px));padding:24px;text-align:center}
.modal h3{margin:0 0 16px;font-family:var(--f1);font-size:28px;letter-spacing:.2em}
.modal .col{display:flex;flex-direction:column;gap:9px}
.res{width:min(620px,calc(100% - 32px));max-height:calc(100% - 40px);overflow:auto;padding:24px}
.res .big{font-family:var(--f1);font-size:clamp(34px,6vw,52px);font-weight:700;letter-spacing:.12em;line-height:1}
.res .big.ok{color:var(--gn);text-shadow:0 0 30px rgba(77,255,154,.4)} .res .big.no{color:var(--rd);text-shadow:0 0 30px rgba(255,77,94,.35)}
.res .st{font-size:38px;letter-spacing:6px;margin:10px 0}
.res .st span{display:inline-block;color:#26313c}
.res .st span.on{color:var(--am);text-shadow:0 0 18px rgba(255,181,71,.7);animation:starPop .6s cubic-bezier(.2,.9,.3,1.4) both}
.res table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}
.res td{padding:7px 4px;border-bottom:1px solid var(--line)} .res td:last-child{text-align:right;font-family:var(--f1);font-size:15px}
.grade{display:inline-grid;place-items:center;width:72px;height:72px;border-radius:16px;font-family:var(--f1);font-size:44px;font-weight:700;border:2px solid currentColor;margin:6px 0}
.toast{position:absolute;left:50%;top:calc(18% + var(--sat));transform:translateX(-50%);padding:10px 22px;font-family:var(--f1);font-weight:700;letter-spacing:.14em;font-size:20px;pointer-events:none;animation:fadeIn .3s ease both;white-space:nowrap;text-shadow:0 2px 10px rgba(0,0,0,.6)}
.tipbox{position:absolute;left:50%;bottom:calc(30% + var(--sab));transform:translateX(-50%);padding:10px 18px;font-size:14px;max-width:min(560px,86vw);text-align:center;pointer-events:none;animation:fadeIn .4s ease both}
.ap{position:absolute;right:calc(14px + var(--sar));top:calc(64px + var(--sat));width:250px;padding:14px;pointer-events:auto}
.ap h4{margin:0 0 8px;font-family:var(--f1);letter-spacing:.2em;color:var(--gn)}
.ap .r{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:7px 0;font-size:12.5px}
.ap .r .v{font-family:var(--f1);font-size:16px;min-width:64px;text-align:center}
.ap .pm{width:30px;height:28px;border-radius:7px;background:rgba(255,255,255,.08);font-weight:700}
.ap .md{padding:5px 9px;border-radius:7px;border:1px solid var(--line2);font-family:var(--f1);font-weight:700;letter-spacing:.08em;font-size:13px}
.ap .md.on{background:var(--gn);color:#02140a;border-color:var(--gn)}
.photo-ui{position:absolute;left:50%;bottom:calc(20px + var(--sab));transform:translateX(-50%);display:flex;gap:10px;pointer-events:auto}
.fps{position:absolute;left:8px;bottom:8px;font:11px monospace;color:#7f8;background:rgba(0,0,0,.4);padding:2px 6px;border-radius:4px;pointer-events:none}

/* ---------- touch controls ---------- */
.tc-root{position:fixed;inset:0;z-index:5;touch-action:none;user-select:none;-webkit-user-select:none;font-family:var(--f1);color:#e9f1f8}
.tc-root>*{position:absolute}
.tc-throttle{bottom:calc(26px + var(--sab));width:64px;height:min(46vh,270px)}
.tc-throttle.tc-left{left:calc(14px + var(--sal))} .tc-throttle.tc-right{right:calc(14px + var(--sar))}
.tc-thr-track{position:absolute;left:50%;top:0;bottom:0;width:14px;transform:translateX(-50%);border-radius:10px;background:rgba(0,0,0,.45);border:1px solid rgba(140,200,255,.25);overflow:hidden}
.tc-thr-fill{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,rgba(92,225,255,.25),rgba(92,225,255,.75))}
.tc-thr-knob{position:absolute;left:50%;bottom:0;width:60px;height:38px;border-radius:10px;background:linear-gradient(180deg,#3a4552,#1b222b);border:1px solid rgba(140,200,255,.45);display:grid;place-items:center;font-size:12px;font-weight:700;letter-spacing:.1em;box-shadow:0 4px 14px rgba(0,0,0,.5);transform:translate(-50%,0)}
.tc-thr-ab{position:absolute;left:50%;top:-30px;transform:translateX(-50%);font-size:12px;font-weight:700;padding:3px 9px;border-radius:6px;background:rgba(0,0,0,.4);border:1px solid rgba(255,140,40,.4);color:#ffb070}
.tc-thr-ab.on{background:#ff7a1a;color:#140700;box-shadow:0 0 16px #ff7a1a}
.tc-slider{background:rgba(0,0,0,.18);border:1px solid rgba(140,200,255,.16);border-radius:22px}
.tc-slider.active{border-color:rgba(92,225,255,.5);background:rgba(92,225,255,.06)}
.tc-vert{width:92px;height:min(52vh,300px);bottom:calc(26px + var(--sab))}
.tc-vert.tc-left2{left:calc(96px + var(--sal))} .tc-vert.tc-right2{right:calc(96px + var(--sar))}
.tc-horz{height:92px;width:min(40vw,330px);bottom:calc(26px + var(--sab))}
.tc-horz.tc-right{right:calc(22px + var(--sar))} .tc-horz.tc-left{left:calc(22px + var(--sal))}
.tc-rail{position:absolute;background:rgba(140,200,255,.25);border-radius:4px}
.tc-vert .tc-rail{left:50%;top:10%;bottom:10%;width:4px;transform:translateX(-50%)}
.tc-horz .tc-rail{top:50%;left:8%;right:8%;height:4px;transform:translateY(-50%)}
.tc-thumb{position:absolute;width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#5b6b7c,#1d252e);border:2px solid rgba(92,225,255,.6);box-shadow:0 0 18px rgba(92,225,255,.25),0 6px 16px rgba(0,0,0,.5)}
.tc-vert .tc-thumb{left:50%;top:50%;margin-top:-29px;transform:translate(-50%,0)}
.tc-horz .tc-thumb{left:50%;top:50%;margin-left:-29px;transform:translate(0,-50%)}
.tc-lbl{position:absolute;font-size:11px;color:rgba(233,241,248,.55);letter-spacing:.06em;font-family:var(--f2)}
.tc-lbl.top{top:4px;left:50%;transform:translateX(-50%)} .tc-lbl.bot{bottom:4px;left:50%;transform:translateX(-50%)}
.tc-lbl.l{left:10px;top:4px} .tc-lbl.r{right:10px;top:4px}
.tc-stick{width:min(34vw,200px);height:min(34vw,200px);bottom:calc(26px + var(--sab))}
.tc-stick.tc-right{right:calc(28px + var(--sar))} .tc-stick.tc-left{left:calc(28px + var(--sal))}
.tc-stick-base{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(92,225,255,.08),rgba(0,0,0,.25));border:1px solid rgba(140,200,255,.3)}
.tc-cross{position:absolute;inset:18%;border-radius:50%;border:1px dashed rgba(140,200,255,.18)}
.tc-stick-knob{position:absolute;left:50%;top:50%;width:40%;height:40%;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 30%,#5b6b7c,#1d252e);border:2px solid rgba(92,225,255,.6);box-shadow:0 0 18px rgba(92,225,255,.3)}
.tc-rudder{height:40px;width:min(26vw,170px);bottom:calc(8px + var(--sab));background:rgba(0,0,0,.2);border:1px solid rgba(140,200,255,.16);border-radius:20px}
.tc-rudder.tc-leftb{left:calc(196px + var(--sal))} .tc-rudder.tc-rightb{right:calc(196px + var(--sar))}
.tc-root[data-mode=stick] .tc-rudder.tc-leftb,.tc-root[data-mode=tilt] .tc-rudder.tc-leftb{left:calc(96px + var(--sal))}
.tc-root[data-mode=stick] .tc-rudder.tc-rightb,.tc-root[data-mode=tilt] .tc-rudder.tc-rightb{right:calc(96px + var(--sar))}
.tc-rudder .tc-rail{top:50%;left:10%;right:10%;height:3px;transform:translateY(-50%)}
.tc-rudder .tc-thumb{width:30px;height:30px;left:50%;top:50%;margin-left:-15px;transform:translate(0,-50%)}
.tc-rud-l{position:absolute;left:50%;top:-16px;transform:translateX(-50%);font-size:10px;color:rgba(233,241,248,.5);font-family:var(--f2)}
.tc-cluster{bottom:calc(132px + var(--sab));display:grid;grid-template-columns:repeat(4,auto);gap:7px;align-items:end}
.tc-root[data-mode=stick] .tc-cluster{bottom:calc(min(34vw,200px) + 44px + var(--sab))}
.tc-cluster.tc-rightc{right:calc(18px + var(--sar))} .tc-cluster.tc-leftc{left:calc(18px + var(--sal))}
.tc-btn{min-width:52px;height:40px;padding:0 9px;border-radius:11px;background:rgba(8,14,22,.55);border:1px solid rgba(140,200,255,.28);color:#dfe9f2;font-family:var(--f1);font-weight:700;font-size:12.5px;letter-spacing:.06em;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.tc-btn.on{background:rgba(92,225,255,.35);border-color:var(--cy)}
.tc-fire{grid-column:span 2;height:62px;font-size:16px;border-radius:16px;border-color:rgba(255,90,90,.6);background:rgba(80,10,10,.45)}
.tc-msl{grid-column:span 2;height:62px;font-size:16px;border-radius:16px;border-color:rgba(255,181,71,.6);background:rgba(70,40,0,.45)}
.tc-calib{bottom:calc(40px + var(--sab))}
.tc-calib.tc-right{right:calc(40px + var(--sar))} .tc-calib.tc-left{left:calc(40px + var(--sal))}
.tc-top{top:calc(8px + var(--sat));left:50%;transform:translateX(-50%);display:flex;gap:5px;flex-wrap:nowrap;max-width:calc(100% - 20px);overflow-x:auto;scrollbar-width:none}
.tc-topbtn{height:32px;padding:0 10px;border-radius:9px;background:rgba(8,14,22,.5);border:1px solid rgba(140,200,255,.22);font-family:var(--f1);font-weight:700;font-size:12px;letter-spacing:.06em;color:#cfe;white-space:nowrap}
@media (pointer:fine){.tc-root[data-desktop=hide] .tc-slider,.tc-root[data-desktop=hide] .tc-stick,.tc-root[data-desktop=hide] .tc-rudder,.tc-root[data-desktop=hide] .tc-cluster{opacity:.0;pointer-events:none}}
`;
