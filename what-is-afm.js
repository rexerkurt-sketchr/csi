
export class WhatIsAFM {
    constructor() {
        this.canvas = document.getElementById('sim-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.surfaceHeight = 0; // 0 to 100

        this.view = { scaleX: 1, offsetY: 0 };
        this.config = { sampleLength: 1000 }; // Default needed for resize logic

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        const slider = document.getElementById('surface-slider');
        slider.addEventListener('input', (e) => {
            this.surfaceHeight = parseInt(e.target.value);
            // Simulate PSD voltage readout
            const volts = (this.surfaceHeight / 20).toFixed(2);
            document.getElementById('psd-val').textContent = volts + " V";
        });

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
    draw() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);

        // Background
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, w, h);

        // Coordinates
        const centerX = w / 2;
        const surfaceY = h - 100;

        // 1. Draw Surface (with bump or pit based on slider)
        this.ctx.fillStyle = '#e2e8f0';
        this.ctx.beginPath();
        this.ctx.moveTo(0, surfaceY);

        // Scale visual for dramatic effect
        const visualH = this.surfaceHeight * 1.5;

        this.ctx.lineTo(centerX - 100, surfaceY);
        // Quadratic curve: Control point moves up or down
        // If visualH is positive -> Bump (Control point Y decreases)
        // If visualH is negative -> Pit (Control point Y increases)
        this.ctx.quadraticCurveTo(centerX, surfaceY - visualH * 2, centerX + 100, surfaceY);

        this.ctx.lineTo(w, surfaceY);
        this.ctx.lineTo(w, h);
        this.ctx.lineTo(0, h);
        this.ctx.fill();

        // 2. Draw Cantilever
        // Cantilever bends up/down as it rides the topography
        // Center of bump/pit is at 'visualH' height relative to surfaceY
        const tipLift = visualH;
        const cantileverY = surfaceY - 50 - tipLift;
        const pivotX = centerX - 300;
        const pivotY = surfaceY - 150; // Fixed base

        this.ctx.fillStyle = '#94a3b8'; // Holder
        this.ctx.fillRect(pivotX - 50, pivotY - 20, 50, 40);

        this.ctx.beginPath();
        this.ctx.strokeStyle = '#cbd5e1';
        this.ctx.lineWidth = 8;
        this.ctx.moveTo(pivotX, pivotY);
        // Quadratic curve to simulate bending
        this.ctx.quadraticCurveTo(centerX - 50, pivotY, centerX, cantileverY);
        this.ctx.stroke();

        // Tip
        this.ctx.fillStyle = '#64748b';
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - 10, cantileverY);
        this.ctx.lineTo(centerX + 10, cantileverY);
        this.ctx.lineTo(centerX, cantileverY + 40); // Tip point
        this.ctx.fill();

        // 3. Laser System
        const laserSource = { x: centerX - 150, y: 50 };
        const detector = { x: centerX + 150, y: 50 };

        // Laser Beam (Input)
        this.ctx.strokeStyle = '#ef4444'; // Red Laser
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(laserSource.x, laserSource.y);
        this.ctx.lineTo(centerX, cantileverY); // Hits back of tip
        this.ctx.stroke();

        // Laser Beam (Reflected)
        // Reflection angle changes with lift
        // More lift = angle changes slightly? 
        // For simple viz, let's just make it hit the detector, but move ON the detector based on height

        // Detector Box (PSD)
        this.ctx.fillStyle = '#334155';
        this.ctx.fillRect(detector.x - 20, detector.y - 40, 40, 80);
        // Detector Quadrants
        this.ctx.strokeStyle = '#64748b';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(detector.x - 20, detector.y);
        this.ctx.lineTo(detector.x + 20, detector.y); // Horiz slit
        this.ctx.stroke();

        // Reflected Point on Detector
        // High surface = Cantilever bends up = Spot moves UP on detector (usually)
        // Let's simulate spot Y relative to detector center
        const spotYdeflection = this.surfaceHeight * 0.6;
        const hitX = detector.x;
        const hitY = detector.y - spotYdeflection;

        this.ctx.strokeStyle = '#ef4444';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, cantileverY);
        this.ctx.lineTo(hitX, hitY);
        this.ctx.stroke();

        // Laser Dot on Detector
        this.ctx.fillStyle = '#ef4444';
        this.ctx.beginPath();
        this.ctx.arc(hitX, hitY, 4, 0, Math.PI * 2);
        this.ctx.fill();

        // Glow
        this.ctx.shadowColor = '#ef4444';
        this.ctx.shadowBlur = 10;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;

        // 4. Labels & Annotations within Canvas
        this.ctx.font = 'bold 12px Inter';
        this.ctx.textAlign = 'center';

        // Photodiode Label
        this.ctx.fillStyle = '#475569';
        this.ctx.fillText("Photodiode (PSD)", detector.x, detector.y - 65);
        // Line to detector
        this.ctx.beginPath();
        this.ctx.strokeStyle = '#94a3b8';
        this.ctx.lineWidth = 1;
        this.ctx.moveTo(detector.x, detector.y - 58);
        this.ctx.lineTo(detector.x, detector.y - 45);
        this.ctx.stroke();

        // Laser Beam Label
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillText("Laser Beam", laserSource.x + 50, laserSource.y - 10);

        // AFM Tip Label
        this.ctx.fillStyle = '#334155';
        this.ctx.textAlign = 'left';
        this.ctx.fillText("AFM Tip", centerX + 40, cantileverY + 20);
        this.ctx.beginPath();
        this.ctx.moveTo(centerX + 35, cantileverY + 16);
        this.ctx.lineTo(centerX + 15, cantileverY + 10);
        this.ctx.stroke();

        // Deflection Point Label
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fillText("Deflection Point", detector.x - 30, detector.y + 40);
        this.ctx.beginPath();
        this.ctx.moveTo(detector.x - 25, detector.y + 35);
        this.ctx.lineTo(hitX - 5, hitY + 5);
        this.ctx.stroke();

        this.ctx.textAlign = 'left'; // Reset
    }

    loop() {
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

new WhatIsAFM();
