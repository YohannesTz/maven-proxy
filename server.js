require("dotenv").config();

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 8081;
const CACHE_DIR = path.resolve(process.env.CACHE_DIR || "./cache");

// Parse upstream repos
const UPSTREAMS = (process.env.UPSTREAMS || "")
    .split(",")
    .map(u => u.trim())
    .filter(Boolean);

if (!UPSTREAMS.length) {
    console.error("No upstream repositories configured.");
    process.exit(1);
}

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function fetchFromUpstreams(requestPath) {
    for (const baseUrl of UPSTREAMS) {
        const fullUrl = baseUrl.replace(/\/+$/, "") + "/" + requestPath;

        try {
            console.log("Trying:", fullUrl);

            const response = await axios({
                method: "get",
                url: fullUrl,
                responseType: "stream",
                timeout: 30000,
                validateStatus: status => status < 500
            });

            if (response.status === 200) {
                return response;
            }

        } catch (err) {
            console.log("Failed:", fullUrl);
        }
    }

    return null;
}

app.get("/*path", async (req, res) => {
    let requestPath = req.params.path;
    if (Array.isArray(requestPath)) {
        requestPath = requestPath.join("/");
    }
    const cachePath = path.join(CACHE_DIR, requestPath);

    try {
        // Serve from cache if exists
        if (fs.existsSync(cachePath)) {
            console.log("Serving from cache:", requestPath);
            return res.sendFile(cachePath);
        }

        const upstreamResponse = await fetchFromUpstreams(requestPath);

        if (!upstreamResponse) {
            return res.status(404).send("Artifact not found in upstreams");
        }

        ensureDir(cachePath);

        const writer = fs.createWriteStream(cachePath);
        upstreamResponse.data.pipe(writer);

        writer.on("finish", () => {
            console.log("Cached:", requestPath);
            res.sendFile(cachePath);
        });

        writer.on("error", err => {
            console.error("Write error:", err);
            res.status(500).send("Cache write failed");
        });

    } catch (err) {
        console.error("Proxy error:", err.message);
        res.status(500).send("Proxy error");
    }
});

app.listen(PORT, () => {
    console.log(`Maven proxy running at http://localhost:${PORT}`);
    console.log("Upstreams:");
    UPSTREAMS.forEach(u => console.log(" -", u));
});