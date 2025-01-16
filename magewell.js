const axios = require("axios");
const crypto = require("crypto");

const deviceIP = "192.168.31.104";
const baseURL = `http://${deviceIP}/mwapi?method=`;

let sessionId = null;
const userName = "dev";
const password = "password";

function md5Encrypt(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

async function login() {
  try {
    const encryptedPassword = md5Encrypt(password);
    const response = await axios.get(
      `${baseURL}login&id=${userName}&pass=${encryptedPassword}`
    );
    console.log("Login response:", response.data);

    const setCookieHeader = response.headers["set-cookie"];
    if (setCookieHeader) {
      const sidCookie = setCookieHeader.find((cookie) => cookie.startsWith("sid="));
      if (sidCookie) {
        sessionId = sidCookie.split(";")[0]; // Extract the session ID
      } else {
        console.error("Session ID not found in cookies");
      }
    } else {
      console.error("Set-Cookie header not found in response");
    }
  } catch (error) {
    console.error("Error during login:", error);
  }
}

async function getInfo(parameter) {
  if (!sessionId) {
    console.error("Not logged in, session ID is missing");
    return;
  }

  try {
    const response = await axios.get(`${baseURL}${parameter}`, {
      headers: {
        Cookie: sessionId,
      },
    });
    console.log("Response:", response.data);
  } catch (error) {
    console.error("Error making GET request:", error);
  }
}

async function main() {
  const startingWidth = 1920;
  const startingHeight = 1080;
  const scaleFactor = 1;
  const newWidth = startingWidth * scaleFactor;
  const newHeight = startingHeight * scaleFactor;

  await login();
  await getInfo(
    `set-video-config&out-raw-resolution=false&out-cx=${newWidth}&out-cy=${newHeight}&out-fr-convertion=half`
  );
  await getInfo("get-signal-info");
}

main();
