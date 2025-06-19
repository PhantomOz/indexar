import mongoose from "mongoose";
const EventSchema = new mongoose.Schema({
  contract_address: String,
  event_name: String,
  block_number: Number,
  transaction_hash: String,
  log_index: Number,
  args: mongoose.Schema.Types.Mixed,
  timestamp: Number,
  created_at: { type: Date, default: Date.now },
});
EventSchema.index(
  { contract_address: 1, transaction_hash: 1, log_index: 1 },
  { unique: true }
);
export default mongoose.model("Event", EventSchema);
