import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";

// ===============================
// CONFIG
// ===============================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_KEY = "YOUR_SCRAPER_API_KEY";
const BASE_URL = "https://piratelk.com";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ===============================
// FETCH PAGE (Direct + Proxy)
// ===============================
async function fetchPage(targetUrl) {
  try {
    const direct = await axios.get(targetUrl, {
      timeout: 30000,
      headers
    });

    if (direct.data && direct.data.length > 500) {
      return direct.data;
    }
  } catch (err) {
    console.log("Direct failed → Proxy trying...");
  }

  // Proxy Fallback
  try {
    const proxyUrl = `http://api.scraperapi.com?api_key=${API_KEY}&url=${encodeURIComponent(
      targetUrl
    )}&render=true`;

    const proxy = await axios.get(proxyUrl, { timeout: 60000 });
    return proxy.data;
  } catch (err) {
    console.error("Proxy failed:", err.message);
    return null;
  }
}

// =====================================================
// 🔎 SEARCH ENDPOINT
// =====================================================
app.get("/api/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q)
      return res.json({
        status: false,
        message: "Query missing"
      });

    const html = await fetchPage(
      `${BASE_URL}/?s=${encodeURIComponent(q)}`
    );

    if (!html)
      return res.json({
        status: false,
        message: "Fetch failed"
      });

    const $ = cheerio.load(html);
    const results = [];

    $("article, .post-box, .post-entry").each((i, el) => {
      const titleElement = $(el)
        .find("h2 a, h1 a, .entry-title a")
        .first();

      const title = titleElement.text().trim();
      const link = titleElement.attr("href");

      const image =
        $(el).find("img").first().attr("src") ||
        $(el).find("img").first().attr("data-src") ||
        null;

      const date =
        $(el).find(".tie-date, time").text().trim() || null;

      if (title && link) {
        results.push({ title, link, image, date });
      }
    });

    res.json({ status: true, results });
  } catch (err) {
    res.json({ status: false, error: err.message });
  }
});

// =====================================================
// 📦 DETAILS + DOWNLOAD LINKS
// =====================================================
app.get("/api/details", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url)
      return res.json({
        status: false,
        message: "URL missing"
      });

    const html = await fetchPage(url);
    if (!html)
      return res.json({
        status: false,
        message: "Page fetch failed"
      });

    const $ = cheerio.load(html);

    const title = $("h1, .entry-title").first().text().trim();

    const thumbnail =
      $("meta[property='og:image']").attr("content") ||
      $("article img").first().attr("src") ||
      null;

    const content = $(".entry-content")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 2000);

    const downloadLinks = [];
    const foundLinks = new Set();

    // =====================================================
    // ✅ 1. DOWNLOAD BUTTONS
    // =====================================================
    $(".download-link, .download-button").each((i, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href) return;

      if (!foundLinks.has(href)) {
        downloadLinks.push({
          label: text || "Download",
          url: href
        });

        foundLinks.add(href);
      }
    });

    // =====================================================
    // ✅ 2. FILE HOST LINKS + DOWNLOAD PAGE
    // =====================================================
    const fileHosts = [
      "usersdrive",
      "dropgalaxy",
      "dgdrive",
      "racaty",
      "mediafire",
      "mega",
      "drive.google"
    ];

    $("a").each((i, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      if (!href) return;

      // ❌ Remove category anchors
      if (href.startsWith("#")) return;

      const lower = href.toLowerCase();
      const isHost = fileHosts.some((host) =>
        lower.includes(host)
      );

      // ✅ Include Download Page
      if (href.includes("/download/")) {
        if (!foundLinks.has(href)) {
          downloadLinks.push({
            label: "Download Page",
            url: href
          });

          foundLinks.add(href);
        }
        return;
      }

      // ✅ Include External Hosts
      if (isHost && !foundLinks.has(href)) {
        downloadLinks.push({
          label: text || "External Link",
          url: href
        });

        foundLinks.add(href);
      }
    });

    // =====================================================
    // 🔥 AUTO EXTRACT ZIP / RAR FROM DOWNLOAD PAGE
    // =====================================================
    for (let i = 0; i < downloadLinks.length; i++) {
      const link = downloadLinks[i];

      if (link.url && link.url.includes("/download/")) {
        try {
          const page = await fetchPage(link.url);
          if (!page) continue;

          const $$ = cheerio.load(page);

          const finalFile = $$("a[href*='.zip'], a[href*='.rar']")
            .first()
            .attr("href");

          if (finalFile) {
            downloadLinks[i].directFile = finalFile;
          }
        } catch (err) {
          console.log("Auto extract failed");
        }
      }
    }

    res.json({
      status: true,
      data: {
        title,
        thumbnail,
        content,
        downloadLinks
      }
    });
  } catch (err) {
    res.json({ status: false, error: err.message });
  }
});

// =====================================================
// 🚀 SERVER START
// =====================================================
app.listen(PORT, () => {
  console.log(`🚀 Server Running on http://localhost:${PORT}`);
});
