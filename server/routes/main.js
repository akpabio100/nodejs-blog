// main.js handles public-facing routes for normal users: home page, posts, search,
// contact form, and user authentication (register/login/logout).  
//
// **Important:** there is a completely separate admin module (admin.js) that provides
// its own login/register pages under /admin/* and a different layout.  Normal users
// should never see the admin login or panel – the header partial only shows the
// "Admin Panel" link when `locals.user.role === 'admin'`.
//
// Session data is standardized throughout the app: we store
//   req.session.userId      // Mongo _id of logged-in user
//   req.session.user        // { username, role }
//   req.session.role        // convenience string (same as user.role)
// These fields are made available to EJS templates via middleware in app.js.

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const Post = require('../models/post');
const User = require('../models/user');

const uploadsDir = path.join(__dirname, '../../public/uploads');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdir(uploadsDir, { recursive: true }, (err) => {
        if (err) return cb(err);
        cb(null, uploadsDir);
      });
    },
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    if (!file || (file.mimetype && file.mimetype.startsWith('image/'))) {
      return cb(null, true);
    }
    return cb(new Error('Only image files are allowed'));
  }
});

// ---------------------
// Middleware: Protect routes
// ---------------------
const authMiddleware = (req, res, next) => {
  if (!req.session.userId) return res.redirect('/login');
  next();
};

// ---------------------
// Prevent logged-in users from seeing login/register
// ---------------------
const preventAuthAccess = (req, res, next) => {
  if (req.session.userId) return res.redirect('/');
  next();
};

// ---------------------
// Home Page - requires login
// ---------------------
router.get('/', authMiddleware, async (req, res) => {
  try {
    const locals = { title: "NodeJs Blog", description: "A public blog created with NodeJs, Express & MongoDB." };
    const perPage = 5;
    const page = parseInt(req.query.page) || 1;

    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(perPage * (page - 1))
      .limit(perPage)
      .populate('author', 'username');

    const count = await Post.countDocuments();
    const nextPage = page + 1 <= Math.ceil(count / perPage) ? page + 1 : null;

    // note: user info is already injected via res.locals in app.js middleware
    res.render('index', {
      locals,
      data: posts,
      current: page,
      nextPage,
      currentRoute: '/'
    });
  } catch (err) {
    console.log(err);
    res.status(500).render('500', { title: "Server Error" });
  }
});

// ---------------------
// Register Page
// ---------------------
router.get('/register', preventAuthAccess, (req, res) => {
  res.render('register', { error: null });
});

router.post('/register', preventAuthAccess, async (req, res) => {
  try {
    const { username, email, phone, address, country, password, confirm, terms } = req.body;
    if (!username || !password || !confirm || !terms) {
      return res.render('register', { error: "All required fields must be filled and terms accepted" });
    }

    if (password !== confirm) {
      return res.render('register', { error: "Passwords do not match" });
    }

    // username uniqueness enforced by mongoose but we still check for nicer UX
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.render('register', { error: "Username already exists" });

    // password strength: upper, lower, digit, symbol, min 8
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!strongRegex.test(password)) {
      return res.render('register', { error: "Password must be 8+ characters and include upper/lowercase, number and symbol" });
    }

    // create the user then immediately log them in so they don't have to re‑enter
    const hashedPassword = await bcrypt.hash(password, 10);
    const userData = { username, email, phone, address, country, password: hashedPassword };
    const newUser = await User.create(userData);

    // instead of automatically logging in, send them to login page
    // with a flag so we can show a success message
    res.redirect('/login?registered=1');
  } catch (err) {
    console.log('register error', err);
    // expose error message in non-production to help debugging
    const userMsg = process.env.NODE_ENV === 'production'
      ? "Something went wrong. Please try again."
      : `Error: ${err.message}`;
    res.render('register', { error: userMsg });
  }
});

// ---------------------
// Login Page
// ---------------------
router.get('/login', preventAuthAccess, (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', preventAuthAccess, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.render('login', { error: "Invalid credentials", username });

    // prevent admins from using the normal login page – they need to go to /admin/login
    if (user.role === 'admin') {
      return res.render('login', { error: "Please use the admin login page", username });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.render('login', { error: "Invalid credentials", username });
    user.lastLogin = Date.now();
    await user.save();

    // handle two-factor if enabled
    if (user.twoFactorEnabled) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      user.twoFactorCode = code;
      user.twoFactorExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
      await user.save();

      // send code by email
      if (user.email) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: user.email,
          subject: 'Your login code',
          text: `Your verification code is ${code}`
        });
      }

      req.session.twoFactor = { userId: user._id };
      return res.render('2fa', { error: null });
    }

    // normal login
    req.session.userId = user._id;
    req.session.username = user.username;
    // store entire user object so templates can read role too
    req.session.user = { username: user.username, role: user.role || 'user', profilePic: user.profilePic || null };
    req.session.showWelcome = true;

    console.log('User logged in:', user.username);

    // Ensure session saved before redirect
    req.session.save(err => {
      if (err) {
        console.log('Session save error:', err);
        return res.render('login', { error: "Session error. Try again." });
      }
      // after saving, dump session for debugging
      console.log('session after save', req.session);
      res.redirect('/');
    });

  } catch (err) {
    console.log(err);
    res.render('login', { error: "Something went wrong. Please try again." });
  }
});

