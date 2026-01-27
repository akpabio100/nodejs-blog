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


// connect to DB
connectDB();


// Core middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));


// Sessions (MUST be before routes)
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard cat',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions'
  }),
  // cookie:{maxAge: new Date (Date.now() + (3600000))}
}));


// Make current route available to views
app.use((req, res, next) => {
  res.locals.currentRoute = req.path;
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
app.use('/', require('./server/routes/main'));
// app.use('/', require('./server/routes/seed')); 
app.use('/', require('./server/routes/admin'));

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});
