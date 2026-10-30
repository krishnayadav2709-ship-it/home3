const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Customer" },
    phone: { type: String, required: true, unique: true },
    optedIn: { type: Boolean, default: false },
    lastMessageAt: Date,
    lastIncomingMessageAt: Date,
    lastOutgoingMessageAt: Date,
    lastReadMessageAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);