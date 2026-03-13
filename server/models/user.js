const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true // remove leading/trailing spaces
  },
  password: {
    type: String,
    required: true,
  },
  // optional contact info for recovery
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  profilePic: {
    type: String // filename of uploaded profile picture for admins
  },
  status: {
    type: String,
    enum: ['user','pending','admin'],
    default: 'user'  // pending = awaiting owner approval
  },
  adminCode: {
    type: String // one-time code emailed to prospective admin
  },
  // last time user authenticated successfully
  lastLogin: Date,
  // password reset
  resetToken: String,
  resetExpires: Date,
  // two-factor authentication by email code
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorCode: String,
  twoFactorExpires: Date,
  role: {
    type: String,
    enum: ['user', 'admin'], // user = normal user, admin = full power
    default: 'user'
  },
  //flagging requirement
  isFlagged: {
    type: Boolean,
    default: false
  }
}, { timestamps: true }); // automatically adds createdAt & updatedAt

module.exports = mongoose.model('User', userSchema);