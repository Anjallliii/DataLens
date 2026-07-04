document.addEventListener("DOMContentLoaded", () => {

    const button      = document.getElementById("analyzeBtn");
    const status      = document.getElementById("status");
    const results     = document.getElementById("results");
    const chartType   = document.getElementById("chartType");
    const explanation = document.getElementById("explanation");
    const insight     = document.getElementById("insight");

// Poll for pending area selection every 500ms
function checkPendingAnalysis() {
    chrome.storage.local.get("pendingAnalysis", (result) => {
        if (result.pendingAnalysis && result.pendingAnalysis.ready) {
            const { imageBase64, timestamp } = result.pendingAnalysis;
            if (Date.now() - timestamp < 30000) {
                console.log("✅ Found pending analysis!");
                chrome.storage.local.remove("pendingAnalysis");
                analyzeBase64Image(imageBase64);
            } else {
                chrome.storage.local.remove("pendingAnalysis");
            }
        }
    });
}

setInterval(checkPendingAnalysis, 500);

    async function captureTabScreenshot() {
    return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(dataUrl);
            }
        });
    });
}
// Listen for cropped image from background
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "croppedImage") {
        analyzeBase64Image(request.imageBase64);
    }
});

// Analyze any base64 image
async function analyzeBase64Image(imageBase64) {
    const status  = document.getElementById("status");
    const results = document.getElementById("results");

    status.textContent = "🔍 Analyzing selected area...";
    status.classList.add("loading");
    results.style.display = "none";

    try {
        const aiResponse = await fetch("http://127.0.0.1:8000/analyze-base64", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_base64: imageBase64 })
        });

        const data = await aiResponse.json();
        console.log("Area analysis:", data);

        // Display results
        document.getElementById("chartType").textContent =
            "Chart Type: " + (data.chart_type || "unknown").toUpperCase();

        document.getElementById("explanation").textContent =
            data.explanation || "";

        document.getElementById("insight").textContent =
            "💡 " + (data.insight || "");

        results.style.display = "block";

        // Misleading section
        const m = data.misleading;
        if (m && m.issues && m.issues.length > 0) {
            document.getElementById("misleadingSection").style.display = "block";
            document.getElementById("misleadingScore").textContent =
                `⚠️ Misleading Score: ${m.misleading_score}/10`;

            const issuesDiv = document.getElementById("misleadingIssues");
            issuesDiv.innerHTML = "";

            m.issues.forEach(issue => {
    const card = document.createElement("div");
    card.className = `issue-card ${issue.severity}`;

    // Icon based on severity
    const icon = issue.severity === "high" ? "🔴" :
                 issue.severity === "medium" ? "🟡" : "🟢";

    // Format type nicely
    const typeName = issue.type
        .replace(/_/g, " ")
        .toUpperCase();

    card.innerHTML = `
        <div class="issue-type">${icon} ${typeName}</div>
        <div class="issue-description">${issue.description}</div>
        <div class="issue-fix">💡 Fix: ${issue.fix}</div>
    `;
    issuesDiv.appendChild(card);
});

            document.getElementById("trustScore").textContent =
                `Trust Score: ${Math.round(m.trust_score * 100)}% — ${m.overall_verdict}`;
        } else {
            document.getElementById("misleadingSection").style.display = "none";
        }

        // Corrected chart
        if (data.vegaLite && data.vegaLite.data && data.vegaLite.data.values) {
            document.getElementById("vegaContainer").style.display = "block";

            const values    = data.vegaLite.data.values;
            const encoding  = data.vegaLite.encoding;
            const xField    = encoding.x.field;
            const yField    = encoding.y.field;
            const chartMark = data.vegaLite.mark || "bar";
            const labels    = values.map(v => v[xField]);
            const nums      = values.map(v => v[yField]);

            const typeMap = {
                "bar": "bar", "line": "line",
                "scatter": "scatter", "area": "line", "pie": "pie"
            };

            const canvas = document.getElementById("correctedChart");
            if (window._chartInstance) window._chartInstance.destroy();

            window._chartInstance = new Chart(canvas, {
                type: typeMap[chartMark] || "bar",
                data: {
                    labels: labels,
                    datasets: [{
                        label: data.vegaLite.title || "Corrected Chart",
                        data: nums,
                        backgroundColor: "rgba(37, 99, 235, 0.7)",
                        borderColor: "rgba(37, 99, 235, 1)",
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: false,
                    plugins: {
                        title: { display: true, text: data.vegaLite.title || "Corrected Chart" }
                    },
                    scales: chartMark !== "pie" ? { y: { beginAtZero: true } } : {}
                }
            });

            if (data.fixes_applied && data.fixes_applied.length > 0) {
                document.getElementById("fixesList").textContent =
                    "💡 Fixes: " + data.fixes_applied.join(", ");
            }
        }

        // Chat context
        window._chartContext = {
            chart_type:  data.chart_type,
            explanation: data.explanation,
            insight:     data.insight,
            misleading:  data.misleading
        };

        document.getElementById("chatSection").style.display = "block";
        status.textContent = "✅ Analysis complete";
        status.classList.remove("loading");

    } catch (err) {
        status.textContent = "Backend error: " + err.message;
        status.classList.remove("loading");
        console.error(err);
    }
}

    button.addEventListener("click", async () => {

        status.textContent = "🔍 Finding charts on page...";
        status.classList.add("loading");
        results.style.display = "none";

        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        chrome.tabs.sendMessage(
            tab.id,
            { action: "analyzePage" },
            async (response) => {

                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    status.textContent = "Refresh the page and try again";
                    return;
                }

const hasImages   = response.candidates && response.candidates.length > 0;
const hasCanvases = response.canvases   && response.canvases.length > 0;
const hasSVGs     = response.svgs       && response.svgs.length > 0;

if (!hasImages && !hasCanvases && !hasSVGs) {
    status.textContent = "No chart candidates found";
    return;
}

let imageUrl    = null;
let imageBase64 = null;
let sourceType  = "url";
let score       = 5;

// Priority 1 — Canvas with real imageData
if (hasCanvases && response.canvases[0].imageData &&
    !response.canvases[0].imageData.startsWith("svg:")) {
    imageBase64 = response.canvases[0].imageData;
    sourceType  = "base64";
    score       = response.canvases[0].score;
    console.log("Using CANVAS");
}
// Priority 2 — SVG or mixed page → take tab screenshot
else if (hasSVGs && !hasCanvases) {
    try {
        status.textContent = "📸 Capturing chart screenshot...";
        imageBase64 = await captureTabScreenshot();
        sourceType  = "base64";
        score       = 8;
        console.log("Using TAB SCREENSHOT for SVG");
    } catch(e) {
        console.log("Screenshot failed:", e);
        if (hasImages) {
            imageUrl   = response.candidates[0].src;
            sourceType = "url";
            score      = response.candidates[0].score;
        }
    }
}
// Priority 3 — Regular image
else if (hasImages) {
    imageUrl   = response.candidates[0].src;
    sourceType = "url";
    score      = response.candidates[0].score;
    console.log("Using IMAGE:", imageUrl);
}

status.textContent = `Analyzing chart... (score: ${score})`;
                try {

                    // TEMP DEBUG
                    // alert("Sending image:\n\n" + top.src);

                    let aiResponse;

if (sourceType === "base64" && imageBase64) {
    // Canvas — send as base64
    status.textContent = "Analyzing canvas chart...";
    aiResponse = await fetch("http://127.0.0.1:8000/analyze-base64", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageBase64 })
    });
} else if (imageUrl) {
    // Regular image — send URL
    status.textContent = "Analyzing chart...";
    aiResponse = await fetch("http://127.0.0.1:8000/analyze-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl })
    });
} else {
    status.textContent = "No chart found on this page";
    return;
}

                    console.log("HTTP Status:", aiResponse.status);

                    const data = await aiResponse.json();

                   console.log("=== BACKEND RESPONSE ===");
                   console.log(data);
                   if (data.error) {
    console.error("Backend Error:", data.error);
    status.textContent = "⚠️ Analysis had an issue, showing partial results";
}
                    // Display chart results
                    chartType.textContent =
                        "Chart Type: " +
                        (data.chart_type || "unknown").toUpperCase();

                    explanation.textContent =
                        data.explanation || "";

                     insight.textContent = "💡 " + (data.insight || "");

                     results.style.display = "block";

                     // Misleading Section
                     const m = data.misleading;
                     if (
                        m &&
                        m.issues &&
                        m.issues.length > 0
                    ) {

                        document.getElementById(
                            "misleadingSection"
                        ).style.display = "block";

                        document.getElementById(
                            "misleadingScore"
                        ).textContent =
                            `⚠️ Misleading Score: ${m.misleading_score}/10`;

                        const issuesDiv =
                            document.getElementById(
                                "misleadingIssues"
                            );

                        issuesDiv.innerHTML = "";

                        m.issues.forEach(issue => {

                            const card =
                                document.createElement("div");

                            card.className =
                                `issue-card ${issue.severity}`;

                            card.innerHTML = `
                            <div class="issue-type">${issue.type.replace(/_/g, " ")}</div>
                            <div class="issue-description">${issue.description}</div>
                            <div class="issue-fix">💡 Fix: ${issue.fix}</div>
                            `;

                            issuesDiv.appendChild(card);
                        });

                        document.getElementById(
                            "trustScore"
                        ).textContent =
                            `Trust Score: ${Math.round(
                                m.trust_score * 100
                            )}% — ${m.overall_verdict}`;

                    } else {

                        const section =
                            document.getElementById(
                                "misleadingSection"
                            );

                        if (section) {
                            section.style.display = "none";
                        }
                    }

                    // Corrected Chart using Chart.js
