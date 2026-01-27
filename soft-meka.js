
export class SoftMEKA {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.curveCanvas = document.getElementById('curve-canvas');
        this.curveCtx = this.curveCanvas.getContext('2d');

        // State
        this.scanX = 0;
        this.isScanning = true;
        this.cyclePhase = 0;

        // Sample
        this.sampleLength = 1000;
        this.profile = new Float32Array(this.sampleLength);
        this.stiffness = new Float32Array(this.sampleLength); // 0..1 (Soft..Hard)

        this.config = {
            baseStiffness: 0.3,
            forceSetpoint: 0.5
        };

        this.generateSample();
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        document.getElementById('stiffness-slider').addEventListener('input', (e) => {
            this.config.baseStiffness = parseInt(e.target.value) / 100;
            this.generateSample();
        });

        document.getElementById('force-slider').addEventListener('input', (e) => {
            this.config.forceSetpoint = parseInt(e.target.value) / 100;
        });

        document.getElementById('btn-toggle-scan').addEventListener('click', (e) => {
            this.isScanning = !this.isScanning;
            e.target.textContent = this.isScanning ? "Pause Scan" : "Resume Scan";
        });

        this.loop();
    }

    generateSample() {
        // Sample: Soft Matrix with Hard Nanospheres
        for (let i = 0; i < this.sampleLength; i++) {
            this.profile[i] = 100 + Math.sin(i * 0.02) * 20;

            // Default: Matrix (Configurable Softness)
            let k = this.config.baseStiffness;

            // Hard Spheres (Fixed Hardness ~0.9)
            // Periodic beads
            if (Math.sin(i * 0.05) > 0.6) {
                // Smooth transition
                const val = Math.sin(i * 0.05);
                k = 0.9 * val;
            }

            this.stiffness[i] = k;
        }
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
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

        // Calculate State
        let stateText = "";
        let tipHeight = 0;
        let inContact = false;
        let deformation = 0;

        const sampleIdx = Math.floor(this.scanX);
        const surfaceY = this.profile[sampleIdx];
        const localK = this.stiffness[sampleIdx];

        // Cycle: Lift -> Move -> Approach -> Contact -> Retract
        // Contact phase: Deformation depends on Force Setpoint & Stiffness

        if (this.cyclePhase < 0.3) {
            stateText = "Lift";
            const p = this.cyclePhase / 0.3;
            tipHeight = surfaceY + (p * 40);
        } else if (this.cyclePhase < 0.6) {
            stateText = "Move";
            tipHeight = surfaceY + 40;
        } else if (this.cyclePhase < 0.9) {
            stateText = "Approach";
            const p = (this.cyclePhase - 0.6) / 0.3;
            tipHeight = surfaceY + 40 - (p * 40);
        } else if (this.cyclePhase < 0.95) {
            stateText = "Indent (Measure)";
            inContact = true;
            // Deformation calc: Hooke's law approx F = k * x needed
            // Def = Force / Stiffness
            // Max force = config.forceSetpoint

            // Softer (low k) -> More deformation
            // Harder (high k) -> Less deformation

            const effectiveK = Math.max(0.1, localK); // avoid divide zero
            const def = (this.config.forceSetpoint * 20) / effectiveK;
            deformation = Math.min(def, 15); // cap

            tipHeight = surfaceY - deformation; // Sinks IN

        } else {
            stateText = "Retract";
            // Sticky logic? adhesion. Just retract.
            tipHeight = surfaceY + 10;
        }

        // UI Updates
        const bead = document.getElementById('state-bead');
        document.getElementById('state-text').textContent = stateText;

        if (inContact) {
            bead.style.backgroundColor = '#22c55e';
            bead.style.boxShadow = '0 0 10px #22c55e';

            // Values
            // k maps to GPa. 0.1 -> 1 MPa, 1.0 -> 100 GPa
            const gpa = (localK * 100).toFixed(1);
            document.getElementById('modulus-val').textContent = gpa + " GPa";
            document.getElementById('def-val').textContent = deformation.toFixed(1) + " nm";

            // Draw Curve ONCE per contact (simplified for viz: just draw constantly based on current prop)
            this.drawCurve(localK, deformation);

        } else {
            bead.style.backgroundColor = '#94a3b8';
            bead.style.boxShadow = 'none';
        }

        return { tipHeight, inContact, sampleIdx, deformation };
    }

    drawCurve(stiffness, maxDef) {
        const ctx = this.curveCtx;
        const w = this.curveCanvas.width;
        const h = this.curveCanvas.height;
        ctx.clearRect(0, 0, w, h);

        // Axes
        ctx.strokeStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.moveTo(20, 10); ctx.lineTo(20, h - 20); ctx.lineTo(w - 10, h - 20); // L shape
        ctx.stroke();

        // Curve: Force (Y) vs Indentation (X)
        // Hard sample = Steep slope (High F for small Dist)
        // Soft sample = Shallow slope

        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, h - 20); // Origin (Contact point)

        // Draw elastic region
        // x goes to maxDef
        // y goes to Setpoint (scaled)

        // Scale factor for graph
        const graphMaxX = 200; // pixels
        const graphMaxY = 100; // pixels

        // Visualize the slope
        // Soft: Large Def -> End point far right
        // Hard: Small Def -> End point near left

        // Norm def 0..20
        const xPos = 20 + (maxDef * 10);
        const yPos = (h - 20) - (this.config.forceSetpoint * graphMaxY * 1.5);

        // Approach line (flat, in air) - Optional, let's just show contact part
        // Loading curve
        ctx.quadraticCurveTo(20 + (xPos - 20) * 0.5, h - 20, xPos, yPos); // Hertzian-ish shape

        ctx.stroke();

        // Target dot
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(xPos, yPos, 4, 0, Math.PI * 2);
        ctx.fill();

        // Labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter';
        ctx.fillText("Indentation (nm)", w / 2, h - 5);
        ctx.save();
        ctx.translate(10, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText("Force (nN)", 0, 0);
        ctx.restore();
    }

    draw() {
        const { tipHeight, inContact, sampleIdx, deformation } = this.update();

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

        // 1.5 Draw Mechanical Properties (Color overlay)
        for (let x = 0; x < w; x += 2) {
            const worldX = Math.floor(this.scanX - centerX + x);
            if (worldX < 0 || worldX >= this.sampleLength) continue;

            const k = this.stiffness[worldX];
            const y = viewY - this.profile[worldX];

            // Soft = Purple, Hard = Green
            // k 0..1
            if (k > 0.6) this.ctx.fillStyle = '#86efac'; // Hard/Green
            else this.ctx.fillStyle = '#c084fc'; // Soft/Purple

            this.ctx.fillRect(x, y, 2, 8);
        }

        // 2. Draw Tip
        const tipX = centerX;
        const tipVisualY = viewY - tipHeight;

        this.ctx.fillStyle = '#64748b';

        // Deformed Surface Visual (Only at contact point)
        if (inContact) {
            // Draw indent "dent"
            this.ctx.fillStyle = '#e2e8f0'; // Shadow
            this.ctx.beginPath();
            this.ctx.ellipse(tipX, viewY - this.profile[sampleIdx], 10, deformation, 0, 0, Math.PI, false); // Half ellipse down
            this.ctx.fill();
            // Revert tip color
            this.ctx.fillStyle = '#64748b';
        }

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
    }

    loop() {
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.onload = () => { new SoftMEKA(); };
