
export class SoftSThM {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        // State
        this.scanX = 0;
        this.isScanning = true;
        this.cyclePhase = 0;

        // Sample
        this.sampleLength = 1000;
        this.profile = new Float32Array(this.sampleLength);
        this.conductivity = new Float32Array(this.sampleLength); // 0..1

        this.config = {
            tipTemp: 400,
            contrast: 0.7
        };

        this.view = { scaleX: 1, offsetY: 0 };

        this.generateSample();
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        document.getElementById('temp-slider').addEventListener('input', (e) => {
            this.config.tipTemp = parseInt(e.target.value);
            document.getElementById('temp-val').textContent = this.config.tipTemp + ".0 K";
        });

        document.getElementById('contrast-slider').addEventListener('input', (e) => {
            this.config.contrast = parseInt(e.target.value) / 100;
        });

        document.getElementById('btn-toggle-scan').addEventListener('click', (e) => {
            this.isScanning = !this.isScanning;
            e.target.textContent = this.isScanning ? "Pause Scan" : "Resume Scan";
        });

        this.loop();
    }

    generateSample() {
        // Sample: Polymer Blend (Insulating Matrix with Conductive Fillers)
        for (let i = 0; i < this.sampleLength; i++) {
            this.profile[i] = 80 + Math.sin(i * 0.03) * 10;

            // Default: Polymer (Low Cond ~0.2)
            let cond = 0.2;

            // Fillers (High Cond ~0.9)
            if (Math.sin(i * 0.1) > 0.8 || Math.sin(i * 0.02 + 1) > 0.9) {
                cond = 0.9;
            }

            this.conductivity[i] = cond;
        }
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;

        if (this.canvas.width === 0 || this.canvas.height === 0) return;

        this.view.scaleX = (this.canvas.width - 100) / this.config.sampleLength;
        this.view.offsetY = this.canvas.height - (this.canvas.height < 500 ? 50 : 100);
    }

    update() {
        if (this.isScanning) {
            this.cyclePhase += 0.02;
            if (this.cyclePhase >= 1) {
                this.cyclePhase = 0;
                this.scanX += 5;
                if (this.scanX >= this.sampleLength) this.scanX = 0;
            }
        }

        // Calculate State (Soft Cycle)
        let stateText = "";
        let tipHeight = 0;
        let inContact = false;

        const sampleIdx = Math.floor(this.scanX);
        const surfaceY = this.profile[sampleIdx];

        if (this.cyclePhase < 0.3) {
            stateText = "Lift";
            const p = this.cyclePhase / 0.3;
            tipHeight = surfaceY + (p * 40);
        } else if (this.cyclePhase < 0.6) {
            stateText = "Move";
            tipHeight = surfaceY + 40;
        } else if (this.cyclePhase < 0.8) {
            stateText = "Approach";
            const p = (this.cyclePhase - 0.6) / 0.2;
            tipHeight = surfaceY + 40 - (p * 40);
        } else if (this.cyclePhase < 0.95) {
            stateText = "Measure (Heat Flow)";
            tipHeight = surfaceY;
            inContact = true;
        } else {
            stateText = "Retract";
            const p = (this.cyclePhase - 0.95) / 0.05;
            tipHeight = surfaceY + (p * 10);
        }

        // UI Updates
        const bead = document.getElementById('state-bead');
        document.getElementById('state-text').textContent = stateText;

        if (inContact) {
            bead.style.backgroundColor = '#ef4444'; // Hot Red
            bead.style.boxShadow = '0 0 10px #ef4444';

            const rawCond = this.conductivity[sampleIdx];
            // Display value
            const disp = rawCond > 0.5 ? "High (Conductive)" : "Low (Insulating)";
            // Fake W/mK
            const val = rawCond * 100 * this.config.contrast;

            document.getElementById('cond-val').textContent = val.toFixed(2) + " W/mK";
        } else {
            bead.style.backgroundColor = '#94a3b8';
            bead.style.boxShadow = 'none';
        }

        return { tipHeight, inContact, sampleIdx };
    }

    draw() {
        const { tipHeight, inContact, sampleIdx } = this.update();

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        const centerX = w / 2;
        const viewY = h - 100;

        // 1. Draw Surface
        this.ctx.beginPath();
        this.ctx.moveTo(0, h);
        for (let x = 0; x < w; x += 2) {
            const worldX = Math.floor(this.scanX - centerX + x);
            if (worldX < 0 || worldX >= this.sampleLength) {
                this.ctx.lineTo(x, h);
                continue;
            }
            const y = viewY - this.profile[worldX];
            this.ctx.lineTo(x, y);
        }
        this.ctx.lineTo(w, h);
        this.ctx.fillStyle = '#f1f5f9';
        this.ctx.fill();

        // 1.5 Draw Thermal Domains (Color overlay)
        for (let x = 0; x < w; x += 2) {
            const worldX = Math.floor(this.scanX - centerX + x);
            if (worldX < 0 || worldX >= this.sampleLength) continue;

            const cond = this.conductivity[worldX];
            const y = viewY - this.profile[worldX];

            // Low Cond = Pale Blue, High Cond = Bright Red/Orange
            if (cond > 0.5) this.ctx.fillStyle = '#fca5a5'; // Conductive hint
            else this.ctx.fillStyle = '#e2e8f0'; // Normal

            this.ctx.fillRect(x, y, 2, 10);
        }

        // 2. Draw Tip
        const tipX = centerX;
        const tipVisualY = viewY - tipHeight;

        // Hot Tip Color
        // Scale redness with temp
        const tempRatio = (this.config.tipTemp - 300) / 200;
        const r = 100 + (tempRatio * 155);
        this.ctx.fillStyle = `rgb(${r}, 100, 100)`;

        this.ctx.beginPath();
        this.ctx.moveTo(tipX, tipVisualY);
        this.ctx.lineTo(tipX - 10, tipVisualY - 30);
        this.ctx.lineTo(tipX + 10, tipVisualY - 30);
        this.ctx.fill();

        // Cantilever
        this.ctx.strokeStyle = '#94a3b8';
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(tipX, tipVisualY - 30);
        this.ctx.lineTo(tipX + 100, tipVisualY - 50);
        this.ctx.stroke();

        // 3. Visualization: Heat Flow
        if (inContact) {
            const cond = this.conductivity[sampleIdx];

            // Heat Gradient
            const grad = this.ctx.createRadialGradient(tipX, tipVisualY, 0, tipX, tipVisualY, 40);

            if (cond > 0.5) {
                // High Flow (Conductor)
                grad.addColorStop(0, 'rgba(239, 68, 68, 0.8)'); // Red hot center
                grad.addColorStop(1, 'rgba(239, 68, 68, 0)');

                // Particles indicating flow
                this.ctx.fillStyle = '#ef4444';
                for (let k = 0; k < 5; k++) {
                    const px = tipX + (Math.random() - 0.5) * 20;
                    const py = tipVisualY + Math.random() * 20; // Flowing DOWN into sample
                    this.ctx.fillRect(px, py, 2, 2);
                }

            } else {
                // Low Flow (Insulator) - Heat stays trapped in tip largely
                grad.addColorStop(0, 'rgba(251, 146, 60, 0.4)'); // Orange weak
                grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
            }

            this.ctx.fillStyle = grad;
            this.ctx.beginPath();
            this.ctx.arc(tipX, tipVisualY, 30, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }

    loop() {
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

new SoftSThM();
