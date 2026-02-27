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

function formatSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function renderFileBrowser(requestPath, items) {
    const parentPath = path.dirname(requestPath === "/" ? "/" : requestPath);
    const isRoot = requestPath === "/" || requestPath === "";

    const rows = items.map(item => {
        const icon = item.isDirectory ? "folder" : "file-text";
        const link = path.join("/", requestPath, item.name);
        return `
            <tr>
                <td class="icon"><i data-lucide="${icon}"></i></td>
                <td class="name"><a href="${link}">${item.name}${item.isDirectory ? "/" : ""}</a></td>
                <td class="size">${item.isDirectory ? "-" : formatSize(item.size)}</td>
                <td class="date">${item.mtime.toLocaleString()}</td>
            </tr>
        `;
    }).join("");

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index of ${requestPath}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        :root {
            --bg: #ffffff;
            --text: #1a1a1a;
            --subtext: #666;
            --border: #eeeeee;
            --hover: #f9f9f9;
            --accent: #2563eb;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0f172a;
                --text: #f8fafc;
                --subtext: #94a3b8;
                --border: #1e293b;
                --hover: #1e293b;
                --accent: #38bdf8;
            }
        }
        body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 2rem;
            line-height: 1.5;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
        }
        header {
            margin-bottom: 2rem;
            border-bottom: 1px solid var(--border);
            padding-bottom: 1rem;
        }
        h1 {
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0;
        }
        .breadcrumb {
            color: var(--subtext);
            font-size: 0.875rem;
            margin-top: 0.5rem;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            text-align: left;
            font-weight: 500;
            color: var(--subtext);
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border);
            font-size: 0.875rem;
        }
        td {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border);
            font-size: 0.9375rem;
        }
        tr:hover {
            background-color: var(--hover);
        }
        a {
            color: var(--accent);
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .icon {
            width: 24px;
            color: var(--subtext);
        }
        .icon i {
            width: 18px;
            height: 18px;
        }
        .size, .date {
            color: var(--subtext);
            font-size: 0.875rem;
        }
        .back-link {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 1rem;
            font-size: 0.875rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Index of ${requestPath}</h1>
            <div class="breadcrumb">Maven Proxy Cache</div>
        </header>

        ${!isRoot ? `
            <a href="${parentPath}" class="back-link">
                <i data-lucide="arrow-left"></i> Parent Directory
            </a>
        ` : ""}

        <table>
            <thead>
                <tr>
                    <th class="icon"></th>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Last Modified</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
                ${items.length === 0 ? '<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--subtext);">Directory is empty</td></tr>' : ''}
            </tbody>
        </table>
    </div>
    <script>
        lucide.createIcons();
    </script>
</body>
</html>
    `;
}

app.get(/^(.*)$/, async (req, res) => {
    let requestPath = req.path;

    // Normalize path to remove trailing slash if not root
    if (requestPath.length > 1 && requestPath.endsWith("/")) {
        requestPath = requestPath.slice(0, -1);
    }

    const relativePath = requestPath.startsWith("/") ? requestPath.substring(1) : requestPath;
    const cachePath = path.join(CACHE_DIR, relativePath);

    try {
        // Serve from cache if exists
        if (fs.existsSync(cachePath)) {
            const stats = fs.statSync(cachePath);

            if (stats.isDirectory()) {
                console.log("Listing directory:", requestPath);
                const files = fs.readdirSync(cachePath);
                const items = files.map(file => {
                    const filePath = path.join(cachePath, file);
                    const fileStats = fs.statSync(filePath);
                    return {
                        name: file,
                        isDirectory: fileStats.isDirectory(),
                        size: fileStats.size,
                        mtime: fileStats.mtime
                    };
                }).sort((a, b) => {
                    // Directories first, then alphabetical
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });

                return res.send(renderFileBrowser(requestPath, items));
            }

            console.log("Serving from cache:", requestPath);
            return res.sendFile(cachePath);
        }

        // For root route, if cache dir doesn't even exist yet (unlikely due to startup check)
        if (requestPath === "/" || requestPath === "") {
            return res.send(renderFileBrowser("/", []));
        }

        // Ignore favicon.ico if it doesn't exist in cache to avoid upstream spam
        if (requestPath === "/favicon.ico") {
            return res.status(404).send("Not found");
        }

        const upstreamResponse = await fetchFromUpstreams(relativePath);

        if (!upstreamResponse) {
            return res.status(404).send("Artifact not found in upstreams");
        }

        ensureDir(cachePath);

        const writer = fs.createWriteStream(cachePath);
        upstreamResponse.data.pipe(writer);

        writer.on("finish", () => {
            console.log("Cached:", relativePath);
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