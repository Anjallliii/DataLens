chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action !== "analyzePage") return;

    function getSurroundingText(element) {
        try {
            let text = "";
            let el = element;
            for (let i = 0; i < 3; i++) {
                if (!el.parentElement) break;
                el = el.parentElement;
                text += (el.innerText || el.textContent || "").slice(0, 200);
            }
            return text;
        } catch {
            return "";
        }
    }

    function classifyChartType(src, alt, text) {
        const content = `${src} ${alt} ${text}`.toLowerCase();

        if (content.includes("candlestick") || content.includes("ohlc") || content.includes("stock"))
            return "candlestick";
        if (content.includes("pie") || content.includes("donut") || content.includes("doughnut"))
            return "pie";
        if (content.includes("scatter") || content.includes("bubble"))
            return "scatter";
        if (content.includes("heatmap") || content.includes("heat map"))
            return "heatmap";
        if (content.includes("histogram"))
            return "histogram";
        if (content.includes("bar") || content.includes("column"))
            return "bar";
        if (content.includes("line") || content.includes("trend") || content.includes("time series"))
            return "line";
        if (content.includes("area"))
            return "area";
        if (content.includes("map") || content.includes("choropleth"))
            return "map";

        return "unknown";
    }

    // Check if page itself is a direct image
    const pageUrl = window.location.href.toLowerCase();
    const imageExtensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];
    if (imageExtensions.some(ext => pageUrl.includes(ext))) {
        sendResponse({
            message: "Found 1 chart candidates, 0 SVGs, 0 canvases",
            candidates: [{
                id: 1,
                src: window.location.href,
                alt: "Direct image",
                width: 800,
                height: 600,
                score: 10,
                reasons: ["Direct image URL"],
                isChart: true,
                chartType: "unknown"
            }],
            svgs: [],
            canvases: [],
            allImages: []
        });
        return;
    }

    const chartKeywords = [
        "chart", "graph", "plot", "figure",
        "visualization", "data", "statistics",
        "dashboard", "trend", "infographic"
    ];

    // Site-specific selectors
    const hostname = window.location.hostname;

    // BBC News charts
    const bbcChartSelectors = [
        ".responsive-image__img",
        ".media-with-caption__image",
        "figure img"
    ];

    // CNN charts
    const cnnChartSelectors = [
        ".image__dam-img",
        ".media__image",
        "figure img"
    ];

    // General chart containers
    const chartContainerSelectors = [
        "figure img",
        ".chart img",
        ".graph img",
        "[class*='chart'] img",
        "[class*='graph'] img",
        "[class*='plot'] img",
        "[id*='chart'] img",
        "[id*='graph'] img",
        ".article-body img",
        ".story-body img",
        ".post-content img",
        ".entry-content img"
    ];

    // Get all images
    const allImages = [...document.querySelectorAll("img")];

    const scored = allImages.map((img, index) => {
        const width   = img.naturalWidth  || img.width  || 0;
        const height  = img.naturalHeight || img.height || 0;
        const alt     = img.alt  || "";
        const src     = img.src  || "";
        const surrounding = getSurroundingText(img);

        let score = 0;
        const reasons = [];

        // Size scoring
        if (width > 400 && height > 250) { score += 4; reasons.push("Large chart size"); }
        else if (width > 300 && height > 200) { score += 3; reasons.push("Medium chart size"); }
        if (width < 100 || height < 100) { score -= 4; reasons.push("Too small"); }

        // Alt text keywords
        if (chartKeywords.some(k => alt.toLowerCase().includes(k))) {
            score += 3; reasons.push("Chart keyword in alt");
        }

        // URL keywords
        if (chartKeywords.some(k => src.toLowerCase().includes(k))) {
            score += 2; reasons.push("Chart keyword in URL");
        }

        // Surrounding text
        if (chartKeywords.some(k => surrounding.toLowerCase().includes(k))) {
            score += 2; reasons.push("Chart mentioned nearby");
        }

        // Aspect ratio
        const ratio = height > 0 ? width / height : 0;
        if (ratio >= 0.5 && ratio <= 3.5) { score += 2; reasons.push("Good aspect ratio"); }
        if (ratio > 6) { score -= 3; reasons.push("Banner/ad shape"); }

        // Inside figure tag (common for charts)
        if (img.closest("figure")) { score += 2; reasons.push("Inside figure tag"); }

        // Inside chart container
        if (img.closest("[class*='chart'], [class*='graph'], [id*='chart'], [id*='graph']")) {
            score += 3; reasons.push("Inside chart container");
        }

        // BBC specific
        if (hostname.includes("bbc") && img.closest("figure")) {
            score += 2; reasons.push("BBC figure image");
        }

        // File extension check
        const srcLower = src.toLowerCase();
        if (srcLower.includes(".svg")) { score += 1; reasons.push("SVG image"); }

        // Penalty for logos/icons
        if (alt.toLowerCase().includes("logo") || src.toLowerCase().includes("logo")) {
            score -= 4; reasons.push("Likely logo");
        }
        if (alt.toLowerCase().includes("icon") || src.toLowerCase().includes("icon")) {
            score -= 3; reasons.push("Likely icon");
        }
        if (alt.toLowerCase().includes("avatar") || src.toLowerCase().includes("avatar")) {
            score -= 4; reasons.push("Likely avatar");
        }
        if (alt.toLowerCase().includes("ad") || src.toLowerCase().includes("/ads/")) {
            score -= 5; reasons.push("Likely advertisement");
        }

        return {
            id: index + 1,
            type: "image",
            src,
            alt,
            width,
            height,
            score,
            reasons,
            isChart: score >= 4,
            chartType: classifyChartType(src, alt, surrounding)
        };
    });

    const chartCandidates = scored
        .filter(item => item.isChart)
        .sort((a, b) => b.score - a.score);

    // SVG detection — filter out tiny/decorative SVGs
    const svgs = [...document.querySelectorAll("svg")]
    .map((svg, index) => {
        const rect = svg.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        if (w < 200 || h < 150) return null;

        // Capture SVG as image
        let imageData = null;
        try {
            const svgData = new XMLSerializer().serializeToString(svg);
            const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
            const url     = URL.createObjectURL(svgBlob);

            // Draw on canvas to get base64
            const canvas  = document.createElement("canvas");
            canvas.width  = w;
            canvas.height = h;
            const ctx     = canvas.getContext("2d");
            const img     = new Image();

            img.onload = () => {
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
            };
            img.src = url;

            // Use outerHTML as fallback identifier
            imageData = `svg:${index}`;

        } catch(e) {
            console.log("SVG capture error:", e.message);
        }

        return {
            id:        index + 1,
            type:      "svg",
            width:     w,
            height:    h,
            outerHTML: svg.outerHTML.slice(0, 500),
            score:     8,
            isChart:   true,
            imageData: imageData
        };
    })
    .filter(s => s !== null && s.isChart);

    // Canvas detection — filter out tiny canvases
    const canvases = [...document.querySelectorAll("canvas")]
    .map((canvas, index) => {
        let imageData = null;
        try {
            // Only capture if canvas has content
            if (canvas.width > 100 && canvas.height > 100) {
                imageData = canvas.toDataURL("image/png");
            }
        } catch(e) {
            // Cross-origin canvas — can't capture
            console.log("Canvas capture blocked:", e.message);
        }
        return {
            id: index + 1,
            type: "canvas",
            width: canvas.width,
            height: canvas.height,
            imageData: imageData,
            score: canvas.width > 200 && canvas.height > 150 ? 8 : 2,
            isChart: canvas.width > 200 && canvas.height > 150 && imageData !== null
        };
    })
    .filter(c => c.isChart);

    console.log("Chart Candidates:", chartCandidates);
    console.log("SVGs:", svgs.length);
    console.log("Canvases:", canvases.length);

    sendResponse({
        message: `Found ${chartCandidates.length} chart candidates, ${svgs.length} SVGs, ${canvases.length} canvases`,
        candidates: chartCandidates,
        svgs,
        canvases,
        allImages: scored
    });
});