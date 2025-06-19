import mongoose from "mongoose";
const ContractSchema = new mongoose.Schema({
  address: { type: String, unique: true },
  name: String,
  abi: mongoose.Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now },
});
export default mongoose.model("Contract", ContractSchema);
