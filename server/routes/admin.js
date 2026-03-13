const express = require('express');
const router = express.Router();
const Post = require('../models/post');
const User = require('../models/user');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const adminLayout = '../views/layouts/admin';

const uploadsDir = path.join(__dirname, '../../public/uploads');

const isOwnerAdmin = (user) => {
  if (!user || user.role !== 'admin') return false;
  const ownerUsername = (process.env.ADMIN_OWNER_USERNAME || '').trim().toLowerCase();
  const ownerEmail = (process.env.ADMIN_OWNER_EMAIL || process.env.EMAIL_USER || '').trim().toLowerCase();

  if (ownerUsername && user.username && user.username.toLowerCase() === ownerUsername) return true;
  if (ownerEmail && user.email && user.email.toLowerCase() === ownerEmail) return true;

  return false;
};

// multer storage for profile pictures
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fs.mkdir(uploadsDir, { recursive: true }, (err) => {
      if (err) return cb(err);
      cb(null, uploadsDir);
    });
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file && file.mimetype && file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

/**
 * Middleware to check if user is logged in
 */
const authMiddleware = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/'); // Normal users go to blog home if not logged in
  }
  next();
};

/**
 * Middleware to ensure user is admin
 */
const adminMiddleware = (req, res, next) => {
  if (!req.session.userId || req.session.role !== 'admin') {
    // Normal users cannot access admin pages
    return res.redirect('/'); 
  }
  next();
};

/**
 * Admin Login/Register Pages
 * No adminMiddleware here so anyone can access
 */
router.get('/admin/register', (req, res) => {
  res.render('admin/register', { layout: adminLayout, error: null });
});

router.post('/admin/register', (req, res, next) => {
  upload.single('profile')(req, res, (err) => {
    if (!err) return next();
    return res.render('admin/register', { layout: adminLayout, error: err.message || 'Image upload failed' });
  });
}, async (req, res) => {
  try {
    const { username, password, confirm, email, phone, address, country, secret } = req.body;
    const profilePic = req.file ? req.file.filename : null;

    if (!username || !password || !confirm || !email || !phone || !address || !country || !secret) {
      return res.render('admin/register', { layout: adminLayout, error: 'Please fill all required fields' });
    }

    if (password !== confirm) {
      return res.render('admin/register', { layout: adminLayout, error: 'Passwords do not match' });
    }

    // require secret code so only owners can create admin applicants
    if (secret !== process.env.ADMIN_SECRET) {
      return res.render('admin/register', { layout: adminLayout, error: 'Invalid authorization code' });
    }

    // ensure username unique
    const existing = await User.findOne({ username });
    if (existing) {
      return res.render('admin/register', { layout: adminLayout, error: 'Username already exists' });
    }

    // enforce strong password
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!strongRegex.test(password)) {
      return res.render('admin/register', { layout: adminLayout, error: 'Password must include upper/lowercase, number, symbol and be at least 8 chars' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // generate one-time code for later use
    const adminCode = Math.random().toString(36).substr(2, 8).toUpperCase();

    const newUser = await User.create({
      username,
      password: hashedPassword,
      email,
      phone,
      address,
      country,
      profilePic,
      status: 'pending',
      adminCode
    });

    // notify site owner via email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'New admin application',
      text: `User ${username} has applied for admin access\nEmail: ${email || 'none'}\nCode: ${adminCode}`
    });

    return res.render('admin/register', { layout: adminLayout, error: 'Application submitted; await approval' });
  } catch (error) {
    console.log(error);
    const errMsg = error.code === 11000 ? 'Username already exists' : 'Server error. Try again later.';
    return res.render('admin/register', { layout: adminLayout, error: errMsg });
  }
});

router.get('/admin/login', (req, res) => {
  res.render('admin/login', { layout: adminLayout, error: null });
});

