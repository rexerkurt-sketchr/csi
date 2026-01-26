
export class ResiScopeApp {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');

        this.config = {
            scanSpeed: 2.0,
            resolution: 400,
            sampleLength: 2000
        };

        this.state = {
            isRunning: false,
            tipX: 0,
            tipZ: 100, // Starts in air
            mode: 'resiscope', // 'resiscope' or 'cafm'
            measuredRes: [],
            measuredCurr: [] // Log current
        };

        this.surface = [];
        this.view = { scaleX: 1, scaleY: 2, offsetX: 50, offsetY: 300 };

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.generateSurface();
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
        // A surface with extreme transitions: Insulator -> Semiconductor -> Conductor
        for (let x = 0; x <= this.config.sampleLength; x += 5) {
            let z = 50 + Math.sin(x * 0.01) * 5;

            // Resistance Simulation (Log Scale val 2 to 12)
            // 2 = 100 Ohm (Conductor)
            // 12 = 1 TeraOhm (Insulator)
            let resistanceLog = 12;

            if (x > 300 && x < 600) resistanceLog = 9; // Semi-insulating
            if (x > 800 && x < 1200) resistanceLog = 4; // Conductor (Low R)
            if (x > 1400 && x < 1600) resistanceLog = 2; // Metal (Very Low R)

            this.surface.push({ x, z, rLog: resistanceLog });
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
            this.state.measuredCurr = [];
            this.draw();
        });

        document.getElementById('mode-select').addEventListener('change', (e) => {
            this.state.mode = e.target.value;
        });

        document.getElementById('bias-voltage').addEventListener('input', (e) => {
            document.getElementById('bias-val').textContent = e.target.value;
        });
    }

    update() {
        if (!this.state.isRunning) return;

        // Move Tip
        this.state.tipX += this.config.scanSpeed;
        if (this.state.tipX > this.config.sampleLength) {
            this.state.tipX = 0;
            this.state.measuredCurr = [];
        }

        // Contact Mode Logic: Tip Z = Surface Z
        const step = 5;
        const idx = Math.floor(this.state.tipX / step);
        const surf = this.surface[idx] || this.surface[0];

        this.state.tipZ = surf.z + 10; // Tip height (virtual)

        // Measurement Logic
        let rLog = surf.rLog;
        let visibleR = rLog;
        let isSaturated = false;

        // C-AFM Limitation Simulation
        if (this.state.mode === 'cafm') {
            // C-AFM usually has fixed gain range, e.g., 6 decades.
            // Let's say it can only see 10^6 to 10^10.
            // Below 6 (Conductor) -> Saturates (Too much current)
            // Above 10 (Insulator) -> Noise floor
            if (rLog < 6) { visibleR = 6; isSaturated = true; } // Saturation
            if (rLog > 10) visibleR = 10; // Noise
        }

        // Record for graph
        if (idx % 2 === 0) {
            this.state.measuredCurr.push({
                x: this.state.tipX,
                r: visibleR,
                sat: isSaturated
            });
        }

        // UI Updates
        const rVal = Math.pow(10, visibleR);
        document.getElementById('res-val').textContent = isSaturated ? "SATURATION" : this.formatR(rVal);
        document.getElementById('res-val').style.color = isSaturated ? '#ef4444' : '#22c55e';
    }

    formatR(ohms) {
        if (ohms >= 1e9) return (ohms / 1e9).toFixed(1) + " GΩ";
        if (ohms >= 1e6) return (ohms / 1e6).toFixed(1) + " MΩ";
        if (ohms >= 1e3) return (ohms / 1e3).toFixed(1) + " kΩ";
        return ohms.toFixed(0) + " Ω";
    }

    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, w, h);

        const { scaleX, offsetY, offsetX, scaleY } = this.view;
        const toScreen = (x, z) => ({ x: offsetX + x * scaleX, y: offsetY - z * scaleY });

        // 1. Surface (Cross Section)
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#94a3b8';
        this.ctx.lineWidth = 1;

        // Draw colored segments based on true resistance
        for (let i = 0; i < this.surface.length - 1; i++) {
            const p1 = this.surface[i];
            const p2 = this.surface[i + 1];
            const s1 = toScreen(p1.x, p1.z);
            const s2 = toScreen(p2.x, p2.z);

            // Color based on R (Mapping Visualization)
            // Heatmap style:
            // Insulator (High R) -> Dark Blue (#1e3a8a)
            // Semi -> Purple (#7c3aed)
            // Conductor (Low R) -> Orange (#f97316)
            // Metal (Very Low R) -> Yellow (#facc15)

            let color = '#1e3a8a'; // Insulator
            if (p1.rLog < 10) color = '#7c3aed'; // Semi
            if (p1.rLog < 5) color = '#f97316'; // Conductor
            if (p1.rLog < 3) color = '#facc15'; // Metal

            this.ctx.fillStyle = color;
            this.ctx.fillRect(s1.x, s1.y, (s2.x - s1.x) + 1, 100); // Filled block
        }

        // 2. Graph (Resistance/Current) - Floating above
        if (this.state.measuredCurr.length > 0) {
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#22c55e';
            this.ctx.lineWidth = 2;

            for (let m of this.state.measuredCurr) {
                // Map log R to Y (Inverse of current basically)
                // Low R = High Y (High Current)
                // Range 2 (High I) to 12 (Low I)
                // Y=0 -> R=12, Y=max -> R=2
                const normH = (12 - m.r) * 15; // Scale factor
                const graphY = offsetY - 150 - normH;

                const sc = toScreen(m.x, 0);
                // Override X to match screen

                if (m.x === this.state.measuredCurr[0].x) this.ctx.moveTo(sc.x, graphY);
                else this.ctx.lineTo(sc.x, graphY);

                if (m.sat) {
                    // Draw red marker for saturation
                    this.ctx.fillStyle = 'red';
                    this.ctx.fillRect(sc.x, graphY - 2, 2, 4);
                }
            }
            this.ctx.stroke();
            this.ctx.fillStyle = '#22c55e';
            this.ctx.fillText("Current (Log I)", 10, offsetY - 250);

            // Draw Region Labels if scanned
            this.ctx.font = 'bold 11px Inter';
            this.ctx.fillStyle = '#1d1d1f';
            this.ctx.textAlign = 'center';

            // Define centers of regions to label
            const labels = [
                { x: 150, rLog: 12 }, // Insulator
                { x: 450, rLog: 9 },  // Semi
                { x: 1000, rLog: 4 }, // Conductor
                { x: 1500, rLog: 2 }  // Metal
            ];

            for (let lbl of labels) {
                // Check if we have measured this point (approx)
                // We scan continuously, so just check tipX > lbl.x
                if (this.state.tipX > lbl.x || (this.state.measureCurr && this.state.measureCurr.length > 0 && this.state.measureCurr[this.state.measureCurr.length - 1].x > lbl.x)) {
                    // Check existing measure data to be sure or just use static knowledge since deterministic
                    // Let's rely on tipX for simplicity

                    const rVal = Math.pow(10, lbl.rLog);
                    const text = this.formatR(rVal);

                    // Calc Y pos same as graph
                    const normH = (12 - lbl.rLog) * 15;
                    const graphY = offsetY - 150 - normH;
                    const sc = toScreen(lbl.x, 0);

                    // Draw Label Box
                    const textWidth = this.ctx.measureText(text).width;
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    this.ctx.fillRect(sc.x - textWidth / 2 - 4, graphY - 20, textWidth + 8, 16);
                    this.ctx.fillStyle = '#111827';
                    this.ctx.fillText(text, sc.x, graphY - 8);
                }
            }
            this.ctx.textAlign = 'left'; // Reset
        }

        // 3. Tip
        const tipSc = toScreen(this.state.tipX, this.state.tipZ); // Contact height
        this.ctx.fillStyle = '#cbd5e1';
        this.ctx.beginPath();
        this.ctx.moveTo(tipSc.x, tipSc.y);
        this.ctx.lineTo(tipSc.x - 10, tipSc.y - 40); // Standard cantilever angle
        this.ctx.lineTo(tipSc.x + 10, tipSc.y - 40);
        this.ctx.fill();

    }

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

window.onload = () => { new ResiScopeApp(); };
