require('dotenv').config();

const express = require('express');
const expressLayout = require('express-ejs-layouts');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const MongoStore = require('connect-mongo').default;

const connectDB = require('./server/config/db');
const { isActiveRoute } = require('./server/helpers/routeHelpers');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for Render / production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Connect to DB
connectDB();

// Core middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    // secure cookies are only sent over HTTPS.  in development we usually run
    // on plain http://localhost:5000, so NODE_ENV must NOT be set to "production".
    // our `.env` currently contains NODE_ENV=production, which caused this value
    // to be true and the browser refused to attach the session cookie; hence
    // authMiddleware always saw `cookies: undefined` even though the session was
    // correctly written.  To fix locally either change NODE_ENV to development or
    // override below with an explicit flag.
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// Make session info available in EJS templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;  // user is now { username, role }
  res.locals.role = req.session.role || null;
  res.locals.userId = req.session.userId || null;
  res.locals.showWelcome = !!req.session.showWelcome;
  if (req.session.showWelcome) {
    req.session.showWelcome = false;
  }
  next();
});

// Make current route available to views
app.use((req, res, next) => {
  res.locals.currentRoute = req.path;
  next();
});

// forward query params so templates can react to flags (e.g. ?registered=1)
app.use((req, res, next) => {
  res.locals.query = req.query;
  next();
});

// Static files
app.use(express.static('public'));

// View engine
app.use(expressLayout);
app.set('layout', './layouts/main');
app.set('view engine', 'ejs');

app.locals.isActiveRoute = isActiveRoute;

// ROUTES
// Authentication and main application routes are consolidated in main.js
app.use('/', require('./server/routes/main'));
app.use('/', require('./server/routes/admin'));

// 404 - Not Found
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err);
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).render('500', { title: 'Something Went Wrong' });
  }
  res.status(500).send(err.stack);
});

// Start server
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});
