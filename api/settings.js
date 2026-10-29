// Serverless Function: Settings handler
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  // Settings in cloud deployment are stored in client localStorage for zero leakage
  if (req.method === "GET") {
    return res.status(200).json({ vercel: { token: "", projectName: "" }, ftp: {} });
  }
  return res.status(200).json({ success: true });
};