// ---------------------
// Two-factor verification page
// ---------------------
router.get('/2fa', (req, res) => {
  if (!req.session.twoFactor) return res.redirect('/login');
  res.render('2fa', { error: null });
});

router.post('/2fa', async (req, res) => {
  const { code } = req.body;
  if (!req.session.twoFactor) return res.redirect('/login');
  const user = await User.findById(req.session.twoFactor.userId);
  if (!user) return res.redirect('/login');
  if (!user.twoFactorCode || user.twoFactorCode !== code || user.twoFactorExpires < Date.now()) {
    return res.render('2fa', { error: 'Invalid or expired code' });
  }
  // clear two-factor data
  user.twoFactorCode = undefined;
  user.twoFactorExpires = undefined;
  await user.save();

  // complete login
  req.session.userId = user._id;
  req.session.username = user.username;
  req.session.user = { username: user.username, role: user.role || 'user', profilePic: user.profilePic || null };
  req.session.role = user.role || 'user';
  req.session.showWelcome = true;
  delete req.session.twoFactor;
  req.session.save(() => res.redirect('/'));
});

// ---------------------
// Logout
// ---------------------
router.get('/logout', authMiddleware, (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ---------------------
// Single Post Page
// ---------------------
router.get('/post/:id', authMiddleware, async (req, res, next) => {
  try {
    const postId = (req.params.id || '').trim();
    if (postId === 'add') return next();
    if (!/^[a-fA-F0-9]{24}$/.test(postId)) return res.redirect('/');

    const post = await Post.findById(postId)
      .populate('author', 'username')
      .populate('comments.author', 'username')
      .populate('comments.replies.author', 'username');
    if (!post) return res.redirect('/');
    const likedByUser = post.likes.some((id) => id.toString() === req.session.userId.toString());

    // user info provided automatically via res.locals
    res.render('post', {
      locals: { title: post.title, description: post.body },
      data: post,
      likedByUser
    });
  } catch (err) {
    console.log(err);
    res.redirect('/');
  }
});

router.post('/post/:id/like', authMiddleware, async (req, res) => {
  try {
    const postId = (req.params.id || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(postId)) return res.redirect('/');
    const redirectTo = (req.query.redirect || '').toString();
    const safeRedirect = redirectTo.startsWith('/') ? redirectTo : `/post/${postId}`;

    const post = await Post.findById(postId);
    if (!post) return res.redirect('/');

    const userId = req.session.userId.toString();
    const alreadyLiked = post.likes.some((id) => id.toString() === userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes.push(req.session.userId);
    }

    await post.save();
    return res.redirect(safeRedirect);
  } catch (err) {
    console.log(err);
    return res.redirect('/');
  }
});

router.post('/post/:id/comment', authMiddleware, async (req, res) => {
  try {
    const postId = (req.params.id || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(postId)) return res.redirect('/');

    const text = (req.body.comment || '').trim();
    if (!text) return res.redirect(`/post/${postId}`);

    const post = await Post.findById(postId);
    if (!post) return res.redirect('/');

    post.comments.push({
      author: req.session.userId,
      text
    });
    await post.save();

    return res.redirect(`/post/${postId}`);
  } catch (err) {
    console.log(err);
    return res.redirect('/');
  }
});

router.post('/post/:id/comment/:commentId/reply', authMiddleware, async (req, res) => {
  try {
    const postId = (req.params.id || '').trim();
    const commentId = (req.params.commentId || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(postId) || !/^[a-fA-F0-9]{24}$/.test(commentId)) return res.redirect('/');

    const text = (req.body.reply || '').trim();
    if (!text) return res.redirect(`/post/${postId}`);

    const post = await Post.findById(postId);
    if (!post) return res.redirect('/');

    const comment = post.comments.id(commentId);
    if (!comment) return res.redirect(`/post/${postId}`);

    if (!Array.isArray(comment.replies)) comment.replies = [];
    comment.replies.push({
      author: req.session.userId,
      text
    });
    await post.save();

    return res.redirect(`/post/${postId}`);
  } catch (err) {
    console.log(err);
    return res.redirect('/');
  }
});

router.post('/post/:id/comment/:commentId/react', authMiddleware, async (req, res) => {
  try {
    const postId = (req.params.id || '').trim();
    const commentId = (req.params.commentId || '').trim();
    if (!/^[a-fA-F0-9]{24}$/.test(postId) || !/^[a-fA-F0-9]{24}$/.test(commentId)) return res.redirect('/');

    const reaction = (req.body.reaction || '').trim().toLowerCase();
    if (!['like', 'love'].includes(reaction)) return res.redirect(`/post/${postId}`);

    const post = await Post.findById(postId);
    if (!post) return res.redirect('/');

    const comment = post.comments.id(commentId);
    if (!comment) return res.redirect(`/post/${postId}`);

    if (!Array.isArray(comment.likes)) comment.likes = [];
    if (!Array.isArray(comment.loves)) comment.loves = [];
    const userId = req.session.userId.toString();
    if (reaction === 'like') {
      const exists = comment.likes.some((id) => id.toString() === userId);
      comment.likes = exists ? comment.likes.filter((id) => id.toString() !== userId) : [...comment.likes, req.session.userId];
    } else {
      const exists = comment.loves.some((id) => id.toString() === userId);
      comment.loves = exists ? comment.loves.filter((id) => id.toString() !== userId) : [...comment.loves, req.session.userId];
    }

    await post.save();
    return res.redirect(`/post/${postId}`);
  } catch (err) {
    console.log(err);
    return res.redirect('/');
  }
});

// ---------------------
// Add Post
// ---------------------
router.get('/post/add', authMiddleware, (req, res) => {
  // layout sees user via res.locals.user
  res.render('add-post', { error: null });
});

router.post('/post/add', authMiddleware, async (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    const body = (req.body.body || '').trim();
    if (!title || !body) {
      return res.render('add-post', { error: "Title and comment are required" });
    }

    await Post.create({ title, body, author: req.session.userId, status: "published" });
    res.redirect('/');
  } catch (err) {
    console.log(err);
    res.render('add-post', { error: "Failed to add post" });
  }
});

// ---------------------
// Edit Post - Only Owner
// ---------------------
router.get('/post/edit/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.redirect('/');
    if (!post.author.equals(req.session.userId)) return res.status(403).send("Access Denied");

    res.render('edit-post', { post, error: null });
  } catch (err) {
    console.log(err);
    res.redirect('/');
  }
});

