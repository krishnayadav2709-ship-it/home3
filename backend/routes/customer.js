const express = require("express");
const axios = require("axios");
const multer = require("multer");
const { parse } = require("csv-parse/sync");
const Customer = require("../models/Customer");
const Message = require("../models/Message");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

router.get("/", async (req, res) => {
  try {
    const customers = await Customer.find()
      .sort({ lastMessageAt: -1 })
      .lean();

    res.json(customers);
  } catch {
    res.status(500).json({ error: "Could not load customers" });
  }
});

router.get("/:phone/messages/:messageId/media", async (req, res) => {
  try {
    const message = await Message.findOne({
      _id: req.params.messageId,
      customerPhone: req.params.phone
    }).lean();

    if (!message || (!message.mediaId && !message.mediaUrl)) {
      return res.status(404).json({ error: "Message image not found" });
    }

    if (message.mediaUrl) {
      return res.redirect(message.mediaUrl);
    }

    if (
      !process.env.WHATSAPP_TOKEN ||
      !/^v\d+\.\d+$/.test(process.env.GRAPH_API_VERSION || "")
    ) {
      return res.status(503).json({
        error: "WhatsApp media credentials are not configured"
      });
    }

    const authorization = {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
    };
    const mediaResponse = await axios.get(
      `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}/${encodeURIComponent(message.mediaId)}`,
      { headers: authorization, timeout: 15000 }
    );
    const mediaUrl = new URL(mediaResponse.data.url);
    const allowedHosts = [
      "graph.facebook.com",
      "fbcdn.net",
      "fbsbx.com"
    ];
    if (
      mediaUrl.protocol !== "https:" ||
      !allowedHosts.some(host =>
        mediaUrl.hostname === host || mediaUrl.hostname.endsWith(`.${host}`)
      )
    ) {
      return res.status(502).json({ error: "WhatsApp returned an invalid media URL" });
    }

    const imageResponse = await axios.get(mediaUrl.href, {
      headers: authorization,
      responseType: "arraybuffer",
      maxContentLength: 6 * 1024 * 1024,
      timeout: 30000
    });
    const contentType = imageResponse.headers["content-type"];
    if (!["image/jpeg", "image/png"].includes(contentType)) {
      return res.status(415).json({ error: "WhatsApp media is not a supported image" });
    }

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "private, max-age=3600");
    return res.send(imageResponse.data);
  } catch (error) {
    console.error("WhatsApp media retrieval failed:", error.message);
    return res.status(502).json({ error: "Could not load the WhatsApp image" });
  }
});

router.get("/:phone/messages", async (req, res) => {
  try {
    const messages = await Message.find({
      customerPhone: req.params.phone
    }).sort({ timestamp: 1 }).lean();

    res.json(messages);
  } catch {
    res.status(500).json({ error: "Could not load messages" });
  }
});

router.post("/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "CSV file required" });
    }

    let records;
    try {
      records = parse(req.file.buffer.toString("utf8"), {
        columns: false,
        skip_empty_lines: true,
        trim: true,
        bom: true
      });
    } catch (error) {
      console.error("CSV parsing error:", error.message);
      return res.status(400).json({
        error: "CSV import failed. Check the file format and column names."
      });
    }

    if (!records.length) {
      return res.status(400).json({ error: "CSV file is empty; existing customers were not changed." });
    }

    const headers = records.shift().map(header => String(header).toLowerCase());
    const requiredHeaders = ["name", "phone", "optedin"];

    if (requiredHeaders.some(header => !headers.includes(header))) {
      return res.status(400).json({
        error: "CSV must include name, phone, and optedIn columns; existing customers were not changed."
      });
    }

    if (records.length > 5000) {
      return res.status(400).json({ error: "Maximum 5000 rows per import" });
    }

    let skipped = 0;
    const customersByPhone = new Map();

    for (const record of records) {
      const row = Object.fromEntries(headers.map((header, index) => [header, record[index]]));
      const phone = String(row.phone || "").replace(/[\s()+-]/g, "");

      if (!/^\d{8,15}$/.test(phone)) {
        skipped++;
        continue;
      }

      if (customersByPhone.has(phone)) skipped++;
      customersByPhone.set(phone, {
        phone,
        name: String(row.name || "").trim() || "Customer",
        optedIn: String(row.optedin || "").toLowerCase() === "true"
      });
    }

    if (customersByPhone.size === 0) {
      return res.status(400).json({
        error: "No valid customer phone numbers found; existing customers were not changed."
      });
    }

    const customers = Array.from(customersByPhone.values());
    try {
      await Customer.bulkWrite(customers.map(customer => ({
        updateOne: {
          filter: { phone: customer.phone },
          update: {
            $set: {
              name: customer.name,
              optedIn: customer.optedIn
            }
          },
          upsert: true
        }
      })));
      await Customer.deleteMany({
        phone: { $nin: customers.map(customer => customer.phone) }
      });
    } catch (error) {
      console.error("CSV import persistence error:", error.message);
      return res.status(500).json({
        error: "Could not replace the customer list. Refresh the inbox before retrying."
      });
    }

    res.json({ imported: customers.length, skipped });
  } catch (error) {
    console.error("Unexpected CSV import error:", error.message);
    res.status(500).json({
      error: "Customer import failed unexpectedly. Refresh the inbox before retrying."
    });
  }
});

module.exports = router;