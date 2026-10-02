const mongoose = require('mongoose');

// Se connecte à MongoDB. Lève une erreur en cas d'échec (server.js décide quoi faire).
const connecterDB = async (uri = process.env.MONGO_URI) => {
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return conn;
};

module.exports = connecterDB;
