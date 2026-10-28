const express = require("express");
const crypto = require("crypto");
const Customer = require("../models/Customer");
const Message = require("../models/Message");

const router = express.Router();

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getMessageText(message) {
  switch (message.type) {
    case "text":
      return message.text?.body || "";
    case "image":
      return message.image?.caption || "[Image message]";
    case "video":
      return message.video?.caption || "[Video message]";
    case "document":
      return message.document?.caption || "[Document message]";
    case "audio":
      return "[Audio message]";
    case "sticker":
      return "[Sticker message]";
    case "location":
      return message.location
        ? `[Location: ${message.location.latitude}, ${message.location.longitude}]`
        : "[Location message]";
    case "contacts":
      return "[Contact shared]";
    case "interactive":
      return (
        message.interactive?.button_reply?.title ||
        message.interactive?.list_reply?.title ||
        "[Interactive reply]"
      );
    case "button":
      return message.button?.text || "[Button reply]";
    case "reaction":
      return message.reaction?.emoji || "[Reaction]";
    default:
      return `[${message.type || "Unknown"} message]`;
  }
}

function getMessageDate(timestamp) {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : new Date();
}

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.VERIFY_TOKEN;
  const tokenMatches = safeEqual(token, verifyToken);
  const challengePresent = typeof challenge === "string" && Boolean(challenge);

  if (!verifyToken) {
    console.error("Webhook verification rejected: VERIFY_TOKEN is not configured");
    return res.status(503).json({
      error: "Webhook verify token is not configured"
    });
  }

  if (
    mode !== "subscribe" ||
    !tokenMatches ||
    !challengePresent
  ) {
    console.warn("Webhook verification rejected", {
      modeIsSubscribe: mode === "subscribe",
      tokenMatches,
      challengePresent
    });
    return res.sendStatus(403);
  }

  console.info("Webhook verification challenge accepted");
  return res.status(200).type("text/plain").send(challenge);
});

router.post("/", async (req, res) => {
  const signature = req.get("x-hub-signature-256");
  const secret = process.env.APP_SECRET;
  const rawBody = req.rawBody;

  if (!secret) {
    return res.status(503).json({
      error: "Webhook app secret is not configured"
    });
  }

  if (
    typeof signature !== "string" ||
    !/^sha256=[a-f0-9]{64}$/.test(signature) ||
    !Buffer.isBuffer(rawBody)
  ) {
    return res.sendStatus(401);
  }

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  if (!safeEqual(signature, expected)) {
    return res.sendStatus(401);
  }

  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change.value || {};
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];

        for (const msg of messages) {
          if (!msg.from || !msg.id) continue;

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
                text: getMessageText(msg),
                whatsappMessageId: msg.id,
                status: "received",
                timestamp: getMessageDate(msg.timestamp)
              }
            },
            { upsert: true }
          );
        }

        for (const status of statuses) {
          if (!status.id || !status.status) continue;

          const update = {
            $set: { status: status.status }
          };

          if (status.recipient_id) {
            update.$setOnInsert = {
              customerPhone: status.recipient_id,
              direction: "outgoing",
              text: "",
              whatsappMessageId: status.id,
              timestamp: getMessageDate(status.timestamp)
            };
          }

          await Message.updateOne(
            { whatsappMessageId: status.id },
            update,
            { upsert: Boolean(status.recipient_id) }
          );
        }
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook processing failed:", error.message);
    return res.status(500).json({
      error: "Webhook event could not be processed"
    });
  }
});

module.exports = router;