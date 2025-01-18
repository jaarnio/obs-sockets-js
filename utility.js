const crypto = require("crypto");
const fs = require("fs");

// encrypt password to MD5 for Magewell login
function md5Encrypt(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

async function readJsonFile(fileName) {
  return new Promise((resolve, reject) => {
    fs.readFile(fileName, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data));
      }
    });
  });
}

// Export the functions
module.exports = {
  md5Encrypt,
  readJsonFile,
  // Add other functions here as needed
};
