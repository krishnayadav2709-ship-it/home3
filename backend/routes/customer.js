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

    const rows = parse(req.file.buffer.toString("utf8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true
    });

    if (rows.length > 5000) {
      return res.status(400).json({ error: "Maximum 5000 rows per import" });
    }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const phone = String(row.phone || "").replace(/[\s()+-]/g, "");

      if (!/^\d{8,15}$/.test(phone)) {
        skipped++;
        continue;
      }

      const optedIn =
        String(row.optedIn || "").toLowerCase() === "true";

      await Customer.updateOne(
        { phone },
        {
          $set: {
            name: row.name || "Customer",
            optedIn
          }
        },
        { upsert: true }
      );

      imported++;
    }

    res.json({ imported, skipped });
  } catch (error) {
    console.error("CSV import error:", error.message);
    res.status(400).json({
      error: "CSV import failed. Check the file and column names."
    });
  }
});

module.exports = router;