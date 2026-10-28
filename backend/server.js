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

app.use(cors({ origin: process.env.CLIENT_URL }));

app.use(express.json({
  limit: "1mb",
  verify: (req, res, buffer) => {
    req.rawBody = Buffer.from(buffer);
  }
}));

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Backend running" });
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