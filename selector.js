(function() {

    if (document.getElementById("datalens-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "datalens-overlay";
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.3);
        cursor: crosshair;
        z-index: 999999;
    `;

    const banner = document.createElement("div");
    banner.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1d4ed8;
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        z-index: 1000000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        pointer-events: none;
    `;
    banner.textContent = "🔍 Draw a rectangle around the chart — Press ESC to cancel";

    const selection = document.createElement("div");
    selection.style.cssText = `
        position: fixed;
        border: 2px dashed #2563eb;
        background: rgba(37,99,235,0.1);
        pointer-events: none;
        z-index: 1000000;
        display: none;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(banner);
    document.body.appendChild(selection);

    let startX = 0, startY = 0, isDrawing = false;

    overlay.addEventListener("mousedown", (e) => {
        isDrawing = true;
        startX = e.clientX;
        startY = e.clientY;
        selection.style.display = "block";
        selection.style.left   = startX + "px";
        selection.style.top    = startY + "px";
        selection.style.width  = "0px";
        selection.style.height = "0px";
    });

    overlay.addEventListener("mousemove", (e) => {
        if (!isDrawing) return;
        const x = Math.min(e.clientX, startX);
        const y = Math.min(e.clientY, startY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);
        selection.style.left   = x + "px";
        selection.style.top    = y + "px";
        selection.style.width  = w + "px";
        selection.style.height = h + "px";
    });

    overlay.addEventListener("mouseup", (e) => {
        if (!isDrawing) return;
        isDrawing = false;

        const x = Math.min(e.clientX, startX);
        const y = Math.min(e.clientY, startY);
        const w = Math.abs(e.clientX - startX);
        const h = Math.abs(e.clientY - startY);

        if (w < 50 || h < 50) { cleanup(); return; }

        cleanup();

        // Send to background with coordinates
        chrome.runtime.sendMessage({
            action: "areaSelected",
            x: x,
            y: y,
            width:  w,
            height: h,
            devicePixelRatio: window.devicePixelRatio || 1
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") cleanup();
    });

    function cleanup() {
        overlay.remove();
        banner.remove();
        selection.remove();
    }

})();