const express = require("express");
const crypto = require("crypto");
const Customer = require("../models/Customer");
const Message = require("../models/Message");

const router = express.Router();

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.VERIFY_TOKEN &&
    challenge
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

router.post("/", async (req, res) => {
  const signature = req.get("x-hub-signature-256");
  const secret = process.env.APP_SECRET;
  const rawBody = req.rawBody;

  if (!secret || !signature || !rawBody) {
    return res.sendStatus(401);
  }

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const suppliedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    return res.sendStatus(401);
  }

  // Acknowledge Meta after signature validation.
  res.sendStatus(200);

  try {
    for (const entry of req.body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        for (const msg of value.messages || []) {
          if (!msg.from || !msg.id || msg.type !== "text") continue;

          const phone = msg.from;
          const name =
            value.contacts?.find(c => c.wa_id === phone)?.profile?.name ||
            "Customer";

          await Customer.updateOne(
            { phone },
            {
              $set: { name, lastMessageAt: new Date() },
              $setOnInsert: { optedIn: false }
            },
            { upsert: true }
          );

          await Message.updateOne(
            { whatsappMessageId: msg.id },
            {
              $setOnInsert: {
                customerPhone: phone,
                direction: "incoming",
                text: msg.text?.body || "",
                whatsappMessageId: msg.id,
                status: "received",
                timestamp: new Date(
                  Number(msg.timestamp || Date.now() / 1000) * 1000
                )
              }
            },
            { upsert: true }
          );
        }

        for (const status of value.statuses || []) {
          await Message.updateOne(
            { whatsappMessageId: status.id },
            { $set: { status: status.status } }
          );
        }
      }
    }
  } catch (error) {
    console.error("Webhook processing failed:", error.message);
  }
});

module.exports = router;