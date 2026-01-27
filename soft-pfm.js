
export class SoftPFM {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Physics State
        this.scanX = 0;
        this.scanSpeed = 1.5;
        this.isScanning = true;
        this.cyclePhase = 0; // 0..1 for Lift-Move-Approach cycle

        // Sample Data
        this.sampleLength = 1200;
        this.profile = new Float32Array(this.sampleLength);
        this.domains = new Int8Array(this.sampleLength); // 1 = Expand, -1 = Contract

        this.config = {
            strength: 0.7, // Piezo strength
            softness: 0.5
        };

        this.generateSample();
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        document.getElementById('strength-slider').addEventListener('input', (e) => {
            this.config.strength = parseInt(e.target.value) / 100;
        });

        document.getElementById('btn-toggle-scan').addEventListener('click', (e) => {
            this.isScanning = !this.isScanning;
            e.target.textContent = this.isScanning ? "Pause Scan" : "Resume Scan";
        });

        this.loop();
    }

    generateSample() {
        // Generate "Collagen Fibril" like structure
        // Periodic height changes
        for (let i = 0; i < this.sampleLength; i++) {
            // D-banding of collagen ~67nm
            this.profile[i] = 100 + Math.sin(i * 0.05) * 15 + Math.sin(i * 0.01) * 30;

            // Domains align with structure roughly
            // Positive piezo on peaks, negative on troughs (for demo)
            this.domains[i] = Math.sin(i * 0.05) > 0 ? 1 : -1;
        }
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
    }

    update() {
        if (this.isScanning) {
            // Soft IC Cycle: Lift -> Move -> Approach -> Contact -> Retract
            this.cyclePhase += 0.02;
            if (this.cyclePhase >= 1) {
                this.cyclePhase = 0;
                this.scanX += 5; // Hop 5px
                if (this.scanX >= this.sampleLength) this.scanX = 0;
            }
        }

        // Calculate State
        // 0.0-0.3: Lift
        // 0.3-0.6: Move (High)
        // 0.6-0.8: Approach
        // 0.8-0.9: Contact & Measure
        // 0.9-1.0: Retract

        let stateText = "";
        let tipHeight = 0;
        let inContact = false;

        const sampleIdx = Math.floor(this.scanX);
        const surfaceY = this.profile[sampleIdx];

        if (this.cyclePhase < 0.3) {
            stateText = "Lift";
            const p = this.cyclePhase / 0.3;
            tipHeight = surfaceY + (p * 50);
        } else if (this.cyclePhase < 0.6) {
            stateText = "Move";
            tipHeight = surfaceY + 50;
        } else if (this.cyclePhase < 0.8) {
            stateText = "Approach";
            const p = (this.cyclePhase - 0.6) / 0.2;
            tipHeight = surfaceY + 50 - (p * 50);
        } else if (this.cyclePhase < 0.95) {
            stateText = "Contact & Measure";
            tipHeight = surfaceY; // Touch
            inContact = true;
        } else {
            stateText = "Retract";
            const p = (this.cyclePhase - 0.95) / 0.05;
            tipHeight = surfaceY + (p * 20);
        }

        // Update UI
        const bead = document.getElementById('state-bead');
        document.getElementById('state-text').textContent = stateText;

        if (inContact) {
            bead.style.backgroundColor = '#22c55e'; // Green
            bead.style.boxShadow = '0 0 10px #22c55e';

            // Read PFM
            const domain = this.domains[sampleIdx];
            const amp = (this.config.strength * 50).toFixed(1);
            const phase = domain > 0 ? "0°" : "180°";

            document.getElementById('amp-val').textContent = amp + " pm";
            document.getElementById('phase-val').textContent = phase;

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

        // 1. Draw Sample Surface
        // We draw valid window
        const drawW = w;

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

        // 1.5 Draw Sample Outline & Domains
        for (let x = 0; x < w; x += 2) {
            const worldX = Math.floor(this.scanX - centerX + x);
            if (worldX < 0 || worldX >= this.sampleLength) continue;

            const y = viewY - this.profile[worldX];

            const domain = this.domains[worldX];
            // Color based on domain
            this.ctx.fillStyle = domain > 0 ? '#fbbf24' : '#60a5fa'; // Amber / Blue
            this.ctx.fillRect(x, y, 2, 4);
        }

        // 2. Draw Tip
        const tipX = centerX;
        const tipVisualY = viewY - tipHeight;

        this.ctx.fillStyle = '#64748b';
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

        // 3. Visualization of PFM Effect (Action)
        if (inContact) {
            // Expansion Rings
            const domain = this.domains[sampleIdx];
            const color = domain > 0 ? '#f59e0b' : '#3b82f6';

            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;

            const r = 10 + (Math.sin(Date.now() * 0.02) * 2); // Pulse

            this.ctx.beginPath();
            this.ctx.arc(tipX, tipVisualY, r, 0, Math.PI * 2);
            this.ctx.stroke();

            // Label
            this.ctx.fillStyle = color;
            this.ctx.font = 'bold 12px Inter';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(domain > 0 ? "EXPANSION (0°)" : "CONTRACTION (180°)", tipX, tipVisualY - 50);
        }

    }

    loop() {
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.onload = () => { new SoftPFM(); };
