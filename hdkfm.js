
import { SpectrumAnalyzer } from './spectrum.js';

export class KFMApplication {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.spectrum = new SpectrumAnalyzer('spectrum-canvas');

        // Configuration
        this.config = {
            scanSpeed: 2.0,
            resolution: 400,
            sampleLength: 2000,
            acVoltage: 2.0
        };

        this.state = {
            isRunning: false, // Start paused
            tipX: 0,
            tipZ: 100,
            surfaceZ: 0,
            potential: 0, // mV
            measuredTopo: [],
            measuredPotential: []
        };

        this.surface = [];
        this.view = { scaleX: 1, scaleY: 2, offsetX: 50, offsetY: 300 };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.generateSurface(); // Includes Topo + Potential
        this.bindControls();
        this.loop();
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
        this.view.scaleX = (this.canvas.width - 100) / this.config.sampleLength;
        this.view.offsetY = this.canvas.height - 100;
    }

    generateSurface() {
        this.surface = [];
        for (let x = 0; x <= this.config.sampleLength; x += (this.config.sampleLength / this.config.resolution)) {
            // Topography: A step and a bump
            let z = 30 + (x > 500 && x < 1000 ? 60 : 0) + (Math.sin(x * 0.01) * 5);

            // Potential: Different materials have different work functions
            // Base = 0mV. Bump (Gold) = +200mV. 
            // Region 1200-1500 (Graphene) = -300mV.
            let pot = 0;
            if (x > 500 && x < 1000) pot = 200;
            else if (x > 1200 && x < 1500) pot = -300;

            // Smooth transitions
            // ... (simplified for viz)

            this.surface.push({ x, z, potential: pot });
        }
    }

    bindControls() {
        const btnStart = document.getElementById('btn-start');
        btnStart.addEventListener('click', () => {
            this.state.isRunning = !this.state.isRunning;
            btnStart.textContent = this.state.isRunning ? "Pause" : "Start Scan";
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.state.tipX = 0;
            this.state.measuredTopo = [];
            this.state.measuredPotential = [];
            this.draw();
        });

        document.getElementById('ac-voltage').addEventListener('input', (e) => {
            document.getElementById('ac-val').textContent = e.target.value;
        });
    }

    getSurfaceAt(x) {
        if (x < 0 || x > this.config.sampleLength) return { z: 0, potential: 0 };
        const step = this.config.sampleLength / this.config.resolution;
        const idx = Math.floor(x / step);
        return this.surface[idx] || this.surface[0];
    }

    update() {
        if (!this.state.isRunning) return;

        // Move Tip
        this.state.tipX += this.config.scanSpeed;
        if (this.state.tipX > this.config.sampleLength) {
            this.state.tipX = 0;
            this.state.measuredTopo = [];
            this.state.measuredPotential = [];
        }

        // Feedback Loop (Simulated)
        // 1. Topography Feedback (Keep tip constant distance)
        const currentData = this.getSurfaceAt(this.state.tipX);
        const targetZ = currentData.z + 20; // Maintain 20nm height

        // Soft Approach
        this.state.tipZ += (targetZ - this.state.tipZ) * 0.5;

        // 2. KFM Feedback (Nullify CPD)
        // Ideally simulate lock-in, but visualizing result directly:
        const detectedPot = currentData.potential + (Math.random() - 0.5) * 10; // Noise
        this.state.potential = detectedPot;

        // Record
        if (Math.floor(this.state.tipX) % 5 === 0) {
            this.state.measuredTopo.push({ x: this.state.tipX, z: this.state.tipZ - 20 });
            this.state.measuredPotential.push({ x: this.state.tipX, p: this.state.potential });
        }

        // Update UI
        document.getElementById('z-pos-val').textContent = this.state.tipZ.toFixed(2) + ' nm';
        document.getElementById('potential-val').textContent = this.state.potential.toFixed(2) + ' mV';
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        this.ctx.fillStyle = '#f1f5f9'; // Light Background
        this.ctx.fillRect(0, 0, w, h);

        const { scaleX, offsetY, offsetX, scaleY } = this.view;
        const toScreen = (x, z) => ({ x: offsetX + x * scaleX, y: offsetY - z * scaleY });

        // 1. Draw Surface with Potential COLOR
        // We draw vertical stripes for simpler gradient viz
        const stepW = (this.config.sampleLength / this.surface.length) * scaleX + 1;

        for (let p of this.surface) {
            const sc = toScreen(p.x, p.z);
            // Map potential to color: 
            // -500mV (Blue) -> #3b82f6 (Sky Blue for light mode)
            // 0 -> #94a3b8 (Slate 400 - Neutral)
            // +500mV (Yellow) -> #eab308 (Gold)

            let color = '#94a3b8'; // Neutral Gray
            if (p.potential > 50) color = '#eab308'; // Gold
            if (p.potential < -50) color = '#3b82f6'; // Blue

            this.ctx.fillStyle = color;
            this.ctx.fillRect(sc.x, sc.y, stepW, h - sc.y);
        }

        // 2. Surface Outline
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#64748b'; // Darker stroke
        this.ctx.lineWidth = 1;
        const p0 = this.surface[0];
        let start = toScreen(p0.x, p0.z);
        this.ctx.moveTo(start.x, start.y);
        for (let p of this.surface) {
            let sc = toScreen(p.x, p.z);
            this.ctx.lineTo(sc.x, sc.y);
        }
        this.ctx.stroke();

        // 3. Draw Recorded Potential Line (Overlaid "in the air" or separately?)
        // Let's draw it Floating above
        if (this.state.measuredPotential.length > 0) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#eab308'; // Electric Yellow
            this.ctx.lineWidth = 2;

            for (let m of this.state.measuredPotential) {
                // Map potential to a Z-height for visualization
                const vizZ = 150 + (m.p / 10); // 150nm base + deflection
                const sc = toScreen(m.x, vizZ);
                if (m.x === this.state.measuredPotential[0].x) this.ctx.moveTo(sc.x, sc.y);
                else this.ctx.lineTo(sc.x, sc.y);
            }
            this.ctx.stroke();
            this.ctx.stroke();
            this.ctx.fillStyle = '#eab308';
            this.ctx.fillText("Potential Profile", 10, offsetY - 180 * scaleY);

            // Draw Region Labels
            this.ctx.font = 'bold 11px Inter';
            this.ctx.textAlign = 'center';

            const labels = [
                { x: 750, p: 200, text: "+200 mV (Au)" },
                { x: 1350, p: -300, text: "-300 mV (Gr)" }
            ];

            for (let lbl of labels) {
                // Check if scanned
                if (this.state.measuredPotential.length > 0 && this.state.measuredPotential[this.state.measuredPotential.length - 1].x > lbl.x) {
                    // Calc position. Potential is mapped to Z: 150 + p/10
                    const vizZ = 150 + (lbl.p / 10);
                    const sc = toScreen(lbl.x, vizZ);

                    const textWidth = this.ctx.measureText(lbl.text).width;
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                    this.ctx.fillRect(sc.x - textWidth / 2 - 4, sc.y - 25, textWidth + 8, 16);

                    this.ctx.fillStyle = '#111827';
                    this.ctx.fillText(lbl.text, sc.x, sc.y - 13);
                }
            }
            this.ctx.textAlign = 'left';
        }

        // 4. Draw Tip
        const tipSc = toScreen(this.state.tipX, this.state.tipZ);

        // Electrical Field Lines (if scanning)
        if (this.state.isRunning) {
            this.ctx.strokeStyle = 'rgba(234, 179, 8, 0.3)';
            this.ctx.setLineDash([2, 4]);
            this.ctx.beginPath();
            this.ctx.moveTo(tipSc.x, tipSc.y);
            this.ctx.lineTo(tipSc.x, tipSc.y + 40); // Down to surface roughly
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }

        // Cantilever Body
        this.ctx.fillStyle = '#cbd5e1';
        this.ctx.beginPath();
        this.ctx.moveTo(tipSc.x, tipSc.y);
        this.ctx.lineTo(tipSc.x - 10, tipSc.y - 30);
        this.ctx.lineTo(tipSc.x + 10, tipSc.y - 30);
        this.ctx.fill();

        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillRect(tipSc.x - 20, tipSc.y - 90, 40, 60);

    }

    loop() {
        this.update();
        this.draw();
        this.spectrum.draw(); // Draw Spectrum Graph
        requestAnimationFrame(() => this.loop());
    }
}

window.onload = () => { new KFMApplication(); };
