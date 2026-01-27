const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const Post = require('../models/post');

/** 
    * GET/
    * HOME
*/

//Routes
router.get('', async (req, res) => {
    
    try {
        const locals = {
        title: "NodeJs",
        description: "Simple Blog created with NodeJs, Express & MongoDb."
    }

    let perPage = 5;
    let page = req.query.page || 1;

    const data= await Post.aggregate([{ $sort: {createdAt: -1}}])
        .skip(perPage * page - perPage)
        .limit(perPage)
        .exec();

        const count = await Post.countDocuments();
        const nextPage= parseInt(page) + 1;
        const hashNextPage = nextPage <= Math.ceil(count  / perPage);

        res.render('index', {
            locals,
            data,
            current: page,
            nextPage: hashNextPage ? nextPage : null,
            currentRoute: '/'
        });

    } catch (error) {
        console.log(error);
        res.status(500).send("Server Error");
    }

});



/** 
    * GET/
    * Post :id
*/

router.get('/post/:id', async (req, res) => {
  
    try {
        let slug = req.params.id;

        const data= await Post.findById({ _id: slug});

        const locals = {
        title: data.title,
        description: "Simple Blog created with NodeJs, Express & MongoDb.",
        currentRoute: `/post/${slug}`
    }

        res.render('post', {locals, data});
    } 
    catch (error) {
        console.log(error);
    }

});


// GET /About — display about page

router.get('/about', (req, res) => {
    res.render('about', {
        currentRoute: '/about'
    });
});


// GET /contact — display contact page

router.get('/contact', (req, res) => {
  res.render('contact', { message: null }); // ✅ pass message
});



// POST /contact — send form to your email

router.post('/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  try {
    // 1️⃣ Create transporter (Gmail example)
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // your Gmail address
        pass: process.env.EMAIL_PASS  // Gmail App Password
      }
    });

    // 2️⃣ Prepare email
    let mailOptions = {
      from: `"${name}" <${email}>`,  // sender info
      to: 'adekunlefrancis2003@gmail.com', // your email
      subject: subject || 'New Contact Message',
      text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
    };

    // 3️⃣ Send email
    await transporter.sendMail(mailOptions);

    // 4️⃣ Render contact page with success message
    res.render('contact', { message: 'Thank you! Your message has been sent successfully.' });

  } catch (error) {
    console.error('Error sending email:', error);
    res.render('contact', { message: 'Oops! Something went wrong. Please try again later.' });
  }
});


/** 
    * POST/
    * Post - SearchTerm
*/

router.post('/search', async (req, res) => {
  try {
    const locals = {
      title: "Search",
      description: "Simple Blog created with NodeJs, Express & MongoDb."
    };

    let searchTerm = req.body.searchTerm || "";

    const searchNoSpecialChar = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const data = await Post.find({
      $or: [
        { title: { $regex: searchNoSpecialChar, $options: 'i' } },
        { body: { $regex: searchNoSpecialChar, $options: 'i' } }
      ]
    });

    res.render("search", {
      locals,
      data
    });

  } catch (error) {
    console.log(error);
    res.status(500).send("Search failed");
  }
});


module.exports = router;

// function insertPostData(params) {
//     post.insertMany([
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },  
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },
//         {
//             title: "Building a Blog",
//             body: "This is the body text"
//         },

//     ])
// }

// insertPostData();

