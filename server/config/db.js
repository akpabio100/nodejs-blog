const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 // VERY IMPORTANT
    });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
  }
};

module.exports = connectDB;



// const mongoose = require('mongoose');


// const connectDB = async () => {

//   try {
//     mongoose.set('strictQuery', false);
//     const conn = await mongoose.connect(process.env.MONGODB_URI);
//     console.log(`Database Connected: ${conn.connection.host}`);
//   } catch (err) {
//     console.error("MongoDB connection error:", err);
//   }
// }

// // Export the function so you can use it elsewhere
// module.exports = connectDB;

