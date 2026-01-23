const express = require('express');
const router = express.Router();
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
        currentRoute: `/post/${slung}`
    }

        res.render('post', {locals, data});
    } 
    catch (error) {
        console.log(error);
    }

});




router.get('/about', (req, res) => {
    res.render('about', {
        currentRoute: '/about'
    });
});

router.get('/contact', (req, res) => {
    res.render ('contact');
});


module.exports = router;


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

    const searchNoSpecialChar = searchTerm.replace(/[^a-zA-Z0-9]/g, "");

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

