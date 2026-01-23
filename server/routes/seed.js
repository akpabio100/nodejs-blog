const express = require('express');
const router = express.Router();
const Post = require('../models/post');

router.get('/seed', async (req, res) => {
  try {
    await Post.create({
      title: 'My First Blog Post',
      body: 'This post was inserted using the seed route.'
    });

    res.send('✅ Post successfully created');
  } catch (error) {
    console.error(error);
    res.status(500).send('❌ Failed to create post');
  }
});

module.exports = router;
