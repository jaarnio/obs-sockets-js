const { OBSWebSocket } = require("obs-websocket-js");
//const OBSWebSocket = require("obs-websocket-js").OBSWebSocket;

const obs = new OBSWebSocket();

const sceneName = "Scene";
const sourceName1 = "screen1";
const sourceName2 = "screen2";
const sourceName3 = "screen3";
const sourceName4 = "screen4";

function setVideoSettings(totalCanvas, fpsDenominator, scale) {
  let { width, height } = totalCanvas;

  // Calculate the scaling factor to maintain aspect ratio within constraints
  const widthScale = width > 1920 ? 1920 / width : 1;
  const heightScale = height > 1080 ? 1080 / height : 1;
  const scaleFactor = Math.min(widthScale, heightScale);

  // Apply the scaling factor to width and height
  const baseWidth = Math.round(width * scaleFactor);
  const baseHeight = Math.round(height * scaleFactor);

  obs
    .call("SetVideoSettings", {
      baseHeight: baseHeight,
      baseWidth: baseWidth,
      fpsDenominator: fpsDenominator,
      outputHeight: baseHeight * scale,
      outputWidth: baseWidth * scale,
    })
    .then(() => {
      console.log("Configuring Video Settings...");
      return obs.call("GetVideoSettings");
    })
    .then((data) => {
      console.log("Current Video Settings", data);
      return;
    })
    .catch((err) => {
      console.error("Error setting video settings", err);
    });
}

function adjustSceneItem(sceneId, item, rotate, width, height, positionX, positionY) {
  obs
    .call("SetSceneItemTransform", {
      sceneUuid: sceneId,
      sceneItemId: item,
      sceneItemTransform: {
        rotation: rotate,
        width: width,
        height: height,
        positionX: positionX,
        positionY: positionY,
      },
    })
    .then(() => {
      console.log("Adjusting Scene Item...");
    })
    .catch((err) => {
      console.error("Error adjusting scene item", err);
    });
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

function screenConfigurator(orientation, resolution, layout) {
  let totalCanvas = { width: 0, height: 0 };
  let screenLayout = {};

  const [cols, rows] = layout.split("x").map(Number);
  let screens = cols * rows;

  if (orientation === "Landscape") {
    totalCanvas.width = cols * resolution.width;
    totalCanvas.height = rows * resolution.height;
  } else if (orientation === "Portrait") {
    totalCanvas.width = cols * resolution.height;
    totalCanvas.height = rows * resolution.width;
  }

  for (let i = 0; i < screens; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);

    if (orientation === "Landscape") {
      screenLayout[`screen${i + 1}`] = {
        x: col * resolution.width,
        y: row * resolution.height,
      };
    } else if (orientation === "Portrait") {
      screenLayout[`screen${i + 1}`] = {
        x: col * resolution.height,
        y: row * resolution.width,
      };
    }
  }

  return { totalCanvas, screenLayout };
}

obs
  .connect("ws://127.0.0.1:4455")
  .then(() => {
    console.log("Connected to OBS");
    const orientation = "Landscape";
    const resolution = { width: 1920, height: 540 };
    const layout = "1x1";
    const fps = 30;
    const scaleFactor = 0.5;

    const result = screenConfigurator(orientation, resolution, layout);
    console.log(result);
    setVideoSettings(result.totalCanvas, fps, scaleFactor);
    getSceneItems(sceneName, sourceName1, sourceName2, sourceName3, sourceName4).then(
      (sceneData) => {
        console.log("Scene ID and Scene Items", sceneData);
        const { mySceneId, sceneItems } = sceneData;
        getSceneItemTransforms(sceneName, mySceneId, sceneItems).then((transforms) => {
          console.log("Scene Item Transforms", transforms);
        });
      }
    );
  })
  .catch((err) => {
    console.error("Error connecting to OBS", err);
  });
