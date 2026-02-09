
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

        if (this.canvas.width === 0 || this.canvas.height === 0) return;

        this.view.scaleX = (this.canvas.width - 100) / this.config.sampleLength;
        this.view.offsetY = this.canvas.height - (this.canvas.height < 500 ? 50 : 100);
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

        this.state.tipZ = surf.z; // Tip height (Actual Contact)

        // Measurement Logic
        let rLog = surf.rLog;

        // 1. ResiScope (Full Range 2-12)
        let resiR = rLog;

        // 2. C-AFM (Limited Range)
        // Saturates below 10^6 (Too much current) and noise above 10^10 (Too little)
        let cafmR = rLog;
        let isCafmSat = false;
        if (rLog < 6) { cafmR = 6; isCafmSat = true; }
        if (rLog > 10) { cafmR = 10; isCafmSat = true; }

        // Record for graph
        if (idx % 2 === 0) {
            this.state.measuredCurr.push({
                x: this.state.tipX,
                rResi: resiR,
                rCafm: cafmR,
                cafmSat: isCafmSat
            });
        }

        // UI Updates
        const rVal = Math.pow(10, resiR);
        document.getElementById('res-val').textContent = this.formatR(rVal);

        // Show sat warning if current point is saturated
        if (isCafmSat) {
            document.getElementById('res-val').innerHTML += " <br><span style='font-size:0.7rem; color:red'>(C-AFM Saturated)</span>";
        }
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

            let color = '#1e3a8a'; // Insulator
            if (p1.rLog < 10) color = '#7c3aed'; // Semi
            if (p1.rLog < 5) color = '#f97316'; // Conductor
            if (p1.rLog < 3) color = '#facc15'; // Metal

            this.ctx.fillStyle = color;
            this.ctx.fillRect(s1.x, s1.y, (s2.x - s1.x) + 1, 100); // Filled block
        }

        // 2. Graph (Resistance) - Floating above
        if (this.state.measuredCurr.length > 0) {

            // Draw C-AFM Trace (Red/Limited)
            this.ctx.beginPath();
            this.ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)'; // Red transparent
            this.ctx.lineWidth = 4;
            for (let m of this.state.measuredCurr) {
                const normH = (m.rCafm - 2) * 15;
                const graphY = offsetY - 150 - normH;
                const sc = toScreen(m.x, 0);
                if (m.x === this.state.measuredCurr[0].x) this.ctx.moveTo(sc.x, graphY);
                else this.ctx.lineTo(sc.x, graphY);
            }
            this.ctx.stroke();

            // Draw ResiScope Trace (Green/Full)
            this.ctx.beginPath();
            this.ctx.strokeStyle = '#22c55e'; // Green
            this.ctx.lineWidth = 2;
            for (let m of this.state.measuredCurr) {
                const normH = (m.rResi - 2) * 15;
                const graphY = offsetY - 150 - normH;
                const sc = toScreen(m.x, 0);
                if (m.x === this.state.measuredCurr[0].x) this.ctx.moveTo(sc.x, graphY);
                else this.ctx.lineTo(sc.x, graphY);
            }
            this.ctx.stroke();

            this.ctx.fillStyle = '#22c55e';
            this.ctx.font = 'bold 12px Inter';
            this.ctx.fillText("ResiScope (Full Range)", 10, offsetY - 250);
            this.ctx.fillStyle = '#ef4444';
            this.ctx.fillText("Standard C-AFM (Limited)", 10, offsetY - 235);

            // Draw "Out of C-AFM Range" Labels on saturations
            this.ctx.font = 'bold 10px Inter';
            this.ctx.textAlign = 'center';

            // Check specific regions known to be out of range
            // Metal Region (High Conductive) -> C-AFM Saturates at 10^6
            // Insulator Region -> C-AFM Noise at 10^10

            // We just check current buffer for saturation events
            // To avoid flickering text, we draw static labels if the tip has passed that area

            const metalRegionX = 1500;
            if (this.state.tipX > metalRegionX) {
                const sc = toScreen(metalRegionX, 0);
                const graphY = offsetY - 150 - ((6 - 2) * 15); // Saturation level height (10^6)

                this.ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
                this.ctx.fillRect(sc.x - 50, graphY + 10, 100, 20);
                this.ctx.fillStyle = 'white';
                this.ctx.fillText("Out of C-AFM Range!", sc.x, graphY + 23);
            }

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
                if (this.state.tipX > lbl.x) {
                    const rVal = Math.pow(10, lbl.rLog);
                    const text = this.formatR(rVal);
                    const normH = (lbl.rLog - 2) * 15;
                    const graphY = offsetY - 150 - normH;
                    const sc = toScreen(lbl.x, 0);

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

new ResiScopeApp();
