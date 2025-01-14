const { OBSWebSocket } = require("obs-websocket-js");
//const OBSWebSocket = require("obs-websocket-js").OBSWebSocket;

const obs = new OBSWebSocket();

const sceneName = "Scene";
const sourceName1 = "screen1";
const sourceName2 = "screen2";
const sourceName3 = "screen3";
const sourceName4 = "screen4";
const globalScaleFactor = 1;

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

function calculateScalingFactor(width, height, maxWidth, maxHeight) {
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  return Math.min(widthRatio, heightRatio);
}

async function getSceneItems(
  sceneName,
  sourceName1,
  sourceName2,
  sourceName3,
  sourceName4
) {
  try {
    const sceneList = await obs.call("GetSceneList");
    console.log("Scene List", sceneList);

    const mySceneId = sceneList.currentProgramSceneUuid;

    const sceneItemList = await obs.call("GetSceneItemList", { sceneName });
    console.log("Scene Item List", sceneItemList);

    const sourceNames = [sourceName1, sourceName2, sourceName3, sourceName4];
    console.log("Source Names", sourceNames);
    const sceneItems = sourceNames.map((sourceName) => {
      const sceneItem = sceneItemList.sceneItems.find(
        (item) => item.sourceName === sourceName
      );
      if (sceneItem) {
        return {
          sourceName,
          sceneItemId: sceneItem.sceneItemId,
        };
      } else {
        console.warn(`Scene item not found for source name: ${sourceName}`);
        return null;
      }
    });

    return { mySceneId, sceneItems };
  } catch (err) {
    console.error("Error getting scene items", err);
    return null;
  }
}

async function setSceneItemTransforms(mySceneID, sceneItems, screenConfig) {
  try {
    await Promise.all(
      sceneItems.map(async (sceneItem) => {
        const layout = screenConfig.screenLayout[sceneItem.sourceName];
        console.log(
          mySceneID,
          sceneItem.sceneItemId,
          layout.width,
          layout.height,
          layout.scaleX
        );
        if (layout) {
          await obs.call("SetSceneItemTransform", {
            sceneUuid: mySceneID,
            sceneItemId: sceneItem.sceneItemId,
            sceneItemTransform: {
              rotation: layout.rotation,
              alignment: layout.alignment,
              height: layout.height,
              width: layout.width,
              scaleX: layout.scaleX,
              scaleY: layout.scaleY,
              positionX: layout.x,
              positionY: layout.y,
            },
          });
          console.log(`Adjusted Scene Item for ${mySceneID}`);
        } else {
          console.warn(`No layout found for sourceName: ${sceneItem.sourceName}`);
        }
      })
    );
    return true; // Return pass value
  } catch (err) {
    console.error(`Error adjusting scene item for ${mySceneID}`, err);
    return false; // Return fail value
  }
}

async function getSceneItemTransforms(sceneName, sceneUuid, sceneItems) {
  try {
    const transforms = await Promise.all(
      sceneItems.map(async (item) => {
        if (item) {
          const sceneItemTransform = await obs.call("GetSceneItemTransform", {
            sceneName,
            sceneUuid,
            sceneItemId: item.sceneItemId,
          });
          console.log(`Transform for ${item.sourceName}:`, sceneItemTransform); // Log the transform object
          return {
            sourceName: item.sourceName,
            sceneItemId: item.sceneItemId,
            ...sceneItemTransform,
          };
        }
        return null;
      })
    );

    return transforms;
  } catch (err) {
    console.error("Error getting scene item transforms", err);
    return null;
  }
}

// calculate the total canvas size and screen layout
function screenConfigurator(rotation, resolution, layout) {
  let totalCanvas = { width: 0, height: 0 };
  let screenLayout = {};

  const [cols, rows] = layout.split("x").map(Number);
  let screens = cols * rows;

  if (rotation === 0) {
    totalCanvas.width = cols * resolution.width;
    totalCanvas.height = rows * resolution.height;
  } else if (rotation > 0) {
    totalCanvas.width = cols * resolution.height;
    totalCanvas.height = rows * resolution.width;
  }

  console.log("Starting Values:", resolution, totalCanvas);

  // Calculate the scaling factor to maintain aspect ratio within constraints
  const widthScale = totalCanvas.width > 1920 ? 1920 / totalCanvas.width : 1;
  const heightScale = totalCanvas.height > 1080 ? 1080 / totalCanvas.height : 1;
  const scaleFactor = Math.min(widthScale, heightScale) * globalScaleFactor;
  console.log("Scale Factor:", scaleFactor);

  // Apply the scaling factor to width and height
  resolution.width = Math.round(resolution.width * scaleFactor);
  resolution.height = Math.round(resolution.height * scaleFactor);
  totalCanvas.width = Math.round(totalCanvas.width * scaleFactor);
  totalCanvas.height = Math.round(totalCanvas.height * scaleFactor);

  for (let i = 0; i < screens; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    if (rotation === 0) {
      screenLayout[`screen${i + 1}`] = {
        x: col * resolution.width,
        y: row * resolution.height,
        scaleX: scaleFactor,
        scaleY: scaleFactor,
        width: resolution.width,
        height: resolution.height,
        rotation: 0,
        alignment: 5,
      };
    } else if (rotation === 90) {
      screenLayout[`screen${i + 1}`] = {
        x: col * resolution.height,
        y: row * resolution.width,
        scaleX: scaleFactor,
        scaleY: scaleFactor,
        width: resolution.width,
        height: resolution.height,
        rotation: rotation,
        alignment: 9,
      };
    } else if (rotation === 270) {
      screenLayout[`screen${i + 1}`] = {
        x: col * resolution.height,
        y: row * resolution.width,
        scaleX: scaleFactor,
        scaleY: scaleFactor,
        width: resolution.width,
        height: resolution.height,
        rotation: rotation,
        alignment: 6,
      };
    }
  }

  return { resolution, totalCanvas, screenLayout };
}

async function configureScene(resolution, rotation, layout, fps) {
  try {
    // Step 1: Call screenConfigurator
    const screenConfig = await screenConfigurator(rotation, resolution, layout);
    console.log("Screen configured:", screenConfig);

    // Step 2: Set video settings
    await setVideoSettings(screenConfig.totalCanvas, fps);

    // Step 3: Get scene items
    const mySceneItems = await getSceneItems(
      sceneName,
      sourceName1,
      sourceName2,
      sourceName3,
      sourceName4
    );
    console.log("Scene items retrieved:", mySceneItems);

    // Step 4: Set scene item transforms
    console.log(
      "Setting scene item transforms...",
      mySceneItems.mySceneId,
      mySceneItems.sceneItems,
      screenConfig
    );
    const setTransformsSuccess = await setSceneItemTransforms(
      mySceneItems.mySceneId,
      mySceneItems.sceneItems,
      screenConfig
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
  } catch (error) {
    console.error("Error configuring scene:", error);
  }
}

obs
  .connect("ws://127.0.0.1:4455")
  .then(() => {
    console.log("Connected to OBS");

    const rotation = 0;
    const resolution = { width: 3840, height: 600 };
    const layout = "1x4";
    const fps = 30;

    configureScene(resolution, rotation, layout, fps);
  })
  .catch((err) => {
    console.error("Error connecting to OBS", err);
  });
