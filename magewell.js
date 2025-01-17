const { OBSWebSocket } = require("obs-websocket-js");
const express = require("express");
const fs = require("fs");
const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");

const obs = new OBSWebSocket();
const app = express();
const port = 3000;
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

// OBS global parameters
let rotation = 0;
let resolution = { width: 1920, height: 1080 };
let canvas = { width: 1920, height: 1080 };
let layout = "1x1";
const maxWidth = 1900;
const maxHeight = 1050;
let scaleFactor = 1;
let fps = 30;

// Magewell defaults for API calls
let sessionId = null;
const DEFAULT_VALUE = "No Signal";

// encrypt password to MD5 for Magewell login
function md5Encrypt(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

// OBS Set Video Scene Size
async function setVideoSettings(totalCanvas, fpsDenominator) {
  obs
    .call("SetVideoSettings", {
      baseHeight: totalCanvas.height,
      outputHeight: totalCanvas.height,
      baseWidth: totalCanvas.width,
      outputWidth: totalCanvas.width,
      fpsDenominator: fpsDenominator,
    })
    .then(() => {
      console.log("Configuring Video Settings...");
      return obs.call("GetVideoSettings");
    })
    .then((data) => {
      console.log("Current Video Settings", data);
      return "Success";
    })
    .catch((err) => {
      console.error("Error setting video settings", err);
    });
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

async function getSceneItems(obsObject) {
  //console.log("Getting Scene Items:", obsObject);
  try {
    const obsObject = await readJsonFile("obs.json");

    const sceneName = obsObject.sceneName;
    //console.log("Scene Name:", sceneName);

    // Extract the source names from the sources array
    const sources = obsObject.sources.map((source) => Object.values(source)[0]);
    //console.log("Sources:", sources);

    const sceneList = await obs.call("GetSceneList");
    //console.log("Scene List:", sceneList);

    const mySceneId = sceneList.currentProgramSceneUuid;

    const sceneItemList = await obs.call("GetSceneItemList", { sceneName });
    //console.log("Scene Item List", sceneItemList);

    console.log("Source Names", sources);
    const sceneItems = sources.map((source) => {
      const sceneItem = sceneItemList.sceneItems.find(
        (item) => item.sourceName === source
      );
      if (sceneItem) {
        return {
          sourceName: source,
          sceneItemId: sceneItem.sceneItemId,
        };
      } else {
        console.warn(`Scene item not found for source name: ${source}`);
        return null;
      }
    });

    return { mySceneId, sceneItems };
  } catch (err) {
    console.error("Error getting scene items", err);
    return null;
  }
}

async function setSceneItemTransforms(mySceneId, sceneItems) {
  try {
    const [cols, rows] = layout.split("x").map(Number);
    const alignmentMap = {
      0: 5,
      90: 9,
      270: 6,
    };
    const alignment = alignmentMap[rotation] || 5;

    await Promise.all(
      sceneItems.map(async (sceneItem, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);

        let positionX, positionY;
        if (rotation === 0) {
          positionX = col * resolution.width;
          positionY = row * resolution.height;
        } else if (rotation === 90) {
          positionX = row * resolution.height;
          positionY = col * resolution.width;
        } else if (rotation === 270) {
          positionX = (rows - row - 1) * resolution.height;
          positionY = (cols - col - 1) * resolution.width;
        }

        const sceneItemTransform = {
          rotation: rotation,
          alignment: alignment,
          scaleX: 1,
          scaleY: 1,
          positionX: positionX,
          positionY: positionY,
        };

        await obs.call("SetSceneItemTransform", {
          sceneUuid: mySceneId,
          sceneItemId: sceneItem.sceneItemId,
          sceneItemTransform: sceneItemTransform,
        });
      })
    );
    return true; // Return pass value
  } catch (err) {
    console.error(`Error adjusting scene item for ${mySceneID}`, err);
    return false; // Return fail value
  }
}

// OBS Configure Scene
async function configureScene() {
  const mySceneItems = await getSceneItems();
  console.log("Found Scene Items:", mySceneItems);
  // Step 4: Set scene item transforms
  console.log(
    "Setting scene item transforms...",
    mySceneItems.mySceneId,
    mySceneItems.sceneItems
  );
  const setTransformsSuccess = await setSceneItemTransforms(
    mySceneItems.mySceneId,
    mySceneItems.sceneItems
  );
  if (!setTransformsSuccess) {
    throw new Error("Failed to set scene item transforms");
  }
  console.log("Scene item transforms set successfully");

  // Step 5: Get scene item transforms to view final results
  //    const finalTransforms = await getSceneItemTransforms(
  //      sceneName,
  //      mySceneID,
  //      sceneItems
  //    );
  //console.log("Final scene item transforms:", finalTransforms);
}

// login and get session ID
async function login(ip, username, password) {
  try {
    const encryptedPassword = md5Encrypt(password);
    const response = await axios.get(
      `http://${ip}/mwapi?method=login&id=${username}&pass=${encryptedPassword}`
    );
    //console.log("Login response:", response.data);

    const setCookieHeader = response.headers["set-cookie"];
    if (setCookieHeader) {
      const sidCookie = setCookieHeader.find((cookie) => cookie.startsWith("sid="));
      if (sidCookie) {
        sessionId = sidCookie.split(";")[0]; // Extract the session ID
        //console.log("Logged in successfully, session ID:", sessionId);
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

async function makeApiCall(ip, endpoint, userName, password) {
  await login(ip, userName, password);

  try {
    const response = await axios.get(`http://${ip}/mwapi?method=${endpoint}`, {
      headers: {
        Cookie: sessionId,
      },
    });
    //console.log("API call response:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error making API call:", error);
    throw error;
  }
}

function calculateCanvasSize(screenLayout, screenRotation, screenResolution) {
  let newCanvas = {};

  // Calculate canvas size
  const [cols, rows] = screenLayout.split("x").map(Number);
  console.log([cols, rows]);
  if (screenRotation === 0) {
    newCanvas.width = screenResolution.width * cols;
    newCanvas.height = screenResolution.height * rows;
  } else {
    newCanvas.width = screenResolution.height * cols;
    newCanvas.height = screenResolution.width * rows;
  }
  return newCanvas;
}

// API endpoint to set layout and rotation
app.post("/setLayout", (req, res) => {
  const { rotation: newRotation, layout: newLayout } = req.body;

  // Convert rotation to an integer
  const rotationInt = parseInt(newRotation, 10);

  // Validate rotation
  if (![0, 90, 270].includes(rotationInt)) {
    return res.status(400).send("Invalid rotation value. Must be 0, 90, or 270.");
  }

  // Validate layout
  const layoutPattern = /^\d+x\d+$/;
  if (!layoutPattern.test(newLayout)) {
    return res.status(400).send("Invalid layout format. Must be in the format 'NxM'.");
  }

  // Set global variables
  rotation = rotationInt;
  layout = newLayout;

  let newCanvas = calculateCanvasSize(layout, rotation, resolution);

  // Scale the canvas proportionally to fit within maxWidth and maxHeight
  const widthScale = maxWidth / newCanvas.width;
  const heightScale = maxHeight / newCanvas.height;
  scaleFactor = Math.min(widthScale, heightScale);

  // Limit scaleFactor to 2 decimal places
  scaleFactor = parseFloat(scaleFactor.toFixed(2));

  newCanvas.width = Math.round(newCanvas.width * scaleFactor);
  newCanvas.height = Math.round(newCanvas.height * scaleFactor);
  resolution.width = Math.round(resolution.width * scaleFactor);
  resolution.height = Math.round(resolution.height * scaleFactor);

  console.log("New approx canvas size:", newCanvas);
  console.log("New approx resolution:", resolution);
  console.log("Scale factor:", scaleFactor);

  fs.readFile("devices.json", async (err, data) => {
    if (err) {
      res.status(500).send("Error reading devices file");
      return;
    }
    const devices = JSON.parse(data);
    const results = [];

    for (const device of devices) {
      try {
        const setVideo = await makeApiCall(
          device.ip,
          `set-video-config&out-raw-resolution=false&out-cx=${resolution.width}&out-cy=${resolution.height}&out-fr-convertion=half`,
          device.userName,
          device.password
        );
        // Need to add an api call here to check video settings and see where the Magewell actually landed, then use that as the new resolution value.
        const getVideo = await makeApiCall(
          device.ip,
          "get-video-config",
          device.userName,
          device.password
        );
        console.log(
          "Actual size for device",
          device.name,
          getVideo["out-cx"],
          getVideo["out-cy"]
        );
        resolution.width = getVideo["out-cx"];
        resolution.height = getVideo["out-cy"];

        newCanvas = calculateCanvasSize(layout, rotation, {
          width: getVideo["out-cx"],
          height: getVideo["out-cy"],
        });
        // Add % to the canvas size to account for rounding errors
        newCanvas.width = Math.round(newCanvas.width * 1.02);
        newCanvas.height = Math.round(newCanvas.height * 1.02);

        console.log("New canvas size:", newCanvas);
        canvas = newCanvas;
      } catch (error) {
        console.error(`Error for device ${device.name}:`, error);
        //results.push({ device: device.name, error: error.message });
      }
    }
    await setVideoSettings(canvas, fps);
    await configureScene();
  });

  res.status(200).send({ message: "Layout and rotation updated successfully." });
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
        const signalInfo = await makeApiCall(
          device.ip,
          "get-signal-info",
          device.userName,
          device.password
        );
        results.push({ device: device.name, signalInfo });
        if (device.name === "HDMI-1") {
          resolution.width = signalInfo["video-info"].width;
          resolution.height = signalInfo["video-info"].height;
          console.log("Signal info for HDMI-1:", resolution.width, resolution.height);
        }
      } catch (error) {
        console.error(`Error getting signal info for device ${device.name}:`, error);
        results.push({ device: device.name, error: error.message });
      }
    }

    res.json(results);
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

obs
  .connect("ws://192.168.31.110:4455")
  .then(() => {
    console.log("Connected to OBS");

    const rotation = 0;
    const resolution = { width: 3840, height: 600 };
    const layout = "1x4";
    const fps = 30;

    //configureScene(resolution, rotation, layout, fps);
  })
  .catch((err) => {
    console.error("Error connecting to OBS", err);
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
