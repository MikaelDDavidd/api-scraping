const sharp = require("sharp");
const utils = require("./utils");

const ROOT_PATH = require("./root.js");
const PACKS_REPOSITORY = ROOT_PATH + "/packs/";

var reduceTray = {
  async reduceTray(path, tray) {
    let trayPath = path + tray;
    if ((await utils.fileExist(path + tray)) == false) {
      let allImages = await utils.getFilesNameInDir(path);
      let firstPngIndex = allImages.findIndex((e) => e.substr(-4) == ".png");
      console.log(firstPngIndex);
      trayPath = path + allImages[firstPngIndex];
      console.log(trayPath);
    }
    let finalTrayName = path + "final_" + tray;
    await sharp(trayPath).resize(96, 96).toFile(finalTrayName);

    await sharp(finalTrayName)
      .resize(96, 96)
      .toFile(path + "tray.png");
    await utils.deleteFile(finalTrayName);
  },
  async checkAllPacks() {
    let allPacks = await utils.getFilesNameInDir(PACKS_REPOSITORY);
    for (var i in allPacks) {
      let path = PACKS_REPOSITORY + allPacks[i] + "/";
      console.log(path);
      await this.reduceTray(path, "tray.png");
    }
  },
};

reduceTray.checkAllPacks();

module.exports = reduceTray;
