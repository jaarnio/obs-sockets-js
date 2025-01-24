const { WattBoxPromise } = require("wattbox");

const wattboxIp = "192.168.30.82";
const wattboxUserName = "admin";
const wattboxPassword = "password";

var wattbox = new WattBoxPromise(wattboxUserName, wattboxPassword, wattboxIp);

wattbox.subscribeStatus(500);

wattbox.on("status", (status) => {
  console.log(status);
});

wattbox.on("error", (error) => {
  console.log(error);
});

wattbox.powerResetTimeout(1, 2000);

/* wattbox.powerOn(2).catch((err) => {
    console.log(err);
}); */
