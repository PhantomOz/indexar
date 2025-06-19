import mongoose from "mongoose";

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/indexar";

export const connectMongo = async () => {
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");
};
