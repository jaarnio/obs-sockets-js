const axios = require("axios");

const deviceIP = "192.168.31.116";
const baseURL = `http://${deviceIP}`;

async function getMode() {
  try {
    const response = await axios.get(`${baseURL}/api/v1/mode/get`);
    console.log("Response:", response.data);
  } catch (error) {
    console.error("Error making GET request:", error);
  }
}

async function getEncoderNdiConfig() {
  try {
    const response = await axios.get(`${baseURL}/api/v1/encoder/ndi/get_config`);
    console.log("Response:", response.data);
  } catch (error) {
    console.error("Error making GET request:", error);
  }
}

async function getEncoderNdiStatus() {
  try {
    const response = await axios.get(`${baseURL}/api/v1/encoder/ndi/status`);
    console.log("Response:", response.data);
  } catch (error) {
    console.error("Error making GET request:", error);
  }
}

// Test the GET requests
getMode();
getEncoderNdiConfig();
getEncoderNdiStatus();
