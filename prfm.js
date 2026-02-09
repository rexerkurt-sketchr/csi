
export class PRFM_Comparison {
    constructor() {
        this.stdCanvas = document.getElementById('std-canvas');
        this.softCanvas = document.getElementById('soft-canvas');
        this.stdCtx = this.stdCanvas.getContext('2d');
        this.softCtx = this.softCanvas.getContext('2d');

        this.scanX = 0;
        this.speed = 3;
        this.sampleLength = 800;

        this.stdProfile = new Float32Array(this.sampleLength);
        this.softProfile = new Float32Array(this.sampleLength);
        this.baseProfile = new Float32Array(this.sampleLength);

        this.cyclePhase = 0; // 0..1 for cycle

        this.generateSample();
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        document.getElementById('speed-slider').addEventListener('input', (e) => {
            this.speed = parseInt(e.target.value);
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.scanX = 0;
            // Restore damage
            for (let i = 0; i < this.sampleLength; i++) {
                this.stdProfile[i] = this.baseProfile[i];
            }
        });

        this.loop();
    }

    generateSample() {
        for (let i = 0; i < this.sampleLength; i++) {
            // Fragile polymer strands
            const h = 50 + Math.sin(i * 0.05) * 10 + Math.cos(i * 0.02) * 5;
            this.baseProfile[i] = h;
            this.stdProfile[i] = h;
            this.softProfile[i] = h;
        }
    }

    resize() {
        if (!this.stdCanvas || !this.softCanvas) return;

        const p = this.stdCanvas.parentElement;
        this.stdCanvas.width = p.clientWidth;
        this.stdCanvas.height = p.clientHeight;

        const p2 = this.softCanvas.parentElement;
        this.softCanvas.width = p2.clientWidth;
        this.softCanvas.height = p2.clientHeight;
    }

    update() {
        // Cycle Logic
        // Determine phase
        const speedFactor = (this.speed / 3);
        this.cyclePhase += 0.02 * speedFactor;

        if (this.cyclePhase >= 1) {
            this.cyclePhase = 0;
            // Hop Step
            this.scanX += 4;
            if (this.scanX >= this.sampleLength) this.scanX = 0;
        }

        // --- Damage Logic ---
        // Runs constantly for Standard side as long as we are moving
        // We simulate that Standard is ALWAYS dragging.
        // Even if scanX hops (for visual sync), the damage area is effectively "swept"

        const tipIdx = Math.floor(this.scanX);
        const damageWidth = 10;

        if (Math.random() > 0.5) { // Damage probability per frame
            for (let i = tipIdx - damageWidth; i < tipIdx + damageWidth; i++) {
                if (i >= 0 && i < this.sampleLength) {
                    // Erode
                    if (Math.random() > 0.9) this.stdProfile[i] -= 0.1;
                    // Tear
                    if (Math.random() > 0.98) this.stdProfile[i] += (Math.random() - 0.5) * 2;
                }
            }
        }
    }

    draw() {
        this.update();
        if (this.stdCanvas.width === 0) return; // safety

        this.drawSystem(this.stdCtx, this.stdCanvas.width, this.stdCanvas.height, this.stdProfile, 'standard');
        this.drawSystem(this.softCtx, this.softCanvas.width, this.softCanvas.height, this.softProfile, 'soft');
    }

    drawSystem(ctx, w, h, profile, mode) {
        ctx.clearRect(0, 0, w, h);

        const centerX = w / 2;
        const viewY = h - 100;

        // Draw Surface
        ctx.beginPath();
        ctx.moveTo(0, h);

        const drawLimit = w;
        for (let x = 0; x < drawLimit; x += 2) {
            const worldX = Math.floor(this.scanX - centerX + x);

            // Loop or Clamp? Let's just crop
            if (worldX < 0 || worldX >= this.sampleLength) {
                ctx.lineTo(x, h);
                continue;
            }

            const val = profile[worldX];
            if (val === undefined) {
                ctx.lineTo(x, h);
                continue;
            }

            const y = viewY - val;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);

        ctx.fillStyle = (mode === 'standard') ? '#ffe4e6' : '#dcfce7';
        ctx.fill();

        // Draw Tip
        const tipX = centerX;
        const currentH = profile[Math.floor(this.scanX)] || 0;
        const currentY = viewY - currentH;
        let tipY = currentY;

        if (mode === 'soft') {
            // Cycle Viz
            // 0.0-0.3 Lift, 0.3-0.5 Move, 0.5-0.8 Appr, 0.8-0.95 Cont
            if (this.cyclePhase < 0.3) {
                const p = this.cyclePhase / 0.3;
                tipY = currentY - (p * 40);
            } else if (this.cyclePhase < 0.5) {
                tipY = currentY - 40;
            } else if (this.cyclePhase < 0.8) {
                const p = (this.cyclePhase - 0.5) / 0.3;
                tipY = (currentY - 40) + (p * 40);
            } else if (this.cyclePhase < 0.95) {
                tipY = currentY;
            } else {
                tipY = currentY - 5;
            }
        } else {
            // Standard: Always Dragging
            // Jitter
            tipY = currentY + (Math.random() - 0.5) * 3;

            // Lateral Force Arrow
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tipX - 20, tipY - 50);
            ctx.lineTo(tipX + 20, tipY - 50);
            ctx.lineTo(tipX + 15, tipY - 55);
            ctx.moveTo(tipX + 20, tipY - 50);
            ctx.lineTo(tipX + 15, tipY - 45);
            ctx.stroke();

            ctx.fillStyle = '#dc2626';
            ctx.font = 'bold 10px Inter';
            ctx.textAlign = 'center';
            ctx.fillText("LATERAL FORCE", tipX, tipY - 60);
        }

        // Tip Body
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - 15, tipY - 40);
        ctx.lineTo(tipX + 15, tipY - 40);
        ctx.fill();

        // Cantilever
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY - 40);
        ctx.lineTo(tipX + 100, tipY - 60);
        ctx.stroke();

        // Effects
        ctx.textAlign = 'center';
        if (mode === 'standard') {
            // Debris
            ctx.fillStyle = '#dc2626';
            for (let k = 0; k < 3; k++) {
                const dx = (Math.random() - 0.5) * 30;
                const dy = -Math.random() * 30;
                ctx.fillRect(tipX + dx, tipY + dy, 2, 2);
            }
        } else {
            // Labels
            let state = "";
            if (this.cyclePhase < 0.3) state = "LIFT ⬆";
            else if (this.cyclePhase < 0.5) state = "MOVE ➡";
            else if (this.cyclePhase < 0.8) state = "APPROACH ⬇";
            else if (this.cyclePhase < 0.95) state = "CONTACT ⚡";
            else state = "RETRACT";

            ctx.font = '12px Monospace';
            ctx.fillStyle = '#15803d';
            ctx.fillText(state, tipX, tipY - 80);

            if (state.includes("CONTACT")) {
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(tipX, tipY, 15, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    loop() {
        this.draw();
        requestAnimationFrame(() => this.loop());
    }
}

new PRFM_Comparison();
