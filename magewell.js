const express = require("express");
const fs = require("fs");
const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const port = 3000;
app.use(cors());
app.use(express.static("public"));

const DEFAULT_VALUE = "No Signal";

let sessionId = null;

function md5Encrypt(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

async function login(deviceIp, userName, password) {
  try {
    const encryptedPassword = md5Encrypt(password);
    const response = await axios.get(
      `http://${deviceIp}/mwapi?method=login&id=${userName}&pass=${encryptedPassword}`
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

// Endpoint to get devices
app.get("/getDevices", (req, res) => {
  fs.readFile("devices.json", (err, data) => {
    if (err) {
      res.status(500).send("Error reading devices file");
      return;
    }
    const devices = JSON.parse(data);
    res.json(devices);
  });
});

// Endpoint to get signal info for each device
app.get("/getSignalInfo", async (req, res) => {
  fs.readFile("devices.json", async (err, data) => {
    if (err) {
      res.status(500).send("Error reading devices file");
      return;
    }
    const devices = JSON.parse(data);
    const results = [];

    for (const device of devices) {
      try {
        await login(device.ip, device.username, device.password);
        const response = await axios.get(
          `http://${device.ip}/mwapi?method=get-signal-info`,
          {
            headers: {
              Cookie: sessionId,
            },
          }
        );
        console.log("Response:", response.data);
        const videoInfo = response.data["video-info"] || {};
        const width = videoInfo.width || DEFAULT_VALUE;
        const height = videoInfo.height || DEFAULT_VALUE;
        const fieldrate = videoInfo["field-rate"] || DEFAULT_VALUE;

        results.push({
          name: device.name,
          ip: device.ip,
          width,
          height,
          fieldrate,
        });
      } catch (error) {
        console.error(`Error getting signal info for ${device.name}:`, error);
        results.push({
          name: device.name,
          ip: device.ip,
          width: DEFAULT_VALUE,
          height: DEFAULT_VALUE,
          fieldrate: DEFAULT_VALUE,
        });
      }
    }
    res.json(results);
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

/* async function main() {
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
} */

//main();
