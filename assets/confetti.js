
// Minimal local confetti implementation (no CDN). Provides window.confetti(opts).
// opts: { particleCount, spread, origin:{x,y}, ticks }
(function(){
  function ConfettiCanvas(){
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:fixed; pointer-events:none; top:0; left:0; width:100%; height:100%; z-index: 9999;';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resize = () => { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; };
    window.addEventListener('resize', this.resize);
    this.resize();
    this.parts = [];
    this.active = false;
  }
  ConfettiCanvas.prototype.spawn = function(opts){
    const count = Math.max(1, opts.particleCount|0 || 80);
    const spread = (opts.spread||60) * Math.PI/180;
    const angle0 = -Math.PI/2; // up
    const origin = opts.origin||{x:0.5, y:0.5};
    const ticks = Math.max(30, opts.ticks|0 || 120);
    const colors = ['#e67e22','#e74c3c','#f1c40f','#2ecc71','#3498db','#9b59b6','#1abc9c'];
    for(let i=0;i<count;i++){
      const angle = angle0 + (Math.random()-0.5)*spread;
      const speed = 6 + Math.random()*5;
      const vx = Math.cos(angle)*speed*(0.8+Math.random()*0.4);
      const vy = Math.sin(angle)*speed*(0.8+Math.random()*0.4);
      const size = 4 + Math.random()*4;
      const col = colors[(Math.random()*colors.length)|0];
      this.parts.push({
        x: origin.x * this.canvas.width,
        y: origin.y * this.canvas.height,
        vx, vy, life: ticks, size, color: col, rot: Math.random()*Math.PI, vr: (Math.random()-0.5)*0.2
      });
    }
    if(!this.active){ this.active = true; this.loop(); }
  };
  ConfettiCanvas.prototype.loop = function(){
    if(!this.active) return;
    const ctx = this.ctx;
    ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    let alive = 0;
    for(const p of this.parts){
      p.vy += 0.08; // gravity
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life--;
      if(p.life>0 && p.y < this.canvas.height+20){
        alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
        ctx.restore();
      }
    }
    this.parts = this.parts.filter(p => p.life>0 && p.y < this.canvas.height+20);
    if(this.parts.length===0){ this.active=false; return; }
    requestAnimationFrame(this.loop.bind(this));
  };

  var confettiInstance = null;
  function ensure(){ if(!confettiInstance) confettiInstance = new ConfettiCanvas(); return confettiInstance; }

  window.confetti = function(opts){
    try{
      ensure().spawn(opts||{});
    }catch(e){ /* noop */ }
  };

  // Full-screen celebration convenience (unchanged API)
  window.launchConfetti = function(){
    const end = Date.now() + 1200;
    (function loop(){
      window.confetti({ particleCount: 140, spread: 80, origin: { y: 0.6, x: 0.5 }, ticks: 120 });
      if(Date.now() < end) requestAnimationFrame(loop);
    })();
  };
})();
