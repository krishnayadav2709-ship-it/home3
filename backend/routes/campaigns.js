const express = require("express");
const axios = require("axios");
const Customer = require("../models/Customer");
const Message = require("../models/Message");

const router = express.Router();

router.post("/send-template", async (req, res) => {
  const {
    templateName,
    language = "en_US",
    headerImageUrl = ""
  } = req.body;

  if (!/^[a-z0-9_]+$/.test(templateName || "")) {
    return res.status(400).json({
      error: "Enter a valid approved template name"
    });
  }

  if (!["en", "en_US", "en_GB", "hi"].includes(language)) {
    return res.status(400).json({
      error: "Select a supported template language"
    });
  }

  let imageUrl;
  if (headerImageUrl) {
    try {
      imageUrl = new URL(headerImageUrl);
    } catch {
      return res.status(400).json({
        error: "Enter a valid public HTTPS image URL"
      });
    }

    if (
      imageUrl.protocol !== "https:" ||
      !imageUrl.hostname ||
      imageUrl.username ||
      imageUrl.password
    ) {
      return res.status(400).json({
        error: "Image header URLs must use HTTPS and cannot require login"
      });
    }
  }

  if (
    !process.env.WHATSAPP_TOKEN ||
    !process.env.PHONE_NUMBER_ID ||
    !/^v\d+\.\d+$/.test(process.env.GRAPH_API_VERSION || "")
  ) {
    return res.status(503).json({
      error: "Configure WhatsApp credentials and API version in .env"
    });
  }

  try {
    const customers = await Customer.find({ optedIn: true })
      .select("phone")
      .limit(500)
      .lean();

    let sent = 0;
    let failed = 0;
    const failureGroups = new Map();

    for (const customer of customers) {
      if (!/^\d{8,15}$/.test(customer.phone || "")) {
        failed++;
        const key = "INVALID_RECIPIENT";
        const existing = failureGroups.get(key);
        failureGroups.set(key, {
          code: key,
          message: "Customer phone must contain 8–15 digits, including the country calling code.",
          count: (existing?.count || 0) + 1
        });
        continue;
      }

      try {
        const template = {
          name: templateName,
          language: { code: language }
        };
        if (imageUrl) {
          template.components = [
            {
              type: "header",
              parameters: [
                {
                  type: "image",
                  image: { link: imageUrl.href }
                }
              ]
            }
          ];
        }

        const response = await axios.post(
          `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}/${process.env.PHONE_NUMBER_ID}/messages`,
          {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: customer.phone,
            type: "template",
            template
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
            },
            timeout: 15000
          }
        );

        sent++;
        const messageId = response.data.messages?.[0]?.id;

        try {
          await Message.create({
            customerPhone: customer.phone,
            direction: "outgoing",
            text: `[Template: ${templateName}]`,
            whatsappMessageId: messageId,
            status: "accepted"
          });
        } catch (error) {
          console.error(
            "Message accepted by WhatsApp but could not be saved:",
            error.message
          );
        }
      } catch (error) {
        failed++;
        const metaError = error.response?.data?.error;
        const failure = {
          code: metaError?.code || error.code || "WHATSAPP_REQUEST_FAILED",
          message: metaError?.message ||
            (error.response
              ? "WhatsApp rejected the request without providing an error message."
              : "Could not reach WhatsApp. Check the backend network and try again."),
          count: 1
        };
        if (metaError?.error_subcode) {
          failure.subcode = metaError.error_subcode;
        }
        if (metaError?.fbtrace_id) {
          failure.traceId = metaError.fbtrace_id;
        }

        const key = `${failure.code}:${failure.subcode || ""}:${failure.message}`;
        const existing = failureGroups.get(key);
        failureGroups.set(key, {
          ...failure,
          count: (existing?.count || 0) + 1
        });
        console.error("WhatsApp message rejected:", failure.code, failure.message);
      }
    }

    res.json({
      total: customers.length,
      sent,
      failed,
      failures: Array.from(failureGroups.values())
    });
  } catch (error) {
    console.error("Campaign error:", error.message);
    res.status(500).json({ error: "Campaign could not be processed" });
  }
});

module.exports = router;