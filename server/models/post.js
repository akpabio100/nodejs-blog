const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    body: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true // 👈 auto creates createdAt & updatedAt
  }
);

module.exports = mongoose.model('Post', postSchema);
