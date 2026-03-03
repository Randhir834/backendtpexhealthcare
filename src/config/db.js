/**
 * tpex-healthcare-backend\src\config\db.js
 *
 * Auto-generated documentation comments.
 */
import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: true,
    });

    console.log(`MongoDB Connected ✅ : ${conn.connection.host}`);

    try {
      const db = mongoose.connection.db;
      if (db) {
        const col = db.collection("chatmessages");
        const indexes = await col.indexes();
        for (const idx of indexes) {
          const isTtl = idx && idx.expireAfterSeconds != null;
          const isExpiresAt = idx && idx.key && Object.prototype.hasOwnProperty.call(idx.key, "expiresAt");
          if (isTtl && isExpiresAt && idx.name) {
            await col.dropIndex(idx.name);
          }
        }
      }
    } catch (_) {
      // Ignore.
    }
  } catch (error) {
    console.error("MongoDB Connection Failed ❌");
    console.error(error.message);
    process.exit(1);
  }
};

export default connectDB;