if (data.vegaLite && data.vegaLite.data && data.vegaLite.data.values) {

    document.getElementById("vegaContainer").style.display = "block";

    const values   = data.vegaLite.data.values;
    const encoding = data.vegaLite.encoding;
    const xField   = encoding.x.field;
    const yField   = encoding.y.field;
    const chartMark = data.vegaLite.mark || "bar";

    const labels = values.map(v => v[xField]);
    const nums   = values.map(v => v[yField]);

    const typeMap = {
        "bar":     "bar",
        "line":    "line",
        "scatter": "scatter",
        "area":    "line",
        "pie":     "pie"
    };
    const chartJsType = typeMap[chartMark] || "bar";

    const canvas = document.getElementById("correctedChart");

    // Destroy previous chart if exists
    if (window._chartInstance) {
        window._chartInstance.destroy();
    }

    window._chartInstance = new Chart(canvas, {
        type: chartJsType,
        data: {
            labels: labels,
            datasets: [{
                label: data.vegaLite.title || "Corrected Chart",
                data: nums,
                backgroundColor: "rgba(37, 99, 235, 0.7)",
                borderColor: "rgba(37, 99, 235, 1)",
                borderWidth: 1
            }]
        },
        options: {
            responsive: false,
            plugins: {
                legend: { display: true },
                title: {
                    display: true,
                    text: data.vegaLite.title || "Corrected Chart"
                }
            },
            scales: chartJsType !== "pie" ? {
                y: { beginAtZero: true }
            } : {}
        }
    });

    if (data.fixes_applied && data.fixes_applied.length > 0) {
        document.getElementById("fixesList").textContent =
        "💡 Fixes applied: " + data.fixes_applied.join(", ");
    }
}
                    status.textContent = "✅ Analysis complete";
                    // Show chat section