router.post('/post/edit/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.redirect('/');
    if (!post.author.equals(req.session.userId)) return res.status(403).send("Access Denied");

    const title = (req.body.title || '').trim();
    const body = (req.body.body || '').trim();
    if (!title || !body) {
      return res.render('edit-post', { post, error: "Title and comment are required" });
    }

    post.title = title;
    post.body = body;
    await post.save();

    res.redirect(`/post/${post._id}`);
  } catch (err) {
    console.log(err);
    res.redirect('/');
  }
});

// ---------------------
// Delete Post - Only Owner
// ---------------------
router.post('/post/delete/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.redirect('/');
    if (!post.author.equals(req.session.userId)) return res.status(403).send("Access Denied");

    await post.deleteOne();
    res.redirect('/');
  } catch (err) {
    console.log(err);
    res.redirect('/');
  }
});

// ---------------------
// Forgot / reset password
// ---------------------
router.get('/forgot', (req, res) => {
  res.render('forgot', { error: null });
});

router.post('/forgot', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const phone = (req.body.phone || '').trim();
  if (!email && !phone) return res.render('forgot', { error: 'Email or phone number is required' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\+?[0-9]{7,15}$/;
  if (email && !emailRegex.test(email)) return res.render('forgot', { error: 'Please enter a valid email address' });
  if (phone && !phoneRegex.test(phone)) return res.render('forgot', { error: 'Please enter a valid phone number' });

  const user = await User.findOne({
    $or: [
      ...(email ? [{ email }] : []),
      ...(phone ? [{ phone }] : [])
    ]
  });
  if (!user) return res.render('forgot', { error: 'No account found with those details' });
  if (!user.email) return res.render('forgot', { error: 'This account has no registered email' });

  const token = Math.random().toString(36).substr(2, 20);
  user.resetToken = token;
  user.resetExpires = Date.now() + 3600000; // 1h
  await user.save();

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
  const resetUrl = `${req.protocol}://${req.get('host')}/reset/${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Password reset',
    text: `Reset your password: ${resetUrl}`
  });
  res.render('forgot', { error: 'Email sent with reset instructions' });
});

router.get('/reset/:token', async (req, res) => {
  const user = await User.findOne({ resetToken: req.params.token, resetExpires: { $gt: Date.now() } });
  if (!user) return res.redirect('/forgot');
  res.render('reset', { error: null, token: req.params.token });
});

router.post('/reset/:token', async (req, res) => {
  const { password, confirm } = req.body;
  if (!password || password !== confirm) {
    return res.render('reset', { error: 'Passwords must match', token: req.params.token });
  }
  const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!strongRegex.test(password)) {
    return res.render('reset', { error: 'Password too weak', token: req.params.token });
  }
  const user = await User.findOne({ resetToken: req.params.token, resetExpires: { $gt: Date.now() } });
  if (!user) return res.redirect('/forgot');
  user.password = await bcrypt.hash(password, 10);
  user.resetToken = undefined;
  user.resetExpires = undefined;
  await user.save();
  res.redirect('/login');
});

// ---------------------
// User Profile
// ---------------------
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password');
    const posts = await Post.find({ author: req.session.userId }).sort({ createdAt: -1 });
    res.render('profile', { user, posts, message: null, error: null });
  } catch (err) {
    console.log(err);
    res.redirect('/');
  }
});

router.post('/profile', authMiddleware, async (req, res) => {
  try {
    const { email, phone } = req.body;
    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect('/login');

    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedPhone = (phone || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?[0-9]{7,15}$/;

    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      const posts = await Post.find({ author: req.session.userId }).sort({ createdAt: -1 });
      return res.status(400).render('profile', {
        user: await User.findById(req.session.userId).select('-password'),
        posts,
        message: null,
        error: 'Please enter a valid email address'
      });
    }

    if (!normalizedPhone || !phoneRegex.test(normalizedPhone)) {
      const posts = await Post.find({ author: req.session.userId }).sort({ createdAt: -1 });
      return res.status(400).render('profile', {
        user: await User.findById(req.session.userId).select('-password'),
        posts,
        message: null,
        error: 'Please enter a valid phone number'
      });
    }

    user.email = normalizedEmail;
    user.phone = normalizedPhone;
    await user.save();

    const posts = await Post.find({ author: req.session.userId }).sort({ createdAt: -1 });
    return res.render('profile', {
      user: await User.findById(req.session.userId).select('-password'),
      posts,
      message: 'Profile updated successfully',
      error: null
    });
  } catch (err) {
    console.log(err);
    const posts = await Post.find({ author: req.session.userId }).sort({ createdAt: -1 });
    return res.status(500).render('profile', {
      user: await User.findById(req.session.userId).select('-password'),
      posts,
      message: null,
      error: 'Failed to update profile'
    });
  }
});

router.post('/profile/image', authMiddleware, (req, res, next) => {
  upload.single('profile')(req, res, (err) => {
    if (!err) return next();
    return res.status(400).redirect('/profile');
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.redirect('/profile');
    const user = await User.findById(req.session.userId);
    if (!user) return res.redirect('/login');
    user.profilePic = req.file.filename;
    await user.save();
    if (req.session.user) req.session.user.profilePic = user.profilePic;
    return res.redirect('/profile');
  } catch (err) {
    console.log(err);
    return res.redirect('/profile');
  }
});

// ---------------------
// About Page
// ---------------------
router.get('/about', authMiddleware, (req, res) => {
  // view can read user from res.locals.user
  res.render('about');
});

// ---------------------
// Terms & Conditions (public)
// ---------------------
router.get('/terms', (req, res) => {
  res.render('terms');
});

// ---------------------
// Contact Page
// ---------------------
router.get('/contact', authMiddleware, (req, res) => {
  res.render('contact', { message: null });
});

router.post('/contact', authMiddleware, async (req, res) => {
  const { name, email, subject, message } = req.body;
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `"${name}" <${email}>`,
      to: process.env.EMAIL_USER,
      subject: subject || "New Contact Message",
      text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
    });

    res.render('contact', { message: "Message sent successfully" });

  } catch (err) {
    console.log(err);
    res.render('contact', { message: "Something went wrong" });
  }
});

// ---------------------
// Search
// ---------------------
router.post('/search', authMiddleware, async (req, res) => {
  try {
    const searchTerm = req.body.searchTerm || '';
    const sanitized = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const posts = await Post.find({
      $or: [
        { title: { $regex: sanitized, $options: 'i' } },
        { body: { $regex: sanitized, $options: 'i' } }
      ]
    }).populate('author', 'username');

    res.render('search', { locals: { title: "Search", description: "Search results" }, data: posts });
  } catch (err) {
    console.log(err);
    res.status(500).send("Search failed");
  }
});

module.exports = router;
