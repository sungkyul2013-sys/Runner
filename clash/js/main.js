/* Royale Arena — bootstrap: preload card art, then show the home screen. */
(function () {
  const RA = window.RA;
  let started = false;
  function go() {
    if (started) return; started = true;
    try { RA.UI.init(); } catch (e) { console.error(e); document.getElementById('loading').querySelector('.ld-text').textContent = '오류: ' + e.message; return; }
    document.getElementById('loading').classList.add('hide');
  }
  RA.Img.load(go);
  setTimeout(() => { if (!RA.Img.ready) { RA.Img.ready = true; go(); } }, 6000); // never hang on a missing image
})();
