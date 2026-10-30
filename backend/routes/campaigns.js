const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const Customer = require("../models/Customer");
const Message = require("../models/Message");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function uploadImageFile(req, res, next) {
  upload.single("image")(req, res, error => {
    if (error) {
      return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error: error.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller."
          : "Could not read the uploaded image."
      });
    }

    return next();
  });
}

function hasValidImageSignature(file) {
  if (file.mimetype === "image/jpeg") {
    return file.buffer.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff;
  }

  if (file.mimetype === "image/png") {
    return file.buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  }

  return false;
}

function hasWhatsAppCredentials() {
  return Boolean(
    process.env.WHATSAPP_TOKEN &&
    process.env.PHONE_NUMBER_ID &&
    /^v\d+\.\d+$/.test(process.env.GRAPH_API_VERSION || "")
  );
}

router.post("/upload-image", uploadImageFile, async (req, res) => {
  if (!req.file || !hasValidImageSignature(req.file)) {
    return res.status(400).json({
      error: "Choose a valid JPEG or PNG image."
    });
  }

  if (!hasWhatsAppCredentials()) {
    return res.status(503).json({
      error: "Configure WhatsApp credentials and API version in .env"
    });
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", req.file.buffer, {
    filename: req.file.mimetype === "image/png" ? "campaign-image.png" : "campaign-image.jpg",
    contentType: req.file.mimetype
  });

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${process.env.GRAPH_API_VERSION}/${process.env.PHONE_NUMBER_ID}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          ...form.getHeaders()
        },
        maxBodyLength: 6 * 1024 * 1024,
        timeout: 30000
      }
    );

    if (!response.data.id) {
      return res.status(502).json({
        error: "WhatsApp uploaded the image without returning a media ID."
      });
    }

    return res.json({ mediaId: response.data.id });
  } catch (error) {
    const metaError = error.response?.data?.error;
    console.error("WhatsApp image upload failed:", metaError?.code || error.code || "UPLOAD_FAILED");
    return res.status(502).json({
      error: metaError?.message || "WhatsApp could not upload this image. Check the image and try again."
    });
  }
});

router.post("/send-template", async (req, res) => {
  const {
    templateName,
    language = "en_US",
    headerImageUrl = "",
    headerImageId = ""
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

  if (headerImageUrl && headerImageId) {
    return res.status(400).json({
      error: "Use either a public image URL or an uploaded image, not both."
    });
  }

  if (
    headerImageId &&
    (typeof headerImageId !== "string" || headerImageId.length > 255)
  ) {
    return res.status(400).json({
      error: "Uploaded image ID is invalid."
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

  if (!hasWhatsAppCredentials()) {
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
        if (imageUrl || headerImageId) {
          template.components = [
            {
              type: "header",
              parameters: [
                {
                  type: "image",
                  image: imageUrl
                    ? { link: imageUrl.href }
                    : { id: headerImageId }
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