window._chartContext = {
    chart_type:  data.chart_type,
    title:       data.title,
    explanation: data.explanation,
    insight:     data.insight,
    x_axis:      data.x_axis,
    y_axis:      data.y_axis,
    ocr:         data.ocr,
    misleading:  data.misleading,
    fixes_applied: data.fixes_applied
};

document.getElementById("chatSection").style.display = "block";
                    status.classList.remove("loading");

                } catch (err) {

                    console.error("BACKEND ERROR:", err);

                    status.textContent = "❌ Could not analyze chart. Check if backend is running.";
console.error("Full error:", err);
                }
            }
        );
    });
});
// Chat functionality
function addMessage(text, type) {
    const chatMessages = document.getElementById("chatMessages");
    const msg = document.createElement("div");
    msg.className = `chat-message ${type}`;
    msg.textContent = text;
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msg;
}

async function sendChatMessage(question) {
    if (!question.trim()) return;

    const chatInput = document.getElementById("chatInput");
    chatInput.value = "";

    addMessage(question, "user");
    const loadingMsg = addMessage("Thinking...", "ai loading");

    try {
        const response = await fetch("http://127.0.0.1:8000/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question: question,
                chart_context: window._chartContext || {}
            })
        });

        const data = await response.json();
        loadingMsg.textContent = data.answer;
        loadingMsg.classList.remove("loading");

    } catch (err) {
        loadingMsg.textContent = "Error: Could not get answer.";
        loadingMsg.classList.remove("loading");
    }
}

// Send button
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("chatSendBtn").addEventListener("click", () => {
        const q = document.getElementById("chatInput").value;
        sendChatMessage(q);
    });

    document.getElementById("chatInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const q = document.getElementById("chatInput").value;
            sendChatMessage(q);
        }
    });
    // Suggestion chips
    document.querySelectorAll(".suggestion").forEach(chip => {
        chip.addEventListener("click", () => {
            sendChatMessage(chip.dataset.q);
        });
    });
    // Select Area button   ← ADD HERE
    document.getElementById("selectAreaBtn").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
        active: true, currentWindow: true
    });

    // Inject selector
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["selector.js"]
    });

    // For side panel — minimize instead of close
    // Just show instruction in status
    document.getElementById("status").textContent =
        "✂️ Draw a rectangle on the page...";
    });
});
