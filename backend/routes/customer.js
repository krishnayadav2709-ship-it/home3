const express = require("express");
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