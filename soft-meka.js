
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

        // F-D Curve Buffers (Double Buffering)
        this.liveCurve = [];
        this.lastCurve = [];

        this.config = {
            baseStiffness: 0.3,
            forceSetpoint: 0.5
        };

        this.view = { scaleX: 1, offsetY: 0 };

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
        for (let i = 0; i < this.sampleLength; i++) {
            this.profile[i] = 100 + Math.sin(i * 0.02) * 20;
            let k = this.config.baseStiffness;
            if (Math.sin(i * 0.05) > 0.6) {
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

                // Commit Curve
                if (this.liveCurve.length > 10) {
                    this.lastCurve = [...this.liveCurve];
                }
                this.liveCurve = [];
            }
        }

        let stateText = "";
        let tipHeight = 0;
        let inContact = false;
        let deformation = 0;
        let force = 0;

        const sampleIdx = Math.floor(this.scanX);
        const surfaceY = this.profile[sampleIdx];
        const localK = this.stiffness[sampleIdx];

        const angle = this.cyclePhase * Math.PI * 2;
        const oscillation = Math.cos(angle);

        const hoverZ = surfaceY + 40;
        const amplitude = 50;
        let rawTipZ = hoverZ - (amplitude * (1 - oscillation) * 0.5);

        const isRetract = Math.sin(angle) > 0;

        if (rawTipZ < surfaceY) {
            inContact = true;
            stateText = "Indent (Contact)";
            const effectiveK = Math.max(0.1, localK);
            const penetration = surfaceY - rawTipZ;

            let contactForce = penetration * effectiveK * 2.0;
            if (!isRetract) contactForce *= 1.1;
            else contactForce *= 0.8;

            force = contactForce;
            deformation = force / (effectiveK * 2.0);
            tipHeight = surfaceY - deformation;
        } else {
            inContact = false;
            stateText = isRetract ? "Retract" : "Approach";
            tipHeight = rawTipZ;

            if (isRetract && rawTipZ < surfaceY + 15) {
                const dist = rawTipZ - surfaceY;
                force = -0.3 * (1.0 - (dist / 15));
                stateText = "Adhesion";
            } else {
                force = 0;
            }
        }

        const zPos = rawTipZ - surfaceY;

        this.liveCurve.push({
            z: zPos,
            f: force,
            isRetract: isRetract
        });

        // UI
        const bead = document.getElementById('state-bead');
        document.getElementById('state-text').textContent = stateText;

        if (inContact) {
            bead.style.backgroundColor = '#22c55e';
            bead.style.boxShadow = '0 0 10px #22c55e';
            const gpa = (localK * 100).toFixed(1);
            document.getElementById('modulus-val').textContent = gpa + " GPa";
            document.getElementById('def-val').textContent = deformation.toFixed(1) + " nm";
        } else {
            bead.style.backgroundColor = '#94a3b8';
            bead.style.boxShadow = 'none';
        }

        return { tipHeight, inContact, sampleIdx, deformation, currentZ: zPos, currentF: force };
    }

    drawCurve(currentZ, currentF) {
        const ctx = this.curveCtx;
        const w = this.curveCanvas.width;
        const h = this.curveCanvas.height;
        ctx.clearRect(0, 0, w, h);

        // Layout Config (Fixed Box)
        const margin = { top: 10, right: 10, bottom: 25, left: 35 };
        const graphW = w - margin.left - margin.right;
        const graphH = h - margin.top - margin.bottom;

        // Viewport Ranges
        const zMin = -10; // Indentation
        const zMax = 20;  // Lift (Clipped, originally 50)
        const fMin = -0.5;
        const fMax = 1.0;

        // Mappers
        const mapX = (z) => {
            const norm = (z - zMin) / (zMax - zMin);
            return margin.left + (norm * graphW);
        };
        const mapY = (f) => {
            const norm = (f - fMin) / (fMax - fMin);
            return (margin.top + graphH) - (norm * graphH); // Invert Y
        };

        // 1. Draw Axes (Box)
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Left Axis (Force)
        ctx.moveTo(margin.left, margin.top);
        ctx.lineTo(margin.left, h - margin.bottom);
        // Bottom Axis (Z)
        ctx.moveTo(margin.left, h - margin.bottom);
        ctx.lineTo(w - margin.right, h - margin.bottom);
        ctx.stroke();

        // 2. Zero Lines (Grid)
        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        // Force = 0
        const yZero = mapY(0);
        ctx.moveTo(margin.left, yZero); ctx.lineTo(w - margin.right, yZero);
        // Z = 0
        const xZero = mapX(0);
        ctx.moveTo(xZero, margin.top); ctx.lineTo(xZero, h - margin.bottom);
        ctx.stroke();

        // 3. Draw Curve
        const curve = this.lastCurve.length > 5 ? this.lastCurve : this.liveCurve;

        const drawSegment = (c, color, isRetractSeg) => {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            let started = false;
            for (let pt of c) {
                // Filter logic
                if (pt.isRetract !== isRetractSeg) continue;
                // Clip logic
                if (pt.z > zMax) continue; // Don't draw if too far

                const x = mapX(pt.z);
                const y = mapY(pt.f);

                // Canvas clipping safety
                if (x < margin.left || x > w - margin.right) continue;

                if (!started) { ctx.moveTo(x, y); started = true; }
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };

        if (curve.length > 1) {
            drawSegment(curve, '#3b82f6', false); // Trace (Blue)
            drawSegment(curve, '#ef4444', true);  // Retrace (Red)
        }

        // 4. Tracking Dot
        if (currentZ !== undefined && currentZ <= zMax) {
            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.arc(mapX(currentZ), mapY(currentF), 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // 5. Labels
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter';

        // X Label
        ctx.textAlign = 'center';
        ctx.fillText("Tip Z (nm)", margin.left + (graphW / 2), h - 5);

        // Y Label
        ctx.save();
        ctx.translate(10, margin.top + (graphH / 2));
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText("Force (nN)", 0, 0);
        ctx.restore();

        // Ticks (Simple)
        ctx.textAlign = 'right';
        ctx.fillText("0", margin.left - 4, yZero + 3);
        ctx.textAlign = 'center';
        ctx.fillText("0", xZero, h - margin.bottom + 10);
    }

    draw() {
        const { tipHeight, inContact, sampleIdx, deformation, currentZ, currentF } = this.update();

        this.drawCurve(currentZ, currentF);

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        const centerX = w / 2;
        const viewY = h - 100;

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

        for (let x = 0; x < w; x += 2) {
            const worldX = Math.floor(this.scanX - centerX + x);
            if (worldX < 0 || worldX >= this.sampleLength) continue;

            const k = this.stiffness[worldX];
            const y = viewY - this.profile[worldX];
            if (k > 0.6) this.ctx.fillStyle = '#86efac';
            else this.ctx.fillStyle = '#c084fc';
            this.ctx.fillRect(x, y, 2, 8);
        }

        const tipX = centerX;
        const tipVisualY = viewY - tipHeight;
        this.ctx.fillStyle = '#64748b';
        if (inContact) {
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.beginPath();
            this.ctx.ellipse(tipX, viewY - this.profile[sampleIdx], 10, deformation, 0, 0, Math.PI, false);
            this.ctx.fill();
            this.ctx.fillStyle = '#64748b';
        }
        this.ctx.beginPath();
        this.ctx.moveTo(tipX, tipVisualY);
        this.ctx.lineTo(tipX - 10, tipVisualY - 30);
        this.ctx.lineTo(tipX + 10, tipVisualY - 30);
        this.ctx.fill();
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

new SoftMEKA();
