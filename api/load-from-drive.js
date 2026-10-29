// Serverless Function: Load HTML from Google Drive or Google Docs
const https = require("https");
const http = require("http");

function fetchRedirect(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchRedirect(res.headers.location));
      }
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => resolve({ statusCode: res.statusCode, data }));
    }).on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { url: driveUrl } = req.body || {};
    if (!driveUrl) {
      return res.status(400).json({ error: "Vui lòng nhập đường dẫn Google Drive hoặc Docs." });
    }

    let downloadUrl = driveUrl;
    const docMatch = driveUrl.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docMatch) {
      downloadUrl = `https://docs.google.com/document/d/${docMatch[1]}/export?format=html`;
    } else {
      const fileMatch = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (fileMatch) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileMatch[1]}&confirm=no_antivirus`;
      }
    }

    const result = await fetchRedirect(downloadUrl);
    const content = result.data;

    if (content.includes("accounts.google.com") || content.includes("ServiceLogin") || content.includes("Sign in - Google Accounts")) {
      return res.status(400).json({
        error: "File Google Drive chưa được bật quyền công khai!\n\n📌 Cách khắc phục:\n1. Vào Google Drive -> Nhấp chuột phải vào file.\n2. Chọn \"Chia sẻ\" (Share).\n3. Đổi \"Quyền truy cập chung\" thành \"Bất kỳ ai có liên kết\" (Anyone with the link).\n4. Thử lại!"
      });
    }

    return res.status(200).json({ content });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Lỗi tải file từ Google Drive" });
  }
};
