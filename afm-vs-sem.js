
export class AfmVsSem {
    constructor() {
        this.semCanvas = document.getElementById('sem-canvas');
        this.afmCanvas = document.getElementById('afm-canvas');
        this.semCtx = this.semCanvas.getContext('2d');
        this.afmCtx = this.afmCanvas.getContext('2d');

        this.config = {
            density: 20,
            contrast: 50
        };

        this.particles = [];
        this.generateSample();

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        document.getElementById('density-slider').addEventListener('input', (e) => {
            this.config.density = parseInt(e.target.value);
            this.generateSample();
            this.draw();
        });

        document.getElementById('contrast-slider').addEventListener('input', (e) => {
            this.config.contrast = parseInt(e.target.value);
            this.draw();
        });

        // Loop for continuous rendering
        this.loop();
    }

    generateSample() {
        this.particles = [];
        // Generate random "nanoparticles"
        for (let i = 0; i < this.config.density; i++) {
            this.particles.push({
                x: Math.random(), // Normalized 0-1
                y: Math.random(),
                r: 0.05 + Math.random() * 0.1, // Radius
                h: 0.2 + Math.random() * 0.8  // Relative Height
            });
        }
    }

    resize() {
        const p = this.semCanvas.parentElement;
        // make exact match
        this.semCanvas.width = p.clientWidth;
        this.semCanvas.height = p.clientHeight;

        const p2 = this.afmCanvas.parentElement;
        this.afmCanvas.width = p2.clientWidth;
        this.afmCanvas.height = p2.clientHeight;

        this.draw();
    }

    draw() {
        this.drawSEM(this.semCtx, this.semCanvas.width, this.semCanvas.height);
        this.drawAFM(this.afmCtx, this.afmCanvas.width, this.afmCanvas.height);
    }

    drawSEM(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        // SEM Background (Grainy Grey)
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, w, h);

        // Draw Scan Lines effect
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let i = 0; i < h; i += 4) {
            ctx.fillRect(0, i, w, 1);
        }

        // Draw "Particles" as 2D Shapes with Shadow/Highlight (Fake 3D)
        // SEM simulates light coming from an angle (electron detector bias)

        for (let p of this.particles) {
            const x = p.x * w;
            const y = p.y * h;
            const r = p.r * Math.min(w, h) * (this.config.contrast / 50); // Contrast affects size/blooming

            // SEM rendering: Bright edges where slope is high, dark shadows
            const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
            grad.addColorStop(0, '#ffffff'); // Charging effect / High emission
            grad.addColorStop(0.4, '#cbd5e1');
            grad.addColorStop(1, '#334155'); // Fade to bg

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();

            // "Shadow" to emphasize directionality
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.ellipse(x + r * 0.2, y + r * 0.2, r, r * 0.8, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // SEM Text overlay (scale bar style)
        ctx.fillStyle = 'white';
        ctx.fillRect(w - 120, h - 30, 100, 4);
        ctx.font = '12px Inter';
        ctx.fillText("500 nm", w - 120, h - 10);
        ctx.fillText("20.00 kV", 20, 30);
    }

    drawAFM(ctx, w, h) {
        ctx.clearRect(0, 0, w, h);

        // AFM Background (Base Height - Dark Blue/Black)
        ctx.fillStyle = '#0f172a'; // Deep dark blue
        ctx.fillRect(0, 0, w, h);

        // Draw Particles as Height Map
        // We need to sort by Y to simulate crude depth buffer/painter's algo if overlapping
        // Or better, just draw them.

        for (let p of this.particles) {
            const x = p.x * w;
            const y = p.y * h;
            const r = p.r * Math.min(w, h);

            // AFM Gradient: Height -> Color
            // Low (Blue) -> Med (Orange) -> High (Yellow/White)
            // viridis-like or ironbow

            // Center is peak height
            const peakH = p.h * (this.config.contrast / 50);

            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);

            // Color mapping based on height "p.h"
            if (p.h > 0.8) {
                grad.addColorStop(0, '#ffffff'); // Highest
                grad.addColorStop(0.3, '#fbbf24');
                grad.addColorStop(0.7, '#ea580c');
                grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
            } else {
                grad.addColorStop(0, '#fbbf24');
                grad.addColorStop(0.5, '#ea580c');
                grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
            }

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();

            // Draw contour lines for "Topography" feel
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Color Scale Bar
        const barH = 150;
        const barW = 10;
        const barX = w - 30;
        const barY = h - 180;

        const scaleGrad = ctx.createLinearGradient(0, barY + barH, 0, barY);
        scaleGrad.addColorStop(0, '#0f172a');
        scaleGrad.addColorStop(0.5, '#ea580c');
        scaleGrad.addColorStop(1, '#ffffff');

        ctx.fillStyle = scaleGrad;
        ctx.fillRect(barX, barY, barW, barH);

        ctx.fillStyle = 'white';
        ctx.font = '10px Inter';
        ctx.fillText("50 nm", barX - 10, barY);
        ctx.fillText("0 nm", barX - 10, barY + barH + 10);
    }

    loop() {
        // Continuous animation not strictly needed unless we move things,
        // but let's slowly rotate/drift particles for visual flair
        // For educational comparison, static is often better. 
        // Let's keep it static to focus on the Contrast rendering.
    }
}

window.onload = () => { new AfmVsSem(); };
