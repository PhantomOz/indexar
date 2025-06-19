import mongoose from "mongoose";
const BlockSchema = new mongoose.Schema({
  number: { type: Number, unique: true },
  hash: { type: String, unique: true },
  timestamp: Number,
  processed_at: { type: Date, default: Date.now },
});
export default mongoose.model("Block", BlockSchema);
