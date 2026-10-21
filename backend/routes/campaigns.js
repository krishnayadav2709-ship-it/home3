const express = require("express");
const axios = require("axios");
const Customer = require("../models/Customer");
const Message = require("../models/Message");

const router = express.Router();

router.post("/send-template", async (req, res) => {
  const { templateName, language = "en_US" } = req.body;

  if (!/^[a-z0-9_]+$/.test(templateName || "")) {
    return res.status(400).json({
      error: "Enter a valid approved template name"
    });
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

    for (const customer of customers) {
      try {
        const response = await axios.post(
          `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}/${process.env.PHONE_NUMBER_ID}/messages`,
          {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: customer.phone,
            type: "template",
            template: {
              name: templateName,
              language: { code: language }
            }
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
            },
            timeout: 15000
          }
        );

        const messageId = response.data.messages?.[0]?.id;

        await Message.create({
          customerPhone: customer.phone,
          direction: "outgoing",
          text: `[Template: ${templateName}]`,
          whatsappMessageId: messageId,
          status: "sent"
        });

        sent++;
      } catch (error) {
        failed++;
        console.error(
          "Message failed:",
          customer.phone,
          error.response?.data?.error?.message || error.message
        );
      }
    }

    res.json({ total: customers.length, sent, failed });
  } catch (error) {
    console.error("Campaign error:", error.message);
    res.status(500).json({ error: "Campaign could not be processed" });
  }
});

module.exports = router;