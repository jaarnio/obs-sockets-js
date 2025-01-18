const { OBSWebSocket } = require("obs-websocket-js");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { windowManager } = require("node-window-manager");

const { md5Encrypt, readJsonFile } = require("./utility");

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

async function resizeWindow(windowName, width, height) {
  try {
    const windows = windowManager.getWindows();

    // Find the projector window by its title
    const projectorWindow = windows.find((win) => win.getTitle().includes(windowName));

    if (projectorWindow) {
      // Restore the window if it's minimized or maximized
      if (!projectorWindow.isVisible()) {
        projectorWindow.restore();
      }

      // Set the desired bounds for the projector window
      projectorWindow.setBounds({
        x: 100, // X position
        y: 100, // Y position
        width: width,
        height: height,
      });
      console.log("Projector window resized and repositioned successfully.");
    } else {
      console.error("Projector window not found.");
    }
  } catch (error) {
    console.error("Error resizing and repositioning projector window:", error);
  }
}

// OBS Set Video Scene Size
async function setVideoSettings(totalCanvas, fpsDenominator) {
  await obs.call("SetVideoSettings", {
    baseHeight: totalCanvas.height,
    outputHeight: totalCanvas.height,
    baseWidth: totalCanvas.width,
    outputWidth: totalCanvas.width,
    fpsDenominator: fpsDenominator,
  });

  const currentVideoSettings = await obs.call("GetVideoSettings");

  console.log("Current Video Settings", currentVideoSettings);
}

async function getSceneItems() {
  const obsObject = await readJsonFile("obs.json");
  const sceneName = obsObject.sceneName;
  // Extract the source names from the sources array
  const sources = obsObject.sources.map((source) => Object.values(source)[0]);

  const sceneList = await obs.call("GetSceneList");
  console.log("Scene List:", sceneList);

  const mySceneId = sceneList.currentProgramSceneUuid;
  const sceneItemList = await obs.call("GetSceneItemList", { sceneName });

  console.log("Source Names", sources);
  const sceneItems = sources.map((source) => {
    const sceneItem = sceneItemList.sceneItems.find((item) => item.sourceName === source);
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
}

async function calculateRectanglePlacement(layout, resolution, rotation, sceneItems) {
  // Parse layout string to get the number of columns and rows
  const [columns, rows] = layout.split("x").map(Number);

  // Extract width and height from resolution
  let { width, height } = resolution;

  // Swap width and height if rotation is 90 or 270
  if (rotation === 90 || rotation === 270) {
    [width, height] = [height, width];
  }

  // Determine alignment based on rotation
  let alignment;
  if (rotation === 0) {
    alignment = 5;
  } else if (rotation === 90) {
    alignment = 9;
  } else if (rotation === 270) {
    alignment = 6;
  } else {
    throw new Error(`Invalid rotation value: ${rotation}`);
  }

  // Validate that sceneItems matches the number of rectangles in the layout
  const totalItems = columns * rows;
  if (sceneItems.length !== totalItems) {
    throw new Error(
      `The number of sceneItems (${sceneItems.length}) does not match the layout (${totalItems} rectangles).`
    );
  }

  // Iterate through each rectangle in the layout and update sceneItems
  let index = 0; // Keep track of the index for sceneItems
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      // Calculate the x and y position for the current rectangle
      const x = col * width;
      const y = row * height;

      // Update the corresponding sceneItem with x, y, and alignment
      sceneItems[index].x = x;
      sceneItems[index].y = y;
      sceneItems[index].alignment = alignment;

      // Log for troubleshooting
      console.log(
        `Updated ${sceneItems[index].sourceName}: x=${x}, y=${y}, alignment=${alignment}`
      );

      // Move to the next sceneItem
      index++;
    }
  }

  // Return the updated sceneItems array
  return sceneItems;
}

async function setSceneItemTransforms(mySceneId, sceneItems) {
  console.log("Setting scene item transforms...", mySceneId, sceneItems);
  let newSceneItems = await calculateRectanglePlacement(
    layout,
    resolution,
    rotation,
    sceneItems
  );
  console.log("New Scene Items", newSceneItems);
  // Cycle through the sceneItems and make obs.call for each item
  for (const sceneItem of newSceneItems) {
    if (sceneItem) {
      await obs.call("SetSceneItemTransform", {
        sceneUuid: mySceneId,
        sceneItemId: sceneItem.sceneItemId,
        sceneItemTransform: {
          rotation: rotation,
          alignment: sceneItem.alignment,
          scaleX: 1,
          scaleY: 1,
          boundsAlignment: 0,
          boundsType: "OBS_BOUNDS_NONE",
          positionX: sceneItem.x,
          positionY: sceneItem.y,
        },
      });
      const obsResponse = await obs.call("GetSceneItemTransform", {
        sceneUuid: mySceneId,
        sceneItemId: sceneItem.sceneItemId,
      });
      console.log("Updated Scene Item", sceneItem.sceneItemId, obsResponse);
    }
  }
  return true; // Return pass value
}

// OBS Configure Scene
async function configureScene() {
  await setVideoSettings(canvas, fps);
  const mySceneItems = await getSceneItems();

  const setTransformsSuccess = await setSceneItemTransforms(
    mySceneItems.mySceneId,
    mySceneItems.sceneItems
  );
  if (!setTransformsSuccess) {
    throw new Error("Failed to set scene item transforms");
  }

  await resizeWindow("Projector", canvas.width, canvas.height);
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
app.post("/setLayout", async (req, res) => {
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

  //console.log("New approx canvas size:", newCanvas);
  //console.log("New approx resolution:", resolution);
  //console.log("Scale factor:", scaleFactor);

  const devices = await readJsonFile("devices.json");
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

  await configureScene();

  res.status(200).send({ message: "Layout and rotation updated successfully." });
});

// Endpoint to get signal info for each device
app.get("/getSignalInfo", async (req, res) => {
  const devices = await readJsonFile("devices.json");
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

obs
  .connect("ws://192.168.31.110:4455")
  .then(() => {
    console.log("Connected to OBS");

    obs
      .call("OpenVideoMixProjector", {
        videoMixType: "OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM",
        projectorGeometry: "0,0,1920,1080",
        projectorGeometry: Buffer.from(`0,0,1920,1080`).toString("base64"),
      })
      .then((response) => {
        console.log("Projector opened");
      });
  })
  .catch((err) => {
    console.error("Error connecting to OBS", err);
  });