router.post('/admin/login', async (req, res) => {
  try {
    const { username, password, code } = req.body;
    const user = await User.findOne({ username });

    if (!user) {
      return res.render('admin/login', { layout: adminLayout, error: 'Invalid credentials', username });
    }

    // if user just applied and is pending, require the emailed code to activate
    if (user.status === 'pending') {
      if (!code || code !== user.adminCode) {
        return res.render('admin/login', { layout: adminLayout, error: 'Code required for pending admin' });
      }
      // promote to full admin
      user.status = 'admin';
      user.role = 'admin';
      user.adminCode = undefined;
      await user.save();
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.render('admin/login', { layout: adminLayout, error: 'Invalid credentials' });
    }
    user.lastLogin = Date.now();
    await user.save();

    if (user.status !== 'admin' || user.role !== 'admin') {
      return res.render('admin/login', { layout: adminLayout, error: 'Not authorized' });
    }

    // mirror normal user session shape; admin pages can also access req.session.user
    req.session.userId = user._id;
    req.session.username = user.username;
    req.session.user = { username: user.username, role: user.role };
    req.session.role = user.role;

    return res.redirect('/admin/dashboard');
  } catch (error) {
    console.log(error);
    return res.render('admin/login', { layout: adminLayout, error: 'Server error. Try again later.' });
  }
});

/**
 * All routes below require adminMiddleware
 */
router.use('/admin', adminMiddleware);

/**
 * Admin Dashboard - Shows all posts
 */
router.get('/admin/dashboard', async (req, res) => {
  try {
    const posts = await Post.find().populate('author', 'username');
    // user info (including username) injected via res.locals
    res.render('admin/dashboard', {
      layout: adminLayout,
      posts
    });
  } catch (error) {
    console.log(error);
    res.render('admin/error', { layout: adminLayout, error: 'Failed to load dashboard' });
  }
});

// ---------------------
// User management for admins
// ---------------------
router.get('/admin/users', async (req, res) => {
  try {
    const users = await User.find().select('-password -adminCode -twoFactorCode -resetToken');
    const currentAdmin = await User.findById(req.session.userId).select('username email role');
    res.render('admin/users', {
      layout: adminLayout,
      users,
      canDemoteAdmins: isOwnerAdmin(currentAdmin),
      currentAdminId: req.session.userId
    });
  } catch (err) {
    console.log(err);
    res.render('admin/error', { layout: adminLayout, error: 'Unable to load users' });
  }
});

router.post('/admin/users/:id/promote', async (req, res) => {
  return res.status(403).send('Promote action is disabled');
});

router.post('/admin/users/:id/demote', async (req, res) => {
  try {
    const currentAdmin = await User.findById(req.session.userId).select('username email role');
    if (!isOwnerAdmin(currentAdmin)) {
      return res.status(403).send('Only owner admin can demote admins');
    }

    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'admin') return res.redirect('/admin/users');
    if (user._id.toString() === req.session.userId.toString()) {
      return res.status(400).send('You cannot demote yourself');
    }

    user.role = 'user';
    user.status = 'user';
    await user.save();

    res.redirect('/admin/users');
  } catch (err) {
    console.log(err);
    res.redirect('/admin/users');
  }
});

router.post('/admin/users/:id/flag', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (user) {
      user.isFlagged = !user.isFlagged;
      await user.save();
    }
    res.redirect('/admin/users');
  } catch (err) {
    console.log(err);
    res.redirect('/admin/users');
  }
});

/**
 * Add Post
 */
router.get('/admin/add-post', (req, res) => {
  res.render('admin/add-post', { layout: adminLayout, error: null });
});

router.post('/admin/add-post', async (req, res) => {
  try {
    const { title, body } = req.body;
    await Post.create({
      title,
      body,
      author: req.session.userId,
      status: 'published'
    });
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.log(error);
    res.render('admin/add-post', { layout: adminLayout, error: 'Failed to create post' });
  }
});

/**
 * Edit Post
 */
router.get('/admin/edit-post/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.redirect('/admin/dashboard');

    res.render('admin/edit-post', { layout: adminLayout, post, error: null });
  } catch (error) {
    console.log(error);
    res.render('admin/error', { layout: adminLayout, error: 'Failed to load post' });
  }
});

router.post('/admin/edit-post/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.redirect('/admin/dashboard');

    post.title = req.body.title;
    post.body = req.body.body;
    await post.save();

    res.redirect('/admin/dashboard');
  } catch (error) {
    console.log(error);
    res.render('admin/error', { layout: adminLayout, error: 'Failed to update post' });
  }
});

/**
 * Delete Post
 */
router.post('/admin/delete-post/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.redirect('/admin/dashboard');

    await post.deleteOne();
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.log(error);
    res.render('admin/error', { layout: adminLayout, error: 'Failed to delete post' });
  }
});

/**
 * Admin Logout
 */
router.get('/admin/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.log(err);
    res.clearCookie('connect.sid');
    res.redirect('/admin/login');
  });
});

module.exports = router;
