
export class AfmVsTem {
    constructor() {
        this.temCanvas = document.getElementById('tem-canvas');
        this.afmCanvas = document.getElementById('afm-canvas');
        this.temCtx = this.temCanvas.getContext('2d');
        this.afmCtx = this.afmCanvas.getContext('2d');

        this.config = {
            nucleusDensity: 0.8
        };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        document.getElementById('density-slider').addEventListener('input', (e) => {
            this.config.nucleusDensity = parseInt(e.target.value) / 100;
            this.draw();
        });

        this.loop();
    }

    resize() {
        const p = this.temCanvas.parentElement;
        this.temCanvas.width = p.clientWidth;
        this.temCanvas.height = p.clientHeight;

        const p2 = this.afmCanvas.parentElement;
        this.afmCanvas.width = p2.clientWidth;
        this.afmCanvas.height = p2.clientHeight;

        this.draw();
    }

    draw() {
        this.drawTEM(this.temCtx, this.temCanvas.width, this.temCanvas.height);
        this.drawAFM(this.afmCtx, this.afmCanvas.width, this.afmCanvas.height);
    }

    drawTEM(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        // TEM Background (Bright Phosphor Screen / Sensor)
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const cellR = Math.min(w, h) * 0.3;

        // 1. Cytoplasm (Slightly dense)
        // TEM: Density = Darkness. 
        ctx.fillStyle = 'rgba(70, 70, 70, 0.2)';
        ctx.beginPath();
        ctx.arc(cx, cy, cellR, 0, Math.PI * 2);
        ctx.fill();

        // 2. Nucleus (Very Dense)
        // Internal structure visible!
        const nucleusR = cellR * 0.4;
        const alpha = this.config.nucleusDensity; // Controlled by slider

        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.beginPath();
        ctx.arc(cx - nucleusR * 0.2, cy - nucleusR * 0.2, nucleusR, 0, Math.PI * 2);
        ctx.fill();

        // 3. Mitochondria etc (Small dots)
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(cx + cellR * 0.5 * Math.cos(i), cy + cellR * 0.5 * Math.sin(i), 10, 0, Math.PI * 2);
            ctx.fill();
        }

        // Label
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 14px Inter';
        ctx.fillText("Internal Nucleus Visible", 20, 40);
        ctx.font = '12px Inter';
        ctx.fillText("(Transmission)", 20, 60);
    }

    drawAFM(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        // AFM Background (Base Z)
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const cellR = Math.min(w, h) * 0.3;

        // AFM sees TOPOGRAPHY only.
        // It sees the cell as a dome. It does NOT see the nucleus inside.

        // Draw gradients to simulate height dome
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellR);
        grad.addColorStop(0, '#ffffff'); // Peak height (center)
        grad.addColorStop(0.5, '#ea580c'); // Slope
        grad.addColorStop(1, '#0f172a'); // Base

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, cellR, 0, Math.PI * 2);
        ctx.fill();

        // Contour lines
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;

        [0.2, 0.4, 0.6, 0.8].forEach(scale => {
            ctx.beginPath();
            ctx.arc(cx, cy, cellR * scale, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Inter';
        ctx.fillText("Surface Shape Only", 20, 40);
        ctx.font = '12px Inter';
        ctx.fillText("(No internal info)", 20, 60);
    }

    loop() {
        // Static viz is fine for this comparison
    }
}

window.onload = () => { new AfmVsTem(); };
