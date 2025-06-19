import mongoose from "mongoose";
const TransactionSchema = new mongoose.Schema({
  hash: { type: String, unique: true },
  block_number: Number,
  from_address: String,
  to_address: String,
  value: String,
  gas_used: Number,
  gas_price: String,
  timestamp: Number,
  status: Number,
});
export default mongoose.model("Transaction", TransactionSchema);
