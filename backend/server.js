require("dotenv").config();

const dns = require("node:dns");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

if (process.env.DNS_SERVERS?.trim()) {
  const dnsServers = process.env.DNS_SERVERS
    .split(",")
    .map(server => server.trim())
    .filter(Boolean);

  dns.setServers(dnsServers);
}

const app = express();

const allowedOrigins = new Set(
  [
    "https://home3.onrender.com",
    ...(process.env.CLIENT_URL || "").split(",")
  ]
    .map(origin => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean)
);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin is not allowed by CORS"));
  }
}));

app.use(express.json({
  limit: "1mb",
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  }
}));

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Backend running" });
});

app.get("/api/config/status", (req, res) => {
  const missingWhatsAppFields = [];

  if (!process.env.WHATSAPP_TOKEN) {
    missingWhatsAppFields.push("WHATSAPP_TOKEN");
  }
  if (!process.env.PHONE_NUMBER_ID) {
    missingWhatsAppFields.push("PHONE_NUMBER_ID");
  }
  if (!/^v\d+\.\d+$/.test(process.env.GRAPH_API_VERSION || "")) {
    missingWhatsAppFields.push("GRAPH_API_VERSION");
  }

  const missingWebhookFields = [];
  if (!process.env.VERIFY_TOKEN) {
    missingWebhookFields.push("VERIFY_TOKEN");
  }
  if (!process.env.APP_SECRET) {
    missingWebhookFields.push("APP_SECRET");
  }

  res.json({
    whatsappApi: {
      configured: missingWhatsAppFields.length === 0,
      missing: missingWhatsAppFields
    },
    webhook: {
      configured: missingWebhookFields.length === 0,
      missing: missingWebhookFields
    }
  });
});

app.use("/api/customers", require("./routes/customer"));
app.use("/api/campaigns", require("./routes/campaigns"));
app.use("/webhook", require("./routes/webhook"));

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB Atlas connected");

    app.listen(process.env.PORT || 5000, () => {
      console.log("Server running at http://localhost:5000");
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
}

start();