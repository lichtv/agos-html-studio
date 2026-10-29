// Serverless Function: Deploy HTML direct to Vercel via Vercel REST API
const https = require("https");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const logs = [];
  try {
    const { content, fileName = "index.html", config = {} } = req.body || {};
    const token = config.token || process.env.VERCEL_TOKEN;
    const rawName = (config.projectName || "site").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const finalProjectName = rawName.includes("agos-studio") ? rawName : `agos-studio-${rawName}`;

    if (!token) {
      logs.push("❌ Không tìm thấy Vercel Token. Vui lòng vào Cài đặt và nhập Vercel Token cá nhân.");
      return res.status(400).json({ success: false, logs });
    }

    logs.push(`🚀 Đang kết nối Vercel API (Dự án: ${finalProjectName})...`);

    const payload = JSON.stringify({
      name: finalProjectName,
      target: "production",
      files: [
        {
          file: "index.html",
          data: content
        }
      ]
    });

    const options = {
      hostname: "api.vercel.com",
      path: "/v13/deployments",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const resData = await new Promise((resolve, reject) => {
      const reqApi = https.request(options, (apiRes) => {
        let data = "";
        apiRes.on("data", chunk => data += chunk);
        apiRes.on("end", () => {
          try { resolve({ statusCode: apiRes.statusCode, body: JSON.parse(data || "{}") }); }
          catch (e) { resolve({ statusCode: apiRes.statusCode, body: {} }); }
        });
      });
      reqApi.on("error", reject);
      reqApi.write(payload);
      reqApi.end();
    });

    if (resData.statusCode === 200 || resData.statusCode === 201) {
      const aliasUrl = resData.body.url ? `https://${resData.body.url}` : `https://${finalProjectName}.vercel.app`;
      logs.push("✅ Đã xuất bản lên Vercel thành công!");
      logs.push("🌐 Production URL: " + aliasUrl);
      return res.status(200).json({ success: true, url: aliasUrl, logs });
    } else {
      const errMsg = resData.body.error ? resData.body.error.message : "HTTP " + resData.statusCode;
      logs.push("❌ Lỗi Vercel API: " + errMsg);
      return res.status(200).json({ success: false, logs });
    }
  } catch (err) {
    logs.push("❌ Lỗi ngoại lệ: " + err.message);
    return res.status(500).json({ success: false, logs });
  }
};
