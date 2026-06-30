chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "areaSelected") {
        const { x, y, width, height, devicePixelRatio } = request;
        const dpr = devicePixelRatio || 1;
        const tabId = sender.tab.id;

        // Capture from the sender's tab
        chrome.tabs.captureVisibleTab(
            sender.tab.windowId,
            { format: "png" },
            async (dataUrl) => {

                if (chrome.runtime.lastError) {
                    console.error("Capture error:", chrome.runtime.lastError.message);
                    return;
                }

                try {
                    const response = await fetch(dataUrl);
                    const blob     = await response.blob();
                    const bitmap   = await createImageBitmap(blob);

                    const cropW  = Math.round(width  * dpr);
                    const cropH  = Math.round(height * dpr);
                    const canvas = new OffscreenCanvas(cropW, cropH);
                    const ctx    = canvas.getContext("2d");

                    ctx.drawImage(
                        bitmap,
                        Math.round(x * dpr),
                        Math.round(y * dpr),
                        cropW, cropH,
                        0, 0,
                        cropW, cropH
                    );
                    bitmap.close();

                    const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
                    const arrayBuffer = await croppedBlob.arrayBuffer();
                    const uint8Array  = new Uint8Array(arrayBuffer);
                    let binary = "";
                    uint8Array.forEach(b => binary += String.fromCharCode(b));
                    const base64 = "data:image/png;base64," + btoa(binary);

                    await chrome.storage.local.set({
                        pendingAnalysis: {
                            imageBase64: base64,
                            timestamp:   Date.now(),
                            ready:       true
                        }
                    });

                    console.log("✅ Cropped image stored!");

                } catch(err) {
                    console.error("Processing error:", err.message);
                }
            }
        );

        return true;
    }
});