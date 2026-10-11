// Site demo of Suture's scan orb: the app's own orb.js, driven by a short illustrative loop. No network, no tracking.
window.api = async () => ({ orb: true });   // orb.js asks the app for its setting; on the site the orb is always on
(function () {
  const cv = document.getElementById('orb');
  if (!cv || !window.SutureOrb) return;
  const steps = ['Windows settings', 'Startup items', 'Disk space', 'Windows Update', 'Backups', 'Defender status'];
  let t = null;
  function run() {
    SutureOrb.set('working', steps[0]); let i = 0, p = 0;
    t = setInterval(() => {
      p += 0.025; i = Math.min(steps.length - 1, Math.floor(p * steps.length));
      SutureOrb.progress(p, steps[i]);
      if (p >= 1) { clearInterval(t); SutureOrb.set('done', ['Scan complete', '3 items to review']); t = setTimeout(run, 7000); }
    }, 150);
  }
  SutureOrb.mount(cv).then(() => setTimeout(run, 900));
})();
