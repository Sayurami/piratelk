import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const BASE_URL = "https://piratelk.com";
const API_KEY = "YOUR_SCRAPER_API_KEY";

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

// ===============================
// FETCH PAGE
// ===============================
async function fetchPage(targetUrl) {
  try {
    const { data } = await axios.get(targetUrl, {
      timeout: 30000,
      headers
    });
    return data;
  } catch (err) {
    try {
      const proxyUrl = `http://api.scraperapi.com?api_key=${API_KEY}&url=${encodeURIComponent(
        targetUrl
      )}&render=true`;

      const { data } = await axios.get(proxyUrl, { timeout: 60000 });
      return data;
    } catch (error) {
      return null;
    }
  }
}

// ===============================
// SEARCH
// ===============================
app.get("/api/search", async (req, res) => {
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
    return res.json({ status: false, message: "Fetch failed" });

  const $ = cheerio.load(html);
  const results = [];

  $("article, .post-box, .post-entry").each((_, el) => {
    const titleElement = $(el)
      .find("h2 a, h1 a, .entry-title a")
      .first();

    const title = titleElement.text().trim();
    const link = titleElement.attr("href");
    const image =
      $(el).find("img").first().attr("src") ||
      $(el).find("img").first().attr("data-src") ||
      null;

    if (title && link) {
      results.push({ title, link, image });
    }
  });

  res.json({ status: true, results });
});

// ===============================
// DETAILS
// ===============================
app.get("/api/details", async (req, res) => {
  const { url } = req.query;

  if (!url)
    return res.json({
      status: false,
      message: "URL missing"
    });

  const html = await fetchPage(url);
  if (!html)
    return res.json({ status: false, message: "Page fetch failed" });

  const $ = cheerio.load(html);

  const title = $("h1, .entry-title").first().text().trim();

  const thumbnail =
    $("meta[property='og:image']").attr("content") ||
    $("article img").first().attr("src") ||
    null;

  const downloadLinks = [];

  $(".download-link, .download-button, a").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();

    if (
      href &&
      (href.includes("usersdrive") ||
        href.includes("dropgalaxy") ||
        href.includes("racaty") ||
        href.includes(".zip") ||
        href.includes(".rar") ||
        href.includes(".srt"))
    ) {
      downloadLinks.push({
        label: text || "Download",
        url: href
      });
    }
  });

  res.json({
    status: true,
    data: {
      title,
      thumbnail,
      downloadLinks
    }
  });
});

// ===============================
// EXPORT FOR VERCEL
// ===============================
export default app;
