const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    customerPhone: { type: String, required: true, index: true },
    direction: {
      type: String,
      enum: ["incoming", "outgoing"],
      required: true
    },
    text: { type: String, default: "" },
    mediaId: { type: String, default: "" },
    mediaUrl: { type: String, default: "" },
    whatsappMessageId: { type: String, unique: true, sparse: true },
    status: { type: String, default: "received" },
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);