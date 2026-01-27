
export class KPFM_Comparison {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.mode = 'standard'; // 'standard' or 'hd'

        this.scanX = 0;
        this.isScanning = true;
        this.speed = 2;
        this.sampleLength = 1000;

        // Data arrays
        this.truePotential = new Float32Array(this.sampleLength);
        this.measuredPotential = new Float32Array(this.sampleLength);

        this.config = {
            grainSize: 50
        };

        this.initUI();
        this.generateSample();

        this.traceData = [];

        this.loop();
    }

    initUI() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Mode Switch logic
        const btnStd = document.getElementById('btn-std');
        const btnHd = document.getElementById('btn-hd');

        btnStd.addEventListener('click', () => this.setMode('standard'));
        btnHd.addEventListener('click', () => this.setMode('hd'));

        document.getElementById('grain-slider').addEventListener('input', (e) => {
            this.config.grainSize = parseInt(e.target.value);
            this.generateSample();
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.scanX = 0;
            this.traceData = [];
        });
    }

    setMode(mode) {
        this.mode = mode;

        // UI Updates
        document.getElementById('btn-std').className = mode === 'standard' ? 'mode-btn active' : 'mode-btn';
        document.getElementById('btn-hd').className = mode === 'hd' ? 'mode-btn active' : 'mode-btn';

        if (mode === 'standard') {
            document.getElementById('mode-title').textContent = "Standard AM-KPFM";
            document.getElementById('mode-desc').innerHTML = "Uses <strong>Amplitude Modulation</strong>. The cantilever detects long-range forces (stray capacitance), causing a <strong>averaging effect</strong> that blurs small details.";
            document.getElementById('res-val').textContent = "~20 mV (Blurred)";
            document.getElementById('res-val').style.color = "#64748b";
            document.getElementById('edu-title').textContent = "Standard KPFM (AM)";
            // Add blur to measured
            this.applyBlur();
        } else {
            document.getElementById('mode-title').textContent = "HD-KFM (FM-sidebands)";
            document.getElementById('mode-desc').innerHTML = "Uses <strong>Frequency Modulation</strong> on the 2nd Eigenmode. This is sensitive only to the <strong>tip apex</strong> force, eliminating stray capacitance for <strong>atomic-scale resolution</strong>.";
            document.getElementById('res-val').textContent = "<5 mV (Sharp)";
            document.getElementById('res-val').style.color = "#16a34a"; // Green
            document.getElementById('edu-title').textContent = "HD-KFM (High Def)";
            // Sharp measure
            this.applyBlur(); // Will apply identity or sharpen
        }
    }

    generateSample() {
        // Generate "Polycrystalline" structure
        // Random grains with sharp boundaries
        let currentPot = 4.5;
        let timeInGrain = 0;

        for (let i = 0; i < this.sampleLength; i++) {
            if (timeInGrain <= 0) {
                // New grain
                currentPot = 4.2 + Math.random() * 1.0; // 4.2 to 5.2 eV
                timeInGrain = this.config.grainSize + (Math.random() * 50);
            }

            this.truePotential[i] = currentPot;
            timeInGrain--;
        }

        this.applyBlur();
    }

    applyBlur() {
        // Calculate "Measured" based on mode
        if (this.mode === 'standard') {
            // Apply Box/Gaussian Blur to simulate Stray Capacitance (averaging)
            const kernelSize = 40; // Large blur radius
            for (let i = 0; i < this.sampleLength; i++) {
                let sum = 0;
                let count = 0;
                for (let k = -kernelSize; k <= kernelSize; k++) {
                    const idx = i + k;
                    if (idx >= 0 && idx < this.sampleLength) {
                        // Weight could be gaussian, but box is fine for demo
                        sum += this.truePotential[idx];
                        count++;
                    }
                }
                this.measuredPotential[i] = sum / count;
            }
        } else {
            // HD Mode: Almost raw data (very slight sensor lag maybe)
            // Near perfect copy
            for (let i = 0; i < this.sampleLength; i++) {
                // Maybe add tiny noise for realism, but keep sharp edges
                this.measuredPotential[i] = this.truePotential[i];
            }
        }
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
    }

    update() {
        if (!this.isScanning) return;

        this.scanX += this.speed;
        if (this.scanX >= this.sampleLength) {
            this.scanX = 0;
            this.traceData = [];
        }

        const idx = Math.floor(this.scanX);
        const trueV = this.truePotential[idx] || 4.5;
        const measV = this.measuredPotential[idx] || 4.5;

        this.traceData.push({ true: trueV, meas: measV });
        if (this.traceData.length > this.canvas.width) {
            this.traceData.shift();
        }
    }

    draw() {
        this.update();

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        const graphH = h * 0.5;
        const surfY = h - 60;

        // --- 1. Graph ---
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.fillRect(0, 0, w, graphH);

        // Grid
        this.ctx.strokeStyle = '#e2e8f0';
        this.ctx.beginPath();
        this.ctx.moveTo(0, graphH / 2); this.ctx.lineTo(w, graphH / 2);
        this.ctx.stroke();

        // Draw True Trace (Dotted/Faint)
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'; // Slate 400 faint
        this.ctx.setLineDash([5, 5]);
        this.ctx.lineWidth = 2;
        for (let i = 0; i < this.traceData.length; i++) {
            const v = this.traceData[i].true;
            const y = this.mapVoltageToY(v, graphH);
            if (i === 0) this.ctx.moveTo(i, y); else this.ctx.lineTo(i, y);
        }
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw Measured Trace (Solid)
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.mode === 'hd' ? '#f59e0b' : '#64748b'; // Gold for HD, Grey for Std
        this.ctx.lineWidth = 2;
        for (let i = 0; i < this.traceData.length; i++) {
            const v = this.traceData[i].meas;
            const y = this.mapVoltageToY(v, graphH);
            if (i === 0) this.ctx.moveTo(i, y); else this.ctx.lineTo(i, y);
        }
        this.ctx.stroke();

        // Labels
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.font = '10px Inter';
        this.ctx.fillText("True Potential (Surface)", 10, 15);
        this.ctx.fillStyle = this.mode === 'hd' ? '#f59e0b' : '#64748b';
        this.ctx.fillText("Measured Potential", 10, 30);


        // --- 2. Surface Scan ---
        const viewW = w;
        const drawStartX = this.scanX - viewW / 2;

        for (let x = 0; x < w; x += 2) {
            const sampleIdx = Math.floor(drawStartX + x);
            if (sampleIdx < 0 || sampleIdx >= this.sampleLength) continue;

            // We draw the TRUE potential surface to show what the tip is passing over
            const pot = this.truePotential[sampleIdx];

            // Mapping
            const val = (pot - 4.2) / 1.0;
            const r = Math.floor(val * 255);
            const g = Math.floor(val * 200);

            this.ctx.fillStyle = `rgb(${r},${g},50)`;
            this.ctx.fillRect(x, surfY, 2, 60);
        }

        // Draw Tip
        const tipX = w / 2;
        const tipY = surfY - 40;

        this.ctx.fillStyle = '#94a3b8';
        this.ctx.beginPath();
        this.ctx.moveTo(tipX, tipY + 30);
        this.ctx.lineTo(tipX - 15, tipY);
        this.ctx.lineTo(tipX + 15, tipY);
        this.ctx.fill();

        // Visualize Stray Cap in Standard Mode
        if (this.mode === 'standard') {
            this.ctx.fillStyle = 'rgba(100, 116, 139, 0.2)'; // Faint cone
            this.ctx.beginPath();
            this.ctx.moveTo(tipX, tipY + 30);
            this.ctx.lineTo(tipX - 50, surfY);
            this.ctx.lineTo(tipX + 50, surfY);
            this.ctx.fill();
            this.ctx.fillStyle = '#1e293b';
            this.ctx.fillText("Stray Cap AVG", tipX + 60, surfY - 10);
        } else {
            // HD Mode - Sharp connection
            this.ctx.strokeStyle = '#f59e0b';
            this.ctx.beginPath();
            this.ctx.moveTo(tipX, tipY + 30);
            this.ctx.lineTo(tipX, surfY);
            this.ctx.stroke();
            this.ctx.fillStyle = '#f59e0b';
            this.ctx.fillText("Direct Apex", tipX + 10, surfY - 30);
        }

    }

    mapVoltageToY(v, h) {
        // Map 4.0 .. 5.5 to height
        const range = 1.5;
        const mid = 4.75;
        const norm = (v - mid) / range;
        return (h / 2) - (norm * h * 0.8);
    }

    loop() {
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.onload = () => { new KPFM_Comparison(); };
