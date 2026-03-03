import mongoose from "mongoose";

const preKeySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    publicKey: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const signedPreKeySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    publicKey: { type: String, required: true, trim: true },
    signature: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const e2eeKeyBundleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    registrationId: {
      type: Number,
      required: true,
    },
    identityKey: {
      type: String,
      required: true,
      trim: true,
    },
    signedPreKey: {
      type: signedPreKeySchema,
      required: true,
    },
    preKeys: {
      type: [preKeySchema],
      default: [],
    },
  },
  { timestamps: true }
);

const E2EEKeyBundle =
  mongoose.models.E2EEKeyBundle || mongoose.model("E2EEKeyBundle", e2eeKeyBundleSchema);

export default E2EEKeyBundle;
